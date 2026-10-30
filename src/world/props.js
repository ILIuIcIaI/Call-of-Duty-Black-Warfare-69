import * as THREE from 'three';

// Reusable level-building blocks. All functions take the MapBuilder `b` first.
const M4 = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const V = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1);
export function mtx(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  Q.setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
  return M4.clone().compose(V.set(x, y, z), Q, S.set(sx, sy, sz));
}

// --- Walls ------------------------------------------------------------------
// Wall running along X at z (thickness t centered on z). openings: [{c: centerX, w, y: bottom, h}]
export function wallX(b, x0, x1, z, y0, h, t, mat, openings = [], opts = {}) {
  segWall(b, x0, x1, y0, h, openings, (a, c, ya, yb) => b.box(a, ya, z - t / 2, c, yb, z + t / 2, mat, opts));
}
export function wallZ(b, z0, z1, x, y0, h, t, mat, openings = [], opts = {}) {
  segWall(b, z0, z1, y0, h, openings, (a, c, ya, yb) => b.box(x - t / 2, ya, a, x + t / 2, yb, c, mat, opts));
}
function segWall(b, a0, a1, y0, h, openings, emit) {
  if (a0 > a1) [a0, a1] = [a1, a0];
  const ops = openings.map((o) => ({ s: Math.max(a0, o.c - o.w / 2), e: Math.min(a1, o.c + o.w / 2), y: o.y ?? 0, h: o.h ?? 2.3 })).filter((o) => o.e > o.s).sort((p, q) => p.s - q.s);
  let cur = a0;
  for (const o of ops) {
    if (o.s > cur) emit(cur, o.s, y0, y0 + h);
    // below opening (window sill)
    if (o.y > 0.01) emit(o.s, o.e, y0, y0 + o.y);
    // above opening (lintel)
    if (o.y + o.h < h - 0.01) emit(o.s, o.e, y0 + o.y + o.h, y0 + h);
    cur = o.e;
  }
  if (cur < a1) emit(cur, a1, y0, y0 + h);
}

// --- Stairs -----------------------------------------------------------------
// Solid stairs rising in direction dir ('+x','-x','+z','-z') starting at (x,z) edge.
export function stairs(b, x, z, dir, width, rise, run, mat, y0 = 0) {
  const n = Math.max(2, Math.round(rise / 0.25));
  const sh = rise / n, sd = run / n;
  for (let i = 0; i < n; i++) {
    const top = y0 + sh * (i + 1);
    const a = sd * i, c = sd * (i + 1);
    if (dir === '+x') b.box(x + a, y0, z - width / 2, x + c, top, z + width / 2, mat, { ao: false });
    if (dir === '-x') b.box(x - c, y0, z - width / 2, x - a, top, z + width / 2, mat, { ao: false });
    if (dir === '+z') b.box(x - width / 2, y0, z + a, x + width / 2, top, z + c, mat, { ao: false });
    if (dir === '-z') b.box(x - width / 2, y0, z - c, x + width / 2, top, z - a, mat, { ao: false });
  }
}

// --- Shipping container ---------------------------------------------------------
// along: 'x' or 'z'. y = bottom. Length 6.1, width 2.44, height 2.6
export function container(b, x, z, along, mat, y = 0, opts = {}) {
  const L = opts.len || 6.1, W = 2.44, Hh = 2.6;
  const hx = along === 'x' ? L / 2 : W / 2, hz = along === 'x' ? W / 2 : L / 2;
  b.box(x - hx, y, z - hz, x + hx, y + Hh, z + hz, mat, { pen: 0.5 });
  // corner posts + top/bottom rails (visual)
  const p = 0.12;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.boxC(x + sx * (hx - p / 2 + 0.015), z + sz * (hz - p / 2 + 0.015), p, p, y, Hh, 'metalDark', { collide: false, ao: false });
  }
  // door end: locking bars
  const endSign = opts.doorEnd || 1;
  for (let i = 0; i < 4; i++) {
    const off = -W / 2 + 0.35 + i * ((W - 0.7) / 3);
    if (along === 'x') {
      const ex = x + endSign * (hx + 0.03);
      b.box(ex - 0.03, y + 0.15, z + off - 0.025, ex + 0.03, y + Hh - 0.15, z + off + 0.025, 'metal', { collide: false, ao: false });
    } else {
      const ez = z + endSign * (hz + 0.03);
      b.box(x + off - 0.025, y + 0.15, ez - 0.03, x + off + 0.025, y + Hh - 0.15, ez + 0.03, 'metal', { collide: false, ao: false });
    }
  }
}

