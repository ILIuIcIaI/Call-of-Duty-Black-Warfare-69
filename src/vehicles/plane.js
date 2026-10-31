import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/math.js';

// =============================================================================
// The transport plane: a four-engine high-wing freighter with an open cargo ramp,
// in the same look as everything else: few polygons, shapes that are right, and the
// detail painted into small soft textures (panel lines, rivets, stencils, soot).
// Plane space: -Z = nose, +X = right wing, +Y up, in meters. The whole thing is scaled by SCALE.
// (Nothing in here may touch Math.random: a network match draws its world from it.)
// =============================================================================
const SCALE = 1.3;
const Z0 = -15.1, Z1 = 15.9, HW = 1024, HH = 256, GIRTH = 14.2;
const PX = HW / (Z1 - Z0), PY = HH / GIRTH;
const TOP = '#5a6148', TOP2 = '#4b5139', TOP3 = '#696a4d', BELLY = '#80867d', LINE = 'rgba(10,12,8,0.42)', LIT = 'rgba(255,255,240,0.08)';

// ---- [z, y of the center, half width, half height]: nose to tail. The top stays level, the belly sweeps up behind the ramp
const HULL = [
  [-15.0, -0.36, 0.04, 0.04], [-14.85, -0.36, 0.34, 0.33], [-14.5, -0.34, 0.66, 0.65], [-14.0, -0.31, 0.98, 0.97],
  [-13.4, -0.23, 1.3, 1.33], [-12.9, -0.13, 1.56, 1.6], [-12.2, -0.02, 1.82, 1.92], [-11.4, 0.07, 2.02, 2.16], [-10.4, 0.1, 2.14, 2.25],
  [-9, 0.08, 2.2, 2.28], [-6, 0.05, 2.22, 2.3], [-2, 0.05, 2.22, 2.3], [2, 0.05, 2.22, 2.3], [5, 0.05, 2.22, 2.3],
  [6.5, 0.16, 2.2, 2.19], [8, 0.38, 2.1, 1.97], [9.5, 0.66, 1.93, 1.69], [11, 0.95, 1.68, 1.4], [12.5, 1.22, 1.35, 1.12],
  [13.8, 1.45, 0.98, 0.86], [14.9, 1.64, 0.6, 0.6], [15.5, 1.74, 0.3, 0.34], [15.8, 1.8, 0.05, 0.06],
];
const RAMP_Z = [6.5, 12.5]; // where the belly is open

function ringAt(z, yc, rx, ry, N = 24, x0 = 0, p = 2.25) {
  const r = [];
  for (let j = 0; j < N; j++) {
    const a = (j / N) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
    r.push([x0 + rx * Math.sign(s) * Math.pow(Math.abs(s), 2 / p), yc - ry * Math.sign(c) * Math.pow(Math.abs(c), 2 / p), z]);
  }
  return r;
}

// A skin over rings of points, closed around. o.us: u per ring, o.vs(j, m): v per point, o.skip(i, j): a hole.
function loft(rings, o = {}) {
  const n = rings.length, m = rings[0].length, M = m + 1, pos = [], uv = [], idx = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < M; j++) {
    const p = rings[i][j % m];
    pos.push(p[0], p[1], p[2]);
    uv.push(o.us ? o.us[i] : i / (n - 1), o.vs ? o.vs(j, m) : j / m);
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < m; j++) {
    if (o.skip && o.skip(i, j)) continue;
    const a = i * M + j, b = a + M;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  // inside out? then the other way around
  let vol = 0, cx = 0, cy = 0, cz = 0;
  for (let k = 0; k < pos.length; k += 3) { cx += pos[k]; cy += pos[k + 1]; cz += pos[k + 2]; }
  const N = pos.length / 3; cx /= N; cy /= N; cz /= N;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  for (let k = 0; k < idx.length; k += 3) {
    A.set(pos[idx[k] * 3] - cx, pos[idx[k] * 3 + 1] - cy, pos[idx[k] * 3 + 2] - cz);
    B.set(pos[idx[k + 1] * 3] - cx, pos[idx[k + 1] * 3 + 1] - cy, pos[idx[k + 1] * 3 + 2] - cz);
    C.set(pos[idx[k + 2] * 3] - cx, pos[idx[k + 2] * 3 + 1] - cy, pos[idx[k + 2] * 3 + 2] - cz);
    vol += A.dot(B.cross(C));
  }
  if (vol < 0) for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // both ends of a ring are the same place: one normal, no seam
  const nr = g.attributes.normal;
  for (let i = 0; i < n; i++) {
    const a = i * M, b = a + m, x = nr.getX(a) + nr.getX(b), y = nr.getY(a) + nr.getY(b), z = nr.getZ(a) + nr.getZ(b), L = Math.hypot(x, y, z) || 1;
    nr.setXYZ(a, x / L, y / L, z / L); nr.setXYZ(b, x / L, y / L, z / L);
  }
  return g;
}

