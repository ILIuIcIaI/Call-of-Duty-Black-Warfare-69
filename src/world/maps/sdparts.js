import * as THREE from 'three';
import { stairs } from '../props.js';
import { Kit, Plan, BASE, T, SLAB, PLAIN, straightStair, topRail, awning, gableRoof, hipRoof, bays, kickOf } from '../kit.js';

// =============================================================================
// Parts the Search and Destroy maps share: houses you walk through (built with the building kit, furnished),
// walls with gaps, blocks that read as houses, the big painted letter of a bomb site.
// =============================================================================
export const H = 3.2;            // a storey
export const DECO = { collide: false, ao: false };

// chance is the same every time a map is built (the kit and the furniture draw at random)
export function seeded(seed, fn) {
  const real = Math.random;
  let s = seed >>> 0;
  Math.random = () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  try { fn(); } finally { Math.random = real; }
}

// a roof you walk on: slab, a low wall around it with gaps ([side, a0, a1], sides n/s/w/e of the house's own frame)
export function roofTerrace(K, x0, z0, x1, z1, y, o = {}) {
  const e = T / 2, X0 = x0 - e, X1 = x1 + e, Z0 = z0 - e, Z1 = z1 + e, par = o.par ?? 0.8, t = 0.26, wall = o.wall || 'adobe';
  K.box(X0, y - SLAB, Z0, X1, y, Z1, o.floor || 'clay', { ...PLAIN, faces: '+y' });
  K.box(X0, y - SLAB, Z0, X1, y, Z1, 'plasterWhite', { ...DECO, faces: '-y' });   // (its edges are the walls' own faces)
  if (par <= 0) return;
  const gaps = o.gaps || [];
  const run = (side, a0, a1, emit) => {
    let cur = a0;
    for (const [, g0, g1] of gaps.filter((g) => g[0] === side).sort((p, q) => p[1] - q[1])) {
      if (g0 > cur) emit(cur, Math.min(g0, a1));
      cur = Math.max(cur, g1);
    }
    if (cur < a1) emit(cur, a1);
  };
  const box = (ax0, az0, ax1, az1) => {
    K.box(ax0, y, az0, ax1, y + par, az1, wall, { ...PLAIN });
    K.box(ax0 - 0.03, y + par, az0 - 0.03, ax1 + 0.03, y + par + 0.06, az1 + 0.03, o.top || 'sandstone', { ...DECO });
  };
  run('n', X0, X1, (a, b) => box(a, Z0, b, Z0 + t));
  run('s', X0, X1, (a, b) => box(a, Z1 - t, b, Z1));
  run('w', Z0 + t, Z1 - t, (a, b) => box(X0, a, X0 + t, b));
  run('e', Z0 + t, Z1 - t, (a, b) => box(X1 - t, a, X1, b));
}

// ---------------------------------------------------------------------------
// A house, written in its own frame (front toward +z, the 's' side) and placed by its rectangle in the world and the
// side its front looks to.
//   r: [x0, z0, x1, z1] in the world, face: 'N' | 'E' | 'S' | 'W'
//   fl: 1 or 2 storeys; kind: 'house' | 'shop'; front: depth of the front room; doorAt: the front door along the front
//   doors: more outside doors [{ room: 'front'|'b1'|'b2', side, at }] (sides of the house's own frame: 'n' its back,
//     'w'/'e' its left/right as you look out of its front door)
//   roof: 'flat' (a terrace; roofStair 'w'|'e' puts stairs up outside, roofGaps more gaps in its wall) | 'gable' | 'hip'
//   look: what goes to the kit's storeys (timber, plinth, shutter, flower, winW, winH, winY, bay, frame, leaf)
// ---------------------------------------------------------------------------
const FACE = { N: 0, E: 1, S: 2, W: 3 };
const NORMAL = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
const NEAR = 0.8;   // closer than this, a window looks straight onto the wall in front of it
const topOf = (s) => BASE + (s.fl || 1) * H;
const highOf = (s) => topOf(s) + (s.roof && s.roof !== 'flat' ? (s.rise ?? 2.6) : (s.par ?? ((s.fl || 1) === 2 ? 1.1 : 0.8)));

