import * as THREE from 'three';
import { MATERIALS } from './mapBuilder.js';
import { railing, mtx, wallX, wallZ } from './props.js';
import { furnish, STYLE, T, SLAB, rnd, pick, chance } from './furniture.js';

// =============================================================================
// The building kit. A house is written once in its own frame (center at 0,0,
// front toward +z) and placed anywhere, turned in quarter steps or mirrored.
//   Kit  : that frame, with the map builder's calls and where things are reported
//   Plan : one storey, given only as rooms and what connects them. Walls, skins,
//          windows, doors and frames follow from which rooms lie next to each other.
// Walls are invisible collision boxes; what you see are the faces of the rooms on
// either side, so every room has its own wallpaper and floor.
// =============================================================================
export { T, SLAB, rnd, pick, chance };
export const BASE = 0.15, SLOPE = 0.8;
export const PLAIN = { ao: false, skirt: false };
export const WALL = { ao: false, skirt: false, faces: '+x-x+z-z' };
const DECO = { collide: false, skirt: false, ao: false };
const ROT = [[1, 0, 0, 1], [0, 1, -1, 0], [-1, 0, 0, -1], [0, -1, 1, 0]];

// ---------------------------------------------------------------------------
// rectangles [x0, z0, x1, z1]
// ---------------------------------------------------------------------------
export function subtract(rects, holes) {
  let cur = rects;
  for (const h of holes) {
    const next = [];
    for (const r of cur) {
      const ix0 = Math.max(r[0], h[0]), iz0 = Math.max(r[1], h[1]), ix1 = Math.min(r[2], h[2]), iz1 = Math.min(r[3], h[3]);
      if (ix0 >= ix1 - 1e-4 || iz0 >= iz1 - 1e-4) { next.push(r); continue; }
      if (r[1] < iz0 - 1e-4) next.push([r[0], r[1], r[2], iz0]);
      if (iz1 < r[3] - 1e-4) next.push([r[0], iz1, r[2], r[3]]);
      if (r[0] < ix0 - 1e-4) next.push([r[0], iz0, ix0, iz1]);
      if (ix1 < r[2] - 1e-4) next.push([ix1, iz0, r[2], iz1]);
    }
    cur = next;
  }
  return cur;
}

// the outline of a union of rectangles: runs along x or z with the side that faces outward
export function perimeter(rects) {
  const inside = (x, z) => rects.some((r) => x > r[0] && x < r[2] && z > r[1] && z < r[3]);
  const uniq = (l) => [...new Set(l.map((v) => +v.toFixed(3)))].sort((a, b) => a - b);
  const segs = [];
  const collect = (ax) => {
    const lines = uniq(rects.flatMap((r) => (ax === 'x' ? [r[1], r[3]] : [r[0], r[2]])));
    const cuts = uniq(rects.flatMap((r) => (ax === 'x' ? [r[0], r[2]] : [r[1], r[3]])));
    for (const line of lines) {
      let run = null;
      for (let i = 0; i + 1 < cuts.length; i++) {
        const a = cuts[i], b = cuts[i + 1], m = (a + b) / 2;
        const plus = ax === 'x' ? inside(m, line + 0.01) : inside(line + 0.01, m), minus = ax === 'x' ? inside(m, line - 0.01) : inside(line - 0.01, m);
        const out = plus && !minus ? -1 : !plus && minus ? 1 : 0;
        if (out && run && run.out === out && Math.abs(run.a1 - a) < 1e-3) run.a1 = b;
        else if (out) { run = { ax, line, a0: a, a1: b, out }; segs.push(run); } else run = null;
      }
    }
  };
  collect('x'); collect('z');
  return segs;
}

// ---------------------------------------------------------------------------
// The frame
// ---------------------------------------------------------------------------
export class Kit {
  constructor(b, out, o = {}) {
    this.b = b; this.out = out; this.y = o.y ?? 0;
    this.house = out.houses = (out.houses || 0) + 1;
    const [a, c, e, f] = ROT[(o.rot || 0) & 3], m = o.mirror ? -1 : 1;
    this.set(a * m, c, e * m, f, o.x || 0, o.z || 0);
  }
  set(a, b, c, d, tx, tz) { this.A = a; this.B = b; this.C = c; this.D = d; this.tx = tx; this.tz = tz; this.fm = new Map(); this.M = null; }
  sub(x, z, q = 0, mirror = false, dy = 0) {
    const [a2, b2, c2, d2] = ROT[q & 3], m = mirror ? -1 : 1;
    const s = Object.create(Kit.prototype);
    s.b = this.b; s.out = this.out; s.y = this.y + dy; s.house = this.house;
    s.set(this.A * a2 * m + this.B * c2 * m, this.A * b2 + this.B * d2, this.C * a2 * m + this.D * c2 * m, this.C * b2 + this.D * d2, this.A * x + this.B * z + this.tx, this.C * x + this.D * z + this.tz);
    s.loc = [a2 * m, b2, c2 * m, d2, x, z];
    return s;
  }
  // a rectangle given in this sub frame, in the frame it came from
  up(r) {
    const [a, b, c, d, x, z] = this.loc;
    const ax = a * r[0] + b * r[1] + x, az = c * r[0] + d * r[1] + z, ex = a * r[2] + b * r[3] + x, ez = c * r[2] + d * r[3] + z;
    return [Math.min(ax, ex), Math.min(az, ez), Math.max(ax, ex), Math.max(az, ez)];
  }
  faces(str) {
    let r = this.fm.get(str);
    if (r) return r;
    r = str.replace(/([+-])([xz])/g, (_, s, ax) => {
      const v = s === '+' ? 1 : -1, lx = ax === 'x' ? v : 0, lz = ax === 'z' ? v : 0;
      const wx = this.A * lx + this.B * lz, wz = this.C * lx + this.D * lz;
      return wx ? (wx > 0 ? '+x' : '-x') : (wz > 0 ? '+z' : '-z');
    });
    this.fm.set(str, r);
    return r;
  }
  box(x0, y0, z0, x1, y1, z1, mat, o) {
    const { A, B, C, D, tx, tz, y } = this;
    if (o && o.faces) o = { ...o, faces: this.faces(o.faces) };
    this.b.box(A * x0 + B * z0 + tx, y0 + y, C * x0 + D * z0 + tz, A * x1 + B * z1 + tx, y1 + y, C * x1 + D * z1 + tz, mat, o);
    return this;
  }
  boxC(cx, cz, w, d, y, h, mat, o) { return this.box(cx - w / 2, y, cz - d / 2, cx + w / 2, y + h, cz + d / 2, mat, o); }
  matrix() {
    if (!this.M) this.M = new THREE.Matrix4().set(this.A, 0, this.B, this.tx, 0, 1, 0, this.y, this.C, 0, this.D, this.tz, 0, 0, 0, 1);
    return this.M;
  }
  geom(g, mat, m, o) { this.b.geom(g, mat, m ? this.matrix().clone().multiply(m) : this.matrix(), o); return this; }
  glassPane(x0, y0, z0, x1, y1, z1, t) {
    const { A, B, C, D, tx, tz, y } = this;
    this.b.glassPane(A * x0 + B * z0 + tx, y0 + y, C * x0 + D * z0 + tz, A * x1 + B * z1 + tx, y1 + y, C * x1 + D * z1 + tz, t);
    return this;
  }
  pointLight(x, yy, z, c, i, d) { this.b.pointLight(this.A * x + this.B * z + this.tx, yy + this.y, this.C * x + this.D * z + this.tz, c, i, d); return this; }
  w(x, z) { return [this.A * x + this.B * z + this.tx, this.C * x + this.D * z + this.tz]; }
  spot(x, y, z, o = {}) { const [wx, wz] = this.w(x, z); this.out.spots.push({ x: wx, y: y + this.y, z: wz, indoor: o.indoor ?? true, kind: o.kind || 'floor', ground: o.ground, house: this.house }); }
  vehicle(type, x, z, yaw = 0) {
    const [wx, wz] = this.w(x, z), fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    this.out.vehicles.push({ type, x: wx, z: wz, yaw: Math.atan2(-(this.A * fx + this.B * fz), -(this.C * fx + this.D * fz)) });
  }
  // the area bots need a fine grid for, and the shape on the small map
  area(x0, z0, x1, z1, floors = 1, m = 2) {
    const [ax, az] = this.w(x0, z0), [ex, ez] = this.w(x1, z1);
    const X0 = Math.min(ax, ex), X1 = Math.max(ax, ex), Z0 = Math.min(az, ez), Z1 = Math.max(az, ez);
    this.out.navRects.push([X0 - m, Z0 - m, X1 + m, Z1 + m]);
    if (floors) this.out.footprints.push([X0, Z0, X1, Z1, floors]);
  }
}

