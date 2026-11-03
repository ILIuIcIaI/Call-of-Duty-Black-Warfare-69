import * as THREE from 'three';
import { buildWeapon } from './models.js';

// =============================================================================
// Weapon skins. Each one paints its own seamless pattern in code and replaces the
// body materials of a gun: housing, barrel, grip, stock, magazine and the housing
// of the sight. Glass, lenses, reticles, cartridges and hands are never touched.
// =============================================================================
export const SKINS = {
  standard: { name: 'Standard', swatch: '#4c4f55' },
  glutglas: { name: 'Glutglas', swatch: '#e8141a' },
  riss: { name: 'Riss', swatch: '#f2f2ee' },
  magenta: { name: 'Magenta', swatch: '#e41cae' },
  plasma: { name: 'Plasma', swatch: '#4cf5cd' },
  chrom: { name: 'Flüssigchrom', swatch: '#a4aab2' },
  neonader: { name: 'Neonader', swatch: '#20e8a0' },
};
export const SKIN_IDS = Object.keys(SKINS);
export const skinOf = (id) => (SKINS[id] ? id : 'standard');
// Warzone and Gun Game: pure chance, the plain one among them
export const randomSkin = () => SKIN_IDS[(Math.random() * SKIN_IDS.length) | 0];

// what the skin paints over; whatever else a gun is made of stays as it is
const BODY = ['metal', 'poly', 'tan', 'od', 'grey', 'wood', 'rubber'];

// ---------------------------------------------------------------- seamless noise
let S = 384; // texture size; smaller on the weak presets, see setSkinDetail
const mix = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rngOf = (seed) => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const wrap1 = (x) => x - Math.floor(x);

function noiseOf(r, n) {
  const g = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) g[i] = r();
  return (u, v) => {
    const x = u * n, y = v * n, xi = Math.floor(x), yi = Math.floor(y);
    let fx = x - xi, fy = y - yi; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % n) + n) % n, y0 = ((yi % n) + n) % n, x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
    return mix(mix(g[y0 * n + x0], g[y0 * n + x1], fx), mix(g[y1 * n + x0], g[y1 * n + x1], fx), fy);
  };
}
function fbmOf(r, n0, octaves) {
  const L = []; for (let i = 0; i < octaves; i++) L.push(noiseOf(r, n0 << i));
  return (u, v) => { let s = 0, a = 0.5, t = 0; for (let i = 0; i < octaves; i++) { s += a * L[i](u, v); t += a; a *= 0.5; } return s / t; };
}
// the nearest and second nearest of n scattered points, on a torus
function cellsOf(r, n) {
  const X = new Float32Array(n), Y = new Float32Array(n), V = new Float32Array(n);
  for (let i = 0; i < n; i++) { X[i] = r(); Y[i] = r(); V[i] = r(); }
  const o = { id: 0, value: 0, d1: 0, d2: 0 };
  return (u, v) => {
    let d1 = 9, d2 = 9, id = 0;
    for (let i = 0; i < n; i++) {
      let dx = Math.abs(u - X[i]), dy = Math.abs(v - Y[i]);
      if (dx > 0.5) dx = 1 - dx; if (dy > 0.5) dy = 1 - dy;
      const d = dx * dx + dy * dy;
      if (d < d1) { d2 = d1; d1 = d; id = i; } else if (d < d2) d2 = d;
    }
    o.id = id; o.value = V[id]; o.d1 = Math.sqrt(d1); o.d2 = Math.sqrt(d2);
    return o;
  };
}

function canvasOf(paint, size = S) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'), img = x.createImageData(size, size), d = img.data, out = [0, 0, 0];
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    paint((px + 0.5) / size, (py + 0.5) / size, out);
    const i = (py * size + px) * 4;
    d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- the six patterns: two pictures, what it is and what glows
