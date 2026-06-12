// house.js — the safe house at spawn: a 2-story, 3-bed, 3-bath home with a
// fenced yard. Also owns simple "walls are rectangles" collision and the
// groundHeight() function that makes stairs work without a physics engine.

import * as THREE from 'three';

// merge a list of indexed BufferGeometries (Box/Plane/Cylinder/...) into one,
// so the whole house is a handful of draw calls instead of ~80
export function mergeGeos(geos) {
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
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
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

// --- procedural building textures (painted at boot, no asset files) ---
function plankTexture(base, jitter, plankPx, grain) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 256;
  const g = cv.getContext('2d');
  for (let y = 0; y < 256; y += plankPx) {
    const l = (Math.random() - 0.5) * jitter;
    g.fillStyle = shade(base, l);
    g.fillRect(0, y, 256, plankPx);
    g.fillStyle = 'rgba(30,24,16,0.45)';
    g.fillRect(0, y, 256, 1.5);                       // seam between planks
    for (let i = 0; i < grain; i++) {                 // wood grain streaks
      g.strokeStyle = `rgba(40,30,18,${0.05 + Math.random() * 0.1})`;
      g.lineWidth = 0.8;
      const gy = y + 2 + Math.random() * (plankPx - 3);
      g.beginPath();
      g.moveTo(Math.random() * 100, gy);
      g.lineTo(Math.random() * 100 + 156, gy + (Math.random() * 2 - 1));
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function shingleTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#3a3e44';
  g.fillRect(0, 0, 256, 256);
  const row = 26, col = 42;
  for (let y = 0; y < 256; y += row) {
    const off = ((y / row) % 2) * (col / 2);
    for (let x = -col; x < 256 + col; x += col) {
      g.fillStyle = shade('#41464d', (Math.random() - 0.5) * 18);
      g.fillRect(x + off + 1, y + 1, col - 2, row - 2);
    }
    g.fillStyle = 'rgba(10,12,14,0.6)';
    g.fillRect(0, y, 256, 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

// stretch a box's UVs so a repeating texture keeps real-world plank density
function scaleUVs(geo, w, h, d, tile) {
  const u = Math.max(w, d) / tile;
  const v = Math.max(h, Math.min(w, d)) / tile;
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * u, uv.getY(i) * v);
}

const FOOT_X = 6, FOOT_Z = 4.5;       // house footprint half-sizes
const FLOOR2 = 2.8;                   // second floor height
// the staircase strip (runs along the north wall, climbing west → east)
const ST_X0 = -2, ST_X1 = 2.3, ST_Z0 = -4.5, ST_Z1 = -3.35;

export function buildHouse(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];

  // helper: collect boxes per material, optionally registering a collider.
  // `tile` (meters per texture repeat) makes plank/shingle textures line up.
  function bucket(color, map, tile) {
    const geos = [];
    return {
      geos,
      box(w, h, d, x, y, z, opts = {}) {
        const g = new THREE.BoxGeometry(w, h, d);
        if (tile) scaleUVs(g, w, h, d, tile);
        if (opts.ry) g.rotateY(opts.ry);
        if (opts.rx) g.rotateX(opts.rx);
        g.translate(x, y, z);
        geos.push(g);
        if (opts.collide) {
          colliders.push({
            x0: x - w / 2, x1: x + w / 2,
            z0: z - d / 2, z1: z + d / 2,
            y0: y - h / 2, y1: y + h / 2,
          });
        }
      },
      cyl(rt, rb, h, x, y, z) {
        const g = new THREE.CylinderGeometry(rt, rb, h, 8);
        g.translate(x, y, z);
        geos.push(g);
      },
      build() {
        const mesh = new THREE.Mesh(
          mergeGeos(geos),
          new THREE.MeshLambertMaterial(map ? { map, color: 0xffffff } : { color })
        );
        group.add(mesh);
        return mesh;
      },
    };
  }
  function addCollider(x0, x1, z0, z1, y0, y1) { colliders.push({ x0, x1, z0, z1, y0, y1 }); }

  const walls = bucket(0, plankTexture('#cdc5b0', 26, 26, 3), 2.4);   // wood siding
  const floors = bucket(0, plankTexture('#8a6a48', 30, 32, 5), 2.2);  // floorboards
  const roof = bucket(0, shingleTexture(), 2.6);
  const wood = bucket(0x6e553c);
  const fabric = bucket(0x5a6c60);
  const white = bucket(0xd8d8d2);
  const mattress = bucket(0xcfc9b6);
  const books = bucket(0x74463a);
  const fence = bucket(0xb6ad98);

  // ================= exterior walls =================
  walls.box(12, 5.6, 0.28, 0, 2.8, -FOOT_Z, { collide: true });                 // north
  walls.box(5.2, 5.6, 0.28, -3.4, 2.8, FOOT_Z, { collide: true });              // south, left of door
  walls.box(5.2, 5.6, 0.28, 3.4, 2.8, FOOT_Z, { collide: true });               // south, right of door
  walls.box(1.6, 3.4, 0.28, 0, 3.9, FOOT_Z, { collide: true });                 // above the doorway
  walls.box(0.28, 5.6, 9, FOOT_X, 2.8, 0, { collide: true });                   // east
  walls.box(0.28, 5.6, 9, -FOOT_X, 2.8, 0, { collide: true });                  // west

  // ================= floors / ceiling / roof =================
  floors.box(12.4, 0.2, 9.4, 0, -0.06, 0);                                      // ground slab (top sits above the yard grass)
  floors.box(12, 0.22, 7.9, 0, FLOOR2 - 0.11, 0.55);                            // floor 2 (south of stairwell)
  floors.box(4, 0.22, 1.15, -4, FLOOR2 - 0.11, -3.925);                         // floor 2 west of stairwell
  floors.box(3.7, 0.22, 1.15, 4.15, FLOOR2 - 0.11, -3.925);                     // floor 2 east of stairwell
  roof.box(12.4, 0.2, 9.4, 0, 5.7, 0);                                          // ceiling
  roof.box(13, 0.2, 5.6, 0, 6.7, -2.35, { rx: 0.42 });                          // roof slopes
  roof.box(13, 0.2, 5.6, 0, 6.7, 2.35, { rx: -0.42 });
  floors.box(2.4, 0.18, 1.3, 0, 0.09, 5.15);                                    // porch step

  // ================= interior walls, floor 1 =================
  walls.box(0.18, 2.8, 2.4, 1.5, 1.4, -2.15, { collide: true });                // kitchen divider
  walls.box(1.2, 2.8, 0.18, -5.4, 1.4, 2, { collide: true });                   // bathroom wall (w/ door gap)
  walls.box(0.9, 2.8, 0.18, -3.45, 1.4, 2, { collide: true });
  walls.box(0.18, 2.8, 2.5, -3, 1.4, 3.25, { collide: true });

  // ================= stairs (visual only — groundHeight does the walking) ====
  for (let i = 0; i < 8; i++) {
    const h = 0.35 * (i + 1);
    wood.box(0.54, h, 1.1, ST_X0 + 0.27 + i * 0.5375, h / 2, -3.925);
  }
  // panel + collider so you can't wedge under the tall end of the stairs
  walls.box(2.1, 1.5, 1.05, 1.25, 0.75, -3.925);
  addCollider(0.2, 2.3, -4.45, -3.4, 0, 1.5);

  // ================= interior walls, floor 2 =================
  const W2Y = FLOOR2 + 1.4;
  walls.box(1.55, 2.8, 0.18, -5.225, W2Y, -1, { collide: true });               // corridor wall (3 door gaps)
  walls.box(3.1, 2.8, 0.18, -2.0, W2Y, -1, { collide: true });
  walls.box(3.1, 2.8, 0.18, 2.0, W2Y, -1, { collide: true });
  walls.box(1.55, 2.8, 0.18, 5.225, W2Y, -1, { collide: true });
  walls.box(0.18, 2.8, 5.5, -2, W2Y, 1.75, { collide: true });                  // bedroom dividers
  walls.box(0.18, 2.8, 5.5, 2, W2Y, 1.75, { collide: true });
  wood.box(3.7, 1.0, 0.08, -0.45, FLOOR2 + 0.5, -3.34);                         // stairwell railing
  addCollider(-2.3, 1.4, -3.42, -3.26, FLOOR2, FLOOR2 + 1.1);
  wood.box(0.08, 1.0, 1.1, -2.0, FLOOR2 + 0.5, -3.925);
  addCollider(-2.08, -1.92, -4.5, -3.35, FLOOR2, FLOOR2 + 1.1);

  // ================= furniture, floor 1 =================
  // kitchen (NE corner)
  white.box(0.95, 0.92, 0.66, 5.42, 0.46, -4.05, { collide: true });            // counter
  wood.box(1.95, 0.05, 0.7, 4.95, 0.95, -4.05);                                 // counter top
  white.box(0.85, 1.9, 0.8, 5.5, 0.95, -3.0, { collide: true });                // fridge
  const stove = bucket(0x33363b);
  stove.box(0.85, 0.95, 0.7, 3.35, 0.47, -4.03, { collide: true });             // stove
  stove.cyl(0.15, 0.15, 0.03, 3.15, 0.96, -4.1);                                // burners
  stove.cyl(0.15, 0.15, 0.03, 3.55, 0.96, -3.95);
  // the oven, under the counter — for baking yourself bread
  stove.box(0.85, 0.92, 0.68, 4.45, 0.46, -4.03, { collide: true });
  const applianceGlass = new THREE.MeshBasicMaterial({ color: 0x16181c });
  const ovenWin = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.42), applianceGlass);
  ovenWin.position.set(4.45, 0.5, -3.68);
  group.add(ovenWin);
  wood.box(0.55, 0.04, 0.05, 4.45, 0.82, -3.66);                                // oven handle
  // the microwave, on the counter — for zapping yourself snacks
  white.box(0.58, 0.36, 0.42, 5.42, 1.16, -4.08);
  const mwWin = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.24), applianceGlass);
  mwWin.position.set(5.34, 1.16, -3.86);
  group.add(mwWin);
  white.box(0.05, 0.3, 0.04, 5.68, 1.16, -3.88);                                // microwave handle
  // dining table + chairs
  wood.box(1.7, 0.08, 1.0, 3.8, 0.76, 1.6, { collide: true });
  wood.box(0.08, 0.72, 0.08, 3.1, 0.36, 1.2); wood.box(0.08, 0.72, 0.08, 4.5, 0.36, 1.2);
  wood.box(0.08, 0.72, 0.08, 3.1, 0.36, 2.0); wood.box(0.08, 0.72, 0.08, 4.5, 0.36, 2.0);
  for (const [cx, cz] of [[3.3, 2.5], [4.3, 2.5], [3.3, 0.7], [4.3, 0.7]]) {
    fabric.box(0.45, 0.45, 0.45, cx, 0.225, cz);
    fabric.box(0.45, 0.5, 0.08, cx, 0.7, cz + (cz > 1.6 ? 0.19 : -0.19));
  }
  // living room (west): sofa + bookshelf  (therapist chair+lamp live in therapist.js)
  fabric.box(2.0, 0.5, 0.9, -3.9, 0.25, 1.2, { collide: true });                // sofa seat
  fabric.box(2.0, 0.55, 0.22, -3.9, 0.78, 1.55);                                // sofa back
  fabric.box(0.22, 0.62, 0.9, -4.95, 0.56, 1.2);                                // sofa arms
  fabric.box(0.22, 0.62, 0.9, -2.85, 0.56, 1.2);
  wood.box(0.45, 2.2, 1.6, -5.7, 1.1, -0.5, { collide: true });                 // bookshelf
  for (let s = 0; s < 4; s++) wood.box(0.4, 0.04, 1.5, -5.66, 0.4 + s * 0.5, -0.5);
  for (let b = 0; b < 14; b++) {
    books.box(0.3, 0.34 + (b % 3) * 0.04, 0.09,
      -5.62, 0.6 + Math.floor(b / 5) * 0.5, -1.15 + (b % 5) * 0.27);
  }
  addCollider(-4.6, -3.4, -3.6, -2.5, 0, 1.4);                                  // therapist armchair zone
  // bathroom (SW corner)
  white.box(0.45, 0.42, 0.55, -5.45, 0.21, 4.0);                                // toilet
  white.box(0.45, 0.55, 0.18, -5.45, 0.6, 4.3);
  white.box(0.5, 0.8, 0.45, -3.6, 0.4, 4.1);                                    // sink

  // ================= furniture, floor 2 =================
  function bed(x, z, big) {
    const w = big ? 1.5 : 1.25, len = big ? 2.1 : 1.95;
    wood.box(w, 0.4, len, x, FLOOR2 + 0.2, z, { collide: true });
    mattress.box(w - 0.14, 0.2, len - 0.14, x, FLOOR2 + 0.5, z);
    white.box(w * 0.62, 0.13, 0.5, x, FLOOR2 + 0.63, z - len / 2 + 0.4);
    wood.box(w, 0.8, 0.1, x, FLOOR2 + 0.6, z - len / 2 - 0.05);                 // headboard
  }
  bed(4.3, 2.6, true);                                                          // master (the sleep spot)
  bed(0, 3.0, false);
  bed(-4.3, 3.0, false);
  wood.box(1.1, 0.9, 0.5, 2.6, FLOOR2 + 0.45, -0.5, { collide: true });         // dressers
  wood.box(1.1, 0.9, 0.5, -2.6, FLOOR2 + 0.45, -0.5, { collide: true });
  white.box(0.4, 0.4, 0.5, 5.6, FLOOR2 + 0.2, -0.6);                            // en-suite corners
  white.box(0.4, 0.4, 0.5, -5.6, FLOOR2 + 0.2, -0.6);
  white.box(0.4, 0.4, 0.5, 1.6, FLOOR2 + 0.2, 4.1);

  // ================= windows (one mesh, color follows the sky) =================
  const winGeos = [];
  const win = (x, y, z, ry) => {
    const g = new THREE.PlaneGeometry(1.3, 1.3);
    g.rotateY(ry);
    g.translate(x, y, z);
    winGeos.push(g);
  };
  win(-3.4, 1.6, FOOT_Z - 0.13, Math.PI); win(3.4, 1.6, FOOT_Z - 0.13, Math.PI);
  win(-3.4, FLOOR2 + 1.55, FOOT_Z - 0.13, Math.PI); win(3.4, FLOOR2 + 1.55, FOOT_Z - 0.13, Math.PI);
  win(4.5, 1.7, -FOOT_Z + 0.15, 0); win(-4.2, 1.7, -FOOT_Z + 0.15, 0);
  win(-4, FLOOR2 + 1.55, -FOOT_Z + 0.15, 0); win(4, FLOOR2 + 1.55, -FOOT_Z + 0.15, 0);
  win(FOOT_X - 0.15, 1.6, 0.5, -Math.PI / 2); win(FOOT_X - 0.15, FLOOR2 + 1.55, 2, -Math.PI / 2);
  win(-FOOT_X + 0.15, 1.6, -2, Math.PI / 2); win(-FOOT_X + 0.15, FLOOR2 + 1.55, 0.5, Math.PI / 2);
  // matching panes on the outside faces — from the dark fields these glow warm
  win(-3.4, 1.6, FOOT_Z + 0.17, 0); win(3.4, 1.6, FOOT_Z + 0.17, 0);
  win(-3.4, FLOOR2 + 1.55, FOOT_Z + 0.17, 0); win(3.4, FLOOR2 + 1.55, FOOT_Z + 0.17, 0);
  win(4.5, 1.7, -FOOT_Z - 0.17, Math.PI); win(-4.2, 1.7, -FOOT_Z - 0.17, Math.PI);
  win(-4, FLOOR2 + 1.55, -FOOT_Z - 0.17, Math.PI); win(4, FLOOR2 + 1.55, -FOOT_Z - 0.17, Math.PI);
  win(FOOT_X + 0.17, 1.6, 0.5, Math.PI / 2); win(FOOT_X + 0.17, FLOOR2 + 1.55, 2, Math.PI / 2);
  win(-FOOT_X - 0.17, 1.6, -2, -Math.PI / 2); win(-FOOT_X - 0.17, FLOOR2 + 1.55, 0.5, -Math.PI / 2);
  const windowMat = new THREE.MeshBasicMaterial({ color: 0x9aa6ad });
  group.add(new THREE.Mesh(mergeGeos(winGeos), windowMat));

  // ================= interior lights =================
  const kitchenLight = new THREE.PointLight(0xfff2dd, 14, 11, 2);
  kitchenLight.position.set(3.5, 2.45, -2);
  group.add(kitchenLight);
  const hallLight = new THREE.PointLight(0xffeedd, 12, 10, 2);
  hallLight.position.set(0, FLOOR2 + 2.45, 0.5);
  group.add(hallLight);
  const bulbGeo = new THREE.SphereGeometry(0.09, 6, 6);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff4dd });
  for (const l of [kitchenLight, hallLight]) {
    const b = new THREE.Mesh(bulbGeo, bulbMat);
    b.position.copy(l.position);
    group.add(b);
  }

  // ================= the yard =================
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(31.4, 31.4),
    new THREE.MeshLambertMaterial({ color: 0x586c44 })
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = 0.02;
  group.add(grass);

  const path = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 71),
    new THREE.MeshLambertMaterial({ color: 0x80775c })
  );
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.035, 40.5);
  group.add(path);

  // picket fence around the yard, gate gap on the south side
  const postGeo = new THREE.BoxGeometry(0.1, 1.0, 0.1);
  const postPositions = [];
  for (let i = -15; i <= 15; i += 2) {
    postPositions.push([i, -15], [-15, i], [15, i]);
    if (Math.abs(i) > 1.6) postPositions.push([i, 15]);
  }
  const fencePosts = new THREE.InstancedMesh(
    postGeo, new THREE.MeshLambertMaterial({ color: 0xb6ad98 }), postPositions.length);
  const fm = new THREE.Matrix4();
  postPositions.forEach(([px, pz], i) => fencePosts.setMatrixAt(i, fm.makeTranslation(px, 0.5, pz)));
  group.add(fencePosts);
  for (const y of [0.38, 0.78]) {
    fence.box(30.4, 0.06, 0.07, 0, y, -15);
    fence.box(0.07, 0.06, 30.4, -15, y, 0);
    fence.box(0.07, 0.06, 30.4, 15, y, 0);
    fence.box(13.4, 0.06, 0.07, -8.3, y, 15);
    fence.box(13.4, 0.06, 0.07, 8.3, y, 15);
  }
  fence.box(0.16, 1.15, 0.16, -1.6, 0.57, 15);                                  // gate posts
  fence.box(0.16, 1.15, 0.16, 1.6, 0.57, 15);
  addCollider(-15.2, 15.2, -15.2, -14.85, 0, 1.0);                              // fence colliders
  addCollider(-15.2, -14.85, -15.2, 15.2, 0, 1.0);
  addCollider(14.85, 15.2, -15.2, 15.2, 0, 1.0);
  addCollider(-15.2, -1.5, 14.85, 15.2, 0, 1.0);
  addCollider(1.5, 15.2, 14.85, 15.2, 0, 1.0);

  // build all the merged buckets
  walls.build(); floors.build(); roof.build(); wood.build(); fabric.build();
  white.build(); mattress.build(); books.build(); fence.build(); stove.build();
  // glowing burner rings
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x551a10 });
  for (const [rx, rz] of [[3.15, -4.1], [3.55, -3.95]]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.045, 10), ringMat);
    ring.position.set(rx, 0.96, rz);
    group.add(ring);
  }

  // ================= interaction hotspots =================
  const hotspots = [
    { id: 'bed', x: 3.3, y: FLOOR2, z: 2.6, r: 1.8, label: '🛏  Sleep' },
    { id: 'stove', x: 3.35, y: 0, z: -3.2, r: 1.2, label: '🍳  Cook yourself a meal' },
    { id: 'oven', x: 4.45, y: 0, z: -3.2, r: 1.0, label: '🍞  Bake in the oven' },
    { id: 'microwave', x: 5.45, y: 0, z: -3.3, r: 1.0, label: '⏲  Microwave a snack' },
    { id: 'fridge', x: 4.8, y: 0, z: -2.5, r: 0.9, label: '🧃  Grab apple juice' },
    { id: 'shelf', x: -5.0, y: 0, z: -0.5, r: 1.8, label: '📖  Read a book' },
    { id: 'sofa', x: -3.9, y: 0, z: 1.9, r: 1.6, label: '🛋  Rest a while' },
    { id: 'therapist', x: -4.0, y: 0, z: -1.7, r: 2.0, label: '🕯  Talk to the therapist' },
  ];

  // ================= movement helpers =================
  function isInside(x, z) { return Math.abs(x) < FOOT_X && Math.abs(z) < FOOT_Z; }
  function isInYard(x, z) { return Math.abs(x) < 14.85 && Math.abs(z) < 14.85; }

  function groundHeight(x, z, feetY) {
    if (x >= ST_X0 - 0.3 && x <= ST_X1 && z >= ST_Z0 && z <= ST_Z1) {
      const h = THREE.MathUtils.clamp((x - ST_X0) / 4, 0, 1) * FLOOR2;
      if (feetY > h - 1.1) return h;       // on the stairs
      return 0;                            // walking underneath them
    }
    if (isInside(x, z) && feetY > 1.6) return FLOOR2;
    return 0;
  }

  function blocked(x, z, feetY) {
    for (const c of colliders) {
      if (x > c.x0 - 0.32 && x < c.x1 + 0.32 && z > c.z0 - 0.32 && z < c.z1 + 0.32 &&
          c.y1 > feetY + 0.4 && c.y0 < feetY + 1.6) return true;
    }
    return false;
  }

  // axis-separated slide: try the new x, then the new z
  function collide(px, pz, nx, nz, feetY) {
    let x = nx;
    if (blocked(x, pz, feetY)) x = px;
    let z = nz;
    if (blocked(x, z, feetY)) z = pz;
    return { x, z };
  }

  return { group, windowMat, hotspots, isInside, isInYard, groundHeight, collide };
}