// ---------------------------------------------------------------------------
// Openings
// ---------------------------------------------------------------------------
function wallSegs(p, q, ops, H) {
  const list = ops.map((o) => ({ s: Math.max(p, o.c - o.w / 2), e: Math.min(q, o.c + o.w / 2), y: o.y, h: o.h })).filter((o) => o.e > o.s + 1e-3).sort((a, b) => a.s - b.s);
  const out = [];
  let cur = p;
  for (const o of list) {
    if (o.s > cur + 1e-3) out.push([cur, o.s, 0, H]);
    if (o.y > 0.01) out.push([o.s, o.e, 0, o.y]);
    if (o.y + o.h < H - 0.01) out.push([o.s, o.e, o.y + o.h, H]);
    cur = Math.max(cur, o.e);
  }
  if (cur < q - 1e-3) out.push([cur, q, 0, H]);
  return out;
}

export function bays(a0, a1, bay) {
  const len = a1 - a0, n = Math.max(1, Math.floor(len / bay)), step = len / n, out = [];
  for (let i = 0; i < n; i++) out.push(a0 + step * (i + 0.5));
  return out;
}

// ---------------------------------------------------------------------------
// One storey
// ---------------------------------------------------------------------------
export class Plan {
  constructor(K, y, h, o = {}) {
    Object.assign(this, {
      K, y, h, ext: 'plasterWhite', frame: 'woodDark', ceil: 'plasterWhite', t: T, ground: false, shutter: null, flower: 0, leaf: 'woodPale',
      wallDefault: 'plasterGrey', floorDefault: 'concreteFloor', pen: 0.5, extPen: 0, bay: 3.2, winW: 1.5, winY: 0.95, winH: 1.35, plinth: null, plinthH: 0.55, timber: null, stairMat: 'concreteDark', railMat: 'metalDark', noWin: false,
    }, o);
    this.rooms = []; this.links = []; this.holes = []; this.keep = []; this.extra = []; this.balconies = []; this.built = false;
  }
  room(x0, z0, x1, z1, type = 'empty', o = {}) {
    const st = STYLE[type] || STYLE.empty;
    const r = { x0, z0, x1, z1, type, wall: o.wall ?? pick(st.walls), floor: o.floor ?? pick(st.floors), outdoor: false, edges: {}, win: {}, exts: [], doors: [], wins: [], ...o };
    if (type === 'stair' && !o.win) r.noWin = true;
    this.rooms.push(r);
    return r;
  }
  door(a, b, o = {}) { this.links.push({ a, b, kind: 'door', w: 1.75, h: 2.35, ...o }); return this; }
  arch(a, b, o = {}) { this.links.push({ a, b, kind: 'arch', w: 2.6, h: 2.6, leaf: false, ...o }); return this; }
  open(a, b) { this.links.push({ a, b, kind: 'none' }); return this; }
  out(a, side, o = {}) { a.exts.push({ side, w: 1.85, h: 2.4, ...o }); return this; }
  win(a, side, spec) { a.win[side] = spec; return this; }
  edge(a, sides, kind = 'rail') { for (const s of sides) a.edges[s] = kind; return this; }
  hole(x0, z0, x1, z1) { this.holes.push([x0, z0, x1, z1]); return this; }
  // a balcony in front of a room: its door and the platform outside
  balcony(a, side, o = {}) {
    const at = o.at ?? (side === 'n' || side === 's' ? (a.x0 + a.x1) / 2 : (a.z0 + a.z1) / 2);
    this.out(a, side, { at, w: 1.75, h: 2.3, balcony: true });
    this.balconies.push({ side, at, w: o.w || 3.6, d: o.d || 1.5, rail: o.rail, a });
    return this;
  }

  // ---- which wall lies where
  pieces() {
    const lines = new Map();
    const add = (ax, line, a0, a1, r, sgn, side) => {
      const k = ax + line.toFixed(3);
      if (!lines.has(k)) lines.set(k, { ax, line, e: [] });
      lines.get(k).e.push({ a0, a1, r, sgn, side });
    };
    for (const r of this.rooms) {
      add('x', r.z0, r.x0, r.x1, r, 1, 'n'); add('x', r.z1, r.x0, r.x1, r, -1, 's');
      add('z', r.x0, r.z0, r.z1, r, 1, 'w'); add('z', r.x1, r.z0, r.z1, r, -1, 'e');
    }
    const out = [];
    for (const L of lines.values()) {
      const pts = [...new Set(L.e.flatMap((e) => [+e.a0.toFixed(3), +e.a1.toFixed(3)]))].sort((a, b) => a - b);
      let prev = null;
      for (let i = 0; i + 1 < pts.length; i++) {
        const p = pts[i], q = pts[i + 1], m = (p + q) / 2;
        const up = L.e.find((e) => e.sgn > 0 && e.a0 < m && e.a1 > m), dn = L.e.find((e) => e.sgn < 0 && e.a0 < m && e.a1 > m);
        if (!up && !dn) { prev = null; continue; }
        const pc = { ax: L.ax, line: L.line, p, q, A: up ? up.r : null, B: dn ? dn.r : null, sA: up && up.side, sB: dn && dn.side, ops: [], kind: 'wall', ea: 0, eb: 0 };
        const inA = pc.A && !pc.A.outdoor, inB = pc.B && !pc.B.outdoor;
        if (inA && inB) pc.kind = 'wall';
        else if (inA || inB) {
          const room = inA ? pc.A : pc.B, side = inA ? pc.sA : pc.sB;
          pc.kind = room.edges[side] || 'ext'; pc.room = room; pc.side = side; pc.extSign = inA ? -1 : 1;
          pc.other = inA ? pc.B : pc.A;
        } else {
          const room = pc.A || pc.B, side = pc.A ? pc.sA : pc.sB;
          pc.kind = (pc.A && pc.B) ? 'none' : room.edges[side] || 'none'; pc.room = room; pc.side = side; pc.extSign = pc.A ? -1 : 1;
        }
        out.push(pc);
        if (prev && prev.q === p) { prev.joined = true; pc.joinedB = true; }
        prev = pc;
      }
    }
    return out;
  }

