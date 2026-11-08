import * as THREE from 'three';
import { stairs, crate, barrel, mtx, boundary, truck } from '../props.js';
import { BASE, PLAIN, subtract } from '../kit.js';
import { H, DECO, seeded, houses, wall, block, siteLetter, cart, roundCol, domeCol } from './sdparts.js';

// =============================================================================
// QANAT — an old oasis town in the desert at morning, made for Search and Destroy (4 vs 4 up to 6 vs 6).
// Not mirrored: the attackers come from the palm grove south of the town wall, the defenders hold the
// forecourt of the kasbah in the north, between the two bomb sites.
//   A : the dyers' yard in the west: dye vats, drying racks, the dye house with windows over the yard
//   B : the potters' yard in the east: two kilns, racks of pots, stairs up onto the workshop roof
//   Mid : through the town gate into the souk, up to the well square; from there an alley west to A and one
//         east to B, houses to run through on both sides, and a street north toward the kasbah
//   West : through the gap in the town wall and the walled palm gardens to A
//   East : down the well house outside the wall into the qanat, the old water tunnel; it comes up under B
// Every house can be walked through and is furnished; the low ones have roof terraces with stairs up.
// =============================================================================
const TOP1 = BASE + H;       // roof of a one-storey house
const TF = -3.4;             // floor of the qanat
const TC = -1.0;             // its ceiling: the underside of the ground

