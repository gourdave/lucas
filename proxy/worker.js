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

// friend-presence colors: one per slot (max 8 players total)
const ROOM_COLORS = ['#7ec8f0', '#f0c07e', '#b07ef0', '#7ef0a8', '#f07e7e', '#f0e87e', '#c8f07e'];
const ROOM_ADJ  = ['Silent', 'Golden', 'Amber', 'Wandering', 'Midnight', 'Lucky', 'Spooky'];
const ROOM_NOUN = ['Wheat', 'Worm', 'Fox', 'Crow', 'Grin', 'Lantern', 'Owl'];

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
    // room: friend presence via WebSocket (proxied to the Room Durable Object)
    if (new URL(request.url).pathname === '/room') {
      if (!env.ROOM) return new Response(JSON.stringify({ error: 'room not configured' }), { status: 503, headers: cors });
      if (!allowed) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: cors });
      const stub = env.ROOM.get(env.ROOM.idFromName('main'));
      return stub.fetch(request);
    }
    // friendly status page — lets you verify the worker by visiting its URL
    if (request.method === 'GET' && new URL(request.url).pathname !== '/lb') {
      return new Response(JSON.stringify({
        ok: true,
        service: 'Dr. Umbra proxy',
        keyConfigured: Boolean(env.ANTHROPIC_API_KEY),
        leaderboard: Boolean(env.LB),
        room: Boolean(env.ROOM),
      }), { headers: { 'content-type': 'application/json' } });
    }
    if (!allowed || (request.method !== 'POST' && !(request.method === 'GET' && new URL(request.url).pathname === '/lb'))) {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: cors });
    }
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    if (rateLimited(ip)) {
      return new Response(JSON.stringify({ error: 'slow down' }), { status: 429, headers: cors });
    }

    const url = new URL(request.url);

    // ---- the leaderboard (stored in a Durable Object) ----
    if (url.pathname === '/lb') {
      if (!env.LB) return new Response(JSON.stringify({ error: 'no leaderboard' }), { status: 503, headers: cors });
      const stub = env.LB.get(env.LB.idFromName('global'));
      const res = await stub.fetch(request);
      const text = await res.text();
      return new Response(text, { status: res.status, headers: { ...cors, 'content-type': 'application/json' } });
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


// ---- the leaderboard Durable Object (SQLite-backed, auto-provisioned) ----
export class Leaderboard {
  constructor(ctx) { this.ctx = ctx; }

  async fetch(request) {
    const url = new URL(request.url);
    const all = (await this.ctx.storage.get('scores')) || {};

    if (request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
      const name = String(body.name || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
      if (name.length < 3) return json({ error: 'bad name' }, 400);
      const cur = all[name] || {};
      for (const board of ['depth', 'kills', 'rich']) {
        const v = Math.max(0, Math.min(1_000_000, Math.round(Number(body.scores?.[board]) || 0)));
        cur[board] = Math.max(cur[board] || 0, v);
      }
      cur.t = Date.now();
      all[name] = cur;
      // keep the table small: drop the oldest entries past 500 players
      const names = Object.keys(all);
      if (names.length > 500) {
        names.sort((a, b) => (all[a].t || 0) - (all[b].t || 0));
        for (const n of names.slice(0, names.length - 500)) delete all[n];
      }
      await this.ctx.storage.put('scores', all);
      return json({ ok: true });
    }

    const board = ['depth', 'kills', 'rich'].includes(url.searchParams.get('board'))
      ? url.searchParams.get('board') : 'depth';
    const top = Object.entries(all)
      .map(([name, s]) => ({ name, score: s[board] || 0 }))
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);
    return json({ board, top });
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}


// ---- the Room Durable Object (WebSocket hibernation) ----
// One DO instance handles all connections (idFromName('main')).
// Each WS stores its metadata via serializeAttachment so the DO can hibernate
// between messages without losing per-connection state.
// Hard rules: no chat, position only, max 8 friends, auto-assigned names.
export class Room {
  constructor(ctx) { this.ctx = ctx; }

  async fetch(request) {
    const upgrade = (request.headers.get('Upgrade') || '').toLowerCase();
    if (upgrade !== 'websocket') {
      // REST: count active peers (used by status checks)
      return json({ peers: this.ctx.getWebSockets().length });
    }

    const sockets = this.ctx.getWebSockets();
    if (sockets.length >= 8) {
      return new Response('room full (max 8 friends)', { status: 503 });
    }

    // pick a unique name and color for this friend
    const usedNames  = new Set(sockets.map((s) => s.deserializeAttachment()?.name).filter(Boolean));
    const usedColors = new Set(sockets.map((s) => s.deserializeAttachment()?.colorIdx).filter((v) => v != null));
    const name       = _roomName(usedNames);
    const colorIdx   = _colorIdx(usedColors);
    const id         = crypto.randomUUID().slice(0, 8);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, name, colorIdx, x: 0, z: 11, yaw: 0 });

    // send welcome + current peer snapshot before the join broadcast
    const peers = sockets.map((s) => {
      const a = s.deserializeAttachment() || {};
      if (!a.id) return null;
      return { id: a.id, name: a.name, color: ROOM_COLORS[a.colorIdx ?? 0],
               x: a.x ?? 0, z: a.z ?? 11, yaw: a.yaw ?? 0 };
    }).filter(Boolean);
    server.send(JSON.stringify({ type: 'welcome', id, name, color: ROOM_COLORS[colorIdx] }));
    server.send(JSON.stringify({ type: 'state', peers }));

    // tell the existing friends someone new arrived
    const joinMsg = JSON.stringify({ type: 'joined', id, name, color: ROOM_COLORS[colorIdx] });
    for (const s of sockets) try { s.send(joinMsg); } catch { /* stale socket */ }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    let data;
    try { data = JSON.parse(message); } catch { return; }
    const meta = ws.deserializeAttachment();
    if (!meta?.id) return;

    if (data.type === 'pos') {
      // clamp to sane world bounds — never trust the client for broadcast
      meta.x   = Math.max(-600, Math.min(600,   +data.x   || 0));
      meta.z   = Math.max(-1300, Math.min(25,   +data.z   || 0));
      meta.yaw = +data.yaw || 0;
      ws.serializeAttachment(meta);
      const payload = JSON.stringify({ type: 'move', id: meta.id, x: meta.x, z: meta.z, yaw: meta.yaw });
      for (const s of this.ctx.getWebSockets()) {
        if (s !== ws) try { s.send(payload); } catch { /* stale */ }
      }
    } else if (data.type === 'ping') {
      try { ws.send(JSON.stringify({ type: 'pong' })); } catch { /* ignore */ }
    }
    // no chat: any other message type is silently ignored
  }

  async webSocketClose(ws) {
    const meta = ws.deserializeAttachment();
    if (!meta?.id) return;
    const leaveMsg = JSON.stringify({ type: 'left', id: meta.id });
    for (const s of this.ctx.getWebSockets()) {
      if (s !== ws) try { s.send(leaveMsg); } catch { /* stale */ }
    }
  }

  async webSocketError(ws) { await this.webSocketClose(ws); }
}

function _roomName(used) {
  const adjs  = _shuffle([...ROOM_ADJ]);
  const nouns = _shuffle([...ROOM_NOUN]);
  for (const a of adjs) for (const n of nouns) {
    const name = a + n;
    if (!used.has(name)) return name;
  }
  return 'Friend' + (used.size + 1);
}

function _colorIdx(used) {
  for (let i = 0; i < ROOM_COLORS.length; i++) if (!used.has(i)) return i;
  return 0;
}

function _shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
