// Campus Nest AI proxy v3 — Cloudflare Worker.
// Chain: Google Gemini (primary) -> Gemini fallback model -> Workers AI (Llama) -> 502. The client then uses offline rules.
// Secrets/vars: GEMINI_API_KEY (secret), GEMINI_MODEL, GEMINI_MODEL_FALLBACK, ALLOWED_ORIGIN (required), ALLOW_ANY=1 (local tests only),
//   RATE_PER_MIN (40), RATE_PER_DAY (600), GEMINI_TIMEOUT_MS (9000). Binding: AI (Workers AI).
// The API key is only sent in the x-goog-api-key header; it is never logged, returned or put in an error.

const WORKERS_MODELS = ['@cf/meta/llama-3.1-8b-instruct', '@cf/meta/llama-3.2-3b-instruct', '@cf/meta/llama-3-8b-instruct'];
const DEFAULT_GEMINI = 'gemini-3.5-flash';
const DEFAULT_GEMINI_FALLBACK = 'gemini-3.1-flash-lite';
const MAX_BODY = 32768;       // bytes of the real body
const MAX_PROMPT = 4000;      // chars, ordinary tasks
const MAX_PROMPT_PLAN = 9000; // chars, 'plan'

const SYSTEM = 'You are the backend of a student housing app. Reply with exactly one JSON value. No markdown, no explanations.';

const TASKS = {
  reason: 'You write the "Why this score" note',
  matches: 'You check roommate matches',
  group: 'You are the group conflict checker',
  starters: 'You suggest conversation starters',
  assistant: 'You are the Campus Nest assistant',
  search: 'You convert a housing search',
  apply: 'You write a message to a landlord',
  contract: 'You explain a rental lease',
  listing: 'You write a listing description',
  plan: 'You decide the best housing plan',
  ping: 'You are the Campus Nest health check'
};

const hits = new Map(); // ip -> {min, minStart, day, dayStart}

function limited(ip, env) {
  const now = Date.now(), perMin = +env.RATE_PER_MIN || 40, perDay = +env.RATE_PER_DAY || 600;
  let h = hits.get(ip);
  if (!h) { h = { min: 0, minStart: now, day: 0, dayStart: now }; hits.set(ip, h); }
  if (now - h.minStart > 60000) { h.min = 0; h.minStart = now; }
  if (now - h.dayStart > 86400000) { h.day = 0; h.dayStart = now; }
  h.min++; h.day++;
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v.dayStart > 86400000) hits.delete(k);
  if (h.min > perMin) return Math.ceil((60000 - (now - h.minStart)) / 1000);
  if (h.day > perDay) return Math.ceil((86400000 - (now - h.dayStart)) / 1000);
  return 0;
}

