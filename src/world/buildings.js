import * as THREE from 'three';
import { crate, barrel, container, stairs, sandbags, car, tree, truck, forklift, railing } from './props.js';
import {
  Kit, Plan, BASE, T, SLAB, rnd, pick, chance, PLAIN, WALL, mtx, bays,
  straightStair, switchStair, stairLen, stairRun, stairHouse, topRail, fireEscape, sideRail,
  gableRoof, hipRoof, shedRoof, flatRoof, ceiling, foundation, band, quoins, chimney, roofClutter, acUnit, awning, sign, columns,
} from './kit.js';
import { ITEMS } from './furniture.js';

// =============================================================================
// Every kind of house on the island. Each one has its own idea of how you get
// around inside: a stair you can be trapped on, a corridor that is one long sight
// line, a gallery around a hall, a roof terrace, a second way up on the outside.
// Written with the front toward +z; placed with { x, z, y, rot, mirror }.
// =============================================================================
const DECO = { collide: false, skirt: false, ao: false };
const WARM = ['plasterOchre', 'plasterTerra', 'plasterRose', 'plasterSand', 'plasterWhite', 'plasterBlue', 'plasterGreen', 'wallCream'];
const SHUTTERS = ['shutterGreen', 'shutterBlue', 'woodDark', 'shutterRed', null, null];
const ROOFS = ['rooftile', 'rooftile', 'rooftile', 'roofBrown', 'roofSlate'];

function look(o, d = {}) {
  return {
    ext: o.ext || d.ext || pick(WARM), roof: o.roof || d.roof || pick(ROOFS), frame: o.frame || d.frame || pick(['woodDark', 'paintWhite', 'woodDark', 'metalDark']),
    shutter: o.shutter !== undefined ? o.shutter : d.shutter !== undefined ? d.shutter : pick(SHUTTERS), flower: o.flower ?? d.flower ?? (chance(0.5) ? 0.5 : 0),
    plinth: o.plinth !== undefined ? o.plinth : d.plinth !== undefined ? d.plinth : pick(['stoneWall', 'concreteDark', 'concrete', 'paversDark']), trim: o.trim || d.trim || pick(['paintWhite', 'concrete', 'marble', 'concreteDark']),
    leaf: o.leaf || d.leaf || pick(['woodPale', 'wood', 'woodDark', 'shutterBlue', 'shutterGreen']),
    ...d.extra,
  };
}
const planOf = (K, y, h, L, o = {}) => new Plan(K, y, h, { ext: L.ext, frame: L.frame, shutter: L.shutter, flower: L.flower, leaf: L.leaf, ...o });
const finish = (...plans) => { for (const P of plans) P.build(); };
const between = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);

// ---------------------------------------------------------------------------
// COTTAGE: one floor and an attic under a steep roof, the stair right in the middle
// ---------------------------------------------------------------------------
export function cottage(b, out, o) {
  const K = new Kit(b, out, o), L = look(o), w = o.w || 10.5, d = o.d || 8.6, hw = w / 2, hd = d / 2, h = 3.0, topY = BASE + h;
  const G = planOf(K, BASE, h, L, { ground: true, plinth: L.plinth, bay: 2.6 });
  const living = G.room(-hw, -hd, 0.2, hd, 'living'), hall = G.room(0.2, -0.9, hw, hd, 'hall', { noWin: false, fill: false }), kitchen = G.room(0.2, -hd, hw, -0.9, 'kitchen');
  G.door(living, hall, { at: 2.7 }); G.door(living, kitchen, { at: -2.6 });
  G.out(hall, 's', { at: 3.0 }); G.out(kitchen, 'n', { at: hw - 1.6 }); G.out(living, 'w', { at: 1.6 });
  const A = new Plan(K, topY, 2.1, { ext: null, frame: 'woodDark', noWin: true });
  const attic = A.room(-hw, -1.9, hw, 1.9, 'attic', { wall: 'woodDark', floor: 'wood' });
  straightStair(K, G, A, hw - 1.05, 0.02, '-x', { w: 1.6 });
  const hole = A.holes[0];
  topRail(K, A, hole[0], hole[3], hole[2], hole[3]); topRail(K, A, hole[0], hole[1], hole[2], hole[1]); topRail(K, A, hole[2], hole[1], hole[2], hole[3]);
  const wins = [{ end: 'min', c: 0, w: 1.3, y: 0.8, h: 1.0 }, { end: 'max', c: 0, w: 1.3, y: 0.8, h: 1.0 }];
  A.win(attic, 'w', { at: [0], w: 1.3, y: 0.8, h: 1.0 }); A.win(attic, 'e', { at: [0], w: 1.3, y: 0.8, h: 1.0 });
  attic.noWin = false; A.noWin = false; attic.win.n = false; attic.win.s = false;
  A.extra.push({ rect: [-hw, -hd, hw, hd], floor: 'wood' });
  foundation(K, [[-hw, -hd, hw, hd]]);
  finish(G, A);
  ceiling(K, -hw, -1.9, hw, 1.9, topY + 2.1);
  gableRoof(K, -hw - T / 2, -hd - T / 2, hw + T / 2, hd + T / 2, topY, { along: 'x', rise: 3.5, mat: L.roof, wall: L.ext, hollow: { band: 2.02, top: 2.1 }, holes: wins });
  chimney(K, -2.2, -1.3, topY + 1.5, 2.6, pick(['brick', 'brickDark', 'stoneWall']));
  K.area(-hw, -hd, hw, hd, 2);
}

// ---------------------------------------------------------------------------
// TOWNHOUSE: narrow, one straight stair along the party wall, rooms in a chain
// ---------------------------------------------------------------------------
export function townhouse(b, out, o) {
  const K = new Kit(b, out, o), L = look(o), w = o.w || 8.5, d = o.d || 12.5, hw = w / 2, hd = d / 2, h = 3.1, s = -hw + 2.1, party = o.party;
  const G = planOf(K, BASE, h, L, { ground: true, plinth: L.plinth }), U = planOf(K, BASE + h, h, L, { flower: L.flower });
  const hall = G.room(-hw, -2.6, s, hd, 'hall', { fill: false }), wc = G.room(-hw, -hd, s, -2.6, 'bath'), front = G.room(s, 0.6, hw, hd, o.shop ? 'shop' : 'living'), back = G.room(s, -hd, hw, 0.6, 'kitchen');
  G.door(hall, front, { at: 3.2 }); G.door(front, back, { at: (s + hw) / 2 + 0.8 }); G.door(back, wc, { w: 1.3, at: (-hd - 2.6) / 2 });
  G.out(hall, 's', { at: (-hw + s) / 2 }); G.out(back, 'n', { at: hw - 1.9 });
  const land = U.room(-hw, -hd, s, 1.4, 'hall', { fill: false }), wash = U.room(-hw, 1.4, s, hd, 'bath'), bedF = U.room(s, -0.6, hw, hd, 'bed'), bedB = U.room(s, -hd, hw, -0.6, chance(0.5) ? 'bed' : 'study');
  U.door(land, bedB, { at: (-hd - 2.475) / 2 }); U.door(bedB, bedF, { at: (s + hw) / 2 - 0.6 }); U.door(bedF, wash, { w: 1.3, at: 3.8 });
  if (party) for (const r of [hall, wc, front, back, land, wash, bedF, bedB]) { r.win.w = false; r.win.e = false; }
  if (chance(0.5)) U.balcony(bedF, 's', { at: (s + hw) / 2, w: 3.4, d: 1.2 });
  straightStair(K, G, U, (-hw + s) / 2, 1.4, '-z', { w: 1.75, rail: false });
  foundation(K, [[-hw, -hd, hw, hd]]);
  finish(G, U);
  const top = BASE + 2 * h, kind = o.roofKind || pick(['gable', 'gable', 'flat', 'shed']);
  if (kind === 'gable') gableRoof(K, -hw - T / 2, -hd - T / 2, hw + T / 2, hd + T / 2, top, { along: party ? 'x' : pick(['x', 'z']), rise: 2.4, mat: L.roof, wall: L.ext });
  else if (kind === 'shed') shedRoof(K, -hw, -hd, hw, hd, top, { rise: 1.8, wall: L.ext, mat: pick(['metalDark', 'roofSlate']) });
  else { flatRoof(K, [[-hw, -hd, hw, hd]], top, { wall: L.ext, top: L.trim }); roofClutter(K, -hw, -hd, hw, hd, top, 2); }
  if (chance(0.6)) band(K, [[-hw, -hd, hw, hd]], BASE + h - 0.12, BASE + h + 0.02, L.trim, 0.04);
  K.area(-hw, -hd, hw, hd, 2);
}

// a whole row, every house its own color and roof
export function row(b, out, o) {
  const n = o.n || 4, w = o.w || 8.5, step = w + T + 0.04;
  const K = new Kit(b, out, o);
  for (let i = 0; i < n; i++) {
    const [wx, wz] = K.w(-((n - 1) * step) / 2 + i * step, 0);
    townhouse(b, out, { ...o, n: undefined, x: wx, z: wz, y: o.y, party: true, mirror: chance(0.5), rot: o.rot || 0, w, d: o.d, ext: o.exts ? o.exts[i % o.exts.length] : undefined, roofKind: o.roofKind });
  }
}

// ---------------------------------------------------------------------------
// STADTHAUS: three or four floors around a real stair bay, balcony, roof terrace
// ---------------------------------------------------------------------------
export function stadthaus(b, out, o) {
  const K = new Kit(b, out, o), L = look(o), floors = o.floors || 3, h = 3.1, hw = 5, hd = 6.5, S = [];
  const top = BASE + floors * h, up = o.roofKind === 'terrace' || (!o.roofKind && chance(0.6));
  for (let f = 0; f < floors; f++) S.push(planOf(K, BASE + f * h, h, L, { ground: f === 0, plinth: f === 0 ? L.plinth : null }));
  const R = up ? new Plan(K, top, 1, { ext: null }) : null;
  S.forEach((P, f) => {
    const st = P.room(-hw, -hd, -1.6, 0.8, 'stair', { wall: 'plasterWhite', noWin: false, win: { n: false, s: false, e: false } }), shop = f === 0 && o.shop;
    const back = P.room(-1.6, -hd, hw, 0.8, f === 0 ? pick(['kitchen', 'storeroom', 'living']) : pick(['bed', 'living', 'kitchen', 'study']));
    P.door(st, back, { at: -2.06 });
    let W, E;
    if (shop) { W = P.room(-hw, 0.8, hw, hd, 'shop', { win: { s: { bay: 3.6, w: 2.7, y: 0.45, h: 2.0, plain: true } } }); P.door(st, W, { at: -3.3 }); P.door(back, W, { at: 2.6 }); }
    else {
      W = P.room(-hw, 0.8, 0.3, hd, f === 0 ? 'living' : pick(['bed', 'living'])); E = P.room(0.3, 0.8, hw, hd, f === 0 ? pick(['kitchen', 'office']) : pick(['bed', 'bath', 'study']));
      P.door(st, W, { at: -3.3 }); P.door(back, E, { at: 2.65 }); P.door(W, E, { at: 3.7 });
      if (f > 0 && chance(0.7)) P.balcony(W, 's', { at: -2.3, w: 3.6, d: 1.4 });
    }
    if (f === 0) { P.out(W, 's', { at: -2.6 }); P.out(back, 'n', { at: 2 }); if (!o.party) P.out(st, 'w', { at: -0.2 }); }
    if (o.party) for (const r of P.rooms) { r.win.w = false; r.win.e = false; }
    const next = S[f + 1] || R;
    if (next) switchStair(K, P, next, -1.6, -1.26, 2);
  });
  foundation(K, [[-hw, -hd, hw, hd]]);
  finish(...S);
  if (up) {
    flatRoof(K, [[-hw, -hd, hw, hd]], top, { wall: L.ext, top: L.trim, holes: R.holes, floor: pick(['tilesTerra', 'concreteDark', 'woodPale']) });
    stairHouse(K, top, -1.6, -1.26, 2, { mat: L.ext });
    K.box(-2.1, top + 2.3, 1, 4.5, top + 2.42, 5.6, 'woodDark', { ...DECO });
    for (const [x, z] of [[-2, 1.1], [4.4, 1.1], [-2, 5.5], [4.4, 5.5]]) K.box(x - 0.06, top, z - 0.06, x + 0.06, top + 2.3, z + 0.06, 'woodDark', { ...PLAIN });
    const tb = K.sub(1.2, 3.4, 0, false, top); ITEMS.roundTable.draw(tb);
    K.spot(-3.2, top, 3.2, { indoor: false, kind: 'room' });
    roofClutter(K, 0, -hd, hw, -1, top, 2);
  } else {
    const last = S[floors - 1];
    topRail(K, last, -3.2, -2.86, -1.6, -2.86);
    gableRoof(K, -hw - T / 2, -hd - T / 2, hw + T / 2, hd + T / 2, top, { along: 'x', rise: 2.5, mat: L.roof, wall: L.ext });
    if (chance(0.6)) chimney(K, 2.6, -2.4, top + 0.6, 2.2);
  }
  band(K, [[-hw, -hd, hw, hd]], top - 0.08, top + (up ? 0.08 : 0.04), L.trim, 0.1);
  if (chance(0.5)) quoins(K, [[-hw, -hd, hw, hd]], BASE, top - 0.1, L.trim);
  K.area(-hw, -hd, hw, hd, floors);
}

