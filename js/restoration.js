// restoration.js — THE RESTORATION BOARD. A Stardew community-center for the
// house: a board by the north wall lists PROJECTS, each asking for a set of
// things you gather out in the fields and make in the kitchen. Fill a project's
// donations and that corner of your life gets restored — a lantern lights along
// the path home, the attic telescope rises, and when it's all done the whole
// house glows warm against the dark. Nothing asked for here is ever
// irreplaceable (no tapes, no pets, no dex items) — only things that grow back.

import * as THREE from 'three';
import { State, bus, save } from './state.js';
import { glowSprite } from './gfx.js';

// emoji + name for everything the board can ask for (kept local so this module
// owns its own labels and doesn't reach into the kitchen/garden tables)
const LABELS = {
  bread:    { emoji: '🍞', name: 'fresh bread' },
  pasta:    { emoji: '🍝', name: 'pasta' },
  nuggets:  { emoji: '🍗', name: 'chicken nuggets' },
  shrimp:   { emoji: '🍤', name: 'shrimp' },
  stew:     { emoji: '🥘', name: 'golden stew' },
  cookies:  { emoji: '🍪', name: 'wheat cookies' },
  rawfish:  { emoji: '🐟', name: 'fresh fish' },
  goldenwheat: { emoji: '🌾', name: 'golden wheat seeds' },
  almond:   { emoji: '💧', name: 'almond water' },
  stardust: { emoji: '✨', name: 'stardust' },
  coins:    { emoji: '🪙', name: 'grain coins' },
};

// a slot: kind tells us where to read/spend from; id picks the item for
// kind 'food'/'seed'. n is how many the project needs.
const s = (kind, id, n) => (typeof id === 'number' ? { kind, n: id } : { kind, id, n });

export const PROJECTS = [
  {
    id: 'pantry', name: 'The Pantry', emoji: '🥫', lantern: 0,
    blurb: 'Stock the kitchen so no one ever goes hungry out here.',
    slots: [s('food', 'bread', 2), s('food', 'pasta', 2), s('food', 'nuggets', 2)],
    reward: { coins: 120, xp: 40 },
  },
  {
    id: 'smokehouse', name: 'The Smokehouse', emoji: '🔥', lantern: 1,
    blurb: 'A proper feast — something caught, something cooked.',
    slots: [s('food', 'rawfish', 3), s('food', 'shrimp', 2), s('food', 'stew', 1)],
    reward: { coins: 160, xp: 60 },
  },
  {
    id: 'shed', name: 'The Garden Shed', emoji: '🌱', lantern: 2,
    blurb: 'Wake the soil. Seeds, water, and a little sweetness for luck.',
    slots: [s('seed', 'goldenwheat', 3), s('almond', 3), s('food', 'cookies', 2)],
    reward: { coins: 150, xp: 50, stardust: 15 },
  },
  {
    id: 'attic', name: 'The Attic', emoji: '🔭', lantern: 3,
    blurb: 'Open the attic to the sky. Raise the old telescope.',
    slots: [s('stardust', 60), s('coins', 250), s('almond', 4)],
    reward: { xp: 80, stardust: 30 }, raises: 'telescope',
  },
  {
    id: 'capstone', name: 'The House Restored', emoji: '🏡', lantern: -1,
    blurb: 'Everything in its place. Light every window against the dark.',
    requires: ['pantry', 'smokehouse', 'shed', 'attic'],
    slots: [s('food', 'stew', 1), s('coins', 300), s('stardust', 80)],
    reward: { coins: 450, xp: 120, stardust: 50 }, restoresHouse: true,
  },
];

