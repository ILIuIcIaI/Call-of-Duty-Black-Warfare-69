import * as THREE from 'three';
import { wallX, wallZ, stairs, car, truck, railing, lampPost, tree, forklift, mtx } from '../props.js';

// =============================================================================
// ATRIUM — an office building on a weekday evening. Small-medium, two floors
// around a glass-roofed atrium, built for 8-10 players.
//   Center  : the lobby under the glass roof: reception, a steel sculpture in
//             the middle, open stairs up to the gallery around the void. The
//             server room behind glass to the north, the main entrance south.
//   Upstairs: open-plan offices with cubicles in both wings, meeting rooms
//             behind glass, the boardroom and the lounge off the gallery.
//   Wings   : storage with racks (roll-up door from the yard), a corridor from
//             the side entrance, the canteen.
//   Outside : the loading yards (spawns) with an outside stair up to the
//             offices; a service alley along the north wall and the forecourt
//             along the south wall, each blocked in the middle so they weave.
// Mirror-symmetric across x = 0: team 0 west, team 1 east.
// =============================================================================
const F2 = 3.6, C1 = 3.4, C2 = 6.8, TOP = 7.6; // upper floor, the two ceilings, top of the parapet
const XW = 22, ZW = 16, TW = 0.3, TP = 0.15;   // outer faces of the building, outer walls, partitions
const IX = XW - TW, IZ = ZW - TW;              // inner faces of the outer walls
const flat = { collide: false, ao: false };
const BLOB = new THREE.IcosahedronGeometry(1, 1);
const hash = (a, b, c) => { const s = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return s - Math.floor(s); };