  build() {
    if (this.built) return;
    this.built = true;
    const pcs = this.pieces();
    // ---- links between rooms
    for (const L of this.links) {
      const pc = pcs.find((c) => (c.A === L.a && c.B === L.b) || (c.A === L.b && c.B === L.a));
      if (!pc) { console.warn('kit: rooms do not touch', L.a.type, L.b.type); continue; }
      if (L.kind === 'none') { pc.kind = 'none'; continue; }
      const room = pc.q - pc.p, w = Math.min(L.w, room - 0.3);
      const c = Math.max(pc.p + w / 2 + 0.15, Math.min(pc.q - w / 2 - 0.15, L.at ?? (pc.p + pc.q) / 2));
      this.addOp(pc, { c, w, y: 0, h: L.h, door: true, leaf: L.leaf, frame: L.frame, fm: L.fm });
    }
    // ---- outside doors
    for (const r of this.rooms) for (const E of r.exts) {
      const list = pcs.filter((c) => c.room === r && c.side === E.side && c.kind === 'ext');
      if (!list.length) { console.warn('kit: no outside wall for door', r.type, E.side); continue; }
      let pc = list[0];
      if (E.at !== undefined) pc = list.find((c) => E.at >= c.p && E.at <= c.q) || pc;
      else pc = list.reduce((a, c) => (c.q - c.p > a.q - a.p ? c : a));
      const w = Math.min(E.w, pc.q - pc.p - 0.3);
      const c = Math.max(pc.p + w / 2 + 0.15, Math.min(pc.q - w / 2 - 0.15, E.at ?? (pc.p + pc.q) / 2));
      this.addOp(pc, { c, w, y: E.y ?? 0, h: E.h, door: !E.y, ext: true, leaf: E.leaf, frame: E.frame, fm: E.fm, gate: E.gate });
    }
    // ---- windows
    for (const pc of pcs) {
      if (pc.kind !== 'ext' || this.noWin) continue;
      const r = pc.room, spec = r.win[pc.side];
      if (spec === false || (r.noWin && !spec)) continue;
      const S = { bay: this.bay, w: this.winW, y: this.winY, h: this.winH, ...spec };
      const a0 = pc.p + 0.35, a1 = pc.q - 0.35;
      if (a1 - a0 < S.w + 0.2) continue;
      const list = S.at ? S.at.filter((c) => c > pc.p && c < pc.q) : bays(a0, a1, S.bay);
      for (const c of list) {
        const s = c - S.w / 2, e = c + S.w / 2;
        if (s < pc.p + 0.25 || e > pc.q - 0.25) continue;
        if (pc.ops.some((o) => s < o.c + o.w / 2 + 0.3 && e > o.c - o.w / 2 - 0.3)) continue;
        this.addOp(pc, { c, w: S.w, y: S.y, h: S.h, win: true, frame: S.frame, fm: S.fm, glass: S.glass, plainWin: S.plain });
      }
    }
    // ---- ends of a run of wall close the corner
    for (const pc of pcs) { pc.ea = pc.joinedB ? 0 : this.t / 2; pc.eb = pc.joined ? 0 : this.t / 2; }
    for (const pc of pcs) this.emit(pc);
    this.emitFloor();
    for (const B of this.balconies) this.emitBalcony(B);
    for (const r of this.rooms) if (!r.outdoor || r.fill !== false) furnish(this, r);
  }

  addOp(pc, op) {
    pc.ops.push(op);
    for (const [r, s] of [[pc.A, pc.sA], [pc.B, pc.sB]]) {
      if (!r) continue;
      if (op.door) r.doors.push({ ax: pc.ax, line: pc.line, c: op.c, w: op.w });
      else r.wins.push({ side: s, s: op.c - op.w / 2, e: op.c + op.w / 2, y: op.y });
    }
  }

  skin(pc, sign, a, b, mat, H, base = 0) {
    const K = this.K, Y = this.y + base, off = sign * this.t / 2, line = pc.line + off;
    const f = pc.ax === 'x' ? (sign > 0 ? '+z' : '-z') : (sign > 0 ? '+x' : '-x');
    for (const [s, e, ya, yb] of wallSegs(a, b, pc.ops, H)) {
      const o = { collide: false, skirt: false, ao: ya < 0.01 && yb - ya > 0.8, faces: f };
      if (pc.ax === 'x') K.box(s, Y + ya, line, e, Y + yb, line, mat, o);
      else K.box(line, Y + ya, s, line, Y + yb, e, mat, o);
    }
  }

