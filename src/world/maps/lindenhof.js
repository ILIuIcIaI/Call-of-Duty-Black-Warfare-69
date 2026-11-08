import * as THREE from 'three';
import { crate, barrel, tree, mtx, boundary, truck, stairs, railing } from '../props.js';
import { PLAIN } from '../kit.js';
import { H, DECO, seeded, house, wall, block, siteLetter, cart } from './sdparts.js';

// =============================================================================
// LINDENHOF — a village in summer, afternoon, made for Search and Destroy (4 vs 4 up to 6 vs 6).
// Half-timbered houses round a square with the old linden tree, the maypole and the fountain; the attackers come
// in from the fields in the south, the defenders hold the church square in the north.
//   A : the brewery yard in the west: barrel stacks, the beer wagon; the brew house and the malt house look onto it
//   B : the nursery in the east: two glasshouses (the glass breaks), raised beds, the potting shed
//   Mid : up the winding main street to the square; the Brauergasse goes on toward A (in through the malt house),
//         the lane past the inn toward B; the inn and its beer garden lie between square and nursery
//   West : through the orchard to the brewery yard
//   East : up the farm track and through the big barn (hay loft above) into the farmyard before the nursery
// Every house can be walked through and is furnished.
// =============================================================================
const DOT = 0.012;
const LOOK = { timber: 'woodDark', plinth: 'fieldstone', shutter: 'shutterGreen', flower: 0.7, winW: 1.0, winH: 1.2, winY: 1.25, bay: 2.9, frame: 'paintWhite', leaf: 'woodDark', upWinW: 1.0, upWinH: 1.2 };
const look = (o = {}) => ({ ...LOOK, ...o });

