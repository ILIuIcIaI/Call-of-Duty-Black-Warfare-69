import * as THREE from 'three';
import { STICKS, RADIUS } from '../characters/ragdoll.js';

// =============================================================================
// Turns the keys of a finisher into a finished piece of film: every frame of both
// bodies and of the camera is worked out once, ahead of time, and only played back.
//   - every channel has its own keys, so nothing stops just because something else has a key there
//   - curves are filtered both ways (no lag, no corners) instead of chasing their target
//   - impacts and the weight of the hips run through springs: sharp, after the fact, never before it
//   - feet stay planted until they step, knees and elbows follow a field without a flip in it
//   - where a body lets go (kt, ka, kl, kh below 1) real physics takes over and hands back without a seam
// Scene frame: the victim starts at the origin looking toward -z, y is up. See finishers.js for the keys.
// =============================================================================
export const HZ = 120, DT = 1 / HZ;

// the soldier's skeleton, see characters/soldier.js
const SPINE = 0.08, CHEST = 0.24, NECK = 0.29, HIP_X = 0.1, HIP_Y = -0.04, L1 = 0.44, L2 = 0.43, ANKLE = 0.095;
const SH_X = 0.2, SH_Y = 0.16, SH_Z = [-0.07, 0.03], A1 = 0.3, A2 = 0.33, FORE = 0.29;
const BALL = 0.14, HEEL = 0.07;
const NB = 16;
export const B = { pelvis: 0, spine: 1, chest: 2, head: 3, lthigh: 4, lknee: 5, lfoot: 6, rthigh: 7, rknee: 8, rfoot: 9, lupper: 10, lfore: 11, lhand: 12, rupper: 13, rfore: 14, rhand: 15 };
const REF = { pelvis: 0, chest: 2, head: 3, lhand: 12, rhand: 15, lfoot: 6, rfoot: 9 };
// the rotations a body is played back from, in this order
export const JOINTS = [B.pelvis, B.spine, B.chest, B.head, B.lthigh, B.lknee, B.lfoot, B.rthigh, B.rknee, B.rfoot, B.lupper, B.lfore, B.rupper, B.rfore, B.lhand, B.rhand];
export const PARENT = [-1, 0, 1, 2, 0, 4, 5, 0, 7, 8, 2, 10, 11, 2, 13, 14];

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3(), _g = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _eu = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const quint = (u) => u * u * u * (u * (u * 6 - 15) + 10);
const noise = (t, s) => Math.sin(t * 1.7 + s) * 0.5 + Math.sin(t * 3.3 + s * 2.1) * 0.3 + Math.sin(t * 7.9 + s * 3.7) * 0.2;
// what a body does by itself: slow and large, fast and tiny, never quite repeating
const drift = (t, s) => Math.sin(t * 0.73 + s) * 0.36 + Math.sin(t * 1.61 + s * 1.9) * 0.26 + Math.sin(t * 3.17 + s * 2.7) * 0.18 + Math.sin(t * 6.41 + s * 3.3) * 0.12 + Math.sin(t * 11.3 + s * 4.1) * 0.08;
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// ---------------------------------------------------------------------------
// Curves
// ---------------------------------------------------------------------------
function slope(t0, t1, t2, v0, v1, v2) {
  if (t1 <= t0 || t2 <= t1) return 0;
  const d0 = (v1 - v0) / (t1 - t0), d1 = (v2 - v1) / (t2 - t1);
  if (d0 * d1 <= 0) return 0;
  const m = (d0 + d1) / 2, lim = 3 * Math.min(Math.abs(d0), Math.abs(d1));
  return Math.sign(m) * Math.min(Math.abs(m), lim);
}
function hermite(t0, t1, t2, t3, v0, v1, v2, v3, t) {
  const h = t2 - t1;
  if (h <= 1e-5) return v2;
  const u = clamp((t - t1) / h, 0, 1), u2 = u * u, u3 = u2 * u;
  const m1 = slope(t0, t1, t2, v0, v1, v2), m2 = slope(t1, t2, t3, v1, v2, v3);
  return (2 * u3 - 3 * u2 + 1) * v1 + (u3 - 2 * u2 + u) * h * m1 + (-2 * u3 + 3 * u2) * v2 + (u3 - u2) * h * m2;
}
// one channel: only the keys that name it count
function sampleCurve(keys, name, c, n, def = 0) {
  const ts = [], vs = [];
  for (const k of keys) { const v = k[name]; if (v === undefined) continue; ts.push(k.t); vs.push(c === undefined ? v : v[c]); }
  const out = new Float32Array(n), L = ts.length;
  if (!L) return out.fill(def);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = i * DT;
    if (t <= ts[0]) { out[i] = vs[0]; continue; }
    if (t >= ts[L - 1]) { out[i] = vs[L - 1]; continue; }
    while (j < L - 2 && ts[j + 1] <= t) j++;
    const a = Math.max(0, j - 1), d = Math.min(L - 1, j + 2);
    out[i] = hermite(ts[a], ts[j], ts[j + 1], ts[d], vs[a], vs[j], vs[j + 1], vs[d], t);
  }
  return out;
}
// how hard a body still follows: that doesn't creep from one key to the next, it stays until the last moment
function sampleTone(keys, name, n) {
  const L = keys.filter((k) => k[name] !== undefined), out = new Float32Array(n);
  let q = 0;
  for (let i = 0; i < n; i++) {
    const t = i * DT;
    while (q + 1 < L.length && L[q + 1].t <= t) q++;
    const a = L[q], b = L[q + 1];
    if (!a) { out[i] = 1; continue; }
    if (!b) { out[i] = a[name]; continue; }
    const T = Math.min(b.t - a.t, 0.3), u = clamp((t - (b.t - T)) / T, 0, 1);
    out[i] = a[name] + (b[name] - a[name]) * u * u * (3 - 2 * u);
  }
  return out;
}
// filtered in both directions: rounder, and not a moment late
function smooth(a, sigma, stride = 1) {
  if (sigma <= 0) return a;
  const r = Math.ceil(sigma * HZ * 3), w = new Float32Array(r + 1);
  let sum = 0;
  for (let i = 0; i <= r; i++) { w[i] = Math.exp(-0.5 * (i / (sigma * HZ)) ** 2); sum += i ? 2 * w[i] : w[i]; }
  for (let i = 0; i <= r; i++) w[i] /= sum;
  const n = a.length / stride, out = new Float32Array(a.length);
  for (let s = 0; s < stride; s++) for (let i = 0; i < n; i++) {
    let v = a[i * stride + s] * w[0];
    for (let k = 1; k <= r; k++) v += (a[Math.max(0, i - k) * stride + s] + a[Math.min(n - 1, i + k) * stride + s]) * w[k];
    out[i * stride + s] = v;
  }
  return out;
}
function deriv(a) {
  const n = a.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (a[Math.min(n - 1, i + 1)] - a[Math.max(0, i - 1)]) / (DT * (Math.min(n - 1, i + 1) - Math.max(0, i - 1)));
  return out;
}
// a fast change starts with a little movement the other way and goes a little too far: the difference of two filters has both
function windup(a, amount, s1 = 0.03, s2 = 0.09) {
  const x = smooth(a, s1), y = smooth(a, s2), out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (x[i] - y[i]) * amount;
  return out;
}
// what a spring makes of a force and of knocks: x is added to a channel
function spring(n, f, z, force, gain, kicks) {
  const out = new Float32Array(n), w = 2 * Math.PI * f, h = DT / 2;
  let x = 0, v = 0, j = 0;
  for (let i = 0; i < n; i++) {
    while (kicks && j < kicks.length && kicks[j][0] <= i * DT) v += kicks[j++][1];
    const u = force ? force[i] * gain : 0;
    for (let s = 0; s < 2; s++) { v += h * (w * w * (u - x) - 2 * z * w * v); x += h * v; }
    out[i] = x;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Limbs. Where the elbow and the knee point is a smooth function of where the limb points. A field like that can't be
// smooth all over a sphere, it has to break somewhere: this one has its one bad spot in a single direction (ARM_D, for
// a leg up behind the back), and that is a direction no limb ever points in. c is where the joint points when the limb
// goes the opposite way, from there it is the stereographic projection of a constant field.
// ---------------------------------------------------------------------------
const ARM_D = [0.45, 0.15, 0.88], ARM_C = [0.426, -1.008, -0.046];
function fieldOf(n, dx, dy, dz, cx, cy, cz, out) {
  const q = (n.x * cx + n.y * cy + n.z * cz) / Math.max(0.03, 1 - (n.x * dx + n.y * dy + n.z * dz));
  return out.set(cx + q * (dx - n.x), cy + q * (dy - n.y), cz + q * (dz - n.z));
}
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3(), _s = new THREE.Vector3(), _n = new THREE.Vector3();
function fromBasis(out, x, y, z) { return out.setFromRotationMatrix(_m.makeBasis(x, y, z)); }

// target in chest space. qU, qF: the upper arm in the chest, the forearm in the upper arm. shoulder: where the joint moved to.
export function armIK(s, tx, ty, tz, hx, hy, hz, qU, qF, shoulder) {
  const sx = s * SH_X, sz = SH_Z[s < 0 ? 0 : 1];
  _n.set(tx - sx, ty - SH_Y, tz - sz);
  let d = _n.length();
  // the shoulder goes along with a far reach
  const extra = Math.min(0.075, Math.max(0, d - 0.36) * 0.25);
  _s.set(sx, SH_Y, sz).addScaledVector(_n, extra / Math.max(d, 1e-4));
  // (and an arm over the shoulder takes the shoulder up with it)
  _s.y += sstep(0.05, 0.8, (ty - SH_Y) / Math.max(d, 0.1)) * 0.035;
  if (shoulder) shoulder.copy(_s);
  _n.set(tx, ty, tz).sub(_s);
  d = _n.length();
  // (a hand can't be in its own shoulder: however close it is told to come, the arm stays folded in front of it)
  if (d < 0.26) { const k = 1 - sstep(0, 0.26, d); _n.x += s * 0.03 * k; _n.y -= 0.13 * k; _n.z -= 0.22 * k; d = _n.length(); }
  d = Math.max(d, 1e-4);
  _n.divideScalar(d);
  // the last bit of reach comes slowly: the elbow never snaps straight
  const M = (A1 + A2) * 0.999, a = M * 0.93;
  let D = d > a ? a + (M - a) * (1 - Math.exp(-(d - a) / (M - a))) : d;
  D = Math.max(D, 0.14);
  fieldOf(_n, s * ARM_D[0], ARM_D[1], ARM_D[2], s * ARM_C[0], ARM_C[1], ARM_C[2], _e);
  _e.x += hx; _e.y += hy; _e.z += hz;
  _e.addScaledVector(_n, -_e.dot(_n)).normalize();
  const cs = clamp((A1 * A1 + D * D - A2 * A2) / (2 * A1 * D), -1, 1), sn = Math.sqrt(1 - cs * cs);
  _u.copy(_n).multiplyScalar(cs).addScaledVector(_e, sn);                       // along the upper arm
  _w.copy(_n).multiplyScalar(D).addScaledVector(_u, -A1).divideScalar(A2);      // along the forearm
  _y.copy(_u).negate();
  _z.copy(_e).addScaledVector(_u, -_e.dot(_u)).normalize();
  _x.crossVectors(_y, _z);
  fromBasis(qU, _x, _y, _z);
  _y.copy(_w).negate();
  _z.crossVectors(_x, _y);
  fromBasis(qF, _x, _y, _z);
  qF.premultiply(_q3.copy(qU).invert());
}

// ankle in the hips' space: the thigh in the hips, the shin in the thigh
function legIK(s, ax, ay, az, twist, qT, qK) {
  _n.set(ax - s * HIP_X, ay - HIP_Y, az);
  const d = Math.max(_n.length(), 1e-4);
  _n.divideScalar(d);
  const M = (L1 + L2) * 0.999, a = M * 0.94;
  let D = d > a ? a + (M - a) * (1 - Math.exp(-(d - a) / (M - a))) : d;
  D = Math.max(D, 0.12);
  // the knee: forward for a hanging leg, up for one stretched out in front, down for one trailing behind
  fieldOf(_n, 0, 0.7, 0.71, s * 0.13 + twist, 0.71, -0.7, _e);
  _e.addScaledVector(_n, -_e.dot(_n)).normalize();
  const cs = clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1), sn = Math.sqrt(1 - cs * cs);
  _u.copy(_n).multiplyScalar(cs).addScaledVector(_e, sn);
  _w.copy(_n).multiplyScalar(D).addScaledVector(_u, -L1).divideScalar(L2);
  _y.copy(_u).negate();
  _z.copy(_e).addScaledVector(_u, -_e.dot(_u)).normalize().negate();
  _x.crossVectors(_y, _z);
  fromBasis(qT, _x, _y, _z);
  _y.copy(_w).negate();
  _z.crossVectors(_x, _y);
  fromBasis(qK, _x, _y, _z);
  qK.premultiply(_q3.copy(qT).invert());
}

// ---------------------------------------------------------------------------
// One body
// ---------------------------------------------------------------------------
class Track {
  constructor(keys, n, ctx, seed) {
    this.keys = keys; this.n = n; this.ctx = ctx; this.seed = seed;
    this.P = new Float32Array(n * NB * 3); this.Q = new Float32Array(n * NB * 4);
    this.ch = {};
    this.ht = new Float32Array(n * 6); // where the hands are told to be, chest space
    this.sh = new Float32Array(n * 6); // where the shoulder joints went, chest space
    this.lost = [new Float32Array(n), new Float32Array(n)]; // how far a hand stays from where it should be
  }
  getP(b, i, o) { const k = (i * NB + b) * 3; return o.set(this.P[k], this.P[k + 1], this.P[k + 2]); }
  setP(b, i, v) { const k = (i * NB + b) * 3; this.P[k] = v.x; this.P[k + 1] = v.y; this.P[k + 2] = v.z; }
  getQ(b, i, o) { const k = (i * NB + b) * 4; return o.set(this.Q[k], this.Q[k + 1], this.Q[k + 2], this.Q[k + 3]); }
  setQ(b, i, q) { const k = (i * NB + b) * 4; this.Q[k] = q.x; this.Q[k + 1] = q.y; this.Q[k + 2] = q.z; this.Q[k + 3] = q.w; }

  // ---- [x, y, z] in the scene, ['v.head', x, y, z] on a bone, ['@v.head', x, y, z] beside one, ['mid', x, y, z] between the chests
  point(spec, i, o) {
    if (typeof spec[0] !== 'string') return o.set(spec[0], spec[1], spec[2]);
    const n = spec[0];
    if (n === 'mid') {
      this.ctx.a.getP(B.chest, i, _a); this.ctx.v.getP(B.chest, i, _b);
      return o.addVectors(_a, _b).multiplyScalar(0.5).add(_c.set(spec[1], spec[2], spec[3]));
    }
    if (n[0] === '@') return this.ctx[n[1]].getP(REF[n.slice(3)], i, o).add(_c.set(spec[1], spec[2], spec[3]));
    const T = this.ctx[n[0]], b = REF[n.slice(2)];
    T.getQ(b, i, _q2); T.getP(b, i, _a);
    return o.set(spec[1], spec[2], spec[3]).applyQuaternion(_q2).add(_a);
  }

  // ---- the torso's channels, with everything that follows from the keys by itself
  // pulled: how hard the other body is fighting this one, right now
  channels(kicks = {}, pulled = null) {
    const { keys, n, ch, seed } = this;
    const get = (name, c, sigma, def) => { const a = sampleCurve(keys, name, c, n, def); return sigma ? smooth(a, sigma) : a; };
    for (let c = 0; c < 3; c++) { ch['p' + c] = windup(get('p', c, 0.04), c === 1 ? 0.5 : 0.25); ch['r' + c] = windup(get('r', c, 0.045), 0.6); }
    ch.rt = get('rt', undefined, 0.045);
    ch.j = get('j', undefined, 0.09);
    if (pulled) for (let i = 0; i < n; i++) ch.j[i] = Math.max(ch.j[i], pulled[i] * 0.4);
    ch.two = get('two', undefined, 0.05);
    ch.kt = smooth(sampleTone(keys, 'kt', n), 0.03); ch.ka = smooth(sampleTone(keys, 'ka', n), 0.03); ch.kl = smooth(sampleTone(keys, 'kl', n), 0.03); ch.kh = smooth(sampleTone(keys, 'kh', n), 0.03);
    // what the hips do reaches the chest later and the head last, and a little too far
    const ax = deriv(deriv(ch.p0)), az = deriv(deriv(ch.p2)), yawV = deriv(ch.r1), yawA = deriv(yawV);
    const fwd = new Float32Array(n), side = new Float32Array(n), turn = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const y = ch.r1[i], fx = -Math.sin(y), fz = -Math.cos(y);
      fwd[i] = -(ax[i] * fx + az[i] * fz) / 9.81; side[i] = (ax[i] * -fz + az[i] * fx) / 9.81; turn[i] = -yawA[i] / 40;
    }
    const lag = { s: [0.015, 2.5, 0.62, 0.05, 0.02, 0.04], c: [0.035, 2.3, 0.52, 0.08, 0.03, 0.06], h: [0.05, 2.9, 0.44, 0.12, 0.05, 0.08] };
    // how out of breath: fast to get there, slow to get over
    const ex = (ch.ex = new Float32Array(n)), vX = deriv(ch.p0), vY = deriv(ch.p1), vZ = deriv(ch.p2);
    for (let i = 0, e = 0; i < n; i++) { const w = Math.min(1, Math.hypot(vX[i], vY[i], vZ[i]) / 1.6); e += (w - e) * (w > e ? DT / 0.14 : DT / 1.5); ex[i] = e; }
    const sF = smooth(fwd, 0.03), sS = smooth(side, 0.03), sT = smooth(turn, 0.03);
    let phase = 0;
    const ph = new Float32Array(n);
    for (let i = 0; i < n; i++) { phase += DT * (1 + ch.j[i] * 2.6); ph[i] = phase; }
    for (const part of ['s', 'c', 'h']) {
      const [delay, f, z, gP, gY, gR] = lag[part];
      const shift = (a) => { const o = new Float32Array(n), d = Math.round(delay * HZ); for (let i = 0; i < n; i++) o[i] = a[Math.max(0, i - d)]; return o; };
      for (const [nm, force, gain, kind] of [['p', sF, gP, 0], ['y', sT, gY, 1], ['z', sS, gR, 2]]) {
        const name = part + nm, base = shift(windup(get(name, undefined, 0.045), part === 'h' ? 0.3 : 0.6));
        const sp = spring(n, f, z, force, gain, kicks[name]);
        const out = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const J = ch.j[i], tt = i * DT;
          // nobody ever holds perfectly still, and someone fighting for air even less so
          const small = drift(tt * 0.9, seed + kind * 3 + part.charCodeAt(0)) * (part === 'h' ? 0.03 : 0.016) * (1 + ex[i] * 0.6);
          const shake = noise(ph[i] * 2.2, seed + kind + part.charCodeAt(0) * 0.7) * J * (part === 'h' ? 0.07 : part === 'c' ? 0.05 : 0.02);
          const thrash = drift(ph[i] * 1.5, seed * 1.3 + kind * 2.1 + part.charCodeAt(0) * 0.31) * J * (part === 'h' ? 0.16 : part === 'c' ? 0.13 : 0.08);
          out[i] = base[i] + sp[i] + small + shake + thrash;
        }
        ch[name] = out;
      }
    }
    // nobody stands still: the weight wanders from foot to foot, the chest goes with every breath, faster when it has been hard
    let bp = seed;
    for (let i = 0; i < n; i++) {
      const tt = i * DT, e = ex[i], w = 0.012 + 0.005 * e;
      bp += DT * (1.9 + 2.5 * e);
      const breath = Math.sin(bp), amp = 0.007 + 0.014 * e;
      ch.cp[i] -= breath * amp; ch.sp[i] -= breath * amp * 0.35; ch.hp[i] += breath * amp * 0.7;
      ch.p0[i] += drift(tt * 0.6, seed + 11) * w; ch.p2[i] += drift(tt * 0.55, seed + 13) * w; ch.p1[i] += drift(tt * 0.7, seed + 17) * 0.005 + breath * amp * 0.1;
      ch.r0[i] += drift(tt * 0.45, seed + 23) * 0.012; ch.r1[i] += drift(tt * 0.5, seed + 9) * 0.022; ch.r2[i] += drift(tt * 0.6, seed + 19) * 0.014;
      const J = ch.j[i];
      if (J > 0.01) { const q = ph[i] * 1.3; ch.r0[i] += drift(q, seed + 29) * J * 0.05; ch.r1[i] += drift(q, seed + 31) * J * 0.1; ch.r2[i] += drift(q, seed + 37) * J * 0.075; ch.p0[i] += drift(q, seed + 41) * J * 0.028; ch.p2[i] += drift(q, seed + 43) * J * 0.028; ch.p1[i] += drift(q, seed + 47) * J * 0.014; }
    }
  }

  // ---- the feet: planted until they have to go, then a real step, one after the other
  feet() {
    const { keys, n, ch } = this;
    const yawAt = (t) => ch.r1[clamp(Math.round(t * HZ), 0, n - 1)];
    const lists = ['l', 'r'].map((f) => keys.filter((k) => k[f + 'f']).map((k) => ({ t: k.t, x: k[f + 'f'][0], y: k[f + 'f'][1], z: k[f + 'f'][2], yaw: k[f + 'fy'] !== undefined ? k[f + 'fy'] : yawAt(k.t), lift: k[f + 'fl'], dur: k[f + 'fd'], lead: k.lead })));
    const ground = (k) => k.y < 0.07;
    // nobody plants a foot and leaves it: over a longer stretch on the same spot it shifts a few centimetres, when the weight lets it
    lists.forEach((L, fi) => {
      for (let q = L.length - 2; q >= 0; q--) {
        const a = L[q], b = L[q + 1], gap = b.t - a.t;
        if (!ground(a) || !ground(b) || gap < 0.85) continue;
        const pitch = (k) => { const v = keys.find((m) => m.t === k.t); return v && v[(fi ? 'r' : 'l') + 'fp'] !== undefined ? v[(fi ? 'r' : 'l') + 'fp'] : 0; };
        if (Math.abs(pitch(a)) > 0.2 && keys.some((m) => m.t <= a.t && m[(fi ? 'r' : 'l') + 'fp'] > 0.2)) continue;
        const m = Math.floor(gap / 1.05), add = [];
        let x = a.x, z = a.z;
        for (let u = 1; u <= Math.max(1, m); u++) {
          const t = a.t + (gap * (u - 0.5 + (fi ? 0.2 : -0.14))) / Math.max(1, m), up = ch.p1[clamp(Math.round(t * HZ), 0, n - 1)];
          if (up < 0.74 || ch.kl[clamp(Math.round(t * HZ), 0, n - 1)] < 0.98) continue;
          const ang = this.seed * 3.7 + q * 2.3 + u * 1.9 + fi * 4.1, r = 0.045 + 0.035 * (0.5 + 0.5 * Math.sin(ang * 1.7));
          x = a.x + Math.cos(ang) * r; z = a.z + Math.sin(ang) * r;
          add.push({ t, x, y: a.y, z, yaw: a.yaw + Math.sin(ang * 2.3) * 0.12, lift: 0.015, dur: 0.2, lead: undefined });
        }
        L.splice(q + 1, 0, ...add);
      }
    });
    const windows = lists.map((L) => {
      const out = [];
      for (let i = 0; i + 1 < L.length; i++) {
        const a = L[i], b = L[i + 1], dist = Math.hypot(b.x - a.x, b.z - a.z);
        if (!ground(a) || !ground(b) || (dist < 0.015 && Math.abs(b.yaw - a.yaw) < 0.25)) { out.push(null); continue; }
        const tau = Math.min(b.t - a.t, b.dur || clamp(0.13 + dist * 0.42, 0.14, 0.42));
        out.push({ t0: b.t - tau, t1: b.t, dist, a, b });
      }
      return out;
    });
    // both at once would be a hop: the foot on the side the body is going goes first
    for (const wl of windows[0]) for (const wr of windows[1]) {
      if (!wl || !wr) continue;
      // (running, the steps overlap and that's fine: only two that end together are one hop)
      const over = Math.min(wl.t1, wr.t1) - Math.max(wl.t0, wr.t0);
      if (Math.abs(wl.t1 - wr.t1) > 0.06 || over < 0.25 * Math.min(wl.t1 - wl.t0, wr.t1 - wr.t0)) continue;
      const mx = (wl.b.x - wl.a.x) + (wr.b.x - wr.a.x), mz = (wl.b.z - wl.a.z) + (wr.b.z - wr.a.z);
      const lead = wl.b.lead || wr.b.lead, leftFirst = lead ? lead === 'l' : mx * (wl.a.x - wr.a.x) + mz * (wl.a.z - wr.a.z) >= 0;
      const first = leftFirst ? wl : wr, second = leftFirst ? wr : wl;
      const T = second.t1 - Math.max(first.a.t, second.a.t), tA = first.t1 - first.t0, tB = second.t1 - second.t0;
      const k = Math.min(1, T / (tA + tB * 0.72));
      second.t0 = second.t1 - tB * k;
      first.t1 = second.t1 - tB * k * 0.72;
      first.t0 = first.t1 - tA * k;
    }
    const names = ['lf', 'rf'];
    lists.forEach((L, fi) => {
      const nm = names[fi], X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n), YW = new Float32Array(n), RL = new Float32Array(n), AIR = new Float32Array(n);
      const W = windows[fi];
      let j = 0;
      for (let i = 0; i < n; i++) {
        const t = i * DT;
        if (!L.length) continue;
        while (j < L.length - 1 && L[j + 1].t <= t) j++;
        const a = L[j], b = L[Math.min(L.length - 1, j + 1)], w = W[j];
        if (a === b || t <= L[0].t) { const q = t <= L[0].t ? L[0] : a; X[i] = q.x; Y[i] = q.y; Z[i] = q.z; YW[i] = q.yaw; continue; }
        if (ground(a) && ground(b)) {
          if (!w || t < w.t0) { X[i] = a.x; Y[i] = a.y; Z[i] = a.z; YW[i] = a.yaw; continue; }
          if (t >= w.t1) { X[i] = b.x; Y[i] = b.y; Z[i] = b.z; YW[i] = b.yaw; continue; }
          const u = (t - w.t0) / (w.t1 - w.t0), e = quint(u), lift = b.lift !== undefined ? b.lift : clamp(0.025 + w.dist * 0.2, 0.025, 0.17);
          X[i] = a.x + (b.x - a.x) * e; Z[i] = a.z + (b.z - a.z) * e; YW[i] = a.yaw + (b.yaw - a.yaw) * e;
          Y[i] = a.y + (b.y - a.y) * e + lift * Math.pow(Math.sin(Math.PI * u), 1.4);
          const roll = Math.min(1, w.dist / 0.28);
          RL[i] = roll * (0.55 * Math.sin(Math.PI * Math.min(1, u / 0.42)) ** 2 - 0.38 * Math.sin(Math.PI * clamp((u - 0.58) / 0.42, 0, 1)) ** 2);
          AIR[i] = Math.sin(Math.PI * u);
          continue;
        }
        // in the air, or leaving the ground for good
        const p = L[Math.max(0, j - 1)], q = L[Math.min(L.length - 1, j + 2)];
        X[i] = hermite(p.t, a.t, b.t, q.t, p.x, a.x, b.x, q.x, t);
        Y[i] = Math.max(0, hermite(p.t, a.t, b.t, q.t, p.y, a.y, b.y, q.y, t));
        Z[i] = hermite(p.t, a.t, b.t, q.t, p.z, a.z, b.z, q.z, t);
        YW[i] = a.yaw + (b.yaw - a.yaw) * quint((t - a.t) / (b.t - a.t));
        AIR[i] = 1;
      }
      ch[nm + 'x'] = smooth(X, 0.012); ch[nm + 'y'] = smooth(Y, 0.012); ch[nm + 'z'] = smooth(Z, 0.012); ch[nm + 'yaw'] = smooth(YW, 0.02); ch[nm + 'air'] = smooth(AIR, 0.03);
      const pitch = smooth(sampleCurve(keys, nm + 'p', undefined, n), 0.03), RLs = smooth(RL, 0.02);
      for (let i = 0; i < n; i++) pitch[i] += RLs[i];
      ch[nm + 'pitch'] = pitch;
    });
    // every step lands: the body sinks into it and comes back up. The hips go along with a leg going forward, the shoulders the other way.
    const dropKicks = [], hipT = new Float32Array(n), chestT = new Float32Array(n);
    windows.forEach((wl, fi) => { for (const w of wl) {
      if (!w) continue;
      dropKicks.push([w.t1, -clamp(0.3 + w.dist * 1.1, 0.3, 0.95)]);
      const i1 = Math.round(w.t1 * HZ), i0 = Math.max(0, Math.round(w.t0 * HZ)), y = ch.r1[Math.min(n - 1, i1)];
      const along = ((w.b.x - w.a.x) * -Math.sin(y) + (w.b.z - w.a.z) * -Math.cos(y)) / 0.55, amt = clamp(along, -1, 1) * (fi ? 1 : -1), rel = Math.round(0.3 * HZ);
      for (let i = i0; i < Math.min(n, i1 + rel); i++) { const u = i <= i1 ? Math.sin((Math.PI / 2) * (i - i0) / Math.max(1, i1 - i0)) : Math.cos((Math.PI / 2) * (i - i1) / rel); hipT[i] += amt * u * u * 0.085; chestT[i] -= amt * u * u * 0.11; }
    } });
    dropKicks.sort((a, b) => a[0] - b[0]);
    const sink = spring(n, 3.4, 0.8, null, 0, dropKicks), hipS = smooth(hipT, 0.05), chestS = smooth(chestT, 0.06);
    for (let i = 0; i < n; i++) { const up = sstep(0.62, 0.84, ch.p1[i]); ch.p1[i] += sink[i] * up; ch.r1[i] += hipS[i] * up; ch.cy[i] += chestS[i] * up; ch.sy[i] += chestS[i] * up * 0.4; ch.sp[i] -= sink[i] * up * 0.6; }
    // the weight goes onto the foot that stays, the hips drop on the side that lifts
    const sx = new Float32Array(n), sz = new Float32Array(n), sy = new Float32Array(n), sr = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const up = sstep(0.62, 0.84, ch.p1[i]), l = Math.min(1, ch.lfair[i]), r = Math.min(1, ch.rfair[i]), w = (l - r) * up;
      if (Math.abs(w) < 1e-3) continue;
      const dx = ch.rfx[i] - ch.lfx[i], dz = ch.rfz[i] - ch.lfz[i], d = Math.max(0.1, Math.hypot(dx, dz));
      sx[i] = (dx / d) * 0.03 * w; sz[i] = (dz / d) * 0.03 * w; sy[i] = (Math.abs(w) - 0.4) * 0.01; sr[i] = w * 0.035;
    }
    const ssx = smooth(sx, 0.07), ssz = smooth(sz, 0.07), ssy = smooth(sy, 0.07), ssr = smooth(sr, 0.07);
    for (let i = 0; i < n; i++) { ch.p0[i] += ssx[i]; ch.p2[i] += ssz[i]; ch.p1[i] += ssy[i]; ch.r2[i] += ssr[i]; }
  }

  // ---- the sole's point and the foot's angle give the ankle: on the ground the foot rolls over its ball or its heel
  ankle(sx, sy, sz, pitch, yaw, out, qOut) {
    qOut.setFromEuler(_eu.set(-pitch, yaw, 0, 'YXZ'));
    const g = 1 - sstep(0.03, 0.12, sy), fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    out.set(sx, sy + ANKLE, sz);
    if (g > 0 && Math.abs(pitch) > 1e-4) {
      const k = pitch > 0 ? BALL : -HEEL;
      _d.set(0, ANKLE, k).applyQuaternion(qOut);
      out.lerp(_e.set(sx + fx * k + _d.x, sy + _d.y, sz + fz * k + _d.z), g);
    }
    return out;
  }

  // ---- hips, spine, chest, head and both legs
  fk() {
    const { n, ch } = this;
    const qP = new THREE.Quaternion(), qS = new THREE.Quaternion(), qC = new THREE.Quaternion(), qH = new THREE.Quaternion(), qT = new THREE.Quaternion(), qK = new THREE.Quaternion(), qF = new THREE.Quaternion(), qI = new THREE.Quaternion();
    const pP = new THREE.Vector3(), pS = new THREE.Vector3(), pC = new THREE.Vector3(), pH = new THREE.Vector3(), an = new THREE.Vector3(), hip = new THREE.Vector3(), loc = new THREE.Vector3(), tmp = new THREE.Vector3(), tmpK = new THREE.Vector3();
    const e = (q, x, y, z) => q.setFromEuler(_eu.set(x, y, z, 'YXZ'));
    for (let i = 0; i < n; i++) {
      pP.set(ch.p0[i], ch.p1[i], ch.p2[i]);
      e(qP, -ch.r0[i], ch.r1[i], ch.r2[i]);
      if (ch.rt[i]) qP.multiply(_q.setFromAxisAngle(UP, ch.rt[i]));
      qS.copy(qP).multiply(e(_q, -ch.sp[i], ch.sy[i], ch.sz[i]));
      qC.copy(qS).multiply(e(_q, -ch.cp[i], ch.cy[i], ch.cz[i]));
      qH.copy(qC).multiply(e(_q, -ch.hp[i], ch.hy[i], ch.hz[i]));
      pS.set(0, SPINE, 0).applyQuaternion(qP).add(pP);
      pC.set(0, CHEST, 0).applyQuaternion(qS).add(pS);
      pH.set(0, NECK, 0).applyQuaternion(qC).add(pC);
      this.setP(B.pelvis, i, pP); this.setQ(B.pelvis, i, qP);
      this.setP(B.spine, i, pS); this.setQ(B.spine, i, qS);
      this.setP(B.chest, i, pC); this.setQ(B.chest, i, qC);
      this.setP(B.head, i, pH); this.setQ(B.head, i, qH);
      qI.copy(qP).invert();
      for (let f = 0; f < 2; f++) {
        const s = f ? 1 : -1, nm = f ? 'rf' : 'lf', bT = f ? B.rthigh : B.lthigh, bK = f ? B.rknee : B.lknee, bF = f ? B.rfoot : B.lfoot;
        let sx = ch[nm + 'x'][i], sz = ch[nm + 'z'][i], yaw = ch[nm + 'yaw'][i];
        const sy = ch[nm + 'y'][i];
        let pitch = ch[nm + 'pitch'][i];
        hip.set(s * HIP_X, HIP_Y, 0).applyQuaternion(qP).add(pP);
        this.ankle(sx, sy, sz, pitch, yaw, an, qF);
        // a leg that gets too long lifts the heel, or the toes when the foot is out in front
        const g = 1 - sstep(0.03, 0.12, sy), stretch = sstep(0.88, 1.02, an.distanceTo(hip) / (L1 + L2));
        if (g > 0 && stretch > 0) {
          const ahead = ((an.x - hip.x) * -Math.sin(yaw) + (an.z - hip.z) * -Math.cos(yaw));
          pitch += (ahead < 0 ? 0.8 : -0.42) * stretch * g * Math.min(1, Math.abs(ahead) / 0.15);
          this.ankle(sx, sy, sz, pitch, yaw, an, qF);
        }
        // a heel in the air turns with the hips: the foot pivots on its ball
        if (g > 0 && pitch > 0.12) {
          const turn = clamp(wrap(ch.r1[i] - yaw), -1.1, 1.1) * sstep(0.12, 0.55, pitch) * 0.75 * g, y2 = yaw + turn;
          sx += (Math.sin(y2) - Math.sin(yaw)) * BALL; sz += (Math.cos(y2) - Math.cos(yaw)) * BALL; yaw = y2;
          this.ankle(sx, sy, sz, pitch, yaw, an, qF);
        }
        loc.copy(an).sub(pP).applyQuaternion(qI);
        // the knee looks where the foot looks
        const rel = Math.sin(yaw - ch.r1[i]) * 0.5 * g;
        legIK(s, loc.x, loc.y, loc.z, -rel, qT, qK);
        _q.copy(qP).multiply(qT);
        this.setQ(bT, i, _q); this.setP(bT, i, hip);
        tmpK.set(0, -L1, 0).applyQuaternion(_q).add(hip);
        this.setP(bK, i, tmpK);
        _q.multiply(qK);
        this.setQ(bK, i, _q);
        tmp.set(0, -L2, 0).applyQuaternion(_q).add(tmpK);
        this.setP(bF, i, tmp);
        // (in the air the keys only say how far the ankle is bent)
        const air = sstep(0.02, 0.24, sy);
        if (air > 0) { _q2.copy(_q).multiply(_q3.setFromEuler(_eu.set(-clamp(ch[nm + 'pitch'][i], -0.7, 0.8), 0, 0, 'YXZ'))); qF.slerp(_q2, air); }
        this.setQ(bF, i, qF);
      }
    }
  }

  // ---- a hand's way, or anything else that moves through points: the points are read where they are at this moment
  // side (-1, 1): this is a hand. Its way through the air is the arm swinging around the shoulder, not a straight line. shift: it is that much early.
  path(name, contactOf, side = 0, shift = 0) {
    const K = this.keys.filter((k) => k[name]);
    const n = this.n;
    if (!K.length) return null;
    const out = new Float32Array(n * 3), c = new Float32Array(n), p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), p3 = new THREE.Vector3();
    const qC = new THREE.Quaternion(), qI = new THREE.Quaternion(), pC = new THREE.Vector3(), pts = [p0, p1, p2, p3], D = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], L = [0, 0, 0, 0], sx = side * SH_X, sz = SH_Z[side < 0 ? 0 : 1];
    // a hand with a long time until its next key doesn't crawl there: it stays, and goes when it has to
    const hold = K.map((k, q) => {
      const nx = K[q + 1];
      if (!nx || !(side || name === 'gat')) return k.t;
      const at = clamp(Math.round((nx.t - 0.2) * HZ), 0, n - 1);
      this.point(k[name], at, p1); this.point(nx[name], at, p2);
      return Math.max(k.t, nx.t - (0.2 + p1.distanceTo(p2) * 0.55));
    });
    let j = 0;
    for (let i = 0; i < n; i++) {
      const t = i * DT + shift;
      while (j < K.length - 2 && K[j + 1].t <= t) j++;
      const a0 = K[Math.max(0, j - 1)], s0 = K[j], e = K[Math.min(K.length - 1, j + 1)], d = K[Math.min(K.length - 1, j + 2)], from = hold[j];
      // (standing still until then: no speed to start with)
      const a = from > s0.t + 1e-4 ? { t: from, [name]: s0[name] } : a0, s = from > s0.t + 1e-4 ? { t: from, [name]: s0[name] } : s0;
      this.point(a[name], i, p0); this.point(s[name], i, p1); this.point(e[name], i, p2); this.point(d[name], i, p3);
      const on = contactOf ? [contactOf(s[name]), contactOf(e[name])] : null;
      out[i * 3] = hermite(a.t, s.t, e.t, d.t, p0.x, p1.x, p2.x, p3.x, t);
      out[i * 3 + 1] = hermite(a.t, s.t, e.t, d.t, p0.y, p1.y, p2.y, p3.y, t);
      out[i * 3 + 2] = hermite(a.t, s.t, e.t, d.t, p0.z, p1.z, p2.z, p3.z, t);
      if (side && !(on[0] && on[1])) {
        this.getQ(B.chest, i, qC); this.getP(B.chest, i, pC); qI.copy(qC).invert();
        for (let k = 0; k < 4; k++) {
          const v = pts[k];
          _a.copy(v).sub(pC).applyQuaternion(qI); _a.x -= sx; _a.y -= SH_Y; _a.z -= sz;
          const l = Math.max(_a.length(), 1e-4);
          L[k] = l; D[0][k] = _a.x / l; D[1][k] = _a.y / l; D[2][k] = _a.z / l;
        }
        const dx = hermite(a.t, s.t, e.t, d.t, D[0][0], D[0][1], D[0][2], D[0][3], t), dy = hermite(a.t, s.t, e.t, d.t, D[1][0], D[1][1], D[1][2], D[1][3], t), dz = hermite(a.t, s.t, e.t, d.t, D[2][0], D[2][1], D[2][2], D[2][3], t);
        // (from one side straight through to the other, or right past the shoulder, a line will have to do)
        const ll = Math.hypot(dx, dy, dz), w = sstep(0.2, 0.55, ll) * sstep(0.14, 0.3, Math.min(L[1], L[2]));
        if (w > 0) {
          const r = hermite(a.t, s.t, e.t, d.t, L[0], L[1], L[2], L[3], t) / ll;
          _a.set(dx * r + sx, dy * r + SH_Y, dz * r + sz).applyQuaternion(qC).add(pC);
          out[i * 3] += (_a.x - out[i * 3]) * w; out[i * 3 + 1] += (_a.y - out[i * 3 + 1]) * w; out[i * 3 + 2] += (_a.z - out[i * 3 + 2]) * w;
        }
      }
      if (contactOf) c[i] = on[0] && (t < e.t ? on[1] : true) ? 1 : 0;
    }
    return { p: out, c };
  }

  // ---- arms and whatever they hold. me: 'a' or 'v'.
  arms(me, opts = {}) {
    const { n, ch } = this;
    const other = me === 'a' ? 'v' : 'a';
    const isContact = (s) => typeof s[0] === 'string' && s[0][0] === other;
    const qU = new THREE.Quaternion(), qF = new THREE.Quaternion(), qC = new THREE.Quaternion(), qI = new THREE.Quaternion(), pC = new THREE.Vector3(), tg = new THREE.Vector3(), hint = new THREE.Vector3(), sh = new THREE.Vector3(), shW = new THREE.Vector3();
    // the chest's sway swings whatever hangs from it
    const cx = new Float32Array(n), cy = new Float32Array(n), cz = new Float32Array(n);
    for (let i = 0; i < n; i++) { this.getP(B.chest, i, pC); cx[i] = pC.x; cy[i] = pC.y; cz[i] = pC.z; }
    const ax = smooth(deriv(deriv(cx)), 0.03), ay = smooth(deriv(deriv(cy)), 0.03), az = smooth(deriv(deriv(cz)), 0.03);
    // (no two hands ever do anything at exactly the same moment)
    this.early = (((this.seed * 7.31) % 1) - 0.5) * 0.07;
    const paths = [this.path('lh', isContact, -1, this.early), this.path('rh', isContact, 1, 0)];
    this.contact = [null, null];
    const gat = this.path('gat'), gaim = this.path('gaim');
    if (gat) { this.gat = gat.p = smooth(gat.p, 0.03, 3); this.gaim = gaim.p = smooth(gaim.p, 0.05, 3); }
    const gunOn = sampleCurveStep(this.keys, 'gun', n);
    this.gun = gunOn;
    const hints = [[smooth(sampleCurve(this.keys, 'le', 0, n), 0.05), smooth(sampleCurve(this.keys, 'le', 1, n), 0.05), smooth(sampleCurve(this.keys, 'le', 2, n), 0.05)], [smooth(sampleCurve(this.keys, 're', 0, n), 0.05), smooth(sampleCurve(this.keys, 're', 1, n), 0.05), smooth(sampleCurve(this.keys, 're', 2, n), 0.05)]];
    for (let f = 0; f < 2; f++) {
      const P = paths[f];
      if (!P) continue;
      const s = f ? 1 : -1, bU = f ? B.rupper : B.lupper, bF = f ? B.rfore : B.lfore, bH = f ? B.rhand : B.lhand;
      const path = smooth(P.p, 0.02, 3), contact = smooth(P.c, 0.05);
      this.contact[f] = contact;
      // an arm has weight: it arrives a little too far and comes back. In chest space, zero-lag.
      const tx = new Float32Array(n), ty = new Float32Array(n), tz = new Float32Array(n), mx = new Float32Array(n), my = new Float32Array(n), mz = new Float32Array(n), walk = new Float32Array(n), spd = new Float32Array(n);
      {
        for (let i = 0; i < n; i++) {
          this.getQ(B.chest, i, qC); this.getP(B.chest, i, pC); qI.copy(qC).invert();
          tg.set(path[i * 3], path[i * 3 + 1], path[i * 3 + 2]).sub(pC).applyQuaternion(qI);
          tx[i] = tg.x; ty[i] = tg.y; tz[i] = tg.z;
          // the arm hanging on this side swings with the other leg
          const nm = f ? 'lf' : 'rf', y = ch.r1[i];
          this.getP(B.pelvis, i, _a);
          walk[i] = (ch[nm + 'x'][i] - _a.x) * -Math.sin(y) + (ch[nm + 'z'][i] - _a.z) * -Math.cos(y);
          if (ch[nm + 'y'][i] > 0.3) walk[i] = 0;
        }
        const w0 = 2 * Math.PI * 5.5, ze = 0.62, sub = DT / 2, lead = Math.round(0.03 * HZ);
        let x = tx[0], y = ty[0], z = tz[0], vx = 0, vy = 0, vz = 0;
        for (let i = 0; i < n; i++) {
          const k = Math.min(n - 1, i + lead);
          for (let q = 0; q < 2; q++) {
            vx += sub * (w0 * w0 * (tx[k] - x) - 2 * ze * w0 * vx); x += sub * vx;
            vy += sub * (w0 * w0 * (ty[k] - y) - 2 * ze * w0 * vy); y += sub * vy;
            vz += sub * (w0 * w0 * (tz[k] - z) - 2 * ze * w0 * vz); z += sub * vz;
          }
          mx[i] = x; my[i] = y; mz[i] = z; spd[i] = Math.hypot(vx, vy, vz);
        }
      }
      const walkS = smooth(walk, 0.06), wob = this.seed + f * 5.3;
      // loose hands lag behind and swing
      const swing = [0, 1, 2].map(() => new Float32Array(n));
      {
        const fx = new Float32Array(n), fy = new Float32Array(n), fz = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          this.getQ(B.chest, i, qC); qI.copy(qC).invert();
          _a.set(-ax[i], -ay[i] * 0.4, -az[i]).applyQuaternion(qI);
          fx[i] = _a.x; fy[i] = _a.y; fz[i] = _a.z;
        }
        swing[0] = spring(n, 2.3, 0.42, fx, 0.0065); swing[1] = spring(n, 2.3, 0.42, fy, 0.0065); swing[2] = spring(n, 2.3, 0.42, fz, 0.0065);
      }
      let ph = 0;
      for (let i = 0; i < n; i++) {
        this.getQ(B.chest, i, qC); this.getP(B.chest, i, pC); qI.copy(qC).invert();
        ph += DT * (1 + ch.j[i] * 3);
        if (f === 1 && gat && gunOn[i] > 0.5) tg.set(gat.p[i * 3], gat.p[i * 3 + 1], gat.p[i * 3 + 2]);
        else tg.set(path[i * 3], path[i * 3 + 1], path[i * 3 + 2]);
        tg.sub(pC).applyQuaternion(qI);
        const free = 1 - contact[i];
        if (free > 0.01) {
          const nA = ch.j[i] * 0.03, tt = i * DT;
          // (not with a gun in it: a muzzle goes where it is told)
          const loose = free * (f === 1 && gat && gunOn[i] > 0.5 ? 0.15 : 1);
          tg.x += (mx[i] - tx[i]) * loose; tg.y += (my[i] - ty[i]) * loose; tg.z += (mz[i] - tz[i]) * loose;
          // the faster it goes, the less exact: and it is never quite still
          const fast = Math.min(0.028, spd[i] * 0.006) + 0.004;
          tg.x += loose * drift(tt * 1.3, wob + 1) * fast; tg.y += loose * drift(tt * 1.17, wob + 2) * fast; tg.z += loose * drift(tt * 1.41, wob + 3) * fast;
          // hanging, it swings along with the steps
          const hang = loose * sstep(-0.1, -0.3, ty[i]), sw = clamp(walkS[Math.max(0, i - 5)] * 0.42, -0.2, 0.2) * hang;
          tg.z -= sw; tg.x -= s * Math.abs(sw) * 0.14; tg.y += Math.max(0, sw) * 0.3;
          tg.x += free * (clamp(swing[0][i], -0.22, 0.22) + noise(ph * 2.4, this.seed + f) * nA);
          tg.y += free * (clamp(swing[1][i], -0.22, 0.22) + noise(ph * 2.6, this.seed + f + 2) * nA);
          tg.z += free * (clamp(swing[2][i], -0.22, 0.22) + noise(ph * 2.2, this.seed + f + 4) * nA);
        }
        this.ht[i * 6 + f * 3] = tg.x; this.ht[i * 6 + f * 3 + 1] = tg.y; this.ht[i * 6 + f * 3 + 2] = tg.z;
        armIK(s, tg.x, tg.y, tg.z, hints[f][0][i], hints[f][1][i], hints[f][2][i], qU, qF, sh);
        this.sh[i * 6 + f * 3] = sh.x; this.sh[i * 6 + f * 3 + 1] = sh.y; this.sh[i * 6 + f * 3 + 2] = sh.z;
        // upper arm
        shW.copy(sh).applyQuaternion(qC).add(pC);
        _q.copy(qC).multiply(qU);
        this.setP(bU, i, shW); this.setQ(bU, i, _q);
        _b.set(0, -A1, 0).applyQuaternion(_q).add(shW);
        this.setP(bF, i, _b);
        _q.multiply(qF);
        this.setQ(bF, i, _q); this.setQ(bH, i, _q);
        _c.set(0, -FORE, 0).applyQuaternion(_q).add(_b);
        this.setP(bH, i, _c);
        // how far the hand really stays from what it should touch
        _d.set(0, -A2, 0).applyQuaternion(_q).add(_b);
        this.lost[f][i] = contact[i] > 0.5 ? _d.distanceTo(_e.copy(tg).applyQuaternion(qC).add(pC)) : 0;
      }
    }
  }

  // ---- which hands hold on to the other body, moment by moment
  holds(me) {
    const other = me === 'a' ? 'v' : 'a', isContact = (s) => typeof s[0] === 'string' && s[0][0] === other;
    this.contact = [0, 1].map((f) => { const P = this.path(f ? 'rh' : 'lh', isContact); return P ? smooth(P.c, 0.05) : null; });
  }

  // ---- the body's real balance. Hips and chest may be anywhere the keys put them, but a person standing there would fall over, or
  // could not have started that step: what has to go through the feet does (zero moment point), the hips move for that, and since
  // this looks at the whole scene at once they start before they have to. Nobody thinks about it, and everybody does it.
  balance() {
    const { n, ch } = this;
    const cx = new Float32Array(n), cy = new Float32Array(n), cz = new Float32Array(n), a = _a, b = _b;
    // (the arms count as part of the chest here)
    const SEG = [[B.pelvis, B.pelvis, 0.142], [B.pelvis, B.chest, 0.139], [B.chest, B.head, 0.316], [B.head, B.head, 0.081], [B.lthigh, B.lknee, 0.1], [B.rthigh, B.rknee, 0.1], [B.lknee, B.lfoot, 0.0465], [B.rknee, B.rfoot, 0.0465], [B.lfoot, B.lfoot, 0.0145], [B.rfoot, B.rfoot, 0.0145]];
    for (let i = 0; i < n; i++) {
      let x = 0, y = 0, z = 0, m = 0;
      for (const [s, e, w] of SEG) { this.getP(s, i, a); this.getP(e, i, b); x += (a.x + b.x) * 0.5 * w; y += (a.y + b.y) * 0.5 * w; z += (a.z + b.z) * 0.5 * w; m += w; }
      cx[i] = x / m; cy[i] = y / m; cz[i] = z / m;
    }
    const sx = smooth(cx, 0.03), sy = smooth(cy, 0.03), sz = smooth(cz, 0.03), ax = deriv(deriv(sx)), ay = deriv(deriv(sy)), az = deriv(deriv(sz));
    const ex = new Float32Array(n), ez = new Float32Array(n), pts = [];
    for (let i = 0; i < n; i++) {
      const up = sstep(0.6, 0.74, ch.p1[i]) * sstep(0.97, 0.995, Math.min(ch.kt[i], ch.kl[i])) * (1 - sstep(0.03, 0.25, ch.j[i]));
      const held = Math.max(this.contact[0] ? this.contact[0][i] : 0, this.contact[1] ? this.contact[1][i] : 0), w = up * (1 - held * 0.85);
      if (w < 0.01) continue;
      pts.length = 0;
      for (const nm of ['lf', 'rf']) {
        if (ch[nm + 'y'][i] > 0.03) continue;
        const y = ch[nm + 'yaw'][i], fx = -Math.sin(y), fz = -Math.cos(y), x0 = ch[nm + 'x'][i], z0 = ch[nm + 'z'][i], pt = ch[nm + 'pitch'][i];
        const back = pt > 0.15 ? 0.08 : pt < -0.15 ? -0.07 : -0.07, front = pt < -0.15 ? 0.03 : 0.17;
        pts.push([x0 + fx * back, z0 + fz * back], [x0 + fx * front, z0 + fz * front]);
      }
      if (!pts.length) continue;
      const h = Math.max(0.3, sy[i]), g = Math.max(3, 9.81 + ay[i]), zx = sx[i] - (h / g) * ax[i], zz = sz[i] - (h / g) * az[i];
      const near = supportEdge(pts, zx, zz);
      if (!near) continue;
      ex[i] = near[0] * w; ez[i] = near[1] * w;
    }
    // x - tau^2 x'' = e: at once the smallest move of the hips that does it
    const dx = solveTau(ex, 0.095), dz = solveTau(ez, 0.095);
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(dx[i], dz[i]), k = 1.12 * (d > 1e-4 ? Math.min(0.11, 0.11 * Math.tanh(d / 0.11)) / d : 0);
      ch.p0[i] += dx[i] * k; ch.p2[i] += dz[i] * k;
    }
  }

  // ---- where the head looks. It is the steadiest thing on a body: it keeps the horizon, it keeps its eyes on what it wants to see
  // while everything under it moves, and it gets there a little before the rest. Only the head's turn changes here.
  gaze(target, strength = 0.85) {
    const { n, ch, keys } = this;
    const K = keys.filter((k) => k.look);
    const looks = K.length ? this.path('look') : null;
    if (!looks && !target) target = null;
    const lw = sampleCurve(keys, 'lw', undefined, n, strength);
    const qH = new THREE.Quaternion(), qC = new THREE.Quaternion(), qI = new THREE.Quaternion(), q = new THREE.Quaternion(), pH = new THREE.Vector3(), tg = new THREE.Vector3(), fw = new THREE.Vector3(), l = new THREE.Vector3(), upC = new THREE.Vector3(), up = new THREE.Vector3(), x = new THREE.Vector3(), z = new THREE.Vector3();
    const Q = new Float32Array(n * 4), al = new Float32Array(n);
    let px = 0, py = 0, pz = 0, pw = 1;
    for (let i = 0; i < n; i++) {
      this.getQ(B.head, i, qH); this.getQ(B.chest, i, qC); this.getP(B.head, i, pH);
      q.copy(qH);
      const live = sstep(0.6, 0.98, ch.kh[i]);
      al[i] = live;
      if (live > 0) {
        upC.set(0, 1, 0).applyQuaternion(qC);
        const straight = sstep(0.35, 0.8, upC.y);
        if (looks || target) {
          if (looks) tg.set(looks.p[i * 3], looks.p[i * 3 + 1], looks.p[i * 3 + 2]); else this.point(target, i, tg);
          fw.subVectors(tg, pH);
          fw.y -= 0.09; // (the eyes sit that far above the neck)
          const dist = fw.length(), g = lw[i] * sstep(0.2, 0.5, dist);
          if (g > 0.001) {
            fw.divideScalar(dist);
            qI.copy(qC).invert();
            l.copy(fw).applyQuaternion(qI);
            const yaw = Math.atan2(-l.x, -l.z), pitch = Math.asin(clamp(l.y, -1, 1));
            const ya = clamp(yaw, -1.25, 1.25), pa = clamp(pitch, -0.85, 0.75), behind = 1 - sstep(1.1, 1.8, Math.abs(yaw)); // (what is behind him he doesn't try to see)
            l.set(-Math.sin(ya) * Math.cos(pa), Math.sin(pa), -Math.cos(ya) * Math.cos(pa)).applyQuaternion(qC);
            up.copy(upC).lerp(_c.set(0, 1, 0), 0.65).normalize();
            z.copy(l).negate(); x.crossVectors(up, z).normalize(); up.crossVectors(z, x);
            fromBasis(_q, x, up, z);
            q.slerp(_q, g * behind);
          }
        }
        // the horizon stays level, as far as a neck can do that
        const k = 0.55 * straight;
        if (k > 0.01) {
          fw.set(0, 0, -1).applyQuaternion(q); x.set(1, 0, 0).applyQuaternion(q);
          const roll = Math.asin(clamp(x.y, -1, 1));
          q.premultiply(_q.setFromAxisAngle(fw, roll * k));
        }
      }
      const sg = i && q.x * px + q.y * py + q.z * pz + q.w * pw < 0 ? -1 : 1;
      px = q.x * sg; py = q.y * sg; pz = q.z * sg; pw = q.w * sg;
      Q[i * 4] = px; Q[i * 4 + 1] = py; Q[i * 4 + 2] = pz; Q[i * 4 + 3] = pw;
    }
    const S = smooth(Q, 0.05, 4), still = smooth(al, 0.07);
    for (let i = 0; i < n; i++) {
      this.getQ(B.head, i, qH);
      if (still[i] <= 0.002) continue;
      q.set(S[i * 4], S[i * 4 + 1], S[i * 4 + 2], S[i * 4 + 3]).normalize();
      if (still[i] < 0.998) q.slerp(qH, 1 - still[i]);
      this.setQ(B.head, i, q);
    }
  }

  // ---- the wrists: a hand trails behind what the forearm does, hangs a little, and hangs all the way when nothing holds it any more.
  // light: the hand holds on to something that must not turn with it.
  wrists(light = [false, false]) {
    const { n, ch } = this, q = new THREE.Quaternion(), qL = new THREE.Quaternion(), rel = new THREE.Quaternion(), flex = new THREE.Quaternion();
    for (let f = 0; f < 2; f++) {
      const bF = f ? B.rfore : B.lfore, bH = f ? B.rhand : B.lhand, Q = new Float32Array(n * 4), contact = this.contact && this.contact[f];
      let px = 0, py = 0, pz = 0, pw = 1;
      for (let i = 0; i < n; i++) {
        this.getQ(bF, i, q);
        const sg = i && q.x * px + q.y * py + q.z * pz + q.w * pw < 0 ? -1 : 1;
        px = q.x * sg; py = q.y * sg; pz = q.z * sg; pw = q.w * sg;
        Q[i * 4] = px; Q[i * 4 + 1] = py; Q[i * 4 + 2] = pz; Q[i * 4 + 3] = pw;
      }
      const S = smooth(Q, 0.05, 4), back = Math.round(0.035 * HZ);
      for (let i = 0; i < n; i++) {
        this.getQ(bF, i, q);
        const k = Math.max(0, i - back);
        qL.set(S[k * 4], S[k * 4 + 1], S[k * 4 + 2], S[k * 4 + 3]).normalize();
        // how far it trails
        const free = contact ? 1 - contact[i] : 1, gone = 1 - sstep(0.2, 0.9, ch.ka[i]), hold = light[f] && (!this.gun || this.gun[i] > 0.5 || f === 1) ? 0.25 : 1;
        rel.copy(q).invert().multiply(qL);
        const ang = 2 * Math.acos(Math.min(1, Math.abs(rel.w))), lim = 0.75;
        rel.slerp(_q.identity(), ang > lim ? 1 - lim / ang : 0);
        _q2.identity().slerp(rel, 0.9 * hold * Math.max(free, 0.25));
        flex.setFromAxisAngle(_a.set(1, 0, 0), -(0.12 + free * 0.14 + gone * 0.72) * hold);
        this.setQ(bH, i, _q3.copy(q).multiply(_q2).multiply(flex));
      }
    }
  }

  // ---- the joints the physics works with, in the order of the ragdoll
  joint(j, i, out) {
    switch (j) {
      case 0: return this.getP(B.pelvis, i, out);
      case 1: return this.getP(B.chest, i, out);
      case 2: return this.getP(B.head, i, out);
      case 3: this.getQ(B.head, i, _q2); this.getP(B.head, i, out); return out.add(_a.set(0, 0.12, 0).applyQuaternion(_q2));
      case 4: return this.getP(B.lthigh, i, out);
      case 5: return this.getP(B.rthigh, i, out);
      case 6: return this.getP(B.lknee, i, out);
      case 7: return this.getP(B.rknee, i, out);
      case 8: return this.getP(B.lfoot, i, out);
      case 9: return this.getP(B.rfoot, i, out);
      case 10: this.getQ(B.chest, i, _q2); this.getP(B.chest, i, out); return out.add(_a.set(-SH_X, SH_Y, SH_Z[0]).applyQuaternion(_q2));
      case 11: this.getQ(B.chest, i, _q2); this.getP(B.chest, i, out); return out.add(_a.set(SH_X, SH_Y, SH_Z[1]).applyQuaternion(_q2));
      case 12: return this.getP(B.lfore, i, out);
      case 13: return this.getP(B.rfore, i, out);
      case 14: return this.getP(B.lhand, i, out);
      default: return this.getP(B.rhand, i, out);
    }
  }
}

