// ============================================================================
// 云端版 /api/models（Pages Function）— 模型列表探测
// 訪客自備 Base URL + API Key；僅接受自訂神谕路径，不讀取任何本機配置。
// ============================================================================

function jsonFail(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function guard(request) {
  const origin = request.headers.get('origin');
  if (origin) {
    try { if (new URL(origin).host !== request.headers.get('host')) return jsonFail(403, '不允许的 Origin'); }
    catch { return jsonFail(403, '不允许的 Origin'); }
  }
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) return jsonFail(403, '不允许的请求来源');
  if (request.headers.get('x-tarot-request') !== '1') return jsonFail(403, '缺少同源请求标记');
  return null;
}

function validateProvider(provider) {
  if (!provider || !['openai', 'responses', 'anthropic'].includes(provider.kind)) {
    throw Object.assign(new Error('无效的协议类型'), { status: 400 });
  }
  let endpoint;
  try { endpoint = new URL(provider.baseURL); } catch { throw Object.assign(new Error('无效的 Base URL'), { status: 400 }); }
  if (endpoint.protocol !== 'https:') throw Object.assign(new Error('Base URL 必须使用 HTTPS'), { status: 400 });
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw Object.assign(new Error('Base URL 不能包含凭据、查询参数或片段'), { status: 400 });
  }
  return { kind: provider.kind, baseURL: endpoint.href.replace(/\/+$/, ''), apiKey: provider.apiKey };
}

function upstreamURL(provider, resource) {
  const base = provider.baseURL.replace(/\/+$/, '');
  return base + (provider.kind === 'anthropic' && !base.endsWith('/v1') ? '/v1' : '') + '/' + resource;
}

export async function onRequestPost({ request }) {
  const denied = guard(request);
  if (denied) return denied;

  let body;
  try { body = await request.json(); } catch { return jsonFail(400, '无效的 JSON 请求'); }
  if (body.providerId) return jsonFail(400, '云端版不含本机 DSH；请使用自定义神谕。');

  let provider;
  try { provider = validateProvider(body.provider); }
  catch (e) { return jsonFail(e.status || 400, e.message); }
  const token = typeof provider.apiKey === 'string' ? provider.apiKey.trim() : '';
  if (!token || /[\r\n]/.test(token)) return jsonFail(401, '缺少或无效的 API Key');

  const headers = {};
  if (provider.kind === 'anthropic') {
    headers['x-api-key'] = token;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let r;
  try {
    r = await fetch(upstreamURL(provider, 'models'), {
      headers, redirect: 'manual',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(20000)]),
    });
  } catch { return jsonFail(502, '无法连接 AI 服务，请检查服务地址与网络。'); }
  if (!r.ok) {
    await r.body?.cancel().catch(() => {});
    return jsonFail(502, `模型列表请求失败 (HTTP ${r.status})`);
  }
  let j;
  try { j = await r.json(); } catch { return jsonFail(502, '模型列表响应无效'); }
  const models = (j.data || j.models || []).map(m => m.id || m.name || m).filter(m => typeof m === 'string');
  return new Response(JSON.stringify({ models }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function onRequest({ request }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  return jsonFail(405, 'Method Not Allowed');
}
