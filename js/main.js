// main.js — boots the renderer and wires every module together.
// THE BUMPER CROP · a Backrooms Level 10 story · created by kamsamnor

import * as THREE from 'three';
import { State, bus, save, load, hasSave, clearSave } from './state.js';
import { Controls } from './controls.js';
import { World } from './world.js';
import { buildHouse } from './house.js';
import { Creatures } from './creatures.js';
import { Monsters } from './monsters.js';
import { GUNS } from './shop.js';
import { Dreams } from './dreams.js';
import { buildTherapist, RuleBrain, ClaudeBrain, getClaudeKey, PROXY_URL } from './therapist.js';
import { UI, MEALS } from './ui.js';
import { GameAudio } from './audio.js';
import { initProgression, ensureDailyQuests, Expedition, addXp, unlocked, titleFor, chestAvailable, openChest, questProgress } from './progression.js';
import { Garden, CROPS } from './garden.js';
import { Pets, EGG_TIERS, hatchEgg } from './pets.js';
import { gameNow } from './state.js';
import { Boss, HarvestNight, BARN_POS } from './boss.js';
import { Decor } from './decor.js';
import { initJournal, checkDepthBadges, TAPE_DEX } from './journal.js';
import { submitScores, ensureLbName } from './lb.js';
import { DREAMS, NIGHTMARE } from './dreams.js';
import { Pond, POND_POS, FISH, rollFish } from './fishing.js';
import { DigSiteMarker, broadcastAvailable, makeBroadcast, digHud, digOnce } from './digsite.js';
import { Listener } from './listener.js';
import { seedForDepth } from './garden.js';
import { WcDonalds, MENU, EMPLOYEE_LINES } from './wcdonalds.js';
import { pinMystery, solveMystery, MYSTERIES, buildBoard, buildCarving, Gnome, WindowFigure } from './mysteries.js';
import { todayStr } from './state.js';

const WALK_SPEED = 4.2;
const EYE = 1.62;

// ---------- renderer / scene / camera ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;   // filmic color = instant realism
renderer.toneMappingExposure = 1.15;
// sharpen every texture at glancing angles (the ground most of all) — set
// BEFORE any module paints its canvas textures so they all inherit it
THREE.Texture.DEFAULT_ANISOTROPY = Math.min(8, renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 400);
camera.rotation.order = 'YXZ';
scene.add(camera);   // so the gun viewmodel (a child of the camera) renders

// --- the gun, held at the bottom-right of the view ---
const gunGroup = new THREE.Group();
const gunBody = new THREE.Mesh(
  new THREE.BoxGeometry(0.032, 0.045, 0.24),
  new THREE.MeshLambertMaterial({ color: 0x2c2e33 })
);
const gunGrip = new THREE.Mesh(
  new THREE.BoxGeometry(0.03, 0.085, 0.04),
  new THREE.MeshLambertMaterial({ color: 0x4a3b2a })
);
gunGrip.position.set(0, -0.06, 0.09);
const gunTipMat = new THREE.MeshBasicMaterial({ color: 0xffd28a });
const gunTip = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), gunTipMat);
gunTip.position.set(0, 0.01, -0.13);
gunGroup.add(gunBody, gunGrip, gunTip);
gunGroup.position.set(0.22, -0.17, -0.46);
gunGroup.rotation.y = -0.06;
camera.add(gunGroup);
let recoil = 0;

// ---------- modules ----------
UI.init();
const controls = new Controls(canvas, document.getElementById('joylayer'));
const world = new World(scene);
const house = buildHouse(scene);
const creatures = new Creatures(scene);
const monsters = new Monsters(scene);
const garden = new Garden(scene);
const pets = new Pets(scene);
const boss = new Boss(scene);
const harvestNight = new HarvestNight();
const decor = new Decor(scene);
const pond = new Pond(scene);
const digMarker = new DigSiteMarker(scene);
const listenerEnt = new Listener(scene);
const wcd = new WcDonalds(scene);
const gnome = new Gnome(scene);
const windowFigure = new WindowFigure(scene);
buildBoard(scene);
buildCarving(scene, BARN_POS);
house.hotspots.push({ id: 'wall', x: 0.3, y: 0, z: -3.9, r: 1.4, label: '🧵  The string wall' });
const allHotspots = () => house.hotspots.concat(garden.plotHotspots());
const dreams = new Dreams();
const therapist = buildTherapist(scene);
const brain = new RuleBrain();
const audio = new GameAudio();

// ---------- player ----------
const player = new THREE.Vector3(0, 0, 11);  // feet position
let playing = false;
let inDream = false;
let busy = false;            // true while fading / cooking / blacking out
let stillTime = 0;
let shake = 0;
let currentHotspot = null;
let walkPhase = 0;           // drives the camera bob + footstep timing
let lastStepSide = 0;

function placeAtSpawn() {
  player.set(0, 0, 11);
  controls.yaw = 0;          // facing the house
  controls.pitch = 0;
}
function placeAtBed() {
  player.set(2.4, 2.8, 2.2);
  controls.yaw = Math.PI * 0.9;
  controls.pitch = 0;
}

// ---------- title screen ----------
UI.showTitle(hasSave());
document.getElementById('btn-new').addEventListener('click', () => {
  clearSave();
  startGame(false);
});
document.getElementById('btn-continue').addEventListener('click', () => startGame(true));

function startGame(fromSave) {
  if (fromSave && load()) placeAtBed();
  else placeAtSpawn();
  audio.resume();
  UI.hideTitle();
  UI.setWater(State.inventory.almondWater);
  UI.setFood(State.inventory.food);
  UI.setHunger(State.hunger);
  UI.setMoney(State.money);
  initProgression();
  if (!window.__journalInit) { window.__journalInit = true; initJournal(); }
  ensureLbName();
  UI.setLevel();
  UI.setPetsButton(unlocked('pets'));
  playing = true;
  controls.enabled = true;
  if (!State.flags.welcomed) {
    State.flags.welcomed = true;
    UI.toast('Level 10 — “The Bumper Crop”. The house is yours. The fields are… patient.', 5200);
    setTimeout(() => {
      if (!State.flags.gotGun) {
        State.flags.gotGun = true;
        UI.toast('🔫 You find a Flare Pistol on the porch. It fires light. Tap (or click) to shoot — things from under the soil hate it.', 6500);
      }
    }, 6000);
  }
}

