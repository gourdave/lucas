// gate.js — THE DOOR at the 1000m mark. The fields go on forever — but at
// one exact spot, a thousand meters down the power lines, a single door
// stands alone in the wheat. The plaque reads LEVEL 3999.
// It is locked. The level behind it is being built by kamsamnor himself.

import * as THREE from 'three';
import { glowSprite } from './gfx.js';

export const GATE_POS = { x: 0, z: -1000 };   // follow the power lines. keep going.

export class Gate {
  constructor(scene) {
    const g = new THREE.Group();
    const frameMat = new THREE.MeshLambertMaterial({ color: 0xe8e2d4, emissive: 0x222018 });
    // a plain white door frame, far too clean for this place
    const mk = (w, h, d, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
      m.position.set(x, y, z);
      g.add(m);
    };
    mk(0.22, 2.6, 0.3, -0.66, 1.3, 0);
    mk(0.22, 2.6, 0.3, 0.66, 1.3, 0);
    mk(1.54, 0.22, 0.3, 0, 2.71, 0);
    // the door itself
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.6, 0.12),
      new THREE.MeshLambertMaterial({ color: 0xd8d2c4 }));
    door.position.set(0, 1.3, 0);
    g.add(door);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xf2b32a, fog: false }));
    knob.position.set(0.4, 1.25, 0.1);
    g.add(knob);
    // light leaks from underneath. warm light. party light?
    this.seamMat = new THREE.MeshBasicMaterial({ color: 0xffd96a, fog: false, transparent: true, opacity: 0.8 });
    const seam = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.06), this.seamMat);
    seam.position.set(0, 0.04, 0.08);
    g.add(seam);
    const halo = glowSprite(0xffd96a, 3, 0.35);
    halo.position.set(0, 0.3, 0.3);
    g.add(halo);
    // the plaque
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 96;
    const c = cv.getContext('2d');
    c.fillStyle = '#2a2520'; c.fillRect(0, 0, 256, 96);
    c.fillStyle = '#e8d49a'; c.textAlign = 'center';
    c.font = 'bold 38px Georgia';
    c.fillText('LEVEL 3999', 128, 44);
    c.font = 'italic 17px Georgia';
    c.fillStyle = '#9a917b';
    c.fillText('under construction — kamsamnor', 128, 76);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.49),
      new THREE.MeshLambertMaterial({ map: tex }));
    plaque.position.set(0, 3.2, 0.06);
    g.add(plaque);
    const lamp = new THREE.PointLight(0xffd96a, 5, 10, 2);
    lamp.position.set(0, 1.5, 1.2);
    g.add(lamp);
    // it faces the way you came — it was waiting
    g.position.set(GATE_POS.x, 0, GATE_POS.z);
    scene.add(g);
    this.group = g;
  }

  near(p) {
    const dx = p.x - GATE_POS.x, dz = p.z - GATE_POS.z;
    return dx * dx + dz * dz < 9;
  }

  update(t) {
    this.seamMat.opacity = 0.55 + Math.sin(t * 2.4) * 0.25;   // something is ON in there
  }
}
