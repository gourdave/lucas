// fishing.js — Phase I: The Pond. A dark little body of water out past the
// 140m mark — the fields' first real DESTINATION. Cast a line, play the reel
// minigame, and carry your catch home like any other pending loot.
//
// Design (the Stardew rule): one-touch fishing. HOLD to lift the catch-cage,
// release to let it sink. Keep the fish inside the cage to land it.
// The longer you keep fishing in one trip (your STREAK), the stranger the
// things that bite — risk/reward, same as everything outside the fence.

import * as THREE from 'three';
import { State } from './state.js';

export const POND_POS = { x: 42, z: -43 };   // ~60m out — past the fence, before the danger (wormlings start at 75m)
export const POND_R = 9;                       // water radius

// speed = how jittery the fish fights (higher = harder catch)
export const FISH = {
  boot: { name: 'Old Boot', emoji: '🥾', rarity: 'junk', coins: 2, speed: 0.4,
    flavor: 'Someone walked out of it. Or something.' },
  minnow: { name: 'Wheat Minnow', emoji: '🐟', rarity: 'common', coins: 8, speed: 0.55,
    flavor: 'Tiny, golden, everywhere.' },
  bass: { name: 'Bumper Bass', emoji: '🐟', rarity: 'common', coins: 14, speed: 0.7,
    flavor: 'The pond\'s honest worker.' },
  carp: { name: 'Almond Carp', emoji: '🐠', rarity: 'uncommon', coins: 24, speed: 0.95,
    flavor: 'Smells faintly of almond water. Calming to hold.' },
  moonscale: { name: 'Moonscale', emoji: '🌘', rarity: 'uncommon', coins: 32, speed: 1.15,
    flavor: 'Its scales show a sky this level does not have.' },
  eel: { name: 'Static Eel', emoji: '⚡', rarity: 'rare', coins: 50, speed: 1.45,
    flavor: 'Sounds like the radio between stations.' },
  grinfish: { name: 'The Grinfish', emoji: '😶', rarity: 'rare', coins: 65, speed: 1.65,
    flavor: 'It was smiling before you caught it.' },
  mirrorkoi: { name: 'Mirror Koi', emoji: '🪞', rarity: 'legendary', coins: 150, speed: 1.95,
    flavor: 'Looking at it feels like being looked at.' },
};

export const RARITY_COLOR = {
  junk: '#8d8470', common: '#cfc7ae', uncommon: '#7ec27e',
  rare: '#6fa8ff', legendary: '#ffce54',
};

// what bites: streak deepens the pool, Harvest Night invites the koi
export function rollFish(streak, harvestNight, rnd = Math.random) {
  const r = rnd();
  if (harvestNight && r < 0.18) return 'mirrorkoi';
  if (streak >= 6 && r < 0.05) return 'mirrorkoi';
  if (streak >= 4 && r < 0.22) return r < 0.11 ? 'eel' : 'grinfish';
  if (streak >= 2 && r < 0.34) return r < 0.17 ? 'carp' : 'moonscale';
  if (r < 0.12) return 'boot';
  if (r < 0.5) return 'minnow';
  if (r < 0.8) return 'bass';
  return rnd() < 0.5 ? 'carp' : 'moonscale';
}

// bait sweetens the roll: worms count as +1 streak, glow grubs as +2
// (and glow grubs are too interesting for boots to bite)
export function rollWithBait(streak, baitKind, harvestNight, rnd = Math.random) {
  const bonus = baitKind === 'glow' ? 2 : baitKind === 'worm' ? 1 : 0;
  let id = rollFish(streak + bonus, harvestNight, rnd);
  if (id === 'boot' && baitKind === 'glow') id = rollFish(streak + bonus, harvestNight, rnd);
  return id;
}

