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
