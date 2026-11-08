import * as THREE from 'three';
import { mtx } from '../props.js';

// =============================================================================
// What stands round a map: the ground going on past the map's own ground out to the haze, hills far off, and walls
// of rock that close a map's edge where nothing else does. The map's invisible edge stands right at the rock's inner
// face, so nobody climbs up and walks round on top.
// =============================================================================
const R = (x, z, k = 0) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };   // the same every time

// the ground round the rectangle [x0, z0, x1, z1] of the map's own ground, to `far` in every direction (only drawn)
export function groundRing(b, [x0, z0, x1, z1], mat, far = 420, y = 0) {
  for (const [a, c, d, e] of [[-far, -far, x0, far], [x1, -far, far, far], [x0, -far, x1, z0], [x0, z1, x1, far]]) b.box(a, y - 0.5, c, d, y, e, mat, { collide: false, ao: false, faces: '+y' });
}

// low round hills: [x, z, radius x, height, radius z]
const HILL = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
export function hills(b, list, mat, y = -0.3) {
  for (const [x, z, rx, h, rz] of list) b.geom(HILL, mat, mtx(x, y, z, (x * 0.011 + z * 0.006) % 3.1, rx, h, rz));
}

// over a building whose roof is only drawn (ridge along x, eaves at z0 and z1): a block for bodies that follows the
// roof's slopes, so nobody stands on the walls or the roof, and under it the room stays free up to the roof you see
export function roofCap(b, x0, x1, z0, z1, eaves, ridge, o = {}) {
  const n = o.n || 10, half = (z1 - z0) / 2, w = half / n, top = o.top ?? ridge + 4, opt = { visual: false, noBullet: true };
  for (const s of [-1, 1]) for (let i = 0; i < n; i++) {
    const za = s < 0 ? z0 + i * w : z1 - (i + 1) * w;
    b.box(x0, eaves + (ridge - eaves) * i / n - 0.1, za, x1, top, za + w, o.mat || 'concrete', opt);
  }
}

// a row of town houses to look at across a street (out of reach, behind the map's edge): blocks of different heights,
// a ledge on top, windows on the face toward the map. face: '+z' | '-z' | '+x' | '-x'; parts: [[a0, a1, height, mat]]
export function streetRow(b, face, line, depth, parts) {
  const ax = face[1] === 'z', sg = face[0] === '+' ? 1 : -1, back = line - sg * depth;
  const n0 = Math.min(line, back), n1 = Math.max(line, back), win = (a, y) => {
    const f0 = line, f1 = line + sg * 0.03;
    if (ax) b.box(a - 0.6, y, Math.min(f0, f1), a + 0.6, y + 1.4, Math.max(f0, f1), 'black', { collide: false, ao: false });
    else b.box(Math.min(f0, f1), y, a - 0.6, Math.max(f0, f1), y + 1.4, a + 0.6, 'black', { collide: false, ao: false });
  };
  for (const [a0, a1, h, mat] of parts) {
    if (ax) b.box(a0, 0, n0, a1, h, n1, mat); else b.box(n0, 0, a0, n1, h, a1, mat);
    if (ax) b.box(a0 - 0.05, h, n0 - 0.05, a1 + 0.05, h + 0.25, n1 + 0.05, 'concreteDark', { collide: false, ao: false });
    else b.box(n0 - 0.05, h, a0 - 0.05, n1 + 0.05, h + 0.25, a1 + 0.05, 'concreteDark', { collide: false, ao: false });
    for (let a = a0 + 2; a < a1 - 1.5; a += 3.6) for (let y = 3.2; y < h - 1.6; y += 3.2) win(a, y);
  }
}

