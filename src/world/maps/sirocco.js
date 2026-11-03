import * as THREE from 'three';
import { wallX, wallZ, stairs, crate, palm, mtx } from '../props.js';
import { MATERIALS } from '../mapBuilder.js';
import { projectUV } from '../textures.js';

// =============================================================================
// SIROCCO — a walled caravan town in the desert, late afternoon. Small-medium,
// built for 8-10 players: lanes, flat roofs and a domed market in the middle.
//   Center : the domed market hall, a door on every side; the rug stand in
//            the middle breaks the way straight through.
//   North  : the well square, a tea house terrace along the town wall.
//   South  : a caravanserai: courtyard with a cistern, gates west, east and
//            north, a gallery on the arcade roofs reached by two stairs.
//   Sides  : the caravan yards inside the town gates (spawns), three ways
//            into town, houses to run through, roofs with stairs up to them
//            and a bridge between them over the street.
// Mirror-symmetric across x = 0: team 0 west, team 1 east.
// =============================================================================
const T = 0.4;    // adobe walls
const HH = 3.6;   // a storey
const RS = 0.25;  // roof slab
const PAR = 0.9;  // roof parapet
const WZ = 16.6;  // the well
const HW = 5.6;   // walls of the market hall

const flat = { collide: false, ao: false };
const JAR = new THREE.LatheGeometry([[0, 0], [0.16, 0.02], [0.26, 0.2], [0.29, 0.42], [0.22, 0.66], [0.1, 0.78], [0.12, 0.86], [0.09, 0.88]].map(([r, y]) => new THREE.Vector2(r, y)), 10);
const SACK = new THREE.CylinderGeometry(0.22, 0.27, 0.5, 9);
const HEAP = new THREE.ConeGeometry(0.21, 0.2, 9);
const WHEEL = new THREE.CylinderGeometry(0.55, 0.55, 0.1, 14);
const SPICE = ['paintYellow', 'canvasRed', 'woodDark', 'plasterTerra', 'foliage', 'carPaintRed'];

function scaleUV(g, s) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s);
  return g;
}

// A wall with round-topped openings, along x (axis 'x', centered on z = m) or along z (axis 'z', centered on x = m),
// a0..a1 long, y0..y0+h tall, t thick. ops: [{ c, w, s, sill }]: s = where the round top starts; a sill makes it a
// window. One extruded shape for the eye. For the body the solid parts, and over every opening a lintel and two
// steps along each curve that never reach into the open middle (the way backrooms.js does its arches).
function archWall(b, axis, a0, a1, m, y0, h, t, mat, ops) {
  const doors = ops.filter((o) => !o.sill).sort((p, q) => p.c - q.c), wins = ops.filter((o) => o.sill);
  const shape = new THREE.Shape();
  shape.moveTo(a0, 0);
  for (const o of doors) {
    const R = o.w / 2;
    shape.lineTo(o.c - R, 0); shape.lineTo(o.c - R, o.s);
    shape.absarc(o.c, o.s, R, Math.PI, 0, true);
    shape.lineTo(o.c + R, 0);
  }
  shape.lineTo(a1, 0); shape.lineTo(a1, h); shape.lineTo(a0, h); shape.lineTo(a0, 0);
  for (const o of wins) {
    const R = o.w / 2, p = new THREE.Path();
    p.moveTo(o.c - R, o.sill); p.lineTo(o.c + R, o.sill); p.lineTo(o.c + R, o.s);
    p.absarc(o.c, o.s, R, 0, Math.PI, false); p.lineTo(o.c - R, o.sill);
    shape.holes.push(p);
  }
  const g = scaleUV(new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 10 }), 1 / (MATERIALS[mat].scale || 2));
  b.geom(g, mat, axis === 'x' ? mtx(0, y0, m - t / 2) : mtx(m + t / 2, y0, 0, -Math.PI / 2));
  const solid = (u0, u1, ya, yb) => {
    if (u1 - u0 < 1e-3 || yb - ya < 1e-3) return;
    if (axis === 'x') b.box(u0, y0 + ya, m - t / 2, u1, y0 + yb, m + t / 2, mat, { visual: false });
    else b.box(m - t / 2, y0 + ya, u0, m + t / 2, y0 + yb, u1, mat, { visual: false });
  };
  const all = ops.slice().sort((p, q) => p.c - q.c);
  let cur = a0;
  for (const o of all) { solid(cur, o.c - o.w / 2, 0, h); cur = o.c + o.w / 2; }
  solid(cur, a1, 0, h);
  for (const o of all) {
    const R = o.w / 2, l = o.c - R, r = o.c + R, yOf = (u) => o.s + Math.sqrt(Math.max(0, R * R - (u - o.c) ** 2));
    if (o.sill) solid(l, r, 0, o.sill);
    solid(l, r, yOf(o.c - R * 0.35), h);
    for (const w of [0.18, 0.4]) { solid(l, l + R * w, yOf(l + R * w), h); solid(r - R * w, r, yOf(r - R * w), h); }
  }
}