// ---------- interactions ----------
function interact() {
  if (!playing || busy) return;
  if (inDream) { dreams.requestWake(); return; }
  if (!currentHotspot) return;
  const id = currentHotspot.id;
  if (id === 'bed') goToSleep();
  else if (id === 'stove') cook();
  else if (id === 'oven') oven();
  else if (id === 'microwave') microwave();
  else if (id === 'fridge') gainMeal('juice', ' from the fridge', 'grab');
  else if (id === 'shelf') readBook();
  else if (id === 'sofa') rest();
  else if (id === 'therapist') openTherapist();
  else if (id === 'shop') openShop();
  else if (id === 'incubator') useIncubator();
  else if (id === 'radio') cycleRadio();
  else if (id === 'chest') openDailyChest();
  else if (id === 'pond') startFishing();
  else if (id === 'dig') doDig();
  else if (id === 'wcd') openOrder();
  else if (id === 'wall') openWall();
  else if (id.startsWith('plot')) usePlot(+id.slice(4));
}

// ---------- fishing ----------
let fishStreak = 0;   // consecutive catches this trip — deeper streak, stranger fish

function startFishing() {
  busy = true;
  controls.enabled = false;
  controls.releaseLock();
  UI.setPrompt(null);
  if (!State.flags.gotRod) {
    State.flags.gotRod = true;
    UI.toast('🎣 An old rod leans against the dock, line already wet. Left here. For you, apparently.', 5200);
  }
  audio.splash();
  const fishId = rollFish(fishStreak, harvestNight.active);
  UI.openFishing(fishId, (ev) => {
    if (ev === 'bite') audio.blip();
    else if (ev === 'caught') audio.chime();
  }, (result) => {
    busy = false;
    controls.enabled = true;
    if (result === 'caught') {
      const f = FISH[fishId];
      fishStreak++;
      Expedition.addCoins(f.coins);
      Expedition.addItem({ kind: 'fish', id: fishId });
      bus.emit('fishCaught', { id: fishId });
      addXp(10);
      if (f.rarity === 'rare' || f.rarity === 'legendary') audio.fanfare();
      UI.toast(`${f.emoji} ${f.name} — 🪙${f.coins} pending! ${fishStreak >= 2
        ? `Streak ×${fishStreak}… something bigger is circling.`
        : 'Keep casting — the pond gets curious about people who stay.'}`, 4800);
    } else if (result === 'escaped') {
      UI.toast('It slipped the cage and was gone. Cast again!');
    }
  });
}

// ---------- WcDonald's: order at the counter ----------
// no AI behind the register, by design (Lucas's spec): a response system only
let lineIdx = Math.floor(Math.random() * EMPLOYEE_LINES.length);

function openOrder() {
  controls.enabled = false;
  controls.releaseLock();
  audio.blip();
  const opts = Object.entries(MENU).map(([id, m]) => ({
    value: id, emoji: m.emoji,
    label: `${m.name} — 🪙${m.price}`,
    sub: m.sub,
    button: 'order',
  }));
  UI.openPicker('🍟 WCDONALD\'S — MAY WE TAKE YOUR ORDER', opts, (id) => {
    const m = MENU[id];
    if (State.money < m.price) {
      UI.toast('…you pat your pockets. Not enough coins. The employee tilts its smooth head, very slowly, and waits.');
      controls.enabled = true;
      return;
    }
    State.money -= m.price;
    const food = State.inventory.food;
    food[m.meal] = (food[m.meal] || 0) + 1;
    State.meals++;
    bus.emit('ordered', { meal: m.meal });
    audio.coin();
    audio.ding();
    UI.setMoney(State.money);
    UI.setFood(food);
    lineIdx = (lineIdx + 1) % EMPLOYEE_LINES.length;
    UI.toast(`${m.emoji} ${EMPLOYEE_LINES[lineIdx]}`, 5200);
    controls.enabled = true;
  });
}

// ---------- the string wall ----------
function openWall() {
  controls.enabled = false;
  controls.releaseLock();
  audio.page();
  UI.openWall();
}

bus.on('mysteryPinned', ({ id }) => {
  audio.page();
  UI.toast(`🧵 A new thread pins itself to your string wall: “${MYSTERIES[id].title}”`, 5500);
});

// ---------- digging up the radio's numbers ----------
function doDig() {
  const res = digOnce();
  if (!res) return;
  audio.dig();
  if (!res.done) {
    UI.toast(`⛏ ${res.taps}/${res.of} — the soil here is loose. Someone wanted this found.`);
    return;
  }
  Expedition.addCoins(res.coins);
  if (res.bonus) {
    if (res.bonus.kind === 'egg') Expedition.addItem({ kind: 'egg', tier: res.bonus.tier, mult: res.bonus.mult });
    else if (res.bonus.kind === 'tape') bus.emit('tapeFound', {});
    else if (res.bonus.kind === 'seed') bus.emit('seedFound', { crop: seedForDepth(State.distance) });
  }
  audio.coin();
  addXp(30);
  UI.toast(`⛏ A buried cache! +🪙${res.coins} pending${res.bonus && res.bonus.kind === 'egg' ? ' + a strange egg' : ''} — now get it HOME.`, 5200);
  if (res.cursed) {
    setTimeout(() => {
      audio.sting();
      shake = 0.5;
      for (let i = 0; i < 3; i++) monsters.forceSpawnNear(player);
      UI.toast('…the cache was ALARMED. The soil around you is moving. RUN!', 5000);
    }, 2400);
  }
}

// ---------- garden ----------
function usePlot(i) {
  const plotState = State.garden.plots[i];
  if (!plotState) {
    const options = Object.entries(State.seeds)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => ({
        value: id, emoji: CROPS[id].emoji,
        label: `${CROPS[id].name} (×${n})`,
        sub: `grows in ${CROPS[id].growMin} min · sells for 🪙${CROPS[id].sell}`,
        button: 'plant',
      }));
    if (!options.length) { UI.toast('No seeds! Find seed pouches out in the fields, or buy some at the stall.'); return; }
    controls.enabled = false;
    controls.releaseLock();
    UI.openPicker('🌱 PLANT A SEED', options, (cropId) => {
      garden.plant(i, cropId);
      audio.blip();
      UI.toast(`${CROPS[cropId].emoji} Planted! Come back in ${CROPS[cropId].growMin} minutes — it grows even while you're away.`);
      controls.enabled = true;
    });
    return;
  }
  const result = garden.harvest(i);
  if (result) {
    audio.chime();
    addXp(10);
    UI.setFood(State.inventory.food);
    UI.toast(`${result.crop.emoji} Harvested ×${result.count}! Eat it, or sell it at the stall.`);
  } else {
    UI.toast(`⏳ Not ready — ${garden.minutesLeft(plotState)} minutes to go.`);
  }
}

