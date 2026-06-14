// pets.js — Phase C: companions! Mystery eggs are found deep in the fields
// (deeper = rarer), hatched in the incubator at home, and one chosen pet
// follows you on expeditions while the rest hang around the yard.

import * as THREE from 'three';
import { State, bus, save, gameNow } from './state.js';
import { glowSprite } from './gfx.js';

export const PET_MAX_LEVEL = 10;
// xp to climb from `level` to the next. Pets evolve at level 5 (✦) and 10 (✦✦).
export function xpForLevel(level) { return 60 * level; }
export function petStars(level) { return level >= PET_MAX_LEVEL ? '✦✦' : level >= 5 ? '✦' : ''; }

export const RARITY = {
  common: { name: 'Common', color: '#9fb89a', weight: 0 },
  rare: { name: 'RARE', color: '#6aa8e8', weight: 1 },
  epic: { name: 'EPIC', color: '#b07ae8', weight: 2 },
  legendary: { name: 'LEGENDARY', color: '#e8b24f', weight: 3 },
};

export const PETS = {
  beetle: { name: 'Lantern Beetle', emoji: '🪲', rarity: 'common', ability: 'Glows in the dark around you' },
  sprite: { name: 'Wheat Sprite', emoji: '🌾', rarity: 'common', ability: 'Chirps when treasure is near' },
  cat: { name: 'Shadow Cat', emoji: '🐈‍⬛', rarity: 'rare', ability: 'Hisses when something is hunting you' },
  crow: { name: 'Coin Crow', emoji: '🐦‍⬛', rarity: 'rare', ability: '+25% coins from monsters' },
  worm: { name: 'Baby Wormling', emoji: '🪱', rarity: 'epic', ability: 'Fights monsters at your side' },
  moth: { name: 'Dream Moth', emoji: '🦋', rarity: 'epic', ability: 'Comforts you when calm runs low' },
  strawlem: { name: 'Strawlem', emoji: '🎃', rarity: 'legendary', ability: 'Blocks one attack every minute' },
  watcher: { name: 'The Watcher', emoji: '👁', rarity: 'legendary', ability: 'Doubles your Bravery time bonus' },
};

export const EGG_TIERS = {
  field: { name: 'Field Egg', emoji: '🥚', minutes: 5, color: 0xd8d2c0, depth: 75, odds: { common: 0.68, rare: 0.27, epic: 0.05, legendary: 0 } },
  dusk: { name: 'Dusk Egg', emoji: '🟣', minutes: 20, color: 0x8a7ab8, depth: 150, odds: { common: 0.42, rare: 0.36, epic: 0.17, legendary: 0.05 } },
  midnight: { name: 'Midnight Egg', emoji: '⬛', minutes: 60, color: 0x23232e, depth: 300, odds: { common: 0.2, rare: 0.34, epic: 0.28, legendary: 0.18 } },
};

export function eggTierForDepth(depth) {
  if (depth >= EGG_TIERS.midnight.depth) return 'midnight';
  if (depth >= EGG_TIERS.dusk.depth) return 'dusk';
  return 'field';
}

function rollRarity(odds, braveryMult) {
  const roll = () => {
    let r = Math.random();
    for (const [rarity, p] of Object.entries(odds)) {
      if ((r -= p) <= 0) return rarity;
    }
    return 'common';
  };
  let best = roll();
  // high Bravery at find-time = a second roll, keep the better one
  if (braveryMult >= 2) {
    const again = roll();
    if (RARITY[again].weight > RARITY[best].weight) best = again;
  }
  return best;
}

export function hatchEgg(tier, braveryMult = 1) {
  const odds = EGG_TIERS[tier].odds;
  const rarity = rollRarity(odds, braveryMult);
  const pool = Object.entries(PETS).filter(([, p]) => p.rarity === rarity);
  const [type] = pool[Math.floor(Math.random() * pool.length)];
  return type;
}

