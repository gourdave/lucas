// lb.js — the online leaderboard. Scores live in a Durable Object on the same
// Cloudflare Worker that powers Dr. Umbra. Names are auto-generated from safe
// word lists — nothing typed, nothing personal, nothing rude.

import { State, save } from './state.js';
import { PROXY_URL } from './therapist.js';

const ADJ = ['Brave', 'Sneaky', 'Golden', 'Shadow', 'Lucky', 'Wild', 'Misty', 'Rusty',
  'Spooky', 'Mighty', 'Silent', 'Cozy', 'Stormy', 'Daring', 'Nimble', 'Grand'];
const NOUN = ['Scarecrow', 'Wormling', 'Lantern', 'Sprite', 'Walker', 'Farmer', 'Moth',
  'Crow', 'Pumpkin', 'Beetle', 'Wanderer', 'Dreamer', 'Harvest', 'Watcher'];

export const BOARDS = {
  depth: { name: 'Deepest Walk', emoji: '👣', unit: 'm' },
  kills: { name: 'Monsters Popped', emoji: '💥', unit: '' },
  rich: { name: 'Richest Farmer', emoji: '🪙', unit: '' },
};

export function ensureLbName() {
  if (!State.lbName) {
    State.lbName = ADJ[(Math.random() * ADJ.length) | 0]
      + NOUN[(Math.random() * NOUN.length) | 0]
      + ((Math.random() * 90 + 10) | 0);
    save();
  }
  return State.lbName;
}

export function rerollLbName() {
  State.lbName = '';
  return ensureLbName();
}

function lbUrl() {
  if (!PROXY_URL) return null;
  return PROXY_URL.replace(/\/?$/, '/') + 'lb';
}

// fire-and-forget; the game never waits on the leaderboard
export function submitScores() {
  const url = lbUrl();
  if (!url) return;
  const name = ensureLbName();
  const scores = {
    depth: Math.round(State.maxDistance),
    kills: State.kills,
    rich: State.money,
  };
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, scores }),
  }).catch(() => {});
}

export async function fetchBoard(board) {
  const url = lbUrl();
  if (!url) return null;
  try {
    const res = await fetch(`${url}?board=${board}`);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.top) ? data.top : null;
  } catch {
    return null;
  }
}
