import * as THREE from 'three';
import { buildPlan, COLS, ROWS, CELL, X0, Z0 } from './backroomsPlan.js';
import { mulberry32 } from '../../core/math.js';

// =============================================================================
// BACKROOMS — Level 0: the empty back rooms of a building that never ends.
// Yellow wallpaper, damp carpet, a suspended ceiling with fluorescent panels
// that hum. Built after the 2019 creepypasta and the variations its wiki lists
// for the level, each one a part of the map:
//   middle : the pillar hall, a pillar on every second corner of the grid
//   north  : pale rooms with arched doorways and windows, the red room between them
//   south  : office partitions, a room with holes in the floor (falling in is the
//            end), and a part where the lights have gone out
//   sides  : the spawn halls, and a maze of partitions between them and the hall
// Mirror-symmetric across x = 0: team 0 west, team 1 east. The floor plan is in
// backroomsPlan.js. The light is baked once into a picture of the floor.
// =============================================================================
const H = 3.0;              // floor to ceiling
const T = 0.24, E = T / 2;  // partitions, half of one
const DOOR = 2.3;           // top of a doorway
const SPRING = 2.0;         // arches: where the round part starts
const SILL = 0.9;           // arched windows
const HALF = 1.05;          // half walls
const HOLE = 1.4;           // a hole in the floor, in the middle of its cell
const FALL = -30;
const BOUNDS = { minX: X0, maxX: -X0, minZ: -Z0, maxZ: Z0 };
const plan = buildPlan();

// what each zone looks like
const PAPER = { ' ': 0xd8c87e, d: 0xd8c87e, p: 0xf0e6c4, r: 0xa8261e };
const CARPET = { ' ': 0xbca878, d: 0xb09c6c, p: 0xc8b68c, r: 0x82201a };
const LIGHT = { ' ': [1, 0.94, 0.74], d: [1, 0.94, 0.74], p: [1, 0.96, 0.86], r: [1, 0.2, 0.12] };
const SCALE = { paper: 0.64, carpet: 1, ceil: 1.2, trim: 1.5 };

// ---------------------------------------------------------------- the panels in the ceiling
// every second cell in both directions; some dead, some flickering, the dark part all but dead
const PANELS = [];
{
  const rnd = mulberry32(1969);
  for (let row = 0; row < ROWS; row += 2) for (let c = 0; c < COLS / 2; c += 2) {
    const cell = plan.cells[row][c];
    if (cell.what === 'pillar') continue;
    const roll = rnd();
    let state = roll < 0.06 ? 0 : roll < 0.11 ? 2 : 1; // 0 dead, 1 on, 2 flickering
    if (cell.zone === 'd') state = row === 16 && c === 10 ? 2 : 0;
    if (cell.zone === 'r') state = 1;
    const x = X0 + c * CELL + CELL / 2, z = Z0 - row * CELL - CELL / 2;
    PANELS.push({ x, z, zone: cell.zone, state }, { x: -x, z, zone: plan.cells[row][COLS - 1 - c].zone, state });
  }
  // and down the middle, where no wall runs along it
  for (let row = 0; row < ROWS; row += 2) {
    const cell = plan.cells[row][COLS / 2 - 1];
    if (plan.vE[row][COLS / 2] !== ' ' || cell.what === 'pillar' || cell.zone === 'd') continue;
    PANELS.push({ x: 0, z: Z0 - row * CELL - CELL / 2, zone: cell.zone, state: 1 });
  }
}

// ---------------------------------------------------------------- geometry, collected per material
class Geo {
  constructor() { this.P = []; this.N = []; this.U = []; this.C = []; }
  // four corners, wound to face along n (shade: a brightness, or an [r, g, b] tint)
  quad(p, n, uv, shade) {
    const ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2], bx = p[2][0] - p[0][0], by = p[2][1] - p[0][1], bz = p[2][2] - p[0][2];
    const flip = (ay * bz - az * by) * n[0] + (az * bx - ax * bz) * n[1] + (ax * by - ay * bx) * n[2] < 0;
    for (const i of flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) {
      const q = p[i], t = uv(q), s = shade(q);
      this.P.push(q[0], q[1], q[2]); this.N.push(n[0], n[1], n[2]); this.U.push(t[0], t[1]);
      if (typeof s === 'number') this.C.push(s, s, s); else this.C.push(s[0], s[1], s[2]);
    }
  }
}
// darker at the foot of a wall and just under the ceiling
const wallShade = (q) => (q[1] < 0.5 ? 0.7 + 0.3 * (q[1] / 0.5) : q[1] > H - 0.3 ? 1 - 0.14 * ((q[1] - (H - 0.3)) / 0.3) : 1);
const flatShade = () => 1;