function paintGlutglas() {
  const r = rngOf(4711), cells = cellsOf(r, 30), depth = fbmOf(r, 3, 4), wu = fbmOf(r, 3, 2), wv = fbmOf(r, 3, 2);
  const at = (u, v, out, glow) => {
    const c = cells(wrap1(u + (wu(u, v) - 0.5) * 0.05), wrap1(v + (wv(u, v) - 0.5) * 0.05));
    const k = 0.66 + c.value * 0.34, d = depth(u, v), edge = sstep(0.022, 0.002, c.d2 - c.d1), dark = sstep(0.6, 0.3, d) * 0.55;
    const R = 245 * k * (1 - dark * 0.45), G = 14 + 16 * k, B = 12 + 12 * k;
    if (glow) { out[0] = mix(R * 0.62, 255, edge * 0.5); out[1] = mix(4, 48, edge); out[2] = mix(4, 34, edge); return; }
    out[0] = mix(R, 255, edge * 0.6); out[1] = mix(G, 96, edge); out[2] = mix(B, 76, edge);
  };
  return { map: canvasOf((u, v, o) => at(u, v, o, false)), glow: canvasOf((u, v, o) => at(u, v, o, true)) };
}

function paintRiss() {
  const r = rngOf(90210), big = cellsOf(r, 11), small = cellsOf(r, 42), neon = cellsOf(r, 16), wu = fbmOf(r, 4, 3), wv = fbmOf(r, 4, 3), mask = fbmOf(r, 3, 3), mask2 = fbmOf(r, 3, 3), grain = fbmOf(r, 16, 2);
  const at = (u, v, out, glow) => {
    const uu = wrap1(u + (wu(u, v) - 0.5) * 0.07), vv = wrap1(v + (wv(u, v) - 0.5) * 0.07);
    const A = big(uu, vv), lineBig = sstep(0.009, 0.003, A.d2 - A.d1);
    const B = small(uu, vv), lineSmall = sstep(0.0045, 0.0015, B.d2 - B.d1) * sstep(0.46, 0.56, mask(u, v));
    const C = neon(uu, vv), lineNeon = sstep(0.0055, 0.0018, C.d2 - C.d1) * sstep(0.52, 0.6, mask2(u, v));
    if (glow) { out[0] = 150 * lineNeon; out[1] = 255 * lineNeon; out[2] = 70 * lineNeon; return; }
    const w = 232 + grain(u, v) * 18, ink = Math.max(lineBig, lineSmall * 0.85);
    out[0] = mix(mix(w, 12, ink), 150, lineNeon); out[1] = mix(mix(w, 12, ink), 255, lineNeon); out[2] = mix(mix(w - 2, 14, ink), 70, lineNeon);
  };
  return { map: canvasOf((u, v, o) => at(u, v, o, false)), glow: canvasOf((u, v, o) => at(u, v, o, true)) };
}

function paintMagenta() {
  const r = rngOf(1337), cells = cellsOf(r, 52), cluster = fbmOf(r, 4, 2), fine = fbmOf(r, 24, 2);
  const at = (u, v, out, glow) => {
    const c = cells(u, v), t = c.value * 0.72 + cluster(u, v) * 0.28, facet = 0.88 + (c.d1 * 3.2) * 0.2, g = 0.92 + fine(u, v) * 0.14;
    let R, G, B;
    if (t < 0.44) { R = 230; G = 26; B = 172; } else if (t < 0.6) { R = 255; G = 108; B = 224; } else if (t < 0.72) { R = 176; G = 18; B = 142; } else { R = 62; G = 10; B = 84; }
    const edge = sstep(0.012, 0.003, c.d2 - c.d1) * 0.28;
    R = R * facet * g * (1 - edge); G = G * facet * g * (1 - edge); B = B * facet * g * (1 - edge);
    const k = glow ? 0.6 : 1;
    out[0] = Math.min(255, R * k); out[1] = Math.min(255, G * k); out[2] = Math.min(255, B * k);
  };
  return { map: canvasOf((u, v, o) => at(u, v, o, false)), glow: canvasOf((u, v, o) => at(u, v, o, true)) };
}

function paintPlasma() {
  const r = rngOf(2024), f = fbmOf(r, 3, 4), wu = fbmOf(r, 3, 3), wv = fbmOf(r, 3, 3), fine = fbmOf(r, 12, 2);
  const at = (u, v, out, glow) => {
    const n = f(wrap1(u + (wu(u, v) - 0.5) * 0.28), wrap1(v + (wv(u, v) - 0.5) * 0.28));
    const s = sstep(0.43, 0.53, n), lift = 0.86 + fine(u, v) * 0.28, rim = sstep(0.016, 0.003, Math.abs(n - 0.48));
    let R = mix(8, 72, s) * lift, G = mix(70, 244, s) * lift, B = mix(64, 208, s) * lift;
    R = mix(R, 214, rim * 0.7); G = mix(G, 255, rim * 0.7); B = mix(B, 244, rim * 0.7);
    const k = glow ? 0.25 + s * 0.6 : 1;
    out[0] = Math.min(255, R * k); out[1] = Math.min(255, G * k); out[2] = Math.min(255, B * k);
  };
  return { map: canvasOf((u, v, o) => at(u, v, o, false)), glow: canvasOf((u, v, o) => at(u, v, o, true)) };
}

