// arcade.js — LEVEL 3999, "THE TRUE ENDING". Designed by Lucas: behind the
// door past the barn (~320m), a massive neon-lit retro arcade. Safe haven — no
// hostile anything, calm comes back, chiptunes hum — and an ESCAPE: finish
// a randomized task list and the EXIT opens. Walking through rolls the True
// Ending. Then you wake up home, rich, and the fields keep going. Forever.

import * as THREE from 'three';
import { State, bus, save } from './state.js';
import { glowSprite } from './gfx.js';

export const ARCADE_POS = { x: 0, z: -1200 };       // center of the hall
export const ARCADE_W = 46, ARCADE_D = 32;          // footprint
const HX = ARCADE_W / 2, HZ = ARCADE_D / 2;
export const SPAWN = { x: 0, z: -1186 };            // just inside the doors

const NEON_PINK = 0xff3df0, NEON_CYAN = 0x00e5ff, NEON_GOLD = 0xffce54;

// ---------- the escape checklist ----------
export const TASKS = {
  invaders: { desc: 'Win a round of WHEAT INVADERS', emoji: '👾' },
  catch: { desc: 'Win a round of ALMOND CATCH', emoji: '🧴' },
  flappy: { desc: 'Win a round of FLAPPY GRIN', emoji: '😶' },
  slushie: { desc: 'Drink a Neon Slushie', emoji: '🥤' },
  token: { desc: 'Find the hidden golden token', emoji: '🪙' },
  highfive: { desc: 'High-five the attendant', emoji: '🖐' },
};

export function rollTasks() {
  const ids = Object.keys(TASKS);
  const picked = [];
  while (picked.length < 4) {
    const id = ids.splice((Math.random() * ids.length) | 0, 1)[0];
    picked.push(id);
  }
  State.arcade.tasks = picked;
  State.arcade.done = [];
  save();
}

export function markTask(id) {
  const a = State.arcade;
  if (!a.tasks.includes(id) || a.done.includes(id)) return false;
  a.done.push(id);
  save();
  bus.emit('taskDone', { id, left: a.tasks.length - a.done.length });
  return true;
}

export function exitOpen() {
  const a = State.arcade;
  return a.tasks.length > 0 && a.done.length >= a.tasks.length;
}

// ---------- the cabinet games (pure logic + 2D draw; DOM lives in ui.js) ----
// shared input: { tap: bool (consumed per frame), x: 0..1 pointer while held }
export class Invaders {
  constructor() {
    this.title = 'WHEAT INVADERS';
    this.ship = 0.5;
    this.bullets = [];
    this.worms = [];
    this.spawnT = 0.4;
    this.kills = 0;
    this.misses = 0;
    this.done = null;
  }
  update(dt, input) {
    if (input.x !== null) this.ship += (input.x - this.ship) * Math.min(1, dt * 12);
    if (input.tap) this.bullets.push({ x: this.ship, y: 0.86 });
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 0.75;
      this.worms.push({ x: 0.08 + Math.random() * 0.84, y: -0.05, s: 0.1 + Math.random() * 0.08 });
    }
    for (const b of this.bullets) b.y -= dt * 1.3;
    for (const w of this.worms) w.y += dt * w.s;
    for (const b of this.bullets) {
      for (const w of this.worms) {
        if (!w.dead && Math.abs(b.x - w.x) < 0.05 && Math.abs(b.y - w.y) < 0.05) {
          w.dead = true; b.y = -1; this.kills++;
        }
      }
    }
    this.worms = this.worms.filter((w) => {
      if (w.dead) return false;
      if (w.y > 1) { this.misses++; return false; }
      return true;
    });
    this.bullets = this.bullets.filter((b) => b.y > -0.5);
    if (this.kills >= 15) this.done = 'win';
    else if (this.misses >= 3) this.done = 'lose';
    return this.done;
  }
  hud() { return `pops ${this.kills}/15 · escapes ${this.misses}/3`; }
  draw(c, W, H) {
    c.fillStyle = '#04060c'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#9be8ff';
    c.fillRect(this.ship * W - 11, H * 0.9, 22, 8);
    c.fillRect(this.ship * W - 2, H * 0.9 - 6, 4, 6);
    c.fillStyle = '#ffe9a0';
    for (const b of this.bullets) c.fillRect(b.x * W - 1.5, b.y * H, 3, 8);
    c.fillStyle = '#e86a8a';
    for (const w of this.worms) {
      c.beginPath(); c.arc(w.x * W, w.y * H, 7, 0, 7); c.fill();
      c.fillRect(w.x * W - 3, w.y * H - 12, 6, 8);
    }
  }
}