// how far a point is outside what a foot or two feet stand on: null when it isn't. pts: heel, toes, heel, toes.
function supportEdge(pts, x, z) {
  let hull = pts;
  if (pts.length > 2) {
    const s = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    for (const p of s) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = s.length - 1; i >= 0; i--) { const p = s[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    hull = lo.slice(0, -1).concat(up.slice(0, -1));
    let inside = hull.length > 2;
    for (let i = 0; inside && i < hull.length; i++) if (cr(hull[i], hull[(i + 1) % hull.length], [x, z]) < 0) inside = false;
    if (inside) return null;
  }
  let bd = Infinity, bx = 0, bz = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length], ux = b[0] - a[0], uz = b[1] - a[1], u = clamp(((x - a[0]) * ux + (z - a[1]) * uz) / Math.max(1e-6, ux * ux + uz * uz), 0, 1), qx = a[0] + ux * u, qz = a[1] + uz * u, d = (x - qx) ** 2 + (z - qz) ** 2;
    if (d < bd) { bd = d; bx = qx; bz = qz; }
  }
  const d = Math.sqrt(bd), R = 0.05;
  if (d <= R) return null;
  const k = (d - R) / d;
  return [(bx - x) * k, (bz - z) * k];
}
// (1 - tau^2 d/dt^2) x = e, x' = 0 at the ends
function solveTau(e, tau2) {
  const n = e.length, al = tau2 * HZ * HZ, c = new Float64Array(n), d = new Float64Array(n), x = new Float32Array(n);
  let b0 = 1 + al;
  c[0] = -al / b0; d[0] = e[0] / b0;
  for (let i = 1; i < n; i++) {
    const b = (i === n - 1 ? 1 + al : 1 + 2 * al) + al * c[i - 1];
    c[i] = -al / b; d[i] = (e[i] + al * d[i - 1]) / b;
  }
  x[n - 1] = d[n - 1];
  for (let i = n - 2; i >= 0; i--) x[i] = d[i] - c[i] * x[i + 1];
  return x;
}