  emit(pc) {
    const K = this.K, t = this.t, Y = this.y, ax = pc.ax, line = pc.line;
    if (pc.kind === 'none') return;
    if (pc.kind === 'rail') {
      const a = pc.p, b = pc.q;
      if (ax === 'x') railing(K, a, line, b, line, 1.05, this.railMat, true, Y);
      else railing(K, line, a, line, b, 1.05, this.railMat, true, Y);
      return;
    }
    const low = pc.kind === 'low';
    const H = low ? (pc.room.lowH ?? 1.1) : pc.kind === 'ext' ? this.h : this.h - SLAB;
    const colH = low ? H : this.h;
    const p = pc.p - pc.ea, q = pc.q + pc.eb;
    // ---- what you bump into
    const extLike = pc.kind === 'ext' || low;
    const mat = extLike ? (pc.other && pc.other.outdoor && pc.other.extMat) || this.ext || 'plasterGrey' : 'plasterGrey';
    const col = { visual: false, pen: extLike ? this.extPen : this.pen };
    for (const [s, e, ya, yb] of wallSegs(p, q, pc.ops, colH)) {
      if (ax === 'x') K.box(s, Y + ya, line - t / 2, e, Y + yb, line + t / 2, mat, col);
      else K.box(line - t / 2, Y + ya, s, line + t / 2, Y + yb, e, mat, col);
    }
    // ---- what you see
    if (extLike) {
      const inner = pc.room;
      if (this.ext) this.skin(pc, pc.extSign, p, q, mat, H);
      if (low) {
        this.skin(pc, -pc.extSign, p, q, this.ext || inner.wall, H);
        const m = inner.lowTop || 'concreteDark';
        if (ax === 'x') K.box(p, Y + H, line - t / 2 - 0.02, q, Y + H + 0.03, line + t / 2 + 0.02, m, { ...DECO });
        else K.box(line - t / 2 - 0.02, Y + H, p, line + t / 2 + 0.02, Y + H + 0.03, q, m, { ...DECO });
      } else this.skin(pc, -pc.extSign, pc.p, pc.q, inner.wall, this.h - SLAB);
    } else {
      this.skin(pc, 1, pc.p, pc.q, pc.A.wall, H);
      this.skin(pc, -1, pc.p, pc.q, pc.B.wall, H);
    }
    // ---- frames and what hangs on them
    for (const op of pc.ops) {
      this.frameOp(pc, op);
      if (pc.kind === 'ext') this.dress(pc, op);
    }
    if (pc.kind === 'ext' && this.plinth) this.plinthRun(pc, p, q);
    if (pc.kind === 'ext' && this.timber) this.timberRun(pc, p, q);
  }

  frameOp(pc, op) {
    if (op.frame === false) return;
    const K = this.K, Y = this.y, ax = pc.ax, line = pc.line, m = op.fm || this.frame, d = this.t / 2 + 0.025, jw = op.gate ? 0.18 : 0.08;
    const s = op.c - op.w / 2, e = op.c + op.w / 2, y0 = op.y, y1 = op.y + op.h;
    const put = (a, b, ya, yb, dd, fx, fz) => {
      const o = { ...DECO, faces: ax === 'x' ? fx : fz };
      if (ax === 'x') K.box(a, Y + ya, line - dd, b, Y + yb, line + dd, m, o);
      else K.box(line - dd, Y + ya, a, line + dd, Y + yb, b, m, o);
    };
    put(s, s + jw, y0, y1, d, '+x+z-z', '+z+x-x');
    put(e - jw, e, y0, y1, d, '-x+z-z', '-z+x-x');
    put(s, e, y1 - jw, y1, d, '-y+z-z', '-y+x-x');
    if (y0 > 0.01) put(s - 0.05, e + 0.05, y0 - 0.04, y0 + 0.03, d + 0.05, '+y-y+x-x+z-z', '+y-y+x-x+z-z');
    // a door stands wide open against the wall beside its opening
    if (op.door && op.leaf !== false && !op.gate && op.w < 2.3) {
      const lw = Math.min(0.95, op.w * 0.6), sign = chance(0.5) ? 1 : -1, off = sign * (this.t / 2 + 0.03);
      const free = (a, b) => a > pc.p + 0.1 && b < pc.q - 0.1 && !pc.ops.some((o) => o !== op && a < o.c + o.w / 2 + 0.05 && b > o.c - o.w / 2 - 0.05);
      const a = free(e, e + lw) ? e : free(s - lw, s) ? s - lw : null;
      if (a !== null) {
        const o = { ...DECO, faces: '+x-x+z-z+y' };
        if (ax === 'x') K.box(a, Y, line + off - 0.02, a + lw, Y + op.h - 0.1, line + off + 0.02, this.leaf, o);
        else K.box(line + off - 0.02, Y, a, line + off + 0.02, Y + op.h - 0.1, a + lw, this.leaf, o);
      }
    }
    if (op.glass) {
      const g = 0.01;
      if (ax === 'x') K.glassPane(s + jw, Y + y0 + 0.03, line - g, e - jw, Y + y1 - jw, line + g);
      else K.glassPane(line - g, Y + y0 + 0.03, s + jw, line + g, Y + y1 - jw, e - jw);
    }
  }

  // shutters and flower boxes on the street side
  dress(pc, op) {
    if (!op.win || op.plainWin) return;
    const K = this.K, Y = this.y, ax = pc.ax, sg = pc.extSign, o0 = pc.line + sg * this.t / 2;
    const s = op.c - op.w / 2, e = op.c + op.w / 2;
    const bx = (a, b, ya, yb, d0, d1, m) => {
      const n0 = o0 + sg * d0, n1 = o0 + sg * d1;
      if (ax === 'x') K.box(a, Y + ya, n0, b, Y + yb, n1, m, { ...DECO });
      else K.box(n0, Y + ya, a, n1, Y + yb, b, m, { ...DECO });
    };
    if (this.shutter) {
      const sw = Math.min(0.62, op.w * 0.45);
      if (s - sw > pc.p + 0.1 && e + sw < pc.q - 0.1 && !pc.ops.some((o) => o !== op && (Math.abs(o.c - op.c) < (o.w + op.w) / 2 + sw + 0.05))) {
        bx(s - sw, s, op.y, op.y + op.h, 0, 0.035, this.shutter); bx(e, e + sw, op.y, op.y + op.h, 0, 0.035, this.shutter);
      }
    }
    if (this.flower && Math.random() < this.flower && !this.ground) {
      bx(s + 0.02, e - 0.02, op.y - 0.2, op.y, 0.03, 0.25, 'woodDark');
      bx(s + 0.05, e - 0.05, op.y, op.y + 0.16, 0.04, 0.24, pick(['foliage', 'foliageDark', 'canvasRed']));
    }
  }

  plinthRun(pc, p, q) {
    const K = this.K, Y = this.y, sg = pc.extSign, n0 = pc.line + sg * this.t / 2, n1 = n0 + sg * 0.05, H = this.plinthH;
    const f = pc.ax === 'x' ? (sg > 0 ? '+z' : '-z') : (sg > 0 ? '+x' : '-x');
    for (const [s, e, ya, yb] of wallSegs(p, q, pc.ops.filter((o) => o.y < H), H)) {
      const o = { ...DECO, faces: f + '+y' };
      if (pc.ax === 'x') K.box(s, Y + ya, n0, e, Y + yb, n1, this.plinth, o);
      else K.box(n0, Y + ya, s, n1, Y + yb, e, this.plinth, o);
    }
  }

  // half timbering: dark beams along the floors, posts beside the windows
  timberRun(pc, p, q) {
    const K = this.K, Y = this.y, sg = pc.extSign, n0 = pc.line + sg * this.t / 2, n1 = n0 + sg * 0.03, m = this.timber, H = this.h;
    const bx = (a, b, ya, yb) => {
      if (pc.ax === 'x') K.box(a, Y + ya, n0, b, Y + yb, n1, m, { ...DECO });
      else K.box(n0, Y + ya, a, n1, Y + yb, b, m, { ...DECO });
    };
    bx(p, q, H - 0.2, H);
    for (const [s, e, ya, yb] of wallSegs(p, q, pc.ops, 0.2)) bx(s, e, ya, yb);
    const posts = [p + 0.08, q - 0.08];
    for (const o of pc.ops) if (o.win) posts.push(o.c - o.w / 2 - 0.1, o.c + o.w / 2 + 0.1);
    for (const x of posts) if (!pc.ops.some((o) => x > o.c - o.w / 2 - 0.05 && x < o.c + o.w / 2 + 0.05)) bx(x - 0.08, x + 0.08, 0, H);
  }

