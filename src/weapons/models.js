import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { projectUV } from '../world/textures.js';

// =============================================================================
// Procedural weapon + hand models.
// Weapon space: -Z = muzzle direction, +Y up, +X right. Origin ≈ top of the
// pistol grip. Units are meters (real-world sizes).
// Each builder returns { root, parts, anchors } where parts are animated
// sub-groups (mag, bolt, slide, ...) and anchors are hand/sight/muzzle points.
// =============================================================================

let MATS = null;
export function weaponMaterials(texLib) {
  if (MATS) return MATS;
  const gm = texLib.generate('gunmetal').map, fab = texLib.generate('fabric').map;
  const camo = texLib.generate('camo').map, wood = texLib.generate('wood').map;
  const lam = (o) => new THREE.MeshLambertMaterial(o);
  MATS = {
    metal: lam({ color: 0x4c4f55, map: gm }),
    steel: lam({ color: 0x8c9096, map: gm }),
    dark: lam({ color: 0x18191b }),
    poly: lam({ color: 0x35373b, map: gm }),
    tan: lam({ color: 0xa89470, map: gm }),
    od: lam({ color: 0x5c6350, map: gm }),
    grey: lam({ color: 0x63676c, map: gm }),
    wood: lam({ color: 0xc08a58, map: wood }),
    rubber: lam({ color: 0x2a2a2e }),
    brass: lam({ color: 0xdcb464, map: gm }),
    shell: lam({ color: 0xb8301f }),
    lens: lam({ color: 0x24384a, transparent: true, opacity: 0.55 }),
    glove: lam({ color: 0x625e52, map: fab }),
    glovePad: lam({ color: 0x302f2c, map: fab }),
    sleeve: lam({ color: 0xffffff, map: camo }),
    watch: lam({ color: 0x202020 }),
    emissiveRed: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
  };
  return MATS;
}

// ---------------------------------------------------------------- tiny modelling kit
const tmpE = new THREE.Euler();
function place(mesh, x, y, z, rx = 0, ry = 0, rz = 0) {
  mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); return mesh;
}
// even texel size over all the separate parts of a model
export function evenUV(root, tile = 0.3) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material.isMeshLambertMaterial || !o.material.map) return;
    if (o.geometry.index) o.geometry = o.geometry.toNonIndexed();
    projectUV(o.geometry, tile);
  });
}
function M(geo, mat) { const m = new THREE.Mesh(geo, mat); m.castShadow = false; m.receiveShadow = false; return m; }
export function box(parent, mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0, r = 0) {
  const g = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)) : new THREE.BoxGeometry(w, h, d);
  const m = place(M(g, mat), x, y, z, rx, ry, rz); parent.add(m); return m;
}
// cylinder along Z by default
export function cyl(parent, mat, r1, r2, len, x, y, z, axis = 'z', seg = 14, open = false) {
  const g = new THREE.CylinderGeometry(r1, r2, len, seg, 1, open);
  if (axis === 'z') g.rotateX(Math.PI / 2); else if (axis === 'x') g.rotateZ(Math.PI / 2);
  const m = place(M(g, mat), x, y, z); parent.add(m); return m;
}
// Side-profile extrusion: pts are [z, y] pairs in weapon space, extruded along X with thickness t.
export function prof(parent, mat, pts, t, x = 0, bevel = 0.002) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, t - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -(t - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  const m = place(M(g, mat), x, 0, 0); parent.add(m); return m;
}
// smooth curved profile via quadratic curves: segs = [[z,y], ['q', cz, cy, z, y], ...]
export function profCurve(parent, mat, segs, t, x = 0, bevel = 0.002) {
  const s = new THREE.Shape();
  s.moveTo(segs[0][0], segs[0][1]);
  for (let i = 1; i < segs.length; i++) {
    const p = segs[i];
    if (p[0] === 'q') s.quadraticCurveTo(p[1], p[2], p[3], p[4]); else s.lineTo(p[0], p[1]);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, t - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 8 });
  g.translate(0, 0, -(t - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  const m = place(M(g, mat), x, 0, 0); parent.add(m); return m;
}
function group(parent, name, x = 0, y = 0, z = 0) {
  const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); return g;
}
// Rail with cross slots
function rail(parent, mat, z0, z1, y, w = 0.021) {
  box(parent, mat, w, 0.007, z1 - z0, 0, y + 0.0035, (z0 + z1) / 2);
  for (let z = z0 + 0.004; z < z1 - 0.003; z += 0.01) box(parent, mat, w + 0.003, 0.005, 0.005, 0, y + 0.0095, z);
}

// Merge static meshes per material (keeps animated part groups separate) -> far fewer draw calls
export function optimize(root, keep) {
  const byMat = new Map();
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const toRemove = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    // skip meshes inside kept groups
    let p = o.parent, kept = false;
    while (p && p !== root) { if (keep.has(p)) { kept = true; break; } p = p.parent; }
    if (kept || o.userData.keep) return;
    const g = o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const ng = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ng.deleteAttribute(k);
    if (!ng.attributes.uv) ng.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(ng);
    toRemove.push(o);
  });
  for (const o of toRemove) o.parent.remove(o);
  for (const [mat, geos] of byMat) {
    const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
    root.add(m);
  }
}