// ---------------------------------------------------------------------------
// VILLA: L-shaped, big stair hall, veranda, a roof terrace over the wing
// ---------------------------------------------------------------------------
export function villa(b, out, o) {
  const K = new Kit(b, out, o), L = look(o, { shutter: pick(['shutterGreen', 'shutterBlue', null]), plinth: 'stoneWall' }), h = 3.2, up = BASE + h, topY = up + h;
  const G = planOf(K, BASE, h, L, { ground: true, plinth: L.plinth, winH: 1.7, winY: 0.65, bay: 2.9 }), U = planOf(K, up, h, L, { winH: 1.5, winY: 0.8, bay: 2.9 });
  const living = G.room(-9, -5, -2, 5, 'living', { extra: (p) => p.wall(ITEMS.fireplace, { side: 'w' }) }), lobby = G.room(-2, -5, 3, 5, 'hall', { fill: false, floor: 'tilesCheck', wall: 'wallCream' }), kitchen = G.room(3, -5, 10, -1.2, 'kitchen'), dining = G.room(3, -1.2, 10, 1.8, 'restaurant', { fill: false, extra: (p) => p.center(ITEMS.longTable(4)) });
  G.door(living, lobby, { at: 1, w: 2.4, leaf: false }); G.door(lobby, kitchen, { at: -3.1 }); G.door(kitchen, dining, { at: 5 });
  G.out(lobby, 's', { at: -0.2, w: 2.3, h: 2.6, leaf: false }); G.out(living, 's', { at: -5.5, w: 2.4, h: 2.5, leaf: false }); G.out(dining, 's', { at: 6.5 }); G.out(lobby, 'e', { at: 3.9 }); G.out(kitchen, 'n', { at: 7.5 });
  // upstairs: rooms over the main house, the wing's roof is the terrace
  const gal = U.room(-2, -5, 3, 5, 'hall', { fill: false, floor: 'parquet', wall: 'wallCream' }), bedN = U.room(-9, -5, -2, 0.4, 'bed'), bedS = U.room(-9, 0.4, -2, 5, 'suite'), terr = U.room(3, -5, 10, 1.8, 'terrace', { outdoor: true, extMat: L.ext });
  U.edge(terr, 'nse', 'rail');
  U.door(gal, bedN, { at: -2.3 }); U.door(gal, bedS, { at: 2.7 }); U.out(gal, 'e', { at: -3.1 });
  straightStair(K, G, U, 2.0, 3.1, '-z', { w: 2.0, rail: 1 });
  const H = U.holes[0];
  topRail(K, U, H[0], H[1], H[0], H[3]); topRail(K, U, H[0], H[3], H[2], H[3]);
  U.balcony(bedS, 's', { at: -5.5, w: 4.2, d: 1.5, rail: 'marble' });
  foundation(K, [[-9, -5, 3, 5], [3, -5, 10, 1.8]]);
  finish(G, U);
  hipRoof(K, -9 - T / 2, -5 - T / 2, 3 + T / 2, 5 + T / 2, topY, { mat: L.roof, rise: 2.6 });
  chimney(K, -6.8, -2.4, topY + 0.8, 2.3, 'stoneWall');
  // veranda on the wing side of the house
  K.box(-1.9, up - 0.14, 5 + T / 2, 3, up - 0.02, 7.6, 'woodDark', { ...PLAIN });
  columns(K, [[-1.6, 7.3], [2.7, 7.3]], BASE, up - 0.14, 0.16, 'paintWhite');
  K.box(-1.9, 0, 5.1, 3, BASE, 7.6, 'pavers', { ...PLAIN });
  band(K, [[-9, -5, 3, 5], [3, -5, 10, 1.8]], up - 0.1, up + 0.04, L.trim, 0.05);
  K.area(-9, -5, 10, 7.6, 2);
}

// ---------------------------------------------------------------------------
// APARTMENTS: a corridor through every floor, flats on both sides, stairs in the middle
// ---------------------------------------------------------------------------
export function apartments(b, out, o) {
  const K = new Kit(b, out, o), L = look(o, { plinth: 'concreteDark', shutter: chance(0.5) ? 'shutterBlue' : null }), floors = o.floors || 4, h = 3.1, hw = (o.w || 26) / 2, hd = 6.5, S = [], top = BASE + floors * h;
  for (let f = 0; f < floors; f++) S.push(planOf(K, BASE + f * h, h, L, { ground: f === 0, plinth: f === 0 ? L.plinth : null }));
  const R = new Plan(K, top, 1, { ext: null });
  const xs = [-hw, -hw * 0.56, -1.7], xe = [1.7, hw * 0.56, hw];
  const flat = (P, f) => {
    const cor = P.room(-hw, -0.95, hw, 0.95, 'corridor'), st = P.room(-1.7, -hd, 1.7, -0.95, 'stair', { noWin: true });
    P.open(cor, st);
    const nw = [], ne = [];
    for (let i = 0; i < 2; i++) {
      nw.push(P.room(xs[i], -hd, xs[i + 1], -0.95, pick(['bed', 'living', 'kitchen', 'study'])));
      ne.push(P.room(xe[i], -hd, xe[i + 1], -0.95, pick(['bed', 'living', 'kitchen', 'study'])));
    }
    P.door(cor, nw[1]); P.door(cor, ne[0]); P.door(nw[0], nw[1]); P.door(ne[0], ne[1]);
    // south side: different on every floor, so no two floors play alike
    const cuts = f === 0 ? [-hw, -hw * 0.45, -2.4, 2.4, hw * 0.45, hw] : pick([[-hw, -hw * 0.5, 0, hw * 0.5, hw], [-hw, -hw * 0.66, -hw * 0.25, hw * 0.3, hw], [-hw, -hw * 0.3, hw * 0.1, hw * 0.6, hw]]);
    const rs = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const foyer = f === 0 && i === 2;
      const r = P.room(cuts[i], 0.95, cuts[i + 1], hd, foyer ? 'hall' : f === 0 ? pick(['shop', 'office', 'storeroom']) : pick(['living', 'bed', 'bed', 'kitchen']), foyer ? { fill: false, floor: 'tilesCheck' } : {});
      rs.push(r);
      P.door(cor, r);
      if (f > 0 && chance(0.55) && cuts[i + 1] - cuts[i] > 5) P.balcony(r, 's', { w: 3.6, d: 1.4 });
      if (i > 0 && chance(0.35) && !foyer && rs[i - 1].type !== 'hall') P.door(rs[i - 1], r);
    }
    if (f === 0) { P.out(rs[2], 's'); P.out(cor, 'w'); P.out(cor, 'e'); P.out(rs[0], 's', { at: cuts[0] + 3, w: 1.85 }); P.out(rs[rs.length - 1], 's', { at: cuts[cuts.length - 1] - 3 }); }
  };
  S.forEach((P, f) => { flat(P, f); switchStair(K, P, S[f + 1] || R, -1.7, -0.95, 2, { mirror: true }); });
  foundation(K, [[-hw, -hd, hw, hd]]);
  finish(...S);
  flatRoof(K, [[-hw, -hd, hw, hd]], top, { wall: L.ext, top: L.trim, holes: R.holes });
  stairHouse(K, top, -1.7, -0.95, 2, { mirror: true, mat: L.ext });
  roofClutter(K, -hw, -hd, hw, hd, top, 6, [[-2.2, -hd, 2.2, -0.5]]);
  K.spot(hw - 3, top, 3, { indoor: false, kind: 'room' }); K.spot(-hw + 3, top, -3, { indoor: false, kind: 'floor' });
  for (let f = 1; f < floors; f++) band(K, [[-hw, -hd, hw, hd]], BASE + f * h - 0.08, BASE + f * h + 0.04, L.trim, 0.03);
  band(K, [[-hw, -hd, hw, hd]], top + 0.7, top + 1.0, L.trim, 0.05);
  K.area(-hw, -hd, hw, hd, floors);
}

// ---------------------------------------------------------------------------
// GALLERY BLOCK: every flat opens onto a long open walkway, a stair tower at each end
// ---------------------------------------------------------------------------
export function galleryBlock(b, out, o) {
  const K = new Kit(b, out, o), L = look(o, { ext: pick(['concrete', 'plasterGrey', 'wallCream', 'plasterSand']), shutter: null, flower: 0.4, plinth: 'concreteDark', frame: 'metalDark' }), floors = o.floors || 3, h = 3.0, hw = (o.w || 32) / 2, S = [], top = BASE + floors * h;
  for (let f = 0; f < floors; f++) S.push(planOf(K, BASE + f * h, h, L, { ground: f === 0, plinth: f === 0 ? L.plinth : null, railMat: 'metalYellow' }));
  const R = new Plan(K, top, 1, { ext: null });
  const n = Math.round(hw * 2 / 5.6), xs = between(-hw, hw, n);
  S.forEach((P, f) => {
    const walk = P.room(-hw, 3, hw, 4.9, 'corridor', { outdoor: true, extMat: L.ext, floor: 'concreteFloor', fill: false, noLoot: true });
    if (f > 0) P.edge(walk, 's', 'rail');
    let prev = null;
    for (let i = 0; i < n; i++) {
      const fr = P.room(xs[i], -0.6, xs[i + 1], 3, pick(['living', 'kitchen', 'living', 'bed'])), bk = P.room(xs[i], -4.6, xs[i + 1], -0.6, pick(['bed', 'bed', 'bath', 'study']));
      P.out(fr, 's', { at: (xs[i] + xs[i + 1]) / 2 - 1.2 }); P.door(fr, bk);
      // some flats are knocked together: a way through that doesn't use the walkway
      if (prev && chance(0.4)) P.door(prev, fr);
      prev = fr;
    }
    const tw = P.room(-hw - 3.8, -2.6, -hw, 4.9, 'stair', { wall: 'concrete', noWin: true, win: { w: { at: [0.6], w: 1.2, y: 1.2, h: 0.9 } } }), te = P.room(hw, -2.6, hw + 3.8, 4.9, 'stair', { wall: 'concrete', noWin: true });
    P.out(walk, 'w', {}); P.out(walk, 'e', {});
    if (f === 0) { P.out(tw, 's', { at: -hw - 1.9 }); P.out(te, 's', { at: hw + 1.9 }); }
    if (f < floors - 1) {
      switchStair(K, P, S[f + 1], -hw - 0.2, 4.9, 2, { W: 3.4 });
      switchStair(K, P, S[f + 1], hw + 3.6, 4.9, 2, { W: 3.4 });
    } else {
      switchStair(K, P, R, -hw - 0.2, 4.9, 2, { W: 3.4 });
      topRail(K, P, hw + 2, 3.3, hw + 3.6, 3.3);
    }
  });
  // a door from each stair tower onto the walkway
  S.forEach((P) => {
    const walk = P.rooms[0], tw = P.rooms.find((r) => r.type === 'stair' && r.x1 === -hw), te = P.rooms.find((r) => r.type === 'stair' && r.x0 === hw);
    walk.exts.length = 0; P.door(walk, tw, { at: 3.95, w: 1.75, leaf: false }); P.door(walk, te, { at: 3.95, w: 1.75, leaf: false });
  });
  const rects = [[-hw, -4.6, hw, 3], [-hw - 3.8, -2.6, -hw, 4.9], [hw, -2.6, hw + 3.8, 4.9]];
  foundation(K, rects);
  // pillars under the walkway
  for (const x of between(-hw, hw, n)) K.box(x - 0.14, 0, 4.72, x + 0.14, top - 0.2, 5.0, 'concreteDark', { ...PLAIN, faces: '+x-x+z-z' });
  finish(...S);
  flatRoof(K, [[-hw, -4.6, hw, 4.9], [-hw - 3.8, -2.6, -hw, 4.9], [hw, -2.6, hw + 3.8, 4.9]], top, { wall: L.ext, top: 'metalDark', holes: R.holes, par: 0.7 });
  stairHouse(K, top, -hw - 0.2, 4.9, 2, { mat: 'concrete' });
  roofClutter(K, -hw + 4, -4.6, hw - 1, 3, top, 5);
  K.spot(hw - 4, top, 0, { indoor: false, kind: 'room' });
  K.area(-hw - 3.8, -4.6, hw + 3.8, 4.9, floors);
}

// ---------------------------------------------------------------------------
// COURTYARD: rooms in a ring around an open yard, arcade below, gallery above
// ---------------------------------------------------------------------------
export function courtyard(b, out, o) {
  const K = new Kit(b, out, o), L = look(o, { plinth: 'stoneWall' }), h = 3.3, up = BASE + h, top = up + h, S = 14, C = 7.6, V = 5.6;
  const G = planOf(K, BASE, h, L, { ground: true, plinth: L.plinth, bay: 3.4 }), U = planOf(K, up, h, L, { bay: 3.4, flower: 0.5 });
  const court = { floor: 'pavers', outdoor: true, extMat: o.courtExt || 'wallCream', fill: false, noLoot: true };
  // ground: arcade band all around, the middle open to the sky
  const ga = [G.room(-C, -C, C, -V, 'corridor', { ...court }), G.room(-C, V, C, C, 'corridor', { ...court }), G.room(-C, -V, -V, V, 'corridor', { ...court }), G.room(V, -V, C, V, 'corridor', { ...court }), G.room(-V, -V, V, V, 'court', { ...court, fill: true, chests: 1, items: 1 })];
  // the ring of rooms. N and E sides hold the stairs.
  const mk = (P, list, types) => list.map(([x0, z0, x1, z1], i) => P.room(x0, z0, x1, z1, types[i % types.length]));
  const ringN = [[-S, -S, -6.2, -C], [-6.2, -S, -1.7, -C], [1.7, -S, 6.2, -C], [6.2, -S, S, -C]], ringS = [[-S, C, -2.2, S], [2.2, C, S, S]], ringW = [[-S, -C, -C, 0], [-S, 0, -C, C]], ringE = [[C, -C, S, -1.7], [C, 1.7, S, C]];
  const gn = mk(G, ringN, ['storeroom', 'restaurant', 'kitchen', 'office']), gs = mk(G, ringS, ['shop', 'bar']), gw = mk(G, ringW, ['living', 'office']), ge = mk(G, ringE, ['storeroom', 'living']);
  const sN = G.room(-1.7, -S, 1.7, -C, 'stair', { noWin: true }), sE = G.room(C, -1.7, S, 1.7, 'stair', { noWin: true });
  G.room(-2.2, C, 2.2, S, 'corridor', { ...court, floor: 'paversDark' });
  G.arch(ga[0], sN, { at: 0 }); G.arch(ga[3], sE, { at: 0 });
  G.door(gn[1], ga[0]); G.door(gn[2], ga[0]); G.door(gn[0], gn[1]); G.door(gn[2], gn[3]);
  G.door(gw[0], ga[2]); G.door(gw[1], ga[2]); G.door(ge[0], ga[3]); G.door(ge[1], ga[3]);
  G.door(gs[0], ga[1], { at: -5 }); G.door(gs[1], ga[1], { at: 5 });
  G.door(gn[0], gw[0]); G.door(gn[3], ge[0]); G.door(gw[1], gs[0]); G.door(ge[1], gs[1]);
  G.out(gn[3], 'n', { at: 10 }); G.out(gw[0], 'w', { at: -3.8 }); G.out(ge[1], 'e', { at: 4.6 }); G.out(gs[0], 's', { at: -8 }); G.out(gs[1], 's', { at: 8 });
  // upstairs: a gallery on top of the arcade
  const ua = [U.room(-C, -C, C, -V, 'corridor', { ...court, floor: 'tilesTerra' }), U.room(-C, V, C, C, 'corridor', { ...court, floor: 'tilesTerra' }), U.room(-C, -V, -V, V, 'corridor', { ...court, floor: 'tilesTerra' }), U.room(V, -V, C, V, 'corridor', { ...court, floor: 'tilesTerra' })];
  // the inner edge of the gallery is a railing
  const innerRail = () => {
    railing(K, -V, -V, V, -V, 1.05, 'woodDark', true, up); railing(K, -V, V, V, V, 1.05, 'woodDark', true, up);
    railing(K, -V, -V, -V, V, 1.05, 'woodDark', true, up); railing(K, V, -V, V, V, 1.05, 'woodDark', true, up);
  };
  const un = mk(U, ringN, ['bed', 'living', 'bed', 'office']), us = mk(U, [[-S, C, 0, S], [0, C, S, S]], ['bed', 'living']), uw = mk(U, ringW, ['bed', 'living']), ue = mk(U, ringE, ['study', 'bed']);
  const tN = U.room(-1.7, -S, 1.7, -C, 'stair', { noWin: true }), tE = U.room(C, -1.7, S, 1.7, 'stair', { noWin: true });
  U.arch(ua[0], tN, { at: 0 }); U.arch(ua[3], tE, { at: 0 });
  U.door(un[1], ua[0]); U.door(un[2], ua[0]); U.door(un[0], un[1]); U.door(un[2], un[3]);
  U.door(uw[0], ua[2]); U.door(uw[1], ua[2]); U.door(ue[0], ua[3]); U.door(ue[1], ua[3]);
  U.door(us[0], ua[1], { at: -4 }); U.door(us[1], ua[1], { at: 4 }); U.door(us[0], us[1], { at: 10.8 });
  U.door(un[0], uw[0]); U.door(un[3], ue[0]);
  switchStair(K, G, U, 1.7, -C, 2);
  switchStair(K, G, U, C, 1.7, 1);
  topRail(K, U, 0.1, -C - 1.6, 1.7, -C - 1.6); topRail(K, U, C + 1.6, 0.1, C + 1.6, 1.7);
  // pillars of the arcade
  const pil = [];
  for (const v of between(-V, V, 4)) { pil.push([v, -V], [v, V]); if (Math.abs(v) < V) pil.push([-V, v], [V, v]); }
  columns(K, pil, BASE, up, 0.22, o.pillar || 'marble');
  innerRail();
  foundation(K, [[-S, -S, S, S]]);
  finish(G, U);
  // the top floor's roof is a ring; stairs end under it
  flatRoof(K, [[-S, -S, S, -C], [-S, C, S, S], [-S, -C, -C, C], [C, -C, S, C]], top, { wall: L.ext, top: 'tilesTerra', par: 0.55, floor: 'rooftile' });
  K.area(-S, -S, S, S, 2);
  K.spot(0, BASE, 3.2, { indoor: false, kind: 'room' });
  // a tree and a fountain in the yard
  tree(K.sub(-3, 2.5, 0, false, BASE), 0, 0, 6.5, 2.3);
  K.box(1.2, BASE, -3.2, 4, BASE + 0.5, -0.4, 'marble', { skirt: false });
  K.box(1.45, BASE + 0.5, -2.95, 3.75, BASE + 0.53, -0.65, 'waterFountain', DECO);
}