export class Catcher {
  constructor() {
    this.title = 'ALMOND CATCH';
    this.basket = 0.5;
    this.drops = [];
    this.spawnT = 0.3;
    this.caught = 0;
    this.missed = 0;
    this.done = null;
  }
  update(dt, input) {
    if (input.x !== null) this.basket += (input.x - this.basket) * Math.min(1, dt * 14);
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 0.65;
      this.drops.push({ x: 0.08 + Math.random() * 0.84, y: -0.05, s: 0.28 + Math.random() * 0.18 });
    }
    for (const d of this.drops) d.y += dt * d.s;
    this.drops = this.drops.filter((d) => {
      if (d.y > 0.86 && Math.abs(d.x - this.basket) < 0.09) { this.caught++; return false; }
      if (d.y > 1) { this.missed++; return false; }
      return true;
    });
    if (this.caught >= 12) this.done = 'win';
    else if (this.missed >= 3) this.done = 'lose';
    return this.done;
  }
  hud() { return `caught ${this.caught}/12 · spilled ${this.missed}/3`; }
  draw(c, W, H) {
    c.fillStyle = '#0c0418'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#d8b24f';
    c.fillRect(this.basket * W - 18, H * 0.88, 36, 10);
    c.fillRect(this.basket * W - 18, H * 0.88, 4, -6);
    c.fillRect(this.basket * W + 14, H * 0.88, 4, -6);
    for (const d of this.drops) {
      c.fillStyle = '#cfe8e0';
      c.fillRect(d.x * W - 4, d.y * H - 8, 8, 14);
      c.fillStyle = '#a85a5a';
      c.fillRect(d.x * W - 2, d.y * H - 11, 4, 4);
    }
  }
}

export class Flappy {
  constructor() {
    this.title = 'FLAPPY GRIN';
    this.y = 0.45;
    this.vy = 0;
    this.pipes = [{ x: 1.2, gap: 0.45 }];
    this.passed = 0;
    this.done = null;
  }
  update(dt, input) {
    if (input.tap) this.vy = -0.55;
    this.vy += dt * 1.5;
    this.y += this.vy * dt;
    for (const p of this.pipes) p.x -= dt * 0.34;
    const last = this.pipes[this.pipes.length - 1];
    if (last.x < 0.62) this.pipes.push({ x: 1.15, gap: 0.2 + Math.random() * 0.55 });
    for (const p of this.pipes) {
      if (!p.counted && p.x < 0.22) { p.counted = true; this.passed++; }
      // collide: bird at x=0.25, half-gap 0.16
      if (Math.abs(p.x - 0.25) < 0.045 && Math.abs(this.y - p.gap) > 0.155) this.done = 'lose';
    }
    this.pipes = this.pipes.filter((p) => p.x > -0.1);
    if (this.y < 0 || this.y > 1) this.done = 'lose';
    if (this.passed >= 8) this.done = 'win';
    return this.done;
  }
  hud() { return `stalks ${this.passed}/8 — tap to flap!`; }
  draw(c, W, H) {
    c.fillStyle = '#001008'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#3a9a5a';
    for (const p of this.pipes) {
      c.fillRect(p.x * W - 9, 0, 18, (p.gap - 0.16) * H);
      c.fillRect(p.x * W - 9, (p.gap + 0.16) * H, 18, H);
    }
    // the grin, flapping
    const y = this.y * H;
    c.fillStyle = '#fdfaf0';
    c.beginPath(); c.arc(0.25 * W - 5, y - 4, 2.5, 0, 7); c.fill();
    c.beginPath(); c.arc(0.25 * W + 5, y - 4, 2.5, 0, 7); c.fill();
    c.beginPath(); c.arc(0.25 * W, y, 8, 0.2, Math.PI - 0.2); c.stroke();
    c.strokeStyle = '#fdfaf0'; c.lineWidth = 3;
  }
}

