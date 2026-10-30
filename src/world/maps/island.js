import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Terrain, makeNoise, sstep } from '../terrain.js';
import {
  Kit, rnd, PLAIN, WALL, cottage, townhouse, row, stadthaus, villa, apartments, galleryBlock, courtyard, shop, bar, officeTower, townHall, hotel, school, parking,
  warehouse, garage, gasStation, ruin, church, bunker, barracks, controlTower, fisherHut, bungalow, farmhouse, radioShack, coverPile,
} from '../buildings.js';
import { container, barrel, sandbags, barrier, truck, lampPost, stairs, tree, palm, mtx } from '../props.js';

// =============================================================================
// SERENA — the Warzone island, small enough that the next place is always in reach.
//   Center : Porto Sereno: town hall on the plaza, office tower, hotel, courtyard
//            palace, clinic, market hall, parking deck, apartments and a row of houses.
//   South  : harbor with warehouses, container stacks and a moored freighter.
//   West   : airfield with hangars and a tower; resort on the far beach.
//   North  : military base on a plateau; mountain village; radio station on a peak.
//   East   : industrial park; fishing village on the coast.
// North is -z. Sea level is y = 0.
// =============================================================================
const SIZE = 860, CELL = 4;
export const WORLD_R = 375; // nobody leaves this circle

const POI = {
  city: { name: 'PORTO SERENO', x: 0, z: 10, w: 150, d: 136, y: 12, blend: 26, big: true },
  harbor: { name: 'HAFEN', x: 20, z: 255, w: 130, d: 70, y: 3.4, blend: 12 },
  airfield: { name: 'FLUGFELD', x: -200, z: 140, w: 140, d: 74, y: 9, blend: 24 },
  base: { name: 'MILIT\u00c4RBASIS', x: -165, z: -135, w: 96, d: 84, y: 20, blend: 24 },
  factory: { name: 'INDUSTRIEPARK', x: 195, z: 125, w: 104, d: 86, y: 8, blend: 24 },
  bergdorf: { name: 'BERGDORF', x: 105, z: -175, w: 76, d: 62, y: 28, blend: 22 },
  fischer: { name: 'FISCHERDORF', x: 260, z: -50, w: 62, d: 72, y: 4, blend: 18 },
  resort: { name: 'RESORT', x: -225, z: -5, w: 64, d: 86, y: 5, blend: 18 },
  farm: { name: 'GUTSHOF', x: -125, z: 62, w: 50, d: 46, y: 12, blend: 18 },
  radar: { name: 'FUNKSTATION', x: -20, z: -225, w: 36, d: 30, y: 40, blend: 18 },
  weilerO: { name: 'OSTWEILER', x: 130, z: -30, w: 40, d: 38, y: 14, blend: 16 },
  weilerS: { name: 'S\u00dcDWEILER', x: -60, z: 150, w: 40, d: 38, y: 9, blend: 16 },
};

const MOUNTAINS = [
  [12, -140, 41, 84], [-74, -208, 31, 65], [-28, -251, 30, 38], [186, -149, 35, 69], [133, 59, 14, 36],
  [-155, 25, 21, 51], [-19, 189, 11, 41], [276, 43, 16, 38], [-260, -118, 15, 47], [81, -81, 12, 37],
];

const ROADS = [
  { pts: [[22, 78], [18, 130], [24, 185], [30, 222]], w: 4.6 },
  { pts: [[-75, 62], [-98, 92], [-118, 112], [-132, 125]], w: 4.6 },
  { pts: [[-75, -30], [-95, -60], [-112, -80], [-125, -96]], w: 4.4 },
  { pts: [[75, 55], [105, 75], [130, 92], [150, 100]], w: 4.6 },
  { pts: [[22, -58], [50, -90], [75, -120], [92, -146]], w: 4 },
  { pts: [[-75, 5], [-120, 2], [-165, -2], [-195, -5]], w: 4.2 },
  { pts: [[75, -10], [105, -22], [150, -35], [230, -50]], w: 4.2 },
  { pts: [[60, 222], [110, 195], [150, 170], [170, 165]], w: 3.8 },
  { pts: [[-135, 180], [-85, 205], [-40, 225], [-25, 232]], w: 3.8 },
  { pts: [[-215, 100], [-240, 65], [-245, 40]], w: 3.2, dirt: true },
  { pts: [[-190, -95], [-215, -70], [-225, -48]], w: 3.2, dirt: true },
  { pts: [[140, -165], [190, -105], [245, -88]], w: 3.2, dirt: true },
  { pts: [[-100, 65], [-90, 60], [-75, 55]], w: 3.2, dirt: true },
  { pts: [[-118, -150], [-75, -175], [-40, -205], [-25, -212]], w: 3, dirt: true },
  { pts: [[-50, 130], [-35, 105], [-20, 80]], w: 3.2, dirt: true },
];

// ---------------------------------------------------------------------------
// Height
// ---------------------------------------------------------------------------
function rectMask(p, x, z, blend) {
  const dx = Math.abs(x - p.x) - p.w / 2, dz = Math.abs(z - p.z) - p.d / 2;
  const d = Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
  return 1 - sstep(0, blend, d);
}