// =============================================================================
// Optics
// =============================================================================
function reticleTexture(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.translate(64, 64);
  const glow = (col, blur) => { x.shadowColor = col; x.shadowBlur = blur; };
  if (kind === 'dot') {
    glow('#ff2a10', 10); x.fillStyle = '#ff4a30';
    x.beginPath(); x.arc(0, 0, 9, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#ffd0c0'; x.beginPath(); x.arc(0, 0, 4, 0, Math.PI * 2); x.fill();
  } else if (kind === 'holo') {
    glow('#ff2a10', 8); x.strokeStyle = '#ff4a30'; x.lineWidth = 5;
    x.beginPath(); x.arc(0, 0, 46, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#ff6a50'; x.beginPath(); x.arc(0, 0, 6, 0, Math.PI * 2); x.fill();
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) { x.save(); x.rotate(a); x.fillRect(-2.5, 46, 5, 12); x.restore(); }
  } else if (kind === 'chevron') {
    glow('#ff3010', 6); x.fillStyle = '#ff5030';
    x.beginPath(); x.moveTo(0, -4); x.lineTo(14, 20); x.lineTo(8, 20); x.lineTo(0, 6); x.lineTo(-8, 20); x.lineTo(-14, 20); x.closePath(); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const RET = {};
function reticleMat(kind) {
  if (!RET[kind]) RET[kind] = new THREE.MeshBasicMaterial({ map: reticleTexture(kind), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  return RET[kind];
}

// scope lens overlay: reticle + dark vignette edge drawn over the PIP image
function scopeOverlayTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 70, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.72, 'rgba(0,0,0,0.15)'); g.addColorStop(1, 'rgba(0,0,0,1)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(0,0,0,0.9)'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(128, 150); x.lineTo(128, 256); x.moveTo(0, 128); x.lineTo(100, 128); x.moveTo(156, 128); x.lineTo(256, 128); x.stroke();
  x.fillStyle = '#ff3a20'; x.shadowColor = '#ff2010'; x.shadowBlur = 6;
  x.beginPath(); x.moveTo(128, 122); x.lineTo(138, 140); x.lineTo(133, 140); x.lineTo(128, 131); x.lineTo(123, 140); x.lineTo(118, 140); x.closePath(); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Returns { group, sightY (absolute, above rail base), zoom, kind, lens(optional) }
export function buildOptic(kind, mats, railY, z) {
  const g = new THREE.Group(); g.name = 'optic_' + kind;
  const m = mats;
  if (kind === 'reflex') {
    // open-frame mini red dot: low base, thin hoop around a tilted window
    const wy = railY + 0.012, ww = 0.042, wh = 0.034, wz = z - 0.008;
    box(g, m.metal, 0.03, 0.01, 0.056, 0, railY + 0.005, z, 0, 0, 0, 0.003);
    box(g, m.metal, ww, 0.006, 0.03, 0, railY + 0.012, wz, 0, 0, 0, 0.002);
    box(g, m.metal, 0.012, 0.012, 0.016, 0, railY + 0.016, z + 0.02, 0, 0, 0, 0.003);   // emitter
    for (const sx of [-1, 1]) box(g, m.metal, 0.0045, wh, 0.014, sx * (ww / 2), wy + wh / 2, wz, -0.12, 0, 0, 0.0015);
    box(g, m.metal, ww + 0.0045, 0.005, 0.014, 0, wy + wh + 0.001, wz - 0.004, -0.12, 0, 0, 0.0015);
    box(g, m.steel, 0.006, 0.008, 0.008, 0.019, railY + 0.012, z + 0.006);
    const lens = M(new THREE.PlaneGeometry(ww - 0.004, wh - 0.002), m.lens); place(lens, 0, wy + wh / 2, wz - 0.001, -0.12); g.add(lens);
    const sy = wy + wh / 2;
    const ret = M(new THREE.PlaneGeometry(0.0034, 0.0034), reticleMat('dot')); place(ret, 0, sy, wz); ret.userData.keep = true; ret.renderOrder = 5; g.add(ret);
    return { group: g, sightY: sy, zoom: 1.28, kind, reticle: ret };
  }
  if (kind === 'holo') {
    box(g, m.metal, 0.03, 0.012, 0.085, 0, railY + 0.006, z, 0, 0, 0, 0.003);
    box(g, m.poly, 0.034, 0.016, 0.07, 0, railY + 0.019, z + 0.004, 0, 0, 0, 0.004);
    // hood frame around window
    box(g, m.metal, 0.042, 0.005, 0.05, 0, railY + 0.062, z - 0.014, 0, 0, 0, 0.002);
    box(g, m.metal, 0.005, 0.038, 0.05, 0.0185, railY + 0.044, z - 0.014, 0, 0, 0, 0.002);
    box(g, m.metal, 0.005, 0.038, 0.05, -0.0185, railY + 0.044, z - 0.014, 0, 0, 0, 0.002);
    box(g, m.steel, 0.012, 0.01, 0.014, 0.019, railY + 0.02, z + 0.025);
    const lens = M(new THREE.PlaneGeometry(0.032, 0.034), m.lens); place(lens, 0, railY + 0.044, z - 0.03); g.add(lens);
    const lens2 = M(new THREE.PlaneGeometry(0.032, 0.034), m.lens); place(lens2, 0, railY + 0.044, z + 0.008); g.add(lens2);
    const ret = M(new THREE.PlaneGeometry(0.012, 0.012), reticleMat('holo')); place(ret, 0, railY + 0.044, z - 0.029); ret.userData.keep = true; ret.renderOrder = 5; g.add(ret);
    return { group: g, sightY: railY + 0.044, zoom: 1.3, kind, reticle: ret };
  }
  if (kind === 'acog') {
    // 3x prism scope with picture-in-picture lens
    box(g, m.metal, 0.026, 0.014, 0.06, 0, railY + 0.007, z, 0, 0, 0, 0.003);
    box(g, m.metal, 0.018, 0.022, 0.03, 0, railY + 0.022, z, 0, 0, 0, 0.003);
    const sy = railY + 0.046;
    cyl(g, m.metal, 0.019, 0.019, 0.1, 0, sy, z);
    cyl(g, m.metal, 0.024, 0.019, 0.035, 0, sy, z - 0.065);
    cyl(g, m.metal, 0.022, 0.019, 0.03, 0, sy, z + 0.06);
    cyl(g, m.rubber, 0.023, 0.023, 0.014, 0, sy, z + 0.08, 'z', 18, true); // open eyecup around the lens
    box(g, m.metal, 0.012, 0.012, 0.016, 0, sy + 0.022, z - 0.005, 0, 0, 0, 0.002);
    box(g, m.metal, 0.012, 0.012, 0.016, 0.022, sy, z - 0.005, 0, 0, 0, 0.002);
    const lensFront = M(new THREE.CircleGeometry(0.022, 20), m.lens); place(lensFront, 0, sy, z - 0.083); lensFront.rotation.y = Math.PI; g.add(lensFront);
    const pipMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const lens = M(new THREE.CircleGeometry(0.0185, 28), pipMat); place(lens, 0, sy, z + 0.0835); lens.userData.keep = true; g.add(lens);
    const over = M(new THREE.CircleGeometry(0.0186, 28), new THREE.MeshBasicMaterial({ map: scopeOverlayTexture(), transparent: true, depthWrite: false, toneMapped: false }));
    place(over, 0, sy, z + 0.0838); over.userData.keep = true; over.renderOrder = 6; g.add(over);
    return { group: g, sightY: sy, zoom: 1.5, pipZoom: 3.2, kind, lens, pipMat, eyeRelief: 0.11, lensZ: z + 0.0835 };
  }
  if (kind === 'sniper') {
    const sy = railY + 0.05;
    for (const dz of [-0.06, 0.06]) { box(g, m.metal, 0.024, 0.03, 0.022, 0, railY + 0.02, z + dz, 0, 0, 0, 0.003); cyl(g, m.metal, 0.021, 0.021, 0.024, 0, sy, z + dz); }
    cyl(g, m.poly, 0.016, 0.016, 0.24, 0, sy, z);
    cyl(g, m.poly, 0.027, 0.016, 0.06, 0, sy, z - 0.15);
    cyl(g, m.poly, 0.027, 0.027, 0.06, 0, sy, z - 0.2);
    cyl(g, m.poly, 0.021, 0.016, 0.04, 0, sy, z + 0.13);
    cyl(g, m.rubber, 0.022, 0.022, 0.03, 0, sy, z + 0.16);
    cyl(g, m.metal, 0.012, 0.012, 0.03, 0, sy + 0.025, z - 0.01, 'y', 12);
    cyl(g, m.metal, 0.012, 0.012, 0.03, 0.025, sy, z - 0.01, 'x', 12);
    const lensFront = M(new THREE.CircleGeometry(0.025, 20), m.lens); place(lensFront, 0, sy, z - 0.231); lensFront.rotation.y = Math.PI; g.add(lensFront);
    const back = M(new THREE.CircleGeometry(0.02, 20), m.lens); place(back, 0, sy, z + 0.176); g.add(back);
    return { group: g, sightY: sy, zoom: 6.5, kind, overlay: true };
  }
  return null;
}

// =============================================================================
// Hands. A stylised fist that wraps around an object along local +Y.
// Back of the hand on +X, fingers curl around -Z, thumb on -X, wrist toward +Z.
// =============================================================================
function buildFist(mats, opts = {}) {
  const g = new THREE.Group();
  const m = mats;
  const R = opts.radius || 0.022; // radius of the gripped object
  // back of hand / palm block
  box(g, m.glove, 0.034, 0.094, 0.07, R + 0.012, -0.004, 0.022, 0, 0.25, 0, 0.012);
  box(g, m.glovePad, 0.008, 0.07, 0.04, R + 0.03, 0.0, 0.012, 0, 0.25, 0, 0.003);
  // fingers (C arcs) - index finger optional (trigger finger)
  const ys = opts.index === false ? [0.008, -0.016, -0.038] : [0.03, 0.008, -0.016, -0.038];
  ys.forEach((y, i) => {
    const tube = i === ys.length - 1 ? 0.0085 : 0.0098;
    const tor = new THREE.TorusGeometry(R + tube * 0.9, tube, 6, 12, Math.PI * (opts.wrap || 1.12));
    tor.rotateX(-Math.PI / 2);
    const f = M(tor, m.glove);
    f.position.set(0, y, 0); f.rotation.y = -0.15;
    g.add(f);
    // knuckle pad
    box(g, m.glovePad, 0.012, 0.018, 0.02, R + 0.016, y, -0.006, 0, 0.3, 0, 0.004);
  });
  if (opts.index === false) {
    // straight trigger finger reaching forward
    const f1 = M(new THREE.CapsuleGeometry(0.0095, 0.03, 4, 8), m.glove);
    f1.rotation.x = Math.PI / 2 + 0.25; f1.position.set(R + 0.004, 0.034, -0.02); g.add(f1);
    const f2 = M(new THREE.CapsuleGeometry(0.0088, 0.022, 4, 8), m.glove);
    f2.rotation.x = Math.PI / 2 - 0.5; f2.rotation.y = 0.9; f2.position.set(R - 0.006, 0.026, -0.05); g.add(f2);
  }
  // thumb
  const t1 = M(new THREE.CapsuleGeometry(0.011, 0.03, 4, 8), m.glove);
  t1.rotation.set(Math.PI / 2 - 0.5, 0, -0.5); t1.position.set(-R * 0.7, 0.045, 0.012); g.add(t1);
  const t2 = M(new THREE.CapsuleGeometry(0.0095, 0.022, 4, 8), m.glove);
  t2.rotation.set(Math.PI / 2 - 0.15, 0, -0.2); t2.position.set(-R - 0.004, 0.052, -0.022); g.add(t2);
  // wrist + forearm sleeve going back toward the camera
  const arm = new THREE.Group();
  arm.position.set(R + 0.012, -0.02, 0.055);
  const dir = new THREE.Vector3(...(opts.armDir || [0.35, -0.55, 1])).normalize();
  arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.add(arm);
  const wrist = M(new THREE.CylinderGeometry(0.03, 0.033, 0.06, 12), m.glove); wrist.position.y = 0.02; arm.add(wrist);
  const cuff = M(new THREE.CylinderGeometry(0.041, 0.041, 0.04, 14), m.sleeve); cuff.position.y = 0.07; arm.add(cuff);
  const fore = M(new THREE.CylinderGeometry(0.044, 0.052, 0.42, 14), m.sleeve); fore.position.y = 0.29; arm.add(fore);
  if (opts.watch) {
    const w = M(new THREE.CylinderGeometry(0.0335, 0.0335, 0.02, 14), m.watch); w.position.y = 0.035; arm.add(w);
    box(arm, m.watch, 0.022, 0.012, 0.024, 0, 0.035, 0.033);
    const face = M(new THREE.CircleGeometry(0.009, 12), new THREE.MeshBasicMaterial({ color: 0x40ff90 })); face.position.set(0, 0.035, 0.0395); arm.add(face);
  }
  return g;
}

// Open hand (for mantling onto ledges / arm swing): fingers toward -Z, palm down, wrist toward +Z
function buildOpenHand(mats, opts = {}) {
  const g = new THREE.Group(), m = mats;
  box(g, m.glove, 0.084, 0.03, 0.09, 0, 0, -0.005, 0, 0, 0, 0.012);
  box(g, m.glovePad, 0.07, 0.008, 0.05, 0, 0.016, -0.02, 0, 0, 0, 0.003);
  const fingers = [[-0.029, 0.052], [-0.0095, 0.062], [0.0095, 0.06], [0.029, 0.05]];
  for (const [x, L] of fingers) {
    const f1 = M(new THREE.CapsuleGeometry(0.0098, L * 0.5, 4, 8), m.glove);
    f1.rotation.x = Math.PI / 2 + 0.18; f1.position.set(x, -0.002, -0.05 - L * 0.28); g.add(f1);
    const f2 = M(new THREE.CapsuleGeometry(0.009, L * 0.35, 4, 8), m.glove);
    f2.rotation.x = Math.PI / 2 + 0.55; f2.position.set(x, -0.012, -0.05 - L * 0.72); g.add(f2);
    box(g, m.glovePad, 0.014, 0.008, 0.016, x, 0.008, -0.05, 0, 0, 0, 0.003);
  }
  const t1 = M(new THREE.CapsuleGeometry(0.0105, 0.03, 4, 8), m.glove);
  t1.rotation.set(Math.PI / 2, 0.75, 0); t1.position.set(-0.05, -0.008, -0.02); g.add(t1);
  const arm = new THREE.Group();
  arm.position.set(0, 0.0, 0.045);
  arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...(opts.armDir || [0.15, -0.25, 1])).normalize());
  g.add(arm);
  const wrist = M(new THREE.CylinderGeometry(0.03, 0.033, 0.06, 12), m.glove); wrist.position.y = 0.02; arm.add(wrist);
  const cuff = M(new THREE.CylinderGeometry(0.041, 0.041, 0.04, 14), m.sleeve); cuff.position.y = 0.07; arm.add(cuff);
  const fore = M(new THREE.CylinderGeometry(0.044, 0.052, 0.42, 14), m.sleeve); fore.position.y = 0.29; arm.add(fore);
  // upper arm: a stretched-out arm (hanging from a ledge) reaches all the way out of the frame
  const upper = M(new THREE.CylinderGeometry(0.052, 0.066, 0.7, 14), m.sleeve); upper.position.y = 0.85; arm.add(upper);
  if (opts.watch) {
    const w = M(new THREE.CylinderGeometry(0.0335, 0.0335, 0.02, 14), m.watch); w.position.y = 0.035; arm.add(w);
    box(arm, m.watch, 0.022, 0.012, 0.024, 0, 0.035, 0.033);
    const face = M(new THREE.CircleGeometry(0.009, 12), new THREE.MeshBasicMaterial({ color: 0x40ff90 })); face.position.set(0, 0.035, 0.0395); arm.add(face);
  }
  return g;
}

export function buildHands(mats) {
  const right = buildFist(mats, { index: false, radius: 0.019, armDir: [0.55, -0.5, 1] });
  const left = buildFist(mats, { radius: 0.026, armDir: [0.5, -0.55, 0.9], watch: true, wrap: 1.05 });
  left.scale.x = -1; // mirror for the left hand (three.js flips face winding for negative scale)
  const open = buildOpenHand(mats, { watch: true });
  open.scale.x = -1;
  const openR = buildOpenHand(mats, {});
  optimize(right, new Set()); optimize(left, new Set()); optimize(open, new Set()); optimize(openR, new Set());
  const r = new THREE.Group(); r.add(right); r.name = 'rhand';
  const l = new THREE.Group(); l.add(left); l.name = 'lhand';
  const lo = new THREE.Group(); lo.add(open); lo.name = 'lhandOpen';
  const ro = new THREE.Group(); ro.add(openR); ro.name = 'rhandOpen';
  for (const h of [r, l, lo, ro]) evenUV(h);
  return { right: r, left: l, leftOpen: lo, rightOpen: ro };
}

// orientation helpers for hand anchors (columns = images of fist local axes in weapon space)
export function basisQuat(xAxis, yAxis, zAxis) {
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...xAxis).normalize(), new THREE.Vector3(...yAxis).normalize(), new THREE.Vector3(...zAxis).normalize());
  return new THREE.Quaternion().setFromRotationMatrix(m);
}
function rhandGrip(x, y, z, tilt = 0.3) {
  // fist +Y along the grip (top forward when tilted), back of hand on +X
  const q = basisQuat([1, 0, 0], [0, Math.cos(tilt), -Math.sin(tilt)], [0, Math.sin(tilt), Math.cos(tilt)]);
  return { pos: new THREE.Vector3(x, y, z), quat: q };
}
function lhandRail(x, y, z, roll = 0.5) {
  // object axis along weapon Z: fist +Y -> weapon -Z (index finger forward)
  // back of the (mirrored) hand faces down-left, fingers wrap up over the right side
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const q = basisQuat([-sr, cr, 0], [0, 0, -1], [-cr, -sr, 0]);
  return { pos: new THREE.Vector3(x, y, z), quat: q };
}

// =============================================================================
// Weapon builders
// =============================================================================
function shellCasing(mats, kind) {
  const g = new THREE.Group();
  if (kind === 'shotgun') { cyl(g, mats.shell, 0.0095, 0.0095, 0.055, 0, 0, 0); cyl(g, mats.brass, 0.0098, 0.0098, 0.014, 0, 0, 0.022); }
  else if (kind === 'big') cyl(g, mats.brass, 0.006, 0.0065, 0.065, 0, 0, 0, 'z', 8);
  else cyl(g, mats.brass, 0.0045, 0.0048, 0.03, 0, 0, 0, 'z', 8);
  return g;
}

// ---- small detail helpers -------------------------------------------------------
function pins(parent, mat, pts, r = 0.003, halfW = 0.0245) {
  // cross pins visible on both sides of a receiver
  for (const [y, z] of pts) for (const s of [-1, 1]) cyl(parent, mat, r, r, 0.003, s * halfW, y, z, 'x', 10);
}
function screws(parent, mat, pts, r = 0.0022) {
  for (const [x, y, z] of pts) { const c = cyl(parent, mat, r, r, 0.0025, x, y, z, 'x', 8); c.position.x += Math.sign(x) * 0.001; }
}
function slotRow(parent, mat, n, x, y, z0, dz, w = 0.004, h = 0.0085, d = 0.026) {
  for (let i = 0; i < n; i++) box(parent, mat, w, h, d, x, y, z0 - i * dz, 0, 0, 0, 0.0015);
}
function ribsAlongMag(parent, mat, curvePts, x, t = 0.0025) {
  // thin raised ribs following a list of [z, y] points (segments)
  for (let i = 0; i < curvePts.length - 1; i++) {
    const [z0, y0] = curvePts[i], [z1, y1] = curvePts[i + 1];
    const len = Math.hypot(z1 - z0, y1 - y0);
    const b = box(parent, mat, t, len, 0.006, x, (y0 + y1) / 2, (z0 + z1) / 2);
    b.rotation.x = Math.atan2(z1 - z0, y1 - y0);
  }
}

function buildAR(m, opt) {
  const root = new THREE.Group(), P = {};
  // ---------------- lower receiver
  prof(root, m.metal, [[0.112, -0.012], [-0.112, -0.012], [-0.122, -0.002], [-0.125, 0.032], [0.13, 0.032], [0.13, 0.01], [0.122, -0.004]], 0.044, 0, 0.003);
  // flared magwell with a beveled front edge
  prof(root, m.metal, [[-0.026, -0.012], [-0.112, -0.012], [-0.119, -0.022], [-0.118, -0.046], [-0.024, -0.046], [-0.022, -0.03]], 0.051, 0, 0.003);
  box(root, m.metal, 0.054, 0.006, 0.09, 0, -0.044, -0.071, 0, 0, 0, 0.002); // flare lip
  pins(root, m.steel, [[0.0, -0.114], [0.012, 0.094]], 0.0032);
  // mag release (right) with fence, bolt catch paddle + selector (left)
  cyl(root, m.steel, 0.0045, 0.0045, 0.004, 0.0255, -0.004, -0.022, 'x', 12);
  box(root, m.metal, 0.004, 0.012, 0.004, 0.025, -0.004, -0.031); box(root, m.metal, 0.004, 0.012, 0.004, 0.025, -0.004, -0.013);
  box(root, m.steel, 0.004, 0.018, 0.009, -0.0255, 0.012, -0.052, 0.25, 0, 0, 0.0015);
  cyl(root, m.steel, 0.0055, 0.0055, 0.004, -0.0255, 0.012, 0.062, 'x', 12);
  box(root, m.steel, 0.003, 0.004, 0.022, -0.0275, 0.012, 0.056, -0.5);
  // trigger guard (flared) + curved trigger
  box(root, m.metal, 0.011, 0.004, 0.066, 0, -0.046, 0.004, 0, 0, 0, 0.0015);
  box(root, m.metal, 0.011, 0.034, 0.005, 0, -0.03, -0.029, 0, 0, 0, 0.0015);
  box(root, m.metal, 0.011, 0.012, 0.006, 0, -0.04, 0.036, -0.6, 0, 0, 0.0015);
  box(root, m.steel, 0.005, 0.014, 0.004, 0, -0.022, 0.006, 0.25, 0, 0, 0.001);
  box(root, m.steel, 0.005, 0.012, 0.004, 0, -0.033, 0.009, 0.6, 0, 0, 0.001);
  // ---------------- upper receiver
  prof(root, m.metal, [[0.125, 0.032], [-0.14, 0.032], [-0.146, 0.04], [-0.146, 0.074], [0.112, 0.074], [0.125, 0.064]], 0.05, 0, 0.003);
  box(root, m.metal, 0.034, 0.007, 0.26, 0, 0.0775, -0.01, 0, 0, 0, 0.0015); // rail riser
  rail(root, m.metal, -0.14, 0.12, 0.081);
  // ejection port + open dust cover + brass deflector + forward assist
  box(root, m.dark, 0.003, 0.017, 0.054, 0.0255, 0.055, -0.03, 0, 0, 0, 0.001);
  const dc = box(root, m.metal, 0.002, 0.016, 0.054, 0.032, 0.041, -0.03, 0, 0, -0.9, 0.0008); void dc;
  box(root, m.metal, 0.008, 0.016, 0.01, 0.029, 0.06, 0.004, 0, -0.35, 0, 0.002);
  cyl(root, m.metal, 0.0075, 0.0075, 0.024, 0.03, 0.047, 0.03, 'z', 12).rotation.y = -0.35;
  cyl(root, m.steel, 0.0068, 0.0068, 0.004, 0.034, 0.047, 0.042, 'z', 12);
  pins(root, m.steel, [[0.044, 0.1]], 0.0026, 0.0255);
  // ---------------- handguard: octagonal M-LOK tube, slots, hand stop, QD cup
  const hg = cyl(root, m.tan, 0.03, 0.03, 0.34, 0, 0.052, -0.315, 'z', 8); hg.rotation.z = Math.PI / 8;
  cyl(root, m.tan, 0.03, 0.027, 0.012, 0, 0.052, -0.491, 'z', 8).rotation.z = Math.PI / 8;
  for (const s of [-1, 1]) slotRow(root, m.dark, 7, s * 0.0287, 0.052, -0.18, 0.042);
  for (const s of [-1, 1]) slotRow(root, m.dark, 6, s * 0.021, 0.031, -0.2, 0.045, 0.004, 0.006, 0.024);
  box(root, m.dark, 0.012, 0.004, 0.3, 0, 0.0225, -0.315);
  rail(root, m.metal, -0.485, -0.145, 0.081, 0.02);
  cyl(root, m.metal, 0.022, 0.024, 0.016, 0, 0.052, -0.14, 'z', 16); // barrel nut
  box(root, m.poly, 0.022, 0.016, 0.026, 0, 0.018, -0.455, 0, 0, 0, 0.004); // hand stop
  cyl(root, m.steel, 0.0065, 0.0065, 0.008, -0.031, 0.052, -0.18, 'x', 12); // QD cup
  // ---------------- barrel + ported compensator
  cyl(root, m.metal, 0.0095, 0.0095, 0.16, 0, 0.052, -0.56, 'z', 14);
  cyl(root, m.metal, 0.0145, 0.0145, 0.06, 0, 0.052, -0.665, 'z', 16);
  cyl(root, m.metal, 0.0145, 0.0125, 0.008, 0, 0.052, -0.699, 'z', 16);
  for (let i = 0; i < 3; i++) {
    box(root, m.dark, 0.022, 0.005, 0.009, 0, 0.0655, -0.648 - i * 0.014);
    for (const s of [-1, 1]) box(root, m.dark, 0.005, 0.016, 0.008, s * 0.0135, 0.052, -0.648 - i * 0.014);
  }
  // ---------------- grip with finger grooves + base cap
  profCurve(root, m.poly, [[0.035, -0.008], [0.092, -0.008], ['q', 0.1, -0.05, 0.118, -0.122], [0.106, -0.136], [0.07, -0.13],
    ['q', 0.064, -0.112, 0.058, -0.104], ['q', 0.066, -0.092, 0.06, -0.08], ['q', 0.053, -0.068, 0.058, -0.058], ['q', 0.048, -0.045, 0.042, -0.03]], 0.032, 0, 0.004);
  box(root, m.poly, 0.033, 0.006, 0.04, 0, -0.134, 0.088, -0.3, 0, 0, 0.002);
  for (let i = 0; i < 4; i++) box(root, m.dark, 0.0335, 0.012, 0.002, 0, -0.03 - i * 0.022, 0.093 + i * 0.006, 0.28);
  // ---------------- buffer tube, castle nut, SOPMOD-style stock
  cyl(root, m.metal, 0.015, 0.015, 0.2, 0, 0.042, 0.22, 'z', 14);
  cyl(root, m.steel, 0.018, 0.018, 0.012, 0, 0.042, 0.134, 'z', 10);
  prof(root, m.poly, [[0.2, 0.072], [0.36, 0.068], [0.37, -0.075], [0.345, -0.08], [0.29, 0.0], [0.2, 0.01]], 0.042, 0, 0.005);
  box(root, m.poly, 0.05, 0.02, 0.12, 0, 0.076, 0.3, 0, 0, 0, 0.006); // cheek riser
  for (const s of [-1, 1]) { cyl(root, m.poly, 0.012, 0.012, 0.11, s * 0.026, 0.03, 0.31, 'z', 12); cyl(root, m.dark, 0.0105, 0.0105, 0.002, s * 0.026, 0.03, 0.2545, 'z', 12); }
  box(root, m.rubber, 0.044, 0.15, 0.016, 0, -0.003, 0.37, 0, 0, 0, 0.004);
  for (let i = 0; i < 5; i++) box(root, m.dark, 0.045, 0.004, 0.002, 0, -0.06 + i * 0.03, 0.379);
  box(root, m.steel, 0.008, 0.006, 0.03, 0, 0.022, 0.25, 0, 0, 0, 0.002); // adjustment lever
  cyl(root, m.steel, 0.006, 0.006, 0.006, -0.022, -0.04, 0.35, 'x', 10);  // rear QD cup
  // ---------------- angled foregrip
  prof(root, m.poly, [[-0.29, 0.02], [-0.38, 0.02], [-0.372, -0.012], [-0.3, -0.045], [-0.285, -0.035]], 0.034, 0, 0.004);
  for (let i = 0; i < 3; i++) box(root, m.dark, 0.035, 0.002, 0.03, 0, -0.012 - i * 0.009, -0.31 - i * 0.004, 0.45);
  // ---------------- charging handle (animated)
  P.charge = group(root, 'charge', 0, 0.074, 0.122);
  box(P.charge, m.metal, 0.05, 0.008, 0.016, 0, 0, 0, 0, 0, 0, 0.002);
  box(P.charge, m.metal, 0.01, 0.006, 0.04, 0, 0, -0.02);
  box(P.charge, m.steel, 0.012, 0.005, 0.01, -0.02, 0.003, 0.002, 0, 0, 0, 0.0015); // latch
  // bolt carrier (moves back on each shot, visible in the port)
  P.bolt = group(root, 'bolt', 0, 0, 0);
  box(P.bolt, m.steel, 0.006, 0.012, 0.03, 0.0255, 0.056, -0.03);
  box(P.bolt, m.dark, 0.0065, 0.002, 0.028, 0.0256, 0.062, -0.03);
  // ---------------- magazine: PMAG-style, ribs, grip texture, flared baseplate (animated)
  P.mag = group(root, 'mag', 0, -0.03, -0.07);
  profCurve(P.mag, m.metal, [[0.036, 0.02], [-0.036, 0.02], ['q', -0.044, -0.09, -0.074, -0.175], [-0.016, -0.19], ['q', 0.018, -0.1, 0.036, 0.02]], 0.026, 0, 0.003);
  for (const s of [-1, 1]) {
    ribsAlongMag(P.mag, m.poly, [[0.024, 0.0], [0.018, -0.07], [0.004, -0.14], [-0.012, -0.178]], s * 0.0135);
    ribsAlongMag(P.mag, m.poly, [[-0.024, 0.0], [-0.034, -0.07], [-0.05, -0.13], [-0.062, -0.17]], s * 0.0135);
    for (let i = 0; i < 4; i++) box(P.mag, m.poly, 0.0025, 0.004, 0.034, s * 0.0137, -0.13 - i * 0.011, -0.03 - i * 0.004, -0.35);
  }
  box(P.mag, m.poly, 0.03, 0.012, 0.065, 0, -0.184, -0.045, 0.35, 0, 0, 0.003);
  box(P.mag, m.poly, 0.032, 0.005, 0.07, 0, -0.192, -0.047, 0.35, 0, 0, 0.002);
  box(P.mag, m.brass, 0.009, 0.005, 0.03, 0, 0.022, 0.0, 0, 0, 0, 0.002); // top round
  // ---------------- iron sights (folded when an optic is fitted)
  const ironUp = opt === 'iron';
  if (ironUp) {
    box(root, m.metal, 0.02, 0.012, 0.03, 0, 0.094, 0.07, 0, 0, 0, 0.002);
    box(root, m.metal, 0.02, 0.022, 0.008, 0, 0.11, 0.075);
    const ring = M(new THREE.TorusGeometry(0.0055, 0.0022, 6, 14), m.metal); place(ring, 0, 0.112, 0.07); root.add(ring);
    box(root, m.metal, 0.012, 0.02, 0.012, 0, 0.094, -0.44);
    box(root, m.metal, 0.003, 0.02, 0.003, 0, 0.109, -0.44);
    box(root, m.metal, 0.003, 0.024, 0.008, 0.008, 0.108, -0.44); box(root, m.metal, 0.003, 0.024, 0.008, -0.008, 0.108, -0.44);
  } else {
    box(root, m.metal, 0.016, 0.012, 0.032, 0, 0.094, -0.44, 0, 0, 0, 0.002);
    box(root, m.metal, 0.014, 0.004, 0.026, 0, 0.1015, -0.44, 0, 0, 0, 0.0015);
  }
  return {
    root, parts: P, ironY: 0.112, railY: 0.0895, opticZ: 0.0,
    anchors: {
      rhand: rhandGrip(0.0, -0.05, 0.072, 0.32), lhand: lhandRail(0, 0.03, -0.33, 0.55),
      muzzle: new THREE.Vector3(0, 0.052, -0.70), eject: new THREE.Vector3(0.03, 0.056, -0.03),
      magGrab: new THREE.Vector3(0.0, -0.13, -0.035), charge: new THREE.Vector3(0.0, 0.074, 0.13),
    },
    casing: 'rifle', sightZ: 0.07, eyeRelief: 0.27,
  };
}

function buildSMG(m, opt) {
  const root = new THREE.Group(), P = {};
  // boxy modern receiver
  prof(root, m.grey, [[0.13, 0.0], [-0.17, 0.0], [-0.2, 0.02], [-0.2, 0.075], [0.11, 0.075], [0.13, 0.055]], 0.052, 0, 0.006);
  box(root, m.metal, 0.044, 0.016, 0.3, 0, 0.083, -0.03, 0, 0, 0, 0.003);
  rail(root, m.metal, -0.19, 0.1, 0.091, 0.02);
  box(root, m.dark, 0.003, 0.016, 0.04, 0.027, 0.06, -0.02);
  // side vents
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) box(root, m.dark, 0.003, 0.03, 0.008, s * 0.0262, 0.04, -0.1 - i * 0.02);
  // shroud + barrel (suppressor look)
  cyl(root, m.metal, 0.019, 0.019, 0.13, 0, 0.045, -0.27, 'z', 16);
  for (let i = 0; i < 5; i++) cyl(root, m.dark, 0.0195, 0.0195, 0.004, 0, 0.045, -0.22 - i * 0.022, 'z', 16);
  cyl(root, m.metal, 0.012, 0.012, 0.02, 0, 0.045, -0.345);
  // grip
  prof(root, m.poly, [[0.045, 0.0], [0.095, 0.0], [0.122, -0.115], [0.106, -0.125], [0.07, -0.12], [0.05, -0.02]], 0.033, 0, 0.005);
  box(root, m.poly, 0.012, 0.004, 0.065, 0, -0.035, 0.015);
  box(root, m.steel, 0.005, 0.02, 0.005, 0, -0.016, 0.02, 0.3);
  // vertical foregrip
  cyl(root, m.poly, 0.015, 0.017, 0.085, 0, -0.04, -0.15, 'y', 12);
  // folding stock (wire)
  cyl(root, m.metal, 0.006, 0.006, 0.22, 0.02, 0.05, 0.22); cyl(root, m.metal, 0.006, 0.006, 0.22, -0.02, 0.05, 0.22);
  box(root, m.rubber, 0.05, 0.11, 0.015, 0, 0.02, 0.33, 0, 0, 0, 0.004);
  // charging handle (side)
  P.charge = group(root, 'charge', -0.03, 0.06, -0.12);
  box(P.charge, m.metal, 0.018, 0.01, 0.012, 0, 0, 0, 0, 0, 0, 0.002);
  P.bolt = group(root, 'bolt', 0, 0, 0);
  box(P.bolt, m.steel, 0.005, 0.012, 0.025, 0.026, 0.06, -0.02);
  // straight magazine
  P.mag = group(root, 'mag', 0, 0.0, -0.065);
  prof(P.mag, m.metal, [[0.022, 0.0], [-0.022, 0.0], [-0.03, -0.16], [0.016, -0.16]], 0.024, 0, 0.003);
  box(P.mag, m.poly, 0.028, 0.012, 0.05, 0, -0.164, -0.007, 0, 0, 0, 0.003);
  // iron sights
  if (opt === 'iron') {
    box(root, m.metal, 0.02, 0.016, 0.012, 0, 0.1, 0.07); box(root, m.dark, 0.006, 0.008, 0.013, 0, 0.106, 0.07);
    box(root, m.metal, 0.004, 0.018, 0.006, 0, 0.1, -0.17); box(root, m.metal, 0.02, 0.006, 0.01, 0, 0.094, -0.17);
  }

  // ---- detail pass: side rails, pins, controls, mag witness holes, stock hinge, grip rings
  for (const sx of [-1, 1]) {
    box(root, m.metal, 0.006, 0.012, 0.085, sx * 0.0215, 0.045, -0.275, 0, 0, 0, 0.0015);
    for (let i = 0; i < 7; i++) box(root, m.metal, 0.009, 0.0035, 0.005, sx * 0.0225, 0.045, -0.24 - i * 0.011);
  }
  pins(root, m.steel, [[0.03, -0.155], [0.03, 0.085], [0.062, 0.02]], 0.0031, 0.0265);
  cyl(root, m.steel, 0.006, 0.006, 0.004, -0.0275, 0.03, 0.052, 'x', 12);
  box(root, m.steel, 0.003, 0.004, 0.02, -0.03, 0.03, 0.046, 0.6, 0, 0, 0.001);
  cyl(root, m.steel, 0.0045, 0.0045, 0.004, 0.0275, 0.012, -0.03, 'x', 10);
  box(root, m.metal, 0.008, 0.014, 0.01, 0.029, 0.066, 0.004, 0, -0.3, 0, 0.002);
  for (let i = 0; i < 6; i++) box(root, m.dark, 0.014, 0.003, 0.006, 0, 0.0645, -0.215 - i * 0.02);
  box(root, m.metal, 0.054, 0.032, 0.024, 0, 0.05, 0.12, 0, 0, 0, 0.004);
  cyl(root, m.steel, 0.006, 0.006, 0.058, 0, 0.05, 0.12, 'x', 10);
  for (let i = 0; i < 4; i++) cyl(root, m.dark, 0.0172, 0.0172, 0.003, 0, -0.012 - i * 0.017, -0.15, 'y', 12);
  cyl(root, m.steel, 0.0125, 0.0125, 0.006, 0, 0.045, -0.357, 'z', 14);
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) cyl(P.mag, m.dark, 0.0028, 0.0028, 0.002, sx * 0.0122, -0.03 - i * 0.03, -0.006 - i * 0.0012, 'x', 8);
  for (const sx of [-1, 1]) box(P.mag, m.metal, 0.0025, 0.13, 0.004, sx * 0.0122, -0.08, 0.01, 0.05);

  return {
    root, parts: P, ironY: 0.109, railY: 0.0985, opticZ: -0.02,
    anchors: {
      rhand: rhandGrip(0, -0.045, 0.082, 0.33), lhand: lhandRail(0, -0.055, -0.15, 0.0),
      muzzle: new THREE.Vector3(0, 0.045, -0.36), eject: new THREE.Vector3(0.03, 0.06, -0.02),
      magGrab: new THREE.Vector3(0, -0.11, -0.005), charge: new THREE.Vector3(-0.04, 0.06, -0.12),
    },
    casing: 'pistol', sightZ: 0.07, eyeRelief: 0.23, lhandVertical: true,
  };
}

