import * as THREE from 'three';
import { projectUV } from '../textures.js';
import { mtx, wallX, wallZ, stairs, railing, boundary } from '../props.js';

// =============================================================================
// CORNICE: the top station of a cable car and a mountain hut on a snowy saddle, at sunset. Made for the 2 vs 2
// capture mode (and small enough for Team Deathmatch). Mirror-symmetric across x = 0: team 0 comes from the west,
// team 1 from the east, each out of a snowcat garage whose doors are at its outer corners.
//   A (north, up on the platform deck of the station): the gondola stands in the middle and can be walked through.
//      The ways up: the stair from the ski depot underneath, or the outside stair to the deck door.
//   B (south, in the hut): the parlour with its tiled stove; in front of it the terrace, over that the balcony.
//   middle: the summit rock with its cross, climbable from every side; a T-bar station on each side.
// =============================================================================
const DECK = 3.0;                // platform deck of the station (A)
const SZ0 = -20, SZ1 = -8;       // station, x -8.8..8.8
const ROOF = 6.6;                // its flat roof
const HZ0 = 9, HZ1 = 19;         // hut, x -8..8
const HUT = 0.44;                // floor of the hut and its terrace: one step up from the snow
const BAL = 3.2;                 // balcony over the terrace
const flat = { ao: false };
const noCol = { collide: false, ao: false };
const hidden = { visual: false };

function placed(geo, matrix, tile) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(matrix);
  projectUV(g, tile);
  return g;
}
// a thin layer of snow on whatever is below, a little bigger than it
function snowCap(b, x0, z0, x1, z1, y, t = 0.12) { b.box(x0 - 0.04, y, z0 - 0.04, x1 + 0.04, y + t, z1 + 0.04, 'snow', noCol); }
// a far mountain: a lopsided rock cone with snow over its upper part
function peak(b, x, z, r, h, sx = 1, sz = 1) {
  const rot = x * 0.013 + z * 0.007, y0 = -55;
  h *= 0.7;
  b.geom(placed(new THREE.ConeGeometry(r, h, 8), mtx(x, h / 2 + y0, z, rot, sx, 1, sz), 18), 'rockDark');
  b.geom(placed(new THREE.ConeGeometry(r * 0.5, h * 0.5, 8), mtx(x, h * 0.75 + y0 + 0.5, z, rot, sx * 1.01, 1, sz * 1.01), 12), 'snow');
}
function pine(b, x, z, h = 9) {
  b.geom(new THREE.CylinderGeometry(0.14, 0.26, h * 0.8, 6), 'barkLog', mtx(x, h * 0.4, z));
  for (let i = 0; i < 4; i++) {
    const r = (1.7 - i * 0.34) * (h / 9), y = h * (0.34 + i * 0.16);
    b.geom(new THREE.ConeGeometry(r, h * 0.3, 7), 'pine', mtx(x, y, z, i * 0.7));
    b.geom(new THREE.ConeGeometry(r * 0.8, h * 0.12, 7), 'snow', mtx(x, y + h * 0.05, z, i * 0.7));
  }
}
// a snowcat lying along x with the cab at x1 (box-built: tracks, body, cab, blade)
function snowcat(b, x0, x1, z, paint = 'gondolaRed') {
  for (const s of [-1, 1]) b.box(x0 + 0.3, 0, z + s * 1.2 - 0.45, x1 - 0.6, 0.9, z + s * 1.2 + 0.45, 'rubber');
  b.box(x0, 0.5, z - 1.25, x1 - 0.4, 1.6, z + 1.25, paint, { pen: 0.4 });
  b.box(x1 - 2.6, 1.6, z - 1.1, x1 - 0.6, 2.9, z + 1.1, paint, { pen: 0.4 });
  b.box(x1 - 0.62, 1.8, z - 1.0, x1 - 0.58, 2.7, z + 1.0, 'carGlass', noCol);
  for (const s of [-1, 1]) b.box(x1 - 2.4, 1.85, z + s * 1.12 - 0.02, x1 - 0.8, 2.6, z + s * 1.12 + 0.02, 'carGlass', noCol);
  b.box(x1 - 0.4, 0.15, z - 1.7, x1 + 0.1, 1.2, z + 1.7, 'metalYellow');
  b.box(x0 - 0.3, 1.2, z - 0.6, x0, 1.5, z + 0.6, 'metalDark', noCol);
  b.box(x1 - 2.6, 2.9, z - 1.1, x1 - 0.6, 9, z + 1.1, 'concrete', hidden);
}
function table(b, x, z, y, along = 'x') {
  const hx = along === 'x' ? 0.9 : 0.45, hz = along === 'x' ? 0.45 : 0.9;
  b.box(x - hx, y + 0.7, z - hz, x + hx, y + 0.76, z + hz, 'pinewood');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(x + sx * (hx - 0.1) - 0.04, y, z + sz * (hz - 0.1) - 0.04, x + sx * (hx - 0.1) + 0.04, y + 0.7, z + sz * (hz - 0.1) + 0.04, 'woodDark', noCol);
  b.box(x - hx, y, z - hz, x + hx, y + 0.76, z + hz, 'pinewood', hidden);
  for (const s of [-1, 1]) {
    if (along === 'x') b.box(x - hx, y, z + s * (hz + 0.35) - 0.17, x + hx, y + 0.45, z + s * (hz + 0.35) + 0.17, 'pinewood');
    else b.box(x + s * (hx + 0.35) - 0.17, y, z - hz, x + s * (hx + 0.35) + 0.17, y + 0.45, z + hz, 'pinewood');
  }
}
function tube(b, x0, x1, y, z) { b.box(x0, y - 0.06, z - 0.08, x1, y, z + 0.08, 'lampOn', noCol); }