// --- Crates / barrels / pallets ------------------------------------------------
export function crate(b, x, z, s = 1.2, y = 0, mat = 'wood') {
  b.box(x - s / 2, y, z - s / 2, x + s / 2, y + s, z + s / 2, mat, { pen: 0.6 });
  // dark frame strips
  const f = 0.09, e = 0.012;
  for (const [ax, az] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    b.boxC(x + ax * (s / 2 - f / 2 + e), z + az * (s / 2 - f / 2 + e), f, f, y, s, 'woodDark', { collide: false, ao: false });
  }
  b.box(x - s / 2 - e, y + s - f, z - s / 2 - e, x + s / 2 + e, y + s + e, z + s / 2 + e, 'woodDark', { collide: false, ao: false });
}

const cylGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 14, 1);
export function barrel(b, x, z, mat = 'metalRed', y = 0) {
  b.box(x - 0.29, y, z - 0.29, x + 0.29, y + 0.9, z + 0.29, mat, { visual: false });
  b.geom(cylGeo, mat, mtx(x, y + 0.45, z));
  b.geom(new THREE.CylinderGeometry(0.31, 0.31, 0.04, 14), 'metalDark', mtx(x, y + 0.3, z));
  b.geom(new THREE.CylinderGeometry(0.31, 0.31, 0.04, 14), 'metalDark', mtx(x, y + 0.62, z));
}

export function pallet(b, x, z, y = 0, rot = false) {
  const w = rot ? 1.0 : 1.2, d = rot ? 1.2 : 1.0;
  b.box(x - w / 2, y, z - d / 2, x + w / 2, y + 0.14, z + d / 2, 'woodPale', { ao: false });
}

export function sandbags(b, x, z, len, along = 'x', h = 1.0) {
  const n = Math.round(len / 0.55);
  const lx = along === 'x' ? len / 2 : 0.4, lz = along === 'x' ? 0.4 : len / 2;
  b.box(x - lx, 0, z - lz, x + lx, h, z + lz, 'sandbag', { visual: false });
  const g = new THREE.SphereGeometry(0.5, 10, 6);
  const rows = Math.round(h / 0.2);
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < n; i++) {
      const o = -len / 2 + (i + 0.5 + (r % 2) * 0.5) * (len / n);
      if (o > len / 2 - 0.15) continue;
      const px = along === 'x' ? x + o : x, pz = along === 'x' ? z : z + o;
      b.geom(g, 'sandbag', mtx(px, 0.1 + r * 0.2, pz, along === 'x' ? 0 : Math.PI / 2, 0.56, 0.24, 0.8));
    }
  }
}

// Concrete jersey barrier (trapezoid profile)
export function barrier(b, x, z, along = 'x', len = 3, mat = 'concrete') {
  const hx = along === 'x' ? len / 2 : 0.35, hz = along === 'x' ? 0.35 : len / 2;
  b.box(x - hx, 0, z - hz, x + hx, 1.0, z + hz, mat, { visual: false });
  const shape = new THREE.Shape();
  shape.moveTo(-0.35, 0); shape.lineTo(0.35, 0); shape.lineTo(0.3, 0.12); shape.lineTo(0.14, 0.32); shape.lineTo(0.12, 1.0);
  shape.lineTo(-0.12, 1.0); shape.lineTo(-0.14, 0.32); shape.lineTo(-0.3, 0.12); shape.lineTo(-0.35, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
  g.translate(0, 0, -len / 2);
  scaleUV(g, 0.5);
  b.geom(g, mat, mtx(x, 0, z, along === 'x' ? Math.PI / 2 : 0));
}

function scaleUV(g, s) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s);
}