// ---------- the bait shack's stock ----------
export const FISH_SHOP = [
  {
    id: 'rod1', name: 'Willow Rod', emoji: '🎣', price: 150,
    desc: 'A wider catch-cage and a surer reel. The pond respects willow.',
    avail: () => State.rodTier < 1,
    buy: () => { State.rodTier = 1; },
  },
  {
    id: 'rod2', name: 'Storm-Line Rod', emoji: '⚡', price: 400,
    desc: 'Strung with wire from the power lines. Even the eels think twice.',
    avail: () => State.rodTier === 1,
    buy: () => { State.rodTier = 2; },
  },
  {
    id: 'worms', name: 'Worm Tin ×3', emoji: '🪱', price: 30,
    desc: 'Three casts of faster bites and friendlier rolls (+1 streak).',
    avail: () => true,
    buy: () => { State.bait = { kind: 'worm', n: (State.bait.kind === 'worm' ? State.bait.n : 0) + 3 }; },
  },
  {
    id: 'glow', name: 'Glow Grubs ×3', emoji: '✨', price: 90,
    desc: 'Three casts that even the deep things notice (+2 streak, no boots).',
    avail: () => true,
    buy: () => { State.bait = { kind: 'glow', n: (State.bait.kind === 'glow' ? State.bait.n : 0) + 3 }; },
  },
];

export const SHACK_LINES = [
  'The bucket on its shoulders tilts, approving.',
  '“Mm.” says the bucket, somehow.',
  'It wraps your purchase in old newspaper. The headlines are all about wheat.',
  'A wave of one driftwood arm. Transaction complete.',
];

// ---------- the reel minigame (pure logic — the DOM lives in ui.js) ----------
// A fish bobs up and down a vertical track; your catch-cage rises while you
// hold and sinks when you let go. Keep the fish caged to fill the bar.
export class ReelGame {
  constructor(fishId, rnd = Math.random) {
    this.fish = FISH[fishId];
    this.fishId = fishId;
    this.rnd = rnd;
    this.fishPos = 0.5;        // 0 = bottom of the track, 1 = top
    this.fishTarget = 0.5;
    this.retarget = 0;
    this.zonePos = 0.5;        // the cage's center
    this.zoneVel = 0;
    // better rods = a wider cage, a faster reel, a slower escape
    const tier = State.rodTier || 0;
    this.zoneSize = Math.max(0.16, 0.36 - this.fish.speed * 0.09) + tier * 0.05;
    this.gain = 0.17 + tier * 0.02;
    this.drain = 0.105 - tier * 0.015;
    this.progress = 0.38;      // a head start — kid-friendly
    this.done = null;          // 'caught' | 'escaped'
  }

  update(dt, holding) {
    if (this.done) return this.done;
    // the fish darts toward a new spot every so often (faster fish dart more)
    this.retarget -= dt;
    if (this.retarget <= 0) {
      this.retarget = 0.45 + this.rnd() * (1.3 - this.fish.speed * 0.3);
      this.fishTarget = this.rnd();
    }
    const pull = this.fishTarget - this.fishPos;
    this.fishPos += Math.sign(pull) * Math.min(Math.abs(pull), this.fish.speed * 0.55 * dt);
    // the cage: hold = thrust up, release = sink
    this.zoneVel += (holding ? 2.0 : -2.2) * dt;
    this.zoneVel = Math.max(-0.85, Math.min(0.85, this.zoneVel));
    this.zonePos += this.zoneVel * dt;
    if (this.zonePos < 0) { this.zonePos = 0; this.zoneVel *= -0.25; }
    if (this.zonePos > 1) { this.zonePos = 1; this.zoneVel *= -0.25; }
    // progress
    const inZone = Math.abs(this.fishPos - this.zonePos) < this.zoneSize / 2 + 0.04;
    this.inZone = inZone;
    this.progress += (inZone ? this.gain : -this.drain) * dt;
    if (this.progress >= 1) this.done = 'caught';
    else if (this.progress <= 0) this.done = 'escaped';
    return this.done;
  }
}

// ---------- the river that leads you to the pond (Luke's idea) ----------
// a winding ribbon of the same dark water, from the edge of the yard to the
// pond's western bank — follow the water, find the fishing.
const RIVER_PATH = [
  [12, -14], [18, -20], [23, -28], [27, -35], [33, -40], [36, -42],
];

// sampled points for the world's wheat-exclusion check
export const RIVER_POINTS = (() => {
  const pts = [];
  for (let i = 0; i < RIVER_PATH.length - 1; i++) {
    const [x0, z0] = RIVER_PATH[i], [x1, z1] = RIVER_PATH[i + 1];
    for (let t = 0; t < 1; t += 0.25) pts.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]);
  }
  pts.push(RIVER_PATH[RIVER_PATH.length - 1]);
  return pts;
})();