function sampleCurveStep(keys, name, n) {
  const out = new Float32Array(n);
  let v = 0, j = 0;
  const L = keys.filter((k) => k[name] !== undefined);
  for (let i = 0; i < n; i++) {
    while (j < L.length && L[j].t <= i * DT) v = L[j++][name];
    out[i] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Where a body lets go. The keys keep pulling on it with the strength of kt (torso), kh (head), ka (arms), kl (legs):
// at 1 it is exactly where the keys say, at 0 it only has its weight and whatever speed it had.
// ---------------------------------------------------------------------------
const frameQ = (rx, ry, rz, ux, uy, uz, out) => {
  _y.set(ux, uy, uz).normalize();
  _x.set(rx, ry, rz);
  _x.addScaledVector(_y, -_x.dot(_y)).normalize();
  _z.crossVectors(_x, _y);
  return fromBasis(out, _x, _y, _z);
};
const framePoints = (p, r0, r1, u0, u1, out) => frameQ(p[r1].x - p[r0].x, p[r1].y - p[r0].y, p[r1].z - p[r0].z, p[u1].x - p[u0].x, p[u1].y - p[u0].y, p[u1].z - p[u0].z, out);
// the chest stands on its own: shoulders over the breastbone. (Never the head: the head is placed by this frame.)
const frameChest = (p, out) => frameQ(p[11].x - p[10].x, p[11].y - p[10].y, p[11].z - p[10].z, (p[10].x + p[11].x) / 2 - p[1].x, (p[10].y + p[11].y) / 2 - p[1].y, (p[10].z + p[11].z) / 2 - p[1].z, out);
// the skeleton at rest, for how long the bones and the braces of the torso are
function restPose() {
  const r = [[0, 0, 0], [0, SPINE + CHEST, 0], [0, SPINE + CHEST + NECK, 0], [0, SPINE + CHEST + NECK + 0.12, 0], [-HIP_X, HIP_Y, 0], [HIP_X, HIP_Y, 0], [-HIP_X, HIP_Y - L1, 0], [HIP_X, HIP_Y - L1, 0], [-HIP_X, HIP_Y - L1 - L2, 0], [HIP_X, HIP_Y - L1 - L2, 0], [-SH_X, SPINE + CHEST + SH_Y, SH_Z[0]], [SH_X, SPINE + CHEST + SH_Y, SH_Z[1]], [-SH_X, SPINE + CHEST + SH_Y - A1, SH_Z[0]], [SH_X, SPINE + CHEST + SH_Y - A1, SH_Z[1]], [-SH_X, SPINE + CHEST + SH_Y - A1 - FORE, SH_Z[0]], [SH_X, SPINE + CHEST + SH_Y - A1 - FORE, SH_Z[1]]];
  return r.map((v) => new THREE.Vector3(v[0], v[1], v[2]));
}
const LIMB_STICK = (a, b) => a >= 6 && b >= 6 && !((a === 10 || a === 11) && (b === 10 || b === 11));
// the sticks that stop being rods once the muscles are gone: how much shorter they may get. Above 0 the waist, below 0 the neck.
const BEND = STICKS.map(([a, b]) => { const s = a + ',' + b; return s === '0,1' ? 0.1 : ['10,4', '11,5', '10,5', '11,4', '1,4', '1,5'].includes(s) ? 0.2 : s === '3,1' ? -0.09 : ['3,10', '3,11'].includes(s) ? -0.2 : 0; });
const GROUP = [0, 0, 1, 1, 0, 0, 3, 3, 3, 3, 0, 0, 2, 2, 2, 2]; // 0 torso, 1 head, 2 arms, 3 legs
const DAMPING = [0.95, 0.75, 0.7, 0.72];
const WEIGHT = [0.2, 0.2, 0.5, 0.5, 0.3, 0.3, 0.9, 0.9, 1.2, 1.2, 0.35, 0.35, 1.2, 1.2, 1.6, 1.6]; // how easily a joint gets pushed around

function simulate(T, pushes) {
  const { n, ch } = T, kt = ch.kt, kh = ch.kh, ka = ch.ka, kl = ch.kl;
  let s0 = -1;
  for (let i = 0; i < n; i++) if (Math.min(kt[i], kh[i], ka[i], kl[i]) < 0.985) { s0 = i; break; }
  if (s0 < 0) return;
  s0 = Math.max(2, s0);
  T.simFrom = s0;
  const mk = () => Array.from({ length: 16 }, () => new THREE.Vector3());
  const p = mk(), o = mk(), key0 = mk(), key1 = mk(), key = mk(), keyV = mk(), tg = mk(), tv = mk(), sp0 = mk();
  for (let j = 0; j < 16; j++) { T.joint(j, s0 - 1, p[j]); T.joint(j, s0 - 2, o[j]); o[j].lerpVectors(p[j], o[j], 0.5); } // o: half a sample back = one substep
  const R = restPose(), rest = STICKS.map(([a, b]) => R[a].distanceTo(R[b]));
  const legLen = L1 + L2, armLen = A1 + FORE;
  const MINS = [[4, 8, legLen * 0.36], [5, 9, legLen * 0.36], [10, 14, armLen * 0.3], [11, 15, armLen * 0.3], [3, 0, R[3].distanceTo(R[0]) * 0.72], [6, 1, R[6].distanceTo(R[1]) * 0.38], [7, 1, R[7].distanceTo(R[1]) * 0.38], [14, 0, 0.18], [15, 0, 0.18], [8, 9, 0.12], [6, 7, 0.14]];
  const md = MINS.map(([a, b, m]) => Math.min(m, p[a].distanceTo(p[b])));
  const S = new Float32Array(n * 48);
  const w = new Float32Array(16), locked = new Uint8Array(16), rc = new THREE.Quaternion(), rp = new THREE.Quaternion(), fk = new THREE.Quaternion(), fs = new THREE.Quaternion();
  const h = DT / 2, GRAV = -9.81;
  let pi = 0, still = 0, gone = 0;
  for (let i = s0; i < n; i++) {
    for (let j = 0; j < 16; j++) { T.joint(j, i - 1, key0[j]); T.joint(j, i, key1[j]); }
    gone = kt[i] < 0.02 && p[0].y < 0.45 ? gone + DT : 0;
    for (let sub = 1; sub <= 2; sub++) {
      const a = sub / 2;
      for (let j = 0; j < 16; j++) { key[j].lerpVectors(key0[j], key1[j], a); keyV[j].subVectors(key1[j], key0[j]).divideScalar(DT); }
      // where the keys want each joint, as seen from the torso as it is now
      frameChest(key, fk); frameChest(p, fs); rc.copy(fs).multiply(fk.invert());
      framePoints(key, 4, 5, 0, 1, fk); framePoints(p, 4, 5, 0, 1, fs); rp.copy(fs).multiply(fk.invert());
      const K = [kt[i], kh[i], ka[i], kl[i]];
      for (let j = 0; j < 16; j++) {
        const g = GROUP[j];
        if (g === 0) { tg[j].copy(key[j]); tv[j].copy(keyV[j]); }
        else {
          const par = g === 3 ? 0 : 1, q = g === 3 ? rp : rc;
          tg[j].subVectors(key[j], key[par]).applyQuaternion(q).add(p[par]);
          tv[j].subVectors(keyV[j], keyV[par]).applyQuaternion(q).add(_a.subVectors(p[par], o[par]).divideScalar(h));
        }
        const k = K[g];
        locked[j] = k >= 0.985 ? 1 : 0;
        w[j] = locked[j] ? 0 : WEIGHT[j];
      }
      // weight, speed, and the pull of the keys
      for (let j = 0; j < 16; j++) {
        if (locked[j]) continue;
        const pj = p[j], oj = o[j], k = K[GROUP[j]], om = 120 * k * k, zt = DAMPING[GROUP[j]];
        const vx = (pj.x - oj.x) / h, vy = (pj.y - oj.y) / h, vz = (pj.z - oj.z) / h;
        const fx = om * om * (tg[j].x - pj.x) + 2 * zt * om * (tv[j].x - vx);
        const fy = om * om * (tg[j].y - pj.y) + 2 * zt * om * (tv[j].y - vy) + GRAV;
        const fz = om * om * (tg[j].z - pj.z) + 2 * zt * om * (tv[j].z - vz);
        // what is nearly at rest comes to rest, and what has been down for a while has stopped: clothes, gear and the ground see to that
        const sp = Math.hypot(vx, vy, vz), damp = sp < 0.25 ? 0.975 : 0.9975 - Math.min(0.018, gone * 0.016);
        oj.copy(pj);
        pj.x += vx * h * damp + fx * h * h; pj.y += vy * h * damp + fy * h * h; pj.z += vz * h * damp + fz * h * h;
      }
      for (let j = 0; j < 16; j++) if (locked[j]) { o[j].copy(p[j]); p[j].copy(tg[j]); }
      // knocks
      while (pi < pushes.length && pushes[pi][0] <= i * DT) {
        const [, parts, dx, dy, dz] = pushes[pi++];
        for (const j of parts) if (!locked[j]) o[j].add(_a.set(dx, dy, dz).multiplyScalar(-h));
      }
      for (let j = 0; j < 16; j++) sp0[j].subVectors(p[j], o[j]).divideScalar(h);
      // the skeleton holds together
      const kT = Math.min(1, kt[i] * 3);
      for (let it = 0; it < 8; it++) {
        for (let q = 0; q < STICKS.length; q++) {
          const [A, Z] = STICKS[q];
          const wa = w[A], wb = w[Z];
          if (wa + wb === 0) continue;
          let len = rest[q];
          if (A >= 10 && A <= 11 && Z >= 12) len += (key[A].distanceTo(key[Z]) - len) * Math.min(1, ka[i] * 1.5);
          else if (!LIMB_STICK(A, Z) && kT > 0) len += (key[A].distanceTo(key[Z]) - len) * kT;
          const pa = p[A], pb = p[Z], dx = pb.x - pa.x, dy = pb.y - pa.y, dz = pb.z - pa.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          // nothing holds a body up any more: it bends at the waist and the head lolls, as far as they go
          const give = BEND[q];
          if (give) {
            const slack = give > 0 ? 1 - kT : 1 - Math.min(1, kh[i] * 1.6), lo = len * (1 - Math.abs(give) * slack), hi = len * (1 + (give > 0 ? 0.05 : 0.12) * slack);
            if (d >= lo && d <= hi) continue;
            len = d < lo ? lo : hi;
          }
          const diff = (d - len) / (d * (wa + wb));
          pa.x += dx * diff * wa; pa.y += dy * diff * wa; pa.z += dz * diff * wa;
          pb.x -= dx * diff * wb; pb.y -= dy * diff * wb; pb.z -= dz * diff * wb;
        }
        for (let q = 0; q < MINS.length; q++) {
          const [A, Z, m] = MINS[q], wa = w[A], wb = w[Z];
          const pa = p[A], pb = p[Z], dx = pb.x - pa.x, dy = pb.y - pa.y, dz = pb.z - pa.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          // whatever folded it this far was the keys: it opens again slowly, it doesn't spring open
          if (it === 0) md[q] = wa === 0 || wb === 0 ? Math.min(m, d) : Math.min(m, md[q] + 0.12 * h);
          if (wa + wb === 0) continue;
          if (d >= md[q]) continue;
          const diff = (d - md[q]) / (d * (wa + wb));
          pa.x += dx * diff * wa; pa.y += dy * diff * wa; pa.z += dz * diff * wa;
          pb.x -= dx * diff * wb; pb.y -= dy * diff * wb; pb.z -= dz * diff * wb;
        }
        // knees bend forward only
        _c.subVectors(p[1], p[0]); _d.subVectors(p[5], p[4]); _e.crossVectors(_c, _d).normalize();
        for (const [a2, k2, f2] of [[4, 6, 8], [5, 7, 9]]) {
          if (locked[k2]) continue;
          _f.addVectors(p[a2], p[f2]).multiplyScalar(0.5);
          const dd = _g.subVectors(p[k2], _f).dot(_e);
          if (dd < 0.02) p[k2].addScaledVector(_e, Math.min(0.0015, (0.02 - dd) * 0.5));
        }
        // the ground
        for (let j = 0; j < 16; j++) {
          if (locked[j] || p[j].y >= RADIUS[j]) continue;
          const vy = (p[j].y - o[j].y);
          p[j].y = RADIUS[j];
          o[j].x += (p[j].x - o[j].x) * 0.1; o[j].z += (p[j].z - o[j].z) * 0.1;
          o[j].y = p[j].y + Math.min(0, vy) * 0.22;
        }
      }
      for (let j = 0; j < 16; j++) if (locked[j]) p[j].copy(tg[j]);
      // what the limits did goes into where the bones are, it doesn't throw them anywhere: only so much speed changes in one step
      for (let j = 0; j < 16; j++) {
        if (locked[j]) continue;
        _a.subVectors(p[j], o[j]).divideScalar(h).sub(sp0[j]);
        const dv = _a.length();
        if (dv > 1.3) o[j].subVectors(p[j], _b.copy(sp0[j]).addScaledVector(_a, 1.3 / dv).multiplyScalar(h));
      }
    }
    let top = 0;
    for (let j = 0; j < 16; j++) { const v = p[j].distanceTo(o[j]) / h; if (v > top) top = v; S[i * 48 + j * 3] = p[j].x; S[i * 48 + j * 3 + 1] = p[j].y; S[i * 48 + j * 3 + 2] = p[j].z; }
    still = top < 0.05 ? still + DT : 0;
    if (still > 0.12 && Math.max(kt[i], kh[i], ka[i], kl[i]) < 0.02) { for (let k = i + 1; k < n; k++) S.copyWithin(k * 48, i * 48, i * 48 + 48); break; }
  }
  rebuild(T, S, s0);
}

// from the joints back to the skeleton: no bone turns more than its joints moved, so nothing can pop or twist
function rebuild(T, S, s0) {
  const { n, ch } = T, kt = ch.kt, kh = ch.kh, ka = ch.ka, kl = ch.kl;
  const KQ = T.Q.slice();
  const keyQ = (b, i, o) => { const k = (i * NB + b) * 4; return o.set(KQ[k], KQ[k + 1], KQ[k + 2], KQ[k + 3]); };
  const pts = Array.from({ length: 16 }, () => new THREE.Vector3()), kp = Array.from({ length: 16 }, () => new THREE.Vector3());
  const qP = new THREE.Quaternion(), qC = new THREE.Quaternion(), qS = new THREE.Quaternion(), qH = new THREE.Quaternion(), dP = new THREE.Quaternion(), dC = new THREE.Quaternion(), fk = new THREE.Quaternion(), tmp = new THREE.Quaternion(), tmp2 = new THREE.Quaternion(), lS = new THREE.Quaternion(), lC = new THREE.Quaternion(), lastBend = new THREE.Quaternion();
  // arms and legs, with their last rotation and direction
  const CH = [[B.lthigh, 4, 6, B.pelvis, kl], [B.lknee, 6, 8, B.lthigh, kl], [B.rthigh, 5, 7, B.pelvis, kl], [B.rknee, 7, 9, B.rthigh, kl], [B.lupper, 10, 12, B.chest, ka], [B.lfore, 12, 14, B.lupper, ka], [B.rupper, 11, 13, B.chest, ka], [B.rfore, 13, 15, B.rupper, ka]];
  const last = CH.map(() => ({ q: new THREE.Quaternion(), d: new THREE.Vector3() }));
  const headLast = { q: new THREE.Quaternion(), d: new THREE.Vector3() };
  const relax = new THREE.Quaternion().setFromEuler(_eu.set(-0.55, 0, 0, 'YXZ'));
  const dir = new THREE.Vector3(), step = new THREE.Quaternion();
  const read = (i) => { for (let j = 0; j < 16; j++) pts[j].set(S[i * 48 + j * 3], S[i * 48 + j * 3 + 1], S[i * 48 + j * 3 + 2]); };
  const keyPts = (i) => { for (let j = 0; j < 16; j++) T.joint(j, i, kp[j]); };
  // the keyed pose has to stay readable while this runs: the finished one goes somewhere else first
  const newP = T.P.slice(), newQ = T.Q.slice();
  const put = (b, i, pos, q) => { const k = (i * NB + b); if (pos) { newP[k * 3] = pos.x; newP[k * 3 + 1] = pos.y; newP[k * 3 + 2] = pos.z; } newQ[k * 4] = q.x; newQ[k * 4 + 1] = q.y; newQ[k * 4 + 2] = q.z; newQ[k * 4 + 3] = q.w; };
  const getNew = (b, i, o) => { const k = (i * NB + b) * 4; return o.set(newQ[k], newQ[k + 1], newQ[k + 2], newQ[k + 3]); };
  const posNew = (b, i, o) => { const k = (i * NB + b) * 3; return o.set(newP[k], newP[k + 1], newP[k + 2]); };
  const a = new THREE.Vector3(), b2 = new THREE.Vector3();
  for (let i = s0; i < n; i++) {
    read(i); keyPts(i);
    // ---- the torso
    if (kt[i] > 0.5 || i === s0) {
      framePoints(kp, 4, 5, 0, 1, fk); dP.copy(fk.invert()).multiply(keyQ(B.pelvis, i, tmp));
      frameChest(kp, fk); dC.copy(fk.invert()).multiply(keyQ(B.chest, i, tmp));
    }
    framePoints(pts, 4, 5, 0, 1, qP); qP.multiply(dP);
    frameChest(pts, qC); qC.multiply(dC);
    if (kt[i] >= 0.985) { keyQ(B.pelvis, i, qP); keyQ(B.chest, i, qC); }
    // the bend goes half into the spine, as the keys have it
    tmp.copy(keyQ(B.pelvis, i, tmp2)).invert().multiply(keyQ(B.spine, i, lS)); // spine in the hips, as keyed
    lS.copy(tmp);
    tmp.copy(keyQ(B.spine, i, tmp2)).invert().multiply(keyQ(B.chest, i, lC));  // chest in the spine, as keyed
    lC.copy(tmp);
    const rel = tmp.copy(qP).invert().multiply(qC);
    const diff = tmp2.copy(rel).multiply(_q.copy(lS).multiply(lC).invert());
    // (half of it, the same way around as before: a body folded far over doesn't flip to its other side)
    if (i > s0 && diff.x * lastBend.x + diff.y * lastBend.y + diff.z * lastBend.z + diff.w * lastBend.w < 0) diff.set(-diff.x, -diff.y, -diff.z, -diff.w);
    lastBend.copy(diff);
    _q.set(diff.x, diff.y, diff.z, diff.w + 1).normalize();
    lS.premultiply(_q);
    qS.copy(qP).multiply(lS);
    put(B.pelvis, i, pts[0], qP);
    a.set(0, SPINE, 0).applyQuaternion(qP).add(pts[0]);
    put(B.spine, i, a, qS);
    b2.set(0, CHEST, 0).applyQuaternion(qS).add(a);
    put(B.chest, i, b2, qC);
    const chestP = b2.clone();
    a.set(0, NECK, 0).applyQuaternion(qC).add(chestP);
    const headP = a.clone();
    // ---- the head
    dir.subVectors(pts[3], pts[2]).normalize();
    if (i === s0) { keyQ(B.head, i, headLast.q); headLast.d.copy(dir); }
    step.setFromUnitVectors(headLast.d, dir);
    qH.copy(headLast.q).premultiply(step);
    const wH = sstep(0.55, 0.98, kh[i]);
    if (wH > 0) { keyQ(B.chest, i, tmp); tmp.invert().multiply(keyQ(B.head, i, tmp2)); qH.slerp(tmp.premultiply(qC), wH); }
    qH.normalize();
    headLast.q.copy(qH); headLast.d.copy(dir);
    put(B.head, i, headP, qH);
    // ---- legs and arms
    for (let c = 0; c < CH.length; c++) {
      const [bone, j0, j1, parent, K] = CH[c], L = last[c];
      dir.subVectors(pts[j1], pts[j0]).normalize();
      if (i === s0) { keyQ(bone, i, L.q); L.d.copy(dir); }
      step.setFromUnitVectors(L.d, dir);
      const qB = tmp.copy(L.q).premultiply(step);
      const wK = sstep(0.55, 0.98, K[i]);
      if (wK > 0) {
        // as keyed, on whatever its parent is doing now
        keyQ(parent, i, _q); _q.invert().multiply(keyQ(bone, i, tmp2));
        getNew(parent, i, tmp2); _q.premultiply(tmp2);
        qB.slerp(_q, wK);
      }
      qB.normalize();
      L.q.copy(qB); L.d.copy(dir);
      // where it hangs: from its parent's end
      const pos = a;
      if (bone === B.lthigh || bone === B.rthigh) pos.set(bone === B.lthigh ? -HIP_X : HIP_X, HIP_Y, 0).applyQuaternion(qP).add(pts[0]);
      else if (bone === B.lknee || bone === B.rknee) { posNew(parent, i, pos); getNew(parent, i, tmp2); pos.add(b2.set(0, -L1, 0).applyQuaternion(tmp2)); }
      else if (bone === B.lupper || bone === B.rupper) {
        const f = bone === B.lupper ? 0 : 1, kk = sstep(0.3, 0.98, ka[i]);
        // the shoulder only goes along while the arm is doing something
        b2.set(T.sh[i * 6 + f * 3], T.sh[i * 6 + f * 3 + 1], T.sh[i * 6 + f * 3 + 2]);
        b2.x += ((f ? SH_X : -SH_X) - b2.x) * (1 - kk); b2.y += (SH_Y - b2.y) * (1 - kk); b2.z += (SH_Z[f] - b2.z) * (1 - kk);
        T.sh[i * 6 + f * 3] = b2.x; T.sh[i * 6 + f * 3 + 1] = b2.y; T.sh[i * 6 + f * 3 + 2] = b2.z;
        pos.copy(b2).applyQuaternion(qC).add(chestP);
      } else { posNew(parent, i, pos); getNew(parent, i, tmp2); pos.add(b2.set(0, -A1, 0).applyQuaternion(tmp2)); }
      put(bone, i, pos, qB);
      // what hangs on the last link
      if (bone === B.lknee || bone === B.rknee) {
        const fb = bone === B.lknee ? B.lfoot : B.rfoot;
        const footP = b2.set(0, -L2, 0).applyQuaternion(qB).add(pos).clone();
        keyQ(bone, i, _q); _q.invert().multiply(keyQ(fb, i, tmp2));
        _q.slerp(relax, sstep(0.9, 0.2, K[i]));
        put(fb, i, footP, _q.premultiply(qB));
      }
      if (bone === B.lfore || bone === B.rfore) {
        const hb = bone === B.lfore ? B.lhand : B.rhand;
        b2.set(0, -FORE, 0).applyQuaternion(qB).add(pos);
        put(hb, i, b2, qB);
      }
    }
  }
  // the keyed pose stayed where it was until now: everything after this point reads the finished one
  T.P.set(newP); T.Q.set(newQ);
}

// ---------------------------------------------------------------------------
// The whole scene
// ---------------------------------------------------------------------------
export function bake(F, opts = {}) {
  const n = Math.ceil(F.dur * HZ) + 1, ctx = {};
  const seed = F.name.length * 1.7;
  const A = (ctx.a = new Track(F.a, n, ctx, seed)), V = (ctx.v = new Track(F.v, n, ctx, seed + 5));
  V.channels(F.vk || {});
  A.channels(F.ak || {}, V.ch.j);
  A.feet(); V.feet();
  A.fk(); V.fk();
  separate(A, V);
  A.fk(); V.fk();
  // (a first look at both is what it takes to see where the weight really is)
  A.holds('a'); V.holds('v');
  A.balance(); V.balance();
  A.fk(); V.fk();
  A.arms('a'); V.arms('v');
  const pushes = (F.push || []).slice().sort((x, y) => x[0] - y[0]);
  simulate(V, pushes);
  // the hands that hold on to him follow him, and the hands that hold on to the attacker
  A.arms('a');
  if (V.simFrom !== undefined) contactFix(V);
  // (the one doing it looks at what he is doing, the other one at him as soon as he can see him)
  A.gaze(['v.chest', 0, 0.22, 0]); V.gaze(['a.head', 0, 0.05, 0], 0.45);
  A.wrists([false, !!(F.prop || F.gun)]); V.wrists();
  groundFix(V); groundFix(A);
  const clip = { n, hz: HZ, dur: F.dur, a: packBody(A), v: packBody(V), cam: bakeCamera(F, A, n), room: roomOf(A, V, n) };
  if (F.prop) clip.prop = bakeProp(F, A, n);
  if (A.gat) clip.gun = bakeGun(A, n);
  if (opts.debug) clip.debug = { A, V };
  return clip;
}

// two people can press against each other as hard as they like, they stay two people: the trunks don't go into each other.
// Both give way as long as both still stand on their own, a little before they touch.
const TRUNK = [[B.pelvis, B.spine, 0.15], [B.spine, B.chest, 0.15], [B.chest, B.head, 0.16]];
function closest(a0, a1, b0, b1, ca, cb) {
  const u = _a.subVectors(a1, a0), v = _b.subVectors(b1, b0), w = _c.subVectors(a0, b0);
  const A0 = u.dot(u), B0 = u.dot(v), C0 = v.dot(v), D0 = u.dot(w), E0 = v.dot(w), den = A0 * C0 - B0 * B0;
  let s = den > 1e-6 ? clamp((B0 * E0 - C0 * D0) / den, 0, 1) : 0, t = C0 > 1e-6 ? (B0 * s + E0) / C0 : 0;
  if (t < 0) { t = 0; s = A0 > 1e-6 ? clamp(-D0 / A0, 0, 1) : 0; } else if (t > 1) { t = 1; s = A0 > 1e-6 ? clamp((B0 - D0) / A0, 0, 1) : 0; }
  ca.copy(a0).addScaledVector(u, s); cb.copy(b0).addScaledVector(v, t);
  return ca.distanceTo(cb);
}
function separate(A, V) {
  const n = A.n, ax = new Float32Array(n), ay = new Float32Array(n), az = new Float32Array(n), a0 = new THREE.Vector3(), a1 = new THREE.Vector3(), b0 = new THREE.Vector3(), b1 = new THREE.Vector3(), ca = new THREE.Vector3(), cb = new THREE.Vector3(), best = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    let top = 0;
    for (const [s, e, ra] of TRUNK) {
      A.getP(s, i, a0); A.getP(e, i, a1);
      for (const [s2, e2, rb] of TRUNK) {
        V.getP(s2, i, b0); V.getP(e2, i, b1);
        const d = closest(a0, a1, b0, b1, ca, cb), pen = ra + rb - d;
        if (pen <= top) continue;
        top = pen;
        best.subVectors(ca, cb);
        // (one lying under the other is passed over the top, otherwise it's out to the side)
        if (best.lengthSq() < 1e-4) { A.getP(B.pelvis, i, a0); V.getP(B.pelvis, i, b0); best.subVectors(a0, b0); }
        best.normalize();
      }
    }
    if (top > 0) { ax[i] = best.x * top; ay[i] = best.y * top; az[i] = best.z * top; }
  }
  // a little before they touch, and it takes a moment to go away again
  const R = Math.round(0.12 * HZ), widen = (x) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) { let v = 0; for (let k = Math.max(0, i - R); k <= Math.min(n - 1, i + R); k++) if (Math.abs(x[k]) > Math.abs(v)) v = x[k]; o[i] = v; } return smooth(o, 0.07); };
  const sx = widen(ax), sy = widen(ay), sz = widen(az);
  for (let i = 0; i < n; i++) {
    // whoever isn't on his own feet any more can't get out of the way
    const both = sstep(0.5, 0.95, V.ch.kt[i]) * sstep(0.62, 0.8, V.ch.p1[i]), mine = 1 - 0.5 * both;
    A.ch.p0[i] += sx[i] * mine; A.ch.p2[i] += sz[i] * mine; A.ch.p1[i] += Math.max(0, sy[i]) * mine;
    V.ch.p0[i] -= sx[i] * (1 - mine); V.ch.p2[i] -= sz[i] * (1 - mine);
  }
}