// ---------------------------------------------------------------------------
// The houses of a town. Where two stand against each other they share one wall: the later one steps back by a
// wall's thickness, so no two walls stand in one place (nothing flickers) and no roof reaches into the next house.
// No window opens onto a wall right in front of it, the solid things built before (blocks, walls) count as well.
// ---------------------------------------------------------------------------
export function houses(b, out, list) {
  const R = list.map((s) => s.r.slice()), adj = list.map(() => ({ N: [], E: [], S: [], W: [] }));
  const add = (i, side, a0, a1, top) => { if (a1 - a0 > 0.3) adj[i][side].push([a0, a1, top]); };
  // which sides of rect a does rect c stand against: [side of a, side of c, gap, from, to]
  const against = (a, c) => {
    const ox = Math.min(a[2], c[2]) - Math.max(a[0], c[0]), oz = Math.min(a[3], c[3]) - Math.max(a[1], c[1]), res = [];
    if (oz > 0.3) {
      if (c[0] - a[2] > -0.06 && c[0] - a[2] < NEAR) res.push(['E', 'W', c[0] - a[2], Math.max(a[1], c[1]), Math.min(a[3], c[3])]);
      if (a[0] - c[2] > -0.06 && a[0] - c[2] < NEAR) res.push(['W', 'E', a[0] - c[2], Math.max(a[1], c[1]), Math.min(a[3], c[3])]);
    }
    if (ox > 0.3) {
      if (c[1] - a[3] > -0.06 && c[1] - a[3] < NEAR) res.push(['S', 'N', c[1] - a[3], Math.max(a[0], c[0]), Math.min(a[2], c[2])]);
      if (a[1] - c[3] > -0.06 && a[1] - c[3] < NEAR) res.push(['N', 'S', a[1] - c[3], Math.max(a[0], c[0]), Math.min(a[2], c[2])]);
    }
    return res;
  };
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = R[i], c = R[j];
    if (Math.min(a[2], c[2]) - Math.max(a[0], c[0]) > 0.06 && Math.min(a[3], c[3]) - Math.max(a[1], c[1]) > 0.06) console.warn('sd: houses overlap', list[i].r, list[j].r);
    for (const [sa, sc, gap, a0, a1] of against(a, c)) {
      add(i, sa, a0, a1, highOf(list[j])); add(j, sc, a0, a1, highOf(list[i]));
      if (gap < 0.06) { const k = { W: 0, N: 1, E: 2, S: 3 }[sc]; c[k] += (sc === 'W' || sc === 'N' ? 1 : -1) * (T - gap); }
    }
  }
  // the solid things already standing: walls and blocks as high as a window
  for (const q of (b.col && b.col.raw) || []) {
    const [x0, y0, z0, x1, y1, z1] = q;
    if (y0 > 1.0 || y1 < 1.8 || y1 - y0 > 20) continue;   // (not the ground, not the map's invisible edge)
    for (let i = 0; i < list.length; i++) for (const [sa, , , a0, a1] of against(R[i], [x0, z0, x1, z1])) if (a1 - a0 >= 0.8) add(i, sa, a0, a1, y1);
  }
  // each house knows where the others stand (walls included): no dressing of its own pokes into theirs
  const solid = R.map((q) => [q[0] - T / 2, q[1] - T / 2, q[2] + T / 2, q[3] + T / 2]);
  return list.map((s, i) => house(b, out, { ...s, r: R[i], solid: solid.filter((_, j) => j !== i) }, adj[i]));
}

// collision for round things lives in surround.js (all maps use it); the S&D maps take it from here as well
export { roundCol, domeCol, logCol } from './surround.js';

