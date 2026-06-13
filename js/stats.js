// stats.js — anonymous usage heartbeats, so David can see how many people are
// playing and for how long. Sends a random device id (NOT a name, NOT personal
// data — COPPA-clean) plus seconds-played to the worker once a minute.
// View the dashboard at:  <PROXY_URL>/stats

import { PROXY_URL } from './therapist.js';

const STATS_URL = PROXY_URL.replace(/\/$/, '') + '/stats';
const DEV_KEY   = 'bumpercrop.device.v1';
const BEAT_MS   = 60000;   // one heartbeat per minute

function deviceId() {
  let id = '';
  try { id = localStorage.getItem(DEV_KEY) || ''; } catch { /* private mode */ }
  if (!id) {
    id = (crypto.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2)));
    try { localStorage.setItem(DEV_KEY, id); } catch { /* ignore */ }
  }
  return id;
}

let _last = 0;
let _started = false;

function beat(extra) {
  const now = Date.now();
  const dt = _last ? Math.min(600, Math.round((now - _last) / 1000)) : 0;
  _last = now;
  try {
    fetch(STATS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: deviceId(), dt, ...(extra || {}) }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* offline — no problem */ }
}

// call once when the game starts; isPlaying() gates the periodic beat
export function startStats(isPlaying) {
  if (_started) return;
  _started = true;
  beat({ start: true });                       // session start
  setInterval(() => { if (isPlaying()) beat(); }, BEAT_MS);
  // capture the tail of a session when the tab hides
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isPlaying()) beat();
  });
}
