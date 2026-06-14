// world.js — the endless Level 10 fields, and the "dread gradient":
// the further you walk from the house, the darker and foggier the world gets.
//
// The infinite-field trick: the world is a 5×5 grid of 40m chunks that follows
// the player. When you cross a chunk boundary, the chunks that fell behind are
// re-seeded in front of you. Content is generated from a hash of the chunk
// coordinates, so if you walk back, the exact same field is waiting for you.

import * as THREE from 'three';
import { State, bus } from './state.js';
import { unlocked } from './progression.js';
import { seedForDepth } from './garden.js';
import { eggTierForDepth, EGG_TIERS } from './pets.js';
import { POND_POS, POND_R, RIVER_POINTS } from './fishing.js';
import { WCD_POS, WCD_R } from './wcdonalds.js';
import { BARN_POS } from './boss.js';
import { ARCADE_POS, ARCADE_W, ARCADE_D } from './arcade.js';
import { OTHER_POS } from './othershouse.js';
import { contactDisc } from './gfx.js';

function inArcadeFootprint(x, z) {
  return Math.abs(x - ARCADE_POS.x) < ARCADE_W / 2 + 3 &&
         Math.abs(z - ARCADE_POS.z) < ARCADE_D / 2 + 3;
}
function inOtherFootprint(x, z) {   // the Other House clearing (~700m)
  return Math.abs(x - OTHER_POS.x) < 7.5 && Math.abs(z - OTHER_POS.z) < 6.5;
}

const CHUNK = 40;
const GRID = 5;
const HALF = Math.floor(GRID / 2);
const SLOTS = GRID * GRID;

const WHEAT_N = 380;  // wheat clumps per chunk (≈9.5k instances total)
const GRASS_N = 300;  // low grass tufts that hide the bare ground
const TREE_N = 6;
const BUSH_N = 7;
const POST_N = 11;
const RAIL_N = 20;

const POLE_COUNT = 12;
const POLE_GAP = 35;
const POLE_Z = -25;   // the power line runs east-west, north of the house

function mod(n, m) { return ((n % m) + m) % m; }