// ---------- tiny procedural pet bodies ----------
function buildPetMesh(type) {
  const g = new THREE.Group();
  const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
  const add = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  switch (type) {
    case 'beetle': {
      add(new THREE.SphereGeometry(0.16, 8, 7), lam(0x35402a), 0, 0.16);
      add(new THREE.SphereGeometry(0.09, 7, 6), lam(0xffe9a0, { emissive: 0xffd877, emissiveIntensity: 0.9 }), 0, 0.3);
      break;
    }
    case 'sprite': {
      add(new THREE.ConeGeometry(0.1, 0.4, 5), lam(0xd8c478, { emissive: 0x8a7a30, emissiveIntensity: 0.4 }), 0, 0.25);
      add(new THREE.SphereGeometry(0.07, 6, 6), lam(0xfff2c0), 0, 0.5);
      break;
    }
    case 'cat': {
      add(new THREE.BoxGeometry(0.34, 0.2, 0.16), new THREE.MeshBasicMaterial({ color: 0x0a0a0c }), 0, 0.18);
      add(new THREE.SphereGeometry(0.1, 7, 6), new THREE.MeshBasicMaterial({ color: 0x0a0a0c }), 0.2, 0.3);
      add(new THREE.ConeGeometry(0.04, 0.08, 4), new THREE.MeshBasicMaterial({ color: 0x0a0a0c }), 0.16, 0.4);
      add(new THREE.ConeGeometry(0.04, 0.08, 4), new THREE.MeshBasicMaterial({ color: 0x0a0a0c }), 0.24, 0.4);
      const eye = new THREE.MeshBasicMaterial({ color: 0xd8e84f, fog: false });
      add(new THREE.SphereGeometry(0.018, 5, 5), eye, 0.27, 0.31, 0.04);
      add(new THREE.SphereGeometry(0.018, 5, 5), eye, 0.27, 0.31, -0.04);
      break;
    }
    case 'crow': {
      add(new THREE.SphereGeometry(0.14, 8, 7), lam(0x16161c), 0, 0.3).scale.set(1, 0.85, 1.3);
      add(new THREE.SphereGeometry(0.09, 7, 6), lam(0x16161c), 0, 0.45, 0.12);
      add(new THREE.ConeGeometry(0.035, 0.12, 4), lam(0xd8b24f), 0, 0.45, 0.24).rotation.x = Math.PI / 2;
      break;
    }
    case 'worm': {
      for (let i = 0; i < 4; i++) {
        add(new THREE.SphereGeometry(0.12 - i * 0.018, 7, 6), lam(0x4a3a30), 0, 0.13, -i * 0.14);
      }
      const eye = new THREE.MeshBasicMaterial({ color: 0xd9b04e, fog: false });
      add(new THREE.SphereGeometry(0.022, 5, 5), eye, 0.05, 0.2, 0.08);
      add(new THREE.SphereGeometry(0.022, 5, 5), eye, -0.05, 0.2, 0.08);
      break;
    }
    case 'moth': {
      add(new THREE.SphereGeometry(0.08, 7, 6), lam(0xc8b8e0), 0, 0.3);
      const wing = lam(0xe0d2f4, { emissive: 0x9a82c8, emissiveIntensity: 0.5, side: THREE.DoubleSide });
      const w1 = add(new THREE.CircleGeometry(0.16, 6), wing, -0.12, 0.32);
      const w2 = add(new THREE.CircleGeometry(0.16, 6), wing, 0.12, 0.32);
      w1.rotation.y = 0.6; w2.rotation.y = -0.6;
      g.userData.wings = [w1, w2];
      break;
    }
    case 'strawlem': {
      add(new THREE.BoxGeometry(0.2, 0.3, 0.14), lam(0xc9a85c), 0, 0.25);
      add(new THREE.SphereGeometry(0.1, 7, 6), lam(0xc9a85c), 0, 0.48);
      add(new THREE.ConeGeometry(0.13, 0.16, 6), lam(0x4d4338), 0, 0.6);
      break;
    }
    case 'watcher': {
      add(new THREE.SphereGeometry(0.14, 9, 8), lam(0xe8e2d2), 0, 0.4);
      add(new THREE.SphereGeometry(0.07, 7, 6), new THREE.MeshBasicMaterial({ color: 0x202028 }), 0, 0.4, 0.1);
      break;
    }
  }
  return g;
}

let petUid = 1;