function buildHeights(t, roadsOut) {
  const N = makeNoise(4242);
  const coastR = (a) => 300 + 24 * Math.sin(a * 3 + 1.2) + 14 * Math.sin(a * 5 + 0.4) + 8 * Math.sin(a * 11 + 2.2) + 18 * (N.fbm(Math.cos(a) * 3 + 7, Math.sin(a) * 3 + 7, 3) - 0.5);
  const base = (x, z) => {
    const d = Math.hypot(x, z), R = coastR(Math.atan2(z, x));
    const land = sstep(0, 0.17, 1 - d / R);
    let h = 6 + 12 * N.fbm(x / 110 + 11, z / 110 + 3, 4) + 3 * N.fbm(x / 34, z / 34, 2);
    for (const [mx, mz, mh, mr] of MOUNTAINS) {
      const q = Math.hypot(x - mx, z - mz) / mr;
      if (q < 2.2) h += mh * Math.exp(-q * q * 1.6) * (0.72 + 0.56 * N.fbm(x / 26 + 40, z / 26, 3));
    }
    return -1.4 + (h + 1.4) * land;
  };
  t.fill(base);
  const places = Object.values(POI);
  const flatten = () => {
    const { w, h, ox, oz, cell } = t;
    for (const p of places) {
      const R = Math.max(p.w, p.d) / 2 + p.blend + 8;
      const i0 = Math.max(0, Math.floor((p.x - R - ox) / cell)), i1 = Math.min(w - 1, Math.ceil((p.x + R - ox) / cell));
      const j0 = Math.max(0, Math.floor((p.z - R - oz) / cell)), j1 = Math.min(w - 1, Math.ceil((p.z + R - oz) / cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = rectMask(p, ox + i * cell, oz + j * cell, p.blend);
        if (k > 0) h[j * w + i] += (p.y - h[j * w + i]) * k;
      }
    }
  };
  flatten();
  // roads: a smoothed profile along each line, the ground blends into it
  const { w, h, ox, oz, cell } = t;
  const best = new Float32Array(w * w).fill(1e9), target = new Float32Array(w * w), width = new Float32Array(w * w);
  for (const r of ROADS) {
    const c = new THREE.CatmullRomCurve3(r.pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    const L = c.getLength(), n = Math.ceil(L / 8), pts = c.getSpacedPoints(n);
    for (const p of pts) p.y = Math.max(1.4, t.heightAt(p.x, p.z));
    for (let pass = 0; pass < 6; pass++) {
      const ys = pts.map((p, i) => (pts[Math.max(0, i - 1)].y + p.y * 2 + pts[Math.min(n, i + 1)].y) / 4);
      pts.forEach((p, i) => { p.y = ys[i]; });
    }
    roadsOut.push({ pts, w: r.w, dirt: !!r.dirt });
    for (let s = 0; s < n; s++) {
      const a = pts[s], e = pts[s + 1], R = r.w + 12;
      const i0 = Math.max(0, Math.floor((Math.min(a.x, e.x) - R - ox) / cell)), i1 = Math.min(w - 1, Math.ceil((Math.max(a.x, e.x) + R - ox) / cell));
      const j0 = Math.max(0, Math.floor((Math.min(a.z, e.z) - R - oz) / cell)), j1 = Math.min(w - 1, Math.ceil((Math.max(a.z, e.z) + R - oz) / cell));
      const dx = e.x - a.x, dz = e.z - a.z, LL = dx * dx + dz * dz;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = ox + i * cell, z = oz + j * cell;
        const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / LL));
        const q = Math.hypot(x - a.x - dx * u, z - a.z - dz * u), k = j * w + i;
        if (q < best[k]) { best[k] = q; target[k] = a.y + (e.y - a.y) * u; width[k] = r.w; }
      }
    }
  }
  for (let k = 0; k < h.length; k++) {
    if (best[k] > 1e8) continue;
    const m = 1 - sstep(width[k] + 0.5, width[k] + 12, best[k]);
    if (m > 0) h[k] += (target[k] - h[k]) * m;
  }
  flatten(); // towns stay perfectly level
  t.roadDist = best;
  t.finish();
  t.N = N;
}

// ---------------------------------------------------------------------------
// Painted ground
// ---------------------------------------------------------------------------
const BX = [[-66, -27], [-17, 17], [27, 66]], BZ = [[-50, -15], [-5, 25], [35, 70]]; // the town's blocks

