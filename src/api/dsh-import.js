// 云端版 /api/dsh/import — 云端没有本机 DSH 可导入；回報空列表（前端提示未找到）。
export async function onRequestPost({ request }) {
  if (request.headers.get('x-tarot-request') !== '1') {
    return new Response(JSON.stringify({ error: '缺少同源请求标记' }), {
      status: 403, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  return new Response(JSON.stringify({ found: false, enabled: false, providers: [] }), {
    status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
export async function onRequest() {
  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
    status: 405, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
