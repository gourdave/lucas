// listener.js — Phase I: THE LISTENER. The fields' first entity with a RULE
// you can learn (the Doors trick: one creature, one rule, fair every time):
//
//     it only moves when YOU move. Freeze, and it freezes.
//     Hold still long enough and it loses you and sinks away.
//
// It cannot be outrun on foot and light passes straight through it.
// Stillness is the only answer. (Caught = a big calm hit, never a death.)

import * as THREE from 'three';
import { State, bus } from './state.js';

const HUNT_TIME = 22;     // it gives up after this many seconds regardless
const LOSE_AFTER = 4;     // seconds of stillness before it loses you
const SPEED = 5.4;        // faster than walking (4.2) — you can't just run
const CATCH_D2 = 2.6;

export class Listener {
  constructor(scene) {
    const g = new THREE.Group();
    // a tall, too-thin silhouette...
    const dark = new THREE.MeshLambertMaterial({ color: 0x05060a });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.5, 3.4, 7), dark);
    body.position.y = 1.7;
    g.add(body);
    // ...whose whole face is one pale listening ring
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xe8e2d0, fog: false, transparent: true, opacity: 0.9 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 18), this.ringMat);
    ring.position.y = 3.1;
    g.add(ring);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), this.ringMat);
    dot.position.y = 3.1;
    g.add(dot);
    this.ring = ring;
    g.visible = false;
    scene.add(g);
    this.mesh = g;

    this.active = false;
    this.huntT = 0;
    this.stillT = 0;
    this.cooldown = 90;    // grace period after starting the game
  }

  _despawn(lost) {
    this.active = false;
    this.mesh.visible = false;
    this.cooldown = 100 + Math.random() * 120;
    if (lost) {
      State.listenersSurvived++;
      bus.emit('listenerLost', {});
    }
  }

  // moving = is the PLAYER moving this frame (looking around is free)
  update(dt, playerPos, moving, fear, inYard) {
    if (!this.active) {
      this.cooldown -= dt;
      if (this.cooldown <= 0 && !inYard && fear > 0.55 && State.distance > 120 &&
          Math.random() < dt * 0.05) {
        // it rises from the wheat a little way off, in front-ish of nowhere
        const a = Math.random() * Math.PI * 2;
        const d = 26 + Math.random() * 10;
        this.mesh.position.set(playerPos.x + Math.cos(a) * d, 0, playerPos.z + Math.sin(a) * d);
        this.mesh.visible = true;
        this.active = true;
        this.huntT = 0;
        this.stillT = 0;
        bus.emit('listenerSpawn', {});
      }
      return;
    }

    // safe at home: it will not cross the fence line
    if (inYard) { this._despawn(false); return; }

    this.huntT += dt;
    const m = this.mesh;
    const dx = playerPos.x - m.position.x, dz = playerPos.z - m.position.z;
    const d2 = dx * dx + dz * dz;
    m.rotation.y = Math.atan2(dx, dz);   // the ring always faces you

    if (moving) {
      this.stillT = 0;
      const d = Math.sqrt(d2) || 1;
      m.position.x += (dx / d) * SPEED * dt;
      m.position.z += (dz / d) * SPEED * dt;
      this.ringMat.opacity = 0.95;       // it flares while it hears you
      this.ring.scale.setScalar(1 + Math.sin(this.huntT * 14) * 0.12);
    } else {
      this.stillT += dt;
      this.ringMat.opacity = 0.45;       // straining to hear... nothing
      this.ring.scale.setScalar(1 + Math.sin(this.huntT * 2) * 0.03);
      if (this.stillT >= LOSE_AFTER) { this._despawn(true); return; }
    }

    if (d2 < CATCH_D2) {
      this._despawn(false);
      bus.emit('listenerCatch', {});
      return;
    }
    if (this.huntT >= HUNT_TIME) this._despawn(true);
  }
}