// ---------- pets & eggs ----------
function useIncubator() {
  const inc = State.pets.incubating;
  if (inc) {
    const doneAt = inc.startedAt + EGG_TIERS[inc.tier].minutes * 60_000;
    if (gameNow() >= doneAt) {
      hatchNow();
    } else {
      UI.toast(`🥚 The ${EGG_TIERS[inc.tier].name} is warm and wiggling — ${Math.ceil((doneAt - gameNow()) / 60_000)} minutes left.`);
    }
    return;
  }
  if (!State.pets.eggs.length) { UI.toast('No eggs to incubate. Find them deep in the fields — past the 75m mark!'); return; }
  const options = State.pets.eggs.map((egg, idx) => ({
    value: idx, emoji: EGG_TIERS[egg.tier].emoji,
    label: EGG_TIERS[egg.tier].name,
    sub: `hatches in ${EGG_TIERS[egg.tier].minutes} min`,
    button: 'incubate',
  }));
  controls.enabled = false;
  controls.releaseLock();
  UI.openPicker('🥚 CHOOSE AN EGG', options, (idx) => {
    const [egg] = State.pets.eggs.splice(idx, 1);
    State.pets.incubating = { tier: egg.tier, mult: egg.mult || 1, startedAt: gameNow() };
    save();
    audio.blip();
    UI.toast(`🥚 Incubating! Come back in ${EGG_TIERS[egg.tier].minutes} minutes.`);
    controls.enabled = true;
  });
}

async function hatchNow() {
  const inc = State.pets.incubating;
  State.pets.incubating = null;
  const type = hatchEgg(inc.tier, inc.mult);
  const pet = pets.addPet(type);
  bus.emit('hatched', { type });
  audio.hatchJingle();
  addXp(25);
  UI.setPetsButton(true);
  controls.enabled = false;
  controls.releaseLock();
  await UI.showHatch(type);
  controls.enabled = true;
  UI.toast(`${pet.name} joins you! Open 🐾 to make it follow you or rename it.`);
}

function openDailyChest() {
  const reward = openChest();
  if (!reward) { UI.toast('🎁 Already opened today — a new gift appears every day!'); return; }
  audio.chime();
  UI.setMoney(State.money);
  UI.setWater(State.inventory.almondWater);
  UI.toast(`🎁 Daily gift: +🪙${reward.coins}${reward.bonus ? ' and ' + reward.bonus : ''}!`);
}
controls.onInteract = interact;
UI.onPrompt = interact;
// tap / click: in a dream it belongs to the minigame; awake, act on the
// nearest prompt if there is one, otherwise shoot
controls.onPrimary = () => {
  if (inDream) { dreams.tap(); return; }
  if (currentHotspot) interact(); else fire();
};

// --- shooting ---
const tracers = [];
let fireCooldown = 0;
let immuneToastAt = -10;
const _aimDir = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _candPos = new THREE.Vector3();
const _muzzle = new THREE.Vector3();

function addCalm(x) { State.sanity = Math.min(State.maxSanity, State.sanity + x); }

function fire() {
  if (!playing || busy || inDream || !controls.enabled || fireCooldown > 0) return;
  const gun = GUNS[State.gun] || GUNS.flare;
  fireCooldown = gun.cooldown;
  recoil = 1;
  audio.shoot();
  camera.getWorldDirection(_aimDir);

  // find what we're aiming at: smallest angle off the crosshair wins
  let best = null, bestAngle = 0.08; // ~4.5° of forgiveness
  const consider = (pos, obj, kind) => {
    _toTarget.copy(pos).sub(camera.position);
    const dist = _toTarget.length();
    if (dist > 55) return;
    _toTarget.normalize();
    const angle = _aimDir.angleTo(_toTarget);
    const allowance = bestAngle + Math.atan(0.7 / Math.max(dist, 2)); // bigger up close
    if (angle < allowance && (!best || angle < best.angle)) best = { obj, kind, angle, dist, pos: pos.clone() };
  };
  for (const m of monsters.list()) {
    _candPos.copy(m.mesh.position);
    _candPos.y += 0.4;
    consider(_candPos, m, 'monster');
  }
  for (const c of creatures.pool) {
    if (!c.active || c.state === 'FLEE') continue;
    _candPos.copy(c.mesh.position);
    _candPos.y += 1.4;
    consider(_candPos, c, 'hallucination');
  }
  if (boss.active) {
    _candPos.copy(boss.mesh.position);
    _candPos.y += 2.6;
    consider(_candPos, boss, 'boss');
  }

  // a streak of light from the muzzle
  gunTip.getWorldPosition(_muzzle);
  const end = best ? best.pos : _muzzle.clone().addScaledVector(_aimDir, 40);
  const tGeo = new THREE.BufferGeometry().setFromPoints([_muzzle.clone(), end]);
  const tracer = new THREE.Line(tGeo, new THREE.LineBasicMaterial({
    color: gun.color, transparent: true, opacity: 0.9, fog: false }));
  scene.add(tracer);
  tracers.push({ line: tracer, t: 0.12 });
  gunTipMat.color.set(gun.color);

  if (best && best.kind === 'monster') {
    monsters.hit(best.obj, gun.dmg);
  } else if (best && best.kind === 'boss') {
    boss.hit(gun.dmg);
  } else if (best && best.kind === 'hallucination') {
    if (State.playTime - immuneToastAt > 6) {
      immuneToastAt = State.playTime;
      UI.toast('Your light passes straight through it. (It isn\'t really there. RUN HOME.)');
    }
  }
}

bus.on('monsterKilled', ({ coins }) => {
  audio.pop();
  audio.coin();
  const earned = Math.round(coins * (pets.coinBonus || 1) * harvestNight.coinMult());
  Expedition.addCoins(earned);
  addXp(8);
  if (State.kills === 1) UI.toast(`🪙 +${earned} pending! Loot banks when you make it home — the longer you stay out, the bigger the Bravery bonus.`, 5200);
  else UI.toast(`🪙 +${earned} pending`, 1400);
});

