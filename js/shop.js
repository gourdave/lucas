// shop.js — The Crop Exchange: a roadside stall run by a scarecrow who never
// says a word. Spend grain coins (earned by popping monsters) on snacks,
// recipes, calm upgrades, and better guns.

import { State, bus, save } from './state.js';
import { unlocked } from './progression.js';
import { DECOR } from './decor.js';

export const GUNS = {
  flare: { name: 'Flare Pistol', emoji: '🔫', dmg: 1, cooldown: 0.55, color: 0xffd28a },
  lantern: { name: 'Lantern Rifle', emoji: '🔦', dmg: 2, cooldown: 0.38, color: 0xaef0ff },
  dawn: { name: 'Dawn Cannon', emoji: '☀️', dmg: 3, cooldown: 0.28, color: 0xfff3b0 },
};

export const SHOP_ITEMS = [
  {
    id: 'calmbar', name: 'Calm Bar', emoji: '🍫', price: 25, repeat: true,
    desc: 'A chocolate bar that tastes like a deep breath. +40 calm, carried in your pocket.',
    buy() { State.inventory.food.calmbar = (State.inventory.food.calmbar || 0) + 1; },
  },
  {
    id: 'seeds_wheat', name: 'Golden Wheat Seeds ×2', emoji: '🌾', price: 12, repeat: true,
    desc: 'Plant them in your garden plots. Ready in 10 minutes.',
    locked: () => !unlocked('garden'),
    buy() { State.seeds.goldenwheat = (State.seeds.goldenwheat || 0) + 2; },
  },
  {
    id: 'seeds_glowcorn', name: 'Glowcorn Seeds ×2', emoji: '🌽', price: 30, repeat: true,
    desc: 'A brighter crop for patient farmers. Ready in 45 minutes.',
    locked: () => !unlocked('garden'),
    buy() { State.seeds.glowcorn = (State.seeds.glowcorn || 0) + 2; },
  },
  {
    id: 'campkit', name: 'Camp Kit', emoji: '⛺', price: 120, repeat: true,
    desc: 'Firewood, stones, and a stubborn little tent. Set it up deep in the fields: a safe circle where you can rest and bank loot at 70%. Max 3 out at once.',
    locked: () => State.campKits + State.camps.length >= 3,
    buy() { State.campKits++; },
  },
  {
    id: 'recipe_stew', name: 'Recipe: Golden Stew', emoji: '🥘', price: 60,
    desc: 'Teaches your stove to make golden stew. Huge meal, warms the soul.',
    owned: () => State.recipes.includes('stew'),
    buy() { State.recipes.push('stew'); },
  },
  {
    id: 'recipe_cookies', name: 'Recipe: Wheat Cookies', emoji: '🍪', price: 60,
    desc: 'Teaches your oven to bake wheat cookies. The wheat is honored, probably.',
    owned: () => State.recipes.includes('cookies'),
    buy() { State.recipes.push('cookies'); },
  },
  {
    id: 'sanity1', name: 'Sturdier Calm I', emoji: '🧠', price: 80,
    desc: 'Your calm bar grows. Max calm +20 (and a full refill).',
    owned: () => State.maxSanity >= 120,
    buy() { State.maxSanity = 120; State.sanity = 120; },
  },
  {
    id: 'sanity2', name: 'Sturdier Calm II', emoji: '🧠', price: 160,
    desc: 'Max calm +20 more. The dark will have to try much harder.',
    locked: () => State.maxSanity < 120,
    owned: () => State.maxSanity >= 140,
    buy() { State.maxSanity = 140; State.sanity = 140; },
  },
  {
    id: 'gun_lantern', name: 'Lantern Rifle', emoji: '🔦', price: 120,
    desc: 'Twice the light per shot, and faster. Monsters really hate it.',
    owned: () => State.guns.includes('lantern'),
    buy() { State.guns.push('lantern'); State.gun = 'lantern'; },
  },
  {
    id: 'gun_dawn', name: 'Dawn Cannon', emoji: '☀️', price: 300,
    desc: 'Fires bottled sunrise. The most light a pocket can legally hold.',
    locked: () => !State.guns.includes('lantern'),
    owned: () => State.guns.includes('dawn'),
    buy() { State.guns.push('dawn'); State.gun = 'dawn'; },
  },
];

// rides & stardust perks
SHOP_ITEMS.push(
  {
    id: 'bike', name: 'Rusty Bike', emoji: '🚲', price: 250,
    desc: 'Ride almost twice as fast outside the fence. The deep fields just got closer.',
    owned: () => State.rides.includes('bike'),
    buy() { State.rides.push('bike'); State.ride = 'bike'; },
  },
  {
    id: 'cart', name: 'Shopping Cart', emoji: '🛒', price: 600,
    desc: 'FASTER than the bike... but it rattles. Loudly. Things underground will hear you coming.',
    locked: () => !State.rides.includes('bike'),
    owned: () => State.rides.includes('cart'),
    buy() { State.rides.push('cart'); State.ride = 'cart'; },
  },
  {
    id: 'perk_stride', name: 'Dream Stride', emoji: '✨', price: 30, currency: 'stardust',
    desc: 'Dream-power: walk 12% faster, awake, forever.',
    owned: () => State.dreamPerks.includes('stride'),
    buy() { State.dreamPerks.push('stride'); },
  },
  {
    id: 'perk_star', name: 'Star Magnet', emoji: '✨', price: 25, currency: 'stardust',
    desc: 'Dream-power: dreams give DOUBLE stardust.',
    owned: () => State.dreamPerks.includes('star'),
    buy() { State.dreamPerks.push('star'); },
  },
  {
    id: 'perk_lucid', name: 'Lucid Key', emoji: '🗝', price: 40, currency: 'stardust',
    desc: 'Dream-power: CHOOSE your dream at the bed. Even... that one.',
    owned: () => State.dreamPerks.includes('lucid'),
    buy() { State.dreamPerks.push('lucid'); },
  },
);

// decorations from decor.js (the trophy is boss-only, price -1)
for (const [id, item] of Object.entries(DECOR)) {
  if (item.price < 0) continue;
  SHOP_ITEMS.push({
    id: 'decor_' + id, name: item.name, emoji: item.emoji, price: item.price,
    desc: item.desc,
    owned: () => State.decor.includes(id),
    buy() { State.decor.push(id); },
  });
}

// returns a result string for the UI toast, or null on success
export function purchase(id) {
  const item = SHOP_ITEMS.find((i) => i.id === id);
  if (!item) return 'hm?';
  if (item.owned && item.owned()) return 'You already have that.';
  if (item.locked && item.locked()) return 'The scarecrow shakes its head. Not yet.';
  if (item.currency === 'stardust') {
    if (State.stardust < item.price) return 'Not enough stardust — it only falls in dreams.';
    State.stardust -= item.price;
    item.buy();
    save();
    bus.emit('purchase', { id });
    return null;
  }
  if (State.money < item.price) return 'Not enough coins. The scarecrow stares, patiently.';
  State.money -= item.price;
  item.buy();
  save();
  bus.emit('purchase', { id });
  return null;
}
