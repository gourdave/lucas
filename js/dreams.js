// dreams.js — Phase H: dreams are little ADVENTURES you actually play.
// Each dream is a tiny minigame with its own world, goal, and HUD line.
// You can still wake early (E / the prompt) after MIN_WAKE seconds, and you
// ALWAYS wake up safe — doing well just makes the stardust shower bigger.

import * as THREE from 'three';
import { State } from './state.js';

const MIN_WAKE = 6;   // can't skip before this (so the goal toast gets read)

function coneStalk(scene, x, y, z, s, color) {
  const m = new THREE.Mesh(
    new THREE.ConeGeometry(0.07 * s, 1.4 * s, 5),
    new THREE.MeshLambertMaterial({ color })
  );
  m.position.set(x, y + 0.7 * s, z);
  scene.add(m);
  return m;
}

// move a point on the XZ plane the same way the waking world does:
// joystick/WASD relative to where you're looking
function moveXZ(p, ctx, dt, speed) {
  const s = Math.sin(ctx.yaw), c = Math.cos(ctx.yaw);
  p.x += (-s * ctx.move.y + c * ctx.move.x) * speed * dt;
  p.z += (-c * ctx.move.y - s * ctx.move.x) * speed * dt;
}

// first-person camera at a position, aimed by the player's look controls
function lookCam(ctx, x, y, z) {
  ctx.camera.position.set(x, y, z);
  ctx.camera.rotation.set(ctx.pitch, ctx.yaw, 0);
}

