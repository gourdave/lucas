// audio.js — every sound is synthesized with WebAudio at runtime: wind,
// a low dread-drone, whispers, heartbeats, and little UI noises.
// Nothing here can play until the first user gesture (the title button).

export class GameAudio {
  constructor() {
    this.ctx = null;
    this._nextBeat = 0;
    this._whisperCooldown = 0;
  }

  // call from a click/tap handler
  resume() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch { return; }
      this._build();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _noiseBuffer(seconds) {
    const len = this.ctx.sampleRate * seconds;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _build() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;            // kid-safe ceiling on everything
    this.master.connect(ctx.destination);

    // wind: looping noise through a soft lowpass
    const wind = ctx.createBufferSource();
    wind.buffer = this._noiseBuffer(2.5);
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 420;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.16;
    wind.connect(windFilter).connect(this.windGain).connect(this.master);
    wind.start();

    // dread drone: two slightly-detuned saws, very low
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 160;
    droneFilter.connect(this.droneGain).connect(this.master);
    for (const f of [48, 48.7]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      osc.connect(droneFilter);
      osc.start();
    }
  }

  // smooth fear-driven mix; call every frame
  update(dt, fear, sanity) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.09 + 0.21 * (1 - fear * 0.6), t, 0.4);
    this.droneGain.gain.setTargetAtTime(fear * 0.2, t, 0.6);

    // sparse whispers deep in the dark
    this._whisperCooldown -= dt;
    if (fear > 0.65 && this._whisperCooldown <= 0 && Math.random() < dt * 0.1) {
      this._whisperCooldown = 6;
      this._whisper();
    }
    // heartbeat when calm is nearly gone
    if (sanity < 30 && t > this._nextBeat) {
      this._nextBeat = t + 0.5 + (sanity / 30) * 0.5;
      this._thump();
    }
  }

  _env(gainNode, t, peak, attack, decay) {
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(peak, t + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  _whisper() {
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.6);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900 + Math.random() * 1400;
    bp.Q.value = 8;
    const g = ctx.createGain();
    this._env(g, t, 0.07, 0.15, 0.45);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.7);
  }

  _thump() {
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(58, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.12);
    const g = ctx.createGain();
    this._env(g, t, 0.22, 0.01, 0.13);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  // the (volume-capped) jump-scare sting
  sting() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.exponentialRampToValueAtTime(52, t + 0.4);
    const g = ctx.createGain();
    this._env(g, t, 0.3, 0.01, 0.42);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.5);
    const noise = ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(0.4);
    const ng = ctx.createGain();
    this._env(ng, t, 0.18, 0.01, 0.3);
    noise.connect(ng).connect(this.master);
    noise.start(t);
  }

  sizzle() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(1.6);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3200;
    const g = ctx.createGain();
    this._env(g, t, 0.09, 0.1, 1.3);
    src.connect(hp).connect(g).connect(this.master);
    src.start(t);
  }

  chime() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [f, d] of [[880, 0], [1318, 0.09]]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f;
      const g = ctx.createGain();
      this._env(g, t + d, 0.08, 0.01, 0.4);
      osc.connect(g).connect(this.master);
      osc.start(t + d);
      osc.stop(t + d + 0.45);
    }
  }

  blip() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.frequency.value = 640;
    const g = ctx.createGain();
    this._env(g, t, 0.06, 0.01, 0.07);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  // footsteps: a dull knock on wood, a soft swish on grass
  step(surface) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.12);
    src.playbackRate.value = 0.85 + Math.random() * 0.3;
    const filt = ctx.createBiquadFilter();
    const g = ctx.createGain();
    if (surface === 'wood') {
      filt.type = 'lowpass';
      filt.frequency.value = 320;
      this._env(g, t, 0.16, 0.004, 0.09);
      const knock = ctx.createOscillator();
      knock.type = 'sine';
      knock.frequency.setValueAtTime(95 + Math.random() * 18, t);
      const kg = ctx.createGain();
      this._env(kg, t, 0.1, 0.004, 0.07);
      knock.connect(kg).connect(this.master);
      knock.start(t); knock.stop(t + 0.1);
    } else {
      filt.type = 'bandpass';
      filt.frequency.value = 1500 + Math.random() * 700;
      filt.Q.value = 0.8;
      this._env(g, t, 0.07, 0.01, 0.1);
    }
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
  }

  // the classic two-tone appliance DING!
  ding() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [f, d, p] of [[1567, 0, 0.12], [1046, 0.02, 0.1]]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const g = ctx.createGain();
      this._env(g, t + d, p, 0.005, 1.1);
      osc.connect(g).connect(this.master);
      osc.start(t + d);
      osc.stop(t + d + 1.2);
    }
  }

  hum(seconds) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 119;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.15);
    g.gain.setValueAtTime(0.05, t + seconds - 0.1);
    g.gain.linearRampToValueAtTime(0.0001, t + seconds);
    osc.connect(lp).connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + seconds + 0.05);
  }

  // a soft "fwip" of light leaving the barrel — deliberately not a bang
  shoot() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(640, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.12);
    const g = ctx.createGain();
    this._env(g, t, 0.14, 0.004, 0.12);
    osc.connect(g).connect(this.master);
    osc.start(t); osc.stop(t + 0.16);
    const n = ctx.createBufferSource();
    n.buffer = this._noiseBuffer(0.08);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 2600;
    const ng = ctx.createGain();
    this._env(ng, t, 0.06, 0.004, 0.07);
    n.connect(hp).connect(ng).connect(this.master);
    n.start(t);
  }

  // the wet pop of a wormling bursting into coins
  pop() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.08);
    const g = ctx.createGain();
    this._env(g, t, 0.16, 0.005, 0.1);
    osc.connect(g).connect(this.master);
    osc.start(t); osc.stop(t + 0.14);
  }

  coin() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [f, d] of [[1318, 0], [1760, 0.07]]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const g = ctx.createGain();
      this._env(g, t + d, 0.09, 0.005, 0.25);
      osc.connect(g).connect(this.master);
      osc.start(t + d); osc.stop(t + d + 0.3);
    }
  }

  bite() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(82, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.25);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 240;
    const g = ctx.createGain();
    this._env(g, t, 0.26, 0.01, 0.26);
    osc.connect(lp).connect(g).connect(this.master);
    osc.start(t); osc.stop(t + 0.3);
  }

  whisperNow() { this._whisper(); }

  // ---------- the radio: little generative tunes per cassette ----------
  startTape(style) {
    this.stopTape();
    if (!this.ctx) return;
    const ctx = this.ctx;
    this.tapeGain = ctx.createGain();
    this.tapeGain.gain.value = 0.16;
    this.tapeGain.connect(this.master);
    const PAT = {
      spooky: { base: 110, wave: 'sine', tempo: 420, notes: [0, 3, 7, 3, 0, 3, 8, 7, 0, 3, 7, 10, 8, 7, 3, 1] },
      chill: { base: 220, wave: 'triangle', tempo: 340, notes: [0, 4, 7, 12, 9, 7, 4, 2, 0, 4, 9, 7, 12, 9, 4, 7] },
      bit: { base: 330, wave: 'square', tempo: 170, notes: [0, 0, 7, 0, 5, 4, 2, 4, 0, 0, 7, 9, 5, 4, 2, 0] },
      rain: { base: 165, wave: 'sine', tempo: 600, notes: [0, 7, 12, 7, 5, 12, 7, 3] },
      hero: { base: 196, wave: 'triangle', tempo: 260, notes: [0, 4, 7, 12, 7, 12, 14, 12, 7, 4, 7, 12, 16, 14, 12, 7] },
    };
    const p = PAT[style] || PAT.chill;
    let step = 0;
    this._tapeTimer = setInterval(() => {
      if (ctx.state !== 'running') return;
      const t = ctx.currentTime;
      const semis = p.notes[step % p.notes.length];
      const osc = ctx.createOscillator();
      osc.type = p.wave;
      osc.frequency.value = p.base * Math.pow(2, semis / 12);
      const g = ctx.createGain();
      this._env(g, t, style === 'bit' ? 0.5 : 0.8, 0.02, p.tempo / 1000 * 1.4);
      osc.connect(g).connect(this.tapeGain);
      osc.start(t);
      osc.stop(t + p.tempo / 1000 * 1.6);
      step++;
    }, p.tempo);
  }

  stopTape() {
    if (this._tapeTimer) clearInterval(this._tapeTimer);
    this._tapeTimer = null;
    if (this.tapeGain) { try { this.tapeGain.disconnect(); } catch {} }
    this.tapeGain = null;
  }

  // a soft plunk + ripple for the fishing line
  splash() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.18);
    const g = ctx.createGain();
    this._env(g, t, 0.12, 0.005, 0.18);
    osc.connect(g).connect(this.master);
    osc.start(t); osc.stop(t + 0.22);
    const n = ctx.createBufferSource();
    n.buffer = this._noiseBuffer(0.3);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 1.2;
    const ng = ctx.createGain();
    this._env(ng, t + 0.04, 0.05, 0.02, 0.26);
    n.connect(bp).connect(ng).connect(this.master);
    n.start(t + 0.04);
  }

  // a shovel biting into soil
  dig() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = this._noiseBuffer(0.22);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 480;
    const g = ctx.createGain();
    this._env(g, t, 0.2, 0.005, 0.2);
    n.connect(lp).connect(g).connect(this.master);
    n.start(t);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.1);
    const og = ctx.createGain();
    this._env(og, t, 0.1, 0.005, 0.1);
    osc.connect(og).connect(this.master);
    osc.start(t); osc.stop(t + 0.14);
  }

  // the number station: carrier hum, then five flat beeps through static
  numberStation() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = this._noiseBuffer(3.4);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.5;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(0.05, t + 0.4);
    ng.gain.setValueAtTime(0.05, t + 2.9);
    ng.gain.linearRampToValueAtTime(0.0001, t + 3.4);
    n.connect(bp).connect(ng).connect(this.master);
    n.start(t);
    [0.6, 1.1, 1.6, 2.1, 2.6].forEach((d, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = i % 2 ? 880 : 1046;
      const g = ctx.createGain();
      this._env(g, t + d, 0.09, 0.01, 0.3);
      osc.connect(g).connect(this.master);
      osc.start(t + d);
      osc.stop(t + d + 0.35);
    });
  }

  // a thin held tone while The Listener hunts — stops the moment it leaves
  listenerStart() {
    if (!this.ctx || this._listener) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 1320;
    const vib = ctx.createOscillator();
    vib.frequency.value = 4.5;
    const vibGain = ctx.createGain();
    vibGain.gain.value = 9;
    vib.connect(vibGain).connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.035, t + 1.2);
    osc.connect(g).connect(this.master);
    osc.start(t); vib.start(t);
    this._listener = { osc, vib, g };
  }

  listenerStop() {
    if (!this.ctx || !this._listener) return;
    const t = this.ctx.currentTime;
    const l = this._listener;
    l.g.gain.setTargetAtTime(0.0001, t, 0.3);
    setTimeout(() => { try { l.osc.stop(); l.vib.stop(); } catch {} }, 1500);
    this._listener = null;
  }

  // The Borrower's nasty little laugh
  giggle() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [1244, 1480, 1108, 1318, 988].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const g = ctx.createGain();
      this._env(g, t + i * 0.055, 0.07, 0.005, 0.09);
      osc.connect(g).connect(this.master);
      osc.start(t + i * 0.055);
      osc.stop(t + i * 0.055 + 0.12);
    });
  }

  // camera shutter for photo mode
  shutter() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = this._noiseBuffer(0.06);
    const g = ctx.createGain();
    this._env(g, t, 0.18, 0.002, 0.05);
    n.connect(g).connect(this.master);
    n.start(t);
  }

  // level-up fanfare: a bright ascending arpeggio
  fanfare() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const g = ctx.createGain();
      this._env(g, t + i * 0.09, 0.12, 0.01, 0.5);
      osc.connect(g).connect(this.master);
      osc.start(t + i * 0.09);
      osc.stop(t + i * 0.09 + 0.6);
    });
  }

  // egg hatch: sparkly little run
  hatchJingle() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [880, 1108, 1318, 1760, 2217].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = ctx.createGain();
      this._env(g, t + i * 0.07, 0.07, 0.01, 0.35);
      osc.connect(g).connect(this.master);
      osc.start(t + i * 0.07);
      osc.stop(t + i * 0.07 + 0.45);
    });
  }

  munch() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const d of [0, 0.16]) {
      const src = ctx.createBufferSource();
      src.buffer = this._noiseBuffer(0.1);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      const g = ctx.createGain();
      this._env(g, t + d, 0.14, 0.005, 0.08);
      src.connect(lp).connect(g).connect(this.master);
      src.start(t + d);
    }
  }

  page() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.3);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2400;
    const g = ctx.createGain();
    this._env(g, t, 0.06, 0.04, 0.22);
    src.connect(hp).connect(g).connect(this.master);
    src.start(t);
  }

  // a gentle two-note pad that plays underneath dreams
  startDream() {
    if (!this.ctx || this._dream) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.055, t + 3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.connect(g).connect(this.master);
    const oscs = [];
    for (const f of [220, 277.2, 330.6]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      osc.detune.value = (Math.random() - 0.5) * 8;
      osc.connect(lp);
      osc.start(t);
      oscs.push(osc);
    }
    this._dream = { g, oscs };
  }

  stopDream() {
    if (!this.ctx || !this._dream) return;
    const t = this.ctx.currentTime;
    this._dream.g.gain.setTargetAtTime(0.0001, t, 0.6);
    const d = this._dream;
    setTimeout(() => d.oscs.forEach((o) => { try { o.stop(); } catch { } }), 2500);
    this._dream = null;
  }
}