// ---------------------------------------------------------------------------
// The kit's pitched roofs land you on four big steps (risers of 0.6 to 0.85 m: a wall you can't see when you walk on
// a roof). Here the roof is drawn by the kit as ever, its steps left out, and laid again in risers you walk up.
// ---------------------------------------------------------------------------
function noSteps(K) {
  const P = Object.create(K);
  P.box = function (x0, y0, z0, x1, y1, z1, mat, o) { return o && o.visual === false ? this : Kit.prototype.box.call(this, x0, y0, z0, x1, y1, z1, mat, o); };
  P.sub = function (...a) { const s = Kit.prototype.sub.apply(this, a); s.box = P.box; s.sub = P.sub; return s; };
  return P;
}
const RISER = 0.1;   // far under the player's step height (0.46): up a roof as up a ramp, no climbing
function roofSteps(K, x0, z0, x1, z1, y, o, hip) {
  const along = o.along || (x1 - x0 >= z1 - z0 ? 'x' : 'z'), k = along === 'x' ? K : K.sub(0, 0, 1);
  const [X0, X1, Z0, Z1] = along === 'x' ? [x0, x1, z0, z1] : [-z1, -z0, x0, x1];
  const mat = o.mat || 'rooftile', rise = o.rise ?? (hip ? 2.2 : 2.3), big = { visual: false };
  // the tiles run from the eaves' edge (over past the wall) straight up to the ridge, run away from it
  const over = o.over ?? (hip ? 0.5 : 0.45), rake = hip ? over : (o.rake ?? 0.3);
  const A = X0 - rake, E = X1 + rake, ZN = Z0 - over, ZS = Z1 + over, run = (ZS - ZN) / 2, tiles = (d) => y + rise * d / run;
  const slab = (d, y0, y1) => {
    if (hip) { if (E - d > A + d + 0.05 && ZS - d > ZN + d + 0.05) k.box(A + d, y0, ZN + d, E - d, y1, ZS - d, mat, big); }
    else if (ZS - d > ZN + d + 0.05) k.box(A, y0, ZN + d, E, y1, ZS - d, mat, big);
  };
  // the eaves: flat from the edge to a hand inside the wall, so you climb onto the roof from the street (whoever
  // climbs needs a flat strip past the edge)
  const bw = Math.min(over + 0.12, run * 0.4), by = y + 0.05;
  slab(0, y - 0.05, by);
  // then steps of at most RISER, each one's top where the tiles pass the middle of its tread; the first few climb a
  // little faster than the tiles until they meet them
  const n = Math.max(1, Math.ceil((rise * (1 - bw / run)) / RISER));
  let prev = by;
  for (let i = 0; i < n; i++) {
    const d0 = bw + (run - bw) * i / n, top = Math.max(prev + 0.01, Math.min(tiles(bw + (run - bw) * (i + 0.5) / n), prev + 0.16));
    slab(d0, prev - 0.02, top); prev = top;
  }
}

// The S&D houses' gable roofs have kicked eaves (KICK: flatter from the eaves' edge to w past the wall, h up), and only
// what stands over the walls is solid: the overhangs are drawn, so from the street you climb up at the wall as at
// any wall (an overhang over your head would stop you). Over the wall up to the kick a flat strip, where the climb
// lands (the body needs half a metre of flat past the edge); then risers of RISER along the tiles to the ridge.
export const KICK = { w: 0.6, h: 0.16 };
function gableSteps(K, x0, z0, x1, z1, y, o) {
  const along = o.along || (x1 - x0 >= z1 - z0 ? 'x' : 'z'), k = along === 'x' ? K : K.sub(0, 0, 1);
  const [X0, X1, Z0, Z1] = along === 'x' ? [x0, x1, z0, z1] : [-z1, -z0, x0, x1];
  const mat = o.mat || 'rooftile', rise = o.rise ?? 2.3, over = o.over ?? 0.45, big = { visual: false };
  const hd = (Z1 - Z0) / 2, kw = kickOf(o, over, hd) - over, yk = y + o.kick.h, yr = y + rise;
  // the tiles' height at d in from the wall's face
  const tiles = (d) => (d <= kw ? y + (yk - y) * (d + over) / (kw + over) : yk + (yr - yk) * (d - kw) / (hd - kw));
  const slab = (d, y0, y1) => { if (Z1 - d > Z0 + d + 0.05) k.box(X0, y0, Z0 + d, X1, y1, Z1 - d, mat, big); };
  const sy = (tiles(0) + tiles(kw)) / 2;
  slab(0, y - 0.05, sy);
  const n = Math.max(1, Math.ceil((yr - sy) / RISER));
  let prev = sy;
  for (let i = 0; i < n; i++) {
    const d0 = kw + (hd - kw) * i / n, top = Math.max(prev + 0.01, Math.min(tiles(kw + (hd - kw) * (i + 0.5) / n), prev + 0.16));
    slab(d0, prev - 0.02, top); prev = top;
  }
}

