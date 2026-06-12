// boss.js — Phase F: THE HARVESTER and Harvest Night.
//
// The Harvester: a four-meter scarecrow-thing with a lantern head that guards
// a barn out past the 300m mark. Real, shootable, scary-but-fair. Beating it
// pays huge banked-pending loot — and it comes back the next day.
//
// Harvest Night: now and then the sky goes red and the soil boils — monsters
// swarm for 90 seconds and every coin is worth triple. Survive it for a badge.

import * as THREE from 'three';
import { State, bus, todayStr } from './state.js';
import { glowSprite } from './gfx.js';

export const BARN_POS = { x: 0, z: -340 };  // follow the power lines north!
const BOSS_HP = 30;

export class Boss {
  constructor(scene) {
    this.scene = scene;
    this._buildBarn();
    this._buildHarvester();
    this.active = false;
    this.hp = BOSS_HP;
    this.phaseTimer = 0;
    this.summonTimer = 0;
    this.attackCooldown = 0;
  }

  _buildBarn() {
    const g = new THREE.Group();
    const barnRed = new THREE.MeshLambertMaterial({ color: 0x6e3030 });
    const trim = new THREE.MeshLambertMaterial({ color: 0xd8d2c0 });
    const wall = (w, h, d, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), barnRed);
      m.position.set(x, y, z);
      g.add(m);
    };
    wall(10, 5, 0.4, 0, 2.5, -5);          // back
    wall(4.2, 5, 0.4, -2.9, 2.5, 5);       // front, with a big door gap
    wall(4.2, 5, 0.4, 2.9, 2.5, 5);
    wall(10, 1.6, 0.4, 0, 5.6, 5);
    wall(0.4, 5, 10, -5, 2.5, 0);
    wall(0.4, 5, 10, 5, 2.5, 0);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(11, 0.3, 6.4),
      new THREE.MeshLambertMaterial({ color: 0x3a3e44 }));
    roof.position.set(0, 7.2, -2.6);
    roof.rotation.x = 0.5;
    g.add(roof);
    const roof2 = roof.clone();
    roof2.position.z = 2.6;
    roof2.rotation.x = -0.5;
    g.add(roof2);
    const doorTrim = new THREE.Mesh(new THREE.BoxGeometry(1.7, 4.6, 0.2), trim);
    doorTrim.position.set(0, 2.4, 5.05);
    g.add(doorTrim);
    doorTrim.visible = false;
    // a sickly lantern glow spilling from the door
    const glow = new THREE.PointLight(0xff8830, 20, 18, 2);
    glow.position.set(0, 3, 6);
    g.add(glow);
    g.position.set(BARN_POS.x, 0, BARN_POS.z);
    this.scene.add(g);
    this.barn = g;
  }

  _buildHarvester() {
    const g = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: 0x1c1812 });
    const straw = new THREE.MeshLambertMaterial({ color: 0x8a6f3a });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 3.2, 6), dark);
    pole.position.y = 1.6;
    g.add(pole);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 0.8), straw);
    body.position.y = 2.6;
    g.add(body);
    const arms = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.22, 0.22), dark);
    arms.position.y = 3.2;
    g.add(arms);
    // the lantern head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.7),
      new THREE.MeshLambertMaterial({ color: 0x2a2018, emissive: 0xff7720, emissiveIntensity: 0.5 }));
    head.position.y = 4.0;
    g.add(head);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffb050, fog: false });
    for (const ex of [-0.16, 0.16]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), eyeMat);
      eye.position.set(ex, 4.05, 0.36);
      g.add(eye);
    }
    const lightHead = new THREE.PointLight(0xff8830, 10, 12, 2);
    lightHead.position.y = 4.1;
    g.add(lightHead);
    const halo = glowSprite(0xff8830, 3.6, 0.5);
    halo.position.y = 4.05;
    g.add(halo);
    g.position.set(BARN_POS.x, 0, BARN_POS.z + 8);
    g.visible = false;
    this.scene.add(g);
    this.mesh = g;
    this.headLight = lightHead;
  }

  defeatedToday() { return State.flags.bossKilledOn === todayStr(); }

  hit(dmg) {
    if (!this.active) return;
    this.hp -= dmg;
    bus.emit('bossHit', { hp: this.hp, max: BOSS_HP });
    if (this.hp <= 0) {
      this.active = false;
      this.mesh.visible = false;
      State.bossKills++;
      State.flags.bossKilledOn = todayStr();
      bus.emit('bossKilled', {});
    }
  }

  update(dt, playerPos, monsters) {
    const dist = Math.hypot(playerPos.x - BARN_POS.x, playerPos.z - BARN_POS.z);

    // wake up when the player approaches the barn (once per day)
    if (!this.active && !this.defeatedToday() && dist < 22) {
      this.active = true;
      this.hp = BOSS_HP;
      this.mesh.visible = true;
      this.mesh.position.set(BARN_POS.x, 0, BARN_POS.z + 8);
      bus.emit('bossWake', {});
    }
    if (!this.active) return;

    // flee logic: player ran far away → boss returns to the barn and waits
    if (dist > 60) {
      this.active = false;
      this.mesh.visible = false;
      return;
    }

    const m = this.mesh;
    const dx = playerPos.x - m.position.x, dz = playerPos.z - m.position.z;
    const d = Math.hypot(dx, dz);
    m.rotation.y = Math.atan2(dx, dz);
    // stalks slowly, lurching
    const t = performance.now() / 1000;
    const speed = 1.6 + Math.sin(t * 2.2) * 0.9;
    if (d > 2.6) {
      m.position.x += (dx / d) * speed * dt;
      m.position.z += (dz / d) * speed * dt;
    }
    m.position.y = Math.abs(Math.sin(t * 2.2)) * 0.12;
    this.headLight.intensity = 8 + Math.sin(t * 7) * 4;

    // attacks
    this.attackCooldown -= dt;
    if (d < 3 && this.attackCooldown <= 0) {
      this.attackCooldown = 4;
      bus.emit('bossSwipe', {});
    }
    // summons wormlings
    this.summonTimer -= dt;
    if (this.summonTimer <= 0) {
      this.summonTimer = 9;
      monsters.forceSpawnNear(playerPos);
    }
  }
}

// ---------- Harvest Night ----------
export class HarvestNight {
  constructor() {
    this.active = false;
    this.t = 0;
    this.cooldown = 120; // grace period after starting the game
  }

  update(dt, dist, inYard) {
    if (this.active) {
      this.t -= dt;
      if (this.t <= 0 || inYard) {
        const survived = this.t <= 0 && !inYard;
        this.active = false;
        this.cooldown = 300 + Math.random() * 300;
        bus.emit('harvestNightEnd', { survived });
        if (survived) bus.emit('harvestNightSurvived', {});
      }
      return;
    }
    this.cooldown -= dt;
    // only triggers while you're out in the danger zone
    if (this.cooldown <= 0 && !inYard && dist > 75) {
      if (Math.random() < dt * 0.05) {
        this.active = true;
        this.t = 90;
        bus.emit('harvestNightStart', {});
      }
    }
  }

  coinMult() { return this.active ? 3 : 1; }
}