function buildLMG(m, opt) {
  const root = new THREE.Group(), P = {};
  box(root, m.metal, 0.064, 0.075, 0.36, 0, 0.035, -0.02, 0, 0, 0, 0.006);
  rail(root, m.metal, -0.16, 0.13, 0.0725, 0.022);
  // feed cover (animated)
  P.cover = group(root, 'cover', 0, 0.075, 0.13);
  box(P.cover, m.metal, 0.06, 0.018, 0.2, 0, 0.004, -0.1, 0, 0, 0, 0.004);
  // heavy barrel with cooling ribs + carry handle
  cyl(root, m.metal, 0.03, 0.03, 0.2, 0, 0.035, -0.3, 'z', 10);
  for (let i = 0; i < 6; i++) cyl(root, m.dark, 0.031, 0.031, 0.006, 0, 0.035, -0.22 - i * 0.03, 'z', 10);
  cyl(root, m.metal, 0.012, 0.012, 0.3, 0, 0.035, -0.55);
  cyl(root, m.metal, 0.018, 0.016, 0.07, 0, 0.035, -0.73, 'z', 8);
  box(root, m.metal, 0.012, 0.012, 0.12, 0.03, 0.09, -0.33); box(root, m.metal, 0.012, 0.05, 0.012, 0.03, 0.065, -0.28); box(root, m.metal, 0.012, 0.05, 0.012, 0.03, 0.065, -0.38);
  // folded bipod
  for (const s of [-1, 1]) cyl(root, m.metal, 0.005, 0.005, 0.22, s * 0.012, -0.0, -0.52, 'z', 6);
  // grip, trigger
  prof(root, m.poly, [[0.04, -0.002], [0.095, -0.002], [0.125, -0.12], [0.11, -0.13], [0.072, -0.125], [0.047, -0.025]], 0.034, 0, 0.004);
  box(root, m.metal, 0.012, 0.004, 0.07, 0, -0.04, 0.005);
  // stock
  prof(root, m.od, [[0.16, 0.07], [0.42, 0.06], [0.43, -0.09], [0.4, -0.095], [0.3, -0.03], [0.16, -0.0]], 0.045, 0, 0.006);
  // handguard bottom (where the left hand holds)
  box(root, m.od, 0.05, 0.035, 0.17, 0, 0.0, -0.26, 0, 0, 0, 0.006);
  P.bolt = group(root, 'bolt', 0, 0, 0);
  box(P.bolt, m.steel, 0.006, 0.014, 0.03, 0.033, 0.035, -0.04);
  // box magazine (left side, under)
  P.mag = group(root, 'mag', 0, -0.0, -0.08);
  box(P.mag, m.od, 0.07, 0.12, 0.1, -0.012, -0.065, 0, 0, 0, 0, 0.006);
  box(P.mag, m.dark, 0.06, 0.005, 0.07, -0.012, -0.12, 0.0);
  box(P.mag, m.metal, 0.004, 0.04, 0.03, 0.024, -0.03, 0.0);
  P.belt = group(P.mag, 'belt', 0, 0, 0);
  for (let i = 0; i < 4; i++) cyl(P.belt, m.brass, 0.0055, 0.0055, 0.045, 0.012 + i * 0.01, -0.0, -0.01, 'x', 6);
  if (opt === 'iron') {
    box(root, m.metal, 0.02, 0.02, 0.012, 0, 0.088, 0.1); box(root, m.dark, 0.006, 0.01, 0.013, 0, 0.094, 0.1);
    box(root, m.metal, 0.004, 0.03, 0.006, 0, 0.068, -0.6);
  }

  // ---- detail pass: receiver rivets, cover latch, carry handle grip, deployed-ready bipod, gas tube
  for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) for (const y of [0.012, 0.058]) cyl(root, m.steel, 0.0026, 0.0026, 0.003, sx * 0.0325, y, -0.16 + i * 0.055, 'x', 8);
  box(root, m.steel, 0.02, 0.008, 0.012, 0, 0.088, 0.128, 0, 0, 0, 0.002);
  cyl(root, m.poly, 0.009, 0.009, 0.1, 0.03, 0.1, -0.33, 'z', 10);
  for (const sx of [-1, 1]) {
    box(root, m.metal, 0.008, 0.008, 0.012, sx * 0.012, -0.004, -0.52, 0, 0, 0, 0.002);
    box(root, m.rubber, 0.012, 0.006, 0.02, sx * 0.012, -0.004, -0.635, 0, 0, 0, 0.002);
  }
  cyl(root, m.metal, 0.006, 0.006, 0.22, 0, 0.012, -0.42, 'z', 10);
  box(root, m.metal, 0.018, 0.016, 0.02, 0, 0.018, -0.53, 0, 0, 0, 0.003);
  box(root, m.rubber, 0.047, 0.16, 0.018, 0, -0.012, 0.43, 0, 0, 0, 0.004);
  box(root, m.poly, 0.05, 0.024, 0.14, 0, 0.074, 0.33, 0, 0, 0, 0.006);
  box(P.mag, m.steel, 0.05, 0.006, 0.012, -0.012, -0.002, 0.045, 0, 0, 0, 0.002);
  box(P.mag, m.rubber, 0.03, 0.008, 0.008, -0.012, -0.128, 0.0, 0, 0, 0, 0.002);
  for (let i = 0; i < 3; i++) box(P.mag, m.dark, 0.072, 0.002, 0.004, -0.012, -0.03 - i * 0.03, -0.051);

  return {
    root, parts: P, ironY: 0.096, railY: 0.0795, opticZ: 0.0,
    anchors: {
      rhand: rhandGrip(0, -0.05, 0.08, 0.32), lhand: lhandRail(0, -0.005, -0.26, 0.35),
      muzzle: new THREE.Vector3(0, 0.035, -0.77), eject: new THREE.Vector3(0.035, 0.035, -0.04),
      magGrab: new THREE.Vector3(-0.012, -0.08, 0), charge: new THREE.Vector3(0.0, 0.1, 0.05),
    },
    casing: 'rifle', sightZ: 0.1, eyeRelief: 0.25,
  };
}