export const DREAMS = [
  {
    id: 'islands',
    title: 'The Floating Plots',
    goal: '🌾 Walk the floating islands and gather 5 GOLDEN BUNDLES. The void is soft — if you fall, it puts you back.',
    duration: 45,
    reward: { type: 'water', text: 'You wake holding a bottle of almond water. It was in your hand the whole time.' },
    build() {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x3a1f33);
      scene.fog = new THREE.FogExp2(0x3a1f33, 0.016);
      scene.add(new THREE.HemisphereLight(0xffc9e0, 0x40203a, 1.1));
      this._islands = [];
      for (let i = 0; i < 9; i++) {
        const g = new THREE.Group();
        const top = new THREE.Mesh(new THREE.BoxGeometry(8, 0.6, 8),
          new THREE.MeshLambertMaterial({ color: 0xcaa84e }));
        g.add(top);
        const under = new THREE.Mesh(new THREE.ConeGeometry(4.4, 3.6, 5),
          new THREE.MeshLambertMaterial({ color: 0x5a3a30 }));
        under.rotation.x = Math.PI;
        under.position.y = -2.1;
        g.add(under);
        for (let w = 0; w < 10; w++) {
          coneStalk(g, (Math.random() - 0.5) * 6, 0.3, (Math.random() - 0.5) * 6, 0.9, 0xe8cb74);
        }
        g.position.set(Math.sin(i * 1.1) * 7, Math.sin(i * 1.7) * 1.5, -i * 9.5);
        g.userData.phase = i;
        g.userData.baseY = g.position.y;
        scene.add(g);
        this._islands.push(g);
      }
      // the prize: golden bundles, one each on five of the islands
      this._bundles = [];
      for (const idx of [2, 4, 5, 7, 8]) {
        const b = new THREE.Group();
        for (let k = 0; k < 4; k++) {
          const st = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.6, 5),
            new THREE.MeshBasicMaterial({ color: 0xffe27a, fog: false }));
          st.position.set(Math.cos(k * 1.6) * 0.22, 0.8, Math.sin(k * 1.6) * 0.22);
          b.add(st);
        }
        const glow = new THREE.PointLight(0xffd96a, 5, 7, 2);
        glow.position.y = 1;
        b.add(glow);
        b.userData.island = idx;
        scene.add(b);
        this._bundles.push(b);
      }
      // pink dream-dust
      const pts = [];
      for (let i = 0; i < 220; i++) {
        pts.push((Math.random() - 0.5) * 80, (Math.random() - 0.5) * 40, -Math.random() * 110 + 10);
      }
      const pgeo = new THREE.BufferGeometry();
      pgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
      this._sparks = new THREE.Points(pgeo, new THREE.PointsMaterial({
        color: 0xffd9ec, size: 0.25, transparent: true, opacity: 0.8, fog: false }));
      scene.add(this._sparks);
      // player state
      this._p = new THREE.Vector3(0, 1.0, 0);
      this._vy = 0;
      this._score = 0;
      return scene;
    },
    update(dt, t, ctx) {
      // islands bob gently
      for (const g of this._islands) {
        g.position.y = g.userData.baseY + Math.sin(t * 0.5 + g.userData.phase * 1.7) * 1.0;
      }
      this._sparks.rotation.z = t * 0.02;
      // walk (full air control — it's a dream) with floaty parachute gravity
      const p = this._p;
      moveXZ(p, ctx, dt, 6);
      this._vy = Math.max(-3.2, this._vy - 4 * dt);
      p.y += this._vy * dt;
      // land on whichever island is underfoot
      for (const g of this._islands) {
        const lx = p.x - g.position.x, lz = p.z - g.position.z;
        const topY = g.position.y + 0.3;
        if (Math.abs(lx) < 4.2 && Math.abs(lz) < 4.2 && p.y <= topY && p.y > topY - 2.5) {
          p.y = topY;
          this._vy = 0;
        }
      }
      // fell into the void? it catches you and puts you back at the start
      if (p.y < -12) {
        const home = this._islands[0];
        p.set(home.position.x, home.position.y + 5, home.position.z);
        this._vy = -1;
      }
      // bundles ride their islands; grab them by walking close
      for (const b of this._bundles) {
        if (!b.visible) continue;
        const g = this._islands[b.userData.island];
        b.position.set(g.position.x + 1.6, g.position.y + 0.3, g.position.z - 1.2);
        const dx = p.x - b.position.x, dz = p.z - b.position.z;
        if (dx * dx + dz * dz < 2.6 && Math.abs(p.y - b.position.y) < 2.5) {
          b.visible = false;
          this._score++;
          ctx.chime();
        }
      }
      lookCam(ctx, p.x, p.y + 1.6, p.z);
      return this._score >= 5;
    },
    hud() { return `🌾 ${this._score}/5 golden bundles`; },
    result() {
      const win = this._score >= 5;
      return {
        score: this._score, max: 5, success: win,
        text: win ? 'You gathered every golden bundle. The islands hummed approval.'
                  : `You gathered ${this._score} golden bundle${this._score === 1 ? '' : 's'} before morning came.`,
      };
    },
  },
  {
    id: 'neon',
    title: 'Neon Below',
    goal: '⭐ Stars are falling! Stand in the glowing beams to CATCH 10 before the dream ends.',
    duration: 40,
    reward: { type: 'shield', text: 'A grin of starlight follows you home. The next attack will not hurt you.' },
    build() {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000004);
      scene.add(new THREE.GridHelper(240, 48, 0x00cccc, 0x004044));
      scene.add(new THREE.HemisphereLight(0x6688ff, 0x000010, 0.5));
      // neon wheat: glowing vertical line segments
      const segs = [];
      const cols = [];
      const c1 = new THREE.Color(0x00e5ff), c2 = new THREE.Color(0xff3df0);
      for (let i = 0; i < 320; i++) {
        const x = (Math.random() - 0.5) * 160, z = (Math.random() - 0.5) * 160;
        const h = 1 + Math.random() * 1.6;
        segs.push(x, 0, z, x + (Math.random() - 0.5), h, z);
        const c = Math.random() < 0.5 ? c1 : c2;
        cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
      const lgeo = new THREE.BufferGeometry();
      lgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs), 3));
      lgeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3));
      scene.add(new THREE.LineSegments(lgeo, new THREE.LineBasicMaterial({ vertexColors: true })));
      // a giant friendly grin watches from the sky
      const grin = new THREE.Group();
      this._grinMat = new THREE.MeshBasicMaterial({ color: 0xfdfaf0, transparent: true, opacity: 0 });
      const put = (x, y) => {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.8, 6, 6), this._grinMat);
        s.position.set(x, y, 0);
        grin.add(s);
      };
      put(-9, 6); put(9, 6);
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * Math.PI;
        put(Math.cos(a) * 13, -Math.sin(a) * 8);
      }
      grin.position.set(0, 34, -90);
      scene.add(grin);
      // background stars
      const pts = [];
      for (let i = 0; i < 500; i++) {
        pts.push((Math.random() - 0.5) * 300, Math.random() * 120, (Math.random() - 0.5) * 300);
      }
      const pgeo = new THREE.BufferGeometry();
      pgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
      scene.add(new THREE.Points(pgeo, new THREE.PointsMaterial({ color: 0x8899ff, size: 0.4 })));
      // a small pool of falling stars + their landing beams
      this._stars = [];
      for (let i = 0; i < 4; i++) {
        const star = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xfff2b0, fog: false }));
        star.visible = false;
        scene.add(star);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 40, 10, 1, true),
          new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.14, side: THREE.DoubleSide, fog: false }));
        beam.visible = false;
        scene.add(beam);
        this._stars.push({ star, beam, active: false });
      }
      this._p = new THREE.Vector3(0, 0, 0);
      this._score = 0;
      this._spawnT = 1.0;   // first star lands fast so the goal clicks
      return scene;
    },
    update(dt, t, ctx) {
      this._grinMat.opacity = Math.min(0.9, t * 0.1);
      const p = this._p;
      moveXZ(p, ctx, dt, 7);
      p.x = THREE.MathUtils.clamp(p.x, -30, 30);
      p.z = THREE.MathUtils.clamp(p.z, -30, 30);
      // launch a new star every couple of seconds, near where you are
      this._spawnT -= dt;
      if (this._spawnT <= 0) {
        this._spawnT = 1.8;
        const slot = this._stars.find((s) => !s.active);
        if (slot) {
          const a = Math.random() * Math.PI * 2;
          const d = 5 + Math.random() * 11;
          const x = THREE.MathUtils.clamp(p.x + Math.cos(a) * d, -26, 26);
          const z = THREE.MathUtils.clamp(p.z + Math.sin(a) * d, -26, 26);
          slot.active = true;
          slot.star.visible = true;
          slot.beam.visible = true;
          slot.star.position.set(x, 42, z);
          slot.beam.position.set(x, 20, z);
        }
      }
      for (const s of this._stars) {
        if (!s.active) continue;
        s.star.position.y -= 12 * dt;
        s.beam.material.opacity = 0.1 + Math.sin(t * 8) * 0.05;
        const dx = p.x - s.star.position.x, dz = p.z - s.star.position.z;
        if (s.star.position.y < 2.4 && dx * dx + dz * dz < 5.8) {
          // caught it!
          s.active = false; s.star.visible = false; s.beam.visible = false;
          this._score++;
          ctx.chime();
        } else if (s.star.position.y < 0) {
          // it soaks into the grid — no harm done, the sky has more
          s.active = false; s.star.visible = false; s.beam.visible = false;
        }
      }
      lookCam(ctx, p.x, 1.7, p.z);
      return this._score >= 10;
    },
    hud() { return `⭐ ${this._score}/10 stars caught`; },
    result() {
      const win = this._score >= 10;
      return {
        score: this._score, max: 10, success: win,
        text: win ? 'Ten stars in your pockets. The grin in the sky looked proud.'
                  : `You caught ${this._score} falling star${this._score === 1 ? '' : 's'}.`,
      };
    },
  },
  {
    id: 'stalk',
    title: 'The Giant Stalk',
    goal: '🐞 RACE the ladybug to the top of the giant stalk! TAP (or click) fast to climb — stop tapping and you slide.',
    duration: 40,
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
      this._stalk = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.6, 60, 8),
        new THREE.MeshLambertMaterial({ color: 0xc09a3a }));
      this._stalk.position.set(0, 30, -10);
      scene.add(this._stalk);
      // the seed head: a cluster of giant grains — the finish line
      const grainMat = new THREE.MeshLambertMaterial({ color: 0xe2c060 });
      for (let i = 0; i < 16; i++) {
        const grain = new THREE.Mesh(new THREE.SphereGeometry(1.7, 7, 7), grainMat);
        const a = i * 2.4;
        grain.position.set(Math.cos(a) * 2.2, 58 + (i % 4) * 2.2, -10 + Math.sin(a) * 2.2);
        grain.scale.y = 1.6;
        scene.add(grain);
      }
      for (const [ly, la] of [[12, 0.6], [24, 2.7], [38, 1.5]]) {
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 9),
          new THREE.MeshLambertMaterial({ color: 0xa8902e }));
        leaf.position.set(Math.cos(la) * 4.5, ly, -10 + Math.sin(la) * 4.5);
        leaf.rotation.y = -la;
        leaf.rotation.x = 0.5;
        scene.add(leaf);
      }
      // your rival: a little red ladybug, climbing without hurry
      this._bugMesh = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8),
        new THREE.MeshLambertMaterial({ color: 0xc23a2a }));
      scene.add(this._bugMesh);
      // your hands (a small golden marker so you can see yourself climb)
      this._me = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffe27a, fog: false }));
      scene.add(this._me);
      // normal-size wheat at the base for scale
      for (let i = 0; i < 60; i++) {
        const a = Math.random() * Math.PI * 2, d = 4 + Math.random() * 26;
        coneStalk(scene, Math.cos(a) * d, 0, -10 + Math.sin(a) * d, 1.1, 0xd4b258);
      }
      this._h = 0;       // your height up the stalk
      this._bug = 0;     // the ladybug's height
      this._won = false;
      return scene;
    },
    update(dt, t, ctx) {
      // tap to lunge upward; gravity (politely) disagrees
      if (ctx.tap) this._h += 1.4;
      this._h = Math.max(0, this._h - 1.0 * dt);
      this._bug = Math.min(56, this._bug + 1.25 * dt);
      const TOP = 56;
      if (this._h >= TOP) { this._h = TOP; this._won = true; }
      // both of you spiral up the stalk
      const ba = this._bug * 0.7;
      this._bugMesh.position.set(Math.cos(ba) * 1.5, 1 + this._bug, -10 + Math.sin(ba) * 1.5);
      const ma = this._h * 0.55 + 2;
      this._me.position.set(Math.cos(ma) * 1.4, 1 + this._h, -10 + Math.sin(ma) * 1.4);
      const sway = Math.sin(t * 0.5) * 0.02;
      this._stalk.rotation.z = sway;
      // chase camera floats just behind your height, looking at the action
      const camA = ma + 0.9;
      const camY = 2.2 + this._h;
      ctx.camera.position.set(Math.cos(camA) * 7, camY + 1.2, -10 + Math.sin(camA) * 7);
      ctx.camera.lookAt(0, Math.min(camY + 3, 58), -10);
      return this._won;
    },
    hud() { return `🐞 TAP to climb! You ${Math.round(this._h)}m · bug ${Math.round(this._bug)}m · top 56m`; },
    result() {
      return {
        score: Math.round(this._h), max: 56, success: this._won,
        text: this._won ? 'You beat the ladybug to the seed head. It did not seem to mind.'
                        : `You climbed ${Math.round(this._h)}m before morning came. The ladybug waved.`,
      };
    },
  },
];