// the world side (N/E/S/W) a side of the house's own frame looks to
const sideOf = (K, ls) => {
  const [ox, oz] = K.w(0, 0), [x, z] = K.w(...NORMAL[ls]), dx = Math.round(x - ox), dz = Math.round(z - oz);
  return dx > 0 ? 'E' : dx < 0 ? 'W' : dz > 0 ? 'S' : 'N';
};
// leave out the windows of a storey that would look straight onto a wall
function blind(P, K, adj) {
  const sill = K.y + P.y + P.winY;
  for (const r of P.rooms) for (const ls of ['n', 's', 'w', 'e']) {
    const spec = r.win[ls];
    if (spec === false || (r.noWin && !spec)) continue;
    const ws = sideOf(K, ls), walls = adj[ws].filter((q) => q[2] > sill + 0.3);
    if (!walls.length) continue;
    const S = { bay: P.bay, w: P.winW, ...(spec || {}) }, horiz = ls === 'n' || ls === 's';
    const p = horiz ? r.x0 : r.z0, q = horiz ? r.x1 : r.z1, line = { n: r.z0, s: r.z1, w: r.x0, e: r.x1 }[ls];
    if (q - p - 0.7 < S.w + 0.2) continue;
    const list = S.at || bays(p + 0.35, q - 0.35, S.bay), along = ws === 'N' || ws === 'S' ? 0 : 1;
    const at = (c) => K.w(horiz ? c : line, horiz ? line : c)[along];
    const keep = list.filter((c) => {
      const A = at(c - S.w / 2), B2 = at(c + S.w / 2), lo = Math.min(A, B2) - 0.3, hi = Math.max(A, B2) + 0.3;
      return !walls.some(([u0, u1]) => u0 < hi && u1 > lo);
    });
    if (keep.length < list.length) P.win(r, ls, keep.length ? { ...(spec || {}), at: keep } : false);
  }
}
// the sides of the house's own frame with something at least as high as its eaves right against them
function shutSides(K, adj, top) {
  const o = {};
  for (const ls of ['n', 's', 'w', 'e']) o[ls] = adj[sideOf(K, ls)].some((q) => q[1] - q[0] >= 1.0 && q[2] >= top - 0.1);
  return o;
}

