/**
 * Muninn API Gateway — Cloudflare Worker
 *
 * Unified reverse proxy for third-party AI APIs.
 * Stores all real API keys as CF secrets; callers authenticate
 * with a single shared PROXY_TOKEN via Authorization: Bearer.
 *
 * Routes:
 *   /gemini/{...path}    → generativelanguage.googleapis.com
 *   /openai/{...path}    → api.openai.com
 *   /anthropic/{...path} → api.anthropic.com
 *
 * Future: /mcp/{service}/sse  → MCP gateway (phase 2)
 */

const SERVICES = {
  gemini: {
    base: 'https://generativelanguage.googleapis.com',
    injectAuth: (headers, env) => headers.set('X-goog-api-key', env.GEMINI_API_KEY),
  },
  openai: {
    base: 'https://api.openai.com',
    injectAuth: (headers, env) => headers.set('Authorization', `Bearer ${env.OPENAI_API_KEY}`),
  },
  anthropic: {
    base: 'https://api.anthropic.com',
    injectAuth: (headers, env) => {
      headers.set('x-api-key', env.ANTHROPIC_API_KEY);
      headers.set('anthropic-version', '2023-06-01');
    },
  },
};

export default {
  async fetch(request, env) {
    // --- Auth ---
    const auth = request.headers.get('Authorization');
    if (!auth || auth !== `Bearer ${env.PROXY_TOKEN}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // --- Routing ---
    const url = new URL(request.url);
    const parts = url.pathname.replace(/^\//, '').split('/');
    const service = parts[0];
    const restPath = '/' + parts.slice(1).join('/');

    const svc = SERVICES[service];
    if (!svc) {
      return new Response(
        JSON.stringify({ error: `Unknown service: ${service}`, available: Object.keys(SERVICES) }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check the relevant key is configured
    const keyNames = { gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };
    if (!env[keyNames[service]]) {
      return new Response(
        JSON.stringify({ error: `${keyNames[service]} not configured in CF secrets` }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // --- Proxy ---
    const targetUrl = `${svc.base}${restPath}${url.search}`;

    const newHeaders = new Headers(request.headers);
    newHeaders.delete('Authorization'); // Strip proxy auth before forwarding
    newHeaders.delete('Host');
    svc.injectAuth(newHeaders, env);

    const proxyReq = new Request(targetUrl, {
      method: request.method,
      headers: newHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      redirect: 'follow',
    });

    try {
      const response = await fetch(proxyReq);
      // Pass response through, adding CORS headers for browser clients
      const respHeaders = new Headers(response.headers);
      respHeaders.set('Access-Control-Allow-Origin', '*');
      return new Response(response.body, {
        status: response.status,
        headers: respHeaders,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Upstream fetch failed', detail: err.message }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }
  },
};