// ---------------------------------------------------------------------------
// SHOP with a flat above: big window to the street, store behind
// ---------------------------------------------------------------------------
export function shop(b, out, o) {
  const K = new Kit(b, out, o), L = look(o, { shutter: null }), w = o.w || 14, d = o.d || 11, hw = w / 2, hd = d / 2, h = 3.3, up = BASE + h, top = up + 3, xs = hw - 1.45, sx = Math.min(1, xs - stairRun(h) * 2 - 1.5);
  const G = planOf(K, BASE, h, L, { ground: true, plinth: pick(['concreteDark', 'paversDark', null]) }), U = planOf(K, up, 3, L, { flower: 0.6 });
  const sell = G.room(-hw, -1.5, hw, hd, 'shop', { win: { s: { at: [-hw * 0.56, hw * 0.56], w: 3.4, y: 0.4, h: 2.2, plain: true } } }), store = G.room(-hw, -hd, sx, -1.5, 'storeroom'), hall = G.room(sx, -hd, hw, -1.5, 'hall', { fill: false, noWin: true });
  G.out(sell, 's', { w: 2.4, h: 2.6, leaf: false, at: 0 }); G.door(sell, store, { at: -3 }); G.door(sell, hall, { at: 4.8 }); G.out(store, 'n', { at: -3 }); G.out(store, 'w', { at: -hd + 2 });
  const land = U.room(sx, -hd, hw, -1.5, 'hall', { fill: false, noWin: true }), live = U.room(-hw, -hd, sx, hd, 'living'), bed = U.room(sx, -1.5, hw, hd, 'bed');
  U.door(land, live, { at: -hd + 3.1 }); U.door(live, bed, { at: 2 });
  straightStair(K, G, U, xs, -hd + 0.95, '-x', { w: 1.6 });
  const H = U.holes[0]; topRail(K, U, H[0], H[3], H[2], H[3]);
  if (chance(0.7)) U.balcony(bed, 's', { at: 4, w: 3.4, d: 1.2 });
  foundation(K, [[-hw, -hd, hw, hd]]);
  finish(G, U);
  flatRoof(K, [[-hw, -hd, hw, hd]], top, { wall: L.ext, top: L.trim }); roofClutter(K, -hw, -hd, hw, hd, top, 3);
  const c = pick([['canvasRed', 'paintWhite'], ['canvasGreen', 'paintWhite'], ['canvasBlue', 'paintWhite'], ['canvasYellow', 'wallCream']]);
  awning(K, -hw + 0.4, -1.5, hd + T / 2, BASE + 3.05, 1.5, c[0], c[1]); awning(K, 1.5, hw - 0.4, hd + T / 2, BASE + 3.05, 1.5, c[0], c[1]);
  if (o.sign) sign(K, o.sign, 0, BASE + 3.5, hd + T / 2 + 0.02, 0, 1, 4.4);
  band(K, [[-hw, -hd, hw, hd]], up - 0.1, up + 0.05, L.trim, 0.05);
  K.area(-hw, -hd, hw, hd, 2);
}

// ---------------------------------------------------------------------------
// BAR with a roof terrace: long counter below, tables and a good view on top
// ---------------------------------------------------------------------------
export function bar(b, out, o) {
  const K = new Kit(b, out, o), L = look(o, { ext: pick(['brickDark', 'plasterTerra', 'brick', 'plasterOchre']), shutter: null, plinth: 'concreteDark' }), hw = 7.5, hd = 6, h = 3.4, up = BASE + h;
  const G = planOf(K, BASE, h, L, { ground: true, plinth: L.plinth }), U = new Plan(K, up, 1.1, { ext: L.ext, railMat: 'woodDark' });
  const room = G.room(-hw, -2, hw, hd, 'bar', { win: { s: { at: [-5, 5], w: 2.6, y: 0.55, h: 1.8 } } }), kitchen = G.room(-hw, -hd, -1.5, -2, 'kitchen'), wc = G.room(-1.5, -hd, 1.5, -2, 'bath'), st = G.room(1.5, -hd, hw, -2, 'stair', { noWin: true });
  G.out(room, 's', { at: 0, w: 2.3, leaf: false, h: 2.6 }); G.out(room, 'w', { at: 2 }); G.door(room, kitchen, { at: -4 }); G.door(room, wc, { w: 1.3, at: 0 }); G.door(room, st, { at: 5.2 }); G.out(kitchen, 'n', { at: -4 }); G.out(st, 'e', { at: -3 });
  const terr = U.room(-hw, -hd, hw, hd, 'terrace', { outdoor: true, floor: 'woodPale', fill: false, chests: 2, items: 3 });
  U.edge(terr, 'nsew', 'low'); terr.lowH = 1.0;
  straightStair(K, G, U, hw - 1.45, -hd + 1, '-x', { w: 1.65 });
  const H = U.holes[0];
  topRail(K, U, H[0], H[3], H[2], H[3], 'woodDark'); topRail(K, U, H[2], H[1], H[2], H[3], 'woodDark');
  foundation(K, [[-hw, -hd, hw, hd]]);
  terr.extra = (p) => {
    p.at(ITEMS.barCounter(4), -2, -hd + 1.2, 0);
    for (let i = 0; i < 5; i++) p.at(ITEMS.roundTable, rnd(-hw + 1.5, hw - 1.5), rnd(-1, hd - 1.5));
    p.wall(ITEMS.planter); p.wall(ITEMS.planter);
  };
  finish(G, U);
  // pergola over the west half
  for (const x of [-hw + 0.4, -3.5, 0.5]) for (const z of [-1, hd - 0.4]) K.box(x - 0.07, up, z - 0.07, x + 0.07, up + 2.4, z + 0.07, 'woodDark', { ...PLAIN });
  for (const z of between(-1, hd - 0.4, 6)) K.box(-hw + 0.3, up + 2.4, z - 0.05, 0.6, up + 2.5, z + 0.05, 'woodDark', DECO);
  sign(K, 'BAR', 0, BASE + 2.95, hd + T / 2 + 0.02, 0, 1, 3);
  K.area(-hw, -hd, hw, hd, 2);
}

// ---------------------------------------------------------------------------
// OFFICE TOWER: core with stairs and lifts, every floor a different use, fire stairs outside
// ---------------------------------------------------------------------------
export function officeTower(b, out, o) {
  const K = new Kit(b, out, o), floors = o.floors || 7, h = 3.4, S = 12, top = BASE + floors * h, ext = o.ext || pick(['concrete', 'labWall', 'plasterGrey']);
  const PL = [];
  const mk = (f) => new Plan(K, BASE + f * h, h, { ext, frame: 'metalDark', leaf: 'metal', ground: f === 0, ceil: 'paintWhite', bay: 3, winW: 2.5, winY: 0.5, winH: 2.1, plinth: f === 0 ? 'marble' : null });
  for (let f = 0; f < floors; f++) PL.push(mk(f));
  const R = new Plan(K, top, 1, { ext: null });
  const uses = ['lobby', ...Array.from({ length: floors - 1 }, (_, i) => ['offices', 'open', 'meeting', 'server', 'open', 'offices'][i % 6])];
  PL.forEach((P, f) => {
    const core = P.room(-1.7, -3.3, 1.7, 3.3, 'stair', { wall: 'concrete', floor: 'concreteFloor', noWin: true });
    for (const x of [-4.7, 1.7]) P.room(x, -3.3, x + 3, 3.3, 'empty', { noFloor: f > 0, fill: false, noLoot: true, wall: 'metalDark' }); // the lift shafts
    const CS = P.room(-6.7, 3.3, 6.7, 5.3, 'corridor'), CN = P.room(-6.7, -5.3, 6.7, -3.3, 'corridor'), CW = P.room(-6.7, -3.3, -4.7, 3.3, 'corridor'), CE = P.room(4.7, -3.3, 6.7, 3.3, 'corridor');
    P.open(CS, CW); P.open(CS, CE); P.open(CN, CW); P.open(CN, CE);
    P.arch(CS, core, { at: 0, w: 2.6 });
    const use = uses[f];
    const bandS = [-12, 5.3, 12, 12], bandN = [-12, -12, 12, -5.3], bandW = [-12, -5.3, -6.7, 5.3], bandE = [6.7, -5.3, 12, 5.3];
    const ring = (type, cutsX, cutsZ) => {
      const rooms = [];
      for (const [q, cuts, ax] of [[bandS, cutsX, 'x'], [bandN, cutsX, 'x'], [bandW, cutsZ, 'z'], [bandE, cutsZ, 'z']]) {
        const list = cuts;
        for (let i = 0; i + 1 < list.length; i++) {
          const r = ax === 'x' ? [list[i], q[1], list[i + 1], q[3]] : [q[0], list[i], q[2], list[i + 1]];
          rooms.push({ rect: r, room: P.room(r[0], r[1], r[2], r[3], typeof type === 'function' ? type() : type), ax, q });
        }
      }
      for (const R0 of rooms) {
        const r = R0.room, cor = R0.q === bandS ? CS : R0.q === bandN ? CN : R0.q === bandW ? CW : CE;
        if (R0.ax === 'z' || (r.x1 > -6.7 && r.x0 < 6.7)) P.door(r, cor);
        // the corner rooms are reached through the room beside them
        else { const near = rooms.find((q) => q.q === R0.q && q !== R0 && (q.rect[0] === r.x1 || q.rect[2] === r.x0)); if (near) P.door(r, near.room); }
      }
      return rooms.map((q) => q.room);
    };
    let outer;
    if (use === 'lobby') {
      const lob = P.room(-12, 5.3, 12, 12, 'lobby'); P.open(lob, CS);
      P.out(lob, 's', { at: 0, w: 3.6, h: 2.8, leaf: false }); P.out(lob, 'e', { at: 8.5 }); P.out(lob, 'w', { at: 8.5 });
      const n = P.room(-12, -12, 12, -5.3, 'restaurant'); P.door(n, CN, { at: -3 }); P.door(n, CN, { at: 3 }); P.out(n, 'n', { at: -8 });
      const w = P.room(-12, -5.3, -6.7, 5.3, 'storeroom'), e = P.room(6.7, -5.3, 12, 5.3, 'office'); P.door(w, CW); P.door(e, CE); P.out(w, 'w', { at: 0 }); P.out(e, 'e', { at: 0 });
      outer = [lob, n, w, e];
    } else if (use === 'open') {
      const a = P.room(-12, 5.3, 12, 12, 'openoffice'), c = P.room(-12, -12, 12, -5.3, 'openoffice'), w = P.room(-12, -5.3, -6.7, 5.3, 'openoffice'), e = P.room(6.7, -5.3, 12, 5.3, 'openoffice');
      P.open(a, CS); P.open(c, CN); P.open(w, CW); P.open(e, CE);
      // the bands flow into each other in the corners
      P.open(a, w); P.open(a, e); P.open(c, w); P.open(c, e);
      outer = [a, c, w, e];
    } else if (use === 'meeting') {
      outer = ring(() => pick(['meeting', 'office', 'meeting']), [-12, -6.7, 6.7, 12], [-5.3, 0, 5.3]);
    } else if (use === 'server') {
      outer = ring(() => pick(['server', 'server', 'storeroom', 'office']), [-12, -4, 4, 12], [-5.3, 5.3]);
    } else {
      outer = ring(() => pick(['office', 'office', 'office', 'meeting']), [-12, -6.7, -1.2, 4, 12], [-5.3, 0, 5.3]);
    }
    P.outer = outer;
    switchStair(K, P, PL[f + 1] || R, 1.7, 3.3, 2, { divider: 'concrete' });
    // the lift doors
    if (f < floors) for (const x of [-3.2, 3.2]) {
      K.box(x - 0.9, BASE + f * h, 3.3 + T / 2, x + 0.9, BASE + f * h + 2.25, 3.3 + T / 2 + 0.03, 'metal', DECO);
      K.box(x - 0.02, BASE + f * h, 3.3 + T / 2, x + 0.02, BASE + f * h + 2.25, 3.3 + T / 2 + 0.04, 'black', DECO);
    }
  });
  // a second way up: steel stairs on the north side, a door on every floor
  const nRooms = PL.map((P) => P.outer.filter((r) => r.z1 <= -5.2));
  PL.forEach((P, f) => {
    const list = nRooms[f], r = list.find((q) => q.x0 <= -9 && q.x1 >= -9) || list[0];
    P.out(r, 'n', { at: -9.5, w: 1.75 });
    r.win.n = { bay: 3, w: 2.5, y: 0.5, h: 2.1 };
  });
  fireEscape(K, PL, -10.3, -12 - T / 2, 1);
  foundation(K, [[-S, -S, S, S]]);
  finish(...PL);
  flatRoof(K, [[-S, -S, S, S]], top, { wall: ext, top: 'metalDark', holes: R.holes });
  stairHouse(K, top, 1.7, 3.3, 2, { mat: 'concrete' });
  roofClutter(K, -S, -S, S, S, top, 7, [[-2.5, -3, 2.5, 3.6]]);
  // helipad
  K.box(3.5, top, -10, 11, top + 0.02, -2.5, 'paintYellow', { ...DECO, faces: '+y' }); K.box(3.7, top, -9.8, 10.8, top + 0.03, -2.7, 'concreteDark', { ...DECO, faces: '+y' });
  K.spot(7, top, -6, { indoor: false, kind: 'room' }); K.spot(-7, top, 7, { indoor: false, kind: 'room' });
  for (let f = 1; f <= floors; f++) band(K, [[-S, -S, S, S]], BASE + f * h - 0.32, BASE + f * h + 0.22, 'metalDark', 0.03);
  K.area(-S, -S, S, S, floors, 2);
  K.area(-S, -S - 7, -6, -S, 0, 2);
}

