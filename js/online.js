// online.js — friends-scale live presence for The Bumper Crop.
// Connects to the Room Durable Object via WebSocket.
// Room code = private room: share a code with friends to land in the same room.
// Friends appear as glowing ghost avatars + name tags that lerp smoothly.
// Chat is relayed through the server, stripped of control chars, never stored.
// Max 8 players per room code.

import * as THREE from 'three';
import { PROXY_URL } from './therapist.js';

const _BASE   = PROXY_URL.replace(/\/$/, '').replace('https://', 'wss://').replace('http://', 'ws://');
const ROOM_WS = _BASE + '/room';   // ?code=XXXX appended on connect
const SEND_MS  = 100;       // position broadcast rate
const PING_MS  = 20000;     // keepalive
const STALE_MS = 30000;     // drop a peer silent for this long

export class Online {
  constructor() {
    this.ws       = null;
    this.myId     = null;
    this.myName   = null;
    this.myColor  = null;
    this.peers    = new Map();  // id → PeerEntry
    this.status   = 'disconnected';  // 'disconnected'|'connecting'|'connected'|'error'
    this.scene    = null;
    this._sendT   = 0;
    this._pingT   = 0;
    this._px      = 0;
    this._pz      = 11;
    this.onMsg         = null;   // (name, text, color) → void  for incoming chat
    this.onPeerChange  = null;   // (count) → void
  }

  get peerCount() { return this.peers.size; }
  get connected()  { return this.status === 'connected'; }

  connect(scene, code) {
    if (this.ws) { this.ws.onclose = null; this.ws.close(); this.ws = null; }
    this._cleanup();
    this.scene  = scene;
    this.status = 'connecting';
    const clean = String(code || 'FIELDS').replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || 'FIELDS';
    try {
      this.ws = new WebSocket(ROOM_WS + '?code=' + encodeURIComponent(clean));
      this.ws.onopen    = ()  => { this.status = 'connected'; };
      this.ws.onclose   = ()  => { this._cleanup(); };
      this.ws.onerror   = ()  => { this.status = 'error'; };
      this.ws.onmessage = (e) => {
        try { this._onMsg(JSON.parse(e.data)); } catch { /* bad payload */ }
      };
    } catch {
      this.status = 'error';
    }
  }

  sendChat(text) {
    if (this.ws?.readyState !== 1) return;
    const t = String(text || '').trim().slice(0, 140);
    if (t) this.ws.send(JSON.stringify({ type: 'chat', text: t }));
  }

  disconnect() {
    try { this.ws?.close(); } catch { /* ignore */ }
    this._cleanup();
    this.status = 'disconnected';
  }

  // call every frame from main.js tick(); dt in seconds
  tick(x, z, yaw, dt) {
    this._px = x; this._pz = z;
    this._sendT -= dt * 1000;
    this._pingT -= dt * 1000;
    if (this.ws?.readyState !== 1 /* OPEN */) return;
    if (this._sendT <= 0) {
      this._sendT = SEND_MS;
      this.ws.send(JSON.stringify({ type: 'pos', x: +x.toFixed(2), z: +z.toFixed(2), yaw: +yaw.toFixed(3) }));
    }
    if (this._pingT <= 0) {
      this._pingT = PING_MS;
      this.ws.send(JSON.stringify({ type: 'ping' }));
    }
  }

