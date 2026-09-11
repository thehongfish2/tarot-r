// 云端版 /api/health — 活性探測
export async function onRequestGet() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-tarot-service': 'tarot-ritual',
    },
  });
}
export async function onRequest() {
  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
    status: 405, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