  emitFloor() {
    const K = this.K, y = this.y, holes = this.holes, parts = [], rects = this.rooms.map((r) => [r.x0, r.z0, r.x1, r.z1]);
    this.rooms.forEach((r, i) => { if (!r.noFloor) for (const q of subtract([rects[i]], holes)) parts.push([q, r.floor]); });
    for (const e of this.extra) for (const q of subtract([e.rect], [...holes, ...rects])) parts.push([q, e.floor || this.floorDefault]);
    for (const [q, mat] of parts) {
      K.box(q[0], y - SLAB, q[1], q[2], y, q[3], mat, { ...PLAIN, faces: '+y' });
      if (!this.ground) K.box(q[0], y - SLAB, q[1], q[2], y, q[3], this.ceil, { ...DECO, faces: '-y+x-x+z-z' });
    }
  }

  emitBalcony(B) {
    const K = this.K, y = this.y, s = B.side, hw = B.w / 2, t = this.t / 2, r = B.a, m = B.rail || this.railMat;
    const sg = s === 'n' || s === 'w' ? -1 : 1, line = s === 'n' ? r.z0 : s === 's' ? r.z1 : s === 'w' ? r.x0 : r.x1;
    const n0 = line + sg * t, n1 = line + sg * (t + B.d), c = B.at;
    if (s === 'n' || s === 's') {
      K.box(c - hw, y - 0.16, Math.min(n0, n1), c + hw, y, Math.max(n0, n1), 'concrete', { ...PLAIN });
      railing(K, c - hw, n1, c + hw, n1, 1.05, m, true, y);
      railing(K, c - hw, n0, c - hw, n1, 1.05, m, true, y); railing(K, c + hw, n0, c + hw, n1, 1.05, m, true, y);
    } else {
      K.box(Math.min(n0, n1), y - 0.16, c - hw, Math.max(n0, n1), y, c + hw, 'concrete', { ...PLAIN });
      railing(K, n1, c - hw, n1, c + hw, 1.05, m, true, y);
      railing(K, n0, c - hw, n1, c - hw, 1.05, m, true, y); railing(K, n0, c + hw, n1, c + hw, 1.05, m, true, y);
    }
  }
}

// ---------------------------------------------------------------------------
// Stairs
// ---------------------------------------------------------------------------
const Q_DIR = { '+z': 0, '+x': 1, '-z': 2, '-x': 3 };
// open treads rising in the sub frame's +z, the flight's start at z = 0, centered on x = 0
function treads(s, width, rise, run, mat) {
  const n = Math.max(2, Math.round(rise / 0.25)), sh = rise / n, sd = run / n;
  for (let i = 0; i < n; i++) {
    const top = sh * (i + 1), bot = Math.max(0, top - 0.32);
    s.box(-width / 2, bot, sd * i, width / 2, top, sd * (i + 1), mat, PLAIN);
  }
}
export function stairRun(h) { return (h / 2) / SLOPE; }
export function stairLen(h, L = 1.6, F = 1.7) { return L + stairRun(h) + F; }

// one straight flight from (x, z), rising in the given direction, from one storey to the next
export function straightStair(K, lower, upper, x, z, dir, o = {}) {
  const w = o.w || 1.7, rise = upper.y - lower.y, run = rise / SLOPE, mat = o.mat || lower.stairMat;
  const s = K.sub(x, z, Q_DIR[dir], false, lower.y);
  treads(s, w, rise, run, mat);
  const rect = s.up([-w / 2, 0, w / 2, run]);
  upper.hole(rect[0], rect[1], rect[2], rect[3]);
  lower.keep.push(s.up([-w / 2 - 0.1, -1.2, w / 2 + 0.1, run]));
  // the handrail follows the treads, the other side is usually a wall
  if (o.rail !== false) sideRail(s, o.rail === -1 ? -w / 2 : w / 2, rise, run, lower.railMat);
  return rect;
}
function sideRail(s, x, rise, run, mat) {
  const L = Math.hypot(rise, run), a = Math.atan2(rise, run);
  const g = new THREE.BoxGeometry(0.05, 0.05, L);
  s.geom(g, mat, mtx(x, rise / 2 + 0.95, run / 2, 0, 1, 1, 1, -a));
  for (const k of [0.04, 0.5, 0.96]) s.box(x - 0.025, rise * k, run * k - 0.025, x + 0.025, rise * k + 0.95, run * k + 0.025, mat, { ...DECO });
}

// there and back within the bay: canonical origin at a corner, 3.4 wide in x, the near landing (part of the
// floor) from z = 0 to L, the flights after it, the far landing at half height. q and mirror turn it.
export function switchStair(K, lower, upper, x, z, q = 0, o = {}) {
  const W = o.W || 3.4, L = o.L ?? 1.6, F = o.F ?? 1.7, h = upper.y - lower.y, run = stairRun(h), half = h / 2, mat = o.mat || lower.stairMat;
  const fw = (W - 0.2) / 2;
  const s = K.sub(x, z, q, !!o.mirror, lower.y);
  const a = s.sub(fw / 2, L, 0), e = s.sub(W - fw / 2, L + run, 2, false, half);
  treads(a, fw, half, run, mat);
  s.box(0, half - 0.2, L + run, W, half, L + run + F, mat, PLAIN);
  treads(e, fw, half, run, mat);
  // the wall between the flights
  s.box(fw + 0.02, 0, L, W - fw - 0.02, h - SLAB, L + run, o.divider || 'plasterGrey', { ...WALL, pen: 0 });
  const rect = s.up([0, L, W, L + run + F]);
  upper.hole(rect[0], rect[1], rect[2], rect[3]);
  lower.keep.push(s.up([-0.05, 0, W + 0.05, L + run + F])); upper.keep.push(s.up([-0.05, 0, W + 0.05, L]));
  return { rect, s };
}

// rail on the upper floor along the part of the hole that has no wall
export function topRail(K, plan, x0, z0, x1, z1, mat) { railing(K, x0, z0, x1, z1, 1.05, mat || plan.railMat, true, plan.y); }