// is (x,z) close to the river's course? (keeps wheat off the water)
function nearRiver(x, z, r) {
  for (const [rx, rz] of RIVER_POINTS) {
    const dx = x - rx, dz = z - rz;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

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

// the wheat "art" is painted onto a canvas at boot — no image files anywhere.
// many thin near-vertical blades + fine seed heads reads as a real crop.
function makeWheatTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 256;
  const g = cv.getContext('2d');
  for (let i = 0; i < 20; i++) {
    const x = 5 + i * 7.5 + (Math.random() * 5 - 2.5);
    const lean = Math.random() * 10 - 5;
    const top = 30 + Math.random() * 40;
    const a = 0.55 + Math.random() * 0.4;
    g.strokeStyle = `rgba(255,246,220,${a})`;
    g.lineWidth = 1 + Math.random() * 0.8;
    g.beginPath();
    g.moveTo(x + (Math.random() * 8 - 4), 256);
    g.quadraticCurveTo(x + lean, 150, x + lean, top);
    g.stroke();
    if (Math.random() < 0.7) {            // most blades carry a seed head
      g.fillStyle = `rgba(255,240,200,${a})`;
      for (let s = 0; s < 8; s++) {
        g.beginPath();
        g.ellipse(x + lean + (s % 2 ? -1.7 : 1.7), top + 14 - s * 2.6, 1.7, 3.1, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  // root-shadow: real crops are dark at the soil and pale at the seed heads
  g.globalCompositeOperation = 'source-atop';
  const shadeGrad = g.createLinearGradient(0, 0, 0, 256);
  shadeGrad.addColorStop(0, 'rgba(255,250,225,0.14)');
  shadeGrad.addColorStop(0.55, 'rgba(0,0,0,0)');
  shadeGrad.addColorStop(1, 'rgba(38,28,12,0.55)');
  g.fillStyle = shadeGrad;
  g.fillRect(0, 0, 128, 256);
  g.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGrassTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const g = cv.getContext('2d');
  for (let i = 0; i < 22; i++) {
    const x = 4 + i * 5.6 + (Math.random() * 4 - 2);
    const a = 0.5 + Math.random() * 0.45;
    g.strokeStyle = `rgba(235,245,210,${a})`;
    g.lineWidth = 1 + Math.random();
    g.beginPath();
    g.moveTo(x + (Math.random() * 8 - 4), 128);
    g.quadraticCurveTo(x, 70, x + (Math.random() * 14 - 7), 8 + Math.random() * 45);
    g.stroke();
  }
  g.globalCompositeOperation = 'source-atop';
  const shadeGrad = g.createLinearGradient(0, 0, 0, 128);
  shadeGrad.addColorStop(0, 'rgba(245,255,225,0.1)');
  shadeGrad.addColorStop(1, 'rgba(20,26,10,0.5)');
  g.fillStyle = shadeGrad;
  g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeDirtTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 512;
  const g = cv.getContext('2d');
  g.fillStyle = '#6f6a52';
  g.fillRect(0, 0, 512, 512);
  // big soft tonal patches break up the obvious tiling
  const tones = ['#5d5944', '#7a755b', '#67644b', '#736d50', '#615c46'];
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 512, y = Math.random() * 512, r = 30 + Math.random() * 96;
    const grad = g.createRadialGradient(x, y, 3, x, y, r);
    const c = tones[(Math.random() * tones.length) | 0];
    grad.addColorStop(0, c + 'aa');
    grad.addColorStop(1, c + '00');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // faint plough scratches — broken little arcs, never a repeating row
  for (let i = 0; i < 130; i++) {
    g.strokeStyle = `rgba(44,38,24,${0.08 + Math.random() * 0.1})`;
    g.lineWidth = 1 + Math.random() * 1.4;
    const x = Math.random() * 512, y = Math.random() * 512;
    const len = 20 + Math.random() * 60, a = (Math.random() - 0.5) * 0.7;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + len / 2, y + Math.sin(a) * 8, x + len, y + (Math.random() - 0.5) * 10);
    g.stroke();
  }
  // grit: dark crumbs and pale flecks (tiny stones catching the light)
  for (let i = 0; i < 9000; i++) {
    const v = Math.random();
    g.fillStyle = v < 0.5 ? 'rgba(38,34,22,0.22)' : v < 0.94 ? 'rgba(198,186,140,0.16)' : 'rgba(232,226,200,0.3)';
    g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(22, 22);
  return tex;
}

// the eternally-overcast cloud deck: soft blobs on a slow-drifting dome
function makeCloudTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 256;
  const g = cv.getContext('2d');
  for (let i = 0; i < 110; i++) {
    const x = Math.random() * 512;
    const y = 30 + Math.random() * 170;
    const r = 18 + Math.random() * 64;
    const a = 0.04 + Math.random() * 0.1;
    const grad = g.createRadialGradient(x, y, r * 0.15, x, y, r);
    const tone = Math.random() < 0.6 ? '236,239,241' : '205,212,218';
    grad.addColorStop(0, `rgba(${tone},${a})`);
    grad.addColorStop(1, `rgba(${tone},0)`);
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

// a soft horizontal wisp for the ground-fog billboards: ONE smooth elongated
// gradient (discrete blobs read as rows of dots at a distance — learned that)
function makeFogTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  g.save();
  g.translate(128, 36);
  g.scale(4.2, 1);                       // stretch the radial into a long wisp
  const grad = g.createRadialGradient(0, 0, 2, 0, 0, 30);
  grad.addColorStop(0, 'rgba(255,255,255,0.5)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(-32, -36, 64, 72);
  g.restore();
  return new THREE.CanvasTexture(cv);
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

    this._day = new THREE.Color(0xaeb9bf);     // leaden overcast sky
    this._night = new THREE.Color(0x07090f);   // deep-field night
    this._bloodNight = new THREE.Color(0x2a0708); // harvest night
    this.harvestNight = false;
    this.skyColor = this._day.clone();
    scene.background = this.skyColor;
    scene.fog = new THREE.FogExp2(this.skyColor.getHex(), 0.012);
    scene.fog.color = this.skyColor;           // fog and sky share one Color object

    this.hemi = new THREE.HemisphereLight(0xc9d2d6, 0x5d5742, 1.6);
    scene.add(this.hemi);
    this.dir = new THREE.DirectionalLight(0xfff4e0, 1.05);
    this.dir.position.set(40, 60, 20);
    scene.add(this.dir);

    // overcast sky dome: a soft vertical gradient that the fog melts into
    this.skyTop = new THREE.Color();
    this.skyBottom = new THREE.Color();
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: this.skyTop },
        bottomColor: { value: this.skyBottom },
      },
      vertexShader: `varying vec3 vPos;
        void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 vPos;
        void main() {
          float h = normalize(vPos).y;
          float t = smoothstep(-0.04, 0.5, h);
          gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(340, 24, 12), skyMat);
    scene.add(this.dome);

    // the cloud deck rides just inside the sky dome, drifting forever
    this.cloudTex = makeCloudTexture();
    this.cloudMat = new THREE.MeshBasicMaterial({
      map: this.cloudTex, transparent: true, opacity: 0.5,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(330, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.cloudMat);
    this.clouds.renderOrder = 1;
    scene.add(this.clouds);

    // low fog that prowls the deep fields (billboards; only visible when feared)
    this.fogTex = makeFogTexture();
    this.fogQuads = [];
    for (let i = 0; i < 6; i++) {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(30, 7),
        new THREE.MeshBasicMaterial({
          map: this.fogTex, transparent: true, opacity: 0, depthWrite: false, fog: false,
        }));
      q.userData.angle = (i / 6) * Math.PI * 2;
      q.userData.dist = 26 + i * 7;
      q.renderOrder = 2;
      scene.add(q);
      this.fogQuads.push(q);
    }

    // weather days: rain as short streaks that follow the player (hidden unless raining)
    this.weather = 'clear';   // 'clear' | 'fog' | 'rain' — set by main each day
    this.indoors = false;     // main flags this when the player is sheltered (no rain inside)
    const RAIN_N = 320;
    this._drops = [];
    this._rainPos = new Float32Array(RAIN_N * 2 * 3);
    for (let i = 0; i < RAIN_N; i++) {
      this._drops.push({
        lx: (Math.random() - 0.5) * 46, lz: (Math.random() - 0.5) * 46,
        y: Math.random() * 22, spd: 22 + Math.random() * 10, len: 0.5 + Math.random() * 0.4,
      });
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(this._rainPos, 3));
    this.rain = new THREE.LineSegments(rainGeo,
      new THREE.LineBasicMaterial({ color: 0x9fb4c8, transparent: true, opacity: 0.42, fog: true, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);

    // fake contact shadows ground the landmarks to the soil
    const houseAO = contactDisc(11);
    scene.add(houseAO);
    const barnAO = contactDisc(9);
    barnAO.position.set(BARN_POS.x, 0.025, BARN_POS.z);
    scene.add(barnAO);
    const wcdAO = contactDisc(10);
    wcdAO.position.set(WCD_POS.x, 0.025, WCD_POS.z);
    scene.add(wcdAO);

    // ground: one big plane that quietly follows the player
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 260),
      new THREE.MeshLambertMaterial({ map: makeDirtTexture(), color: 0xd8d2c0 })
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
      map: makeWheatTexture(), alphaTest: 0.4, side: THREE.DoubleSide, color: 0xffffff,
    });
    if (supportsWind) this._windify(wheatMat);
    this.wheat = new THREE.InstancedMesh(crossQuadGeometry(1.8, 1.15), wheatMat, WHEAT_N * SLOTS);
    this.wheat.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.wheat.frustumCulled = false;
    // create the per-instance color buffer up front
    for (let i = 0; i < WHEAT_N * SLOTS; i++) this.wheat.setColorAt(i, _col.set(0xcdb078));
    this.scene.add(this.wheat);

    // low grass everywhere — hides the bare ground plane, the #1 "blocky" tell
    const grassMat = new THREE.MeshLambertMaterial({
      map: makeGrassTexture(), alphaTest: 0.4, side: THREE.DoubleSide, color: 0xffffff,
    });
    if (supportsWind) this._windify(grassMat);
    this.grass = new THREE.InstancedMesh(crossQuadGeometry(1.2, 0.5), grassMat, GRASS_N * SLOTS);
    this.grass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.grass.frustumCulled = false;
    for (let i = 0; i < GRASS_N * SLOTS; i++) this.grass.setColorAt(i, _col.set(0x77754e));
    this.scene.add(this.grass);

    const mk = (geo, color, count) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color }), count * SLOTS);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      this.scene.add(m);
      return m;
    };
    this.trunks = mk(new THREE.CylinderGeometry(0.14, 0.32, 2.6, 7), 0x4a3b2a, TREE_N);
    const canopyGeo = new THREE.IcosahedronGeometry(1.9, 1);   // soft round crown
    canopyGeo.scale(1, 0.85, 1);
    this.canopies = mk(canopyGeo, 0x4d5c42, TREE_N);
    this.canopies2 = mk(new THREE.IcosahedronGeometry(1.15, 1), 0x576648, TREE_N); // a second blob breaks the lollipop look
    this.bushes = mk(new THREE.IcosahedronGeometry(0.95, 1), 0x46523c, BUSH_N);
    this.posts = mk(new THREE.BoxGeometry(0.14, 1.2, 0.14), 0x5d5243, POST_N);
    this.rails = mk(new THREE.BoxGeometry(0.05, 0.06, 4.05), 0x6b5f4c, RAIL_N);
    this._instanced = [this.wheat, this.grass, this.trunks, this.canopies, this.canopies2, this.bushes, this.posts, this.rails];
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
    // one potential almond-water bottle, seed pouch, and egg per chunk slot
    const body = new THREE.CylinderGeometry(0.09, 0.1, 0.34, 8);
    const mat = new THREE.MeshLambertMaterial({ color: 0xdfe8e2, emissive: 0x39443f });
    const capMat = new THREE.MeshLambertMaterial({ color: 0x8a4f4f });
    this.bottles = [];
    this.pouches = [];
    this.eggs = [];
    this.tapes = [];
    const pouchGeo = new THREE.SphereGeometry(0.18, 7, 6);
    const pouchMat = new THREE.MeshLambertMaterial({ color: 0x8a6a3e, emissive: 0x2e2010 });
    const eggGeo = new THREE.SphereGeometry(0.2, 9, 8);
    for (let i = 0; i < SLOTS; i++) {
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(body, mat));
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.07, 8), capMat);
      cap.position.y = 0.2;
      grp.add(cap);
      grp.visible = false;
      this.scene.add(grp);
      this.bottles.push(grp);

      const pouch = new THREE.Mesh(pouchGeo, pouchMat);
      pouch.scale.y = 1.2;
      pouch.visible = false;
      this.scene.add(pouch);
      this.pouches.push(pouch);

      const egg = new THREE.Mesh(eggGeo, new THREE.MeshLambertMaterial({ color: 0xd8d2c0, emissive: 0x222018 }));
      egg.scale.y = 1.3;
      egg.visible = false;
      this.scene.add(egg);
      this.eggs.push(egg);

      const tape = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.2),
        new THREE.MeshLambertMaterial({ color: 0x2a2a30, emissive: 0x101018 }));
      tape.visible = false;
      this.scene.add(tape);
      this.tapes.push(tape);
    }

    // the lost bag: a little sack with a light pillar so it's findable at night
    this.bag = new THREE.Group();
    const sack = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 7),
      new THREE.MeshLambertMaterial({ color: 0x6a5436 }));
    sack.scale.y = 1.15;
    sack.position.y = 0.3;
    this.bag.add(sack);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 9, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.16, fog: false, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 4.5;
    this.bag.add(beam);
    this.bag.visible = false;
    this.scene.add(this.bag);
  }

  // weak phone? shed the pure-mood layers, keep the game identical
  setLowQuality() {
    this.clouds.visible = false;
    for (const q of this.fogQuads) q.visible = false;
  }

  // for the Wheat Sprite pet: rough direction of the nearest visible treasure
  nearestTreasureDir(pos, range) {
    let best = null, bestD = range;
    for (const list of [this.bottles, this.pouches, this.eggs, this.tapes]) {
      for (const m of list) {
        if (!m.visible) continue;
        const d = Math.hypot(m.position.x - pos.x, m.position.z - pos.z);
        if (d < bestD) { bestD = d; best = m; }
      }
    }
    if (!best) return null;
    const a = Math.atan2(best.position.x - pos.x, -(best.position.z - pos.z));
    const dirs = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
    return dirs[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
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
      if (Math.hypot(x - POND_POS.x, z - POND_POS.z) < POND_R + 2.4) used = false; // the pond
      if (Math.hypot(x - WCD_POS.x, z - WCD_POS.z) < WCD_R) used = false;          // the restaurant
      if (used && nearRiver(x, z, 3.4)) used = false;                              // the river
      if (used && inArcadeFootprint(x, z)) used = false;                           // Level 3999
      if (used && inOtherFootprint(x, z)) used = false;                            // The Other House
      const s = used ? 0.75 + rnd() * 0.6 : 0.0001;   // chest-high at most
      _pos.set(x, 0, z);
      _quat.setFromAxisAngle(_up, rnd() * Math.PI * 2);
      _scl.set(s, s * (0.85 + rnd() * 0.3), s);
      this.wheat.setMatrixAt(idx, _mat.compose(_pos, _quat, _scl));
      _col.set(type === 'barley' ? 0xb7c08a : 0xcdb078).multiplyScalar(0.85 + rnd() * 0.3);
      this.wheat.setColorAt(idx, _col);
    }

    // --- low grass scattered everywhere (even fallow plots) ---
    for (let i = 0; i < GRASS_N; i++) {
      const idx = slot * GRASS_N + i;
      const x = bx + rnd() * CHUNK;
      const z = bz + rnd() * CHUNK;
      let used = true;
      if (Math.hypot(x, z) < 16) used = false;
      if (Math.abs(x) < 2.4 && z > 0 && z < 75) used = false;
      if (Math.hypot(x - POND_POS.x, z - POND_POS.z) < POND_R + 1.5) used = false;
      if (Math.hypot(x - WCD_POS.x, z - WCD_POS.z) < WCD_R - 1) used = false;
      if (used && nearRiver(x, z, 2.6)) used = false;
      if (used && inArcadeFootprint(x, z)) used = false;
      if (used && inOtherFootprint(x, z)) used = false;
      const s = used ? 0.7 + rnd() * 0.9 : 0.0001;
      _pos.set(x, 0, z);
      _quat.setFromAxisAngle(_up, rnd() * Math.PI * 2);
      _scl.set(s, s * (0.8 + rnd() * 0.5), s);
      this.grass.setMatrixAt(idx, _mat.compose(_pos, _quat, _scl));
      _col.set(0x7c7a52).offsetHSL(0, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.12);
      this.grass.setColorAt(idx, _col);
    }

    // --- tree line along the north edge of some chunks ---
    const hasTrees = rnd() < 0.4;
    for (let i = 0; i < TREE_N; i++) {
      const idx = slot * TREE_N + i;
      const x = bx + i * (CHUNK / TREE_N) + rnd() * 5;
      const z = bz + rnd() * 2.5;
      const used = hasTrees && Math.hypot(x, z) > 26 &&
        Math.hypot(x - WCD_POS.x, z - WCD_POS.z) > WCD_R + 3 &&
        !inArcadeFootprint(x, z) && !inOtherFootprint(x, z);
      const s = used ? 0.8 + rnd() * 0.8 : 0.0001;
      _quat.setFromAxisAngle(_up, rnd() * Math.PI * 2);
      _pos.set(x, 1.3 * s, z); _scl.set(s, s, s);
      this.trunks.setMatrixAt(idx, _mat.compose(_pos, _quat, _scl));
      _pos.set(x, 2.6 * s + 1.6 * s, z);
      this.canopies.setMatrixAt(idx, _mat.compose(_pos, _quat, _scl));
      _pos.set(x + (rnd() - 0.5) * 2.2 * s, 2.6 * s + 2.2 * s, z + (rnd() - 0.5) * 1.6 * s);
      this.canopies2.setMatrixAt(idx, _mat.compose(_pos, _quat, _scl));
    }

    // --- bushes scattered about ---
    for (let i = 0; i < BUSH_N; i++) {
      const idx = slot * BUSH_N + i;
      const x = bx + rnd() * CHUNK, z = bz + rnd() * CHUNK;
      const used = rnd() < 0.55 && Math.hypot(x, z) > 22 &&
        Math.hypot(x - WCD_POS.x, z - WCD_POS.z) > WCD_R &&
        Math.hypot(x - POND_POS.x, z - POND_POS.z) > POND_R &&
        !inArcadeFootprint(x, z) && !inOtherFootprint(x, z);
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

    // --- maybe loot, deep in the fields (deeper = better) ---
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
    const pouch = this.pouches[slot];
    if (centerDist > 75 && rnd() < 0.18 && unlocked('garden') && !State.collectedPickups.includes('s:' + id)) {
      pouch.position.set(bx + 6 + rnd() * 28, 0.2, bz + 6 + rnd() * 28);
      pouch.visible = true;
      pouch.userData.id = 's:' + id;
      pouch.userData.dist = centerDist;
    } else {
      pouch.visible = false;
    }
    const egg = this.eggs[slot];
    if (centerDist > 75 && rnd() < 0.12 && unlocked('pets') && !State.collectedPickups.includes('e:' + id)) {
      egg.position.set(bx + 6 + rnd() * 28, 0.24, bz + 6 + rnd() * 28);
      egg.visible = true;
      egg.userData.id = 'e:' + id;
      const tier = eggTierForDepth(centerDist);
      egg.userData.tier = tier;
      egg.material.color.setHex(EGG_TIERS[tier].color);
    } else {
      egg.visible = false;
    }
    const tape = this.tapes[slot];
    if (centerDist > 100 && rnd() < 0.07 && State.tapes.length < 5 && !State.collectedPickups.includes('t:' + id)) {
      tape.position.set(bx + 8 + rnd() * 24, 0.12, bz + 8 + rnd() * 24);
      tape.visible = true;
      tape.userData.id = 't:' + id;
    } else {
      tape.visible = false;
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
        if (this.grass.instanceColor) this.grass.instanceColor.needsUpdate = true;
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
    this.skyColor.lerpColors(this._day, this.harvestNight ? this._bloodNight : this._night, this.harvestNight ? Math.max(f, 0.85) : f);
    // weather days: rain greys the sky down
    if (this.weather === 'rain') this.skyColor.multiplyScalar(0.78);
    // inside Level 3999 the haze stands down — neon needs clean air
    let dens = this.lowFog ? 0.004 : 0.012 + f * 0.034;
    if (!this.lowFog && this.weather === 'fog') dens += 0.014;   // a real morning murk
    if (!this.lowFog && this.weather === 'rain') dens += 0.007;
    this.scene.fog.density = dens;
    const wdim = this.weather === 'clear' ? 0 : 0.18;            // overcast-er on weather days
    this.hemi.intensity = (1.6 - f * 1.42) * (1 - wdim);
    this.dir.intensity = (1.05 - f * 0.97) * (1 - wdim);
    // sky dome: horizon slightly brighter than the zenith = overcast
    this.skyBottom.copy(this.skyColor).multiplyScalar(1.18);
    this.skyTop.copy(this.skyColor).multiplyScalar(0.9);
    this.dome.position.set(playerPos.x, 0, playerPos.z);
    // clouds drift, then dissolve into the deep-field dark
    this.clouds.position.set(playerPos.x, 0, playerPos.z);
    this.cloudTex.offset.x += dt * 0.0024;
    this.cloudMat.opacity = 0.5 * (1 - f * 0.92);
    // ground fog prowls in a slow ring; only thick when the dread is.
    // tinted to the live sky so it reads as haze, never as glowing shapes
    for (const q of this.fogQuads) {
      q.userData.angle += dt * 0.012;
      const a = q.userData.angle;
      q.position.set(playerPos.x + Math.cos(a) * q.userData.dist, 1.9,
        playerPos.z + Math.sin(a) * q.userData.dist);
      q.lookAt(playerPos.x, 1.7, playerPos.z);
      q.material.color.copy(this.skyColor).multiplyScalar(1.6);
      q.material.opacity = f * 0.22 + (this.weather === 'fog' ? 0.13 * (1 - f) : 0);
    }

    // rain streaks falling around the player (weather days)
    this.rain.visible = this.weather === 'rain' && !this.indoors;
    if (this.rain.visible) {
      const pos = this._rainPos;
      for (let i = 0; i < this._drops.length; i++) {
        const d = this._drops[i];
        d.y -= d.spd * dt;
        if (d.y < 0.2) {
          d.y = 17 + Math.random() * 8;
          d.lx = (Math.random() - 0.5) * 46; d.lz = (Math.random() - 0.5) * 46;
        }
        const o = i * 6, x = playerPos.x + d.lx, z = playerPos.z + d.lz;
        pos[o] = x; pos[o + 1] = d.y; pos[o + 2] = z;
        pos[o + 3] = x; pos[o + 4] = d.y - d.len; pos[o + 5] = z;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }

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
    // seed pouches + eggs (these go into the expedition's pending loot)
    for (const pouch of this.pouches) {
      if (!pouch.visible) continue;
      const dx = pouch.position.x - playerPos.x, dz = pouch.position.z - playerPos.z;
      if (dx * dx + dz * dz < 2.3) {
        pouch.visible = false;
        State.collectedPickups.push(pouch.userData.id);
        bus.emit('seedFound', { crop: seedForDepth(pouch.userData.dist) });
      }
    }
    for (const egg of this.eggs) {
      if (!egg.visible) continue;
      const dx = egg.position.x - playerPos.x, dz = egg.position.z - playerPos.z;
      if (dx * dx + dz * dz < 2.3) {
        egg.visible = false;
        State.collectedPickups.push(egg.userData.id);
        bus.emit('eggFound', { tier: egg.userData.tier });
      }
    }
    for (const tape of this.tapes) {
      if (!tape.visible) continue;
      const dx = tape.position.x - playerPos.x, dz = tape.position.z - playerPos.z;
      if (dx * dx + dz * dz < 2.3) {
        tape.visible = false;
        State.collectedPickups.push(tape.userData.id);
        bus.emit('tapeFound', {});
      }
    }
    // the lost bag, if one is out there
    if (State.lostBag) {
      this.bag.visible = true;
      this.bag.position.set(State.lostBag.x, 0, State.lostBag.z);
    } else {
      this.bag.visible = false;
    }
  }
}