// a floor slab between the storeys: carpet on top, ceiling tiles under it
function slab(b, x0, z0, x1, z1) {
  b.box(x0, C1, z0, x1, F2, z1, 'carpetOffice');
  b.box(x0, C1 - 0.02, z0, x1, C1, z1, 'ceiling', flat);
}
// ceiling lights under a ceiling at y, about one every `step` meters
function lights(b, x0, z0, x1, z1, y, step = 3.2) {
  const nx = Math.max(1, Math.round((x1 - x0) / step)), nz = Math.max(1, Math.round((z1 - z0) / step));
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const x = x0 + ((x1 - x0) * (i + 0.5)) / nx, z = z0 + ((z1 - z0) * (k + 0.5)) / nz;
    b.box(x - 0.6, y - 0.03, z - 0.3, x + 0.6, y, z + 0.3, 'lampOn', flat);
  }
}
// glass in the window openings of a wall along x (axis 'x', centered on z = m) or z; doors (y 0) stay open
function panes(b, axis, m, ops) {
  for (const o of ops) {
    if (!o.y || o.door) continue;
    const a0 = o.c - o.w / 2, a1 = o.c + o.w / 2;
    if (axis === 'x') b.glassPane(a0, o.y, m - 0.02, a1, o.y + o.h, m + 0.02); else b.glassPane(m - 0.02, o.y, a0, m + 0.02, o.y + o.h, a1);
  }
}
// A glass partition along x (axis 'x', at z = m) or z, a0..a1, from floor y0 up h: aluminium frame, mullions about
// every 1.6 m with breakable panes between them; doors: [{ c, w }] stay open under a panel
function glassWall(b, axis, a0, a1, m, y0, h, doors = []) {
  const put = (u0, u1, ya, yb, mat, opts) => (axis === 'x' ? b.box(u0, ya, m - 0.05, u1, yb, m + 0.05, mat, opts) : b.box(m - 0.05, ya, u0, m + 0.05, yb, u1, mat, opts));
  const pane = (u0, u1, ya, yb) => (axis === 'x' ? b.glassPane(u0, ya, m - 0.02, u1, yb, m + 0.02) : b.glassPane(m - 0.02, ya, u0, m + 0.02, yb, u1));
  const cuts = doors.map((d) => [d.c - d.w / 2, d.c + d.w / 2]).sort((p, q) => p[0] - q[0]);
  const runs = [];
  let cur = a0;
  for (const [s, e] of cuts) { if (s > cur) runs.push([cur, s]); cur = e; }
  if (cur < a1) runs.push([cur, a1]);
  for (const [s, e] of runs) {
    put(s, e, y0, y0 + 0.08, 'metal');
    put(s, e, y0 + h - 0.08, y0 + h, 'metal', flat);
    const n = Math.max(1, Math.round((e - s) / 1.6));
    for (let i = 0; i <= n; i++) { const u = s + ((e - s) * i) / n; put(Math.max(s, u - 0.04), Math.min(e, u + 0.04), y0, y0 + h, 'metal'); }
    for (let i = 0; i < n; i++) pane(s + ((e - s) * i) / n + 0.04, s + ((e - s) * (i + 1)) / n - 0.04, y0 + 0.08, y0 + h - 0.08);
  }
  for (const [s, e] of cuts) put(s, e, y0 + 2.2, y0 + h, 'metal');
}
// four desks around a cross of partitions at (x, z) on floor y: a monitor and a chair at each
function cubicles(b, x, z, y) {
  const H = 1.45, t = 0.04;
  b.box(x - 1.65, y, z - t, x + 1.65, y + H, z + t, 'cubicle');
  for (const s of [-1, 0, 1]) b.box(x + s * 1.65 - t, y, z - 1.5, x + s * 1.65 + t, y + H, z + 1.5, 'cubicle');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cx = x + sx * 0.825, cz = z + sz * 0.42;
    b.box(cx - 0.72, y, cz - 0.34, cx + 0.72, y + 0.74, cz + 0.34, 'woodPale', { pen: 0.7 });
    const mz = z + sz * 0.22;
    b.box(cx - 0.26, y + 0.74, mz - 0.05, cx + 0.26, y + 1.12, mz + 0.05, 'black', flat);
    b.box(cx - 0.23, y + 0.77, mz + sz * 0.05, cx + 0.23, y + 1.09, mz + sz * 0.06, 'screen', flat);
    b.box(cx - 0.24, y, cz + sz * 0.72 - 0.24, cx + 0.24, y + 0.5, cz + sz * 0.72 + 0.24, 'fabricDark', flat);
    b.box(cx - 0.24, y + 0.5, cz + sz * 0.94 - 0.04, cx + 0.24, y + 1.0, cz + sz * 0.94 + 0.04, 'fabricDark', flat);
  }
}
function plant(b, x, z, y = 0, s = 1) {
  b.box(x - 0.28 * s, y, z - 0.28 * s, x + 0.28 * s, y + 0.55 * s, z + 0.28 * s, 'metalWhite', { pen: 0.6 });
  b.geom(BLOB, 'foliage', mtx(x, y + 1.05 * s, z, x * 1.7 + z, 0.45 * s, 0.65 * s, 0.45 * s));
}
// storage shelving along z: uprights, beams and decks with boxes on them; one solid block to walk and shoot against
function rack(b, x, z0, z1) {
  b.box(x - 0.45, 0, z0, x + 0.45, 2.5, z1, 'metalYellow', { visual: false, pen: 0.5 });
  const n = Math.max(1, Math.round((z1 - z0) / 2.2));
  for (let i = 0; i <= n; i++) { const z = z0 + ((z1 - z0) * i) / n; for (const s of [-1, 1]) b.box(x + s * 0.41 - 0.04, 0, z - 0.04, x + s * 0.41 + 0.04, 2.5, z + 0.04, 'metalDark', flat); }
  for (const y of [0.12, 0.95, 1.75]) {
    b.box(x - 0.45, y, z0, x + 0.45, y + 0.08, z1, 'metalYellow', flat);
    for (let i = 0; i < n; i++) {
      const za = z0 + ((z1 - z0) * i) / n + 0.1, zb = z0 + ((z1 - z0) * (i + 1)) / n - 0.1;
      for (let k = 0; za + k * 0.55 + 0.48 < zb; k++) if (hash(x, y, k + i * 7) > 0.25) b.box(x - 0.36, y + 0.08, za + k * 0.55, x + 0.36, y + 0.43 + hash(x, k, i) * 0.3, za + k * 0.55 + 0.48, 'cardboard', flat);
    }
  }
}
// a row of server cabinets along z: dark steel, little lights on both sides
function servers(b, x, z0, z1) {
  b.box(x - 0.45, 0, z0, x + 0.45, 2.1, z1, 'metalDark', { pen: 0.4 });
  const n = Math.round((z1 - z0) / 0.62);
  for (let i = 0; i < n; i++) {
    const z = z0 + ((i + 0.5) * (z1 - z0)) / n;
    for (const s of [-1, 1]) {
      const f0 = x + s * 0.45, f1 = x + s * 0.47;
      b.box(Math.min(f0, f1), 0.25, z - 0.26, Math.max(f0, f1), 1.95, z + 0.26, 'black', flat);
      for (let k = 0; k < 5; k++) {
        const g0 = x + s * 0.47, g1 = x + s * 0.485, dz = hash(i, k, s) * 0.3;
        b.box(Math.min(g0, g1), 0.5 + k * 0.28, z - 0.2 + dz, Math.max(g0, g1), 0.54 + k * 0.28, z - 0.16 + dz, hash(k, i, x) > 0.72 ? 'lampRed' : 'lampBlue', flat);
      }
    }
  }
}
// a desk with a monitor: along 'x' or 'z', the monitor toward -dir of the other axis
function desk(b, x, z, y, along, dir = 1) {
  const ax = along === 'x', hx = ax ? 0.8 : 0.4, hz = ax ? 0.4 : 0.8;
  b.box(x - hx, y, z - hz, x + hx, y + 0.75, z + hz, 'woodDark', { pen: 0.6 });
  const mx = ax ? x : x - dir * 0.2, mz = ax ? z - dir * 0.2 : z;
  b.box(mx - (ax ? 0.28 : 0.05), y + 0.75, mz - (ax ? 0.05 : 0.28), mx + (ax ? 0.28 : 0.05), y + 1.15, mz + (ax ? 0.05 : 0.28), 'black', flat);
}
function sofa(b, x, z, y, along, dir = 1) {
  const ax = along === 'x', hx = ax ? 1.0 : 0.45, hz = ax ? 0.45 : 1.0;
  b.box(x - hx, y, z - hz, x + hx, y + 0.45, z + hz, 'fabricDark', { pen: 0.8 });
  if (ax) b.box(x - hx, y + 0.45, z - dir * 0.45, x + hx, y + 0.85, z - dir * 0.25, 'fabricDark', { pen: 0.8 });
  else b.box(x - dir * 0.45, y + 0.45, z - hz, x - dir * 0.25, y + 0.85, z + hz, 'fabricDark', { pen: 0.8 });
}
// a vending machine against a wall, its front toward dir along z
function vending(b, x, z, mat, dir) {
  b.box(x - 0.45, 0, z - 0.38, x + 0.45, 1.9, z + 0.38, mat, { pen: 0.5 });
  const f = z + dir * 0.38;
  b.box(x - 0.36, 0.9, Math.min(f, f + dir * 0.02), x + 0.05, 1.75, Math.max(f, f + dir * 0.02), 'screen', flat);
  b.box(x + 0.12, 0.9, Math.min(f, f + dir * 0.02), x + 0.36, 1.4, Math.max(f, f + dir * 0.02), 'metalDark', flat);
}

