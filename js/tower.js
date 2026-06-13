// tower.js — THE RADIO TOWER, ~400m out. A red light blinking above the
// fields that you've been able to see your whole journey — now you can
// climb it. One look from the top upgrades your minimap's range forever
// (you've SEEN the shape of the world now; the glass remembers).

import * as THREE from 'three';
import { State } from './state.js';
import { glowSprite } from './gfx.js';

export const TOWER_POS = { x: -260, z: -300 };  // ~397m northwest
export const TOWER_TOP = 33.4;                   // where you stand

export class Tower {
  constructor(scene) {
    const g = new THREE.Group();
    const steel = new THREE.MeshLambertMaterial({ color: 0x8a3a34 });   // rust red
    const steel2 = new THREE.MeshLambertMaterial({ color: 0xb8b2a8 });  // pale panels
    // four legs leaning into the middle
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 34, 6), steel);
      leg.position.set(sx * 2.2, 17, sz * 2.2);
      leg.rotation.z = -sx * 0.062;
      leg.rotation.x = sz * 0.062;
      g.add(leg);
    }
    // cross braces every few meters (alternating colors, like a real mast)
    for (let y = 4; y < 32; y += 4.5) {
      const w = 4.4 * (1 - y / 45);
      const ring = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, w),
        (y / 4.5) % 2 < 1 ? steel : steel2);
      ring.position.y = y;
      g.add(ring);
    }
    // the platform + rails
    const plat = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.18, 3.4), steel2);
    plat.position.y = TOWER_TOP - 0.3;
    g.add(plat);
    for (const [sx, sz, w, d] of [[0, -1.7, 3.4, 0.08], [0, 1.7, 3.4, 0.08], [-1.7, 0, 0.08, 3.4], [1.7, 0, 0.08, 3.4]]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, d), steel);
      rail.position.set(sx, TOWER_TOP + 0.2, sz);
      g.add(rail);
    }
    // the mast + the blinking light you can see from everywhere
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 8, 6), steel);
    mast.position.y = TOWER_TOP + 4;
    g.add(mast);
    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0xff4040, fog: false });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), this.beaconMat);
    bulb.position.y = TOWER_TOP + 8.2;
    g.add(bulb);
    this.halo = glowSprite(0xff4040, 6, 0.5);
    this.halo.position.y = TOWER_TOP + 8.2;
    g.add(this.halo);
    const lamp = new THREE.PointLight(0xff5050, 7, 30, 2);
    lamp.position.y = TOWER_TOP + 8;
    g.add(lamp);
    this.lamp = lamp;
    // a service ladder up one leg (visual)
    for (let y = 1; y < 32; y += 1.2) {
      const rung = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), steel2);
      rung.position.set(0, y, -2.2 + (y / 34) * 2.2 * 0.062 * 34 * 0);
      rung.position.z = -2.15 + y * 0.058;
      g.add(rung);
    }
    g.position.set(TOWER_POS.x, 0, TOWER_POS.z);
    scene.add(g);
  }

  nearBase(p) {
    const dx = p.x - TOWER_POS.x, dz = p.z - TOWER_POS.z;
    return dx * dx + dz * dz < 16;
  }

  update(t) {
    // the slow aircraft blink
    const on = (t % 2.2) < 1.4;
    this.beaconMat.color.setHex(on ? 0xff4040 : 0x551414);
    this.halo.material.opacity = on ? 0.5 : 0.06;
    this.lamp.intensity = on ? 7 : 0.5;
  }
}