// a vertical face on the plane `axis` = at ('x' or 'z'), from..to along the other way, y0..y1, facing dir
function wall(g, axis, at, from, to, y0, y1, dir, s = SCALE.paper) {
  if (to - from < 1e-4 || y1 - y0 < 1e-4) return;
  const pts = axis === 'z' ? [[from, y0, at], [to, y0, at], [to, y1, at], [from, y1, at]] : [[at, y0, from], [at, y0, to], [at, y1, to], [at, y1, from]];
  const n = axis === 'z' ? [0, 0, dir] : [dir, 0, 0];
  g.quad(pts, n, axis === 'z' ? (q) => [q[0] / s, q[1] / s] : (q) => [q[2] / s, q[1] / s], wallShade);
}
function flat(g, y, x0, x1, z0, z1, dir, s, ou = 0, ov = 0, shade = flatShade) {
  g.quad([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [0, dir, 0], (q) => [(q[0] - ou) / s, (q[2] - ov) / s], shade);
}

// ---------------------------------------------------------------- the build: boxes for the collision, faces for the eye
function build() {
  const geo = {}, G = (k) => geo[k] || (geo[k] = new Geo()), rnd = mulberry32(4242);
  const boxes = [];    // [x0, y0, z0, x1, y1, z1, surface, pen]
  const blockers = []; // light: [x0, z0, x1, z1, how much gets through]
  const solid = (b, surface = 'concrete', pen = 0.45) => boxes.push([...b, surface, pen]);
  const paper = (zone) => G('paper' + (zone === 'd' ? ' ' : zone));
  const trim = (axis, at, from, to, dir, y0 = 0) => {
    // baseboard: a strip standing a little out of the face
    const o = at + dir * 0.014, g = G('trim');
    wall(g, axis, o, from, to, y0, y0 + 0.1, dir, SCALE.trim);
    flat(g, y0 + 0.1, axis === 'x' ? Math.min(at, o) : from, axis === 'x' ? Math.max(at, o) : to, axis === 'z' ? Math.min(at, o) : from, axis === 'z' ? Math.max(at, o) : to, 1, SCALE.trim);
  };
  const zoneOf = (c, r) => (c >= 0 && c < COLS && r >= 0 && r < ROWS ? plan.cells[r][c].zone : null);
  // the dark part has the plain paper and carpet; of two zones, the red one stands out most
  const MAT = (z) => (z === 'd' ? ' ' : z), RANK = { ' ': 0, p: 1, r: 2 };

  // Where two zones meet without a wall, the plainer carpet takes on the other one's colour round the seam, over a
  // cell's width, in the cell behind it and the open ones beside that: no line across the floor where the red room ends.
  const seams = []; // { axis, at: x or z of the seam, from..to along it, c, r: the cell that fades, other: the zone across }
  const seamAt = (c0, r0, c1, r1, axis, at, from) => {
    const a = zoneOf(c0, r0), b = zoneOf(c1, r1);
    if (a === null || b === null || MAT(a) === MAT(b)) return;
    const [c, r, other] = RANK[MAT(a)] < RANK[MAT(b)] ? [c0, r0, b] : [c1, r1, a];
    seams.push({ axis, at, from, to: from + CELL, c, r, other: MAT(other) });
  };
  for (let r = 1; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (' ^A'.includes(plan.hE[r][c])) seamAt(c, r - 1, c, r, 'z', Z0 - r * CELL, X0 + c * CELL);
  for (let r = 0; r < ROWS; r++) for (let k = 1; k < COLS; k++) if (' ^A'.includes(plan.vE[r][k])) seamAt(k - 1, r, k, r, 'x', X0 + k * CELL, Z0 - (r + 1) * CELL);
  const open = (c0, r0, c1, r1) => (r0 === r1 ? plan.vE[r0][Math.max(c0, c1)] : plan.hE[Math.max(r0, r1)][c0]) === ' ';
  const fadesIn = new Map(); // "c,r" -> the seams whose colour reaches its carpet
  for (const s of seams) {
    for (const [c, r] of [[s.c, s.r], ...(s.axis === 'z' ? [[s.c - 1, s.r], [s.c + 1, s.r]] : [[s.c, s.r - 1], [s.c, s.r + 1]])]) {
      const zc = zoneOf(c, r);
      if (zc === null || RANK[MAT(zc)] >= RANK[s.other] || ((c !== s.c || r !== s.r) && !open(s.c, s.r, c, r))) continue;
      const k = c + ',' + r;
      if (!fadesIn.has(k)) fadesIn.set(k, []);
      fadesIn.get(k).push(s);
    }
  }
  const carpetShade = (c, r, zone) => {
    const list = fadesIn.get(c + ',' + r);
    if (!list) return null;
    const own = new THREE.Color(CARPET[MAT(zone)]);
    return (q) => {
      let t = 0, to = null;
      for (const s of list) {
        const u = s.axis === 'z' ? q[0] : q[2], v = s.axis === 'z' ? q[2] : q[0];
        const w = 1 - Math.hypot(Math.max(0, s.from - u, u - s.to), v - s.at) / CELL;
        if (w > t) { t = w; to = s.other; }
      }
      if (!to) return 1;
      const o = new THREE.Color(CARPET[to]), w = t * t * (3 - 2 * t);
      return [1 + (o.r / own.r - 1) * w, 1 + (o.g / own.g - 1) * w, 1 + (o.b / own.b - 1) * w];
    };
  };

  // A straight piece of wall along `axis` ('x' runs along x at z = m, 'z' along z at x = m), a0..a1, y0..y1.
  // zp: zone on the + side, zn: on the - side (null: nobody sees it).
  function piece(axis, a0, a1, m, y0, y1, zp, zn, pen = 0.45) {
    const box = axis === 'x' ? [a0, y0, m - E, a1, y1, m + E] : [m - E, y0, a0, m + E, y1, a1];
    solid(box, 'concrete', pen);
    const face = axis === 'x' ? 'z' : 'x';
    for (const [zone, dir] of [[zp, 1], [zn, -1]]) {
      if (zone === null) continue;
      wall(paper(zone), face, m + dir * E, a0, a1, y0, y1, dir);
      if (y0 === 0) trim(face, m + dir * E, a0, a1, dir);
      // now and then a wall socket, like in the first photo
      if (y0 === 0 && y1 === H && a1 - a0 > 1 && rnd() < 0.12) {
        const u = a0 + 0.35 + rnd() * (a1 - a0 - 0.7), at = m + dir * (E + 0.006);
        wall(G('plate'), face, at, u - 0.036, u + 0.036, 0.27, 0.385, dir, 1);
        for (const oy of [0.35, 0.3]) for (const du of [-0.013, 0.013]) wall(G('slot'), face, at + dir * 0.002, u + du - 0.003, u + du + 0.003, oy - 0.009, oy + 0.009, dir, 1);
      }
    }
    if (y1 < H - 1e-3) { const g = G('trim'); if (axis === 'x') flat(g, y1, a0, a1, m - E, m + E, 1, SCALE.trim); else flat(g, y1, m - E, m + E, a0, a1, 1, SCALE.trim); }
    if (y0 > 1e-3) { const g = paper(zp || zn); if (axis === 'x') flat(g, y0, a0, a1, m - E, m + E, -1, SCALE.paper); else flat(g, y0, m - E, m + E, a0, a1, -1, SCALE.paper); }
  }

  // The round top of an arched opening a0..a1 (the jambs are the corners), from SPRING up to the ceiling.
  function arch(axis, a0, a1, m, zp, zn) {
    const R = (a1 - a0) / 2, ac = (a0 + a1) / 2, N = 14, face = axis === 'x' ? 'z' : 'x';
    const at = (u, y, side) => (axis === 'x' ? [u, y, m + side * E] : [m + side * E, y, u]);
    const yOf = (u) => SPRING + Math.sqrt(Math.max(0, R * R - (u - ac) * (u - ac)));
    for (let i = 0; i < N; i++) {
      const u0 = a0 + (2 * R * i) / N, u1 = a0 + (2 * R * (i + 1)) / N, y0 = yOf(u0), y1 = yOf(u1);
      for (const [zone, side] of [[zp, 1], [zn, -1]]) {
        if (zone === null) continue;
        const n = face === 'z' ? [0, 0, side] : [side, 0, 0], s = SCALE.paper;
        paper(zone).quad([at(u0, y0, side), at(u1, y1, side), at(u1, H, side), at(u0, H, side)], n, axis === 'x' ? (q) => [q[0] / s, q[1] / s] : (q) => [q[2] / s, q[1] / s], wallShade);
      }
      // the underside, facing the middle of the circle
      const um = (u0 + u1) / 2, ym = (y0 + y1) / 2, nu = ac - um, ny = SPRING - ym, l = Math.hypot(nu, ny) || 1;
      const n = axis === 'x' ? [nu / l, ny / l, 0] : [0, ny / l, nu / l];
      paper(zp || zn).quad([at(u0, y0, 1), at(u1, y1, 1), at(u1, y1, -1), at(u0, y0, -1)], n, (q) => [(axis === 'x' ? q[0] : q[2]) / SCALE.paper, (axis === 'x' ? q[2] : q[0]) / SCALE.paper], wallShade);
    }
    // collision: a lintel and two steps down along the curve at each side, never into the open middle
    const box = (u0, u1, y0) => solid(axis === 'x' ? [u0, y0, m - E, u1, H, m + E] : [m - E, y0, u0, m + E, H, u1]);
    box(a0, a1, yOf(ac - R * 0.35));
    for (const w of [0.06, 0.14, 0.24, 0.36, 0.5]) { box(a0, a0 + R * w, yOf(a0 + R * w)); box(a1 - R * w, a1, yOf(a1 - R * w)); }   // (fine steps: no wall left that shots pass through)
  }

  // ---- every edge of the plan
  const corner = new Map(); // "k,r" -> highest wall that meets there
  const touch = (k, r, y) => { const key = k + ',' + r; corner.set(key, Math.max(corner.get(key) || 0, y)); };
  const edge = (axis, type, a0, a1, m, zp, zn, ends) => {
    const i0 = a0 + E, i1 = a1 - E;
    const outer = type === '#';
    const top = type === '_' ? HALF : H;
    for (const [k, r] of ends) touch(k, r, top);
    if (type === '-' || type === '|' || outer) { piece(axis, i0, i1, m, 0, H, zp, zn, outer ? 0 : 0.45); blockers.push([axis, i0, i1, m, 0]); }
    else if (type === '_') { piece(axis, i0, i1, m, 0, HALF, zp, zn); blockers.push([axis, i0, i1, m, 0.75]); }
    else if (type === '^') { piece(axis, i0, i1, m, DOOR, H, zp, zn); blockers.push([axis, i0, i1, m, 0.85]); }
    else if (type === 'A') { arch(axis, i0, i1, m, zp, zn); blockers.push([axis, i0, i1, m, 0.85]); }
    else if (type === '=') { piece(axis, i0, i1, m, 0, SILL, zp, zn); arch(axis, i0, i1, m, zp, zn); blockers.push([axis, i0, i1, m, 0.6]); }
  };
  for (let r = 0; r <= ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = plan.hE[r][c];
    if (t === ' ') continue;
    const x0 = X0 + c * CELL, z = Z0 - r * CELL;
    // + side is north (the cell above), - side south
    edge('x', t, x0, x0 + CELL, z, zoneOf(c, r - 1), zoneOf(c, r), [[c, r], [c + 1, r]]);
  }
  for (let r = 0; r < ROWS; r++) for (let k = 0; k <= COLS; k++) {
    const t = plan.vE[r][k];
    if (t === ' ') continue;
    const x = X0 + k * CELL, z1 = Z0 - r * CELL;
    edge('z', t, z1 - CELL, z1, x, zoneOf(k, r), zoneOf(k - 1, r), [[k, r], [k, r + 1]]);
  }
  // corners where walls meet: a post as thick as the walls fills the gap between their ends, each face in the
  // paper of the room it looks into (no yellow stripe at the edge of the red room)
  for (const [key, top] of corner) {
    const [k, r] = key.split(',').map(Number), x = X0 + k * CELL, z = Z0 - r * CELL;
    if (plan.posts.some((p) => p[0] === k && p[1] === r)) continue;
    const face = (axis, dir) => {
      const cells = axis === 'x' ? [[dir > 0 ? k : k - 1, r - 1], [dir > 0 ? k : k - 1, r]] : [[k - 1, dir > 0 ? r - 1 : r], [k, dir > 0 ? r - 1 : r]];
      let best = ' ';
      for (const [cc, rr] of cells) { const zc = zoneOf(cc, rr); if (zc !== null && RANK[MAT(zc)] > RANK[MAT(best)]) best = zc; }
      return best;
    };
    block([x - E, 0, z - E, x + E, top, z + E], face, (k === 0 || k === COLS || r === 0 || r === ROWS) ? 0 : 0.45, false);
  }
  // a free-standing block: pillars and posts (zone: one for all faces, or (axis, dir) => the zone of that face)
  function block(b, zone, pen, light = true) {
    const [x0, y0, z0, x1, y1, z1] = b, side = typeof zone === 'function' ? (a, d) => paper(zone(a, d)) : () => paper(zone);
    solid(b, 'concrete', pen);
    wall(side('x', 1), 'x', x1, z0, z1, y0, y1, 1); wall(side('x', -1), 'x', x0, z0, z1, y0, y1, -1);
    wall(side('z', 1), 'z', z1, x0, x1, y0, y1, 1); wall(side('z', -1), 'z', z0, x0, x1, y0, y1, -1);
    trim('x', x1, z0, z1, 1); trim('x', x0, z0, z1, -1); trim('z', z1, x0, x1, 1); trim('z', z0, x0, x1, -1);
    if (y1 < H - 1e-3) flat(G('trim'), y1, x0, x1, z0, z1, 1, SCALE.trim);
    if (light) blockers.push(['b', x0, x1, z0, z1]);
  }
  for (const [k, r] of plan.posts) { const x = X0 + k * CELL, z = Z0 - r * CELL; block([x - 0.5, 0, z - 0.5, x + 0.5, H, z + 0.5], zoneOf(k, r) || ' ', 0); }

  // ---- cells: floor, holes, pillars, ceiling
  const holes = [];
  for (let r = 0; r < ROWS; r++) {
    let run = null;
    const flush = (c) => { if (run !== null) { solid([X0 + run * CELL, -0.5, Z0 - (r + 1) * CELL, X0 + c * CELL, 0, Z0 - r * CELL], 'dirt', 0); run = null; } };
    for (let c = 0; c < COLS; c++) {
      const cell = plan.cells[r][c], x0 = X0 + c * CELL, z0 = Z0 - (r + 1) * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
      const carpet = G('carpet' + (cell.zone === 'd' ? ' ' : cell.zone));
      flat(G('ceil'), H, x0, x1, z0, z1, -1, SCALE.ceil, 0.2, 0.3);
      // in the ceiling: an air vent here and there, a tile missing (cells with a panel keep theirs)
      if ((c % 2 || r % 2) && cell.what !== 'pillar') {
        const roll = rnd(), xc = x0 + CELL / 2, zc = z1 - CELL / 2;
        if (roll < 0.05) flat(G('vent'), H - 0.003, xc, xc + 0.6, zc - 0.3, zc + 0.3, -1, 0.6, xc, zc - 0.3);
        else if (roll < 0.075) flat(G('gap'), H - 0.002, xc - 0.6, xc, zc - 0.3, zc + 0.3, -1, 1);
      }
      if (cell.what === 'pillar') block([x0 + 0.5, 0, z0 + 0.5, x1 - 0.5, H, z1 - 0.5], cell.zone, 0);
      const fade = carpetShade(c, r, cell.zone);
      if (cell.what !== 'hole') {
        if (!fade) flat(carpet, 0, x0, x1, z0, z1, 1, SCALE.carpet);
        else for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) flat(carpet, 0, x0 + (a * CELL) / 4, x0 + ((a + 1) * CELL) / 4, z0 + (b * CELL) / 4, z0 + ((b + 1) * CELL) / 4, 1, SCALE.carpet, 0, 0, fade);
        if (run === null) run = c;
        continue;
      }
      flush(c);
      const m = (CELL - HOLE) / 2, hx0 = x0 + m, hx1 = x1 - m, hz0 = z0 + m, hz1 = z1 - m;
      holes.push([hx0, hz0, hx1, hz1]);
      for (const f of [[x0, z0, x1, hz0], [x0, hz1, x1, z1], [x0, hz0, hx0, hz1], [hx1, hz0, x1, hz1]]) {
        flat(carpet, 0, f[0], f[2], f[1], f[3], 1, SCALE.carpet, 0, 0, fade || flatShade);
        solid([f[0], -0.5, f[1], f[2], 0, f[3]], 'dirt', 0);
      }
      // the shaft: the carpet's edge going down into black, and walls so nobody slides off under the floor
      const v = G('void'), D = -4, dark = (q) => Math.max(0, 1 + q[1] / 0.6);
      for (const [axis, at, a, b, dir] of [['x', hx0, hz0, hz1, 1], ['x', hx1, hz0, hz1, -1], ['z', hz0, hx0, hx1, 1], ['z', hz1, hx0, hx1, -1]]) {
        const pts = axis === 'x' ? [[at, D, a], [at, D, b], [at, 0, b], [at, 0, a]] : [[a, D, at], [b, D, at], [b, 0, at], [a, 0, at]];
        v.quad(pts, axis === 'x' ? [dir, 0, 0] : [0, 0, dir], (q) => [(axis === 'x' ? q[2] : q[0]) / SCALE.carpet, q[1] / SCALE.carpet], dark);
      }
      for (const b of [[hx0 - 0.3, FALL, hz0 - 0.3, hx0, -0.5, hz1 + 0.3], [hx1, FALL, hz0 - 0.3, hx1 + 0.3, -0.5, hz1 + 0.3], [hx0, FALL, hz0 - 0.3, hx1, -0.5, hz0], [hx0, FALL, hz1, hx1, -0.5, hz1 + 0.3]]) solid(b, 'concrete', 0);
    }
    flush(COLS);
  }
  // the ceiling, and the outer walls all the way out
  solid([BOUNDS.minX - 1, H, BOUNDS.minZ - 1, BOUNDS.maxX + 1, H + 0.4, BOUNDS.maxZ + 1], 'concrete', 0);
  solid([BOUNDS.minX - 1, 0, BOUNDS.minZ - 1, BOUNDS.minX - E, H, BOUNDS.maxZ + 1], 'concrete', 0);
  solid([BOUNDS.maxX + E, 0, BOUNDS.minZ - 1, BOUNDS.maxX + 1, H, BOUNDS.maxZ + 1], 'concrete', 0);
  solid([BOUNDS.minX - 1, 0, BOUNDS.minZ - 1, BOUNDS.maxX + 1, H, BOUNDS.minZ - E], 'concrete', 0);
  solid([BOUNDS.minX - 1, 0, BOUNDS.maxZ + E, BOUNDS.maxX + 1, H, BOUNDS.maxZ + 1], 'concrete', 0);

  // ---- the panels: one flat lens each, flush with the tiles
  for (const p of PANELS) {
    const g = G(p.zone === 'r' ? 'panelr' : 'panel'), s = p.state === 0 ? 0.16 : 1, f = p.state === 2 ? 1 : 0, n = [0, -1, 0];
    const pts = [[p.x - 0.6, H - 0.004, p.z - 0.3], [p.x + 0.6, H - 0.004, p.z - 0.3], [p.x + 0.6, H - 0.004, p.z + 0.3], [p.x - 0.6, H - 0.004, p.z + 0.3]];
    const at = g.P.length / 3;
    g.quad(pts, n, (q) => [(q[0] - p.x + 0.6) / 1.2, (q[2] - p.z + 0.3) / 0.6], () => s);
    for (let i = at; i < at + 6; i++) g.C[i * 3 + 1] = f;
  }
  return { geo, boxes, blockers, holes };
}

// ---------------------------------------------------------------- the light, baked into a picture of the floor
const LR = 0.25, LW = (BOUNDS.maxX - BOUNDS.minX) / LR, LH = (BOUNDS.maxZ - BOUNDS.minZ) / LR, LMAX = 2.5;
function bake(blockers) {
  const pass = new Float32Array(LW * LH).fill(1);
  const mark = (x0, z0, x1, z1, t) => {
    const i0 = Math.max(0, Math.floor((x0 - BOUNDS.minX) / LR)), i1 = Math.min(LW - 1, Math.floor((x1 - BOUNDS.minX - 1e-6) / LR));
    const j0 = Math.max(0, Math.floor((z0 - BOUNDS.minZ) / LR)), j1 = Math.min(LH - 1, Math.floor((z1 - BOUNDS.minZ - 1e-6) / LR));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) pass[j * LW + i] = Math.min(pass[j * LW + i], t);
  };
  for (const b of blockers) {
    if (b[0] === 'b') mark(b[1], b[3], b[2], b[4], 0);
    else if (b[0] === 'x') mark(b[1] - E, b[3] - E, b[2] + E, b[3] + E, b[4]);
    else mark(b[3] - E, b[1] - E, b[3] + E, b[2] + E, b[4]);
  }
  const rgb = new Float32Array(LW * LH * 3), fl = new Float32Array(LW * LH), I0 = 0.42, RAD = 10;
  for (const L of PANELS) {
    if (L.state === 0) continue;
    const col = LIGHT[L.zone], li = (L.x - BOUNDS.minX) / LR, lj = (L.z - BOUNDS.minZ) / LR, rc = RAD / LR;
    for (let j = Math.max(0, Math.floor(lj - rc)); j <= Math.min(LH - 1, Math.ceil(lj + rc)); j++) {
      for (let i = Math.max(0, Math.floor(li - rc)); i <= Math.min(LW - 1, Math.ceil(li + rc)); i++) {
        const di = i + 0.5 - li, dj = j + 0.5 - lj, d2 = (di * di + dj * dj) * LR * LR;
        if (d2 > RAD * RAD) continue;
        // what gets through on the way there
        let t = 1;
        const steps = Math.ceil(Math.sqrt(di * di + dj * dj) / 0.7);
        for (let s = 1; s < steps && t > 0.02; s++) { const f = s / steps; t *= pass[Math.floor(lj + dj * f) * LW + Math.floor(li + di * f)]; }
        if (t <= 0.02) continue;
        const e = (I0 * t) / Math.pow(1 + d2 / 9, 1.2), o = j * LW + i;
        if (L.state === 2) fl[o] += e;
        else { rgb[o * 3] += e * col[0]; rgb[o * 3 + 1] += e * col[1]; rgb[o * 3 + 2] += e * col[2]; }
      }
    }
  }
  // A box blur along the rows, then the columns, that stops at walls (where less than half the light gets through):
  // light spreads over a room and out through its openings, never through a wall. Twice over it is soft as a bell.
  const wallBlur = (src, ch, R, rounds = 2) => {
    let a = Float32Array.from(src), b = new Float32Array(src.length);
    const line = (n, at) => {
      for (let s = 0; s < n;) {
        if (pass[at(s)] < 0.5) { for (let k = 0; k < ch; k++) b[at(s) * ch + k] = a[at(s) * ch + k]; s++; continue; }
        let e = s;
        while (e < n && pass[at(e)] >= 0.5) e++;
        for (let k = 0; k < ch; k++) {
          let acc = 0, cnt = 0;
          for (let q = s; q < Math.min(e, s + R); q++) { acc += a[at(q) * ch + k]; cnt++; }
          for (let q = s; q < e; q++) {
            if (q + R < e) { acc += a[at(q + R) * ch + k]; cnt++; }
            if (q - R - 1 >= s) { acc -= a[at(q - R - 1) * ch + k]; cnt--; }
            b[at(q) * ch + k] = acc / cnt;
          }
        }
        s = e;
      }
    };
    for (let round = 0; round < rounds; round++) {
      for (let j = 0; j < LH; j++) line(LW, (i) => j * LW + i);
      [a, b] = [b, a];
      for (let i = 0; i < LW; i++) line(LH, (j) => j * LW + i);
      [a, b] = [b, a];
    }
    return a;
  };
  // the edges of the shadows a metre wide; the light thrown back by walls and carpet on top, from a few metres round;
  // and where the lights are out, what spills in from next door only gets a little way, fading out over two metres
  const srgb = wallBlur(rgb, 3, 2), sfl = wallBlur(fl, 1, 2);
  const brgb = wallBlur(srgb, 3, 7), bfl = wallBlur(sfl, 1, 7);
  const dark = new Float32Array(LW * LH);
  for (let o = 0; o < LW * LH; o++) {
    const c = Math.floor(((o % LW) + 0.5) * LR / CELL), r = Math.floor(ROWS - (Math.floor(o / LW) + 0.5) * LR / CELL);
    dark[o] = plan.cells[r] && plan.cells[r][c] && plan.cells[r][c].zone === 'd' ? 0.42 : 1;
  }
  const dim = wallBlur(dark, 1, 4);
  const data = new Uint8Array(LW * LH * 4), lum = new Float32Array(LW * LH);
  for (let o = 0; o < LW * LH; o++) {
    for (let k = 0; k < 3; k++) data[o * 4 + k] = Math.min(255, Math.round((((srgb[o * 3 + k] + brgb[o * 3 + k] * 0.35 + 0.035) * dim[o]) / LMAX) * 255));
    data[o * 4 + 3] = Math.min(255, Math.round(((sfl[o] + bfl[o] * 0.35) / LMAX) * 255));
    lum[o] = (srgb[o * 3] + srgb[o * 3 + 1]) * 0.5 * dim[o] + sfl[o];
  }
  return { data, lum };
}

