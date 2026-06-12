// borrower.js — THE BORROWER. It doesn't hurt you. It robs you.
// A knee-high burlap thing that smells unbanked loot, sprints at you,
// snatches a cut of your pending coins, and BOLTS. Your light makes it
// drop everything — and if it escapes, it stashes the coins under a
// little beacon instead of keeping them (nothing is ever lost forever;
// same rule as the lost bag).

import * as THREE from 'three';
import { State, bus } from './state.js';

const CHASE_SPEED = 6.5;   // faster than you — the steal usually lands
const FLEE_SPEED = 5.2;    // faster than walking; shoot it or ride it down
const GIVE_UP_D = 75;      // escapes (and stashes) at this distance
const FLEE_TIME = 26;

export class Borrower {
  constructor(scene) {
    const g = new THREE.Group();
    const burlap = new THREE.MeshLambertMaterial({ color: 0x6a5a3c });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 9, 8), burlap);
    body.scale.y = 1.25;
    body.position.y = 0.55;
    g.add(body);
    // long little arms
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.9, 6), burlap);
      arm.position.set(s * 0.42, 0.55, 0.1);
      arm.rotation.z = s * 0.7;
      g.add(arm);
    }
    // stitched-on eyes, a bit too far apart
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, fog: false });
    for (const s of [-0.18, 0.18]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), eyeMat);
      eye.position.set(s, 0.92, 0.32);
      g.add(eye);
    }
    // the loot sack it carries — glows once it's carrying YOUR coins
    this.sackMat = new THREE.MeshLambertMaterial({ color: 0x4a3a26, emissive: 0x000000 });
    const sack = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 7), this.sackMat);
    sack.position.set(0, 0.8, -0.4);
    g.add(sack);
    g.visible = false;
    scene.add(g);
    this.mesh = g;

    // the stash beacon (visible whenever State.borrowerStash exists)
    this.stash = new THREE.Group();
    const pile = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 7),
      new THREE.MeshLambertMaterial({ color: 0xd8b24f, emissive: 0x4a3a10 }));
    pile.scale.y = 0.6;
    pile.position.y = 0.18;
    this.stash.add(pile);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.34, 7, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.13,
        fog: false, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 3.5;
    this.stash.add(beam);
    this.stash.visible = false;
    scene.add(this.stash);

    this.active = false;
    this.state = 'CHASE';
    this.loot = 0;
    this.fleeT = 0;
    this.cooldown = 150;   // grace period after boot
  }

  _despawn() {
    this.active = false;
    this.mesh.visible = false;
    this.sackMat.emissive.setHex(0x000000);
    this.cooldown = 240 + Math.random() * 180;
  }

  // hit by light: drops everything and flees empty — coins return to pending
  hit() {
    if (!this.active) return;
    if (this.loot > 0) {
      State.exp.coins += this.loot;
      bus.emit('borrowerDropped', { coins: this.loot });
      this.loot = 0;
    } else {
      bus.emit('borrowerScared', {});
    }
    this._despawn();
  }

  update(dt, playerPos, safe, pending) {
    // the stash beacon + pickup live here too
    const st = State.borrowerStash;
    this.stash.visible = !!st;
    if (st) {
      this.stash.position.set(st.x, 0, st.z);
      const dx = st.x - playerPos.x, dz = st.z - playerPos.z;
      if (dx * dx + dz * dz < 4) {
        State.exp.coins += st.coins;
        bus.emit('stashReclaimed', { coins: st.coins });
        State.borrowerStash = null;
      }
    }

    if (!this.active) {
      this.cooldown -= dt;
      if (this.cooldown <= 0 && !safe && State.distance > 100 && pending >= 8 &&
          Math.random() < dt * 0.06) {
        const a = Math.random() * Math.PI * 2;
        const d = 20 + Math.random() * 8;
        this.mesh.position.set(playerPos.x + Math.cos(a) * d, 0, playerPos.z + Math.sin(a) * d);
        this.mesh.visible = true;
        this.active = true;
        this.state = 'CHASE';
        this.loot = 0;
        this.fleeT = 0;
        bus.emit('borrowerSpawn', {});
      }
      return;
    }

    if (safe) { this._stashAndRun(playerPos); return; }   // won't enter camps/yard

    const m = this.mesh;
    const dx = playerPos.x - m.position.x, dz = playerPos.z - m.position.z;
    const d = Math.hypot(dx, dz) || 1;
    const t = performance.now() / 1000;
    m.position.y = Math.abs(Math.sin(t * 9)) * 0.14;   // scurrying hop

    if (this.state === 'CHASE') {
      m.rotation.y = Math.atan2(dx, dz);
      m.position.x += (dx / d) * CHASE_SPEED * dt;
      m.position.z += (dz / d) * CHASE_SPEED * dt;
      if (d < 1.5) {
        const stolen = Math.max(1, Math.ceil(State.exp.coins * 0.4));
        if (State.exp.coins > 0) {
          State.exp.coins -= stolen;
          this.loot = stolen;
          this.sackMat.emissive.setHex(0x665510);
          this.state = 'FLEE';
          bus.emit('borrowerSteal', { coins: stolen });
        } else {
          // nothing left to grab — it loses interest
          this._despawn();
        }
      }
      // chase has a shelf life too
      this.fleeT += dt;
      if (this.fleeT > 18) this._despawn();
    } else {
      // FLEE: straight away from you
      m.rotation.y = Math.atan2(-dx, -dz);
      m.position.x -= (dx / d) * FLEE_SPEED * dt;
      m.position.z -= (dz / d) * FLEE_SPEED * dt;
      this.fleeT += dt;
      // riding it down counts as catching it
      if (d < 1.3) { this.hit(); return; }
      if (d > GIVE_UP_D || this.fleeT > FLEE_TIME) this._stashAndRun(playerPos);
    }
  }

  _stashAndRun() {
    if (this.loot > 0) {
      const old = State.borrowerStash;
      State.borrowerStash = {
        x: Math.round(this.mesh.position.x),
        z: Math.round(this.mesh.position.z),
        coins: this.loot + (old ? old.coins : 0),
      };
      bus.emit('borrowerEscaped', { coins: this.loot, stash: State.borrowerStash });
      this.loot = 0;
    }
    this._despawn();
  }
}
