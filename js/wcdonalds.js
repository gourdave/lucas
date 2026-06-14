// wcdonalds.js — Phase J: WcDONALD'S, a fast-food joint glowing alone in the
// wheat at the 50m mark. (Designed by Lucas: faceless mannequin employees with
// NO ai — just a canned response system — and monsters who eat at the tables,
// bother nobody, and mind their own business.)
//
// The name is the classic parody (the M, flipped). Same joke, no lawyers.

import * as THREE from 'three';
import { glowSprite } from './gfx.js';

export const WCD_POS = { x: -52, z: -10 };   // ~53m out, west of the house
export const WCD_R = 11;                      // wheat-clearing radius

// what's on the board — paid in coins, goes straight into your food pocket
export const MENU = {
  burger: { name: 'Wheaty Burger', emoji: '🍔', price: 14, meal: 'burger', sub: 'two patties of something agreeable' },
  fries: { name: 'Golden Fries', emoji: '🍟', price: 8, meal: 'fries', sub: 'grown right outside. probably' },
  nuggets: { name: 'Wugget 6-Piece', emoji: '🍗', price: 10, meal: 'nuggets', sub: 'shaped like little fields' },
  shake: { name: 'Almond Shake', emoji: '🥤', price: 10, meal: 'shake', sub: 'calms you all the way down' },
};

// the response system. that's it. that's the whole brain.
export const EMPLOYEE_LINES = [
  'It slides the tray across. “Enjoy.” it says, without a mouth.',
  '“Thank you for choosing us. There was never a choice.” It waves politely.',
  'It nods very slowly. Somewhere in the back, a fryer beeps forever.',
  '“Have a golden day.” Its smooth head reflects the menu board.',
  'It gestures at the regulars. “They are regulars.” it explains, helpfully.',
  '“Please come again. You will.” It is already looking at the next register.',
];

function menuBoardTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 192;
  const c = cv.getContext('2d');
  c.fillStyle = '#3a2c20'; c.fillRect(0, 0, 512, 192);
  c.fillStyle = '#f2b32a'; c.font = 'bold 34px Georgia'; c.textAlign = 'left';
  c.fillText('WcDonald’s', 22, 46);
  c.font = '22px Georgia'; c.fillStyle = '#f0e6d2';
  let y = 84;
  for (const m of Object.values(MENU)) {
    c.fillText(`${m.name}`, 22, y);
    c.textAlign = 'right'; c.fillText(`🪙${m.price}`, 490, y); c.textAlign = 'left';
    y += 30;
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// one faceless employee: white mannequin, cap + vest, no face at all
function buildEmployee(x, z, facing) {
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xe9e6df, emissive: 0x16140f });
  const uniform = new THREE.MeshLambertMaterial({ color: 0x7a2420 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2226 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.8, 0.24), dark);
  legs.position.y = 0.4;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.55, 4, 8), white);
  torso.position.y = 1.25;
  g.add(torso);
  // the vest is the only thing that proves it works here
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.12), uniform);
  vest.position.set(0, 1.28, 0.16);
  g.add(vest);
  const tag = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.02),
    new THREE.MeshBasicMaterial({ color: 0xf2e9c8 }));
  tag.position.set(-0.12, 1.42, 0.23);
  g.add(tag);
  // a perfectly smooth head. nothing on it. nothing at all.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), white);
  head.position.y = 1.85;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.23, 0.1, 10), uniform);
  cap.position.y = 2.0;
  g.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.18), uniform);
  brim.position.set(0, 1.96, 0.22);
  g.add(brim);
  g.position.set(x, 0, z);
  g.rotation.y = facing;
  g.userData.head = head;
  g.userData.cap = cap;
  g.userData.brim = brim;
  return g;
}

// a tiny tray of fries: red box, golden cones
function buildFries(scale = 1) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.14 * scale, 0.12 * scale, 0.08 * scale),
    new THREE.MeshLambertMaterial({ color: 0xa83030 }));
  box.position.y = 0.06 * scale;
  g.add(box);
  for (let i = 0; i < 5; i++) {
    const fry = new THREE.Mesh(new THREE.BoxGeometry(0.02 * scale, 0.12 * scale, 0.02 * scale),
      new THREE.MeshLambertMaterial({ color: 0xf2c83a }));
    fry.position.set((i - 2) * 0.022 * scale, 0.14 * scale, (i % 2) * 0.02 * scale);
    fry.rotation.z = (i - 2) * 0.12;
    g.add(fry);
  }
  return g;
}