// ---------- reading & spending from State ----------
function haveOf(slot) {
  switch (slot.kind) {
    case 'food':     return (State.inventory.food && State.inventory.food[slot.id]) || 0;
    case 'seed':     return State.seeds[slot.id] || 0;
    case 'almond':   return State.inventory.almondWater || 0;
    case 'stardust': return State.stardust || 0;
    case 'coins':    return State.money || 0;
  }
  return 0;
}
function spend(slot, n) {
  switch (slot.kind) {
    case 'food':     State.inventory.food[slot.id] = Math.max(0, (State.inventory.food[slot.id] || 0) - n); break;
    case 'seed':     State.seeds[slot.id] = Math.max(0, (State.seeds[slot.id] || 0) - n); break;
    case 'almond':   State.inventory.almondWater = Math.max(0, (State.inventory.almondWater || 0) - n); break;
    case 'stardust': State.stardust = Math.max(0, (State.stardust || 0) - n); break;
    case 'coins':    State.money = Math.max(0, (State.money || 0) - n); break;
  }
}
function slotLabel(slot) {
  const L = LABELS[slot.kind === 'food' || slot.kind === 'seed' ? slot.id : slot.kind] || { emoji: '📦', name: slot.id || slot.kind };
  return L;
}

function rec(p) { return (State.restoration.donated[p.id] ||= {}); }
function isLocked(p) {
  if (!p.requires) return false;
  return !p.requires.every((id) => State.restoration.done.includes(id));
}
function projectDone(p) {
  const r = rec(p);
  return p.slots.every((slot, i) => (r[i] || 0) >= slot.n);
}

// a view of one project for the UI to render
export function projectView(p) {
  const r = rec(p);
  const locked = isLocked(p);
  return {
    id: p.id, name: p.name, emoji: p.emoji, blurb: p.blurb,
    locked, lockReason: locked ? 'Finish the other projects first' : '',
    done: State.restoration.done.includes(p.id),
    reward: p.reward,
    slots: p.slots.map((slot, i) => {
      const L = slotLabel(slot);
      const donated = r[i] || 0;
      return {
        idx: i, emoji: L.emoji, name: L.name,
        need: slot.n, donated, have: haveOf(slot),
        full: donated >= slot.n,
        canGive: !locked && donated < slot.n && haveOf(slot) > 0,
      };
    }),
  };
}

export function restorationPct() {
  return Math.round((State.restoration.done.filter((id) => id !== 'capstone').length / 4) * 100);
}

// donate everything you can toward one slot. returns what happened (or null if
// nothing moved), and whether that completed the whole project.
export function donateSlot(pid, idx) {
  const p = PROJECTS.find((x) => x.id === pid);
  if (!p || isLocked(p) || State.restoration.done.includes(p.id)) return null;
  const slot = p.slots[idx];
  const r = rec(p);
  const remaining = slot.n - (r[idx] || 0);
  if (remaining <= 0) return null;
  const give = Math.min(haveOf(slot), remaining);
  if (give <= 0) return null;
  spend(slot, give);
  r[idx] = (r[idx] || 0) + give;
  let done = false;
  if (projectDone(p)) { State.restoration.done.push(p.id); done = true; }
  save();
  return { project: p, gave: give, done };
}

// ---------- the board + the visible upgrades it lights up ----------
export class Restoration {
  constructor(scene) {
    // the board itself, on the north wall left of the string wall
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 192;
    const c = cv.getContext('2d');
    c.fillStyle = '#5a4a36'; c.fillRect(0, 0, 256, 192);
    c.fillStyle = '#6e5b42'; c.fillRect(8, 8, 240, 176);
    c.fillStyle = '#e8dcc2'; c.font = 'bold 26px Georgia'; c.textAlign = 'center';
    c.fillText('RESTORATION', 128, 44);
    c.font = 'italic 16px Georgia'; c.fillStyle = '#c9b7a0';
    c.fillText('bring the house back', 128, 70);
    for (let i = 0; i < 4; i++) {           // four little "to-do" cards
      c.fillStyle = '#cdbb9c'; c.fillRect(28 + (i % 2) * 110, 92 + ((i / 2) | 0) * 44, 96, 34);
      c.strokeStyle = '#3a2f22'; c.strokeRect(28 + (i % 2) * 110, 92 + ((i / 2) | 0) * 44, 96, 34);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.05),
      new THREE.MeshLambertMaterial({ map: tex }));
    board.position.set(-4.2, 1.75, -4.41);
    scene.add(board);

