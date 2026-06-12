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
    this.zoneSize = Math.max(0.16, 0.36 - this.fish.speed * 0.09);
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
    this.progress += (inZone ? 0.17 : -0.105) * dt;
    if (this.progress >= 1) this.done = 'caught';
    else if (this.progress <= 0) this.done = 'escaped';
    return this.done;
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