// a flat roof with a parapet; gaps: [{ side, a0, a1 }] where the parapet stays open. The ends of the roof beams
// stick out of the walls under it, the way these roofs are built.
function roof(b, x0, z0, x1, z1, y, mat, gaps = []) {
  b.box(x0, y, z0, x1, y + RS, z1, mat);
  const top = y + RS, p = 0.3;
  const runs = (side, a0, a1) => {
    let segs = [[a0, a1]];
    for (const g of gaps) if (g.side === side) segs = segs.flatMap(([s, e]) => (g.a1 <= s || g.a0 >= e ? [[s, e]] : [[s, g.a0], [g.a1, e]].filter(([q, r]) => r - q > 0.05)));
    return segs;
  };
  for (const [s, e] of runs('n', x0, x1)) b.box(s, top, z1 - p, e, top + PAR, z1, mat);
  for (const [s, e] of runs('s', x0, x1)) b.box(s, top, z0, e, top + PAR, z0 + p, mat);
  for (const [s, e] of runs('w', z0 + p, z1 - p)) b.box(x0, top, s, x0 + p, top + PAR, e, mat);
  for (const [s, e] of runs('e', z0 + p, z1 - p)) b.box(x1 - p, top, s, x1, top + PAR, e, mat);
  for (let x = x0 + 0.6; x < x1 - 0.4; x += 0.9) for (const [za, zb] of [[z1, z1 + 0.35], [z0 - 0.35, z0]]) b.box(x - 0.07, y - 0.32, za, x + 0.07, y - 0.18, zb, 'woodDark', flat);
}

// wood around an opening in the face of a wall: a lintel through the wall over a door, open shutters beside a window
function trim(b, side, at, o, t, shut) {
  const ax = side === 'n' || side === 's', out = side === 'n' || side === 'e' ? 1 : -1;
  const put = (a0, a1, y0, y1, d0, d1, mat) => {
    const lo = Math.min(at + out * d0, at + out * d1), hi = Math.max(at + out * d0, at + out * d1);
    if (ax) b.box(a0, y0, lo, a1, y1, hi, mat, flat); else b.box(lo, y0, a0, hi, y1, a1, mat, flat);
  };
  const top = (o.y || 0) + (o.h ?? 2.3);
  if (!o.y) put(o.c - o.w / 2 - 0.22, o.c + o.w / 2 + 0.22, top, top + 0.16, 0.06, -t - 0.06, 'woodDark');
  else {
    put(o.c - o.w, o.c - o.w / 2, o.y, top, 0.01, 0.06, shut);
    put(o.c + o.w / 2, o.c + o.w, o.y, top, 0.01, 0.06, shut);
    put(o.c - o.w / 2 - 0.08, o.c + o.w / 2 + 0.08, o.y - 0.08, o.y, 0.1, -t - 0.02, 'adobeLight');
  }
}

// A house to run through: adobe walls with doors (y 0) and windows (y > 0) as in wallX / wallZ, a tiled floor and a
// flat roof with a parapet. ops: { n, s, w, e } openings per side.
function house(b, x0, z0, x1, z1, mat, ops, gaps, shut) {
  wallX(b, x0, x1, z1 - T / 2, 0, HH, T, mat, ops.n || []);
  wallX(b, x0, x1, z0 + T / 2, 0, HH, T, mat, ops.s || []);
  wallZ(b, z0 + T, z1 - T, x0 + T / 2, 0, HH, T, mat, ops.w || []);
  wallZ(b, z0 + T, z1 - T, x1 - T / 2, 0, HH, T, mat, ops.e || []);
  const at = { n: z1, s: z0, w: x0, e: x1 };
  for (const side of Object.keys(ops)) for (const o of ops[side]) trim(b, side, at[side], o, T, shut);
  b.box(x0 + T, 0, z0 + T, x1 - T, 0.015, z1 - T, 'tilesTerra', flat);
  roof(b, x0, z0, x1, z1, HH, mat, gaps);
}

// A house nobody goes into: one block, with doors and windows painted on the faces that show
function block(b, x0, z0, x1, z1, h, mat, faces = {}) {
  b.box(x0, 0, z0, x1, h, z1, mat);
  const at = { n: z1, s: z0, w: x0, e: x1 };
  for (const side of Object.keys(faces)) for (const o of faces[side]) paint(b, side, at[side], o);
  for (let x = x0 + 0.5; x < x1 - 0.3; x += 0.9) for (const [za, zb] of [[z1, z1 + 0.3], [z0 - 0.3, z0]]) b.box(x - 0.07, h - 0.45, za, x + 0.07, h - 0.31, zb, 'woodDark', flat);
}
// a door or window on a closed face: a dark recess in a wooden frame, shutters beside a window
function paint(b, side, at, o) {
  const ax = side === 'n' || side === 's', out = side === 'n' || side === 'e' ? 1 : -1;
  const put = (a0, a1, y0, y1, d0, d1, mat) => {
    const lo = Math.min(at + out * d0, at + out * d1), hi = Math.max(at + out * d0, at + out * d1);
    if (ax) b.box(a0, y0, lo, a1, y1, hi, mat, flat); else b.box(lo, y0, a0, hi, y1, a1, mat, flat);
  };
  if (o.k === 'd') {
    put(o.c - 0.6, o.c + 0.6, 0, 2.2, 0, 0.03, o.m || 'woodDark');
    put(o.c - 0.74, o.c + 0.74, 2.2, 2.36, 0, 0.09, 'woodDark');
  } else {
    const y = o.y ?? 1.5;
    put(o.c - 0.42, o.c + 0.42, y, y + 1.0, 0, 0.02, 'black');
    put(o.c - 0.86, o.c - 0.44, y, y + 1.0, 0.02, 0.06, o.m || 'shutterBlue');
    put(o.c + 0.44, o.c + 0.86, y, y + 1.0, 0.02, 0.06, o.m || 'shutterBlue');
    put(o.c - 0.52, o.c + 0.52, y - 0.08, y, 0, 0.11, 'adobeLight');
  }
}

// A flight of n solid steps rising toward dir, like stairs() in props.js but with the number of steps given: low
// steps can be walked onto from the side as well (the foot of this one stands against a wall)
function flight(b, x, z, dir, width, rise, run, mat, n) {
  for (let i = 0; i < n; i++) {
    const top = (rise * (i + 1)) / n, a = (run * i) / n, c = (run * (i + 1)) / n;
    if (dir === '+x') b.box(x + a, 0, z - width / 2, x + c, top, z + width / 2, mat, { ao: false });
    if (dir === '-x') b.box(x - c, 0, z - width / 2, x - a, top, z + width / 2, mat, { ao: false });
    if (dir === '+z') b.box(x - width / 2, 0, z + a, x + width / 2, top, z + c, mat, { ao: false });
    if (dir === '-z') b.box(x - width / 2, 0, z - c, x + width / 2, top, z - a, mat, { ao: false });
  }
}