// the rare NIGHTMARE — a survival run. Big stardust, big nerves.
// Still kid-safe: get caught and you simply snap awake.
export const NIGHTMARE = {
  id: 'nightmare',
  title: 'THE NIGHTMARE',
  goal: '🩸 RUN. Slip between the grins and stay free until morning. If they touch you, you wake — that\'s all.',
  duration: 35,
  reward: { type: 'lore', text: 'You snap awake. Your pockets are full of stardust and your heart is full of drums.' },
  build() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a0406);
    scene.fog = new THREE.FogExp2(0x1a0406, 0.045);
    scene.add(new THREE.HemisphereLight(0x883333, 0x180404, 0.9));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600),
      new THREE.MeshLambertMaterial({ color: 0x140a0a }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    this._ring = [];
    const mat = new THREE.MeshBasicMaterial({ color: 0xe8d8c8, fog: false, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 8; i++) {
      const grin = new THREE.Group();
      for (let j = 0; j <= 8; j++) {
        const a = (j / 8) * Math.PI;
        const tooth = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), mat);
        tooth.position.set(Math.cos(a) * 0.7, -Math.sin(a) * 0.4, 0);
        grin.add(tooth);
      }
      for (const ex of [-0.4, 0.4]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), mat);
        eye.position.set(ex, 0.5, 0);
        grin.add(eye);
      }
      grin.userData.angle = (i / 8) * Math.PI * 2;
      scene.add(grin);
      this._ring.push(grin);
    }
    // dead wheat silhouettes scattered everywhere you might run
    for (let i = 0; i < 120; i++) {
      const a = Math.random() * Math.PI * 2, dd = 6 + Math.random() * 120;
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.06, 1.6, 4),
        new THREE.MeshLambertMaterial({ color: 0x241010 }));
      m.position.set(Math.cos(a) * dd, 0.8, Math.sin(a) * dd);
      scene.add(m);
    }
    this._p = new THREE.Vector3(0, 0, 0);
    this._center = new THREE.Vector3(0, 0, 0);
    this._caught = false;
    this._survived = 0;
    return scene;
  },
  update(dt, t, ctx) {
    const p = this._p;
    moveXZ(p, ctx, dt, 7);
    this._survived = t;
    // the ring shadows you (lagging behind) while it closes all the way —
    // standing still is NOT safe; you have to slip out through a gap
    this._center.set(p.x * 0.65, 0, p.z * 0.65);
    const radius = Math.max(1.2, 26 - t * 0.85);
    for (const grin of this._ring) {
      const a = grin.userData.angle + t * 0.1;
      grin.position.set(
        this._center.x + Math.cos(a) * radius,
        1.6 + Math.sin(t * 2 + a) * 0.2,
        this._center.z + Math.sin(a) * radius
      );
      grin.lookAt(p.x, 1.6, p.z);
      const dx = p.x - grin.position.x, dz = p.z - grin.position.z;
      if (dx * dx + dz * dz < 2.4) this._caught = true;
    }
    lookCam(ctx, p.x, 1.6, p.z);
    return this._caught;
  },
  hud() {
    const left = Math.max(0, Math.ceil(this.duration - this._survived));
    return `🩸 RUN! ${left}s until morning`;
  },
  result() {
    const win = !this._caught;
    return {
      score: win ? this.duration : Math.round(this._survived), max: this.duration, success: win,
      text: win ? 'You outran every grin until sunrise. The fields will talk about this.'
                : 'A grin got close enough to whisper — and you snapped awake, heart drumming.',
    };
  },
};

