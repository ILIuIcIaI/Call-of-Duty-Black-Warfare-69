import * as THREE from 'three';
import { wallX, wallZ, stairs, container, crate, barrel, barrier, truck, lampPost, railing, mtx, sandbags } from '../props.js';

// =============================================================================
// BLACKSITE — compact research facility at blue hour. Small and intense:
// built for 6-8 bots of close-quarters chaos.
//   Center  : the lab. A glass server room in the middle (breakable glass!),
//             halls to both main doors, corner labs with exterior doors.
//   North   : helipad yard with a parked helicopter (big central cover).
//   South   : motor pool with a guard tower (power position, stairs on both
//             sides, countered by the helicopter and the lab windows).
//   Flanks  : a sunken drainage trench on each side, running north-south;
//             it passes under a grate bridge (slide or crouch through!).
// Mirror-symmetric across x = 0: team 0 west, team 1 east.
// =============================================================================

export default {
  id: 'blacksite',
  name: 'BLACKSITE',
  desc: 'Forschungsanlage in der Abenddämmerung. Klein & schnell: Labor mit Glas-Serverraum, Hubschrauberlandeplatz, Wachturm, Gräben als Flanken.',
  size: 'Klein',
  env: {
    sunDir: [0.35, 0.3, -0.55],
    sunColor: 0xffc49a, sunIntensity: 3.0,
    skyTop: 0x2c3e74, skyHorizon: 0xe0a07c, skyBottom: 0x4a4048,
    cloudColor: 0xe8b8a8, clouds: 0.5,
    hemiSky: 0x9aa4c8, groundColor: 0x5a5048, ambient: 1.55,
    fogColor: 0x9a8088, fogNear: 45, fogFar: 220,
  },
  bounds: { minX: -30, maxX: 30, minZ: -24, maxZ: 24 },

  build(B) {
    // ------------------------------------------------------------- center (built once)
    // lab roof and floor
    B.box(-10, 0, -12, 10, 0.05, 12, 'labFloor', { ao: false });
    B.box(-10.2, 4.2, -12.2, 10.2, 4.5, 12.2, 'concreteDark');
    // skylight frame over the server room
    B.box(-3.6, 4.5, -3.6, 3.6, 4.7, 3.6, 'metalDark', { collide: false });
    // server room: low walls + glass, doors east/west
    for (const s of [-1, 1]) {
      wallX(B, -3.5, 3.5, s * 3.5, 0, 4.2, 0.2, 'labWall', [{ c: 0, w: 6.6, y: 1.0, h: 1.8 }]);
      B.glassPane(-3.3, 1.0, s * 3.5 - 0.04, 3.3, 2.8, s * 3.5 + 0.04);
      wallZ(B, -3.5, 3.5, s * 3.5, 0, 4.2, 0.2, 'labWall', [{ c: 0, w: 1.6, y: 0, h: 2.6 }, { c: -2.3, w: 1.6, y: 1.0, h: 1.8 }, { c: 2.3, w: 1.6, y: 1.0, h: 1.8 }]);
      B.glassPane(s * 3.5 - 0.04, 1.0, -3.1, s * 3.5 + 0.04, 2.8, -1.5);
      B.glassPane(s * 3.5 - 0.04, 1.0, 1.5, s * 3.5 + 0.04, 2.8, 3.1);
    }
    for (const x of [-2, 0, 2]) for (const z of [-2, 2]) {
      B.box(x - 0.35, 0, z - 0.5, x + 0.35, 2.1, z + 0.5, 'metalDark', { pen: 0.4 });
      B.box(x - 0.36, 0.3, z - 0.51, x + 0.36, 1.9, z - 0.49, 'screen', { collide: false, ao: false });
    }
    B.pointLight(0, 3.6, 0, 0x9ad8ff, 5, 10);
    B.box(-1.5, 4.12, -0.2, 1.5, 4.19, 0.2, 'lampBlue', { collide: false, ao: false });

    // helipad + helicopter (north)
    B.box(-5.5, 0, 13.5, 5.5, 0.35, 22.5, 'concreteDark', { ao: false });
    B.box(-1.6, 0.35, 15.0, -1.1, 0.36, 21.0, 'paintYellow', { collide: false, ao: false });
    B.box(1.1, 0.35, 15.0, 1.6, 0.36, 21.0, 'paintYellow', { collide: false, ao: false });
    B.box(-1.1, 0.35, 17.75, 1.1, 0.36, 18.25, 'paintYellow', { collide: false, ao: false });
    B.box(-1.25, 0.65, 15.6, 1.25, 2.7, 20.0, 'carPaintGreen', { pen: 0.3 });           // fuselage
    B.box(-1.15, 1.6, 15.2, 1.15, 2.6, 15.6, 'carGlass', { pen: 0.9 });                // cockpit glass
    B.box(-0.35, 1.6, 20.0, 0.35, 2.3, 25.0, 'carPaintGreen', { collide: false });     // tail boom
    B.box(-0.08, 2.3, 24.0, 0.08, 3.4, 24.8, 'carPaintGreen', { collide: false });
    B.box(-1.4, 0.35, 16.0, -1.25, 0.65, 19.6, 'metalDark'); B.box(1.25, 0.35, 16.0, 1.4, 0.65, 19.6, 'metalDark'); // skids
    B.box(-0.25, 2.7, 17.5, 0.25, 3.0, 18.0, 'metalDark', { collide: false });
    for (const a of [0.4, 0.4 + Math.PI / 2]) B.geom(new THREE.BoxGeometry(11, 0.05, 0.32), 'metalDark', mtx(0, 3.02, 17.75, a));
    B.pointLight(0, 0.6, 12.5, 0xff4030, 2, 6);

    // guard tower (south) with stairs on both sides
    B.box(-2.4, 0, -20.4, 2.4, 3.0, -15.6, 'concrete');
    B.box(-2.7, 3.0, -20.7, 2.7, 3.15, -15.3, 'metalDark', { ao: false });
    sandbagsRing(B, 3.15);
    B.box(-2.7, 5.4, -20.7, 2.7, 5.6, -15.3, 'corrugated', { collide: false });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.boxC(sx * 2.55, -18 + sz * 2.55, 0.15, 0.15, 3.15, 2.25, 'metalDark', { collide: false });
    stairs(B, -7.4, -21.5, '+x', 1.4, 3.0, 4.6, 'metal');
    stairs(B, 7.4, -21.5, '-x', 1.4, 3.0, 4.6, 'metal');
    B.box(-2.8, 0, -22.2, 2.8, 3.0, -20.8, 'concrete');   // landing under the parapet gap
    B.box(-2.8, 3.0, -22.2, 2.8, 3.15, -20.4, 'metalDark', { ao: false });
    B.pointLight(0, 5.2, -18, 0xffd090, 3, 12);
    B.box(-0.3, 5.3, -18.3, 0.3, 5.38, -17.7, 'lampOn', { collide: false, ao: false });

    // grate bridges over both trenches (built per half below)
    for (const b of [B, B.mirrored()]) this.half(b, b === B);
  },

  half(b, west) {
    const accent = west ? 'contRed' : 'contBlue';
    // ================= ground with a drainage trench at x -17..-14 =================
    b.box(-34, -1, -28, -17, 0, 28, 'asphalt');
    b.box(-14, -1, -28, 0, 0, 28, 'asphalt');
    b.box(-17, -1, 20, -14, 0, 28, 'asphalt');
    b.box(-17, -1, -28, -14, 0, -20, 'asphalt');
    b.box(-17, -2.6, -20, -14, -1.6, 20, 'concreteDark');                                  // trench floor
    b.box(-17.02, -1.6, -20, -16.98, -1, 20, 'concreteDark', { collide: false, ao: false });
    stairs(b, -15.5, 16, '+z', 3.0, 1.6, 4.0, 'concreteDark', -1.6);
    stairs(b, -15.5, -16, '-z', 3.0, 1.6, 4.0, 'concreteDark', -1.6);
    // grate bridge across the trench (headroom 1.6: crouch or slide under it)
    b.box(-17, -0.12, -1.6, -14, 0, 1.6, 'metal', { ao: false });
    railing(b, -17, -1.6, -14, -1.6, 1.0, 'metalYellow');
    railing(b, -17, 1.6, -14, 1.6, 1.0, 'metalYellow');
    // trench rails along the edges (not on the stair openings)
    railing(b, -17.05, -16, -17.05, -1.6, 0.9, 'metalYellow');
    railing(b, -17.05, 1.6, -17.05, 16, 0.9, 'metalYellow');
    railing(b, -13.95, -16, -13.95, -1.6, 0.9, 'metalYellow');
    railing(b, -13.95, 1.6, -13.95, 16, 0.9, 'metalYellow');
    barrel(b, -15.0, -9.0, 'metalDark', -1.6); barrel(b, -16.2, 8.5, 'metalYellow', -1.6);
    crate(b, -15.5, 5.2, 1.0, -1.6);

    // ================= perimeter =================
    b.box(-32, 0, -26, -30, 3.2, 26, 'concrete');
    b.box(-30, 0, 24, 0, 3.2, 26, 'concrete');
    b.box(-30, 0, -26, 0, 3.2, -24, 'concrete');
    for (let x = -28; x < 0; x += 4) { b.box(x - 0.1, 3.2, 24.9, x + 0.1, 4.2, 25.1, 'metalDark', { collide: false }); b.box(x - 0.1, 3.2, -25.1, x + 0.1, 4.2, -24.9, 'metalDark', { collide: false }); }
    b.box(-32, 3.2, -26, 0, 30, -24, 'concrete', { visual: false });
    b.box(-32, 3.2, 24, 0, 30, 26, 'concrete', { visual: false });
    b.box(-32, 3.2, -26, -30, 30, 26, 'concrete', { visual: false });

    // ================= lab (west half) =================
    const H = 4.2, T = 0.35;
    wallZ(b, -12, 12, -10, 0, H, T, 'concrete', [{ c: 0, w: 2.6, y: 0, h: 2.8 }, { c: -7, w: 2.0, y: 1.1, h: 1.3 }, { c: 7, w: 2.0, y: 1.1, h: 1.3 }]);
    b.glassPane(-10.05, 1.1, -8.0, -9.95, 2.4, -6.0);
    b.glassPane(-10.05, 1.1, 6.0, -9.95, 2.4, 8.0);
    wallX(b, -10, 0, 12, 0, H, T, 'concrete', [{ c: -6.5, w: 1.6, y: 0, h: 2.5 }, { c: -1.6, w: 2.4, y: 1.1, h: 1.3 }]);
    b.glassPane(-2.8, 1.1, 11.95, -0.4, 2.4, 12.05);
    wallX(b, -10, 0, -12, 0, H, T, 'concrete', [{ c: -6.5, w: 1.6, y: 0, h: 2.5 }, { c: -1.6, w: 2.4, y: 1.1, h: 1.3 }]);
    b.glassPane(-2.8, 1.1, -12.05, -0.4, 2.4, -11.95);
    // corner labs (NW / SW) separated from the west hall
    wallX(b, -10, -3.5, 5, 0, H, 0.2, 'labWall', [{ c: -6.6, w: 1.4, y: 0, h: 2.4 }]);
    wallX(b, -10, -3.5, -5, 0, H, 0.2, 'labWall', [{ c: -6.6, w: 1.4, y: 0, h: 2.4 }]);
    wallZ(b, 5, 12, -3.5, 0, H, 0.2, 'labWall', [{ c: 8.6, w: 1.4, y: 0, h: 2.4 }]);
    wallZ(b, -12, -5, -3.5, 0, H, 0.2, 'labWall', [{ c: -8.6, w: 1.4, y: 0, h: 2.4 }]);
    // hazard stripes on the floor at the main door
    for (let z = -1.2; z <= 1.2; z += 0.6) b.box(-9.8, 0.05, z - 0.12, -8.8, 0.06, z + 0.12, 'hazardStripe', { collide: false, ao: false });
    // west hall cover
    b.box(-7.6, 0, -2.6, -6.2, 1.05, -1.0, 'metalDark');       // workbench
    b.box(-7.6, 0, 1.0, -6.2, 1.05, 2.6, 'metalDark');
    crate(b, -5.0, -3.8, 0.9); crate(b, -5.0, 3.9, 0.9);
    // NW lab: tables + shelves
    b.box(-9.5, 0, 8.2, -8.2, 2.1, 11.4, 'metal', { pen: 0.4 });
    b.box(-6.8, 0, 7.4, -4.6, 0.9, 8.4, 'labWall'); b.box(-6.8, 0, 9.8, -4.6, 0.9, 10.8, 'labWall');
    b.box(-6.7, 0.9, 7.5, -6.1, 1.4, 8.3, 'screen', { collide: false, ao: false });
    // SW lab: specimen tanks (glass-like cylinders) + desk
    for (const z of [-10.5, -8.6]) { b.box(-9.6, 0, z - 0.6, -8.4, 2.2, z + 0.6, 'metalDark', { visual: false }); b.geom(new THREE.CylinderGeometry(0.55, 0.55, 2.2, 16), 'carGlass', mtx(-9.0, 1.1, z)); }
    b.box(-6.5, 0, -7.6, -4.4, 0.85, -6.6, 'woodDark');
    // north / south corridors: lockers
    b.box(-3.2, 0, 10.6, -0.6, 2.0, 11.6, 'metal');
    b.box(-3.2, 0, -11.6, -0.6, 2.0, -10.6, 'metal');
    // ceiling lights
    for (const [x, z] of [[-6.8, 0], [-6.8, 8.5], [-6.8, -8.5], [-1.5, 8], [-1.5, -8]]) b.box(x - 0.9, 4.12, z - 0.15, x + 0.9, 4.19, z + 0.15, 'lampOn', { collide: false, ao: false });
    b.pointLight(-6.8, 3.6, 0, 0xe8f0ff, 4, 11);
    b.pointLight(-6.0, 3.6, 8.5, 0xe8f0ff, 3, 9);
    b.pointLight(-6.0, 3.6, -8.5, 0xe8f0ff, 3, 9);
    // red warning light over the main door outside
    b.box(-10.5, 3.2, -0.3, -10.2, 3.5, 0.3, 'lampRed', { collide: false });

    // ================= west yard / spawn =================
    // generator building
    wallZ(b, -7, -1, -25, 0, 3.0, 0.3, 'corrugated', [{ c: -4, w: 1.4, y: 0, h: 2.3 }]);
    wallZ(b, -7, -1, -29.5, 0, 3.0, 0.3, 'corrugated', []);
    wallX(b, -29.5, -25, -7, 0, 3.0, 0.3, 'corrugated', []);
    wallX(b, -29.5, -25, -1, 0, 3.0, 0.3, 'corrugated', []);
    b.box(-29.8, 3.0, -7.3, -24.7, 3.2, -0.7, 'metalDark');
    b.box(-28.8, 0, -6.2, -26.5, 1.6, -3.5, 'metalYellow');
    b.pointLight(-27.5, 2.6, -4, 0xffd090, 2, 6);
    container(b, -26.5, 9.0, 'z', accent); container(b, -26.5, 9.0, 'z', 'contGrey', 2.6);
    container(b, -21.0, 14.5, 'x', 'contWhite');
    crate(b, -22.5, 11.8, 1.2);
    container(b, -21.5, -13.5, 'x', accent);
    barrier(b, -20.5, -4.0, 'z', 3.0);
    barrier(b, -20.5, 4.5, 'z', 3.0);
    sandbags(b, -12.6, -13.6, 2.6, 'x', 1.0);
    sandbags(b, -12.2, 15.5, 2.6, 'x', 1.0);
    // motor pool truck (south) + jeep crates (north)
    truck(b, -10.6, -19.5, 'z', 'carPaintGreen', 1);
    crate(b, -9.0, 17.0, 1.2); crate(b, -9.0, 18.25, 1.2); crate(b, -9.0, 17.6, 1.2, 1.2);
    barrel(b, -12.0, 20.5, 'metalRed'); barrel(b, -11.4, 21.1, 'metalDark');
    // floodlights
    lampPost(b, -24.5, -21.5, 6.5, [1, 0]);
    lampPost(b, -24.5, 21.5, 6.5, [1, 0]);
    lampPost(b, -11.5, 0, 5.5, [-1, 0]);
    b.pointLight(-23.7, 6.0, -21.5, 0xffc880, 6, 18);
    b.pointLight(-23.7, 6.0, 21.5, 0xffc880, 6, 18);
  },

  spawns() {
    const west = [[-27, 0, -15], [-27, 0, 0.5], [-27, 0, 17], [-23.5, 0, -9], [-23, 0, 3], [-22.5, 0, 20.5], [-28, 0, -20.5], [-24, 0, -18]];
    const yawW = -Math.PI / 2;
    return { 0: west.map(([x, y, z]) => [x, y, z, yawW]), 1: west.map(([x, y, z]) => [-x, y, z, -yawW]) };
  },

  hotspots: [
    [0, 0, 0], [-6.5, 0, 0], [6.5, 0, 0], [-6.5, 0, 8.5], [6.5, 0, 8.5], [-6.5, 0, -8.5], [6.5, 0, -8.5],
    [0, 0, 8], [0, 0, -8], [0, 0.35, 18], [0, 3.15, -18], [-15.5, -1.6, 8], [15.5, -1.6, -8], [-15.5, -1.6, -8], [15.5, -1.6, 8],
    [-20, 0, 18], [20, 0, -18], [-12, 0, -20], [12, 0, 20],
  ],
};

function sandbagsRing(B, y) {
  // parapet of sandbags around the tower top (gap on the south side for the stairs)
  B.box(-2.7, y, -15.6, 2.7, y + 1.0, -15.3, 'sandbag');
  B.box(-2.7, y, -20.7, -1.0, y + 1.0, -20.4, 'sandbag');
  B.box(1.0, y, -20.7, 2.7, y + 1.0, -20.4, 'sandbag');
  B.box(-2.7, y, -20.4, -2.4, y + 1.0, -15.6, 'sandbag');
  B.box(2.4, y, -20.4, 2.7, y + 1.0, -15.6, 'sandbag');
}
