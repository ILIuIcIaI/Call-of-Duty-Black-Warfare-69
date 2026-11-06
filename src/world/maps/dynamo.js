import * as THREE from 'three';
import { wallX, wallZ, stairs, crate, barrel, barrier, car, lampPost, railing, mtx } from '../props.js';
import { projectUV } from '../textures.js';

// =============================================================================
// DYNAMO — a coal-fired power station at dusk. Small-medium, built for 8-10
// players, with long cover and two floors of fighting in the middle.
//   Center : the turbine hall: two turbine sets as long cover, a way across
//            between turbine and generator (the flag of the 2 vs 2 mode), a
//            catwalk along each long wall with a stair up to it, a bridge
//            across the hall from catwalk to catwalk. Doors at both ends and
//            on both sides.
//   West   : the coal yard: a stepped heap in a bunker you can climb, the coal
//            shed, the conveyor's transfer tower, a bulldozer.
//   East   : the switchyard: the control house in the middle, transformers
//            behind a fire wall, gantries with insulators.
//   Between: pipe yards with water tanks and a pump house; the staff car
//            parks behind them (spawns).
// Mirror-symmetric across z = 0: team 0 north, team 1 south.
// =============================================================================
const HX = 15, HZ = 8, HH = 11, CW = 4.0; // turbine hall: outer half sizes, height, catwalk floor
const flat = { collide: false, ao: false };

// steel lattice: four legs and a beam, insulators hanging from it (only to look at)
function gantry(b, x0, x1, z, h) {
  for (const x of [x0, x1]) b.box(x - 0.2, 0, z - 0.2, x + 0.2, h, z + 0.2, 'metal');
  b.box(x0, h - 0.5, z - 0.2, x1, h, z + 0.2, 'metal', flat);
  for (let x = x0 + 1.2; x < x1 - 0.6; x += 1.6) {
    b.geom(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 8), 'clay', mtx(x, h - 1.05, z));
    for (let k = 0; k < 4; k++) b.geom(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 10), 'clay', mtx(x, h - 0.65 - k * 0.25, z));
  }
}
// big transformer: tank, radiator fins on both long sides, bushings on top
function transformer(b, x0, z0, x1, z1) {
  b.box(x0, 0, z0, x1, 0.3, z1, 'concrete');
  b.box(x0 + 0.5, 0.3, z0 + 0.6, x1 - 0.5, 3.0, z1 - 0.6, 'machineGreen', { pen: 0.2 });
  b.box(x0 + 0.1, 0.3, z0 + 0.1, x1 - 0.1, 3.0, z0 + 0.6, 'machineGreen', { visual: false });
  b.box(x0 + 0.1, 0.3, z1 - 0.6, x1 - 0.1, 3.0, z1 - 0.1, 'machineGreen', { visual: false });
  for (let x = x0 + 0.3; x < x1 - 0.2; x += 0.32) for (const [za, zb] of [[z0 + 0.1, z0 + 0.6], [z1 - 0.6, z1 - 0.1]]) b.box(x - 0.05, 0.5, za, x + 0.05, 2.8, zb, 'machineGreen', flat);
  for (let i = 0; i < 3; i++) {
    const x = x0 + 0.9 + i * ((x1 - x0 - 1.8) / 2);
    b.geom(new THREE.CylinderGeometry(0.16, 0.22, 1.2, 8), 'clay', mtx(x, 3.6, (z0 + z1) / 2));
  }
}
function tank(b, x, z, r = 2.2, h = 4.6) {
  b.box(x - r, 0, z - r * 0.7, x + r, h, z + r * 0.7, 'metalWhite', { visual: false, pen: 0.3 });
  b.box(x - r * 0.7, 0, z - r, x + r * 0.7, h, z + r, 'metalWhite', { visual: false, pen: 0.3 });
  b.geom(new THREE.CylinderGeometry(r, r, h, 24), 'metalWhite', mtx(x, h / 2, z));
  b.geom(new THREE.CylinderGeometry(r + 0.05, r + 0.05, 0.15, 24), 'metalDark', mtx(x, h - 0.1, z));
  b.geom(new THREE.CylinderGeometry(r * 0.96, r, 0.5, 24), 'metalWhite', mtx(x, h + 0.25, z));
  for (const y of [0.2, h - 0.2]) b.box(x + r - 0.02, 0.2, z - 0.25, x + r + 0.08, h, z - 0.21, 'metalDark', flat);
  for (let y = 0.4; y < h; y += 0.35) b.box(x + r + 0.02, y, z - 0.25, x + r + 0.06, y + 0.04, z + 0.25, 'metalDark', flat);
  b.box(x + r + 0.02, 0.2, z + 0.21, x + r + 0.08, h, z + 0.25, 'metalDark', flat);
}
function dozer(b, x, z) {
  b.box(x - 1.1, 0, z - 1.8, x + 1.1, 1.9, z + 1.6, 'metalYellow', { visual: false, pen: 0.3 });
  b.box(x - 1.1, 0, z - 1.6, x + 1.1, 0.7, z + 1.6, 'rubber', flat);
  b.box(x - 0.9, 0.7, z - 1.3, x + 0.9, 1.5, z + 1.2, 'metalYellow', flat);
  b.box(x - 0.8, 1.5, z + 0.1, x + 0.8, 2.6, z + 1.2, 'metalYellow', flat);
  b.box(x - 0.8, 1.9, z + 0.1, x + 0.8, 2.6, z + 1.2, 'metalYellow', { visual: false, pen: 0.3 });   // the cab above the body's box
  b.box(x - 0.7, 1.7, z + 0.08, x + 0.7, 2.4, z + 0.12, 'carGlass', flat);
  b.box(x - 1.3, 0.1, z - 2.3, x + 1.3, 1.2, z - 1.9, 'metalDark', { pen: 0.2 });
}