export function house(b, out, s, adj = null) {
  const [x0, z0, x1, z1] = s.r, rot = FACE[s.face], sideways = rot % 2 === 1;
  const w = sideways ? z1 - z0 : x1 - x0, d = sideways ? x1 - x0 : z1 - z0, hw = w / 2, hd = d / 2;
  const K = new Kit(b, out, { x: (x0 + x1) / 2, z: (z0 + z1) / 2, rot });
  K.solid = s.solid || null;
  const ext = s.ext || 'adobe', fl = s.fl || 1, shop = s.kind === 'shop', roof = s.roof || 'flat';
  // windows a player gets through as in Warzone: wide and high enough to vault or dive through, nothing in front
  const look = { ext, frame: 'woodDark', leaf: 'shutterBlue', shutter: null, winW: 1.3, winH: 1.35, winY: 0.95, bay: 3.4, flower: 0, pen: 0.4, extPen: 0.2, clearWin: true, ...(s.look || {}) };
  const G = new Plan(K, BASE, H, { ...look, ground: true });
  const front = s.front ?? Math.min(4.8, d - 2.6), split = hd - front;
  const frOpts = shop ? { wall: s.shopWall || 'plasterSand', floor: s.shopFloor || 'tilesTerra', win: { s: false } } : s.frontWin ? { win: s.frontWin } : {};
  const fr = G.room(-hw, split, hw, hd, shop ? 'shop' : s.frontType || 'living', frOpts);
  let b1, b2 = null;
  const bs = s.backSplit ?? (w >= 7 ? 0 : null);
  if (bs === null) b1 = G.room(-hw, -hd, hw, split, s.b1 || 'kitchen');
  else { b1 = G.room(-hw, -hd, bs, split, s.b1 || 'kitchen'); b2 = G.room(bs, -hd, hw, split, s.b2 || 'storeroom'); G.door(b1, b2, { w: 1.2 }); }
  G.door(fr, b1);
  if (b2) G.door(fr, b2);
  G.out(fr, 's', shop ? { at: s.doorAt ?? 0, w: Math.min(3.2, w - 1.4), h: 2.6, leaf: false } : { at: s.doorAt ?? 0, w: 1.5 });
  const R = { front: fr, b1, b2 };
  for (const D of s.doors || []) if (R[D.room]) G.out(R[D.room], D.side, { at: D.at, w: D.w ?? 1.4 });
  const plans = [G];
  if (fl === 2) {
    const U = new Plan(K, BASE + H, H, { ...look, winW: look.upWinW ?? look.winW, winH: look.upWinH ?? look.winH, winY: look.upWinY ?? look.winY });
    const uf = U.room(-hw, split, hw, hd, s.upFront || 'bed'), ub = U.room(-hw, -hd, hw, split, s.upBack || 'living');
    U.door(uf, ub, { at: hw - 1.3 });
    // the stair: along the back wall of the front room, up to the room above
    straightStair(K, G, U, s.stairX ?? -hw + 0.6, split + 0.95, '+x', { w: 1.4 });
    const Hh = U.holes[0];
    topRail(K, U, Hh[0], Hh[3], Hh[2], Hh[3], 'woodDark'); topRail(K, U, Hh[0], Hh[1], Hh[0], Hh[3], 'woodDark');
    plans.push(U);
  }
  // a low plinth (no foundation into the ground: a tunnel may run under the town)
  K.box(-hw - T / 2 - 0.04, 0, -hd - T / 2 - 0.04, hw + T / 2 + 0.04, BASE, hd + T / 2 + 0.04, s.base || 'sandstone', { ...PLAIN, faces: '+x-x+z-z' });
  if (adj && s.roofStair && fl === 1) {
    // the stairs up the outside and their wall stand in front of that side
    const ls = s.roofStair, ws = sideOf(K, ls), along = ws === 'N' || ws === 'S' ? 0 : 1, sx = ls === 'e' ? hw : -hw;
    const a = K.w(sx, hd - 4.7)[along], c = K.w(sx, hd)[along];
    adj = { ...adj, [ws]: [...adj[ws], [Math.min(a, c), Math.max(a, c), BASE + H + 0.9]] };
  }
  if (adj) for (const P of plans) blind(P, K, adj);
  for (const P of plans) P.build();
  const top = BASE + fl * H;
  if (roof === 'flat') {
    const gaps = [...(s.roofGaps || [])];
    if (s.roofStair && fl === 1) {
      // stairs outside along a side wall, rising toward the back; their top meets a gap in the roof wall
      const side = s.roofStair, sx = side === 'e' ? hw + T / 2 + 0.62 : -hw - T / 2 - 0.62, run = 4.2, z1s = hd - 0.4, z0s = z1s - run;
      stairs(K, sx, z1s, '-z', 1.2, top, run, s.stairMat || 'sandstone');
      gaps.push([side, z0s - 0.1, z0s + 1.3]);
      const ox = side === 'e' ? 0.6 : -0.66;
      K.box(sx + ox, 0, z0s, sx + ox + 0.06, top + 0.9, z1s, s.stairWall || 'adobeLight', { ...PLAIN });
    }
    roofTerrace(K, -hw, -hd, hw, hd, top, { wall: ext, gaps, par: s.par ?? (fl === 2 ? 1.1 : 0.8), floor: s.roofFloor || (fl === 2 ? 'adobe' : 'plasterSand'), top: s.coping });
    // beam ends under the roof along the front, the look of the old desert town
    if (s.beams !== false) for (let a = -hw + 0.6; a < hw - 0.3; a += 1.1) K.box(a - 0.07, top - 0.42, hd + T / 2, a + 0.07, top - 0.3, hd + T / 2 + 0.3, 'woodDark', { ...DECO });
  } else {
    const along = s.ridge || (w >= d ? 'x' : 'z');
    const o = { along, rise: s.rise ?? 2.6, mat: s.roofMat || 'rooftile', wall: s.gableWall || ext, ...(roof === 'hip' ? {} : { over: 0.3, kick: KICK }) };
    if (adj) {
      // against a house as high as this one the roof stops at the wall: no eaves into the next house
      const shut = shutSides(K, adj, top);
      if (roof === 'hip') { if (shut.n || shut.s || shut.w || shut.e) o.over = 0.05; }
      else {
        if ((along === 'x' ? ['w', 'e'] : ['n', 's']).some((q) => shut[q])) o.rake = 0;
        if ((along === 'x' ? ['n', 's'] : ['w', 'e']).some((q) => shut[q])) o.over = 0.05;
      }
    }
    if (roof === 'hip') hipRoof(noSteps(K), -hw - T / 2, -hd - T / 2, hw + T / 2, hd + T / 2, top, o);
    else gableRoof(noSteps(K), -hw - T / 2, -hd - T / 2, hw + T / 2, hd + T / 2, top, o);
    if (roof === 'hip') roofSteps(K, -hw - T / 2, -hd - T / 2, hw + T / 2, hd + T / 2, top, o, true);
    else gableSteps(K, -hw - T / 2, -hd - T / 2, hw + T / 2, hd + T / 2, top, o);
  }
  if (shop) {
    const c = s.awning || ['awningRed', 'paintWhite'], y = BASE + 2.9, z = hd + T / 2, dep = 1.3;
    awning(K, -hw + 0.3, hw - 0.3, z, y, dep, c[0], c[1]);   // (it holds whoever lands on it)
  }
  return K;
}

