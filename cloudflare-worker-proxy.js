/**
 * 02Agent CORS / 出口代理 —— Cloudflare Worker
 * ============================================================================
 * 用途：
 *   1) 解决浏览器 CORS（返回完整 CORS 头 + 处理 OPTIONS 预检）
 *   2) 换出口 IP —— 请求从 Cloudflare 网络出去，而不是你自己的机器/服务器
 *      （用于绕过按 IP 拦截的服务，例如 AnySearch 的 CloudFront 403）
 *   3) 透传流式响应（text/event-stream），MCP streamable-HTTP 可用
 *
 * ---------------------------------------------------------------------------
 * 支持的调用方式（两种都行，兼容项目里的 applyProxy 模板）
 * ---------------------------------------------------------------------------
 *   查询式（推荐，配合模板 `https://xxx.workers.dev/?url={target}`）：
 *     GET  /?url=https%3A%2F%2Fapi.example.com%2Fv1%2Fdata
 *     POST /?url=https%3A%2F%2Fapi.example.com%2Fmcp
 *
 *   路径式（cors-anywhere 风格，配合模板 `https://xxx.workers.dev/`）：
 *     GET  /https%3A%2F%2Fapi.example.com%2Fv1%2Fdata
 *     POST /https%3A%2F%2Fapi.example.com%2Fmcp
 *
 *   method / headers / body 全部原样转发到目标地址。
 *
 * ---------------------------------------------------------------------------
 * 部署
 * ---------------------------------------------------------------------------
 *   A. 网页版（最快）
 *      dashboard.cloudflare.com → Workers & Pages → Create → Worker
 *      把本文件内容整段粘贴进编辑器 → Deploy
 *      得到 https://<名字>.<子域>.workers.dev
 *
 *   B. wrangler CLI
 *      npm i -g wrangler && wrangler login
 *      wrangler deploy cloudflare-worker-proxy.js --name agent-proxy
 *
 * ---------------------------------------------------------------------------
 * 可选环境变量（Workers 设置 → Variables）
 * ---------------------------------------------------------------------------
 *   ALLOW_HOSTS  逗号分隔的允许目标域名白名单。留空 = 允许任意 http/https。
 *                例：api.anysearch.com,anysearch.com
 *   USER_AGENT   转发时使用的 User-Agent。留空 = 使用下面的内置浏览器 UA。
 *                设为 "none" = 不改写（沿用调用方 UA）。
 *   ALLOW_ORIGIN 允许的来源。留空 = *。生产可设为你的预览域名。
 * ============================================================================
 */

const DEFAULT_BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 逐跳（hop-by-hop）头，不应转发
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-ray',
  'cf-visitor',
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-real-ip',
]);

const corsHeaders = (env, request) => {
  const allowOrigin = (env && env.ALLOW_ORIGIN) || '*';
  const headers = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
    // 预检必须放行这些——MCP 会用到 Mcp-Session-Id / mcp-protocol-version
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, Accept, Mcp-Session-Id, mcp-protocol-version, X-Requested-With, *',
    'Access-Control-Max-Age': '86400',
  };
  if (allowOrigin !== '*') headers['Access-Control-Allow-Credentials'] = 'true';
  return headers;
};