// --- Vehicles -------------------------------------------------------------------
export function car(b, x, z, along = 'x', paint = 'carPaintRed') {
  const L = 4.3, W = 1.8;
  const hx = along === 'x' ? L / 2 : W / 2, hz = along === 'x' ? W / 2 : L / 2;
  const cx = along === 'x' ? L * 0.08 : 0, cz = along === 'x' ? 0 : L * 0.08;
  // body + cabin collision (two boxes so you can shoot over the hood)
  b.box(x - hx, 0.25, z - hz, x + hx, 1.0, z + hz, paint, { pen: 0.3 });
  const chx = along === 'x' ? 1.1 : W / 2 - 0.08, chz = along === 'x' ? W / 2 - 0.08 : 1.1;
  b.box(x - chx + cx, 1.0, z - chz + cz, x + chx + cx, 1.48, z + chz + cz, 'carGlass', { pen: 0.8 });
  b.box(x - chx + cx - 0.02, 1.47, z - chz + cz - 0.02, x + chx + cx + 0.02, 1.52, z + chz + cz + 0.02, paint, { collide: false });
  b.box(x - hx + 0.02, 0, z - hz + 0.02, x + hx - 0.02, 0.25, z + hz - 0.02, 'black', { collide: true, ao: false });
  const wheel = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 14);
  for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
    const wx = along === 'x' ? x + s1 * (hx - 0.75) : x + s2 * (hx - 0.05);
    const wz = along === 'x' ? z + s2 * (hz - 0.05) : z + s1 * (hz - 0.75);
    b.geom(wheel, 'rubber', mtx(wx, 0.33, wz, along === 'x' ? 0 : Math.PI / 2, 1, 1, 1, 0, Math.PI / 2));
  }
  // lights
  const fx = along === 'x' ? x + hx : x, fz = along === 'x' ? z : z + hz;
  if (along === 'x') { b.box(fx, 0.7, z - 0.7, fx + 0.03, 0.82, z - 0.4, 'lampOn', { collide: false }); b.box(fx, 0.7, z + 0.4, fx + 0.03, 0.82, z + 0.7, 'lampOn', { collide: false }); }
  else { b.box(x - 0.7, 0.7, fz, x - 0.4, 0.82, fz + 0.03, 'lampOn', { collide: false }); b.box(x + 0.4, 0.7, fz, x + 0.7, 0.82, fz + 0.03, 'lampOn', { collide: false }); }
}

export function truck(b, x, z, along = 'x', paint = 'carPaintWhite', dir = 1) {
  // cab + flatbed/box
  const L = 7.5, W = 2.4;
  const ax = along === 'x';
  const hx = ax ? L / 2 : W / 2, hz = ax ? W / 2 : L / 2;
  b.box(x - hx, 0.5, z - hz, x + hx, 1.2, z + hz, 'metalDark');
  // cargo box
  const c0 = -L / 2, c1 = L / 2 - 2.2;
  const cab0 = L / 2 - 2.1, cab1 = L / 2;
  const seg = (a, c, y0, y1, mat, opts) => {
    if (ax) b.box(x + dir * a, y0, z - hz, x + dir * c, y1, z + hz, mat, opts);
    else b.box(x - hx, y0, z + dir * a, x + hx, y1, z + dir * c, mat, opts);
  };
  seg(c0, c1, 1.2, 3.6, 'contWhite', { pen: 0.5 });
  seg(cab0, cab1, 1.2, 2.5, paint, { pen: 0.4 });
  seg(cab0 + 0.6, cab1 - 0.1, 2.5, 3.2, paint, { pen: 0.4 });
  seg(cab1 - 0.12, cab1 - 0.02, 2.55, 3.1, 'carGlass', { collide: false });
  const wheel = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 16);
  for (const p of [-L / 2 + 1.0, -L / 2 + 2.2, L / 2 - 1.2]) for (const s of [-1, 1]) {
    const wx = ax ? x + dir * p : x + s * (hx - 0.1), wz = ax ? z + s * (hz - 0.1) : z + dir * p;
    b.geom(wheel, 'rubber', mtx(wx, 0.5, wz, ax ? 0 : Math.PI / 2, 1, 1, 1, 0, Math.PI / 2));
  }
}

