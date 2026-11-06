import * as THREE from 'three';
import { MATERIALS } from '../mapBuilder.js';
import { projectUV } from '../textures.js';
import { mtx, wallX, wallZ, stairs, railing, boundary } from '../props.js';

// =============================================================================
// MILLRACE: a sawmill on a mill brook in a pine forest, early morning. Made for the 2 vs 2 capture mode (and small
// enough for Team Deathmatch). Mirror-symmetric across x = 0: team 0 comes from the west, team 1 from the east.
// The brook runs along the axis, north to south.
//   north:     the saw hall over the brook. Frame saw in the middle, a loft along the north wall, a sharpening
//              shop on each side whose roof leads to a door into the loft.
//   south:     the timber landing over the brook, boxed in by stacks of sawn boards, a crane walkway above it.
//   middle:    a footbridge over the brook, the weir beside it (the flag stands in the brook below it), and the brook
//              bed itself as the low way from the hall to the landing.
//   bases:     forest clearings at the west and east ends, each behind a tall log pile.
// =============================================================================
const CH = 3.0;                  // the brook channel: x -3..3
const BED = -1.2;                // its bed
const MZ0 = -19, MZ1 = -6.5;     // saw hall (A), x -8.5..8.5
const LOFT = 3.0;                // loft in the hall, roof of the sharpening shops
const EAVES = 5.6, RIDGE = 8.4;
const DZ0 = 8, DZ1 = 17.8;       // timber landing over the brook (B)
const WALK = 3.4;                // crane walkway along the south side of the landing
const WEIR = 2.4;                // north face of the weir (far enough from the bridge to step off its sill before the bridge is overhead)
const flat = { ao: false };
const noStand = { visual: false, noBullet: true };   // where whoever stood on top would be inside what is only drawn there: shots pass
const noCol = { collide: false, ao: false };