export class Dreams {
  constructor() {
    this.active = false;
    this.current = null;
    this.t = 0;
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 500);
    this.camera.rotation.order = 'YXZ';
    this._wake = false;
    this._tap = false;
    this.lastResult = null;
  }

  begin(forced) {
    const seen = State.dreamLog.map(d => d.id);
    const fresh = DREAMS.filter(d => !seen.includes(d.id));
    let pick = forced || (fresh.length ? fresh : DREAMS)[Math.floor(Math.random() * (fresh.length ? fresh.length : DREAMS.length))];
    this.current = pick;
    this.scene = pick.build();
    this.t = 0;
    this.active = true;
    this._wake = false;
    this._tap = false;
    this.lastResult = null;
    return pick;
  }

  // a tap/click while dreaming (the minigame decides what it means)
  tap() { this._tap = true; }

  requestWake() {
    if (this.t > MIN_WAKE) this._wake = true;
  }

  canWake() { return this.active && this.t > MIN_WAKE; }

  hudText() {
    return this.active && this.current && this.current.hud ? this.current.hud() : null;
  }

  // returns false when the dream is over
  update(dt, controls, chime) {
    if (!this.active) return false;
    this.t += dt;
    const ctx = {
      move: controls.move, yaw: controls.yaw, pitch: controls.pitch,
      tap: this._tap, camera: this.camera, chime: chime || (() => {}),
    };
    this._tap = false;
    const done = this.current.update(dt, this.t, ctx);
    if (done || this.t >= this.current.duration || this._wake) {
      this.lastResult = this.current.result ? this.current.result() : null;
      this.active = false;
      return false;
    }
    return true;
  }
}