    // the path lanterns — one per project, lit as you restore the house
    this.lanterns = [];
    const spots = [[-2.6, 7], [2.6, 8.6], [-2.6, 10.2], [2.6, 11.8]];
    for (const [x, z] of spots) {
      const g = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.5, 6),
        new THREE.MeshLambertMaterial({ color: 0x3a3127 }));
      post.position.y = 0.75;
      g.add(post);
      const cage = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.26),
        new THREE.MeshLambertMaterial({ color: 0x2a241c }));
      cage.position.y = 1.62;
      g.add(cage);
      const flameMat = new THREE.MeshBasicMaterial({ color: 0xffcf7a, fog: false });
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), flameMat);
      flame.position.y = 1.62;
      g.add(flame);
      const lamp = new THREE.PointLight(0xffcf7a, 6, 9, 2);
      lamp.position.y = 1.62;
      g.add(lamp);
      const halo = glowSprite(0xffcf7a, 1.6, 0.4);
      halo.position.y = 1.62;
      g.add(halo);
      g.position.set(x, 0, z);
      g.visible = false;
      scene.add(g);
      this.lanterns.push({ group: g, lamp, flameMat, halo });
    }

    // the attic telescope — rises in the front yard when the attic is opened
    const tel = new THREE.Group();
    const legMat = new THREE.MeshLambertMaterial({ color: 0x2c2c34 });
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5), legMat);
      const a = (i / 3) * Math.PI * 2;
      leg.position.set(Math.cos(a) * 0.22, 0.55, Math.sin(a) * 0.22);
      leg.rotation.z = Math.cos(a) * 0.18;
      leg.rotation.x = -Math.sin(a) * 0.18;
      tel.add(leg);
    }
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.9, 10),
      new THREE.MeshLambertMaterial({ color: 0x55607a, emissive: 0x101422 }));
    tube.position.set(0, 1.2, 0);
    tube.rotation.z = 0.9; tube.rotation.y = 0.5;
    tel.add(tube);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.09, 12),
      new THREE.MeshBasicMaterial({ color: 0xbfe4ff, fog: false }));
    lens.position.set(0.36, 1.42, 0.2);
    tel.add(lens);
    tel.position.set(4.2, 0, 6.2);
    tel.visible = false;
    scene.add(tel);
    this.telescope = tel;

    // the capstone glow — a warm light over the porch + a halo, for "home"
    this.porchLamp = new THREE.PointLight(0xffd98a, 0, 16, 2);
    this.porchLamp.position.set(0, 3.0, 4.7);
    scene.add(this.porchLamp);
    this.porchHalo = glowSprite(0xffd98a, 4, 0);
    this.porchHalo.position.set(0, 2.6, 4.9);
    scene.add(this.porchHalo);

    this.refresh();
  }

  // show/hide upgrades to match what's been restored (call after each donation)
  refresh() {
    const done = State.restoration.done;
    for (const p of PROJECTS) {
      if (p.lantern >= 0 && this.lanterns[p.lantern]) {
        this.lanterns[p.lantern].group.visible = done.includes(p.id);
      }
      if (p.raises === 'telescope') this.telescope.visible = done.includes(p.id);
    }
    this._capstone = done.includes('capstone');
  }

  update(t) {
    // lantern flames breathe; the porch glow warms in once the house is whole
    for (const l of this.lanterns) {
      if (!l.group.visible) continue;
      const f = 0.8 + Math.sin(t * 6 + l.group.position.x) * 0.2;
      l.lamp.intensity = 6 * f;
      l.halo.material.opacity = 0.4 * f;
    }
    const target = this._capstone ? 1 : 0;
    this.porchLamp.intensity += (7 * target - this.porchLamp.intensity) * 0.05;
    this.porchHalo.material.opacity += (0.5 * target - this.porchHalo.material.opacity) * 0.05;
  }
}