// a rough wall of rock along a line: axis 'x' (the line is z = line, from x a0 to a1) or 'z' (x = line, z from a0 to
// a1); its face toward the map on the line (give or take a hand), its depth going out toward `out` (+1 / -1).
// o: mat, dark (a second rock), depth, cap (a material lying on top, e.g. snow), y (its foot)
const BOULDER = new THREE.DodecahedronGeometry(1, 0);
export function rockWall(b, axis, line, a0, a1, out, h = 7, o = {}) {
  const mat = o.mat || 'rock', dark = o.dark || 'rockDark', d = o.depth ?? 4, y0 = o.y ?? -0.5;
  for (let a = a0, i = 0; a < a1 - 0.01; i++) {
    const len = Math.min(a1 - a, 2.2 + R(a, line) * 3.2), hh = h * (0.78 + R(a, line, 1) * 0.5);
    const n0 = line + out * (R(a, line, 2) * 0.25 - 0.1), n1 = line + out * (d + R(a, line, 3) * 2.5);
    const m = R(a, line, 4) < 0.55 ? mat : dark;
    const put = (p0, q0, p1, q1, ya, yb, mm, opt) => (axis === 'x' ? b.box(p0, ya, Math.min(q0, q1), p1, yb, Math.max(q0, q1), mm, opt) : b.box(Math.min(q0, q1), ya, p0, Math.max(q0, q1), yb, p1, mm, opt));
    put(a, n0, a + len, n1, y0, hh, m);
    // a step back and up on top of it, and now and then a boulder lying up there: the line against the sky is not straight
    const back = line + out * (0.8 + R(a, line, 5) * 1.2), top = hh + 0.8 + R(a, line, 6) * 2.2;
    if (R(a, line, 7) < 0.7) put(a + len * 0.15, back, a + len * 0.85, n1, hh, top, R(a, line, 8) < 0.5 ? dark : mat);
    if (o.cap) put(a + 0.01, n0 - out * 0.03, a + len - 0.01, n1 - out * 0.02, hh, hh + 0.12, o.cap, { collide: false, ao: false });
    if (R(a, line, 9) < 0.45) {
      const s = 0.9 + R(a, line, 10) * 1.4, c = a + len * (0.3 + R(a, line, 11) * 0.4), n = line + out * (d * 0.6 + s);
      b.geom(BOULDER, R(a, line, 12) < 0.5 ? mat : dark, axis === 'x' ? mtx(c, top + s * 0.4, n, i, s * 1.2, s * 0.8, s) : mtx(n, top + s * 0.4, c, i, s, s * 0.8, s * 1.2));
    }
    a += len;
  }
}

// ---------------------------------------------------------------------------
// Collision for round things: two boxes crossed, their corners right on the circle (one box sticks out at its corners,
// you bump into air there). roundCol: an upright cylinder (radii rx, rz) from y0 to y1. domeCol: a dome (half an
// ellipsoid, radii rx, ry, rz, its foot at y0) in n layers of such crosses.
// ---------------------------------------------------------------------------
export function roundCol(b, x, z, y0, y1, rx, rz = rx, mat = 'concrete', o = {}) {
  const opt = { visual: false, ...o };
  b.box(x - rx * 0.92, y0, z - rz * 0.39, x + rx * 0.92, y1, z + rz * 0.39, mat, opt);
  b.box(x - rx * 0.39, y0, z - rz * 0.92, x + rx * 0.39, y1, z + rz * 0.92, mat, opt);
}
export function domeCol(b, x, y0, z, rx, ry, rz, mat = 'concrete', n = 4, o = {}) {
  // (each layer as wide as the dome halfway up it: as much of the dome outside as of the layer)
  for (let i = 0; i < n; i++) {
    const hm = ry * (i + 0.5) / n, f = Math.sqrt(Math.max(0, 1 - (hm / ry) ** 2));
    roundCol(b, x, z, y0 + ry * i / n, y0 + ry * (i + 1) / n, rx * f, rz * f, mat, o);
  }
}
// a lying cylinder (along 'x' or 'z', length len, radius r, its lowest point at y0): crossed boxes in its round profile
export function logCol(b, x, z, y0, len, r, along = 'x', mat = 'woodDark', o = {}) {
  const opt = { visual: false, ...o }, yc = y0 + r, h = len / 2;
  for (const [a, c] of [[0.92, 0.39], [0.39, 0.92]]) {
    if (along === 'x') b.box(x - h, yc - r * a, z - r * c, x + h, yc + r * a, z + r * c, mat, opt);
    else b.box(x - r * c, yc - r * a, z - h, x + r * c, yc + r * a, z + h, mat, opt);
  }
}

// a date palm, its trunk straight up so that what you bump into is where the trunk is (the props' palm leans, its
// collision stands straight)
const LEAF = new THREE.BoxGeometry(0.5, 0.04, 2.6).translate(0, 0, 1.3);
export function palm(b, x, z, h = 7) {
  roundCol(b, x, z, 0, h / 2, 0.19, 0.19, 'bark'); roundCol(b, x, z, h / 2, h, 0.15, 0.15, 'bark');
  b.geom(new THREE.CylinderGeometry(0.13, 0.2, h, 7), 'bark', mtx(x, h / 2, z));
  for (let i = 0; i < 8; i++) b.geom(LEAF, 'foliage', mtx(x, h, z, i * Math.PI / 4, 1, 1, 1, 0.45));
}
