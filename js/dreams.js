// dreams.js — sleeping takes you somewhere else. Three little adventures,
// each its own tiny world with its own sky, picked fresh-first then random.

import * as THREE from 'three';
import { State } from './state.js';

const DURATION = 32; // seconds per dream
const MIN_WAKE = 8;  // can't skip before this

function coneStalk(scene, x, y, z, s, color) {
  const m = new THREE.Mesh(
    new THREE.ConeGeometry(0.07 * s, 1.4 * s, 5),
    new THREE.MeshLambertMaterial({ color })
  );
  m.position.set(x, y + 0.7 * s, z);
  scene.add(m);
  return m;
}

const DREAMS = [
  {
    id: 'islands',
    title: 'The Floating Plots',
    reward: { type: 'water', text: 'You wake holding a bottle of almond water. It was in your hand the whole time.' },
    build() {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x3a1f33);
      scene.fog = new THREE.FogExp2(0x3a1f33, 0.018);
      scene.add(new THREE.HemisphereLight(0xffc9e0, 0x40203a, 1.1));
      const islands = [];
      for (let i = 0; i < 12; i++) {
        const g = new THREE.Group();
        const top = new THREE.Mesh(new THREE.BoxGeometry(6, 0.6, 6),
          new THREE.MeshLambertMaterial({ color: 0xcaa84e }));
        g.add(top);
        const under = new THREE.Mesh(new THREE.ConeGeometry(3.4, 3.4, 5),
          new THREE.MeshLambertMaterial({ color: 0x5a3a30 }));
        under.rotation.x = Math.PI;
        under.position.y = -2;
        g.add(under);
        for (let w = 0; w < 10; w++) {
          coneStalk(g, (Math.random() - 0.5) * 5, 0.3, (Math.random() - 0.5) * 5, 0.9, 0xe8cb74);
        }
        g.position.set(Math.sin(i * 1.3) * 9, Math.sin(i * 1.7) * 4, -i * 13);
        g.userData.phase = i;
        scene.add(g);
        islands.push(g);
      }
      const pts = [];
      for (let i = 0; i < 220; i++) {
        pts.push((Math.random() - 0.5) * 80, (Math.random() - 0.5) * 40, -Math.random() * 160);
      }
      const pgeo = new THREE.BufferGeometry();
      pgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
      const sparks = new THREE.Points(pgeo, new THREE.PointsMaterial({
        color: 0xffd9ec, size: 0.25, transparent: true, opacity: 0.8, fog: false }));
      scene.add(sparks);
      this._islands = islands;
      this._sparks = sparks;
      return scene;
    },
    update(t, camera) {
      camera.position.set(Math.sin(t * 0.25) * 3, 2 + Math.sin(t * 0.6) * 0.8, 6 - t * 2.4);
      camera.lookAt(Math.sin(t * 0.2) * 4, 0, camera.position.z - 20);
      for (const g of this._islands) {
        g.position.y = Math.sin(t * 0.5 + g.userData.phase * 1.7) * 4;
        g.rotation.y = t * 0.05 + g.userData.phase;
      }
      this._sparks.rotation.z = t * 0.02;
    },
  },
  {
    id: 'neon',
    title: 'Neon Below',
    reward: { type: 'shield', text: 'A grin of starlight follows you home. The next attack will not hurt you.' },
    build() {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000004);
      scene.add(new THREE.GridHelper(240, 48, 0x00cccc, 0x004044));
      // neon wheat: glowing vertical line segments
      const segs = [];
      const cols = [];
      const c1 = new THREE.Color(0x00e5ff), c2 = new THREE.Color(0xff3df0);
      for (let i = 0; i < 320; i++) {
        const x = (Math.random() - 0.5) * 160, z = -Math.random() * 200 + 20;
        const h = 1 + Math.random() * 1.6;
        segs.push(x, 0, z, x + (Math.random() - 0.5), h, z);
        const c = Math.random() < 0.5 ? c1 : c2;
        cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
      const lgeo = new THREE.BufferGeometry();
      lgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs), 3));
      lgeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3));
      scene.add(new THREE.LineSegments(lgeo, new THREE.LineBasicMaterial({ vertexColors: true })));
      // a giant friendly grin made of stars
      const grin = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: 0xfdfaf0, transparent: true, opacity: 0 });
      this._stars = [];
      const put = (x, y) => {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.8, 6, 6), mat);
        s.position.set(x, y, 0);
        s.userData.home = s.position.clone();
        s.userData.dir = s.position.clone().normalize();
        grin.add(s);
        this._stars.push(s);
      };
      put(-9, 6); put(9, 6);
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * Math.PI;
        put(Math.cos(a) * 13, -Math.sin(a) * 8);
      }
      grin.position.set(0, 30, -90);
      scene.add(grin);
      this._grinMat = mat;
      // star field
      const pts = [];
      for (let i = 0; i < 500; i++) {
        pts.push((Math.random() - 0.5) * 300, Math.random() * 120, -Math.random() * 300 + 40);
      }
      const pgeo = new THREE.BufferGeometry();
      pgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
      scene.add(new THREE.Points(pgeo, new THREE.PointsMaterial({ color: 0x8899ff, size: 0.4 })));
      return scene;
    },
    update(t, camera) {
      camera.position.set(Math.sin(t * 0.18) * 6, 3.2, 10 - t * 1.6);
      camera.lookAt(0, 16, -80);
      const k = t / DURATION;
      this._grinMat.opacity = Math.min(1, t * 0.12);
      if (k > 0.6) {
        const burst = (k - 0.6) / 0.4;
        for (const s of this._stars) {
          s.position.copy(s.userData.home).addScaledVector(s.userData.dir, burst * 40);
        }
        this._grinMat.opacity = Math.max(0, 1 - burst * 1.2);
      }
    },
  },
  {
    id: 'stalk',
    title: 'The Giant Stalk',
    reward: { type: 'lore', text: '“The crop remembers you.” You feel very rested.' },
    build() {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x80591a);
      scene.fog = new THREE.FogExp2(0x80591a, 0.012);
      scene.add(new THREE.HemisphereLight(0xffe8b0, 0x6a4410, 1.2));
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400),
        new THREE.MeshLambertMaterial({ color: 0xb08c3c }));
      ground.rotation.x = -Math.PI / 2;
      scene.add(ground);
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.6, 60, 8),
        new THREE.MeshLambertMaterial({ color: 0xc09a3a }));
      stalk.position.set(0, 30, -10);
      scene.add(stalk);
      this._stalk = stalk;
      // the seed head: a cluster of giant grains
      const grainMat = new THREE.MeshLambertMaterial({ color: 0xe2c060 });
      for (let i = 0; i < 16; i++) {
        const grain = new THREE.Mesh(new THREE.SphereGeometry(1.7, 7, 7), grainMat);
        const a = i * 2.4;
        grain.position.set(Math.cos(a) * 2.2, 58 + (i % 4) * 2.2, -10 + Math.sin(a) * 2.2);
        grain.scale.y = 1.6;
        scene.add(grain);
      }
      // leaves
      for (const [ly, la] of [[12, 0.6], [24, 2.7], [38, 1.5]]) {
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 9),
          new THREE.MeshLambertMaterial({ color: 0xa8902e }));
        leaf.position.set(Math.cos(la) * 4.5, ly, -10 + Math.sin(la) * 4.5);
        leaf.rotation.y = -la;
        leaf.rotation.x = 0.5;
        scene.add(leaf);
      }
      // a little red friend, climbing
      this._bug = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8),
        new THREE.MeshLambertMaterial({ color: 0xc23a2a }));
      scene.add(this._bug);
      // normal-size wheat at the base for scale
      for (let i = 0; i < 60; i++) {
        const a = Math.random() * Math.PI * 2, d = 4 + Math.random() * 26;
        coneStalk(scene, Math.cos(a) * d, 0, -10 + Math.sin(a) * d, 1.1, 0xd4b258);
      }
      return scene;
    },
    update(t, camera) {
      const sway = Math.sin(t * 0.5) * 0.02;
      this._stalk.rotation.z = sway;
      const by = 2 + t * 1.6;
      const ba = by * 0.7;
      this._bug.position.set(Math.cos(ba) * 1.5, by, -10 + Math.sin(ba) * 1.5);
      camera.position.set(7 + Math.sin(t * 0.1) * 2, 2.2 + t * 1.2, 2);
      camera.lookAt(0, Math.min(by + 4, 58), -10);
    },
  },
];

export class Dreams {
  constructor() {
    this.active = false;
    this.current = null;
    this.t = 0;
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 500);
    this._wake = false;
  }

  begin() {
    const seen = State.dreamLog.map(d => d.id);
    const fresh = DREAMS.filter(d => !seen.includes(d.id));
    const pick = (fresh.length ? fresh : DREAMS)[Math.floor(Math.random() * (fresh.length ? fresh.length : DREAMS.length))];
    this.current = pick;
    this.scene = pick.build();
    this.t = 0;
    this.active = true;
    this._wake = false;
    return pick;
  }

  requestWake() {
    if (this.t > MIN_WAKE) this._wake = true;
  }

  // returns false when the dream is over
  update(dt) {
    if (!this.active) return false;
    this.t += dt;
    this.current.update(this.t, this.camera);
    if (this.t >= DURATION || this._wake) {
      this.active = false;
      return false;
    }
    return true;
  }
}
