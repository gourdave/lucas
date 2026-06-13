// state.js — the single place the game remembers things, plus a tiny event bus.
// Everything in State must stay JSON-safe so it can be saved to localStorage.

export const State = {
  sanity: 100,          // 0..maxSanity, shown as the CALM bar
  maxSanity: 100,       // can be upgraded at the shop
  hunger: 100,          // 0..100, shown as the FOOD bar — eat to refill
  money: 0,             // grain coins, earned by popping monsters
  kills: 0,
  xp: 0,                // progress within the current level
  level: 1,
  guns: ['flare'],      // owned guns; everyone starts with the Flare Pistol
  gun: 'flare',         // equipped gun
  recipes: [],          // recipe ids bought at the shop
  // the expedition: loot gathered OUTSIDE is pending until you make it home
  exp: { active: false, t: 0, peak: 0, coins: 0, items: [] },
  lostBag: null,        // { x, z, coins, items } dropped where you blacked out
  quests: { date: '', list: [] },
  lastChest: '',        // date the porch gift was last opened
  garden: { plots: [null, null, null, null, null, null] }, // {crop, plantedAt}
  seeds: {},            // { goldenwheat: 2, ... }
  pets: { owned: [], active: null, eggs: [], incubating: null },
  stardust: 0,          // dream currency
  dreamPerks: [],       // bought with stardust
  tapes: [],            // cassette ids found in the fields
  decor: [],            // furniture bought at the stall
  rides: [],            // 'bike', 'cart'
  ride: null,           // equipped ride
  journal: { creatures: [], crops: [], mealsMade: [], badges: [] },
  fish: {},             // fish dex: { bass: 2, ... } — counted when BANKED at home
  digSite: null,        // { x, z, taps } — where the radio's numbers point
  digsDone: 0,
  listenersSurvived: 0, // times you froze until The Listener gave up
  scarecrowsStared: 0,  // times you stared The Scarecrow back into the soil
  daysPlayed: 0,        // distinct days you've survived in the fields
  mysteries: {},        // string-wall threads: { gnome: { found, solved, shots } }
  rodTier: 0,           // 0 old rod · 1 willow · 2 storm-line
  bait: { kind: null, n: 0 },   // worm | glow casts remaining
  camps: [],            // placed campsites: [{ x, z }]
  campKits: 0,          // unplaced kits in your pack
  borrowerStash: null,  // { x, z, coins } — where the Borrower dropped your loot
  arcade: { tasks: [], done: [], endings: 0 },   // Level 3999 escape checklist
  cellar: { chestDay: '', cratesDay: '', crates: [] },  // storm cellar daily loot
  online: { enabled: false, code: 'FIELDS' },      // friends-mode: connect on game start; code = room
  lbName: '',           // auto-generated leaderboard name
  bossKills: 0,
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

// current time — window.__warpMs lets tests fast-forward real-time growth
export function gameNow() { return Date.now() + (window.__warpMs || 0); }
export function todayStr() { return new Date(gameNow()).toISOString().slice(0, 10); }

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
    State.money ??= 0;
    State.maxSanity ??= 100;
    State.kills ??= 0;
    State.guns ??= ['flare'];
    State.gun ??= 'flare';
    State.recipes ??= [];
    State.xp ??= 0;
    State.level ??= 1;
    State.exp ??= { active: false, t: 0, peak: 0, coins: 0, items: [] };
    State.lostBag ??= null;
    State.quests ??= { date: '', list: [] };
    State.lastChest ??= '';
    State.garden ??= { plots: [null, null, null, null, null, null] };
    State.seeds ??= {};
    State.pets ??= { owned: [], active: null, eggs: [], incubating: null };
    State.stardust ??= 0;
    State.dreamPerks ??= [];
    State.tapes ??= [];
    State.decor ??= [];
    State.rides ??= [];
    State.ride ??= null;
    State.journal ??= { creatures: [], crops: [], mealsMade: [], badges: [] };
    State.fish ??= {};
    State.digSite ??= null;
    State.digsDone ??= 0;
    State.listenersSurvived ??= 0;
    State.scarecrowsStared ??= 0;
    State.daysPlayed ??= 0;
    State.mysteries ??= {};
    State.rodTier ??= 0;
    State.bait ??= { kind: null, n: 0 };
    State.camps ??= [];
    State.campKits ??= 0;
    State.borrowerStash ??= null;
    State.arcade ??= { tasks: [], done: [], endings: 0 };
    State.cellar ??= { chestDay: '', cratesDay: '', crates: [] };
    State.online ??= { enabled: false, code: 'FIELDS' };
    State.online.code ??= 'FIELDS';
    State.lbName ??= '';
    State.bossKills ??= 0;
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
