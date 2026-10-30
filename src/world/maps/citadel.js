import * as THREE from 'three';
import { wallX, wallZ, stairs, crate, barrel, railing, lampPost, tree, palm, car, mtx, sandbags } from '../props.js';

// =============================================================================
// CITADEL — Mediterranean old town at midday. Small-medium, very vertical,
// built around flanking and constant movement.
//   Center lane : the piazza with a fountain (cover ring + statue that breaks
//                 the line between the two town-hall balconies).
//   West lane   : market street with stalls, shops you can run through and a
//                 movement route (stall -> awning -> balcony) into the west
//                 house's upper floor, which overlooks the piazza.
//   East lane   : raised terrace with a pergola (long sightline cut in half by
//                 a kiosk) + a plank bridge onto the east block's roof.
//   Narrow alleys between the blocks are flank routes and wall-jump spots.
// Mirror-symmetric across z = 0: team 0 spawns north, team 1 south.
// =============================================================================

const stall = (b, x, z, canvas) => {
  b.box(x - 1.0, 0, z - 0.45, x + 1.0, 0.9, z + 0.45, 'woodDark');
  for (const sx of [-0.95, 0.95]) for (const sz of [-0.55, 0.55]) b.box(x + sx - 0.04, 0, z + sz - 0.04, x + sx + 0.04, 2.25, z + sz + 0.04, 'woodDark', { collide: false, ao: false });
  b.box(x - 1.15, 2.25, z - 0.75, x + 1.15, 2.32, z + 0.75, canvas, { collide: false, ao: false });
  for (let i = 0; i < 3; i++) b.box(x - 0.8 + i * 0.6, 0.9, z - 0.3, x - 0.45 + i * 0.6, 1.1, z + 0.3, ['canvasRed', 'canvasYellow', 'foliage'][i], { collide: false, ao: false });
};
const planter = (b, x, z, w = 1.6, d = 1.6) => {
  b.box(x - w / 2, 0, z - d / 2, x + w / 2, 0.85, z + d / 2, 'stoneWall');
  b.geom(new THREE.IcosahedronGeometry(1, 1), 'foliage', mtx(x, 1.05, z, 0.4, w * 0.42, 0.42, d * 0.42));
};