function buildDMR(m, opt) {
  const root = new THREE.Group(), P = {};
  // wood stock and handguard, steel receiver
  prof(root, m.wood, [[0.4, 0.045], [0.12, 0.04], [0.06, 0.0], [0.04, -0.02], [-0.42, -0.012], [-0.42, 0.035], [0.12, 0.06], [0.4, 0.06]], 0.046, 0, 0.006);
  prof(root, m.wood, [[0.04, -0.02], [0.1, -0.02], [0.13, -0.12], [0.11, -0.13], [0.08, -0.12], [0.055, -0.03]], 0.034, 0, 0.004);
  prof(root, m.wood, [[0.43, 0.06], [0.24, 0.05], [0.18, -0.02], [0.25, -0.075], [0.43, -0.09]], 0.044, 0, 0.006);
  box(root, m.rubber, 0.046, 0.15, 0.016, 0, -0.012, 0.432, 0, 0, 0, 0.004);
  box(root, m.metal, 0.044, 0.04, 0.24, 0, 0.065, -0.03, 0, 0, 0, 0.004);
  rail(root, m.metal, -0.14, 0.08, 0.085, 0.021);
  box(root, m.dark, 0.003, 0.018, 0.06, 0.023, 0.065, -0.02);
  cyl(root, m.metal, 0.011, 0.011, 0.3, 0, 0.055, -0.55);
  cyl(root, m.metal, 0.016, 0.016, 0.07, 0, 0.055, -0.72, 'z', 10);
  for (let i = 0; i < 3; i++) box(root, m.dark, 0.034, 0.006, 0.01, 0, 0.065, -0.7 - i * 0.016);
  box(root, m.metal, 0.012, 0.004, 0.06, 0, -0.04, 0.005);
  P.charge = group(root, 'charge', 0.03, 0.065, -0.02);
  box(P.charge, m.steel, 0.02, 0.01, 0.012, 0, 0, 0, 0, 0, 0, 0.002);
  P.bolt = group(root, 'bolt', 0, 0, 0);
  box(P.bolt, m.steel, 0.006, 0.014, 0.03, 0.021, 0.065, -0.02);
  P.mag = group(root, 'mag', 0, -0.012, -0.06);
  prof(P.mag, m.metal, [[0.03, 0.0], [-0.03, 0.0], [-0.034, -0.12], [0.026, -0.12]], 0.03, 0, 0.003);
  box(P.mag, m.metal, 0.034, 0.012, 0.064, 0, -0.123, -0.004, 0, 0, 0, 0.003);
  if (opt === 'iron') {
    box(root, m.metal, 0.02, 0.02, 0.012, 0, 0.1, 0.08); box(root, m.dark, 0.006, 0.01, 0.013, 0, 0.105, 0.08);
    box(root, m.metal, 0.004, 0.028, 0.006, 0, 0.082, -0.66);
  }

  // ---- detail pass: steel fittings on the wood furniture
  cyl(root, m.steel, 0.026, 0.026, 0.014, 0, 0.03, -0.41, 'z', 14);
  cyl(root, m.metal, 0.007, 0.007, 0.18, 0, 0.033, -0.5, 'z', 10);
  box(root, m.metal, 0.02, 0.022, 0.02, 0, 0.042, -0.6, 0, 0, 0, 0.003);
  for (const sx of [-1, 1]) for (const z of [0.3, 0.36]) cyl(root, m.steel, 0.003, 0.003, 0.002, sx * 0.0225, 0.0, z, 'x', 8);
  box(root, m.steel, 0.048, 0.15, 0.004, 0, -0.012, 0.442, 0, 0, 0, 0.002);
  cyl(root, m.steel, 0.006, 0.006, 0.012, 0, -0.025, -0.36, 'y', 10);
  cyl(root, m.steel, 0.006, 0.006, 0.012, 0, -0.07, 0.36, 'y', 10);
  box(root, m.steel, 0.006, 0.01, 0.02, 0.0, -0.032, -0.03, 0, 0, 0, 0.002);
  pins(root, m.steel, [[0.065, 0.05], [0.065, -0.11]], 0.0028, 0.023);
  for (const sx of [-1, 1]) box(P.mag, m.metal, 0.0022, 0.1, 0.006, sx * 0.0152, -0.06, 0.0, 0.03);

  return {
    root, parts: P, ironY: 0.108, railY: 0.0935, opticZ: -0.03,
    anchors: {
      rhand: rhandGrip(0, -0.06, 0.085, 0.3), lhand: lhandRail(0, 0.02, -0.3, 0.55),
      muzzle: new THREE.Vector3(0, 0.055, -0.76), eject: new THREE.Vector3(0.03, 0.065, -0.02),
      magGrab: new THREE.Vector3(0, -0.08, 0), charge: new THREE.Vector3(0.04, 0.065, -0.02),
    },
    casing: 'big', sightZ: 0.08, eyeRelief: 0.27,
  };
}

