/**
 * Same-origin server-side relay for browser requests that cannot reach the
 * outside world (the browser/页面 outbound is restricted, but this dev-server
 * host has working internet). The browser POSTs a JSON body here and the relay
 * performs the actual fetch from the server, avoiding both CORS and the browser
 * outbound restriction.
 *
 * Endpoint:
 *   POST /api/fetch
 *   body: { url, method?, headers?, body? }
 * Returns JSON:
 *   { ok, status, statusText, headers, bodyText }
 *
 * Security note: this is an open relay endpoint on the dev server. It only
 * allows http/https targets. For a local dev/preview environment this is fine.
 */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function parseTargetUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return url;
}

const MAX_RELAY_BODY_BYTES = 40 * 1024 * 1024;

module.exports = function registerRelay(app) {
  // Into-URL payload (GET based, small): /api/fetch?url=<enc>&method=<m>&headers=<enc>&body=<enc>
  app.get('/api/fetch', async (req, res) => {
    const target = parseTargetUrl(req.query.url);
    if (!target) {
      res.status(400).json({ ok: false, error: 'Invalid or missing "url" (must be absolute http(s)).' });
      return;
    }
    const method = String(req.query.method || 'GET').toUpperCase();
    let headers = {};
    if (req.query.headers) {
      try {
        headers = JSON.parse(req.query.headers);
      } catch {
        headers = {};
      }
    }
    const body = typeof req.query.body === 'string' ? req.query.body : undefined;
    try {
      const upstream = await fetch(target.href, {
        method,
        headers: { ...headers, 'User-Agent': BROWSER_UA, Accept: headers.Accept || '*/*' },
        body: ['GET', 'HEAD'].includes(method) ? undefined : body || undefined,
        redirect: 'follow',
      });
      const text = await upstream.text();
      const upstreamHeaders = {};
      upstream.headers.forEach((v, k) => {
        // Forward the headers the MCP/HTTP client cares about.
        if (['content-type', 'mcp-session-id', 'set-cookie'].includes(k.toLowerCase())) {
          upstreamHeaders[k] = v;
        }
      });
      res.status(upstream.status).json({
        ok: upstream.ok,
        status: upstream.status,
        statusText: upstream.statusText,
        headers: upstreamHeaders,
        bodyText: text,
      });
    } catch (error) {
      res.status(502).json({ ok: false, error: String((error && error.message) || error) });
    }
  });

  // JSON POST payload: /api/fetch  body: { url, method?, headers?, body? }
  app.post('/api/fetch', async (req, res) => {
    const payload = req.body || {};
    const target = parseTargetUrl(payload.url);
    if (!target) {
      res.status(400).json({ ok: false, error: 'Invalid or missing "url" (must be absolute http(s)).' });
      return;
    }
    const method = String(payload.method || 'GET').toUpperCase();
    const headers = payload.headers && typeof payload.headers === 'object' ? payload.headers : {};
    const body = typeof payload.body === 'string' ? payload.body : undefined;
    // Content-Length guard for very large relayed bodies.
    const estimatedSize = (body || '').length;
    if (estimatedSize > MAX_RELAY_BODY_BYTES) {
      res.status(413).json({ ok: false, error: 'Relay body too large.' });
      return;
    }
    try {
      const upstream = await fetch(target.href, {
        method,
        headers: { ...headers, 'User-Agent': BROWSER_UA },
        body: ['GET', 'HEAD'].includes(method) ? undefined : body || undefined,
        redirect: 'follow',
      });
      const text = await upstream.text();
      const upstreamHeaders = {};
      upstream.headers.forEach((v, k) => {
        if (['content-type', 'mcp-session-id', 'set-cookie'].includes(k.toLowerCase())) {
          upstreamHeaders[k] = v;
        }
      });
      res.status(upstream.status).json({
        ok: upstream.ok,
        status: upstream.status,
        statusText: upstream.statusText,
        headers: upstreamHeaders,
        bodyText: text,
      });
    } catch (error) {
      res.status(502).json({ ok: false, error: String((error && error.message) || error) });
    }
  });
};