/** 从请求中解析目标 URL：?url= / ?target= / 路径式 */
function resolveTarget(requestUrl, request) {
  const pick = requestUrl.searchParams.get('url') || requestUrl.searchParams.get('target');
  if (pick) return safeUrl(decodeURIComponent(pick));

  // 路径式：/https%3A%2F%2Fexample.com%2Fpath  或  /https://example.com/path
  let path = requestUrl.pathname.replace(/^\/+/, '');
  if (!path) return null;
  // 去掉可能残留的 "cors/" 之类单段前缀？不做，保持原样。
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    /* 保持原样 */
  }
  // 若未解码成功但形如 https%3A...，再兜一层
  if (!/^https?:\/\//i.test(decoded)) {
    try {
      const again = decodeURIComponent(decoded);
      if (/^https?:\/\//i.test(again)) decoded = again;
    } catch {
      /* ignore */
    }
  }
  // 还原被 URL 规范化吃掉的 //（如 https:/example.com）
  decoded = decoded.replace(/^(https?):\/*/i, '$1://');
  return safeUrl(decoded);
}

function safeUrl(value) {
  if (!value) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u;
  } catch {
    return null;
  }
}

function hostAllowed(target, env) {
  const raw = (env && env.ALLOW_HOSTS) || '';
  const list = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return true; // 未配置 = 不限制
  const host = target.hostname.toLowerCase();
  return list.some((allowed) => host === allowed || host.endsWith('.' + allowed));
}

function jsonError(env, request, status, message) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { ...corsHeaders(env, request), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export default {
  async fetch(request, env, ctx) {
    const requestUrl = new URL(request.url);

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env, request) });
    }

    // 健康检查
    if (requestUrl.pathname === '/' && !requestUrl.searchParams.get('url') && !requestUrl.searchParams.get('target') && request.method === 'GET') {
      return new Response(
        JSON.stringify({
          ok: true,
          service: '02agent-cors-proxy',
          usage: {
            query: 'https://<worker>/?url=<encodeURIComponent(target)>',
            path: 'https://<worker>/<encodeURIComponent(target)>',
          },
          allowHosts: (env && env.ALLOW_HOSTS) || '(any)',
        }),
        { status: 200, headers: { ...corsHeaders(env, request), 'Content-Type': 'application/json; charset=utf-8' } },
      );
    }

    const target = resolveTarget(requestUrl, request);
    if (!target) {
      return jsonError(env, request, 400, '缺少或非法的目标地址。用法：?url=<encodeURIComponent(url)> 或 /<encoded url>（仅支持 http/https）');
    }
    if (!hostAllowed(target, env)) {
      return jsonError(env, request, 403, `目标域名不在白名单内：${target.hostname}`);
    }

    // 组装转发请求头
    const headers = new Headers();
    for (const [key, value] of request.headers.entries()) {
      const lower = key.toLowerCase();
      if (HOP_BY_HOP.has(lower)) continue;
      // 浏览器特有的来源头会让部分服务判定为跨域滥用，转发时去掉 origin
      if (lower === 'origin') continue;
      headers.set(key, value);
    }

    const uaSetting = (env && env.USER_AGENT) || DEFAULT_BROWSER_UA;
    if (uaSetting.toLowerCase() !== 'none') {
      headers.set('User-Agent', uaSetting);
    }
    if (!headers.has('Accept')) headers.set('Accept', '*/*');

    const hasBody = !['GET', 'HEAD'].includes(request.method);

    let upstream;
    try {
      upstream = await fetch(target.toString(), {
        method: request.method,
        headers,
        body: hasBody ? request.body : undefined,
        redirect: 'follow',
        // 让 Cloudflare 正确处理流式请求体
        duplex: 'half',
      });
    } catch (error) {
      return jsonError(env, request, 502, `上游请求失败：${error && error.message ? error.message : String(error)}`);
    }

    // 组装响应头：保留上游头（除逐跳），叠加 CORS
    const responseHeaders = new Headers();
    for (const [key, value] of upstream.headers.entries()) {
      const lower = key.toLowerCase();
      if (HOP_BY_HOP.has(lower)) continue;
      // content-encoding/length 由 Workers 运行时处理，避免解压后长度不符
      if (lower === 'content-encoding' || lower === 'content-length') continue;
      responseHeaders.set(key, value);
    }
    for (const [k, v] of Object.entries(corsHeaders(env, request))) {
      responseHeaders.set(k, v);
    }
    // 关键：让浏览器 JS 能读到这些头（MCP 依赖 mcp-session-id）
    responseHeaders.set(
      'Access-Control-Expose-Headers',
      'Content-Type, Content-Length, Mcp-Session-Id, mcp-session-id, X-Request-Id, Set-Cookie',
    );

    // 直接透传 body 流 —— 保留 text/event-stream 的流式特性
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  },
};
