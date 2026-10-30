// Small math helpers shared across the game
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smooth = (t) => t * t * (3 - 2 * t);
export const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export const easeOut = (t) => 1 - (1 - t) * (1 - t);
export const easeIn = (t) => t * t;
export const easeOutBack = (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
// Framerate independent exponential smoothing factor
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randSign = () => (Math.random() < 0.5 ? -1 : 1);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const DEG = Math.PI / 180;
export const wrapAngle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
export const angleDiff = (a, b) => wrapAngle(b - a);

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Damped spring on a scalar. Good for viewmodel motion: snappy but organic.
export class Spring {
  constructor(stiffness = 120, damping = 12, value = 0) {
    this.k = stiffness; this.c = damping; this.x = value; this.v = 0; this.target = value;
  }
  update(dt) {
    // sub-step for stability at low framerates
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = -this.k * (this.x - this.target) - this.c * this.v;
      this.v += a * h; this.x += this.v * h;
    }
    return this.x;
  }
  impulse(v) { this.v += v; }
}

export class Spring3 {
  constructor(stiffness = 120, damping = 12) {
    this.x = new Spring(stiffness, damping); this.y = new Spring(stiffness, damping); this.z = new Spring(stiffness, damping);
  }
  setTarget(x, y, z) { this.x.target = x; this.y.target = y; this.z.target = z; }
  impulse(x, y, z) { this.x.v += x; this.y.v += y; this.z.v += z; }
  update(dt) { this.x.update(dt); this.y.update(dt); this.z.update(dt); }
  get vx() { return this.x.x; } get vy() { return this.y.x; } get vz() { return this.z.x; }
  set(k, c) { for (const s of [this.x, this.y, this.z]) { s.k = k; s.c = c; } }
}

// Trauma based camera shake (Squirrel Eiserloh style)
export class Shake {
  constructor() { this.trauma = 0; this.t = Math.random() * 100; }
  add(a) { this.trauma = Math.min(1, this.trauma + a); }
  update(dt) { this.trauma = Math.max(0, this.trauma - dt * 1.8); this.t += dt; }
  sample(seed, freq = 22) {
    const s = this.trauma * this.trauma;
    return s * (Math.sin(this.t * freq + seed * 13.7) * 0.6 + Math.sin(this.t * freq * 2.13 + seed * 7.1) * 0.4);
  }
}