  // call every frame; smoothly lerps avatar positions, updates bubbles
  update(dt) {
    const now = Date.now();
    for (const [id, p] of this.peers) {
      if (now - p.lastSeen > STALE_MS) { this._removePeer(id); continue; }
      const k = Math.min(1, 10 * dt);
      p.x += (p.tx - p.x) * k;
      p.z += (p.tz - p.z) * k;
      let dy = p.tyaw - p.yaw;
      while (dy >  Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      p.yaw += dy * k;
      if (p.mesh) {
        p.mesh.position.set(p.x, 0, p.z);
        p.mesh.rotation.y = p.yaw;
        // hide if more than 240m away (save draw calls)
        p.mesh.visible = Math.hypot(p.x - this._px, p.z - this._pz) < 240;
      }
      // chat bubble timer
      if (p.bubbleTimer > 0) {
        p.bubbleTimer -= dt;
        if (p.bubbleTimer <= 0 && p.bubbleSprite) {
          p.mesh?.remove(p.bubbleSprite);
          p.bubbleSprite.material.map.dispose();
          p.bubbleSprite.material.dispose();
          p.bubbleSprite = null;
          if (p.labelSprite) p.labelSprite.visible = true;
        } else if (p.bubbleSprite) {
          p.bubbleSprite.material.opacity = Math.min(1, p.bubbleTimer * 1.5);
        }
      }
    }
  }

  // returns [{x, z, color}] for minimap markers
  peerDots() {
    return [...this.peers.values()].map((p) => ({ x: p.x, z: p.z, color: p.color }));
  }

  // ---- private ----

  _onMsg(data) {
    switch (data.type) {
      case 'welcome':
        this.myId = data.id; this.myName = data.name; this.myColor = data.color;
        this.status = 'connected';
        break;
      case 'state':
        for (const p of data.peers || []) this._addPeer(p);
        this.onPeerChange?.(this.peers.size);
        break;
      case 'joined':
        this._addPeer(data);
        this.onPeerChange?.(this.peers.size);
        break;
      case 'move': {
        const p = this.peers.get(data.id);
        if (!p) return;
        p.tx = _clamp(data.x, -600, 600);
        p.tz = _clamp(data.z, -1300, 25);
        p.tyaw = +data.yaw || 0;
        p.lastSeen = Date.now();
        break;
      }
      case 'left':
        this._removePeer(data.id);
        this.onPeerChange?.(this.peers.size);
        break;
      case 'chat': {
        if (data.id === this.myId) break;
        const p = this.peers.get(data.id);
        if (p) this._showBubble(p, data.text);
        this.onMsg?.(data.name || 'Friend', data.text || '', data.color || '#7ec8f0');
        break;
      }
    }
  }

  _addPeer({ id, name, color, x, z, yaw }) {
    if (!id || this.peers.has(id)) return;
    const x0 = x ?? 0, z0 = z ?? 11;
    const mesh = this._makeMesh(color, name);
    if (this.scene) { this.scene.add(mesh); mesh.position.set(x0, 0, z0); }
    // stash a ref to the label sprite so we can toggle it with the bubble
    const labelSprite = mesh.children[mesh.children.length - 1];
    this.peers.set(id, { name, color: color || '#7ec8f0', x: x0, z: z0, yaw: yaw ?? 0,
      tx: x0, tz: z0, tyaw: yaw ?? 0, mesh, lastSeen: Date.now(),
      bubbleSprite: null, bubbleTimer: 0, labelSprite });
  }

  _showBubble(p, text) {
    if (p.bubbleSprite) {
      p.mesh?.remove(p.bubbleSprite);
      p.bubbleSprite.material.map.dispose();
      p.bubbleSprite.material.dispose();
    }
    p.bubbleTimer = 6.0;
    const cvs = this._makeBubbleCanvas(p.name, text, p.color);
    const tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false });
    const spr = new THREE.Sprite(mat);
    spr.scale.set(3.2, 0.7, 1);
    spr.position.y = 3.6;
    p.bubbleSprite = spr;
    p.mesh?.add(spr);
    if (p.labelSprite) p.labelSprite.visible = false;
  }

  _makeBubbleCanvas(name, text, color) {
    const cv = document.createElement('canvas');
    cv.width = 380; cv.height = 76;
    const c = cv.getContext('2d');
    c.fillStyle = 'rgba(8,10,18,0.84)';
    c.beginPath();
    if (c.roundRect) c.roundRect(2, 2, 376, 72, 12);
    else c.rect(2, 2, 376, 72);
    c.fill();
    c.strokeStyle = color || '#7ec8f0';
    c.lineWidth = 1.5;
    c.stroke();
    c.fillStyle = color || '#7ec8f0';
    c.font = 'bold 13px sans-serif';
    c.textAlign = 'center';
    c.fillText(String(name || 'Friend').slice(0, 20), 190, 20);
    c.fillStyle = '#f0ead8';
    c.font = '14px sans-serif';
    let t = String(text || '');
    while (c.measureText(t).width > 350 && t.length > 1) t = t.slice(0, -1);
    if (t.length < (text || '').length) t += '…';
    c.fillText(t, 190, 52);
    return cv;
  }

  _removePeer(id) {
    const p = this.peers.get(id);
    if (p?.mesh && this.scene) this.scene.remove(p.mesh);
    this.peers.delete(id);
  }

  _cleanup() {
    for (const [id] of [...this.peers.keys()]) this._removePeer(id);
    this.ws   = null;
    this.myId = null;
    if (this.status !== 'error') this.status = 'disconnected';
    this.onPeerChange?.(0);
  }

  _makeMesh(colorHex, name) {
    const col = new THREE.Color(colorHex || '#7ec8f0');
    const mat = (op) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, fog: true });
    const grp = new THREE.Group();

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.05, 0.22), mat(0.72));
    body.position.y = 1.3;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 8, 6), mat(0.65));
    head.position.y = 2.18;

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    for (const ex of [-0.1, 0.1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.052, 6, 4), eyeMat);
      eye.position.set(ex, 2.22, 0.23);
      grp.add(eye);
    }
    grp.add(body, head);

    const label = this._makeLabel(name, colorHex);
    label.position.y = 2.85;
    grp.add(label);

    return grp;
  }

  _makeLabel(name, colorHex) {
    const cvs = document.createElement('canvas');
    cvs.width = 256; cvs.height = 56;
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(4, 4, 248, 48);
    ctx.fillStyle = colorHex || '#fff';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((name || '?').slice(0, 16), 128, 28);
    const tex = new THREE.CanvasTexture(cvs);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false, depthTest: false }));
    spr.scale.set(2.4, 0.52, 1);
    return spr;
  }
}

function _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, +v || 0)); }