// diagonal streaks, periodic in both directions, the chrome comes from the matcap
function paintChrom() {
  const r = rngOf(555), wu = fbmOf(r, 4, 3);
  const W = [[3, 3, 1], [5, 4, 0.7], [7, 6, 0.5], [11, 10, 0.35], [2, 3, 0.6], [17, 15, 0.2]].map(([a, b, k]) => [a, b, k, r() * 6.28]);
  const map = canvasOf((u, v, out) => {
    const w = (wu(u, v) - 0.5) * 2.4;
    let s = 0; for (const [a, b, k, ph] of W) s += k * Math.sin(6.2832 * (a * u + b * v) + ph + w);
    const hard = 0.5 + 0.5 * Math.tanh(s * 1.9), val = 62 + hard * 193;
    out[0] = val * 0.97; out[1] = val * 0.985; out[2] = val;
  });
  const cap = canvasOf((u, v, out) => {
    const nx = u * 2 - 1, ny = 1 - v * 2, rr = Math.hypot(nx, ny), y = ny * 0.5 + 0.5;
    let k = y > 0.53 ? mix(0.5, 1, Math.pow((y - 0.53) / 0.47, 0.55)) : y > 0.47 ? 0.05 : mix(0.68, 0.14, (0.47 - y) / 0.47);
    k += Math.pow(Math.min(1, rr), 4) * 0.34;
    k += sstep(0.1, 0.0, Math.abs(nx + ny * 0.5 - 0.4)) * 0.22;
    const c = Math.min(255, k * 255);
    out[0] = c * 0.96; out[1] = c * 0.98; out[2] = c;
  }, 256);
  cap.wrapS = cap.wrapT = THREE.ClampToEdgeWrapping;
  return { map, cap };
}

function paintNeonader() {
  const r = rngOf(31337), f = fbmOf(r, 4, 4), g = fbmOf(r, 7, 3), wu = fbmOf(r, 4, 2), wv = fbmOf(r, 4, 2), dim = fbmOf(r, 5, 3);
  const at = (u, v, out, glow) => {
    const uu = wrap1(u + (wu(u, v) - 0.5) * 0.14), vv = wrap1(v + (wv(u, v) - 0.5) * 0.14);
    const a = 1 - Math.abs(2 * f(uu, vv) - 1), b = 1 - Math.abs(2 * g(uu, vv) - 1);
    const vein = Math.max(sstep(0.968, 0.99, a), sstep(0.978, 0.994, b) * 0.85), halo = sstep(0.86, 0.97, a) * 0.3;
    if (glow) { out[0] = 40 * vein; out[1] = mix(40 * halo, 255, vein); out[2] = mix(26 * halo, 186, vein); return; }
    const d = dim(u, v) * 12;
    out[0] = mix(3 + d * 0.2, 60, vein); out[1] = mix(12 + d + 60 * halo, 255, vein); out[2] = mix(9 + d * 0.7 + 40 * halo, 190, vein);
  };
  return { map: canvasOf((u, v, o) => at(u, v, o, false)), glow: canvasOf((u, v, o) => at(u, v, o, true)) };
}

function ribbedGreen() {
  return canvasOf((u, v, out) => {
    const rib = sstep(0.2, 0.1, Math.abs(wrap1(v * 20) - 0.5)), k = 0.8 + 0.2 * Math.sin(u * 6.2832);
    out[0] = mix(46, 8, rib) * k; out[1] = mix(190, 16, rib) * k; out[2] = mix(58, 10, rib) * k;
  });
}

// ---------------------------------------------------------------- materials
const built = new Map();
const animated = [];