// Half thickness of a wing section at s (0 leading edge .. 1 trailing edge)
const halfT = (s, t) => 5 * t * (0.2969 * Math.sqrt(s) - 0.126 * s - 0.3516 * s * s + 0.2843 * s * s * s - 0.1036 * s * s * s * s);
const S_TOP = [1, 0.82, 0.62, 0.42, 0.26, 0.13, 0.05, 0.012], S_BOT = [0.012, 0.05, 0.13, 0.26, 0.42, 0.62, 0.82];
// trailing edge, over the top to the leading edge, back along the bottom. put(s, h): s along the chord, h off the middle line
function section(put, t, under = 0.75) {
  const r = [];
  for (const s of S_TOP) r.push(put(s, halfT(s, t)));
  r.push(put(0, 0));
  for (const s of S_BOT) r.push(put(s, -halfT(s, t) * under));
  return r;
}

function box(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) g.rotateZ(rz).rotateX(rx).rotateY(ry);
  return g.translate(x, y, z);
}
function tube(r0, r1, len, x, y, z, seg = 8) { return new THREE.CylinderGeometry(r0, r1, len, seg).rotateX(Math.PI / 2).translate(x, y, z); }

// ---------------------------------------------------------------- the paint
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function toTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4;
  return t;
}
// patches of a second and third green over the base, soft at the edge
function camo(x, R, x0, y0, w, h, n, size) {
  x.save();
  x.beginPath(); x.rect(x0, y0, w, h); x.clip();
  x.filter = 'blur(1.5px)';
  for (let i = 0; i < n; i++) {
    x.fillStyle = R() < 0.5 ? TOP2 : TOP3;
    const cx = x0 + R() * w, cy = y0 + R() * h, pts = 7, a0 = R() * 6.28, rw = size * (0.5 + R()), rh = size * (0.3 + R() * 0.6);
    x.beginPath();
    for (let k = 0; k < pts; k++) { const a = a0 + (k / pts) * 6.283, q = 0.65 + R() * 0.6; x[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rw * q, cy + Math.sin(a) * rh * q); }
    x.closePath(); x.fill();
  }
  x.restore();
}
function grime(x, R, W, H, n) {
  for (let i = 0; i < n; i++) {
    x.fillStyle = R() < 0.6 ? `rgba(0,0,0,${0.03 + R() * 0.07})` : `rgba(255,255,235,${0.02 + R() * 0.05})`;
    x.fillRect(R() * W, R() * H, 1 + R() * 2.4, 1 + R() * 1.4);
  }
}
function badge(x, r, ry) {
  // the unit's badge: a dark disc, a pale ring, the 69 of the name
  x.fillStyle = '#161816'; x.beginPath(); x.ellipse(0, 0, r, ry, 0, 0, 6.283); x.fill();
  x.strokeStyle = '#c9c7b4'; x.lineWidth = Math.max(1, r * 0.1); x.beginPath(); x.ellipse(0, 0, r * 0.82, ry * 0.82, 0, 0, 6.283); x.stroke();
  x.save(); x.scale(1, ry / r);
  x.fillStyle = '#d9b64a'; x.font = `bold ${r * 1.05}px Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('69', 0, r * 0.05);
  x.restore();
}

function paintHull() {
  const c = canvas(HW, HH), x = c.getContext('2d'), R = mulberry32(6901);
  const hx = (z) => (z - Z0) * PX, hy = (h, side) => (side > 0 ? HH - (h * HH) / 2 : (h * HH) / 2); // h: 0 keel .. 1 spine, side: +1 right, -1 left
  // ---- the belly lighter, the back in green
  const g = x.createLinearGradient(0, 0, 0, HH);
  g.addColorStop(0, BELLY); g.addColorStop(0.17, BELLY); g.addColorStop(0.2, TOP); g.addColorStop(0.8, TOP); g.addColorStop(0.83, BELLY); g.addColorStop(1, BELLY);
  x.fillStyle = g; x.fillRect(0, 0, HW, HH);
  camo(x, R, 0, HH * 0.2, HW, HH * 0.6, 46, 44);
  // ---- plates, each its own shade of tired
  for (let z = -14; z < 15.6; z += 1.3) for (let b = 0; b < 8; b++) {
    if (R() < 0.45) continue;
    x.fillStyle = R() < 0.55 ? `rgba(0,0,0,${0.02 + R() * 0.05})` : `rgba(255,255,230,${0.015 + R() * 0.035})`;
    x.fillRect(hx(z), (b / 8) * HH, 1.3 * PX, HH / 8);
  }
  // ---- frames around the hull, stringers along it, rivets on the frames
  for (let z = -13.8; z < 15.6; z += 1.3) {
    const X = Math.round(hx(z));
    x.fillStyle = LINE; x.fillRect(X, 0, 1, HH);
    x.fillStyle = LIT; x.fillRect(X + 1, 0, 1, HH);
    x.fillStyle = 'rgba(0,0,0,0.2)';
    for (let y = 2; y < HH; y += 7) x.fillRect(X + 3, y, 1, 1);
  }
  for (const h of [0.14, 0.3, 0.46, 0.62, 0.78, 0.92]) for (const s of [1, -1]) {
    const Y = Math.round(hy(h, s));
    x.fillStyle = LINE; x.fillRect(hx(-13.8), Y, hx(15.2) - hx(-13.8), 1);
    x.fillStyle = LIT; x.fillRect(hx(-13.8), Y + 1, hx(15.2) - hx(-13.8), 1);
  }
  grime(x, R, HW, HH, 2600);
  // ---- oil and exhaust running back along the lower hull
  for (let i = 0; i < 60; i++) {
    const z = -6 + R() * 14, h = 0.05 + R() * 0.3, s = R() < 0.5 ? 1 : -1;
    x.fillStyle = `rgba(0,0,0,${0.04 + R() * 0.09})`;
    x.fillRect(hx(z), hy(h, s), 20 + R() * 90, 1 + R() * 1.6);
  }
  // ---- nose: radome, the black panel against the glare
  x.fillStyle = '#2d312e'; x.fillRect(0, 0, hx(-13.95), HH);
  x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(hx(-13.95), 0, 2, HH);
  x.fillStyle = '#1c1f1b'; x.fillRect(hx(-13.95), hy(0.68, 1), hx(-12.85) - hx(-13.95), hy(0.68, -1) - hy(0.68, 1));
  // ---- glass
  const pane = (z0, z1, h0, h1, s) => {
    const X = hx(z0), W = hx(z1) - X, a = hy(h0, s), b = hy(h1, s), Y = Math.min(a, b), H = Math.abs(a - b);
    const q = x.createLinearGradient(X, 0, X + W, 0); q.addColorStop(0, '#46606d'); q.addColorStop(0.5, '#1d2a31'); q.addColorStop(1, '#101a1f');
    x.fillStyle = q; x.fillRect(X, Y, W, H);
    x.strokeStyle = '#23261f'; x.lineWidth = 1.6; x.strokeRect(X + 0.5, Y + 0.5, W - 1, H - 1);
  };
  for (const s of [1, -1]) {
    pane(-12.75, -11.65, 0.67, 0.77, s); pane(-12.75, -11.65, 0.78, 0.87, s); pane(-12.75, -11.65, 0.88, 0.97, s); // windshield
    pane(-11.55, -10.75, 0.64, 0.8, s); pane(-10.65, -10.05, 0.66, 0.78, s); // side windows
    pane(-11.5, -10.6, 0.84, 0.92, s); // eyebrow
    pane(-13.3, -12.75, 0.4, 0.52, s); pane(-13.3, -12.75, 0.53, 0.63, s); // down by the feet
    // doors: the crew's up front, the jump door at the back
    for (const [z0, z1, h0, h1] of [[-9.8, -8.8, 0.3, 0.63], [5.0, 6.2, 0.29, 0.66]]) {
      x.strokeStyle = 'rgba(8,10,6,0.75)'; x.lineWidth = 1.6;
      const a = hy(h0, s), b = hy(h1, s); x.strokeRect(hx(z0), Math.min(a, b), hx(z1) - hx(z0), Math.abs(a - b));
      x.fillStyle = '#c9b23c'; x.fillRect(hx(z1) - 6, Math.min(a, b) + Math.abs(a - b) * 0.55, 4, 2);
    }
    pane(-9.5, -9.1, 0.5, 0.58, s); pane(5.4, 5.8, 0.5, 0.59, s);
    // portholes along the hold
    for (const z of [-7, -4.6, -1.4, 1.8, 4]) {
      const X = hx(z), Y = hy(0.63, s);
      x.fillStyle = '#23261f'; x.beginPath(); x.ellipse(X, Y, 6.6, 4.4, 0, 0, 6.283); x.fill();
      x.fillStyle = '#1a2830'; x.beginPath(); x.ellipse(X, Y, 4.8, 3.1, 0, 0, 6.283); x.fill();
      x.fillStyle = 'rgba(160,200,215,0.45)'; x.fillRect(X - 2, Y - 1, 2, 1);
    }
    // main gear doors on the sponsons, the warning line where the propellers turn
    x.strokeStyle = 'rgba(8,10,6,0.6)'; x.lineWidth = 1;
    { const a = hy(0.08, s), b = hy(0.27, s); x.strokeRect(hx(-2.6), Math.min(a, b), hx(2.8) - hx(-2.6), Math.abs(a - b)); }
    { const a = hy(0.25, s), b = hy(0.86, s); x.fillStyle = '#7d2a20'; x.fillRect(hx(-6.1), Math.min(a, b), 3, Math.abs(a - b)); }
    // ---- the paint job: the words read the right way on either side
    const text = (t, z, h, size, col) => {
      x.save(); x.translate(hx(z), hy(h, s)); x.scale(s > 0 ? -1 : 1, (s > 0 ? 1 : -1) * (PY / PX));
      x.font = `bold ${size}px Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = col; x.fillText(t, 0, 0); x.restore();
    };
    text('BLACK WARFARE', -0.8, 0.78, 25, '#14160f');
    text('BW-069', 8.9, 0.74, 21, '#14160f');
    text('EINSTIEG', 5.6, 0.72, 7, '#c9b23c');
    text('NOTAUSSTIEG', -3, 0.53, 6, '#c9b23c');
    text('RETTUNG', -9.3, 0.68, 7, '#c9b23c');
    text('PROPELLER', -6.8, 0.36, 7, '#b5402f');
    x.save(); x.translate(hx(2.9), hy(0.8, s)); x.scale(s > 0 ? -1 : 1, s > 0 ? 1 : -1); badge(x, 19, 19 * (PY / PX)); x.restore();
  }
  // ---- soot around the ramp
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(0,0,0,${0.03 + R() * 0.06})`;
    const s = R() < 0.5 ? 1 : -1;
    x.fillRect(hx(11 + R() * 3), hy(R() * 0.5, s), 30 + R() * 40, 1 + R() * 2);
  }
  return toTexture(c);
}

function paintWing() {
  const W = 512, H = 256, c = canvas(W, H), x = c.getContext('2d'), R = mulberry32(6902);
  // the lower half is the top of the wing, the upper half its underside, the leading edge runs along the middle
  x.fillStyle = BELLY; x.fillRect(0, 0, W, H / 2);
  x.fillStyle = TOP; x.fillRect(0, H / 2, W, H / 2);
  camo(x, R, 0, H / 2, W, H / 2, 20, 34);
  for (let u = 0; u < W; u += 30) for (let b = 0; b < 8; b++) {
    if (R() < 0.5) continue;
    x.fillStyle = R() < 0.55 ? `rgba(0,0,0,${0.02 + R() * 0.05})` : `rgba(255,255,230,${0.015 + R() * 0.04})`;
    x.fillRect(u, (b / 8) * H, 30, H / 8);
  }
  // plates along and across
  x.fillStyle = LINE;
  for (const v of [0.24, 0.38, 0.62, 0.76]) x.fillRect(0, H * v, W, 1);
  for (let u = 0; u < W; u += 30) x.fillRect(u, H * 0.2, 1, H * 0.6);
  x.fillStyle = 'rgba(0,0,0,0.18)';
  for (let u = 15; u < W; u += 30) for (let y = H * 0.2; y < H * 0.8; y += 6) x.fillRect(u, y, 1, 1);
  // flaps and ailerons along the trailing edge, on top and below
  for (const [y0, y1] of [[H * 0.84, H], [0, H * 0.16]]) {
    x.fillStyle = 'rgba(0,0,0,0.13)'; x.fillRect(0, y0, W, y1 - y0);
    x.fillStyle = 'rgba(0,0,0,0.65)'; x.fillRect(0, y0 < 1 ? y1 - 1 : y0, W * 0.97, 2);
    x.fillRect(W * 0.62, y0, 2, y1 - y0); x.fillRect(W * 0.96, y0, 2, y1 - y0);
    x.fillStyle = 'rgba(0,0,0,0.3)'; for (let u = 12; u < W * 0.96; u += 24) x.fillRect(u, y0, 1, y1 - y0);
  }
  // the worn metal strip along the leading edge
  x.fillStyle = '#92978e'; x.fillRect(0, H * 0.465, W, H * 0.07);
  x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(0, H * 0.465, W, 1); x.fillRect(0, H * 0.534, W, 1);
  for (let u = 40; u < W; u += 58) x.fillRect(u, H * 0.465, 1, H * 0.07);
  grime(x, R, W, H, 1400);
  // soot behind the engines, on top
  const flat = (bx) => ((bx - 2) / 18.6) * W;
  for (const bx of [5.4, 10.9]) {
    const q = x.createLinearGradient(0, H * 0.6, 0, H); q.addColorStop(0, 'rgba(10,10,8,0)'); q.addColorStop(0.35, 'rgba(10,10,8,0.5)'); q.addColorStop(1, 'rgba(10,10,8,0.22)');
    x.fillStyle = q; x.fillRect(flat(bx) - 10, H * 0.6, 20, H * 0.4);
  }
  // don't step here, fuel caps, the badge
  x.strokeStyle = 'rgba(10,10,8,0.6)'; x.lineWidth = 1; x.strokeRect(4, H * 0.58, W * 0.14, H * 0.2);
  x.fillStyle = '#1a1c18'; for (const u of [0.32, 0.56, 0.78]) { x.beginPath(); x.ellipse(W * u, H * 0.66, 3.4, 2.4, 0, 0, 6.283); x.fill(); }
  x.save(); x.translate(W * 0.72, H * 0.72); badge(x, 20, 15); x.restore();
  x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(W * 0.975, 0, W * 0.025, H);
  return toTexture(c);
}

function paintFin() {
  const W = 512, H = 256, c = canvas(W, H), x = c.getContext('2d'), R = mulberry32(6903);
  // across: root to tip. Down the canvas: from the trailing edge on the left side over the leading edge to the one on the right
  x.fillStyle = TOP; x.fillRect(0, 0, W, H);
  camo(x, R, 0, 0, W, H, 16, 40);
  for (let u = 0; u < W; u += 40) for (let b = 0; b < 8; b++) {
    if (R() < 0.5) continue;
    x.fillStyle = R() < 0.55 ? `rgba(0,0,0,${0.02 + R() * 0.05})` : `rgba(255,255,230,${0.015 + R() * 0.04})`;
    x.fillRect(u, (b / 8) * H, 40, H / 8);
  }
  x.fillStyle = LINE;
  for (let u = 40; u < W; u += 40) x.fillRect(u, 0, 1, H);
  for (const v of [0.34, 0.42, 0.58, 0.66]) x.fillRect(0, H * v, W, 1);
  // the rudder
  for (const y of [H * 0.17, H * 0.83]) { x.fillStyle = 'rgba(0,0,0,0.7)'; x.fillRect(W * 0.12, y, W * 0.88, 2); }
  x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(W * 0.12, 0, W * 0.88, H * 0.17); x.fillRect(W * 0.12, H * 0.83, W * 0.88, H * 0.17);
  x.fillStyle = 'rgba(0,0,0,0.3)'; for (let u = W * 0.16; u < W; u += 26) { x.fillRect(u, 0, 1, H * 0.17); x.fillRect(u, H * 0.83, 1, H * 0.17); }
  // a worn leading edge, and a dark tip with a pale line
  x.fillStyle = '#92978e'; x.fillRect(0, H * 0.48, W, H * 0.04);
  x.fillStyle = '#1b1d1a'; x.fillRect(W * 0.88, 0, W * 0.12, H);
  x.fillStyle = '#c9c7b4'; x.fillRect(W * 0.86, 0, W * 0.012, H);
  grime(x, R, W, H, 1200);
  // what is painted on it reads the right way from both sides
  const on = (y, fn) => { x.save(); x.transform(0, -1, -1, 0, W * 0.5, y); x.scale(1, 2.5); fn(); x.restore(); };
  for (const y of [H * 0.71, H * 0.29]) {
    on(y, () => badge(x, 25, 25));
    x.save(); x.transform(0, -1, -1, 0, W * 0.2, y); x.scale(1, 2.5);
    x.font = 'bold 15px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#14160f'; x.fillText('BW-069', 0, 0);
    x.restore();
  }
  return toTexture(c);
}

function paintEngine() {
  const W = 256, H = 64, c = canvas(W, H), x = c.getContext('2d'), R = mulberry32(6904);
  x.fillStyle = TOP; x.fillRect(0, 0, W, H);
  camo(x, R, 0, 0, W, H, 8, 22);
  x.fillStyle = LINE;
  for (const u of [0.07, 0.26, 0.45, 0.62, 0.8]) x.fillRect(W * u, 0, 1, H);
  for (const v of [0.12, 0.36, 0.64, 0.88]) x.fillRect(W * 0.07, H * v, W * 0.73, 1);
  x.fillStyle = 'rgba(0,0,0,0.35)'; for (let y = 6; y < H; y += 8) x.fillRect(W * 0.3, y, 18, 2); // the louvers
  x.fillStyle = '#2a2c28'; x.fillRect(0, 0, W * 0.07, H);
  grime(x, R, W, H, 300);
  const q = x.createLinearGradient(W * 0.55, 0, W, 0); q.addColorStop(0, 'rgba(8,8,6,0)'); q.addColorStop(1, 'rgba(8,8,6,0.72)');
  x.fillStyle = q; x.fillRect(W * 0.55, H * 0.2, W * 0.45, H * 0.6);
  return toTexture(c);
}

function paintHold() {
  const W = 256, H = 128, c = canvas(W, H), x = c.getContext('2d');
  // the hold, seen from outside through the ramp: red light, ribs, webbing seats along the walls
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0c0605'); g.addColorStop(0.3, '#23100d'); g.addColorStop(0.5, '#3f1612'); g.addColorStop(0.7, '#23100d'); g.addColorStop(1, '#0c0605');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(0,0,0,0.55)'; for (let u = 0; u < W; u += 14) x.fillRect(u, 0, 4, H);
  x.fillStyle = 'rgba(255,120,80,0.06)'; for (const v of [0.3, 0.7]) x.fillRect(0, H * v, W, 7);
  x.fillStyle = 'rgba(20,10,8,0.8)'; for (const v of [0.2, 0.8]) x.fillRect(0, H * v, W, 5);
  return toTexture(c);
}

function paintTread() {
  const c = canvas(64, 128), x = c.getContext('2d'), R = mulberry32(6905);
  x.fillStyle = '#3a3b37'; x.fillRect(0, 0, 64, 128);
  x.fillStyle = 'rgba(0,0,0,0.5)'; for (let y = 2; y < 128; y += 8) for (let u = (y % 16 ? 0 : 4); u < 64; u += 8) x.fillRect(u, y, 4, 2);
  grime(x, R, 64, 128, 200);
  x.fillStyle = '#b89a30'; x.fillRect(0, 0, 3, 128); x.fillRect(61, 0, 3, 128); x.fillRect(0, 0, 64, 3);
  return toTexture(c);
}

function paintBlur() {
  const c = canvas(128, 128), x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 8, 64, 64, 63);
  g.addColorStop(0, 'rgba(25,25,25,0.34)'); g.addColorStop(0.82, 'rgba(25,25,25,0.2)'); g.addColorStop(0.9, 'rgba(190,160,40,0.26)'); g.addColorStop(0.97, 'rgba(190,160,40,0.14)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return toTexture(c);
}

function paintGlow() {
  const c = canvas(32, 32), x = c.getContext('2d'), g = x.createRadialGradient(16, 16, 1, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  return toTexture(c);
}

// ---------------------------------------------------------------- the shapes
const wingLE = (x) => -3 + 0.1056 * (x - 2.2), wingTE = (x) => 1.9 - 0.033 * (x - 2.2), wingY = (x) => 2.48 + (x - 2.2) * 0.035;
const ENGINES = [5.4, 10.9], TANK_X = 8.15;

function buildKit() {
  const K = {};
  // ---- hull, with the belly open over the ramp
  const hu = HULL.map((s) => (s[0] - Z0) / (Z1 - Z0));
  const openBay = (rings) => (i, j) => { const z0 = rings[i][0][2]; return z0 >= RAMP_Z[0] && z0 < RAMP_Z[1] && (j < 5 || j >= 19); };
  const rings = HULL.map((s) => ringAt(s[0], s[1], s[2], s[3]));
  const parts = [loft(rings, { us: hu, skip: openBay(rings) })];
  // on top: the fairing the wing sits in, a dome for the radio, antennas
  const hump = [[-4.6, 0.04, 0.05], [-4.2, 0.9, 0.2], [-3.2, 1.55, 0.36], [-1, 1.8, 0.46], [1.5, 1.8, 0.44], [2.8, 1.45, 0.3], [3.6, 0.8, 0.14], [4, 0.04, 0.04]].map((r) => ringAt(r[0], 2.3, r[1], r[2], 12, 0, 2));
  parts.push(loft(hump, { us: [-4.6, -4.2, -3.2, -1, 1.5, 2.8, 3.6, 4].map((z) => (z - Z0) / (Z1 - Z0)), vs: () => 0.5 }));
  parts.push(new THREE.SphereGeometry(0.42, 8, 5).scale(1, 0.4, 1.8).translate(0, 2.34, -8.2));
  // sponsons along the belly: where the main gear lives
  for (const s of [1, -1]) {
    const st = [[-3.6, 0.1, 0.08], [-3.0, 0.5, 0.42], [-1.8, 0.72, 0.68], [0.4, 0.8, 0.76], [2.2, 0.72, 0.66], [3.4, 0.5, 0.4], [4.2, 0.1, 0.08]];
    parts.push(loft(st.map((r) => ringAt(r[0], -1.62, r[1], r[2], 12, s * 1.95, 2)), { us: st.map((r) => (r[0] - Z0) / (Z1 - Z0)), vs: (j, m) => 0.04 + 0.1 * Math.abs((j / m) * 2 - 1) }));
  }
  K.hull = mergeGeometries(parts.map((g) => (g.index ? g : g)));
  // ---- wings, both of them, with the tips rounded off
  const wings = [];
  for (const s of [1, -1]) {
    const st = [2, 3.5, 7, 12, 17, 19.5, 20.2, 20.55].map((x) => {
      const tip = x > 19.5 ? (x - 19.5) / 1.05 : 0, chord = (wingTE(x) - wingLE(x)) * (1 - tip * tip * 0.86), t = 0.165 - ((x - 2) / 18.6) * 0.055, le = wingLE(x) + ((wingTE(x) - wingLE(x)) - chord) * 0.45;
      return section((c, h) => [s * x, wingY(x) + h * chord * (1 - tip * 0.7) + 0.02 * chord * Math.sin(Math.PI * c), le + c * chord], t);
    });
    wings.push(loft(st, { us: [2, 3.5, 7, 12, 17, 19.5, 20.2, 20.55].map((x) => (x - 2) / 18.6) }));
    // the tailplane is cut from the same cloth
    const tp = [0.4, 2, 5.5, 7.8, 8.25].map((x) => {
      const le = 11.2 + x * 0.36, te = 16.1 - x * 0.03, tip = x > 7.8 ? 0.55 : 1, chord = (te - le) * tip;
      return section((c, h) => [s * x, 2.05 + x * 0.005 + h * chord, le + c * chord], 0.11, 0.9);
    });
    wings.push(loft(tp, { us: [0.1, 0.25, 0.5, 0.75, 0.8] }));
  }
  K.wings = mergeGeometries(wings);
  // ---- the fin, with its long fillet running forward along the spine
  const fs = [[2.05, 6.6, 15.3, 0.1], [2.5, 8.6, 15.2, 0.1], [3.1, 10.1, 15.15, 0.11], [5, 11.7, 15.2, 0.11], [7.4, 13.1, 15.6, 0.11], [8.5, 13.8, 15.75, 0.11], [8.75, 14.5, 15.65, 0.08]];
  K.fin = loft(fs.map(([y, le, te, t]) => section((c, h) => [h * (te - le), y, le + c * (te - le)], t, 1)), { us: fs.map((f) => (f[0] - 2.05) / 6.7) });
  // ---- engines: the long nacelle, a chin under the spinner, the exhaust on top, and the big tank between them
  const nac = [], nz = [[0, 0.32], [0.12, 0.47], [0.45, 0.6], [1.3, 0.69], [2.6, 0.71], [3.7, 0.69], [4.9, 0.56], [5.9, 0.36], [6.6, 0.1]];
  const dark = [], metal = [];
  K.props = [];
  for (const s of [1, -1]) for (const ex of ENGINES) {
    const x = s * ex, y = wingY(ex) - 0.5, z = wingLE(ex) - 2.5;
    nac.push(loft(nz.map(([d, r]) => ringAt(z + d, y, r, r * 1.14, 12, x, 2)), { us: nz.map((n) => n[0] / 6.6) }));
    // the chin intake: its lip, and the dark hole in it
    nac.push(loft([[0, 0.05, 0.03], [0.12, 0.26, 0.17], [0.6, 0.28, 0.2], [1.5, 0.2, 0.13], [2.2, 0.05, 0.03]].map(([d, a, b]) => ringAt(z + d, y - 0.68, a, b, 8, x, 2.6)), { us: [0.1, 0.1, 0.1, 0.1, 0.1], vs: () => 0.5 }));
    dark.push(box(0.36, 0.22, 0.04, x, y - 0.68, z + 0.1));
    dark.push(box(0.5, 0.42, 0.04, x, y, z + 0.0));
    // the exhaust, sooty, on top of the nacelle where it meets the wing
    dark.push(tube(0.17, 0.2, 1.1, x + s * 0.34, y + 0.62, z + 4.1, 8));
    K.props.push([x, y, z - 0.08]);
  }
  K.nacelles = mergeGeometries(nac);
  const tanks = [], tz = [[-3.7, 0.03], [-3.3, 0.24], [-2.4, 0.45], [-1, 0.56], [1, 0.56], [2.2, 0.42], [3.3, 0.18], [3.9, 0.03]];
  for (const s of [1, -1]) {
    const x = s * TANK_X, y = wingY(TANK_X) - 1.15, zc = (wingLE(TANK_X) + wingTE(TANK_X)) / 2 - 0.4;
    tanks.push(loft(tz.map(([d, r]) => ringAt(zc + d, y, r, r, 10, x, 2)), { us: tz.map((t) => 0.3 + (t[0] + 3.7) / 7.6 * 0.3) }));
    tanks.push(box(0.14, 0.75, 2, x, y + 0.72, zc));
  }
  K.tanks = mergeGeometries(tanks);
  // ---- small things that make it a machine
  for (const s of [1, -1]) {
    metal.push(tube(0.025, 0.025, 0.55, s * 1.28, 0.28, -12.45, 5)); // pitot tubes
    dark.push(box(0.05, 0.42, 0.34, s * 0.45, 2.45, -5.4, 0, 0, 0)); // blade antennas
    dark.push(box(0.09, 0.05, 0.42, s * 20.1, wingY(20.1), 1.1)); // on the tips
    metal.push(box(0.08, 0.1, 1.5, s * 1.5, -2.03, 6.2)); // ramp hinge rails
  }
  metal.push(box(0.05, 0.05, 0.9, 0, 8.9, 15.6)); // the tail cap
  K.dark = mergeGeometries(dark); K.metal = mergeGeometries(metal);
  // the long wire from the fin to the roof
  K.wire = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 6.9, 12.9), new THREE.Vector3(0, 2.55, -6.6)]);
  // ---- the propeller: spinner up front, four paddle blades with yellow tips
  const lp = [[0.34, 0], [0.33, 0.28], [0.25, 0.62], [0.12, 0.92], [0.01, 1.08]].map(([r, y]) => new THREE.Vector2(r, y));
  K.spinner = new THREE.LatheGeometry(lp, 10).rotateX(-Math.PI / 2);
  const bl = [], stations = [[0.28, 0.2, 1.05, 0], [0.7, 0.34, 0.86, 0], [1.2, 0.42, 0.58, 0], [1.66, 0.38, 0.38, 0], [1.76, 0.36, 0.34, 0], [1.76, 0.36, 0.34, 1], [2.05, 0.2, 0.22, 1]];
  for (let n = 0; n < 4; n++) {
    const rg = stations.map(([r, c, tw]) => {
      const cs = Math.cos(tw), sn = Math.sin(tw), th = 0.035;
      return [[-c / 2, 0], [0, th], [c / 2, 0], [0, -th]].map(([a, b]) => [a * cs - b * sn, r, a * sn + b * cs]);
    });
    const g = loft(rg), col = [], M = 5;
    for (let i = 0; i < stations.length; i++) for (let j = 0; j < M; j++) { const y = stations[i][3]; col.push(y ? 0.86 : 0.075, y ? 0.68 : 0.075, y ? 0.12 : 0.08); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.rotateZ((n * Math.PI) / 2);
    bl.push(g);
  }
  K.blades = mergeGeometries(bl);
  K.disc = new THREE.CircleGeometry(2.07, 24);
  // ---- inside: only ever seen through the open ramp
  const inner = HULL.filter((s) => s[0] >= -6 && s[0] <= 13.8).map((s) => ringAt(s[0], s[1], s[2] * 0.96, s[3] * 0.96));
  K.hold = loft(inner, { us: inner.map((_, i) => i / (inner.length - 1)), skip: openBay(inner) });
  K.holdEnd = new THREE.CircleGeometry(2.2, 16).translate(0, 0.05, -6);
  K.holdFloor = new THREE.BoxGeometry(3.5, 0.1, 12.6).translate(0, -1.82, 0.2);
  const lamps = [];
  for (let z = -4.5; z < 10; z += 3) for (const s of [1, -1]) lamps.push(box(0.26, 0.05, 0.9, s * 0.9, 1.92, z));
  K.lamps = mergeGeometries(lamps);
  // ---- the ramp, down in the air, its hinge at the end of the floor
  const rampLen = 5.8, drop = 0.14;
  K.ramp = new THREE.BoxGeometry(3.5, 0.12, rampLen).translate(0, 0, rampLen / 2).rotateX(drop).translate(0, -1.84, 6.5);
  const rails = [];
  for (const s of [1, -1]) rails.push(new THREE.BoxGeometry(0.1, 0.34, rampLen).translate(s * 1.75, 0.14, rampLen / 2).rotateX(drop).translate(0, -1.84, 6.5));
  K.rampRails = mergeGeometries(rails);
  K.rampLip = new THREE.Vector3(0, -1.84 - Math.sin(drop) * rampLen - 0.1, 6.5 + Math.cos(drop) * rampLen);
  // ---- lights
  K.lightGeo = new THREE.SphereGeometry(0.11, 6, 4);
  // ---- paint
  const lam = (o) => new THREE.MeshLambertMaterial(o);
  K.m = {
    hull: lam({ map: paintHull() }), wing: lam({ map: paintWing() }), fin: lam({ map: paintFin() }), engine: lam({ map: paintEngine() }),
    tank: lam({ color: 0x6a6f5e }), dark: lam({ color: 0x151615 }), metal: lam({ color: 0x8b8f8b }), spinner: lam({ color: 0x2b2d2a }),
    blades: lam({ vertexColors: true, side: THREE.DoubleSide }),
    disc: new THREE.MeshBasicMaterial({ map: paintBlur(), transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    hold: new THREE.MeshBasicMaterial({ map: paintHold(), side: THREE.BackSide }), holdEnd: new THREE.MeshBasicMaterial({ color: 0x1a0a08 }),
    holdFloor: new THREE.MeshBasicMaterial({ color: 0x2a1512 }), lamps: new THREE.MeshBasicMaterial({ color: 0xc23a26 }),
    ramp: lam({ map: paintTread() }), rail: lam({ color: 0x3a3d36 }),
    wire: new THREE.LineBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.3 }), glow: paintGlow(),
    red: new THREE.MeshBasicMaterial({ color: 0xff2a1c }), green: new THREE.MeshBasicMaterial({ color: 0x2aff5c }), white: new THREE.MeshBasicMaterial({ color: 0xfff6e0 }),
  };
  return K;
}

let KIT = null;

// ---------------------------------------------------------------- one plane
export function buildPlane() {
  const K = KIT || (KIT = buildKit()), m = K.m;
  const root = new THREE.Group(), model = new THREE.Group();
  model.scale.setScalar(SCALE);
  root.add(model);
  const add = (geo, mat) => { const o = new THREE.Mesh(geo, mat); model.add(o); return o; };
  add(K.hull, m.hull); add(K.wings, m.wing); add(K.fin, m.fin); add(K.nacelles, m.engine); add(K.tanks, m.tank);
  add(K.dark, m.dark); add(K.metal, m.metal); add(K.hold, m.hold); add(K.holdEnd, m.holdEnd); add(K.holdFloor, m.holdFloor); add(K.lamps, m.lamps);
  add(K.ramp, m.ramp); add(K.rampRails, m.rail);
  model.add(new THREE.LineSegments(K.wire, m.wire));
  root.props = [];
  for (const [x, y, z] of K.props) {
    const pr = new THREE.Group(); pr.position.set(x, y, z); model.add(pr);
    pr.add(new THREE.Mesh(K.spinner, m.spinner), new THREE.Mesh(K.blades, m.blades));
    const d = new THREE.Mesh(K.disc, m.disc); d.position.z = -0.02; d.renderOrder = 4; pr.add(d);
    root.props.push(pr);
  }
  // ---- lights: red on the left, green on the right, white behind, a red beacon and white strobes that flash
  const light = (mat, x, y, z, color, size) => {
    const o = new THREE.Mesh(K.lightGeo, mat); o.position.set(x, y, z); model.add(o);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: m.glow, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    s.scale.setScalar(size); o.add(s);
    return s;
  };
  light(m.red, -20.5, wingY(20.5), 0.3, 0xff3020, 0.7); light(m.green, 20.5, wingY(20.5), 0.3, 0x30ff60, 0.7); light(m.white, 0, 1.82, 15.85, 0xfff6e0, 0.6);
  const beacons = [light(m.red, 0, 2.52, -3.6, 0xff3020, 1.6), light(m.red, 0, -2.3, -4.8, 0xff3020, 1.6)];
  const strobes = [light(m.white, -20.45, wingY(20.45), 0.9, 0xffffff, 1.3), light(m.white, 20.45, wingY(20.45), 0.9, 0xffffff, 1.3)];
  root.ramp = K.rampLip.clone().multiplyScalar(SCALE);
  root.traverse((o) => o.layers.set(2));
  // ---- alive: the propellers turn, the lights flash, and the air moves it a little
  let t = 0;
  root.tick = (dt) => {
    t += dt;
    for (const pr of root.props) pr.rotation.z += dt * 34;
    const b = (t * 1.1) % 1 < 0.12 ? 1 : 0, f = (t * 0.8) % 1;
    for (const s of beacons) s.visible = !!b;
    for (const s of strobes) s.visible = f < 0.05 || (f > 0.14 && f < 0.18);
    model.rotation.z = Math.sin(t * 0.31) * 0.014; model.rotation.x = Math.sin(t * 0.23 + 1) * 0.007; model.position.y = Math.sin(t * 0.41) * 0.35;
  };
  root.tick(0);
  return root;
}