bus.on('seedFound', ({ crop }) => {
  audio.chime();
  Expedition.addItem({ kind: 'seed', crop });
  UI.toast(`🌱 Found ${CROPS[crop].name} seeds! (pending — get home to keep them)`);
});

bus.on('eggFound', ({ tier }) => {
  audio.chime();
  Expedition.addItem({ kind: 'egg', tier, mult: Expedition.braveryMult() });
  UI.toast(`🥚 A ${EGG_TIERS[tier].name}! (pending — get home to keep it)`);
});

bus.on('banked', ({ coins, items, mult }) => {
  fishStreak = 0;   // a fresh trip, a shy pond
  audio.coin();
  UI.setMoney(State.money);
  UI.setLevel();
  const bits = [];
  if (coins > 0) bits.push(`🪙${coins}`);
  const eggCount = items.filter((i) => i.kind === 'egg').length;
  const seedCount = items.filter((i) => i.kind === 'seed').length;
  if (eggCount) bits.push(`🥚×${eggCount}`);
  if (seedCount) bits.push(`🌱×${seedCount}`);
  const tapeCount = items.filter((i) => i.kind === 'tape').length;
  if (tapeCount) bits.push(`📼×${tapeCount}`);
  UI.toast(`🏠 BANKED! ${bits.join(' ')} (Bravery ×${mult})`, 4500);
  submitScores();
});

bus.on('tapeFound', () => {
  const remaining = Object.keys(TAPE_DEX).filter((id) =>
    !State.tapes.includes(id) && !State.exp.items.some((i) => i.kind === 'tape' && i.id === id));
  if (!remaining.length) return;
  const id = remaining[(Math.random() * remaining.length) | 0];
  audio.chime();
  Expedition.addItem({ kind: 'tape', id });
  UI.toast('📼 A cassette tape! (pending — get it home to the radio)');
});

bus.on('badge', (b) => {
  audio.fanfare();
  UI.toast(`🏅 BADGE: ${b.emoji} ${b.name}!`, 4500);
});

bus.on('bossWake', () => {
  audio.sting();
  document.getElementById('bossbar').classList.remove('hidden');
  document.getElementById('bossfill').style.width = '100%';
  UI.toast('🎃 THE HARVESTER rises from the barn rows. Light it up — or RUN.', 5500);
});

bus.on('bossHit', ({ hp, max }) => {
  document.getElementById('bossfill').style.width = Math.max(0, (hp / max) * 100) + '%';
});

bus.on('bossKilled', () => {
  document.getElementById('bossbar').classList.add('hidden');
  audio.fanfare();
  shake = 0.8;
  const reward = Math.round(150 * harvestNight.coinMult());
  Expedition.addCoins(reward);
  Expedition.addItem({ kind: 'egg', tier: 'midnight', mult: 3 });
  if (!State.decor.includes('trophy')) State.decor.push('trophy');
  addXp(120);
  submitScores();
  UI.toast(`🎃 THE HARVESTER FALLS! +🪙${reward} pending, a MIDNIGHT EGG, and its lantern for your mantel. Now get it all home!`, 7000);
});

bus.on('bossSwipe', () => {
  if (pets.tryShield()) { UI.toast('🎃 Your Strawlem takes the hit!'); return; }
  audio.sting();
  UI.flash();
  shake = 0.7;
  State.sanity = Math.max(0, State.sanity - 25);
  UI.toast('The Harvester\'s arm sweeps through you like cold smoke!');
});

bus.on('harvestNightStart', () => {
  audio.sting();
  UI.toast('🌕 HARVEST NIGHT! The sky bleeds for 90 seconds — TRIPLE coins if you can survive out here!', 6000);
});

bus.on('harvestNightEnd', ({ survived }) => {
  UI.toast(survived
    ? '🌕 Harvest Night passes. You stood your ground. Respect.'
    : '🌕 The red sky fades behind you.', 4500);
});

bus.on('levelup', ({ level, title, unlocks }) => {
  audio.fanfare();
  UI.setLevel();
  UI.setPetsButton(unlocked('pets'));
  let msg = `⭐ LEVEL ${level} — ${title}!`;
  if (unlocks.includes('garden')) msg += ' 🌱 NEW: your GARDEN is ready in the yard!';
  if (unlocks.includes('pets')) msg += ' 🥚 NEW: PET EGGS now appear in the fields + incubator in the house!';
  if (unlocks.includes('radioquests')) msg += ' 📻 NEW: the radio has started picking up… numbers. Listen to it each day.';
  UI.toast(msg, 6500);
  submitScores();
});

bus.on('monsterBite', () => {
  if (pets.tryShield()) {
    UI.toast('🎃 Your Strawlem blocks the bite!');
    return;
  }
  audio.bite();
  UI.flash();
  shake = 0.45;
  State.sanity = Math.max(0, State.sanity - 18);
  UI.toast('A wormling nips you and recoils. Pop it before it circles back!');
});

controls.onDrink = () => UI.onDrink && UI.onDrink();