function buildSniper(m) {
  const root = new THREE.Group(), P = {};
  // chassis (tan) with thumbhole stock
  prof(root, m.tan, [[0.46, 0.06], [0.28, 0.05], [0.2, 0.0], [0.12, 0.0], [0.1, -0.02], [-0.36, -0.02], [-0.36, 0.035], [0.12, 0.045], [0.3, 0.072], [0.46, 0.075]], 0.05, 0, 0.006);
  prof(root, m.tan, [[0.46, 0.075], [0.47, -0.1], [0.43, -0.1], [0.35, -0.03], [0.28, -0.035], [0.22, 0.0], [0.28, 0.05]], 0.044, 0, 0.006);
  prof(root, m.tan, [[0.06, -0.01], [0.12, -0.01], [0.15, -0.13], [0.13, -0.14], [0.095, -0.13], [0.07, -0.03]], 0.034, 0, 0.004);
  box(root, m.rubber, 0.046, 0.18, 0.018, 0, -0.012, 0.475, 0, 0, 0, 0.004);
  // receiver + long fluted barrel + brake
  cyl(root, m.metal, 0.022, 0.022, 0.26, 0, 0.055, -0.02, 'z', 16);
  cyl(root, m.metal, 0.014, 0.012, 0.5, 0, 0.055, -0.6, 'z', 12);
  cyl(root, m.metal, 0.02, 0.02, 0.08, 0, 0.055, -0.88, 'z', 10);
  for (let i = 0; i < 3; i++) box(root, m.dark, 0.042, 0.007, 0.012, 0, 0.06, -0.86 - i * 0.02);
  box(root, m.metal, 0.012, 0.004, 0.06, 0, -0.038, 0.03);
  rail(root, m.metal, -0.12, 0.1, 0.077, 0.022);
  // bolt (animated): handle on the right
  P.bolt = group(root, 'bolt', 0, 0.055, 0.075);
  cyl(P.bolt, m.steel, 0.0105, 0.0105, 0.11, 0, 0, 0.0, 'z', 10);
  P.boltHandle = group(P.bolt, 'boltHandle', 0, 0, 0.03);
  cyl(P.boltHandle, m.steel, 0.005, 0.005, 0.06, 0.03, -0.01, 0, 'x', 8);
  const knob = M(new THREE.SphereGeometry(0.011, 10, 8), m.steel); place(knob, 0.062, -0.012, 0); P.boltHandle.add(knob);
  P.mag = group(root, 'mag', 0, -0.02, -0.03);
  box(P.mag, m.poly, 0.034, 0.07, 0.085, 0, -0.03, 0, 0, 0, 0, 0.004);

  // ---- detail pass: chassis cutouts, M-LOK slots, bolt shroud, monopod, scope ring screws
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) box(root, m.dark, 0.003, 0.016, 0.05, sx * 0.0252, 0.012, -0.08 - i * 0.07, 0, 0, 0, 0.004);
  for (let i = 0; i < 4; i++) box(root, m.dark, 0.014, 0.003, 0.03, 0, -0.0215, -0.12 - i * 0.055, 0, 0, 0, 0.0012);
  cyl(root, m.metal, 0.016, 0.016, 0.03, 0, 0.055, 0.15, 'z', 14);
  box(root, m.metal, 0.014, 0.014, 0.022, 0, -0.03, -0.34, 0, 0, 0, 0.002);
  cyl(root, m.metal, 0.007, 0.007, 0.06, 0, -0.08, 0.4, 'y', 10);
  box(root, m.rubber, 0.02, 0.008, 0.02, 0, -0.112, 0.4, 0, 0, 0, 0.002);
  for (const z of [0.3, 0.37]) cyl(root, m.steel, 0.007, 0.007, 0.004, 0.024, 0.06, z, 'x', 10);
  for (const dz of [-0.06, 0.06]) for (const sx of [-1, 1]) box(root, m.steel, 0.004, 0.006, 0.006, sx * 0.0125, 0.073, dz, 0, 0, 0, 0.001);
  box(root, m.metal, 0.03, 0.006, 0.07, 0, -0.054, -0.03, 0, 0, 0, 0.002);

  return {
    root, parts: P, ironY: 0.1, railY: 0.0855, opticZ: 0.0,
    anchors: {
      rhand: rhandGrip(0, -0.055, 0.11, 0.25), lhand: lhandRail(0, 0.01, -0.28, 0.6),
      muzzle: new THREE.Vector3(0, 0.055, -0.93), eject: new THREE.Vector3(0.03, 0.06, 0.0),
      magGrab: new THREE.Vector3(0, -0.06, 0), charge: new THREE.Vector3(0.062, 0.043, 0.105),
    },
    casing: 'big', sightZ: 0.12, eyeRelief: 0.15, fixedOptic: 'sniper',
  };
}