export function forklift(b, x, z, rot = 0) {
  const g = new THREE.Group();
  b.box(x - 0.6, 0, z - 1.0, x + 0.6, 1.3, z + 1.0, 'metalYellow', { visual: false });
  b.geom(new THREE.BoxGeometry(1.2, 0.9, 1.8), 'metalYellow', mtx(x, 0.75, z, rot));
  b.geom(new THREE.BoxGeometry(1.1, 0.06, 1.2), 'metalDark', mtx(x, 2.2, z + Math.cos(rot) * 0.2, rot));
  for (const s of [-0.5, 0.5]) b.geom(new THREE.BoxGeometry(0.06, 1.9, 0.06), 'metalDark', mtx(x + s * Math.cos(rot), 1.25, z - s * Math.sin(rot), rot));
  b.geom(new THREE.BoxGeometry(1.1, 2.2, 0.12), 'metalDark', mtx(x - Math.sin(rot) * 1.0, 1.1, z - Math.cos(rot) * 1.0, rot));
  b.geom(new THREE.BoxGeometry(0.9, 0.06, 1.1), 'metalDark', mtx(x - Math.sin(rot) * 1.55, 0.15, z - Math.cos(rot) * 1.55, rot));
  void g;
}

// --- Street furniture -------------------------------------------------------------
export function lampPost(b, x, z, h = 6, armDir = [1, 0], light = true) {
  b.box(x - 0.1, 0, z - 0.1, x + 0.1, h, z + 0.1, 'metalDark', { visual: false });
  b.geom(new THREE.CylinderGeometry(0.07, 0.1, h, 8), 'metalDark', mtx(x, h / 2, z));
  const ax = x + armDir[0] * 0.8, az = z + armDir[1] * 0.8;
  b.box(Math.min(x, ax) - 0.04, h - 0.1, Math.min(z, az) - 0.04, Math.max(x, ax) + 0.04, h - 0.02, Math.max(z, az) + 0.04, 'metalDark', { collide: false });
  b.box(ax - 0.2, h - 0.2, az - 0.12, ax + 0.2, h - 0.08, az + 0.12, light ? 'lampOn' : 'metalDark', { collide: false });
}