// ---------------------------------------------------------------------------
// TOWN HALL: a hall through two floors with a gallery and two free-standing stairs,
// offices in the wings, a clock tower you can climb
// ---------------------------------------------------------------------------
export function townHall(b, out, o) {
  const K = new Kit(b, out, o), ext = o.ext || 'stoneWall', h = 3.9, up = BASE + h, top = up + h, frame = 'marble';
  const opts = { ext, frame, leaf: 'woodDark', ceil: 'wallCream', bay: 3.4, winW: 1.6, winH: 2.2, winY: 0.7 };
  const G = new Plan(K, BASE, h, { ...opts, ground: true, plinth: 'marble', plinthH: 0.8 }), U = new Plan(K, up, h, { ...opts, winH: 1.9, railMat: 'woodDark' });
  const hallFloor = 'tilesCheck';
  const hall = G.room(-8, -8, 8, 7, 'lobby', { floor: hallFloor, wall: 'wallCream', fill: false, chests: 2, items: 3 }), vest = G.room(-4, 7, 4, 13, 'hall', { floor: 'marble', wall: 'marble', fill: false });
  const wW = [G.room(-17, -14, -8, -4.5, 'archive'), G.room(-17, -4.5, -8, 4.5, 'openoffice'), G.room(-17, 4.5, -8, 13, 'office')], wE = [G.room(8, -14, 17, -4.5, 'storeroom'), G.room(8, -4.5, 17, 4.5, 'archive'), G.room(8, 4.5, 17, 13, 'office')];
  const fS = [G.room(-8, 7, -4, 13, 'office'), G.room(4, 7, 8, 13, 'office')];
  const cW = G.room(-8, -14, -1.8, -8, 'meeting'), st = G.room(-1.8, -14, 1.8, -8, 'stair', { noWin: true }), cE = G.room(1.8, -14, 8, -8, 'study');
  G.arch(hall, vest, { at: 0, w: 4.2, h: 3.2 }); G.out(vest, 's', { at: 0, w: 3.4, h: 3.2, leaf: false });
  G.arch(hall, wW[1], { at: 0, w: 3, h: 2.8 }); G.arch(hall, wE[1], { at: 0, w: 3, h: 2.8 });
  G.door(wW[0], wW[1]); G.door(wW[1], wW[2]); G.door(wE[0], wE[1]); G.door(wE[1], wE[2]);
  G.door(fS[0], wW[2], { at: 10 }); G.door(fS[1], wE[2], { at: 10 }); G.door(vest, fS[0], { at: 11 }); G.door(vest, fS[1], { at: 11 });
  G.door(hall, cW, { at: -5 }); G.door(hall, cE, { at: 5 }); G.arch(hall, st, { at: 0, w: 2.8 });
  G.out(wW[0], 'w', { at: -9 }); G.out(wE[0], 'e', { at: -9 }); G.out(cW, 'n', { at: -5 }); G.out(cE, 'n', { at: 5 });
  // upstairs: the void is framed by a gallery
  const VX = 6, VZ0 = -4, VZ1 = 5;
  const gN = U.room(-8, -8, 8, VZ0, 'hall', { fill: false, floor: 'parquet', wall: 'wallCream' }), gS = U.room(-8, VZ1, 8, 7, 'hall', { fill: false, floor: 'parquet', wall: 'wallCream' }), gW = U.room(-8, VZ0, -VX, VZ1, 'hall', { fill: false, floor: 'parquet', wall: 'wallCream' }), gE = U.room(VX, VZ0, 8, VZ1, 'hall', { fill: false, floor: 'parquet', wall: 'wallCream' });
  U.open(gN, gW); U.open(gN, gE); U.open(gS, gW); U.open(gS, gE);
  U.edge(gN, 's', 'none'); U.edge(gS, 'n', 'none'); U.edge(gW, 'e', 'none'); U.edge(gE, 'w', 'none');
  const uW = [U.room(-17, -14, -8, -4.5, 'office'), U.room(-17, -4.5, -8, 4.5, 'meeting'), U.room(-17, 4.5, -8, 13, 'bunk')], uE = [U.room(8, -14, 17, -4.5, 'office'), U.room(8, -4.5, 17, 4.5, 'archive'), U.room(8, 4.5, 17, 13, 'study')];
  const uS = U.room(-8, 7, 8, 13, 'meeting', { win: { s: { bay: 3.2, w: 1.7, y: 0.6, h: 2.2 } } });
  const uN = [U.room(-8, -14, -1.8, -8, 'archive'), U.room(1.8, -14, 8, -8, 'office')], uSt = U.room(-1.8, -14, 1.8, -8, 'stair', { noWin: true });
  U.door(gW, uW[1], { at: 0 }); U.door(gE, uE[1], { at: 0 }); U.door(uW[0], uW[1]); U.door(uW[1], uW[2]); U.door(uE[0], uE[1]); U.door(uE[1], uE[2]);
  U.door(gS, uS, { at: 0, w: 2.4 }); U.door(gN, uN[0], { at: -5 }); U.door(gN, uN[1], { at: 5 }); U.arch(gN, uSt, { at: 0 });
  // two free-standing flights up to the north gallery
  for (const x of [-4.8, 4.8]) {
    const rise = up - BASE, run = rise / 0.8, s = K.sub(x, VZ0 + run, 2, false, BASE);
    const n = Math.round(rise / 0.25), sh = rise / n, sd = run / n;
    for (let i = 0; i < n; i++) s.box(-1.0, Math.max(0, sh * (i + 1) - 0.32), sd * i, 1.0, sh * (i + 1), sd * (i + 1), 'marble', PLAIN);
    sideRail(s, -1.0, rise, run, 'woodDark'); sideRail(s, 1.0, rise, run, 'woodDark');
    G.keep.push([x - 1.1, VZ0 - 0.1, x + 1.1, VZ0 + run + 1.2]);
  }
  // railing around the void, open where the flights arrive
  railing(K, -VX, VZ1, VX, VZ1, 1.05, 'woodDark', true, up);
  railing(K, -VX, VZ0, -VX, VZ1, 1.05, 'woodDark', true, up); railing(K, VX, VZ0, VX, VZ1, 1.05, 'woodDark', true, up);
  railing(K, -3.8, VZ0, 3.8, VZ0, 1.05, 'woodDark', true, up);
  railing(K, -6, VZ0, -5.8, VZ0, 1.05, 'woodDark', true, up); railing(K, 5.8, VZ0, 6, VZ0, 1.05, 'woodDark', true, up);
  // the stair of the north block keeps going up into the clock tower
  const roofLvl = new Plan(K, top, 3.1, { ext, frame, noWin: false, bay: 9, ground: false, ceil: 'plasterGrey', winH: 1.2, winY: 1.2, winW: 1 }), T1 = new Plan(K, top + 3.1, 3.1, { ext, frame, ceil: 'plasterGrey', bay: 9, winH: 1.2, winY: 1.2, winW: 1 }), Bell = new Plan(K, top + 6.2, 3.1, { ext, frame, noWin: true, ceil: 'plasterGrey' });
  const t0 = roofLvl.room(-1.8, -14, 1.8, -8, 'stair', { wall: 'concrete', win: { e: {}, w: {} } }), t1 = T1.room(-1.8, -14, 1.8, -8, 'stair', { wall: 'concrete', win: { e: {}, w: {} } }), t2 = Bell.room(-1.8, -14, 1.8, -8, 'lookout', { wall: 'concrete', chests: 1, items: 1 });
  roofLvl.out(t0, 's', { at: 0, w: 1.75 }); t0.noWin = false; t1.noWin = false;
  for (const s of ['n', 's', 'e', 'w']) Bell.out(t2, s, { y: 0.95, h: 1.7, w: 1.9, at: s === 'n' || s === 's' ? 0 : -11, leaf: false });
  for (const [lo, hi] of [[G, U], [U, roofLvl], [roofLvl, T1], [T1, Bell]]) switchStair(K, lo, hi, 1.7, -8, 2, { divider: 'concrete' });
  const rects = [[-17, -14, 17, 13]];
  foundation(K, [[-17, -14, 17, 13], [-9.5, 13, 9.5, 17]]);
  finish(G, U, roofLvl, T1, Bell);
  // roof: walkable, with a balustrade and a raised middle over the hall
  flatRoof(K, rects, top, { wall: ext, top: 'marble', par: 1.0, holes: [[-1.8, -14, 1.8, -8]], floor: 'concreteDark', ceil: 'wallCream' });
  K.spot(-12, top, 0, { indoor: false, kind: 'room' }); K.spot(12, top, 5, { indoor: false, kind: 'room' }); K.spot(0, top, 8, { indoor: false, kind: 'floor' });
  K.box(-7, top, -3, 7, top + 1.8, 4, 'concreteDark', { ...PLAIN }); K.box(-7.2, top + 1.8, -3.2, 7.2, top + 1.95, 4.2, 'metal', DECO);
  // portico
  columns(K, [-8, -4.8, -1.6, 1.6, 4.8, 8].map((x) => [x, 16]), BASE, up + 0.6, 0.42);
  K.box(-9.5, up + 0.6, 13, 9.5, up + 1.3, 17, 'marble', { ...PLAIN });
  K.box(-9.5, 0, 13, 9.5, BASE, 17.6, 'marble', { ...PLAIN });
  sign(K, 'RATHAUS', 0, up + 0.95, 17.02, 0, 1, 2.6);
  band(K, rects, up - 0.12, up + 0.06, 'marble', 0.07); band(K, rects, top - 0.14, top + 0.1, 'marble', 0.12);
  quoins(K, rects, BASE, top - 0.14, 'marble', 0.7);
  // the tower's top: clock faces and a pointed roof
  const bellTop = top + 6.2 + 3.1, TY = top + 3.4;
  for (const [nx, nz, cx, cz] of [[0, 1, 0, -8 + T / 2 + 0.05], [0, -1, 0, -14 - T / 2 - 0.05], [1, 0, 1.8 + T / 2 + 0.05, -11], [-1, 0, -1.8 - T / 2 - 0.05, -11]]) clock(K, cx, TY, cz, nx, nz);
  hipRoof(K, -1.8 - T / 2, -14 - T / 2, 1.8 + T / 2, -8 + T / 2, bellTop, { mat: 'roofGreen', rise: 4.2, over: 0.35 });
  band(K, [[-1.8, -14, 1.8, -8]], bellTop - 0.1, bellTop + 0.1, 'marble', 0.1);
  K.area(-17, -14, 17, 17.6, 3);
}
function clock(K, x, y, z, nx, nz) {
  const g = new THREE.CircleGeometry(0.95, 18), q = Math.atan2(nx, nz);
  K.geom(g, 'paintWhite', mtx(x, y, z, q));
  const a = new THREE.BoxGeometry(0.06, 0.72, 0.02); a.translate(0, 0.3, 0); const e = new THREE.BoxGeometry(0.08, 0.5, 0.02); e.translate(0, 0.2, 0);
  K.geom(a, 'black', mtx(x + nx * 0.02, y, z + nz * 0.02, q, 1, 1, 1, 0, 0.8));
  K.geom(e, 'black', mtx(x + nx * 0.02, y, z + nz * 0.02, q, 1, 1, 1, 0, -1.5));
}