// ---------------------------------------------------------------- materials: baked light, damp stains, the own gun's flash
const U = { light: { value: null }, xf: { value: new THREE.Vector4(BOUNDS.minX, BOUNDS.minZ, 1 / (BOUNDS.maxX - BOUNDS.minX), 1 / (BOUNDS.maxZ - BOUNDS.minZ)) }, flick: { value: 1 }, flashPos: { value: new THREE.Vector3() }, flashI: { value: 0 } };
const HEAD = `uniform sampler2D bwLight; uniform vec4 bwXf; uniform float bwFlick; uniform vec3 bwFlashPos; uniform float bwFlashI;
varying vec3 vBwW; varying vec3 vBwN;
float bwH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float bwNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(bwH(i), bwH(i + vec2(1, 0)), f.x), mix(bwH(i + vec2(0, 1)), bwH(i + vec2(1, 1)), f.x), f.y); }
`;
function lit(m) {
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { bwLight: U.light, bwXf: U.xf, bwFlick: U.flick, bwFlashPos: U.flashPos, bwFlashI: U.flashI });
    s.vertexShader = 'varying vec3 vBwW; varying vec3 vBwN;\n' + s.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvBwW = (modelMatrix * vec4(transformed, 1.0)).xyz; vBwN = normalize(mat3(modelMatrix) * normal);');
    s.fragmentShader = HEAD + s.fragmentShader
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        vec3 bwN = normalize(vBwN);
        vec4 bwL = texture2D(bwLight, (vBwW.xz + bwN.xz * 0.3 - bwXf.xy) * bwXf.zw);
        vec3 bwLit = (bwL.rgb + vec3(1.0, 0.94, 0.76) * bwL.a * bwFlick) * ${LMAX.toFixed(1)};
        float bwK = bwN.y > 0.5 ? 1.0 : (bwN.y < -0.5 ? 0.5 : 0.8 + 0.05 * vBwW.y);
        float bwS = smoothstep(0.55, 0.85, bwNoise(vBwW.xz * 0.33) * 0.65 + bwNoise(vBwW.xz * 1.4 + 7.0) * 0.35);
        float bwWet = bwN.y > 0.5 ? bwS : (bwN.y < -0.5 ? 0.0 : bwS * smoothstep(0.8, 0.0, vBwW.y));
        vec3 bwFd = vBwW - bwFlashPos;
        reflectedLight.indirectDiffuse = bwLit * bwK * (1.0 - bwWet * 0.3) + vec3(1.0, 0.72, 0.42) * bwFlashI / (1.0 + dot(bwFd, bwFd) * 0.32);
        float bwLum = clamp(dot(bwLit, vec3(0.3, 0.5, 0.2)), 0.08, 1.0);`)
      // fog that is no brighter than the place it hangs in
      .replace('#include <fog_fragment>', `#ifdef USE_FOG
        float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor * bwLum, fogFactor);
        #endif`);
  };
  m.customProgramCacheKey = () => 'bw69-backrooms-lit';
  return m;
}
function panelMat(map, color) {
  const m = new THREE.MeshBasicMaterial({ map, color, vertexColors: true, fog: false });
  m.onBeforeCompile = (s) => {
    s.uniforms.bwFlick = U.flick;
    s.fragmentShader = 'uniform float bwFlick;\n' + s.fragmentShader.replace('#include <color_fragment>', 'diffuseColor.rgb *= vColor.r * mix(1.0, 0.08 + 0.92 * bwFlick, vColor.g);');
  };
  m.customProgramCacheKey = () => 'bw69-backrooms-panel';
  return m;
}

