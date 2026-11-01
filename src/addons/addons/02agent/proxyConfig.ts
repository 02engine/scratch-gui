/**
 * Browser-side fetch helpers for MCP connections and the httpRequest built-in tool.
 *
 * Browser outbound access is restricted, so requests go through the same-origin
 * dev-server relay (`/api/fetch`), falling back to a direct fetch when unavailable.
 *
 * Resolution order:
 *   1. Same-origin server relay (/api/fetch on the dev server) -> server performs
 *      the outbound request and returns the body; no CORS, server has internet.
 *   2. Direct fetch (fallback when the relay is unavailable).
 *   3. When the relay returns a non-2xx/blocked response (403/429/etc.), ALSO try a
 *      direct browser main-thread fetch once and prefer whichever side yields a 2xx
 *      (so a request isn't stuck behind a single egress that blocks it).
 *
 * Never throws on network/MCP-style failures the way `fetch` does: it always
 * resolves to a Response (status may be 502 when neither relay nor direct works).
 */
export async function fetchThroughRelayOrDirect(
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: BodyInit | null; signal?: AbortSignal },
): Promise<Response> {
  const method = (init?.method || "GET").toUpperCase();
  const headers = (init?.headers || {}) as Record<string, string>;
  const body = typeof init?.body === "string" ? init.body : init?.body ? String(init.body) : undefined;

  const buildResponse = (parsed: { ok?: boolean; status?: number; statusText?: string; headers?: Record<string, string>; bodyText?: string }): Response => {
    const responseHeaders = new Headers();
    if (parsed.headers && typeof parsed.headers === "object") {
      Object.entries(parsed.headers).forEach(([k, v]) => responseHeaders.set(k, String(v)));
    }
    return new Response(parsed.bodyText ?? "", {
      status: parsed.status ?? 502,
      statusText: parsed.statusText || "",
      headers: responseHeaders,
    });
  };

  let relayParsed: { ok?: boolean; status?: number; statusText?: string; headers?: Record<string, string>; bodyText?: string } | null = null;
  try {
    const relayRes = await fetch("/api/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, method, headers, body }),
      signal: init?.signal,
    });
    const text = await relayRes.text();
    try {
      relayParsed = JSON.parse(text);
    } catch {
      relayParsed = null;
    }
  } catch {
    relayParsed = null;
  }

  if (!relayParsed || typeof relayParsed.bodyText !== "string") {
    // Relay not available -> direct fetch.
    return fetch(url, init as RequestInit);
  }

  // If the relay was blocked (non-2xx), try a direct browser fetch once and prefer a 2xx.
  const relayStatus = Number(relayParsed.status) || 502;
  const relayOk = relayStatus >= 200 && relayStatus < 300;
  if (!relayOk) {
    try {
      const direct = await fetch(url, init as RequestInit);
      if (direct.ok || (direct.status >= 200 && direct.status < 600)) {
        // Prefer the direct result when it's a 2xx, or when it's "more reachable" than a 403 block.
        return direct.status >= 200 && direct.status < 300 ? direct : relayParsed ? buildResponse(relayParsed) : direct;
      }
    } catch {
      /* direct failed (browser outbound blocked / CORS); keep the relay response */
    }
  }

  return buildResponse(relayParsed);
}
