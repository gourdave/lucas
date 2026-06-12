// garden.js — Phase B: your own garden in the safe yard. Crops grow in REAL
// time (even while the game is closed), seeds are found out in the dangerous
// fields, and the deeper you go the rarer the seeds. House = cozy, fields =
// risk: the garden is the cozy half of that bargain.

import * as THREE from 'three';
import { State, bus, save, gameNow } from './state.js';

export const CROPS = {
  goldenwheat: { name: 'Golden Wheat', emoji: '🌾', growMin: 10, sell: 15, hunger: 20, calm: 5, color: 0xd8b24f, depth: 75 },
  glowcorn: { name: 'Glowcorn', emoji: '🌽', growMin: 45, sell: 50, hunger: 30, calm: 10, color: 0xe8e26a, depth: 75 },
  moonberry: { name: 'Moonberries', emoji: '🫐', growMin: 90, sell: 95, hunger: 20, calm: 30, color: 0x7a86d8, depth: 150 },
  shadowpumpkin: { name: 'Shadow Pumpkin', emoji: '🎃', growMin: 240, sell: 220, hunger: 60, calm: 20, color: 0x3d3548, depth: 150 },
  dreamflower: { name: 'Dreamflower', emoji: '🌸', growMin: 480, sell: 450, hunger: 10, calm: 60, color: 0xe89ac8, depth: 300 },
};

// where the six plots sit in the yard (west side, safe inside the fence)
const PLOT_POS = [
  [-9, 8], [-6.5, 8], [-4, 8],
  [-9, 11], [-6.5, 11], [-4, 11],
];

export function seedForDepth(depth, rnd = Math.random) {
  const pool = Object.entries(CROPS).filter(([, c]) => depth >= c.depth);
  if (!pool.length) return 'goldenwheat';
  // deeper finds skew toward the rare end of what's eligible
  const idx = Math.min(pool.length - 1, Math.floor(rnd() * rnd() * pool.length + rnd() * 1.2));
  return pool[Math.min(idx, pool.length - 1)][0];
}

export class Garden {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.plots = [];
    const soilMat = new THREE.MeshLambertMaterial({ color: 0x4a3826 });
    for (let i = 0; i < PLOT_POS.length; i++) {
      const [x, z] = PLOT_POS[i];
      const mound = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.05, 0.22, 9), soilMat);
      mound.position.set(x, 0.11, z);
      this.group.add(mound);
      const sprout = new THREE.Group();
      sprout.position.set(x, 0.2, z);
      this.group.add(sprout);
      this.plots.push({ x, z, sprout, lastStage: -1, lastCrop: null });
    }
    this._tmr = 0;
  }

  // 0 = just planted, 1 = halfway, 2 = ready
  stageOf(plotState) {
    if (!plotState) return -1;
    const grow = CROPS[plotState.crop].growMin * 60_000;
    const t = gameNow() - plotState.plantedAt;
    return t >= grow ? 2 : t >= grow / 2 ? 1 : 0;
  }

  minutesLeft(plotState) {
    const grow = CROPS[plotState.crop].growMin * 60_000;
    return Math.max(0, Math.ceil((grow - (gameNow() - plotState.plantedAt)) / 60_000));
  }

  _rebuildVisual(i, plotState, stage) {
    const p = this.plots[i];
    p.sprout.clear();
    if (!plotState) return;
    const crop = CROPS[plotState.crop];
    if (stage === 0) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 5),
        new THREE.MeshLambertMaterial({ color: 0x6fa05a }));
      m.position.y = 0.15;
      p.sprout.add(m);
    } else if (stage === 1) {
      for (const dx of [-0.25, 0.1, 0.3]) {
        const m = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.65, 5),
          new THREE.MeshLambertMaterial({ color: 0x86b06a }));
        m.position.set(dx, 0.32, (Math.random() - 0.5) * 0.4);
        p.sprout.add(m);
      }
    } else {
      // ready: the crop itself, gently glowing so it reads from across the yard
      const mat = new THREE.MeshLambertMaterial({ color: crop.color, emissive: crop.color, emissiveIntensity: 0.25 });
      for (const [dx, dz] of [[-0.3, 0.1], [0.15, -0.25], [0.3, 0.25]]) {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.7, 5),
          new THREE.MeshLambertMaterial({ color: 0x5d7245 }));
        stem.position.set(dx, 0.35, dz);
        p.sprout.add(stem);
        const head = new THREE.Mesh(
          plotState.crop === 'shadowpumpkin'
            ? new THREE.SphereGeometry(0.32, 8, 7)
            : new THREE.SphereGeometry(0.18, 7, 6),
          mat);
        head.position.set(dx, plotState.crop === 'shadowpumpkin' ? 0.32 : 0.78, dz);
        if (plotState.crop === 'shadowpumpkin') head.scale.y = 0.8;
        p.sprout.add(head);
      }
    }
  }

  plant(i, cropId) {
    if (State.garden.plots[i]) return false;
    if (!State.seeds[cropId]) return false;
    State.seeds[cropId]--;
    State.garden.plots[i] = { crop: cropId, plantedAt: gameNow() };
    bus.emit('planted', { crop: cropId });
    save();
    return true;
  }

  harvest(i) {
    const plotState = State.garden.plots[i];
    if (!plotState || this.stageOf(plotState) !== 2) return null;
    const crop = CROPS[plotState.crop];
    const count = 1 + Math.floor(Math.random() * 3); // 1–3 crops per harvest
    State.inventory.food[plotState.crop] = (State.inventory.food[plotState.crop] || 0) + count;
    State.garden.plots[i] = null;
    bus.emit('harvest', { crop: plotState.crop, count });
    save();
    return { crop, count };
  }

  // label for the plot's interact prompt
  plotLabel(i) {
    const plotState = State.garden.plots[i];
    if (!plotState) {
      const hasSeeds = Object.values(State.seeds).some((n) => n > 0);
      return hasSeeds ? '🌱  Plant a seed' : '🌱  Plot (find seeds in the fields)';
    }
    const stage = this.stageOf(plotState);
    const crop = CROPS[plotState.crop];
    if (stage === 2) return `${crop.emoji}  Harvest ${crop.name}!`;
    return `⏳  ${crop.name} — ${this.minutesLeft(plotState)}m left`;
  }

  plotHotspots() {
    return this.plots.map((p, i) => ({
      id: 'plot' + i, x: p.x, y: 0, z: p.z, r: 1.3,
      label: () => this.plotLabel(i),
      locked: 'garden',
    }));
  }

  update(dt) {
    this._tmr -= dt;
    if (this._tmr > 0) return;
    this._tmr = 1.5; // visuals only need a slow refresh
    for (let i = 0; i < this.plots.length; i++) {
      const plotState = State.garden.plots[i];
      const stage = this.stageOf(plotState);
      const cropId = plotState ? plotState.crop : null;
      if (stage !== this.plots[i].lastStage || cropId !== this.plots[i].lastCrop) {
        this.plots[i].lastStage = stage;
        this.plots[i].lastCrop = cropId;
        this._rebuildVisual(i, plotState, stage);
      }
    }
  }
}