// ---------------------------------------------------------------------------
// HOTEL: one long corridor per floor, a stair at each end, rooms that repeat until they don't
// ---------------------------------------------------------------------------
export function hotel(b, out, o) {
  const K = new Kit(b, out, o), L = look(o, { ext: pick(['plasterRose', 'plasterSand', 'wallCream']), shutter: 'shutterGreen', plinth: 'marble', trim: 'marble', frame: 'paintWhite', flower: 0.5 }), floors = o.floors || 4, h = 3.1, hw = 18, hd = 8, top = BASE + floors * h, S = [];
  for (let f = 0; f < floors; f++) S.push(planOf(K, BASE + f * h, h, L, { ground: f === 0, plinth: f === 0 ? L.plinth : null, bay: 2.6 }));
  const R = new Plan(K, top, 1, { ext: null });
  const stairEnd = hw - stairLen(h), carpet = pick(['carpetRed', 'carpetBlue', 'carpetBeige']);
  S.forEach((P, f) => {
    const cor = P.room(-stairEnd, -1, stairEnd, 1, 'corridor', { floor: f === 0 ? 'tilesCheck' : carpet, wall: 'wallCream' });
    const sW = P.room(-hw, -1.7, -stairEnd, 1.7, 'stair', { wall: 'wallCream', noWin: true, win: { w: { at: [0], w: 1.2 } } }), sE = P.room(stairEnd, -1.7, hw, 1.7, 'stair', { wall: 'wallCream', noWin: true, win: { e: { at: [0], w: 1.2 } } });
    P.open(cor, sW); P.open(cor, sE);
    // the corners beside the stairs
    const cn = [P.room(-hw, -hd, -stairEnd, -1.7, f ? 'bed' : 'storeroom'), P.room(stairEnd, -hd, hw, -1.7, f ? 'bed' : 'kitchen')], cs = [P.room(-hw, 1.7, -stairEnd, hd, f ? 'bed' : 'office'), P.room(stairEnd, 1.7, hw, hd, f ? 'bed' : 'storeroom')];
    const landings = () => { P.door(sW, cn[0], { at: -stairEnd - 0.8 }); P.door(sW, cs[0], { at: -stairEnd - 0.8 }); P.door(sE, cn[1], { at: stairEnd + 0.8 }); P.door(sE, cs[1], { at: stairEnd + 0.8 }); };
    if (f === 0) {
      const lobby = P.room(-8, 1, 8, hd, 'lobby'), din = P.room(-8, -hd, 8, -1, 'restaurant');
      P.open(cor, lobby); P.door(cor, din, { at: -3, w: 2.2 }); P.door(cor, din, { at: 3, w: 2.2 });
      P.out(lobby, 's', { at: 0, w: 3, h: 2.7, leaf: false }); P.out(din, 'n', { at: -5 });
      const a = P.room(-stairEnd, 1, -8, hd, 'bar'), c = P.room(8, 1, stairEnd, hd, 'shop'), e = P.room(-stairEnd, -hd, -8, -1, 'storeroom'), g = P.room(8, -hd, stairEnd, -1, 'kitchen');
      P.door(lobby, a, { at: 4.5 }); P.door(lobby, c, { at: 4.5 }); P.door(din, e, { at: -4.5 }); P.door(din, g, { at: -4.5 });
      P.door(cor, a, { at: -10 }); P.door(cor, c, { at: 10 }); P.door(cor, e); P.door(cor, g);
      landings();
      P.out(sW, 'w', {}); P.out(sE, 'e', {}); P.out(cs[0], 's', {}); P.out(cn[1], 'n', {});
    } else {
      landings();
      const xs = between(-stairEnd, stairEnd, Math.round(stairEnd * 2 / 5));
      for (let i = 0; i + 1 < xs.length; i++) {
        const a = xs[i], e = xs[i + 1], mid = a + 2.3, type = f === floors - 1 && i % 3 === 1 ? 'suite' : 'bed';
        // a guest room: a little entry with the bath beside it, then the room with its balcony
        const bath = P.room(a, 1, mid, 3.5, 'bath'), entry = P.room(mid, 1, e, 3.5, 'hall', { fill: false, floor: carpet }), main = P.room(a, 3.5, e, hd, type);
        P.door(cor, entry); P.door(entry, bath, { w: 1.2, leaf: false }); P.open(entry, main);
        if (chance(0.7)) P.balcony(main, 's', { at: (a + e) / 2, w: 3.2, d: 1.2, rail: 'metalDark' });
        const n = P.room(a, -hd, e, -1, f === 1 && i % 4 === 2 ? 'storeroom' : pick(['bed', 'bed', 'bed', 'suite']));
        P.door(cor, n);
        if (i > 0 && chance(0.2)) P.door(P.rooms[P.rooms.length - 5], n);
      }
    }
    const next = S[f + 1] || R;
    switchStair(K, P, next, -stairEnd, -1.7, 3);
    if (f < floors - 1) switchStair(K, P, next, stairEnd, 1.7, 1);
    else topRail(K, P, stairEnd + 1.6, 0.1, stairEnd + 1.6, 1.7);
  });
  foundation(K, [[-hw, -hd, hw, hd]]);
  finish(...S);
  flatRoof(K, [[-hw, -hd, hw, hd]], top, { wall: L.ext, top: L.trim, holes: R.holes, floor: 'tilesTerra' });
  stairHouse(K, top, -stairEnd, -1.7, 3, { mat: L.ext });
  // pool deck on the roof
  K.box(-6, top, -5.5, 8, top + 0.6, 2.5, 'tiles', { skirt: false, ao: false }); K.box(-5.6, top + 0.6, -5.1, 7.6, top + 0.63, 2.1, 'waterFountain', DECO);
  for (const x of [-12, -10, 11, 13]) ITEMS.deckChair.draw(K.sub(x, 4, 0, false, top));
  K.spot(12, top, -4, { indoor: false, kind: 'room' }); K.spot(-11, top, -4, { indoor: false, kind: 'room' });
  roofClutter(K, 9, -hd, hw, -1, top, 2);
  for (let f = 1; f < floors; f++) band(K, [[-hw, -hd, hw, hd]], BASE + f * h - 0.1, BASE + f * h + 0.04, L.trim, 0.04);
  band(K, [[-hw, -hd, hw, hd]], top - 0.1, top + 0.14, L.trim, 0.12);
  sign(K, 'HOTEL', 0, top + 1.8, hd + T / 2, 0, 1, 6);
  K.box(-3.05, top + 1, hd + T / 2 - 0.02, 3.05, top + 2.55, hd + T / 2, 'metalDark', DECO);
  K.area(-hw, -hd, hw, hd, floors);
}

// ---------------------------------------------------------------------------
// SCHOOL / CLINIC: a light corridor along the front, big rooms behind, a tall hall at the end
// ---------------------------------------------------------------------------
export function school(b, out, o) {
  const clinic = o.clinic, K = new Kit(b, out, o), L = look(o, clinic ? { ext: 'paintWhite', shutter: null, plinth: 'concreteDark', frame: 'metalDark', trim: 'concreteDark', flower: 0 } : { ext: pick(['plasterOchre', 'brickYellow', 'brick']), shutter: null, plinth: 'concreteDark', frame: 'paintWhite', trim: 'paintWhite', flower: 0 }), floors = o.floors || 2, h = 3.4, hw = 16, hd = 7, top = BASE + floors * h, S = [];
  for (let f = 0; f < floors; f++) S.push(planOf(K, BASE + f * h, h, L, { ground: f === 0, plinth: f === 0 ? L.plinth : null, bay: 2.8, winW: 2.1, winY: 0.8, winH: 1.8 }));
  const R = new Plan(K, top, 1, { ext: null });
  const SL = stairLen(h), xE = hw - SL, types = clinic ? ['ward', 'ward', 'lab', 'office', 'ward'] : ['classroom', 'classroom', 'lab', 'office', 'classroom'];
  S.forEach((P, f) => {
    const cor = P.room(-xE, 2.8, xE, hd, 'corridor', { floor: clinic ? 'labFloor' : 'tilesCheck', wall: clinic ? 'wallMint' : 'wallCream', win: { s: { bay: 2.8, w: 2.2, y: 0.8, h: 1.8 } } });
    const sW = P.room(-hw, 1.8, -xE, 5.2, 'stair', { noWin: true }), sE = P.room(xE, 1.8, hw, 5.2, 'stair', { noWin: true });
    const sW2 = P.room(-hw, 5.2, -xE, hd, 'bath'), sE2 = P.room(xE, 5.2, hw, hd, 'bath');
    P.arch(cor, sW, { at: 4 }); P.arch(cor, sE, { at: 4 }); P.door(cor, sW2, { w: 1.3 }); P.door(cor, sE2, { w: 1.3 });
    const xs = between(-hw, hw, 4);
    let prev = null;
    for (let i = 0; i < 4; i++) {
      const r = P.room(xs[i], -hd, xs[i + 1], i === 0 || i === 3 ? 1.8 : 2.8, f === 0 && i === 1 && !clinic ? 'gym' : types[(i + f * 2) % types.length]);
      if (i === 1 || i === 2) P.door(r, cor, { at: (xs[i] + xs[i + 1]) / 2 });
      else P.door(r, i === 0 ? sW : sE, { at: i === 0 ? -xE - 0.8 : xE + 0.8 });
      if (prev) P.door(prev, r, { at: -2 });
      prev = r;
    }
    if (f === 0) { P.out(cor, 's', { at: 0, w: 3, h: 2.7, leaf: false }); P.out(sW2, 'w', {}); P.out(sE2, 'e', {}); P.out(P.rooms[6], 'n', { at: -8 }); P.out(P.rooms[8], 'n', { at: 8 }); }
    if (f < floors - 1) {
      switchStair(K, P, S[f + 1], -xE, 1.8, 3, { W: 3.4 });
      switchStair(K, P, S[f + 1], xE, 5.2, 1, { W: 3.4 });
    } else {
      switchStair(K, P, R, -xE, 1.8, 3, { W: 3.4 });
      topRail(K, P, xE + 1.6, 3.5, xE + 1.6, 5.2);
    }
  });
  foundation(K, [[-hw, -hd, hw, hd]]);
  finish(...S);
  flatRoof(K, [[-hw, -hd, hw, hd]], top, { wall: L.ext, top: L.trim, holes: R.holes });
  stairHouse(K, top, -xE, 1.8, 3, { mat: L.ext });
  roofClutter(K, -8, -hd, hw, hd, top, 5);
  K.spot(10, top, -2, { indoor: false, kind: 'room' });
  sign(K, clinic ? 'KLINIK' : 'SCHULE', 0, BASE + floors * h + 0.55, hd + T / 2, 0, 1, 4.4);
  band(K, [[-hw, -hd, hw, hd]], BASE + h - 0.1, BASE + h + 0.04, L.trim, 0.04);
  if (clinic) {
    K.box(-0.5, BASE + 2.95, hd + T / 2 + 0.01, 0.5, BASE + 3.3, hd + T / 2 + 0.05, 'metalRed', DECO); K.box(-0.18, BASE + 2.62, hd + T / 2 + 0.01, 0.18, BASE + 3.64, hd + T / 2 + 0.05, 'metalRed', DECO);
    K.vehicle('offroad', -9, hd + 5, 1.57);
  }
  K.area(-hw, -hd, hw, hd, floors);
}

// ---------------------------------------------------------------------------
// PARKING DECK: open floors and low walls, ramps through the middle, cars as cover
// ---------------------------------------------------------------------------
export function parking(b, out, o) {
  const K = new Kit(b, out, o), ext = 'concrete', floors = o.floors || 3, h = 3, hw = o.w ? o.w / 2 : 19, hd = o.d ? o.d / 2 : 12, top = BASE + floors * h, S = [];
  const mk = (f) => new Plan(K, BASE + f * h, h, { ext, frame: 'concreteDark', ground: f === 0, ceil: 'concrete', noWin: true });
  for (let f = 0; f < floors; f++) S.push(mk(f));
  const R = new Plan(K, top, 1, { ext: null });
  const RUN = 13, RW = 3.8;
  const ramp = (P, Q, up) => {
    // a long gentle stair, wide enough to walk side by side
    const dir = up ? 1 : -1, z0 = up ? -1.9 - RW - 0.6 : 1.9 + 0.6, x0 = -dir * RUN / 2;
    const n = 15, sh = (Q.y - P.y) / n, sd = RUN / n, pad = 0.14;
    for (let i = 0; i < n; i++) {
      const a = x0 + dir * sd * i, e = x0 + dir * sd * (i + 1), t = P.y + sh * (i + 1);
      K.box(a, Math.max(P.y, t - 0.3), z0 + pad, e, t, z0 + RW - pad, 'concreteFloor', PLAIN);
    }
    const rs = K.sub(x0, z0 + RW / 2, up ? 1 : 3, false, P.y);
    sideRail(rs, RW / 2 - pad, Q.y - P.y, RUN, 'metalYellow'); sideRail(rs, -RW / 2 + pad, Q.y - P.y, RUN, 'metalYellow');
    Q.hole(-RUN / 2, z0, RUN / 2, z0 + RW);
    P.keep.push([-RUN / 2 - 1, z0, RUN / 2 + 1, z0 + RW]);
    railing(K, -RUN / 2, z0, RUN / 2, z0, 1.05, 'metalYellow', true, Q.y);
    railing(K, -RUN / 2, z0 + RW, RUN / 2, z0 + RW, 1.05, 'metalYellow', true, Q.y);
    return [z0];
  };
  S.forEach((P, f) => {
    const deck = P.room(-hw, -hd, hw, hd, 'empty', { fill: false, floor: 'concreteFloor', wall: 'concrete', chests: 3, items: 4 });
    if (f > 0) P.edge(deck, 'nsew', 'low'); else P.edge(deck, 'n', 'low');
    if (f === 0) { P.edge(deck, 'sew', 'low'); }
    deck.lowH = 1.15;
    const sw = P.room(-hw - 3.8, 2, -hw, hd, 'stair', { noWin: true, wall: 'concrete' }), ne = P.room(hw, -hd, hw + 3.8, -2, 'stair', { noWin: true, wall: 'concrete' });
    deck.edges.w = 'low'; deck.edges.e = 'low';
    const next = S[f + 1] || R;
    ramp(P, next, f % 2 === 0);
    P.door(deck, sw, { at: 3, leaf: false }); P.door(deck, ne, { at: -3, leaf: false });
    if (f === 0) {
      P.out(sw, 's', {}); P.out(ne, 'n', {}); P.door(deck, sw, { at: hd - 2, leaf: false }); P.door(deck, ne, { at: -hd + 2, leaf: false });
      for (const [side, at] of [['s', 0], ['n', 0], ['w', -hd / 2 - 1], ['e', hd / 2 + 1]]) P.out(deck, side, { at, w: 4.5, h: 3, leaf: false, frame: false });
    }
    switchStair(K, P, next, -hw - 3.6, 2, 0);
    if (f < floors - 1) switchStair(K, P, next, hw + 3.6, -2, 2);
    else topRail(K, P, hw + 2, -3.6, hw + 3.6, -3.6);
    // parked cars between the pillars
    const lane = (z) => { for (const x of between(-hw + 2, hw - 2, 5)) if (chance(0.45)) { const c = K.sub(x + rnd(-0.3, 0.3), z, 0, false, P.y); car(c, 0, 0, 'z', pick(['carPaintRed', 'carPaintBlue', 'carPaintWhite', 'carPaintGreen'])); P.keep.push([x - 1.1, z - 2.3, x + 1.1, z + 2.3]); } };
    lane(-hd + 2.8); lane(hd - 2.8);
    for (const x of between(-hw + 2, hw - 2, 7)) for (const z of [-hd + 5.3, hd - 5.3]) K.box(x - 0.3, P.y, z - 0.3, x + 0.3, P.y + h - SLAB, z + 0.3, 'concrete', { ...PLAIN, faces: '+x-x+z-z' });
    for (const x of between(-hw + 1, hw - 1, 12)) { K.box(x - 0.05, P.y, -hd + 0.2, x + 0.05, P.y + 0.012, -hd + 5, 'paintWhite', { ...DECO, faces: '+y' }); K.box(x - 0.05, P.y, hd - 5, x + 0.05, P.y + 0.012, hd - 0.2, 'paintWhite', { ...DECO, faces: '+y' }); }
  });
  foundation(K, [[-hw, -hd, hw, hd], [-hw - 3.8, 2, -hw, hd], [hw, -hd, hw + 3.8, -2]]);
  finish(...S);
  flatRoof(K, [[-hw, -hd, hw, hd], [-hw - 3.8, 2, -hw, hd], [hw, -hd, hw + 3.8, -2]], top, { wall: ext, holes: R.holes, top: 'metalYellow', par: 1.1, floor: 'concreteFloor', ceil: 'concrete' });
  stairHouse(K, top, -hw - 3.6, 2, 0, { h });
  for (let i = 0; i < 4; i++) K.spot(rnd(-hw + 3, hw - 3), top, rnd(-hd + 2, hd - 2), { indoor: false, kind: i < 2 ? 'room' : 'floor' });
  K.area(-hw - 3.8, -hd, hw + 3.8, hd, floors);
}