UI.onOpenQuests = () => {
  if (!playing || busy || inDream) return;
  controls.enabled = false;
  controls.releaseLock();
  audio.blip();
  UI.openQuests();
};
UI.onOpenPets = () => {
  if (!playing || busy || inDream) return;
  controls.enabled = false;
  controls.releaseLock();
  audio.blip();
  UI.openPets();
};
UI.onOpenJournal = () => {
  if (!playing || busy || inDream) return;
  controls.enabled = false;
  controls.releaseLock();
  audio.blip();
  UI.openJournal();
};
UI.onOpenLb = () => {
  if (!playing || busy || inDream) return;
  controls.enabled = false;
  controls.releaseLock();
  audio.blip();
  UI.openLb();
};
UI.onPhoto = () => {
  if (!playing) return;
  // some things exist only in photographs
  const figureInShot = !inDream && windowFigure.prePhoto(player, camera);
  renderer.render(inDream ? dreams.scene : scene, inDream ? dreams.camera : camera);
  const data = canvas.toDataURL('image/png');
  windowFigure.postPhoto();
  const a = document.createElement('a');
  a.href = data;
  a.download = 'bumpercrop-' + Date.now() + '.png';
  a.click();
  audio.shutter();
  UI.flash();
  UI.toast('📸 Snapped! Saved to your downloads.');
  if (inDream) return;
  pinMystery('window');   // the first photo is the first clue
  if (figureInShot && solveMystery('window')) {
    setTimeout(() => {
      audio.whisperNow();
      UI.toast('…wait. Look at the photo again. Who is that in the upstairs window?', 7000);
    }, 1800);
  }
  // gnome evidence
  const m = State.mysteries.gnome;
  const before = m && m.shots ? m.shots.length : 0;
  if (gnome.photographed(camera)) {
    const shots = State.mysteries.gnome.shots.length;
    if (shots >= 5 && before < 5) {
      audio.fanfare();
      setTimeout(() => UI.toast('🧙 Five spots. Five photos. The gnome accepts defeat — and starts chipping in on your daily gift.', 7000), 1800);
    } else {
      setTimeout(() => UI.toast(`🧙 Evidence! (${shots}/5 spots photographed)`, 3500), 1800);
    }
  }
};
UI.onPanelClosed = () => { controls.enabled = true; };
UI.onQuestClaimed = (q) => {
  audio.coin();
  UI.setMoney(State.money);
  UI.setLevel();
  UI.toast(`📜 Quest complete! +🪙${q.coins} +${q.xp}xp`);
};
UI.onDrink = () => {
  if (State.inventory.almondWater <= 0) return;
  State.inventory.almondWater--;
  addCalm(25);
  UI.setWater(State.inventory.almondWater);
  audio.chime();
  UI.toast('The almond water is sweet and cold. (+25 calm)');
};

function cook() {
  busy = true;
  audio.sizzle();
  UI.setPrompt(null);
  setTimeout(() => {
    const pool = ['shrimp', 'pasta'];
    if (State.recipes.includes('stew')) pool.push('stew', 'stew'); // new recipe cooks often
    gainMeal(pool[(Math.random() * pool.length) | 0], ' on the stove');
    busy = false;
  }, 1600);
}

// making food gives you a meal you CARRY — eat it any time from the pocket
function gainMeal(id, how, verb = 'make yourself') {
  const food = State.inventory.food;
  food[id] = (food[id] || 0) + 1;
  State.meals++;
  bus.emit('cooked', {});
  addXp(4);
  UI.setFood(food);
  UI.toast(`${MEALS[id].emoji} You ${verb} ${MEALS[id].name}${how}. It goes in your pocket.`);
}

function eatMeal(id) {
  const food = State.inventory.food;
  if (!food[id]) return;
  food[id]--;
  const meal = MEALS[id];
  State.hunger = Math.min(100, State.hunger + meal.hunger);
  addCalm(meal.calm);
  UI.setFood(food);
  if (meal.drink) audio.chime(); else audio.munch();
  UI.toast(`${meal.emoji} You ${meal.drink ? 'drink' : 'eat'} the ${meal.name}. (+${meal.hunger} food, +${meal.calm} calm)`);
}
UI.onEat = eatMeal;

function microwave() {
  busy = true;
  audio.hum(2.1);
  UI.setPrompt(null);
  setTimeout(() => {
    audio.ding();
    gainMeal('nuggets', ' — DING!');
    busy = false;
  }, 2200);
}

const BAKE_SECONDS = 20;
function oven() {
  const f = State.flags;
  if (f.ovenStart === undefined) {
    f.ovenStart = State.playTime;
    f.ovenDinged = false;
    audio.blip();
    UI.toast('You slide a tray of dough into the oven. Come back when it dings (~20s).');
  } else if (State.playTime - f.ovenStart >= BAKE_SECONDS) {
    delete f.ovenStart;
    audio.ding();
    const cookies = State.recipes.includes('cookies') && (f.bakeAlt = !f.bakeAlt);
    gainMeal(cookies ? 'cookies' : 'bread', ', still warm from the oven');
  } else {
    const left = Math.ceil(BAKE_SECONDS - (State.playTime - f.ovenStart));
    UI.toast(`The oven hums softly. About ${left}s to go.`);
  }
}

function rest() {
  busy = true;
  UI.setPrompt(null);
  setTimeout(() => {
    State.rests++;
    addCalm(12);
    UI.toast('You sink into the sofa for a while. (+12 calm)');
    busy = false;
  }, 1200);
}

function readBook() {
  controls.enabled = false;
  controls.releaseLock();
  audio.page();
  const book = UI.openBook();
  const first = !State.booksRead.includes(book.id);
  if (first) State.booksRead.push(book.id);
  State.reads++;
  addCalm(first ? 10 : 3);
  // some books carry true secrets — reading one pins the thread
  if (book.id === 'midnight') pinMystery('cookies');
  if (book.id === 'patience') pinMystery('stillness');
  UI.onBookClosed = () => { controls.enabled = true; };
}

function openTherapist() {
  controls.enabled = false;
  controls.releaseLock();
  audio.blip();
  // real Claude plays Dr. Umbra: a device key takes precedence (testing),
  // then the global keyless proxy, then the built-in RuleBrain
  const key = getClaudeKey();
  const proxy = window.__proxyOverride || PROXY_URL;
  let activeBrain = brain;
  if (key) activeBrain = new ClaudeBrain(brain, { key });
  else if (proxy) activeBrain = new ClaudeBrain(brain, { proxy });
  UI.openChat(activeBrain);
  UI.onChatClosed = () => { controls.enabled = true; };
}

function openShop() {
  // the scarecrow's sweet tooth: arrive with wheat cookies in your pocket
  const m = State.mysteries.cookies;
  if ((State.inventory.food.cookies || 0) > 0 && !(m && m.solved)) {
    State.inventory.food.cookies--;
    solveMystery('cookies');
    State.money += 60;
    State.inventory.food.calmbar = (State.inventory.food.calmbar || 0) + 2;
    UI.setMoney(State.money);
    UI.setFood(State.inventory.food);
    audio.chime();
    UI.toast('🍪 The cookie is gone from your pocket. The scarecrow has not moved. Two calm bars and 🪙60 sit under the price tags. It says nothing. It is delighted.', 8000);
  }
  controls.enabled = false;
  controls.releaseLock();
  audio.blip();
  UI.openShop();
  UI.onShopClosed = () => { controls.enabled = true; };
}
UI.onPurchase = (item) => {
  audio.coin();
  UI.setMoney(State.money);
  UI.setFood(State.inventory.food);
  UI.toast(`${item.emoji} ${item.name} — yours. The scarecrow does not move. You feel thanked anyway.`);
};

