// Campus Nest AI proxy — Cloudflare Worker + Workers AI (free plan: 10,000 Neurons per day).
// No API key is needed: the model is reached through the Workers AI binding named "AI".
// Optional variable ALLOWED_ORIGIN, e.g. https://yourname.github.io (without a trailing slash).

// Any text-generation model from the Workers AI catalog works here.
// Want DeepSeek? Use '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b' (slower, uses more of the free quota).
const MODEL = '@cf/zai-org/glm-4.7-flash';

// Only these four tasks are accepted, and each prompt must start with its fixed opening.
// This stops strangers from using your free quota as a general chatbot.
const TASKS = {
  reason: 'You write the "Why this score" note',
  matches: 'You check roommate matches',
  group: 'You are the group conflict checker',
  starters: 'You suggest conversation starters'
};

export default {
  async fetch(request, env) {
    const allowed = env.ALLOWED_ORIGIN || '*';
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': allowed === '*' ? '*' : allowed,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      'Vary': 'Origin'
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return new Response('Campus Nest AI proxy is running. Send POST requests from the prototype.', { headers: cors });
    if (allowed !== '*' && origin !== allowed) return reply({ error: 'This origin is not allowed' }, 403, cors);

    let body;
    try { body = await request.json(); } catch { return reply({ error: 'Body must be JSON' }, 400, cors); }
    const { task, prompt } = body || {};
    if (!TASKS[task] || typeof prompt !== 'string' || prompt.length > 4000 || !prompt.startsWith(TASKS[task])) {
      return reply({ error: 'Unknown task or prompt' }, 400, cors);
    }

    try {
      const result = await env.AI.run(MODEL, {
        messages: [
          { role: 'system', content: 'You are the backend of a student housing app. Reply with exactly one JSON value. No markdown, no explanations.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 400,
        temperature: 0.4
      });
      let text = result?.response ?? result?.choices?.[0]?.message?.content ?? result?.result?.response ?? '';
      if (typeof text !== 'string') text = JSON.stringify(text);
      text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      const data = parseJson(text);
      if (data === undefined || data === null || typeof data !== 'object') {
        return reply({ error: 'The model did not return JSON', raw: text.slice(0, 300) }, 502, cors);
      }
      return reply({ data, model: MODEL }, 200, cors);
    } catch (e) {
      const msg = String((e && e.message) || e);
      const limited = /limit|quota|429|neuron|capacity/i.test(msg);
      return reply({ error: limited ? 'Free daily AI quota used up, try again tomorrow' : msg }, limited ? 429 : 502, cors);
    }
  }
};

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