// a wall with a coping; gaps: [a0, a1] along it
export function wall(b, x0, z0, x1, z1, h, mat = 'adobe', gaps = [], coping = 'sandstone') {
  const along = x1 - x0 > z1 - z0 ? 'x' : 'z', A0 = along === 'x' ? x0 : z0, A1 = along === 'x' ? x1 : z1;
  let cur = A0;
  const emit = (a, c) => {
    if (along === 'x') { b.box(a, 0, z0, c, h, z1, mat); if (coping) b.box(a - 0.04, h, z0 - 0.04, c + 0.04, h + 0.08, z1 + 0.04, coping, DECO); }
    else { b.box(x0, 0, a, x1, h, c, mat); if (coping) b.box(x0 - 0.04, h, a - 0.04, x1 + 0.04, h + 0.08, c + 0.04, coping, DECO); }
  };
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) { if (g0 > cur) emit(cur, g0); cur = Math.max(cur, g1); }
  if (cur < A1) emit(cur, A1);
}

// a block nobody goes into (the backs of houses) up to h; on the sides that face a street (faces: 'n' z0, 's' z1,
// 'w' x0, 'e' x1) windows with shutters and now and then a door, so it reads as houses. style: 'desert' | 'euro'
export function block(b, x0, z0, x1, z1, h, mat = 'adobe', faces = '', style = 'desert') {
  b.box(x0, 0, z0, x1, h, z1, mat);
  b.box(x0 - 0.05, h, z0 - 0.05, x1 + 0.05, h + 0.12, z1 + 0.05, style === 'desert' ? 'sandstone' : 'concreteDark', DECO);
  for (const f of faces) {
    const along = f === 'n' || f === 's', a0 = along ? x0 : z0, a1 = along ? x1 : z1, line = { n: z0, s: z1, w: x0, e: x1 }[f], out = f === 'n' || f === 'w' ? -1 : 1;
    let i = 0;
    for (let a = a0 + 1.6; a < a1 - 1.0; a += 3.3, i++) {
      const put = (c0, y0, c1, y1, d, m) => {
        const n0 = line + out * 0.005, n1 = line + out * d;
        if (along) b.box(c0, y0, Math.min(n0, n1), c1, y1, Math.max(n0, n1), m, DECO);
        else b.box(Math.min(n0, n1), y0, c0, Math.max(n0, n1), y1, c1, m, DECO);
      };
      const shut = (style === 'desert' ? ['shutterBlue', 'shutterGreen', 'woodDark'] : ['shutterGreen', 'shutterRed', 'woodDark'])[(((i + Math.round(a0)) % 3) + 3) % 3];
      if (i % 4 === 2 && h > 4) { put(a - 0.65, 0, a + 0.65, 2.3, 0.04, 'woodDark'); put(a - 0.75, 2.3, a + 0.75, 2.45, 0.06, style === 'desert' ? 'sandstone' : 'woodDark'); }
      else {
        put(a - 0.5, 1.2, a + 0.5, 2.4, 0.03, style === 'desert' ? 'black' : 'carGlass'); put(a - 0.95, 1.2, a - 0.5, 2.4, 0.05, shut); put(a + 0.5, 1.2, a + 0.95, 2.4, 0.05, shut);
        if (style === 'euro') put(a - 0.6, 1.08, a + 0.6, 1.2, 0.12, 'paintWhite');
      }
      if (h > 4.5) {
        put(a - 0.45, 4.2, a + 0.45, 5.3, 0.03, style === 'desert' ? 'black' : 'carGlass'); put(a - 0.55, 4.1, a + 0.55, 4.2, 0.06, style === 'desert' ? 'woodDark' : 'paintWhite');
        if (style === 'euro') put(a - 0.55, 3.86, a + 0.55, 4.1, 0.22, ['foliage', 'canvasRed', 'foliageDark'][i % 3]);
      }
    }
  }
}