function buildShotgun(m, opt) {
  const root = new THREE.Group(), P = {};
  box(root, m.metal, 0.044, 0.06, 0.2, 0, 0.04, -0.03, 0, 0, 0, 0.005);
  box(root, m.dark, 0.003, 0.025, 0.07, 0.023, 0.045, -0.04);
  rail(root, m.metal, -0.12, 0.06, 0.07, 0.02);
  // stock + grip in one (polymer)
  prof(root, m.od, [[0.07, 0.06], [0.4, 0.04], [0.41, -0.11], [0.38, -0.115], [0.2, -0.04], [0.12, -0.12], [0.095, -0.13], [0.06, -0.01]], 0.044, 0, 0.006);
  box(root, m.rubber, 0.046, 0.16, 0.018, 0, -0.03, 0.408, 0, 0, 0, 0.004);
  // barrel over tube magazine
  cyl(root, m.metal, 0.012, 0.012, 0.5, 0, 0.055, -0.38);
  cyl(root, m.metal, 0.011, 0.011, 0.42, 0, 0.022, -0.34);
  cyl(root, m.metal, 0.014, 0.014, 0.02, 0, 0.022, -0.55);
  box(root, m.metal, 0.012, 0.004, 0.06, 0, -0.012, 0.0);
  // pump (animated)
  P.pump = group(root, 'pump', 0, 0.022, -0.27);
  cyl(P.pump, m.od, 0.022, 0.022, 0.14, 0, 0, 0, 'z', 12);
  for (let i = 0; i < 6; i++) cyl(P.pump, m.dark, 0.0225, 0.0225, 0.005, 0, 0, -0.05 + i * 0.02, 'z', 12);
  P.bolt = group(root, 'bolt', 0, 0, 0);
  box(P.bolt, m.steel, 0.004, 0.02, 0.05, 0.022, 0.045, -0.04);
  P.shellHand = group(root, 'shell', 0, 0, 0);
  const sh = shellCasing(m, 'shotgun'); P.shellHand.add(sh); P.shellHand.visible = false;
  if (opt === 'iron') {
    const bead = M(new THREE.SphereGeometry(0.004, 8, 6), m.brass); place(bead, 0, 0.071, -0.62); root.add(bead);
    box(root, m.metal, 0.004, 0.006, 0.4, 0, 0.068, -0.42);
    box(root, m.metal, 0.018, 0.01, 0.01, 0, 0.074, 0.04); box(root, m.dark, 0.005, 0.006, 0.011, 0, 0.078, 0.04);
  }

  // ---- detail pass: side saddle with shells, ventilated heat shield, pins and controls
  box(root, m.poly, 0.006, 0.03, 0.09, -0.025, 0.04, -0.03, 0, 0, 0, 0.002);
  for (let i = 0; i < 4; i++) { cyl(root, m.shell, 0.0092, 0.0092, 0.05, -0.034, 0.04, -0.065 + i * 0.022, 'y', 10); cyl(root, m.brass, 0.0095, 0.0095, 0.012, -0.034, 0.061, -0.065 + i * 0.022, 'y', 10); }
  box(root, m.metal, 0.03, 0.012, 0.38, 0, 0.07, -0.38, 0, 0, 0, 0.003);
  for (let i = 0; i < 9; i++) for (const sx of [-1, 1]) box(root, m.dark, 0.003, 0.006, 0.022, sx * 0.0145, 0.07, -0.22 - i * 0.038, 0, 0, 0, 0.0015);
  pins(root, m.steel, [[0.03, 0.04], [0.03, -0.1]], 0.003, 0.0225);
  cyl(root, m.steel, 0.005, 0.005, 0.016, 0, 0.0, 0.05, 'x', 10);
  cyl(root, m.steel, 0.0075, 0.0075, 0.03, 0, 0.022, -0.565, 'z', 12);
  box(root, m.steel, 0.006, 0.012, 0.012, 0, 0.006, -0.57, 0, 0, 0, 0.002);

  return {
    root, parts: P, ironY: 0.074, railY: 0.0775, opticZ: -0.03,
    anchors: {
      rhand: rhandGrip(0, -0.06, 0.1, 0.45), lhand: lhandRail(0, 0.015, -0.27, 0.4),
      muzzle: new THREE.Vector3(0, 0.055, -0.64), eject: new THREE.Vector3(0.03, 0.045, -0.04),
      magGrab: new THREE.Vector3(0, -0.02, -0.06), charge: new THREE.Vector3(0, 0.0, -0.06),
    },
    casing: 'shotgun', sightZ: 0.04, eyeRelief: 0.28, pumpTravel: 0.08,
  };
}

