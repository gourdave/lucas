// journal.js — Phase D: the collection journal. Tracks everything the player
// has seen, made, hatched, and survived, with a completion percentage to chase.

import { State, bus, save } from './state.js';
import { PETS } from './pets.js';
import { CROPS } from './garden.js';
import { MEALS, BOOKS } from './ui.js';
import { FISH } from './fishing.js';

export const CREATURE_DEX = {
  worm: { name: 'Wormling', emoji: '🪱', hint: 'surfaces past the 75m mark' },
  shade: { name: 'The Tall One', emoji: '🌑', hint: 'haunts the 150m mark' },
  grin: { name: 'The Grin', emoji: '😶', hint: 'floats in the deep dark' },
  listener: { name: 'The Listener', emoji: '📡', hint: 'hears footsteps past the 120m mark' },
  borrower: { name: 'The Borrower', emoji: '🎒', hint: 'smells unbanked coins past the 100m mark' },
  strawman: { name: 'The Scarecrow That Wasn\'t There', emoji: '🌾', hint: 'closer every time you look away, past 130m' },
  regulars: { name: 'The Regulars', emoji: '🍟', hint: 'dining quietly at the 50m mark' },
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
  far1000: { name: 'Edge of Forever', emoji: '🌌', desc: 'Reach the 1000m mark — the fields never end' },
  rich: { name: 'Grain Baron', emoji: '🪙', desc: 'Hold 500 coins at once' },
  level10: { name: 'Storm of the Fields', emoji: '⭐', desc: 'Reach level 10' },
  allpets: { name: 'Best Friend of Everything', emoji: '🐾', desc: 'Hatch all 8 pets' },
  boss: { name: 'Harvester\'s Bane', emoji: '🎃', desc: 'Defeat The Harvester' },
  night: { name: 'Red Sky Survivor', emoji: '🌕', desc: 'Survive a Harvest Night' },
  bag: { name: 'Bag Rescuer', emoji: '🎒', desc: 'Rescue a lost bag' },
  dreamer: { name: 'Frequent Flyer', emoji: '🌙', desc: 'Have 5 dreams' },
  firstfish: { name: 'First Catch', emoji: '🎣', desc: 'Land a fish at the pond' },
  pondmaster: { name: 'Pond Master', emoji: '🐟', desc: 'Bank 5 different fish species' },
  koi: { name: 'Mirror Mirror', emoji: '🪞', desc: 'Land the Mirror Koi' },
  digger: { name: 'X Marks the Spot', emoji: '⛏', desc: 'Dig up a number-station cache' },
  statue: { name: 'Living Statue', emoji: '🗿', desc: 'Out-freeze The Listener 3 times' },
  fries: { name: 'Would You Like Fries', emoji: '🍟', desc: 'Order at WcDonald\'s' },
  gnomad: { name: 'Gnome Paparazzi', emoji: '🧙', desc: 'Photograph the wandering gnome in 5 places' },
  photoghost: { name: 'It Was In The Photo', emoji: '📷', desc: 'Capture what the upstairs window hides' },
  threads: { name: 'Every Thread Pulled', emoji: '🧵', desc: 'Solve every string-wall mystery' },
  maze: { name: 'Heart of the Maze', emoji: '🌽', desc: 'Open the chest at the corn maze\'s center' },
  repo: { name: 'Give It Back', emoji: '🎒', desc: 'Make The Borrower drop your coins' },
  homestead: { name: 'Field Homestead', emoji: '⛺', desc: 'Set up a camp in the fields' },
  tower: { name: 'Top of the World', emoji: '📡', desc: 'Climb the radio tower' },
  staredown: { name: 'Blink First', emoji: '👁', desc: 'Stare down The Scarecrow 3 times' },
  days5: { name: 'Settler', emoji: '🗓', desc: 'Survive 5 days in the fields' },
  days10: { name: 'Resident', emoji: '🏡', desc: 'Survive 10 days' },
  days25: { name: 'Old-Timer', emoji: '🌟', desc: 'Survive 25 days' },
  arcade3999: { name: 'Level 3999', emoji: '🕹', desc: 'Find what waits behind the door past the barn' },
  trueending: { name: 'THE TRUE ENDING', emoji: '🌅', desc: 'Complete the escape tasks and walk through the EXIT' },
  cellar: { name: 'Deep Cellar', emoji: '🧰', desc: 'Crack the deep chest in the storm cellar' },
  dweller: { name: 'Light Keeper', emoji: '🕯', desc: 'Climb out of the cellar after the Dweller woke' },
  restorer: { name: 'Handy', emoji: '🪛', desc: 'Finish a project on the restoration board' },
  restored: { name: 'The House Restored', emoji: '🏡', desc: 'Restore the whole house — light every window' },
  otherhouse: { name: 'The Other House', emoji: '🏚', desc: 'Open the legendary chest in the house that shouldn\'t be there' },
  goldfarmer: { name: 'Golden Touch', emoji: '✨', desc: 'Harvest your first golden crop' },
  allgold: { name: 'Golden Fields', emoji: '🏆', desc: 'Find the golden form of every crop' },
  prismatic: { name: 'Prismatic', emoji: '🌈', desc: 'Harvest a prismatic crop — 1 in 100' },
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
      title: 'GOLDEN HARVEST', items: Object.entries(CROPS).map(([id, c]) => ({
        emoji: J.golden.includes(id) ? '✨' : c.emoji,
        name: J.golden.includes(id) ? `Golden ${c.name}` : '???',
        sub: J.prismatic.includes(id) ? '🌈 prismatic found!' : '', got: J.golden.includes(id),
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
      title: 'FISH', items: Object.entries(FISH).map(([id, f]) => ({
        emoji: State.fish[id] ? f.emoji : '🌊', name: State.fish[id] ? f.name : '???',
        sub: State.fish[id] ? `×${State.fish[id]} · ${f.flavor}` : '', got: !!State.fish[id],
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
  bus.on('cropMutation', ({ crop, mutation }) => {
    if (mutation === 'prismatic') { mark(State.journal.prismatic, crop); awardBadge('prismatic'); }
    mark(State.journal.golden, crop);   // prismatic implies you've seen this crop shine
    awardBadge('goldfarmer');
    if (State.journal.golden.length >= Object.keys(CROPS).length) awardBadge('allgold');
  });
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
  bus.on('fishCaught', ({ id }) => {
    awardBadge('firstfish');
    if (id === 'mirrorkoi') awardBadge('koi');
  });
  bus.on('banked', () => {
    const species = Object.keys(State.fish).filter((id) => State.fish[id] > 0 && FISH[id].rarity !== 'junk');
    if (species.length >= 5) awardBadge('pondmaster');
  });
  bus.on('dug', () => awardBadge('digger'));
  bus.on('listenerSpawn', () => mark(State.journal.creatures, 'listener'));
  bus.on('listenerLost', () => { if (State.listenersSurvived >= 3) awardBadge('statue'); });
  bus.on('wcdSeen', () => mark(State.journal.creatures, 'regulars'));
  bus.on('ordered', ({ meal }) => { mark(State.journal.mealsMade, meal); awardBadge('fries'); });
  bus.on('mazeChest', () => awardBadge('maze'));
  bus.on('borrowerSpawn', () => mark(State.journal.creatures, 'borrower'));
  bus.on('borrowerDropped', () => awardBadge('repo'));
  bus.on('campPlaced', () => awardBadge('homestead'));
  bus.on('towerClimbed', () => awardBadge('tower'));
  bus.on('enteredArcade', () => awardBadge('arcade3999'));
  bus.on('trueEnding', () => awardBadge('trueending'));
  bus.on('cellarChest', () => awardBadge('cellar'));
  bus.on('dwellerEscaped', () => awardBadge('dweller'));
  bus.on('restorationDone', () => awardBadge('restorer'));
  bus.on('houseRestored', () => awardBadge('restored'));
  bus.on('otherChest', () => awardBadge('otherhouse'));
  bus.on('scarecrowSpawn', () => mark(State.journal.creatures, 'strawman'));
  bus.on('scarecrowStared', () => { if (State.scarecrowsStared >= 3) awardBadge('staredown'); });
  bus.on('newDay', ({ n }) => {
    if (n >= 5) awardBadge('days5');
    if (n >= 10) awardBadge('days10');
    if (n >= 25) awardBadge('days25');
  });
  bus.on('mysterySolved', ({ id }) => {
    if (id === 'gnome') awardBadge('gnomad');
    if (id === 'window') awardBadge('photoghost');
    if (['gnome', 'window', 'cookies', 'stillness'].every((m) => State.mysteries[m] && State.mysteries[m].solved)) {
      awardBadge('threads');
    }
  });
}

export function checkDepthBadges(depth) {
  if (depth >= 200) awardBadge('far200');
  if (depth >= 500) awardBadge('far500');
  if (depth >= 990) awardBadge('far1000');
}