// the big painted letter of a bomb site on a wall: (x, y, z) the letter's middle on the wall, facing (nx, nz)
export function siteLetter(b, letter, x, y, z, nx, nz, size = 2.6, mat = 'paintYellow') {
  // (the letter's right as somebody in front of the wall sees it)
  const rx = nz, rz = -nx, t = 0.012, sw = size * 0.13, h = size;
  const stroke = (u0, v0, u1, v1) => {
    const L = Math.hypot(u1 - u0, v1 - v0), um = (u0 + u1) / 2, vm = (v0 + v1) / 2, ang = Math.atan2(v1 - v0, u1 - u0);
    const g = new THREE.BoxGeometry(L + sw * 0.6, sw, t);
    const face = new THREE.Matrix4().makeBasis(new THREE.Vector3(rx, 0, rz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 0, nz));
    face.setPosition(x + rx * um + nx * 0.03, y + vm, z + rz * um + nz * 0.03);
    b.geom(g, mat, face.multiply(new THREE.Matrix4().makeRotationZ(ang)), DECO);
  };
  if (letter === 'A') {
    stroke(-h * 0.36, -h / 2, 0, h / 2); stroke(0, h / 2, h * 0.36, -h / 2); stroke(-h * 0.2, -h * 0.08, h * 0.2, -h * 0.08);
  } else {
    stroke(-h * 0.28, -h / 2, -h * 0.28, h / 2);
    stroke(-h * 0.28, h / 2, h * 0.12, h / 2); stroke(-h * 0.28, 0, h * 0.14, 0); stroke(-h * 0.28, -h / 2, h * 0.16, -h / 2);
    stroke(h * 0.12, h / 2, h * 0.27, h * 0.35); stroke(h * 0.27, h * 0.35, h * 0.27, h * 0.15); stroke(h * 0.27, h * 0.15, h * 0.12, 0);
    stroke(h * 0.14, 0, h * 0.31, -h * 0.17); stroke(h * 0.31, -h * 0.17, h * 0.31, -h * 0.33); stroke(h * 0.31, -h * 0.33, h * 0.16, -h / 2);
  }
}

// a cart with two wheels (along: the way it is pulled)
const WHEEL = new THREE.CylinderGeometry(0.55, 0.55, 0.1, 14);
export function cart(b, x, z, along, mat = 'woodDark') {
  const ax = along === 'x', [hx, hz] = ax ? [1.2, 0.7] : [0.7, 1.2];
  b.box(x - hx, 0.55, z - hz, x + hx, 1.0, z + hz, mat);
  if (ax) { b.box(x - hx, 1.0, z - hz, x + hx, 1.35, z - hz + 0.08, mat, DECO); b.box(x - hx, 1.0, z + hz - 0.08, x + hx, 1.35, z + hz, mat, DECO); }
  else { b.box(x - hx, 1.0, z - hz, x - hx + 0.08, 1.35, z + hz, mat, DECO); b.box(x + hx - 0.08, 1.0, z - hz, x + hx, 1.35, z + hz, mat, DECO); }
  for (const s of [-1, 1]) b.geom(WHEEL, 'woodDark', ax ? mtx3(x, 0.55, z + s * (hz + 0.08), Math.PI / 2, 0) : mtx3(x + s * (hx + 0.08), 0.55, z, 0, Math.PI / 2));
  if (ax) b.box(x + hx, 0.7, z - 0.05, x + hx + 1.6, 0.78, z + 0.05, 'woodDark', DECO);
  else b.box(x - 0.05, 0.7, z + hz, x + 0.05, 0.78, z + hz + 1.6, 'woodDark', DECO);
}
const mtx3 = (x, y, z, rx, rz) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(1, 1, 1));