// ------------------------------------------------------------------ market things
function jar(b, x, z, s = 1, y = 0) {
  b.box(x - 0.27 * s, y, z - 0.27 * s, x + 0.27 * s, y + 0.86 * s, z + 0.27 * s, 'clay', { visual: false, pen: 0.8 });
  b.geom(JAR, 'clay', mtx(x, y, z, x * 3.1 + z, s, s, s));
}
function sack(b, x, z, k, y = 0, solid = true) {
  if (solid) b.box(x - 0.25, y, z - 0.25, x + 0.25, y + 0.55, z + 0.25, 'sandbag', { visual: false });
  b.geom(SACK, 'sandbag', mtx(x, y + 0.25, z));
  b.geom(HEAP, SPICE[((k % SPICE.length) + SPICE.length) % SPICE.length], mtx(x, y + 0.56, z));
}
// counter with goods on it, four posts and a striped awning. along: which way the counter runs
function stall(b, x, z, along, awning, k = 0) {
  const ax = along === 'x', hx = ax ? 1.1 : 0.45, hz = ax ? 0.45 : 1.1, px = ax ? 1.05 : 0.68, pz = ax ? 0.68 : 1.05;
  b.box(x - hx, 0, z - hz, x + hx, 0.9, z + hz, 'woodDark', { pen: 0.6 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(x + sx * px - 0.045, 0, z + sz * pz - 0.045, x + sx * px + 0.045, 2.3, z + sz * pz + 0.045, 'woodDark', flat);
  b.box(x - px - 0.18, 2.3, z - pz - 0.18, x + px + 0.18, 2.36, z + pz + 0.18, awning, flat);
  for (let i = -1; i <= 1; i++) sack(b, x + (ax ? i * 0.62 : 0), z + (ax ? 0 : i * 0.62), k + i + 1, 0.9, false);
}
function cart(b, x, z, along) {
  const ax = along === 'x', L = 1.4, W = 0.75;
  const hx = ax ? L : W, hz = ax ? W : L;
  b.box(x - hx, 0, z - hz, x + hx, 1.2, z + hz, 'wood', { visual: false, pen: 0.7 });
  b.box(x - hx, 0.55, z - hz, x + hx, 0.68, z + hz, 'wood', flat);
  for (const s of [-1, 1]) {
    if (ax) b.box(x - hx, 0.68, z + s * W - 0.05, x + hx, 1.0, z + s * W + 0.05, 'wood', flat); else b.box(x + s * W - 0.05, 0.68, z - hz, x + s * W + 0.05, 1.0, z + hz, 'wood', flat);
    b.geom(WHEEL, 'woodDark', mtx(ax ? x - 0.2 : x + s * (W + 0.1), 0.55, ax ? z + s * (W + 0.1) : z - 0.2, ax ? 0 : Math.PI / 2, 1, 1, 1, Math.PI / 2, 0));
  }
  // the shafts, resting on the ground
  for (const s of [-0.35, 0.35]) {
    if (ax) b.geom(new THREE.BoxGeometry(2.0, 0.08, 0.08), 'woodDark', mtx(x + hx + 0.95, 0.35, z + s, 0, 1, 1, 1, 0, -0.28));
    else b.geom(new THREE.BoxGeometry(0.08, 0.08, 2.0), 'woodDark', mtx(x + s, 0.35, z + hz + 0.95, 0, 1, 1, 1, 0.28, 0));
  }
  for (let i = 0; i < 3; i++) b.box(x - 0.3 + (i % 2) * 0.3, 0.68, z - 0.4 + i * 0.4, x + 0.15 + (i % 2) * 0.3, 1.05, z - 0.05 + i * 0.4, 'sandbag', flat);
}
function lantern(b, x, y, z) {
  b.box(x - 0.1, y - 0.3, z - 0.1, x + 0.1, y, z + 0.1, 'lampOn', flat);
  b.box(x - 0.13, y, z - 0.13, x + 0.13, y + 0.06, z + 0.13, 'metalDark', flat);
}
function planter(b, x, z, h = 7) {
  b.box(x - 0.75, 0, z - 0.75, x + 0.75, 0.7, z + 0.75, 'sandstone');
  palm(b, x, z, h);
}
// a rug hung over a beam or a wall: hangs from y down 1.9 m
function rug(b, axis, a, m, y, w = 1.3) {
  if (axis === 'x') b.box(a - w / 2, y - 1.9, m - 0.02, a + w / 2, y, m + 0.02, 'rug', flat);
  else b.box(m - 0.02, y - 1.9, a - w / 2, m + 0.02, y, a + w / 2, 'rug', flat);
}

export default {
  id: 'sirocco',
  name: 'SIROCCO',
  desc: 'Karawanenstadt in der Wüste am Nachmittag. Kuppelmarkt in der Mitte, Brunnenplatz mit Teehaus, Karawanserei mit Galerie, Häuser zum Durchlaufen und begehbare Dächer.',
  size: 'Klein-Mittel',
  env: {
    sunDir: [0.42, 0.62, -0.55],
    sunColor: 0xffe2b4, sunIntensity: 3.1,
    skyTop: 0x4a84c4, skyHorizon: 0xf0d8b0, skyBottom: 0xc8a878,
    cloudColor: 0xfff2e2, clouds: 0.12,
    hemiSky: 0xdcd4c4, groundColor: 0xc8a070, ambient: 1.45,
    fogColor: 0xead6b2, fogNear: 55, fogFar: 230,
  },
  bounds: { minX: -32, maxX: 32, minZ: -26, maxZ: 26 },
  navTop: 4.0,     // roofs (3.85) and galleries are floors, parapets and the town wall are not

  build(B) {
    // ------------------------------------------------------------- ground and paving
    B.box(-36, -1, -30, 36, 0, 30, 'sand');
    B.box(-12.5, 0, 7, 12.5, 0.012, 21.5, 'pavers', flat);          // well square
    B.box(-7, 0, -11, 7, 0.012, -7, 'pavers', flat);                 // between hall and caravanserai
    B.box(-5.75, 0, -21.75, 5.75, 0.012, -14.25, 'paversDark', flat); // courtyard

    // ------------------------------------------------------------- the domed market hall
    const hallOps = [{ c: 0, w: 2.4, s: 2.4 }, { c: -4.2, w: 1.2, s: 2.6, sill: 1.3 }, { c: 4.2, w: 1.2, s: 2.6, sill: 1.3 }];
    archWall(B, 'x', -6.4, 6.4, 6.7, 0, HW, 0.6, 'adobeLight', hallOps);
    archWall(B, 'x', -6.4, 6.4, -6.7, 0, HW, 0.6, 'adobeLight', hallOps);
    for (const b of [B, B.mirrored()]) archWall(b, 'z', -7, 7, -6.7, 0, HW, 0.6, 'adobeLight', hallOps);
    B.box(-6.4, 0, -6.4, 6.4, 0.015, 6.4, 'tilesTerra', flat);
    B.box(-1.2, 0.015, -6.4, 1.2, 0.03, 6.4, 'rug', flat);
    B.box(-6.4, 0.015, -1.2, -1.2, 0.03, 1.2, 'rug', flat);
    B.box(1.2, 0.015, -1.2, 6.4, 0.03, 1.2, 'rug', flat);
    // roof, drum and dome (the dome only as a block for bullets: nobody gets up there)
    B.box(-7.2, HW, -7.2, 7.2, HW + 0.35, 7.2, 'adobeLight');
    for (const s of [-1, 1]) {
      B.box(-7.2, HW + 0.35, s * 7.2 - (s > 0 ? 0.35 : 0), 7.2, HW + 0.9, s * 7.2 + (s < 0 ? 0.35 : 0), 'adobeLight');
      B.box(s * 7.2 - (s > 0 ? 0.35 : 0), HW + 0.35, -6.85, s * 7.2 + (s < 0 ? 0.35 : 0), HW + 0.9, 6.85, 'adobeLight');
    }
    for (let a = -6.6; a <= 6.7; a += 1.65) for (const s of [-1, 1]) {
      B.box(a - 0.3, HW + 0.9, s * 7.0 - 0.2, a + 0.3, HW + 1.3, s * 7.0 + 0.2, 'adobeLight', flat);
      B.box(s * 7.0 - 0.2, HW + 0.9, a - 0.3, s * 7.0 + 0.2, HW + 1.3, a + 0.3, 'adobeLight', flat);
    }
    const tile = MATERIALS.adobeLight.scale;
    const drum = new THREE.CylinderGeometry(4.5, 4.7, 1.2, 28).toNonIndexed(); projectUV(drum, tile);
    const dome = new THREE.SphereGeometry(4.5, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed(); projectUV(dome, tile);
    B.geom(drum, 'adobeLight', mtx(0, HW + 0.95, 0));
    B.geom(dome, 'adobeLight', mtx(0, HW + 1.55, 0, 0, 1, 0.82, 1));
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; B.box(Math.cos(a) * 4.62 - 0.22, HW + 0.7, Math.sin(a) * 4.62 - 0.22, Math.cos(a) * 4.62 + 0.22, HW + 1.3, Math.sin(a) * 4.62 + 0.22, 'black', flat); }
    B.geom(new THREE.SphereGeometry(0.28, 10, 6), 'metalYellow', mtx(0, HW + 5.35, 0));
    B.geom(new THREE.CylinderGeometry(0.05, 0.08, 1.0, 6), 'metalYellow', mtx(0, HW + 5.8, 0));
    B.box(-3.2, HW + 0.35, -3.2, 3.2, HW + 4.6, 3.2, 'adobeLight', { visual: false });
    // inside: four pillars, the rug stand in the middle, a stall in every corner
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      B.box(sx * 3.6 - 0.35, 0, sz * 3.6 - 0.35, sx * 3.6 + 0.35, HW, sz * 3.6 + 0.35, 'sandstone');
      lantern(B, sx * 3.6, 4.3, sz * 1.8);
      stall(B, sx * 5.2, sz * 4.6, 'z', sx * sz > 0 ? 'awningOchre' : 'awningGreen', 2 + sx + sz);
    }
    B.box(-1.3, 0, -1.3, 1.3, 2.3, 1.3, 'woodDark', { pen: 0.4 });
    for (let i = 0; i < 6; i++) B.box(-1.38 + i * 0.03, 0.3 + i * 0.33, -1.38 + i * 0.03, 1.38 - i * 0.03, 0.6 + i * 0.33, 1.38 - i * 0.03, 'rug', flat);
    for (const [x, z] of [[-1.75, -0.6], [-1.75, 0.6], [1.75, -0.6], [1.75, 0.6], [-0.6, 1.75], [0.6, -1.75]]) sack(B, x, z, (x * 3 + z * 5) | 0);
    jar(B, 0.5, 1.8); jar(B, -0.5, -1.8, 0.8);
    for (let i = 0; i < 4; i++) B.box(-6.4 + i * 4.27, HW - 0.35, -6.4, -6.2 + i * 4.27, HW, 6.4, 'woodDark', flat); // beams
    B.pointLight(0, 4.4, 0, 0xffc890, 5, 13);

    // ------------------------------------------------------------- the well square
    B.geom(new THREE.CylinderGeometry(1.25, 1.35, 0.85, 20), 'sandstone', mtx(0, 0.425, WZ));
    B.geom(new THREE.CylinderGeometry(1.0, 1.0, 0.02, 20), 'black', mtx(0, 0.8, WZ));
    B.box(-1.2, 0, WZ - 1.2, 1.2, 0.85, WZ + 1.2, 'sandstone', { visual: false });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(sx * 1.55 - 0.18, 0, WZ + sz * 1.55 - 0.18, sx * 1.55 + 0.18, 2.8, WZ + sz * 1.55 + 0.18, 'sandstone');
    B.box(-1.9, 2.8, WZ - 1.9, 1.9, 3.05, WZ + 1.9, 'sandstone');
    const cap = new THREE.SphereGeometry(1.5, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed(); projectUV(cap, 2.4);
    B.geom(cap, 'sandstone', mtx(0, 3.05, WZ, 0, 1, 0.7, 1));
    for (const s of [-1, 1]) B.box(s * 1.55 - 0.07, 0, WZ - 1.37, s * 1.55 + 0.07, 2.45, WZ + 1.37, 'shutterGreen', { pen: 0.8 }); // lattice screens east and west
    B.box(-1.4, 2.2, WZ - 0.05, 1.4, 2.3, WZ + 0.05, 'woodDark', flat);
    B.geom(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 10), 'woodDark', mtx(0, 2.1, WZ, 0, 1, 1, 1, Math.PI / 2, 0));
    // the tea house: two terraces 1.3 m up along the town wall under one roof on pillars, the kitchen between them
    // (from one terrace straight over to the other would be a line from yard to yard); steps in front and at the ends
    B.box(-9.8, 0, 21.5, 9.8, 1.3, 25.5, 'sandstone');
    B.box(-2.6, 1.3, 21.5, 2.6, 4.3, 25.5, 'adobeLight');
    B.box(-1.6, 2.6, 21.46, 1.6, 3.4, 21.5, 'woodDark', flat);
    for (const s of [-1, 1]) {
      stairs(B, s * 5.0, 19.9, '+z', 2.8, 1.3, 1.6, 'sandstone');
      B.box(s > 0 ? 6.4 : -9.8, 1.3, 21.5, s > 0 ? 9.8 : -6.4, 2.1, 21.75, 'sandstone');
      for (const x of [7.0, 9.45]) B.box(s * x - 0.2, 1.3, 21.55, s * x + 0.2, 4.3, 21.95, 'adobeLight');
      for (const x of [4.6, 8.0]) {
        B.box(s * x - 0.55, 1.3, 23.4, s * x + 0.55, 1.7, 24.5, 'woodDark');
        B.box(s * x - 1.0, 1.3, 23.0, s * x + 1.0, 1.32, 24.9, 'rug', flat);
        lantern(B, s * x, 4.1, 23.9);
      }
      B.box(s * 3.4 - 0.4, 1.3, 22.8, s * 3.4 + 0.4, 2.2, 24.0, 'woodDark');
      B.geom(new THREE.CylinderGeometry(0.2, 0.26, 0.6, 10), 'metalYellow', mtx(s * 3.4, 2.5, 23.4));
      paint(B, s > 0 ? 'e' : 'w', s * 2.6, { c: 23.4, k: 'w', y: 2.3, m: 'shutterGreen' });
      B.pointLight(s * 6.2, 3.8, 23.6, 0xffc080, 2.5, 9);
    }
    B.box(-9.8, 4.3, 21.5, 9.8, 4.55, 25.5, 'woodDark');

    // ------------------------------------------------------------- caravanserai: north wall and gate, arcades, courtyard
    archWall(B, 'x', -10, 10, -11.3, 0, 4.3, 0.6, 'adobeOchre', [{ c: 0, w: 3.0, s: 1.6 }]);
    const arcade = [{ c: -3.7, w: 2.2, s: 1.8 }, { c: 0, w: 2.2, s: 1.8 }, { c: 3.7, w: 2.2, s: 1.8 }];
    archWall(B, 'x', -6.25, 6.25, -14.0, 0, 3.0, 0.5, 'adobeLight', arcade);
    archWall(B, 'x', -6.25, 6.25, -22.0, 0, 3.0, 0.5, 'adobeLight', arcade);
    B.box(-8.0, 3.0, -14.25, 8.0, 3.2, -11.6, 'adobeLight');
    B.box(-9.4, 3.0, -25.5, 9.4, 3.2, -21.75, 'adobeLight');
    B.box(-6.25, 3.2, -14.25, 6.25, 4.2, -13.95, 'adobeLight');
    B.box(-6.25, 3.2, -22.05, 6.25, 4.2, -21.75, 'adobeLight');
    // the cistern in the middle of the courtyard, under a small dome
    B.box(-1.4, 0, -19.6, 1.4, 2.2, -16.4, 'sandstone');
    const cdome = new THREE.SphereGeometry(1.3, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed(); projectUV(cdome, 2.4);
    B.geom(cdome, 'sandstone', mtx(0, 2.2, -18, 0, 1, 0.8, 1));
    for (const s of [-1, 1]) {
      B.box(-0.5, 0.6, s * 1.62 - 18 - 0.02, 0.5, 1.5, s * 1.62 - 18 + 0.02, 'black', flat);
      crate(B, s * 4.1, -15.4, 1.0); crate(B, s * 4.6, -16.25, 0.7);
      sack(B, s * 4.4, -20.6, 1 + s); sack(B, s * 3.8, -20.9, 2); sack(B, s * 4.0, -20.5, 3, 0.55, false);
      B.box(s * 2.5 - 0.08, 0, -14.9 - 0.08, s * 2.5 + 0.08, 1.1, -14.9 + 0.08, 'woodDark'); // posts to tie the animals to
    }
    for (const x of [-3.7, 0, 3.7]) { lantern(B, x, 2.95, -12.6); lantern(B, x, 2.95, -23.7); }
    B.pointLight(0, 2.6, -12.7, 0xffb878, 2, 8);
    B.pointLight(0, 2.6, -23.6, 0xffb878, 2, 8);
    for (const x of [-7.6, -4.4, 4.4, 7.6]) { jar(B, x, -24.9); jar(B, x + 0.62, -24.95, 0.75); }
    for (const x of [-2.6, 2.6]) { crate(B, x, -12.5, 1.0); }

    for (const b of [B, B.mirrored()]) this.half(b);
  },

  half(b) {
    // ================================================================ town wall, the west gate (closed)
    b.box(-33.5, 0, -27.5, -31.5, 4.6, 27.5, 'adobeOchre');
    b.box(-31.5, 0, 25.5, 0, 4.6, 27.5, 'adobeOchre');
    b.box(-31.5, 0, -27.5, 0, 4.6, -25.5, 'adobeOchre');
    b.box(-33.5, 4.6, -27.5, -31.5, 30, 27.5, 'adobeOchre', { visual: false });
    b.box(-31.5, 4.6, 25.5, 0, 30, 27.5, 'adobeOchre', { visual: false });
    b.box(-31.5, 4.6, -27.5, 0, 30, -25.5, 'adobeOchre', { visual: false });
    for (let z = -26.6; z < 26.8; z += 1.5) b.box(-32.3, 4.6, z - 0.4, -31.5, 5.2, z + 0.4, 'adobeOchre', flat);
    for (let x = -30.8; x < -0.3; x += 1.5) {
      b.box(x - 0.4, 4.6, 25.5, x + 0.4, 5.2, 26.3, 'adobeOchre', flat);
      b.box(x - 0.4, 4.6, -26.3, x + 0.4, 5.2, -25.5, 'adobeOchre', flat);
    }
    b.box(-31.5, 0, -2.0, -31.38, 3.4, 2.0, 'woodDark', flat);
    for (const y of [0.8, 2.4]) b.box(-31.5, y, -1.9, -31.33, y + 0.12, 1.9, 'metalDark', flat);
    b.box(-31.5, 0, -0.04, -31.33, 3.4, 0.04, 'metalDark', flat);
    b.box(-31.5, 0, -2.6, -31.2, 3.4, -2.0, 'sandstone');
    b.box(-31.5, 0, 2.0, -31.2, 3.4, 2.6, 'sandstone');
    b.box(-31.5, 3.4, -2.6, -31.2, 3.95, 2.6, 'sandstone');

    // ================================================================ caravan yard (spawn)
    // stable along the wall to the north of the gate
    for (const z of [5.2, 10, 14.8]) b.box(-28.55, 0, z - 0.12, -28.31, 3.0, z + 0.12, 'woodDark');
    b.box(-31.5, 3.0, 4.8, -28.1, 3.14, 15.2, 'woodDark', { collide: false });
    for (const z of [4.8, 7.4, 10, 12.6, 15.2]) b.box(-31.5, 2.86, z - 0.08, -28.0, 3.0, z + 0.08, 'woodDark', flat);
    b.box(-31.4, 0, 5.8, -30.2, 0.8, 7.4, 'hay'); b.box(-31.4, 0.8, 6.0, -30.4, 1.6, 7.2, 'hay');
    b.box(-31.4, 0, 12.0, -30.2, 0.8, 14.4, 'hay');
    b.box(-30.1, 0, 8.4, -29.3, 0.6, 10.8, 'woodDark');
    b.box(-30.0, 0.5, 8.5, -29.4, 0.56, 10.7, 'water', flat);
    // canopy over rugs to the south of the gate
    for (const [x, z] of [[-30.6, -14.6], [-26.4, -14.6], [-30.6, -6.4], [-26.4, -6.4]]) b.box(x - 0.08, 0, z - 0.08, x + 0.08, 2.7, z + 0.08, 'woodDark');
    b.box(-31.0, 2.7, -15.0, -26.0, 2.76, -6.0, 'awningBlue', flat);
    b.box(-30.3, 0, -13.8, -26.9, 0.02, -7.2, 'rug', flat);
    b.box(-29.4, 0, -11.2, -27.8, 0.4, -9.6, 'woodDark');
    for (const z of [-13, -8.2]) b.box(-30.1, 0, z - 0.5, -29.3, 0.3, z + 0.5, 'canvasRed');
    // carts, crates, jars, palms
    cart(b, -24.6, 9.6, 'z');
    cart(b, -25.2, -15.6, 'x');
    crate(b, -23.1, 22.4, 1.2); crate(b, -23.1, 23.7, 1.2); crate(b, -23.15, 23.05, 1.0, 1.2);
    crate(b, -30.6, -18.6, 1.1); crate(b, -29.4, -18.7, 0.9);
    for (const [x, z, s] of [[-31.0, -3.3, 1], [-30.4, -3.8, 0.8], [-31.0, 3.4, 0.9], [-24.0, 19.6, 1], [-23.4, 20.1, 0.7]]) jar(b, x, z, s);
    palm(b, -30.2, 21.2, 7.2); palm(b, -29.9, -22.6, 6.6); palm(b, -26.6, 24.4, 6.0);

    // ================================================================ north row: shops behind a portico, a tall house where the lane opens
    // (portico closed toward the yard, the tall house narrows the lane: neither lets a look run from yard to yard)
    block(b, -22, 23, -15.2, 25.5, 4.4, 'adobeLight', { s: [{ c: -20.6, k: 'd', m: 'shutterGreen' }, { c: -18.4, k: 'w' }, { c: -16.4, k: 'd' }] });
    b.box(-22, 0, 20.1, -21.6, 3.2, 23, 'adobeLight');
    b.box(-18.82, 0, 20.1, -18.38, 3.2, 20.54, 'adobeLight');
    b.box(-22, 3.2, 20.0, -15.2, 3.42, 23.0, 'woodDark');
    block(b, -15.2, 17.6, -12.5, 25.5, 5.2, 'adobe', { s: [{ c: -13.85, k: 'w', y: 1.4 }, { c: -13.85, k: 'w', y: 3.6, m: 'shutterGreen' }], e: [{ c: 19.6, k: 'd' }, { c: 22.4, k: 'w', y: 3.6 }] });
    rug(b, 'x', -20.1, 20.32, 3.15); rug(b, 'x', -17.0, 20.32, 3.15, 1.1);
    for (const [x, z, k] of [[-19.9, 22.3, 0], [-19.3, 22.4, 3], [-19.6, 21.7, 5]]) sack(b, x, z, k);
    jar(b, -21.0, 22.5); jar(b, -21.1, 21.8, 0.8);
    b.box(-17.9, 0, 22.3, -16.2, 0.45, 22.8, 'woodDark');

    // ================================================================ the house between the north lane and the street
    house(b, -22, 4, -12.5, 14, 'adobe', {
      n: [{ c: -20.3, w: 1.4, h: 2.4 }],
      s: [{ c: -14.4, w: 1.4, h: 2.4 }, { c: -20.2, w: 1.1, y: 1.2, h: 1.0 }],
      w: [{ c: 10.6, w: 1.4, h: 2.4 }],
      e: [{ c: 6.4, w: 1.4, h: 2.4 }, { c: 11.4, w: 1.1, y: 1.2, h: 1.0 }],
    }, [{ side: 'n', a0: -14.6, a1: -12.8 }, { side: 's', a0: -18.1, a1: -16.1 }], 'shutterBlue');
    stairs(b, -18.2, 14.65, '+x', 1.3, HH + RS, 5.2, 'adobe');
    b.box(-22, 0, 8.8, -17.5, 1.2, 9.1, 'adobe');                          // half wall between the rooms
    b.box(-21.5, 0, 12.4, -19.6, 0.4, 13.5, 'woodDark'); b.box(-21.6, 0, 11.9, -19.2, 0.02, 13.6, 'rug', flat);
    b.box(-21.55, 0, 4.5, -21.0, 1.9, 7.4, 'woodDark', { pen: 0.6 });      // shelves with jars on them
    for (const z of [4.9, 5.7, 6.5]) jar(b, -21.28, z, 0.5, 1.9);
    b.box(-15.6, 0, 9.9, -13.2, 0.75, 10.9, 'woodDark');                    // a chest and a loom
    b.box(-17.2, 0, 4.6, -15.6, 1.6, 5.0, 'wood', { pen: 0.7 });
    lantern(b, -17.0, 3.4, 9.0);

    // ================================================================ the house between the street and the south lane
    house(b, -22, -14, -12.5, -3, 'adobeRose', {
      n: [{ c: -14.4, w: 1.4, h: 2.4 }, { c: -20.2, w: 1.1, y: 1.2, h: 1.0 }],
      s: [{ c: -20.3, w: 1.4, h: 2.4 }],
      w: [{ c: -8.5, w: 1.4, h: 2.4 }],
      e: [{ c: -6.0, w: 1.4, h: 2.4 }, { c: -11.2, w: 1.1, y: 1.2, h: 1.0 }],
    }, [{ side: 's', a0: -14.6, a1: -12.8 }, { side: 'n', a0: -18.1, a1: -16.1 }], 'shutterGreen');
    stairs(b, -18.2, -14.65, '+x', 1.3, HH + RS, 5.2, 'adobeRose');
    b.box(-17.2, 0, -14, -16.9, 1.2, -9.5, 'adobeRose');                    // half wall
    b.box(-21.5, 0, -6.4, -19.4, 0.4, -4.4, 'woodDark'); b.box(-21.6, 0, -6.9, -19.0, 0.02, -3.9, 'rug', flat);
    b.box(-15.8, 0, -13.5, -13.0, 0.9, -12.6, 'woodDark', { pen: 0.6 });   // a workbench
    for (const z of [-12.0, -11.3]) sack(b, -21.3, z, z > -12 ? 1 : 4);
    jar(b, -21.2, -10.4); jar(b, -20.6, -10.6, 0.7);
    lantern(b, -18.6, 3.4, -8.5);
    // the bridge from roof to roof over the street
    b.box(-18.4, HH, -3, -15.8, HH + RS, 4, 'adobe');
    b.box(-18.4, HH + RS, -3, -18.1, HH + RS + PAR, 4, 'adobe');
    b.box(-16.1, HH + RS, -3, -15.8, HH + RS + PAR, 4, 'adobe');
    for (const z of [-2.75, 3.75]) b.box(-18.4, HH - 0.5, z - 0.25, -15.8, HH, z + 0.25, 'woodDark', flat);
    lantern(b, -17.1, HH - 0.05, 0.5);

    // ================================================================ the street: a gate from the yard, stalls, the hall at its end
    archWall(b, 'z', -3, 4, -22, 0, 4.8, 0.7, 'adobeOchre', [{ c: 0.5, w: 3.2, s: 2.7 }]);
    b.box(-22, 0, -3, -12.5, 0.012, 4, 'pavers', flat);
    b.box(-12.5, 0, -11, -7, 0.012, 7, 'pavers', flat);
    stall(b, -19.6, 3.05, 'x', 'awningRed', 0);
    stall(b, -15.0, -2.35, 'x', 'awningBlue', 3);
    jar(b, -12.0, 2.6); jar(b, -12.0, 3.4, 0.8); jar(b, -12.9, 3.5, 0.6);
    planter(b, -10.4, 9.6, 6.4);
    planter(b, -10.6, -8.6, 7.0);
    b.box(-12.4, 0, -1.8, -11.7, 0.62, 0.6, 'sandstone');                 // trough
    b.box(-12.33, 0.5, -1.7, -11.77, 0.56, 0.5, 'water', flat);
    crate(b, -8.0, -9.8, 1.1); crate(b, -8.0, -8.65, 0.9);
    // washing over the north lane
    b.box(-21.9, 3.95, 17.2, -12.6, 3.97, 17.24, 'metalDark', flat);
    for (const [x, m] of [[-20.4, 'fabricWhite'], [-18.9, 'canvasBlue'], [-17.2, 'fabricWhite'], [-15.1, 'canvasRed']]) b.box(x - 0.55, 3.0, 17.2, x + 0.55, 3.95, 17.24, m, flat);

    // ================================================================ south row: potters' workshops behind a portico
    block(b, -22, -25.5, -10, -23, 4.4, 'adobeLight', { n: [{ c: -20.4, k: 'd' }, { c: -17.8, k: 'w', m: 'shutterGreen' }, { c: -15.0, k: 'd', m: 'shutterBlue' }, { c: -12.2, k: 'w' }] });
    b.box(-22, 0, -23, -21.6, 3.2, -20.1, 'adobeLight');
    for (const x of [-18.2, -14.6, -10.3]) b.box(x - 0.22, 0, -20.54, x + 0.22, 3.2, -20.1, 'adobeLight');
    b.box(-22, 3.2, -23.0, -10, 3.42, -20.0, 'woodDark');
    for (const [x, z, s] of [[-20.9, -22.4, 1], [-20.3, -22.5, 0.8], [-19.7, -22.4, 1.1], [-16.6, -22.5, 0.7], [-16.0, -22.4, 0.9], [-12.6, -22.3, 1], [-12.0, -22.5, 0.75]]) jar(b, x, z, s);
    b.box(-15.0, 0, -22.9, -13.6, 0.85, -21.5, 'woodDark');               // potter's wheel bench
    b.geom(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 12), 'clay', mtx(-14.3, 0.88, -22.2));
    const kiln = new THREE.SphereGeometry(0.95, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed(); projectUV(kiln, 1.5);
    b.box(-18.6, 0, -22.95, -17.0, 1.0, -21.35, 'clay', { visual: false });
    b.geom(kiln, 'clay', mtx(-17.8, 0, -22.15, 0, 1, 1.05, 1));

    // ================================================================ caravanserai, west side: outer wall with the west gate, arcade, stair
    archWall(b, 'z', -25.5, -11.6, -9.7, 0, 4.3, 0.6, 'adobeOchre', [{ c: -18, w: 2.6, s: 1.7 }]);
    archWall(b, 'z', -21.75, -14.25, -6.0, 0, 3.0, 0.5, 'adobeLight', [{ c: -20.4, w: 1.6, s: 2.0 }, { c: -18, w: 2.2, s: 1.8 }, { c: -15.6, w: 1.6, s: 2.0 }]);
    flight(b, -8.7, -12.0, '-z', 1.4, 3.2, 4.3, 'adobeLight', 14);
    b.box(-9.4, 3.0, -12.0, -8.0, 3.2, -11.6, 'adobeLight');
    b.box(-8.0, 3.0, -21.75, -6.25, 3.2, -14.25, 'adobeLight');
    b.box(-9.4, 3.0, -21.75, -8.0, 3.2, -16.3, 'adobeLight');
    b.box(-6.25, 3.2, -21.75, -5.95, 4.2, -14.25, 'adobeLight');
    for (const z of [-24.6, -23.9]) sack(b, -8.9, z, z > -24 ? 2 : 0);
    b.box(-9.3, 0, -21.4, -8.1, 0.8, -20.4, 'hay');
    lantern(b, -7.6, 2.95, -19.8);
  },

  spawns() {
    const west = [[-27.5, 0, 22.5], [-24.5, 0, 17], [-26.8, 0, 11.6], [-23.8, 0, 5.2], [-28.2, 0, 0.4], [-24.2, 0, -4.6], [-27.6, 0, -12.2], [-24.4, 0, -19.6], [-28.4, 0, -22.8]];
    return { 0: west.map(([x, y, z]) => [x, y, z, -Math.PI / 2]), 1: west.map(([x, y, z]) => [-x, y, z, Math.PI / 2]) };
  },

  hotspots: [
    [0, 0, 4.8], [0, 0, -4.8], [-9.6, 0, 0], [9.6, 0, 0], [-9.5, 0, -9], [9.5, 0, -9], [-6, 0, 13.5], [6, 0, 13.5], [-6, 1.3, 23], [6, 1.3, 23],
    [0, 0, -15.5], [-7.1, 3.2, -18], [7.1, 3.2, -18], [0, 3.2, -12.8], [0, 3.2, -23.5], [-16, 0, 17], [16, 0, 17], [-16, 0, -17.5], [16, 0, -17.5],
    [-17, 0, 0.5], [17, 0, 0.5], [-17, 3.85, 9], [17, 3.85, 9], [-17, 3.85, -8.5], [17, 3.85, -8.5], [-17, 0, 10.5], [17, 0, 10.5],
    [-17, 0, -7.5], [17, 0, -7.5], [-11.3, 0, -12.5], [11.3, 0, -12.5], [-7.6, 0, -18], [7.6, 0, -18],
  ],
};
