// ============================================================================
// 圣仪服务 · 云端版 /api/chat（Cloudflare Pages Function）
// 三协议流式代理：openai-completions / openai-responses / anthropic-messages
// 忠实移植自引擎 server.mjs，仅保留「自訂神谕」路径（訪客自備 Base URL + Key）。
// DSH 本机导入与 companion 专用路由不属于云端版。
// ============================================================================

const MAX_BODY_SNIPPET = 0; // 不回读上游错误正文，避免泄露

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

function validateMessages(body) {
  if (typeof body.model !== 'string' || !body.model.trim() || body.model.length > 256) throw Object.assign(new Error('缺少或无效的 model'), { status: 400 });
  if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 100) throw Object.assign(new Error('无效的 messages'), { status: 400 });
  for (const m of body.messages) {
    if (!m || !['system', 'user', 'assistant'].includes(m.role)) throw Object.assign(new Error('无效的消息角色'), { status: 400 });
    if (typeof m.content === 'string') continue;
    if (!Array.isArray(m.content) || !m.content.length) throw Object.assign(new Error('无效的消息内容'), { status: 400 });
    for (const part of m.content) {
      if (part?.type === 'text' && typeof part.text === 'string') continue;
      if (m.role === 'user' && part?.type === 'image_url' && /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(part.image_url?.url || '')) continue;
      throw Object.assign(new Error('图片必须是用户消息中的本地 base64 图片'), { status: 400 });
    }
  }
  if (body.maxTokens != null && (!Number.isInteger(body.maxTokens) || body.maxTokens < 1 || body.maxTokens > 32768)) throw Object.assign(new Error('无效的 maxTokens'), { status: 400 });
  if (body.temperature != null && (typeof body.temperature !== 'number' || body.temperature < 0 || body.temperature > 2)) throw Object.assign(new Error('无效的 temperature'), { status: 400 });
}

// ---- 消息翻译（与 server.mjs 一致）---------------------------------------------
function flattenText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter(p => p.type === 'text').map(p => p.text).join('\n');
  return '';
}
function hasImages(content) {
  return Array.isArray(content) && content.some(p => p.type === 'image_url' || p.type === 'image');
}
function toOpenAI(messages) {
  return messages.map(m => {
    if (!Array.isArray(m.content)) return m;
    if (!hasImages(m.content)) return { role: m.role, content: flattenText(m.content) };
    return {
      role: m.role,
      content: m.content.map(p => p.type === 'text'
        ? { type: 'text', text: p.text }
        : { type: 'image_url', image_url: { url: p.image_url?.url || p.url } }),
    };
  });
}
function toResponses(messages) {
  const sys = messages.filter(m => m.role === 'system').map(m => flattenText(m.content)).join('\n');
  const input = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: Array.isArray(m.content)
      ? m.content.map(p => p.type === 'text'
        ? { type: m.role === 'assistant' ? 'output_text' : 'input_text', text: p.text }
        : { type: 'input_image', image_url: p.image_url?.url || p.url })
      : [{ type: m.role === 'assistant' ? 'output_text' : 'input_text', text: flattenText(m.content) }],
  }));
  return { instructions: sys || undefined, input };
}
function toAnthropic(messages) {
  const sys = messages.filter(m => m.role === 'system').map(m => flattenText(m.content)).join('\n');
  const out = messages.filter(m => m.role !== 'system').map(m => {
    let content;
    if (Array.isArray(m.content)) {
      content = m.content.map(p => {
        if (p.type === 'text') return { type: 'text', text: p.text };
        const durl = p.image_url?.url || p.url || '';
        const mm = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(durl);
        if (!mm) return { type: 'text', text: '[图片无法解析]' };
        return { type: 'image', source: { type: 'base64', media_type: mm[1], data: mm[2] } };
      });
    } else content = [{ type: 'text', text: flattenText(m.content) }];
    return { role: m.role === 'assistant' ? 'assistant' : 'user', content };
  });
  return { system: sys || undefined, messages: out };
}

function upstreamURL(provider, resource) {
  const base = provider.baseURL.replace(/\/+$/, '');
  return base + (provider.kind === 'anthropic' && !base.endsWith('/v1') ? '/v1' : '') + '/' + resource;
}

