// 全站安全標頭（移植自引擎 server.mjs 的設定）
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

export async function onRequest({ request, next }) {
  const res = await next();
  const headers = new Headers(res.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('x-frame-options', 'DENY');
  headers.set('cross-origin-resource-policy', 'same-origin');
  headers.set('content-security-policy', CSP);
  if (new URL(request.url).pathname.startsWith('/api/')) headers.set('cache-control', 'no-store');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