// the victim's hands on the attacker after he went loose
function contactFix(V) {
  const { n, ch } = V;
  const qC = new THREE.Quaternion(), pC = new THREE.Vector3(), tg = new THREE.Vector3(), qU = new THREE.Quaternion(), qF = new THREE.Quaternion(), sh = new THREE.Vector3(), qI = new THREE.Quaternion();
  const isA = (s) => typeof s[0] === 'string' && s[0][0] === 'a';
  for (let f = 0; f < 2; f++) {
    const P = V.path(f ? 'rh' : 'lh', isA, f ? 1 : -1, f ? 0 : V.early);
    if (!P) continue;
    const path = smooth(P.p, 0.02, 3), c = smooth(P.c, 0.05), s = f ? 1 : -1;
    const bU = f ? B.rupper : B.lupper, bF = f ? B.rfore : B.lfore, bH = f ? B.rhand : B.lhand;
    for (let i = V.simFrom; i < n; i++) {
      const w = c[i] * sstep(0.5, 0.95, ch.ka[i]);
      if (w < 0.01) continue;
      V.getQ(B.chest, i, qC); V.getP(B.chest, i, pC); qI.copy(qC).invert();
      tg.set(path[i * 3], path[i * 3 + 1], path[i * 3 + 2]).sub(pC).applyQuaternion(qI);
      armIK(s, tg.x, tg.y, tg.z, 0, 0, 0, qU, qF, sh);
      V.getQ(bU, i, _q); _q.slerp(_q2.copy(qC).multiply(qU), w);
      sh.applyQuaternion(qC).add(pC);
      V.setP(bU, i, _a.copy(sh));
      V.setQ(bU, i, _q);
      _b.set(0, -A1, 0).applyQuaternion(_q).add(sh);
      V.setP(bF, i, _b);
      V.getQ(bF, i, _q3); _q2.copy(qC).multiply(qU).multiply(qF); _q3.slerp(_q2, w);
      V.setQ(bF, i, _q3); V.setQ(bH, i, _q3);
      _c.set(0, -FORE, 0).applyQuaternion(_q3).add(_b);
      V.setP(bH, i, _c);
    }
  }
}