export class Pets {
  constructor(scene) {
    this.scene = scene;
    this.followMesh = null;
    this.followType = null;
    this.yardMeshes = [];
    this.light = new THREE.PointLight(0xffd877, 0, 7, 2); // the beetle's glow
    scene.add(this.light);
    this._abilityTimers = { warn: 0, sprite: 0, moth: 0, worm: 0, shield: 0 };
  }

  ownedActive() {
    return State.pets.owned.find((p) => p.uid === State.pets.active) || null;
  }

  // the active (following) pet earns XP from your adventures and levels up,
  // strengthening its ability and evolving its look. Returns the level-up info
  // (or null) so the caller can celebrate it.
  gainXp(n) {
    const pet = this.ownedActive();
    if (!pet || n <= 0) return null;
    pet.level ||= 1;
    pet.xp = (pet.xp || 0) + n;
    let leveled = false;
    while (pet.level < PET_MAX_LEVEL && pet.xp >= xpForLevel(pet.level)) {
      pet.xp -= xpForLevel(pet.level);
      pet.level++;
      leveled = true;
    }
    if (pet.level >= PET_MAX_LEVEL) pet.xp = 0;
    save();
    return leveled ? { pet, level: pet.level, evolved: pet.level === 5 || pet.level === PET_MAX_LEVEL } : null;
  }

  addPet(type) {
    const pet = { uid: 'p' + (petUid++) + '_' + Date.now().toString(36), type, name: PETS[type].name, hatchedAt: gameNow() };
    State.pets.owned.push(pet);
    if (!State.pets.active) State.pets.active = pet.uid;
    save();
    return pet;
  }

  // keep the meshes in sync with what's owned / equipped
  refreshMeshes() {
    const active = this.ownedActive();
    if ((active && active.type) !== this.followType) {
      if (this.followMesh) { this.scene.remove(this.followMesh); }
      this.followMesh = active ? buildPetMesh(active.type) : null;
      this.followType = active ? active.type : null;
      if (this.followMesh) this.scene.add(this.followMesh);
    }
    // yard pets: every owned, non-active pet wanders near the house
    const others = State.pets.owned.filter((p) => p.uid !== State.pets.active).slice(0, 8);
    if (others.length !== this.yardMeshes.length) {
      for (const m of this.yardMeshes) this.scene.remove(m.mesh);
      this.yardMeshes = others.map((p, i) => {
        const mesh = buildPetMesh(p.type);
        mesh.position.set(-2 + (i % 4) * 2.4, 0, 7 + Math.floor(i / 4) * 3);
        this.scene.add(mesh);
        return { mesh, tx: mesh.position.x, tz: mesh.position.z, timer: Math.random() * 4 };
      });
    }
  }

