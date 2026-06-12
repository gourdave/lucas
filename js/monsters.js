// monsters.js — Wormlings: the things that live a meter under the soil.
// Past the 75m mark they surface and come looking. Unlike the hallucinations
// deeper out, these are REAL — which means your light can pop them, and
// popping them pays grain coins.

import * as THREE from 'three';
import { State, bus } from './state.js';

const MAX_ACTIVE = 3;
const SURFACE_AT = 75;     // the 75 mark
const COINS_PER_KILL = 12;
const _v = new THREE.Vector3();

function makeWorm() {
  const g = new THREE.Group();
  const segs = [];
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2e2620, transparent: true });
  for (let i = 0; i < 5; i++) {
    const r = 0.38 - i * 0.05;
    const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), bodyMat);
    seg.position.z = -i * 0.45;
    seg.position.y = 0.35;
    g.add(seg);
    segs.push(seg);
  }
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd9b04e, fog: false, transparent: true });
  for (const ex of [-0.14, 0.14]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), eyeMat);
    eye.position.set(ex, 0.55, 0.25);
    g.add(eye);
  }
  g.userData = { segs, mats: [bodyMat, eyeMat] };
  return g;
}

export class Monsters {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    for (let i = 0; i < MAX_ACTIVE; i++) {
      const mesh = makeWorm();
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({
        mesh, active: false, hp: 2, state: 'HUNT',
        timer: 0, flash: 0, sink: 0,
      });
    }
    this.spawnTimer = 0;
    this.biteCooldown = 0;
    this.nearestDist = Infinity;
  }

  list() { return this.pool.filter((m) => m.active && m.state !== 'DIE'); }

  _spawn(playerPos) {
    const m = this.pool.find((p) => !p.active);
    if (!m) return;
    const a = Math.random() * Math.PI * 2;
    const d = 18 + Math.random() * 22;
    const x = playerPos.x + Math.cos(a) * d;
    const z = playerPos.z + Math.sin(a) * d;
    if (Math.hypot(x, z) < SURFACE_AT - 10) return;
    m.active = true;
    m.hp = 2;
    m.state = 'HUNT';
    m.sink = 1;                       // rises out of the soil
    m.mesh.position.set(x, -0.9, z);
    m.mesh.visible = true;
  }

  hit(m, dmg) {
    m.hp -= dmg;
    m.flash = 0.15;
    if (m.hp <= 0) {
      m.state = 'DIE';
      m.timer = 0.5;
      State.kills++;
      // coins go to the expedition's pending loot (main routes them)
      bus.emit('monsterKilled', { coins: COINS_PER_KILL });
    } else {
      // knocked back a step
      _v.subVectors(m.mesh.position, this._playerRef).setY(0).normalize();
      m.mesh.position.addScaledVector(_v, 1.2);
    }
  }

  update(dt, playerPos, inYard) {
    this._playerRef = playerPos;
    this.spawnTimer -= dt;
    this.biteCooldown -= dt;
    this.nearestDist = Infinity;

    const zone = State.distance > SURFACE_AT && !inYard;
    const cap = State.distance > 150 ? 3 : 2;
    if (zone && this.spawnTimer <= 0 && this.list().length < cap) {
      this.spawnTimer = 3;
      if (Math.random() < 0.5) this._spawn(playerPos);
    }

    const t = performance.now() / 1000;
    for (const m of this.pool) {
      if (!m.active) continue;
      const mesh = m.mesh;
      _v.subVectors(playerPos, mesh.position);
      _v.y = 0;
      const dist = _v.length();
      if (m.state !== 'DIE') this.nearestDist = Math.min(this.nearestDist, dist);

      // rise from / sink into the ground
      if (m.sink > 0 && m.state !== 'BURROW') {
        m.sink = Math.max(0, m.sink - dt * 1.2);
        mesh.position.y = -0.9 * m.sink;
      }

      // player made it back toward safety — burrow away
      if ((State.distance < SURFACE_AT - 10 || inYard) && m.state === 'HUNT') {
        m.state = 'BURROW';
      }

      switch (m.state) {
        case 'HUNT': {
          mesh.rotation.y = Math.atan2(_v.x, _v.z);
          if (dist > 1.5) {
            _v.normalize();
            mesh.position.addScaledVector(_v, dt * 2.3);
          } else if (this.biteCooldown <= 0) {
            this.biteCooldown = 5;
            bus.emit('monsterBite', {});
            m.state = 'RETREAT';
            m.timer = 1.6;
          }
          // wiggle
          mesh.userData.segs.forEach((seg, i) => {
            seg.position.y = 0.35 + Math.sin(t * 7 + i * 1.1) * 0.1;
            seg.position.x = Math.sin(t * 5 + i * 0.9) * 0.08;
          });
          break;
        }
        case 'RETREAT': {
          m.timer -= dt;
          _v.normalize();
          mesh.position.addScaledVector(_v, -dt * 3.2);
          if (m.timer <= 0) m.state = 'HUNT';
          break;
        }
        case 'BURROW': {
          mesh.position.y -= dt * 1.4;
          if (mesh.position.y < -1.2) { m.active = false; mesh.visible = false; }
          break;
        }
        case 'DIE': {
          m.timer -= dt;
          mesh.scale.multiplyScalar(Math.max(0.01, 1 - dt * 4));
          mesh.rotation.y += dt * 9;
          if (m.timer <= 0) {
            m.active = false;
            mesh.visible = false;
            mesh.scale.set(1, 1, 1);
          }
          break;
        }
      }

      // white-hot flash when shot
      if (m.flash > 0) {
        m.flash -= dt;
        mesh.userData.mats[0].emissive.setScalar(m.flash > 0 ? 0.9 : 0);
      }
    }
  }
}