function buildPistol(m, opt, variant) {
  const root = new THREE.Group(), P = {};
  const auto = variant === 'auto';
  // frame + grip
  const frame = auto ? m.poly : m.tan;
  prof(root, frame, [[0.04, 0.0], [-0.12, 0.0], [-0.13, 0.015], [0.05, 0.015]], 0.03, 0, 0.003);
  prof(root, frame, [[0.0, 0.0], [0.05, 0.0], [0.072, -0.105], [0.06, -0.112], [0.03, -0.11], [0.012, -0.01]], 0.031, 0, 0.004);
  box(root, m.poly, 0.012, 0.004, 0.045, 0, -0.018, -0.018);
  box(root, m.poly, 0.012, 0.02, 0.004, 0, -0.008, -0.04);
  box(root, m.steel, 0.005, 0.016, 0.005, 0, -0.006, -0.012, 0.2);
  // slide (animated)
  P.slide = group(root, 'slide', 0, 0, 0);
  box(P.slide, m.metal, 0.028, 0.03, 0.185, 0, 0.03, -0.035, 0, 0, 0, 0.003);
  for (let i = 0; i < 6; i++) box(P.slide, m.dark, 0.0285, 0.018, 0.003, 0, 0.03, 0.035 + i * 0.008 - 0.02);
  box(P.slide, m.dark, 0.003, 0.012, 0.03, 0.0142, 0.034, -0.05);
  box(P.slide, m.metal, 0.012, 0.008, 0.006, 0, 0.048, 0.05);
  box(P.slide, m.dark, 0.004, 0.006, 0.0065, 0, 0.049, 0.05);
  box(P.slide, m.metal, 0.003, 0.009, 0.006, 0, 0.049, -0.12);
  const dot = M(new THREE.SphereGeometry(0.0016, 6, 4), m.emissiveRed); place(dot, 0, 0.052, -0.118); P.slide.add(dot);
  cyl(root, m.metal, 0.0065, 0.0065, 0.02, 0, 0.03, -0.13);
  if (auto) {
    // compensator + selector
    cyl(root, m.metal, 0.013, 0.013, 0.04, 0, 0.03, -0.15, 'z', 10);
    box(root, m.dark, 0.027, 0.004, 0.008, 0, 0.044, -0.15);
    box(root, m.steel, 0.006, 0.008, 0.012, -0.016, 0.03, 0.03);
  }
  P.mag = group(root, 'mag', 0, -0.0, 0.03);
  prof(P.mag, m.metal, [[-0.016, -0.0], [0.016, -0.0], [0.036, auto ? -0.16 : -0.104], [0.004, auto ? -0.16 : -0.104]], 0.026, 0, 0.002);
  box(P.mag, m.poly, 0.03, 0.012, 0.04, 0, auto ? -0.163 : -0.108, 0.02, 0.2, 0, 0, 0.003);

  // ---- detail pass: accessory rail, slide stop, takedown lever, front serrations, barrel hood, beavertail
  for (let i = 0; i < 3; i++) box(root, m.dark, 0.0305, 0.004, 0.006, 0, -0.002, -0.07 - i * 0.017);
  box(root, m.steel, 0.003, 0.006, 0.028, -0.0158, 0.016, -0.02, 0, 0, 0, 0.001);
  box(root, m.steel, 0.003, 0.004, 0.012, -0.0158, 0.012, -0.055, 0, 0, 0, 0.001);
  box(root, frame, 0.03, 0.01, 0.018, 0, 0.004, 0.056, -0.35, 0, 0, 0.003);
  for (let i = 0; i < 4; i++) box(P.slide, m.dark, 0.0285, 0.016, 0.0025, 0, 0.03, -0.1 - i * 0.007);
  box(P.slide, m.steel, 0.014, 0.004, 0.026, 0, 0.0455, -0.05, 0, 0, 0, 0.001);
  box(P.slide, m.steel, 0.002, 0.004, 0.012, 0.0145, 0.04, -0.03);

  return {
    root, parts: P, ironY: 0.0525, railY: 0.045, opticZ: 0.0,
    anchors: {
      rhand: rhandGrip(0, -0.04, 0.032, 0.32), lhand: null,
      muzzle: new THREE.Vector3(0, 0.03, auto ? -0.17 : -0.14), eject: new THREE.Vector3(0.02, 0.04, -0.03),
      magGrab: new THREE.Vector3(0, -0.06, 0.02), charge: new THREE.Vector3(0.0, 0.04, 0.03),
    },
    casing: 'pistol', sightZ: 0.05, eyeRelief: 0.3, pistol: true,
  };
}