  // ctx: { playerPos, fear, monsters, creatures, world, addCalm, toast, audio }
  update(dt, ctx) {
    this.refreshMeshes();
    const t = performance.now() / 1000;

    // follower
    const active = this.ownedActive();
    if (this.followMesh && active) {
      const m = this.followMesh;
      const lvl = active.level || 1;
      // evolution: the pet grows as it levels, and gains a glow at level 5+
      m.scale.setScalar(1 + (lvl - 1) * 0.035);
      if (lvl >= 5 && !m.userData.evoGlow) {
        const glow = glowSprite(0xfff0b0, 1.4, 0.5);
        glow.position.y = 0.5;
        m.add(glow);
        m.userData.evoGlow = glow;
      }
      if (m.userData.evoGlow) {
        m.userData.evoGlow.visible = lvl >= 5;
        m.userData.evoGlow.material.color.setHex(lvl >= PET_MAX_LEVEL ? 0xb0e0ff : 0xfff0b0);
      }
      const targetX = ctx.playerPos.x + Math.sin(t * 0.4) * 0.3 - 1.0;
      const targetZ = ctx.playerPos.z + Math.cos(t * 0.4) * 0.3 + 0.8;
      m.position.x += (targetX - m.position.x) * Math.min(1, dt * 3.5);
      m.position.z += (targetZ - m.position.z) * Math.min(1, dt * 3.5);
      const fly = active.type === 'moth' || active.type === 'crow' || active.type === 'watcher' || active.type === 'sprite';
      m.position.y = ctx.playerPos.y + (fly ? 1.1 + Math.sin(t * 3) * 0.15 : 0) + (fly ? 0 : Math.abs(Math.sin(t * 6)) * 0.06);
      m.rotation.y = Math.atan2(ctx.playerPos.x - m.position.x, ctx.playerPos.z - m.position.z);
      if (m.userData.wings) for (const w of m.userData.wings) w.rotation.z = Math.sin(t * 14) * 0.6;

      // --- abilities ---
      State.flags.watcherBoost = active.type === 'watcher';
      // every pet helps your coins a little more as it levels; the crow most of all
      this.coinBonus = (active.type === 'crow' ? 1.25 : 1) + (lvl - 1) * 0.03;
      // beetle: light that matters more the darker it gets (brighter with level)
      this.light.position.copy(m.position).y += 0.5;
      this.light.intensity = active.type === 'beetle' ? (4 + ctx.fear * 14) * (1 + (lvl - 1) * 0.08) : 0;
      // cat: warning hiss
      this._abilityTimers.warn -= dt;
      if (active.type === 'cat' && this._abilityTimers.warn <= 0) {
        const threat = Math.min(ctx.monsters.nearestDist, ctx.creatures.nearestDist);
        if (threat < 30) {
          this._abilityTimers.warn = Math.max(6, 12 - lvl * 0.5);
          ctx.toast('🐈‍⬛ Your cat hisses at the dark. Something is close.');
          ctx.audio.whisperNow && ctx.audio.whisperNow();
        }
      }
      // sprite: treasure ping
      this._abilityTimers.sprite -= dt;
      if (active.type === 'sprite' && this._abilityTimers.sprite <= 0) {
        const dir = ctx.world.nearestTreasureDir(ctx.playerPos, 40);
        if (dir) {
          this._abilityTimers.sprite = Math.max(9, 18 - lvl * 0.7);
          ctx.toast(`🌾 Your sprite chirps — something sparkly to the ${dir}!`);
        }
      }
      // moth: comfort
      this._abilityTimers.moth -= dt;
      if (active.type === 'moth' && this._abilityTimers.moth <= 0 && State.sanity < 30) {
        this._abilityTimers.moth = Math.max(25, 45 - lvl * 2);
        const calm = Math.round(10 + lvl * 1.5);
        ctx.addCalm(calm);
        ctx.toast(`🦋 Your moth settles on your shoulder. (+${calm} calm)`);
      }
      // baby wormling: bites the nearest monster
      this._abilityTimers.worm -= dt;
      if (active.type === 'worm' && this._abilityTimers.worm <= 0) {
        const target = ctx.monsters.list().find((mm) =>
          mm.mesh.position.distanceTo(ctx.playerPos) < 8);
        if (target) {
          this._abilityTimers.worm = Math.max(1.5, 3 - lvl * 0.1);
          ctx.monsters.hit(target, 1 + Math.floor(lvl / 4));
        }
      }
      // strawlem: recharging shield
      this._abilityTimers.shield -= dt;
      if (active.type === 'strawlem' && this._abilityTimers.shield <= 0 && !State.flags.petShield) {
        State.flags.petShield = true;
      }
    } else {
      this.light.intensity = 0;
      State.flags.watcherBoost = false;
      this.coinBonus = 1;
    }

    // yard pets amble around
    for (const yp of this.yardMeshes) {
      yp.timer -= dt;
      if (yp.timer <= 0) {
        yp.timer = 3 + Math.random() * 5;
        yp.tx = -6 + Math.random() * 12;
        yp.tz = 6 + Math.random() * 7;
      }
      yp.mesh.position.x += (yp.tx - yp.mesh.position.x) * Math.min(1, dt * 0.8);
      yp.mesh.position.z += (yp.tz - yp.mesh.position.z) * Math.min(1, dt * 0.8);
      yp.mesh.rotation.y = Math.atan2(yp.tx - yp.mesh.position.x, yp.tz - yp.mesh.position.z) || yp.mesh.rotation.y;
    }
  }

  // strawlem absorbs a hit: returns true if the shield ate it
  tryShield() {
    const active = this.ownedActive();
    if (active && active.type === 'strawlem' && State.flags.petShield) {
      State.flags.petShield = false;
      this._abilityTimers.shield = Math.max(30, 60 - (active.level || 1) * 3);   // recharges faster with level
      return true;
    }
    return false;
  }
}