function build(id) {
  const trim = (m, k) => { const c = m.clone(); c.color = new THREE.Color(k, k, k); return c; };
  const set = {};
  const assign = (main, dark, steel, mag) => { for (const k of BODY) set[k] = main; set.dark = dark; set.steel = steel; if (mag) set.mag = mag; };
  if (id === 'glutglas') {
    const { map, glow } = paintGlutglas();
    const m = new THREE.MeshPhongMaterial({ map, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0.55, specular: 0xffc8b8, shininess: 90 });
    const mag = m.clone(); mag.transparent = true; mag.opacity = 0.62; mag.depthWrite = false; mag.side = THREE.DoubleSide;
    assign(m, trim(m, 0.42), trim(m, 0.8), mag);
    animated.push({ tex: glow, du: 0.008, dv: 0.012 });
  } else if (id === 'riss') {
    const { map, glow } = paintRiss();
    const m = new THREE.MeshLambertMaterial({ map, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1 });
    const mag = new THREE.MeshPhongMaterial({ map: ribbedGreen(), emissive: 0x1c7a24, emissiveIntensity: 0.55, specular: 0xc0ffc0, shininess: 60, transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide });
    assign(m, trim(m, 0.5), trim(m, 0.86), mag);
  } else if (id === 'magenta') {
    const { map, glow } = paintMagenta();
    const m = new THREE.MeshPhongMaterial({ map, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0.42, specular: 0xffa8f0, shininess: 46 });
    assign(m, trim(m, 0.42), trim(m, 0.78));
  } else if (id === 'plasma') {
    const { map, glow } = paintPlasma();
    const m = new THREE.MeshLambertMaterial({ map, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0.62 });
    const mag = m.clone(); mag.emissiveIntensity = 1.15;
    assign(m, trim(m, 0.42), trim(m, 0.8), mag);
    animated.push({ tex: glow, du: -0.012, dv: 0.018 });
    animated.push({ mat: m, base: 0.62, amp: 0.1, rate: 1.6 });
  } else if (id === 'chrom') {
    const { map, cap } = paintChrom();
    const m = new THREE.MeshMatcapMaterial({ map, matcap: cap });
    assign(m, trim(m, 0.42), trim(m, 0.86));
  } else if (id === 'neonader') {
    const { map, glow } = paintNeonader();
    const m = new THREE.MeshPhongMaterial({ map, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1.25, specular: 0x4a6a5a, shininess: 28 });
    assign(m, trim(m, 0.5), trim(m, 0.86));
    animated.push({ mat: m, base: 1.2, amp: 0.3, rate: 2.2 });
  }
  return set;
}

// The same skin for another set of plain materials (the gun in your hands has its own, see weaponMaterials):
// materials of its own on the same pictures, and whatever glows on the first glows on these too.
const owner = new Map(), forBase = new WeakMap();
function twin(set) {
  const copy = new Map(), out = {};
  for (const k of Object.keys(set)) { const m = set[k]; if (!copy.has(m)) copy.set(m, m.clone()); out[k] = copy.get(m); }
  for (const a of [...animated]) if (a.mat && copy.has(a.mat)) animated.push({ ...a, mat: copy.get(a.mat) });
  return out;
}

// Everything a gun is made of, with the skin's parts in place of the plain ones
export function skinMaterials(base, id) {
  if (!id || id === 'standard' || !SKINS[id]) return base;
  let set = built.get(id);
  if (!set) { set = build(id); built.set(id, set); owner.set(id, base); }
  if (owner.get(id) !== base) {
    let mine = forBase.get(base);
    if (!mine) forBase.set(base, (mine = new Map()));
    if (!mine.has(id)) mine.set(id, twin(set));
    set = mine.get(id);
  }
  return { ...base, ...set };
}

// a moment while the match loads instead of a hitch in the middle of a fight
export function prewarmSkins(base) { for (const id of SKIN_IDS) skinMaterials(base, id); }
// how fine the skins are painted (pixels per side): before the first one is painted
export function setSkinDetail(size) { S = size; }

// The shaders of the skins, made while the match is still loading, not at the first shot with one of them
export function warmSkinPrograms(renderer, camera, targets, base) {
  const holder = new THREE.Scene(), g = new THREE.BoxGeometry(0.01, 0.01, 0.01), seen = new Set();
  for (const id of SKIN_IDS) { const m = skinMaterials(base, id); for (const k of [...BODY, 'dark', 'steel', 'mag']) if (m[k] && !seen.has(m[k])) { seen.add(m[k]); holder.add(new THREE.Mesh(g, m[k])); } }
  for (const t of targets) renderer.compile(holder, camera, t);
}

// the glowing ones live a little
export function tickSkins(t) {
  for (const a of animated) {
    if (a.tex) a.tex.offset.set(t * a.du, t * a.dv);
    else a.mat.emissiveIntensity = a.base + Math.sin(t * a.rate) * a.amp;
  }
}