export class WcDonalds {
  constructor(scene) {
    const g = new THREE.Group();
    const wall = new THREE.MeshLambertMaterial({ color: 0xd8d2c6 });
    const trim = new THREE.MeshLambertMaterial({ color: 0x8a2a24 });
    const W = 14, D = 10, H = 3.3;

    // floor + checker-ish rug of light tiles
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.16, D),
      new THREE.MeshLambertMaterial({ color: 0xcfc9b8 }));
    floor.position.y = 0.08;
    g.add(floor);
    // walls — the front (east, facing home) is mostly glowing window
    const mk = (w, h, d, x, y, z, mat = wall) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    mk(0.3, H, D, -W / 2, H / 2, 0);                  // back wall
    mk(W, H, 0.3, 0, H / 2, -D / 2);                  // north wall
    mk(W, H, 0.3, 0, H / 2, D / 2);                   // south wall
    mk(0.3, 0.9, D, W / 2, 0.45, 0);                  // front: knee wall...
    mk(0.3, 0.5, D, W / 2, H - 0.25, 0);              // ...header...
    mk(0.3, H, 1.4, W / 2, H / 2, -D / 2 + 0.7);      // ...corner posts
    mk(0.3, H, 1.4, W / 2, H / 2, D / 2 - 0.7);
    mk(0.3, H - 1.4, 1.2, W / 2, (H - 1.4) / 2, -1.2); // door frame (gap at z≈0.6)
    // the windows: warm panes that glow through the fields at night
    this.windowMat = new THREE.MeshBasicMaterial({ color: 0xfff0c2, transparent: true, opacity: 0.55 });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(D - 2.8, H - 1.4), this.windowMat);
    win.rotation.y = Math.PI / 2;
    win.position.set(W / 2 + 0.16, 0.9 + (H - 1.4) / 2, -1.4);
    g.add(win);
    // roof + red fascia band
    mk(W + 0.8, 0.22, D + 0.8, 0, H + 0.11, 0, new THREE.MeshLambertMaterial({ color: 0x3a3e44 }));
    mk(W + 0.82, 0.5, D + 0.82, 0, H - 0.2, 0, trim);

    // THE SIGN: a golden W on a pole (it might have been an M somewhere else)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 7.4, 8),
      new THREE.MeshLambertMaterial({ color: 0x4d4338 }));
    pole.position.set(W / 2 + 3, 3.7, D / 2 + 1.5);
    g.add(pole);
    const goldMat = new THREE.MeshBasicMaterial({ color: 0xf2b32a, fog: false });
    for (const dz of [-1.05, 1.05]) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.22, 8, 18, Math.PI), goldMat);
      arch.position.set(W / 2 + 3, 8.4, D / 2 + 1.5 + dz);
      arch.rotation.x = Math.PI;          // arcs open UP: the W
      arch.rotation.y = Math.PI / 2;
      g.add(arch);
    }
    const signGlow = new THREE.PointLight(0xf2b32a, 9, 18, 2);
    signGlow.position.set(W / 2 + 3, 8.0, D / 2 + 1.5);
    g.add(signGlow);
    const halo = glowSprite(0xf2b32a, 7, 0.5);
    halo.position.set(W / 2 + 3, 8.4, D / 2 + 1.5);
    g.add(halo);

    // interior: that flat fluorescent forever-light
    const ceil = new THREE.PointLight(0xfff6e0, 14, 17, 2);
    ceil.position.set(0, H - 0.4, 0);
    g.add(ceil);
    for (const z of [-2.4, 2.4]) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1),
        new THREE.MeshBasicMaterial({ color: 0xfff8e8 }));
      panel.rotation.x = Math.PI / 2;
      panel.position.set(0, H - 0.05, z);
      g.add(panel);
    }
    // the counter + menu board
    mk(0.9, 1.05, 6.4, -3.2, 0.53, 0, new THREE.MeshLambertMaterial({ color: 0x6a4a36 }));
    const board = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.95),
      new THREE.MeshBasicMaterial({ map: menuBoardTexture() }));
    board.rotation.y = Math.PI / 2;
    board.position.set(-W / 2 + 0.2, 2.1, 0);
    g.add(board);

    // the employees. they are fine. everything here is fine.
    this.employees = [
      buildEmployee(-4.4, -1.6, Math.PI / 2),
      buildEmployee(-4.4, 1.8, Math.PI / 2),
    ];
    for (const e of this.employees) g.add(e);

    // tables + THE REGULARS (monsters on break — they don't bother anyone)
    this.regulars = [];
    const tableMat = new THREE.MeshLambertMaterial({ color: 0xb8b2a2 });
    const mkTable = (x, z) => {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 10), tableMat);
      top.position.set(x, 0.85, z);
      g.add(top);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.85, 6), tableMat);
      leg.position.set(x, 0.43, z);
      g.add(leg);
      return top;
    };
    // 1) a Tall One, folded awkwardly onto a stool, eating fries one at a time
    {
      mkTable(2.4, -2.6);
      const shade = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 2.3, 7),
        new THREE.MeshLambertMaterial({ color: 0x0a0c12 }));
      body.position.y = 1.15;
      body.rotation.x = 0.18;          // hunched. the ceiling is too low for it
      shade.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 7),
        new THREE.MeshLambertMaterial({ color: 0x0a0c12 }));
      head.position.set(0, 2.45, 0.25);
      shade.add(head);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd8e8e0, fog: false });
      for (const ex of [-0.09, 0.09]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), eyeMat);
        eye.position.set(ex, 2.48, 0.45);
        shade.add(eye);
      }
      shade.position.set(2.4, 0, -3.6);
      const fries = buildFries(2.2);
      fries.position.set(2.4, 0.88, -2.6);
      g.add(shade, fries);
      this.regulars.push({ mesh: shade, head, kind: 'shade', phase: 0 });
    }
    // 2) a Grin hovering over a table, a burger slowly levitating toward it
    {
      mkTable(2.4, 2.8);
      const grin = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: 0xe8d8c8, fog: false });
      for (let j = 0; j <= 8; j++) {
        const a = (j / 8) * Math.PI;
        const tooth = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), mat);
        tooth.position.set(Math.cos(a) * 0.38, -Math.sin(a) * 0.22, 0);
        grin.add(tooth);
      }
      for (const ex of [-0.22, 0.22]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), mat);
        eye.position.set(ex, 0.28, 0);
        grin.add(eye);
      }
      grin.position.set(2.4, 1.9, 2.8);
      grin.rotation.y = -Math.PI / 2;
      const burger = new THREE.Group();
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0xc89a4e }));
      bun.scale.y = 0.7;
      burger.add(bun);
      burger.position.set(2.4, 1.0, 2.8);
      g.add(grin, burger);
      this.regulars.push({ mesh: grin, burger, kind: 'grin', phase: 2 });
    }
    // 3) a wormling ON the table, face-down in a fry box. living its best life
    {
      const top = mkTable(4.6, 0.2);
      const worm = new THREE.Group();
      const wmat = new THREE.MeshLambertMaterial({ color: 0x6a2a3a });
      for (let i = 0; i < 3; i++) {
        const seg = new THREE.Mesh(new THREE.SphereGeometry(0.11 - i * 0.02, 7, 6), wmat);
        seg.position.set(-i * 0.16, 0.08, 0);
        worm.add(seg);
      }
      worm.position.set(4.75, 0.9, 0.2);
      const fries = buildFries(1.6);
      fries.position.set(4.45, 0.9, 0.2);
      g.add(worm, fries);
      this.regulars.push({ mesh: worm, kind: 'worm', phase: 4 });
    }

    // solid walls (world coords) with a door opening on the east side (facing home),
    // so you walk in through the door instead of phasing through a wall
    this.colliders = [];
    const W2 = W / 2, D2 = D / 2, DOOR0 = -0.6, DOOR1 = 1.6;   // door gap in z on the +x wall
    const addC = (x0, x1, z0, z1) => this.colliders.push({
      x0: WCD_POS.x + x0, x1: WCD_POS.x + x1, z0: WCD_POS.z + z0, z1: WCD_POS.z + z1, y0: 0, y1: H,
    });
    addC(-W2 - 0.15, -W2 + 0.15, -D2, D2);          // back (west)
    addC(-W2, W2, -D2 - 0.15, -D2 + 0.15);          // north
    addC(-W2, W2, D2 - 0.15, D2 + 0.15);            // south
    addC(W2 - 0.15, W2 + 0.15, -D2, DOOR0);         // front (east), north of the door
    addC(W2 - 0.15, W2 + 0.15, DOOR1, D2);          // front (east), south of the door

    g.position.set(WCD_POS.x, 0, WCD_POS.z);
    scene.add(g);
    this.group = g;
    this._munchT = 0;
  }

  // axis-separated slide against the walls (only does work near the building)
  _blocked(x, z, feetY) {
    for (const c of this.colliders) {
      if (x > c.x0 - 0.32 && x < c.x1 + 0.32 && z > c.z0 - 0.32 && z < c.z1 + 0.32 &&
          c.y1 > feetY + 0.4 && c.y0 < feetY + 1.6) return true;
    }
    return false;
  }
  collide(px, pz, nx, nz, feetY) {
    if (!this.nearBuilding({ x: nx, z: nz }) && !this.nearBuilding({ x: px, z: pz })) return { x: nx, z: nz };
    let x = nx;
    if (this._blocked(x, pz, feetY)) x = px;
    let z = nz;
    if (this._blocked(x, z, feetY)) z = pz;
    return { x, z };
  }

  // standing at the counter? (world coords; the counter front is local x≈-2.6)
  nearCounter(p) {
    const dx = p.x - (WCD_POS.x - 2.1), dz = p.z - WCD_POS.z;
    return dx * dx + dz * dz < 5.5;
  }

  // anywhere inside / at the door?
  nearBuilding(p) {
    const dx = p.x - WCD_POS.x, dz = p.z - WCD_POS.z;
    return dx * dx + dz * dz < 110;
  }

  // returns true when a munch sound is due (main plays it — kept dumb here)
  update(dt, t, playerPos) {
    const near = this.nearBuilding(playerPos);
    // employees: heads track you, slowly. only the heads.
    for (const e of this.employees) {
      const head = e.userData.head;
      if (near) {
        const target = Math.atan2(playerPos.x - (WCD_POS.x + e.position.x), playerPos.z - (WCD_POS.z + e.position.z)) - e.rotation.y;
        head.rotation.y += (target - head.rotation.y) * Math.min(1, dt * 1.2);
      } else {
        head.rotation.y *= Math.max(0, 1 - dt);
      }
      e.userData.cap.rotation.y = head.rotation.y;
      e.userData.brim.rotation.y = head.rotation.y;
    }
    // the regulars, regular-ing
    for (const r of this.regulars) {
      const k = t + r.phase;
      if (r.kind === 'shade') {
        r.head.position.y = 2.45 + Math.sin(k * 1.4) * 0.04;   // chewing, slowly
        r.head.scale.setScalar(1 + Math.max(0, Math.sin(k * 2.8)) * 0.05);
      } else if (r.kind === 'grin') {
        r.mesh.position.y = 1.9 + Math.sin(k * 0.8) * 0.08;
        r.burger.position.y = 1.0 + ((k * 0.12) % 0.85);       // food drifts up. it's fine
        r.burger.scale.setScalar(1 - ((k * 0.12) % 0.85) * 0.5);
      } else {
        r.mesh.rotation.z = Math.sin(k * 3.2) * 0.12;          // happy wiggle
      }
    }
    // an occasional polite munch when you're inside with them
    if (near) {
      this._munchT -= dt;
      if (this._munchT <= 0) {
        this._munchT = 3.5 + Math.random() * 4;
        return true;
      }
    }
    return false;
  }
}
