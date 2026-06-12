// camps.js — CAMP KITS: push the bubble of home outward, one risky trip at
// a time. Buy a kit at the stall, carry it deep, and set up a campfire:
// a small safe circle where nothing hunts you and your calm comes back.
// At the fire you can bank pending loot at a 70% rate — cash out early and
// safe, or carry it all the way home for the full Bravery payout.

import * as THREE from 'three';
import { State } from './state.js';
import { glowSprite } from './gfx.js';

export const MAX_CAMPS = 3;
export const CAMP_R = 6;          // the safe-circle radius
export const CAMP_RATE = 0.7;     // banking rate at a campfire

export class Camps {
  constructor(scene) {
    this.pool = [];
    for (let i = 0; i < MAX_CAMPS; i++) {
      const g = new THREE.Group();
      // stone ring
      for (let s = 0; s < 7; s++) {
        const a = (s / 7) * Math.PI * 2;
        const rock = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5),
          new THREE.MeshLambertMaterial({ color: 0x6a6a66 }));
        rock.position.set(Math.cos(a) * 0.55, 0.08, Math.sin(a) * 0.55);
        rock.scale.y = 0.7;
        g.add(rock);
      }
      // crossed logs
      for (const ry of [0.5, 2.1]) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 6),
          new THREE.MeshLambertMaterial({ color: 0x5a4430 }));
        log.rotation.z = Math.PI / 2;
        log.rotation.y = ry;
        log.position.y = 0.16;
        g.add(log);
      }
      // the flame
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.65, 7),
        new THREE.MeshBasicMaterial({ color: 0xffa030, fog: false }));
      flame.position.y = 0.45;
      g.add(flame);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 6),
        new THREE.MeshBasicMaterial({ color: 0xffe9a0, fog: false }));
      inner.position.y = 0.4;
      g.add(inner);
      const light = new THREE.PointLight(0xffa040, 9, CAMP_R + 5, 2);
      light.position.y = 1.0;
      g.add(light);
      const halo = glowSprite(0xffa040, 3.2, 0.45);
      halo.position.y = 0.7;
      g.add(halo);
      // a little pup tent so it reads as YOURS
      const tentMat = new THREE.MeshLambertMaterial({ color: 0x5a6c60 });
      const tent = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 1.0, 1.2, 3), tentMat);
      tent.rotation.y = Math.PI / 6;
      tent.position.set(1.9, 0.6, -0.6);
      tent.scale.z = 1.5;
      g.add(tent);
      g.visible = false;
      scene.add(g);
      this.pool.push({ group: g, flame, inner, light });
    }
    this._last = '';
  }

  refresh() {
    const key = State.camps.map((c) => c.x + ',' + c.z).join(';');
    if (key === this._last) return;
    this._last = key;
    for (let i = 0; i < MAX_CAMPS; i++) {
      const camp = State.camps[i];
      this.pool[i].group.visible = !!camp;
      if (camp) this.pool[i].group.position.set(camp.x, 0, camp.z);
    }
  }

  // inside any camp's safe circle?
  inCamp(p) {
    for (const c of State.camps) {
      const dx = p.x - c.x, dz = p.z - c.z;
      if (dx * dx + dz * dz < CAMP_R * CAMP_R) return true;
    }
    return false;
  }

  // standing right at a fire? returns the camp index or -1
  atFire(p) {
    for (let i = 0; i < State.camps.length; i++) {
      const c = State.camps[i];
      const dx = p.x - c.x, dz = p.z - c.z;
      if (dx * dx + dz * dz < 3.2) return i;
    }
    return -1;
  }

  // a new camp must be away from home and from other camps
  canPlaceAt(p, inYard) {
    if (inYard || State.distance < 60) return false;
    if (State.camps.length >= MAX_CAMPS) return false;
    for (const c of State.camps) {
      if (Math.hypot(p.x - c.x, p.z - c.z) < 30) return false;
    }
    return true;
  }

  update(dt, t) {
    this.refresh();
    for (const p of this.pool) {
      if (!p.group.visible) continue;
      const f = 1 + Math.sin(t * 11 + p.group.position.x) * 0.18 + Math.sin(t * 23) * 0.08;
      p.flame.scale.set(f, 0.85 + f * 0.3, f);
      p.light.intensity = 8 + Math.sin(t * 9 + p.group.position.z) * 2.5;
    }
  }
}