export const CABINETS = { invaders: Invaders, catch: Catcher, flappy: Flappy };

// ---------- the hall itself ----------
function carpetTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#14102a';
  g.fillRect(0, 0, 256, 256);
  // the legally-distinct 80s arcade carpet: confetti shapes on midnight blue
  const colors = ['#ff3df0', '#00e5ff', '#ffce54', '#7ec27e'];
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = colors[i % 4];
    g.lineWidth = 2.5;
    const x = Math.random() * 256, y = Math.random() * 256;
    g.beginPath();
    if (i % 3 === 0) { g.moveTo(x, y); g.lineTo(x + 14, y + 6); g.lineTo(x + 4, y + 14); }
    else if (i % 3 === 1) { g.arc(x, y, 7, 0, Math.PI * 1.4); }
    else { g.moveTo(x, y); g.quadraticCurveTo(x + 10, y - 10, x + 18, y); }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 6);
  return tex;
}

function marqueeTexture(text, color) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#0a0a14'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = color; g.font = 'bold 26px Georgia'; g.textAlign = 'center';
  g.fillText(text, 128, 42);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Arcade {
  constructor(scene) {
    const g = new THREE.Group();
    this.colliders = [];
    const dark = new THREE.MeshLambertMaterial({ color: 0x16121e });
    const addBox = (w, h, d, x, y, z, mat = dark, collide = true) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      g.add(m);
      if (collide) this.colliders.push({
        x0: ARCADE_POS.x + x - w / 2, x1: ARCADE_POS.x + x + w / 2,
        z0: ARCADE_POS.z + z - d / 2, z1: ARCADE_POS.z + z + d / 2,
      });
      return m;
    };
    // floor / ceiling / walls (south wall has the entry gap)
    const floor = new THREE.Mesh(new THREE.BoxGeometry(ARCADE_W, 0.3, ARCADE_D),
      new THREE.MeshLambertMaterial({ map: carpetTexture() }));
    floor.position.y = 0.05;
    g.add(floor);
    addBox(ARCADE_W, 5.4, 0.4, 0, 2.7, -HZ);                       // north
    addBox(HX - 2, 5.4, 0.4, -(HX / 2 + 1), 2.7, HZ);              // south (door gap mid)
    addBox(HX - 2, 5.4, 0.4, HX / 2 + 1, 2.7, HZ);
    addBox(0.4, 5.4, ARCADE_D, -HX, 2.7, 0);                       // west
    addBox(0.4, 5.4, ARCADE_D, HX, 2.7, 0);                        // east
    addBox(ARCADE_W, 0.3, ARCADE_D, 0, 5.5, 0, dark, false);       // ceiling
    // neon tubes along the walls + a big sign
    for (const [z, color] of [[-HZ + 0.25, NEON_PINK], [HZ - 0.25, NEON_CYAN]]) {
      const tube = new THREE.Mesh(new THREE.BoxGeometry(ARCADE_W - 2, 0.12, 0.12),
        new THREE.MeshBasicMaterial({ color, fog: false }));
      tube.position.set(0, 4.6, z);
      g.add(tube);
    }
    for (const [x, color] of [[-HX + 0.25, NEON_CYAN], [HX - 0.25, NEON_PINK]]) {
      const tube = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, ARCADE_D - 2),
        new THREE.MeshBasicMaterial({ color, fog: false }));
      tube.position.set(x, 4.6, 0);
      g.add(tube);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2),
      new THREE.MeshBasicMaterial({ map: marqueeTexture('LEVEL ✦ 3999', '#ff3df0') }));
    sign.position.set(0, 3.9, -HZ + 0.45);
    g.add(sign);
    // light: a handful of colored points (phone budget)
    for (const [x, z, color] of [[-12, -6, NEON_PINK], [12, -6, NEON_CYAN], [0, 6, NEON_GOLD], [0, -12, 0x8a7aff]]) {
      const l = new THREE.PointLight(color, 9, 24, 2);
      l.position.set(x, 4.2, z);
      g.add(l);
    }
    const haloPink = glowSprite(NEON_PINK, 10, 0.25);
    haloPink.position.set(-12, 4.2, -6);
    g.add(haloPink);
    const haloCyan = glowSprite(NEON_CYAN, 10, 0.25);
    haloCyan.position.set(12, 4.2, -6);
    g.add(haloCyan);

    // cabinets: 3 playable along the north wall + 5 set-dressing
    this.cabinetSpots = [];
    const mkCabinet = (x, z, ry, name, color, playableId) => {
      const cab = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 0.9),
        new THREE.MeshLambertMaterial({ color: 0x2e3344, emissive: 0x141826 }));
      body.position.y = 0.95;
      cab.add(body);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6),
        new THREE.MeshBasicMaterial({ color: 0x0a1420 }));
      screen.position.set(0, 1.35, 0.46);
      screen.rotation.x = -0.12;
      cab.add(screen);
      const marquee = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.26),
        new THREE.MeshBasicMaterial({ map: marqueeTexture(name, color) }));
      marquee.position.set(0, 1.95, 0.46);
      cab.add(marquee);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6),
        new THREE.MeshBasicMaterial({ color: 0x16324a, transparent: true, opacity: 0.7 }));
      glow.position.set(0, 1.35, 0.461);
      glow.rotation.x = -0.12;
      cab.add(glow);
      cab.position.set(x, 0, z);
      cab.rotation.y = ry;
      g.add(cab);
      this.colliders.push({
        x0: ARCADE_POS.x + x - 0.7, x1: ARCADE_POS.x + x + 0.7,
        z0: ARCADE_POS.z + z - 0.6, z1: ARCADE_POS.z + z + 0.6,
      });
      if (playableId) {
        this.cabinetSpots.push({
          id: playableId, name,
          x: ARCADE_POS.x + x + Math.sin(ry) * 1.4,
          z: ARCADE_POS.z + z + Math.cos(ry) * 1.4,
        });
      }
    };
    // (kept clear of x≈0 — the EXIT lives mid-north-wall)
    mkCabinet(-12, -13.5, 0, 'WHEAT INVADERS', '#9be8ff', 'invaders');
    mkCabinet(-4.5, -13.5, 0, 'ALMOND CATCH', '#ffce54', 'catch');
    mkCabinet(12, -13.5, 0, 'FLAPPY GRIN', '#7ec27e', 'flappy');
    mkCabinet(-HX + 1.6, -4, Math.PI / 2, 'OUT OF ORDER', '#8d8470', null);
    mkCabinet(-HX + 1.6, 0, Math.PI / 2, 'WORM HOLE', '#e86a8a', null);
    mkCabinet(HX - 1.6, -4, -Math.PI / 2, 'SKEE BALL', '#ffce54', null);
    mkCabinet(HX - 1.6, 0, -Math.PI / 2, 'NO COIN NO PLAY', '#8d8470', null);

    // the slushie machine + prize counter + attendant + the EXIT
    const slush = addBox(1.6, 1.3, 0.9, 14, 0.65, 10);
    const slushTop = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.6, 8),
      new THREE.MeshBasicMaterial({ color: NEON_CYAN }));
    slushTop.position.set(14, 1.6, 10);
    g.add(slushTop);
    this.slushSpot = { x: ARCADE_POS.x + 14, z: ARCADE_POS.z + 10 - 1.3 };
    addBox(6, 1.05, 1.0, -13, 0.52, 10);                            // prize counter
    // the hidden golden token, BEHIND the prize counter
    const token = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 12),
      new THREE.MeshBasicMaterial({ color: NEON_GOLD, fog: false }));
    token.position.set(-15, 0.25, 13.2);
    token.rotation.x = 0.4;
    g.add(token);
    this.tokenMesh = token;
    this.tokenSpot = { x: ARCADE_POS.x - 15, z: ARCADE_POS.z + 13.2 };
    // the attendant: same faceless make as WcDonald's, arcade colors
    const att = new THREE.Group();
    const white = new THREE.MeshLambertMaterial({ color: 0xe9e6df, emissive: 0x16140f });
    const vest = new THREE.MeshLambertMaterial({ color: 0x2a2a6a });
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.8, 0.24),
      new THREE.MeshLambertMaterial({ color: 0x1a1a22 }));
    legs.position.y = 0.4;
    att.add(legs);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.55, 4, 8), white);
    torso.position.y = 1.25;
    att.add(torso);
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.12), vest);
    v.position.set(0, 1.28, 0.16);
    att.add(v);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), white);
    head.position.y = 1.85;
    att.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.26),
      new THREE.MeshBasicMaterial({ color: NEON_PINK }));
    visor.position.set(0, 1.9, 0.1);
    att.add(visor);
    att.position.set(-13, 0, 8.6);
    att.rotation.y = Math.PI;
    g.add(att);
    this.attendant = att;
    this.attHead = head;
    this.attSpot = { x: ARCADE_POS.x - 13, z: ARCADE_POS.z + 7 };
    // the EXIT: a door-shaped hole of pure daylight in the north wall
    this.exitMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0, fog: false, transparent: true, opacity: 0.25 });
    const exit = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.6), this.exitMat);
    exit.position.set(0, 1.3, -HZ + 0.21);
    g.add(exit);
    const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4),
      new THREE.MeshBasicMaterial({ map: marqueeTexture('EXIT', '#7ec27e') }));
    exitSign.position.set(0, 3, -HZ + 0.21);
    g.add(exitSign);
    this.exitSpot = { x: ARCADE_POS.x, z: ARCADE_POS.z - HZ + 1.4 };
    // a task board by the entrance
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5),
      new THREE.MeshBasicMaterial({ map: marqueeTexture('ESCAPE TASKS', '#ffce54') }));
    board.position.set(6, 2.1, HZ - 0.25);
    board.rotation.y = Math.PI;
    g.add(board);
    this.boardSpot = { x: ARCADE_POS.x + 6, z: ARCADE_POS.z + HZ - 1.4 };

    g.position.set(ARCADE_POS.x, 0, ARCADE_POS.z);
    scene.add(g);
    this.group = g;
  }

  inside(p) {
    return Math.abs(p.x - ARCADE_POS.x) < HX + 2 && Math.abs(p.z - ARCADE_POS.z) < HZ + 2;
  }

  _blocked(x, z) {
    const R = 0.35;
    for (const w of this.colliders) {
      if (x > w.x0 - R && x < w.x1 + R && z > w.z0 - R && z < w.z1 + R) return true;
    }
    return false;
  }

  collide(ox, oz, nx, nz) {
    if (!this.inside({ x: nx, z: nz })) return { x: nx, z: nz };
    const x = this._blocked(nx, oz) ? ox : nx;
    const z = this._blocked(x, nz) ? oz : nz;
    return { x, z };
  }

  nearSpot(p, spot, r = 2.2) {
    const dx = p.x - spot.x, dz = p.z - spot.z;
    return dx * dx + dz * dz < r * r;
  }

  update(dt, t, p) {
    // the token glints; the attendant's head follows you (of course it does)
    this.tokenMesh.rotation.y = t * 2;
    this.tokenMesh.visible = !State.arcade.done.includes('token');
    const target = Math.atan2(p.x - (this.attendant.position.x + ARCADE_POS.x),
      p.z - (this.attendant.position.z + ARCADE_POS.z)) - this.attendant.rotation.y;
    this.attHead.rotation.y += (target - this.attHead.rotation.y) * Math.min(1, dt * 1.4);
    this.exitMat.opacity = exitOpen() ? 0.75 + Math.sin(t * 3) * 0.2 : 0.12;
  }
}