// ---------- sleeping & dreaming ----------
function goToSleep() {
  if (State.dreamPerks.includes('lucid')) {
    controls.enabled = false;
    controls.releaseLock();
    const opts = [...DREAMS, NIGHTMARE].map((def) => ({
      value: def, emoji: def.id === 'nightmare' ? '🩸' : '🌙',
      label: def.title, sub: def.id === 'nightmare' ? 'big stardust. big nerves.' : '',
      button: 'dream',
    }));
    UI.openPicker('🗝 CHOOSE YOUR DREAM', opts, (def) => { controls.enabled = true; beginSleep(def); });
    return;
  }
  // past level 5, sometimes the night has other plans...
  const forced = (State.level >= 5 && Math.random() < 0.22) ? NIGHTMARE : null;
  beginSleep(forced);
}

async function beginSleep(forced) {
  busy = true;
  controls.enabled = false;
  UI.setPrompt(null);
  await UI.fade(1, 1.3);
  const def = dreams.begin(forced);
  inDream = true;
  audio.startDream();
  UI.showDreamTitle(def.title);
  controls.yaw = 0;        // every dream starts facing its action
  controls.pitch = 0;
  await UI.fade(0, 1.6);
  controls.enabled = true; // the dream is a minigame — hands back on the wheel
  if (def.goal) UI.toast(def.goal, 6500);
  busy = false;
}

// ---------- the radio ----------
function cycleRadio() {
  // once a day (level 3+), the static resolves into a NUMBER STATION
  if (broadcastAvailable()) {
    const b = makeBroadcast();
    if (b) {
      audio.numberStation();
      UI.toast(b.toast, 9500);
      return;
    }
  }
  if (!State.tapes.length) { UI.toast('📻 Static. Find cassette tapes out in the fields to give it songs!'); return; }
  const idx = State.flags.radioIdx ?? -1;
  const next = idx + 1;
  if (next >= State.tapes.length) {
    State.flags.radioIdx = -1;
    audio.stopTape();
    UI.toast('📻 click. Radio off.');
  } else {
    State.flags.radioIdx = next;
    const tapeId = State.tapes[next];
    audio.startTape(TAPE_DEX[tapeId].style);
    UI.toast(`📻 Now playing: ${TAPE_DEX[tapeId].name}`);
  }
}

async function wakeUp() {
  busy = true;
  inDream = false;
  controls.enabled = false;
  UI.setDreamHud(null);
  audio.stopDream();
  await UI.fade(1, 1.1);
  const def = dreams.current;
  const result = dreams.lastResult || { score: 1, max: 1, success: true, text: '' };
  State.sleeps++;
  State.sanity = State.maxSanity;
  State.hunger = Math.max(0, State.hunger - 15);   // dreaming works up an appetite
  State.dreamLog.push({ id: def.id, title: def.title });
  State.flags.lastDream = def.id;
  bus.emit('dreamed', {});
  addXp(result.success ? 25 : 15);
  // stardust scales with how well the dream went: 40% just for dreaming,
  // the rest earned in the minigame (a perfect run roughly doubles it)
  const baseDust = def.id === 'nightmare' ? 25 + Math.random() * 10 : 5 + Math.random() * 6;
  const skill = 0.4 + 0.6 * (result.max ? Math.min(1, result.score / result.max) : 1);
  const dust = Math.max(1, Math.round(baseDust * skill * (State.dreamPerks.includes('star') ? 2 : 1)));
  State.stardust += dust;
  if (def.reward.type === 'water') {
    State.inventory.almondWater++;
    State.totalAlmondFound++;
    UI.setWater(State.inventory.almondWater);
  } else if (def.reward.type === 'shield') {
    State.flags.dreamShield = true;
  }
  placeAtBed();
  save();
  await UI.fade(0, 1.3);
  // one toast at a time: how the dream went, then the stardust, then the gift
  UI.toast(result.text || 'You wake feeling like you were somewhere important.', 4600);
  setTimeout(() => UI.toast(`✨ +${dust} stardust (you have ${State.stardust}) — spend it at the stall!`, 4600), 4800);
  setTimeout(() => UI.toast(def.reward.text, 5200), 9600);
  controls.enabled = true;
  busy = false;
}

// ---------- The Listener ----------
bus.on('listenerSpawn', () => {
  audio.listenerStart();
  audio.whisperNow();
  if (!State.flags.metListener) {
    State.flags.metListener = true;
    UI.toast('📡 Something rises from the wheat. No eyes — only an EAR. It moves when you move. FREEZE.', 7500);
  } else {
    UI.toast('📡 The Listener rises. Don\'t. Move.', 4200);
  }
});

bus.on('listenerLost', () => {
  audio.listenerStop();
  audio.chime();
  UI.toast(`🗿 It tilts its head… hears nothing… and sinks back into the rows. (out-frozen ×${State.listenersSurvived})`, 4800);
});

bus.on('listenerCatch', () => {
  audio.listenerStop();
  if (pets.tryShield()) { UI.toast('🎃 Your Strawlem stomps off loudly — The Listener follows IT instead!'); audio.chime(); return; }
  if (State.flags.dreamShield) {
    State.flags.dreamShield = false;
    UI.toast('The starlight grin flares around you — The Listener hears only silence.');
    audio.chime();
    return;
  }
  audio.sting();
  UI.flash();
  shake = 0.8;
  State.sanity = Math.max(0, State.sanity - 35);
  UI.toast('IT HEARD YOU. The world rings like a struck bell. (−35 calm)');
});

// ---------- getting caught ----------
bus.on('creatureAttack', () => {
  if (pets.tryShield()) {
    UI.toast('🎃 Your Strawlem throws itself in the way! (blocked)');
    audio.chime();
    return;
  }
  if (State.flags.dreamShield) {
    State.flags.dreamShield = false;
    UI.toast('The starlight grin flares around you. It cannot touch you. Not this time.');
    audio.chime();
    return;
  }
  audio.sting();
  UI.flash();
  shake = 0.6;
  State.sanity = Math.max(0, State.sanity - 30);
  UI.toast('Something very tall passes through you. Run home.');
});

bus.on('pickup', () => {
  audio.chime();
  UI.setWater(State.inventory.almondWater);
  UI.toast('Almond water! Drink it any time from the top of the screen.');
});

