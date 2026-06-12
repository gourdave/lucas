// decor.js — Phase E: make the house YOURS. Furniture and decorations bought
// at the stall appear at their spot in the house; the radio plays cassette
// tapes found in the fields.

import * as THREE from 'three';
import { State } from './state.js';

// each item has one fixed home — buy it, and it appears there
export const DECOR = {
  rug: {
    name: 'Big Round Rug', emoji: '🟤', price: 60, desc: 'Warms up the living room floor.',
    build(g) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.04, 18),
        new THREE.MeshLambertMaterial({ color: 0x8a4a3a }));
      m.position.set(-3.6, 0.06, -0.6);
      g.add(m);
    },
  },
  poster: {
    name: 'Poster: "THE FIELDS ARE FINE"', emoji: '🖼', price: 40, desc: 'A very reassuring poster for the hallway.',
    build(g) {
      const cv = document.createElement('canvas');
      cv.width = 128; cv.height = 160;
      const c = cv.getContext('2d');
      c.fillStyle = '#d8cfae'; c.fillRect(0, 0, 128, 160);
      c.fillStyle = '#3a3325'; c.font = 'bold 18px Georgia'; c.textAlign = 'center';
      c.fillText('THE', 64, 40); c.fillText('FIELDS', 64, 66); c.fillText('ARE', 64, 92); c.fillText('FINE', 64, 118);
      c.font = '10px Georgia'; c.fillText('(probably)', 64, 142);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1),
        new THREE.MeshLambertMaterial({ map: tex }));
      m.position.set(-1.2, 1.7, 4.34);
      m.rotation.y = Math.PI;
      g.add(m);
    },
  },
  plant: {
    name: 'Pot Plant', emoji: '🪴', price: 35, desc: 'Something green that does not bite.',
    build(g) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.26, 8),
        new THREE.MeshLambertMaterial({ color: 0x9a5a3a }));
      pot.position.set(5.5, 0.13, 0.6);
      g.add(pot);
      for (let i = 0; i < 5; i++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 5),
          new THREE.MeshLambertMaterial({ color: 0x4a7a3a }));
        leaf.position.set(5.5 + (Math.random() - 0.5) * 0.15, 0.5, 0.6 + (Math.random() - 0.5) * 0.15);
        leaf.rotation.z = (Math.random() - 0.5) * 0.7;
        g.add(leaf);
      }
    },
  },
  gnome: {
    name: 'Yard Gnome', emoji: '🧙', price: 80, desc: 'Stands guard by the gate. Has seen things.',
    build(g) {
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 8),
        new THREE.MeshLambertMaterial({ color: 0x3a5a8a }));
      body.position.set(2.3, 0.25, 13.8);
      g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 7),
        new THREE.MeshLambertMaterial({ color: 0xd8b090 }));
      head.position.set(2.3, 0.56, 13.8);
      g.add(head);
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.35, 8),
        new THREE.MeshLambertMaterial({ color: 0xa83030 }));
      hat.position.set(2.3, 0.8, 13.8);
      g.add(hat);
    },
  },
  lights: {
    name: 'Porch String Lights', emoji: '💡', price: 100, desc: 'Cozy glow you can see from deep in the fields.',
    build(g) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false });
      for (let i = 0; i < 9; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), mat);
        b.position.set(-3.6 + i * 0.9, 2.6 + Math.sin(i * 1.2) * 0.12, 4.72);
        g.add(b);
      }
      const glow = new THREE.PointLight(0xffd9a0, 8, 9, 2);
      glow.position.set(0, 2.6, 5.2);
      g.add(glow);
    },
  },
  trophy: {
    name: "Harvester's Lantern (trophy)", emoji: '🎃', price: -1, desc: 'Proof. It sits on the mantel and never quite goes out.',
    build(g) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.34),
        new THREE.MeshLambertMaterial({ color: 0x2a2018, emissive: 0xff7720, emissiveIntensity: 0.6 }));
      m.position.set(-2.0, 1.05, -4.2);
      g.add(m);
      const glow = new THREE.PointLight(0xff8830, 5, 5, 2);
      glow.position.set(-2.0, 1.2, -4.0);
      g.add(glow);
    },
  },
};

export class Decor {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.built = [];
    // the radio: always present, tapes give it life
    const radio = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.22),
      new THREE.MeshLambertMaterial({ color: 0x6a4a2e }));
    radio.position.set(-2.6, 0.95, -4.25);
    scene.add(radio);
    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.06, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
    dial.position.set(-2.5, 0.97, -4.13);
    scene.add(dial);
  }

  refresh() {
    const want = State.decor.join(',');
    if (want === this._last) return;
    this._last = want;
    this.group.clear();
    for (const id of State.decor) {
      if (DECOR[id]) DECOR[id].build(this.group);
    }
  }
}
