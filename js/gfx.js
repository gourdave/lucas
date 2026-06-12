// gfx.js — small shared graphics helpers (all procedural, all cheap).
// Glow halos and fake contact shadows: the two tricks that make flat-shaded
// scenes read as "lit" without shadow maps or post-processing.

import * as THREE from 'three';

let _glowTex = null;
function glowTexture() {
  if (_glowTex) return _glowTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.32)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(cv);
  return _glowTex;
}

// a soft additive halo — parent it to anything emissive (lanterns, signs)
export function glowSprite(color, size, opacity = 0.55) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  s.scale.set(size, size, 1);
  return s;
}

let _discTex = null;
function discTexture() {
  if (_discTex) return _discTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 63);
  grad.addColorStop(0, 'rgba(0,0,0,0.34)');
  grad.addColorStop(0.7, 'rgba(0,0,0,0.18)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  _discTex = new THREE.CanvasTexture(cv);
  return _discTex;
}

// a fake ambient-occlusion disc that grounds a building to the soil
export function contactDisc(radius) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({
      map: discTexture(), transparent: true, depthWrite: false,
    }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.025;
  m.renderOrder = 1;
  return m;
}