// the floor both bodies really use, all the way through: [x0, z0, x1, z1]
function roomOf(A, V, n) {
  const r = [Infinity, Infinity, -Infinity, -Infinity];
  for (const T of [A, V]) for (let i = 0; i < n; i += 4) for (let b = 0; b < NB; b++) {
    const k = (i * NB + b) * 3, x = T.P[k], z = T.P[k + 2];
    if (T.P[k + 1] > 2.2) continue; // (flying over everything doesn't take up any floor)
    if (x < r[0]) r[0] = x; if (z < r[1]) r[1] = z; if (x > r[2]) r[2] = x; if (z > r[3]) r[3] = z;
  }
  return [r[0] - 0.2, r[1] - 0.2, r[2] + 0.2, r[3] + 0.2];
}

// nothing sinks into the ground: the hips come up just as far as needed
function groundFix(T) {
  const { n } = T, lift = new Float32Array(n), R = [0.12, 0.1, 0.12, 0.12, 0.08, 0.05, 0.06, 0.08, 0.05, 0.06, 0.06, 0.04, 0.03, 0.06, 0.04, 0.03];
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let b = 0; b < NB; b++) { const y = T.P[(i * NB + b) * 3 + 1] - R[b]; if (y < m) m = y; }
    lift[i] = -m;
  }
  // it comes up a little before it has to and goes back down after, so the hips never jump
  const R2 = Math.round(0.07 * HZ), wide = new Float32Array(n);
  for (let i = 0; i < n; i++) { let w = 0; for (let k = Math.max(0, i - R2); k <= Math.min(n - 1, i + R2); k++) if (lift[k] > w) w = lift[k]; wide[i] = w; }
  const s = smooth(wide, 0.03);
  for (let i = 0; i < n; i++) {
    const v = s[i];
    if (v <= 1e-4) continue;
    for (let b = 0; b < NB; b++) T.P[(i * NB + b) * 3 + 1] += v;
  }
}

