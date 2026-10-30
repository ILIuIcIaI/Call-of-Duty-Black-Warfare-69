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
export const JOINTS = [B.pelvis, B.spine, B.chest, B.head, B.lthigh, B.lknee, B.lfoot, B.rthigh, B.rknee, B.rfoot, B.lupper, B.lfore, B.rupper, B.rfore];
export const PARENT = [-1, 0, 1, 2, 0, 4, 5, 0, 7, 8, 2, 10, 11, 2, 13, 14];

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3(), _g = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _eu = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const quint = (u) => u * u * u * (u * (u * 6 - 15) + 10);
const noise = (t, s) => Math.sin(t * 1.7 + s) * 0.5 + Math.sin(t * 3.3 + s * 2.1) * 0.3 + Math.sin(t * 7.9 + s * 3.7) * 0.2;

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
  if (shoulder) shoulder.copy(_s);
  _n.set(tx, ty, tz).sub(_s);
  d = _n.length();
  if (d < 0.26) { const k = 1 - sstep(0.1, 0.26, d); _n.y -= 0.05 * k; _n.z -= 0.07 * k; d = _n.length(); }
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
  channels(kicks = {}) {
    const { keys, n, ch, seed } = this;
    const get = (name, c, sigma, def) => { const a = sampleCurve(keys, name, c, n, def); return sigma ? smooth(a, sigma) : a; };
    for (let c = 0; c < 3; c++) { ch['p' + c] = get('p', c, 0.04); ch['r' + c] = get('r', c, 0.045); }
    ch.rt = get('rt', undefined, 0.045);
    ch.j = get('j', undefined, 0.09);
    ch.two = get('two', undefined, 0.05);
    ch.kt = get('kt', undefined, 0.03, 1); ch.ka = get('ka', undefined, 0.03, 1); ch.kl = get('kl', undefined, 0.03, 1); ch.kh = get('kh', undefined, 0.03, 1);
    // what the hips do reaches the chest later and the head last, and a little too far
    const ax = deriv(deriv(ch.p0)), az = deriv(deriv(ch.p2)), yawV = deriv(ch.r1), yawA = deriv(yawV);
    const fwd = new Float32Array(n), side = new Float32Array(n), turn = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const y = ch.r1[i], fx = -Math.sin(y), fz = -Math.cos(y);
      fwd[i] = -(ax[i] * fx + az[i] * fz) / 9.81; side[i] = (ax[i] * -fz + az[i] * fx) / 9.81; turn[i] = -yawA[i] / 40;
    }
    const lag = { s: [0.01, 2.5, 0.62, 0.05, 0.02, 0.04], c: [0.02, 2.3, 0.52, 0.08, 0.03, 0.06], h: [0.035, 2.9, 0.44, 0.12, 0.05, 0.08] };
    const sF = smooth(fwd, 0.03), sS = smooth(side, 0.03), sT = smooth(turn, 0.03);
    let phase = 0;
    const ph = new Float32Array(n);
    for (let i = 0; i < n; i++) { phase += DT * (1 + ch.j[i] * 2.6); ph[i] = phase; }
    for (const part of ['s', 'c', 'h']) {
      const [delay, f, z, gP, gY, gR] = lag[part];
      const shift = (a) => { const o = new Float32Array(n), d = Math.round(delay * HZ); for (let i = 0; i < n; i++) o[i] = a[Math.max(0, i - d)]; return o; };
      for (const [nm, force, gain, kind] of [['p', sF, gP, 0], ['y', sT, gY, 1], ['z', sS, gR, 2]]) {
        const name = part + nm, base = shift(get(name, undefined, 0.045));
        const sp = spring(n, f, z, force, gain, kicks[name]);
        const out = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const J = ch.j[i], tt = i * DT;
          // nobody ever holds perfectly still, and someone fighting for air even less so
          const small = noise(tt * 0.9, seed + kind * 3 + part.charCodeAt(0)) * (part === 'h' ? 0.016 : 0.009);
          const shake = noise(ph[i] * 2.2, seed + kind + part.charCodeAt(0) * 0.7) * J * (part === 'h' ? 0.07 : part === 'c' ? 0.05 : 0.02);
          out[i] = base[i] + sp[i] + small + shake;
        }
        ch[name] = out;
      }
    }
    // hips and pelvis breathe as well
    for (let i = 0; i < n; i++) {
      ch.p1[i] += Math.sin(i * DT * 1.6 + seed) * 0.004;
      ch.r1[i] += noise(i * DT * 0.5, seed + 9) * 0.008;
    }
  }

  // ---- the feet: planted until they have to go, then a real step, one after the other
  feet() {
    const { keys, n, ch } = this;
    const yawAt = (t) => ch.r1[clamp(Math.round(t * HZ), 0, n - 1)];
    const lists = ['l', 'r'].map((f) => keys.filter((k) => k[f + 'f']).map((k) => ({ t: k.t, x: k[f + 'f'][0], y: k[f + 'f'][1], z: k[f + 'f'][2], yaw: k[f + 'fy'] !== undefined ? k[f + 'fy'] : yawAt(k.t), lift: k[f + 'fl'], dur: k[f + 'fd'], lead: k.lead })));
    const ground = (k) => k.y < 0.07;
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
        const sx = ch[nm + 'x'][i], sy = ch[nm + 'y'][i], sz = ch[nm + 'z'][i], yaw = ch[nm + 'yaw'][i];
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
  path(name, contactOf) {
    const K = this.keys.filter((k) => k[name]);
    const n = this.n;
    if (!K.length) return null;
    const out = new Float32Array(n * 3), c = new Float32Array(n), p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), p3 = new THREE.Vector3();
    let j = 0;
    for (let i = 0; i < n; i++) {
      const t = i * DT;
      while (j < K.length - 2 && K[j + 1].t <= t) j++;
      const a = K[Math.max(0, j - 1)], s = K[j], e = K[Math.min(K.length - 1, j + 1)], d = K[Math.min(K.length - 1, j + 2)];
      this.point(a[name], i, p0); this.point(s[name], i, p1); this.point(e[name], i, p2); this.point(d[name], i, p3);
      out[i * 3] = hermite(a.t, s.t, e.t, d.t, p0.x, p1.x, p2.x, p3.x, t);
      out[i * 3 + 1] = hermite(a.t, s.t, e.t, d.t, p0.y, p1.y, p2.y, p3.y, t);
      out[i * 3 + 2] = hermite(a.t, s.t, e.t, d.t, p0.z, p1.z, p2.z, p3.z, t);
      if (contactOf) c[i] = contactOf(s[name]) && (t < e.t ? contactOf(e[name]) : true) ? 1 : 0;
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
    const paths = [this.path('lh', isContact), this.path('rh', isContact)];
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
          const nA = ch.j[i] * 0.03;
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
  const p = mk(), o = mk(), key0 = mk(), key1 = mk(), key = mk(), keyV = mk(), tg = mk(), tv = mk(), pre = mk();
  for (let j = 0; j < 16; j++) { T.joint(j, s0 - 1, p[j]); T.joint(j, s0 - 2, o[j]); o[j].lerpVectors(p[j], o[j], 0.5); } // o: half a sample back = one substep
  const R = restPose(), rest = STICKS.map(([a, b]) => R[a].distanceTo(R[b]));
  const legLen = L1 + L2, armLen = A1 + FORE;
  const MINS = [[4, 8, legLen * 0.36], [5, 9, legLen * 0.36], [10, 14, armLen * 0.3], [11, 15, armLen * 0.3], [3, 0, R[3].distanceTo(R[0]) * 0.72], [6, 1, R[6].distanceTo(R[1]) * 0.38], [7, 1, R[7].distanceTo(R[1]) * 0.38], [14, 0, 0.18], [15, 0, 0.18], [8, 9, 0.12], [6, 7, 0.14]];
  const md = MINS.map(([a, b, m]) => Math.min(m, p[a].distanceTo(p[b])));
  const S = new Float32Array(n * 48);
  const w = new Float32Array(16), locked = new Uint8Array(16), rc = new THREE.Quaternion(), rp = new THREE.Quaternion(), fk = new THREE.Quaternion(), fs = new THREE.Quaternion();
  const h = DT / 2, GRAV = -11.5;
  let pi = 0, still = 0;
  for (let i = s0; i < n; i++) {
    for (let j = 0; j < 16; j++) { T.joint(j, i - 1, key0[j]); T.joint(j, i, key1[j]); }
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
        // what is nearly at rest comes to rest
        const sp = Math.hypot(vx, vy, vz), damp = sp < 0.25 ? 0.975 : 0.9975;
        oj.copy(pj);
        pj.x += vx * h * damp + fx * h * h; pj.y += vy * h * damp + fy * h * h; pj.z += vz * h * damp + fz * h * h;
      }
      for (let j = 0; j < 16; j++) if (locked[j]) { o[j].copy(p[j]); p[j].copy(tg[j]); }
      // knocks
      while (pi < pushes.length && pushes[pi][0] <= i * DT) {
        const [, parts, dx, dy, dz] = pushes[pi++];
        for (const j of parts) if (!locked[j]) o[j].add(_a.set(dx, dy, dz).multiplyScalar(-h));
      }
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
          const pa = p[A], pb = p[Z], dx = pb.x - pa.x, dy = pb.y - pa.y, dz = pb.z - pa.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6, diff = (d - len) / (d * (wa + wb));
          pa.x += dx * diff * wa; pa.y += dy * diff * wa; pa.z += dz * diff * wa;
          pb.x -= dx * diff * wb; pb.y -= dy * diff * wb; pb.z -= dz * diff * wb;
        }
        for (let q = 0; q < MINS.length; q++) {
          const [A, Z, m] = MINS[q], wa = w[A], wb = w[Z];
          const pa = p[A], pb = p[Z], dx = pb.x - pa.x, dy = pb.y - pa.y, dz = pb.z - pa.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          // whatever folded it this far was the keys: it opens again slowly, it doesn't spring open
          if (it === 0) md[q] = wa === 0 || wb === 0 ? Math.min(m, d) : Math.min(m, md[q] + 0.25 * h);
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
  const qP = new THREE.Quaternion(), qC = new THREE.Quaternion(), qS = new THREE.Quaternion(), qH = new THREE.Quaternion(), dP = new THREE.Quaternion(), dC = new THREE.Quaternion(), fk = new THREE.Quaternion(), tmp = new THREE.Quaternion(), tmp2 = new THREE.Quaternion(), lS = new THREE.Quaternion(), lC = new THREE.Quaternion();
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
    _q.identity().slerp(diff, 0.5);
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
  A.channels(F.ak || {}); V.channels(F.vk || {});
  A.feet(); V.feet();
  A.fk(); V.fk();
  A.arms('a'); V.arms('v');
  const pushes = (F.push || []).slice().sort((x, y) => x[0] - y[0]);
  simulate(V, pushes);
  // the hands that hold on to him follow him, and the hands that hold on to the attacker
  A.arms('a');
  if (V.simFrom !== undefined) contactFix(V);
  groundFix(V); groundFix(A);
  const clip = { n, hz: HZ, dur: F.dur, a: packBody(A), v: packBody(V), cam: bakeCamera(F, A, n), room: roomOf(A, V, n) };
  if (F.prop) clip.prop = bakeProp(F, A, n);
  if (A.gat) clip.gun = bakeGun(A, n);
  if (opts.debug) clip.debug = { A, V };
  return clip;
}

// the victim's hands on the attacker after he went loose
function contactFix(V) {
  const { n, ch } = V;
  const qC = new THREE.Quaternion(), pC = new THREE.Vector3(), tg = new THREE.Vector3(), qU = new THREE.Quaternion(), qF = new THREE.Quaternion(), sh = new THREE.Vector3(), qI = new THREE.Quaternion();
  const isA = (s) => typeof s[0] === 'string' && s[0][0] === 'a';
  for (let f = 0; f < 2; f++) {
    const P = V.path(f ? 'rh' : 'lh', isA);
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
    for (let i = 0, k = 0; i < L; i++) { while (k < list.length - 1 && list[k + 1].t <= (i + i0) * DT) k++; crop[i] = list[k].crop ? 1 : 0; }
    director(A, list[0].only, sp, sl, sf, i0, crop);
    pos.set(sp, i0 * 3); look.set(sl, i0 * 3); fov.set(sf, i0);
  }
  return { pos, look, fov, cuts: seg.slice(1).map((s) => s[0]) };
}

// ---- whatever way the camera was told to go: it pans and opens just far enough to keep everybody between the black
// bars, it stands back if it has to, and it does all that as slowly as if it had seen it coming.
const SAFE_Y = 0.71, SAFE_X = 0.9, ASPECT = 16 / 9, FOV_MAX = 50;
function director(A, only, P, L, F, i0, crop) {
  const V = A.ctx.v, m = F.length;
  const subj = [[A, B.head, 0.2], [A, B.rhand, 0], [A, B.lfoot, 0, 1], [A, B.rfoot, 0, 1]];
  if (only !== 'a') subj.push([V, B.head, 0.2], [V, B.pelvis, 0, 1], [V, B.lfoot, 0, 1], [V, B.rfoot, 0, 1]);
  const cp = new THREE.Vector3(), lk = new THREE.Vector3(), fw = new THREE.Vector3(), rg = new THREE.Vector3(), up = new THREE.Vector3(), v = new THREE.Vector3();
  let t0 = 0, t1 = 0, f0 = 0, f1 = 0;
  const frame = (i, back) => {
    cp.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); lk.set(L[i * 3], L[i * 3 + 1], L[i * 3 + 2]);
    fw.subVectors(lk, cp).normalize(); rg.crossVectors(fw, UP).normalize(); up.crossVectors(rg, fw);
    if (back) cp.addScaledVector(fw, -back);
    t0 = Infinity; t1 = -Infinity; f0 = Infinity; f1 = -Infinity;
    for (const [T, b, lift, low] of subj) {
      if (low && crop[i]) continue;
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
