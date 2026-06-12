// mysteries.js — Phase K: the STRING WALL and the world's quiet secrets.
// Outer Wilds' big idea, kid-sized: nothing is locked — the only key is
// NOTICING. Clues pin themselves to a corkboard in the house; hints get
// more generous the longer a thread stays unsolved; nothing here is ever
// required to progress. Just rewards for explorers who pay attention.

import * as THREE from 'three';
import { State, bus, save, gameNow } from './state.js';

// hints[0] shows the day a thread is pinned; each day unsolved reveals the
// next, more generous hint. Frustration has a shelf life by design.
export const MYSTERIES = {
  gnome: {
    title: 'The gnome was not there a minute ago', emoji: '🧙',
    hints: [
      'It never moves while you watch. You\'re almost sure.',
      'It cannot resist relocating when nobody is looking. Catch it — your camera 📸 counts as proof.',
      'Photograph it in FIVE different spots around the yard. It will respect you for this.',
    ],
    solvedText: 'A friend now. It tucks a little extra into the daily gift on the porch.',
  },
  window: {
    title: 'The upstairs window', emoji: '📸',
    hints: [
      'Your camera might see more than you do.',
      'Stand in the yard. Photograph the front of the house. Check what comes out.',
      'The figure only exists in photographs. Aim at the upstairs window from the yard and snap.',
    ],
    solvedText: 'There is someone in the photos. There is no one in the house. Both of these are true.',
  },
  cookies: {
    title: 'The scarecrow\'s sweet tooth', emoji: '🍪',
    hints: [
      'A margin note: "the shopkeeper has a sweet tooth."',
      'Bake wheat cookies (the oven knows the recipe). Bring one to the stall.',
      'Walk up to The Crop Exchange with wheat cookies in your pocket. That\'s it. That\'s the whole trick.',
    ],
    solvedText: 'It accepted the cookie without moving. You were paid in calm bars and coins. Worth it.',
  },
  stillness: {
    title: 'Tribute to statues', emoji: '🗿',
    hints: [
      '"Stand so still the fields forget you."',
      'Somewhere past the 50m mark, stop. Completely. For a full minute.',
      'Stand perfectly still out in the fields for 60 seconds. The soil pays tribute to statues. Once a day.',
    ],
    solvedText: 'The wormlings pay tribute to anyone patient enough to become part of the field.',
  },
};

export function pinMystery(id) {
  if (!MYSTERIES[id] || State.mysteries[id]) return false;
  State.mysteries[id] = { found: gameNow(), solved: false };
  bus.emit('mysteryPinned', { id });
  save();
  return true;
}

export function solveMystery(id) {
  pinMystery(id);
  const m = State.mysteries[id];
  if (m.solved) return false;
  m.solved = true;
  bus.emit('mysterySolved', { id });
  save();
  return true;
}

export function currentHint(id) {
  const m = State.mysteries[id];
  if (!m) return null;
  const def = MYSTERIES[id];
  if (m.solved) return def.solvedText;
  const days = Math.floor((gameNow() - m.found) / 86400000);
  return def.hints[Math.min(def.hints.length - 1, days)];
}

export function looseThreads() {
  return Object.keys(MYSTERIES).filter((id) => !State.mysteries[id]).length;
}

// ---------- the corkboard on the kitchen wall ----------
function boardTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 192;
  const c = cv.getContext('2d');
  c.fillStyle = '#8a6a44'; c.fillRect(0, 0, 256, 192);
  c.fillStyle = '#7a5c3a';
  for (let i = 0; i < 300; i++) c.fillRect(Math.random() * 256, Math.random() * 192, 2, 2);
  // pinned cards + red string
  const cards = [[28, 30], [150, 44], [70, 110], [180, 128]];
  c.strokeStyle = '#b03030'; c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(cards[0][0] + 25, cards[0][1] + 15);
  for (const [x, y] of cards.slice(1)) c.lineTo(x + 25, y + 15);
  c.stroke();
  for (const [x, y] of cards) {
    c.fillStyle = '#e8dfc0';
    c.save(); c.translate(x, y); c.rotate((Math.random() - 0.5) * 0.2);
    c.fillRect(0, 0, 52, 34);
    c.fillStyle = '#b03030'; c.beginPath(); c.arc(26, 4, 3, 0, 7); c.fill();
    c.fillStyle = '#6a6050';
    for (let l = 0; l < 3; l++) c.fillRect(6, 12 + l * 6, 40 - l * 9, 2);
    c.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildBoard(scene) {
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1),
    new THREE.MeshLambertMaterial({ map: boardTexture() }));
  board.position.set(0.3, 1.78, -4.42);
  scene.add(board);
}