async function blackout() {
  busy = true;
  controls.enabled = false;
  fishStreak = 0;
  State.blackouts++;
  const hadLoot = Expedition.pendingCount() > 0;
  Expedition.dropBag(player);
  if (hadLoot) UI.toast('🎒 Your loot bag fell where you blacked out — go back for it!', 6000);
  await UI.fade(1, 1.6);
  placeAtBed();
  State.sanity = 50;
  save();
  await UI.fade(0, 1.6);
  UI.toast('You black out… and wake in your own bed. The fields carried you home.', 5200);
  controls.enabled = true;
  busy = false;
}

// ---------- the loop ----------
const clock = new THREE.Clock();
const _warmWindow = new THREE.Color(0xffc878);

// tiny hooks for debugging from the console (harmless in production)
window.__state = State;
window.__teleport = (x, z, y = 0) => player.set(x, y, z);
window.__look = (yaw, pitch = 0) => { controls.yaw = yaw; controls.pitch = pitch; };
window.__creatures = creatures;
window.__monsters = monsters;
window.__fire = fire;
window.__boss = boss;
window.__hn = harvestNight;
window.__dreams = dreams;
window.__pos = () => ({ x: +player.x.toFixed(2), y: +player.y.toFixed(2), z: +player.z.toFixed(2) });
window.__addXp = addXp;
window.__audio = audio;
window.__pond = pond;
window.__listener = listenerEnt;
window.__dig = { makeBroadcast, digOnce, marker: digMarker };
window.__ui = UI;
window.__wcd = wcd;
window.__gnome = gnome;
window.__figure = windowFigure;
window.__forceStill = (s) => { stillTime = s; };

// auto-quality: if a phone can't hold ~20fps for a while, quietly shed the
// mood layers (clouds, ground fog) and drop the pixel ratio. game unchanged.
let slowFrames = 0;
let gfxDropped = false;
function dropGfx() {
  if (gfxDropped) return;
  gfxDropped = true;
  renderer.setPixelRatio(1);
  world.setLowQuality();
}
function watchPerformance(rawDt) {
  if (gfxDropped || window.__noAutoQuality) return;
  if (rawDt > 0.055 && rawDt < 1) slowFrames++;
  else if (rawDt <= 0.04) slowFrames = Math.max(0, slowFrames - 2);
  if (slowFrames > 240) dropGfx();
}
window.__dropGfx = dropGfx;