export default {
  id: 'atrium',
  name: 'ATRIUM',
  desc: 'Bürohaus am Abend. Lobby unter dem Glasdach mit Galerie rundum, Großraumbüros, Serverraum und Konferenzraum hinter Glas, Lager und Kantine, Ladehöfe, Gasse und Vorplatz als Flanken.',
  size: 'Klein-Mittel',
  env: {
    sunDir: [0.25, 0.32, 0.9],
    sunColor: 0xffb47c, sunIntensity: 2.5,
    skyTop: 0x34507e, skyHorizon: 0xf2a878, skyBottom: 0x5a5058,
    cloudColor: 0xf8c0a0, clouds: 0.4,
    hemiSky: 0xc4c4d4, groundColor: 0xb4aea4, ambient: 1.6, // (light from below: the ceilings are lit by the floors)
    fogColor: 0xc0a090, fogNear: 50, fogFar: 210,
  },
  bounds: { minX: -31, maxX: 31, minZ: -22, maxZ: 21 },
  navTop: 4.6,     // both floors are floors, the roof is not
  mmCeiling: 3.3,  // the minimap shows the ground floor

  build(B) {
    // ------------------------------------------------------------- ground, streets around
    B.box(-44, -1, -34, 44, 0, 32, 'asphalt');
    B.box(-44, 0, -30, 44, 0.15, -24, 'concrete');                      // sidewalk across the street
    for (let x = -40; x < 41; x += 6) B.box(x - 1.5, 0.004, -23.2, x + 1.5, 0.012, -23.0, 'paintWhite', flat);
    B.box(-44, 0, 21, 44, 9, 22.5, 'brickDark');                        // the building across the alley
    B.box(-44, 9, 21, 44, 30, 22.5, 'brickDark', { visual: false });
    for (let x = -28; x <= 28; x += 4) for (const y of [3.2, 6.4]) B.box(x - 0.6, y, 20.98, x + 0.6, y + 1.4, 21.0, 'black', flat);
    B.box(-44, 0, -22.4, 44, 30, -22.0, 'concrete', { visual: false }); // the fence along the street keeps everyone in
    railing(B, -31, -22.1, 31, -22.1, 1.2, 'metalDark', false);

    // ------------------------------------------------------------- the lobby
    B.box(-10, 0, -IZ, 10, 0.012, 10, 'marbleFloor', flat);
    // the sculpture in the middle: three steel blades on a stone block (and the way straight through the building
    // from one side entrance to the other ends at it)
    B.box(-1.7, 0, -1.9, 1.7, 0.5, 1.9, 'marble');
    B.box(-1.2, 0.5, -1.75, 1.2, 3.6, 1.75, 'metal', { visual: false });
    for (let i = 0; i < 3; i++) B.geom(new THREE.BoxGeometry(0.28, 3.1, 3.4), 'metal', mtx(0, 2.05, 0, (i * Math.PI) / 3 + 0.2, 1, 1, 1, 0.12, 0));
    // reception, the turnstile line and the seating
    B.box(-3, 0, -9.6, 3, 1.1, -8.9, 'woodDark', { pen: 0.6 });
    B.box(-3.1, 1.1, -9.7, 3.1, 1.16, -8.8, 'marble', flat);
    for (const x of [-1.6, 0, 1.6]) B.box(x - 0.26, 1.16, -9.35, x + 0.26, 1.5, -9.3, 'black', flat);
    B.box(-4.2, 0, -11.2, 4.2, 0.012, -10.2, 'carpetBlue', flat);
    // the main entrance: a porch out into the forecourt
    for (const s of [-1, 1]) {
      B.box(s * 3 - 0.15, 0, -18.5, s * 3 + 0.15, 3.2, -16, 'facade');
      B.box(s > 0 ? 1.6 : -3, 0, -18.5, s > 0 ? 3 : -1.6, 3.2, -18.2, 'facade');
    }
    B.box(-3.3, 3.2, -18.8, 3.3, 3.5, -16, 'facade');
    B.box(-1.6, 2.65, -18.5, 1.6, 3.2, -18.2, 'facade');
    B.box(-1.6, 2.95, -18.6, 1.6, 3.15, -18.5, 'lampOn', flat);
    B.box(-3, 0, -18.5, 3, 0.012, -16, 'marbleFloor', flat);
    // server room behind glass, north of the lobby
    glassWall(B, 'x', -10, 10, 10, 0, C1, [{ c: 0, w: 1.8 }]);
    B.box(-10, 0, 10, 10, 0.02, IZ, 'tilesWhite', flat);
    for (const x of [-7.2, -4.6, -2.0, 2.0, 4.6, 7.2]) servers(B, x, 11.2, 15.0);
    B.box(-0.6, 0, 14.6, 0.6, 2.2, IZ, 'metalWhite');                   // the cooling unit at the back
    B.pointLight(0, 3.0, 12.8, 0x7ab8ff, 3, 10);
    lights(B, -10, 10, 10, IZ, C1 - 0.02, 3.4);
    // upper floor over the server room and the entrance, the gallery around the void, the glass roof
    slab(B, -7, 7, 7, IZ);
    slab(B, -7, -IZ, 7, -7);
    B.box(-10, F2, 7, 10, F2 + 0.012, 10, 'marbleFloor', flat);
    B.box(-10, F2, -10, 10, F2 + 0.012, -7, 'marbleFloor', flat);
    for (const z of [-7, 7]) {
      railing(B, -7, z, 7, z, 1.05, 'metal', true, F2);
      B.box(-7, C1 - 0.5, z - 0.03, 7, F2 + 0.06, z + 0.03, 'plasterWhite', flat);
    }
    B.glassPane(-7, 7.0, -7, 7, 7.04, 7, 0xb8dce8);
    for (let i = 0; i <= 6; i++) { const a = -7 + (14 * i) / 6; B.box(a - 0.06, 6.9, -7, a + 0.06, 7.0, 7, 'metalDark', flat); B.box(-7, 6.9, a - 0.06, 7, 7.0, a + 0.06, 'metalDark', flat); }
    B.pointLight(0, 5.6, 0, 0xffe2c0, 4, 14);
    // boardroom (north) and lounge (south) on the gallery
    glassWall(B, 'x', -10, 10, 10, F2, C2 - F2, [{ c: -6.5, w: 1.6 }, { c: 6.5, w: 1.6 }]);
    glassWall(B, 'x', -10, 10, -10, F2, C2 - F2, [{ c: -6.5, w: 1.6 }, { c: 6.5, w: 1.6 }]);
    B.box(-10, F2, 10, 10, F2 + 0.012, IZ, 'carpetBlue', flat);
    B.box(-5, F2, 12.2, 5, F2 + 0.75, 13.6, 'woodDark', { pen: 0.6 });
    for (let x = -4.2; x <= 4.3; x += 1.4) for (const z of [11.6, 14.2]) B.box(x - 0.22, F2, z - 0.22, x + 0.22, F2 + 0.95, z + 0.22, 'fabricDark', flat);
    B.box(-2.4, F2 + 1.0, IZ - 0.06, 2.4, F2 + 2.4, IZ, 'screen', flat);
    B.box(-6.4, F2, -IZ, 6.4, F2 + 0.012, -10, 'parquet', flat);
    B.box(-3, F2, -IZ, 3, F2 + 0.95, -15.0, 'woodPale', { pen: 0.6 });           // kitchen counter
    B.box(-1.35, F2, -13.6, 1.35, F2 + 0.76, -12.1, 'carPaintGreen', { pen: 0.7 }); // the table tennis table
    B.box(-0.02, F2 + 0.76, -13.6, 0.02, F2 + 0.92, -12.1, 'fabricWhite', flat);
    lights(B, -10, 10, 10, IZ, C2, 3.4);
    lights(B, -6.4, -IZ, 6.4, -10, C2, 3.4);
    // the roof
    B.box(-7, C2, 7, 7, C2 + 0.3, IZ, 'ceiling');
    B.box(-7, C2, -IZ, 7, C2 + 0.3, -7, 'ceiling');
    B.box(-7, C2 - 0.3, -7.3, 7, C2 + 0.35, -7, 'plasterWhite', flat);
    B.box(-7, C2 - 0.3, 7, 7, C2 + 0.35, 7.3, 'plasterWhite', flat);

    // ------------------------------------------------------------- outside: the middle of the alley and the forecourt
    truck(B, 0, 19.8, 'x', 'carPaintBlue', 1);
    B.box(-0.05, 0, -21.6, 0.05, 7.5, -21.5, 'metal');
    B.box(0.05, 6.3, -21.57, 1.35, 7.1, -21.53, 'canvasBlue', flat);

    for (const b of [B, B.mirrored()]) this.half(b);
  },

  half(b) {
    // ================================================================ outer walls, two floors and a parapet
    const west = [
      { c: 10.8, w: 3.2, h: 3.0 }, { c: 0, w: 2.2, h: 2.5 }, { c: -12.5, w: 2.4, y: 1.0, h: 1.4 },
      { c: 12.4, w: 2.4, y: 4.6, h: 1.4 }, { c: 5.2, w: 2.4, y: 4.6, h: 1.4 }, { c: -1.8, w: 2.4, y: 4.6, h: 1.4 }, { c: -12.4, w: 2.4, y: 4.6, h: 1.4 },
      { c: -8.5, w: 1.6, y: F2, h: 2.2, door: true },
    ];
    const north = [
      { c: -16.5, w: 1.6, h: 2.4 }, { c: -19.6, w: 1.8, y: 1.9, h: 0.9 }, { c: -12.6, w: 1.8, y: 1.9, h: 0.9 },
      { c: -19.6, w: 2.4, y: 4.6, h: 1.4 }, { c: -14.2, w: 2.4, y: 4.6, h: 1.4 }, { c: -5, w: 3.2, y: 4.4, h: 1.8 },
    ];
    const south = [
      { c: -14, w: 1.8, h: 2.4 }, { c: -19.4, w: 2.4, y: 1.0, h: 1.4 }, { c: -11.4, w: 1.6, y: 1.0, h: 1.4 }, { c: 0, w: 4.0, h: 2.8 }, { c: -5.2, w: 2.0, y: 1.0, h: 1.6 },
      { c: -19.4, w: 2.4, y: 4.6, h: 1.4 }, { c: -12.6, w: 2.4, y: 4.6, h: 1.4 }, { c: -5, w: 3.2, y: 4.4, h: 1.8 },
    ];
    wallZ(b, -ZW, ZW, -XW + TW / 2, 0, TOP, TW, 'facade', west);
    wallX(b, -XW + TW, 0, ZW - TW / 2, 0, TOP, TW, 'facade', north);
    wallX(b, -XW + TW, 0, -ZW + TW / 2, 0, TOP, TW, 'facade', south);
    panes(b, 'z', -XW + TW / 2, west); panes(b, 'x', ZW - TW / 2, north); panes(b, 'x', -ZW + TW / 2, south);
    for (const y of [C1, C2]) for (const [x0, z0, x1, z1] of [[-XW - 0.06, -ZW - 0.06, -XW, ZW + 0.06], [-XW, ZW, 0, ZW + 0.06], [-XW, -ZW - 0.06, 0, -ZW]]) b.box(x0, y - 0.1, z0, x1, y + 0.3, z1, 'concreteDark', flat); // floor bands
    b.box(-IX, C2, -IZ, -7, C2 + 0.3, IZ, 'ceiling');   // the roof

    // ================================================================ ground floor, west wing
    // corridor from the side entrance to the lobby, storage north of it, canteen south
    wallX(b, -IX, -10, 1.6, 0, C1, TP, 'plasterWhite', [{ c: -16.5, w: 1.6, h: 2.3 }]);
    wallX(b, -IX, -10, -1.6, 0, C1, TP, 'plasterWhite', [{ c: -16.5, w: 1.6, h: 2.3 }]);
    wallZ(b, 1.6, IZ, -10, 0, C1, TP, 'plasterWhite', [{ c: 6.5, w: 1.6, h: 2.3 }, { c: 12.5, w: 1.6, h: 2.3 }]);
    wallZ(b, -IZ, -1.6, -10, 0, C1, TP, 'plasterWhite', [{ c: -3.2, w: 1.6, h: 2.3 }]);
    b.box(-IX, 0, -1.6, -10, 0.012, 1.6, 'carpetGrey', flat);
    plant(b, -11, -1.1); plant(b, -21.2, 1.1);
    b.box(-14.8, 0, 1.22, -13.2, 1.9, 1.52, 'paintWhite', { collide: false, ao: false }); // notice board
    lights(b, -IX, -1.6, -10, 1.6, C1 - 0.02, 3.4);
    // storage: racks, pallets, a forklift
    b.box(-IX, 0, 1.6, -10, 0.012, IZ, 'concreteFloor', flat);
    rack(b, -18.3, 4.2, 13.2);
    rack(b, -14.0, 3.2, 8.8);
    for (const [x, z] of [[-14.2, 11.2], [-12.0, 14.3]]) { b.box(x - 0.6, 0, z - 0.5, x + 0.6, 0.14, z + 0.5, 'woodPale'); b.box(x - 0.5, 0.14, z - 0.42, x + 0.5, 1.1, z + 0.42, 'cardboard', { pen: 0.8 }); }
    forklift(b, -12.4, 9.8, Math.PI / 2);
    b.box(-21.6, 0, 14.4, -20.6, 1.0, 15.6, 'cardboard', { pen: 0.8 });
    lights(b, -IX, 1.6, -10, IZ, C1 - 0.02, 3.6);
    b.pointLight(-16, 2.8, 8.5, 0xfff0d8, 2, 9);
    // canteen
    b.box(-IX, 0, -IZ, -10, 0.012, -1.6, 'tilesCheck', flat);
    b.box(-21.5, 0, -IZ, -16.5, 1.0, -14.9, 'woodPale', { pen: 0.6 });
    b.box(-21.55, 1.0, -IZ, -16.45, 1.05, -14.85, 'metal', flat);
    for (const [x, z] of [[-19.0, -9.4], [-14.8, -9.4], [-19.0, -5.6], [-14.8, -5.6], [-12.4, -12.6]]) {
      b.box(x - 0.8, 0, z - 0.4, x + 0.8, 0.75, z + 0.4, 'woodPale', { pen: 0.7 });
      for (const sx of [-0.45, 0.45]) for (const sz of [-0.62, 0.62]) b.box(x + sx - 0.2, 0, z + sz - 0.2, x + sx + 0.2, 0.46, z + sz + 0.2, 'metalRed', flat);
    }
    vending(b, -20.6, -2.0, 'carPaintRed', -1);
    vending(b, -19.4, -2.0, 'carPaintBlue', -1);
    plant(b, -11, -15.0);
    lights(b, -IX, -IZ, -10, -1.6, C1 - 0.02, 3.4);
    b.pointLight(-16, 2.8, -8.5, 0xfff0d8, 2, 9);
    // lobby side: the lift core by the entrance, seating, planters
    b.box(-10, 0, -IZ, -6.4, C2, -12, 'plasterGrey');
    for (const y of [0, F2]) for (const x of [-9.0, -7.4]) b.box(x - 0.55, y, -12.03, x + 0.55, y + 2.2, -12.0, 'metal', flat);
    sofa(b, -4.2, -3.9, 0, 'z', -1); sofa(b, -4.2, 3.9, 0, 'z', -1);
    plant(b, -4.2, -6.0, 0, 1.3); plant(b, -4.2, 6.0, 0, 1.3);
    lights(b, -10, -10, -7, 10, C1 - 0.02, 3.4);

    // ================================================================ the open stair from the lobby up to the gallery
    stairs(b, -6.3, -6.2, '+z', 1.4, F2, 5.8, 'marble');
    b.box(-7, C1, -0.4, -5.6, F2, 1.4, 'marble');
    railing(b, -5.6, -0.4, -5.6, 1.4, 1.05, 'metal', true, F2);
    railing(b, -7, 1.4, -5.6, 1.4, 1.05, 'metal', true, F2);
    railing(b, -7, -7, -7, -0.4, 1.05, 'metal', true, F2);
    railing(b, -7, 1.4, -7, 7, 1.05, 'metal', true, F2);
    b.box(-7.03, C1 - 0.5, -7, -6.97, F2 + 0.06, -0.4, 'plasterWhite', flat);
    b.box(-7.03, C1 - 0.5, 1.4, -6.97, F2 + 0.06, 7, 'plasterWhite', flat);
    for (let i = 0; i < 6; i++) { const z = -6.0 + i * 1.05, y = Math.min(F2, ((z + 6.2) / 5.8) * F2); b.box(-5.62, 0, z - 0.03, -5.58, y + 1.0, z + 0.03, 'metal', flat); }

    // ================================================================ upper floor, west wing: open-plan offices
    slab(b, -IX, -IZ, -7, IZ);
    b.box(-10, F2, -10, -7, F2 + 0.012, 10, 'marbleFloor', flat);
    // meeting room in the north-west corner, the manager's office in the south-west corner
    glassWall(b, 'x', -IX, -15, 9.6, F2, C2 - F2, [{ c: -16.5, w: 1.6 }]);
    glassWall(b, 'z', 9.6, IZ, -15, F2, C2 - F2, []);
    glassWall(b, 'x', -IX, -15, -9.6, F2, C2 - F2, [{ c: -16.5, w: 1.6 }]);
    glassWall(b, 'z', -IZ, -9.6, -15, F2, C2 - F2, []);
    b.box(-20.4, F2, 11.6, -16.4, F2 + 0.75, 13.6, 'woodPale', { pen: 0.6 });
    for (let x = -20; x <= -16.6; x += 1.1) for (const z of [11.1, 14.1]) b.box(x - 0.22, F2, z - 0.22, x + 0.22, F2 + 0.95, z + 0.22, 'fabricDark', flat);
    desk(b, -18.4, -12.6, F2, 'x', -1);
    b.box(-18.7, F2, -14.2, -18.1, F2 + 1.0, -13.6, 'fabricDark', flat);
    b.box(-21.55, F2, -15.4, -20.9, F2 + 1.9, -13.2, 'woodDark', { pen: 0.6 });
    plant(b, -16.0, -15.0, F2);
    // the boardroom and lounge walls toward the wing
    wallZ(b, 10, IZ, -10, F2, C2 - F2, TP, 'plasterWhite', [{ c: 12.5, w: 1.6, h: 2.2 }]);
    // cubicles, copier, low cabinets along the gallery
    cubicles(b, -18.2, 4.4, F2);
    cubicles(b, -18.2, -3.8, F2);
    cubicles(b, -13.0, 4.4, F2);
    cubicles(b, -13.0, -3.8, F2);
    b.box(-12.0, F2, -8.6, -11.0, F2 + 1.05, -7.9, 'metalWhite', { pen: 0.6 });          // copier
    for (const [z0, z1] of [[-6.8, -4.6], [4.6, 6.8]]) b.box(-10.6, F2, z0, -10.1, F2 + 1.0, z1, 'woodDark', { pen: 0.6 });
    plant(b, -10.4, 0.3, F2, 1.1); plant(b, -21.2, 8.6, F2); plant(b, -21.2, -6.2, F2);
    lights(b, -IX, -IZ, -7, IZ, C2, 3.4);
    b.pointLight(-15.5, 6.0, 0, 0xfff4e0, 3, 12);

    // ================================================================ the loading yard (spawn) and the outside stair
    for (let z = -19; z <= 19; z += 3.2) if (Math.abs(z - 11) > 3) b.box(-31, 0.004, z - 0.06, -27.4, 0.012, z + 0.06, 'paintWhite', flat);
    b.box(-24.2, 0.004, 9.0, -22, 0.012, 12.6, 'hazardStripe', flat);
    truck(b, -26.35, 13.6, 'x', 'carPaintWhite', -1);
    car(b, -27.2, 4.6, 'x', 'carPaintBlue');
    car(b, -27.6, -5.6, 'x', 'carPaintRed');
    car(b, -27.0, -13.6, 'x', 'carPaintWhite');
    for (const [x, z] of [[-23.2, 7.6], [-23.2, 6.4]]) { b.box(x - 0.6, 0, z - 0.5, x + 0.6, 0.14, z + 0.5, 'woodPale'); b.box(x - 0.5, 0.14, z - 0.42, x + 0.5, 1.0, z + 0.42, 'cardboard', { pen: 0.8 }); }
    b.box(-30.6, 0, 18.2, -28.6, 1.3, 19.6, 'contGreen'); b.box(-30.7, 1.3, 18.1, -28.5, 1.4, 19.7, 'metalDark', flat);
    stairs(b, -22.65, -2.4, '-z', 1.3, F2, 5.0, 'grate');
    b.box(-23.3, C1, -9.0, -22.0, F2, -7.4, 'grate');
    for (const [x, z] of [[-23.25, -8.95], [-23.25, -7.45]]) b.box(x - 0.05, 0, z - 0.05, x + 0.05, C1, z + 0.05, 'metalDark');
    railing(b, -23.3, -9.0, -23.3, -7.4, 1.05, 'metalDark', true, F2);
    railing(b, -23.3, -9.0, -22.0, -9.0, 1.05, 'metalDark', true, F2);
    for (let i = 0; i < 5; i++) { const z = -2.7 - i * 1.15, y = ((-2.4 - z) / 5.0) * F2; b.box(-23.32, 0, z - 0.03, -23.26, y + 1.0, z + 0.03, 'metalDark', flat); }
    lampPost(b, -30.4, 1.2, 6.5, [1, 0]); lampPost(b, -30.4, -16, 6.5, [1, 0]);
    b.pointLight(-29.6, 6.0, 1.2, 0xffc880, 2.5, 16);
    // the edge of the yard: fence, and beyond it nothing but road
    b.box(-31.4, 0, -22, -31, 30, 21, 'concrete', { visual: false });
    railing(b, -31.1, -22, -31.1, 21, 2.2, 'metalDark', false);

    // ================================================================ the alley along the north wall
    b.box(-8.6, 0, ZW, -5.4, 2.4, 19.0, 'metalWhite', { pen: 0.4 });     // air-conditioning plant
    for (const x of [-7.8, -6.2]) b.geom(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 14), 'black', mtx(x, 2.42, 17.5));
    b.box(-17.6, 0, 19.6, -15.6, 1.3, 21, 'contGreen'); b.box(-17.7, 1.3, 19.5, -15.5, 1.4, 21, 'metalDark', flat);
    b.box(-13.2, 0, 20.0, -12.0, 0.14, 21, 'woodPale'); b.box(-13.1, 0.14, 20.1, -12.1, 1.1, 20.9, 'cardboard', { pen: 0.8 });
    b.box(-24.0, 0, 20.2, -21.6, 0.45, 20.8, 'woodDark');
    lampPost(b, -11, 20.6, 5.5, [0, -1]);

    // ================================================================ the forecourt along the south wall
    b.box(-9.2, 0, -22, -6.0, 0.6, -18.0, 'concrete');                  // hedges in planters
    b.box(-9.1, 0.6, -21.9, -6.1, 2.1, -18.1, 'hedge');
    b.box(-14.2, 0, -21.2, -12.8, 0.6, -19.8, 'concrete');
    tree(b, -13.5, -20.5, 6.5, 2.0);
    for (const x of [-18.5, -4.6]) b.box(x - 0.9, 0, -21.4, x + 0.9, 0.45, -20.9, 'woodDark');
    b.box(-23.0, 0, -20.8, -22.4, 2.6, -20.2, 'metalDark', { collide: true });  // a post with the parking sign
    b.box(-23.05, 1.9, -20.85, -22.35, 2.5, -20.15, 'paintWhite', flat);
    lampPost(b, -16.6, -21.4, 5.5, [0, 1]);
  },

  spawns() {
    const west = [[-28.0, 0, 18.5], [-24.6, 0, 17.0], [-29.0, 0, 9.0], [-24.4, 0, 8.4], [-28.6, 0, 0.6], [-24.8, 0, -1.6], [-29.5, 0, -9.6], [-24.8, 0, -17.2], [-29.0, 0, -19.6]];
    return { 0: west.map(([x, y, z]) => [x, y, z, -Math.PI / 2]), 1: west.map(([x, y, z]) => [-x, y, z, Math.PI / 2]) };
  },

  hotspots: [
    [-4, 0, 5], [4, 0, 5], [-4, 0, -5], [4, 0, -5], [0, 0, -12.5], [-8.5, 0, 0], [8.5, 0, 0], [-16, 0, 0], [16, 0, 0],
    [-16, 0, 9], [16, 0, 9], [-16, 0, -8], [16, 0, -8], [0, 0, 13], [-8.5, F2, 0], [8.5, F2, 0], [0, F2, 8.5], [0, F2, -8.5],
    [0, F2, 13], [0, F2, -13], [-16, F2, 0.3], [16, F2, 0.3], [-18, F2, 12.5], [18, F2, 12.5], [-18, F2, -12.5], [18, F2, -12.5],
    [0, 0, 17.4], [-12, 0, 18], [12, 0, 18], [0, 0, -20.5], [-12, 0, -18.5], [12, 0, -18.5],
  ],
};