export class River {
  constructor(scene) {
    const curve = new THREE.CatmullRomCurve3(
      RIVER_PATH.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const N = 40, W = 1.7;
    const pos = new Float32Array((N + 1) * 2 * 3);
    const idx = [];
    const pt = new THREE.Vector3(), tan = new THREE.Vector3();
    for (let i = 0; i <= N; i++) {
      curve.getPoint(i / N, pt);
      curve.getTangent(i / N, tan);
      const nx = -tan.z, nz = tan.x;   // sideways
      pos.set([pt.x + nx * W, 0.05, pt.z + nz * W], i * 6);
      pos.set([pt.x - nx * W, 0.05, pt.z - nz * W], i * 6 + 3);
      if (i < N) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const water = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
      color: 0x14242e, emissive: 0x06141c, transparent: true, opacity: 0.92,
      side: THREE.DoubleSide }));   // ribbon winding varies with the bends
    scene.add(water);
    // reeds along the banks
    for (const [x, z] of RIVER_POINTS) {
      if (Math.random() < 0.55) continue;
      const s = Math.random() < 0.5 ? 1 : -1;
      const reed = new THREE.Mesh(new THREE.ConeGeometry(0.04, 1.1 + Math.random(), 4),
        new THREE.MeshLambertMaterial({ color: 0x4a5a3a }));
      reed.position.set(x + s * (W + 0.4 + Math.random()), 0.6, z + (Math.random() - 0.5) * 2);
      scene.add(reed);
    }
  }
}

// ---------- THE BAIT SHACK, next to the pond (also Luke's idea) ----------
// run by the scarecrow's cousin: driftwood limbs, waders, a bucket for a head
export const SHACK_POS = { x: 54, z: -36 };

export class BaitShack {
  constructor(scene) {
    const g = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ color: 0x5d4d38 });
    const mk = (w, h, d, x, y, z, mat = wood) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    mk(4.2, 2.6, 0.2, 0, 1.3, -1.6);                  // back wall
    mk(0.2, 2.6, 3.2, -2.1, 1.3, 0);                  // sides
    mk(0.2, 2.6, 3.2, 2.1, 1.3, 0);
    mk(4.6, 0.18, 3.8, 0, 2.7, 0, new THREE.MeshLambertMaterial({ color: 0x3a3e44 })); // roof
    mk(4.2, 0.9, 0.7, 0, 0.45, 1.4);                  // the counter
    // the sign
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const c = cv.getContext('2d');
    c.fillStyle = '#33415a'; c.fillRect(0, 0, 256, 64);
    c.fillStyle = '#cfe2f0'; c.font = 'bold 34px Georgia'; c.textAlign = 'center';
    c.fillText('🎣 BAIT', 128, 44);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6),
      new THREE.MeshBasicMaterial({ map: tex }));
    sign.position.set(0, 2.35, 1.91);
    g.add(sign);
    // the cousin: driftwood body, waders, bucket head
    const cousin = new THREE.Group();
    const waders = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 1.0, 7),
      new THREE.MeshLambertMaterial({ color: 0x2e3e2e }));
    waders.position.y = 0.5;
    cousin.add(waders);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.8, 7), wood);
    torso.position.y = 1.4;
    cousin.add(torso);
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.4, 9),
      new THREE.MeshLambertMaterial({ color: 0x7a8288 }));
    bucket.position.y = 2.0;
    cousin.add(bucket);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.85, 5), wood);
      arm.position.set(s * 0.34, 1.45, 0.08);
      arm.rotation.z = s * 0.5;
      cousin.add(arm);
    }
    cousin.position.set(0, 0, -0.7);
    g.add(cousin);
    // rod rack + worm barrel set dressing
    for (let i = 0; i < 3; i++) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 2.2, 5), wood);
      rod.position.set(-1.6 + i * 0.3, 1.2, -1.35);
      rod.rotation.z = 0.16;
      g.add(rod);
    }
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.7, 9),
      new THREE.MeshLambertMaterial({ color: 0x6a4a2e }));
    barrel.position.set(1.5, 0.35, 0.4);
    g.add(barrel);
    const lamp = new THREE.PointLight(0xbfe0f0, 5, 9, 2);
    lamp.position.set(0, 2.4, 0.5);
    g.add(lamp);

    g.position.set(SHACK_POS.x, 0, SHACK_POS.z);
    g.rotation.y = Math.PI / 2 + 0.35;   // counter faces the pond
    scene.add(g);
  }

  near(p) {
    const dx = p.x - SHACK_POS.x, dz = p.z - SHACK_POS.z;
    return dx * dx + dz * dz < 14;
  }
}