export default {
  id: 'dynamo',
  name: 'DYNAMO',
  desc: 'Kohlekraftwerk in der Abenddämmerung. Turbinenhalle mit Laufstegen und Brücke, Kohlelager mit begehbarer Halde, Umspannwerk mit Leitstand, Rohrhöfe mit Tanks und Pumpenhaus.',
  size: 'Klein-Mittel',
  env: {
    sunDir: [-0.62, 0.26, 0.18],
    sunColor: 0xffa060, sunIntensity: 2.7,
    skyTop: 0x2e3c66, skyHorizon: 0xec8e5c, skyBottom: 0x4a3c40,
    cloudColor: 0xf0a888, clouds: 0.45,
    hemiSky: 0xa4a8c4, groundColor: 0x8a7a6c, ambient: 1.55,
    fogColor: 0xa88a7c, fogNear: 55, fogFar: 240,
  },
  bounds: { minX: -32, maxX: 32, minZ: -28, maxZ: 28 },
  navTop: 5.0,     // the catwalks are floors, the hall roof is not

  build(B) {
    // ------------------------------------------------------------- ground and what is far away
    B.box(-90, -1, -90, 90, 0, 90, 'asphalt');
    B.box(-HX, 0, -HZ, HX, 0.012, HZ, 'concreteFloor', flat);
    const tower = new THREE.LatheGeometry([[17, 0], [14.5, 8], [11.6, 22], [10.8, 31], [11.6, 40]].map(([r, y]) => new THREE.Vector2(r, y)), 28).toNonIndexed();
    projectUV(tower, 8);
    for (const z of [-30, 30]) B.geom(tower, 'concrete', mtx(-78, 0, z));
    B.geom(new THREE.CylinderGeometry(2.4, 3.6, 90, 16), 'concrete', mtx(72, 45, -36));
    for (const y of [78, 84]) B.geom(new THREE.CylinderGeometry(2.6, 2.6, 2.6, 16), 'metalRed', mtx(72, y, -36));
    // ------------------------------------------------------------- turbine hall, what crosses the middle
    B.box(-1.0, CW - 0.1, -5.6, 1.0, CW, 5.6, 'grate');                  // the bridge from catwalk to catwalk
    railing(B, -1.0, -5.6, -1.0, 5.6, 1.05, 'metalYellow', true, CW);
    railing(B, 1.0, -5.6, 1.0, 5.6, 1.05, 'metalYellow', true, CW);
    for (const z of [-4.4, 0, 4.4]) B.box(-1.0, CW - 0.4, z - 0.08, 1.0, CW - 0.1, z + 0.08, 'metalDark', flat);
    // the crane over the hall
    B.box(-4.4, 8.4, -7.6, -3.6, 9.2, 7.6, 'metalYellow', flat);
    B.box(-4.6, 8.0, -1.2, -3.4, 8.4, 1.2, 'metalDark', flat);
    B.box(-4.05, 5.4, -0.05, -3.95, 8.0, 0.05, 'metalDark', flat);
    B.box(-4.3, 5.0, -0.3, -3.7, 5.4, 0.3, 'metalYellow', flat);
    // ends of the hall: hazard stripes at the doors, lamps
    for (const x of [-14.2, 14.2]) B.box(x - 0.4, 0.012, -1.5, x + 0.4, 0.02, 1.5, 'hazardStripe', flat);
    B.pointLight(-7, 8.5, 0, 0xffc070, 4, 16);
    B.pointLight(7, 8.5, 0, 0xffc070, 4, 16);
    for (const x of [-10, -3, 3, 10]) B.box(x - 0.5, 9.4, -0.25, x + 0.5, 9.6, 0.25, 'lampOn', flat);
    // ------------------------------------------------------------- the control house in the switchyard: a cabinet row across its middle
    B.box(19.4, 0, -0.4, 24.6, 2.2, 0.4, 'metalDark', { pen: 0.3 });
    for (const s of [-1, 1]) for (let x = 19.8; x < 24.4; x += 0.8) B.box(x - 0.25, 0.9, s * 0.4 - 0.01, x + 0.25, 1.7, s * 0.4 + 0.01, 'screen', flat);
    B.pointLight(22, 3.0, 0, 0xd8f0ff, 2, 8);
    // ------------------------------------------------------------- the coal heap, its top across the middle
    B.box(-24.6, 2.5, -2.0, -21.4, 3.5, 2.0, 'coal');
    for (const [x, z, s] of [[-23.0, 0, 1.3], [-24.0, 0.6, 0.8], [-22.0, -0.7, 0.9]]) B.geom(new THREE.SphereGeometry(s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 'coal', mtx(x, 3.5, z, 0, 1.2, 0.5, 1));

    for (const b of [B, B.mirroredZ()]) this.half(b);
  },

  half(b) {
    // ================================================================ turbine hall, north half
    // brick below, corrugated sheet above with a band of windows; doors on the long side and at both ends
    wallX(b, -HX, HX, HZ - 0.2, 0, 5, 0.4, 'brickDark', [{ c: -10, w: 3, h: 3.6 }, { c: 8, w: 3, h: 3.6 }]);
    wallX(b, -HX, HX, HZ - 0.2, 5, HH - 5, 0.4, 'corrugated', [{ c: -7.5, w: 5, y: 1.4, h: 2.2 }, { c: 0, w: 5, y: 1.4, h: 2.2 }, { c: 7.5, w: 5, y: 1.4, h: 2.2 }]);
    for (const c of [-7.5, 0, 7.5]) b.glassPane(c - 2.5, 6.4, HZ - 0.22, c + 2.5, 8.6, HZ - 0.18);
    for (const x of [-HX + 0.2, HX - 0.2]) {
      wallZ(b, 0, HZ - 0.4, x, 0, 5, 0.4, 'brickDark', [{ c: 0, w: 3, h: 3.6 }]);
      wallZ(b, 0, HZ - 0.4, x, 5, HH - 5, 0.4, 'corrugated', []);
    }
    for (const x of [-10, 8]) b.box(x - 1.7, 3.6, HZ, x + 1.7, 3.8, HZ + 1.0, 'metalDark', flat);
    b.box(-HX, HH - 0.25, 0, HX, HH, 3, 'corrugated');
    b.glassPane(-HX + 0.4, HH - 0.2, 3, HX - 0.4, HH - 0.15, 5);
    b.box(-HX, HH - 0.25, 5, HX, HH, HZ, 'corrugated');
    for (let x = -12; x <= 12; x += 6) b.box(x - 0.15, HH - 1.2, 0, x + 0.15, HH - 0.25, HZ - 0.4, 'metalDark', flat);
    // the turbine set: turbine under its hood, and 3 m apart from it (a way across the hall between the two sets,
    // where the flag of the 2 vs 2 mode stands) generator and exciter, each on its own pedestal
    for (const [x0, x1] of [[-12, 1.5], [4.5, 10.5]]) {
      b.box(x0, 0, 1.4, x1, 0.8, 4.2, 'concrete');
      b.box(x0, 0.8, 1.4, x1, 0.83, 1.6, 'hazardStripe', flat);
    }
    b.box(-11, 0.8, 1.6, 1.5, 2.0, 4.0, 'machineGreen', { pen: 0.2 });
    b.box(-11, 2.0, 1.7, 1.5, 2.5, 3.9, 'machineGreen', { visual: false, pen: 0.2 });     // the hood, in two steps
    b.box(-11, 2.5, 2.0, 1.5, 3.1, 3.6, 'machineGreen', { visual: false, pen: 0.2 });
    b.geom(new THREE.CylinderGeometry(1.2, 1.2, 12.5, 16, 1, false, 0, Math.PI), 'machineGreen', mtx(-4.75, 2.0, 2.8, 0, 1, 1, 1, 0, Math.PI / 2));
    b.box(4.5, 0.8, 1.6, 9.5, 3.3, 4.0, 'machineBlue', { pen: 0.2 });
    for (let x = 5.0; x < 9.3; x += 0.5) b.box(x - 0.06, 1.0, 1.55, x + 0.06, 3.1, 4.05, 'metalDark', flat);
    b.box(9.5, 0.8, 2.1, 10.5, 2.4, 3.5, 'machineGreen', { pen: 0.2 });
    for (const x of [-9, -1]) {
      b.geom(new THREE.TorusGeometry(1.1, 0.18, 8, 16, Math.PI), 'metalDark', mtx(x, 3.0, 2.8, Math.PI / 2));
    }
    // the catwalk along the north wall, the stair up to it
    // (2 m wide, like the bridge: narrower and the bots' nav grid finds no room on them between rail and wall)
    b.box(-14.6, CW - 0.1, 5.6, 14.6, CW, 7.6, 'grate');
    for (let x = -13.5; x <= 13.6; x += 3) b.box(x - 0.08, CW - 0.6, 5.7, x + 0.08, CW - 0.1, 7.6, 'metalDark', flat);
    railing(b, -14.6, 5.6, -7.2, 5.6, 1.05, 'metalYellow', true, CW);
    railing(b, -6.0, 5.6, -1.0, 5.6, 1.05, 'metalYellow', true, CW);
    railing(b, 1.0, 5.6, 14.6, 5.6, 1.05, 'metalYellow', true, CW);
    stairs(b, -1.0, 4.9, '-x', 1.4, CW, 5.8, 'grate');
    // ------------------------------------------------------------ the pipe yard north of the hall
    b.box(-HX, 0, HZ, HX, 0.012, 19, 'concreteFloor', flat);
    tank(b, -9, 13.6); tank(b, 9, 13.6);
    for (const x of [-9, 9]) { b.box(x - 0.3, 2.7, HZ, x + 0.3, 3.3, 11.6, 'metalDark', { pen: 0.3 }); b.geom(new THREE.CylinderGeometry(0.3, 0.3, 3.6, 10), 'metal', mtx(x, 3.0, 9.8, 0, 1, 1, 1, Math.PI / 2)); }
    // pump house: doors west, east and toward the hall
    wallX(b, -3.5, 3.5, 11.2, 0, 3.4, 0.4, 'brick', [{ c: 0, w: 1.8, h: 2.4 }]);
    wallX(b, -3.5, 3.5, 15.3, 0, 3.4, 0.4, 'brick', [{ c: -2, w: 1.2, y: 1.3, h: 1.0 }, { c: 2, w: 1.2, y: 1.3, h: 1.0 }]);
    wallZ(b, 11.4, 15.1, -3.3, 0, 3.4, 0.4, 'brick', [{ c: 13.5, w: 1.8, h: 2.4 }]);
    wallZ(b, 11.4, 15.1, 3.3, 0, 3.4, 0.4, 'brick', [{ c: 13.5, w: 1.8, h: 2.4 }]);
    b.box(-3.7, 3.4, 11.0, 3.7, 3.65, 15.5, 'concreteDark');
    b.box(-3.1, 0, 11.4, 3.1, 0.012, 15.1, 'tilesCheck', flat);
    for (const x of [-1.6, 1.6]) { b.box(x - 0.6, 0, 13.8, x + 0.6, 1.1, 14.9, 'machineBlue', { pen: 0.3 }); b.geom(new THREE.CylinderGeometry(0.22, 0.22, 2.3, 10), 'metal', mtx(x, 2.3, 14.3)); }
    b.box(-2.9, 2.6, 14.2, 2.9, 2.9, 14.5, 'metal', flat);
    b.box(-0.3, 2.95, 13.2, 0.3, 3.05, 13.8, 'lampOn', flat);
    b.glassPane(-2.6, 1.3, 15.28, -1.4, 2.3, 15.32); b.glassPane(1.4, 1.3, 15.28, 2.6, 2.3, 15.32);
    // pipe rack along the back of the yard, high enough to walk under
    for (let x = -14; x <= 14; x += 7) for (const z of [17.5, 18.5]) b.box(x - 0.15, 0, z - 0.15, x + 0.15, 4.7, z + 0.15, 'metalDark');
    b.box(-HX, 4.4, 17.3, HX, 4.7, 18.7, 'metalDark', { pen: 0.4 });
    for (const [z, r, m] of [[17.6, 0.3, 'metal'], [18.15, 0.22, 'metalYellow'], [18.5, 0.16, 'metalRed']]) b.geom(new THREE.CylinderGeometry(r, r, 30, 10), m, mtx(0, 4.7 + r, z, 0, 1, 1, 1, 0, Math.PI / 2));
    // things to hide behind
    barrier(b, -5.6, 9.6, 'x', 3); barrier(b, 5.6, 9.6, 'x', 3);
    barrel(b, -12.6, 10.4, 'metalYellow'); barrel(b, -12.0, 10.9, 'metalDark'); barrel(b, 12.4, 16.2, 'metalRed');
    crate(b, 13.2, 9.8, 1.1); crate(b, -13.4, 16.0, 1.2);
    lampPost(b, 0, 17.0, 6, [0, -1]);
    b.pointLight(0, 5.6, 16.2, 0xffb060, 3, 14);

    // ================================================================ car park and offices (spawn)
    b.box(-32, 0, 27.5, 32, 3.5, 28.5, 'concrete');
    b.box(-32, 3.5, 27.5, 32, 30, 28.5, 'concrete', { visual: false });
    b.box(-9, 0, 22.5, 9, 7.2, 27.5, 'plasterGrey');
    for (const y of [1.3, 4.6]) for (let x = -7.5; x <= 7.6; x += 2.5) if (!(y < 2 && Math.abs(x) < 1)) b.box(x - 0.8, y, 22.47, x + 0.8, y + 1.4, 22.5, 'black', flat);
    b.box(-1.2, 0, 22.46, 1.2, 2.4, 22.5, 'carGlass', flat);
    b.box(-2.2, 2.8, 21.2, 2.2, 3.0, 22.5, 'concreteDark', flat);
    b.box(-9.3, 7.0, 22.2, 9.3, 7.4, 27.5, 'concreteDark', flat);
    car(b, -24.5, 25.0, 'x', 'carPaintRed');
    car(b, -14.0, 25.2, 'x', 'carPaintWhite');
    car(b, 15.0, 25.0, 'x', 'carPaintBlue');
    car(b, 25.5, 25.2, 'x', 'carPaintGreen');
    for (let x = -30; x <= 30; x += 4.5) if (Math.abs(x) > 9.5) b.box(x - 0.06, 0.004, 23.6, x + 0.06, 0.012, 27.4, 'paintWhite', flat);
    barrier(b, -20.0, 19.4, 'x', 3); barrier(b, 20.0, 19.4, 'x', 3);
    barrier(b, -11.5, 19.6, 'x', 2.6); barrier(b, 11.5, 19.6, 'x', 2.6);
    lampPost(b, -19, 22.2, 6.5, [0, -1]); lampPost(b, 19, 22.2, 6.5, [0, -1]);
    b.pointLight(-19, 6.0, 21.5, 0xffb060, 3, 15); b.pointLight(19, 6.0, 21.5, 0xffb060, 3, 15);

    // ================================================================ coal yard (west)
    b.box(-34, 0, 0, -32, 4.5, 28.5, 'concrete');
    b.box(-34, 4.5, 0, -32, 30, 28.5, 'concrete', { visual: false });
    // the bunker with the heap: retaining walls west and east, the coal in steps you can climb
    // (its edges lie on whole meters: bots climb from one nav cell into the next)
    b.box(-27.2, 0, 0, -26.8, 2.6, 4.0, 'concrete');
    b.box(-19.2, 0, 0, -18.8, 2.6, 4.0, 'concrete');
    b.box(-26.8, 0, 0, -19.2, 1.3, 4.0, 'coal');
    b.box(-26.8, 1.3, 0, -19.2, 2.5, 3.0, 'coal');
    for (const [x, z, s] of [[-25.6, 3.6, 0.7], [-20.4, 3.5, 0.8], [-23.1, 3.7, 0.6]]) b.geom(new THREE.SphereGeometry(s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 'coal', mtx(x, 1.3, z, 0, 1.1, 0.4, 0.9));
    // coal shed and the conveyor's transfer tower, a bulldozer between them
    b.box(-31, 0, 9, -26.4, 5.2, 14.5, 'corrugated');
    b.box(-31.2, 5.2, 8.8, -26.2, 5.5, 14.7, 'metalDark', flat);
    b.box(-26.38, 0, 10.2, -26.34, 4.2, 13.3, 'metalDark', flat);
    b.box(-19.6, 0, 9, -14.6, 9, 13, 'corrugated');   // (right up to the line of the hall wall: no gap to look through)
    b.box(-19.8, 9, 8.8, -14.4, 9.3, 13.2, 'metalDark', flat);
    b.box(-19.62, 0, 10.2, -19.58, 2.4, 11.6, 'metalDark', flat);
    const belt = new THREE.BoxGeometry(1.6, 1.2, 11.5);
    b.geom(belt, 'corrugated', mtx(-20.3, 6.2, 5.0, -0.42, 1, 1, 1, 0.42, 0));
    // the conveyor gallery from the shed into the tower, 2 m up: under it you walk, it screens the coal bunker (a capture
    // point) from the car park, and from the dozer's cab you climb onto it and on to the shed's roof
    b.box(-26.4, 2.0, 11.4, -19.6, 4.0, 13.0, 'corrugated');
    b.box(-26.4, 2.0, 11.36, -19.6, 2.15, 13.04, 'metalDark', flat);
    dozer(b, -23.0, 10.0);   // (its cab clear of the gallery)
    for (const [x, z] of [[-29.6, 6.2], [-17.0, 16.5]]) b.geom(new THREE.SphereGeometry(1.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 'coal', mtx(x, 0, z, 0, 1.2, 0.7, 1));
    for (const [x, z] of [[-29.6, 6.2], [-17.0, 16.5]]) b.box(x - 1.0, 0, z - 0.8, x + 1.0, 0.9, z + 0.8, 'coal', { visual: false });
    b.box(-31, 0, 17, -27.5, 0.012, 19, 'coal', flat);
    lampPost(b, -31.2, 5, 7, [1, 0]);
    b.pointLight(-30.2, 6.5, 5, 0xffb060, 3, 15);

    // ================================================================ switchyard (east)
    b.box(32, 0, 0, 34, 4.5, 28.5, 'concrete');
    b.box(32, 4.5, 0, 34, 30, 28.5, 'concrete', { visual: false });
    b.box(15, 0, 0, 31, 0.012, 19, 'dirt', flat);
    // control house: door to the north, windows to the west and east
    wallX(b, 18, 26, 2.8, 0, 3.4, 0.4, 'plasterGrey', [{ c: 22, w: 1.8, h: 2.4 }, { c: 19.6, w: 1.4, y: 1.2, h: 1.1 }, { c: 24.4, w: 1.4, y: 1.2, h: 1.1 }]);
    wallZ(b, 0, 2.6, 18.2, 0, 3.4, 0.4, 'plasterGrey', [{ c: 1.2, w: 1.6, y: 1.2, h: 1.1 }]);
    wallZ(b, 0, 2.6, 25.8, 0, 3.4, 0.4, 'plasterGrey', [{ c: 1.2, w: 1.6, y: 1.2, h: 1.1 }]);
    b.glassPane(18.18, 1.2, 0.4, 18.22, 2.3, 2.0); b.glassPane(25.78, 1.2, 0.4, 25.82, 2.3, 2.0);
    b.glassPane(18.9, 1.2, 2.78, 20.3, 2.3, 2.82); b.glassPane(23.7, 1.2, 2.78, 25.1, 2.3, 2.82);
    b.box(17.8, 3.4, 0, 26.2, 3.65, 3.2, 'concreteDark');
    b.box(18.4, 0, 0, 25.6, 0.012, 2.6, 'tilesCheck', flat);
    b.box(18.6, 0, 1.6, 19.4, 1.0, 2.4, 'metalDark', { pen: 0.4 });
    b.box(18.62, 1.0, 1.7, 19.38, 1.3, 2.3, 'screen', flat);
    // transformers behind a fire wall, gantries, insulators
    transformer(b, 15.2, 9.5, 18.8, 13.5);
    b.box(14.6, 0, 8.6, 15.2, 4.2, 14.4, 'concrete');   // fire wall, up to the line of the hall wall
    transformer(b, 25.2, 9.5, 29.4, 13.5);
    b.box(29.4, 0, 8.5, 31, 4.2, 14.5, 'concrete');
    gantry(b, 16.2, 29.8, 16.4, 8);
    for (const x of [21.0, 23.4]) { b.box(x - 0.3, 0, 7.6, x + 0.3, 0.5, 8.2, 'concrete'); b.geom(new THREE.CylinderGeometry(0.1, 0.1, 2.6, 8), 'metal', mtx(x, 1.8, 7.9)); for (let k = 0; k < 5; k++) b.geom(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 10), 'clay', mtx(x, 2.4 + k * 0.22, 7.9)); }
    b.box(20.6, 0, 7.5, 23.8, 0.6, 8.3, 'concrete');                                 // their plinth (what stops you is there to see)
    // switch cabinets (the first one stands where the car park would see past the control house into the capture circle)
    for (const [x, z] of [[26.0, 5.2], [16.6, 6.2]]) { b.box(x - 0.6, 0, z - 0.5, x + 0.6, 1.6, z + 0.5, 'metalWhite', { pen: 0.4 }); b.box(x - 0.5, 0.9, z + 0.5, x + 0.5, 1.4, z + 0.52, 'black', flat); }
    railing(b, 15, 19, 21, 19, 2.0, 'metalDark', true);
    railing(b, 25, 19, 31, 19, 2.0, 'metalDark', true);
    lampPost(b, 31.2, 5, 7, [-1, 0]);
    b.pointLight(30.2, 6.5, 5, 0xffb060, 3, 15);
  },

  spawns() {
    // (the two in the west corner stand behind the coal shed, out of sight of the coal bunker under the conveyor gallery)
    const north = [[-30.0, 0, 21.5], [-31.0, 0, 18.0], [-15.0, 0, 21.4], [-5.8, 0, 20.6], [0, 0, 20.4], [5.8, 0, 20.6], [15.0, 0, 21.4], [21.5, 0, 23.0], [27.5, 0, 21.2]];
    return { 0: north.map(([x, y, z]) => [x, y, z, 0]), 1: north.map(([x, y, z]) => [x, y, -z, Math.PI]) };
  },

  hotspots: [
    [0, 0, 0], [-8, 0, 0], [8, 0, 0], [-6, 0, 5.5], [6, 0, 5.5], [-6, 0, -5.5], [6, 0, -5.5], [-10, CW, 6.5], [10, CW, 6.5], [-10, CW, -6.5], [10, CW, -6.5], [0, CW, 0],
    [0, 0, 13.3], [0, 0, -13.3], [-6, 0, 11], [6, 0, 11], [-6, 0, -11], [6, 0, -11], [-13, 0, 16], [13, 0, -16],
    [-23, 3.5, 0], [-23, 0, 6.5], [-23, 0, -6.5], [-29.5, 0, 1], [-17, 0, -1], [-23, 0, 16], [-23, 0, -16],
    [22, 0, 1.5], [22, 0, 5.5], [22, 0, -5.5], [17, 0, 4], [28, 0, -4], [22, 0, 15], [22, 0, -15],
  ],
};
