// scarecrow.js — THE SCARECROW THAT WASN'T THERE. The Listener's opposite:
//
//     it only moves when you're NOT looking at it.
//     stare it down — three full seconds — and it sulks back into the soil.
//
// Every glance away, it's closer. Every photo of your shoes, closer. It is
// extremely fast and extremely embarrassed about it. (Caught = a calm hit,
// never a death. The rule goes in the journal like the others.)

import * as THREE from 'three';
import { State, bus } from './state.js';
import { inView } from './mysteries.js';

const SPEED = 8.5;        // terrifying — but only ever moves unseen
const STARE_WIN = 3;      // seconds of being watched before it gives up
const HUNT_TIME = 32;
const CATCH_D2 = 3.2;

export class Scarecrow {
  constructor(scene) {
    const g = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ color: 0x4a3a26 });
    const straw = new THREE.MeshLambertMaterial({ color: 0x9a7c46 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.4, 6), wood);
    pole.position.y = 1.2;
    g.add(pole);
    const arms = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.12), wood);
    arms.position.y = 1.85;
    g.add(arms);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 1.1, 7), straw);
    body.position.y = 1.45;
    g.add(body);
    // the sack head, with a grin it shouldn't have
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 9, 8),
      new THREE.MeshLambertMaterial({ color: 0xb8a06a }));
    head.position.y = 2.3;
    head.scale.y = 1.15;
    g.add(head);
    const stitchMat = new THREE.MeshBasicMaterial({ color: 0x2a1c10 });
    for (let j = 0; j <= 6; j++) {
      const a = (j / 6) * Math.PI;
      const tooth = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 5), stitchMat);
      tooth.position.set(Math.cos(a) * 0.16, 2.24 - Math.sin(a) * 0.07, 0.22);
      g.add(tooth);
    }
    for (const ex of [-0.1, 0.1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 5, 5), stitchMat);
      eye.position.set(ex, 2.4, 0.23);
      g.add(eye);
    }
    g.visible = false;
    scene.add(g);
    this.mesh = g;

    this.active = false;
    this.stareT = 0;
    this.huntT = 0;
    this.cooldown = 120;
  }

  _despawn(stared) {
    this.active = false;
    this.mesh.visible = false;
    this.mesh.scale.set(1, 1, 1);
    this.cooldown = 140 + Math.random() * 160;
    if (stared) {
      State.scarecrowsStared++;
      bus.emit('scarecrowStared', {});
    }
  }

  update(dt, playerPos, camera, fear, safe) {
    if (!this.active) {
      this.cooldown -= dt;
      if (this.cooldown <= 0 && !safe && fear > 0.5 && State.distance > 130 &&
          Math.random() < dt * 0.045) {
        const a = Math.random() * Math.PI * 2;
        const d = 28 + Math.random() * 8;
        this.mesh.position.set(playerPos.x + Math.cos(a) * d, 0, playerPos.z + Math.sin(a) * d);
        this.mesh.visible = true;
        this.active = true;
        this.stareT = 0;
        this.huntT = 0;
        bus.emit('scarecrowSpawn', {});
      }
      return;
    }
    if (safe) { this._despawn(false); return; }

    this.huntT += dt;
    const m = this.mesh;
    const dx = playerPos.x - m.position.x, dz = playerPos.z - m.position.z;
    const d2 = dx * dx + dz * dz;
    m.rotation.y = Math.atan2(dx, dz);   // it is ALWAYS facing you. always.

    const watched = inView(camera, { x: m.position.x, y: 2, z: m.position.z }, 65, 0.62);
    if (watched) {
      // frozen mid-stride. if you hold the stare up close, it loses
      if (d2 < 28 * 28) {
        this.stareT += dt;
        if (this.stareT >= STARE_WIN) {
          // it sinks into the soil, deeply embarrassed
          this._despawn(true);
          return;
        }
      }
    } else {
      this.stareT = Math.max(0, this.stareT - dt * 2);
      const d = Math.sqrt(d2) || 1;
      m.position.x += (dx / d) * SPEED * dt;
      m.position.z += (dz / d) * SPEED * dt;
    }

    if (d2 < CATCH_D2) {
      this._despawn(false);
      bus.emit('scarecrowCatch', {});
      return;
    }
    if (this.huntT >= HUNT_TIME) this._despawn(false);
  }
}