// ---------------------------------------------------------------- a gun in its skin
// A skin changes what a gun is painted with and nothing else: the model stays, so changing it costs nothing.
const firstMat = new WeakMap(), roleOf = new Map(), known = new WeakSet();
export function applySkin(w, id, base, { cracks = false } = {}) {
  const skin = id && SKINS[id] ? id : 'standard', mats = skinMaterials(base, skin), mag = w.parts && w.parts.mag;
  if (!known.has(base)) { known.add(base); for (const k of Object.keys(base)) roleOf.set(base[k], k); }
  const paint = (root, inMag) => root.traverse((o) => {
    if (!o.isMesh) return;
    if (!firstMat.has(o)) firstMat.set(o, o.material);
    const orig = firstMat.get(o), k = roleOf.get(orig);
    if (!k) return;
    let isMag = inMag;
    if (!isMag && mag && mats.mag) for (let p = o; p; p = p.parent) if (p === mag) { isMag = true; break; }
    o.material = isMag && mats.mag && BODY.includes(k) ? mats.mag : mats[k];
  });
  paint(w.root, false);
  if (w.spare) paint(w.spare, true);
  w.skin = skin;
  if (cracks && skin === 'riss' && !w.cracks) addCracks(w);
  if (w.cracks) w.cracks.visible = skin === 'riss';
  return w;
}

export function buildSkinned(modelId, optic, base, id, opts) {
  return applySkin(buildWeapon(modelId, optic, base), id, base, opts);
}

// Riss: the neon cracks don't stop at the surface. Thin lines that run on into the air.
const crackMat = new THREE.LineBasicMaterial({ color: 0xb6ff4c, transparent: true, opacity: 0.85, fog: false, toneMapped: false });
function addCracks(w) {
  const r = rngOf(4242), P = [], points = [];
  w.root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(w.root.matrixWorld).invert(), v = new THREE.Vector3();
  const opticGroup = w.optic && w.optic.group;
  w.root.traverse((o) => {
    if (!o.isMesh || !o.geometry.attributes.position) return;
    for (let p = o; p; p = p.parent) if (p === opticGroup) return;
    if (o.material.transparent) return;
    const a = o.geometry.attributes.position, m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), n = Math.min(a.count, 400);
    for (let i = 0; i < n; i++) { const k = (r() * a.count) | 0; v.fromBufferAttribute(a, k).applyMatrix4(m); points.push(v.clone()); }
  });
  if (!points.length) return;
  const box = new THREE.Box3().setFromPoints(points), mid = box.getCenter(new THREE.Vector3()), long = box.max.z - box.min.z;
  const COUNT = Math.round(7 + long * 13);
  const branch = (x, y, z, dx, dy, dz, left, step) => {
    if (left <= 0) return;
    const L = step * (0.7 + r() * 0.6);
    const nx = dx + (r() - 0.5) * 0.9, ny = dy + (r() - 0.5) * 0.9, nz = dz + (r() - 0.5) * 0.9, q = Math.hypot(nx, ny, nz) || 1;
    const ex = x + (nx / q) * L, ey = y + (ny / q) * L, ez = z + (nz / q) * L;
    P.push(x, y, z, ex, ey, ez);
    branch(ex, ey, ez, nx / q, ny / q, nz / q, left - 1, step * 0.9);
    if (r() < 0.32) branch(ex, ey, ez, (nx / q) + (r() - 0.5) * 1.4, (ny / q) + (r() - 0.5) * 1.4, (nz / q) + (r() - 0.5) * 1.4, left - 2, step * 0.7);
  };
  for (let i = 0; i < COUNT; i++) {
    const s = points[(r() * points.length) | 0], dx = s.x - mid.x, dy = s.y - mid.y, q = Math.hypot(dx, dy) || 1;
    // sideways and down rather than up into the line of sight
    if (s.z > box.max.z - long * 0.3) continue; // (not in the face: the rear of the gun is right in front of the eye)
    branch(s.x, s.y, s.z, dx / q, Math.min(0.2, dy / q), (r() - 0.5) * 0.7, 2 + ((r() * 3) | 0), 0.009 + r() * 0.009);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  const lines = new THREE.LineSegments(g, crackMat);
  lines.frustumCulled = false; lines.userData.keep = true;
  w.root.add(lines);
  w.cracks = lines;
}
