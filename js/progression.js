// progression.js — Phase A of the big update: the heart of risk & reward.
//
// THE RULE (designed by Kamsamnor & his uncle): the house is peaceful and fun;
// outside is risky and scary — but the longer you survive out there, the
// bigger the reward. Loot found outside is PENDING until you walk back through
// the gate. Make it home → it banks with your Bravery multiplier. Black out →
// it drops in a lost bag where you fell, waiting for a rescue trip.
//
// Also here: XP / levels / titles, gradual feature unlocks, Dr. Umbra's three
// daily quests, and the daily gift on the porch.

import { State, bus, save, gameNow, todayStr } from './state.js';

// ---------- levels & titles ----------
export const TITLES = [
  [1, 'Lost Resident'], [2, 'Wheat Wanderer'], [4, 'Coin Forager'],
  [6, 'Night Walker'], [8, 'Worm Popper'], [10, 'Storm of the Fields'],
  [13, 'Dream Voyager'], [16, "Scarecrow's Friend"], [20, 'Friend of the Fields'],
  [25, 'Legend of Level 10'],
];

// what each level unlocks (gradual onboarding)
export const UNLOCKS = { garden: 2, pets: 3, radioquests: 3 };

export function titleFor(level) {
  let t = TITLES[0][1];
  for (const [lv, name] of TITLES) if (level >= lv) t = name;
  return t;
}

export function unlocked(feature) {
  return State.level >= (UNLOCKS[feature] || 1);
}

export function xpNeed(level) { return 80 + (level - 1) * 60; }

export function addXp(amount) {
  if (amount <= 0) return;
  State.xp += Math.round(amount);
  while (State.xp >= xpNeed(State.level)) {
    State.xp -= xpNeed(State.level);
    State.level++;
    const news = [];
    for (const [feature, lv] of Object.entries(UNLOCKS)) {
      if (lv === State.level) news.push(feature);
    }
    bus.emit('levelup', { level: State.level, title: titleFor(State.level), unlocks: news });
  }
}

// ---------- the expedition (Bravery) ----------
const DEPTH_BONUS = [[75, 0.5], [150, 0.5], [300, 1.0], [500, 1.0]];

export const Expedition = {
  braveryMult() {
    const e = State.exp;
    let m = 1;
    for (const [d, b] of DEPTH_BONUS) if (e.peak >= d) m += b;
    let timeBonus = Math.min(1, (e.t / 45) * 0.1);
    if (State.flags.watcherBoost) timeBonus = Math.min(2, timeBonus * 2);
    return +(m + timeBonus).toFixed(1);
  },

  addCoins(n) {
    if (State.exp.active) State.exp.coins += n;
    else State.money += n; // shouldn't happen, but never eat a coin
  },

  addItem(item) {
    // item: {kind:'egg', tier} | {kind:'seed', crop}
    State.exp.items.push(item);
  },

  pendingCount() { return State.exp.coins + State.exp.items.length; },

  update(dt, dist, inYard, playerPos) {
    const e = State.exp;
    if (!inYard && !e.active) {
      e.active = true;
      e.t = 0;
      e.peak = 0;
      // note: coins/items are NOT reset here — banking and bag-drops zero
      // them; anything left over must never be silently wiped
      bus.emit('expeditionStart', {});
    }
    if (e.active && !inYard) {
      e.t += dt;
      e.peak = Math.max(e.peak, dist);
    }
    if (e.active && inYard) this.bank();
  },

  bank() {
    const e = State.exp;
    const mult = this.braveryMult();
    const banked = Math.round(e.coins * mult);
    const items = e.items.slice();
    if (banked > 0) State.money += banked;
    for (const item of items) {
      if (item.kind === 'egg') State.pets.eggs.push({ tier: item.tier, mult: item.mult || 1, foundAt: gameNow() });
      if (item.kind === 'seed') State.seeds[item.crop] = (State.seeds[item.crop] || 0) + 1;
      if (item.kind === 'tape' && item.id && !State.tapes.includes(item.id)) State.tapes.push(item.id);
      if (item.kind === 'fish') State.fish[item.id] = (State.fish[item.id] || 0) + 1;
    }
    const hadLoot = banked > 0 || items.length > 0;
    if (hadLoot) addXp(banked / 2 + items.length * 12 + Math.min(40, e.peak / 10));
    e.active = false; e.t = 0; e.peak = 0; e.coins = 0; e.items = [];
    if (hadLoot) bus.emit('banked', { coins: banked, items, mult });
    save();
  },

  // blackout: everything pending falls where you fell
  dropBag(playerPos) {
    const e = State.exp;
    if (e.coins > 0 || e.items.length > 0) {
      // if an old bag is still out there, merge it in (never lose loot forever)
      const old = State.lostBag;
      State.lostBag = {
        x: playerPos.x, z: playerPos.z,
        coins: e.coins + (old ? old.coins : 0),
        items: e.items.concat(old ? old.items : []),
      };
      bus.emit('bagDropped', State.lostBag);
    }
    e.active = false; e.t = 0; e.peak = 0; e.coins = 0; e.items = [];
  },

  // walking over the bag picks it back up — INTO pending loot (risk it again!)
  reclaimBag() {
    const bag = State.lostBag;
    if (!bag) return;
    State.exp.coins += bag.coins;
    State.exp.items.push(...bag.items);
    State.lostBag = null;
    bus.emit('bagReclaimed', bag);
  },
};