export default {
  id: 'citadel',
  name: 'CITADEL',
  desc: 'Mediterrane Altstadt am Mittag. Piazza mit Brunnen, Marktgasse, Dachterrasse – viel Vertikalität und Flanken.',
  size: 'Klein-Mittel',
  env: {
    sunDir: [0.42, 0.8, 0.32],
    sunColor: 0xfff0d4, sunIntensity: 2.9,
    skyTop: 0x3c7cc8, skyHorizon: 0xc4dcf0, skyBottom: 0x9a9080,
    cloudColor: 0xffffff, clouds: 0.35,
    hemiSky: 0xccd4e0, groundColor: 0xb8a080, ambient: 1.4,
    fogColor: 0xcadcea, fogNear: 60, fogFar: 260,
  },
  bounds: { minX: -34, maxX: 34, minZ: -32, maxZ: 32 },

  build(B) {
    // ------------------------------------------------------------- global
    B.box(-38, -1, -36, 38, 0, 36, 'pavers');
    B.box(-12, 0, -10, 12, 0.012, 10, 'paversDark', { collide: false, ao: false });
    // concentric paving rings around the fountain
    for (const r of [4.2, 7.5]) for (const [x0, z0, x1, z1] of [[-r, -r, r, -r + 0.35], [-r, r - 0.35, r, r], [-r, -r, -r + 0.35, r], [r - 0.35, -r, r, r]]) B.box(x0, 0.013, z0, x1, 0.02, z1, 'pavers', { collide: false, ao: false });

    // fountain (center): basin approximated by a plus of boxes, statue column
    B.box(-2.6, 0, -1.5, 2.6, 0.75, 1.5, 'marble', { visual: false });
    B.box(-1.5, 0, -2.6, 1.5, 0.75, 2.6, 'marble', { visual: false });
    B.box(-2.15, 0, -2.15, 2.15, 0.75, 2.15, 'marble', { visual: false });
    B.geom(new THREE.CylinderGeometry(2.75, 2.85, 0.75, 32), 'marble', mtx(0, 0.375, 0));
    B.geom(new THREE.CylinderGeometry(2.4, 2.4, 0.06, 32), 'waterFountain', mtx(0, 0.62, 0));
    B.box(-0.6, 0, -0.6, 0.6, 3.0, 0.6, 'marble', { visual: false });
    B.geom(new THREE.CylinderGeometry(0.5, 0.65, 2.0, 16), 'marble', mtx(0, 1.0, 0));
    B.geom(new THREE.CylinderGeometry(1.1, 0.4, 0.3, 20), 'marble', mtx(0, 2.1, 0));
    B.geom(new THREE.CylinderGeometry(0.22, 0.3, 1.0, 10), 'marble', mtx(0, 2.75, 0));
    B.geom(new THREE.SphereGeometry(0.22, 12, 8), 'marble', mtx(0, 3.4, 0));
    B.geom(new THREE.BoxGeometry(0.9, 0.12, 0.12), 'marble', mtx(0, 3.05, 0, 0.3));

    // terrace kiosk (breaks the terrace sightline in the middle)
    B.box(28.6, 3.0, -1.6, 32.6, 5.6, 1.6, 'plasterWhite');
    B.box(28.3, 5.6, -1.9, 32.9, 5.8, 1.9, 'rooftile');
    B.box(28.55, 3.9, -0.9, 28.62, 4.9, 0.9, 'woodDark', { collide: false, ao: false });
    // center divider between the two terrace staircases
    B.box(24, 0, -1.5, 28.5, 3.0, 1.5, 'stoneWall');
    // east connector: cafe tables with umbrellas
    for (const [x, z] of [[14.5, -2], [17.5, 2], [15, 3.2]]) {
      B.box(x - 0.45, 0, z - 0.45, x + 0.45, 0.78, z + 0.45, 'metalDark');
      B.geom(new THREE.ConeGeometry(1.4, 0.5, 10, 1, true), 'canvasRed', mtx(x, 2.3, z));
      B.box(x - 0.03, 0.78, z - 0.03, x + 0.03, 2.2, z + 0.03, 'metal', { collide: false, ao: false });
    }
    // west connector: a stone well
    B.box(-17.2, 0, -1.2, -14.8, 0.9, 1.2, 'stoneWall', { visual: false });
    B.geom(new THREE.CylinderGeometry(1.2, 1.25, 0.9, 20), 'stoneWall', mtx(-16, 0.45, 0));
    B.geom(new THREE.CylinderGeometry(1.0, 1.0, 0.04, 20), 'black', mtx(-16, 0.88, 0));
    for (const s of [-1, 1]) B.box(-16 + s * 1.05 - 0.06, 0.9, -0.06, -16 + s * 1.05 + 0.06, 2.4, 0.06, 'woodDark', { collide: false, ao: false });
    B.box(-17.2, 2.35, -0.08, -14.8, 2.45, 0.08, 'woodDark', { collide: false, ao: false });
    palm(B, -13.2, 4.2, 7.5); palm(B, 13.2, -4.2, 7.5);

    // ------------------------------------------------------------- mirrored halves
    for (const b of [B, B.mirroredZ()]) this.half(b, b === B);
  },

  half(b, north) {
    const facade = north ? 'plasterOchre' : 'plasterRose';
    const hall = north ? 'plasterSand' : 'plasterBlue';
    const shutters = north ? 'shutterGreen' : 'shutterBlue';

    // ================= boundaries: tall facades all around =================
    b.box(-38, 0, -36, 38, 9, -32, facade);
    for (let x = -30; x <= 30; x += 6) b.box(x - 0.8, 3.6, -32.06, x + 0.8, 5.0, -32, shutters, { collide: false, ao: false });
    b.box(-38, 9, -36, 38, 9.4, -31.7, 'rooftile', { collide: false });
    b.box(-38, 0, -32, -32, 8, 0, facade);
    for (let z = -28; z <= -4; z += 6) {
      b.box(-32.04, 0, z - 0.7, -32, 2.3, z + 0.7, 'woodDark', { collide: false, ao: false });
      b.box(-32.06, 3.6, z - 0.6, -32, 5.0, z + 0.6, shutters, { collide: false, ao: false });
    }
    b.box(-38, 8, -32, -31.7, 8.4, 0, 'rooftile', { collide: false });
    b.box(34, 0, -32, 38, 9, 0, facade);
    b.box(-38, 9, -36, 38, 30, 0, 'concrete', { visual: false });
    b.box(-38, 8, -32, -32, 30, 0, 'concrete', { visual: false });
    b.box(34, 9, -32, 38, 30, 0, 'concrete', { visual: false });

    // ================= spawn plaza (z -32..-22) =================
    car(b, 13.5, -27.5, 'x', north ? 'carPaintWhite' : 'carPaintRed');
    crate(b, -9.5, -24.6, 1.1); crate(b, -8.4, -24.6, 1.1); crate(b, -9.0, -24.6, 1.0, 1.1);
    barrel(b, 6.5, -24.5, 'metalDark'); barrel(b, 7.1, -24.9, 'metalRed');
    planter(b, -2.5, -30.5, 3.0, 1.2); planter(b, 2.5, -30.5, 3.0, 1.2);
    lampPost(b, -17, -24, 5.5, [0, 1]); lampPost(b, 18, -24, 5.5, [0, 1]);
    tree(b, -24, -28.5, 6, 2.2);

    // ================= west house (x -20..-12, z -20..-6), 2 floors =================
    const hx0 = -20, hx1 = -12, hz0 = -20, hz1 = -6, F = 3.4, T = 0.3;
    b.box(hx0, 0, hz0, hx1, 0.05, hz1, 'tilesTerra', { ao: false });
    wallZ(b, hz0, hz1, hx0, 0, 2 * F, T, facade, [
      { c: -14.8, w: 1.4, y: 0, h: 2.3 }, { c: -11.0, w: 1.2, y: 1.0, h: 1.2 },
      { c: -9.0, w: 1.2, y: F, h: 2.2 }, { c: -16.0, w: 1.2, y: F + 0.9, h: 1.3 }]);
    wallZ(b, hz0, hz1, hx1, 0, 2 * F, T, facade, [
      { c: -8.0, w: 1.4, y: F + 0.9, h: 1.3 }, { c: -17.0, w: 1.4, y: 0, h: 2.3 }]);
    wallX(b, hx0, hx1, hz0, 0, 2 * F, T, facade, [{ c: -15.5, w: 1.2, y: F + 0.9, h: 1.3 }]);
    wallX(b, hx0, hx1, hz1, 0, 2 * F, T, facade, [
      { c: -17.0, w: 1.4, y: 0, h: 2.3 }, { c: -14.0, w: 1.2, y: 1.0, h: 1.2 }, { c: -16.0, w: 1.4, y: F + 0.9, h: 1.3 }]);
    // shutters / window trims
    b.box(hx0 - 0.21, 1.0, -12.0, hx0 - 0.15, 2.2, -11.6, shutters, { collide: false, ao: false });
    // upper floor slab with stair hole (stairs along the north wall, rising +x)
    b.box(hx0 + T / 2, F, hz0 + T / 2, hx1 - T / 2, F + 0.2, -18.4, 'woodDark', { ao: false });
    b.box(-14.4, F, -18.4, hx1 - T / 2, F + 0.2, -16.9, 'woodDark', { ao: false });
    b.box(hx0 + T / 2, F, -16.9, hx1 - T / 2, F + 0.2, hz1 - T / 2, 'woodDark', { ao: false });
    // hmm: stairs run x -19.5..-14.4 at z -18.4..-16.9 under the hole
    b.box(hx0 + T / 2, F, -18.4, -19.6, F + 0.2, -16.9, 'woodDark', { ao: false });
    stairs(b, -19.6, -17.65, '+x', 1.5, F + 0.2, 5.0, 'woodDark');
    railing(b, -19.6, -16.85, -14.6, -16.85, 1.0, 'woodDark', true, F + 0.2);
    b.box(hx0 - 0.15, 2 * F, hz0 - 0.15, hx1 + 0.15, 2 * F + 0.25, hz1 + 0.15, 'rooftile');
    // furniture
    b.box(-19.5, 0, -11, -18.7, 1.9, -8.5, 'woodDark');
    b.box(-16.5, 0, -12.5, -14.5, 0.78, -11.5, 'woodPale');
    b.box(-19.6, F + 0.2, -12, -18.8, F + 1.0, -9.6, 'woodPale');
    b.box(-14.6, F + 0.2, -9.0, -13.0, F + 1.05, -8.2, 'woodDark');
    b.pointLight(-16, 2.8, -12, 0xffd8a0, 2.5, 8);
    // exterior balcony on the market side + awning below it (movement route)
    b.box(-21.4, F, -10.6, hx0 - T / 2, F + 0.2, -7.4, 'stoneWall', { ao: false });
    railing(b, -21.4, -10.6, -21.4, -7.4, 1.0, 'metalDark', true, F + 0.2);
    railing(b, -21.4, -7.4, -20.15, -7.4, 1.0, 'metalDark', true, F + 0.2);
    // awning next to the balcony: stall -> awning -> balcony (open north side)
    b.box(-21.3, 2.3, -13.6, hx0 - T / 2, 2.4, -10.8, 'canvasGreen');

    // ================= west alley (x -12..-10) & market street (x -32..-20) =================
    stall(b, -29.6, -18, 'canvasRed');
    stall(b, -26.0, -13, 'canvasYellow');
    stall(b, -22.6, -12.2, 'canvasBlue'); // next to the awning: the jump-up spot
    stall(b, -29.6, -4.5, 'canvasGreen');
    crate(b, -27.6, -21.0, 1.0); crate(b, -24.0, -16.8, 1.0); barrel(b, -31.0, -10.5, 'metalDark');
    b.box(-12.0, 3.2, -18.0, -10.0, 3.25, -17.8, 'woodDark', { collide: false, ao: false }); // hanging sign bar
    b.box(-11.3, 2.5, -18.0, -10.7, 3.2, -17.95, 'canvasYellow', { collide: false, ao: false });
    lampPost(b, -21.5, -21.5, 5.0, [1, 0]);

    // ================= town hall (x -10..10, z -21..-12) =================
    const tz0 = -21, tz1 = -12, tF = 3.6;
    b.box(-10, 0, tz0, 10, 0.05, tz1, 'marble', { ao: false });
    // north wall with the main door
    wallX(b, -10, 10, tz0, 0, 2 * tF, 0.35, hall, [{ c: 0, w: 2.4, y: 0, h: 2.8 }, { c: -6, w: 1.4, y: tF + 0.9, h: 1.4 }, { c: 6, w: 1.4, y: tF + 0.9, h: 1.4 }]);
    // side walls with doors to the alleys
    wallZ(b, tz0, tz1, -10, 0, 2 * tF, 0.35, hall, [{ c: -17.5, w: 1.4, y: 0, h: 2.4 }, { c: -16.5, w: 1.2, y: tF + 0.9, h: 1.3 }]);
    wallZ(b, tz0, tz1, 10, 0, 2 * tF, 0.35, hall, [{ c: -17.5, w: 1.4, y: 0, h: 2.4 }, { c: -16.5, w: 1.2, y: tF + 0.9, h: 1.3 }]);
    // inner wall behind the arcade (3 doors), arcade pillars at the front
    wallX(b, -10, 10, -14.2, 0, tF, 0.3, hall, [{ c: -5, w: 1.6, y: 0, h: 2.6 }, { c: 0, w: 1.6, y: 0, h: 2.6 }, { c: 5, w: 1.6, y: 0, h: 2.6 }]);
    for (const x of [-9.7, -6.5, -3.25, 0, 3.25, 6.5, 9.7]) b.boxC(x, -12.3, 0.6, 0.6, 0, tF, 'marble');
    // upper floor + front wall with three balcony doors
    b.box(-10, tF, -19.2, 10, tF + 0.25, tz1, 'marble', { ao: false });
    b.box(-3.0, tF, tz0 + 0.2, 10, tF + 0.25, -19.2, 'marble', { ao: false });
    b.box(-10, tF, tz0 + 0.2, -8.4, tF + 0.25, -19.2, 'marble', { ao: false });
    wallX(b, -10, 10, tz1 + 0.15, tF + 0.25, tF - 0.25, 0.3, hall, [{ c: -5, w: 1.4, y: 0, h: 2.3 }, { c: 0, w: 1.4, y: 0, h: 2.3 }, { c: 5, w: 1.4, y: 0, h: 2.3 }]);
    // balcony (power position over the piazza)
    b.box(-8.5, tF, tz1, 8.5, tF + 0.25, tz1 + 1.4, 'marble', { ao: false });
    b.box(-8.5, tF + 0.25, tz1 + 1.25, 8.5, tF + 1.15, tz1 + 1.4, 'marble', { pen: 0.2 });
    b.box(-8.5, tF + 0.25, tz1, -8.35, tF + 1.15, tz1 + 1.4, 'marble');
    b.box(8.35, tF + 0.25, tz1, 8.5, tF + 1.15, tz1 + 1.4, 'marble');
    // inside: stairs to the upper floor along the north wall (hole in the slab)
    stairs(b, -8.4, -19.9, '+x', 1.4, tF + 0.25, 5.4, 'marble');
    railing(b, -8.4, -19.15, -3.1, -19.15, 1.0, 'metalDark', true, tF + 0.25);
    // hall furniture: long table + benches (cover)
    b.box(-2.5, 0, -18.6, 2.5, 0.8, -17.4, 'woodDark');
    b.box(-6.5, 0, -16.6, -4.0, 0.5, -16.0, 'woodDark'); b.box(4.0, 0, -16.6, 6.5, 0.5, -16.0, 'woodDark');
    b.box(2.0, tF + 0.25, -19.5, 5.0, tF + 1.1, -18.8, 'woodDark');
    b.box(-1.0, tF + 0.25, -15.4, 1.0, tF + 1.05, -14.6, 'woodPale');
    // roof + clock tower (landmark)
    b.box(-10.2, 2 * tF, tz0 - 0.2, 10.2, 2 * tF + 0.3, tz1 + 0.2, 'rooftile');
    b.box(-1.6, 2 * tF, -18.4, 1.6, 2 * tF + 4.6, -15.4, hall);
    b.box(-1.9, 2 * tF + 4.6, -18.7, 1.9, 2 * tF + 4.9, -15.1, 'rooftile');
    b.geom(new THREE.CylinderGeometry(0.9, 0.9, 0.08, 24), 'paintWhite', mtx(0, 2 * tF + 3.2, -15.38, 0, 1, 1, 1, Math.PI / 2));
    b.box(-0.04, 2 * tF + 3.2, -15.33, 0.04, 2 * tF + 3.85, -15.3, 'black', { collide: false, ao: false });
    b.box(-0.04, 2 * tF + 2.9, -15.33, 0.5, 2 * tF + 3.25, -15.3, 'black', { collide: false, ao: false });
    b.pointLight(0, 3.0, -17, 0xffe0b0, 3, 10);

    // ================= east block (x 12..20, z -20..-6), 1 floor + roof terrace =================
    const ex0 = 12, ex1 = 20, ez0 = -20, ez1 = -6, eF = 3.4;
    b.box(ex0, 0, ez0, ex1, 0.05, ez1, 'tiles', { ao: false });
    wallZ(b, ez0, ez1, ex0, 0, eF, T, facade, [{ c: -17.0, w: 1.4, y: 0, h: 2.3 }, { c: -9.0, w: 1.6, y: 1.0, h: 1.2 }]);
    wallZ(b, ez0, ez1, ex1, 0, eF, T, facade, [{ c: -13.0, w: 1.4, y: 0, h: 2.3 }, { c: -9.0, w: 1.2, y: 1.0, h: 1.2 }]);
    wallX(b, ex0, ex1, ez0, 0, eF, T, facade, [{ c: 16.0, w: 1.4, y: 1.0, h: 1.2 }]);
    wallX(b, ex0, ex1, ez1, 0, eF, T, facade, [{ c: 16.0, w: 1.4, y: 0, h: 2.3 }, { c: 13.6, w: 1.2, y: 1.0, h: 1.2 }]);
    b.box(ex0 - 0.15, eF, ez0 - 0.15, ex1 + 0.15, eF + 0.2, ez1 + 0.15, 'concreteDark');
    // parapet with a gap for the plank bridge
    b.box(ex0 - 0.15, eF + 0.2, ez0 - 0.15, ex0 + 0.15, eF + 1.1, ez1 + 0.15, facade);
    b.box(ex0 - 0.15, eF + 0.2, ez1 - 0.15, ex1 + 0.15, eF + 1.1, ez1 + 0.15, facade);
    b.box(ex0 - 0.15, eF + 0.2, ez0 - 0.15, ex1 + 0.15, eF + 1.1, ez0 + 0.15, facade);
    b.box(ex1 - 0.15, eF + 0.2, ez0 - 0.15, ex1 + 0.15, eF + 1.1, -15.4, facade);
    b.box(ex1 - 0.15, eF + 0.2, -13.4, ex1 + 0.15, eF + 1.1, ez1 + 0.15, facade);
    b.box(16.2, eF + 0.2, -12, 17.6, eF + 1.4, -10.6, 'metalDark'); // AC unit on the roof (cover)
    // cafe interior
    for (const [x, z] of [[14, -15], [17.5, -11], [14.5, -9]]) b.box(x - 0.4, 0, z - 0.4, x + 0.4, 0.78, z + 0.4, 'woodPale');
    b.box(18.5, 0, -19.6, 19.7, 1.1, -16.5, 'woodDark'); // counter

    // ================= east street + raised terrace (x 24..34) =================
    b.box(24, 0, -24, 34, 3.0, -4.5, 'stoneWall');
    b.box(28.5, 0, -4.5, 34, 3.0, -1.5, 'stoneWall');
    b.box(24, 3.0, -24, 34, 3.04, -1.5, 'pavers', { collide: false, ao: false });
    stairs(b, 24, -3.0, '+x', 3.0, 3.0, 4.5, 'stoneWall');
    stairs(b, 29, -30, '+z', 3.6, 3.0, 6.0, 'stoneWall');
    railing(b, 24.1, -24, 24.1, -15.4, 1.0, 'metalDark', true, 3.0);
    railing(b, 24.1, -13.4, 24.1, -4.6, 1.0, 'metalDark', true, 3.0);
    railing(b, 24.0, -24.1, 27.1, -24.1, 1.0, 'metalDark', true, 3.0);
    railing(b, 30.9, -24.1, 34, -24.1, 1.0, 'metalDark', true, 3.0);
    // plank bridge from the terrace onto the east block roof
    b.box(ex1 - 0.15, eF + 0.15, -15.3, 24.1, eF + 0.25, -13.5, 'woodPale', { ao: false });
    b.box(24.1, 3.0, -15.3, 24.6, eF + 0.25, -13.5, 'woodDark');
    b.box(24.6, 3.0, -15.3, 25.0, 3.33, -13.5, 'woodDark');
    // pergola with planters (breaks up the terrace)
    for (const z of [-21, -16, -11, -6]) {
      b.box(25.0, 3.0, z - 0.1, 25.2, 5.6, z + 0.1, 'woodDark');
      b.box(33.3, 3.0, z - 0.1, 33.5, 5.6, z + 0.1, 'woodDark');
      b.box(25.0, 5.6, z - 0.12, 33.5, 5.8, z + 0.12, 'woodDark', { collide: false });
    }
    for (let x = 25.6; x < 33.4; x += 1.1) b.box(x, 5.8, -21.2, x + 0.12, 5.9, -5.8, 'woodDark', { collide: false, ao: false });
    planter(b, 30.5, -18.5, 2.4, 1.2);
    planter(b, 27.0, -9.0, 1.4, 2.0);
    b.box(31.5, 3.0, -13.2, 33.0, 3.45, -10.8, 'woodDark'); // bench
    // east street cover
    crate(b, 22.0, -18.5, 1.2); barrel(b, 21.2, -11.0, 'metalDark'); barrel(b, 22.9, -10.4, 'metalRed');
    sandbags(b, 22.0, -26.5, 2.4, 'x', 1.0);

    // ================= piazza (half) =================
    planter(b, -8.2, -7.0); planter(b, 8.2, -7.0);
    b.box(-5.6, 0, -8.9, -3.4, 0.5, -8.4, 'woodDark'); b.box(3.4, 0, -8.9, 5.6, 0.5, -8.4, 'woodDark');
    lampPost(b, -11.2, -9.6, 4.8, [1, 0]); lampPost(b, 11.2, -9.6, 4.8, [-1, 0]);
    // low wall between the piazza and the east connector
    b.box(12.2, 0, -5.5, 12.8, 0.95, -2.5, 'stoneWall');
  },

  // team spawns: [x, y, z, yaw]; team 0 = north (faces +z), team 1 = south (mirrored)
  spawns() {
    const north = [[-10, 0, -28], [-4, 0, -29], [4, 0, -29], [10, 0, -28], [-16, 0, -26.5], [17, 0, -24], [0, 0, -25.5], [-5, 0, -24.5]];
    return {
      0: north.map(([x, y, z]) => [x, y, z, Math.PI]),
      1: north.map(([x, y, z]) => [x, y, -z, 0]),
    };
  },

  hotspots: [
    [0, 0, 0], [0, 3.85, -11.6], [0, 3.85, 11.6], [-16, 3.6, -12], [-16, 3.6, 12], [16, 3.6, -13], [16, 3.6, 13],
    [29, 3.0, -12], [29, 3.0, 12], [-26, 0, -12], [-26, 0, 12], [-11, 0, -16], [-11, 0, 16], [11, 0, -16], [11, 0, 16],
    [-16, 0, -3], [16, 0, 3], [22, 0, -12], [22, 0, 12], [0, 0, -16], [0, 0, 16],
  ],
};