// the box that closes a stair bay above the roof
export function stairHouse(K, roofY, x, z, q, o = {}) {
  const W = o.W || 3.4, L = o.L ?? 1.6, h = o.h || 3.1, end = L + stairRun(h) + (o.F ?? 1.7), mat = o.mat || 'concrete', H = 2.5;
  const s = K.sub(x, z, q, !!o.mirror, roofY);
  const P = { ...WALL };
  s.box(-0.12, 0, L - 0.1, 0, H, end + 0.12, mat, P); s.box(W, 0, L - 0.1, W + 0.12, H, end + 0.12, mat, P); s.box(-0.12, 0, end, W + 0.12, H, end + 0.12, mat, P);
  s.box(-0.3, H, L - 0.5, W + 0.3, H + 0.18, end + 0.3, 'concreteDark', PLAIN);
}

// ---------------------------------------------------------------------------
// Steel stairs on the outside: a second way up that everyone can see
// ---------------------------------------------------------------------------
export function fireEscape(K, plans, x, z, q, rooms, o = {}) {
  // canonical frame of switchStair; the wall with the doors lies along z = 0 on the -x side
  const n = plans.length, W = 3.4, L = 1.6, F = 1.7, mat = 'metalDark';
  for (let i = 0; i < n; i++) {
    const P = plans[i], s = K.sub(x, z, q, !!o.mirror, P.y);
    if (i > 0) s.box(0, -0.12, 0, W, 0, L, mat, PLAIN);
    if (i + 1 < n) {
      const h = plans[i + 1].y - P.y, run = stairRun(h), half = h / 2, fw = (W - 0.2) / 2;
      const a = s.sub(fw / 2, L, 0), e = s.sub(W - fw / 2, L + run, 2, false, half);
      treads(a, fw, half, run, mat); s.box(0, half - 0.15, L + run, W, half, L + run + F, mat, PLAIN); treads(e, fw, half, run, mat);
      railing(s, W, L, W, L + run + F, 1.05, mat, true, 0);
      railing(s, 0, L + run + F, W, L + run + F, 1.05, mat, true, 0);
      railing(s, 0, L + run, 0, L + run + F, 1.05, mat, true, half);
    }
    if (i > 0) { railing(s, W, 0, W, L, 1.05, mat, true, 0); railing(s, 0, 0, W, 0, 1.05, mat, true, 0); }
    const r0 = s.up([0, 0, W, L]);
    K.area(r0[0], r0[1], r0[2], r0[3], 0, 3);
  }
}

// ---------------------------------------------------------------------------
// Roofs
// ---------------------------------------------------------------------------
function quad(v, a, b, c, d) { v.push(...a, ...b, ...c, ...a, ...c, ...d); }
function meshOf(K, v, mat, uvFn) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  const uv = [];
  for (let i = 0; i < v.length; i += 3) uv.push(...uvFn(v[i], v[i + 1], v[i + 2]));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  K.geom(g, mat, null, { shade: 1 });
}
// a gable wall with its windows cut out
function gableEnd(k, x, sign, zc, Z0, Z1, y, dy, yr, mat, holes) {
  const shape = new THREE.Shape();
  const u = (z) => (sign > 0 ? -z : z);
  const pts = [[Z1, y], [Z1, y + dy], [zc, yr], [Z0, y + dy], [Z0, y]];
  shape.moveTo(u(pts[0][0]), pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(u(pts[i][0]), pts[i][1]);
  shape.closePath();
  for (const H of holes) {
    const p = new THREE.Path();
    const a = u(H.c - H.w / 2), e = u(H.c + H.w / 2);
    p.moveTo(a, y + H.y); p.lineTo(e, y + H.y); p.lineTo(e, y + H.y + H.h); p.lineTo(a, y + H.y + H.h); p.closePath();
    shape.holes.push(p);
  }
  const g = new THREE.ShapeGeometry(shape), s = 1 / (MATERIALS[mat].scale || 2), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s);
  k.geom(g, mat, mtx(x, 0, 0, sign > 0 ? Math.PI / 2 : -Math.PI / 2));
}

// ridged roof. along: the ridge's direction. hollow: { band, top } keeps a walkable room free under the ridge
export function gableRoof(K, x0, z0, x1, z1, y, o = {}) {
  const along = o.along || (x1 - x0 >= z1 - z0 ? 'x' : 'z');
  const k = along === 'x' ? K : K.sub(0, 0, 1);
  const [X0, X1, Z0, Z1] = along === 'x' ? [x0, x1, z0, z1] : [-z1, -z0, x0, x1];
  const mat = o.mat || 'rooftile', rise = o.rise ?? 2.3, over = o.over ?? 0.45, rake = o.rake ?? 0.3, zc = (Z0 + Z1) / 2, hd = (Z1 - Z0) / 2;
  if (!o.hollow) k.box(X0, y - SLAB, Z0, X1, y, Z1, o.ceil || 'plasterWhite', PLAIN); // from inside you look at a ceiling, not through the roof
  const yr = y + rise, A = X0 - rake, E = X1 + rake, ZS = Z1 + over, ZN = Z0 - over, tile = MATERIALS[mat].scale || 2;
  const v = [];
  quad(v, [A, y, ZS], [E, y, ZS], [E, yr, zc], [A, yr, zc]);
  quad(v, [E, y, ZN], [A, y, ZN], [A, yr, zc], [E, yr, zc]);
  meshOf(k, v, mat, (x, yy, z) => [x / tile, Math.hypot(yy - y, z - (z > zc ? ZS : ZN)) / tile]);
  // under the eaves
  k.box(A, y - 0.02, Z1, E, y, ZS, 'woodDark', { ...DECO, faces: '-y+z' }); k.box(A, y - 0.02, ZN, E, y, Z0, 'woodDark', { ...DECO, faces: '-y-z' });
  k.box(X1, y - 0.02, Z0, E, y, Z1, 'woodDark', { ...DECO, faces: '-y' }); k.box(A, y - 0.02, Z0, X0, y, Z1, 'woodDark', { ...DECO, faces: '-y' });
  // the triangles in the end walls
  const dy = over * rise / (hd + over), endM = o.end || o.wall || 'plasterWhite';
  const hN = o.holes ? o.holes.filter((q) => q.end === 'min') : [], hS = o.holes ? o.holes.filter((q) => q.end === 'max') : [];
  gableEnd(k, X1, 1, zc, Z0, Z1, y, dy, yr, endM, hS);
  gableEnd(k, X0, -1, zc, Z0, Z1, y, dy, yr, endM, hN);
  // the steps you land on
  const steps = 4, hollow = o.hollow, big = { visual: false };
  for (let i = 0; i < steps; i++) {
    const ins = hd * i / steps, a = y + rise * i / steps, b = y + rise * (i + 1) / steps, zA = Z0 + ins, zB = Z1 - ins;
    if (!hollow) { k.box(A, a, zA, E, b, zB, mat, big); continue; }
    const top = y + hollow.top, band = hollow.band;
    if (zA < zc - band) k.box(A, a, zA, E, b, zc - band, mat, big);
    if (zB > zc + band) k.box(A, a, zc + band, E, b, zB, mat, big);
    if (b > top) k.box(A, Math.max(a, top), Math.max(zA, zc - band), E, b, Math.min(zB, zc + band), mat, big);
  }
}

