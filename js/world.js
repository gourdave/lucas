// world.js — the endless Level 10 fields, and the "dread gradient":
// the further you walk from the house, the darker and foggier the world gets.
//
// The infinite-field trick: the world is a 5×5 grid of 40m chunks that follows
// the player. When you cross a chunk boundary, the chunks that fell behind are
// re-seeded in front of you. Content is generated from a hash of the chunk
// coordinates, so if you walk back, the exact same field is waiting for you.

import * as THREE from 'three';
import { State, bus } from './state.js';

const CHUNK = 40;
const GRID = 5;
const HALF = Math.floor(GRID / 2);
const SLOTS = GRID * GRID;

const WHEAT_N = 380;  // wheat clumps per chunk (≈9.5k instances total)
const TREE_N = 6;
const BUSH_N = 7;
const POST_N = 11;
const RAIL_N = 20;

const POLE_COUNT = 12;
const POLE_GAP = 35;
const POLE_Z = -25;   // the power line runs east-west, north of the house

function mod(n, m) { return ((n % m) + m) % m; }

// deterministic random generator per chunk (mulberry32)
function rng(cx, cz) {
  let seed = (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ 0x9e3779b9) >>> 0;
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a clump of wheat = two quads crossed like an X (4 triangles total)
function crossQuadGeometry(w, h) {
  const g = new THREE.BufferGeometry();
  const hw = w / 2;
  const pos = new Float32Array([
    -hw, 0, 0,  hw, 0, 0,  hw, h, 0,  -hw, h, 0,
    0, 0, -hw,  0, 0, hw,  0, h, hw,  0, h, -hw,
  ]);
  const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]);
  const normal = new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  return g;
}

