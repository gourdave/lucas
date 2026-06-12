// main.js — boots the renderer and wires every module together.
// THE BUMPER CROP · a Backrooms Level 10 story · created by kamsamnor

import * as THREE from 'three';
import { State, bus, save, load, hasSave, clearSave } from './state.js';
import { Controls } from './controls.js';
import { World } from './world.js';
import { buildHouse } from './house.js';
import { Creatures } from './creatures.js';
import { Dreams } from './dreams.js';
import { buildTherapist, RuleBrain } from './therapist.js';
import { UI } from './ui.js';
import { GameAudio } from './audio.js';

const WALK_SPEED = 4.2;
const EYE = 1.62;

// ---------- renderer / scene / camera ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 400);
camera.rotation.order = 'YXZ';

// ---------- modules ----------
UI.init();
const controls = new Controls(canvas, document.getElementById('joylayer'));
const world = new World(scene);
const house = buildHouse(scene);
const creatures = new Creatures(scene);
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
  playing = true;
  controls.enabled = true;
  if (!State.flags.welcomed) {
    State.flags.welcomed = true;
    UI.toast('Level 10 — “The Bumper Crop”. The house is yours. The fields are… patient.', 5200);
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
  else if (id === 'shelf') readBook();
  else if (id === 'sofa') rest();
  else if (id === 'therapist') openTherapist();
}
controls.onInteract = interact;
UI.onPrompt = interact;

controls.onDrink = () => UI.onDrink && UI.onDrink();
UI.onDrink = () => {
  if (State.inventory.almondWater <= 0) return;
  State.inventory.almondWater--;
  State.sanity = Math.min(100, State.sanity + 25);
  UI.setWater(State.inventory.almondWater);
  audio.chime();
  UI.toast('The almond water is sweet and cold. (+25 calm)');
};

function cook() {
  busy = true;
  audio.sizzle();
  UI.setPrompt(null);
  setTimeout(() => {
    State.meals++;
    State.sanity = Math.min(100, State.sanity + 15);
    UI.toast('You make yourself a hot meal. The house approves. (+15 calm)');
    busy = false;
  }, 1400);
}

function rest() {
  busy = true;
  UI.setPrompt(null);
  setTimeout(() => {
    State.rests++;
    State.sanity = Math.min(100, State.sanity + 12);
    UI.toast('You sink into the sofa for a while. (+12 calm)');
    busy = false;
  }, 1200);
}

function readBook() {
  controls.enabled = false;
  controls.releaseLock();
  const book = UI.openBook();
  const first = !State.booksRead.includes(book.id);
  if (first) State.booksRead.push(book.id);
  State.reads++;
  State.sanity = Math.min(100, State.sanity + (first ? 10 : 3));
  UI.onBookClosed = () => { controls.enabled = true; };
}

function openTherapist() {
  controls.enabled = false;
  controls.releaseLock();
  audio.blip();
  UI.openChat(brain);
  UI.onChatClosed = () => { controls.enabled = true; };
}

// ---------- sleeping & dreaming ----------
async function goToSleep() {
  busy = true;
  controls.enabled = false;
  UI.setPrompt(null);
  await UI.fade(1, 1.3);
  const def = dreams.begin();
  inDream = true;
  UI.showDreamTitle(def.title);
  await UI.fade(0, 1.6);
  busy = false;
}

async function wakeUp() {
  busy = true;
  inDream = false;
  await UI.fade(1, 1.1);
  const def = dreams.current;
  State.sleeps++;
  State.sanity = 100;
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
  } else {
    stillTime += dt;
  }
  const groundY = house.groundHeight(player.x, player.z, player.y);
  player.y = THREE.MathUtils.damp(player.y, groundY, 14, dt);

  // --- world systems ---
  const inYard = house.isInYard(player.x, player.z);
  const inside = house.isInside(player.x, player.z);
  world.update(dt, player, inYard);
  // window panes mirror the sky by day and glow warm in the dark — a beacon home
  house.windowMat.color.copy(world.skyColor).lerp(_warmWindow, world.fear * 0.85);
  therapist.update(dt, player);
  if (controls.enabled) {
    creatures.update(dt, player, camera, world.fear, inYard, stillTime);
  }

  // --- sanity ---
  let delta = 0;
  if (inside) delta += 3.0;
  else if (inYard) delta += 1.6;
  else {
    delta -= world.fear * 1.3;
    if (creatures.nearestDist < 15) delta -= 2.2;
  }
  State.sanity = THREE.MathUtils.clamp(State.sanity + delta * dt, 0, 100);
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
  UI.setCalm(State.sanity);
  UI.setVignette(State.sanity < 40 ? ((40 - State.sanity) / 40) * 0.95 : 0);
  let rel = Math.atan2(player.x, player.z) - controls.yaw;
  while (rel > Math.PI) rel -= Math.PI * 2;
  while (rel < -Math.PI) rel += Math.PI * 2;
  UI.setHome(State.distance, rel);

  // --- audio mix ---
  audio.update(dt, world.fear, State.sanity);

  // --- camera ---
  shake = Math.max(0, shake - dt * 1.4);
  camera.rotation.y = controls.yaw;
  camera.rotation.x = controls.pitch;
  camera.position.set(
    player.x + (Math.random() - 0.5) * shake * 0.18,
    player.y + EYE + (Math.random() - 0.5) * shake * 0.18,
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
