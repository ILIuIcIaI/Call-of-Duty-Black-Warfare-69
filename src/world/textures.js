import * as THREE from 'three';
import { mulberry32, clamp } from '../core/math.js';

// ---------------------------------------------------------------------------
// Procedural texture set in the look of late-90s PC shooters: small textures with
// limited colors, shading painted right into them (light and dark edges instead of
// normal maps), shown with soft bilinear filtering. Original designs, no image assets.
// ---------------------------------------------------------------------------

function lattice(seed, period) {
  const rng = mulberry32(seed);
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  return { g, p: period };
}
function sampleLattice(L, x, y) {
  const p = L.p;
  let xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  xi = ((xi % p) + p) % p; yi = ((yi % p) + p) % p;
  const x1 = (xi + 1) % p, y1 = (yi + 1) % p;
  const a = L.g[yi * p + xi], b = L.g[yi * p + x1], c = L.g[y1 * p + xi], d = L.g[y1 * p + x1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
// Tileable fbm: u,v in [0,1), base period in lattice cells
function makeFbm(seed, basePeriod, octaves = 4, gain = 0.5) {
  const ls = [];
  for (let o = 0; o < octaves; o++) ls.push(lattice(seed + o * 101, basePeriod << o));
  return (u, v) => {
    let sum = 0, amp = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      const L = ls[o];
      sum += sampleLattice(L, u * L.p, v * L.p) * amp; norm += amp; amp *= gain;
    }
    return sum / norm;
  };
}
function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// A small wrap-around canvas of float rgb pixels with the handful of strokes these textures are painted with
class Painter {
  constructor(S, seed) { this.S = S; this.c = new Float32Array(S * S * 3); this.rng = mulberry32(seed); }
  i(x, y) { const S = this.S; return ((((y % S) + S) % S) * S + (((x % S) + S) % S)) * 3; }
  set(x, y, r, g, b) { const i = this.i(x, y), c = this.c; c[i] = r; c[i + 1] = g; c[i + 2] = b; }
  mul(x, y, k) { const i = this.i(x, y), c = this.c; c[i] *= k; c[i + 1] *= k; c[i + 2] *= k; }
  mix(x, y, r, g, b, a) { const i = this.i(x, y), c = this.c; c[i] += (r - c[i]) * a; c[i + 1] += (g - c[i + 1]) * a; c[i + 2] += (b - c[i + 2]) * a; }
  each(fn) { for (let y = 0; y < this.S; y++) for (let x = 0; x < this.S; x++) fn(x, y, x / this.S, y / this.S); }
  // painted relief: light along the top and left edge, dark along the bottom and right edge
  bevel(x0, y0, w, h, light = 1.2, dark = 0.7) {
    for (let x = x0; x < x0 + w; x++) { this.mul(x, y0, light); this.mul(x, y0 + h - 1, dark); }
    for (let y = y0 + 1; y < y0 + h - 1; y++) { this.mul(x0, y, light); this.mul(x0 + w - 1, y, dark); }
  }
  speckle(a) { this.each((x, y) => this.mul(x, y, 1 + (this.rng() - 0.5) * 2 * a)); }
  // wandering dark crack with a light lip
  crack(x, y, len, dark = 0.6) {
    let dx = this.rng() < 0.5 ? 1 : -1;
    for (let k = 0; k < len; k++) {
      this.mul(x, y, dark); this.mul(x + 1, y + 1, 1.08);
      if (this.rng() < 0.45) x += dx; else if (this.rng() < 0.15) dx = -dx;
      y += this.rng() < 0.75 ? 1 : 0;
    }
  }
  scratch(x, y, len, sx, sy, k = 1.18) { for (let i = 0; i < len; i++) this.mul(Math.round(x + sx * i), Math.round(y + sy * i), k); }
  rivet(x, y) { this.mul(x, y, 1.35); this.mul(x + 1, y, 1.05); this.mul(x, y + 1, 1.05); this.mul(x + 1, y + 1, 0.62); }
}

const GENERATORS = {
  // cast concrete: big blotches, formwork seams with tie holes, water stains running down from them
  concrete() {
    const S = 128, P = new Painter(S, 11), big = makeFbm(11, 4, 4), mid = makeFbm(23, 16, 2);
    P.each((x, y, u, v) => {
      const c = 0.64 + (big(u, v) - 0.5) * 0.24 + (mid(u, v) - 0.5) * 0.1;
      P.set(x, y, c, c * 0.985, c * 0.94);
    });
    for (let x = 0; x < S; x++) { P.mul(x, 0, 0.74); P.mul(x, 1, 1.12); P.mul(x, 64, 0.8); P.mul(x, 65, 1.1); }
    for (let y = 0; y < S; y++) { P.mul(0, y, 0.78); P.mul(1, y, 1.08); }
    for (const [hx, hy] of [[32, 32], [96, 32], [32, 96], [96, 96]]) {
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) P.mul(hx + a, hy + b, 0.55);
      P.mul(hx, hy + 2, 1.15); P.mul(hx + 1, hy + 2, 1.15);
    }
    for (let k = 0; k < 14; k++) {
      const x = (P.rng() * S) | 0, y0 = P.rng() < 0.5 ? 2 : 66, L = 10 + P.rng() * 26;
      for (let y = 0; y < L; y++) P.mul(x, y0 + y, 1 - 0.14 * (1 - y / L));
    }
    for (let k = 0; k < 3; k++) P.crack((P.rng() * S) | 0, (P.rng() * S) | 0, 18 + P.rng() * 22);
    P.speckle(0.05);
    return P;
  },
  // road surface: coarse grain, patched areas, cracks
  asphalt() {
    const S = 128, P = new Painter(S, 41), big = makeFbm(41, 4, 3);
    P.each((x, y, u, v) => { const c = 0.33 + (big(u, v) - 0.5) * 0.12; P.set(x, y, c, c, c * 1.03); });
    for (let y = 70; y < 112; y++) for (let x = 14; x < 62; x++) P.mul(x, y, 0.82);
    P.bevel(14, 70, 48, 42, 1.14, 0.8);
    P.each((x, y) => { const h = P.rng(); if (h > 0.9) P.mul(x, y, 1.42); else if (h < 0.12) P.mul(x, y, 0.72); });
    for (let k = 0; k < 4; k++) P.crack((P.rng() * S) | 0, (P.rng() * S) | 0, 24 + P.rng() * 30, 0.55);
    P.speckle(0.06);
    return P;
  },
  // bricks 16 x 8 texels in running bond; every brick gets its own tone and painted edges
  brick() {
    const S = 128, P = new Painter(S, 51), big = makeFbm(51, 4, 3);
    P.each((x, y, u, v) => { const c = 0.5 + (big(u, v) - 0.5) * 0.1; P.set(x, y, c, c * 0.95, c * 0.86); });
    for (let row = 0; row < 16; row++) {
      for (let col = 0; col < 8; col++) {
        const x0 = col * 16 + (row % 2) * 8, y0 = row * 8;
        const t = hash2(col, row, 5), t2 = hash2(col, row, 9);
        const k = 0.78 + t * 0.42;
        for (let y = 1; y < 8; y++) for (let x = 1; x < 16; x++) {
          const n = 0.94 + P.rng() * 0.12;
          P.set(x0 + x, y0 + y, (0.58 + t2 * 0.08) * k * n, (0.29 + t2 * 0.05) * k * n, (0.2 + (1 - t2) * 0.03) * k * n);
        }
        P.bevel(x0 + 1, y0 + 1, 15, 7, 1.16, 0.76);
        if (t > 0.86) { const cx = x0 + 3 + ((t2 * 10) | 0); P.mul(cx, y0 + 1, 0.7); P.mul(cx + 1, y0 + 1, 0.7); P.mul(cx, y0 + 2, 0.82); }
      }
    }
    P.each((x, y, u, v) => P.mul(x, y, 0.86 + big(v, u) * 0.3));
    return P;
  },
  // rendered wall (nearly white, tinted by the material): blotches, chipped spots, dirt running down
  plaster() {
    const S = 128, P = new Painter(S, 61), big = makeFbm(61, 4, 4), dirt = makeFbm(69, 2, 3), chips = makeFbm(67, 16, 3);
    P.each((x, y, u, v) => {
      const c = 0.88 + (big(u, v) - 0.5) * 0.14 - Math.max(0, dirt(u, v) - 0.56) * 0.5;
      P.set(x, y, c, c * 0.985, c * 0.955);
      const ch = chips(u, v);
      if (ch > 0.76) P.set(x, y, 0.7, 0.65, 0.58);
      else if (ch > 0.745) P.mul(x, y, 0.86);
    });
    for (let k = 0; k < 18; k++) {
      const x = (P.rng() * S) | 0, y0 = (P.rng() * S) | 0, L = 8 + P.rng() * 28;
      for (let y = 0; y < L; y++) P.mul(x, y0 + y, 1 - 0.1 * (1 - y / L));
    }
    for (let k = 0; k < 2; k++) P.crack((P.rng() * S) | 0, (P.rng() * S) | 0, 20 + P.rng() * 18, 0.68);
    P.speckle(0.022);
    return P;
  },
  // bolted sheet metal: four panels with rivets, scuffs and rust along the seams
  metal() {
    const S = 128, P = new Painter(S, 71), big = makeFbm(71, 4, 4), rust = makeFbm(79, 8, 3);
    P.each((x, y, u, v) => { const c = 0.62 + (big(u, v) - 0.5) * 0.18; P.set(x, y, c, c * 1.01, c * 1.03); });
    for (const y0 of [0, 64]) for (const x0 of [0, 64]) {
      P.bevel(x0, y0, 64, 64, 1.28, 0.58);
      P.bevel(x0 + 1, y0 + 1, 62, 62, 1.08, 0.86);
      for (let t = 8; t < 64; t += 16) { P.rivet(x0 + t, y0 + 4); P.rivet(x0 + t, y0 + 59); P.rivet(x0 + 4, y0 + t); P.rivet(x0 + 59, y0 + t); }
    }
    for (let k = 0; k < 12; k++) P.scratch(P.rng() * S, P.rng() * S, 6 + P.rng() * 20, 0.8 + P.rng() * 0.3, P.rng() - 0.5);
    P.each((x, y, u, v) => {
      const sx = Math.min(x % 64, 63 - (x % 64)), sy = Math.min(y % 64, 63 - (y % 64)), edge = Math.min(sx, sy);
      const r = rust(u, v) + (edge < 5 ? 0.08 : 0);
      if (r > 0.7) P.mix(x, y, 0.5, 0.34, 0.22, Math.min(0.55, (r - 0.7) * 5));
    });
    P.speckle(0.035);
    return P;
  },
  // ribbed sheet: the shading of the ribs is painted in, rust bleeds in from top and bottom
  corrugated() {
    const S = 128, P = new Painter(S, 81), big = makeFbm(81, 4, 3), streak = makeFbm(83, 32, 2), rust = makeFbm(87, 8, 3);
    const prof = [0.74, 0.86, 1.0, 1.1, 1.15, 1.12, 1.04, 0.96, 0.9, 0.84, 0.8, 0.76, 0.72, 0.68, 0.66, 0.68];
    P.each((x, y, u, v) => {
      const c = (0.72 + (big(u, v) - 0.5) * 0.14 - (streak(u, v * 0.06) - 0.5) * 0.16) * prof[x % 16];
      P.set(x, y, c, c, c * 0.98);
      const toEdge = Math.min(v, 1 - v);
      const r = rust(u, v * 0.25) + (toEdge < 0.12 ? (0.12 - toEdge) * 1.6 : 0);
      if (r > 0.71) P.mix(x, y, 0.42, 0.26, 0.15, Math.min(0.6, (r - 0.71) * 5));
    });
    P.speckle(0.03);
    return P;
  },
  // planks with painted grain, joints, nails and the odd knot
  wood() {
    const S = 128, P = new Painter(S, 91), grain = makeFbm(91, 8, 3), fine = makeFbm(97, 32, 2);
    const planks = 6, ph = S / planks;
    P.each((x, y, u, v) => {
      const pi = Math.floor(y / ph);
      const tone = 0.78 + hash2(pi, 1, 4) * 0.34;
      const g = grain(u * 0.5 + hash2(pi, 2, 2), v * 4), f = fine(u * 0.25, v);
      const ring = 0.5 + 0.5 * Math.sin((v * planks * 4 + g * 7) * Math.PI);
      const c = tone * (0.76 + ring * 0.16 + (f - 0.5) * 0.28);
      P.set(x, y, 0.68 * c, 0.5 * c, 0.33 * c);
    });
    for (let pi = 0; pi < planks; pi++) {
      const y0 = Math.floor(pi * ph), y1 = Math.floor((pi + 1) * ph);
      for (let x = 0; x < S; x++) { P.mul(x, y0, 0.45); P.mul(x, y0 + 1, 1.16); P.mul(x, y1 - 1, 0.78); }
      const jx = (hash2(pi, 3, 7) * S) | 0;
      for (let y = y0; y < y1; y++) { P.mul(jx, y, 0.5); P.mul(jx + 1, y, 1.12); }
      for (const nx of [jx - 4, jx + 5]) { P.mul(nx, y0 + 5, 0.55); P.mul(nx, y1 - 6, 0.55); }
      if (hash2(pi, 4, 8) > 0.5) {
        const kx = (hash2(pi, 5, 3) * S) | 0, ky = y0 + 6 + ((hash2(pi, 6, 3) * (ph - 12)) | 0);
        for (let a = -4; a <= 4; a++) for (let b = -2; b <= 2; b++) if (a * a / 16 + b * b / 4 <= 1) P.mul(kx + a, ky + b, 0.62 + (a * a + b * b) * 0.02);
      }
    }
    P.speckle(0.03);
    return P;
  },
  // floor tiles (light, tinted by the material): dark grout, each tile a bit different, dirty corners
  tiles() {
    const S = 128, P = new Painter(S, 101), dirt = makeFbm(103, 3, 3);
    const n = 4, T = S / n;
    P.each((x, y, u, v) => {
      const ix = Math.floor(x / T), iy = Math.floor(y / T);
      const c = 0.78 + hash2(ix, iy, 11) * 0.14 - Math.max(0, dirt(u, v) - 0.55) * 0.42;
      P.set(x, y, c, c * 0.98, c * 0.94);
    });
    for (let iy = 0; iy < n; iy++) for (let ix = 0; ix < n; ix++) {
      const x0 = ix * T, y0 = iy * T;
      for (let t = 0; t < T; t++) { P.set(x0 + t, y0, 0.36, 0.34, 0.31); P.set(x0, y0 + t, 0.36, 0.34, 0.31); }
      P.bevel(x0 + 1, y0 + 1, T - 1, T - 1, 1.14, 0.82);
      if (hash2(ix, iy, 13) > 0.8) P.crack(x0 + 6, y0 + 3, 16, 0.62);
    }
    P.speckle(0.03);
    return P;
  },
  // bare ground: clumps, small stones with a lit top, dry cracks
  dirt() {
    const S = 128, P = new Painter(S, 111), big = makeFbm(111, 4, 4), mid = makeFbm(113, 16, 2);
    P.each((x, y, u, v) => {
      const c = 0.8 + (big(u, v) - 0.5) * 0.5 + (mid(u, v) - 0.5) * 0.22;
      P.set(x, y, 0.5 * c, 0.39 * c, 0.27 * c);
    });
    for (let k = 0; k < 46; k++) {
      const x = (P.rng() * S) | 0, y = (P.rng() * S) | 0, w = 2 + ((P.rng() * 3) | 0), g = 0.42 + P.rng() * 0.2;
      for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) P.set(x + a, y + b, g, g * 0.92, g * 0.8);
      for (let a = 0; a < w; a++) { P.mul(x + a, y, 1.22); P.mul(x + a, y + w, 0.62); }
    }
    for (let k = 0; k < 3; k++) P.crack((P.rng() * S) | 0, (P.rng() * S) | 0, 14 + P.rng() * 16, 0.66);
    P.speckle(0.08);
    return P;
  },
  // grass seen from above: short light and dark blades over a mottled base, a few dry spots
  grass() {
    const S = 128, P = new Painter(S, 121), big = makeFbm(121, 4, 4), dry = makeFbm(127, 3, 3);
    P.each((x, y, u, v) => {
      const c = 0.84 + (big(u, v) - 0.5) * 0.5;
      P.set(x, y, 0.3 * c, 0.45 * c, 0.16 * c);
      const d = dry(u, v);
      if (d > 0.6) P.mix(x, y, 0.47, 0.42, 0.22, Math.min(0.75, (d - 0.6) * 5));
    });
    for (let k = 0; k < 900; k++) {
      const x = (P.rng() * S) | 0, y = (P.rng() * S) | 0, L = 2 + ((P.rng() * 4) | 0), m = P.rng() < 0.5 ? 1.32 : 0.7, lean = P.rng() < 0.5 ? 1 : -1;
      for (let i = 0; i < L; i++) P.mul(x + (i >> 1) * lean, y - i, m);
    }
    P.speckle(0.04);
    return P;
  },
  // clay roof: overlapping rows of half-round tiles
  rooftile() {
    const S = 128, P = new Painter(S, 131), big = makeFbm(131, 4, 3);
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
      const x0 = col * 16 + (row % 2) * 8, y0 = row * 16, t = hash2(col, row, 3);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const curve = Math.sin(((x + 0.5) / 16) * Math.PI);
        const c = (0.56 + curve * 0.5 - (y < 3 ? (3 - y) * 0.12 : 0) + (t - 0.5) * 0.26) * (0.96 + P.rng() * 0.08);
        P.set(x0 + x, y0 + y, 0.74 * c, 0.37 * c, 0.23 * c);
      }
    }
    P.each((x, y, u, v) => { const b = big(u, v); P.mul(x, y, 0.82 + b * 0.36); if (b < 0.36) P.mix(x, y, 0.3, 0.32, 0.18, 0.35); });
    return P;
  },
  // uniform pattern
  camo() {
    const S = 64, P = new Painter(S, 141), a = makeFbm(141, 4, 3), b = makeFbm(149, 4, 3);
    P.each((x, y, u, v) => {
      const p = a(u, v), q = b(u, v);
      const col = p > 0.57 ? [0.2, 0.21, 0.15] : q > 0.55 ? [0.42, 0.38, 0.27] : p < 0.43 ? [0.3, 0.34, 0.22] : [0.37, 0.39, 0.29];
      P.set(x, y, col[0], col[1], col[2]);
    });
    P.speckle(0.06);
    return P;
  },
  // cloth (light, tinted by the material): coarse weave
  fabric() {
    const S = 64, P = new Painter(S, 151), f = makeFbm(151, 4, 3);
    P.each((x, y, u, v) => {
      const weave = ((x >> 1) + (y >> 1)) % 2 === 0 ? 1.05 : 0.94;
      const c = (0.8 + (f(u, v) - 0.5) * 0.24) * weave;
      P.set(x, y, c, c, c * 0.98);
    });
    P.speckle(0.04);
    return P;
  },
  // old wallpaper (light, tinted by the material): columns of stacked chevrons between fine double lines, paper grain, a damp blotch
  wallpaper() {
    const S = 128, P = new Painter(S, 181), grain = makeFbm(181, 16, 2), damp = makeFbm(183, 2, 3);
    P.each((x, y, u, v) => {
      const c = 0.9 + (grain(u, v) - 0.5) * 0.06 - Math.max(0, damp(u, v) - 0.6) * 0.22;
      P.set(x, y, c, c * 0.97, c * 0.9);
    });
    for (let k = 0; k < 4; k++) {
      const x0 = k * 32, cx = x0 + 16, off = (k % 2) * 8;
      for (let y = 0; y < S; y++) { P.mul(x0, y, 0.86); if (y % 4 < 2) P.mul(x0 + 3, y, 0.92); }
      // chevrons pointing up, and a dot between them
      for (let y0 = off - 16; y0 < S; y0 += 16) {
        for (let d = -6; d <= 6; d++) { const y = y0 + ((Math.abs(d) * 0.75) | 0); P.mul(cx + d, y, 0.8); P.mul(cx + d, y + 1, 0.87); }
        P.mul(cx, y0 + 9, 0.84); P.mul(cx + 1, y0 + 9, 0.9);
      }
    }
    P.speckle(0.015);
    return P;
  },
  // looped carpet (light, tinted by the material): rows of tiny loops, worn and mottled
  berber() {
    const S = 128, P = new Painter(S, 191), f = makeFbm(191, 4, 3), fine = makeFbm(193, 32, 2);
    P.each((x, y, u, v) => {
      const loop = ((x + (y >> 1) * 3) % 4 === 0 ? 0.9 : 1) * (y % 2 ? 0.96 : 1.03);
      const c = (0.8 + (f(u, v) - 0.5) * 0.16 + (fine(u, v) - 0.5) * 0.12) * loop;
      P.set(x, y, c, c * 0.95, c * 0.86);
    });
    P.speckle(0.06);
    return P;
  },
  // suspended ceiling: two by two acoustic tiles with pinholes and fissures in a thin metal grid, a water stain
  ceiltile() {
    const S = 128, P = new Painter(S, 201), f = makeFbm(201, 8, 2), stain = makeFbm(203, 2, 3);
    P.each((x, y, u, v) => { const c = 0.86 + (f(u, v) - 0.5) * 0.08 - Math.max(0, stain(u, v) - 0.64) * 0.55; P.set(x, y, c, c * 0.98, c * 0.92); });
    for (let k = 0; k < 900; k++) P.mul((P.rng() * S) | 0, (P.rng() * S) | 0, 0.84);
    for (let k = 0; k < 40; k++) P.scratch(P.rng() * S, P.rng() * S, 2 + P.rng() * 4, (P.rng() - 0.5) * 2, (P.rng() - 0.5) * 2, 0.88);
    for (let i = 0; i < S; i++) for (const g of [0, 64]) { P.set(g, i, 0.96, 0.95, 0.9); P.set(i, g, 0.96, 0.95, 0.9); P.mul(g + 1, i, 0.8); P.mul(i, g + 1, 0.8); }
    return P;
  },
  // fluorescent troffer, stretched over 1.2 x 0.6 m: a prismatic lens with two tubes glowing through, in a metal frame
  troffer() {
    const S = 64, P = new Painter(S, 211);
    P.each((x, y, u, v) => {
      const tube = Math.max(Math.exp(-((v - 0.33) ** 2) / 0.006), Math.exp(-((v - 0.67) ** 2) / 0.006));
      const c = (0.8 + tube * 0.2) * ((x + y) % 3 === 0 ? 0.96 : 1);
      P.set(x, y, c, c, c * 0.97);
    });
    for (let i = 0; i < S; i++) for (const e of [0, 1, S - 2, S - 1]) { P.set(i, e, 0.5, 0.5, 0.48); P.set(e, i, 0.5, 0.5, 0.48); }
    return P;
  },
  // worn finish for guns and gear (neutral, tinted by the material): mottled, with scratches and bright wear
  gunmetal() {
    const S = 64, P = new Painter(S, 161), f = makeFbm(161, 4, 3), wear = makeFbm(163, 8, 2);
    P.each((x, y, u, v) => {
      const c = 0.8 + (f(u, v) - 0.5) * 0.28 + Math.max(0, wear(u, v) - 0.62) * 1.1;
      P.set(x, y, c, c, c * 1.02);
    });
    for (let k = 0; k < 16; k++) P.scratch(P.rng() * S, P.rng() * S, 4 + P.rng() * 12, 1, (P.rng() - 0.5) * 0.5, 1.2);
    P.speckle(0.05);
    return P;
  },
  // scuffed warning stripes
  hazard() {
    const S = 64, P = new Painter(S, 171), wear = makeFbm(173, 8, 3);
    P.each((x, y, u, v) => {
      if (((x + y) % 32) < 16) P.set(x, y, 0.86, 0.66, 0.12); else P.set(x, y, 0.13, 0.13, 0.12);
      if (wear(u, v) > 0.63) P.mix(x, y, 0.42, 0.4, 0.37, 0.7);
    });
    P.speckle(0.05);
    return P;
  },
  // plain paint (light, tinted by the material): faint blotches and scratches, so nothing is perfectly flat
  paint() {
    const S = 64, P = new Painter(S, 181), f = makeFbm(181, 4, 3);
    P.each((x, y, u, v) => { const c = 0.88 + (f(u, v) - 0.5) * 0.14; P.set(x, y, c, c, c); });
    for (let k = 0; k < 10; k++) P.scratch(P.rng() * S, P.rng() * S, 4 + P.rng() * 10, 1, (P.rng() - 0.5), 1.1);
    P.speckle(0.02);
    return P;
  },
  // murky water with soft ripples
  water() {
    const S = 64, P = new Painter(S, 191), f = makeFbm(191, 4, 3);
    P.each((x, y, u, v) => {
      const w = Math.sin((u * 3 + f(u, v) * 1.6) * Math.PI * 2) * 0.5 + 0.5;
      const c = 0.74 + w * 0.42 + (f(v, u) - 0.5) * 0.3;
      P.set(x, y, 0.78 * c, 0.95 * c, 1.0 * c);
    });
    return P;
  },
  // wind-blown sand: soft ripples across, darker patches, a few pebbles with a lit top
  sand() {
    const S = 128, P = new Painter(S, 221), big = makeFbm(221, 4, 4), warp = makeFbm(223, 8, 2);
    P.each((x, y, u, v) => {
      const rip = Math.sin((v * 10 + warp(u, v) * 2.2) * Math.PI * 2) * 0.5 + 0.5;
      const c = 0.84 + (big(u, v) - 0.5) * 0.22 + (rip - 0.5) * 0.07;
      P.set(x, y, 0.86 * c, 0.71 * c, 0.5 * c);
    });
    for (let k = 0; k < 60; k++) {
      const x = (P.rng() * S) | 0, y = (P.rng() * S) | 0, g = 0.5 + P.rng() * 0.2;
      P.set(x, y, g, g * 0.9, g * 0.78); P.mul(x, y - 1, 1.12); P.mul(x, y + 1, 0.78);
    }
    P.speckle(0.05);
    return P;
  },
  // mud plaster over mud brick (light, tinted by the material): soft blotches and straw, and rounded patches where
  // the plaster has come off and the bricks show
  adobe() {
    const S = 128, P = new Painter(S, 231), big = makeFbm(231, 4, 4), fall = makeFbm(237, 8, 3), fine = makeFbm(239, 16, 2);
    P.each((x, y, u, v) => {
      const c = 0.9 + (big(u, v) - 0.5) * 0.12 + (fine(u, v) - 0.5) * 0.06;
      P.set(x, y, c, c * 0.97, c * 0.93);
      const f = fall(u, v);
      if (f > 0.72) {
        const row = y >> 3, bx = (x + (row % 2) * 8) & 15, k = bx === 0 || (y & 7) === 0 ? 0.74 : 0.88 + hash2((x + (row % 2) * 8) >> 4, row, 3) * 0.08;
        P.set(x, y, c * k * 0.97, c * k * 0.9, c * k * 0.8);
      } else if (f > 0.7) P.mul(x, y, 0.88);
    });
    for (let k = 0; k < 220; k++) P.scratch(P.rng() * S, P.rng() * S, 2 + P.rng() * 3, P.rng() - 0.5, P.rng() - 0.5, P.rng() < 0.5 ? 0.86 : 1.1);
    P.speckle(0.025);
    return P;
  },
  // woven rug: a border of small diamonds, a field of stepped lozenges, in madder red, indigo, ivory and ochre
  rug() {
    const S = 64, P = new Painter(S, 241), f = makeFbm(241, 4, 2);
    const RED = [0.55, 0.13, 0.11], BLUE = [0.16, 0.2, 0.36], IVORY = [0.86, 0.8, 0.66], OCHRE = [0.78, 0.55, 0.2];
    P.each((x, y, u, v) => {
      const edge = Math.min(x, S - 1 - x, y, S - 1 - y);
      let col;
      if (edge < 2) col = BLUE;
      else if (edge < 8) col = Math.abs((x % 8) - 4) + Math.abs((y % 8) - 4) < 3 ? OCHRE : RED;
      else if (edge < 9) col = IVORY;
      else {
        const d = Math.abs(x - 32) + Math.abs(y - 32);
        col = d < 6 ? IVORY : d < 10 ? BLUE : d < 12 ? IVORY : d % 8 < 2 ? BLUE : RED;
      }
      const w = ((x + y) % 2 ? 0.94 : 1.04) * (0.9 + f(u, v) * 0.2);
      P.set(x, y, col[0] * w, col[1] * w, col[2] * w);
    });
    P.speckle(0.04);
    return P;
  },
  // cut stone (light, tinted by the material): courses of long blocks with chamfered edges, each a little different
  ashlar() {
    const S = 128, P = new Painter(S, 261), big = makeFbm(261, 4, 3), fine = makeFbm(263, 32, 2);
    P.each((x, y, u, v) => { const c = 0.86 + (big(u, v) - 0.5) * 0.12 + (fine(u, v) - 0.5) * 0.08; P.set(x, y, c, c * 0.97, c * 0.92); });
    for (let row = 0; row < 8; row++) for (let col = 0; col < 4; col++) {
      const x0 = col * 32 + (row % 2) * 16, y0 = row * 16, t = 0.9 + hash2(col, row, 7) * 0.16;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) P.mul(x0 + x, y0 + y, t);
      for (let x = 0; x < 32; x++) { P.mul(x0 + x, y0, 0.66); P.mul(x0 + x, y0 + 1, 1.1); }
      for (let y = 0; y < 16; y++) { P.mul(x0, y0 + y, 0.7); P.mul(x0 + 1, y0 + y, 1.08); }
      P.bevel(x0 + 1, y0 + 1, 31, 15, 1.08, 0.86);
    }
    P.speckle(0.03);
    return P;
  },
  // office carpet tiles (light, tinted by the material): half-meter squares with the pile turned on every other one
  carpettile() {
    const S = 128, P = new Painter(S, 271), f = makeFbm(271, 4, 3);
    P.each((x, y, u, v) => {
      const turn = ((x >> 5) + (y >> 5)) % 2, line = turn ? (x & 3) === 0 : (y & 3) === 0;
      const c = (0.8 + (f(u, v) - 0.5) * 0.12) * (turn ? 0.96 : 1.03) * (line ? 0.94 : 1) * (0.94 + hash2(x, y, 3) * 0.12);
      P.set(x, y, c, c, c * 1.02);
    });
    for (let i = 0; i < S; i++) for (const g of [0, 32, 64, 96]) { P.mul(g, i, 0.88); P.mul(i, g, 0.88); }
    return P;
  },
  // steel bar grating (light, tinted by the material): bearing bars close together, cross bars further apart, dark gaps
  grate() {
    const S = 64, P = new Painter(S, 281), f = makeFbm(281, 4, 2);
    P.each((x, y, u, v) => {
      const c = 0.8 + (f(u, v) - 0.5) * 0.2;
      if (x % 4 === 0 || y % 16 === 0) P.set(x, y, c * 1.1, c * 1.1, c * 1.12); else P.set(x, y, 0.14, 0.14, 0.15);
    });
    P.speckle(0.04);
    return P;
  },
  // a heap of coal: black lumps with a dull shine on their tops and dark gaps under them
  coal() {
    const S = 64, P = new Painter(S, 291), f = makeFbm(291, 8, 2);
    P.each((x, y, u, v) => { const c = 0.1 + (f(u, v) - 0.5) * 0.06; P.set(x, y, c, c, c * 1.05); });
    for (let k = 0; k < 140; k++) {
      const x = (P.rng() * S) | 0, y = (P.rng() * S) | 0, r = 1 + ((P.rng() * 3) | 0), g = 0.13 + P.rng() * 0.1;
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) if (a * a + b * b <= r * r) P.set(x + a, y + b, g, g, g * 1.06);
      P.mul(x - 1, y - r, 2.2); P.mul(x, y - r, 2.6);
      for (let a = -r; a <= r; a++) P.mul(x + a, y + r + 1, 0.5);
    }
    return P;
  },
  // striped awning cloth (light, tinted by the material): broad stripes in two shades, faded by the sun
  awning() {
    const S = 64, P = new Painter(S, 251), f = makeFbm(251, 4, 3);
    P.each((x, y, u, v) => {
      const c = (0.86 + (f(u, v) - 0.5) * 0.16) * (y & 1 ? 0.97 : 1.02) * ((x >> 3) % 2 ? 0.62 : 1);
      P.set(x, y, c, c, c);
    });
    P.speckle(0.03);
    return P;
  },
  // the sawn ends of stacked logs: rings round a heart that is never quite in the middle, a thin bark rim, a drying
  // crack, black gaps between the logs (four logs across)
  logpile() {
    const S = 128, P = new Painter(S, 301), f = makeFbm(301, 8, 2);
    P.each((x, y, u, v) => { const c = 0.06 + f(u, v) * 0.05; P.set(x, y, c, c * 0.9, c * 0.75); });
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
      const cx = col * 32 + (row % 2) * 16 + 16 + (hash2(col, row, 5) - 0.5) * 4, cy = row * 32 + 16 + (hash2(col, row, 6) - 0.5) * 3;
      const r = 13.5 + hash2(col, row, 7) * 2.6, tone = 0.84 + hash2(col, row, 8) * 0.2, rings = 4 + hash2(col, row, 9) * 3;
      const ox = (hash2(col, row, 10) - 0.5) * 5, oy = (hash2(col, row, 11) - 0.5) * 5;
      for (let dy = -17; dy <= 17; dy++) for (let dx = -17; dx <= 17; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        const px = Math.round(cx + dx), py = Math.round(cy + dy);
        if (d > r - 1.8) { P.set(px, py, 0.27 * tone, 0.18 * tone, 0.11 * tone); continue; }
        const dh = Math.hypot(dx - ox, dy - oy), ring = 0.5 + 0.5 * Math.cos(dh / r * rings * Math.PI * 2);
        const c = tone * (dh < r * 0.3 ? 0.88 : 1) * (0.84 + ring * 0.13 - dh / r * 0.12) * (dx + dy > r * 0.9 ? 0.9 : 1);
        P.set(px, py, 0.92 * c, 0.75 * c, 0.5 * c);
      }
      const a = hash2(col, row, 12) * Math.PI * 2;
      for (let t = 2; t < r - 2; t++) P.mul(Math.round(cx + ox + Math.cos(a) * t), Math.round(cy + oy + Math.sin(a) * t), 0.5);
    }
    P.speckle(0.04);
    return P;
  },
  // a log pile from the side: round logs lying one over the other, lit along the middle of the curve, bark plates
  // and furrows running along them, black gaps between (four logs high)
  logside() {
    const S = 128, P = new Painter(S, 311), plates = makeFbm(311, 8, 3), fine = makeFbm(313, 16, 2);
    const H = S / 4;
    P.each((x, y, u, v) => {
      const li = Math.floor(y / H), t = (y - li * H) / H, round = Math.sin(t * Math.PI);
      if (round < 0.2) { P.set(x, y, 0.05, 0.045, 0.04); return; }
      const off = hash2(li, 1, 3), p = plates(u * 0.5 + off, v * 4), g = fine(u * 0.5 + off, v * 2);
      const c = (0.28 + round * 0.56) * (0.84 + (p - 0.5) * 0.5) * (g < 0.4 ? 0.62 : 1);
      P.set(x, y, 0.56 * c, 0.43 * c, 0.3 * c);
    });
    P.speckle(0.05);
    return P;
  },
  // rough bark round a single log (u around it, v along it): long plates parted by dark furrows
  barkrough() {
    const S = 64, P = new Painter(S, 321), f = makeFbm(321, 4, 3), g = makeFbm(323, 8, 2);
    P.each((x, y, u, v) => {
      const w = Math.abs(Math.sin((u * 7 + f(u, v * 0.5) * 2.2) * Math.PI));
      const c = (0.64 + (g(u, v) - 0.5) * 0.4) * (w < 0.22 ? 0.45 : 0.84 + w * 0.2);
      P.set(x, y, 0.5 * c, 0.38 * c, 0.27 * c);
    });
    P.speckle(0.06);
    return P;
  },
  // sawn boards stacked to dry, seen from the side: layers of planks, every one a little different, with the
  // stickers that keep the air between them
  lumber() {
    const S = 128, P = new Painter(S, 331), f = makeFbm(331, 8, 2);
    const L = 16;
    P.each((x, y, u, v) => {
      const li = Math.floor(y / L), k = y % L;
      if (k >= 12) {
        if ((x + li * 11) % 42 < 5) P.set(x, y, 0.42, 0.34, 0.22);
        else P.set(x, y, 0.06, 0.05, 0.045);
        return;
      }
      const b = Math.floor((x + hash2(li, 0, 2) * 128) / 64), tone = 0.8 + hash2(li, b, 3) * 0.22;
      const grain = 0.5 + 0.5 * Math.sin((v * 40 + f(u, v) * 6) * Math.PI);
      const c = tone * (0.84 + grain * 0.1) * (k === 0 ? 1.14 : k === 11 ? 0.72 : 1);
      P.set(x, y, 0.86 * c, 0.69 * c, 0.47 * c);
    });
    for (let li = 0; li < S / L; li++) {
      const jx = (hash2(li, 0, 2) * 128) | 0;
      for (const j of [jx, jx + 64]) for (let y = li * L; y < li * L + 12; y++) { P.mul(j, y, 0.45); P.mul(j + 1, y, 1.1); }
    }
    P.speckle(0.03);
    return P;
  },
  // wooden roof shingles: overlapping rows of uneven width, a shadow under each row, grey with weather, some moss
  shingle() {
    const S = 128, P = new Painter(S, 341), moss = makeFbm(341, 4, 3), f = makeFbm(343, 16, 2);
    const R = 16, n = 9;
    for (let row = 0; row < S / R; row++) {
      const rs = [];
      let sum = 0;
      for (let i = 0; i < n; i++) { const r = 0.7 + hash2(row, i, 5) * 0.6; rs.push(r); sum += r; }
      let x0 = Math.floor(hash2(row, 9, 5) * 20), acc = 0;
      for (let i = 0; i < n; i++) {
        const x1 = Math.round((acc += rs[i]) / sum * S) + Math.floor(hash2(row, 9, 5) * 20), tone = 0.78 + hash2(row, i, 6) * 0.3;
        for (let y = row * R; y < row * R + R; y++) for (let x = x0; x < x1; x++) {
          const u = (((x % S) + S) % S) / S, v = y / S, k = y - row * R, m = moss(u, v);
          const c = tone * (0.84 + (f(u, v) - 0.5) * 0.25) * (k > R - 4 ? 0.6 : k < 2 ? 1.12 : 1);
          let r = 0.56 * c, g = 0.49 * c, b = 0.41 * c;
          if (m > 0.62) { const a = Math.min(1, (m - 0.62) * 4); r += (0.3 * c - r) * a; g += (0.42 * c - g) * a; b += (0.2 * c - b) * a; }
          P.set(x, y, r, g, b);
        }
        for (let y = row * R; y < row * R + R - 3; y++) P.mul(x0, y, 0.55);
        x0 = x1;
      }
    }
    P.speckle(0.04);
    return P;
  },
  // rubble masonry: rounded field stones in different greys, lit from the top left, in a pale mortar
  fieldstone() {
    const S = 128, P = new Painter(S, 351), f = makeFbm(351, 8, 2);
    const G = 6, C = S / G, pts = [];
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) pts.push([(i + 0.2 + hash2(i, j, 1) * 0.6) * C, (j + 0.2 + hash2(i, j, 2) * 0.6) * C, 0.7 + hash2(i, j, 3) * 0.36]);
    P.each((x, y, u, v) => {
      let d1 = 1e9, d2 = 1e9, t = 1, sx = 0, sy = 0;
      const ci = Math.floor(x / C), cj = Math.floor(y / C);
      for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) { // one stone per cell: the nearest are next door
        const wi = ((i % G) + G) % G, wj = ((j % G) + G) % G, [px, py, tone] = pts[wj * G + wi];
        const dx = x - px - (i - wi) * C, dy = y - py - (j - wj) * C, d = Math.hypot(dx, dy * 1.3);
        if (d < d1) { d2 = d1; d1 = d; t = tone; sx = dx; sy = dy; } else if (d < d2) d2 = d;
      }
      const edge = d2 - d1;
      if (edge < 2.4) { const c = 0.56 + (f(u, v) - 0.5) * 0.12; P.set(x, y, c, c * 0.97, c * 0.9); return; }
      const c = t * (0.62 + (f(u, v) - 0.5) * 0.25) * (1 - (sx + sy) / 40) * (edge < 4.5 ? 0.84 : 1);
      P.set(x, y, c, c * 0.98, c * 0.95);
    });
    P.speckle(0.04);
    return P;
  },
  // forest floor: humus under a mat of pine needles, patches of moss, a few cones
  needles() {
    const S = 128, P = new Painter(S, 361), big = makeFbm(361, 4, 4), moss = makeFbm(367, 8, 3);
    P.each((x, y, u, v) => {
      const c = 0.62 + (big(u, v) - 0.5) * 0.4;
      if (moss(u, v) > 0.6) P.set(x, y, 0.27 * c, 0.37 * c, 0.16 * c); else P.set(x, y, 0.42 * c, 0.3 * c, 0.19 * c);
    });
    for (let k = 0; k < 560; k++) {
      const x = P.rng() * S, y = P.rng() * S, a = P.rng() * Math.PI, len = 3 + P.rng() * 4, k2 = P.rng() < 0.5 ? 1.35 : 0.68;
      for (let t = 0; t < len; t++) P.mul(Math.round(x + Math.cos(a) * t), Math.round(y + Math.sin(a) * t), k2);
    }
    for (let k = 0; k < 7; k++) {
      const x = (P.rng() * S) | 0, y = (P.rng() * S) | 0;
      for (let a = -2; a <= 2; a++) for (let b = -3; b <= 3; b++) if (a * a / 4 + b * b / 9 <= 1) P.set(x + a, y + b, 0.3, 0.19, 0.1);
      P.mul(x, y - 3, 1.6); P.mul(x - 1, y - 2, 1.4); P.mul(x + 1, y + 3, 0.5);
    }
    P.speckle(0.05);
    return P;
  },
  // packed snow: soft drifts in cold blue shadow, wind ripples, a few glittering crystals and boot prints
  snow() {
    const S = 128, P = new Painter(S, 381), big = makeFbm(381, 4, 4), rip = makeFbm(383, 8, 2);
    P.each((x, y, u, v) => {
      const d = big(u, v), w = Math.sin((v * 7 + rip(u, v) * 2.4) * Math.PI * 2) * 0.5 + 0.5;
      const c = 0.88 + (d - 0.5) * 0.16 + (w - 0.5) * 0.04;
      P.set(x, y, c * 0.95, c * 0.97, c * 1.02);
    });
    for (let k = 0; k < 9; k++) {
      const x = (P.rng() * S) | 0, y = (P.rng() * S) | 0;
      for (let a = -3; a <= 3; a++) for (let b = -5; b <= 5; b++) if (a * a / 9 + b * b / 25 <= 1) P.mul(x + a, y + b, 0.93 + (b < 0 ? 0.03 : 0));
    }
    for (let k = 0; k < 70; k++) { const x = (P.rng() * S) | 0, y = (P.rng() * S) | 0; P.set(x, y, 1, 1, 1); P.mul(x + 1, y + 1, 0.9); }
    return P;
  },
  // granite: grey crystals, darker cracks and ledges running across, some rust-coloured lichen
  rock() {
    const S = 128, P = new Painter(S, 391), big = makeFbm(391, 4, 4), fine = makeFbm(393, 32, 2), lich = makeFbm(397, 8, 3);
    P.each((x, y, u, v) => {
      const c = 0.56 + (big(u, v) - 0.5) * 0.28 + (fine(u, v) - 0.5) * 0.16;
      const l = lich(u, v);
      if (l > 0.68) P.set(x, y, c * 1.04, c * 0.86, c * 0.6); else P.set(x, y, c, c * 0.99, c * 1.02);
    });
    for (let k = 0; k < 5; k++) {
      let x = P.rng() * S, y = P.rng() * S;
      const dy = (P.rng() - 0.5) * 0.6;
      for (let t = 0; t < 70; t++) { P.mul(Math.round(x), Math.round(y), 0.55); P.mul(Math.round(x), Math.round(y) - 1, 1.15); x += 1; y += dy + (P.rng() - 0.5) * 0.8; }
    }
    for (let k = 0; k < 4; k++) P.crack((P.rng() * S) | 0, (P.rng() * S) | 0, 16 + P.rng() * 20, 0.6);
    P.speckle(0.07);
    return P;
  },
  // yard gravel: small grey-beige stones, each with a lit top and a shadow under it
  gravel() {
    const S = 128, P = new Painter(S, 371), f = makeFbm(371, 4, 3);
    P.each((x, y, u, v) => { const c = 0.5 + (f(u, v) - 0.5) * 0.2; P.set(x, y, c, c * 0.96, c * 0.88); });
    for (let k = 0; k < 900; k++) {
      const x = (P.rng() * S) | 0, y = (P.rng() * S) | 0, r = P.rng() < 0.7 ? 1 : 2, g = 0.48 + P.rng() * 0.3;
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) if (a * a + b * b <= r * r + 0.5) P.set(x + a, y + b, g, g * 0.96, g * 0.88);
      P.mul(x, y - r, 1.25); P.mul(x, y + r + 1, 0.6);
    }
    P.speckle(0.05);
    return P;
  },
};