// the wheat "art" is painted onto a canvas at boot — no image files anywhere
function makeWheatTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 128;
  const g = cv.getContext('2d');
  for (let i = 0; i < 6; i++) {
    const x = 7 + i * 10 + (Math.random() * 4 - 2);
    g.strokeStyle = 'rgba(255,244,214,0.95)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(x + (Math.random() * 6 - 3), 128);   // stalks stand mostly upright
    g.quadraticCurveTo(x, 70, x, 26);
    g.stroke();
    g.fillStyle = 'rgba(255,238,190,0.96)';
    for (let s = 0; s < 7; s++) {
      g.beginPath();
      g.ellipse(x + (s % 2 ? -2.4 : 2.4), 35 - s * 3.2, 2.4, 4, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeDirtTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#6b6448';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    const v = Math.random();
    g.fillStyle = v < 0.5 ? 'rgba(40,36,24,0.25)' : 'rgba(190,178,130,0.18)';
    g.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(36, 36);
  return tex;
}

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scl = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _mat = new THREE.Matrix4();
const _col = new THREE.Color();

export class World {
  constructor(scene) {
    this.scene = scene;
    this.fear = 0;
    this.uTime = { value: 0 };
    this._pcx = null; this._pcz = null;
    this._poleBase = null;

    this._day = new THREE.Color(0x9aa6ad);     // leaden overcast sky
    this._night = new THREE.Color(0x07090f);   // deep-field night
    this.skyColor = this._day.clone();
    scene.background = this.skyColor;
    scene.fog = new THREE.FogExp2(this.skyColor.getHex(), 0.012);
    scene.fog.color = this.skyColor;           // fog and sky share one Color object

    this.hemi = new THREE.HemisphereLight(0xc3ccd0, 0x57523f, 1.0);
    scene.add(this.hemi);
    this.dir = new THREE.DirectionalLight(0xfff4e0, 0.65);
    this.dir.position.set(40, 60, 20);
    scene.add(this.dir);

    // ground: one big plane that quietly follows the player
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 260),
      new THREE.MeshLambertMaterial({ map: makeDirtTexture(), color: 0xb9b2a0 })
    );
    this.ground.rotation.x = -Math.PI / 2;
    scene.add(this.ground);

    this._buildInstanced();
    this._buildPowerLine();
    this._buildBottles();

    this.slots = new Array(SLOTS).fill(null);
  }

  _windify(material) {
    // gentle vertex-shader sway, zero CPU cost (WebGL2 only)
    const uTime = this.uTime;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float wid = float(gl_InstanceID);
        transformed.x += sin(uTime * 1.7 + wid * 0.61) * transformed.y * 0.06;
        transformed.z += cos(uTime * 1.3 + wid * 0.43) * transformed.y * 0.04;`
      );
    };
  }

  _buildInstanced() {
    const supportsWind = (typeof WebGL2RenderingContext !== 'undefined');

    const wheatMat = new THREE.MeshLambertMaterial({
      map: makeWheatTexture(), alphaTest: 0.45, side: THREE.DoubleSide, color: 0xffffff,
    });
    if (supportsWind) this._windify(wheatMat);
    this.wheat = new THREE.InstancedMesh(crossQuadGeometry(1.8, 1.15), wheatMat, WHEAT_N * SLOTS);
    this.wheat.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.wheat.frustumCulled = false;
    // create the per-instance color buffer up front
    for (let i = 0; i < WHEAT_N * SLOTS; i++) this.wheat.setColorAt(i, _col.set(0xcdb078));
    this.scene.add(this.wheat);

    const mk = (geo, color, count) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color }), count * SLOTS);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      this.scene.add(m);
      return m;
    };
    this.trunks = mk(new THREE.CylinderGeometry(0.16, 0.3, 2.6, 5), 0x4a3b2a, TREE_N);
    this.canopies = mk(new THREE.ConeGeometry(1.9, 3.6, 6), 0x3a4631, TREE_N);
    this.bushes = mk(new THREE.IcosahedronGeometry(0.95, 0), 0x46523c, BUSH_N);
    this.posts = mk(new THREE.BoxGeometry(0.14, 1.2, 0.14), 0x5d5243, POST_N);
    this.rails = mk(new THREE.BoxGeometry(0.05, 0.06, 4.05), 0x6b5f4c, RAIL_N);
    this._instanced = [this.wheat, this.trunks, this.canopies, this.bushes, this.posts, this.rails];
  }

  _buildPowerLine() {
    this.poles = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.14, 0.22, 9, 6),
      new THREE.MeshLambertMaterial({ color: 0x4d4338 }), POLE_COUNT);
    this.arms = new THREE.InstancedMesh(
      new THREE.BoxGeometry(2.6, 0.16, 0.16),
      new THREE.MeshLambertMaterial({ color: 0x4d4338 }), POLE_COUNT);
    this.poles.frustumCulled = this.arms.frustumCulled = false;
    this.poles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.arms.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.poles, this.arms);

    // three sagging wire strands across all pole spans
    const segs = 8;
    const ptsPerStrand = (POLE_COUNT - 1) * segs + 1;
    this.wires = [];
    const wireMat = new THREE.LineBasicMaterial({ color: 0x23262b });
    for (let s = 0; s < 3; s++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ptsPerStrand * 3), 3));
      const line = new THREE.Line(geo, wireMat);
      line.frustumCulled = false;
      this.scene.add(line);
      this.wires.push(line);
    }
  }

  _layoutPoles(base) {
    const anchors = [[-1.15, 8.1], [1.15, 8.1], [0, 8.9]]; // x-offset, height of each strand
    const segs = 8;
    for (let i = 0; i < POLE_COUNT; i++) {
      const x = (base + i - POLE_COUNT / 2) * POLE_GAP;
      _pos.set(x, 4.5, POLE_Z); _quat.identity(); _scl.set(1, 1, 1);
      this.poles.setMatrixAt(i, _mat.compose(_pos, _quat, _scl));
      _pos.set(x, 8.1, POLE_Z);
      _quat.setFromAxisAngle(_up, Math.PI / 2); // crossarm perpendicular to the line
      this.arms.setMatrixAt(i, _mat.compose(_pos, _quat, _scl));
    }
    this.poles.instanceMatrix.needsUpdate = true;
    this.arms.instanceMatrix.needsUpdate = true;

    for (let s = 0; s < 3; s++) {
      const arr = this.wires[s].geometry.attributes.position.array;
      let p = 0;
      const [oz, h] = anchors[s]; // offset runs along z because the crossarm is rotated
      for (let i = 0; i < POLE_COUNT - 1; i++) {
        const x0 = (base + i - POLE_COUNT / 2) * POLE_GAP;
        const x1 = x0 + POLE_GAP;
        const last = (i === POLE_COUNT - 2);
        for (let j = 0; j < segs + (last ? 1 : 0); j++) {
          const t = j / segs;
          arr[p++] = x0 + (x1 - x0) * t;
          arr[p++] = h - Math.sin(Math.PI * t) * 1.2; // the sag
          arr[p++] = POLE_Z + oz;
        }
      }
      this.wires[s].geometry.attributes.position.needsUpdate = true;
    }
  }

  _buildBottles() {
    // one potential almond-water bottle per chunk slot
    const body = new THREE.CylinderGeometry(0.09, 0.1, 0.34, 8);
    const mat = new THREE.MeshLambertMaterial({ color: 0xdfe8e2, emissive: 0x39443f });
    const capMat = new THREE.MeshLambertMaterial({ color: 0x8a4f4f });
    this.bottles = [];
    for (let i = 0; i < SLOTS; i++) {
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(body, mat));
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.07, 8), capMat);
      cap.position.y = 0.2;
      grp.add(cap);
      grp.visible = false;
      this.scene.add(grp);
      this.bottles.push(grp);
    }
  }

  _reseedSlot(cx, cz) {
    const slot = mod(cx, GRID) + mod(cz, GRID) * GRID;
    const cur = this.slots[slot];
    if (cur && cur.cx === cx && cur.cz === cz) return false;
    this.slots[slot] = { cx, cz };

    const rnd = rng(cx, cz);
    const bx = cx * CHUNK, bz = cz * CHUNK;
    const t = rnd();
    const type = t < 0.52 ? 'wheat' : t < 0.82 ? 'barley' : 'fallow';

    // --- crop ---
    for (let i = 0; i < WHEAT_N; i++) {
      const idx = slot * WHEAT_N + i;
      const x = bx + rnd() * CHUNK;
      const z = bz + rnd() * CHUNK;
      let used = type !== 'fallow' || rnd() < 0.06;
      if (Math.hypot(x, z) < 19) used = false;                    // the yard clearing
      if (Math.abs(x) < 2.6 && z > 0 && z < 75) used = false;     // the dirt path
      const s = used ? 0.75 + rnd() * 0.6 : 0.0001;   // chest-high at most
      _pos.set(x, 0, z);
      _quat.setFromAxisAngle(_up, rnd() * Math.PI * 2);
      _scl.set(s, s * (0.85 + rnd() * 0.3), s);
      this.wheat.setMatrixAt(idx, _mat.compose(_pos, _quat, _scl));
      _col.set(type === 'barley' ? 0xb7c08a : 0xcdb078).multiplyScalar(0.85 + rnd() * 0.3);
      this.wheat.setColorAt(idx, _col);
    }

    // --- tree line along the north edge of some chunks ---
    const hasTrees = rnd() < 0.4;
    for (let i = 0; i < TREE_N; i++) {
      const idx = slot * TREE_N + i;
      const x = bx + i * (CHUNK / TREE_N) + rnd() * 5;
      const z = bz + rnd() * 2.5;
      const used = hasTrees && Math.hypot(x, z) > 26;
      const s = used ? 0.8 + rnd() * 0.8 : 0.0001;
      _quat.setFromAxisAngle(_up, rnd() * Math.PI * 2);
      _pos.set(x, 1.3 * s, z); _scl.set(s, s, s);
      this.trunks.setMatrixAt(idx, _mat.compose(_pos, _quat, _scl));
      _pos.set(x, 2.6 * s + 1.6 * s, z);
      this.canopies.setMatrixAt(idx, _mat.compose(_pos, _quat, _scl));
    }

    // --- bushes scattered about ---
    for (let i = 0; i < BUSH_N; i++) {
      const idx = slot * BUSH_N + i;
      const x = bx + rnd() * CHUNK, z = bz + rnd() * CHUNK;
      const used = rnd() < 0.55 && Math.hypot(x, z) > 22;
      const s = used ? 0.5 + rnd() * 0.9 : 0.0001;
      _pos.set(x, 0.45 * s, z);
      _quat.setFromAxisAngle(_up, rnd() * Math.PI * 2);
      _scl.set(s, s * 0.7, s);
      this.bushes.setMatrixAt(idx, _mat.compose(_pos, _quat, _scl));
    }

    // --- wire fence along the east edge of some chunks ---
    const hasFence = rnd() < 0.32;
    const fx = bx + CHUNK;
    for (let i = 0; i < POST_N; i++) {
      const idx = slot * POST_N + i;
      const z = bz + i * 4;
      const used = hasFence && Math.hypot(fx, z) > 20;
      const s = used ? 1 : 0.0001;
      _pos.set(fx, 0.6, z); _quat.identity(); _scl.set(s, s, s);
      this.posts.setMatrixAt(idx, _mat.compose(_pos, _quat, _scl));
    }
    for (let i = 0; i < RAIL_N; i++) {
      const idx = slot * RAIL_N + i;
      const span = Math.floor(i / 2);            // 10 spans...
      const level = i % 2 ? 0.42 : 0.88;         // ...two rails each
      const z = bz + span * 4 + 2;
      const used = hasFence && Math.hypot(fx, z) > 20;
      const s = used ? 1 : 0.0001;
      _pos.set(fx, level, z); _quat.identity(); _scl.set(s, s, s);
      this.rails.setMatrixAt(idx, _mat.compose(_pos, _quat, _scl));
    }

    // --- maybe an almond water bottle, deep in the fields ---
    const bottle = this.bottles[slot];
    const id = cx + ',' + cz;
    const centerDist = Math.hypot(bx + CHUNK / 2, bz + CHUNK / 2);
    if (centerDist > 80 && rnd() < 0.22 && !State.collectedPickups.includes(id)) {
      bottle.position.set(bx + 6 + rnd() * 28, 0.18, bz + 6 + rnd() * 28);
      bottle.visible = true;
      bottle.userData.id = id;
    } else {
      bottle.visible = false;
    }
    return true;
  }

  update(dt, playerPos, inYard) {
    this.uTime.value += dt;

    // recycle chunks around the player
    const pcx = Math.floor(playerPos.x / CHUNK);
    const pcz = Math.floor(playerPos.z / CHUNK);
    if (pcx !== this._pcx || pcz !== this._pcz) {
      this._pcx = pcx; this._pcz = pcz;
      let changed = false;
      for (let dz = -HALF; dz <= HALF; dz++) {
        for (let dx = -HALF; dx <= HALF; dx++) {
          if (this._reseedSlot(pcx + dx, pcz + dz)) changed = true;
        }
      }
      if (changed) {
        for (const m of this._instanced) m.instanceMatrix.needsUpdate = true;
        if (this.wheat.instanceColor) this.wheat.instanceColor.needsUpdate = true;
      }
    }

    // ground + power line follow the player
    this.ground.position.set(Math.round(playerPos.x / 6.5) * 6.5, 0, Math.round(playerPos.z / 6.5) * 6.5);
    const base = Math.round(playerPos.x / POLE_GAP);
    if (base !== this._poleBase) {
      this._poleBase = base;
      this._layoutPoles(base);
    }

    // --- the dread gradient ---
    const d = Math.hypot(playerPos.x, playerPos.z);
    State.distance = d;
    if (!inYard) State.maxDistance = Math.max(State.maxDistance, d);
    let target = THREE.MathUtils.smoothstep(d, 30, 220);
    if (inYard) target = 0;
    this.fear = THREE.MathUtils.damp(this.fear, target, 1.1, dt);
    State.fear = this.fear;

    const f = this.fear;
    this.skyColor.lerpColors(this._day, this._night, f);
    this.scene.fog.density = 0.012 + f * 0.034;
    this.hemi.intensity = 1.0 - f * 0.86;
    this.dir.intensity = 0.65 - f * 0.6;

    // almond water pickups
    for (const bottle of this.bottles) {
      if (!bottle.visible) continue;
      const dx = bottle.position.x - playerPos.x;
      const dz = bottle.position.z - playerPos.z;
      if (dx * dx + dz * dz < 2.3) {
        bottle.visible = false;
        State.collectedPickups.push(bottle.userData.id);
        State.inventory.almondWater++;
        State.totalAlmondFound++;
        bus.emit('pickup', { what: 'almondWater' });
      }
    }
  }
}