export default {
  id: 'cornice',
  name: 'CORNICE',
  desc: 'Bergstation im Schnee bei Abendrot. A oben auf dem Gondeldeck, erreichbar über das Skidepot darunter oder die Außentreppe. B in der Hüttenstube am Kachelofen, mit Terrasse und Balkon. In der Mitte der Gipfelfels mit Kreuz.',
  size: 'Klein',
  // capture points of the 2 vs 2 mode: floor height of each centre (radius 3.5 by default)
  wingman: [[0, DECK, -13], [0, HUT, 13.6]],
  env: {
    sunDir: [0.0, 0.3, 0.95],
    sunColor: 0xffc49a, sunIntensity: 2.3,
    skyTop: 0x34508a, skyHorizon: 0xf2b498, skyBottom: 0xb8b4cc,
    cloudColor: 0xffd8c8, clouds: 0.2,
    hemiSky: 0xb8c8e8, groundColor: 0xc8ccd8, ambient: 1.3,
    fogColor: 0xd4c8d4, fogNear: 45, fogFar: 420,
  },
  bounds: { minX: -26, maxX: 26, minZ: -20.5, maxZ: 19.5 },
  navTop: 3.45,    // the deck (3.0) and the balcony (3.2) are floors, the garage and hut roofs are not

  build(B) {
    // ------------------------------------------------------------- snow, the drop beyond the edges, mountains
    B.box(-60, -3, -24, 60, 0, 24, 'snow');
    B.box(-60, -40, 24, 60, 0, 30, 'rockDark', flat);                    // the slope falls away to the south...
    B.geom(placed(new THREE.BoxGeometry(120, 0.5, 80), mtx(0, -18, 54, 0, 1, 1, 1, 0.42), 6), 'snow');
    for (const [x, z, r, h, sx, sz] of [[-230, -190, 70, 125, 1.3, 0.8], [-110, -260, 80, 150, 1, 0.7], [20, -280, 70, 170, 1.4, 0.8],
      [140, -240, 75, 135, 1.1, 0.9], [250, -150, 70, 115, 0.8, 1.3], [290, 0, 60, 95, 0.9, 1.5], [250, 160, 80, 120, 1.2, 0.9],
      [110, 270, 90, 140, 1.4, 0.8], [-40, 300, 85, 160, 1.2, 1], [-170, 240, 85, 130, 1, 1.2], [-280, 110, 70, 115, 0.9, 1.4],
      [-300, -40, 60, 105, 0.8, 1.2], [-60, -330, 60, 120, 1.6, 0.7], [200, -300, 60, 140, 1, 1]]) peak(B, x, z, r, h, sx, sz);
    for (const [x, z, h] of [[-28, 23, 8], [-22, 25, 9], [-14, 24, 7], [-6, 26, 9], [7, 25, 8], [15, 24, 9], [23, 25, 7], [29, 22, 8]]) pine(B, x, z, h);
    boundary(B, -27.5, -22, 27.5, SZ0 - 0.5);
    boundary(B, -27.5, 19.5, 27.5, 22);
    boundary(B, -27.5, -22, -26, 22);
    boundary(B, 26, -22, 27.5, 22);
    for (let x = -25; x <= 25; x += 2.5) B.box(x - 0.05, 0, 19.35, x + 0.05, 1.1, 19.45, 'woodDark', noCol);   // fence at the edge
    for (const y of [0.55, 1.05]) B.box(-26, y - 0.04, 19.36, 26, y, 19.44, 'woodDark', noCol);

    // ------------------------------------------------------------- A: the station (shared middle pieces)
    B.box(-8.4, 0, SZ0 + 0.4, 8.4, 0.02, SZ1 - 0.4, 'concreteFloor', flat);
    B.box(-8.8, ROOF, SZ0, 8.8, ROOF + 0.35, SZ1, 'concreteWhite');
    B.box(-8.8, ROOF + 0.35, SZ0, 8.8, 14, SZ1, 'concrete', hidden);
    snowCap(B, -8.8, SZ0, 8.8, SZ1, ROOF + 0.35, 0.2);
    B.box(-5.0, DECK - 0.2, SZ0 + 0.4, 5.0, DECK, SZ1 - 0.4, 'concreteWhite');
    // the gondola: walk in on one side, out on the other
    const F = DECK + 0.35, R = F + 2.3;
    B.box(-1.3, DECK, -15.2, 1.3, F, -10.8, 'gondolaRed');
    for (const z of [-15.2, -10.88]) B.box(-1.3, F, z, 1.3, R, z + 0.08, 'gondolaRed', { pen: 0.6 });
    for (const s of [-1, 1]) {
      const x0 = s > 0 ? 1.22 : -1.3, x1 = x0 + 0.08;
      B.box(x0, F, -15.2, x1, R, -13.8, 'gondolaRed', { pen: 0.6 });
      B.box(x0, F, -12.2, x1, R, -10.8, 'gondolaRed', { pen: 0.6 });
      B.box(x0, F + 2.1, -13.8, x1, R, -12.2, 'gondolaRed', { pen: 0.6 });
      for (const [z0, z1] of [[-15.0, -14.0], [-12.0, -11.0]]) B.box(x0 - 0.01, F + 1.1, z0, x1 + 0.01, F + 2.0, z1, 'carGlass', noCol);
    }
    for (const z of [-15.21, -10.79]) B.box(-1.0, F + 1.1, z - 0.01, 1.0, F + 2.0, z + 0.01, 'carGlass', noCol);
    for (const s of [-1, 1]) B.box(s * 0.09, R, -15.25, s * 1.35, R + 0.16, -10.75, 'metalDark');   // (the flag pole goes up the slot)
    B.box(-0.08, R + 0.16, -13.1, 0.08, 6.0, -12.9, 'metalDark', noCol);
    B.box(-0.15, 6.0, SZ0 + 0.4, 0.15, 6.3, SZ1 - 0.4, 'metalDark', noCol);                           // the rail
    B.box(-0.6, 5.9, -13.6, 0.6, 6.0, -12.4, 'metalDark', noCol);
    B.box(-0.9, F + 0.02, -13.0, -0.6, F + 0.45, -11.4, 'woodDark', noCol);                            // seats inside
    B.box(0.6, F + 0.02, -14.6, 0.9, F + 0.45, -13.0, 'woodDark', noCol);
    // the drive at the north end and the bull wheel over it, cables out through the wall
    B.box(-3.0, DECK, SZ0 + 0.4, 3.0, DECK + 2.2, -17.4, 'metalDark', { pen: 0.2 });
    B.box(-3.0, DECK + 2.2, SZ0 + 0.4, 3.0, ROOF, -17.4, 'concrete', hidden);                         // no crouching on the drive
    B.box(-2.4, DECK + 2.2, -19.4, 2.4, DECK + 2.5, -17.8, 'metalYellow', noCol);
    B.geom(new THREE.CylinderGeometry(2.6, 2.6, 0.22, 28, 1, true), 'metalDark', mtx(0, 5.9, -17.0));
    for (let i = 0; i < 8; i++) B.geom(new THREE.BoxGeometry(5.0, 0.08, 0.12), 'metalDark', mtx(0, 5.9, -17.0, i * Math.PI / 8));
    for (const x of [-2.55, 2.55]) {                                                                   // the cables, down into the haze
      B.geom(new THREE.CylinderGeometry(0.035, 0.035, 160, 5), 'black', mtx(x, -10, -96.0, 0, 1, 1, 1, Math.PI / 2 + 0.2));
    }
    for (const x of [-4.2, 4.2]) for (const z of [-17.5, -10.4]) tube(B, x - 0.8, x + 0.8, ROOF - 0.05, z);
    B.pointLight(0, 5.2, -10.5, 0xfff0d8, 3.0, 12);
    B.pointLight(0, 2.5, -14, 0xe8f0ff, 2.4, 11);
    for (const z of [-17.6, -11.4]) tube(B, -5, 5, 2.75, z);

    // ------------------------------------------------------------- middle: the summit rock and its cross
    B.box(-4.2, 0, -3.4, 4.2, 0.7, 1.0, 'rock');
    B.box(-3.4, 0, -4.4, 3.4, 0.7, 2.0, 'rock');
    B.box(-2.8, 0.7, -3.4, 2.8, 1.4, 0.8, 'rock');
    B.box(-1.5, 1.4, -2.6, 1.5, 2.1, 0.2, 'rock');
    for (const [x0, z0, x1, z1, y] of [[-4.2, -3.4, 4.2, 1.0, 0.7], [-3.4, -4.4, 3.4, 2.0, 0.7], [-2.8, -3.4, 2.8, 0.8, 1.4], [-1.5, -2.6, 1.5, 0.2, 2.1]]) snowCap(B, x0, z0, x1, z1, y, 0.04);
    for (const [x, z, s, r] of [[-4.6, -1.2, 0.9, 0.3], [4.4, 0.6, 0.8, 1.1], [-1.2, -4.9, 0.7, 2.0], [1.8, 2.3, 0.75, 0.7], [-3.1, 2.1, 0.6, 1.6], [3.5, -3.9, 0.7, 2.4]]) {
      B.geom(placed(new THREE.DodecahedronGeometry(s, 0), mtx(x, s * 0.45, z, r, 1, 0.7, 1), 3), 'rock');
      B.box(x - s * 0.62, 0, z - s * 0.62, x + s * 0.62, s * 0.75, z + s * 0.62, 'rock', hidden);
    }
    B.box(-0.11, 2.1, -1.31, 0.11, 5.4, -1.09, 'woodDark');
    B.box(-0.85, 4.3, -1.29, 0.85, 4.48, -1.11, 'woodDark', noCol);
    B.geom(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 12), 'metalYellow', mtx(0, 4.39, -1.08, 0, 1, 1, 1, Math.PI / 2));

    // ------------------------------------------------------------- B: the hut (shared middle pieces)
    B.box(-8, 0, 5.2, 8, HUT, HZ1, 'fieldstone');
    B.box(-7.6, HUT, HZ0 + 0.4, 7.6, HUT + 0.02, HZ1 - 0.4, 'pinewood', flat);
    B.box(-8, HUT, 5.2, 8, HUT + 0.02, HZ0, 'pinewood', flat);
    for (const x of [-4.6, 4.6]) B.box(x - 0.8, 0, 4.8, x + 0.8, HUT / 2, 5.2, 'pinewood');             // half steps up
    B.box(-8, 5.6, HZ0, 8, 12, HZ1, 'concrete', hidden);                                             // nobody on walls or roof
    // the parlour is open up to the roof (the flag of the point needs the height): tie beams and a ridge beam
    for (const z of [10.6, 12.2, 16.6]) B.box(-7.7, 4.0, z - 0.12, 7.7, 4.26, z + 0.12, 'woodDark', noCol);   // (clear of the flag)
    B.box(-7.7, 7.9, 13.88, 7.7, 8.16, 14.12, 'woodDark', noCol);
    // the tiled stove in the middle of the parlour, a bench round it, its pipe
    B.box(-1.0, HUT, 12.8, 1.0, HUT + 1.9, 15.0, 'stoveTiles');
    B.box(-1.1, HUT + 1.9, 12.7, 1.1, HUT + 2.05, 15.1, 'woodDark', flat);
    B.box(-1.1, HUT + 2.05, 12.7, 1.1, HUT + 4.0, 15.1, 'concrete', hidden);                        // nobody on the stove
    for (const s of [-1, 1]) B.box(s * 1.0 + (s > 0 ? 0 : -0.45), HUT, 12.8, s * 1.0 + (s > 0 ? 0.45 : 0), HUT + 0.45, 15.0, 'pinewood');
    B.geom(new THREE.CylinderGeometry(0.14, 0.14, 5.2, 10), 'metalDark', mtx(-0.6, HUT + 4.6, 14.7));
    for (const x of [-4.6, 4.6]) for (const z of [11.4, 15.4]) {
      B.box(x - 0.015, 3.3, z - 0.015, x + 0.015, 4.0, z + 0.015, 'black', noCol);
      B.box(x - 0.16, 3.1, z - 0.16, x + 0.16, 3.3, z + 0.16, 'lampOn', noCol);
    }
    // the balcony over the terrace
    B.box(-8, BAL - 0.2, 7.0, 8, BAL, HZ0, 'pinewood');
    railing(B, -8, 7.0, 8, 7.0, 1.0, 'woodDark', true, BAL);
    for (const x of [-7.8, -3.0, 3.0, 7.8]) B.box(x - 0.1, HUT, 7.0, x + 0.1, BAL - 0.2, 7.2, 'woodDark');
    // roof: two slopes up to a ridge along x, snow on them
    const zr = (HZ0 + HZ1) / 2, run = HZ1 - zr + 0.6, rise = 2.8, len = Math.hypot(run, rise), ang = Math.atan2(rise, run);
    for (const s of [-1, 1]) {
      B.geom(placed(new THREE.BoxGeometry(17.4, 0.22, len), mtx(0, 5.6 + rise / 2 + 0.1, zr + s * run / 2, 0, 1, 1, 1, s * ang), 2), 'shingle');
      B.geom(placed(new THREE.BoxGeometry(17.2, 0.18, len * 0.92), mtx(0, 5.6 + rise / 2 + 0.29, zr + s * run / 2 * 1.02, 0, 1, 1, 1, s * ang), 4), 'snow');
    }
    B.box(-8, 3.0, HZ0, 8, 5.6, HZ0 + 0.3, 'barnGrey');
    B.box(-8, 3.0, HZ1 - 0.3, 8, 5.6, HZ1, 'barnGrey');
    B.pointLight(-4.6, 3.0, 13.4, 0xffc890, 2.8, 11);
    B.pointLight(4.6, 3.0, 13.4, 0xffc890, 2.8, 11);
    B.pointLight(0, BAL + 2.0, 8.0, 0xffd8a8, 1.6, 9);

    for (const b of [B, B.mirrored()]) this.half(b);
  },

  // the west half (team 0); the east half is its mirror image
  half(b) {
    // ------------------------------------------------------------- the station: walls, the depot below, the deck above
    wallZ(b, SZ0, SZ1, -8.6, 0, ROOF, 0.4, 'concreteWhite', [{ c: -10.0, w: 1.6, y: 0, h: 2.3 }, { c: -18.7, w: 1.6, y: DECK, h: 2.2 }]);
    wallX(b, -8.8, 0, SZ0 + 0.2, 0, ROOF, 0.4, 'concreteWhite', [{ c: -1.2, w: 2.4, y: 4.4, h: 1.4 }]);
    // south front: a door into the depot, a window into it, a long window into the deck hall above
    const zs = SZ1 - 0.2;
    b.box(-8.8, 0, zs - 0.2, -5.8, ROOF, zs + 0.2, 'concreteWhite');
    b.box(-5.8, 2.3, zs - 0.2, -4.2, ROOF, zs + 0.2, 'concreteWhite');
    b.box(-4.2, 0, zs - 0.2, -3.6, ROOF, zs + 0.2, 'concreteWhite');
    b.box(-3.6, 0, zs - 0.2, 0, 1.0, zs + 0.2, 'concreteWhite');
    b.box(-3.6, 2.4, zs - 0.2, 0, 4.0, zs + 0.2, 'concreteWhite');
    b.box(-3.6, 5.9, zs - 0.2, 0, ROOF, zs + 0.2, 'concreteWhite');
    for (const [y0, y1] of [[1.0, 2.4], [4.0, 5.9]]) {
      b.glassPane(-3.6, y0, zs - 0.03, -1.8, y1, zs + 0.03);
      b.glassPane(-1.8, y0, zs - 0.03, 0, y1, zs + 0.03);
      b.box(-1.86, y0, zs - 0.06, -1.74, y1, zs + 0.06, 'metalDark', noCol);
    }
    b.box(-5.95, 2.3, zs + 0.2, -4.05, 2.42, zs + 0.5, 'metalDark', flat);
    // the deck: slab round the stair hole, railings at the hole, the stair from the depot
    b.box(-8.4, DECK - 0.2, SZ0 + 0.4, -6.6, DECK, SZ1 - 0.4, 'concreteWhite');
    b.box(-6.6, DECK - 0.2, SZ0 + 0.4, -5.0, DECK, -14.8, 'concreteWhite');
    b.box(-6.6, DECK - 0.2, -10.0, -5.0, DECK, SZ1 - 0.4, 'concreteWhite');      // (the hole is long enough to walk up without ducking)
    stairs(b, -5.8, -9.2, '-z', 1.6, DECK, 5.6, 'metalDark');
    railing(b, -5.0, -14.8, -5.0, -10.0, 1.0, 'metalYellow', true, DECK);
    railing(b, -6.6, -14.8, -6.6, -10.0, 1.0, 'metalYellow', true, DECK);
    railing(b, -6.6, -10.0, -5.0, -10.0, 1.0, 'metalYellow', true, DECK);
    // on the deck: the operator's booth, luggage, benches under the window
    b.box(-8.4, DECK, -10.6, -6.8, DECK + 2.3, -8.4, 'concreteWhite', hidden);
    b.box(-8.4, DECK, -10.6, -6.8, DECK + 1.0, -8.4, 'metalDark');
    b.box(-8.4, DECK + 2.2, -10.6, -6.8, DECK + 2.3, -8.4, 'metalDark', flat);
    b.box(-6.84, DECK + 1.0, -10.6, -6.8, DECK + 2.2, -8.4, 'carGlass', noCol);
    b.box(-8.4, DECK + 1.0, -10.64, -6.8, DECK + 2.2, -10.6, 'carGlass', noCol);
    b.box(-3.4, DECK, -10.6, -2.2, DECK + 1.0, -9.6, 'cardboard');
    b.box(-3.2, DECK + 1.0, -10.4, -2.5, DECK + 1.35, -9.8, 'cardboard');
    b.box(-4.6, DECK, -16.6, -3.4, DECK + 1.25, -15.4, 'metalDark');
    b.box(-4.0, DECK, -9.2, -1.4, DECK + 0.45, -8.6, 'woodDark');
    // the depot below: pillars, ski racks, lockers, the ticket counter
    for (const z of [-16.8, -11.6]) b.box(-3.6, 0, z - 0.2, -3.2, DECK - 0.2, z + 0.2, 'concreteWhite');
    for (const z of [-17.6, -15.4, -13.2]) {
      b.box(-8.2, 0, z - 0.25, -6.9, 1.35, z + 0.25, 'metalDark', { pen: 0.6 });
      for (let k = 0; k < 5; k++) b.box(-8.15 + k * 0.26, 0.2, z - 0.24, -8.1 + k * 0.26, 1.7, z + 0.24, k % 2 ? 'metalRed' : 'gondolaRed', noCol);
    }
    b.box(-4.8, 0, SZ0 + 0.4, -2.2, 2.0, SZ0 + 0.95, 'metalDark', { pen: 0.4 });
    b.box(-2.0, 0, -10.6, 0, 1.1, -9.6, 'pinewood');
    b.box(-2.0, 1.1, -10.7, 0, 1.18, -9.5, 'woodDark', flat);
    b.box(-6.8, 0, -18.6, -5.6, 0.9, -17.4, 'cardboard');
    // outside: the stair up to the deck door and its landing
    stairs(b, -9.7, -12.0, '-z', 1.4, DECK, 5.8, 'metalDark');
    b.box(-10.4, DECK - 0.2, SZ0, -8.8, DECK, -17.8, 'grate');
    for (const [x, z] of [[-10.3, -19.9], [-10.3, -17.9]]) b.box(x - 0.08, 0, z - 0.08, x + 0.08, DECK - 0.2, z + 0.08, 'metalDark');
    railing(b, -10.4, -17.8, -10.4, SZ0, 1.0, 'metalYellow', true, DECK);
    snowCap(b, -10.4, SZ0, -8.8, -17.8, DECK, 0.05);

    // ------------------------------------------------------------- the hut: walls, terrace, the outside stair to the balcony
    const hutN = [{ c: -4.6, w: 1.6, y: 0, h: HUT + 2.2 }, { c: -1.9, w: 1.4, y: 1.4, h: 1.0 }, { c: -6.7, w: 1.0, y: 1.4, h: 1.0 }];
    wallX(b, -8, 0, HZ0 + 0.2, 0, 3.0, 0.4, 'fieldstone', hutN);
    wallZ(b, HZ0, HZ1, -7.8, 0, 3.0, 0.4, 'fieldstone', [{ c: 17.0, w: 1.6, y: 0, h: HUT + 2.2 }, { c: 12.4, w: 1.2, y: 1.4, h: 1.0 }]);
    wallX(b, -8, 0, HZ1 - 0.2, 0, 3.0, 0.4, 'fieldstone');
    for (const [x0, x1] of [[-2.6, -1.2], [-7.2, -6.2]]) b.glassPane(x0, 1.4, HZ0 + 0.17, x1, 2.4, HZ0 + 0.23);
    b.glassPane(-7.83, 1.4, 11.8, -7.77, 2.4, 13.0);
    for (const x of [-2.75, -1.05, -7.35, -6.05]) b.box(x - 0.15, 1.35, HZ0 - 0.06, x + 0.15, 2.45, HZ0, 'shutterGreen', noCol);
    b.box(-8, 3.0, HZ0, -7.7, 5.6, HZ1, 'barnGrey');
    const gable = new THREE.Shape();
    gable.moveTo(-0.6, 0); gable.lineTo(HZ1 - HZ0 + 0.6, 0); gable.lineTo((HZ1 - HZ0) / 2, 2.8); gable.closePath();
    b.geom(placed(new THREE.ExtrudeGeometry(gable, { depth: 0.3, bevelEnabled: false }), mtx(-8.0, 5.6, HZ1, Math.PI / 2), 1.1), 'barnGrey');
    for (const [z, y] of [[11.2, 3.9], [16.8, 3.9]]) {
      b.box(-8.04, y, z - 0.5, -8.0, y + 1.0, z + 0.5, 'black', noCol);
      for (const s of [-1, 1]) b.box(-8.07, y - 0.05, z + s * 0.68 - 0.18, -8.03, y + 1.05, z + s * 0.68 + 0.18, 'shutterRed', noCol);
    }
    b.box(-7.6, HUT, HZ0 + 0.4, -7.56, HUT + 1.2, HZ1 - 0.4, 'pinewood', noCol);                    // panelling
    b.box(-7.6, HUT, HZ0 + 0.4, 0, HUT + 1.2, HZ0 + 0.44, 'pinewood', noCol);
    b.box(-7.6, HUT, HZ1 - 0.44, 0, HUT + 1.2, HZ1 - 0.4, 'pinewood', noCol);
    // inside: tables with benches, the bar along the back wall
    table(b, -4.6, 11.4, HUT);
    table(b, -4.6, 15.0, HUT);
    table(b, -2.6, 17.6, HUT, 'x');
    b.box(-7.6, HUT, 17.9, -5.8, HUT + 1.1, 18.6, 'pinewood');
    b.box(-7.6, HUT + 1.1, 17.85, -5.8, HUT + 1.16, 18.6, 'woodDark', flat);
    for (let k = 0; k < 4; k++) b.box(-7.5 + k * 0.4, HUT + 1.5, 18.52, -7.3 + k * 0.4, HUT + 1.85, 18.58, k % 2 ? 'carGlass' : 'metalRed', noCol);
    // terrace: railing with two openings, a table and a bench
    railing(b, -8, 5.2, -5.4, 5.2, 1.0, 'woodDark', true, HUT);
    railing(b, -3.8, 5.2, 0, 5.2, 1.0, 'woodDark', true, HUT);
    table(b, -2.2, 7.0, HUT);
    b.box(-7.6, HUT, 7.6, -6.4, HUT + 0.45, 8.6, 'pinewood');
    b.geom(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 6), 'woodDark', mtx(-2.2, HUT + 1.15, 7.0));
    b.geom(placed(new THREE.ConeGeometry(0.35, 1.6, 8), mtx(-2.2, HUT + 1.6, 7.0), 1), 'awningRed');
    // the outside stair to the balcony, along the west wall, and its landing
    stairs(b, -8.9, 15.5, '-z', 1.4, BAL, 6.0, 'woodDark');
    b.box(-9.6, BAL - 0.2, 7.0, -8.0, BAL, 9.5, 'pinewood');
    for (const [x, z] of [[-9.5, 7.1], [-9.5, 9.4]]) b.box(x - 0.08, 0, z - 0.08, x + 0.08, BAL - 0.2, z + 0.08, 'woodDark');
    railing(b, -9.6, 9.5, -9.6, 7.0, 1.0, 'woodDark', true, BAL);
    railing(b, -9.6, 7.0, -8.0, 7.0, 1.0, 'woodDark', true, BAL);

    // ------------------------------------------------------------- the base: a snowcat garage, doors at its outer corners
    const gx0 = -26, gx1 = -18.5, gz = 8;
    wallZ(b, -gz, gz, gx1 - 0.2, 0, 4.5, 0.4, 'corrugated');
    wallZ(b, -gz, gz, gx0 + 0.2, 0, 4.5, 0.4, 'corrugated');
    for (const s of [-1, 1]) wallX(b, gx0, gx1, s * (gz - 0.2), 0, 4.5, 0.4, 'corrugated', [{ c: -24.2, w: 2.4, y: 0, h: 3.0 }]);
    b.box(gx0, 4.5, -gz, gx1, 4.8, gz, 'metalDark');
    b.box(gx0, 4.8, -gz, gx1, 12, gz, 'concrete', hidden);
    snowCap(b, gx0, -gz, gx1, gz, 4.8, 0.25);
    b.box(gx0 + 0.4, 0, -gz + 0.4, gx1 - 0.4, 0.02, gz - 0.4, 'concreteFloor', flat);
    snowcat(b, -25.4, -22.4, 1.2);
    b.box(-21.0, 0, -7.6, -18.9, 0.95, -6.8, 'woodDark');
    b.geom(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10), 'metalRed', mtx(-19.5, 0.45, 7.0));
    b.geom(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10), 'metalYellow', mtx(-20.2, 0.45, 7.1));
    b.box(-20.5, 0, 6.6, -19.2, 0.9, 7.5, 'metalRed', hidden);
    for (const z of [-4.5, 0, 4.5]) tube(b, -23.5, -21.0, 4.45, z);
    b.pointLight(-22.2, 3.6, 0, 0xe8f4ff, 2.4, 10);
    for (const s of [-1, 1]) b.box(-25.45, 3.05, s * gz - 0.3, -22.95, 3.2, s * gz + 0.3, 'metalYellow', flat);

    // ------------------------------------------------------------- the T-bar station between base and rock
    b.box(-14.6, 0, -2.0, -11.8, 2.6, 1.0, 'barnGrey');
    b.box(-14.8, 2.6, -2.2, -11.6, 2.8, 1.2, 'metalDark', flat);
    snowCap(b, -14.8, -2.2, -11.6, 1.2, 2.8, 0.15);
    b.box(-11.84, 1.2, -1.2, -11.8, 2.0, 0.2, 'black', noCol);
    b.box(-11.8, 0, -0.9, -10.6, 5.4, -0.6, 'metalYellow');
    b.geom(new THREE.CylinderGeometry(1.0, 1.0, 0.12, 18), 'metalDark', mtx(-10.4, 5.6, -0.75));
    for (let x = -10.4; x > -60; x -= 9) {
      if (x < -27) b.box(x - 0.2, 0, -0.95, x + 0.2, 6.6, -0.55, 'metalYellow', noCol);
      for (const dz of [-1.75, 0.25]) b.box(x - 4.5, 5.6, dz - 0.015, x + 4.5, 5.63, dz + 0.015, 'black', noCol);
    }
    for (let k = 0; k < 3; k++) b.box(-11.0 - k * 3, 2.2, -1.77, -10.98 - k * 3, 5.6, -1.73, 'black', noCol);   // hangers with their T-bars
    for (let k = 0; k < 3; k++) b.box(-11.4 - k * 3, 2.2, -1.75, -10.6 - k * 3, 2.26, -1.73, 'metalDark', noCol);
    // ------------------------------------------------------------- snow drifts, a fuel tank, firewood and a wood shed
    for (const [x0, z0, x1, z1, h] of [[-16.5, -12.6, -13.5, -10.6, 0.7], [-20.6, -13.4, -18.6, -11.8, 0.9], [-7.6, 2.6, -5.4, 4.4, 0.8],
      [-16.0, 9.6, -13.2, 11.4, 0.75], [-11.4, -6.4, -9.4, -4.6, 0.6]]) {
      b.box(x0, 0, z0, x1, h, z1, 'snowBank');
      b.box(x0 + 0.4, h, z0 + 0.3, x1 - 0.4, h + 0.25, z1 - 0.3, 'snowBank', flat);
    }
    b.geom(new THREE.CylinderGeometry(1.0, 1.0, 4.2, 14), 'metalWhite', mtx(-21.0, 1.25, -17.6, 0, 1, 1, 1, 0, Math.PI / 2));
    b.box(-23.1, 0, -18.6, -18.9, 2.25, -16.6, 'metalWhite', hidden);
    for (const x of [-22.4, -19.6]) b.box(x - 0.1, 0, -18.4, x + 0.1, 0.4, -16.8, 'metalDark', noCol);
    snowcat(b, -16.8, -12.6, -17.6, 'machineBlue');
    b.box(-14.6, 0, 13.6, -11.6, 1.5, 15.4, 'logpile', { faces: '+x-x' });
    b.box(-14.6, 0, 13.6, -11.6, 1.5, 15.4, 'barkLog', { faces: '+z-z+y', collide: false });
    snowCap(b, -14.6, 13.6, -11.6, 15.4, 1.5, 0.1);
    b.box(-18.4, 0, 16.6, -14.4, 2.6, 19.2, 'barnGrey');
    b.box(-18.6, 2.6, 16.4, -14.2, 2.8, 19.3, 'metalDark', flat);
    snowCap(b, -18.6, 16.4, -14.2, 19.3, 2.8, 0.18);
    b.box(-18.4, 2.6, 16.6, -14.4, 9, 19.2, 'concrete', hidden);
    for (let k = 0; k < 4; k++) b.box(-13.9 + k * 0.5, 0, 17.6, -13.82 + k * 0.5, 1.6, 17.68, 'woodDark', noCol);   // skis against the shed
    b.pointLight(-10.6, 2.4, -10.2, 0xffe0b8, 1.4, 6);
  },

  spawns() {
    const west = [[-21.6, 0, -5.6], [-19.8, 0, -3.0], [-21.4, 0, -0.4], [-19.8, 0, 2.2], [-21.6, 0, 4.6], [-20.0, 0, 6.0]];
    return { 0: west.map(([x, y, z]) => [x, y, z, -Math.PI / 2]), 1: west.map(([x, y, z]) => [-x, y, z, Math.PI / 2]) };
  },

  hotspots: [
    [-3, DECK, -13], [3, DECK, -13], [0, DECK, -16.5], [-6, DECK, -17], [6, DECK, -17], [-5, 0, -14], [5, 0, -14], [0, 0, -12],
    [-4, HUT, 12.4], [4, HUT, 12.4], [0, HUT, 16.8], [-4, HUT, 7], [4, HUT, 7], [-4, BAL, 8], [4, BAL, 8],
    [0, 2.1, -1.2], [-6, 0, -1], [6, 0, -1], [-10, 0, 3], [10, 0, 3], [-14, 0, -12], [14, 0, -12], [-14, 0, 12], [14, 0, 12],
    [-9.7, DECK, -18.8], [9.7, DECK, -18.8],
  ],
};
