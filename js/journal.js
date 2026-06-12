// journal.js — Phase D: the collection journal. Tracks everything the player
// has seen, made, hatched, and survived, with a completion percentage to chase.

import { State, bus, save } from './state.js';
import { PETS } from './pets.js';
import { CROPS } from './garden.js';
import { MEALS, BOOKS } from './ui.js';

export const CREATURE_DEX = {
  worm: { name: 'Wormling', emoji: '🪱', hint: 'surfaces past the 75m mark' },
  shade: { name: 'The Tall One', emoji: '🌑', hint: 'haunts the 150m mark' },
  grin: { name: 'The Grin', emoji: '😶', hint: 'floats in the deep dark' },
  harvester: { name: 'THE HARVESTER', emoji: '🎃', hint: 'waits at the barn, past 300m' },
};

export const TAPE_DEX = {
  spooky: { name: 'Tape 1 — "Whistling Dark"', emoji: '📼', style: 'spooky' },
  chill: { name: 'Tape 2 — "Porch Light"', emoji: '📼', style: 'chill' },
  bit: { name: 'Tape 3 — "Pixel Harvest"', emoji: '📼', style: 'bit' },
  rain: { name: 'Tape 4 — "Wheat Rain"', emoji: '📼', style: 'rain' },
  hero: { name: 'Tape 5 — "Bravery Theme"', emoji: '📼', style: 'hero' },
};

export const BADGES = {
  firstkill: { name: 'First Pop', emoji: '💥', desc: 'Pop your first wormling' },
  far200: { name: 'Deep Walker', emoji: '👣', desc: 'Reach the 200m mark' },
  far500: { name: 'Edge of the Map', emoji: '🌫', desc: 'Reach the 500m mark' },
  rich: { name: 'Grain Baron', emoji: '🪙', desc: 'Hold 500 coins at once' },
  level10: { name: 'Storm of the Fields', emoji: '⭐', desc: 'Reach level 10' },
  allpets: { name: 'Best Friend of Everything', emoji: '🐾', desc: 'Hatch all 8 pets' },
  boss: { name: 'Harvester\'s Bane', emoji: '🎃', desc: 'Defeat The Harvester' },
  night: { name: 'Red Sky Survivor', emoji: '🌕', desc: 'Survive a Harvest Night' },
  bag: { name: 'Bag Rescuer', emoji: '🎒', desc: 'Rescue a lost bag' },
  dreamer: { name: 'Frequent Flyer', emoji: '🌙', desc: 'Have 5 dreams' },
};

function mark(list, id) {
  if (!list.includes(id)) { list.push(id); return true; }
  return false;
}

export function awardBadge(id) {
  if (mark(State.journal.badges, id)) {
    bus.emit('badge', BADGES[id]);
    save();
  }
}

export function journalSections() {
  const J = State.journal;
  const petTypes = [...new Set(State.pets.owned.map((p) => p.type))];
  const dreamIds = [...new Set(State.dreamLog.map((d) => d.id))];
  const sections = [
    {
      title: 'CREATURES', items: Object.entries(CREATURE_DEX).map(([id, c]) => ({
        emoji: c.emoji, name: J.creatures.includes(id) ? c.name : '???',
        sub: J.creatures.includes(id) ? '' : c.hint, got: J.creatures.includes(id),
      })),
    },
    {
      title: 'PETS', items: Object.entries(PETS).map(([id, p]) => ({
        emoji: petTypes.includes(id) ? p.emoji : '🥚', name: petTypes.includes(id) ? p.name : '???',
        sub: petTypes.includes(id) ? p.ability : '', got: petTypes.includes(id),
      })),
    },
    {
      title: 'CROPS', items: Object.entries(CROPS).map(([id, c]) => ({
        emoji: c.emoji, name: J.crops.includes(id) ? c.name : '???',
        sub: '', got: J.crops.includes(id),
      })),
    },
    {
      title: 'FOODS MADE', items: Object.keys(MEALS).filter((id) => !CROPS[id]).map((id) => ({
        emoji: MEALS[id].emoji, name: J.mealsMade.includes(id) ? MEALS[id].name : '???',
        sub: '', got: J.mealsMade.includes(id),
      })),
    },
    {
      title: 'DREAMS', items: ['islands', 'neon', 'stalk', 'nightmare'].map((id) => ({
        emoji: id === 'nightmare' ? '🩸' : '🌙', name: dreamIds.includes(id) ? (id === 'nightmare' ? 'THE NIGHTMARE' : 'Dream: ' + id) : '???',
        sub: '', got: dreamIds.includes(id),
      })),
    },
    {
      title: 'BOOKS', items: BOOKS.map((b) => ({
        emoji: '📖', name: State.booksRead.includes(b.id) ? b.title : '???',
        sub: '', got: State.booksRead.includes(b.id),
      })),
    },
    {
      title: 'TAPES', items: Object.entries(TAPE_DEX).map(([id, t]) => ({
        emoji: t.emoji, name: State.tapes.includes(id) ? t.name : '???',
        sub: '', got: State.tapes.includes(id),
      })),
    },
    {
      title: 'BADGES', items: Object.entries(BADGES).map(([id, b]) => ({
        emoji: b.emoji, name: b.name, sub: b.desc, got: J.badges.includes(id),
      })),
    },
  ];
  let total = 0, got = 0;
  for (const s of sections) for (const it of s.items) { total++; if (it.got) got++; }
  return { sections, pct: Math.round((got / total) * 100) };
}

// wire up the tracking
export function initJournal() {
  bus.on('monsterKilled', () => {
    mark(State.journal.creatures, 'worm');
    awardBadge('firstkill');
  });
  bus.on('harvest', ({ crop }) => mark(State.journal.crops, crop));
  bus.on('cookedMeal', ({ id }) => mark(State.journal.mealsMade, id));
  bus.on('banked', () => { if (State.money >= 500) awardBadge('rich'); });
  bus.on('levelup', ({ level }) => { if (level >= 10) awardBadge('level10'); });
  bus.on('hatched', () => {
    const types = new Set(State.pets.owned.map((p) => p.type));
    if (types.size >= Object.keys(PETS).length) awardBadge('allpets');
  });
  bus.on('bagReclaimed', () => awardBadge('bag'));
  bus.on('dreamed', () => { if (State.dreamLog.length >= 5) awardBadge('dreamer'); });
  bus.on('creatureSeen', ({ kind }) => mark(State.journal.creatures, kind));
  bus.on('bossKilled', () => { mark(State.journal.creatures, 'harvester'); awardBadge('boss'); });
  bus.on('harvestNightSurvived', () => awardBadge('night'));
}

export function checkDepthBadges(depth) {
  if (depth >= 200) awardBadge('far200');
  if (depth >= 500) awardBadge('far500');
}