export function bollard(b, x, z) {
  b.box(x - 0.2, 0, z - 0.2, x + 0.2, 0.75, z + 0.2, 'metalDark', { visual: false });
  b.geom(new THREE.CylinderGeometry(0.16, 0.2, 0.55, 10), 'metalDark', mtx(x, 0.27, z));
  b.geom(new THREE.SphereGeometry(0.24, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 'metalDark', mtx(x, 0.55, z, 0, 1, 0.6, 1));
}

export function tree(b, x, z, h = 6, r = 2.2) {
  b.box(x - 0.22, 0, z - 0.22, x + 0.22, h * 0.55, z + 0.22, 'bark', { visual: false });
  b.geom(new THREE.CylinderGeometry(0.14, 0.24, h * 0.6, 7), 'bark', mtx(x, h * 0.3, z));
  const blob = new THREE.IcosahedronGeometry(1, 1);
  b.geom(blob, 'foliage', mtx(x, h * 0.7, z, 0.3, r, r * 0.8, r));
  b.geom(blob, 'foliageDark', mtx(x + r * 0.45, h * 0.6, z - r * 0.2, 1.2, r * 0.7, r * 0.6, r * 0.7));
  b.geom(blob, 'foliage', mtx(x - r * 0.4, h * 0.82, z + r * 0.3, 2.1, r * 0.65, r * 0.55, r * 0.65));
}

export function palm(b, x, z, h = 7) {
  b.box(x - 0.18, 0, z - 0.18, x + 0.18, h, z + 0.18, 'bark', { visual: false });
  b.geom(new THREE.CylinderGeometry(0.13, 0.2, h, 7), 'bark', mtx(x, h / 2, z, 0, 1, 1, 1, 0.04, 0.03));
  const leaf = new THREE.BoxGeometry(0.5, 0.04, 2.6);
  leaf.translate(0, 0, 1.3);
  for (let i = 0; i < 8; i++) b.geom(leaf, 'foliage', mtx(x, h, z, i * Math.PI / 4, 1, 1, 1, 0.45));
}

// Chain link / railing fence along X or Z (low cover, see-through)
export function railing(b, x0, z0, x1, z1, h = 1.05, mat = 'metalDark', collide = true, y0 = 0) {
  const along = Math.abs(x1 - x0) > Math.abs(z1 - z0) ? 'x' : 'z';
  const len = along === 'x' ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  if (collide) {
    if (along === 'x') b.box(Math.min(x0, x1), y0, z0 - 0.04, Math.max(x0, x1), y0 + h, z0 + 0.04, mat, { visual: false, pen: 1, noBullet: true });
    else b.box(x0 - 0.04, y0, Math.min(z0, z1), x0 + 0.04, y0 + h, Math.max(z0, z1), mat, { visual: false, pen: 1, noBullet: true });
  }
  const n = Math.max(1, Math.round(len / 1.5));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
    b.box(px - 0.035, y0, pz - 0.035, px + 0.035, y0 + h, pz + 0.035, mat, { collide: false, ao: false });
  }
  for (const y of [y0 + h - 0.05, y0 + h * 0.5]) {
    if (along === 'x') b.box(Math.min(x0, x1), y - 0.025, z0 - 0.025, Math.max(x0, x1), y + 0.025, z0 + 0.025, mat, { collide: false, ao: false });
    else b.box(x0 - 0.025, y - 0.025, Math.min(z0, z1), x0 + 0.025, y + 0.025, Math.max(z0, z1), mat, { collide: false, ao: false });
  }
}

// Invisible boundary
export function boundary(b, x0, z0, x1, z1, h = 30) {
  b.box(x0, -2, z0, x1, h, z1, 'concrete', { visual: false, noBullet: false });
}

// Simple pitched/flat roof slab
export function slab(b, x0, z0, x1, z1, y, t = 0.25, mat = 'concreteDark') {
  b.box(x0, y, z0, x1, y + t, z1, mat, { ao: false });
}

// Window frame trim (visual) for an opening in a wall along X or Z
export function windowFrame(b, cx, cz, along, w, y0, h, depth = 0.3, mat = 'woodDark') {
  const t = 0.07;
  if (along === 'x') {
    b.box(cx - w / 2 - t, y0 - t, cz - depth / 2, cx + w / 2 + t, y0, cz + depth / 2, mat, { collide: false, ao: false });
    b.box(cx - w / 2 - t, y0 + h, cz - depth / 2, cx + w / 2 + t, y0 + h + t, cz + depth / 2, mat, { collide: false, ao: false });
  } else {
    b.box(cx - depth / 2, y0 - t, cz - w / 2 - t, cx + depth / 2, y0, cz + w / 2 + t, mat, { collide: false, ao: false });
    b.box(cx - depth / 2, y0 + h, cz - w / 2 - t, cx + depth / 2, y0 + h + t, cz + w / 2 + t, mat, { collide: false, ao: false });
  }
}
