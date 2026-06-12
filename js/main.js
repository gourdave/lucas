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

const WALK_SPEED = 4.2;
const EYE = 1.62;

// ---------- renderer / scene / camera ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;   // filmic color = instant realism
renderer.toneMappingExposure = 1.15;

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
}
controls.onInteract = interact;
UI.onPrompt = interact;
// tap / click: act on the nearest prompt if there is one, otherwise shoot
controls.onPrimary = () => { if (currentHotspot) interact(); else fire(); };

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
  UI.setMoney(State.money);
  if (State.kills === 1) UI.toast(`🪙 +${coins}! Monsters drop grain coins — spend them at the stall by the gate.`);
  else UI.toast(`🪙 +${coins}`, 1600);
});

bus.on('monsterBite', () => {
  audio.bite();
  UI.flash();
  shake = 0.45;
  State.sanity = Math.max(0, State.sanity - 18);
  UI.toast('A wormling nips you and recoils. Pop it before it circles back!');
});

controls.onDrink = () => UI.onDrink && UI.onDrink();
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
async function goToSleep() {
  busy = true;
  controls.enabled = false;
  UI.setPrompt(null);
  await UI.fade(1, 1.3);
  const def = dreams.begin();
  inDream = true;
  audio.startDream();
  UI.showDreamTitle(def.title);
  await UI.fade(0, 1.6);
  busy = false;
}

async function wakeUp() {
  busy = true;
  inDream = false;
  audio.stopDream();
  await UI.fade(1, 1.1);
  const def = dreams.current;
  State.sleeps++;
  State.sanity = State.maxSanity;
  State.hunger = Math.max(0, State.hunger - 15);   // dreaming works up an appetite
  State.dreamLog.push({ id: def.id, title: def.title });
  State.flags.lastDream = def.id;
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
  UI.toast(def.reward.text, 5200);
  controls.enabled = true;
  busy = false;
}

// ---------- getting caught ----------
bus.on('creatureAttack', () => {
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
  State.blackouts++;
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
window.__pos = () => ({ x: +player.x.toFixed(2), y: +player.y.toFixed(2), z: +player.z.toFixed(2) });
window.__audio = audio;

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!playing) { renderer.render(scene, camera); return; }
  State.playTime += dt;

  if (inDream) {
    const alive = dreams.update(dt);
    renderer.render(dreams.scene, dreams.camera);
    if (!alive && !busy) wakeUp();
    return;
  }

  controls.update();

  // --- movement with wall sliding ---
  const mv = controls.move;
  const moving = (mv.x !== 0 || mv.y !== 0) && controls.enabled;
  if (moving) {
    const sin = Math.sin(controls.yaw), cos = Math.cos(controls.yaw);
    const dx = (-sin * mv.y + cos * mv.x) * WALK_SPEED * dt;
    const dz = (-cos * mv.y - sin * mv.x) * WALK_SPEED * dt;
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
  }
  UI.setCrosshair(playing && controls.enabled && !inDream);

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
    for (const h of house.hotspots) {
      if (Math.abs(player.y - h.y) > 1.4) continue;
      const d2 = (player.x - h.x) ** 2 + (player.z - h.z) ** 2;
      if (d2 < h.r * h.r && d2 < best) { best = d2; currentHotspot = h; }
    }
  }
  UI.setPrompt(currentHotspot ? currentHotspot.label : null);

  // --- HUD ---
  UI.setCalm((State.sanity / State.maxSanity) * 100);
  UI.setHunger(State.hunger);
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