export function hipRoof(K, x0, z0, x1, z1, y, o = {}) {
  const along = o.along || (x1 - x0 >= z1 - z0 ? 'x' : 'z');
  const k = along === 'x' ? K : K.sub(0, 0, 1);
  const [X0, X1, Z0, Z1] = along === 'x' ? [x0, x1, z0, z1] : [-z1, -z0, x0, x1];
  const mat = o.mat || 'rooftile', rise = o.rise ?? 2.2, over = o.over ?? 0.5, tile = MATERIALS[mat].scale || 2;
  k.box(X0, y - SLAB, Z0, X1, y, Z1, o.ceil || 'plasterWhite', PLAIN);
  const A = X0 - over, E = X1 + over, ZS = Z1 + over, ZN = Z0 - over, hd = (ZS - ZN) / 2, zc = (ZN + ZS) / 2, ra = Math.min(A + hd, (A + E) / 2), re = Math.max(E - hd, (A + E) / 2), yr = y + rise;
  const v = [];
  quad(v, [A, y, ZS], [E, y, ZS], [re, yr, zc], [ra, yr, zc]);
  quad(v, [E, y, ZN], [A, y, ZN], [ra, yr, zc], [re, yr, zc]);
  v.push(E, y, ZS, E, y, ZN, re, yr, zc);
  v.push(A, y, ZN, A, y, ZS, ra, yr, zc);
  meshOf(k, v, mat, (x, yy, z) => [(x + z) / tile, (yy - y) * 1.3 / tile]);
  k.box(A, y - 0.02, ZN, E, y, ZS, 'woodDark', { ...DECO, faces: '-y' });
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    const ins = hd * i / steps, a = y + rise * i / steps, b = y + rise * (i + 1) / steps;
    k.box(A + ins, a, ZN + ins, E - ins, b, ZS - ins, mat, { visual: false });
  }
}

// one slope, high at the back (z0)
export function shedRoof(K, x0, z0, x1, z1, y, o = {}) {
  const mat = o.mat || 'metalDark', rise = o.rise ?? 1.4, over = o.over ?? 0.4, tile = MATERIALS[mat].scale || 2, wall = o.wall || 'plasterWhite';
  K.box(x0, y - SLAB, z0, x1, y, z1, o.ceil || 'plasterWhite', PLAIN);
  const A = x0 - over, E = x1 + over, ZS = z1 + over, ZN = z0 - 0.15, yr = y + rise;
  const v = [];
  quad(v, [A, y, ZS], [E, y, ZS], [E, yr, ZN], [A, yr, ZN]);
  meshOf(K, v, mat, (x, yy, z) => [x / tile, z / tile]);
  K.box(A, y - 0.02, ZN, E, y, ZS, 'woodDark', { ...DECO, faces: '-y' });
  const t = T / 2, d = { ...DECO };
  const tri = [];
  tri.push(x1 + t, y, z1 + t, x1 + t, y, z0 - t, x1 + t, y + rise * 0.98, z0 - t);
  tri.push(x0 - t, y, z0 - t, x0 - t, y, z1 + t, x0 - t, y + rise * 0.98, z0 - t);
  meshOf(K, tri, wall, (x, yy, z) => [z / 3, yy / 3]);
  K.box(x0 - t, y, z0 - t, x1 + t, yr, z0 - t, wall, { ...d, faces: '-z' });
  for (let i = 0; i < 3; i++) {
    const k0 = i / 3, a = y + rise * k0, b = y + rise * (i + 1) / 3;
    K.box(A, a, ZN, E, b, ZS - (ZS - ZN) * k0, mat, { visual: false });
  }
}

// flat, with a low wall around and whatever lies on it. rects may form any shape.
export function flatRoof(K, rects, y, o = {}) {
  const mat = o.floor || 'concreteDark', holes = o.holes || [], par = o.par ?? 0.95, wall = o.wall || 'concrete', t = 0.24;
  for (const q of subtract(rects, holes)) {
    K.box(q[0], y - SLAB, q[1], q[2], y, q[3], mat, { ...PLAIN, faces: '+y' });
    K.box(q[0], y - SLAB, q[1], q[2], y, q[3], o.ceil || 'plasterWhite', { ...DECO, faces: '-y+x-x+z-z' });
  }
  if (par > 0) for (const S of perimeter(rects)) {
    const a = S.a0 - T / 2, e = S.a1 + T / 2, n0 = S.line + S.out * (T / 2 - t), n1 = S.line + S.out * T / 2, top = o.top || 'concreteDark', ao = { ...PLAIN };
    if (S.ax === 'x') {
      K.box(a, y, Math.min(n0, n1), e, y + par, Math.max(n0, n1), wall, ao);
      K.box(a - 0.03, y + par, Math.min(n0, n1) - 0.03, e + 0.03, y + par + 0.05, Math.max(n0, n1) + 0.03, top, { ...DECO });
    } else {
      K.box(Math.min(n0, n1), y, a, Math.max(n0, n1), y + par, e, wall, ao);
      K.box(Math.min(n0, n1) - 0.03, y + par, a - 0.03, Math.max(n0, n1) + 0.03, y + par + 0.05, e + 0.03, top, { ...DECO });
    }
  }
}

// a ceiling you stand under, e.g. in an attic
export function ceiling(K, x0, z0, x1, z1, y, mat = 'woodDark') { K.box(x0, y, z0, x1, y + 0.12, z1, mat, { ...PLAIN }); }

