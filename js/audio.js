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
    this.windGain.gain.setTargetAtTime(0.05 + 0.14 * (1 - fear * 0.7), t, 0.4);
    this.droneGain.gain.setTargetAtTime(fear * 0.17, t, 0.6);

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
}