// ---------- daily quests ----------
function dayRng(extra) {
  const s = todayStr() + '#' + extra;
  let seed = 0;
  for (let i = 0; i < s.length; i++) seed = (Math.imul(seed, 31) + s.charCodeAt(i)) | 0;
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const QUEST_POOL = [
  { id: 'kill', ev: 'monsterKilled', n: [3, 6], desc: (n) => `Pop ${n} wormlings`, coins: 40, xp: 60 },
  { id: 'bank', ev: 'bankedCoins', n: [40, 90], desc: (n) => `Bank ${n} coins from expeditions`, coins: 50, xp: 70 },
  { id: 'depth', ev: 'depth', n: [150, 200, 300], desc: (n) => `Reach the ${n}m mark`, coins: 45, xp: 80 },
  { id: 'cook', ev: 'cooked', n: [2, 3], desc: (n) => `Make yourself ${n} foods`, coins: 25, xp: 40 },
  { id: 'dream', ev: 'dreamed', n: [1], desc: () => 'Sleep and have a dream', coins: 30, xp: 50 },
  { id: 'water', ev: 'pickup', n: [1, 2], desc: (n) => `Find ${n} almond water in the fields`, coins: 35, xp: 50 },
  { id: 'harvest', ev: 'harvest', n: [2, 4], desc: (n) => `Harvest ${n} crops`, coins: 35, xp: 55, needs: 'garden' },
  { id: 'hatch', ev: 'hatched', n: [1], desc: () => 'Hatch an egg', coins: 60, xp: 90, needs: 'pets' },
  { id: 'fish', ev: 'fishCaught', n: [1, 2], desc: (n) => `Catch ${n} fish at the pond`, coins: 45, xp: 65 },
  { id: 'dig', ev: 'dug', n: [1], desc: () => 'Dig up the radio\'s buried cache', coins: 55, xp: 85, needs: 'radioquests' },
];

export function ensureDailyQuests() {
  const today = todayStr();
  if (State.quests.date === today && State.quests.list.length) return;
  const rnd = dayRng('quests');
  const eligible = QUEST_POOL.filter((q) => !q.needs || unlocked(q.needs));
  const picked = [];
  while (picked.length < 3 && eligible.length) {
    const q = eligible.splice(Math.floor(rnd() * eligible.length), 1)[0];
    const n = q.n[Math.floor(rnd() * q.n.length)];
    picked.push({
      id: q.id, ev: q.ev, target: n, progress: 0, claimed: false,
      desc: q.desc(n), coins: q.coins, xp: q.xp,
    });
  }
  State.quests = { date: today, list: picked };
  bus.emit('questsRefreshed', {});
}

export function questProgress(ev, amount = 1, value = 0) {
  let changed = false;
  for (const q of State.quests.list) {
    if (q.ev !== ev || q.claimed || q.progress >= q.target) continue;
    if (ev === 'depth') {
      if (value >= q.target) { q.progress = q.target; changed = true; }
    } else {
      q.progress = Math.min(q.target, q.progress + amount);
      changed = true;
    }
    if (q.progress >= q.target) bus.emit('questDone', q);
  }
  if (changed) bus.emit('questsChanged', {});
}

export function claimQuest(index) {
  const q = State.quests.list[index];
  if (!q || q.claimed || q.progress < q.target) return false;
  q.claimed = true;
  State.money += q.coins;
  addXp(q.xp);
  save();
  return true;
}

// ---------- the daily gift on the porch ----------
export function chestAvailable() { return State.lastChest !== todayStr(); }

export function openChest() {
  if (!chestAvailable()) return null;
  State.lastChest = todayStr();
  const rnd = dayRng('chest');
  let coins = 20 + Math.floor(rnd() * 21);
  if (State.flags.gnomeFriend) coins += 8;   // the gnome chips in. don't ask how
  State.money += coins;
  const extra = rnd();
  let bonus = null;
  if (extra < 0.4) {
    State.inventory.almondWater++;
    bonus = '🧴 almond water';
  } else if (extra < 0.8 && unlocked('garden')) {
    State.seeds.goldenwheat = (State.seeds.goldenwheat || 0) + 2;
    bonus = '🌾 2 golden wheat seeds';
  }
  addXp(15);
  save();
  return { coins, bonus };
}

// wire quest tracking to the game's existing events
export function initProgression() {
  ensureDailyQuests();
  bus.on('monsterKilled', () => questProgress('monsterKilled'));
  bus.on('banked', ({ coins }) => questProgress('bankedCoins', coins));
  bus.on('pickup', () => questProgress('pickup'));
  bus.on('cooked', () => questProgress('cooked'));
  bus.on('dreamed', () => questProgress('dreamed'));
  bus.on('harvest', () => questProgress('harvest'));
  bus.on('hatched', () => questProgress('hatched'));
  bus.on('fishCaught', () => questProgress('fishCaught'));
  bus.on('dug', () => questProgress('dug'));
}
