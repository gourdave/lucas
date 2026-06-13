// cellar.js — THE STORM CELLAR, ~500m out. A pair of steel bulkhead doors set
// into the wheat. Concrete steps lead down into the dark UNDER the fields: old
// shelves, older air, and the richest loot on the level. But something lives in
// the dark down here — THE DWELLER. It advances through shadow and CANNOT enter
// the light. Stay in the bulbs, search the crates, crack the deep chest, and
// carry it all back up into the grey daylight. (No death — if it catches you,
// the cellar spits you out at the doors and your bag drops where you can find it.)

import * as THREE from 'three';
import { State, bus, todayStr } from './state.js';
import { glowSprite } from './gfx.js';

export const CELLAR_POS   = { x: 140, z: -480 };          // ~500m surface bulkhead
export const CELLAR_INT   = { x: 0,  z: 760 };            // the interior, its own pocket
export const CELLAR_SPAWN = { x: 0,  z: 760 - 20 };       // by the ladder, just inside
const HALFW = 7, HALFD = 24;     // interior footprint half-extents (local = world-offset)
const R = 0.35;                  // player collision radius

// the deep chest refills once a day, like the maze
export function cellarChestAvailable() { return State.flags.cellarChestDay !== todayStr(); }

// fixed light pools, LOCAL coords (relative to CELLAR_INT). steady bulbs never
// blink; the rest flicker, and the deep one by the vault blinks the most.
const BULBS = [
  { x: 0,  z: -20, r: 6.5, steady: true,  ph: 0.0 },   // the landing / ladder — always lit
  { x: -3, z: -6,  r: 4.6, steady: false, ph: 1.7 },   // mid hall
  { x: 3,  z: 7,   r: 4.2, steady: false, ph: 3.1 },   // deeper
  { x: 0,  z: 18,  r: 4.6, steady: false, ph: 5.0 },   // THE VAULT — by the chest, unreliable
];

// crates to search (once each per day), LOCAL coords
const CRATES = [
  { x: 4.4,  z: -14 },
  { x: -4.4, z: -3 },
  { x: 4.4,  z: 4 },
  { x: -4.4, z: 14 },
];

export class Cellar {
  constructor(scene) {
    this.buildSurface(scene);
    this.buildInterior(scene);
    // dweller runtime state
    this.woke = false;
    this._wakeT = 0;
    this._dread = 0;
    this._flareT = 0;
  }

  get dwellerWoke() { return this.woke; }
  get dread() { return this._dread; }