let __frameCount = 0;
function tick() {
  window.__frames = ++__frameCount;
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  if (!playing) { renderer.render(scene, camera); return; }
  watchPerformance(rawDt);
  State.playTime += dt;

  if (inDream) {
    controls.update();   // dreams are playable now — feed them your moves
    const alive = dreams.update(dt, controls, () => audio.chime());
    UI.setDreamHud(dreams.hudText());
    renderer.render(dreams.scene, dreams.camera);
    if (!alive && !busy) wakeUp();
    return;
  }

  controls.update();

  // --- movement with wall sliding ---
  const mv = controls.move;
  const moving = (mv.x !== 0 || mv.y !== 0) && controls.enabled;
  if (moving) {
    let speedMult = State.dreamPerks.includes('stride') ? 1.12 : 1;
    if (!house.isInYard(player.x, player.z)) {
      if (State.ride === 'cart') speedMult *= 2.2;
      else if (State.ride === 'bike') speedMult *= 1.8;
    }
    const sin = Math.sin(controls.yaw), cos = Math.cos(controls.yaw);
    const dx = (-sin * mv.y + cos * mv.x) * WALK_SPEED * speedMult * dt;
    const dz = (-cos * mv.y - sin * mv.x) * WALK_SPEED * speedMult * dt;
    const out = house.collide(player.x, player.z, player.x + dx, player.z + dz, player.y);
    player.x = out.x;
    player.z = out.z;
    stillTime = 0;
    // walking bob + a footstep at each end of the sway
    walkPhase += dt * 7.2;
    const side = Math.sin(walkPhase) > 0 ? 1 : -1;
    if (side !== lastStepSide) {
      lastStepSide = side;
      audio.step(house.isInside(player.x, player.z) || player.y > 1.5 ? 'wood' : 'grass');
    }
  } else {
    stillTime += dt;
    walkPhase *= Math.max(0, 1 - dt * 8);   // settle the bob when standing
  }
  const groundY = house.groundHeight(player.x, player.z, player.y);
  player.y = THREE.MathUtils.damp(player.y, groundY, 14, dt);

  // --- world systems ---
  const inYard = house.isInYard(player.x, player.z);
  const inside = house.isInside(player.x, player.z);
  world.update(dt, player, inYard);
  // the deep field weighs on the camera too: exposure sinks with the light
  renderer.toneMappingExposure = 1.15 - world.fear * 0.22;

  // --- gun feel: cooldown, recoil, fading tracers ---
  fireCooldown -= dt;
  recoil = Math.max(0, recoil - dt * 6);
  gunGroup.position.z = -0.42 + recoil * 0.07;
  gunGroup.rotation.x = recoil * 0.16;
  gunGroup.position.y = -0.16 + Math.sin(walkPhase) * 0.006;
  for (let i = tracers.length - 1; i >= 0; i--) {
    const tr = tracers[i];
    tr.t -= dt;
    tr.line.material.opacity = Math.max(0, tr.t / 0.12) * 0.9;
    if (tr.t <= 0) {
      scene.remove(tr.line);
      tr.line.geometry.dispose();
      tr.line.material.dispose();
      tracers.splice(i, 1);
    }
  }
  // window panes mirror the sky by day and glow warm in the dark — a beacon home
  house.windowMat.color.copy(world.skyColor).lerp(_warmWindow, world.fear * 0.85);
  therapist.update(dt, player);
  if (controls.enabled) {
    creatures.update(dt, player, camera, world.fear, inYard, stillTime);
    monsters.update(dt, player, inYard);
    listenerEnt.update(dt, player, moving, world.fear, inYard);
  }
  if (!listenerEnt.active) audio.listenerStop();
  pond.update(dt, world.fear);
  digMarker.update(State.playTime);
  UI.setDig(digHud(player));
  // WcDonald's: tracking heads, regulars regular-ing, the odd polite munch
  if (wcd.update(dt, State.playTime, player)) audio.munch();
  // the gnome relocates strictly while unobserved
  if (controls.enabled) gnome.update(dt, player, camera);
  // tribute to statues: a full minute of stillness out in the fields
  if (!inYard && State.distance > 50 && stillTime > 60 && State.flags.tributeDay !== todayStr()) {
    State.flags.tributeDay = todayStr();
    solveMystery('stillness');
    Expedition.addCoins(20);
    audio.chime();
    UI.toast('🗿 The fields forgot you were here. A wormling surfaces, sets down 🪙20, and leaves without a word. Tribute. (pending)', 6500);
  }
  if (!State.flags.sawWcd && wcd.nearBuilding(player)) {
    State.flags.sawWcd = true;
    bus.emit('wcdSeen', {});
    UI.toast('🍟 A fast-food place. Out here. The lights are on, the staff have no faces, and the customers are… eating. Nobody minds you.', 7000);
  }
  UI.setCrosshair(playing && controls.enabled && !inDream);

  // --- expedition: bravery builds outside, loot banks at home ---
  Expedition.update(dt, State.distance, inYard, player);
  if (State.exp.active) questProgress('depth', 1, State.distance);
  // lost bag rescue (never while blacking out — you're lying on top of it)
  if (State.lostBag && !busy && controls.enabled) {
    const bdx = State.lostBag.x - player.x, bdz = State.lostBag.z - player.z;
    if (bdx * bdx + bdz * bdz < 4) {
      const bag = State.lostBag;
      Expedition.reclaimBag();
      audio.chime();
      UI.toast(`🎒 Found your lost bag! +🪙${bag.coins} pending — now get it home!`, 5000);
    }
  }

  // --- danger systems ---
  if (!inDream) {
    boss.update(dt, player, monsters);
    harvestNight.update(dt, State.distance, inYard);
    world.harvestNight = harvestNight.active;
    monsters.frenzy = harvestNight.active;
    monsters.cartNoise = State.ride === 'cart' && !inYard;
    if (!boss.active) document.getElementById('bossbar').classList.add('hidden');
    if (State.exp.active) checkDepthBadges(State.exp.peak);
  }

  // --- cozy systems ---
  decor.refresh();
  garden.group.visible = unlocked('garden');
  garden.update(dt);
  pets.update(dt, {
    playerPos: player, fear: world.fear, monsters, creatures, world,
    addCalm, toast: (m) => UI.toast(m), audio,
  });
  ensureDailyQuests();

  // --- hunger: drains slowly; an empty stomach gnaws at your calm ---
  State.hunger = Math.max(0, State.hunger - dt * 0.18);
  if (State.hunger < 25 && !State.flags.hungryHinted) {
    State.flags.hungryHinted = true;
    UI.toast('Your stomach growls. Eat something from your pocket — or go make yourself food.');
  }
  if (State.hunger > 40) State.flags.hungryHinted = false;

  // --- sanity ---
  let delta = 0;
  if (inside) delta += 3.0;
  else if (inYard) delta += 1.6;
  else {
    delta -= world.fear * 1.3;
    if (creatures.nearestDist < 15) delta -= 2.2;
  }
  if (State.hunger <= 0) delta -= 1.2;
  else if (State.hunger < 25) delta -= 0.5;
  State.sanity = THREE.MathUtils.clamp(State.sanity + delta * dt, 0, State.maxSanity);
  if (State.sanity <= 0 && !busy) blackout();

  // --- nearest hotspot prompt ---
  currentHotspot = null;
  if (controls.enabled && !busy) {
    let best = Infinity;
    for (const h of allHotspots()) {
      if (h.locked && !unlocked(h.locked)) continue;
      if (h.id === 'chest' && !chestAvailable()) continue;
      if (Math.abs(player.y - h.y) > 1.4) continue;
      const d2 = (player.x - h.x) ** 2 + (player.z - h.z) ** 2;
      if (d2 < h.r * h.r && d2 < best) { best = d2; currentHotspot = h; }
    }
    // field "hotspots" — the dock, any active dig site, and the counter
    if (!currentHotspot && pond.near(player)) {
      currentHotspot = { id: 'pond', label: '🎣 fish the dark water' };
    } else if (!currentHotspot && digMarker.near(player)) {
      currentHotspot = { id: 'dig', label: () => `⛏ DIG (${(State.digSite ? State.digSite.taps : 0)}/3)` };
    } else if (!currentHotspot && wcd.nearCounter(player)) {
      currentHotspot = { id: 'wcd', label: '🍟 Order at the counter' };
    }
  }
  UI.setPrompt(currentHotspot ? (typeof currentHotspot.label === 'function' ? currentHotspot.label() : currentHotspot.label) : null);

  // --- HUD ---
  UI.setCalm((State.sanity / State.maxSanity) * 100);
  UI.setHunger(State.hunger);
  UI.setLevel();
  UI.setBravery(State.exp.active ? Expedition.braveryMult() : null);
  UI.setPending(Expedition.pendingCount());
  UI.setVignette(State.sanity < 40 ? ((40 - State.sanity) / 40) * 0.95 : 0);
  let rel = Math.atan2(player.x, player.z) - controls.yaw;
  while (rel > Math.PI) rel -= Math.PI * 2;
  while (rel < -Math.PI) rel += Math.PI * 2;
  UI.setHome(State.distance, rel);

  // --- audio mix ---
  audio.update(dt, world.fear, State.sanity);

  // the oven announces itself when the bread is done
  if (State.flags.ovenStart !== undefined && !State.flags.ovenDinged &&
      State.playTime - State.flags.ovenStart >= 20) {
    State.flags.ovenDinged = true;
    audio.ding();
    UI.toast('DING! Something in the kitchen smells amazing.');
  }

  // --- camera ---
  shake = Math.max(0, shake - dt * 1.4);
  const bob = Math.sin(walkPhase) * 0.035;
  camera.rotation.y = controls.yaw;
  camera.rotation.x = controls.pitch;
  camera.rotation.z = Math.sin(walkPhase * 0.5) * 0.004;
  camera.position.set(
    player.x + (Math.random() - 0.5) * shake * 0.18,
    player.y + EYE + bob + (Math.random() - 0.5) * shake * 0.18,
    player.z + (Math.random() - 0.5) * shake * 0.18
  );

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(tick);

// ---------- housekeeping ----------
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  dreams.camera.aspect = camera.aspect;
  dreams.camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

setInterval(() => { if (playing) save(); }, 10000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playing) save();
  else if (!document.hidden) audio.resume();
});
