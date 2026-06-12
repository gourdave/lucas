// state.js — the single place the game remembers things, plus a tiny event bus.
// Everything in State must stay JSON-safe so it can be saved to localStorage.

export const State = {
  sanity: 100,          // 0..100, shown as the CALM bar
  hunger: 100,          // 0..100, shown as the FOOD bar — eat to refill
  distance: 0,          // live distance from the house (meters)
  maxDistance: 0,       // furthest the player has EVER gone (the therapist notices)
  fear: 0,              // 0 = sunny day at home, 1 = deep-field night
  playTime: 0,          // seconds played
  inventory: { almondWater: 0, food: {} },   // food: { nuggets: 2, pasta: 1, ... }
  totalAlmondFound: 0,
  meals: 0,
  sleeps: 0,
  reads: 0,
  rests: 0,
  blackouts: 0,         // times the dark caught up with you
  dreamLog: [],         // [{ id, title }]
  booksRead: [],        // book ids
  collectedPickups: [], // chunk ids where almond water was already taken
  chatHistory: [],      // last few therapist exchanges [{ who, text }]
  flags: {},            // misc one-time switches (metTherapist, dreamShield, lastDream...)
};

// --- tiny pub/sub so modules don't need to import each other ---
const listeners = {};
export const bus = {
  on(evt, fn) { (listeners[evt] ||= []).push(fn); },
  emit(evt, data) { for (const fn of listeners[evt] || []) fn(data); },
};

// --- save / load ---
const KEY = 'bumpercrop.save.v1';

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(State)); } catch { /* private mode etc. */ }
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    Object.assign(State, data);
    State.inventory ||= { almondWater: 0 };
    State.inventory.food ||= {};
    State.hunger ??= 100;
    State.flags ||= {};
    return true;
  } catch { return false; }
}

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
