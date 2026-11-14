// Keyboard / mouse input with pointer lock and per-frame edge detection.
export const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  crouch: ['KeyC', 'ControlLeft', 'ControlRight'],
  dive: ['KeyZ', 'KeyX'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  reload: ['KeyR'],
  weapon1: ['Digit1'],
  weapon2: ['Digit2'],
  weapon3: ['Digit3'],
  swap: ['KeyQ'],
  inspect: ['KeyI'],
  melee: ['KeyV', 'KeyE'],
  mount: ['KeyT'],
  scoreboard: ['Tab'],
  loadout: ['KeyL'],
  interact: ['KeyF'],
  buy: ['KeyB'],
  plate: ['KeyG'],
  map: ['KeyM'],
  camera: ['KeyV'],
};

export class Input {
  constructor(target) {
    this.target = target;
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.releasedKeys = new Set();
    this.mouse = [false, false, false];
    this.mousePressed = [false, false, false];
    this.mouseReleased = [false, false, false];
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.locked = false;
    // hover look: when pointer lock is unavailable (embedded views), the camera follows the
    // mouse without any button held, and keeps turning while the cursor sits at a window edge
    this.hoverLook = false;
    this.cx = -1; this.cy = -1; this.inside = false;
    this.onLockChange = null;
    this.enabled = true;
    this.capture = false; // in a match: Ctrl+<key> belongs to the game, not to the browser
    this.ui = false; // an on-screen menu has the mouse (the S&D shop): no looking, no shots, no wheel
    // the mouse has been caught here once: this browser can do it, so a refusal later is a moment's (its pause right
    // after Escape let go of it, or no click to go with the request), never a reason to give up and look by the cursor
    this.lockOk = false; this.lockAt = 0; this.freshLock = false;
    this.caught = false; // (caught in this match: the game clears it as a match begins)
    this.keepHover = false; // (dev mode looks by the cursor whether or not the mouse was caught once)
    // virtual input layer used by automated tests / dev tools
    this.virtual = {};
    this.virtualPressed = new Set();

    window.addEventListener('keydown', (e) => {
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ControlLeft', 'ControlRight'].includes(e.code)) e.preventDefault();
      if (e.ctrlKey && (this.locked || this.capture)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressedKeys.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); this.releasedKeys.add(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse = [false, false, false]; });
    window.addEventListener('mousedown', (e) => {
      if ((!this.locked && !this.hoverLook) || this.ui) return;
      if (e.button < 3) { this.mouse[e.button] = true; this.mousePressed[e.button] = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button < 3) { if (this.mouse[e.button]) this.mouseReleased[e.button] = true; this.mouse[e.button] = false; }
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      this.cx = e.clientX; this.cy = e.clientY; this.inside = true;
      if ((this.locked || this.hoverLook) && !this.ui) {
        // (just caught, a browser may report the cursor's jump to the middle as one big movement: that one is not the
        // player's. Only the first movement right after the catch, and only a big one; every other one counts)
        if (this.locked && this.freshLock) {
          this.freshLock = false;
          if (performance.now() - this.lockAt < 250 && (Math.abs(e.movementX) > 120 || Math.abs(e.movementY) > 120)) return;
        }
        this.dx += e.movementX; this.dy += e.movementY;
      }
    });
    document.addEventListener('mouseleave', () => { this.inside = false; });
    window.addEventListener('blur', () => { this.inside = false; });
    window.addEventListener('wheel', (e) => {
      if (e.ctrlKey && (this.locked || this.capture)) e.preventDefault(); // Ctrl + wheel would zoom the page
      if ((this.locked || this.hoverLook) && !this.ui) this.wheel += Math.sign(e.deltaY);
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.target;
      if (this.locked) { this.lockOk = true; this.caught = true; if (!this.keepHover) this.hoverLook = false; this.lockAt = performance.now(); this.freshLock = true; }
      if (!this.locked) { this.mouse = [false, false, false]; this.keys.clear(); }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  lockFailed() {
    // embedded views (e.g. the IDE browser pane) may forbid pointer lock: fall back to hover look. Where it has worked
    // before, a refusal is only for now: the next click on the game catches the mouse (until then the game says so).
    if (this.lockOk) { if (this.onLockRefused) this.onLockRefused(); return; }
    this.hoverLook = true;
    if (this.onLockFail) this.onLockFail();
  }

  lock() {
    // (refused although a click or key of the player's own was behind the request: this page may never catch the
    // mouse, look by the cursor. Refused without one, as after Escape: only not now, the next click catches it)
    const ua = typeof navigator !== 'undefined' ? navigator.userActivation : null, gesture = !ua || ua.isActive;
    const failed = () => { if (gesture) this.lockFailed(); else if (this.onLockRefused) this.onLockRefused(); };
    try {
      const p = this.target.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => {
        try { const p2 = this.target.requestPointerLock(); if (p2 && p2.catch) p2.catch(failed); } catch (e) { failed(); }
      });
    } catch (e) { failed(); }
  }
  // catch the mouse again without a click, after the game itself let go of it (an on-screen menu closing): browsers allow
  // that then. Should one refuse, a click on the game catches it as ever; unlike lock(), no fall back to hover look.
  relock() {
    if (this.locked || (this.hoverLook && !this.lockOk)) return;
    const no = () => { if (this.onLockRefused) this.onLockRefused(); };
    const again = () => { try { const p = this.target.requestPointerLock(); if (p && p.catch) p.catch(no); } catch (e) { no(); } };
    try { const p = this.target.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(again); } catch (e) { again(); }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  // -1..1 turn request while the cursor rests in the outer band of the window (hover look only)
  edgeTurn(out) {
    out.x = 0; out.y = 0;
    if (!this.hoverLook || this.locked || this.ui || !this.inside || this.cx < 0) return out;
    const W = window.innerWidth, H = window.innerHeight;
    const nx = (this.cx / W) * 2 - 1, ny = (this.cy / H) * 2 - 1;
    const band = (v, start) => { const a = Math.abs(v); return a <= start ? 0 : Math.sign(v) * Math.min(1, (a - start) / (1 - start)); };
    out.x = band(nx, 0.8); out.y = band(ny, 0.86) * 0.6;
    return out;
  }

  down(action) {
    if (this.virtual[action]) return true;
    const b = BINDINGS[action];
    if (!b) return false;
    for (const k of b) if (this.keys.has(k)) return true;
    return false;
  }
  pressed(action) {
    if (this.suppress) return false;
    if (this.virtualPressed.has(action)) return true;
    const b = BINDINGS[action];
    if (!b) return false;
    for (const k of b) if (this.pressedKeys.has(k)) return true;
    return false;
  }
  released(action) {
    const b = BINDINGS[action];
    if (!b) return false;
    for (const k of b) if (this.releasedKeys.has(k)) return true;
    return false;
  }
  get fire() { return this.mouse[0] || !!this.virtual.fire; }
  get firePressed() { return this.mousePressed[0] || this.virtualPressed.has('fire'); }
  get ads() { return this.mouse[2] || !!this.virtual.ads; }

  endFrame() {
    this.pressedKeys.clear(); this.releasedKeys.clear();
    this.mousePressed = [false, false, false]; this.mouseReleased = [false, false, false];
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.virtualPressed.clear();
  }
}