// ---------------------------------------------------------------------------
// WAREHOUSE / MARKET HALL / HANGAR / BARN: one big room with something to climb
// ---------------------------------------------------------------------------
export function warehouse(b, out, o) {
  const K = new Kit(b, out, o), w = o.w || 34, d = o.d || 22, hw = w / 2, hd = d / 2, h = o.h || 8.5, ext = o.ext || pick(['corrugated', 'contGrey', 'contBlue', 'contRed', 'brickDark']), kind = o.kind || 'warehouse';
  const P = new Plan(K, BASE, h, { ext, frame: 'metalDark', ground: true, plinth: o.plinth === undefined ? 'concreteDark' : o.plinth, plinthH: 0.8, extPen: o.extPen ?? (/cont|corr/.test(ext) ? 0.5 : 0), noWin: false, bay: 6.5, winW: 3, winY: h * 0.62, winH: 1.3 });
  const room = P.room(-hw, -hd, hw, hd, 'empty', { floor: o.floor || 'concreteFloor', wall: o.wall || ext, fill: false, chests: o.chests ?? Math.round(w * d / 170), items: o.items ?? Math.round(w * d / 110) });
  const gates = o.gates || [{ side: 's', at: 0, w: 7, h: 4.8 }, { side: 'n', at: -hw * 0.5, w: 4.5, h: 3.6 }, { side: 'w', at: 0, w: 3.6, h: 3.2 }, { side: 'e', at: hd * 0.4, w: 3.6, h: 3.2 }];
  for (const G of gates) P.out(room, G.side, { ...G, gate: true, leaf: false, fm: 'metalDark' });
  const keep = room.keep = [];
  // ---- catwalks: along the north and west wall, a stair at each end, a way across the middle
  const hasWalk = o.walk !== false && d > 16;
  const gy = o.walkY || 3.9;
  const walkRects = [];
  if (hasWalk) {
    const m = 'metalDark';
    const nz = -hd + T / 2, wd = 2.1, Y = BASE + gy;
    const plate = (x0, z0, x1, z1) => { K.box(x0, Y - 0.12, z0, x1, Y, z1, m, PLAIN); walkRects.push([x0, z0, x1, z1]); };
    plate(-hw + T / 2, nz, hw - T / 2, nz + wd);
    // stairs up at the north-east and the far end of the west walk
    const run = gy / 0.8, westEnd = hd - T / 2 - 1.6 - run;
    plate(-hw + T / 2, nz + wd, -hw + T / 2 + wd, westEnd);
    railing(K, -hw + T / 2 + wd, nz + wd, hw - 2.2, nz + wd, 1.05, 'metalYellow', true, Y);
    railing(K, -hw + T / 2 + wd, nz + wd, -hw + T / 2 + wd, westEnd, 1.05, 'metalYellow', true, Y);
    { const s = K.sub(hw - 1.1, nz + wd + run, 2, false, BASE); stepFlight(s, 1.75, gy, run, m, [1]); keep.push([hw - 2.2, nz + wd, hw, nz + wd + run + 1.5]); }
    { const s = K.sub(-hw + T / 2 + wd / 2, westEnd + run, 2, false, BASE); stepFlight(s, wd - 0.1, gy, run, m, [-1]); keep.push([-hw, westEnd - 0.1, -hw + wd + 0.3, westEnd + run + 1.3]); }
    for (const x of bays(-hw, hw - 2.2, 7)) K.box(x - 0.1, BASE, nz + wd - 0.1, x + 0.1, Y - 0.12, nz + wd + 0.1, m, WALL);
    for (const z of bays(nz + wd, westEnd, 7)) K.box(-hw + T / 2 + wd - 0.1, BASE, z - 0.1, -hw + T / 2 + wd + 0.1, Y - 0.12, z + 0.1, m, WALL);
    for (const x of bays(-hw + 3, hw - 6, 7)) { K.spot(x, Y, nz + 1.05, { kind: 'room' }); }
  }
  // ---- what stands around
  const yBase = BASE;
  const blocked = (x0, z0, x1, z1) => keep.some((k) => x0 < k[2] && x1 > k[0] && z0 < k[3] && z1 > k[1]) || gates.some((G) => {
    const gw = G.w / 2 + 1, c = G.at, dep = 6;
    if (G.side === 's') return x0 < c + gw && x1 > c - gw && z1 > hd - dep;
    if (G.side === 'n') return x0 < c + gw && x1 > c - gw && z0 < -hd + dep;
    if (G.side === 'w') return z0 < c + gw && z1 > c - gw && x0 < -hw + dep;
    return z0 < c + gw && z1 > c - gw && x1 > hw - dep;
  });
  if (kind === 'warehouse') {
    for (const x of bays(-hw + 3 + (hasWalk ? 2.1 : 0), hw - 3, 9)) for (const z of bays(-hd + 3 + (hasWalk ? 2.1 : 0), hd - 3, 6.5)) {
      const hx = 3.6, hz = 0.75;
      if (blocked(x - hx - 0.5, z - hz - 0.5, x + hx + 0.5, z + hz + 0.5)) continue;
      const r = Math.random();
      if (r < 0.55) rackRow(K, x, z, hx, hz, yBase);
      else if (r < 0.75) { crate(K, x - 1, z, 1.5, yBase); crate(K, x + 0.8, z + 0.3, 1.2, yBase, 'woodDark'); if (chance(0.5)) crate(K, x - 1, z, 1.1, yBase + 1.5); }
      else if (r < 0.9) { const c = K.sub(x, z, 0, false, yBase); container(c, 0, 0, 'x', pick(['contRed', 'contBlue', 'contGreen', 'contOrange'])); }
      else { const c = K.sub(x, z, 0, false, yBase); forklift(c, 0, 0, 0); }
    }
  } else if (kind === 'market') {
    const cols = ['canvasRed', 'canvasGreen', 'canvasBlue', 'canvasYellow'];
    for (const x of bays(-hw + 2, hw - 2, 7)) for (const z of bays(-hd + 2 + (hasWalk ? 2.1 : 0), hd - 2, 5.6)) {
      if (blocked(x - 2.4, z - 1.2, x + 2.4, z + 1.2)) continue;
      K.box(x - 2.2, yBase, z - 0.9, x + 2.2, yBase + 0.95, z + 0.9, pick(['wood', 'woodDark', 'woodPale']), { skirt: false, pen: 0.7 });
      for (const [ax, az] of [[-2.1, -0.85], [2.1, -0.85], [-2.1, 0.85], [2.1, 0.85]]) K.box(x + ax - 0.05, yBase, z + az - 0.05, x + ax + 0.05, yBase + 2.5, z + az + 0.05, 'woodDark', DECO);
      K.box(x - 2.5, yBase + 2.5, z - 1.2, x + 2.5, yBase + 2.6, z + 1.2, pick(cols), DECO);
      for (let i = 0; i < 5; i++) K.box(x - 2 + i * 0.85, yBase + 0.95, z - 0.5, x - 1.45 + i * 0.85, yBase + 1.25, z + 0.5, pick(['canvasYellow', 'canvasRed', 'foliage', 'carpetBeige']), DECO);
      K.spot(x, yBase + 0.95, z, { kind: 'floor' });
    }
  } else if (kind === 'hangar') {
    const c = K.sub(0, 0, 0, false, yBase);
    plane(c, o.planeRot || 0);
    for (const [x, z] of [[-hw + 4, hd - 6], [hw - 4, hd - 6], [hw - 5, -hd + 8]]) { crate(K, x, z, 1.4, yBase); barrel(K, x + 1.6, z, 'metalRed', yBase); }
    truck(c, -hw + 8, -hd + 8, 'x', 'carPaintWhite');
  } else if (kind === 'barn') {
    for (const x of bays(-hw + 2, hw - 2, 4.5)) for (const z of [-hd + 2.2, hd - 2.2]) {
      if (blocked(x - 1.3, z - 0.7, x + 1.3, z + 0.7)) continue;
      ITEMS.hay.draw(K.sub(x, z, 0, false, yBase));
    }
  }
  foundation(K, [[-hw, -hd, hw, hd]]);
  P.keep.push(...walkRects.map((r) => [r[0], r[1], r[2], r[3]]));
  finish(P);
  const top = BASE + h;
  const roofKind = o.roofKind || 'flat';
  if (roofKind === 'gable') gableRoof(K, -hw - T / 2, -hd - T / 2, hw + T / 2, hd + T / 2, top, { along: o.ridge || 'x', rise: o.rise || 2.6, mat: o.roofMat || 'metalDark', wall: ext, rake: 0.2, ceil: 'woodDark' });
  else {
    K.box(-hw - 0.15, top, -hd - 0.15, hw + 0.15, top + 0.2, hd + 0.15, o.roofMat || 'metalDark', { ...PLAIN });
    if (o.vents !== false) roofClutter(K, -hw, -hd, hw, hd, top + 0.2, Math.round(w / 8));
  }
  for (const x of bays(-hw, hw, 7)) K.box(x - 0.12, top - 0.5, -hd, x + 0.12, top, hd, 'metalDark', DECO);
  // light strips, the only thing that makes a closed hall readable
  for (const x of bays(-hw, hw, 9)) for (const z of bays(-hd, hd, 7)) K.box(x - 1.3, top - 0.62, z - 0.12, x + 1.3, top - 0.56, z + 0.12, 'lampOn', DECO);
  if (o.sign) sign(K, o.sign, 0, BASE + Math.min(h - 1.2, 6), hd + T / 2 + 0.02, 0, 1, o.signW || 6);
  K.area(-hw, -hd, hw, hd, 2);
}
// open treads rising in +z from z = 0; rails: on which sides a handrail runs (-1, 1)
export function stepFlight(s, w, rise, run, mat, rails = []) {
  const n = Math.round(rise / 0.25), sh = rise / n, sd = run / n;
  for (let i = 0; i < n; i++) s.box(-w / 2, Math.max(0, sh * (i + 1) - 0.3), sd * i, w / 2, sh * (i + 1), sd * (i + 1), mat, PLAIN);
  for (const r of rails) sideRail(s, r * w / 2, rise, run, mat);
}
function rackRow(K, x, z, hx, hz, y) {
  K.box(x - hx, y, z - hz, x + hx, y + 0.1, z + hz, 'metalDark', { skirt: false, ao: false });
  for (const lv of [1.45, 2.9]) K.box(x - hx, y + lv, z - hz, x + hx, y + lv + 0.1, z + hz, 'metalYellow', { skirt: false, ao: false });
  for (const ax of [-hx, 0, hx]) for (const az of [-hz, hz]) K.box(x + ax - 0.06, y, z + az - 0.06, x + ax + 0.06, y + 3.4, z + az + 0.06, 'metalDark', { skirt: false, ao: false });
  for (let i = 0; i < 4; i++) {
    const cx = x - hx + 0.95 + i * (hx * 2 - 1.9) / 3, cz = z;
    if (chance(0.75)) crate(K, cx, cz, 1.1, y + 0.1, pick(['wood', 'woodDark']));
    if (chance(0.55)) crate(K, cx, cz, 1.0, y + 1.55);
    if (chance(0.35)) crate(K, cx, cz, 0.8, y + 3.0, 'woodDark');
  }
}
function plane(c, rot) {
  const k = rot ? c.sub(0, 0, 1) : c;
  k.box(-10, 1.3, -1.3, 10, 3.6, 1.3, 'paintWhite', { skirt: false });
  k.box(-13, 1.8, -0.9, -10, 3.2, 0.9, 'paintWhite', { skirt: false, ao: false }); k.box(10, 1.6, -1, 12.5, 3, 1, 'paintWhite', { skirt: false, ao: false });
  k.box(-2, 3, -11, 2, 3.25, 11, 'paintWhite', { skirt: false, ao: false });
  k.box(-13, 3.2, -0.15, -11, 6.2, 0.15, 'metalRed', { skirt: false, ao: false }); k.box(-13.2, 3.2, -3.4, -11.3, 3.4, 3.4, 'paintWhite', { skirt: false, ao: false });
  for (const [x, z] of [[-8, 0], [5, -1.7], [5, 1.7]]) k.box(x - 0.15, 0, z - 0.15, x + 0.15, 1.4, z + 0.15, 'metalDark', { skirt: false, ao: false });
  for (const z of [-6, 6]) k.box(-1.4, 2, z - 0.6, 1.4, 3.05, z + 0.6, 'metalDark', { skirt: false, ao: false });
}

// ---------------------------------------------------------------------------
// GARAGE: two gates, a car on the lift, roof reached by steel stairs outside
// ---------------------------------------------------------------------------
export function garage(b, out, o) {
  const K = new Kit(b, out, o), L = look(o, { ext: pick(['plasterGrey', 'concrete', 'brickDark', 'plasterSand']), shutter: null, flower: 0, plinth: 'concreteDark', frame: 'metalDark' }), hw = 8, hd = 6, h = 3.8, top = BASE + h;
  const P = planOf(K, BASE, h, L, { ground: true, plinth: L.plinth, winH: 1.1, winY: 1.6 });
  const shopR = P.room(-hw, -hd, 3.4, hd, 'garage', { win: { s: false }, noCar: true }), office = P.room(3.4, 0.4, hw, hd, 'office'), parts = P.room(3.4, -hd, hw, 0.4, 'storeroom');
  P.out(shopR, 's', { at: -5, w: 3.7, h: 3.2, gate: true, leaf: false }); P.out(shopR, 's', { at: -0.6, w: 3.7, h: 3.2, gate: true, leaf: false }); P.out(shopR, 'n', { at: -6 }); P.out(office, 's', { at: 5.8 });
  P.door(shopR, office, { at: 3.5 }); P.door(shopR, parts, { at: -3 }); P.door(office, parts, { at: 5.7 });
  // a car in the bay and a shadow pit
  const c = K.sub(-5, -1.2, 0, false, BASE); car(c, 0, 0, 'z', pick(['carPaintRed', 'carPaintBlue', 'carPaintWhite']));
  P.keep.push([-6.1, -3.6, -3.9, 1.2]);
  foundation(K, [[-hw, -hd, hw, hd]]);
  finish(P);
  flatRoof(K, [[-hw, -hd, hw, hd]], top, { wall: L.ext, top: 'metalDark', par: 0 });
  roofClutter(K, -hw, -hd, hw, hd, top, 3);
  K.spot(5, top, 0, { indoor: false, kind: 'room' });
  // steel stairs up the east side
  const run = h / 0.8, s = K.sub(hw + T / 2 + 0.9, hd - 0.2, 2, false, 0);
  stepFlight(s, 1.75, top, run + 0.2, 'metalDark', [-1]);
  K.box(hw + T / 2, top - 0.1, hd - run - 2.8, hw + T / 2 + 1.8, top, hd - run - 0.4, 'metalDark', PLAIN);
  sign(K, 'GARAGE', 2.5, top - 0.6, hd + T / 2 + 0.02, 0, 1, 3.2);
  for (const [x, z] of [[-hw - 1.2, -2], [-hw - 1.3, 1.2]]) { ITEMS.tires.draw(K.sub(x, z, 0, false, 0)); }
  K.area(-hw, -hd, hw + 2, hd, 1);
}

