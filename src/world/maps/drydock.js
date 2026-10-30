import * as THREE from 'three';
import { wallX, wallZ, stairs, container, crate, barrel, pallet, sandbags, barrier, truck, forklift, lampPost, bollard, railing, slab, mtx, car } from '../props.js';

// =============================================================================
// DRYDOCK — harbor at golden hour. Medium size, classic three-lane layout.
//   North lane  : open quay along the water. Long sightlines, broken up by a
//                 gantry crane, a center container and crate clusters.
//   Middle lane : two-floor warehouse. CQB on the ground floor (racks, crates),
//                 catwalks with windows over both outer lanes + a center bridge.
//   South lane  : container yard. Mid range, alleys, climbable stacks.
// The map is mirror-symmetric across x = 0 so both teams have identical routes.
// Each side has two "power positions" (office upper floor / pump house roof),
// each countered by its mirror twin and by the warehouse catwalk windows.
// =============================================================================

export default {
  id: 'drydock',
  name: 'DRYDOCK',
  desc: 'Hafen bei Sonnenuntergang. Lange Kai-Lane, Lagerhalle mit Laufstegen, Container-Hof.',
  size: 'Mittel',
  env: {
    sunDir: [-0.5, 0.52, -0.38],
    sunColor: 0xffd8a8, sunIntensity: 3.3,
    skyTop: 0x5a7fb0, skyHorizon: 0xf0b888, skyBottom: 0x6a5a50,
    cloudColor: 0xffe2c8, clouds: 0.55,
    hemiSky: 0xb4bcc8, groundColor: 0x8a7a64, ambient: 1.5,
    fogColor: 0xd8a888, fogNear: 50, fogFar: 260,
  },
  bounds: { minX: -46, maxX: 46, minZ: -31, maxZ: 34 },

  build(B) {
    // ------------------------------------------------------------- global
    B.box(-46, -1, -27, 46, 0, 34, 'asphalt');
    B.box(-46, -1, -31, 46, 0, -27, 'concreteFloor');
    B.box(-46, -4.5, -31.6, 46, -1, -31, 'concreteDark', { collide: false });
    // painted lines on the quay
    for (let x = -44; x < 44; x += 6) B.box(x, 0, -27.12, x + 3.2, 0.012, -26.95, 'paintYellow', { collide: false, ao: false });
    // water
    B.box(-260, -1.75, -260, 260, -1.65, -31.6, 'water', { collide: false, ao: false });
    railing(B, -46, -30.8, 46, -30.8, 1.05, 'metalYellow');
    B.box(-46, -2, -34, 46, 30, -31.05, 'concrete', { visual: false });
    // south boundary: warehouse facades
    B.box(-48, 0, 34, 48, 9, 38, 'brickDark');
    for (let x = -40; x <= 40; x += 10) B.box(x - 1.6, 0, 33.9, x + 1.6, 4.2, 34.02, 'metalDark', { collide: false, ao: false });
    B.box(-48, 9, 33.6, 48, 9.4, 38, 'concreteDark', { collide: false });

    // ship moored at the quay (landmark, not reachable)
    B.box(-34, -1.7, -51, 22, 3.5, -39, 'metalRed', { collide: false });
    B.box(-34, 3.5, -51, 22, 7.2, -39, 'metalDark', { collide: false });
    B.box(-32, 7.2, -50, 20, 7.5, -40, 'metal', { collide: false, ao: false });
    B.box(8, 7.5, -49, 19, 17, -41, 'contWhite', { collide: false });
    for (let y = 9; y < 16.5; y += 2.2) B.box(8, y, -41.06, 19, y + 0.7, -40.98, 'carGlass', { collide: false, ao: false });
    B.box(13, 17, -46, 14, 22, -45, 'metalDark', { collide: false });
    for (let i = 0; i < 5; i++) container(B, -26 + i * 6.4, -45, 'z', ['contRed', 'contBlue', 'contGreen', 'contOrange', 'contWhite'][i], 7.5);
    for (let i = 0; i < 3; i++) container(B, -22 + i * 6.4, -45, 'z', ['contGrey', 'contOrange', 'contBlue'][i], 10.1);

    // ------------------------------------------------------------- center pieces (built once)
    // north lane: gantry crane over the quay + center container
    for (const x of [-6, 6]) for (const z of [-29.4, -19.6]) {
      B.boxC(x, z, 0.9, 0.9, 0, 15, 'metalYellow');
    }
    B.box(-6.5, 15, -30, 6.5, 16.2, -29, 'metalYellow', { collide: false });
    B.box(-6.5, 15, -20, 6.5, 16.2, -19, 'metalYellow', { collide: false });
    B.box(-1.2, 15, -30, 1.2, 16.4, -19, 'metalYellow', { collide: false });
    B.box(-1.6, 12.6, -26.5, 1.6, 15, -23.5, 'metalDark', { collide: false });
    B.box(-1.62, 13.6, -26.52, 1.62, 14.6, -23.48, 'carGlass', { collide: false, ao: false });
    B.box(-6.5, 0.8, -29.9, 6.5, 1.1, -29.0, 'metalYellow', { ao: false });
    container(B, 0, -24.8, 'x', 'contGrey');
    crate(B, -1.4, -22.4, 1.2);
    // warehouse bridge between the catwalks
    B.box(-1.2, 3.5, -8.6, 1.2, 3.7, 8.6, 'metal', { ao: false });
    railing(B, -1.2, -8.6, -1.2, 8.6, 1.05, 'metalDark', true, 3.7);
    railing(B, 1.2, -8.6, 1.2, 8.6, 1.05, 'metalDark', true, 3.7);
    // center cover under the bridge
    crate(B, 0, 0, 1.2);
    crate(B, 0, 0, 1.0, 1.2);
    // south: shared landing for the outer stairs + upper door
    B.box(-2.4, 3.4, 11.2, 2.4, 3.6, 13.2, 'metal', { ao: false });
    railing(B, -2.4, 13.2, 2.4, 13.2, 1.05, 'metalDark', true, 3.6);
    // south yard center
    container(B, 0, 30.6, 'x', 'contWhite');
    container(B, 0, 30.6, 'x', 'contOrange', 2.6);
    crate(B, 0, 23.5, 1.2); crate(B, 1.25, 23.5, 1.2); crate(B, 0.6, 23.5, 1.2, 1.2);

    // ------------------------------------------------------------- mirrored halves
    for (const b of [B, B.mirrored()]) this.half(b, b === B);
  },

  half(b, west) {
    const landmark = west ? 'contRed' : 'contBlue';
    const officeMat = west ? 'brick' : 'plasterBlue';

    // ---- boundary wall
    b.box(-48, 0, -31, -46, 4.5, 34, 'concreteDark');
    b.box(-48, 4.5, -31, -46, 30, 34, 'concrete', { visual: false });

    // ================= NW office (power position over the quay) =================
    const ox0 = -46, ox1 = -37, oz0 = -27, oz1 = -18;
    b.box(ox0, 0, oz0, ox1, 0.06, oz1, 'tiles', { ao: false });
    wallX(b, ox0, ox1, oz0, 0, 6.4, 0.3, officeMat, [{ c: -41.5, w: 1.6, y: 4.1, h: 1.3 }]);
    wallZ(b, oz0, oz1, ox1, 0, 6.4, 0.3, officeMat, [
      { c: -22.6, w: 1.4, y: 0, h: 2.3 }, { c: -25.4, w: 1.4, y: 1.0, h: 1.2 },
      { c: -25.2, w: 1.6, y: 4.1, h: 1.3 }, { c: -20.6, w: 1.6, y: 4.1, h: 1.3 }]);
    wallX(b, ox0, ox1, oz1, 0, 6.4, 0.3, officeMat, [
      { c: -44.6, w: 1.4, y: 0, h: 2.3 }, { c: -43.6, w: 1.4, y: 4.1, h: 1.3 }, { c: -39.2, w: 1.4, y: 4.1, h: 1.3 }]);
    // upper floor with stair hole
    b.box(ox0, 3.2, oz0 + 0.15, ox1 - 0.15, 3.45, -19.8, 'concreteDark', { ao: false });
    b.box(ox0, 3.2, -19.8, -42.8, 3.45, oz1 - 0.15, 'concreteDark', { ao: false });
    b.box(ox0, 3.45, oz0 + 0.15, ox1 - 0.15, 3.47, -19.8, 'woodPale', { collide: false, ao: false });
    stairs(b, -38.0, -18.95, '-x', 1.5, 3.2, 4.8, 'concreteDark');
    railing(b, -42.8, -19.85, -37.3, -19.85, 1.0, 'metalDark', true, 3.45);
    b.box(ox0 - 0.0, 6.4, oz0 - 0.15, ox1 + 0.15, 6.7, oz1 + 0.15, 'concreteDark');
    b.box(ox1 - 0.1, 6.7, oz0 - 0.15, ox1 + 0.15, 7.3, oz1 + 0.15, officeMat);
    // furniture
    b.box(-45.6, 0, -26.6, -44.2, 0.8, -23.6, 'woodDark');
    b.box(-42.5, 0, -24, -40.5, 0.78, -23.2, 'woodDark');
    b.box(-45.6, 3.45, -26.6, -45.0, 5.2, -24, 'metal');
    b.box(-40.5, 3.45, -26.4, -38.2, 4.25, -25.6, 'woodDark');
    b.box(-44.5, 3.45, -21.5, -43.0, 4.25, -20.3, 'woodDark');
    b.pointLight(-41.5, 2.8, -23, 0xffe8c0, 3, 9);
    b.box(-42, 3.05, -23.2, -41, 3.15, -22.8, 'lampOn', { collide: false, ao: false });
    // outside: stacked containers shielding the spawn from the quay
    container(b, -33.5, -22.5, 'z', landmark);
    container(b, -33.5, -22.5, 'z', landmark, 2.6);
    crate(b, -31.8, -26.4, 1.2);
    barrel(b, -35.6, -18.6, 'metalRed'); barrel(b, -35.0, -17.9, 'metalDark');

    // ================= North lane (quay), west part =================
    for (const x of [-42, -34, -26, -18, -11]) bollard(b, x, -29.9);
    container(b, -24.5, -21.0, 'x', 'contGreen');
    crate(b, -20.6, -21.3, 1.2);
    crate(b, -17.2, -28.0, 1.2); crate(b, -16.0, -28.0, 1.2); crate(b, -16.6, -28.0, 1.2, 1.2);
    pallet(b, -29.2, -28.6); pallet(b, -29.2, -28.6, 0.14);
    barrier(b, -11.5, -22.8, 'x', 3.2);
    // cable reels
    b.box(-4.0, 0, -28.4, -2.6, 1.4, -26.2, 'woodDark', { visual: false });
    b.geom(new THREE.CylinderGeometry(0.7, 0.7, 1.4, 16), 'woodDark', mtx(-3.3, 0.7, -27.3, 0, 1, 1, 1, Math.PI / 2));
    lampPost(b, -30, -19.4, 6.5, [0, -1]);

    // ================= Warehouse, west half =================
    const wt = 0.4, wh = 7.0;
    b.box(-15, 0, -11, 0, 0.04, 11, 'concreteFloor', { ao: false });
    // west wall: big door + side door + high windows
    wallZ(b, -11, 11, -15, 0, wh, wt, 'corrugated', [
      { c: 0, w: 5.0, y: 0, h: 4.2 }, { c: -7.6, w: 1.4, y: 0, h: 2.3 }, { c: 6.2, w: 2.0, y: 4.6, h: 1.2 }]);
    // north wall: door to the quay, low window, catwalk windows
    wallX(b, -15, 0, -11, 0, wh, wt, 'corrugated', [
      { c: -9.2, w: 1.6, y: 0, h: 2.4 }, { c: -3.6, w: 2.0, y: 1.1, h: 1.1 },
      { c: -11.4, w: 1.8, y: 4.5, h: 1.3 }, { c: -5.2, w: 1.8, y: 4.5, h: 1.3 }]);
    // south wall: door to the yard, low window, catwalk windows, upper door (center)
    wallX(b, -15, 0, 11, 0, wh, wt, 'corrugated', [
      { c: -4.2, w: 1.6, y: 0, h: 2.4 }, { c: -10.2, w: 2.0, y: 1.1, h: 1.1 },
      { c: -12.0, w: 1.8, y: 4.5, h: 1.3 }, { c: -7.4, w: 1.8, y: 4.5, h: 1.3 }, { c: 0, w: 1.8, y: 3.6, h: 2.3 }]);
    b.glassPane(-4.6, 1.1, -11.03, -2.6, 2.2, -10.97);
    b.box(-15.3, wh, -11.3, 0, wh + 0.3, 11.3, 'metalDark');
    // trim stripe
    b.box(-15.22, 3.0, -11.22, -14.78, 3.25, 11.22, 'metalDark', { collide: false, ao: false });
    // catwalks
    b.box(-14.8, 3.5, -10.8, 0, 3.7, -8.6, 'metal', { ao: false });
    b.box(-14.8, 3.5, 8.6, 0, 3.7, 10.8, 'metal', { ao: false });
    railing(b, -12.4, -8.6, -1.2, -8.6, 1.05, 'metalDark', true, 3.7);
    railing(b, -14.8, 8.6, -1.2, 8.6, 1.05, 'metalDark', true, 3.7);
    // north catwalk stairs (inside, along the west wall)
    stairs(b, -13.65, -2.9, '-z', 1.8, 3.6, 4.7, 'metal');
    b.box(-14.8, 3.5, -8.6, -12.4, 3.7, -7.6, 'metal', { ao: false });
    // support pillars
    for (const z of [-8.6, 8.6]) for (const x of [-12.5, -6.5]) b.boxC(x, z + (z < 0 ? 0.15 : -0.15), 0.3, 0.3, 0, 3.5, 'metalDark');
    // outer stairs on the south facade up to the shared landing
    stairs(b, -8.2, 12.2, '+x', 1.8, 3.6, 5.8, 'metal');
    // ground floor cover: racks (aisles), crates, forklift
    for (const z of [-4.2, 4.2]) {
      b.box(-11.2, 0, z - 0.5, -6.2, 0.15, z + 0.5, 'metalDark', { ao: false });
      b.box(-11.2, 0.15, z - 0.5, -6.2, 2.7, z + 0.5, 'metal', { visual: false, pen: 0.4 });
      for (const y of [0.15, 1.0, 1.85, 2.6]) b.box(-11.2, y, z - 0.5, -6.2, y + 0.08, z + 0.5, 'metalYellow', { collide: false, ao: false });
      for (const x of [-11.2, -8.7, -6.2]) b.box(x - 0.05, 0, z - 0.5, x + 0.05, 2.7, z + 0.5, 'metalDark', { collide: false, ao: false });
      crate(b, -10.3, z, 0.8, 0.23); crate(b, -9.3, z, 0.75, 1.08); crate(b, -7.3, z, 0.8, 0.23); crate(b, -8.0, z, 0.7, 1.93);
    }
    crate(b, -3.6, -1.6, 1.2); crate(b, -3.6, 1.6, 1.2);
    forklift(b, -10.5, 0.2, Math.PI / 2);
    pallet(b, -13.5, 6.5); crate(b, -13.5, 6.5, 1.0, 0.14);
    barrel(b, -14.2, -9.8, 'metalYellow'); barrel(b, -13.5, -10.2, 'metalYellow');
    // ceiling lights
    for (const z of [-5, 5]) {
      b.box(-9.5, 6.6, z - 0.15, -5.5, 6.7, z + 0.15, 'lampOn', { collide: false, ao: false });
    }
    b.pointLight(-7.5, 5.8, 0, 0xe8f0ff, 4, 14);

    // ================= West connector / spawn yard =================
    truck(b, -25.5, -7.5, 'z', west ? 'carPaintRed' : 'carPaintBlue', -1);
    barrier(b, -20.5, 5.2, 'z', 3.2);
    sandbags(b, -19.5, -15.2, 3.0, 'x', 1.0);
    container(b, -29.5, 9.5, 'x', landmark);
    crate(b, -26.0, 11.8, 1.2);
    car(b, -40.5, 3.0, 'z', west ? 'carPaintGreen' : 'carPaintWhite');
    lampPost(b, -20, -12, 6.5, [1, 0]);
    lampPost(b, -20, 13.5, 6.5, [1, 0]);
    barrel(b, -36.2, -6.6, 'metalDark'); barrel(b, -36.8, -5.9, 'metalRed');
    pallet(b, -38.5, -11.5);

    // ================= SW pump house (roof = power position over the yard) =================
    const px0 = -46, px1 = -38.6, pz0 = 19.8, pz1 = 27.2;
    wallZ(b, pz0, pz1, px1, 0, 3.4, 0.3, 'concrete', [{ c: 23.5, w: 1.4, y: 0, h: 2.3 }]);
    wallX(b, px0, px1, pz0, 0, 3.4, 0.3, 'concrete', [{ c: -43.0, w: 1.4, y: 1.1, h: 0.9 }]);
    wallX(b, px0, px1, pz1, 0, 3.4, 0.3, 'concrete', []);
    b.box(px0, 3.4, pz0 - 0.15, px1 + 0.15, 3.6, pz1 + 0.15, 'concreteDark');
    // parapet with a gap above the crates
    b.box(px1 - 0.1, 3.6, pz0 - 0.15, px1 + 0.15, 4.4, pz1 + 0.15, 'concrete');
    b.box(px0, 3.6, pz1 - 0.1, px1 + 0.15, 4.4, pz1 + 0.15, 'concrete');
    b.box(px0, 3.6, pz0 - 0.15, -42.2, 4.4, pz0 + 0.1, 'concrete');
    b.box(-40.0, 3.6, pz0 - 0.15, px1 + 0.15, 4.4, pz0 + 0.1, 'concrete');
    b.box(-45, 0, 24, -43, 1.6, 26.6, 'metal');  // pump machine inside
    crate(b, -42.4, 18.95, 1.2);          // climb route: 1.2 -> 2.4 -> roof
    crate(b, -41.2, 18.95, 1.2); crate(b, -41.2, 18.95, 1.2, 1.2);
    b.box(-44.8, 3.6, 25.4, -43.4, 4.6, 26.6, 'metalDark'); // vent on the roof (cover)

    // ================= South lane: container yard, west part =================
    container(b, -31.0, 15.6, 'x', 'contGreen');
    container(b, -31.0, 30.8, 'x', landmark); container(b, -31.0, 30.8, 'x', 'contWhite', 2.6);
    container(b, -22.0, 20.2, 'z', 'contOrange');
    crate(b, -24.0, 23.9, 1.2);
    container(b, -14.2, 26.4, 'x', landmark); container(b, -14.2, 26.4, 'x', 'contGrey', 2.6);
    container(b, -10.8, 16.4, 'x', 'contGrey');
    crate(b, -7.0, 18.6, 1.2);
    container(b, -5.2, 22.2, 'z', 'contWhite');
    barrier(b, -21.0, 12.9, 'x', 3.2);
    barrel(b, -26.5, 25.0, 'metalYellow'); barrel(b, -27.1, 25.6, 'metalYellow'); barrel(b, -26.4, 26.2, 'metalDark');
    forklift(b, -19.5, 31.2, 0);
    lampPost(b, -36, 13.4, 6.5, [1, 0]);
  },

  // team spawns: [x, y, z, yaw]; team 0 = west, team 1 = east (mirrored)
  spawns() {
    const west = [[-42, 0, -14], [-42, 0, -5], [-43, 0, 8], [-41, 0, 15], [-36.5, 0, -14.5], [-36, 0, 17], [-44, 0, 0], [-39, 0, -1]];
    const yawW = -Math.PI / 2;
    return {
      0: west.map(([x, y, z]) => [x, y, z, yawW]),
      1: west.map(([x, y, z]) => [-x, y, z, -yawW]),
    };
  },

  // points of interest for bot roaming
  hotspots: [
    [0, 0, 0], [0, 3.7, 0], [-7, 3.7, -9.7], [7, 3.7, 9.7], [0, 0, -23], [-12, 0, -24], [12, 0, -24],
    [0, 0, 20], [-17, 0, 20], [17, 0, 20], [-26, 0, 0], [26, 0, 0], [-41, 3.45, -23], [41, 3.45, -23],
    [-42, 3.6, 23], [42, 3.6, 23], [-30, 0, -26], [30, 0, -26], [-8, 0, 14], [8, 0, 14],
  ],
};