  // ---------- the surface bulkhead + a signpost near home ----------
  buildSurface(scene) {
    const g = new THREE.Group();
    const concrete = new THREE.MeshLambertMaterial({ color: 0x6b6660 });
    const steel = new THREE.MeshLambertMaterial({ color: 0x55504a, emissive: 0x0c0b0a });
    // a low concrete collar around the hole
    const collar = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.5, 2.4), concrete);
    collar.position.y = 0.25;
    g.add(collar);
    // two slanted bulkhead doors
    this.doorMat = steel;
    for (const s of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.14, 2.2), steel);
      door.position.set(s * 0.66, 0.62, 0);
      door.rotation.z = s * 0.5;     // peaked, like a real storm cellar
      g.add(door);
    }
    // a handle and the warm light leaking from the seam
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 10),
      new THREE.MeshLambertMaterial({ color: 0x2a2724 }));
    handle.position.set(0, 1.18, 0.7);
    handle.rotation.x = Math.PI / 2;
    g.add(handle);
    this.seamMat = new THREE.MeshBasicMaterial({ color: 0xffcf7a, fog: false, transparent: true, opacity: 0.5 });
    const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 2.0), this.seamMat);
    seam.position.set(0, 0.92, 0);
    seam.rotation.x = -Math.PI / 2;
    g.add(seam);
    const halo = glowSprite(0xffcf7a, 2.2, 0.3);
    halo.position.set(0, 1.0, 0);
    g.add(halo);
    g.position.set(CELLAR_POS.x, 0, CELLAR_POS.z);
    g.rotation.y = 0.4;
    scene.add(g);

    // a weathered signpost near home, pointing the long way out
    const post = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.7, 6),
      new THREE.MeshLambertMaterial({ color: 0x534a3d }));
    pole.position.y = 0.85;
    post.add(pole);
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 48;
    const c = cv.getContext('2d');
    c.fillStyle = '#6e6256'; c.fillRect(0, 0, 256, 48);
    c.fillStyle = '#23201a'; c.font = 'bold 24px Georgia'; c.textAlign = 'center';
    c.fillText('STORM CELLAR →', 128, 33);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const plank = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.32),
      new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    plank.position.y = 1.45;
    post.add(plank);
    post.position.set(-22, 0, -14);
    post.rotation.y = Math.atan2(CELLAR_POS.x + 22, CELLAR_POS.z + 14) + Math.PI / 2;
    scene.add(post);
  }

  // ---------- the dungeon below ----------
  buildInterior(scene) {
    const g = new THREE.Group();
    this.colliders = [];
    const stone = new THREE.MeshLambertMaterial({ color: 0x2a2722, emissive: 0x070605 });
    const addBox = (w, h, d, lx, ly, lz, mat = stone, collide = true) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(lx, ly, lz);
      g.add(m);
      if (collide) this.colliders.push({
        x0: CELLAR_INT.x + lx - w / 2, x1: CELLAR_INT.x + lx + w / 2,
        z0: CELLAR_INT.z + lz - d / 2, z1: CELLAR_INT.z + lz + d / 2,
      });
      return m;
    };
    // floor (packed earth + concrete) and a low ceiling — it presses down
    const floor = new THREE.Mesh(new THREE.BoxGeometry(HALFW * 2, 0.3, HALFD * 2),
      new THREE.MeshLambertMaterial({ map: this._floorTex() }));
    floor.position.y = 0.06;
    g.add(floor);
    addBox(HALFW * 2, 0.3, HALFD * 2, 0, 3.2, 0, stone, false);    // ceiling
    // outer walls
    addBox(0.4, 3.4, HALFD * 2, -HALFW, 1.6, 0);                   // west
    addBox(0.4, 3.4, HALFD * 2,  HALFW, 1.6, 0);                   // east
    addBox(HALFW * 2, 3.4, 0.4, 0, 1.6, -HALFD);                   // south (behind the ladder)
    addBox(HALFW * 2, 3.4, 0.4, 0, 1.6,  HALFD);                   // north (deep wall)
    // two internal cross-walls with OFFSET doorways → an S-shaped path you can't see through
    addBox(9.2, 3.4, 0.5, -1.4, 1.6, -10);   // gap on the right (x ≈ +4..+7)
    addBox(9.2, 3.4, 0.5,  1.4, 1.6,  6);    // gap on the left  (x ≈ -7..-4)

    // the ladder back up, at the lit landing
    const lad = new THREE.Group();
    const railMat = new THREE.MeshLambertMaterial({ color: 0x6a5a3e });
    for (const s of [-0.3, 0.3]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), railMat);
      rail.position.set(s, 1.6, 0);
      lad.add(rail);
    }
    for (let y = 0.4; y < 3.2; y += 0.5) {
      const rung = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.06, 0.06), railMat);
      rung.position.set(0, y, 0);
      lad.add(rung);
    }
    lad.position.set(0, 0, -HALFD + 0.7);
    g.add(lad);
    this.ladderSpot = { x: CELLAR_INT.x, z: CELLAR_INT.z - HALFD + 0.7 };
    // a square of pale daylight above the ladder — the way out
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4),
      new THREE.MeshBasicMaterial({ color: 0xcfcabe, fog: false, transparent: true, opacity: 0.5 }));
    sky.position.set(0, 3.05, -HALFD + 0.7);
    sky.rotation.x = Math.PI / 2;
    g.add(sky);

    // shelving along the walls (set dressing) + searchable crates
    const shelfMat = new THREE.MeshLambertMaterial({ color: 0x3a3028 });
    for (const [lx, lz] of [[-HALFW + 0.5, -16], [-HALFW + 0.5, 0], [HALFW - 0.5, -4], [HALFW - 0.5, 12]]) {
      const sh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.2, 3.2), shelfMat);
      sh.position.set(lx, 1.1, lz);
      g.add(sh);
    }
    this.crateMeshes = [];
    const crateMat = new THREE.MeshLambertMaterial({ color: 0x6e4f2e });
    for (const cr of CRATES) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), crateMat);
      box.position.set(cr.x, 0.42, cr.z);
      box.rotation.y = Math.random() * 0.6 - 0.3;
      g.add(box);
      this.colliders.push({
        x0: CELLAR_INT.x + cr.x - 0.45, x1: CELLAR_INT.x + cr.x + 0.45,
        z0: CELLAR_INT.z + cr.z - 0.45, z1: CELLAR_INT.z + cr.z + 0.45,
      });
      this.crateMeshes.push(box);
    }

    // the DEEP CHEST in the vault at the far end
    const chest = new THREE.Group();
    const cbody = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.7),
      new THREE.MeshLambertMaterial({ color: 0x4a3322, emissive: 0x0a0604 }));
    cbody.position.y = 0.35;
    chest.add(cbody);
    const clid = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.22, 0.76),
      new THREE.MeshLambertMaterial({ color: 0x6a4a2c }));
    clid.position.y = 0.78;
    chest.add(clid);
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.9, 0.12),
      new THREE.MeshLambertMaterial({ color: 0x8a7a3a, emissive: 0x1a1606 }));
    band.position.y = 0.45;
    chest.add(band);
    this.chestGlow = new THREE.PointLight(0xffd27a, 5, 7, 2);
    this.chestGlow.position.y = 1.0;
    chest.add(this.chestGlow);
    chest.position.set(0, 0, 19.5);
    g.add(chest);
    this.chestSpot = { x: CELLAR_INT.x, z: CELLAR_INT.z + 19.5 };

    // the bulbs: warm point lights + a glow halo each, hung from the ceiling
    this.bulbs = BULBS.map((b) => {
      const lamp = new THREE.PointLight(0xffd9a0, b.steady ? 9 : 7, b.r * 2.4, 2);
      lamp.position.set(b.x, 2.7, b.z);
      g.add(lamp);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xfff0c8, fog: false }));
      bulb.position.set(b.x, 2.6, b.z);
      g.add(bulb);
      const halo = glowSprite(0xffd9a0, 2.0, 0.28);
      halo.position.set(b.x, 2.55, b.z);
      g.add(halo);
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 4),
        new THREE.MeshBasicMaterial({ color: 0x111111 }));
      wire.position.set(b.x, 2.95, b.z);
      g.add(wire);
      return { def: b, lamp, bulb, halo, bulbMat: bulb.material, lit: true };
    });

    // THE DWELLER — a tall inky silhouette with two pale eyes. Lives in the deep.
    const dw = new THREE.Group();
    const inky = new THREE.MeshBasicMaterial({ color: 0x050507, fog: false });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.6, 4, 8), inky);
    body.position.y = 1.2;
    dw.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), inky);
    head.position.y = 2.25;
    dw.add(head);
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0xbfe4ff, fog: false });
    for (const ex of [-0.11, 0.11]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), this.eyeMat);
      eye.position.set(ex, 2.3, 0.27);
      dw.add(eye);
    }
    dw.visible = false;
    dw.position.set(CELLAR_INT.x, 0, CELLAR_INT.z + 21);   // its lair, past the vault
    scene.add(dw);
    this.dweller = dw;
    this._lairZ = CELLAR_INT.z + 21;

    g.position.set(CELLAR_INT.x, 0, CELLAR_INT.z);
    scene.add(g);
    this.group = g;
  }

  _floorTex() {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 128;
    const x = cv.getContext('2d');
    x.fillStyle = '#26221c'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 600; i++) {
      x.fillStyle = `rgba(${30 + Math.random() * 40 | 0},${26 + Math.random() * 30 | 0},20,0.5)`;
      x.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 12);
    return tex;
  }

  // ---------- queries ----------
  near(p) {        // close enough to the surface doors to open them
    const dx = p.x - CELLAR_POS.x, dz = p.z - CELLAR_POS.z;
    return dx * dx + dz * dz < 6.25;   // 2.5m
  }
  nearArea(p) {    // close enough to NOTICE the cellar (discovery)
    const dx = p.x - CELLAR_POS.x, dz = p.z - CELLAR_POS.z;
    return dx * dx + dz * dz < 256;    // 16m
  }
  inside(p) {
    return Math.abs(p.x - CELLAR_INT.x) < HALFW + 2 && Math.abs(p.z - CELLAR_INT.z) < HALFD + 2;
  }
  nearLadder(p) {
    const dx = p.x - this.ladderSpot.x, dz = p.z - this.ladderSpot.z;
    return dx * dx + dz * dz < 2.56;   // 1.6m
  }
  nearChest(p) {
    const dx = p.x - this.chestSpot.x, dz = p.z - this.chestSpot.z;
    return dx * dx + dz * dz < 3.2;
  }
  nearCrate(p) {
    for (let i = 0; i < CRATES.length; i++) {
      const dx = p.x - (CELLAR_INT.x + CRATES[i].x), dz = p.z - (CELLAR_INT.z + CRATES[i].z);
      if (dx * dx + dz * dz < 2.25) return i;   // 1.5m
    }
    return -1;
  }

  // is a WORLD point inside any currently-lit bulb pool?
  _litAtWorld(x, z) {
    for (const b of this.bulbs) {
      if (!b.lit) continue;
      const dx = x - (CELLAR_INT.x + b.def.x), dz = z - (CELLAR_INT.z + b.def.z);
      if (dx * dx + dz * dz < b.def.r * b.def.r) return true;
    }
    return false;
  }
  litAt(p) { return this._litAtWorld(p.x, p.z); }

  // ---------- collision (axis-separated slide, same as the maze/arcade) ----------
  _blocked(x, z) {
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

  // ---------- daily loot ----------
  _ensureDay() {
    const today = todayStr();
    if (!State.cellar) State.cellar = { chestDay: '', cratesDay: '', crates: [] };
    if (State.cellar.cratesDay !== today) {
      State.cellar.cratesDay = today;
      State.cellar.crates = CRATES.map(() => false);
    }
  }
  crateSearched(i) {
    this._ensureDay();
    return !!State.cellar.crates[i];
  }
  // search the nearest unsearched crate to the player; returns a reward or null
  searchCrate(p) {
    const i = this.nearCrate(p);
    if (i < 0) return null;
    this._ensureDay();
    if (State.cellar.crates[i]) return null;
    State.cellar.crates[i] = true;
    const coins = 18 + Math.floor(Math.random() * 26);   // 18..43 pending
    let item = null, itemLabel = '';
    const roll = Math.random();
    if (roll < 0.16) { item = { kind: 'seed', crop: 'goldenwheat' }; itemLabel = 'a golden wheat seed'; }
    else if (roll < 0.24) { item = { kind: 'egg', tier: 'dusk', mult: 2 }; itemLabel = 'a Dusk Egg'; }
    return { coins, item, itemLabel };
  }
  openChest() {
    if (!cellarChestAvailable()) return null;
    State.flags.cellarChestDay = todayStr();
    const coins = 180 + Math.floor(Math.random() * 90);          // 180..269 pending — the richest on the level
    const stardust = 20 + Math.floor(Math.random() * 16);        // 20..35
    return { coins, stardust, eggTier: 'midnight' };             // best egg in the game, every time
  }

  // ---------- the flare blasts the Dweller back ----------
  flareBurst() {
    if (!this.woke) return;
    this._dread = 0;
    this._flareT = 0.7;                                          // every bulb blooms for a beat
    this.dweller.position.set(CELLAR_INT.x, 0, this._lairZ);     // sent back to the deep
  }

  // ---------- per-frame ----------
  // active === true only when the player is controllably inside the cellar.
  // returns { caught, woke } — caught means the dark reached you this frame.
  update(dt, t, p, active) {
    // the surface seam breathes whether you're down there or not
    if (this.seamMat) this.seamMat.opacity = 0.4 + Math.sin(t * 2.2) * 0.18;

    // bulbs flicker (the flare bloom overrides everything for a moment)
    this._flareT = Math.max(0, this._flareT - dt);
    const bloom = this._flareT > 0;
    for (const b of this.bulbs) {
      let lit = true, flick = 1;
      if (!b.def.steady && !bloom) {
        // a low, nervous flicker plus the occasional full blackout blink
        const n = Math.sin(t * 11 + b.def.ph) * 0.5 + Math.sin(t * 2.3 + b.def.ph * 2) * 0.5;
        const blink = Math.sin(t * 0.7 + b.def.ph) < -0.86;   // ~rare, ~1.5s dark windows
        lit = !blink;
        flick = lit ? 0.7 + n * 0.3 : 0;
      } else if (bloom) {
        flick = 1.4;
      }
      b.lit = lit;
      b.lamp.intensity = (b.def.steady ? 9 : 7) * flick;
      b.halo.material.opacity = 0.28 * (lit ? flick : 0.04);
      b.bulbMat.color.setHex(lit ? 0xfff0c8 : 0x3a3024);
    }
    this.chestGlow.intensity = cellarChestAvailable() ? 4 + Math.sin(t * 3) * 1.6 : 0;

    if (!active) {
      // calm down while you're away; keep the dweller hidden in its lair
      this._dread = Math.max(0, this._dread - dt * 0.5);
      return { caught: false, woke: false };
    }

    const lit = this.litAt(p);
    let wokeNow = false;

    // it wakes once you've pushed past the first chamber (and a few seconds pass)
    if (!this.woke) {
      this._wakeT += dt;
      const deep = (p.z - CELLAR_INT.z) > -8;
      if (deep && this._wakeT > 4) { this.woke = true; wokeNow = true; this.dweller.visible = true; }
    }

    if (this.woke) {
      const dx = p.x - this.dweller.position.x, dz = p.z - this.dweller.position.z;
      const dist = Math.hypot(dx, dz) || 1e-3;
      // dread climbs in the dark, drains in the light
      this._dread = THREE.MathUtils.clamp(this._dread + (lit ? -dt * 0.9 : dt * 0.5), 0, 1);

      if (!lit) {
        // hunt: glide toward you through the dark, faster the longer you linger
        const speed = 1.4 + this._dread * 1.7;
        let nx = this.dweller.position.x + (dx / dist) * speed * dt;
        let nz = this.dweller.position.z + (dz / dist) * speed * dt;
        // but it CANNOT cross into a lit pool — it stalls at the edge of the light
        if (!this._litAtWorld(nx, nz)) {
          this.dweller.position.x = THREE.MathUtils.clamp(nx, CELLAR_INT.x - HALFW + 0.5, CELLAR_INT.x + HALFW - 0.5);
          this.dweller.position.z = THREE.MathUtils.clamp(nz, CELLAR_INT.z - HALFD + 0.5, CELLAR_INT.z + HALFD - 0.5);
        }
      } else {
        // you're safe in the light: it retreats toward the deep end
        this.dweller.position.x = THREE.MathUtils.damp(this.dweller.position.x, CELLAR_INT.x, 2, dt);
        this.dweller.position.z = THREE.MathUtils.damp(this.dweller.position.z, this._lairZ, 2, dt);
      }
      this.dweller.lookAt(p.x, 1.3, p.z);
      // the eyes brighten as it closes in
      const close = THREE.MathUtils.clamp(1 - dist / 14, 0, 1);
      this.eyeMat.color.setRGB(0.55 + close * 0.45, 0.78 + close * 0.22, 1);
      this.dweller.children.forEach((c) => { if (c.material) c.material.opacity = 1; });

      if (!lit && dist < 1.15) return { caught: true, woke: wokeNow };
    }
    return { caught: false, woke: wokeNow };
  }

  // called on every descent — fresh start, dweller asleep in its lair
  reset() {
    this.woke = false;
    this._wakeT = 0;
    this._dread = 0;
    this._flareT = 0;
    this.dweller.visible = false;
    this.dweller.position.set(CELLAR_INT.x, 0, this._lairZ);
  }
}
