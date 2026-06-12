// creatures.js — the hallucinations. Two kinds:
//   Shade: a too-tall pitch-black figure that stands in the wheat
//   Grin:  no body at all, just eyes and a smile glowing through the fog
// They only exist far from the house. They hate being looked at directly.
// They are never near the house, and they can never really hurt you — the
// worst they do is knock the calm out of you.

import * as THREE from 'three';
import { State, bus } from './state.js';

const MAX_ACTIVE = 3;
const _v = new THREE.Vector3();
const _camDir = new THREE.Vector3();

function makeShade() {
  const g = new THREE.Group();
  const black = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 1 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.7, 0.4), black);
  body.position.y = 1.35;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), black);
  head.position.y = 2.85;
  g.add(head);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.5, 0.14), black);
  armL.position.set(-0.38, 1.7, 0); armL.rotation.z = 0.12;
  g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.38; armR.rotation.z = -0.12;
  g.add(armR);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xe8e6d8, fog: false, transparent: true, opacity: 0.85 });
  for (const ex of [-0.08, 0.08]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), eyeMat);
    eye.position.set(ex, 2.88, 0.2);
    g.add(eye);
  }
  g.userData.mats = [black, eyeMat];
  return g;
}

function makeGrin() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xf3f0dc, fog: false, transparent: true, opacity: 0.9 });
  for (const ex of [-0.45, 0.45]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), mat);
    eye.position.set(ex, 0.55, 0);
    g.add(eye);
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 8) * Math.PI;                        // a crescent of teeth
    const tooth = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), mat);
    tooth.position.set(Math.cos(a) * 0.75, -Math.sin(a) * 0.45, 0);
    g.add(tooth);
  }
  g.userData.mats = [mat];
  return g;
}

export class Creatures {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    for (let i = 0; i < MAX_ACTIVE; i++) {
      const mesh = i % 2 === 0 ? makeShade() : makeGrin();
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({
        mesh,
        kind: i % 2 === 0 ? 'shade' : 'grin',
        active: false,
        state: 'LURK',
        timer: 0,
        stare: 0,
        fade: 1,
        target: new THREE.Vector3(),
      });
    }
    this.spawnTimer = 0;
    this.attackCooldown = 0;
    this.nearestDist = Infinity;
  }

  _setOpacity(c, o) {
    for (const m of c.mesh.userData.mats) m.opacity = o * (m.fog === false ? 0.9 : 1);
  }

  _spawn(playerPos, yaw) {
    const c = this.pool.find(p => !p.active);
    if (!c) return;
    // appear in the player's rear half-circle, just past the fog line
    const a = yaw + Math.PI + (Math.random() - 0.5) * Math.PI;
    const dist = 35 + Math.random() * 20;
    const x = playerPos.x - Math.sin(a) * dist;
    const z = playerPos.z - Math.cos(a) * dist;
    if (Math.hypot(x, z) < 40) return;     // never anywhere near home
    c.active = true;
    c.state = 'LURK';
    c.timer = 5 + Math.random() * 7;
    c.stare = 0;
    c.fade = 0;
    c.mesh.position.set(x, c.kind === 'grin' ? 2.0 : 0, z);
    c.mesh.visible = true;
  }

  _despawn(c) {
    c.state = 'FLEE';
  }

  update(dt, playerPos, camera, fear, inYard, playerStill) {
    this.spawnTimer -= dt;
    this.attackCooldown -= dt;
    this.nearestDist = Infinity;

    const wantSpawn = fear > 0.45 && !inYard;
    const cap = fear > 0.8 ? 3 : 1;
    const activeCount = this.pool.filter(p => p.active).length;
    if (wantSpawn && activeCount < cap && this.spawnTimer <= 0) {
      this.spawnTimer = 2;
      if (Math.random() < 0.55) this._spawn(playerPos, camera.rotation.y);
    }

    camera.getWorldDirection(_camDir);

    for (const c of this.pool) {
      if (!c.active) continue;
      const m = c.mesh;
      _v.subVectors(playerPos, m.position);
      _v.y = 0;
      const dist = _v.length();
      this.nearestDist = Math.min(this.nearestDist, dist);

      // everything calms down near home
      if ((inYard || fear < 0.3) && c.state !== 'FLEE') this._despawn(c);

      // face the player (only rotate around Y)
      m.rotation.y = Math.atan2(_v.x, _v.z);

      switch (c.state) {
        case 'LURK': {
          c.fade = Math.min(1, c.fade + dt * 0.7);
          c.timer -= dt;
          // it does not like being looked at
          _v.normalize();
          const toward = _v.clone().negate();
          const seen = _camDir.dot(toward.set((m.position.x - playerPos.x), 0, (m.position.z - playerPos.z)).normalize()) > 0.965;
          c.stare = seen ? c.stare + dt : 0;
          if (c.stare > 1.5) {
            // sidestep into the fog when stared at
            const perp = Math.random() < 0.5 ? 1 : -1;
            c.target.set(
              m.position.x + (-(playerPos.z - m.position.z)) / dist * 12 * perp,
              m.position.y,
              m.position.z + ((playerPos.x - m.position.x)) / dist * 12 * perp);
            c.state = 'SIDESTEP';
            c.timer = 2;
            c.stare = 0;
          } else if (c.timer <= 0) {
            c.state = 'STALK';
          }
          break;
        }
        case 'SIDESTEP': {
          c.timer -= dt;
          m.position.lerp(c.target, Math.min(1, dt * 2.2));
          if (c.timer <= 0) c.state = 'LURK', c.timer = 4 + Math.random() * 6;
          break;
        }
        case 'STALK': {
          // drift to stay ~22m behind you
          if (dist > 24) {
            _v.normalize();
            m.position.addScaledVector(_v, dt * 3.6);
          }
          const mayCharge = this.attackCooldown <= 0 && (State.sanity < 40 || playerStill > 8);
          if (mayCharge && dist < 34) c.state = 'CHARGE';
          break;
        }
        case 'CHARGE': {
          _v.normalize();
          m.position.addScaledVector(_v, dt * 6.6);
          if (dist < 2.1) {
            bus.emit('creatureAttack', { kind: c.kind });
            this.attackCooldown = 12;
            c.state = 'FLEE';
          }
          break;
        }
        case 'FLEE': {
          c.fade -= dt * 1.4;
          if (c.fade <= 0) {
            c.active = false;
            m.visible = false;
          }
          break;
        }
      }
      this._setOpacity(c, Math.max(0, Math.min(1, c.fade)));

      // grins bob gently
      if (c.kind === 'grin') m.position.y = 2.0 + Math.sin(performance.now() / 600 + m.position.x) * 0.15;
    }
  }
}
