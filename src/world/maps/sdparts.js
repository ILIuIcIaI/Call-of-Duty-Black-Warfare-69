import * as THREE from 'three';
import { stairs } from '../props.js';
import { Kit, Plan, BASE, T, SLAB, PLAIN, straightStair, topRail, awning, gableRoof, hipRoof } from '../kit.js';

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
  K.box(X0, y - SLAB, Z0, X1, y, Z1, 'plasterWhite', { ...DECO, faces: '-y+x-x+z-z' });
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
export function house(b, out, s) {
  const [x0, z0, x1, z1] = s.r, rot = FACE[s.face], sideways = rot % 2 === 1;
  const w = sideways ? z1 - z0 : x1 - x0, d = sideways ? x1 - x0 : z1 - z0, hw = w / 2, hd = d / 2;
  const K = new Kit(b, out, { x: (x0 + x1) / 2, z: (z0 + z1) / 2, rot });
  const ext = s.ext || 'adobe', fl = s.fl || 1, shop = s.kind === 'shop', roof = s.roof || 'flat';
  const look = { ext, frame: 'woodDark', leaf: 'shutterBlue', shutter: null, winW: 0.8, winH: 1.0, winY: 1.3, bay: 3.4, flower: 0, pen: 0.4, extPen: 0.2, ...(s.look || {}) };
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
    const U = new Plan(K, BASE + H, H, { ...look, winW: look.upWinW ?? 0.9, winH: look.upWinH ?? 1.1, winY: 1.0 });
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
    const o = { along: s.ridge || (w >= d ? 'x' : 'z'), rise: s.rise ?? 2.6, mat: s.roofMat || 'rooftile', wall: s.gableWall || ext };
    if (roof === 'hip') hipRoof(K, -hw - T / 2, -hd - T / 2, hw + T / 2, hd + T / 2, top, o);
    else gableRoof(K, -hw - T / 2, -hd - T / 2, hw + T / 2, hd + T / 2, top, o);
  }
  if (shop) { const c = s.awning || ['awningRed', 'paintWhite']; awning(K, -hw + 0.3, hw - 0.3, hd + T / 2, BASE + 2.9, 1.3, c[0], c[1]); }
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