// ---- 主流式代理 -------------------------------------------------------------------
export async function onRequestPost({ request }) {
  const denied = guard(request);
  if (denied) return denied;

  let body;
  try {
    body = await request.json();
  } catch { return jsonFail(400, '无效的 JSON 请求'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return jsonFail(400, '无效的 JSON 请求');
  if (body.providerId) return jsonFail(400, '云端版不含本机 DSH；请使用自定义神谕（Base URL + API Key）。');

  let provider;
  try {
    validateMessages(body);
    provider = validateProvider(body.provider);
  } catch (e) { return jsonFail(e.status || 400, e.message); }
  const token = typeof provider.apiKey === 'string' ? provider.apiKey.trim() : '';
  if (!token || /[\r\n]/.test(token)) return jsonFail(401, '缺少或无效的 API Key');

  const headers = { 'Content-Type': 'application/json' };
  let endpoint, payload;
  if (provider.kind === 'openai') {
    endpoint = provider.baseURL + '/chat/completions';
    headers['Authorization'] = `Bearer ${token}`;
    payload = {
      model: body.model, stream: true, messages: toOpenAI(body.messages),
      temperature: body.temperature, max_tokens: body.maxTokens,
      stream_options: { include_usage: false },
    };
  } else if (provider.kind === 'responses') {
    endpoint = provider.baseURL + '/responses';
    headers['Authorization'] = `Bearer ${token}`;
    const t = toResponses(body.messages);
    payload = { model: body.model, stream: true, store: false, instructions: t.instructions, input: t.input };
    if (body.temperature != null) payload.temperature = body.temperature;
    if (body.maxTokens) payload.max_output_tokens = body.maxTokens;
  } else {
    endpoint = upstreamURL(provider, 'messages');
    headers['x-api-key'] = token;
    headers['anthropic-version'] = '2023-06-01';
    const t = toAnthropic(body.messages);
    payload = {
      model: body.model, stream: true, max_tokens: body.maxTokens || 4096,
      system: t.system, messages: t.messages, temperature: body.temperature ?? 0.7,
    };
  }

  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(120000)]);
  const post = (p) => fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(p), signal, redirect: 'manual' });
  let up;
  let current = payload;
  try {
    up = await post(current);
    // 相容性：部分网关（含 OpenCode Zen 的某些後端）拒絕可選參數；HTTP 400 時精簡重試一次
    if (up.status === 400) {
      await up.body?.cancel().catch(() => {});
      const slim = { ...payload };
      delete slim.stream_options;
      delete slim.store;
      current = slim;
      up = await post(current);
    }
    // 免費模型常見 429（流量/額度上限）：遵循 Retry-After 自動重試至多 2 次
    for (let attempt = 0; up.status === 429 && attempt < 2; attempt++) {
      const ra = Number(up.headers.get('retry-after'));
      await up.body?.cancel().catch(() => {});
      const waitMs = Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2500 * (attempt + 1), 8000);
      await new Promise(r => setTimeout(r, waitMs));
      up = await post(current);
    }
  } catch { return jsonFail(502, '无法连接 AI 服务，请检查服务地址与网络。'); }
  if (!up.ok) {
    await up.body?.cancel().catch(() => {});
    if (up.status === 429) return jsonFail(429, '该模型目前流量超限或免费额度已达上限；请稍候再点「再问一次」，或改用其他免费型号（若选的是付费模型，请确认账户余额）。');
    return jsonFail(502, `AI 服务返回 HTTP ${up.status}，请检查所选模型、凭据与服务地址。`);
  }

  const contentType = up.headers.get('content-type')?.trim();
  const typedStream = contentType && contentType.split(';')[0].trim().toLowerCase() === 'text/event-stream';

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const write = (s) => writer.write(encoder.encode(s));
  const send = (obj) => write(`data: ${JSON.stringify(obj)}\n\n`);

  const pump = (async () => {
    await write(':ok\n\n');
    const reader = up.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    // 上游未声明 event-stream 时，先验证 SSE 框架与可识别事件再转发（同原实现）
    let verifiedStream = Boolean(typedStream), probeBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        if (!verifiedStream) {
          probeBytes += value.byteLength;
          if (probeBytes > 64 * 1024) throw new Error('AI 服务未返回有效事件流');
        }
        let boundary;
        while ((boundary = /\r?\n\r?\n/.exec(buf))) {
          const event = buf.slice(0, boundary.index);
          buf = buf.slice(boundary.index + boundary[0].length);
          if (!verifiedStream && event.split(/\r?\n/).some(line => line && !/^(?:data:|event:|id:|retry:|:)/.test(line))) {
            throw new Error('AI 服务未返回有效事件流');
          }
          const data = event.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
          if (!data) continue;
          if (data === '[DONE]') {
            if (!verifiedStream) throw new Error('AI 服务未返回有效事件流');
            await send({ t: 'done' });
            return;
          }
          let j;
          try { j = JSON.parse(data); } catch { throw new Error('AI 服务返回无效的事件数据'); }
          if (!verifiedStream) {
            const recognized = provider.kind === 'responses' ? typeof j?.type === 'string' && j.type.startsWith('response.')
              : provider.kind === 'openai' ? Array.isArray(j?.choices)
              : ['message_start', 'content_block_start', 'content_block_delta', 'message_delta', 'message_stop'].includes(j?.type);
            if (!recognized) throw new Error('AI 服务未返回有效事件流');
            verifiedStream = true;
          }
          if (j.type === 'error' || j.error || ['response.failed', 'response.incomplete'].includes(j.type)) {
            throw new Error('AI 服务返回错误或不完整响应，请重试。');
          }
          const delta = j.choices?.[0]?.delta?.content
            ?? (j.type === 'response.output_text.delta' ? j.delta : undefined)
            ?? (j.type === 'content_block_delta' ? j.delta?.text : undefined);
          if (typeof delta === 'string' && delta) await send({ t: 'delta', v: delta });
          if (['response.completed', 'message_stop'].includes(j.type)) { await send({ t: 'done' }); return; }
        }
        if (buf.length > 4 * 1024 * 1024) throw new Error('AI 事件过大');
      }
      throw new Error('AI 响应提前中断，请重试。');
    } catch (e) {
      try { await send({ t: 'error', v: e.message || '请求失败，请检查服务地址、凭据或网络连接。' }); } catch {}
    } finally {
      try { await reader.cancel(); } catch {}
      try { reader.releaseLock(); } catch {}
      try { await writer.close(); } catch {}
    }
  })();
  pump.catch(() => {});

  return new Response(readable, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
    },
  });
}

export async function onRequest({ request }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  return jsonFail(405, 'Method Not Allowed');
}