// Texture coordinates from position (box projection along the main axis of each triangle), for models whose
// parts would otherwise each squeeze the whole texture onto every face. Needs a non-indexed geometry.
export function projectUV(g, tile) {
  const p = g.attributes.position.array, n = g.attributes.position.count, uv = new Float32Array(n * 2), s = 1 / tile;
  for (let t = 0; t + 2 < n; t += 3) {
    const a = t * 3;
    const ux = p[a + 3] - p[a], uy = p[a + 4] - p[a + 1], uz = p[a + 5] - p[a + 2];
    const vx = p[a + 6] - p[a], vy = p[a + 7] - p[a + 1], vz = p[a + 8] - p[a + 2];
    const nx = Math.abs(uy * vz - uz * vy), ny = Math.abs(uz * vx - ux * vz), nz = Math.abs(ux * vy - uy * vx);
    for (let k = 0; k < 3; k++) {
      const i = (t + k) * 3, j = (t + k) * 2;
      if (nx >= ny && nx >= nz) { uv[j] = p[i + 2] * s; uv[j + 1] = p[i + 1] * s; }
      else if (ny >= nz) { uv[j] = p[i] * s; uv[j + 1] = p[i + 2] * s; }
      else { uv[j] = p[i] * s; uv[j + 1] = p[i + 1] * s; }
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// The lettering on shops and public buildings: one sheet, two columns of eight boards
const SIGNS = [
  ['HOTEL', '#7a1f28', '#f4dc9a'], ['BAR', '#201c28', '#ff8a5c'], ['CAFÉ', '#2e4a3a', '#f0e8d0'], ['MARKT', '#a83228', '#ffffff'],
  ['BÄCKEREI', '#e8cc88', '#5a3216'], ['APOTHEKE', '#1e6e46', '#ffffff'], ['BANK', '#1e3a5e', '#f0e0a8'], ['GARAGE', '#d8a820', '#1c1c1c'],
  ['TANKSTELLE', '#c8302a', '#ffffff'], ['SCHULE', '#e8e4d8', '#28406a'], ['KLINIK', '#ffffff', '#c02828'], ['RATHAUS', '#ece4d0', '#3a3228'],
  ['FISCH', '#2a6a8a', '#ffffff'], ['POST', '#e8b818', '#1c1c1c'], ['PENSION', '#5a7a4a', '#f8f0d8'], ['LAGER', '#54585c', '#f0e8c8'],
];
function signAtlas() {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const x = c.getContext('2d');
  SIGNS.forEach(([text, bg, fg], i) => {
    const px = (i % 2) * 512, py = ((i / 2) | 0) * 128;
    x.fillStyle = bg; x.fillRect(px, py, 512, 128);
    x.strokeStyle = fg; x.lineWidth = 5; x.strokeRect(px + 9, py + 9, 494, 110);
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    let size = 84; x.font = `bold ${size}px Arial, sans-serif`;
    while (x.measureText(text).width > 450) { size -= 4; x.font = `bold ${size}px Arial, sans-serif`; }
    x.fillText(text, px + 256, py + 68);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4;
  return t;
}

export class TextureLib {
  constructor(engine) {
    this.engine = engine;
    this.tex = {};
  }

  async generateAll(onProgress) {
    const names = Object.keys(GENERATORS);
    for (let i = 0; i < names.length; i++) {
      this.generate(names[i]);
      if (onProgress) onProgress((i + 1) / names.length, names[i]);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  generate(name) {
    if (this.tex[name]) return this.tex[name];
    if (name === 'signs') return (this.tex[name] = { map: signAtlas() });
    const P = GENERATORS[name](), S = P.S;
    const col = new Uint8ClampedArray(S * S * 4);
    // limited color depth, like a palette texture
    const L = 40;
    for (let i = 0; i < S * S; i++) {
      for (let k = 0; k < 3; k++) col[i * 4 + k] = (Math.round(clamp(P.c[i * 3 + k], 0, 1) * L) / L) * 255;
      col[i * 4 + 3] = 255;
    }
    const c = document.createElement('canvas');
    c.width = c.height = S;
    c.getContext('2d').putImageData(new ImageData(col, S, S), 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    // soft filtering: the texels melt together instead of showing up as hard squares
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 1;
    this.tex[name] = { map: t };
    return this.tex[name];
  }
}