// ---------------------------------------------------------------------------
// GAS STATION: a small shop, the canopy, pumps to hide behind
// ---------------------------------------------------------------------------
export function gasStation(b, out, o) {
  const K = new Kit(b, out, o), L = look(o, { ext: 'paintWhite', shutter: null, flower: 0, plinth: 'concreteDark', frame: 'metalDark' }), h = 3.3, top = BASE + h;
  const P = planOf(K, BASE, h, L, { ground: true, plinth: L.plinth });
  const sale = P.room(-6, -9, 6, -3, 'shop', { win: { s: { at: [-3.8, 3.8], w: 3, y: 0.45, h: 2.1, plain: true } } }), back = P.room(-6, -13, 0, -9, 'storeroom'), wc = P.room(0, -13, 6, -9, 'bath');
  P.out(sale, 's', { at: 0, w: 2.2, h: 2.6, leaf: false }); P.door(sale, back); P.door(sale, wc, { w: 1.3 }); P.out(back, 'n', { at: -3 });
  foundation(K, [[-6, -13, 6, -3]]);
  finish(P);
  flatRoof(K, [[-6, -13, 6, -3]], top, { wall: 'metalRed', top: 'metalDark', par: 0.5 }); acUnit(K, -2, -9, top);
  // the forecourt
  K.box(-14, 0, -3, 14, 0.06, 13, 'concreteFloor', { ...DECO, faces: '+y' });
  for (const [x, z] of [[-9, 2], [9, 2], [-9, 9], [9, 9]]) K.box(x - 0.2, 0, z - 0.2, x + 0.2, 5, z + 0.2, 'paintWhite', { ...PLAIN, faces: '+x-x+z-z' });
  K.box(-12, 5, 0, 12, 5.45, 11, 'paintWhite', PLAIN); K.box(-12.03, 5.1, -0.03, 12.03, 5.35, 11.03, 'metalRed', { ...DECO, faces: '+x-x+z-z' });
  for (const [x, z] of [[-5, 3.2], [5, 3.2], [-5, 7.8], [5, 7.8]]) {
    K.box(x - 1.5, 0, z - 0.45, x + 1.5, 0.2, z + 0.45, 'concrete', { skirt: false, ao: false });
    K.box(x - 0.45, 0.2, z - 0.28, x + 0.45, 1.75, z + 0.28, 'metalRed', { skirt: false, ao: false, pen: 0.3 });
    K.box(x - 0.3, 1.0, z + 0.28, x + 0.3, 1.5, z + 0.29, 'screen', DECO); K.box(x - 0.3, 1.0, z - 0.29, x + 0.3, 1.5, z - 0.28, 'screen', DECO);
    K.spot(x + 2.3, 0, z, { indoor: false, kind: 'floor', ground: true });
  }
  sign(K, 'TANKSTELLE', 0, 5.22, 11.08, 0, 1, 4);
  K.box(13.5, 0, -2, 14, 7.4, -1.5, 'metalDark', { ...PLAIN, faces: '+x-x+z-z' });
  sign(K, 'TANKSTELLE', 13.75, 7.8, -1.7, 0, 1, 3.2);
  K.vehicle(o.car || 'sedan', 0, 5.4, 1.57);
  K.area(-14, -13, 14, 13, 1, 1);
}

// ---------------------------------------------------------------------------
// RUIN: what the war left. Broken walls, half a floor, rubble: cover without a roof
// ---------------------------------------------------------------------------
export function ruin(b, out, o) {
  const K = new Kit(b, out, o), hw = (o.w || 13) / 2, hd = (o.d || 11) / 2, ext = o.ext || pick(['brick', 'stoneWall', 'plasterGrey', 'brickDark']), y = BASE, t = 0.3;
  const P = { skirt: false };
  K.box(-hw, -1, -hd, hw, y, hd, 'concreteFloor', { ...PLAIN });
  const jag = (ax, line, a0, a1, gaps) => {
    let a = a0;
    while (a < a1 - 0.1) {
      const w = Math.min(rnd(0.9, 2.1), a1 - a), c = a + w / 2, gap = gaps.some((g) => Math.abs(g - c) < 1.1);
      const hh = gap ? 0 : chance(0.15) ? rnd(0.6, 1.1) : rnd(1.3, 5.2);
      if (hh > 0) {
        if (ax === 'x') K.box(a, y, line - t / 2, a + w, y + hh, line + t / 2, ext, P); else K.box(line - t / 2, y, a, line + t / 2, y + hh, a + w, ext, P);
        // upper window holes, seen from far as a house that once was
        if (hh > 3.8) { if (ax === 'x') K.box(a + 0.2, y + 2.6, line - t / 2 - 0.01, a + w - 0.2, y + 3.6, line + t / 2 + 0.01, 'black', DECO); else K.box(line - t / 2 - 0.01, y + 2.6, a + 0.2, line + t / 2 + 0.01, y + 3.6, a + w - 0.2, 'black', DECO); }
      }
      a += w;
    }
  };
  jag('x', -hd, -hw, hw, [rnd(-hw + 1, hw - 1)]); jag('x', hd, -hw, hw, [rnd(-hw + 1, 0), rnd(1, hw - 1)]); jag('z', -hw, -hd, hd, [rnd(-hd + 1, hd - 1)]); jag('z', hw, -hd, hd, [rnd(-hd + 1, hd - 1)]);
  // what is left of the first floor, one stair still leads up
  const up = y + 3.1, sx = -hw + t, slabX = 1.2;
  K.box(-hw + t / 2, up - 0.25, -hd + t / 2, slabX, up, -0.6, 'concrete', { skirt: false, ao: false });
  K.box(-hw + 2.4, up - 0.25, -0.6, slabX - 0.6, up, 1.3, 'concrete', { skirt: false, ao: false });
  const s = K.sub(sx + 1, 3.3, 2, false, y); stepFlight(s, 1.8, 3.1, 3.9, 'concreteDark');
  K.spot(-2, up, -2.6, { indoor: false, kind: 'room' });
  // rubble
  for (let i = 0; i < 12; i++) {
    const x = rnd(-hw + 1, hw - 1), z = rnd(-hd + 1, hd - 1), w = rnd(0.5, 1.6), d = rnd(0.5, 1.4), hh = rnd(0.25, 0.8);
    if (x < sx + 2.4 && z > -0.8 && z < 4) continue;
    K.box(x - w / 2, y, z - d / 2, x + w / 2, y + hh, z + d / 2, pick([ext, 'concrete', 'concreteDark']), { skirt: false, ao: false });
  }
  K.spot(hw - 2.2, y, hd - 2.2, { indoor: false, kind: 'room' }); K.spot(1, y, 2, { indoor: false, kind: 'floor' });
  if (chance(0.5)) { const c = K.sub(hw + 3.2, 0, 0, false, 0); car(c, 0, 0, 'z', 'black'); }
  K.area(-hw, -hd, hw, hd, 1);
}

// ---------------------------------------------------------------------------
// CHURCH: a tall nave with pews and a loft, the tower is the sniper's nest
// ---------------------------------------------------------------------------
export function church(b, out, o) {
  const K = new Kit(b, out, o), ext = o.ext || 'plasterWhite', h = 8, top = BASE + h, tH = 3.4;
  const N = new Plan(K, BASE, h, { ext, frame: 'marble', ground: true, plinth: 'stoneWall', noWin: true });
  const nave = N.room(-5.5, -12, 5.5, 9, 'chapel', { wall: 'wallCream', floor: 'pavers', fill: false, chests: 2, items: 2 });
  N.win(nave, 'e', { at: [-9, -5, -1, 3], w: 1.3, y: 2.4, h: 3.8, fm: 'marble', plain: true }); N.win(nave, 'w', { at: [-9, -5, -1], w: 1.3, y: 2.4, h: 3.8, fm: 'marble', plain: true });
  nave.noWin = false; N.noWin = false; nave.win.n = { at: [0], w: 1.8, y: 3, h: 3.6, plain: true }; nave.win.s = false;
  N.out(nave, 's', { at: 0, w: 2.6, h: 3.2, leaf: false, fm: 'stoneWall' }); N.out(nave, 'e', { at: 5.8 }); N.out(nave, 'w', { at: -5.5 });
  N.out(nave, 'w', { at: 8, w: 1.75 }); N.out(nave, 'w', { at: 8, w: 1.75, y: tH, h: 2.3 });
  // pews, an aisle down the middle
  for (let z = -5.5; z < 2.8; z += 1.5) for (const x of [-3, 3]) { ITEMS.pew(3.6).draw(K.sub(x, z, 0, false, BASE)); N.keep.push([x - 1.8, z - 0.4, x + 1.8, z + 0.4]); }
  // altar on a step
  K.box(-5.4, BASE, -11.9, 5.4, BASE + 0.4, -8.5, 'marble', { skirt: false, ao: false });
  K.box(-1.4, BASE + 0.4, -10.8, 1.4, BASE + 1.45, -9.6, 'marble', { skirt: false, ao: false });
  K.box(-1.5, BASE + 1.45, -10.9, 1.5, BASE + 1.5, -9.5, 'canvasRed', DECO);
  K.box(-0.08, BASE + 2.2, -11.87, 0.08, BASE + 5.2, -11.82, 'metalYellow', DECO); K.box(-0.8, BASE + 4, -11.87, 0.8, BASE + 4.18, -11.82, 'metalYellow', DECO);
  // the tower beside the entrance
  const TW = [];
  for (let f = 0; f < 4; f++) TW.push(new Plan(K, BASE + f * tH, tH, { ext, frame: 'marble', ground: f === 0, plinth: f === 0 ? 'stoneWall' : null, noWin: f === 3, ceil: 'plasterGrey', winW: 0.9, winH: 1.5, winY: 1.1, bay: 9 }));
  const tr = TW.map((P, f) => P.room(-9.4, 3.2, -5.52, 9, f === 3 ? 'lookout' : 'stair', { wall: 'stoneWall', floor: 'concreteFloor', chests: f === 3 ? 1 : 0, items: f === 3 ? 1 : 0, noLoot: f !== 3 }));
  TW[0].out(tr[0], 's', { at: -7.4, w: 1.75 });
  tr[0].edges.e = 'none'; tr[1].edges.e = 'none'; tr[2].win.e = false; tr[3].win.e = false;
  for (const s of ['n', 's', 'w']) TW[3].out(tr[3], s, { y: 0.95, h: 1.7, w: 1.9, at: s === 'w' ? 6.1 : -7.45, leaf: false });
  TW[3].out(tr[3], 'e', { y: 0.95, h: 1.7, w: 1.9, at: 6.1, leaf: false });
  N.keep.push([-5.5, 7, -4, 9]);
  // the loft inside the nave at the height of the tower's first floor
  const loftY = BASE + tH;
  K.box(-5.4, loftY - 0.2, 5.1, 5.4, loftY, 8.9, 'wood', { ...PLAIN });
  K.box(-5.4, loftY - 0.2, 5.1, 5.4, loftY - 0.19, 8.9, 'wallCream', DECO);
  railing(K, -5.4, 5.1, 5.4, 5.1, 1.05, 'woodDark', true, loftY);
  for (const x of [-4.6, 4.6]) K.box(x - 0.18, BASE, 5.0, x + 0.18, loftY, 5.3, 'marble', { ...PLAIN, faces: '+x-x+z-z' });
  K.spot(0, loftY, 7, { kind: 'room' }); K.spot(3.5, loftY, 7.2, { kind: 'floor' });
  for (let f = 0; f < 3; f++) switchStair(K, TW[f], TW[f + 1], -5.7, 8.8, 2, { W: 3.4, L: 1.6, F: 0.9, divider: 'stoneWall' });
  foundation(K, [[-5.5, -12, 5.5, 9], [-9.4, 3.2, -5.5, 9]]);
  finish(N, ...TW);
  gableRoof(K, -5.5 - T / 2, -12 - T / 2, 5.5 + T / 2, 9 + T / 2, top, { along: 'z', rise: 4.6, mat: o.roofMat || 'roofSlate', wall: ext, over: 0.5, rake: 0.3 });
  // the top of the tower: four open sides and a spire
  const bellY = BASE + 4 * tH;
  hipRoof(K, -9.4 - T / 2, 3.2 - T / 2, -5.5 + T / 2, 9 + T / 2, bellY, { mat: o.roofMat || 'roofSlate', rise: 5.6, over: 0.3 });
  K.box(-7.5, bellY + 5.6, 6, -7.4, bellY + 7.3, 6.2, 'metalYellow', DECO); K.box(-7.9, bellY + 6.5, 6, -7, bellY + 6.65, 6.2, 'metalYellow', DECO);
  K.area(-9.4, -12, 5.5, 9, 2);
}