export default {
  async fetch(request, env) {
    env = env || {};
    const list = String(env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
    const anyOk = env.ALLOW_ANY === '1';
    const origin = (request.headers.get('Origin') || '').replace(/\/$/, '');
    const allowed = anyOk ? '*' : (list.includes(origin) ? origin : (list[0] || 'null'));
    const cors = {
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      'Vary': 'Origin'
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method === 'GET') {
      return reply({ ok: true, gemini: Boolean(env.GEMINI_API_KEY), workersAi: Boolean(env.AI), version: 'v3' }, 200, cors);
    }
    if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405, cors);
    if (!anyOk && !list.length) return reply({ error: 'not_granted: ALLOWED_ORIGIN is not configured on this Worker (set it in wrangler.toml vars, or ALLOW_ANY=1 for local tests)' }, 403, cors);
    if (!anyOk && !list.includes(origin)) return reply({ error: 'not_granted: this origin is not allowed' }, 403, cors);
    if (+request.headers.get('content-length') > MAX_BODY) return reply({ error: 'too_large' }, 413, cors);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const wait = limited(ip, env);
    if (wait) return reply({ error: 'rate_limited', retryAfter: wait }, 429, { ...cors, 'Retry-After': String(wait) });

    let raw;
    try { raw = await request.text(); } catch { return reply({ error: 'bad_request' }, 400, cors); }
    if (new TextEncoder().encode(raw).length > MAX_BODY) return reply({ error: 'too_large' }, 413, cors);
    let body;
    try { body = JSON.parse(raw); } catch { return reply({ error: 'bad_request' }, 400, cors); }
    const { task, prompt } = body || {};
    if (typeof task !== 'string' || !Object.hasOwn(TASKS, task)) return reply({ error: 'bad_request' }, 400, cors);
    const isPing = task === 'ping';
    if (!isPing) {
      const max = task === 'plan' ? MAX_PROMPT_PLAN : MAX_PROMPT;
      if (typeof prompt !== 'string' || prompt.length > max || !prompt.startsWith(TASKS[task])) return reply({ error: 'bad_request' }, 400, cors);
    }
    const userPrompt = isPing ? 'Reply with {"ok":true}' : prompt;
    const maxTokens = isPing ? 20 : (task === 'plan' ? 2500 : 1500);
    const t0 = Date.now();
    const fails = []; // short codes only, e.g. 'gemini:429'

    // 1) Gemini: primary, then fallback model
    if (env.GEMINI_API_KEY) {
      const models = [env.GEMINI_MODEL || DEFAULT_GEMINI, env.GEMINI_MODEL_FALLBACK || DEFAULT_GEMINI_FALLBACK];
      for (const model of [...new Set(models)]) {
        const r = await callGemini(env, model, userPrompt, maxTokens);
        if (r.data !== undefined) return ok(task, r.data, model, 'gemini', t0, cors);
        fails.push('gemini:' + r.fail);
      }
    }

    // 2) Workers AI (Llama)
    if (env.AI) {
      for (const model of WORKERS_MODELS) {
        try {
          const result = await env.AI.run(model, {
            messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userPrompt }],
            max_tokens: isPing ? 20 : 700,
            temperature: 0.3
          });
          let text = result?.response ?? result?.choices?.[0]?.message?.content ?? result?.result?.response ?? '';
          if (typeof text !== 'string') text = JSON.stringify(text);
          const data = parseJson(text.trim());
          if (data && typeof data === 'object') return ok(task, data, model, 'workers-ai', t0, cors);
          fails.push('workers-ai:bad_json');
        } catch (e) {
          const msg = String((e && e.message) || e);
          fails.push('workers-ai:' + (/limit|quota|429|neuron|capacity/i.test(msg) ? '429' : /403|forbidden|unauthor|not.?granted|license/i.test(msg) ? '403' : 'error'));
        }
      }
    } else fails.push('workers-ai:missing');

    // 3) Nothing answered: short reason code, the client falls back to offline rules
    const kinds = fails.map(f => { const c = f.split(':')[1]; return c === '429' ? 'rate_limited' : (c === '401' || c === '403' || c === '400') ? 'not_granted' : c === 'bad_json' ? 'bad_json' : 'other'; });
    const same = kinds.every(k => k === kinds[0]) ? kinds[0] : 'other';
    if (same === 'rate_limited') return reply({ error: 'rate_limited', retryAfter: 3600, reasons: fails }, 429, { ...cors, 'Retry-After': '3600' });
    const code = same === 'not_granted' ? 'not_granted' : same === 'bad_json' ? 'bad_json' : 'no_model';
    return reply({ error: code, reasons: fails }, 502, cors);
  }
};

function ok(task, data, model, provider, t0, cors) {
  const ms = Date.now() - t0;
  if (task === 'ping') return reply({ ok: true, data, provider, model, ms }, 200, cors);
  return reply({ data, model, provider, ms }, 200, cors);
}

async function callGemini(env, model, prompt, maxOutputTokens) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), +env.GEMINI_TIMEOUT_MS || 9000);
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens }
      }),
      signal: ctrl.signal
    });
    if (!res.ok) return { fail: String(res.status) };
    const j = await res.json();
    const parts = j?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.filter(p => p && !p.thought && typeof p.text === 'string').map(p => p.text).join('').trim() : '';
    const data = text ? parseJson(text) : undefined;
    if (data && typeof data === 'object') return { data };
    return { fail: 'bad_json' };
  } catch (e) {
    return { fail: e && e.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(t) {
  try { return JSON.parse(t); } catch {}
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const starts = ['{', '['].map(c => t.indexOf(c)).filter(i => i >= 0);
  const a = starts.length ? Math.min(...starts) : -1;
  const b = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  return undefined;
}

function reply(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, 'content-type': 'application/json' } });
}