function packBody(T) {
  const { n } = T, nj = JOINTS.length, q = new Float32Array(n * nj * 4), pos = new Float32Array(n * 3);
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  const prev = new Float32Array(nj * 4);
  for (let i = 0; i < n; i++) {
    T.getP(B.pelvis, i, _a); pos[i * 3] = _a.x; pos[i * 3 + 1] = _a.y; pos[i * 3 + 2] = _a.z;
    for (let j = 0; j < nj; j++) {
      const b = JOINTS[j];
      T.getQ(b, i, qb);
      if (PARENT[b] >= 0) { T.getQ(PARENT[b], i, qa); qb.premultiply(qa.invert()); }
      // always the short way between two frames
      const o = j * 4, dot = prev[o] * qb.x + prev[o + 1] * qb.y + prev[o + 2] * qb.z + prev[o + 3] * qb.w, sg = i && dot < 0 ? -1 : 1;
      const k = (i * nj + j) * 4;
      q[k] = prev[o] = qb.x * sg; q[k + 1] = prev[o + 1] = qb.y * sg; q[k + 2] = prev[o + 2] = qb.z * sg; q[k + 3] = prev[o + 3] = qb.w * sg;
    }
  }
  return { q, pos, ht: T.ht, sh: T.sh, gun: T.gun, two: T.ch.two };
}