// a picket fence along x or z (low cover you see through); gaps [a0, a1]
function fence(b, x0, z0, x1, z1, h = 1.05, gaps = []) {
  const along = Math.abs(x1 - x0) > Math.abs(z1 - z0) ? 'x' : 'z', A0 = along === 'x' ? x0 : z0, A1 = along === 'x' ? x1 : z1;
  let cur = A0;
  const emit = (a, c) => {
    if (along === 'x') {
      b.box(a, 0, z0 - 0.05, c, h, z0 + 0.05, 'woodPale', { visual: false, pen: 1, noBullet: true });
      for (const y of [0.35, h - 0.2]) b.box(a, y, z0 - 0.03, c, y + 0.07, z0 + 0.03, 'woodPale', DECO);
      for (let p = a + 0.05; p < c; p += 0.16) b.box(p, 0, z0 - 0.02, p + 0.08, h, z0 + 0.02, 'woodPale', DECO);
    } else {
      b.box(x0 - 0.05, 0, a, x0 + 0.05, h, c, 'woodPale', { visual: false, pen: 1, noBullet: true });
      for (const y of [0.35, h - 0.2]) b.box(x0 - 0.03, y, a, x0 + 0.03, y + 0.07, c, 'woodPale', DECO);
      for (let p = a + 0.05; p < c; p += 0.16) b.box(x0 - 0.02, 0, p, x0 + 0.02, h, p + 0.08, 'woodPale', DECO);
    }
  };
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) { if (g0 > cur) emit(cur, g0); cur = Math.max(cur, g1); }
  if (cur < A1) emit(cur, A1);
}
// a clipped hedge
function hedge(b, x0, z0, x1, z1, h = 1.9) {
  b.box(x0, 0, z0, x1, h, z1, 'hedge', { pen: 1 });
}
// a wooden keg on its side or upright
const KEG = new THREE.CylinderGeometry(0.42, 0.42, 0.95, 14);
const HOOP = new THREE.CylinderGeometry(0.44, 0.44, 0.06, 14);
function keg(b, x, z, y = 0, lying = false) {
  if (lying) {
    b.box(x - 0.48, y, z - 0.42, x + 0.48, y + 0.84, z + 0.42, 'woodDark', { visual: false });
    b.geom(KEG, 'wood', mtx(x, y + 0.42, z, 0, 1, 1, 1, 0, Math.PI / 2));
    for (const dx of [-0.32, 0.32]) b.geom(HOOP, 'metalDark', mtx(x + dx, y + 0.42, z, 0, 1, 1, 1, 0, Math.PI / 2));
  } else {
    b.box(x - 0.42, y, z - 0.42, x + 0.42, y + 0.95, z + 0.42, 'woodDark', { visual: false });
    b.geom(KEG, 'wood', mtx(x, y + 0.475, z));
    for (const dy of [0.15, 0.8]) b.geom(HOOP, 'metalDark', mtx(x, y + dy, z));
  }
}
// a stack of kegs: a row lying, a second row on top of it
function kegStack(b, x, z, n, along = 'z') {
  for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 0.9; keg(b, along === 'z' ? x : x + o, along === 'z' ? z + o : z, 0, true); }
  for (let i = 0; i < n - 1; i++) { const o = (i - (n - 2) / 2) * 0.9; keg(b, along === 'z' ? x : x + o, along === 'z' ? z + o : z, 0.78, true); }
}
// a round bale of hay
const BALE = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 16);
function bale(b, x, z, along = 'x', y = 0) {
  b.box(x - (along === 'x' ? 0.6 : 0.72), y, z - (along === 'x' ? 0.72 : 0.6), x + (along === 'x' ? 0.6 : 0.72), y + 1.45, z + (along === 'x' ? 0.72 : 0.6), 'hay', { visual: false });
  b.geom(BALE, 'hay', along === 'x' ? mtx(x, y + 0.75, z, 0, 1, 1, 1, 0, Math.PI / 2) : mtx(x, y + 0.75, z, 0, 1, 1, 1, Math.PI / 2, 0));
}
// a glasshouse: a frame of white posts, glass that breaks on the sides and the roof, a door in the middle of each end
function glasshouse(b, x0, z0, x1, z1, h = 2.6, doors = ['n', 's']) {
  const post = (x, z, top) => b.box(x - 0.05, 0, z - 0.05, x + 0.05, top, z + 0.05, 'paintWhite', { pen: 1 });
  const cx = (x0 + x1) / 2;
  for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / Math.round((x1 - x0) / 1.5)) { post(x, z0, h); post(x, z1, h); }
  for (let z = z0; z <= z1 + 0.01; z += (z1 - z0) / Math.round((z1 - z0) / 1.5)) { post(x0, z, h); post(x1, z, h); }
  b.box(x0 - 0.06, h, z0 - 0.06, x1 + 0.06, h + 0.1, z1 + 0.06, 'paintWhite', DECO);
  for (const [side, z] of [['n', z0], ['s', z1]]) { if (doors.includes(side)) { b.box(x0, 0, z - 0.1, cx - 0.65, 0.45, z + 0.1, 'brick'); b.box(cx + 0.65, 0, z - 0.1, x1, 0.45, z + 0.1, 'brick'); } else b.box(x0, 0, z - 0.1, x1, 0.45, z + 0.1, 'brick'); }
  b.box(x0 - 0.1, 0, z0, x0 + 0.1, 0.45, z1, 'brick'); b.box(x1 - 0.1, 0, z0, x1 + 0.1, 0.45, z1, 'brick');
  // the long sides: glass above the low brick wall
  for (const x of [x0, x1]) b.glassPane(x - 0.02, 0.45, z0 + 0.06, x + 0.02, h - 0.05, z1 - 0.06, 0xbfe0d0);
  // the ends: glass beside the door
  for (const [side, z] of [['n', z0], ['s', z1]]) {
    if (doors.includes(side)) {
      b.glassPane(x0 + 0.06, 0.45, z - 0.02, cx - 0.65, h - 0.05, z + 0.02, 0xbfe0d0);
      b.glassPane(cx + 0.65, 0.45, z - 0.02, x1 - 0.06, h - 0.05, z + 0.02, 0xbfe0d0);
    } else b.glassPane(x0 + 0.06, 0.45, z - 0.02, x1 - 0.06, h - 0.05, z + 0.02, 0xbfe0d0);
  }
  // the roof: a low ridge of glass (to look at; the panes on top don't hold you)
  const g = new THREE.BoxGeometry(x1 - x0 + 0.1, 0.02, (z1 - z0) / 2 + 0.25);
  for (const s of [-1, 1]) b.geom(g, 'carGlass', mtx(cx, h + 0.45, (z0 + z1) / 2 + s * (z1 - z0) / 4, 0, 1, 1, 1, s * 0.42));
  b.box(x0, h, z0, x1, h + 0.22, z1, 'carGlass', { visual: false, noBullet: true }); b.box(x0, h + 0.22, z0 + (z1 - z0) / 4, x1, h + 0.45, z1 - (z1 - z0) / 4, 'carGlass', { visual: false, noBullet: true });
  // tables of pots inside, along both long sides
  for (const x of [x0 + 0.75, x1 - 0.75]) {
    b.box(x - 0.45, 0, z0 + 0.8, x + 0.45, 0.82, z1 - 0.8, 'woodPale', { pen: 1 });
    for (let z = z0 + 1.1; z < z1 - 0.9; z += 0.5) b.box(x - 0.18, 0.82, z - 0.1, x + 0.02, 1.05, z + 0.1, 'clay', DECO), b.box(x - 0.2, 1.05, z - 0.14, x + 0.06, 1.35, z + 0.14, 'foliage', DECO);
  }
}
// a raised bed of planks with green in it
function bed(b, x0, z0, x1, z1) {
  b.box(x0, 0, z0, x1, 0.55, z1, 'woodDark', { pen: 1 });
  b.box(x0 + 0.08, 0.55, z0 + 0.08, x1 - 0.08, 0.62, z1 - 0.08, 'dirt', DECO);
  for (let x = x0 + 0.4; x < x1 - 0.2; x += 0.6) b.box(x - 0.18, 0.62, z0 + 0.2, x + 0.18, 0.95, z1 - 0.2, 'foliageDark', DECO);
}
// a bench and a table of the beer garden
function beerTable(b, x, z) {
  b.box(x - 1.1, 0, z - 0.4, x + 1.1, 0.78, z + 0.4, 'woodPale', { pen: 1 });
  for (const s of [-1, 1]) b.box(x - 1.1, 0, z + s * 0.75 - 0.15, x + 1.1, 0.46, z + s * 0.75 + 0.15, 'woodPale', { pen: 1 });
}