// ---------------------------------------------------------------------------
// Walls and other small things
// ---------------------------------------------------------------------------
// the town wall: a solid wall with merlons on top
function townWall(b, x0, z0, x1, z1, h, gaps = []) {
  wall(b, x0, z0, x1, z1, h, 'adobeOchre', gaps);
  const along = x1 - x0 > z1 - z0 ? 'x' : 'z', A0 = along === 'x' ? x0 : z0, A1 = along === 'x' ? x1 : z1;
  for (let a = A0 + 0.5; a < A1 - 0.5; a += 2.0) {
    if (gaps.some(([g0, g1]) => a > g0 - 1 && a < g1 + 1)) continue;
    if (along === 'x') b.box(a, h, z0, a + 1.0, h + 0.7, z1, 'adobeOchre', { ao: false });
    else b.box(x0, h, a, x1, h + 0.7, a + 1.0, 'adobeOchre', { ao: false });
  }
}
// a tower of the town wall, square, with merlons
function tower(b, x0, z0, x1, z1, h) {
  b.box(x0, 0, z0, x1, h, z1, 'adobeOchre');
  b.box(x0 - 0.15, h, z0 - 0.15, x1 + 0.15, h + 0.25, z1 + 0.15, 'sandstone', { ao: false });
  for (const [a, c] of [[x0 - 0.15, z0 - 0.15], [x1 - 0.65, z0 - 0.15], [x0 - 0.15, z1 - 0.65], [x1 - 0.65, z1 - 0.65]]) b.box(a, h + 0.25, c, a + 0.8, h + 1.0, c + 0.8, 'adobeOchre', { ao: false });
  for (const y of [h - 1.6, h - 3.6]) for (const [a, c, nx] of [[(x0 + x1) / 2, z0, 0], [(x0 + x1) / 2, z1, 0], [x0, (z0 + z1) / 2, 1], [x1, (z0 + z1) / 2, 1]]) {
    if (nx) b.box(a - 0.03, y, c - 0.18, a + 0.03, y + 0.9, c + 0.18, 'black', DECO);
    else b.box(a - 0.18, y, c - 0.03, a + 0.18, y + 0.9, c + 0.03, 'black', DECO);
  }
}
const DUNE = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
// the land round the town, out to the haze: sand, dunes, palms beyond the garden walls (nothing of it is in reach)
function desert(b) {
  // round the ground of the map (x -52..52, z -74..52), not over it: the qanat's stair holes stay open
  for (const [x0, z0, x1, z1] of [[-420, -420, -52, 420], [52, -420, 420, 420], [-52, -420, 52, -74], [-52, 52, 52, 420]]) b.box(x0, -0.5, z0, x1, 0, z1, 'sand', { collide: false, ao: false, faces: '+y' });
  const dunes = [[-95, -120, 70, 9, 34], [-20, -150, 60, 12, 30], [70, -125, 65, 8, 40], [140, -40, 50, 11, 70], [120, 60, 70, 10, 36], [40, 125, 80, 13, 34],
    [-60, 120, 60, 9, 42], [-135, 40, 55, 12, 60], [-140, -55, 60, 8, 34], [-210, 120, 90, 18, 60], [210, -150, 90, 16, 70], [0, 230, 110, 20, 60], [-230, -180, 100, 17, 60], [230, 110, 80, 15, 50]];
  for (const [x, z, rx, h, rz] of dunes) b.geom(DUNE, 'sand', mtx(x, -0.2, z, (x * 0.013 + z * 0.007) % 3.1, rx, h, rz));
  const out = [[-50, -44], [-52, -52], [-50, -61], [-53, -69], [-47, -74], [-38, -73], [-27, -75], [-15, -72], [-4, -76], [8, -73], [19, -75], [31, -72], [42, -74], [50, -69], [53, -60],
    [50, -51], [52, -43], [-58, -64], [57, -57], [-12, -82], [24, -81]];
  for (const [x, z] of out) palm(b, x, z, 6 + ((Math.round(x * 3 + z) % 4) + 4) % 4);
}
// a date palm, its trunk straight up so that what you bump into is where the trunk is
const LEAF = new THREE.BoxGeometry(0.5, 0.04, 2.6).translate(0, 0, 1.3);
function palm(b, x, z, h = 7) {
  roundCol(b, x, z, 0, h / 2, 0.19, 0.19, 'bark'); roundCol(b, x, z, h / 2, h, 0.15, 0.15, 'bark');
  b.geom(new THREE.CylinderGeometry(0.13, 0.2, h, 7), 'bark', mtx(x, h / 2, z));
  for (let i = 0; i < 8; i++) b.geom(LEAF, 'foliage', mtx(x, h, z, i * Math.PI / 4, 1, 1, 1, 0.45));
}
const VAT = new THREE.CylinderGeometry(0.85, 0.95, 0.8, 18);
const DYE = new THREE.CylinderGeometry(0.72, 0.72, 0.04, 18);
// a dye vat, waist high, coloured water in it
function vat(b, x, z, colour) {
  roundCol(b, x, z, 0, 0.8, 0.9, 0.9, 'clay');
  b.geom(VAT, 'clay', mtx(x, 0.4, z));
  b.geom(DYE, colour, mtx(x, 0.74, z));
}
// a rack of poles with dyed cloth hanging from it (the cloth hides you but stops no bullet)
function dryRack(b, x0, z, x1, cloths) {
  for (const x of [x0, x1]) b.box(x - 0.06, 0, z - 0.06, x + 0.06, 2.6, z + 0.06, 'woodDark');
  b.box(x0, 2.5, z - 0.04, x1, 2.58, z + 0.04, 'woodDark', DECO);
  const n = cloths.length, step = (x1 - x0) / n;
  cloths.forEach((c, i) => b.box(x0 + step * i + 0.08, 0.9, z - 0.015, x0 + step * (i + 1) - 0.08, 2.5, z + 0.015, c, DECO));
}
const KILN = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
// a potter's kiln: a squat dome of clay with a fire hole and a chimney
function kiln(b, x, z, r = 1.9) {
  // (what you bump into follows the base and the dome)
  roundCol(b, x, z, 0, 0.5, r, r, 'clay'); domeCol(b, x, 0.5, z, r, r * 0.95, r, 'clay', 4);
  b.geom(new THREE.CylinderGeometry(r, r * 1.05, 0.5, 20), 'clay', mtx(x, 0.25, z));
  b.geom(KILN, 'clay', mtx(x, 0.5, z, 0, r, r * 0.95, r));
  b.box(x - 0.45, 0.25, z + r - 0.2, x + 0.45, 1.0, z + r + 0.02, 'black', DECO);
  b.geom(new THREE.CylinderGeometry(0.28, 0.32, 0.9, 10), 'brickDark', mtx(x + r * 0.35, r * 1.1 + 0.3, z - r * 0.2));
  roundCol(b, x + r * 0.35, z - r * 0.2, r * 0.9, r * 1.1 + 0.75, 0.3, 0.3, 'brickDark');
}
const JAR = new THREE.LatheGeometry([[0, 0], [0.16, 0.02], [0.26, 0.2], [0.29, 0.42], [0.22, 0.66], [0.1, 0.78], [0.12, 0.86], [0.09, 0.88]].map(([r, y]) => new THREE.Vector2(r, y)), 10);
function jar(b, x, z, s = 1, y = 0, solid = true) {
  if (solid) { roundCol(b, x, z, y, y + 0.62 * s, 0.27 * s, 0.27 * s, 'clay'); b.box(x - 0.11 * s, y + 0.62 * s, z - 0.11 * s, x + 0.11 * s, y + 0.86 * s, z + 0.11 * s, 'clay', { visual: false }); }
  b.geom(JAR, 'clay', mtx(x, y, z, 0, s, s, s));
}
// shelves of pots against a wall (along x at z, the depth toward +z (dir 1) or -z (dir -1))
function potShelf(b, x0, x1, z, dir) {
  const d = 0.55 * dir, za = Math.min(z, z + d), zb = Math.max(z, z + d);
  b.box(x0, 0, za, x1, 2.0, zb, 'woodDark', { visual: false });
  for (const y of [0.05, 0.7, 1.35, 1.95]) b.box(x0, y, za, x1, y + 0.05, zb, 'woodDark', DECO);
  for (const x of [x0 + 0.03, x1 - 0.08]) b.box(x, 0, za, x + 0.05, 2.0, zb, 'woodDark', DECO);
  for (let i = 0; i < 3; i++) for (let x = x0 + 0.35; x < x1 - 0.2; x += 0.55) jar(b, x, z + d / 2, 0.5 + ((i + Math.round(x * 3)) % 2) * 0.12, 0.1 + i * 0.65, false);
}
// a market stall with a cloth roof
function stall(b, x, z, along, cloth) {
  const ax = along === 'x', [hx, hz] = ax ? [1.1, 0.5] : [0.5, 1.1];
  b.box(x - hx, 0, z - hz, x + hx, 0.95, z + hz, 'woodDark');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(x + sx * (hx - 0.05) - 0.04, 0, z + sz * (hz - 0.05) - 0.04, x + sx * (hx - 0.05) + 0.04, 2.3, z + sz * (hz - 0.05) + 0.04, 'woodDark', DECO);
  b.box(x - hx - 0.2, 2.3, z - hz - 0.25, x + hx + 0.2, 2.36, z + hz + 0.25, cloth, { ao: false, noBullet: true });
  for (let i = 0; i < 4; i++) {
    const ox = ax ? i * 0.5 : 0, oz = ax ? 0 : i * 0.5;
    b.box(x - hx + 0.2 + ox, 0.95, z - hz + 0.15 + oz, x - hx + 0.55 + ox, 1.15, z - hz + 0.5 + oz, ['paintYellow', 'canvasRed', 'foliage', 'plasterTerra'][i], DECO);
  }
}
// a cloth stretched over the street between the houses: it holds whoever lands on it, bullets go through
function shade(b, x0, z0, x1, z1, y, cloth) { b.box(x0, y, z0, x1, y + 0.04, z1, cloth, { ao: false, noBullet: true }); }
// ---------------------------------------------------------------------------
// The town
// ---------------------------------------------------------------------------
// the stair holes of the qanat in the ground: [x0, z0, x1, z1]
const QIN = [15.6, -46.4, 18.4, -40.6], QOUT = [23.4, -3.1, 25.6, 2.6];

