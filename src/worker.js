// ============================================================================
// ARCANUM 星軌塔羅聖儀 · Cloudflare Worker 入口
// 路由：/api/* → src/api/* 處理器；其餘請求 → 靜態資產（public/，由 ASSETS 綁定提供）
// 安全標頭：靜態資產由 public/_headers 提供；此處為 /api 回應補上同一組標頭。
// ============================================================================
import * as chat from './api/chat.js';
import * as models from './api/models.js';
import * as dsh from './api/dsh.js';
import * as dshImport from './api/dsh-import.js';
import * as health from './api/health.js';

const ROUTES = new Map([
  ['/api/chat', chat],
  ['/api/models', models],
  ['/api/dsh', dsh],
  ['/api/dsh/import', dshImport],
  ['/api/health', health],
]);

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cross-origin-resource-policy': 'same-origin',
  'content-security-policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};

function withSecurityHeaders(res) {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!headers.has(k)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const mod = ROUTES.get(url.pathname);
    if (!mod) return env.ASSETS.fetch(request);

    const handler =
      (request.method === 'POST' && mod.onRequestPost) ? mod.onRequestPost
      : (request.method === 'GET' && mod.onRequestGet) ? mod.onRequestGet
      : mod.onRequest;
    if (!handler) {
      return withSecurityHeaders(new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
        status: 405, headers: { 'content-type': 'application/json; charset=utf-8' },
      }));
    }

    let res;
    try {
      res = await handler({ request, env, ctx });
    } catch {
      res = new Response(JSON.stringify({ error: '服务内部错误' }), {
        status: 500, headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }
    return withSecurityHeaders(res);
  },
};