// the camera's way: read from the finished bodies, then rounded a great deal more than anything else
function bakeCamera(F, A, n) {
  const shots = F.cam, cuts = [0];
  shots.forEach((s, i) => { if (s.cut && i) cuts.push(i); });
  const pos = new Float32Array(n * 3), look = new Float32Array(n * 3), fov = new Float32Array(n);
  const seg = [];
  for (let c = 0; c < cuts.length; c++) {
    const list = shots.slice(cuts[c], cuts[c + 1] ?? shots.length);
    const i0 = c ? Math.round(list[0].t * HZ) : 0, i1 = cuts[c + 1] !== undefined ? Math.round(shots[cuts[c + 1]].t * HZ) : n;
    seg.push([i0, i1]);
    const P = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), e = new THREE.Vector3();
    let j = 0;
    const L = i1 - i0, pp = new Float32Array(L * 3), ll = new Float32Array(L * 3), ff = new Float32Array(L);
    for (let i = i0; i < i1; i++) {
      const t = i * DT;
      while (j < list.length - 2 && list[j + 1].t <= t) j++;
      const k0 = list[Math.max(0, j - 1)], k1 = list[j], k2 = list[Math.min(list.length - 1, j + 1)], k3 = list[Math.min(list.length - 1, j + 2)];
      for (const [key, out] of [['pos', pp], ['look', ll]]) {
        A.point(k0[key], i, a); A.point(k1[key], i, b); A.point(k2[key], i, d); A.point(k3[key], i, e);
        P.set(hermite(k0.t, k1.t, k2.t, k3.t, a.x, b.x, d.x, e.x, t), hermite(k0.t, k1.t, k2.t, k3.t, a.y, b.y, d.y, e.y, t), hermite(k0.t, k1.t, k2.t, k3.t, a.z, b.z, d.z, e.z, t));
        out[(i - i0) * 3] = P.x; out[(i - i0) * 3 + 1] = P.y; out[(i - i0) * 3 + 2] = P.z;
      }
      ff[i - i0] = hermite(k0.t, k1.t, k2.t, k3.t, k0.fov, k1.fov, k2.fov, k3.fov, t);
    }
    const sp = smooth(pp, 0.16, 3), sl = smooth(ll, 0.13, 3), sf = smooth(ff, 0.18), crop = new Uint8Array(L);
    for (let i = 0, k = 0; i < L; i++) { while (k < list.length - 1 && list[k + 1].t <= (i + i0) * DT) k++; crop[i] = list[k].crop || 0; }
    director(A, list[0], sp, sl, sf, i0, crop);
    handheld(F, sp, sl, i0, c);
    pos.set(sp, i0 * 3); look.set(sl, i0 * 3); fov.set(sf, i0);
  }
  return { pos, look, fov, cuts: seg.slice(1).map((s) => s[0]) };
}