// What only has to be worked out once: the same on every computer, nothing random about it.
let built = null, baked = null;
const flicker = (t) => {
  const h = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
  if (h(Math.floor(t * 0.6)) < 0.5) return 1;
  const k = h(Math.floor(t * 13));
  return k > 0.62 ? 0.06 : k > 0.48 ? 0.5 : 1;
};

export default {
  id: 'backrooms',
  name: 'BACKROOMS',
  desc: 'Level 0: endlose gelbe Hinterzimmer, feuchter Teppich, brummende Neonröhren. Säulenhalle, Bogenräume, der rote Raum, Löcher im Boden und eine Zone, in der das Licht ausgefallen ist.',
  size: 'Klein',
  env: {
    sunDir: [0.08, 1, 0.12],
    sunColor: 0xfff0d0, sunIntensity: 1.1,
    skyTop: 0x5a4e22, skyHorizon: 0x96843e, skyBottom: 0x4a4020,
    cloudColor: 0xffffff, clouds: 0,
    hemiSky: 0xfff0c4, groundColor: 0x9a8650, ambient: 1.5,
    fogColor: 0x9c8a50, fogNear: 14, fogFar: 80,
  },
  bounds: BOUNDS,
  navClimb: 1.3,
  navTop: 2,          // the tops of lintels and the ceiling are no floor
  spawnMinY: -0.1,
  mmCeiling: 2.2,     // the minimap leaves out what hangs over the doors
  menuOrbit: { y: 1.7, r: 2.6, rz: 2.6, look: [0, 1.4, 6] },
  indoor: true,
  previewBoxes() {
    if (!built) built = build();
    return built.boxes.filter((b) => b[4] > 0.4 && b[1] < 0.1 && b[3] - b[0] < 40 && b[5] - b[2] < 40).map((b) => [b[0], b[2], b[3], b[5], b[4]]);
  },

  build(B) {
    if (!built) built = build();
    if (!baked) baked = bake(built.blockers);
    for (const b of built.boxes) B.col.add(b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]);
    // (floor and ceiling are mostly seen at a flat angle)
    const tex = (name) => { const t = B.tex.generate(name).map; if (name !== 'wood' && t.anisotropy !== B.engine.maxAnisotropy) { t.anisotropy = B.engine.maxAnisotropy; t.needsUpdate = true; } return t; };
    if (!U.light.value) {
      const t = new THREE.DataTexture(baked.data, LW, LH, THREE.RGBAFormat);
      t.magFilter = t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
      U.light.value = t;
    }
    const mats = {};
    for (const z of [' ', 'p', 'r']) {
      mats['paper' + z] = lit(new THREE.MeshBasicMaterial({ map: tex('wallpaper'), color: PAPER[z], vertexColors: true }));
      mats['carpet' + z] = lit(new THREE.MeshBasicMaterial({ map: tex('berber'), color: CARPET[z], vertexColors: true }));
    }
    mats.ceil = lit(new THREE.MeshBasicMaterial({ map: tex('ceiltile'), color: 0xf4eedc, vertexColors: true }));
    mats.trim = lit(new THREE.MeshBasicMaterial({ map: tex('wood'), color: 0xc8b48c, vertexColors: true }));
    mats.panel = panelMat(tex('troffer'), 0xfffaf0);
    mats.panelr = panelMat(tex('troffer'), 0xff6a5a);
    mats.plate = lit(new THREE.MeshBasicMaterial({ color: 0xece2c6, vertexColors: true }));
    mats.slot = lit(new THREE.MeshBasicMaterial({ color: 0x2c2418, vertexColors: true }));
    mats.vent = lit(new THREE.MeshBasicMaterial({ map: tex('metal'), color: 0xa4a49a, vertexColors: true }));
    mats.void = new THREE.MeshBasicMaterial({ map: tex('berber'), color: 0x2a2216, vertexColors: true, fog: false });
    mats.gap = new THREE.MeshBasicMaterial({ color: 0x080604, fog: false });
    for (const [k, g] of Object.entries(built.geo)) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(g.P, 3));
      geom.setAttribute('normal', new THREE.Float32BufferAttribute(g.N, 3));
      geom.setAttribute('uv', new THREE.Float32BufferAttribute(g.U, 2));
      geom.setAttribute('color', new THREE.Float32BufferAttribute(g.C, 3));
      geom.computeBoundingSphere();
      const mesh = new THREE.Mesh(geom, mats[k]);
      mesh.matrixAutoUpdate = false;
      B.root.add(mesh);
    }
  },

  // the same light for whoever stands in it: how bright it is here, and the hum of the tubes with it
  lightAt(x, z) {
    if (!baked) return 1;
    const i = Math.min(LW - 1, Math.max(0, Math.floor((x - BOUNDS.minX) / LR))), j = Math.min(LH - 1, Math.max(0, Math.floor((z - BOUNDS.minZ) / LR)));
    return baked.lum[j * LW + i];
  },

  unload(game) {
    if (this.hum) { this.hum.stop(); this.hum = null; }
    game.audio.setIndoor(0);
    game.audio.setWind(0.16);
  },
  update(game, dt) {
    U.flick.value = flicker(game.time);
    const L = game.muzzleLight;
    if (L) { U.flashPos.value.copy(L.position); U.flashI.value = Math.min(1.1, L.intensity * 0.05); }
    // no wind in here, rooms that echo, and the hum: loud under the lights, gone where they are out, stuttering with them
    if (!this.hum && game.audio.ready) { this.hum = game.audio.loop('hum', 0); game.audio.setIndoor(0.85); game.audio.setWind(0.015); }
    if (this.hum) {
      const c = game.engine.camera.position, here = Math.min(1.4, this.lightAt(c.x, c.z));
      this.hum.set((0.012 + 0.05 * here) * (0.55 + 0.45 * U.flick.value), 1);
    }
    void dt;
  },

  spawns() {
    const S = { 0: [], 1: [] };
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const s = plan.cells[r][c].spawn;
      if (s === false) continue;
      S[s].push([X0 + c * CELL + CELL / 2, 0, Z0 - r * CELL - CELL / 2, s === 0 ? -Math.PI / 2 : Math.PI / 2]);
    }
    return S;
  },

  // where the fights are
  hotspots: [
    [0, 0, 2], [-6, 0, 6], [6, 0, 6], [-6, 0, -2], [6, 0, -2], [0, 0, -6], [0, 0, 13], [-5, 0, 15], [5, 0, 15], [-3, 0, 18], [3, 0, 18],
    [-15, 0, 14], [15, 0, 14], [-20, 0, 18], [20, 0, 18], [-13, 0, 18], [13, 0, 18], [-14, 0, 8], [14, 0, 8], [-14, 0, -2], [14, 0, -2],
    [-21, 0, 2], [21, 0, 2], [-20, 0, -14], [20, 0, -14], [-12, 0, -14], [12, 0, -14], [-4, 0, -12], [4, 0, -12], [0, 0, -17], [-5, 0, -18], [5, 0, -18],
  ],
};
