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

// bump this whenever you deploy so you can confirm the new code is live by
// visiting the worker URL and checking the "version" field.
const WORKER_VERSION = 'v16-profanity';

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
    // room: friend presence via WebSocket. Handled by the SAME Durable Object
    // class as the leaderboard (see the note on the class below) — just a
    // different named instance, so the two never share storage. We accept the
    // ROOM binding if it exists, otherwise fall back to the LB binding (both
    // point at the same class, so either works).
    // The room code from ?code= determines which DO instance (room) you land in —
    // everyone sharing the same code shares a room. Different code → different room.
    if (new URL(request.url).pathname === '/room') {
      const ns = env.ROOM || env.LB;
      if (!ns) return new Response(JSON.stringify({ error: 'room not configured' }), { status: 503, headers: cors });
      if (!allowed) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: cors });
      const rawCode = new URL(request.url).searchParams.get('code') || 'FIELDS';
      const code = rawCode.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || 'FIELDS';
      const stub = ns.get(ns.idFromName('room-' + code));
      return stub.fetch(request);
    }
    // ---- usage stats (anonymous heartbeats in, dashboard out) ----
    // POST: the game sends an anonymous heartbeat (random device id, seconds
    //   played) every minute. GET: returns a dashboard (HTML in a browser,
    //   JSON otherwise). Aggregate numbers only — no names, no PII, COPPA-clean.
    if (new URL(request.url).pathname === '/stats') {
      const ns = env.ROOM || env.LB;
      if (!ns) return new Response(JSON.stringify({ error: 'no stats' }), { status: 503, headers: cors });
      // GET (the dashboard) is open so you can just visit it in a browser;
      // POST (heartbeats) must come from the game origin and is rate-limited.
      if (request.method === 'POST') {
        if (!allowed) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: cors });
        const ip = request.headers.get('cf-connecting-ip') || 'unknown';
        if (rateLimited(ip)) return new Response(JSON.stringify({ error: 'slow down' }), { status: 429, headers: cors });
      }
      const stub = ns.get(ns.idFromName('metrics'));
      const res = await stub.fetch(request);
      const text = await res.text();
      return new Response(text, {
        status: res.status,
        headers: { ...cors, 'content-type': res.headers.get('content-type') || 'application/json' },
      });
    }
    // friendly status page — lets you verify the worker by visiting its URL
    if (request.method === 'GET' && new URL(request.url).pathname !== '/lb') {
      return new Response(JSON.stringify({
        ok: true,
        service: 'Dr. Umbra proxy',
        version: WORKER_VERSION,
        keyConfigured: Boolean(env.ANTHROPIC_API_KEY),
        leaderboard: Boolean(env.LB),
        room: Boolean(env.ROOM || env.LB),
        stats: 'visit /stats',
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


// ---- the shared Durable Object (SQLite-backed, auto-provisioned) ----
//
// One class, three jobs. The Cloudflare dashboard only lets you bind Durable
// Object classes it has already registered a namespace for, and this worker
// only ever registered ONE (`lucas_leaderboard`, class `Leaderboard`). Rather
// than fight the dashboard to register more classes, the SAME class handles
// every persistent job, distinguished by the named instance:
//   • the `global`  instance keeps the high-score leaderboard (HTTP)
//   • `room-XXXX`   instances relay live friend positions + chat (WebSocket)
//   • the `metrics` instance aggregates anonymous usage stats (HTTP)
// Different named instances get separate storage, so they never collide.
//
// Friend room rules: position + chat, max 8 friends, auto names. Stats are
// aggregate-only — random device ids, no names, no PII.
export class Leaderboard {
  constructor(ctx) { this.ctx = ctx; }

  async fetch(request) {
    // a WebSocket upgrade means a friend is joining the live room
    const upgrade = (request.headers.get('Upgrade') || '').toLowerCase();
    if (upgrade === 'websocket') return this.roomConnect(request);

    const url = new URL(request.url);
    if (url.pathname === '/stats') return this.stats(request);
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

  // ---- anonymous usage stats ----
  // POST {id, dt, start?}: id = random device id, dt = seconds since last beat.
  // GET: a dashboard (HTML for browsers, JSON otherwise). No names, no PII.
  async stats(request) {
    const m = (await this.ctx.storage.get('metrics')) ||
      { totalSeconds: 0, sessions: 0, devices: {}, days: {} };

    if (request.method === 'POST') {
      let b; try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
      const id = String(b.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
      if (!id) return json({ error: 'no id' }, 400);
      const now = Date.now();
      const dt = Math.max(0, Math.min(600, Math.round(Number(b.dt) || 0)));
      m.totalSeconds += dt;
      if (b.start) m.sessions++;
      const dev = m.devices[id] || { first: now, secs: 0 };
      dev.last = now; dev.secs += dt;
      m.devices[id] = dev;
      const day = new Date(now).toISOString().slice(0, 10);
      const dy = m.days[day] || { devs: [], secs: 0 };
      if (!dy.devs.includes(id)) dy.devs.push(id);
      dy.secs += dt;
      m.days[day] = dy;
      // prune: keep the last 60 days and cap the device table at 3000
      const days = Object.keys(m.days).sort();
      for (const k of days.slice(0, Math.max(0, days.length - 60))) delete m.days[k];
      const ids = Object.keys(m.devices);
      if (ids.length > 3000) {
        ids.sort((a, c) => (m.devices[a].last || 0) - (m.devices[c].last || 0));
        for (const k of ids.slice(0, ids.length - 3000)) delete m.devices[k];
      }
      await this.ctx.storage.put('metrics', m);
      return json({ ok: true });
    }

    // GET → compute a summary
    const now = Date.now();
    const ids = Object.keys(m.devices);
    const since = (ms) => ids.filter((id) => now - (m.devices[id].last || 0) < ms).length;
    const today = new Date(now).toISOString().slice(0, 10);
    const todayD = m.days[today] || { devs: [], secs: 0 };
    const recentDays = Object.keys(m.days).sort().slice(-14).map((d) => ({
      day: d, users: m.days[d].devs.length, hours: +(m.days[d].secs / 3600).toFixed(1),
    }));
    const summary = {
      activeNow:     since(120000),       // heartbeat in the last 2 min
      active24h:     since(86400000),
      active7d:      since(604800000),
      usersAllTime:  ids.length,
      todayUsers:    todayD.devs.length,
      todayHours:    +(todayD.secs / 3600).toFixed(1),
      sessions:      m.sessions,
      totalHours:    +(m.totalSeconds / 3600).toFixed(1),
      avgSessionMin: m.sessions ? +((m.totalSeconds / m.sessions) / 60).toFixed(1) : 0,
      recentDays,
    };
    const accept = request.headers.get('Accept') || '';
    if (accept.includes('text/html')) {
      return new Response(statsHtml(summary), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    return json(summary);
  }

  // ---- the live friend room (WebSocket hibernation) ----
  // Each WS stores its metadata via serializeAttachment so the DO can hibernate
  // between messages without losing per-connection state.
  roomConnect(request) {
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
    } else if (data.type === 'chat') {
      // relay chat to everyone else: strip control chars, cap at 140, then run
      // the profanity filter server-side (a hacked client can't bypass this).
      const text = cleanProfanity(String(data.text || '').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 140));
      if (text.trim()) {
        const payload = JSON.stringify({ type: 'chat', id: meta.id, name: meta.name, text });
        for (const s of this.ctx.getWebSockets()) {
          if (s !== ws) try { s.send(payload); } catch { /* stale */ }
        }
      }
    } else if (data.type === 'ping') {
      try { ws.send(JSON.stringify({ type: 'pong' })); } catch { /* ignore */ }
    }
    // any other message type is silently dropped
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

// a tiny dark dashboard so the stats are pleasant to read in a browser
function statsHtml(s) {
  const card = (label, value, hint) => `
    <div class="card">
      <div class="val">${value}</div>
      <div class="lbl">${label}</div>
      ${hint ? `<div class="hint">${hint}</div>` : ''}
    </div>`;
  const rows = s.recentDays.slice().reverse().map((d) => `
    <tr><td>${d.day}</td><td>${d.users}</td><td>${d.hours}h</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>The Bumper Crop — stats</title>
<style>
  body{margin:0;background:#0b0e14;color:#e6dfce;font-family:system-ui,Segoe UI,sans-serif;padding:24px}
  h1{font-size:18px;letter-spacing:.18em;color:#7ec8f0;font-weight:600}
  .sub{color:#7a7666;font-size:12px;margin-bottom:18px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;max-width:760px}
  .card{background:#131824;border:1px solid #232c3c;border-radius:12px;padding:16px}
  .val{font-size:30px;font-weight:700;color:#f0ead8}
  .lbl{font-size:12px;letter-spacing:.12em;color:#8d8470;margin-top:4px;text-transform:uppercase}
  .hint{font-size:11px;color:#5d655e;margin-top:3px}
  table{margin-top:24px;border-collapse:collapse;max-width:380px;width:100%}
  th,td{text-align:left;padding:7px 12px;font-size:13px;border-bottom:1px solid #1c2430}
  th{color:#7ec8f0;font-size:11px;letter-spacing:.1em;text-transform:uppercase}
  .foot{margin-top:20px;color:#4a5160;font-size:11px}
</style></head><body>
  <h1>🌾 THE BUMPER CROP — LIVE STATS</h1>
  <div class="sub">anonymous · aggregate only · no names, no personal data · auto-refreshes every 30s</div>
  <div class="grid">
    ${card('Playing right now', s.activeNow, 'heartbeat in last 2 min')}
    ${card('Active today', s.todayUsers, s.todayHours + ' hours played today')}
    ${card('Active this week', s.active7d, '')}
    ${card('Players all-time', s.usersAllTime, '')}
    ${card('Total play time', s.totalHours + 'h', '')}
    ${card('Sessions', s.sessions, 'avg ' + s.avgSessionMin + ' min each')}
  </div>
  <table><tr><th>Day</th><th>Players</th><th>Hours</th></tr>${rows || '<tr><td colspan=3>no data yet</td></tr>'}</table>
  <div class="foot">A “player” is an anonymous device id stored locally — never a name. Refresh to update.</div>
  <script>setTimeout(()=>location.reload(),30000)</script>
</body></html>`;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}

// ---- profanity filter (KEEP IN SYNC with js/profanity.js on the client) ----
// Server-side copy is authoritative: even a hacked client can't relay dirty
// text to anyone else. Catches leetspeak, punctuation-spacing, stretched letters.
const _LEET = { '0':'o','1':'i','2':'z','3':'e','4':'a','5':'s','6':'g','7':'t','8':'b','9':'g','@':'a','$':'s','!':'i','+':'t','|':'i' };
const _BASE = [
  'fuck','shit','bitch','cunt','asshole','ass','arse','dick','piss','bastard',
  'slut','whore','fag','faggot','nigger','nigga','cock','pussy','douche','retard',
  'damn','crap','hell','wtf','stfu','gtfo','prick','twat','wank','bollocks',
  'dumbass','jackass','bullshit','motherfucker','boner','penis','vagina','sex',
  'porn','nazi','kkk','dildo','hoe','skank','tit','tits','pube',
];
const _HARD = ['fuck','shit','bitch','nigger','nigga','faggot','asshole','motherfuck','bullshit'];
const _WORDS = new Set();
for (const w of _BASE) {
  _WORDS.add(w);
  const c = w.replace(/(.)\1+/g, '$1');
  if (c !== w && c.length >= 4) _WORDS.add(c);
}
function _profNorms(token) {
  const low = token.toLowerCase();
  const plain = low.replace(/[^a-z]/g, '');
  const leet  = low.split('').map((ch) => _LEET[ch] || ch).join('').replace(/[^a-z]/g, '');
  return plain === leet ? [plain] : [plain, leet];
}
function _profBad(token) {
  for (const base of _profNorms(token)) {
    if (!base) continue;
    const coll = base.replace(/(.)\1+/g, '$1');
    if (_WORDS.has(base) || _WORDS.has(coll)) return true;
    for (const w of _HARD) { if (base.includes(w) || coll.includes(w)) return true; }
  }
  return false;
}
function cleanProfanity(text) {
  return String(text).split(/(\s+)/).map((tok) => {
    if (!tok || /^\s+$/.test(tok)) return tok;
    return _profBad(tok) ? '*'.repeat(Math.min(tok.length, 15)) : tok;
  }).join('');
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