// ---- somebody is holding this camera: it never quite stands still, and it feels what happens in front of it
function handheld(F, P, L, i0, seed) {
  const m = P.length / 3, S = seed * 3.7 + F.name.length, hits = [];
  for (const e of F.events || []) { const a = e[1] === 'slam' ? 1 : e[1] === 'hit' ? 0.8 : e[1] === 'shot' ? 0.5 : e[1] === 'thud' ? 0.55 : 0; if (a) hits.push([e[0], a]); }
  for (let i = 0; i < m; i++) {
    const t = (i + i0) * DT;
    let kick = 0;
    for (const [at, a] of hits) if (t > at && t < at + 0.7) kick += a * Math.exp(-(t - at) * 8) * Math.sin((t - at) * 36);
    P[i * 3] += drift(t * 1.1, S) * 0.007; P[i * 3 + 1] += drift(t * 1.3, S + 2) * 0.006 + kick * 0.007; P[i * 3 + 2] += drift(t * 0.9, S + 4) * 0.007;
    L[i * 3] += drift(t * 1.4, S + 6) * 0.013; L[i * 3 + 1] += drift(t * 1.2, S + 8) * 0.011 + kick * 0.016; L[i * 3 + 2] += drift(t * 1.5, S + 10) * 0.013;
  }
}

// ---- whatever way the camera was told to go: it pans and opens just far enough to keep everybody between the black
// bars, it stands back if it has to, and it does all that as slowly as if it had seen it coming.
const SAFE_Y = 0.71, SAFE_X = 0.9, ASPECT = 16 / 9, FOV_MAX = 50;
function director(A, shot, P, L, F, i0, crop) {
  const V = A.ctx.v, m = F.length;
  const subj = [[A, B.head, 0.2], [A, B.rhand, shot.reach || 0], [A, B.lfoot, 0, 1], [A, B.rfoot, 0, 1]];
  if (shot.only !== 'a') subj.push([V, B.head, 0.2], [V, B.pelvis, 0, 1], [V, B.lfoot, 0, 1], [V, B.rfoot, 0, 1]);
  const cp = new THREE.Vector3(), lk = new THREE.Vector3(), fw = new THREE.Vector3(), rg = new THREE.Vector3(), up = new THREE.Vector3(), v = new THREE.Vector3();
  let t0 = 0, t1 = 0, f0 = 0, f1 = 0;
  const frame = (i, back) => {
    cp.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); lk.set(L[i * 3], L[i * 3 + 1], L[i * 3 + 2]);
    fw.subVectors(lk, cp).normalize(); rg.crossVectors(fw, UP).normalize(); up.crossVectors(rg, fw);
    if (back) cp.addScaledVector(fw, -back);
    t0 = Infinity; t1 = -Infinity; f0 = Infinity; f1 = -Infinity;
    for (const [T, b, lift, low] of subj) {
      if ((low && crop[i]) || (crop[i] === 2 && T === A)) continue;
      T.getP(b, i + i0, v); v.y += lift; v.sub(cp);
      const dz = Math.max(0.3, v.dot(fw)), th = Math.atan2(v.dot(rg), dz), ph = Math.atan2(v.dot(up), dz);
      if (th < t0) t0 = th; if (th > t1) t1 = th; if (ph < f0) f0 = ph; if (ph > f1) f1 = ph;
    }
  };
  const need = new Float32Array(m), Tmax = Math.tan((FOV_MAX * Math.PI) / 360);
  for (let i = 0; i < m; i++) {
    frame(i, 0);
    need[i] = Math.max(Math.tan((f1 - f0) / 2) / SAFE_Y, Math.tan((t1 - t0) / 2) / (SAFE_X * ASPECT), Math.tan((F[i] * Math.PI) / 360));
  }
  // it opens before it has to
  const R = Math.round(0.25 * HZ), wide = new Float32Array(m);
  for (let i = 0; i < m; i++) { let w = 0; for (let k = Math.max(0, i - R); k <= Math.min(m - 1, i + R); k++) if (need[k] > w) w = need[k]; wide[i] = w; }
  const soft = smooth(wide, 0.14), back = new Float32Array(m), Tan = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    const t = Math.min(soft[i], Tmax);
    Tan[i] = t;
    if (soft[i] > t) { cp.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); lk.set(L[i * 3], L[i * 3 + 1], L[i * 3 + 2]); back[i] = cp.distanceTo(lk) * (soft[i] / t - 1); }
  }
  const backS = smooth(back, 0.2), newP = new Float32Array(m * 3), newL = new Float32Array(m * 3);
  for (let i = 0; i < m; i++) {
    frame(i, backS[i]);
    const W = Math.atan(SAFE_X * ASPECT * Tan[i]), H = Math.atan(SAFE_Y * Tan[i]);
    const a = t1 - W, b = t0 + W, c = f1 - H, d = f0 + H;
    const tc = a > b ? (a + b) / 2 : clamp(0, a, b), pc = c > d ? (c + d) / 2 : clamp(0, c, d);
    newP[i * 3] = cp.x; newP[i * 3 + 1] = cp.y; newP[i * 3 + 2] = cp.z;
    const dist = Math.max(cp.distanceTo(lk), 1);
    v.copy(fw).addScaledVector(rg, Math.tan(tc)).addScaledVector(up, Math.tan(pc)).normalize();
    newL[i * 3] = cp.x + v.x * dist; newL[i * 3 + 1] = cp.y + v.y * dist; newL[i * 3 + 2] = cp.z + v.z * dist;
  }
  const sP = smooth(newP, 0.1, 3), sL = smooth(newL, 0.2, 3), sF = smooth(Tan, 0.06);
  P.set(sP); L.set(sL);
  for (let i = 0; i < m; i++) F[i] = (Math.atan(sF[i]) * 360) / Math.PI;
}

// ---- what is in the right hand: position and direction of the blade, turned no more than it has to
function bakeProp(F, A, n) {
  const dir = A.path('pto');
  const d = dir ? smooth(dir.p, 0.03, 3) : null;
  const pos = new Float32Array(n * 3), quat = new Float32Array(n * 4);
  const q = new THREE.Quaternion(), last = new THREE.Vector3(0, 1, 0), now = new THREE.Vector3(), pH = new THREE.Vector3(), pF = new THREE.Vector3(), st = new THREE.Quaternion();
  let on = false;
  for (let i = 0; i < n; i++) {
    A.getQ(B.rfore, i, _q);
    A.getP(B.rfore, i, pF); A.getP(B.rhand, i, pH);
    _a.set(0, -A2, 0).applyQuaternion(_q).add(pF);
    pos[i * 3] = _a.x; pos[i * 3 + 1] = _a.y; pos[i * 3 + 2] = _a.z;
    if (d) now.set(d[i * 3], d[i * 3 + 1], d[i * 3 + 2]).sub(_a); else now.subVectors(pH, pF);
    if (now.lengthSq() < 1e-6) now.copy(last); else now.normalize();
    if (!on) { q.setFromUnitVectors(UP, now); on = true; } else { st.setFromUnitVectors(last, now); q.premultiply(st).normalize(); }
    last.copy(now);
    quat[i * 4] = q.x; quat[i * 4 + 1] = q.y; quat[i * 4 + 2] = q.z; quat[i * 4 + 3] = q.w;
  }
  // stuck into him from here on
  const stick = F.events.find((e) => e[1] === 'stick');
  if (stick) {
    const b = REF[stick[2].slice(2)], T = stick[2][0] === 'v' ? A.ctx.v : A;
    for (let i = Math.round(stick[0] * HZ); i < n; i++) {
      T.getQ(b, i, _q); T.getP(b, i, _a);
      _b.set(stick[3], stick[4], stick[5]).applyQuaternion(_q).add(_a);
      pos[i * 3] = _b.x; pos[i * 3 + 1] = _b.y; pos[i * 3 + 2] = _b.z;
      quat[i * 4] = _q.x; quat[i * 4 + 1] = _q.y; quat[i * 4 + 2] = _q.z; quat[i * 4 + 3] = _q.w;
    }
  }
  return { pos, quat };
}

// ---- the gun: where the grip is and how it is turned, both in the chest of the one holding it
function bakeGun(A, n) {
  const grip = new Float32Array(n * 3), quat = new Float32Array(n * 4);
  const q = new THREE.Quaternion(), last = new THREE.Vector3(), now = new THREE.Vector3(), st = new THREE.Quaternion(), g = new THREE.Vector3(), up = new THREE.Vector3(), qI = new THREE.Quaternion(), pC = new THREE.Vector3(), qW = new THREE.Quaternion();
  let on = false;
  for (let i = 0; i < n; i++) {
    g.set(A.gat[i * 3], A.gat[i * 3 + 1], A.gat[i * 3 + 2]);
    now.set(A.gaim[i * 3], A.gaim[i * 3 + 1], A.gaim[i * 3 + 2]).sub(g).normalize();
    if (!on) { _m.lookAt(g, _a.addVectors(g, now), UP); qW.setFromRotationMatrix(_m); on = true; }
    else {
      st.setFromUnitVectors(last, now); qW.premultiply(st).normalize();
      // and back upright, as far as it doesn't point straight up or down
      _m.lookAt(g, _a.addVectors(g, now), UP);
      q.setFromRotationMatrix(_m);
      qW.slerp(q, 0.08 * (1 - Math.abs(now.y)));
    }
    last.copy(now);
    A.getQ(B.chest, i, _q); A.getP(B.chest, i, pC); qI.copy(_q).invert();
    up.copy(g).sub(pC).applyQuaternion(qI);
    grip[i * 3] = up.x; grip[i * 3 + 1] = up.y; grip[i * 3 + 2] = up.z;
    _q.copy(qI).multiply(qW);
    quat[i * 4] = _q.x; quat[i * 4 + 1] = _q.y; quat[i * 4 + 2] = _q.z; quat[i * 4 + 3] = _q.w;
  }
  return { grip, quat };
}
