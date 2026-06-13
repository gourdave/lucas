// othershouse.js — THE OTHER HOUSE, ~700m down the power lines. The ENDGAME
// landmark: an exact copy of your own house, every window lit warm — out here,
// in the dark, where no house should be. Inside it's almost right. Almost. A
// chair faces the wall. The clock runs backward. There's a second bed. And
// upstairs, on the nightstand that should be yours, a LEGENDARY chest waits.
// You can't die here — it's just a house. But it knows it's a copy, and so do you.

import * as THREE from 'three';
import { State, bus } from './state.js';
import { glowSprite } from './gfx.js';

export const OTHER_POS = { x: 64, z: -697 };   // ~700m, just off the power line
const FOOT_X = 6, FOOT_Z = 4.5, FLOOR2 = 2.8;  // identical footprint to your house
const ST_X0 = -2, ST_X1 = 2.3, ST_Z0 = -4.5, ST_Z1 = -3.35;   // the staircase strip

export function otherChestAvailable() { return !State.flags.otherChestOpened; }

export class OtherHouse {
  constructor(scene) {
    const g = new THREE.Group();
    this.colliders = [];
    this.lights = [];

    const siding = new THREE.MeshLambertMaterial({ color: 0xb8b09a });   // a hair greyer than home
    const wood = new THREE.MeshLambertMaterial({ color: 0x6e553c });
    const dark = new THREE.MeshLambertMaterial({ color: 0x3a3026 });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a3b30 });
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x7a5c40 });
    const fabric = new THREE.MeshLambertMaterial({ color: 0x4a5c70 });   // wrong colour (yours is greenish)

    // local box helper → adds to group, optionally a world-space collider w/ y-bounds
    const box = (mat, w, h, d, x, y, z, opts = {}) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      if (opts.ry) geo.rotateY(opts.ry);
      if (opts.rx) geo.rotateX(opts.rx);
      geo.translate(x, y, z);
      const m = new THREE.Mesh(geo, mat);
      g.add(m);
      if (opts.collide) this.colliders.push({
        x0: OTHER_POS.x + x - w / 2, x1: OTHER_POS.x + x + w / 2,
        z0: OTHER_POS.z + z - d / 2, z1: OTHER_POS.z + z + d / 2,
        y0: y - h / 2, y1: y + h / 2,
      });
      return m;
    };

    // ===== exterior shell (same silhouette as home) =====
    box(siding, 12, 5.6, 0.28, 0, 2.8, -FOOT_Z, { collide: true });           // north
    box(siding, 5.2, 5.6, 0.28, -3.4, 2.8, FOOT_Z, { collide: true });        // south, left of door
    box(siding, 5.2, 5.6, 0.28, 3.4, 2.8, FOOT_Z, { collide: true });         // south, right of door
    box(siding, 1.6, 3.4, 0.28, 0, 3.9, FOOT_Z, { collide: true });           // above the doorway
    box(siding, 0.28, 5.6, 9, FOOT_X, 2.8, 0, { collide: true });             // east
    box(siding, 0.28, 5.6, 9, -FOOT_X, 2.8, 0, { collide: true });            // west
    box(floorMat, 12.4, 0.2, 9.4, 0, -0.06, 0);                               // ground slab
    box(floorMat, 12, 0.22, 7.9, 0, FLOOR2 - 0.122, 0.55);                    // floor 2 (south of stairwell)
    box(floorMat, 4, 0.22, 1.15, -4, FLOOR2 - 0.122, -3.925);                 // floor 2 west of stairwell
    box(floorMat, 3.7, 0.22, 1.15, 4.15, FLOOR2 - 0.122, -3.925);             // floor 2 east of stairwell
    box(dark, 12.4, 0.2, 9.4, 0, 5.7, 0);                                     // ceiling
    box(roofMat, 13, 0.2, 5.6, 0, 6.7, -2.35, { rx: 0.42 });                  // roof slopes
    box(roofMat, 13, 0.2, 5.6, 0, 6.7, 2.35, { rx: -0.42 });
    box(floorMat, 2.4, 0.18, 1.3, 0, 0.09, 5.15);                             // porch step

    // ===== interior walls =====
    box(siding, 0.18, 2.8, 2.4, 1.5, 1.4, -2.15, { collide: true });          // kitchen divider
    box(siding, 0.18, 2.8, 2.5, -3, 1.4, 3.25, { collide: true });            // a back-room wall

    // ===== the staircase (visual; groundHeight does the climbing) =====
    for (let i = 0; i < 8; i++) {
      const h = 0.35 * (i + 1);
      box(wood, 0.54, h, 1.1, ST_X0 + 0.27 + i * 0.5375, h / 2, -3.925);
    }

    // ===== windows — every one lit warm (that's the wrong part) =====
    this.winMat = new THREE.MeshBasicMaterial({ color: 0xffd98a, fog: false, transparent: true, opacity: 0.92 });
    const win = (w, h, x, y, z, ry = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.winMat);
      m.position.set(x, y, z); m.rotation.y = ry;
      g.add(m);
      const halo = glowSprite(0xffd98a, w * 2.2, 0.32);
      halo.position.set(x + Math.sin(ry) * 0.2, y, z + Math.cos(ry) * 0.2);
      g.add(halo);
    };
    win(1.3, 1.3, -3.4, 1.7, FOOT_Z + 0.01);     // south face
    win(1.3, 1.3, 3.4, 1.7, FOOT_Z + 0.01);
    win(1.3, 1.3, -3.4, FLOOR2 + 1.1, FOOT_Z + 0.01);
    win(1.3, 1.3, 3.4, FLOOR2 + 1.1, FOOT_Z + 0.01);
    win(1.3, 1.3, FOOT_X + 0.01, 1.7, 1.6, Math.PI / 2);   // east face
    win(1.3, 1.3, -FOOT_X - 0.01, 1.7, 1.6, -Math.PI / 2); // west face

    // warm interior lights (it's lit, and no one's home)
    for (const [x, y, z] of [[0, 2.2, 1], [-3.5, 2.2, -1.5], [2.5, FLOOR2 + 1.4, 2]]) {
      const l = new THREE.PointLight(0xffd07a, 7, 12, 2);
      l.position.set(x, y, z);
      g.add(l);
      this.lights.push(l);
    }

    // ===== the wrong details =====
    // a chair facing the corner
    const chair = new THREE.Group();
    chair.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6), wood));
    const cback = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.1), wood);
    cback.position.set(0, 0.4, -0.25); chair.add(cback);
    chair.position.set(-5.2, 0.5, -3.4); chair.rotation.y = -0.7;   // staring into the corner
    g.add(chair);
    // a sofa (the wrong colour) + a low table
    box(fabric, 2.0, 0.6, 0.9, -3.9, 0.35, 2.4, { collide: true });
    box(fabric, 2.0, 0.5, 0.3, -3.9, 0.85, 2.0);
    box(wood, 1.2, 0.4, 0.7, -1.6, 0.2, 2.6, { collide: true });    // coffee table
    // the therapist's lamp — on — but his chair is empty
    box(wood, 0.9, 0.7, 0.9, -4.0, 0.35, -1.7, { collide: true });  // empty chair
    const lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.4, 6), wood);
    lampPole.position.set(-5.2, 0.7, -1.0); g.add(lampPole);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.3, 10),
      new THREE.MeshBasicMaterial({ color: 0xffe6a0, fog: false }));
    shade.position.set(-5.2, 1.5, -1.0); g.add(shade);
    const lampLight = new THREE.PointLight(0xffe6a0, 4, 6, 2);
    lampLight.position.set(-5.2, 1.4, -1.0); g.add(lampLight);
    // the backward clock on the north wall
    const clock = new THREE.Group();
    clock.add(new THREE.Mesh(new THREE.CircleGeometry(0.32, 16),
      new THREE.MeshBasicMaterial({ color: 0xf4ecd6, fog: false })));
    this.clockHand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.26, 0.02),
      new THREE.MeshBasicMaterial({ color: 0x2a2620, fog: false }));
    this.clockHand.position.y = 0.1; clock.add(this.clockHand);
    clock.position.set(2.4, 2.4, -FOOT_Z + 0.16); g.add(clock);

    // ===== upstairs: a second bed + YOUR nightstand + the legendary chest =====
    const mattress = new THREE.MeshLambertMaterial({ color: 0xcfc9b6 });
    box(mattress, 1.8, 0.4, 2.4, 3.3, FLOOR2 + 0.4, 2.4, { collide: true });   // the bed (where yours is)
    box(mattress, 1.4, 0.3, 2.0, -3.6, FLOOR2 + 0.35, 2.4, { collide: true }); // a SECOND bed (wrong)
    box(wood, 0.7, 0.6, 0.6, 1.7, FLOOR2 + 0.3, 1.0, { collide: true });       // nightstand
    // the chest, on the nightstand
    const chest = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x4a2f5a, emissive: 0x1a0a24 }));
    body.position.y = 0.22; chest.add(body);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.16, 0.54),
      new THREE.MeshLambertMaterial({ color: 0x6a4a8a }));
    lid.position.y = 0.5; chest.add(lid);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.5, 0.08),
      new THREE.MeshBasicMaterial({ color: 0xe8c84a, fog: false }));
    trim.position.y = 0.32; chest.add(trim);
    this.chestGlow = new THREE.PointLight(0xc98aff, 5, 6, 2);
    this.chestGlow.position.y = 0.7; chest.add(this.chestGlow);
    this.chestHalo = glowSprite(0xc98aff, 2.2, 0.4);
    this.chestHalo.position.y = 0.5; chest.add(this.chestHalo);
    chest.position.set(1.7, FLOOR2 + 0.62, 1.0);
    g.add(chest);
    this.chest = chest;
    this.chestSpot = { x: OTHER_POS.x + 1.7, z: OTHER_POS.z + 1.0 };

    g.position.set(OTHER_POS.x, 0, OTHER_POS.z);
    scene.add(g);
    this.group = g;
  }

  // ===== queries the game loop uses =====
  isInside(x, z) { return Math.abs(x - OTHER_POS.x) < FOOT_X && Math.abs(z - OTHER_POS.z) < FOOT_Z; }
  isNear(x, z)   { return Math.abs(x - OTHER_POS.x) < FOOT_X + 1.5 && Math.abs(z - OTHER_POS.z) < FOOT_Z + 1.5; }
  sawArea(p)     { const dx = p.x - OTHER_POS.x, dz = p.z - OTHER_POS.z; return dx * dx + dz * dz < 900; }  // 30m
  nearChest(p) {
    if (!otherChestAvailable()) return false;
    const dx = p.x - this.chestSpot.x, dz = p.z - this.chestSpot.z;
    return dx * dx + dz * dz < 2.25 && p.y > 1.6;   // must be upstairs
  }

  // the staircase + second floor, in LOCAL coords (mirrors house.js exactly)
  groundHeight(x, z, feetY) {
    const lx = x - OTHER_POS.x, lz = z - OTHER_POS.z;
    if (lx >= ST_X0 - 0.3 && lx <= ST_X1 && lz >= ST_Z0 && lz <= ST_Z1) {
      const h = THREE.MathUtils.clamp((lx - ST_X0) / 4, 0, 1) * FLOOR2;
      if (feetY > h - 1.1) return h;
      return 0;
    }
    if (this.isInside(x, z) && feetY > 1.6) return FLOOR2;
    return 0;
  }

  _blocked(x, z, feetY) {
    for (const c of this.colliders) {
      if (x > c.x0 - 0.32 && x < c.x1 + 0.32 && z > c.z0 - 0.32 && z < c.z1 + 0.32 &&
          c.y1 > feetY + 0.4 && c.y0 < feetY + 1.6) return true;
    }
    return false;
  }
  collide(px, pz, nx, nz, feetY) {
    if (!this.isNear(nx, nz) && !this.isNear(px, pz)) return { x: nx, z: nz };
    let x = nx;
    if (this._blocked(x, pz, feetY)) x = px;
    let z = nz;
    if (this._blocked(x, z, feetY)) z = pz;
    return { x, z };
  }

  openChest() {
    if (!otherChestAvailable()) return null;
    State.flags.otherChestOpened = true;
    bus.emit('otherChest', {});
    return { coins: 600, stardust: 150, eggTier: 'midnight' };   // one-time legendary haul
  }

  update(t) {
    // windows breathe; the lamp is steady; the clock ticks BACKWARD
    this.winMat.opacity = 0.85 + Math.sin(t * 1.3) * 0.1;
    this.clockHand.rotation.z = (t * 0.5) % (Math.PI * 2);   // +z = counter-clockwise here
    this.chestGlow.intensity = otherChestAvailable() ? 4 + Math.sin(t * 3) * 1.6 : 0;
    if (this.chestHalo) this.chestHalo.visible = otherChestAvailable();
  }
}