// a decorative piece moved into place with world-space UVs, so its texture is as big as on the boxes around it
function placed(geo, matrix, tile) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(matrix);
  projectUV(g, tile);
  return g;
}
function water(b, x0, z0, x1, z1, y) {
  const g = placed(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mtx((x0 + x1) / 2, y, (z0 + z1) / 2, 0, 1, 1, 1, -Math.PI / 2), MATERIALS.water.scale);
  b.geom(g, 'water', null, { transparent: true });
}
// the sawn end of a log: a disc showing one of the log ends of the log pile texture
function logEnd(r) {
  const g = new THREE.CircleGeometry(r, 12).toNonIndexed(), p = g.attributes.position.array, n = g.attributes.position.count, uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { uv[i * 2] = 0.5 + p[i * 3] / r * 0.1; uv[i * 2 + 1] = 0.625 + p[i * 3 + 1] / r * 0.1; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
// a round log lying along x or z (only what shows: collision is the caller's)
function log(b, x, y, z, len, r, along = 'x') {
  const ax = along === 'x';
  b.geom(new THREE.CylinderGeometry(r, r * 1.06, len, 9, 1, true), 'barkLog', mtx(x, y, z, 0, 1, 1, 1, ax ? 0 : Math.PI / 2, ax ? Math.PI / 2 : 0));
  const end = logEnd(r);
  for (const s of [-1, 1]) {
    if (ax) b.geom(end, 'logpile', mtx(x + s * len / 2, y, z, s * Math.PI / 2));
    else b.geom(end, 'logpile', mtx(x, y, z + s * len / 2, s > 0 ? 0 : Math.PI));
  }
}
// a pile of logs lying along x or z: sawn ends on two faces, the logs' sides on the others
function logPile(b, x0, z0, x1, z1, h, along = 'x', opts = {}) {
  const ends = along === 'x' ? '+x-x' : '+z-z', sides = along === 'x' ? '+z-z+y' : '+x-x+y';
  b.box(x0, 0, z0, x1, h, z1, 'logpile', { visual: false, ...opts });
  b.box(x0, 0, z0, x1, h, z1, 'logpile', { collide: false, faces: ends });
  b.box(x0, 0, z0, x1, h, z1, along === 'x' ? 'logside' : 'barkLog', { collide: false, faces: sides });
}
// a stack of sawn boards drying on bearers, with a small tin roof
function lumberStack(b, x0, z0, x1, z1, h, roof = true) {
  b.box(x0, 0, z0, x1, 0.25, z1, 'woodDark');
  b.box(x0 + 0.05, 0.25, z0 + 0.05, x1 - 0.05, h, z1 - 0.05, 'lumber');
  if (roof) b.box(x0 - 0.12, h, z0 - 0.12, x1 + 0.12, h + 0.08, z1 + 0.12, 'corrugated', flat);
}
function pine(b, x, z, h = 11) {
  b.geom(new THREE.CylinderGeometry(0.16, 0.32, h * 0.9, 6), 'barkLog', mtx(x, h * 0.45, z));
  for (let i = 0; i < 4; i++) {
    const r = (2.1 - i * 0.42) * (h / 11);
    b.geom(new THREE.ConeGeometry(r, h * 0.32, 7), i % 2 ? 'pine' : 'foliageDark', mtx(x, h * (0.36 + i * 0.16), z, i * 0.7));
  }
}
function lamp(b, x, y, z) {
  b.box(x - 0.02, y, z - 0.02, x + 0.02, y + 0.9, z + 0.02, 'black', noCol);
  b.geom(new THREE.ConeGeometry(0.28, 0.2, 10, 1, true), 'metalDark', mtx(x, y, z));
  b.box(x - 0.08, y - 0.14, z - 0.08, x + 0.08, y - 0.02, z + 0.08, 'lampOn', noCol);
}
// the logging truck, lying along x with the cab at x1: cab, bolsters and a load of long logs
function logTruck(b, x0, x1, z) {
  b.box(x0, 0.5, z - 1.2, x1, 1.15, z + 1.2, 'metalDark');
  b.box(x1 - 2.0, 1.15, z - 1.25, x1, 2.5, z + 1.25, 'carPaintGreen', { pen: 0.4 });
  b.box(x1 - 1.9, 2.5, z - 1.15, x1 - 0.25, 3.2, z + 1.15, 'carPaintGreen', { pen: 0.4 });
  b.box(x1 - 0.25, 2.6, z - 1.1, x1 - 0.22, 3.1, z + 1.1, 'carGlass', noCol);
  const wheel = new THREE.CylinderGeometry(0.52, 0.52, 0.4, 14);
  for (const wx of [x1 - 1.0, x0 + 2.6, x0 + 1.4]) for (const s of [-1, 1]) b.geom(wheel, 'rubber', mtx(wx, 0.52, z + s * 1.05, 0, 1, 1, 1, Math.PI / 2));
  for (const bx of [x1 - 2.6, x0 + 0.5]) {
    b.box(bx - 0.12, 1.15, z - 1.25, bx + 0.12, 1.35, z + 1.25, 'metalDark', flat);
    for (const s of [-1, 1]) b.box(bx - 0.06, 1.35, z + s * 1.18 - 0.06, bx + 0.06, 2.9, z + s * 1.18 + 0.06, 'metalDark', noCol);
  }
  b.box(x0 - 0.6, 1.15, z - 1.1, x1 - 2.3, 2.75, z + 1.1, 'barkLog', { visual: false });
  for (const [lz, ly] of [[-0.75, 1.55], [0, 1.55], [0.75, 1.55], [-0.38, 2.25], [0.38, 2.25]]) log(b, (x0 - 0.6 + x1 - 2.3) / 2, ly, z + lz, x1 - x0 - 1.7, 0.36, 'x');
}

export default {
  id: 'millrace',
  name: 'MILLRACE',
  desc: 'Sägewerk am Mühlbach im Morgennebel: die Sägehalle mit Dachboden, der Holzplatz unter der Kranbrücke und dazwischen Brücke und Wehr. Die Flagge steht unterhalb des Wehrs im Bach; das Bachbett und beide Ufer zählen mit, von der Brücke schießt man hinunter.',
  size: 'Klein',
  // the flag of the 2 vs 2 mode: [x, floor, z, radius]. In the brook below the weir, in the middle of the map: the bed
  // (under the bridge too), the weir and both banks count; the bridge over it is the place to shoot down from (on the
  // bridge itself the bed under it could not be seen from the flag, and bots holding the point would wait there)
  wingman: [[0, BED, 4.5, 5.0]],
  env: {
    sunDir: [0.0, 0.42, 0.9],
    sunColor: 0xffe2b8, sunIntensity: 2.7,
    skyTop: 0x6a98c4, skyHorizon: 0xdadcc6, skyBottom: 0x8c9478,
    cloudColor: 0xfff8ee, clouds: 0.22,
    hemiSky: 0xc8d6d0, groundColor: 0x5e6a4a, ambient: 1.4,
    fogColor: 0xc6ccbc, fogNear: 30, fogFar: 150,
  },
  bounds: { minX: -27, maxX: 27, minZ: -20, maxZ: 21 },
  navTop: 3.45,    // loft and shop roofs (3.0), the crane walkway and the office roofs (3.4) are floors, the log piles (3.5) are not

  build(B) {
    // ------------------------------------------------------------- ground, brook, forest
    B.box(-40, -3, -34, -CH, 0, 34, 'needles');
    B.box(CH, -3, -34, 40, 0, 34, 'needles');
    B.box(-CH, -3, -34, CH, 0, MZ0, 'needles');                       // the brook runs under the hall...
    B.box(-CH, -3, MZ0, CH, 0, MZ1, 'fieldstone', flat);
    B.box(-CH, -3, DZ0, CH, 0, 34, 'fieldstone', flat);               // ...and under the landing
    B.box(-CH, -3, MZ1, CH, BED, DZ0, 'riverbed');
    for (const s of [-1, 1]) B.box(s * (CH - 0.02), BED, MZ1, s * (CH + 0.32), 0.04, DZ0, 'fieldstone', flat); // stone edges
    water(B, -CH, MZ1, CH, WEIR, -0.52);
    water(B, -CH, WEIR + 0.6, CH, DZ0, -0.8);
    B.box(-CH, -1.2, MZ1 - 0.02, CH, -0.35, MZ1 + 0.02, 'black', noCol);   // where the race comes out under the hall
    for (const [x, z, h] of [[-31, -24, 12], [-35, -12, 14], [-30.5, -4, 11], [-34, 5, 13], [-30.5, 13, 12], [-34.5, 22, 14], [-29, 25, 10],
      [-22, -25, 13], [-14, -24, 11], [-6, -26, 14], [-17, 26, 12], [-8, 25.5, 11], [-2, 29, 13], [-26, 29, 12]]) {
      pine(B, x, z, h); pine(B, -x, z + 1.3, h - 1);
    }
    boundary(B, -28, -21, 28, MZ0);
    boundary(B, -28, 20.6, 28, 22);
    boundary(B, -28.5, -21, -27, 22);
    boundary(B, 27, -21, 28.5, 22);

    // ------------------------------------------------------------- A: the saw hall over the brook
    B.box(-8.2, 0, MZ0 + 0.3, 8.2, 0.02, MZ1 - 0.3, 'woodDark', flat);
    B.box(-8.2, LOFT - 0.2, MZ0 + 0.3, 8.2, LOFT, -16.0, 'woodDark');                 // loft along the north wall
    railing(B, -6.8, -16.0, 6.8, -16.0, 1.0, 'woodDark', true, LOFT);
    for (const x of [-4.2, 4.2]) B.box(x - 0.11, 0, -16.11, x + 0.11, LOFT - 0.2, -15.89, 'woodDark');
    B.box(-8.5, EAVES, MZ0, 8.5, 12, MZ1, 'concrete', noStand);                 // nobody on the walls: the roof is only drawn
    // roof: two slopes up to a ridge along x, gable ends in the side walls (half() builds those)
    const zr = (MZ0 + MZ1) / 2, run = MZ1 - zr + 0.45, rise = RIDGE - EAVES + 0.25, len = Math.hypot(run, rise), ang = Math.atan2(rise, run);
    for (const s of [-1, 1]) {
      B.geom(placed(new THREE.BoxGeometry(18.0, 0.22, len), mtx(0, (RIDGE + EAVES - 0.25) / 2 + 0.12, zr + s * run / 2, 0, 1, 1, 1, s * ang), 2), 'shingle');
    }
    B.box(-9, RIDGE - 0.05, zr - 0.2, 9, RIDGE + 0.25, zr + 0.2, 'woodDark', noCol);
    // the frame saw in the middle: log carriage north of it, roller table south of it
    for (const x of [-0.6, 0.6]) B.box(x - 0.05, 0.02, MZ0 + 0.5, x + 0.05, 0.08, MZ1 - 0.5, 'metal', noCol);
    B.box(-1.1, 0, -16.8, 1.1, 0.45, -12.9, 'metalDark');
    B.box(-0.5, 0.45, -16.6, 0.5, 1.3, -13.0, 'barkLog', { visual: false });
    log(B, 0, 0.88, -14.8, 3.6, 0.42, 'z');
    // (one block for the whole saw. Nobody stands on it: up there under the roof is only room to crouch, and the line
    // shaft with its pulleys and belts runs through that room)
    B.box(-1.95, 0, -12.85, 1.95, 3.9, -11.15, 'metalDark', { visual: false, pen: 0.2 });
    B.box(-1.95, 3.9, -12.85, 1.95, EAVES, -11.15, 'metalDark', noStand);
    for (const s of [-1, 1]) {
      B.box(s * 1.5 - 0.22, 0, -12.7, s * 1.5 + 0.22, 3.9, -11.3, 'metalDark', { collide: false });
      B.geom(new THREE.CylinderGeometry(0.85, 0.85, 0.16, 18), 'metalDark', mtx(s * 1.85, 1.3, -12.0, 0, 1, 1, 1, 0, Math.PI / 2));
    }
    B.box(-1.28, 0, -12.6, 1.28, 0.95, -11.4, 'metalDark', { collide: false });
    B.box(-1.28, 3.2, -12.7, 1.28, 3.9, -11.3, 'metalDark', { collide: false });
    B.box(-1.28, 0.95, -12.25, 1.28, 3.2, -11.75, 'metal', { collide: false });             // the blades in their frame
    for (let i = -4; i <= 4; i++) B.box(i * 0.26 - 0.015, 0.95, -12.3, i * 0.26 + 0.015, 3.2, -11.7, 'metalDark', noCol);
    B.box(-1.1, 0, -11.3, 1.1, 0.78, -8.0, 'metalDark');
    for (let z = -11.0; z > -8.2; z -= 0.55) B.geom(new THREE.CylinderGeometry(0.09, 0.09, 2.1, 8), 'metal', mtx(0, 0.8, z, 0, 1, 1, 1, 0, Math.PI / 2));
    B.box(-0.8, 0.82, -10.9, 0.8, 1.06, -8.4, 'lumber');
    // line shaft and belts under the roof
    B.geom(new THREE.CylinderGeometry(0.07, 0.07, 16.4, 8), 'metalDark', mtx(0, 4.9, -12.0, 0, 1, 1, 1, 0, Math.PI / 2));
    for (const x of [-1.85, 1.85]) {
      B.geom(new THREE.CylinderGeometry(0.42, 0.42, 0.22, 16), 'metalDark', mtx(x, 4.9, -12.0, 0, 1, 1, 1, 0, Math.PI / 2));
      B.box(x - 0.08, 1.3, -12.42, x + 0.08, 4.9, -12.36, 'rubber', noCol);
      B.box(x - 0.08, 1.3, -11.64, x + 0.08, 4.9, -11.58, 'rubber', noCol);
    }
    for (const [x, z] of [[-4.2, -12.0], [4.2, -12.0], [-4.2, -8.4], [4.2, -8.4]]) { lamp(B, x, 4.4, z); }
    B.pointLight(-4.2, 4.0, -11, 0xffd8a0, 3.2, 11);
    B.pointLight(4.2, 4.0, -11, 0xffd8a0, 3.2, 11);
    // the water wheel at the south wall
    const wheel = (g, m) => B.geom(g, m.mat, m.at);
    for (const x of [-0.62, 0.62]) wheel(new THREE.TorusGeometry(1.95, 0.08, 6, 26), { mat: 'woodDark', at: mtx(x, 0.4, -4.2, Math.PI / 2) });
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      B.geom(new THREE.BoxGeometry(1.36, 0.06, 0.62), 'woodDark', mtx(0, 0.4 + Math.sin(a) * 1.82, -4.2 + Math.cos(a) * 1.82, 0, 1, 1, 1, -a));
      if (i % 2 === 0) B.geom(new THREE.BoxGeometry(1.2, 0.08, 3.8), 'woodDark', mtx(0, 0.4, -4.2, 0, 1, 1, 1, a));
    }
    B.geom(new THREE.CylinderGeometry(0.16, 0.16, 1.9, 10), 'metalDark', mtx(0, 0.4, -4.2, 0, 1, 1, 1, 0, Math.PI / 2));
    B.box(-0.75, BED, -6.2, 0.75, 2.4, -2.2, 'woodDark', { visual: false, pen: 0.5 });
    // ------------------------------------------------------------- middle: footbridge and weir
    B.box(-3.6, 0.7, -1.6, 3.6, 1.0, 1.6, 'woodDark');
    for (const z of [-1.2, 0, 1.2]) B.box(-3.6, 0.5, z - 0.12, 3.6, 0.7, z + 0.12, 'woodDark', noCol);
    for (const s of [-1, 1]) railing(B, -3.6, s * 1.6, 3.6, s * 1.6, 1.0, 'woodDark', true, 1.0);
    B.box(-CH, BED, WEIR, -0.8, -0.5, WEIR + 0.6, 'fieldstone');
    B.box(0.8, BED, WEIR, CH, -0.5, WEIR + 0.6, 'fieldstone');
    B.box(-0.8, BED, WEIR, 0.8, -0.82, WEIR + 0.6, 'fieldstone');
    for (const s of [-1, 1]) B.box(s * 0.95 - 0.15, -0.5, WEIR + 0.1, s * 0.95 + 0.15, 2.5, WEIR + 0.5, 'woodDark');
    B.box(-1.1, 2.2, WEIR + 0.08, 1.1, 2.5, WEIR + 0.52, 'woodDark');
    B.geom(new THREE.TorusGeometry(0.42, 0.05, 6, 18), 'metalRed', mtx(0, 2.95, WEIR + 0.3));
    B.box(-0.04, 2.5, WEIR + 0.26, 0.04, 2.95, WEIR + 0.34, 'metalDark', noCol);
    B.geom(placed(new THREE.PlaneGeometry(1.6, 0.7), mtx(0, -0.68, WEIR + 0.85, 0, 1, 1, 1, -Math.PI / 2 + 0.5), 1), 'water', null, { transparent: true });
    // ------------------------------------------------------------- B: the timber landing
    B.box(-CH, 0, DZ0, CH, 0.025, DZ1, 'woodPale', flat);
    for (let z = DZ0 + 0.6; z < DZ1; z += 1.8) B.box(-CH, 0.025, z - 0.05, CH, 0.04, z + 0.05, 'woodDark', noCol);
    stairs(B, 0, DZ0 - 2.0, '+z', 2.4, 1.2, 2.0, 'woodDark', BED);
    B.box(-1.0, 0, 11.7, 1.0, 0.5, 13.5, 'metalDark', { collide: false });
    B.box(-1.6, 0, 11.7, 1.6, 1.38, 13.5, 'barkLog', { visual: false });       // one block, no ledge on the bogie
    log(B, 0, 0.94, 12.6, 3.2, 0.44, 'x');
    for (const x of [-0.75, 0.75]) for (const z of [11.8, 13.4]) B.geom(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 10), 'rubber', mtx(x, 0.22, z, 0, 1, 1, 1, 0, Math.PI / 2));
    // crane walkway along the south side, the planing shed behind it
    B.box(-8.6, WALK - 0.15, 15.8, 8.6, WALK, DZ1, 'grate');
    railing(B, -8.6, 15.8, 8.6, 15.8, 1.0, 'metalYellow', true, WALK);
    for (const x of [-8.5, -3.1, 3.1, 8.5]) B.box(x - 0.1, 0, 15.85, x + 0.1, WALK - 0.15, 16.05, 'metalYellow');
    B.box(-10, 0, DZ1, 10, 6.6, 21, 'barnGrey');
    B.box(-10.4, 6.6, DZ1 - 0.4, 10.4, 7.0, 21, 'roofSlate', noCol);
    B.box(-10, 6.6, DZ1, 10, 7.0, 21, 'roofSlate', { visual: false });   // (solid up to the top of its roof: out of reach from the walkway and the office roofs)
    B.box(-3.2, 0, DZ1 - 0.04, 3.2, 3.0, DZ1, 'woodDark', noCol);                         // big shed door
    for (const x of [-3.2, -1.6, 0, 1.6, 3.2]) B.box(x - 0.05, 0, DZ1 - 0.08, x + 0.05, 3.0, DZ1 - 0.02, 'metalDark', noCol);
    for (const x of [-6.6, 6.6]) B.box(x - 0.8, 4.2, DZ1 - 0.04, x + 0.8, 5.4, DZ1, 'black', noCol);
    for (const s of [-1, 1]) B.box(s * 9.3 - 0.2, 0, 13.6, s * 9.3 + 0.2, 6.4, 14.0, 'metalYellow');   // crane portal
    B.box(-9.5, 6.0, 13.5, 9.5, 6.5, 14.1, 'metalYellow', flat);
    B.box(-0.35, 5.6, 13.45, 0.35, 6.0, 14.15, 'metalDark', noCol);
    B.box(-0.02, 3.4, 13.78, 0.02, 5.6, 13.82, 'black', noCol);
    B.geom(new THREE.TorusGeometry(0.16, 0.04, 5, 10, Math.PI * 1.4), 'metalDark', mtx(0, 3.25, 13.8));
    B.pointLight(0, 5.0, 12.5, 0xffe0b0, 2.0, 10);

    for (const b of [B, B.mirrored()]) this.half(b);
  },

  // the west half (team 0); the east half is its mirror image
  half(b) {
    // ------------------------------------------------------------- the saw hall: walls, gable, doors
    // the west wall: two doors one over the other at z -17.5 (into the shop, and out of the loft onto its roof)
    wallZ(b, MZ0, -18.3, -8.35, 0, EAVES, 0.3, 'barnRed');
    b.box(-8.5, 2.3, -18.3, -8.2, LOFT, -16.7, 'barnRed');
    b.box(-8.5, LOFT + 2.1, -18.3, -8.2, EAVES, -16.7, 'barnRed');
    wallZ(b, -16.7, MZ1, -8.35, 0, EAVES, 0.3, 'barnRed', [{ c: -11.5, w: 1.4, y: 3.6, h: 1.0 }]);
    wallZ(b, MZ0, MZ1, -8.35, 0, 1.0, 0.36, 'fieldstone', [{ c: -17.5, w: 1.6, y: 0, h: 2.3 }], noCol);
    const hallS = [{ c: -5.0, w: 1.6, y: 0, h: 2.3 }, { c: -2.6, w: 1.2, y: 1.3, h: 1.0 }];
    wallX(b, -8.5, 0, MZ1 - 0.15, 0, EAVES, 0.3, 'barnRed', hallS);
    wallX(b, -8.5, 0, MZ1 - 0.15, 0, 1.0, 0.36, 'fieldstone', [hallS[0]], noCol);
    wallX(b, -8.5, 0, MZ0 + 0.15, 0, EAVES, 0.3, 'barnRed');
    wallX(b, -8.5, 0, MZ0 + 0.15, 0, 1.0, 0.36, 'fieldstone', [], noCol);
    for (const x of [-5.6, -2.0]) { // windows of the north wall, up at the loft (shown, not open)
      b.box(x - 0.7, 3.7, MZ0 + 0.29, x + 0.7, 4.8, MZ0 + 0.31, 'black', noCol);
      b.box(x - 0.78, 3.62, MZ0 + 0.28, x + 0.78, 4.88, MZ0 + 0.3, 'trimWhite', noCol);
    }
    for (const [z, y, w, h] of [[-17.5, 0, 1.6, 2.3], [-17.5, LOFT, 1.6, 2.1]]) { // door trims on the outside
      b.box(-8.56, y + h, z - w / 2 - 0.1, -8.5, y + h + 0.1, z + w / 2 + 0.1, 'trimWhite', noCol);
      for (const s of [-1, 1]) b.box(-8.56, y, z + s * (w / 2 + 0.05) - 0.05, -8.5, y + h, z + s * (w / 2 + 0.05) + 0.05, 'trimWhite', noCol);
    }
    b.box(-5.0 - 0.9, 2.3, MZ1 - 0.01, -5.0 + 0.9, 2.4, MZ1 + 0.05, 'trimWhite', noCol);
    b.box(-2.6 - 0.7, 1.22, MZ1 - 0.01, -2.6 + 0.7, 1.3, MZ1 + 0.1, 'trimWhite', noCol);
    const gable = new THREE.Shape();
    gable.moveTo(-0.45, 0); gable.lineTo(MZ1 - MZ0 + 0.45, 0); gable.lineTo((MZ1 - MZ0) / 2, RIDGE - EAVES + 0.12); gable.closePath();
    b.geom(placed(new THREE.ExtrudeGeometry(gable, { depth: 0.3, bevelEnabled: false }), mtx(-8.5, EAVES, MZ1, Math.PI / 2), 1.2), 'barnRed');
    // inside: the stair to the loft along the west wall, a workbench and stacked boards by the south door
    stairs(b, -7.5, -10.0, '-z', 1.4, LOFT, 6.0, 'woodDark');
    b.box(-8.2, 0, -9.6, -7.4, 0.9, -7.6, 'woodDark');
    lumberStack(b, -6.6, -9.4, -4.8, -8.2, 1.2, false);
    b.geom(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10), 'metalRed', mtx(-5.6, 0.45, -18.2));
    b.box(-5.9, 0, -18.5, -5.3, 0.9, -17.9, 'metalRed', { visual: false });

    // ------------------------------------------------------------- the sharpening shop and the stair to its roof
    wallZ(b, MZ0, -13, -12.375, 0, LOFT - 0.25, 0.25, 'barnRed');
    wallX(b, -12.5, -8.5, -13.125, 0, LOFT - 0.25, 0.25, 'barnRed', [{ c: -10.6, w: 1.6, y: 0, h: 2.3 }]);
    wallX(b, -12.5, -8.5, MZ0 + 0.125, 0, LOFT - 0.25, 0.25, 'barnRed');
    b.box(-12.5, LOFT - 0.25, MZ0, -8.5, LOFT, -13, 'woodDark');
    b.box(-12.6, LOFT - 0.32, -13.1, -8.5, LOFT - 0.22, -12.95, 'trimWhite', noCol);
    b.box(-12.25, 0, -18.75, -10.6, 0.9, -17.9, 'woodDark');                                     // grinding bench
    b.geom(new THREE.CylinderGeometry(0.36, 0.36, 0.12, 16), 'concrete', mtx(-11.4, 1.28, -18.3, 0, 1, 1, 1, 0, Math.PI / 2));
    for (const z of [-17.4, -15.9, -14.4]) b.geom(new THREE.CylinderGeometry(0.5, 0.5, 0.02, 20), 'metal', mtx(-12.23, 1.7, z, 0, 1, 1, 1, 0, Math.PI / 2));
    b.box(-9.4, 0, -14.4, -8.7, 1.1, -13.4, 'metalDark');                                         // stove
    b.pointLight(-10.5, 2.4, -16, 0xffcf90, 1.6, 6);
    stairs(b, -13.2, -11.8, '-z', 1.4, LOFT, 6.0, 'woodDark');
    b.box(-13.9, LOFT - 0.2, MZ0, -12.5, LOFT, -17.8, 'woodDark');
    for (const [x, z] of [[-13.8, -18.9], [-12.6, -18.9]]) b.box(x - 0.1, 0, z - 0.1, x + 0.1, LOFT - 0.2, z + 0.1, 'woodDark');
    railing(b, -13.9, -17.8, -13.9, MZ0, 1.0, 'woodDark', true, LOFT);
    // ------------------------------------------------------------- north lane: low pile, saw horses
    logPile(b, -17.0, -12.4, -15.2, -10.2, 1.25, 'x');
    b.box(-14.9, 0, -11.6, -13.1, 1.3, -9.0, 'woodDark', { visual: false });                         // a log on two saw horses
    for (const z of [-11.2, -9.4]) {
      for (const x of [-14.7, -13.3]) b.box(x - 0.05, 0, z - 0.05, x + 0.05, 0.8, z + 0.05, 'woodDark', noCol);
      b.box(-14.85, 0.78, z - 0.06, -13.15, 0.86, z + 0.06, 'woodDark', noCol);
    }
    log(b, -14.0, 1.08, -10.3, 2.6, 0.22, 'z');
    lamp(b, -8.7, 2.6, -9.0);

    // ------------------------------------------------------------- the brook side: steps down, the bridge stair
    stairs(b, -2.4, MZ1 + 2.5, '-z', 1.2, 1.2, 2.4, 'fieldstone', BED);   // up out of the bed against the hall wall...
    stairs(b, -2.4, DZ0 - 2.5, '+z', 1.2, 1.2, 2.4, 'fieldstone', BED);   // ...and up onto the landing
    stairs(b, -5.6, 0, '+x', 3.2, 1.0, 2.0, 'woodDark');
    b.box(-6.0, 0, 2.6, -5.0, 0.012, 7.4, 'gravel', flat);
    // ------------------------------------------------------------- middle yard: log trailer, sawdust heap, saw bench
    b.box(-14.2, 0.55, -4.4, -8.2, 0.85, -2.8, 'metalDark');
    b.box(-14.2, 0, -4.4, -8.2, 1.7, -2.8, 'barkLog', { visual: false });
    for (const [z, y] of [[-3.9, 1.15], [-3.3, 1.15], [-3.6, 1.6]]) log(b, -11.2, y, z, 6.4, 0.3, 'x');
    for (const x of [-13.6, -8.8]) for (const s of [-1, 1]) b.box(x - 0.06, 0.85, -3.6 + s * 0.85 - 0.06, x + 0.06, 2.0, -3.6 + s * 0.85 + 0.06, 'metalDark', noCol);
    for (const x of [-13.0, -9.4]) for (const z of [-4.5, -2.7]) b.geom(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 14), 'rubber', mtx(x, 0.45, z, 0, 1, 1, 1, Math.PI / 2));
    b.box(-8.2, 0.7, -3.7, -6.6, 0.8, -3.5, 'metalDark', noCol);
    b.box(-14.8, 0, 1.6, -11.2, 0.7, 5.2, 'sawdust');
    b.box(-14.0, 0.7, 2.4, -12.0, 1.4, 4.4, 'sawdust');
    b.geom(placed(new THREE.ConeGeometry(1.3, 0.5, 9), mtx(-13.0, 1.65, 3.4), 3), 'sawdust');
    b.box(-13.5, 1.4, 2.9, -12.5, 1.7, 3.9, 'sawdust', { visual: false });                           // (its tip: a step, not a mound you sink into)
    b.box(-7.6, 0, 2.2, -5.8, 0.9, 3.0, 'woodDark');
    b.geom(new THREE.CylinderGeometry(0.42, 0.42, 0.02, 20), 'metal', mtx(-6.7, 0.95, 2.6, 0, 1, 1, 1, Math.PI / 2));
    logPile(b, -7.6, 3.4, -5.6, 4.6, 1.2, 'z');

    // ------------------------------------------------------------- south: the lumber yard and the walkway stair
    lumberStack(b, -8.2, DZ0, -6.6, 12.0, 2.2);
    lumberStack(b, -8.2, 14.0, -6.6, 16.0, 2.2);
    logPile(b, -6.6, 7.4, -4.2, 8.0, 0.9, 'x');
    lumberStack(b, -3.4, 9.2, -2.2, 10.8, 1.3, false);
    lumberStack(b, -15.8, 8.6, -11.2, 10.4, 2.0);
    lumberStack(b, -15.8, 12.6, -11.2, 14.4, 2.4);
    stairs(b, -13.4, 16.9, '+x', 1.8, WALK, 4.8, 'metalDark');
    b.box(-16.6, 0, DZ1, -10, 3.1, 21, 'barnRed');                                                // office
    b.box(-17.0, 3.1, DZ1 - 0.4, -10, 3.4, 21, 'roofSlate', noCol);
    b.box(-16.6, 3.1, DZ1, -10, 3.4, 21, 'roofSlate', { visual: false });                          // (its roof to stand on: low enough that the planing shed's stays out of reach)
    b.box(-15.6, 1.2, DZ1 - 0.04, -14.2, 2.3, DZ1, 'black', noCol);
    b.box(-15.7, 1.12, DZ1 - 0.06, -14.1, 1.2, DZ1, 'trimWhite', noCol);
    b.pointLight(-14.9, 1.8, DZ1 - 0.5, 0xffd8a0, 1.2, 5);
    b.box(-6.0, 0, 9.0, -4.6, 0.012, 16.0, 'gravel', flat);
    b.box(-11.0, 0, 7.6, -8.4, 0.012, 16.0, 'gravel', flat);

    // ------------------------------------------------------------- the base: a clearing boxed in by log piles on three
    // sides (the way out is at its outer corners, so nobody looks in on the spawns from the lanes), truck and hut
    b.box(-26.5, 0, -20, -20.4, 0.012, 21, 'gravel', flat);
    logPile(b, -19.2, -8.0, -16.4, 8.0, 3.5, 'x');
    for (const s of [-1, 1]) logPile(b, -24.2, s > 0 ? 8.0 : -9.6, -19.2, s > 0 ? 9.6 : -8.0, 3.5, 'z');
    for (const [z, y, l] of [[-6.6, 3.82, 3.2], [-3.1, 3.8, 3.4], [0.6, 3.84, 3.1], [4.4, 3.8, 3.3], [7.2, 3.82, 3.0]]) log(b, -17.8, y, z, l, 0.34, 'x');
    for (const s of [-1, 1]) for (const [x, y] of [[-23.4, 3.82], [-21.0, 3.8]]) log(b, x, y, s * 8.8, 1.6, 0.34, 'z');
    logTruck(b, -26.6, -17.4, -17.6);
    b.box(-26.6, 0, 12.4, -21.6, 3.0, 18.2, 'barnGrey');                                         // woodcutters' hut
    const hut = new THREE.Shape();
    hut.moveTo(-0.4, 0); hut.lineTo(5.8 + 0.4, 0); hut.lineTo(2.9, 1.9); hut.closePath();
    b.geom(placed(new THREE.ExtrudeGeometry(hut, { depth: 5.4, bevelEnabled: false }), mtx(-26.8, 3.0, 18.2, Math.PI / 2), 2), 'shingle');
    // under the shingles the roof in steps (ridge at z 15.3, 4.9 high), so whoever climbs up stands on it, not in it
    for (let k = 0; k < 5; k++) {
      const top = 3.23 + k * 0.37, d = (4.9 - top) / 0.576;
      b.box(-26.6, k ? top - 0.37 : 3.0, 15.3 - d, -21.6, top, 15.3 + d, 'shingle', { visual: false });
    }
    b.box(-21.62, 0, 14.6, -21.58, 2.1, 15.6, 'woodDark', noCol);
    b.box(-21.62, 1.2, 16.4, -21.58, 2.0, 17.4, 'black', noCol);
    logPile(b, -23.0, 5.0, -21.0, 6.6, 1.3, 'z');                                                   // firewood
    b.pointLight(-21.4, 2.4, 15.1, 0xffcf90, 1.4, 6);
  },

  spawns() {
    const west = [[-25.0, 0, -4.4], [-22.0, 0, -2.6], [-25.2, 0, 0.0], [-22.0, 0, 2.6], [-25.0, 0, 4.4], [-21.0, 0, 0.0]];
    return { 0: west.map(([x, y, z]) => [x, y, z, -Math.PI / 2]), 1: west.map(([x, y, z]) => [-x, y, z, Math.PI / 2]) };
  },

  hotspots: [
    [-4.6, 0, -12.6], [4.6, 0, -12.6], [0, 0, -17.5], [-4, LOFT, -17.4], [4, LOFT, -17.4], [-4, 0, -8], [4, 0, -8],
    [-4.2, 0, 12.6], [4.2, 0, 12.6], [0, 0, 10.2], [0, 0, 15.2], [-4, WALK, 16.8], [4, WALK, 16.8],
    [0, 1.0, 0], [0, BED, -2.5], [0, BED, 5], [-9, 0, 0], [9, 0, 0], [-13, 1.4, 3.4], [13, 1.4, 3.4],
    [-12.5, 0, -8.6], [12.5, 0, -8.6], [-10.5, LOFT, -15.5], [10.5, LOFT, -15.5], [-10, 0, 11.5], [10, 0, 11.5],
  ],
};
