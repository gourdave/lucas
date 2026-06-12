// shop.js — The Crop Exchange: a roadside stall run by a scarecrow who never
// says a word. Spend grain coins (earned by popping monsters) on snacks,
// recipes, calm upgrades, and better guns.

import { State, bus, save } from './state.js';
import { unlocked } from './progression.js';

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

// returns a result string for the UI toast, or null on success
export function purchase(id) {
  const item = SHOP_ITEMS.find((i) => i.id === id);
  if (!item) return 'hm?';
  if (item.owned && item.owned()) return 'You already have that.';
  if (item.locked && item.locked()) return 'The scarecrow shakes its head. Not yet.';
  if (State.money < item.price) return 'Not enough coins. The scarecrow stares, patiently.';
  State.money -= item.price;
  item.buy();
  save();
  bus.emit('purchase', { id });
  return null;
}