function paintGround(t, roads) {
  const N = t.N, S0 = 1024, c0 = document.createElement('canvas'); c0.width = c0.height = S0;
  const x0 = c0.getContext('2d'), img = x0.createImageData(S0, S0), D = img.data;
  const mix = (a, b, k) => a + (b - a) * k;
  for (let py = 0; py < S0; py++) for (let px = 0; px < S0; px++) {
    const x = t.ox + (px + 0.5) / S0 * SIZE, z = t.oz + (py + 0.5) / S0 * SIZE, h = t.heightAt(x, z), sl = t.slopeAt(x, z);
    const n1 = N.fbm(x / 34, z / 34, 3), n2 = N.fbm(x / 9, z / 9, 2), n3 = N.fbm(x / 100 + 5, z / 100, 2);
    // two greens and a dry straw tone
    let r = mix(94, 124, n1), g = mix(122, 146, n1), bl = mix(58, 70, n1);
    const dry = sstep(0.5, 0.72, n3);
    r = mix(r, 158, dry * 0.6); g = mix(g, 148, dry * 0.6); bl = mix(bl, 86, dry * 0.6);
    const k2 = (n2 - 0.5) * 22; r += k2; g += k2; bl += k2 * 0.7;
    // bare earth patches
    const earth = sstep(0.62, 0.74, N.fbm(x / 22 + 90, z / 22, 3)) * 0.5;
    r = mix(r, 136, earth); g = mix(g, 112, earth); bl = mix(bl, 80, earth);
    // rock on steep ground and up high
    const rock = Math.max(sstep(0.48, 0.78, sl), sstep(36, 52, h + (n2 - 0.5) * 10) * 0.85);
    const rv = 118 + (n2 - 0.5) * 50;
    r = mix(r, rv, rock); g = mix(g, rv * 0.97, rock); bl = mix(bl, rv * 0.9, rock);
    // beach, then wet sand under the water
    const sand = 1 - sstep(1.6, 3.6, h + (n2 - 0.5) * 1.6);
    r = mix(r, 214, sand); g = mix(g, 196, sand); bl = mix(bl, 150, sand);
    if (h < 0.3) { const w = sstep(0.3, -1.2, h); r = mix(r, 130, w); g = mix(g, 138, w); bl = mix(bl, 118, w); }
    const k = (py * S0 + px) * 4; D[k] = r; D[k + 1] = g; D[k + 2] = bl; D[k + 3] = 255;
  }
  x0.putImageData(img, 0, 0);
  const S = 2048, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high'; x.drawImage(c0, 0, 0, S, S);
  const px = (v) => (v - t.ox) / SIZE * S, sc = S / SIZE;
  // place grounds
  const soft = (p, col, grow = 6, blur = 10) => {
    x.save(); x.fillStyle = col; x.shadowColor = col; x.shadowBlur = blur;
    x.fillRect(px(p.x - p.w / 2 - grow), px(p.z - p.d / 2 - grow), (p.w + grow * 2) * sc, (p.d + grow * 2) * sc);
    x.restore();
  };
  soft({ x: 0, z: 10, w: 140, d: 128 }, '#7c7a74', 1);
  soft(POI.harbor, '#6c6c6a', -3);
  soft({ x: POI.base.x, z: POI.base.z, w: 92, d: 78 }, '#8a7c60');
  soft({ x: POI.factory.x, z: POI.factory.z, w: 96, d: 80 }, '#6e6c68');
  soft({ x: POI.airfield.x, z: POI.airfield.z, w: 136, d: 70 }, '#7a7a70');
  soft({ x: POI.resort.x + 6, z: POI.resort.z, w: 48, d: 66 }, '#b8a888', 2, 14);
  soft({ x: POI.fischer.x - 6, z: POI.fischer.z, w: 44, d: 60 }, '#a09070', 2, 14);
  soft({ x: POI.bergdorf.x, z: POI.bergdorf.z, w: 62, d: 50 }, '#8e8468', 2, 14);
  soft({ x: POI.farm.x, z: POI.farm.z, w: 38, d: 34 }, '#8c7a58', 2, 14);
  soft({ x: POI.weilerO.x, z: POI.weilerO.z, w: 32, d: 30 }, '#8c8064', 2, 12);
  soft({ x: POI.weilerS.x, z: POI.weilerS.z, w: 32, d: 30 }, '#8c8064', 2, 12);
  soft({ x: POI.radar.x, z: POI.radar.z, w: 28, d: 24 }, '#7c766a', 2, 8);
  // roads
  x.lineJoin = x.lineCap = 'round';
  const stroke = (r, w, col, dash) => {
    x.beginPath(); x.strokeStyle = col; x.lineWidth = w * sc; x.setLineDash(dash || []);
    r.pts.forEach((p, i) => (i ? x.lineTo(px(p.x), px(p.z)) : x.moveTo(px(p.x), px(p.z))));
    x.stroke(); x.setLineDash([]);
  };
  for (const r of roads) stroke(r, r.w * 2 + 3, r.dirt ? 'rgba(112,94,66,0.55)' : 'rgba(120,108,84,0.7)');
  for (const r of roads) stroke(r, r.w * 2, r.dirt ? '#7c6a4c' : '#3c3c3e');
  for (const r of roads) if (!r.dirt) stroke(r, 0.28, '#c8c4b0', [3 * sc, 4 * sc]);
  // town streets: the grid between the blocks, sidewalks on the blocks, pavers on the plaza
  x.fillStyle = '#3c3c3e'; x.fillRect(px(-74), px(-58), 148 * sc, 136 * sc);
  x.strokeStyle = '#c8c4b0'; x.lineWidth = 0.28 * sc; x.setLineDash([3 * sc, 4 * sc]);
  for (const v of [-22, 22]) { x.beginPath(); x.moveTo(px(v), px(-58)); x.lineTo(px(v), px(78)); x.stroke(); }
  for (const v of [-10, 30]) { x.beginPath(); x.moveTo(px(-74), px(v)); x.lineTo(px(74), px(v)); x.stroke(); }
  x.setLineDash([]);
  for (const [a, e] of BX) for (const [f, g] of BZ) { x.fillStyle = '#9c988e'; x.fillRect(px(a - 1.5), px(f - 1.5), (e - a + 3) * sc, (g - f + 3) * sc); }
  x.fillStyle = '#b0a288'; x.fillRect(px(-17), px(-5), 34 * sc, 30 * sc);
  x.strokeStyle = 'rgba(70,60,48,0.35)'; x.lineWidth = 1;
  for (let v = -17; v <= 17; v += 2) { x.beginPath(); x.moveTo(px(v), px(-5)); x.lineTo(px(v), px(25)); x.stroke(); }
  for (let v = -5; v <= 25; v += 2) { x.beginPath(); x.moveTo(px(-17), px(v)); x.lineTo(px(17), px(v)); x.stroke(); }
  // runway
  const A = POI.airfield;
  x.fillStyle = '#3e3e40'; x.fillRect(px(A.x - 68), px(A.z + 8), 136 * sc, 24 * sc);
  x.fillStyle = '#d8d4c4';
  for (let v = -60; v < 60; v += 14) x.fillRect(px(A.x + v), px(A.z + 19.5), 8 * sc, 0.9 * sc);
  for (const e of [-66, 57]) for (let v = 0; v < 5; v++) x.fillRect(px(A.x + e), px(A.z + 10 + v * 4.3), 8 * sc, 2 * sc);
  // helipad
  x.strokeStyle = '#d8d4c4'; x.lineWidth = 0.7 * sc;
  x.beginPath(); x.arc(px(POI.base.x + 28), px(POI.base.z + 22), 7 * sc, 0, Math.PI * 2); x.stroke();
  x.font = `bold ${Math.round(8 * sc)}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#d8d4c4';
  x.fillText('H', px(POI.base.x + 28), px(POI.base.z + 22));
  return c;
}

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------
const placer = (b, out, y) => (f, x, z, rot = 0, o = {}) => f(b, out, { x, z, y, rot, ...o });

function city(b, out) {
  const y = POI.city.y, A = new Kit(b, out, { y }), on = placer(b, out, y);
  // ---- north row: the tower, the town hall facing the plaza, apartments and a row of houses
  on(officeTower, -47, -27, 0, { floors: 8 });
  on(townHall, 0, -32.6);
  on(apartments, 46.5, -40, 0, { floors: 4 });
  on(row, 46.5, -23.7, 0, { n: 4 });
  // ---- middle row: hotel and shops, the plaza, the courtyard palace with its gate toward the plaza
  on(hotel, -46.5, 17, 0, { floors: 4 });
  on(shop, -55, 2, 2, { sign: 'APOTHEKE' });
  on(shop, -37, 2, 2, { sign: 'B\u00c4CKEREI' });
  on(courtyard, 46.5, 10, 3);
  // ---- south row: market hall, clinic and town houses behind it, the parking deck
  on(warehouse, -46.5, 50, 0, { kind: 'market', w: 30, d: 24, h: 7.5, ext: 'brickDark', wall: 'brickDark', floor: 'paversDark', roofMat: 'concreteDark', sign: 'MARKT', walkY: 3.6, gates: [{ side: 'n', at: -6, w: 5, h: 3.8 }, { side: 'n', at: 6, w: 5, h: 3.8 }, { side: 's', at: 0, w: 6, h: 4 }, { side: 'e', at: 2, w: 4, h: 3.6 }, { side: 'w', at: 4, w: 4, h: 3.6 }] });
  on(school, 0, 43, 2, { clinic: true, floors: 3 });
  on(stadthaus, -10, 63, 0, { floors: 3, shop: true });
  on(stadthaus, 10, 63, 0, { floors: 4 });
  on(parking, 46.5, 48, 0, { w: 30, d: 24 });
  on(bar, 36, 67);
  on(garage, 55, 67);
  // ---- the plaza: fountain, statues, market stalls, trees
  const P = 10;
  A.box(-5, 0, P - 4.5, 5, 0.55, P + 4.5, 'marble');
  A.box(-1.1, 0.55, P - 1.1, 1.1, 2.9, P + 1.1, 'marble');
  A.box(-3.8, 0.55, P - 3.3, 3.8, 0.6, P + 3.3, 'waterFountain', { collide: false, ao: false });
  for (const [sx, sz] of [[-13, -1], [13, -1], [-13, 21], [13, 21]]) {
    A.box(sx - 1, 0, sz - 1, sx + 1, 1.2, sz + 1, 'marble');
    A.box(sx - 0.38, 1.2, sz - 0.38, sx + 0.38, 3.3, sz + 0.38, 'metalDark', WALL);
    tree(A, sx > 0 ? sx - 5 : sx + 5, sz, 6.5, 2.3);
  }
  for (const [mx, mz, cm] of [[-9, 2, 'canvasRed'], [9, 18, 'canvasGreen'], [9, 2, 'canvasBlue'], [-9, 18, 'canvasYellow']]) {
    A.box(mx - 2.2, 0, mz - 0.9, mx + 2.2, 1.0, mz + 0.9, 'wood', { pen: 0.7, skirt: false });
    for (const [ax, az] of [[-2, -0.8], [2, -0.8], [-2, 0.8], [2, 0.8]]) A.box(mx + ax - 0.06, 0, mz + az - 0.06, mx + ax + 0.06, 2.6, mz + az + 0.06, 'woodDark', { ...PLAIN, collide: false });
    A.box(mx - 2.6, 2.6, mz - 1.3, mx + 2.6, 2.72, mz + 1.3, cm, { ...PLAIN, collide: false });
    A.spot(mx, 1.0, mz, { indoor: false, kind: 'floor' });
  }
  // ---- the streets: lamps, barriers, a few cars and crates to run between
  for (const z of [-45, -15, 15, 45, 70]) { lampPost(A, -27.6, z, 6.5, [1, 0], false); lampPost(A, 27.6, z, 6.5, [-1, 0], false); }
  for (const x of [-60, -40, 0, 40, 60]) { lampPost(A, x, -4.4, 6.5, [0, -1], false); lampPost(A, x, 34.4, 6.5, [0, -1], false); }
  coverPile(A, -24, -30); coverPile(A, 21, -36); coverPile(A, -22, 50); coverPile(A, 24, 58); coverPile(A, -8, -12); coverPile(A, 62, -8); coverPile(A, -62, 30); coverPile(A, 12, 29);
  barrier(A, -18, 30, 'x', 3); barrier(A, 18, -10, 'x', 3); barrier(A, 22, 5, 'z', 3); barrier(A, -22, 15, 'z', 3);
  A.vehicle('sedan', 18, -6, 1.57);
  // the spots on the streets themselves
  for (const [x, z] of [[-22, -40], [22, -45], [-40, -10], [40, 30], [-22, 40], [22, 72], [60, 30], [-60, -10]]) A.spot(x, 0, z, { indoor: false, kind: 'floor', ground: true });
}

function harbor(b, out) {
  const p = POI.harbor, y = p.y, A = new Kit(b, out, { y }), Z = p.z, on = placer(b, out, y);
  // quay: one long concrete edge over the water
  b.box(p.x - 62, y - 4, Z + 22, p.x + 62, y, Z + 36, 'concreteDark', PLAIN);
  for (let i = 0; i < 7; i++) A.box(p.x - 54 + i * 18, 0, Z + 34, p.x - 53 + i * 18, 0.6, Z + 35, 'metalYellow', WALL);
  // warehouses
  on(warehouse, p.x - 38, Z - 16, 0, { w: 34, d: 24, h: 8.5, ext: 'corrugated', sign: 'LAGER' });
  on(warehouse, p.x + 8, Z - 18, 0, { w: 28, d: 20, h: 8, ext: 'contBlue', walkY: 3.6 });
  on(stadthaus, p.x + 40, Z - 20, 0, { floors: 3, ext: 'plasterGrey' });
  on(garage, p.x + 53, Z + 6, 3);
  // container yard
  const cols = ['contRed', 'contBlue', 'contGreen', 'contOrange', 'contWhite', 'contGrey'];
  for (let i = 0; i < 7; i++) {
    const cx = p.x - 52 + i * 15 + rnd(-1, 1), cz = Z + 5 + (i % 2) * 8;
    container(A, cx, cz, 'x', cols[i % 6]);
    if (i % 3 !== 1) container(A, cx + rnd(-0.3, 0.3), cz, 'x', cols[(i + 2) % 6], 2.6);
    if (i % 4 === 0) container(A, cx, cz + 4.5, 'z', cols[(i + 4) % 6]);
    A.spot(cx + 4, 0, cz + 3, { indoor: false, kind: i % 2 ? 'room' : 'floor' });
  }
  // two gantry cranes on the quay
  for (const cx of [p.x - 28, p.x + 26]) {
    for (const [ax, az] of [[-6, Z + 20], [6, Z + 20], [-6, Z + 34], [6, Z + 34]]) A.box(cx + ax - 0.45, 0, az - 0.45, cx + ax + 0.45, 18, az + 0.45, 'metalYellow', WALL);
    A.box(cx - 7, 18, Z + 16, cx + 7, 20, Z + 60, 'metalYellow', { ...PLAIN, collide: true });
    A.box(cx - 2, 15, Z + 30, cx + 2, 18, Z + 34, 'metalDark', PLAIN);
  }
  // moored freighter: a big landmark and a loot spot with a long gangway
  const sx0 = p.x - 48, sx1 = p.x + 48, sz0 = Z + 40, sz1 = Z + 62, deck = 7;
  b.box(sx0, -3, sz0, sx1, deck, sz1, 'metalRed', PLAIN);
  A.box(sx0 - 0.1, -6, sz0 - 0.1, sx1 + 0.1, 0.8, sz1 + 0.1, 'metalDark', { ...PLAIN, collide: false });
  b.box(sx0, deck, sz0, p.x - 12, deck + 0.8, sz0 + 0.3, 'metalRed', WALL); b.box(p.x - 8, deck, sz0, sx1, deck + 0.8, sz0 + 0.3, 'metalRed', WALL); b.box(sx0, deck, sz1 - 0.3, sx1, deck + 0.8, sz1, 'metalRed', WALL);
  for (let i = 0; i < 4; i++) {
    const cx = sx0 + 12 + i * 14;
    container(b, cx, (sz0 + sz1) / 2 - 4, 'x', cols[i % 6], deck);
    container(b, cx, (sz0 + sz1) / 2 + 4, 'x', cols[(i + 3) % 6], deck);
    if (i % 2) container(b, cx, (sz0 + sz1) / 2 - 4, 'x', cols[(i + 1) % 6], deck + 2.6);
    new Kit(b, out, {}).spot(cx, deck, sz0 + 1.6, { indoor: false, kind: 'room' });
  }
  radioShack(b, out, { x: sx1 - 11, z: (sz0 + sz1) / 2, y: deck - 0.15 });
  // gangway: broad stairs from the quay up to the deck
  stairs(b, p.x - 10, Z + 34, '+z', 3.4, deck - y, 6, 'metalDark', y);
  out.navRects.push([sx0, sz0, sx1, sz1], [p.x - 14, Z + 30, p.x - 6, sz0 + 1]);
  truck(A, p.x - 54, Z + 16, 'x'); barrier(A, p.x + 30, Z + 8, 'z', 3);
  A.vehicle('pickup', p.x + 18, Z + 16, 1.57);
}

function airfield(b, out) {
  const p = POI.airfield, y = p.y, A = new Kit(b, out, { y }), Z = p.z, on = placer(b, out, y);
  const gate = (at) => [{ side: 's', at, w: 15, h: 7.2 }, { side: 'n', at: 0, w: 4.5, h: 3.6 }, { side: 'e', at: -4, w: 3.6, h: 3.2 }];
  on(warehouse, p.x - 48, Z - 20, 0, { kind: 'hangar', w: 34, d: 28, h: 9.5, ext: 'contGrey', walkY: 4.2, gates: gate(0) });
  on(warehouse, p.x - 8, Z - 20, 0, { kind: 'hangar', w: 34, d: 28, h: 9.5, ext: 'contWhite', walk: false, gates: gate(0) });
  // terminal and tower
  on(school, p.x + 42, Z - 26, 0, { ext: 'paintWhite', plinth: 'concreteDark', trim: 'metalDark', frame: 'metalDark', floors: 2 });
  on(controlTower, p.x + 28, Z - 6, 0, { floors: 5, ext: 'concrete' });
  // fuel tanks
  for (const [tx, tz] of [[p.x + 56, Z - 2], [p.x + 66, Z - 2]]) {
    A.geom(new THREE.CylinderGeometry(4, 4, 6, 16), 'metal', mtx(tx, 3, tz));
    A.box(tx - 3, 0, tz - 3, tx + 3, 6, tz + 3, 'metal', { visual: false });
    A.spot(tx + 5, 0, tz + 1, { indoor: false, kind: 'floor' });
  }
  // a parked transport plane on the apron
  A.box(p.x - 58, 1.6, Z + 12, p.x - 34, 4.2, Z + 15.6, 'paintWhite', { skirt: false });
  A.box(p.x - 50, 3.3, Z + 2, p.x - 44, 3.8, Z + 26, 'paintWhite', { ...PLAIN });
  A.box(p.x - 36, 4.2, Z + 13.4, p.x - 33.5, 7.4, Z + 14.2, 'metalRed', { ...PLAIN });
  for (const [ax, az] of [[-54, 12.5], [-54, 15], [-40, 13.8]]) A.box(p.x + ax - 0.2, 0, Z + az - 0.2, p.x + ax + 0.2, 1.6, Z + az + 0.2, 'metalDark', WALL);
  coverPile(A, p.x + 20, Z + 6); coverPile(A, p.x - 22, Z + 4); coverPile(A, p.x + 60, Z + 10); coverPile(A, p.x + 2, Z + 28);
  barrier(A, p.x + 12, Z + 2, 'x', 3); barrier(A, p.x + 44, Z + 4, 'z', 3);
  A.vehicle('jeep', p.x + 14, Z - 4, 1.57);
}

function base(b, out) {
  const p = POI.base, y = p.y, A = new Kit(b, out, { y }), X = p.x, Z = p.z, hw = 46, hd = 40, on = placer(b, out, y);
  // perimeter wall with two gates
  const wall = 'concreteDark', wh = 3.4;
  A.box(X - hw, 0, Z - hd, X - 8, wh, Z - hd + 0.5, wall, WALL); A.box(X + 8, 0, Z - hd, X + hw, wh, Z - hd + 0.5, wall, WALL);
  A.box(X - hw, 0, Z + hd - 0.5, X + 4, wh, Z + hd, wall, WALL); A.box(X + 18, 0, Z + hd - 0.5, X + hw, wh, Z + hd, wall, WALL);
  A.box(X - hw, 0, Z - hd, X - hw + 0.5, wh, Z + hd, wall, WALL); A.box(X + hw - 0.5, 0, Z - hd, X + hw, wh, Z + hd, wall, WALL);
  // headquarters, barracks, motor pool, bunkers
  on(school, X - 2, Z - 22, 2, { ext: 'concrete', plinth: 'concreteDark', trim: 'metalDark', frame: 'metalDark', floors: 2 });
  on(barracks, X - 30, Z - 6, 0, { w: 24 }); on(barracks, X - 30, Z + 12, 0, { w: 24 }); on(barracks, X - 30, Z + 29, 0, { w: 24, ext: 'contGreen' });
  on(warehouse, X + 30, Z - 24, 0, { w: 26, d: 22, h: 6.5, ext: 'contGreen', walk: false, gates: [{ side: 's', at: 0, w: 8, h: 4.6 }, { side: 'w', at: 0, w: 3.6, h: 3.2 }] });
  on(bunker, X + 2, Z + 8); on(bunker, X + 30, Z + 26, 1);
  // watchtowers at the corners
  for (const [tx, tz] of [[X - hw + 5, Z - hd + 5], [X + hw - 5, Z + hd - 5], [X - hw + 5, Z + hd - 5]]) {
    for (const [ax, az] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) A.box(tx + ax - 0.15, 0, tz + az - 0.15, tx + ax + 0.15, 7, tz + az + 0.15, 'metalDark', WALL);
    A.box(tx - 2.6, 7, tz - 2.6, tx + 2.6, 7.15, tz + 2.6, 'woodDark', PLAIN);
    for (const [ax, az, bx, bz] of [[-2.6, -2.6, 2.6, -2.5], [-2.6, 2.5, 2.6, 2.6], [-2.6, -2.6, -2.5, 2.6]]) A.box(tx + ax, 7.15, tz + az, tx + bx, 8.1, tz + bz, 'woodDark', { ...PLAIN, pen: 0.7 });
    A.box(tx - 2.8, 9.6, tz - 2.8, tx + 2.8, 9.8, tz + 2.8, 'metalDark', { ...PLAIN, collide: false });
    stairs(A, tx + 3.5, tz - 1.0, '+z', 1.7, 7.15, 8.6, 'metalDark');
    A.spot(tx, 7.15, tz, { indoor: false, kind: 'room' });
    A.area(tx - 3, tz - 3, tx + 5, tz + 9, 0);
  }
  // sandbag nests, crates, parked trucks
  sandbags(A, X + 10, Z - 6, 8, 'x'); sandbags(A, X - 12, Z + 34, 6, 'z'); sandbags(A, X + 24, Z + 4, 6, 'x');
  truck(A, X + 20, Z - 8, 'x', 'carPaintGreen'); truck(A, X + 34, Z - 8, 'x', 'carPaintGreen');
  for (const [cx, cz] of [[X - 12, Z - 2], [X + 38, Z + 10], [X - 12, Z + 22], [X + 6, Z + 30]]) coverPile(A, cx, cz);
  A.vehicle('jeep', X + 12, Z + 18, 3.14);
}

function factory(b, out) {
  const p = POI.factory, y = p.y, A = new Kit(b, out, { y }), X = p.x, Z = p.z, on = placer(b, out, y);
  on(warehouse, X - 26, Z - 22, 0, { w: 46, d: 34, h: 11, ext: 'corrugated', walkY: 4.4, gates: [{ side: 's', at: 0, w: 8, h: 5 }, { side: 'e', at: 4, w: 6, h: 4.6 }, { side: 'w', at: 4, w: 5, h: 4 }, { side: 'n', at: 10, w: 4, h: 3.4 }] });
  on(warehouse, X + 30, Z - 24, 0, { w: 36, d: 26, h: 9, ext: 'brick', wall: 'brick', roofMat: 'metalDark', walkY: 3.8 });
  on(apartments, X - 26, Z + 28, 0, { floors: 3, w: 22, ext: 'brickDark', shutter: null });
  on(ruin, X + 34, Z + 28, 0, { w: 14, d: 11 });
  // silos and chimneys
  for (let i = 0; i < 3; i++) {
    const sx = X + 2 + i * 10, sz = Z + 8;
    A.geom(new THREE.CylinderGeometry(4.2, 4.2, 13, 14), 'concrete', mtx(sx, 6.5, sz));
    A.box(sx - 3, 0, sz - 3, sx + 3, 13, sz + 3, 'concrete', { visual: false });
    A.geom(new THREE.ConeGeometry(4.3, 1.8, 14), 'metalDark', mtx(sx, 13.9, sz));
    A.spot(sx, 0, sz + 6, { indoor: false, kind: 'floor' });
  }
  for (const [cx, cz] of [[X - 1, Z - 34], [X - 1, Z - 16]]) {
    A.geom(new THREE.CylinderGeometry(1.2, 2, 26, 12), 'brickDark', mtx(cx, 13, cz));
    A.box(cx - 1.3, 0, cz - 1.3, cx + 1.3, 26, cz + 1.3, 'brickDark', { visual: false });
  }
  // yard
  for (let i = 0; i < 4; i++) { container(A, X - 8 + i * 7, Z + 34, 'z', ['contOrange', 'contGrey', 'contBlue', 'contWhite'][i]); if (i % 2) container(A, X - 8 + i * 7, Z + 34, 'z', 'contGrey', 2.6); A.spot(X - 4 + i * 7, 0, Z + 39, { indoor: false, kind: 'room' }); }
  for (const [cx, cz] of [[X - 34, Z + 6], [X + 44, Z + 8], [X + 2, Z + 22]]) coverPile(A, cx, cz);
  truck(A, X + 40, Z + 4, 'x');
  A.vehicle('pickup', X - 8, Z + 6, 1.57);
}

function bergdorf(b, out) {
  const p = POI.bergdorf, A = new Kit(b, out, { y: p.y }), on = placer(b, out, p.y), X = p.x, Z = p.z;
  // the church on the square, houses around it, the way down from the mountain road
  on(church, X + 2, Z - 2, 0);
  on(farmhouse, X - 26, Z - 18, 0); on(cottage, X + 26, Z - 22, 0); on(townhouse, X - 28, Z + 6, 1, { roofKind: 'gable' });
  on(cottage, X + 28, Z + 6, 3); on(stadthaus, X - 12, Z + 22, 2, { floors: 2, roofKind: 'gable' }); on(townhouse, X + 16, Z + 22, 2); on(ruin, X - 28, Z + 24, 0, { w: 12, d: 10 });
  coverPile(A, X - 14, Z - 8); coverPile(A, X + 14, Z + 8); barrel(A, X + 12, Z - 8);
  A.vehicle('offroad', X + 34, Z - 8, 3.14);
}

function fischerdorf(b, out) {
  const p = POI.fischer, y = p.y, A = new Kit(b, out, { y }), on = placer(b, out, y), X = p.x, Z = p.z;
  for (const [hx, hz, r] of [[-22, -28, 0], [-8, -30, 0], [-24, -8, 1], [-24, 24, 1], [-8, 30, 2], [8, 28, 2]]) on(fisherHut, X + hx, Z + hz, r);
  on(cottage, X - 8, Z - 6, 1); on(shop, X - 8, Z + 11, 3, { sign: 'FISCH', w: 12, d: 10 });
  // boat sheds and a pier out to sea
  on(warehouse, X + 14, Z - 16, 3, { kind: 'barn', w: 18, d: 12, h: 5, ext: 'woodDark', wall: 'wood', floor: 'wood', walk: false, roofKind: 'gable', ridge: 'x', roofMat: 'metalDark', rise: 1.8, gates: [{ side: 's', at: 0, w: 7, h: 4 }, { side: 'n', at: 0, w: 3, h: 3 }] });
  on(warehouse, X + 14, Z + 8, 3, { kind: 'barn', w: 16, d: 12, h: 5, ext: 'woodBlue', wall: 'wood', floor: 'wood', walk: false, roofKind: 'gable', ridge: 'x', roofMat: 'metalDark', rise: 1.8, gates: [{ side: 's', at: 0, w: 7, h: 4 }, { side: 'n', at: 0, w: 3, h: 3 }] });
  b.box(X + 22, y - 3, Z - 4, X + 70, y, Z + 1, 'woodDark', PLAIN);
  for (const [bx, bz] of [[X + 40, Z - 10], [X + 52, Z + 7]]) {
    A.box(bx - 4, -2.6, bz - 1.5, bx + 4, -1, bz + 1.5, 'paintWhite', PLAIN);
    A.box(bx - 1, -1, bz - 1, bx + 1, 0.3, bz + 1, 'woodPale', PLAIN);
  }
  on(fisherHut, X + 62, Z - 7.5, 0, { ext: 'woodRed' });
  b.box(X + 56, y - 3, Z - 12, X + 68, y, Z - 3.8, 'woodDark', PLAIN);
  out.navRects.push([X + 20, Z - 13, X + 72, Z + 3]);
  coverPile(A, X + 12, Z - 2); coverPile(A, X - 22, Z + 8);
  A.spot(X + 66, 0, Z - 1.5, { indoor: false, kind: 'room' });
  A.vehicle('pickup', X - 18, Z + 14, 0);
}

function resort(b, out) {
  const p = POI.resort, y = p.y, A = new Kit(b, out, { y }), on = placer(b, out, y), X = p.x + 10, Z = p.z;
  // the hotel looks over the pool toward the sea
  on(hotel, X + 12, Z - 4, 3, { floors: 3, ext: 'plasterSand' });
  on(villa, X + 8, Z + 32, 3, { ext: 'wallCream' });
  // pool
  A.box(X - 22, 0, Z - 15, X - 2, 0.25, Z + 7, 'tiles', { ...PLAIN, collide: false });
  A.box(X - 20, 0.26, Z - 13, X - 4, 0.28, Z + 5, 'waterFountain', { ...PLAIN, collide: false });
  for (const [sx, sz] of [[-26, -18], [-26, 10], [0, -20], [0, 12], [-14, -20], [-14, 12]]) { palm(A, X + sx, Z + sz, 8); A.spot(X + sx + 2, 0, Z + sz + 2, { indoor: false, kind: 'floor' }); }
  for (const [sx, sz] of [[-26, -8], [-26, 0]]) A.box(X + sx - 1, 0, Z + sz - 0.45, X + sx + 1, 0.5, Z + sz + 0.45, 'woodPale', { pen: 0.8, skirt: false });
  on(bar, X - 18, Z + 22, 2, { ext: 'woodSiding' });
  // bungalows on the beach
  for (const bz of [-34, -16, 2]) on(bungalow, p.x - 28, Z + bz, 3);
  A.vehicle('sedan', X + 24, Z + 36, 0);
}

function farm(b, out) {
  const p = POI.farm, y = p.y, A = new Kit(b, out, { y }), on = placer(b, out, y);
  on(farmhouse, p.x - 11, p.z - 12);
  on(warehouse, p.x + 13, p.z - 8, 0, { kind: 'barn', w: 18, d: 14, h: 6, ext: 'woodRed', wall: 'wood', floor: 'wood', walk: false, roofKind: 'gable', ridge: 'x', roofMat: 'metalDark', rise: 2.4, gates: [{ side: 's', at: 0, w: 6, h: 4.4 }, { side: 'w', at: 0, w: 3, h: 3 }, { side: 'n', at: 0, w: 3, h: 3 }] });
  on(cottage, p.x - 13, p.z + 12, 0, { ext: 'stoneWall' });
  A.geom(new THREE.CylinderGeometry(2.6, 2.6, 9, 14), 'metal', mtx(p.x + 18, 4.5, p.z + 12));
  A.box(p.x + 16.2, 0, p.z + 10.2, p.x + 19.8, 9, p.z + 13.8, 'metal', { visual: false });
  for (const [hx, hz] of [[p.x + 4, p.z + 8], [p.x + 8, p.z + 14], [p.x + 4, p.z + 18]]) { A.box(hx - 1, 0, hz - 0.8, hx + 1, 1.3, hz + 0.8, 'hay', { pen: 1, skirt: false }); A.spot(hx + 2, 0, hz, { indoor: false, kind: 'floor' }); }
  A.vehicle('pickup', p.x + 13, p.z + 4, 1.57);
}

function radar(b, out) {
  const p = POI.radar, y = p.y, A = new Kit(b, out, { y });
  radioShack(b, out, { x: p.x - 5, z: p.z - 2, y });
  for (const [ax, az] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) A.box(p.x + 11 + ax - 0.12, 0, p.z + az - 0.12, p.x + 11 + ax + 0.12, 16, p.z + az + 0.12, 'metal', { ...PLAIN, collide: true });
  A.geom(new THREE.SphereGeometry(5.2, 18, 8, 0, Math.PI * 2, 0, 0.95), 'metal', mtx(p.x + 11, 21, p.z, 0.7, 1, 1, 1, 2.1, 0));
  A.box(p.x + 10, 0, p.z + 2, p.x + 12, 1.2, p.z + 5, 'metalDark', { skirt: false });
  coverPile(A, p.x + 2, p.z + 9); coverPile(A, p.x - 14, p.z + 9);
}

function hamlets(b, out) {
  const O = POI.weilerO, S = POI.weilerS, on = placer(b, out, O.y), un = placer(b, out, S.y);
  on(cottage, O.x - 11, O.z - 10); on(garage, O.x + 11, O.z - 9); on(townhouse, O.x - 11, O.z + 10, 2); on(ruin, O.x + 12, O.z + 11, 0, { w: 12, d: 10 });
  un(villa, S.x - 2, S.z - 7); un(shop, S.x - 10, S.z + 12, 2, { sign: 'POST', w: 12, d: 10 }); un(cottage, S.x + 12, S.z + 12, 2);
  const A = new Kit(b, out, { y: O.y }), B = new Kit(b, out, { y: S.y });
  coverPile(A, O.x + rnd(-3, 3), O.z + rnd(-3, 3)); coverPile(B, S.x + 5, S.z + 2);
  A.vehicle('sedan', O.x, O.z + 2, 1.57); B.vehicle('jeep', S.x + 15, S.z - 4, 0);
}

// ---------------------------------------------------------------------------
// Nature: instanced trees and rocks, solid where it matters
// ---------------------------------------------------------------------------
function colored(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count, c = new Float32Array(n * 3), col = new THREE.Color(color);
  for (let i = 0; i < n; i++) { const k = 0.82 + Math.random() * 0.36; c[i * 3] = col.r * k; c[i * 3 + 1] = col.g * k; c[i * 3 + 2] = col.b * k; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.deleteAttribute('uv');
  return g;
}
function shape(parts) { const g = mergeGeometries(parts, false); g.computeVertexNormals(); return g; }

function nature(b, t, q) {
  const pine = shape([
    colored(new THREE.CylinderGeometry(0.18, 0.3, 2.4, 6).translate(0, 1.2, 0), 0x5a4432),
    colored(new THREE.ConeGeometry(2.1, 3.4, 7).translate(0, 3.6, 0), 0x2f5a34),
    colored(new THREE.ConeGeometry(1.65, 3, 7).translate(0, 5.4, 0), 0x366a3a),
    colored(new THREE.ConeGeometry(1.1, 2.6, 7).translate(0, 7.2, 0), 0x3f7842),
  ]);
  const broad = shape([
    colored(new THREE.CylinderGeometry(0.2, 0.32, 3, 6).translate(0, 1.5, 0), 0x5e4a38),
    colored(new THREE.IcosahedronGeometry(2.3, 0).translate(0, 4.4, 0), 0x4e7a3c),
    colored(new THREE.IcosahedronGeometry(1.6, 0).translate(1.1, 3.5, 0.6), 0x5a8a42),
    colored(new THREE.IcosahedronGeometry(1.5, 0).translate(-0.9, 3.7, -0.7), 0x467036),
  ]);
  const palmG = shape([
    colored(new THREE.CylinderGeometry(0.14, 0.24, 6.5, 6).translate(0, 3.25, 0), 0x7a6448),
    ...[0, 1, 2, 3, 4, 5].map((i) => colored(new THREE.BoxGeometry(0.5, 0.07, 3).translate(0, 0, 1.5).rotateX(0.35).rotateY(i * Math.PI / 3).translate(0, 6.5, 0), 0x4e8a3e)),
  ]);
  const bush = shape([colored(new THREE.IcosahedronGeometry(0.95, 0).scale(1.2, 0.8, 1.2).translate(0, 0.55, 0), 0x4a7238), colored(new THREE.IcosahedronGeometry(0.6, 0).translate(0.7, 0.4, 0.2), 0x567e40)]);
  const rock = shape([colored(new THREE.DodecahedronGeometry(1, 0).scale(1, 0.72, 0.85), 0x8a867e)]);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const N = t.N, buckets = { pine: [], broad: [], palm: [], bush: [], rock: [] };
  const places = Object.values(POI);
  const inPlace = (x, z, m) => places.some((p) => Math.abs(x - p.x) < p.w / 2 + m && Math.abs(z - p.z) < p.d / 2 + m);
  const roadNear = (x, z) => {
    const i = Math.round((x - t.ox) / t.cell), j = Math.round((z - t.oz) / t.cell);
    return t.roadDist[j * t.w + i] < 10;
  };
  let tries = 10500;
  while (tries-- > 0) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 345, x = Math.cos(a) * r, z = Math.sin(a) * r, h = t.heightAt(x, z);
    if (h < 1.6) continue;
    const forest = N.fbm(x / 95 + 31, z / 95 + 17, 3), sl = t.slopeAt(x, z);
    const kind = Math.random();
    if (kind < 0.2) {
      if (sl > 0.25 && Math.random() < 0.08) buckets.rock.push([x, h, z, 0.8 + Math.random() * 2.4]);
      else if (Math.random() < 0.014) buckets.rock.push([x, h, z, 0.6 + Math.random() * 1.6]);
      continue;
    }
    if (inPlace(x, z, 6) || roadNear(x, z)) continue;
    if (h < 4.5) { if (Math.random() < 0.05) buckets.palm.push([x, h, z, 0.85 + Math.random() * 0.4]); continue; }
    if (sl > 0.7) continue;
    const dens = sstep(0.48, 0.62, forest);
    if (Math.random() > dens * 0.5 + 0.012) continue;
    if (kind < 0.42) buckets.bush.push([x, h, z, 0.8 + Math.random() * 0.8]);
    else if (h > 26 || Math.random() < 0.55) buckets.pine.push([x, h, z, 0.85 + Math.random() * 0.6]);
    else buckets.broad.push([x, h, z, 0.9 + Math.random() * 0.5]);
  }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const place = (name, geo, castS, onEach) => {
    const list = buckets[name];
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([x, y, z, s], i) => {
      Q.setFromAxisAngle(UP, Math.random() * 6.28);
      im.setMatrixAt(i, M.compose(P.set(x, y - 0.1, z), Q, S.set(s, s, s)));
      onEach(x, y, z, s);
    });
    im.castShadow = castS && q.shadows > 0; im.receiveShadow = false; im.frustumCulled = false;
    b.root.add(im);
  };
  const col = b.col;
  place('pine', pine, true, (x, y, z, s) => col.add(x - 0.28 * s, y, z - 0.28 * s, x + 0.28 * s, y + 7 * s, z + 0.28 * s, 'wood', 0));
  place('broad', broad, true, (x, y, z, s) => col.add(x - 0.3 * s, y, z - 0.3 * s, x + 0.3 * s, y + 3.2 * s, z + 0.3 * s, 'wood', 0));
  place('palm', palmG, true, (x, y, z, s) => col.add(x - 0.2 * s, y, z - 0.2 * s, x + 0.2 * s, y + 6.5 * s, z + 0.2 * s, 'wood', 0));
  place('bush', bush, false, () => {});
  place('rock', rock, true, (x, y, z, s) => col.add(x - 0.72 * s, y - 0.4, z - 0.62 * s, x + 0.72 * s, y + 0.62 * s, z + 0.62 * s, 'concrete', 0));
  return { trees: buckets.pine.length + buckets.broad.length + buckets.palm.length, bushes: buckets.bush.length, rocks: buckets.rock.length };
}

// ---------------------------------------------------------------------------
export default {
  id: 'island',
  name: 'SERENA',
  desc: 'Kleine Insel mit Stadt, Hafen, Flugfeld, Milit\u00e4rbasis und Bergen.',
  size: 'Mittel',
  large: true,
  env: {
    sunDir: [0.5, 0.6, 0.32],
    sunColor: 0xfff2dc, sunIntensity: 3.0,
    skyTop: 0x4a86c8, skyHorizon: 0xc8dae4, skyBottom: 0xc8dae4,
    cloudColor: 0xffffff, clouds: 0.5,
    hemiSky: 0xc4d8e8, groundColor: 0x7c7058, ambient: 1.55,
    fogColor: 0xc8dae4, fogNear: 200, fogFar: 1100, large: true,
    shadowMap: 4096, shadowBias: -0.00016,
  },
  bounds: { minX: -380, maxX: 380, minZ: -380, maxZ: 380 },
  places: POI,
  navHub: [22, 12.2, -10],
  hotspots: [[0, 12.2, -2], [-22, 12.2, 30], [22, 12.2, 30], [POI.harbor.x, 3.6, POI.harbor.z + 16]],
  spawns() { return [[[-14, 12.2, 10, 0], [14, 12.2, 10, 0]], [[-22, 12.2, 30, 3.14], [22, 12.2, 30, 3.14]]]; },

  build(B) {
    B.chunk = 64;
    const t = this.terrain = new Terrain(SIZE, CELL);
    const roads = this.roads = [];
    buildHeights(t, roads);
    B.col.terrain = t;
    const canvas = paintGround(t, roads);
    this.groundCanvas = canvas;
    t.buildMesh(B.root, canvas, B.q);
    // sea
    const water = B.tex.generate('water').map.clone();
    water.wrapS = water.wrapT = THREE.RepeatWrapping; water.repeat.set(900, 900); water.needsUpdate = true;
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000), new THREE.MeshLambertMaterial({ map: water, color: 0x7fb2c6, transparent: true, opacity: 0.86, depthWrite: false }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = 0; sea.renderOrder = -1; sea.matrixAutoUpdate = true;
    B.root.add(sea);
    this.sea = sea;
    // beyond the end of the terrain: a sea floor of the same color, so the water shows no edge from the air
    const deep = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000), new THREE.MeshLambertMaterial({ color: 0x79816e }));
    deep.rotation.x = -Math.PI / 2; deep.position.y = -1.6; deep.renderOrder = -2; deep.matrixAutoUpdate = true;
    B.root.add(deep);
    // places
    const out = this.layout = { spots: [], navRects: [], footprints: [], vehicles: [] };
    city(B, out); harbor(B, out); airfield(B, out); base(B, out); factory(B, out); bergdorf(B, out); fischerdorf(B, out); resort(B, out); farm(B, out); radar(B, out); hamlets(B, out);
    gasStation(B, out, { x: 44, z: 128, y: t.heightAt(44, 128), rot: 3 });
    this.natureStats = nature(B, t, B.q);
    return this;
  },
};
