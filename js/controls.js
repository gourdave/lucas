// controls.js — one input module, two backends:
//   desktop: pointer-lock mouse look + WASD + E to interact
//   mobile:  floating left-thumb joystick + right-half drag look + tap to interact
// Both feed the same { move, yaw, pitch } that the game reads each frame.

const TAP_MS = 260;   // a touch shorter than this...
const TAP_PX = 14;    // ...that moved less than this counts as a tap (= interact)
const JOY_RADIUS = 46;

export class Controls {
  constructor(canvas, joyLayer) {
    this.canvas = canvas;
    this.enabled = false;     // false while title / chat / book / dream is up
    this.yaw = 0;             // left-right facing (radians)
    this.pitch = 0;           // up-down facing
    this.move = { x: 0, y: 0 }; // strafe / forward, -1..1
    this.onInteract = null;
    this.isTouch = false;

    this._keys = new Set();
    this._joyPtr = null;
    this._lookPtr = null;

    // joystick visuals
    this.base = document.createElement('div');
    this.base.className = 'joy-base hidden';
    this.nub = document.createElement('div');
    this.nub.className = 'joy-nub';
    this.base.appendChild(this.nub);
    joyLayer.appendChild(this.base);

    this._bind();
  }

  _bind() {
    const cv = this.canvas;

    // --- keyboard ---
    addEventListener('keydown', (e) => {
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return; // typing in chat
      this._keys.add(e.code);
      if (e.code === 'KeyE' && !e.repeat && this.enabled && this.onInteract) this.onInteract();
      if (e.code === 'KeyQ' && !e.repeat && this.enabled && this.onDrink) this.onDrink();
    });
    addEventListener('keyup', (e) => this._keys.delete(e.code));

    // --- desktop pointer lock ---
    cv.addEventListener('click', () => {
      if (!this.enabled || this.isTouch) return;
      if (document.pointerLockElement !== cv) {
        if (cv.requestPointerLock) cv.requestPointerLock();
      } else if (this.onInteract) {
        this.onInteract(); // while locked, a click acts on the nearest prompt
      }
    });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === cv && this.enabled) {
        this.yaw -= e.movementX * 0.0022;
        this.pitch -= e.movementY * 0.0022;
        this._clampPitch();
      }
    });

    // --- touch ---
    cv.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      this.isTouch = true;
      e.preventDefault();
      if (!this.enabled) return;
      if (e.clientX < innerWidth * 0.45 && this._joyPtr === null) {
        // joystick spawns wherever the left thumb lands
        this._joyPtr = e.pointerId;
        this._joyOx = e.clientX;
        this._joyOy = e.clientY;
        this.base.style.left = (e.clientX - 55) + 'px';
        this.base.style.top = (e.clientY - 55) + 'px';
        this.base.classList.remove('hidden');
        this._setNub(0, 0);
      } else if (this._lookPtr === null) {
        this._lookPtr = e.pointerId;
        this._lx = e.clientX; this._ly = e.clientY;
        this._lsx = e.clientX; this._lsy = e.clientY;
        this._lt = performance.now();
      }
    }, { passive: false });

    cv.addEventListener('pointermove', (e) => {
      if (e.pointerId === this._joyPtr) {
        let dx = e.clientX - this._joyOx;
        let dy = e.clientY - this._joyOy;
        const len = Math.hypot(dx, dy);
        if (len > JOY_RADIUS) { dx *= JOY_RADIUS / len; dy *= JOY_RADIUS / len; }
        this._setNub(dx, dy);
        const dead = 0.16;
        const mx = dx / JOY_RADIUS, my = -dy / JOY_RADIUS;
        this.move.x = Math.abs(mx) < dead ? 0 : mx;
        this.move.y = Math.abs(my) < dead ? 0 : my;
      } else if (e.pointerId === this._lookPtr && this.enabled) {
        this.yaw -= (e.clientX - this._lx) * 0.0046;
        this.pitch -= (e.clientY - this._ly) * 0.0046;
        this._clampPitch();
        this._lx = e.clientX; this._ly = e.clientY;
      }
    }, { passive: false });

    const release = (e) => {
      if (e.pointerId === this._joyPtr) {
        this._joyPtr = null;
        this.move.x = 0; this.move.y = 0;
        this.base.classList.add('hidden');
      } else if (e.pointerId === this._lookPtr) {
        const moved = Math.hypot(e.clientX - this._lsx, e.clientY - this._lsy);
        if (moved < TAP_PX && performance.now() - this._lt < TAP_MS && this.enabled && this.onInteract) {
          this.onInteract();
        }
        this._lookPtr = null;
      }
    };
    cv.addEventListener('pointerup', release);
    cv.addEventListener('pointercancel', release);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _setNub(x, y) { this.nub.style.transform = `translate(${x}px,${y}px)`; }
  _clampPitch() { this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch)); }

  // called once per frame; keyboard fills `move` when the joystick isn't held
  update() {
    if (this._joyPtr === null) {
      const k = this._keys;
      let x = ((k.has('KeyD') || k.has('ArrowRight')) ? 1 : 0) - ((k.has('KeyA') || k.has('ArrowLeft')) ? 1 : 0);
      let y = ((k.has('KeyW') || k.has('ArrowUp')) ? 1 : 0) - ((k.has('KeyS') || k.has('ArrowDown')) ? 1 : 0);
      if (x && y) { x *= 0.7071; y *= 0.7071; }
      this.move.x = x; this.move.y = y;
    }
    if (!this.enabled) { this.move.x = 0; this.move.y = 0; }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
