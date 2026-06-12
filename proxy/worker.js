// worker.js — Cloudflare Worker that lets the game talk to Claude without
// shipping an API key to players. The key lives here as a secret; the game
// calls this worker, the worker calls Anthropic.
//
// Hard limits enforced server-side regardless of what a client sends:
//   - model is always claude-haiku-4-5
//   - max_tokens capped at 220
//   - only requests from the game's origin get CORS approval
//   - message count/length clamped, light per-IP rate limit
// The real spending guard is the monthly limit you set on the API key itself.

const ALLOWED_ORIGINS = [
  'https://gourdave.github.io',
  'http://localhost:8000',          // local development
  'http://localhost:8741',
];

const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 220;
const MAX_MESSAGES = 12;
const MAX_CHARS = 600;
const MAX_SYSTEM_CHARS = 5000;
const RATE_LIMIT_PER_MIN = 20;

// best-effort per-isolate rate limiter (resets when the worker recycles;
// the API key's spend limit is the real backstop)
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const list = (hits.get(ip) || []).filter((t) => t > windowStart);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > RATE_LIMIT_PER_MIN;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': allowed ? origin : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    // friendly status page — lets you verify the worker by visiting its URL
    if (request.method === 'GET') {
      return new Response(JSON.stringify({
        ok: true,
        service: 'Dr. Umbra proxy',
        keyConfigured: Boolean(env.ANTHROPIC_API_KEY),
      }), { headers: { 'content-type': 'application/json' } });
    }
    if (request.method !== 'POST' || !allowed) {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: cors });
    }
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    if (rateLimited(ip)) {
      return new Response(JSON.stringify({ error: 'slow down' }), { status: 429, headers: cors });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'bad json' }), { status: 400, headers: cors });
    }

    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .slice(-MAX_MESSAGES)
      .map((m) => ({
        role: m && m.role === 'user' ? 'user' : 'assistant',
        content: String((m && m.content) || '').slice(0, MAX_CHARS),
      }))
      .filter((m) => m.content);
    while (messages.length && messages[0].role !== 'user') messages.shift();
    if (!messages.length) {
      return new Response(JSON.stringify({ error: 'no messages' }), { status: 400, headers: cors });
    }
    const system = String(body.system || '').slice(0, MAX_SYSTEM_CHARS);

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system, messages }),
    });

    const data = await upstream.text();
    return new Response(data, {
      status: upstream.status,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  },
};