function buildRevolver(m) {
  const root = new THREE.Group(), P = {};
  prof(root, m.steel, [[0.05, 0.0], [-0.04, 0.0], [-0.05, 0.02], [-0.05, 0.06], [0.03, 0.065], [0.05, 0.05]], 0.032, 0, 0.004);
  prof(root, m.wood, [[0.012, 0.0], [0.05, 0.0], [0.082, -0.1], [0.07, -0.11], [0.035, -0.108], [0.018, -0.01]], 0.034, 0, 0.006);
  cyl(root, m.steel, 0.011, 0.011, 0.18, 0, 0.05, -0.14, 'z', 12);
  box(root, m.steel, 0.012, 0.016, 0.18, 0, 0.062, -0.14, 0, 0, 0, 0.002);
  box(root, m.steel, 0.004, 0.012, 0.01, 0, 0.074, -0.225);
  box(root, m.steel, 0.012, 0.004, 0.04, 0, -0.016, -0.005);
  box(root, m.steel, 0.008, 0.016, 0.012, 0, 0.068, 0.045, -0.4);
  cyl(root, m.steel, 0.004, 0.004, 0.06, 0, 0.02, -0.07, 'z', 6);
  // cylinder (animated: swings out to the left)
  P.cylArm = group(root, 'cylArm', -0.012, 0.012, -0.03);
  P.cyl = group(P.cylArm, 'cylinder', 0.012, 0.022, 0);
  cyl(P.cyl, m.steel, 0.02, 0.02, 0.05, 0, 0, 0, 'z', 12);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; box(P.cyl, m.dark, 0.006, 0.006, 0.052, Math.cos(a) * 0.0205, Math.sin(a) * 0.0205, 0); }
  P.rounds = group(P.cyl, 'rounds', 0, 0, 0);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.52; cyl(P.rounds, m.brass, 0.0045, 0.0045, 0.008, Math.cos(a) * 0.0115, Math.sin(a) * 0.0115, 0.026, 'z', 6); }
  P.mag = group(root, 'speedloader', 0, 0, 0); P.mag.visible = false;
  cyl(P.mag, m.dark, 0.016, 0.016, 0.02, 0, 0, 0.02, 'z', 10);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; cyl(P.mag, m.brass, 0.0045, 0.004, 0.03, Math.cos(a) * 0.0115, Math.sin(a) * 0.0115, -0.01, 'z', 6); }

  // ---- detail pass: hammer spur, cylinder latch, grip screw & medallion, sight insert
  box(root, m.steel, 0.008, 0.008, 0.016, 0, 0.078, 0.052, -0.6, 0, 0, 0.002);
  for (let i = 0; i < 3; i++) box(root, m.dark, 0.0085, 0.0015, 0.004, 0, 0.083 - i * 0.002, 0.048 + i * 0.004, -0.6);
  box(root, m.steel, 0.004, 0.008, 0.014, -0.0175, 0.04, 0.01, 0, 0, 0, 0.0015);
  cyl(root, m.steel, 0.0032, 0.0032, 0.036, 0, -0.05, 0.05, 'x', 10);
  cyl(root, m.brass, 0.006, 0.006, 0.002, 0.0175, -0.065, 0.054, 'x', 12);
  box(root, m.emissiveRed, 0.0025, 0.004, 0.003, 0, 0.081, -0.225);
  box(root, m.dark, 0.004, 0.004, 0.006, 0, 0.072, 0.04);

  return {
    root, parts: P, ironY: 0.08, railY: 0.07, opticZ: 0.0,
    anchors: {
      rhand: rhandGrip(0, -0.04, 0.04, 0.4), lhand: null,
      muzzle: new THREE.Vector3(0, 0.05, -0.235), eject: new THREE.Vector3(-0.02, 0.035, -0.03),
      magGrab: new THREE.Vector3(0, 0, 0), charge: new THREE.Vector3(0, 0.07, 0.045),
    },
    casing: 'pistol', sightZ: 0.045, eyeRelief: 0.3, pistol: true, revolver: true,
  };
}

const BUILDERS = {
  ar: buildAR, smg: buildSMG, lmg: buildLMG, dmr: buildDMR, sniper: buildSniper, shotgun: buildShotgun,
  pistol: (m, o) => buildPistol(m, o), mpistol: (m, o) => buildPistol(m, o, 'auto'), revolver: buildRevolver,
};

// Build a complete weapon model with optic. Returns model description.
export function buildWeapon(modelId, optic, mats, { merge = true } = {}) {
  const w = BUILDERS[modelId](mats, optic || 'iron');
  const opt = w.fixedOptic || optic;
  w.sightY = w.ironY;
  w.zoom = w.pistol ? 1.15 : 1.2;
  w.optic = null;
  if (opt && opt !== 'iron') {
    const o = buildOptic(opt, mats, w.railY, w.opticZ);
    if (o) {
      w.root.add(o.group);
      w.optic = o;
      w.sightY = o.sightY;
      w.zoom = o.zoom;
      if (o.eyeRelief) w.eyeRelief = o.eyeRelief;
      // keep the optic's z so the eye sits behind the glass
      w.sightZ = Math.max(w.sightZ, w.opticZ + 0.05);
    }
  }
  w.casingModel = shellCasing(mats, w.casing);
  if (merge) {
    const keep = new Set(Object.values(w.parts));
    if (w.optic) keep.add(w.optic.group);
    optimize(w.root, keep);
    if (w.optic) {
      // merge optic statics separately (it's a kept group because it contains PIP/reticle meshes)
      const kp = new Set();
      optimize(w.optic.group, kp);
    }
  }
  evenUV(w.root);
  return w;
}