// ---------- the pond itself ----------
export class Pond {
  constructor(scene) {
    const g = new THREE.Group();
    // dark water, barely lighter than the night around it
    this.waterMat = new THREE.MeshLambertMaterial({
      color: 0x12222c, emissive: 0x06141c, transparent: true, opacity: 0.94 });
    const water = new THREE.Mesh(new THREE.CircleGeometry(POND_R, 26), this.waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.06;
    g.add(water);
    // a muddy rim so the wheat exclusion zone doesn't look like a crop circle
    const rim = new THREE.Mesh(new THREE.RingGeometry(POND_R - 0.2, POND_R + 2.2, 26),
      new THREE.MeshLambertMaterial({ color: 0x4e4636 }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.03;
    g.add(rim);
    // the old dock: two planks and a stump — your fishing spot
    const plankMat = new THREE.MeshLambertMaterial({ color: 0x5d4d38 });
    for (const [dx, w] of [[-0.55, 0.9], [0.55, 0.9]]) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 4.4), plankMat);
      plank.position.set(dx, 0.32, -POND_R + 1.6);
      g.add(plank);
    }
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.6, 8), plankMat);
    stump.position.set(1.6, 0.3, -POND_R - 0.4);
    g.add(stump);
    // reeds around the edge
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.random() * 0.2;
      if (Math.abs(a - Math.PI * 1.5) < 0.5) continue; // gap at the dock
      const reed = new THREE.Mesh(new THREE.ConeGeometry(0.05, 1.5 + Math.random(), 4),
        new THREE.MeshLambertMaterial({ color: 0x4a5a3a }));
      reed.position.set(Math.cos(a) * (POND_R + 0.7), 0.8, Math.sin(a) * (POND_R + 0.7));
      g.add(reed);
    }
    // lily pads
    const padMat = new THREE.MeshLambertMaterial({ color: 0x36523a });
    for (let i = 0; i < 6; i++) {
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.45 + Math.random() * 0.3, 8), padMat);
      pad.rotation.x = -Math.PI / 2;
      const a = Math.random() * Math.PI * 2, d = 2 + Math.random() * 5.5;
      pad.position.set(Math.cos(a) * d, 0.09, Math.sin(a) * d);
      g.add(pad);
    }
    // ...and on the far bank, sometimes, two pale eyes watch you fish
    this.eyes = new THREE.Group();
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd8e8e0, fog: false, transparent: true, opacity: 0 });
    for (const ex of [-0.35, 0.35]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), eyeMat);
      e.position.set(ex, 1.7, 0);
      this.eyes.add(e);
    }
    this.eyes.position.set(0, 0, POND_R + 3);
    this.eyeMat = eyeMat;
    g.add(this.eyes);

    g.position.set(POND_POS.x, 0, POND_POS.z);
    scene.add(g);
    this.group = g;
    this._eyeTimer = 0;
  }

  // close enough to the dock to cast?
  near(playerPos) {
    const dx = playerPos.x - POND_POS.x;
    const dz = playerPos.z - (POND_POS.z - POND_R + 0.8);
    return dx * dx + dz * dz < 23;
  }

  update(dt, fear) {
    // water breathes a little
    this.waterMat.emissive.setHex(fear > 0.5 ? 0x041018 : 0x06141c);
    // the eyes come and go when it's dark
    this._eyeTimer -= dt;
    if (this._eyeTimer <= 0) {
      this._eyeTimer = 6 + Math.random() * 14;
      this._eyesOn = fear > 0.45 && Math.random() < 0.55;
    }
    const target = this._eyesOn ? 0.85 : 0;
    this.eyeMat.opacity += (target - this.eyeMat.opacity) * Math.min(1, dt * 2);
  }
}
