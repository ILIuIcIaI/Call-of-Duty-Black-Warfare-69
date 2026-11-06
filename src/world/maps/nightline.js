import * as THREE from 'three';
import { projectUV } from '../textures.js';
import { mtx, wallX, wallZ, stairs, railing, boundary } from '../props.js';

// =============================================================================
// NIGHTLINE: the end of metro line 69, at night, after the last train. Made for the 2 vs 2 capture mode (and small
// enough for Team Deathmatch). Mirror-symmetric across x = 0: team 0 comes from the west, team 1 from the east, each
// out of a staff room with its doors at the outer corners.
//   A (north): the platform in front of the parked train. A kiosk in the middle of the circle, the train to walk
//      through, a balcony from the mezzanine over it.
//   B (south): the ticket hall behind the turnstiles, the ticket booth in the middle (glass to shoot through), the
//      landing in front of the closed street exit above it.
//   middle: the transfer hall with the mezzanine bridge and its escalators; at the sides a concourse round a closed
//      newsstand, a corridor and a little shop as a second way into B.
// =============================================================================
const PZ0 = -16.6;               // platform edge (north of it the track)
const TRK = -1.1;                // the track bed
const MEZ = 4.2;                 // mezzanine bridge in the transfer hall, and its balcony over the platform
const TX = 13.2;                 // the train: x -13.2..13.2
const TZ0 = -19.8, TZ1 = -16.8;
const flat = { ao: false };
const noCol = { collide: false, ao: false };
const hidden = { visual: false };

function placed(geo, matrix, tile) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(matrix);
  projectUV(g, tile);
  return g;
}
// one of the posters (textures.js POSTERS) on a wall, facing (nx, nz); built in world space, so text never mirrors
function poster(B, i, x, y, z, nx, nz, w = 2.0) {
  const h = w / 2, col = i % 2, row = (i / 2) | 0, Rx = nz, Rz = -nx;   // (R: right, as seen by someone in front of it)
  const P = (s, t) => [x + Rx * s * w / 2 + nx * 0.03, y + t * h / 2, z + Rz * s * w / 2 + nz * 0.03];
  const u0 = col * 0.5 + 0.004, u1 = u0 + 0.492, v1 = 1 - row * 0.25 - 0.004, v0 = v1 - 0.242;
  const a = P(-1, -1), b = P(1, -1), c = P(1, 1), d = P(-1, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1], 2));
  g.computeVertexNormals();
  B.geom(g, 'posters');
  const fx = Math.abs(nz) * (w / 2 + 0.06) + Math.abs(nx) * 0.02, fz = Math.abs(nx) * (w / 2 + 0.06) + Math.abs(nz) * 0.02;
  B.box(x - fx + nx * 0.01, y - h / 2 - 0.06, z - fz + nz * 0.01, x + fx + nx * 0.01, y + h / 2 + 0.06, z + fz + nz * 0.01, 'metalDark', noCol);
}
function tube(b, x0, x1, y, z) { b.box(x0, y - 0.06, z - 0.07, x1, y, z + 0.07, 'lampOn', noCol); }
function tubeZ(b, z0, z1, y, x) { b.box(x - 0.07, y - 0.06, z0, x + 0.07, y, z1, 'lampOn', noCol); }
function vending(b, x0, z0, x1, z1, face = 'neonCyan') {
  b.box(x0, 0, z0, x1, 1.9, z1, 'metalRed', { pen: 0.4 });
  const fx = x1 - x0 < z1 - z0;  // front faces +x/-x when the machine is thin in x
  if (fx) b.box(x1 - 0.02, 0.7, z0 + 0.12, x1 + 0.01, 1.7, z1 - 0.12, face, noCol);
  else b.box(x0 + 0.12, 0.7, z0 - 0.01, x1 - 0.12, 1.7, z0 + 0.02, face, noCol);
}
function bench(b, x0, z0, x1, z1) {
  b.box(x0, 0, z0, x1, 0.45, z1, 'woodDark');
  b.box(x0 + 0.05, 0.45, z0 + 0.05, x1 - 0.05, 0.5, z1 - 0.05, 'metalDark', noCol);
}

