// digsite.js — Phase I: number stations. Once a day, the radio's static
// parts and a flat voice counts out numbers — a distance and a direction.
// Somewhere out there, the soil is mounded. Bring the numbers. Dig.
//
// The cache is PENDING loot like everything else: dig it up deep in the
// fields, then survive the walk home. Some caches are... defended.

import * as THREE from 'three';
import { State, bus, save, todayStr } from './state.js';
import { POND_POS } from './fishing.js';
import { BARN_POS } from './boss.js';
import { MAZE_POS } from './maze.js';

const DIG_TAPS = 3;          // shovelfuls to reach the box

const DIRS = [
  [0, 'NORTH'], [45, 'NORTHEAST'], [90, 'EAST'], [135, 'SOUTHEAST'],
  [180, 'SOUTH'], [225, 'SOUTHWEST'], [270, 'WEST'], [315, 'NORTHWEST'],
];

function bearingName(x, z) {
  // 0° = north = -z (the direction the power lines run)
  let deg = (Math.atan2(x, -z) * 180 / Math.PI + 360) % 360;
  let best = DIRS[0][1], bestD = 360;
  for (const [d, name] of DIRS) {
    const diff = Math.min(Math.abs(deg - d), 360 - Math.abs(deg - d));
    if (diff < bestD) { bestD = diff; best = name; }
  }
  return best;
}

// a new broadcast is available once per day, from level 3 up
export function broadcastAvailable() {
  return State.level >= 3 && !State.digSite && State.flags.lastBroadcast !== todayStr();
}

export function makeBroadcast() {
  if (!broadcastAvailable()) return null;
  // deeper digs as you level — always outside the comfy zone
  const dist = 130 + Math.min(180, State.level * 18) + Math.random() * 50;
  let x, z, tries = 0;
  do {
    const a = Math.random() * Math.PI * 2;
    x = Math.cos(a) * dist;
    z = Math.sin(a) * dist;
    tries++;
  } while (tries < 20 && (
    Math.hypot(x - POND_POS.x, z - POND_POS.z) < 35 ||
    Math.hypot(x - BARN_POS.x, z - BARN_POS.z) < 45 ||
    Math.hypot(x - MAZE_POS.x, z - MAZE_POS.z) < 45));
  State.digSite = { x: Math.round(x), z: Math.round(z), taps: 0 };
  State.flags.lastBroadcast = todayStr();
  save();
  const m = Math.round(dist);
  const digits = String(m).split('').join('… ');
  const dir = bearingName(x, z);
  return {
    toast: `📻 the static parts… a flat voice counts: “${digits}… ${dir}…” — you scribble it down. Something is buried out there.`,
    dist: m, dir,
  };
}

// live HUD line pointing at the active site (null = no site)
export function digHud(playerPos) {
  const s = State.digSite;
  if (!s) return null;
  const dx = s.x - playerPos.x, dz = s.z - playerPos.z;
  const d = Math.round(Math.hypot(dx, dz));
  if (d < 6) return '🗺 you\'re standing on it — DIG!';
  return `🗺 dig site: ${d}m ${bearingName(dx, dz)}`;
}

// one shovelful; returns null until the box is reached, then the reward
export function digOnce(braveryMult) {
  const s = State.digSite;
  if (!s) return null;
  s.taps++;
  if (s.taps < DIG_TAPS) return { done: false, taps: s.taps, of: DIG_TAPS };
  // the box! distance decides the size of the haul
  const dist = Math.hypot(s.x, s.z);
  const coins = Math.round(55 + dist * 0.45);
  const r = Math.random();
  let bonus = null;
  if (r < 0.3) bonus = { kind: 'egg', tier: dist > 280 ? 'storm' : 'meadow', mult: 2 };
  else if (r < 0.55) bonus = { kind: 'tape' };
  else if (r < 0.8) bonus = { kind: 'seed' };
  const cursed = Math.random() < 0.25;   // some caches are alarmed...
  State.digSite = null;
  State.digsDone++;
  bus.emit('dug', { coins, cursed });
  save();
  return { done: true, coins, bonus, cursed };
}

// the visible mound + a faint beacon so the last 30m isn't pixel hunting
export class DigSiteMarker {
  constructor(scene) {
    const g = new THREE.Group();
    this.mound = new THREE.Mesh(new THREE.SphereGeometry(1.1, 9, 7),
      new THREE.MeshLambertMaterial({ color: 0x55492f }));
    this.mound.scale.set(1, 0.38, 1);
    g.add(this.mound);
    // a few crows' feathers... fine, just dark wisps of disturbed wheat
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.07, 1.1, 4),
        new THREE.MeshLambertMaterial({ color: 0x3a3322 }));
      tuft.position.set(Math.cos(a) * 1.5, 0.5, Math.sin(a) * 1.5);
      tuft.rotation.z = (Math.random() - 0.5) * 0.6;
      g.add(tuft);
    }
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 7, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xb8ffd0, transparent: true, opacity: 0.1,
        fog: false, side: THREE.DoubleSide, depthWrite: false }));
    this.beam.position.y = 3.5;
    g.add(this.beam);
    g.visible = false;
    scene.add(g);
    this.group = g;
  }

  near(playerPos) {
    const s = State.digSite;
    if (!s) return false;
    const dx = s.x - playerPos.x, dz = s.z - playerPos.z;
    return dx * dx + dz * dz < 7;
  }

  update(t) {
    const s = State.digSite;
    this.group.visible = !!s;
    if (!s) return;
    this.group.position.set(s.x, 0, s.z);
    // the mound shrinks as you dig into it
    const left = 1 - (s.taps / DIG_TAPS) * 0.7;
    this.mound.scale.set(left, 0.38 * left, left);
    this.beam.material.opacity = 0.07 + Math.sin(t * 2.2) * 0.04;
  }
}