// ---------------------------------------------------------------------------
// Dress
// ---------------------------------------------------------------------------
export function foundation(K, rects, y0 = BASE, mat = 'concreteDark') {
  for (const r of rects) K.box(r[0] - T / 2 - 0.04, -1.6, r[1] - T / 2 - 0.04, r[2] + T / 2 + 0.04, y0, r[3] + T / 2 + 0.04, mat, { ...PLAIN, faces: '+x-x+z-z' });
}
// a strip around the whole house that sticks out a little
export function band(K, rects, y0, y1, mat, proud = 0.06) {
  for (const S of perimeter(rects)) {
    const a = S.a0 - T / 2 - proud, e = S.a1 + T / 2 + proud, n0 = S.line + S.out * T / 2, n1 = n0 + S.out * proud;
    if (S.ax === 'x') K.box(a, y0, Math.min(n0, n1), e, y1, Math.max(n0, n1), mat, { ...DECO });
    else K.box(Math.min(n0, n1), y0, a, Math.max(n0, n1), y1, e, mat, { ...DECO });
  }
}
// corner stones
export function quoins(K, rects, y0, y1, mat, size = 0.5) {
  const inside = (x, z) => rects.some((r) => x > r[0] && x < r[2] && z > r[1] && z < r[3]);
  const t = T / 2 + 0.03;
  for (const r of rects) for (const [x, z, sx, sz] of [[r[0], r[1], -1, -1], [r[2], r[1], 1, -1], [r[0], r[3], -1, 1], [r[2], r[3], 1, 1]]) {
    if (inside(x + sx * 0.1, z) || inside(x, z + sz * 0.1) || inside(x + sx * 0.1, z + sz * 0.1)) continue;
    let y = y0, odd = false;
    while (y < y1 - 0.1) {
      const h = Math.min(0.34, y1 - y), w = odd ? size : size * 0.62;
      K.box(x + sx * t, y, z + sz * t, x + sx * (t - w), y + h - 0.03, z + sz * (t - 0.26), mat, { ...DECO });
      K.box(x + sx * t, y, z + sz * t, x + sx * (t - 0.26), y + h - 0.03, z + sz * (t - w), mat, { ...DECO });
      y += h; odd = !odd;
    }
  }
}
export function chimney(K, x, z, y, h, mat = 'brick') {
  K.box(x - 0.4, y, z - 0.35, x + 0.4, y + h, z + 0.35, mat, { ...PLAIN, faces: '+x-x+z-z' });
  K.box(x - 0.46, y + h, z - 0.41, x + 0.46, y + h + 0.1, z + 0.41, 'concreteDark', { ...PLAIN });
}
export function acUnit(K, x, z, y) {
  K.box(x - 0.75, y, z - 0.55, x + 0.75, y + 1.05, z + 0.55, 'metal', { ...PLAIN, pen: 0.4 });
  K.box(x - 0.55, y + 1.05, z - 0.4, x + 0.55, y + 1.09, z + 0.4, 'black', { ...DECO });
}
export function roofClutter(K, x0, z0, x1, z1, y, n, avoid = []) {
  const used = [...avoid];
  for (let i = 0; i < n * 4 && n > 0; i++) {
    const x = rnd(x0 + 1, x1 - 1), z = rnd(z0 + 1, z1 - 1), q = [x - 1, z - 1, x + 1, z + 1];
    if (used.some((u) => q[0] < u[2] && q[2] > u[0] && q[1] < u[3] && q[3] > u[1])) continue;
    used.push(q); n--;
    const r = Math.random();
    if (r < 0.45) acUnit(K, x, z, y);
    else if (r < 0.65) { K.box(x - 0.3, y, z - 0.3, x + 0.3, y + 0.7, z + 0.3, 'metalDark', PLAIN); K.box(x - 0.42, y + 0.7, z - 0.42, x + 0.42, y + 0.78, z + 0.42, 'metal', { ...DECO }); }
    else if (r < 0.8) { K.box(x - 0.9, y, z - 0.6, x + 0.9, y + 0.5, z + 0.6, 'metal', { ...PLAIN, pen: 0.4 }); K.box(x - 0.85, y + 0.5, z - 0.55, x + 0.85, y + 0.53, z + 0.55, 'carGlass', { ...DECO }); }
    else { K.box(x - 0.04, y, z - 0.04, x + 0.04, y + 3.4, z + 0.04, 'metalDark', { ...DECO }); K.box(x - 0.5, y + 2.6, z - 0.02, x + 0.5, y + 2.64, z + 0.02, 'metalDark', { ...DECO }); K.box(x - 0.35, y + 3, z - 0.02, x + 0.35, y + 3.04, z + 0.02, 'metalDark', { ...DECO }); }
  }
}
// a striped cloth over a shop window: along x at line z, leaning out toward +z
export function awning(K, a0, a1, z, y, depth, c1 = 'canvasRed', c2 = 'paintWhite') {
  const n = Math.max(2, Math.round((a1 - a0) / 0.7)), w = (a1 - a0) / n, L = Math.hypot(depth, 0.55), ang = Math.atan2(0.55, depth);
  for (let i = 0; i < n; i++) {
    const g = new THREE.BoxGeometry(w, 0.03, L);
    K.geom(g, i % 2 ? c1 : c2, mtx(a0 + w * (i + 0.5), y - 0.275, z + depth / 2, 0, 1, 1, 1, ang));
    K.box(a0 + w * i, y - 0.75, z + depth, a0 + w * (i + 1), y - 0.55, z + depth + 0.015, i % 2 ? c1 : c2, { ...DECO, faces: '+z-z' });
  }
}
// a board with lettering. p is the board's center, nx/nz the direction it faces, both in this frame.
const SIGN_ROW = { HOTEL: 0, BAR: 1, 'CAFÉ': 2, MARKT: 3, 'BÄCKEREI': 4, APOTHEKE: 5, BANK: 6, GARAGE: 7, TANKSTELLE: 8, SCHULE: 9, KLINIK: 10, RATHAUS: 11, FISCH: 12, POST: 13, PENSION: 14, LAGER: 15 };
export function sign(K, text, x, y, z, nx, nz, w = 4) {
  const h = w / 4, row = SIGN_ROW[text] ?? 0, col = row % 2, line = (row / 2) | 0;
  // left and right as someone in front of it sees them, in the world, so a mirrored house doesn't flip the letters
  const [wx, wz] = K.w(x, z), [ox, oz] = K.w(0, 0), [ex, ez] = K.w(nx, nz), Nx = ex - ox, Nz = ez - oz, Rx = Nz, Rz = -Nx;
  const Y = y + K.y;
  const P = (s, t) => [wx + Rx * s * w / 2 + Nx * 0.06, Y + t * h / 2, wz + Rz * s * w / 2 + Nz * 0.06];
  const u0 = col * 0.5 + 0.002, u1 = u0 + 0.496, v1 = 1 - line * 0.125 - 0.002, v0 = v1 - 0.121;
  const a = P(-1, -1), b = P(1, -1), c = P(1, 1), d = P(-1, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1], 2));
  g.computeVertexNormals();
  K.b.geom(g, 'signs');
  // the board behind the letters
  K.box(x - Math.abs(nz) * (w / 2 + 0.04) - Math.abs(nx) * 0.05, y - h / 2 - 0.04, z - Math.abs(nx) * (w / 2 + 0.04) - Math.abs(nz) * 0.05, x + Math.abs(nz) * (w / 2 + 0.04) + Math.abs(nx) * 0.05, y + h / 2 + 0.04, z + Math.abs(nx) * (w / 2 + 0.04) + Math.abs(nz) * 0.05, 'metalDark', { ...DECO });
}
// columns in front of a house
export function columns(K, list, y0, y1, r = 0.28, mat = 'marble') {
  for (const [x, z] of list) {
    K.box(x - r, y0, z - r, x + r, y1, z + r, mat, { ...PLAIN, faces: '+x-x+z-z' });
    K.box(x - r - 0.1, y0, z - r - 0.1, x + r + 0.1, y0 + 0.3, z + r + 0.1, mat, { ...DECO });
    K.box(x - r - 0.1, y1 - 0.25, z - r - 0.1, x + r + 0.1, y1, z + r + 0.1, mat, { ...DECO });
  }
}
export { wallX, wallZ, mtx, railing };