export default {
  id: 'nightline',
  name: 'NIGHTLINE',
  desc: 'Endstation der Linie 69 bei Nacht, nach der letzten Bahn. A am Bahnsteig vor dem abgestellten Zug, den man durchlaufen kann. B in der Schalterhalle hinter den Drehkreuzen. Dazwischen die Verteilerhalle mit Galerie und Rolltreppen.',
  size: 'Klein',
  // capture points of the 2 vs 2 mode: [x, floor, z, radius, flag height]; the flags stand on the roofs of the kiosk
  // and the ticket booth. Over each a place to shoot down from: the balcony over the platform, the landing behind the
  // booth (both too narrow, or too hard to get onto, to hold a point on)
  wingman: [[0, 0, -13.1, 4.0, 3.0], [0, 0, 14, 4.2, 3.2]],
  env: {
    sunDir: [0.1, 1, 0.12],
    sunColor: 0xd8e4ff, sunIntensity: 0.4,
    skyTop: 0x0c1020, skyHorizon: 0x1c2234, skyBottom: 0x0c0e14,
    cloudColor: 0x404858, clouds: 0,
    hemiSky: 0xd4dceb, groundColor: 0x7a7068, ambient: 1.35,
    fogColor: 0x2a3038, fogNear: 22, fogFar: 85,
  },
  bounds: { minX: -26, maxX: 26, minZ: -20.5, maxZ: 20.5 },   // (the nav grid's rows then lie at -17.0 and -16.0: a bot climbing out of
                                                               // the track bed has the platform edge in the middle of its step up)
  navTop: 4.6,     // the mezzanine (4.2) and the exit landing (1.8) are floors, ceilings are not
  mmCeiling: 6.5,  // the minimap looks in under the ceilings (7.0), the mezzanine still on it
  // the menu's camera runs up and down the east platform between the pillars and the train: half the time it looks at
  // the train's front, half the time along the train to the platform's end (clear of pillars and train, never blocked)
  menuOrbit: { y: 2.4, r: 6, rz: 1.1, look: [12.5, 2.0, -15.1] },
  // the card in the menu: the same, from a throwaway build of what stands below the ceilings
  previewBoxes() {
    const out = [], keep = (x0, y0, z0, x1, y1, z1, mat, o = {}) => {
      if (o.collide !== false && Math.max(y0, y1) > 0.4 && Math.min(y0, y1) < this.mmCeiling) out.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), Math.max(y0, y1)]);
    };
    const fake = { box: keep, geom() {}, glassPane() {}, pointLight() {} };
    fake.mirrored = () => ({ box: (x0, y0, z0, x1, y1, z1, m, o) => keep(-x1, y0, z0, -x0, y1, z1, m, o), geom() {}, glassPane() {}, pointLight() {}, mirrored: () => fake });
    this.build(fake);
    return out;
  },

  build(B) {
    // ------------------------------------------------------------- floors, the track, ceilings, boundaries
    B.box(-30, -3, PZ0, 30, 0, 24, 'terrazzo');
    B.box(-30, -3, -24, 30, TRK, PZ0, 'ballast');
    B.box(-26, TRK, PZ0 - 0.02, 26, 0.02, PZ0 + 0.35, 'concreteWhite', flat);                       // platform edge
    B.box(-26, 0.02, PZ0 + 0.35, 26, 0.03, PZ0 + 0.65, 'paintYellow', noCol);
    for (const z of [-18.85, -17.75]) B.box(-30, TRK, z - 0.04, 30, TRK + 0.16, z + 0.04, 'metal', noCol);
    for (let x = -29.5; x < 30; x += 1) B.box(x - 0.12, TRK, -19.4, x + 0.12, TRK + 0.08, -17.2, 'woodDark', noCol);
    B.box(-26.4, 7.0, -20.4, 26.4, 7.4, -8.6, 'concreteWhite');                                    // platform hall ceiling
    B.box(-10.4, 8.0, -8.6, 10.4, 8.4, 9.0, 'concreteWhite');                                      // transfer hall
    B.box(-10.4, 7.0, -9.0, 10.4, 8.0, -8.6, 'tilesCream');                                        // (its wall over the platform's ceiling)
    B.box(-10.4, 7.0, 9.0, 10.4, 7.4, 20.4, 'concreteWhite');                                      // ticket hall
    for (const [x0, z0, x1, z1] of [[-30, -24, 30, -9.0], [-30, 9.0, 30, 24], [-30, -9.0, -10.4, 9.0], [10.4, -9.0, 30, 9.0]]) B.box(x0, 7.4, z0, x1, 12, z1, 'concrete', hidden);
    B.box(-10.4, 8.4, -9.0, 10.4, 12, 9.0, 'concrete', hidden);                                     // (the transfer hall reaches higher)
    wallX(B, -26.4, 26.4, -20.2, TRK, 7.0 - TRK, 0.4, 'tilesCream');                               // behind the track
    B.box(-26.8, 0, 20.4, 26.8, 7.4, 20.8, 'tilesCream');                                          // the outer walls
    for (const s of [-1, 1]) B.box(s > 0 ? 26.4 : -26.8, TRK, -20.4, s > 0 ? 26.8 : -26.4, 7.4, 20.8, 'tilesCream');
    boundary(B, -28, -24, 28, -20.4);
    boundary(B, -28, 20.4, 28, 24);
    boundary(B, -28, -24, -26.4, 24);
    boundary(B, 26.4, -24, 28, 24);

    // ------------------------------------------------------------- A: the parked train, walked through by the doors
    B.box(-TX, TRK, TZ0, TX, 0, TZ1, 'metalDark');
    const doors = [-11.4, -7.0, -2.6, 2.6, 7.0, 11.4].map((c) => ({ c, w: 1.6, y: 0, h: 2.05 }));
    wallX(B, -TX, TX, TZ1 - 0.05, 0, 2.35, 0.1, 'trainSilver', doors);
    wallX(B, -TX, TX, TZ0 + 0.05, 0, 2.35, 0.1, 'trainSilver');
    for (const s of [-1, 1]) B.box(s > 0 ? TX - 0.1 : -TX, 0, TZ0, s > 0 ? TX : -TX + 0.1, 2.35, TZ1, 'trainSilver');
    B.box(-TX, 2.35, TZ0, TX, 2.62, TZ1, 'trainSilver');
    B.box(-TX + 0.2, 2.62, TZ0 + 0.3, TX - 0.2, 2.75, TZ1 - 0.3, 'metalDark', noCol);
    B.box(-0.35, 0, TZ0 + 0.1, 0.35, 2.35, -19.0, 'rubber');                                         // the gangway between the cars
    B.box(-0.35, 0, -17.6, 0.35, 2.35, TZ1 - 0.1, 'rubber');
    for (const [x0, x1] of [[-12.9, -0.6], [0.6, 12.9]]) {
      B.box(x0, 0, TZ0 + 0.1, x1, 0.45, -19.25, 'woodRed');                                         // seats along the back
      B.box(x0, 0.45, TZ0 + 0.1, x1, 0.95, -19.6, 'woodRed', noCol);
    }
    for (const x of [-9.2, -4.8, 4.8, 9.2]) B.box(x - 0.03, 0, -18.23, x + 0.03, 2.35, -18.17, 'metal', noCol);
    for (const z of [-18.7, -17.7]) B.box(-12.8, 2.0, z - 0.02, 12.8, 2.04, z + 0.02, 'metal', noCol);
    B.box(-12.8, 2.3, -18.3, 12.8, 2.34, -18.1, 'lampOn', noCol);
    for (const c of [-9.2, -4.8, 0, 4.8, 9.2]) B.box(c - 1.3, 1.0, TZ1 + 0.005, c + 1.3, 1.9, TZ1 + 0.02, 'carGlass', noCol);
    B.box(-TX, 2.08, TZ1 + 0.005, TX, 2.28, TZ1 + 0.03, 'tilesOrange', noCol);                       // the line's orange band
    for (const s of [-1, 1]) {
      B.box(s * (TX + 0.01) - 0.02, 1.2, TZ0 + 0.5, s * (TX + 0.01) + 0.02, 2.0, TZ1 - 0.5, 'carGlass', noCol);
      for (const z of [TZ0 + 0.4, TZ1 - 0.4]) B.box(s * (TX + 0.02) - 0.03, 0.5, z - 0.15, s * (TX + 0.02) + 0.03, 0.75, z + 0.15, 'lampOn', noCol);
    }
    poster(B, 0, -TX - 0.03, 2.25, -18.3, -1, 0, 1.6);                                               // destination signs
    poster(B, 0, TX + 0.03, 2.25, -18.3, 1, 0, 1.6);
    // the kiosk in the middle of the platform, the flag on its roof
    B.box(-1.2, 0, -13.9, 1.2, 2.85, -12.3, 'metalDark');
    B.box(-1.4, 2.85, -14.1, 1.4, 3.0, -12.1, 'metalRed', flat);
    for (const s of [-1, 1]) B.box(-1.1, 0.9, s > 0 ? -12.29 : -13.93, 1.1, 1.9, s > 0 ? -12.27 : -13.91, 'woodDark', noCol);
    B.box(-1.1, 0.95, -12.27, 1.1, 1.0, -12.0, 'metalDark', noCol);
    for (let k = 0; k < 6; k++) B.box(-1.0 + k * 0.34, 1.0, -12.25, -0.75 + k * 0.34, 1.32, -12.23, k % 2 ? 'metalRed' : 'paintYellow', noCol);
    // departure boards hanging over the platform, the platform lights
    for (const s of [-1, 1]) {
      const x = s * 7.6;
      B.box(x - 1.0, 3.6, -14.3, x + 1.0, 4.2, -14.05, 'black', noCol);
      poster(B, 2, x, 3.9, -14.05, 0, 1, 1.0);
      poster(B, 2, x, 3.9, -14.3, 0, -1, 1.0);
      B.box(x - 0.03, 4.2, -14.2, x + 0.03, 7.0, -14.15, 'metalDark', noCol);
    }
    for (let x = -22; x <= 22; x += 4) tube(B, x - 1.2, x + 1.2, 6.95, -13.6);
    B.pointLight(-8, 5.5, -13.5, 0xe8f0ff, 3.4, 16);
    B.pointLight(8, 5.5, -13.5, 0xe8f0ff, 3.4, 16);
    B.pointLight(0, 1.6, -18.3, 0xfff0d8, 1.6, 9);
    for (const s of [-1, 1]) {
      poster(B, 5, s * 9.0, 2.0, -9.0, 0, -1, 2.0);
      poster(B, 0, s * 20.0, 2.6, -9.0, 0, -1, 2.4);
      poster(B, 4, s * 13.5, 1.4, -11.2, 0, -1, 1.1);
      poster(B, 1, s * 4.6, 4.95, -11.05, 0, -1, 1.4);                                            // under the balcony edge...
    }

    // ------------------------------------------------------------- middle: the transfer hall, its mezzanine and escalators
    B.box(-10, MEZ - 0.2, -2.4, 10, MEZ, 1.4, 'terrazzo');
    B.box(-8.0, MEZ - 0.2, 1.4, 8.0, MEZ, 2.4, 'terrazzo');                                        // (the escalators end in its corners)
    B.box(-6.6, MEZ - 0.2, -11.0, 6.6, MEZ, -2.4, 'terrazzo');
    railing(B, -6.6, -11.0, 6.6, -11.0, 1.05, 'metal', true, MEZ);
    railing(B, -8.0, 2.4, 8.0, 2.4, 1.05, 'metal', true, MEZ);
    for (const [x, z] of [[-3.3, 2.15], [3.3, 2.15], [-3.3, -2.15], [3.3, -2.15], [-6.35, -5.5], [6.35, -5.5]]) B.box(x - 0.25, 0, z - 0.25, x + 0.25, MEZ - 0.2, z + 0.25, 'tilesCream');
    // the big column with ads in the middle, the network map that stops the long look across the hall
    B.geom(placed(new THREE.CylinderGeometry(0.62, 0.62, 2.9, 16), mtx(0, 1.45, 0), 1.2), 'tilesOrange');
    for (const [hx, hz] of [[0.44, 0.44], [0.62, 0.26], [0.26, 0.62]]) B.box(-hx, 0, -hz, hx, 2.9, hz, 'tilesOrange', hidden);   // (round, near enough)
    B.box(-0.51, 2.9, -0.51, 0.51, 3.1, 0.51, 'metalDark', hidden);
    B.geom(new THREE.CylinderGeometry(0.72, 0.72, 0.2, 16), 'metalDark', mtx(0, 3.0, 0));
    B.box(-1.3, 0, -6.0, 1.3, 2.3, -5.6, 'metalDark');
    poster(B, 4, 0, 1.4, -5.6, 0, 1, 2.2);
    poster(B, 0, 0, 1.4, -6.0, 0, -1, 2.2);
    for (let x = -8; x <= 8; x += 4) tube(B, x - 1.2, x + 1.2, 7.95, -5.2), tube(B, x - 1.2, x + 1.2, 7.95, 5.2);
    for (let x = -8; x <= 8; x += 4) tube(B, x - 1.0, x + 1.0, MEZ - 0.2, 0);
    B.pointLight(0, 6.5, 0, 0xffe8c8, 3.6, 18);
    B.box(-4.0, 7.2, 8.56, 4.0, 7.5, 8.6, 'neonPink', noCol);                                       // a neon line over the south doors
    poster(B, 4, 0, 5.6, 8.58, 0, -1, 3.2);
    poster(B, 1, 0, MEZ + 1.2, -10.96, 0, 1, 1.6);                                                 // ...and on the balcony

    // ------------------------------------------------------------- B: the ticket hall
    B.box(-1.6, 0, 13.0, 1.6, 0.9, 15.0, 'metalDark');                                              // the ticket booth
    for (const [x0, z0, x1, z1] of [[-1.6, 12.97, 1.6, 13.03], [-1.6, 14.97, 1.6, 15.03], [-1.63, 13.0, -1.57, 15.0], [1.57, 13.0, 1.63, 15.0]]) B.glassPane(x0, 0.9, z0, x1, 2.9, z1);
    for (const [x, z] of [[-1.6, 13.0], [1.6, 13.0], [-1.6, 15.0], [1.6, 15.0]]) B.box(x - 0.06, 0.9, z - 0.06, x + 0.06, 2.9, z + 0.06, 'metalDark', noCol);
    B.box(-1.75, 2.9, 12.85, 1.75, 3.2, 15.15, 'metalDark');
    B.box(-1.4, 0.9, 13.6, 1.4, 1.0, 14.4, 'woodDark', noCol);                                     // inside: desk and screen
    B.box(-0.3, 1.0, 14.0, 0.3, 1.4, 14.06, 'screen', noCol);
    poster(B, 3, 0, 2.5, 12.85, 0, -1, 1.6);
    poster(B, 3, 0, 2.5, 15.15, 0, 1, 1.6);
    // turnstiles: a barrier across the hall with four gates
    for (const [x0, x1] of [[-10, -7.8], [-6.2, -3.4], [-1.8, 1.8], [3.4, 6.2], [7.8, 10]]) {
      B.box(x0, 0, 11.0, x1, 1.05, 11.3, 'metalDark', { pen: 0.4 });
      B.box(x0, 1.05, 11.12, x1, 1.08, 11.18, 'neonCyan', noCol);
    }
    for (const x of [-7.8, -6.2, -3.4, -1.8, 1.8, 3.4, 6.2, 7.8]) B.box(x - 0.12, 0, 10.9, x + 0.12, 1.15, 11.4, 'metal', { pen: 0.4 });
    // the landing in front of the closed street exit, the shutter
    B.box(-7.6, 0, 17.2, 7.6, 1.8, 20.4, 'terrazzo');
    railing(B, -6.0, 17.2, 6.0, 17.2, 1.05, 'metal', true, 1.8);
    B.box(-3.2, 1.8, 20.34, 3.2, 5.2, 20.4, 'corrugated', noCol);
    poster(B, 6, 0, 5.8, 20.4, 0, -1, 2.4);
    for (let x = -8; x <= 8; x += 4) tube(B, x - 1.2, x + 1.2, 6.95, 12.4), tube(B, x - 1.2, x + 1.2, 6.95, 16.6);
    B.pointLight(0, 5.4, 13.0, 0xfff0d8, 3.4, 16);
    B.box(-3.0, 6.5, 20.34, 3.0, 6.75, 20.4, 'neonYellow', noCol);
    for (const s of [-1, 1]) {
      poster(B, 3, s * 2.6, 2.0, 9.0, 0, 1, 1.8);
      poster(B, 7, s * 5.2, 3.4, 20.4, 0, -1, 2.0);
    }

    for (const b of [B, B.mirrored()]) this.half(b);
    // posters of the side rooms, placed here so their text doesn't mirror
    for (const s of [-1, 1]) {
      poster(B, 1, s * 12.2, 2.2, -8.6, 0, 1, 1.8);
      poster(B, 2, s * 18.6, 2.0, 4.5, -s, 0, 1.8);
      poster(B, 7, s * 11.6, 2.95, 13.0, 0, -1, 1.6);
      poster(B, 5, s * 24.0, 2.0, 13.0, 0, -1, 1.6);
      poster(B, 4, s * 10.4, 2.4, -2.0, s, 0, 2.0);
      poster(B, 6, s * 26.4, 2.6, 0, -s, 0, 1.6);
    }
  },

  // the west half (team 0); the east half is its mirror image
  half(b) {
    // ------------------------------------------------------------- the platform hall's south wall: doors, the balcony's opening
    const zw = -8.8;
    b.box(-26.4, 0, zw - 0.2, -25.4, 7.0, zw + 0.2, 'tilesCream');
    b.box(-25.4, 2.4, zw - 0.2, -23.4, 7.0, zw + 0.2, 'tilesCream');                               // base door
    b.box(-23.4, 0, zw - 0.2, -15.8, 7.0, zw + 0.2, 'tilesCream');
    b.box(-15.8, 2.4, zw - 0.2, -14.2, 7.0, zw + 0.2, 'tilesCream');                               // concourse door
    b.box(-14.2, 0, zw - 0.2, -6.6, 7.0, zw + 0.2, 'tilesCream');
    b.box(-6.6, 2.4, zw - 0.2, -5.0, MEZ - 0.2, zw + 0.2, 'tilesCream');                           // transfer hall door
    b.box(-5.0, 0, zw - 0.2, 0, MEZ - 0.2, zw + 0.2, 'tilesCream');
    for (const [x0, x1] of [[-26.4, -25.4], [-23.4, -15.8], [-14.2, -10.4]]) b.box(x0, 0, zw + 0.2, x1, 1.2, zw + 0.24, 'tilesOrange', noCol);   // orange tile band (not across the doors)
    // the platform: pillars, benches, bins, an ad pillar
    for (const x of [-4.6, -10.4, -16.4]) b.box(x - 0.3, 0, -13.1, x + 0.3, 7.0, -12.5, 'tilesOrange');
    bench(b, -8.4, -13.3, -6.8, -12.3);
    bench(b, -20.0, -13.3, -18.4, -12.3);
    b.box(-13.9, 0, -11.2, -13.1, 2.5, -10.0, 'metalDark');
    b.geom(new THREE.CylinderGeometry(0.25, 0.25, 0.9, 10), 'metalDark', mtx(-11.6, 0.45, -10.0));
    b.box(-11.85, 0, -10.25, -11.35, 0.9, -9.75, 'metalDark', hidden);
    // the tunnel mouth at the end of the track, dark behind a grille
    b.box(-24.6, 2.6, -20.2, -23.4, 7.0, -16.6, 'tilesCream');
    b.box(-26.4, TRK, -20.2, -24.6, 7.0, -16.6, 'black');
    for (let z = -19.8; z < -16.6; z += 0.25) b.box(-23.42, TRK, z - 0.02, -23.38, 2.6, z + 0.02, 'metalDark', noCol);
    b.box(-23.42, 2.45, -20.0, -23.38, 2.6, -16.6, 'metalDark', noCol);
    b.box(-23.42, TRK, -20.0, -23.3, 2.6, -16.6, 'metalDark', { visual: false, noBullet: true, pen: 1 });
    // ------------------------------------------------------------- the transfer hall's west side: wall, escalator
    wallZ(b, -8.6, 9.0, -10.2, 0, 8.0, 0.4, 'tilesCream', [{ c: -5.8, w: 1.6, y: 0, h: 2.4 }]);
    stairs(b, -8.8, 7.2, '-z', 1.6, MEZ, 5.8, 'metalDark');                                        // (room to step on at its foot)
    const ang = Math.atan2(MEZ, 5.8), len = Math.hypot(5.8, MEZ);
    for (const x of [-9.65, -7.95]) {
      b.geom(placed(new THREE.BoxGeometry(0.1, 0.9, len), mtx(x, MEZ / 2 + 0.75, 4.3, 0, 1, 1, 1, ang), 1), 'metal');                       // steel sides,
      b.geom(placed(new THREE.BoxGeometry(0.16, 0.1, len + 0.2).translate(0, 0.5, 0), mtx(x, MEZ / 2 + 0.75, 4.3, 0, 1, 1, 1, ang), 1), 'rubber');  // the handrail
      for (let k = 0; k < 17; k++) b.box(x - 0.05, 0, 7.2 - (k + 1) * 5.8 / 17, x + 0.05, MEZ * (k + 1) / 17 + 1.35, 7.2 - k * 5.8 / 17, 'metal', { visual: false, noBullet: true, pen: 1 });   // (up to the handrail, step by step)
    }
    railing(b, -10, -2.4, -6.6, -2.4, 1.05, 'metal', true, MEZ);
    railing(b, -6.6, -11.0, -6.6, -2.4, 1.05, 'metal', true, MEZ);
    wallX(b, -10, 0, 8.8, 0, 8.0, 0.4, 'tilesCream', [{ c: -5.8, w: 1.6, y: 0, h: 2.4 }]);
    vending(b, -9.95, -8.2, -9.35, -7.0, 'neonCyan');
    vending(b, -9.95, -4.2, -9.35, -3.0, 'neonPink');
    bench(b, -5.6, 5.6, -4.0, 6.4);
    // ------------------------------------------------------------- the ticket hall's west side
    wallZ(b, 9.0, 20.4, -10.2, 0, 7.0, 0.4, 'tilesOrange', [{ c: 10.2, w: 1.6, y: 0, h: 2.4 }, { c: 16.4, w: 1.6, y: 0, h: 2.4 }]);
    stairs(b, -6.8, 14.4, '+z', 1.6, 1.8, 2.8, 'metalDark');
    for (const [z0, z1] of [[12.0, 13.0], [13.6, 14.6]]) {
      b.box(-9.95, 0, z0, -9.35, 1.8, z1, 'metalDark', { pen: 0.4 });
      b.box(-9.36, 1.0, z0 + 0.15, -9.33, 1.5, z1 - 0.15, 'screen', noCol);
    }
    b.box(-9.95, 0, 18.0, -8.6, 1.0, 19.2, 'metalDark');
    // ------------------------------------------------------------- the concourse between base and transfer hall
    b.box(-18.6, 3.8, -8.6, -10.4, 4.1, 9.0, 'concreteWhite');
    wallX(b, -18.6, -10.4, 9.2, 0, 3.8, 0.4, 'tilesCream', [{ c: -15.0, w: 1.6, y: 0, h: 2.4 }]);
    b.box(-16.2, 0, -1.6, -12.8, 2.6, 1.6, 'metalDark');                                           // the closed newsstand
    b.box(-16.3, 2.6, -1.7, -12.7, 2.75, 1.7, 'metalRed', flat);
    for (const x of [-16.22, -12.78]) b.box(x - 0.02, 0.2, -1.4, x + 0.02, 2.4, 1.4, 'corrugated', noCol);
    vending(b, -12.4, 7.4, -11.0, 8.0);
    vending(b, -18.2, -6.0, -17.6, -4.6, 'neonYellow');
    bench(b, -17.6, 2.8, -16.8, 4.4);
    for (let z = -6; z <= 6; z += 4) tubeZ(b, z - 1.2, z + 1.2, 3.75, -14.5);
    b.pointLight(-14.5, 3.2, 4.5, 0xd8f0ff, 1.8, 9);
    b.box(-18.4, 2.9, -8.4, -10.6, 3.05, -8.3, 'neonCyan', noCol);
    // ------------------------------------------------------------- the base: a staff room, doors at its outer corners
    wallZ(b, -8.6, 8.6, -18.8, 0, 3.8, 0.4, 'tilesCream');
    wallX(b, -26.4, -18.6, 8.8, 0, 3.8, 0.4, 'tilesCream', [{ c: -24.4, w: 2.0, y: 0, h: 2.4 }]);
    b.box(-26.4, 3.8, -8.6, -18.6, 4.1, 9.0, 'concreteWhite');
    b.box(-26.4, 0, -8.6, -18.6, 0.015, 8.6, 'concreteFloor', flat);
    for (let z = -6.4; z <= 6.4; z += 0.8) b.box(-26.4, 0, z - 0.38, -25.9, 2.0, z + 0.38, z < -4 || z > 4 ? 'contBlue' : 'metalDark', { pen: 0.5 });
    for (const s of [-1, 1]) b.box(-24.2, 0, s * 5.0 - 0.7, -22.8, 1.6, s * 5.0 + 0.7, 'grate', { pen: 1 });   // tool cages by the doors
    b.box(-23.0, 0, -1.0, -21.6, 0.78, 1.0, 'woodPale');
    for (let z = -4; z <= 4; z += 4) tubeZ(b, z - 1.0, z + 1.0, 3.75, -22.4);
    b.pointLight(-22.4, 3.0, 0, 0xe8f4ff, 2.0, 9);
    // ------------------------------------------------------------- south: the corridor from the base, the shop, the toilets
    b.box(-26.4, 3.6, 9.0, -10.4, 3.9, 20.4, 'concreteWhite');
    wallX(b, -26.4, -10.4, 13.2, 0, 3.6, 0.4, 'tilesCream', [{ c: -13.8, w: 1.6, y: 0, h: 2.4 }, { c: -11.6, w: 1.6, y: 0.9, h: 1.5 }, { c: -22.0, w: 1.0, y: 0, h: 2.1 }]);
    b.glassPane(-12.4, 0.9, 13.18, -10.8, 2.4, 13.22);
    b.box(-22.5, 0, 13.0, -21.5, 2.1, 13.02, 'woodBlue', noCol);
    b.box(-22.6, 0, 13.4, -21.4, 2.1, 14.0, 'tilesCream', hidden);
    wallZ(b, 13.4, 20.4, -16.8, 0, 3.6, 0.4, 'tilesCream');
    b.box(-26.4, 0, 13.4, -17.0, 3.6, 20.4, 'tilesCream', hidden);                                  // (the toilets, closed)
    for (const z of [15.0, 17.6]) b.box(-16.6, 0, z - 0.5, -15.2, 1.7, z + 0.5, 'metalDark', { pen: 0.4 });   // shop shelves
    b.box(-14.0, 0, 18.2, -11.4, 1.1, 19.0, 'pinewood');
    b.box(-11.0, 0, 18.4, -10.4, 1.9, 19.6, 'metalWhite');
    b.box(-11.02, 0.3, 18.5, -10.98, 1.8, 19.5, 'neonCyan', noCol);
    b.pointLight(-13.5, 2.8, 16.5, 0xfff0c8, 1.8, 8);
    b.box(-16.6, 3.0, 13.4, -10.4, 3.12, 13.44, 'neonPink', noCol);
    for (let x = -24; x <= -12; x += 4) tube(b, x - 1.0, x + 1.0, 3.55, 11.0);
    b.box(-26.4, 0, 9.0, -18.6, 0.015, 13.0, 'concreteFloor', flat);
  },

  spawns() {
    const west = [[-21.0, 0, -5.6], [-19.8, 0, -3.0], [-21.0, 0, -0.6], [-19.8, 0, 2.0], [-21.0, 0, 4.6], [-22.6, 0, 2.6]];
    return { 0: west.map(([x, y, z]) => [x, y, z, -Math.PI / 2]), 1: west.map(([x, y, z]) => [-x, y, z, Math.PI / 2]) };
  },

  hotspots: [
    [-4, 0, -12.7], [4, 0, -12.7], [0, 0, -15.6], [-6, 0, -18.2], [6, 0, -18.2], [-4, MEZ, -10], [4, MEZ, -10],
    [0, MEZ, 0], [-5, 0, 3], [5, 0, 3], [0, 0, -7.2], [-5, 0, -3],
    [-4, 0, 14], [4, 0, 14], [0, 1.8, 18.6], [-6.5, 0, 10.2], [6.5, 0, 10.2],
    [-14.5, 0, -4], [14.5, 0, -4], [-18, 0, 11], [18, 0, 11], [-13.5, 0, 16.5], [13.5, 0, 16.5], [-18, 0, -12.7], [18, 0, -12.7],
  ],
};