export default {
  id: 'lindenhof',
  name: 'LINDENHOF',
  desc: 'Fachwerkdorf im Sommer, nur für Suchen & Zerstören. A im Brauhof, B in der Gärtnerei mit ihren Glashäusern, in der Mitte der Dorfplatz unter der alten Linde.',
  size: 'Mittel',
  env: {
    sunDir: [-0.55, 0.62, -0.42],
    sunColor: 0xfff0d6, sunIntensity: 2.8,
    skyTop: 0x3f7fd0, skyHorizon: 0xcfe2f2, skyBottom: 0x8a9a7a,
    cloudColor: 0xffffff, clouds: 0.42,
    hemiSky: 0xcfe0f0, groundColor: 0x9a8c74, ambient: 1.35,
    fogColor: 0xd2e2ee, fogNear: 70, fogFar: 300,
  },
  bounds: { minX: -46, maxX: 46, minZ: -66, maxZ: 47 },
  navTop: 3.6,     // the ground, the upper floors (3.35) and the hay loft are floors; roofs are not
  mmCeiling: 3.3,

  build(B) { seeded(0x11de5, () => this.village(B)); },

  village(B) {
    const out = { spots: [], vehicles: [], navRects: [], footprints: [] };
    // ------------------------------------------------------------- ground: grass, cobbles in the streets, gravel in the yards
    B.box(-52, -1, -72, 52, 0, 52, 'grass');
    const cob = (x0, z0, x1, z1, m = 'paversDark') => B.box(x0, 0, z0, x1, DOT, z1, m, { collide: false, ao: false });
    cob(4, -46, 12, -30); cob(-4, -30, 12, -24); cob(-4, -24, 4, -14);                  // the main street
    cob(-16, -14, 8, 2, 'pavers');                                                       // the square
    cob(-20, -2, -16, 18); cob(8, 0, 12, 32); cob(12, 10, 18, 16);                       // Brauergasse, the lane, its way to B
    cob(-40, 32, 40, 36); cob(-30, 24, -26, 32); cob(24, 28, 28, 32); cob(-12, 36, 10, 46, 'pavers');   // church street, lanes, church square
    cob(-40, 8, -26, 24, 'gravel'); cob(18, 0, 40, 8, 'gravel'); cob(18, 8, 40, 28, 'gravel');          // the yards
    cob(34, -46, 42, -14, 'dirt'); cob(4, -66, 12, -46, 'gravel');                       // farm track, the road in from the fields
    // the map's edge: hedges and fields all round
    boundary(B, -60, -80, -46, 60); boundary(B, 46, -80, 60, 60); boundary(B, -60, -80, 60, -66); boundary(B, -60, 47, 60, 60);
    hedge(B, -45, -46, -44, 36, 2.6); hedge(B, 44, -46, 45, 36, 2.6);

    // ------------------------------------------------------------- the fields (attackers): the road in, bales, a field barn
    fence(B, -44, -46.05, 44, -45.95, 1.05, [[-38, -30], [4, 12], [34, 42]]);
    for (const [x, z, a] of [[-12, -52, 'x'], [-10.5, -55, 'z'], [20, -51, 'x'], [22, -54.6, 'z'], [26, -50, 'x'], [-26, -58, 'x'], [-2, -62, 'z'], [32, -60, 'x']]) bale(B, x, z, a);
    B.box(-38, 0, -62, -28, 0.3, -54, 'woodDark');                                      // the field barn: an open shed
    for (const [x, z] of [[-38, -62], [-28, -62], [-38, -54], [-28, -54]]) B.box(x - 0.15, 0.3, z - 0.15, x + 0.15, 3.6, z + 0.15, 'woodDark');
    B.box(-38.6, 3.6, -62.6, -27.4, 3.8, -53.4, 'roofBrown');
    bale(B, -35, -58, 'z', 0.3); bale(B, -31, -58.5, 'x', 0.3);
    truck(B, 18, -60, 'z', 'carPaintGreen', 1);
    crate(B, 0, -50, 1.2); crate(B, 1.2, -50.2, 1.0); crate(B, 14, -48, 1.2);
    for (const [x, z] of [[-20, -64], [-6, -66], [24, -65], [38, -62], [-42, -50], [40, -50]]) tree(B, x, z, 7, 2.6);

    // ------------------------------------------------------------- the houses
    for (const s of HOUSES) house(B, out, s);
    this.barn(B);
    this.inn(B, out);
    this.brewery(B, out);

    // ------------------------------------------------------------- closed blocks: the backs of the village
    block(B, 24, -26, 34, -14, 4.2, 'barnGrey', 'e', 'euro');                            // the hen house behind the farm
    block(B, 40, -14, 44, 8, 4.2, 'barnRed', '', 'euro'); block(B, 40, 8, 44, 28.6, 4.2, 'brick', '', 'euro');
    block(B, -44, 8, -40, 36, 5, 'plasterOchre', '', 'euro');
    block(B, 18, 28.6, 24, 32, 5.2, 'wallCream', 's', 'euro'); block(B, 28, 28.6, 44, 32, 5.2, 'plasterRose', 's', 'euro');
    block(B, -44, 36, -12, 47, 7.2, 'plasterWhite', 'n', 'euro'); block(B, 10, 36, 44, 47, 7.2, 'wallCream', 'n', 'euro');
    wall(B, -40.6, 32, -40, 36, 3.4, 'fieldstone', [], 'concreteDark'); wall(B, 40, 32, 40.6, 36, 3.4, 'fieldstone', [], 'concreteDark');

    // ------------------------------------------------------------- the church on the square in the north (defenders)
    B.box(-2, 0, 38, 10, 9, 46, 'plasterWhite');
    B.box(-2.3, 9, 37.7, 10.3, 9.3, 46.3, 'concreteDark', DECO);
    for (const s of [-1, 1]) B.geom(new THREE.BoxGeometry(12.8, 0.25, 5.4), 'roofSlate', mtx(4, 10.9, 42 + s * 2.2, 0, 1, 1, 1, s * 0.62));
    B.box(6, 0, 36.2, 10, 18, 40.2, 'plasterWhite');                                       // the tower
    B.geom(new THREE.ConeGeometry(3.1, 7, 4), 'roofSlate', mtx(8, 21.5, 38.2, Math.PI / 4));
    B.box(6.8, 12.5, 36.15, 9.2, 14.6, 36.2, 'black', DECO); B.box(7.4, 15.4, 36.15, 8.6, 16.5, 36.2, 'paintWhite', DECO);
    B.box(1.4, 0, 37.9, 3.4, 3.2, 38, 'woodDark', DECO);                                  // the door
    for (const z of [39.5, 42, 44.5]) B.box(-2.05, 3, z - 0.5, -2, 6.5, z + 0.5, 'carGlass', DECO);
    // lime trees along the back of the square, benches, a notice board
    for (const x of [-11.2, -6.4]) tree(B, x, 45.4, 8, 2.2);
    B.box(-11.6, 0, 36.4, -9.4, 0.46, 36.9, 'woodDark'); B.box(-3.6, 0, 36.4, -1.4, 0.46, 36.9, 'woodDark');
    B.box(-12, 0, 41, -11.8, 2.2, 43, 'woodDark'); B.box(-11.85, 1.0, 41.2, -11.8, 2.0, 42.8, 'posters', DECO);

    // ------------------------------------------------------------- the square: the linden tree, the maypole, the fountain
    tree(B, -7, -6, 12, 5.2);
    B.box(-8.6, 0, -7.6, -5.4, 0.45, -4.4, 'woodDark', { pen: 1 });                       // the round bench under the tree (square here)
    B.box(-7.5, 0, -6.5, -6.5, 1.2, -5.5, 'bark');
    // the maypole: a tall striped pole with a wreath and the signs of the trades
    B.box(3.85, 0, -0.15, 4.15, 18, 0.15, 'woodPale', { visual: false });
    B.geom(new THREE.CylinderGeometry(0.12, 0.2, 18, 10), 'woodPale', mtx(4, 9, 0));
    for (let y = 1; y < 17; y += 1.2) B.geom(new THREE.CylinderGeometry(0.205 - y * 0.0045, 0.205 - y * 0.0045, 0.45, 10), 'paintWhite', mtx(4, y, 0));
    B.geom(new THREE.TorusGeometry(0.9, 0.12, 6, 18), 'pine', mtx(4, 16.5, 0, 0, 1, 1, 1, Math.PI / 2));
    for (let i = 0; i < 4; i++) B.box(4 + Math.cos(i * 1.57) * 0.25 - 0.3, 11 - i * 2.2, Math.sin(i * 1.57) * 0.25 - 0.02, 4 + Math.cos(i * 1.57) * 0.25 + 0.3, 11.5 - i * 2.2, Math.sin(i * 1.57) * 0.25 + 0.02, ['paintYellow', 'canvasBlue', 'canvasRed', 'paintWhite'][i], DECO);
    // the fountain: a stone basin, a column with a spout
    B.box(-1.8, 0, -11.8, 1.8, 0.7, -8.2, 'fieldstone', { visual: false });
    B.geom(new THREE.CylinderGeometry(1.95, 2.05, 0.7, 8), 'fieldstone', mtx(0, 0.35, -10));
    B.geom(new THREE.CylinderGeometry(1.7, 1.7, 0.04, 8), 'waterFountain', mtx(0, 0.62, -10));
    B.box(-0.3, 0, -10.3, 0.3, 2.2, -9.7, 'fieldstone');
    B.box(-0.15, 1.7, -9.7, 0.15, 1.8, -9.3, 'metalDark', DECO);
    // stands of the weekly market at the edge
    for (const [x, z, c] of [[-13.5, -11, 'canvasRed'], [-13.5, -7.5, 'canvasBlue'], [6, -12.5, 'canvasYellow']]) {
      B.box(x - 0.6, 0, z - 1.0, x + 0.6, 0.95, z + 1.0, 'woodDark');
      B.box(x - 0.9, 2.3, z - 1.25, x + 0.9, 2.36, z + 1.25, c, DECO);
      for (const sx of [-0.55, 0.55]) for (const sz of [-0.95, 0.95]) B.box(x + sx - 0.04, 0, z + sz - 0.04, x + sx + 0.04, 2.3, z + sz + 0.04, 'woodDark', DECO);
    }
    cart(B, -12, -1.6, 'x');

    // ------------------------------------------------------------- the orchard in the west (A main)
    for (const [x, z] of [[-41, -42], [-36, -40], [-31, -42], [-41, -35], [-35.5, -33], [-30, -35], [-40.5, -27], [-34.5, -25.5], [-29.5, -28], [-41, -19], [-36, -17], [-30.5, -20], [-40.4, -10], [-35, -8], [-30, -12], [-41, -1], [-34, 0.5]]) tree(B, x, z, 5, 2.0);
    hedge(B, -38, -22.4, -30.5, -21.4, 1.5); hedge(B, -42.5, -14.6, -36, -13.6, 1.5); hedge(B, -33, -4.6, -27, -3.6, 1.5);
    // the beehives and the tool shed
    for (const z of [-30, -28.6, -27.2]) B.box(-43.4, 0, z - 0.45, -42.6, 0.95, z + 0.45, 'paintYellow');
    B.box(-34, 0, -46, -30, 2.6, -43, 'woodDark'); B.box(-34.3, 2.6, -46.3, -29.7, 2.75, -42.7, 'roofBrown', DECO);
    B.box(-27.5, 0, -6, -26.6, 2.4, -5, 'woodDark'); // a ladder against the wall (to look at)

    // ------------------------------------------------------------- A: the brewery yard (x -40..-26, z 8..24)
    wall(B, -40, 7.4, -26, 8.0, 3.0, 'fieldstone', [[-38, -34]], 'concreteDark');      // south, the way in from the orchard
    wall(B, -26.6, 8.0, -26, 10, 3.0, 'fieldstone', [], 'concreteDark');
    kegStack(B, -38.6, 12, 4); kegStack(B, -29.4, 20.4, 3, 'x');
    for (const [x, z] of [[-35.4, 21.2], [-34.4, 21.8], [-31.2, 9.6]]) keg(B, x, z);
    cart(B, -33.6, 13.2, 'x', 'woodPale');                                               // the beer wagon
    for (let i = 0; i < 3; i++) keg(B, -34.4 + i * 0.9, 13.2, 1.0, true);
    crate(B, -27.6, 9.4, 1.2); crate(B, -27.6, 10.6, 1.0);
    B.box(-39.6, 0, 17, -38.6, 0.8, 20.5, 'fieldstone'); B.box(-39.5, 0.7, 17.1, -38.7, 0.74, 20.4, 'water', DECO);   // the horse trough
    siteLetter(B, 'A', -30.4, 1.55, 8.0, 0, 1, 2.2);

    // ------------------------------------------------------------- B: the nursery (x 18..40, z 8..28)
    wall(B, 18, 7.4, 40, 8.0, 2.4, 'brick', [[28, 33.6]], 'concreteDark');              // south, from the farmyard
    wall(B, 18, 8.0, 18.6, 28, 2.4, 'brick', [[11.8, 16]], 'concreteDark');             // west, from the lane
    wall(B, 18, 27.4, 40, 28, 2.4, 'brick', [[24, 28]], 'concreteDark');                // north, from the church street
    glasshouse(B, 20.4, 18, 25.6, 25.6); glasshouse(B, 31.6, 9.0, 38.4, 14.6, 2.6, ['n']);
    for (const z of [10.5, 13.5]) bed(B, 20.6, z, 26.4, z + 1.4);
    bed(B, 30.6, 19.2, 32, 25.4); bed(B, 33.6, 19.2, 35, 25.4);
    B.geom(new THREE.CylinderGeometry(1.1, 1.1, 2.0, 16), 'metalDark', mtx(29.2, 1.0, 9.4)); B.box(28.25, 0, 8.45, 30.15, 2.0, 10.35, 'metalDark', { visual: false }); // water tank
    for (const [x, z] of [[27.4, 23.2], [36.6, 17.2]]) crate(B, x, z, 1.1);
    cart(B, 22.6, 15.6, 'z', 'woodPale');                                               // a handcart of pots
    siteLetter(B, 'B', 39.97, 2.0, 18.4, -1, 0, 2.6);

    // ------------------------------------------------------------- the back yards between inn, barn and nursery
    for (const [x, z] of [[23, -11], [23, -6.5], [26, -9], [26, -3.6]]) beerTable(B, x, z);
    tree(B, 24.5, -12.4, 9, 3.4); tree(B, 27, -1.4, 8, 3.2);
    for (const [x, z, a] of [[30.6, 4.6, 'x'], [36.4, 2.6, 'z']]) bale(B, x, z, a);
    cart(B, 23.6, 4.4, 'x'); crate(B, 38.6, 6.2, 1.2);
  },

  // the big barn on the farm track (x 28..40, z -14..0): doors south (track), north (farmyard) and west (beer garden),
  // a hay loft along the east wall with a ladder of steps up to it
  barn(B) {
    const x0 = 28, x1 = 40, z0 = -14, z1 = 0, h = 6, t = 0.3, m = 'barnRed';
    wall(B, x0, z0, x1, z0 + t, h, m, [[34, 38]], null);
    wall(B, x0, z1 - t, x1, z1, h, m, [[30, 34]], null);
    wall(B, x0, z0 + t, x0 + t, z1 - t, h, m, [[-8.2, -5.8]], null);
    wall(B, x1 - t, z0 + t, x1, z1 - t, h, m, [], null);
    // the roof: two slopes on a ridge along x, solid so nobody walks in over the walls
    for (const s of [-1, 1]) B.geom(new THREE.BoxGeometry(x1 - x0 + 0.8, 0.2, (z1 - z0) / 2 / Math.cos(0.5) + 0.5), 'roofBrown', mtx((x0 + x1) / 2, h + 1.85, (z0 + z1) / 2 + s * (z1 - z0) / 4, 0, 1, 1, 1, s * 0.5));
    B.box(x0, h, z0, x1, h + 3.6, z1, 'roofBrown', { visual: false });
    // the gable ends (the ridge runs along x): a triangle on each short wall, both faces
    for (const x of [x0 + 0.02, x1 - 0.02]) for (const flip of [false, true]) { const g = new THREE.BufferGeometry(), y = h, yr = h + 3.75, zm = (z0 + z1) / 2; const v = flip ? [x, y, z0, x, yr, zm, x, y, z1] : [x, y, z0, x, y, z1, x, yr, zm]; g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(flip ? [0, 0, (zm - z0) / 1.2, (yr - y) / 1.2, (z1 - z0) / 1.2, 0] : [0, 0, (z1 - z0) / 1.2, 0, (zm - z0) / 1.2, (yr - y) / 1.2], 2)); g.computeVertexNormals(); B.geom(g, m); }
    B.box(x0 + t, -0.02, z0 + t, x1 - t, 0.02, z1 - t, 'woodDark', { collide: false, ao: false });
    // the hay loft: a floor at 3.2 along the east wall, a rail along its edge, steps up at its north end
    const ly = 3.2;
    B.box(35.4, ly - 0.2, z0 + t, x1 - t, ly, z1 - t, 'woodDark');
    railing(B, 35.4, z0 + t, 35.4, -3.6, 1.0, 'woodDark', true, ly);
    stairs(B, 34.6, -0.4, '-z', 1.4, ly, 4.0, 'woodDark');
    B.box(33.8, 0, -4.4, 33.86, ly + 1.0, -0.4, 'woodDark', PLAIN);
    for (const [x, z] of [[37.6, -12], [37.6, -9.6], [37.6, -7.2]]) bale(B, x, z, 'x', ly);
    // inside: bales, the tractor's trailer, a workbench
    for (const [x, z, a, y] of [[30.4, -12, 'x', 0], [30.4, -10.2, 'x', 0], [30.4, -11.1, 'x', 1.45]]) bale(B, x, z, a, y);
    cart(B, 31.6, -4.4, 'z', 'woodDark');
    B.box(37, 0, -2.6, 39.6, 0.95, -1.6, 'woodDark');
    B.pointLight(34, 4.6, -7, 0xffe0b0, 2.2, 14);
  },

  // the inn on the square (x 8..20, z -14..0): the room with the bar below, rooms above, the beer garden behind
  inn(B, out) {
    const K = house(B, out, { r: [8, -14, 20, 0], face: 'W', fl: 2, ext: 'wallCream', front: 6.4, frontType: 'bar', b1: 'kitchen', b2: 'storeroom', doors: [{ room: 'b2', side: 'n', at: 2 }], roof: 'gable', roofMat: 'roofBrown', rise: 3.2, look: look({ shutter: 'shutterRed' }) });
    void K;
    // the sign over the door
    B.box(7.5, 3.0, -7.6, 7.9, 3.06, -6.4, 'woodDark', DECO);
    B.box(7.0, 2.4, -7.3, 7.05, 3.0, -6.7, 'paintYellow', DECO);
  },

  // the brew house north of the yard (x -40..-30, z 24..32) and the malt house on the Brauergasse (x -26..-20, z 10..18):
  // the brew house is entered from the yard and from the church street, the malt house from the alley and from the yard
  brewery(B, out) {
    house(B, out, { r: [-40, 24, -30, 32], face: 'S', fl: 2, ext: 'plasterOchre', front: 4.2, frontType: 'storeroom', b1: 'storeroom', b2: 'kitchen', doors: [{ room: 'b1', side: 'n', at: -2.4 }], roof: 'gable', roofMat: 'rooftile', rise: 3.4, look: look({ shutter: 'shutterRed' }) });
    // copper kettles in front of the brew house
    for (const x of [-38.2, -35.6]) { B.box(x - 0.85, 0, 22.4 - 0.85, x + 0.85, 1.6, 22.4 + 0.85, 'metalYellow', { visual: false }); B.geom(new THREE.CylinderGeometry(0.85, 0.9, 1.6, 16), 'metalYellow', mtx(x, 0.8, 22.4)); B.geom(new THREE.SphereGeometry(0.86, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 'metalYellow', mtx(x, 1.6, 22.4)); }
    house(B, out, { r: [-26, 10, -20, 18], face: 'E', fl: 2, ext: 'plasterWhite', doors: [{ room: 'b1', side: 'n', at: 0 }], roof: 'gable', roofMat: 'roofBrown', rise: 2.6, look: look({ shutter: 'shutterGreen' }) });
  },

  // the sites, and the spawns: attackers on the road in from the fields round (8, -57), defenders on the church
  // square round (-6, 40.5), each within 5 m of its middle (the buy zone is 6 m round it)
  sd: {
    sites: { A: [-33, 0, 16, 5.5], B: [28.6, 0, 17.4, 5.5] },
    attack: [[8, 0, -57, 0], [11.4, 0, -57.2, 0], [4.6, 0, -57.2, 0], [8, 0, -60.4, 0], [8, 0, -53.6, 0], [11.4, 0, -54, 0], [4.6, 0, -54, 0], [11.2, 0, -60.4, 0], [4.8, 0, -60.4, 0], [8, 0, -62.4, 0]],
    defend: [[-6, 0, 40.5, Math.PI], [-9.2, 0, 40.5, Math.PI], [-2.8, 0, 40.6, Math.PI], [-6, 0, 43.6, Math.PI], [-6, 0, 37.6, Math.PI], [-9.2, 0, 37.8, Math.PI], [-2.8, 0, 37.8, Math.PI], [-9.2, 0, 43.4, Math.PI], [-2.8, 0, 43.4, Math.PI], [-10.4, 0, 40.6, Math.PI]],
  },
  spawns() { return { 0: this.sd.attack, 1: this.sd.defend }; },

  hotspots: [
    [-33, 0, 16], [28.6, 0, 17.4], [-4, 0, -6], [8, 0, -38], [0, 0, -27], [-18, 0, 4], [-18, 0, 16], [10, 0, 6], [15, 0, 13],
    [38, 0, -30], [34, 0, -7], [32, 0, 4], [-36, 0, -20], [-36, 0, 4], [-28, 0, 28], [26, 0, 30], [24, 0, -8],
  ],
};

