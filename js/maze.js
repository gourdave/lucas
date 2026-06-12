// maze.js — THE CORN MAZE, ~250m northeast. The first place in the fields
// where you can't see what's coming: corn hedges twice your height, lanes a
// shoulder-width wide, and a chest in the heart of it that refills daily.
// The maze layout is FIXED (seeded) — kids learn mazes, that's the fun.

import * as THREE from 'three';
import { State, bus, todayStr } from './state.js';

export const MAZE_POS = { x: 170, z: -180 };  // ~248m out
const CELLS = 11;        // 11×11 cells
const CELL = 4;          // meters per cell
const HALF = (CELLS * CELL) / 2;
const WALL_H = 3;
const WALL_T = 0.7;
const R = 0.35;          // player radius for collision

// seeded rng so every player walks the SAME maze forever
function rng(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// classic recursive backtracker: returns which walls survive
function generate() {
  const rnd = rng(20260612);
  // walls: h[z][x] = wall on the north side of cell (x,z); v[z][x] = west side
  const h = Array.from({ length: CELLS + 1 }, () => new Array(CELLS).fill(true));
  const v = Array.from({ length: CELLS }, () => new Array(CELLS + 1).fill(true));
  const seen = Array.from({ length: CELLS }, () => new Array(CELLS).fill(false));
  const stack = [[5, 0]];
  seen[0][5] = true;
  while (stack.length) {
    const [cx, cz] = stack[stack.length - 1];
    const options = [];
    if (cz > 0 && !seen[cz - 1][cx]) options.push([cx, cz - 1, 'h', cx, cz]);
    if (cz < CELLS - 1 && !seen[cz + 1][cx]) options.push([cx, cz + 1, 'h', cx, cz + 1]);
    if (cx > 0 && !seen[cz][cx - 1]) options.push([cx - 1, cz, 'v', cx, cz]);
    if (cx < CELLS - 1 && !seen[cz][cx + 1]) options.push([cx + 1, cz, 'v', cx + 1, cz]);
    if (!options.length) { stack.pop(); continue; }
    const [nx, nz, kind, wx, wz] = options[(rnd() * options.length) | 0];
    if (kind === 'h') h[wz][wx] = false;
    else v[wz][wx] = false;
    seen[nz][nx] = true;
    stack.push([nx, nz]);
  }
  h[CELLS][5] = false;   // the entrance: south side, middle
  return { h, v };
}

function cornTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#3c4a26';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 26; i++) {
    const x = i * 5 + Math.random() * 3;
    g.strokeStyle = `rgba(${120 + Math.random() * 60 | 0},${130 + Math.random() * 50 | 0},40,0.7)`;
    g.lineWidth = 1.6 + Math.random();
    g.beginPath();
    g.moveTo(x + Math.random() * 4 - 2, 128);
    g.quadraticCurveTo(x, 64, x + Math.random() * 8 - 4, 0);
    g.stroke();
  }
  for (let i = 0; i < 14; i++) {     // hints of ears
    g.fillStyle = 'rgba(220,190,90,0.5)';
    g.beginPath();
    g.ellipse(Math.random() * 128, 20 + Math.random() * 90, 2.4, 5, 0.3, 0, 7);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function mazeChestAvailable() {
  return State.flags.mazeChestDay !== todayStr();
}

export class Maze {
  constructor(scene) {
    const { h, v } = generate();
    this.colliders = [];
    const geos = [];
    const addWall = (x0, z0, x1, z1) => {
      const w = Math.max(x1 - x0, WALL_T), d = Math.max(z1 - z0, WALL_T);
      const g = new THREE.BoxGeometry(w, WALL_H, d);
      // tile the corn texture along the wall length
      const uv = g.attributes.uv;
      const ulen = Math.max(w, d) / 2.2;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ulen, uv.getY(i) * 1.4);
      g.translate((x0 + x1) / 2, WALL_H / 2, (z0 + z1) / 2);
      geos.push(g);
      this.colliders.push({
        x0: (x0 + x1) / 2 - w / 2, x1: (x0 + x1) / 2 + w / 2,
        z0: (z0 + z1) / 2 - d / 2, z1: (z0 + z1) / 2 + d / 2,
      });
    };
    const ox = MAZE_POS.x - HALF, oz = MAZE_POS.z - HALF;
    for (let z = 0; z <= CELLS; z++) {
      for (let x = 0; x < CELLS; x++) {
        if (h[z][x]) addWall(ox + x * CELL - WALL_T / 2, oz + z * CELL - WALL_T / 2,
          ox + (x + 1) * CELL + WALL_T / 2, oz + z * CELL + WALL_T / 2);
      }
    }
    for (let z = 0; z < CELLS; z++) {
      for (let x = 0; x <= CELLS; x++) {
        if (v[z][x]) addWall(ox + x * CELL - WALL_T / 2, oz + z * CELL - WALL_T / 2,
          ox + x * CELL + WALL_T / 2, oz + (z + 1) * CELL + WALL_T / 2);
      }
    }
    // one merged mesh = one draw call for the whole maze
    const merged = mergeBoxGeos(geos);
    const mesh = new THREE.Mesh(merged,
      new THREE.MeshLambertMaterial({ map: cornTexture(), color: 0xffffff }));
    scene.add(mesh);

    // the heart: a chest that refills every day
    this.chest = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6),
      new THREE.MeshLambertMaterial({ color: 0x6a4a2e }));
    box.position.y = 0.3;
    this.chest.add(box);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.18, 0.64),
      new THREE.MeshLambertMaterial({ color: 0x8a6a3e }));
    lid.position.y = 0.66;
    this.chest.add(lid);
    this.chestGlow = new THREE.PointLight(0xffd96a, 6, 8, 2);
    this.chestGlow.position.y = 1.2;
    this.chest.add(this.chestGlow);
    this.chest.position.set(MAZE_POS.x + CELL / 2 - CELL * 0, 0, MAZE_POS.z);
    // center cell (5,5): its middle in world coords
    this.chest.position.set(ox + 5 * CELL + CELL / 2, 0, oz + 5 * CELL + CELL / 2);
    scene.add(this.chest);
    this.chestPos = this.chest.position;

    // two WATCHERS: grins that peer down a lane and sink away when approached
    this.watchers = [];
    for (let i = 0; i < 2; i++) {
      const grin = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: 0xe8d8c8, fog: false, transparent: true, opacity: 0.85 });
      for (let j = 0; j <= 8; j++) {
        const a = (j / 8) * Math.PI;
        const tooth = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), mat);
        tooth.position.set(Math.cos(a) * 0.5, -Math.sin(a) * 0.3, 0);
        grin.add(tooth);
      }
      for (const ex of [-0.28, 0.28]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), mat);
        eye.position.set(ex, 0.34, 0);
        grin.add(eye);
      }
      grin.visible = false;
      grin.userData.mat = mat;
      scene.add(grin);
      this.watchers.push({ mesh: grin, t: 10 + i * 14 });
    }

    // the signpost near home that points the way
    const post = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.7, 6),
      new THREE.MeshLambertMaterial({ color: 0x5d5243 }));
    pole.position.y = 0.85;
    post.add(pole);
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 48;
    const c = cv.getContext('2d');
    c.fillStyle = '#7a6a4e'; c.fillRect(0, 0, 256, 48);
    c.fillStyle = '#2e2818'; c.font = 'bold 26px Georgia'; c.textAlign = 'center';
    c.fillText('CORN MAZE →', 128, 33);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const plank = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.32),
      new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    plank.position.y = 1.45;
    post.add(plank);
    post.position.set(20, 0, -16);
    // aim the plank's arrow roughly toward the maze
    post.rotation.y = Math.atan2(MAZE_POS.x - 20, MAZE_POS.z + 16) + Math.PI / 2;
    scene.add(post);
  }

  inMazeArea(p) {
    return Math.abs(p.x - MAZE_POS.x) < HALF + 5 && Math.abs(p.z - MAZE_POS.z) < HALF + 5;
  }

  _blocked(x, z) {
    for (const w of this.colliders) {
      if (x > w.x0 - R && x < w.x1 + R && z > w.z0 - R && z < w.z1 + R) return true;
    }
    return false;
  }

  // axis-separated slide, same trick the house uses
  collide(ox, oz, nx, nz) {
    if (!this.inMazeArea({ x: nx, z: nz })) return { x: nx, z: nz };
    const x = this._blocked(nx, oz) ? ox : nx;
    const z = this._blocked(x, nz) ? oz : nz;
    return { x, z };
  }

  nearChest(p) {
    const dx = p.x - this.chestPos.x, dz = p.z - this.chestPos.z;
    return dx * dx + dz * dz < 4;
  }

  openChest() {
    if (!mazeChestAvailable()) return null;
    State.flags.mazeChestDay = todayStr();
    const coins = 110 + Math.floor(Math.random() * 50);
    bus.emit('mazeChest', { coins });
    return { coins };
  }

  update(dt, t, playerPos) {
    this.chestGlow.intensity = mazeChestAvailable() ? 5 + Math.sin(t * 3) * 2 : 0;
    if (!this.inMazeArea(playerPos)) return;
    // watchers fade in down a lane, sink away when you close in
    for (const w of this.watchers) {
      w.t -= dt;
      if (!w.mesh.visible && w.t <= 0) {
        const a = Math.random() * Math.PI * 2, d = 9 + Math.random() * 10;
        w.mesh.position.set(playerPos.x + Math.cos(a) * d, 2.4, playerPos.z + Math.sin(a) * d);
        w.mesh.visible = true;
        w.mesh.userData.mat.opacity = 0;
        w.fade = 1;
      }
      if (w.mesh.visible) {
        w.mesh.lookAt(playerPos.x, 2, playerPos.z);
        const dx = playerPos.x - w.mesh.position.x, dz = playerPos.z - w.mesh.position.z;
        if (dx * dx + dz * dz < 30 || w.fade < -3) {
          w.mesh.userData.mat.opacity -= dt * 1.2;        // sink away
          if (w.mesh.userData.mat.opacity <= 0) {
            w.mesh.visible = false;
            w.t = 16 + Math.random() * 18;
          }
        } else {
          w.fade -= dt * 0.12;
          w.mesh.userData.mat.opacity = Math.min(0.85, w.mesh.userData.mat.opacity + dt * 0.5);
        }
      }
    }
  }
}

// local merge (same as house.js's) — kept private to avoid an import cycle
function mergeBoxGeos(geos) {
  let vcount = 0, icount = 0;
  for (const g of geos) { vcount += g.attributes.position.count; icount += g.index.count; }
  const pos = new Float32Array(vcount * 3);
  const norm = new Float32Array(vcount * 3);
  const uv = new Float32Array(vcount * 2);
  const idx = new Uint32Array(icount);
  let vo = 0, io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3);
    norm.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count;
    io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