// a quiet signature, for whoever walks all the way around the barn
export function buildCarving(scene, barnPos) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const c = cv.getContext('2d');
  c.fillStyle = '#5e2828'; c.fillRect(0, 0, 256, 64);
  c.fillStyle = '#caa37a';
  c.font = 'italic 24px Georgia';
  c.textAlign = 'center';
  c.fillText('kamsamnor was here', 128, 40);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6),
    new THREE.MeshLambertMaterial({ map: tex }));
  m.position.set(barnPos.x + 1.2, 1.5, barnPos.z - 5.25);
  m.rotation.y = Math.PI;
  scene.add(m);
}

// is `pos` roughly in front of the camera and close enough? (cheap frustum)
const _camDir = new THREE.Vector3();
const _toPos = new THREE.Vector3();
export function inView(camera, pos, maxDist, minDot = 0.72) {
  _toPos.set(pos.x - camera.position.x, pos.y - camera.position.y, pos.z - camera.position.z);
  const d = _toPos.length();
  if (d > maxDist) return false;
  _toPos.normalize();
  camera.getWorldDirection(_camDir);
  return _camDir.dot(_toPos) > minDot;
}

// ---------- the WANDERING GNOME ----------
// it relocates only while unobserved. photograph it in 5 spots to befriend it.
const SPOTS = [
  [6.5, 9], [-6.5, 8.5], [7, -1], [-7.5, -3], [2.5, 13.2], [-5, 12.5], [6.8, 4.5],
];

export class Gnome {
  constructor(scene) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 8),
      new THREE.MeshLambertMaterial({ color: 0x3a5a8a }));
    body.position.y = 0.25;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 7),
      new THREE.MeshLambertMaterial({ color: 0xd8b090 }));
    head.position.y = 0.56;
    g.add(head);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.35, 8),
      new THREE.MeshLambertMaterial({ color: 0xa83030 }));
    hat.position.y = 0.8;
    g.add(hat);
    scene.add(g);
    this.mesh = g;
    this.spot = 0;
    this._place();
    this.timer = 20;
    this.lastSeenSpot = -1;
  }

  _place() {
    const [x, z] = SPOTS[this.spot];
    this.mesh.position.set(x, 0, z);
    // always faces the front door. always.
    this.mesh.lookAt(0, 0.4, 8);
  }

  update(dt, player, camera) {
    const gp = this.mesh.position;
    const d = Math.hypot(gp.x - player.x, gp.z - player.z);
    const seen = d < 28 && inView(camera, { x: gp.x, y: 0.5, z: gp.z }, 28);
    if (seen) {
      // catching it in a NEW spot is the moment the thread pins itself
      if (this.lastSeenSpot !== -1 && this.lastSeenSpot !== this.spot) pinMystery('gnome');
      this.lastSeenSpot = this.spot;
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 16 + Math.random() * 18;
      if (!seen && d > 7) {
        let next = Math.floor(Math.random() * SPOTS.length);
        if (next === this.spot) next = (next + 1) % SPOTS.length;
        this.spot = next;
        this._place();
      }
    }
  }

  // called when a photo is snapped; returns true when this shot was new proof
  photographed(camera) {
    const gp = this.mesh.position;
    if (!inView(camera, { x: gp.x, y: 0.5, z: gp.z }, 30, 0.78)) return false;
    pinMystery('gnome');
    const m = State.mysteries.gnome;
    m.shots ??= [];
    if (m.shots.includes(this.spot)) return false;
    m.shots.push(this.spot);
    save();
    if (m.shots.length >= 5 && !m.solved) {
      solveMystery('gnome');
      State.flags.gnomeFriend = true;
    }
    return true;
  }
}

// ---------- the figure that exists only in photographs ----------
export class WindowFigure {
  constructor(scene) {
    const g = new THREE.Group();
    const dark = new THREE.MeshBasicMaterial({ color: 0x0a0a10 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 0.95, 7), dark);
    body.position.y = 0.48;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 7), dark);
    head.position.y = 1.06;
    g.add(head);
    // it stands IN the right-hand upstairs window, silhouetted on the glass,
    // facing the yard (the pane sits at z≈4.67; the figure floats just outside)
    g.position.set(3.4, 3.72, 4.78);
    g.visible = false;
    scene.add(g);
    this.mesh = g;
    this.pos = { x: 3.4, y: 4.35, z: 4.7 };
  }

  // show it for THIS render only if the shot would plausibly include the window
  prePhoto(player, camera) {
    const fromYard = player.z > 6.5 && player.y < 1.5 && Math.abs(player.x) < 16 && player.z < 26;
    if (fromYard && inView(camera, this.pos, 26, 0.78)) {
      this.mesh.visible = true;
      return true;
    }
    return false;
  }

  postPhoto() { this.mesh.visible = false; }
}