export default {
  id: 'qanat',
  name: 'QANAT',
  desc: 'Oasenstadt am Morgen, nur für Suchen & Zerstören. A im Färberhof, B im Töpferhof, dazwischen Souk und Brunnenplatz – und unter der Stadt der alte Wassertunnel.',
  size: 'Mittel',
  env: {
    sunDir: [0.62, 0.5, -0.36],
    sunColor: 0xffe2bc, sunIntensity: 2.7,
    skyTop: 0x4f86c6, skyHorizon: 0xf2d6b8, skyBottom: 0xb89a78,
    cloudColor: 0xfff4ea, clouds: 0.18,
    hemiSky: 0xd8dcea, groundColor: 0xc8a47a, ambient: 1.35,
    fogColor: 0xead9c2, fogNear: 70, fogFar: 300,
  },
  bounds: { minX: -46, maxX: 46, minZ: -68, maxZ: 47 },
  navTop: 3.6,      // the ground, the qanat, the upper floors (3.35) and the low roof terraces (3.35) are floors; high roofs are not
  mmCeiling: 3.3,   // the minimap shows the ground floor

  build(B) { seeded(0x51a7a, () => this.town(B)); },

  town(B) {
    const out = { spots: [], vehicles: [], navRects: [], footprints: [] };
    // ------------------------------------------------------------- ground, with the two stair holes of the qanat
    for (const q of subtract([[-52, -74, 52, 52]], [QIN, QOUT])) B.box(q[0], -1, q[1], q[2], 0, q[3], 'sand');
    for (const q of subtract([[-43.4, -37.4, 43.4, 46]], [QOUT])) B.box(q[0], 0, q[1], q[2], 0.012, q[3], 'dirt', { collide: false, ao: false });
    B.box(-10, 0.012, -37.4, 2.5, 0.02, -16, 'pavers', { collide: false, ao: false });
    B.box(-10, 0.012, -16, 10, 0.02, -2, 'paversDark', { collide: false, ao: false });
    B.box(-8, 0.012, 28, 10, 0.02, 40, 'pavers', { collide: false, ao: false });
    // the map's edge: the town wall with a tower at each corner, and round the palm grove in front of it a garden
    // wall too high to climb; beyond them the desert goes on to the haze
    // (the edge stands right against the garden walls' inner faces and the town wall's outer face: nobody climbs the
    // garden walls, and whoever walks the town wall stays on it)
    boundary(B, -60, -78, -45.4, -40.4); boundary(B, -60, -40.4, -44.6, 56); boundary(B, 45.4, -78, 60, -40.4); boundary(B, 44.6, -40.4, 60, 56);
    boundary(B, -60, -78, 60, -67.6); boundary(B, -60, 46, 60, 56);   // (right against the backs of the north blocks: no gap to drop into)
    desert(B);
    tower(B, -46.4, -40.4, -43, -36.6, 7.4); tower(B, 43, -40.4, 46.4, -36.6, 7.4);
    tower(B, -46.4, 43, -43, 47.2, 7.4); tower(B, 43, 43, 46.4, 47.2, 7.4);
    wall(B, -46.6, -68.6, -45.4, -40.4, 3.8, 'adobeLight'); wall(B, 45.4, -68.6, 46.6, -40.4, 3.8, 'adobeLight');
    wall(B, -46.6, -68.8, 46.6, -67.6, 3.8, 'adobeLight');
    // the grove's gate in the south wall, shut
    B.box(-3.2, 0, -67.75, 3.2, 3.4, -67.55, 'woodDark', DECO); B.box(-0.04, 0, -67.8, 0.04, 3.4, -67.5, 'metalDark', DECO);
    B.box(-3.8, 0, -69.2, -3.0, 4.6, -67.2, 'adobeOchre'); B.box(3.0, 0, -69.2, 3.8, 4.6, -67.2, 'adobeOchre');
    B.box(-4.0, 4.6, -69.4, 4.0, 5.1, -67.0, 'adobeOchre');

    // ------------------------------------------------------------- the town wall, the gate, the gap
    townWall(B, -44.6, -38.6, 44.6, -37.4, 5.2, [[-6, -2], [-34, -29.5]]);
    townWall(B, -44.6, -37.4, -43.4, 46, 5.2);
    townWall(B, 43.4, -37.4, 44.6, 46, 5.2);
    B.box(-6.6, 0, -39.4, -6, 5.6, -36.8, 'adobeOchre'); B.box(-2, 0, -39.4, -1.4, 5.6, -36.8, 'adobeOchre');
    B.box(-6.6, 3.4, -39.4, -1.4, 5.6, -36.8, 'adobeOchre');
    B.box(-6.9, 5.6, -39.6, -1.1, 6.4, -36.6, 'adobeOchre', { ao: false });
    for (const [x, z, s] of [[-34.6, -36.6, 1.1], [-29, -39.3, 0.9], [-33.9, -39.4, 0.7], [-29.5, -36.4, 0.8]]) B.box(x - s, 0, z - s * 0.7, x + s, s * 0.8, z + s * 0.7, 'adobeOchre');
    // behind the gate a wall with a fountain: nobody looks from the souk straight out at the grove
    B.box(-5.6, 0, -35.5, -1.4, 2.6, -34.9, 'sandstone');
    B.box(-4.4, 0, -35.0, -2.6, 0.7, -34.2, 'tilesBlue');
    B.box(-4.2, 0.6, -34.95, -2.8, 0.64, -34.3, 'waterFountain', DECO);

    // ------------------------------------------------------------- outside: the palm grove (attackers)
    const grove = [[-40, -55], [-34, -49], [-27, -56], [-22, -46], [-14, -57], [-12, -44], [9, -58], [12, -50], [22, -55], [26, -45], [33, -52], [39, -57], [-40, -43], [38, -43], [-11, -64], [4, -44], [-36, -63], [-24, -65], [14, -65], [30, -64], [40, -66], [-42, -66]];
    for (const [x, z] of grove) palm(B, x, z, 6.5 + ((Math.round(x * 7 + z) % 3) + 3) % 3);
    B.box(-24, 0, -54, -18, 2.4, -50, 'canvasYellow'); B.box(-24.3, 2.4, -54.3, -17.7, 2.7, -49.7, 'canvasRed', { ao: false });
    B.box(24, 0, -59, 30, 2.2, -55, 'canvasGreen'); B.box(23.7, 2.2, -59.3, 30.3, 2.5, -54.7, 'canvasYellow', { ao: false });
    truck(B, 10, -46.5, 'x', 'carPaintWhite', 1);
    crate(B, -10, -47, 1.2); crate(B, -9, -45.6, 1.0); crate(B, 7.5, -52.5, 1.2); barrel(B, 8.6, -53.6, 'metalRed'); crate(B, -14, -51, 1.2); crate(B, 5, -48, 1.0);
    for (const [x0, z0, x1, z1] of [[-30, -44.2, -22, -43.6], [-17, -41.5, -12, -40.9], [3, -41.6, 8.5, -41], [-38, -48, -37.4, -42], [30, -48.5, 30.6, -42.5]]) wall(B, x0, z0, x1, z1, 1.15, 'adobeLight');
    // the well house over the way down into the qanat: the door to the south, the stairs going down north
    wall(B, 14.6, -47.6, 19.4, -47, 3.1, 'adobeLight', [[15.6, 18.4]]);
    wall(B, 14.6, -47, 15.2, -39.6, 3.1, 'adobeLight'); wall(B, 18.8, -47, 19.4, -39.6, 3.1, 'adobeLight');
    B.box(14.4, 3.1, -47.8, 19.6, 3.35, -39.4, 'clay');
    B.geom(new THREE.SphereGeometry(2.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 'adobeLight', mtx(17, 3.3, -43.6, 0, 1, 0.55, 1.7));
    // the dome in steps you can stand on
    domeCol(B, 17, 3.3, -43.6, 2.2, 1.21, 3.74, 'adobeLight', 4);

    // ------------------------------------------------------------- the qanat
    this.qanat(B);

    // ------------------------------------------------------------- the houses: built last, see houses()
    // closed blocks: the backs of the east quarter, the north edge
    block(B, 12, -37.4, 43.4, -16, 6.2, 'adobe', 'w'); block(B, 16, -16, 43.4, -10, 6.2, 'adobeRose');
    block(B, 18.4, -10, 43.4, -2, 6.2, 'adobe', 'w'); block(B, 18.4, -2, 20.6, 7.4, 6.2, 'adobeOchre', 'w'); block(B, 28.4, -2, 43.4, 7.4, 6.2, 'adobeLight');
    block(B, 36, 7.4, 43.4, 8, 6.2, 'adobeLight');
    block(B, -43.4, 28, -24, 46, 7, 'adobe', 'n'); block(B, -24, 36, -8.6, 46, 7, 'adobeRose', 'n'); block(B, -14, 28, -8.6, 36, 7, 'adobe', 'n');
    block(B, 10.6, 28, 16, 46, 7, 'adobeLight', 'n'); block(B, 16, 36, 43.4, 46, 7, 'adobe', 'n'); block(B, 26, 28, 43.4, 36, 7, 'adobeOchre', 'n');
    // the two ends of the street in the north, and the corners behind them
    wall(B, -38.6, 24, -38, 28, 3.6, 'adobeOchre'); wall(B, 36, 24, 36.6, 28, 3.6, 'adobeOchre');
    block(B, -43.4, 23.6, -38.6, 28, 4.2, 'adobe'); block(B, 36.6, 23.6, 43.4, 28, 4.2, 'adobeRose');

    // ------------------------------------------------------------- the cistern house over the way up from the qanat
    this.cistern(B);

    // ------------------------------------------------------------- the gardens in the west (A main)
    wall(B, -43.4, -20.2, -36.2, -19.6, 1.3, 'adobeLight');
    wall(B, -36.8, -30, -36.2, -19.6, 1.3, 'adobeLight', [[-26.5, -24.5]]);
    wall(B, -33.4, -14, -32.8, -2, 1.3, 'adobeLight', [[-9, -7]]);
    wall(B, -43.4, -8.6, -38.2, -8, 1.3, 'adobeLight');
    wall(B, -38.8, -8, -38.2, 1.0, 1.3, 'adobeLight');
    for (const [x, z] of [[-41, -34], [-40, -26], [-41.4, -23], [-39.5, -16.5], [-41.6, -12], [-35.5, -10.5], [-31.5, -16], [-41, -4], [-36, 0.5], [-31.4, -4.5]]) palm(B, x, z, 6 + ((Math.round(x + z) % 3) + 3) % 3);
    // the water channel along the wall: stone curbs, the water between them
    B.box(-43.4, 0, -37.3, -43.22, 0.16, 4, 'sandstone', DECO); B.box(-42.48, 0, -37.3, -42.3, 0.16, 4, 'sandstone', DECO);
    B.box(-43.22, 0, -37.3, -42.48, 0.07, 4, 'water', DECO);
    cart(B, -35, -16, 'z');
    for (const [x, z] of [[-38.2, -30.2], [-34.4, -6.2], [-40.6, 2.4]]) { B.box(x - 0.9, 0, z - 0.7, x + 0.9, 1.3, z + 0.7, 'hay'); }
    wall(B, -41, -27.4, -38.4, -26.8, 1.3, 'adobeLight'); wall(B, -38.6, -2.2, -35.4, -1.6, 1.3, 'adobeLight');
    // the gardener's shed in the middle of the gardens
    B.box(-41.6, 0, -16.6, -37.6, 2.4, -13.4, 'woodDark'); B.box(-41.9, 2.4, -16.9, -37.3, 2.55, -13.1, 'woodPale', DECO);

    // ------------------------------------------------------------- A: the dyers' yard (x -38.6..-21, z 6..23.4)
    wall(B, -38.6, 5.4, -20.4, 6.0, 3.3, 'adobe', [[-38.6, -33.4]]);        // south side, the way in from the gardens at its west end
    wall(B, -21, 6.0, -20.4, 23.4, 3.3, 'adobe', [[10.6, 14.6]]);            // east side, the gap from the alley (A short)
    wall(B, -38.6, 23.4, -20.4, 24, 3.3, 'adobe', [[-30, -26]]);             // north side, the way from the defenders
    const dyes = ['canvasBlue', 'canvasRed', 'paintYellow', 'canvasGreen', 'canvasBlue', 'carPaintRed'];
    [[-34.6, 10], [-31.9, 10], [-34.6, 12.8], [-25.2, 19.0], [-22.6, 19.0], [-24.2, 9.4]].forEach(([x, z], i) => vat(B, x, z, dyes[i]));
    dryRack(B, -30.5, 19.6, -26.5, ['canvasRed', 'canvasYellow', 'canvasBlue', 'canvasRed']);
    dryRack(B, -28.5, 8.4, -25, ['canvasBlue', 'canvasGreen', 'canvasYellow']);
    crate(B, -22.4, 7.4, 1.2); crate(B, -22.4, 7.4, 1.0, 1.2);
    for (const [x, z] of [[-37.2, 22.2], [-36.4, 22.6], [-21.8, 22.4]]) jar(B, x, z, 1.2);
    cart(B, -34.6, 19.2, 'x');
    siteLetter(B, 'A', -38.47, 2.0, 18.2, 1, 0, 2.6);

    // ------------------------------------------------------------- B: the potters' yard (x 18.4..36, z 8..23.4)
    wall(B, 18.4, 7.4, 36, 8.0, 3.3, 'adobeRose', [[21.4, 27.6]]);           // south side, the way up from the qanat
    wall(B, 18.4, 8.0, 19.0, 23.4, 3.3, 'adobeRose', [[9.2, 13.2]]);          // west side, the gap from the alley
    wall(B, 18.4, 23.4, 36, 24, 3.3, 'adobeRose', [[26, 30]]);                // north side, the way from the defenders
    kiln(B, 31.2, 12.8, 2.0); kiln(B, 23.8, 19.2, 1.7);
    potShelf(B, 28.5, 32.5, 23.4, -1); potShelf(B, 19.0, 23, 8.0, 1);
    for (const [x, z, s] of [[28.2, 18.8, 1.3], [28.9, 19.4, 1.1], [27.8, 19.8, 1.0], [34.5, 21.4, 1.25], [20.0, 16.6, 1.1]]) jar(B, x, z, s);
    crate(B, 33.6, 9.2, 1.2); crate(B, 32.4, 9.2, 1.0, 0, 'woodDark');
    B.box(25.4, 0, 11.2, 27.4, 1.0, 12.2, 'clay');                               // a heap of clay, waist high
    // stairs onto the workshop roof from inside the yard
    stairs(B, 35.3, 9.2, '+z', 1.2, TOP1, 4.2, 'sandstone');
    B.box(34.64, 0, 9.2, 34.7, TOP1 + 0.9, 13.4, 'adobeLight', PLAIN);
    siteLetter(B, 'B', 35.87, 2.0, 16.6, -1, 0, 2.6);

    // ------------------------------------------------------------- the souk and the square
    shade(B, -2.5, -31.5, 2.5, -27, 3.0, 'awningOchre'); shade(B, -2.5, -26, 2.5, -21.5, 3.05, 'awningBlue'); shade(B, -2.5, -20.5, 2.5, -16.5, 3.0, 'awningRed');
    stall(B, -1.4, -24, 'z', 'canvasYellow'); stall(B, 1.4, -19.2, 'z', 'canvasGreen');
    // the well in the middle of the square, under a roof on four posts
    roundCol(B, 0, -9, 0, 0.9, 1.4, 1.4, 'sandstone');
    B.geom(new THREE.CylinderGeometry(1.35, 1.45, 0.9, 20), 'sandstone', mtx(0, 0.45, -9));
    B.geom(new THREE.CylinderGeometry(1.1, 1.1, 0.04, 20), 'water', mtx(0, 0.8, -9));
    for (const [x, z] of [[-1.7, -10.7], [1.7, -10.7], [-1.7, -7.3], [1.7, -7.3]]) B.box(x - 0.13, 0, z - 0.13, x + 0.13, 3.0, z + 0.13, 'woodDark');
    B.box(-2.3, 3.0, -11.3, 2.3, 3.25, -6.7, 'woodDark'); B.box(-2.5, 3.25, -11.5, 2.5, 3.35, -6.5, 'clay', DECO);
    for (const [x, z] of [[-8, -14], [8, -14], [-8, -4], [8.4, -3.6]]) palm(B, x, z, 7);
    stall(B, -6, -9, 'z', 'canvasRed'); stall(B, 6.2, -10.6, 'z', 'canvasBlue');
    cart(B, 12.2, -4.4, 'z');

    // ------------------------------------------------------------- the defenders' side: the street and the kasbah
    for (const [x, z] of [[-14, 26.4], [12.5, 26.2], [-34, 26.5], [33, 26]]) jar(B, x, z, 1.25);
    cart(B, -20, 26.3, 'x'); crate(B, 21, 25.8, 1.2); crate(B, 22.2, 25.8, 1.0);
    wall(B, -8.6, 27.4, 10.6, 28, 3.6, 'adobeOchre', [[-6, -2]]);
    wall(B, -8.6, 28, -8, 40, 3.6, 'adobeOchre');
    wall(B, 10, 28, 10.6, 40, 3.6, 'adobeOchre');
    B.box(-10, 0, 40, 12, 9, 46, 'adobeOchre');
    for (const x of [-10, 9]) B.box(x, 0, 39, x + 3, 12, 46, 'adobeOchre');
    B.box(-1.5, 0, 39.7, 1.5, 3.2, 40, 'woodDark', DECO);
    for (let x = -9.5; x < 11; x += 2) B.box(x, 9, 40, x + 1, 9.8, 41, 'adobeOchre', DECO);
    palm(B, -5, 38, 7); palm(B, 7.5, 37.5, 6.5);
    B.box(-7.9, 0, 31.5, -7.0, 0.7, 36.5, 'sandstone'); B.box(-7.8, 0.6, 31.6, -7.1, 0.64, 36.4, 'waterFountain', DECO);
    crate(B, 8.9, 39.0, 1.2); crate(B, 8.9, 39.0, 1.0, 1.2); crate(B, 7.6, 39.1, 1.0); crate(B, 9.0, 29.3, 1.1);
    for (const [x, z] of [[-7.3, 29.2], [-6.5, 29.0], [-7.4, 39.2]]) jar(B, x, z, 1.15);
    B.box(-2.4, 3.6, 39.6, 2.4, 3.75, 40, 'woodDark', DECO); B.box(-2.2, 0.9, 39.85, 2.2, 3.55, 39.95, 'canvasRed', DECO);

    // ------------------------------------------------------------- the houses, last: they look at what stands round them
    houses(B, out, HOUSES);
  },

  // the cistern house: four walls round the head of the stairs up from the qanat, a door to the north
  cistern(B) {
    const x0 = 20.6, x1 = 28.4, z0 = -2, z1 = 7.4, h = 3.3;
    wall(B, x0, z0, x1, z0 + 0.4, h, 'adobeOchre');
    wall(B, x0, z0 + 0.4, x0 + 0.4, z1 - 0.6, h, 'adobeOchre');
    wall(B, x1 - 0.4, z0 + 0.4, x1, z1 - 0.6, h, 'adobeOchre');
    wall(B, x0, z1 - 1.0, x1, z1 - 0.6, h, 'adobeOchre', [[22.4, 26.6]]);
    B.box(x0, h, z0, x1, h + 0.3, z1 - 0.6, 'clay');
    // the floor round the hole, a low wall along the hole's open side
    for (const q of subtract([[x0 + 0.4, z0 + 0.4, x1 - 0.4, z1 - 1.0]], [QOUT])) B.box(q[0], 0, q[1], q[2], BASE, q[3], 'pavers');
    B.box(23.3, BASE, QOUT[1], 23.4, BASE + 0.9, QOUT[3] - 1.6, 'woodDark'); B.box(25.6, BASE, QOUT[1], 25.7, BASE + 0.9, QOUT[3] - 1.6, 'woodDark');
    // the cistern itself: a basin of water by the east wall
    B.box(26.2, 0, -1.0, 27.8, 0.8, 5.4, 'tilesBlue'); B.box(26.35, 0.7, -0.85, 27.65, 0.74, 5.25, 'waterFountain', DECO);
    for (const [x, z] of [[21.4, 4.6], [21.6, 5.6], [22.4, -0.8]]) jar(B, x, z, 1.1);
  },

  // the qanat: a straight run north under the east of the town, a turn east, up again under B
  qanat(B) {
    const wall = 'fieldstone', floor = 'sandstone';
    stairs(B, 17, -40.8, '-z', 2.6, -TF, 5.4, floor, TF);
    stairs(B, 24.5, -2.9, '+z', 2.0, -TF + BASE, 5.3, floor, TF);
    for (const [x0, z0, x1, z1] of [[15.6, -40.8, 17.4, -6.0], [15.6, -6.0, 25.6, -3.0], [23.4, -3.0, 25.6, -2.9]]) B.box(x0, TF - 1, z0, x1, TF, z1, floor);
    // the water: a channel along the east side of the long run, a little lower than the walkway
    B.box(17.4, TF - 1, -40.8, 18.4, TF - 0.35, -6.0, floor);
    B.box(17.4, TF - 0.35, -40.6, 18.4, TF - 0.33, -6.2, 'water', { collide: false, ao: false });
    // the walls, from the floor up to the underside of the ground
    B.box(14.8, TF, -46.4, 15.6, TC, -6.0, wall); B.box(18.4, TF, -46.4, 19.2, TC, -6.8, wall);
    B.box(14.8, TF, -6.0, 15.6, TC, -2.2, wall); B.box(15.6, TF, -2.95, 23.4, TC, -2.2, wall);
    B.box(18.4, TF, -6.8, 26.4, TC, -6.0, wall); B.box(25.6, TF, -6.0, 26.4, TC, 2.6, wall);
    B.box(22.6, TF, -2.95, 23.4, TC, 2.6, wall);
    // pillars that break the long view down the tunnel
    for (const [x, z] of [[15.6, -31], [18.4, -24], [15.6, -16]]) B.box(x - 0.45, TF, z - 0.45, x + 0.45, TC, z + 0.45, wall);
    // dark stone overhead, lamps along the wall
    B.box(15.6, TC - 0.02, -40.6, 18.4, TC, -6.0, 'rockDark', { collide: false, ao: false, faces: '-y' });
    B.box(15.6, TC - 0.02, -6.0, 25.6, TC, -3.0, 'rockDark', { collide: false, ao: false, faces: '-y' });
    for (let z = -38; z < -7; z += 6) B.box(15.6, TF + 1.8, z - 0.15, 15.7, TF + 2.05, z + 0.15, 'lampOn', DECO);
    B.pointLight(16.6, TF + 2.0, -30, 0xffc890, 3, 14); B.pointLight(16.6, TF + 2.0, -14, 0xffc890, 3, 14); B.pointLight(21, TF + 2.0, -4.5, 0xffc890, 3, 12);
  },

  // the sites, and the spawns: attackers in the grove round (-2, -59), defenders in the forecourt round (2, 35),
  // each within 5 m of its middle (the buy zone is 6 m round it)
  sd: {
    sites: { A: [-29, 0, 14.6, 5.5], B: [27.4, 0, 15.6, 5.5] },
    attack: [[-2, 0, -59, 0], [1.5, 0, -59.5, 0], [-5.5, 0, -59.5, 0], [-2, 0, -62.5, 0], [-2, 0, -55.8, 0], [1.8, 0, -56.2, 0], [-5.8, 0, -56.4, 0], [1.6, 0, -62.6, 0], [-5.6, 0, -62.6, 0], [4.2, 0, -59.4, 0]],
    defend: [[2, 0, 35, Math.PI], [-1.5, 0, 35.2, Math.PI], [5.5, 0, 35.4, Math.PI], [2, 0, 38, Math.PI], [2, 0, 31.8, Math.PI], [-1.6, 0, 31.8, Math.PI], [5.6, 0, 32, Math.PI], [-1.8, 0, 38.2, Math.PI], [5.8, 0, 38.2, Math.PI], [-4.4, 0, 35, Math.PI]],
  },
  spawns() { return { 0: this.sd.attack, 1: this.sd.defend }; },

  hotspots: [
    [-29, 0, 14.6], [27.4, 0, 15.6], [0, 0, -9], [0, 0, -24], [-35, 0, -10], [-35.5, 0, 3], [-17.9, 0, -8.5], [-17.9, 0, 6],
    [16.4, 0, -8], [16.4, 0, 6], [17, TF, -20], [24.5, 0, 5.4], [5, 0, 10], [-28, 0, 26], [28, 0, 26], [-4, 0, -33.5],
  ],
};

// ---------------------------------------------------------------------------
// The houses: [x0, z0, x1, z1] in the world and the side the front looks to. Sides in `doors` and `roofStair` are the
// house's own: 'n' its back, 'w'/'e' its left/right as you look out of its front door
// ---------------------------------------------------------------------------
const HOUSES = [
  // --- the souk: shops both sides, the front toward the street
  { r: [-12, -32, -2.5, -26], face: 'E', kind: 'shop', fl: 2, ext: 'adobeLight', awning: ['awningRed', 'paintWhite'] },
  { r: [-12, -26, -2.5, -21], face: 'E', kind: 'shop', ext: 'adobe', awning: ['awningBlue', 'paintWhite'] },
  { r: [-12, -21, -2.5, -16], face: 'E', kind: 'shop', fl: 2, ext: 'adobeRose', awning: ['awningGreen', 'paintWhite'] },
  { r: [2.5, -32, 12, -26], face: 'W', kind: 'shop', ext: 'adobeOchre', roofStair: 'w', awning: ['awningOchre', 'paintWhite'] },
  { r: [2.5, -26, 12, -21], face: 'W', kind: 'shop', fl: 2, ext: 'adobeLight', awning: ['awningRed', 'paintWhite'] },
  { r: [2.5, -21, 12, -16], face: 'W', kind: 'shop', ext: 'adobe', roofStair: 'e', awning: ['awningBlue', 'paintWhite'] },
  // --- the west quarter: houses on both sides of the alley north from the gate (x -24..-21); back doors to the gardens
  { r: [-30, -32, -24, -24], face: 'E', fl: 2, ext: 'adobeRose', doors: [{ room: 'b1', side: 'n', at: 0 }] },
  { r: [-30, -24, -24, -16], face: 'E', ext: 'adobe', doors: [{ room: 'b2', side: 'n', at: 0 }] },
  { r: [-30, -16, -24, -10.5], face: 'E', ext: 'adobeLight', roofStair: 'w' },
  { r: [-21, -32, -12, -24], face: 'W', fl: 2, ext: 'adobeOchre' },
  { r: [-21, -24, -12, -16], face: 'W', ext: 'adobe' },
  { r: [-21, -16, -10, -10.5], face: 'E', ext: 'adobeLight', doors: [{ room: 'b1', side: 'n', at: 0 }] },
  // --- round the square
  { r: [-10, -2, 3, 6.4], face: 'S', fl: 2, ext: 'adobe' },
  { r: [10, -16, 16, -10], face: 'W', ext: 'adobeRose', roofStair: 'e' },
  // --- between the square and A: the alley's houses (the alley north runs x -20.4..-15.4 to the yard's gap)
  { r: [-30, -6.4, -20.4, -0.2], face: 'S', ext: 'adobe', doors: [{ room: 'b1', side: 'w', at: -1.8 }] },
  { r: [-30, -0.2, -20.4, 5.4], face: 'E', ext: 'adobeLight' },
  { r: [-15.4, -6.4, -10, 3.6], face: 'W', ext: 'adobeRose', doors: [{ room: 'b1', side: 'n', at: -3 }] },
  { r: [-15.4, 3.6, -10, 15.2], face: 'W', ext: 'adobe' },
  { r: [-20.4, 15.2, -10, 24], face: 'S', fl: 2, ext: 'adobeOchre', doorAt: 2.7 },
  { r: [-10, 6.4, 3, 15], face: 'E', ext: 'adobe' },
  { r: [-10, 15, 3, 24], face: 'E', fl: 2, ext: 'adobeLight' },
  // --- between the north street (x 3..7) and the alley to B (x 14.4..18.4): houses with doors both sides
  { r: [7, -2, 14.4, 5], face: 'W', ext: 'adobeLight' },
  { r: [7, 5, 14.4, 14], face: 'E', ext: 'adobeRose', doors: [{ room: 'b1', side: 'n', at: 0 }] },
  { r: [7, 14, 18.4, 24], face: 'W', fl: 2, ext: 'adobe' },
  // --- the dye house (west of A) and the workshop (east of B), their fronts into the yards
  { r: [-43.4, 6, -38.6, 23.4], face: 'E', fl: 2, ext: 'adobeLight', doorAt: 5, frontWin: { s: false } },
  { r: [36, 8, 43.4, 23.4], face: 'W', ext: 'adobeRose', doorAt: 3.8, frontWin: { s: false }, roofGaps: [['s', -3.6, -2.0]] },
  // --- the defenders' street: two houses on its north side
  { r: [-24, 28, -14, 36], face: 'S', ext: 'adobeLight' },
  { r: [16, 28, 26, 36], face: 'S', ext: 'adobe' },
];
