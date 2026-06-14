// mirror.js — a full-length mirror for the house, so you can finally see
// yourself. The game is first-person, so "your reflection" is a copy of your
// online player-model (the faceless white mannequin) standing in a lit recess
// behind the glass. It tracks you: slide left/right and it slides with you,
// step closer and it grows. Lucas's idea.

import * as THREE from 'three';

const WHITE = () => new THREE.MeshLambertMaterial({ color: 0xe9e6df, emissive: 0x16140f });

// the same figure friends see online (kept in sync by hand — both pure white)
function buildMannequin() {
  const g = new THREE.Group();
  const white = WHITE();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.8, 0.24), white);
  legs.position.y = 0.4;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.55, 4, 8), white);
  torso.position.y = 1.25;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), white);
  head.position.y = 1.85;
  g.add(legs, torso, head);
  return g;
}

export class Mirror {
  // facing = yaw the mirror's front (+z local) points toward; player stands there
  constructor(scene, { x, z, facing = 0 }) {
    this.pos = new THREE.Vector3(x, 0, z);
    this.facing = facing;
    this.recess = 0.42;          // depth of the lit cavity behind the glass
    const W = 1.0, H = 2.0, y0 = 0.08;   // glass width/height, bottom off the floor

    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = facing;

    const frameMat = new THREE.MeshLambertMaterial({ color: 0x6e553c });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x14161b, side: THREE.DoubleSide });
    const box = (mat, w, h, d, px, py, pz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(px, py, pz);
      g.add(m);
      return m;
    };

    const cy = y0 + H / 2;       // glass centre height
    // opaque back panel (so you see wood, not the clone, from behind)
    box(frameMat, W + 0.18, H + 0.18, 0.08, 0, cy, -this.recess - 0.04);
    // dark recess walls — occlude the clone from steep side angles
    box(darkMat, 0.04, H, this.recess, -W / 2, cy, -this.recess / 2);
    box(darkMat, 0.04, H, this.recess, W / 2, cy, -this.recess / 2);
    box(darkMat, W, 0.04, this.recess, 0, cy + H / 2, -this.recess / 2);   // top
    box(darkMat, W, 0.04, this.recess, 0, cy - H / 2, -this.recess / 2);   // bottom
    // wooden frame around the opening
    box(frameMat, W + 0.18, 0.12, 0.12, 0, cy + H / 2 + 0.06, 0);
    box(frameMat, W + 0.18, 0.12, 0.12, 0, cy - H / 2 - 0.06, 0);
    box(frameMat, 0.12, H + 0.24, 0.12, -W / 2 - 0.06, cy, 0);
    box(frameMat, 0.12, H + 0.24, 0.12, W / 2 + 0.06, cy, 0);
    box(frameMat, 0.5, 0.1, 0.34, 0, 0.05, 0.04);    // little base/feet

    // the lit cavity keeps the white figure readable
    const rl = new THREE.PointLight(0xdfeaff, 3.4, 4.5, 2);
    rl.position.set(0, cy, -this.recess * 0.5);
    g.add(rl);

    // your reflection
    this.clone = buildMannequin();
    this.clone.visible = false;
    g.add(this.clone);

    // the glass: a faint blue sheen you see through to the reflection
    this.glass = new THREE.Mesh(new THREE.PlaneGeometry(W, H),
      new THREE.MeshBasicMaterial({ color: 0xaecadb, transparent: true, opacity: 0.16, depthWrite: false }));
    this.glass.position.set(0, cy, 0.001);
    this.glass.renderOrder = 3;
    g.add(this.glass);

    scene.add(g);
    this.group = g;
  }

  near(p) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    return dx * dx + dz * dz < 36;   // within 6m
  }

  // p = player position, yaw = look yaw. Places the reflection each frame.
  update(p, yaw) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const cT = Math.cos(this.facing), sT = Math.sin(this.facing);
    const lx = dx * cT - dz * sT;    // left/right across the mirror
    const lz = dx * sT + dz * cT;    // distance in front (>0 = standing before it)
    if (lz < 0.25 || lz > 7) { this.clone.visible = false; return; }
    this.clone.visible = true;
    // a mirror flips front-back: image sits behind the glass, depth clamped to the recess
    const depth = Math.min(lz, this.recess - 0.12);
    const cx = THREE.MathUtils.clamp(lx, -0.34, 0.34);   // keep it within the frame
    this.clone.position.set(cx, 0, -depth);
    // faces back out toward you, and turns the opposite way you do (like a mirror)
    this.clone.rotation.y = this.facing - yaw;
  }
}
