const KEY_BINDINGS = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  fire: ['Space'],
  charge: ['KeyC', 'KeyJ'],
  dodge: ['ShiftLeft', 'ShiftRight'],
  bomb: ['KeyE'],
  pause: ['KeyP', 'Escape'],
  start: ['Enter', 'NumpadEnter'],
  mute: ['KeyM'],
};

// Standard gamepad mapping indices.
const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const PAD_DEADZONE = 0.18;

const ACTIONS = Object.keys(KEY_BINDINGS);

/**
 * Keyboard + gamepad input. Call `poll()` at the start of a frame and `endFrame()` at the end;
 * `pressed(action)` / `released(action)` are true only during the frame of the transition.
 */
export class InputManager {
  constructor(target = window) {
    this.keys = new Set();
    this.tapped = new Set(); // keys pressed since the last poll (catches taps shorter than a frame)
    this.state = {};
    this.prev = {};
    for (const a of ACTIONS) {
      this.state[a] = false;
      this.prev[a] = false;
    }
    this.moveX = 0;
    this.moveY = 0;
    this.gamepadConnected = false;
    this.onFirstInteraction = null;
    this.anyKeyThisFrame = false;

    this.codeToAction = new Map();
    for (const [action, codes] of Object.entries(KEY_BINDINGS)) {
      for (const code of codes) {
        if (!this.codeToAction.has(code)) this.codeToAction.set(code, []);
        this.codeToAction.get(code).push(action);
      }
    }

    target.addEventListener('keydown', (e) => this.onKeyDown(e));
    target.addEventListener('keyup', (e) => this.keys.delete(e.code));
    target.addEventListener('blur', () => this.keys.clear());
    target.addEventListener('pointerdown', () => this.notifyInteraction());
    window.addEventListener('gamepadconnected', () => (this.gamepadConnected = true));
    window.addEventListener('gamepaddisconnected', () => (this.gamepadConnected = false));
  }

  onKeyDown(e) {
    if (this.codeToAction.has(e.code)) e.preventDefault();
    if (!e.repeat) {
      this.anyKeyThisFrame = true;
      this.tapped.add(e.code);
    }
    this.keys.add(e.code);
    this.notifyInteraction();
  }

  notifyInteraction() {
    if (this.onFirstInteraction) {
      const cb = this.onFirstInteraction;
      this.onFirstInteraction = null;
      cb();
    }
  }

  keyDown(action) {
    for (const code of KEY_BINDINGS[action]) if (this.keys.has(code) || this.tapped.has(code)) return true;
    return false;
  }

  poll() {
    for (const a of ACTIONS) this.state[a] = this.keyDown(a);
    this.tapped.clear();

    let x = (this.state.right ? 1 : 0) - (this.state.left ? 1 : 0);
    let y = (this.state.up ? 1 : 0) - (this.state.down ? 1 : 0);

    const pad = this.readGamepad();
    if (pad) {
      const ax = Math.abs(pad.axes[0] ?? 0) > PAD_DEADZONE ? pad.axes[0] : 0;
      const ay = Math.abs(pad.axes[1] ?? 0) > PAD_DEADZONE ? -pad.axes[1] : 0;
      const b = (i) => !!pad.buttons[i] && pad.buttons[i].pressed;
      x += ax + (b(PAD.RIGHT) ? 1 : 0) - (b(PAD.LEFT) ? 1 : 0);
      y += ay + (b(PAD.UP) ? 1 : 0) - (b(PAD.DOWN) ? 1 : 0);
      if (b(PAD.A)) this.state.fire = true;
      if (b(PAD.RT) || b(PAD.LT)) this.state.charge = true;
      if (b(PAD.B) || b(PAD.RB) || b(PAD.LB)) this.state.dodge = true;
      if (b(PAD.X) || b(PAD.Y)) this.state.bomb = true;
      if (b(PAD.START)) {
        this.state.pause = true;
        this.state.start = true;
      }
      if (b(PAD.A) && !this.prev.fire) this.anyKeyThisFrame = true;
    }

    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.moveX = x;
    this.moveY = y;
  }

  readGamepad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  held(action) {
    return this.state[action];
  }

  pressed(action) {
    return this.state[action] && !this.prev[action];
  }

  released(action) {
    return !this.state[action] && this.prev[action];
  }

  endFrame() {
    for (const a of ACTIONS) this.prev[a] = this.state[a];
    this.anyKeyThisFrame = false;
  }

  /** Consume a press so that the same key does not trigger two things in one frame. */
  consume(action) {
    this.prev[action] = true;
  }
}