// ---------------------------------------------------------------------------
// The houses: [x0, z0, x1, z1] in the world and the side the front looks to. Sides in `doors` are the house's own:
// 'n' its back, 'w'/'e' its left/right as you look out of its front door
// ---------------------------------------------------------------------------
const F = (o) => ({ roof: 'gable', base: 'fieldstone', look: look(o.look), ...o });
const HOUSES = [
  // --- along the main street, coming in from the fields
  F({ r: [-8, -46, 4, -38], face: 'E', fl: 2, ext: 'plasterWhite', roofMat: 'rooftile' }),
  F({ r: [-14, -38, 4, -30], face: 'E', ext: 'wallCream', roofMat: 'roofBrown', kind: 'shop', awning: ['awningRed', 'paintWhite'], shopWall: 'wallCream', shopFloor: 'tilesCheck' }),
  F({ r: [12, -46, 24, -38], face: 'W', ext: 'plasterOchre', roofMat: 'rooftile' }),
  F({ r: [12, -38, 24, -30], face: 'W', fl: 2, ext: 'plasterWhite', roofMat: 'roofSlate', look: { shutter: 'shutterRed' } }),
  // --- the bend and the way up to the square
  F({ r: [-14, -30, -4, -22], face: 'E', ext: 'plasterRose', roofMat: 'rooftile' }),
  F({ r: [-14, -22, -4, -14], face: 'E', fl: 2, ext: 'wallCream', roofMat: 'roofBrown' }),
  F({ r: [4, -24, 14, -14], face: 'W', fl: 2, ext: 'plasterWhite', roofMat: 'rooftile', kind: 'shop', awning: ['awningGreen', 'paintWhite'], shopWall: 'paintWhite', shopFloor: 'tilesCheck' }),
  F({ r: [12, -30, 24, -24], face: 'W', ext: 'plasterOchre', roofMat: 'roofSlate' }),
  F({ r: [14, -24, 24, -14], face: 'N', ext: 'wallCream', roofMat: 'rooftile', doorAt: 3 }),
  // --- the farm on the track
  F({ r: [24, -46, 34, -36], face: 'E', fl: 2, ext: 'plasterWhite', roofMat: 'roofBrown', look: { shutter: 'shutterRed' } }),
  F({ r: [24, -36, 34, -26], face: 'E', ext: 'wallCream', roofMat: 'roofBrown' }),
  // --- along the orchard (west side), their backs to the village
  F({ r: [-24, -46, -8, -38], face: 'W', fl: 2, ext: 'plasterOchre', roofMat: 'rooftile' }),
  F({ r: [-24, -38, -14, -30], face: 'W', ext: 'plasterWhite', roofMat: 'roofSlate' }),
  F({ r: [-24, -30, -14, -22], face: 'W', ext: 'wallCream', roofMat: 'rooftile' }),
  F({ r: [-24, -22, -14, -14], face: 'W', fl: 2, ext: 'plasterRose', roofMat: 'roofBrown' }),
  // --- round the square
  F({ r: [-26, -14, -16, -2], face: 'E', fl: 2, ext: 'plasterWhite', roofMat: 'rooftile', look: { shutter: 'shutterRed' } }),
  F({ r: [-16, 2, -4, 12], face: 'S', ext: 'wallCream', roofMat: 'roofSlate', kind: 'shop', awning: ['awningBlue', 'paintWhite'], shopWall: 'wallCream', shopFloor: 'tilesCheck' }),
  F({ r: [-4, 2, 8, 12], face: 'S', fl: 2, ext: 'plasterOchre', roofMat: 'rooftile' }),
  // --- along the Brauergasse and the lane (Brauergasse x -20..-16, the lane x 8..12)
  F({ r: [-26, -2, -20, 10], face: 'E', ext: 'plasterRose', roofMat: 'roofBrown', doors: [{ room: 'b1', side: 'n', at: 0 }] }),
  F({ r: [-16, 12, -4, 20], face: 'W', ext: 'plasterWhite', roofMat: 'rooftile' }),
  F({ r: [-4, 12, 8, 20], face: 'E', ext: 'wallCream', roofMat: 'roofSlate' }),
  F({ r: [12, 0, 18, 10], face: 'W', ext: 'plasterOchre', roofMat: 'rooftile' }),
  F({ r: [12, 16, 18, 32], face: 'W', fl: 2, ext: 'plasterRose', roofMat: 'roofBrown' }),
  // --- along the church street
  F({ r: [-26, 18, -16, 32], face: 'N', fl: 2, ext: 'wallCream', roofMat: 'roofSlate' }),
  F({ r: [-16, 20, -4, 32], face: 'N', ext: 'plasterOchre', roofMat: 'rooftile' }),
  F({ r: [-4, 20, 8, 32], face: 'N', fl: 2, ext: 'plasterWhite', roofMat: 'roofBrown' }),
];