// ---------------------------------------------------------------------------
// BUNKER: thick walls, firing slits, a bent way in so nobody sees straight through
// ---------------------------------------------------------------------------
export function bunker(b, out, o) {
  const K = new Kit(b, out, o), h = 2.8, top = BASE + h, hw = 8.5, hd = 5.5;
  const P = new Plan(K, BASE, h, { ext: 'concreteDark', frame: 'metalDark', ground: true, t: 0.45, pen: 0, ceil: 'concrete', noWin: true });
  const mainR = P.room(-hw, -hd, 3, hd, 'storeroom', { wall: 'concrete', floor: 'concreteFloor' }), map = P.room(3, -0.6, hw, hd, 'office', { wall: 'concrete', floor: 'concreteFloor' }), baffle = P.room(3, -hd, hw, -0.6, 'corridor', { wall: 'concrete', floor: 'concreteFloor', fill: false });
  P.door(mainR, map, { at: 2 }); P.door(mainR, baffle, { at: -3, leaf: false }); P.out(baffle, 'e', { at: -4, w: 1.75, leaf: false });
  P.out(mainR, 'w', { at: 3.2, w: 1.75, leaf: false });
  const slit = { w: 1.8, y: 1.35, h: 0.42, plain: true };
  P.noWin = false;
  P.win(mainR, 's', { ...slit, at: [-5.5, -1.5] }); P.win(mainR, 'n', { ...slit, at: [-5.5, -1.5] }); P.win(map, 's', { ...slit, at: [5.8] }); P.win(mainR, 'w', { ...slit, at: [-2.2] }); P.win(baffle, 'n', false); P.win(map, 'e', { ...slit, at: [2.6] });
  foundation(K, [[-hw, -hd, hw, hd]]);
  finish(P);
  K.box(-hw - 0.23, top - SLAB, -hd - 0.23, hw + 0.23, top + 0.3, hd + 0.23, 'concreteDark', { ...PLAIN });
  // solid steps up to the roof with its sandbag nest
  stairs(K, -hw + 2, hd + 0.23 + 0.05 + 4, '-z', 1.9, top + 0.3, 4, 'concreteDark');
  const n = K.sub(1, 0, 0, false, top + 0.3);
  sandbags(n, -4, -3.2, 5, 'x'); sandbags(n, 3, 3, 5, 'x'); sandbags(n, 6.5, -0.5, 4, 'z');
  K.spot(1, top + 0.3, 0, { indoor: false, kind: 'room' });
  K.area(-hw, -hd, hw, hd + 4.4, 1);
}

// ---------------------------------------------------------------------------
// BARRACKS: one long room of bunks, an office at one end, doors at both
// ---------------------------------------------------------------------------
export function barracks(b, out, o) {
  const K = new Kit(b, out, o), L = look(o, { ext: pick(['plasterGreen', 'concrete', 'contGreen']), shutter: null, flower: 0, plinth: 'concreteDark', frame: 'metalDark' }), hw = (o.w || 26) / 2, hd = 5.5, h = 3.3, top = BASE + h;
  const P = planOf(K, BASE, h, L, { ground: true, plinth: L.plinth, bay: 3, winW: 1.3, winY: 1.1, winH: 1.2 });
  const hallR = P.room(-hw, -hd, hw - 7, hd, 'bunk'), off = P.room(hw - 7, 0, hw, hd, 'office'), arms = P.room(hw - 7, -hd, hw, 0, 'storeroom');
  P.door(hallR, off, { at: 2.8 }); P.door(hallR, arms, { at: -2.8 }); P.door(off, arms);
  P.out(hallR, 'w', { at: 0, w: 2 }); P.out(off, 's', { at: hw - 3.5 }); P.out(hallR, 'n', { at: 0 }); P.out(hallR, 's', { at: -hw + 5 });
  foundation(K, [[-hw, -hd, hw, hd]]);
  finish(P);
  gableRoof(K, -hw - T / 2, -hd - T / 2, hw + T / 2, hd + T / 2, top, { along: 'x', rise: 2.1, mat: 'metalDark', wall: L.ext });
  K.area(-hw, -hd, hw, hd, 1);
}

// ---------------------------------------------------------------------------
// TOWER: a shaft of stairs and a glass cab on top. Control tower, watch post.
// ---------------------------------------------------------------------------
export function controlTower(b, out, o) {
  const K = new Kit(b, out, o), floors = o.floors || 5, h = 3.1, ext = o.ext || 'concrete', S = [], W = 3.4;
  const bx = 2.05, bz = 3.2;
  for (let f = 0; f < floors; f++) S.push(new Plan(K, BASE + f * h, h, { ext, frame: 'metalDark', ground: f === 0, plinth: f === 0 ? 'concreteDark' : null, noWin: false, bay: 9, winW: 1.0, winH: 1.2, winY: 1.2, ceil: 'concrete' }));
  const capY = BASE + floors * h;
  const Cab = new Plan(K, capY, 3, { ext, frame: 'metalDark', ceil: 'paintWhite', railMat: 'metalYellow', noWin: false, bay: 2.3, winW: 2, winY: 1.0, winH: 1.7 });
  S.forEach((P, f) => {
    const r = P.room(-bx, -bz, bx, bz, 'stair', { wall: 'concrete', win: { w: {}, e: {} } });
    r.noWin = false;
    if (f === 0) P.out(r, 's', { at: -0.4, w: 1.75 });
    switchStair(K, P, S[f + 1] || Cab, W / 2, bz - 0.1, 2, { divider: 'concrete' });
  });
  // the cab: wider than the shaft, a walkway all around
  const cab = Cab.room(-4, -4.2, 4, 4.2, 'server', { fill: false, wall: 'labWall', floor: 'labFloor', chests: 1, items: 2, extra: (p) => { p.wall(ITEMS.desk, { side: 'n' }); p.wall(ITEMS.desk, { side: 's' }); p.wall(ITEMS.desk, { side: 'e' }); p.wall(ITEMS.cabinet); } });
  Cab.out(cab, 'e', { at: 0, w: 1.75 });
  Cab.extra.push({ rect: [4, -4.2, 5.7, 4.2], floor: 'metalDark' });
  railing(K, 5.7, -4.2, 5.7, 4.2, 1.05, 'metalYellow', true, capY); railing(K, 4, -4.2, 5.7, -4.2, 1.05, 'metalYellow', true, capY); railing(K, 4, 4.2, 5.7, 4.2, 1.05, 'metalYellow', true, capY);
  foundation(K, [[-bx, -bz, bx, bz]]);
  finish(...S, Cab);
  K.box(-4.5, capY + 3 - 0.1, -4.7, 6, capY + 3.15, 4.7, 'metalDark', { ...PLAIN });
  K.area(-4, -4.2, 5.7, 4.2, floors);
}

// ---------------------------------------------------------------------------
// Small things
// ---------------------------------------------------------------------------
export function fisherHut(b, out, o) {
  const K = new Kit(b, out, o), ext = o.ext || pick(['woodBlue', 'woodRed', 'woodSiding', 'woodDark', 'wood']), hw = 4, hd = 3.2, h = 2.7, top = BASE + h;
  const P = new Plan(K, BASE, h, { ext, frame: 'woodDark', ground: true, extPen: 0.7, pen: 0.7, shutter: chance(0.5) ? 'shutterBlue' : null, bay: 2.8, winW: 1.1, winH: 1, winY: 1 });
  const r = P.room(-hw, -hd, hw, hd, pick(['storeroom', 'bed', 'kitchen']), { wall: 'woodPale', floor: 'wood' });
  P.out(r, 's', { at: 1.6 }); P.out(r, 'n', { at: -1.6 });
  foundation(K, [[-hw, -hd, hw, hd]]);
  finish(P);
  gableRoof(K, -hw - T / 2, -hd - T / 2, hw + T / 2, hd + T / 2, top, { along: 'x', rise: 1.7, mat: pick(['metalDark', 'roofSlate', 'corrugated']), wall: ext });
  if (chance(0.5)) chimney(K, -2, 0, top + 0.5, 1.6);
  K.spot(-2.5, 0, 5, { indoor: false, kind: 'floor', ground: true });
  K.area(-hw, -hd, hw, hd, 1);
}

export function bungalow(b, out, o) {
  const K = new Kit(b, out, o), ext = o.ext || pick(['plasterWhite', 'wallCream', 'plasterSand', 'woodSiding']), hw = 5.5, hd = 4, h = 3;
  const P = new Plan(K, BASE, h, { ext, frame: 'paintWhite', ground: true, leaf: 'shutterBlue', bay: 2.6, winW: 1.6, winH: 1.6, winY: 0.7, shutter: chance(0.5) ? 'shutterBlue' : null });
  const main = P.room(-hw, -hd, 1.6, hd, 'living'), bedR = P.room(1.6, -0.6, hw, hd, 'bed'), wash = P.room(1.6, -hd, hw, -0.6, 'bath');
  P.door(main, bedR, { at: 1.6 }); P.door(main, wash, { w: 1.3, at: -2.3 }); P.out(main, 's', { at: -2, w: 2.2, leaf: false }); P.out(bedR, 's', { at: 3.5 });
  foundation(K, [[-hw, -hd, hw, hd]]);
  finish(P);
  (chance(0.5) ? hipRoof : gableRoof)(K, -hw - T / 2, -hd - T / 2, hw + T / 2, hd + T / 2, BASE + h, { along: 'x', rise: 1.9, mat: pick(['roofGreen', 'rooftile', 'roofSlate']), wall: ext });
  // a deck to the beach
  K.box(-hw, 0, hd + T / 2, hw, BASE, hd + 2.8, 'woodPale', { ...PLAIN });
  railing(K, -hw, hd + 2.8, -1, hd + 2.8, 1.0, 'woodDark', true, BASE);
  ITEMS.deckChair.draw(K.sub(-3.5, hd + 1.5, 1, false, BASE));
  K.spot(3, BASE, hd + 1.6, { indoor: false, kind: 'room' });
  K.area(-hw, -hd, hw, hd + 2.8, 1);
}

// a farmhouse: the cottage's big brother, half timbered, kitchen and big table below
export function farmhouse(b, out, o) {
  const K = new Kit(b, out, o), L = look(o, { ext: 'plasterWhite', shutter: 'shutterGreen', plinth: 'stoneWall', frame: 'woodDark', flower: 0.7 }), hw = 8, hd = 5.5, h = 3, up = BASE + h, top = up + h;
  const tm = o.timber ?? 'woodDark';
  const G = planOf(K, BASE, h, L, { ground: true, plinth: L.plinth, timber: tm }), U = planOf(K, up, h, L, { timber: tm });
  const hall = G.room(-1, -hd, 2.4, hd, 'hall', { fill: false, floor: 'tilesTerra' }), kit0 = G.room(-hw, -hd, -1, hd, 'restaurant', { fill: false, wall: 'wallCream', floor: 'tilesTerra', extra: (p) => { p.wall(ITEMS.kitchenRun(3.2)); p.center(ITEMS.longTable(3.6)); p.wall(ITEMS.fridge); p.lamp(); } }), store = G.room(2.4, -hd, hw, 0, 'storeroom'), stube = G.room(2.4, 0, hw, hd, 'living');
  G.door(hall, kit0, { at: 3 }); G.door(hall, store, { at: -3 }); G.door(hall, stube, { at: 3 }); G.out(hall, 's', { at: 0.7, w: 2 }); G.out(hall, 'n', { at: 0.7 }); G.out(kit0, 'w', { at: -2 });
  const land = U.room(-1, -hd, 2.4, hd, 'hall', { fill: false, floor: 'wood' }), bedW = U.room(-hw, -hd, -1, 0.5, 'bed'), bedW2 = U.room(-hw, 0.5, -1, hd, 'bed'), bedE = U.room(2.4, -hd, hw, hd, 'attic', { wall: 'plasterWhite', floor: 'wood' });
  U.door(land, bedW, { at: -3 }); U.door(land, bedW2, { at: 3 }); U.door(land, bedE, { at: 3.5 }); U.door(bedW, bedW2);
  straightStair(K, G, U, 0.7, 1.2, '-z', { w: 1.75, rail: 'both' });
  const H = U.holes[0]; topRail(K, U, H[0], H[3], H[2], H[3]); topRail(K, U, H[0], H[1], H[0], H[3]); topRail(K, U, H[2], H[1], H[2], H[3]);
  foundation(K, [[-hw, -hd, hw, hd]]);
  finish(G, U);
  gableRoof(K, -hw - T / 2, -hd - T / 2, hw + T / 2, hd + T / 2, top, { along: 'x', rise: 3.1, mat: L.roof, wall: L.ext, over: 0.6, rake: 0.4 });
  chimney(K, -4.6, -1.5, top + 1.4, 2.4, 'stoneWall');
  K.area(-hw, -hd, hw, hd, 2);
}

// radio shack: instruments behind steel doors
export function radioShack(b, out, o) {
  const K = new Kit(b, out, o), hw = 7.5, hd = 5.5, h = 3.1, top = BASE + 2 * h;
  const opts = { ext: 'labWall', frame: 'metalDark', leaf: 'metal', bay: 3, winW: 1.4, winH: 1.1, winY: 1.1, extPen: 0.3 };
  const G = new Plan(K, BASE, h, { ...opts, ground: true, plinth: 'concreteDark' }), U = new Plan(K, BASE + h, h, opts), R = new Plan(K, top, 1, { ext: null });
  const st = G.room(-hw, -hd, -4.1, 1.2, 'stair', { noWin: true, wall: 'labWall' }), server = G.room(-4.1, -hd, hw, 1.2, 'server'), front = G.room(-hw, 1.2, hw, hd, 'lab');
  G.door(st, front, { at: -5.8 }); G.door(front, server, { at: 2 }); G.door(st, server, { at: 0.4 }); G.out(front, 's', { at: 0 }); G.out(server, 'e', { at: -2 });
  const us = U.room(-hw, -hd, -4.1, 1.2, 'stair', { noWin: true, wall: 'labWall' }), u1 = U.room(-4.1, -hd, hw, 1.2, 'office'), u2 = U.room(-hw, 1.2, hw, hd, 'bunk');
  U.door(us, u2, { at: -5.8 }); U.door(us, u1, { at: 0.4 }); U.door(u1, u2, { at: 3 });
  switchStair(K, G, U, -4.1, 1.2, 2); switchStair(K, U, R, -4.1, 1.2, 2);
  foundation(K, [[-hw, -hd, hw, hd]]);
  finish(G, U);
  flatRoof(K, [[-hw, -hd, hw, hd]], top, { wall: 'labWall', top: 'metalDark', holes: R.holes, par: 0.8 });
  stairHouse(K, top, -4.1, 1.2, 2, { mat: 'labWall' });
  roofClutter(K, -3, -hd, hw, hd, top, 3);
  K.spot(3, top, 2, { indoor: false, kind: 'room' });
  K.area(-hw, -hd, hw, hd, 2);
}

// open cover for streets and yards
export function coverPile(K, x, z, y = 0) {
  const r = Math.random();
  if (r < 0.4) { crate(K, x, z, 1.3, y); crate(K, x + 1.3, z + 0.2, 1.1, y, 'woodDark'); }
  else if (r < 0.7) { barrel(K, x, z, 'metalRed', y); barrel(K, x + 0.9, z + 0.3, 'metalDark', y); barrel(K, x + 0.4, z + 0.9, 'metalRed', y); }
  else K.box(x - 1.5, y, z - 0.35, x + 1.5, y + 1.0, z + 0.35, 'concrete', { pen: 0, skirt: false });
  K.spot(x + 1.5, y, z + 1.5, { indoor: false, kind: 'floor', ground: true });
}

export { Kit, rnd, pick, chance, PLAIN, WALL, mtx, sideRail };
