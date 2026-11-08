import * as THREE from 'three';
import { box as vmBox } from './models.js';

// =============================================================================
// Arms as one skin over bones each, as the soldiers are: the glove over the hand, bending at every joint of the
// fingers rather than tubes put together, and the sleeve over the forearm and the upper arm, bending at the elbow.
// The hand is placed first (whatever moves it), then the arm behind it with `reachArm`: the elbow where an arm of that
// length has to be, the forearm turned with the hand. Used for the hands at the bomb (Search and Destroy) and for
// the fists (Warzone, an empty slot).
// =============================================================================
const sm = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _fw = new THREE.Vector3();
const _h1 = new THREE.Vector3(), _h2 = new THREE.Vector3(), _h3 = new THREE.Vector3(), _hm = new THREE.Matrix4();
const _w = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _el = new THREE.Vector3();
// the wrist (the hand turns about it), the forearm from it to the elbow, the upper arm
export const ARM = { wrist: new THREE.Vector3(0, 0.003, 0.05), fore: 0.27, upper: 0.29 };
// the fingers: the knuckle (x across the hand, thumb side -, y, z), the three bones' lengths, half the width at the
// knuckle, how far the finger points out toward the thumb side straight and bent
const FING = [
  [-0.0285, -0.001, -0.046, [0.043, 0.026, 0.021], 0.0107, 0.04, 0.02],
  [-0.0095, 0.0005, -0.05, [0.047, 0.029, 0.022], 0.011, 0.0, 0.01],
  [0.0095, -0.0005, -0.048, [0.044, 0.028, 0.021], 0.0104, -0.03, 0.03],
  [0.0275, -0.003, -0.041, [0.035, 0.022, 0.019], 0.0094, -0.07, 0.06],
];
// the thumb: from the ball of the hand by the wrist, out and down toward the palm, turned to face the fingers
const THUMB = { at: [-0.027, -0.006, 0.016], L: [0.032, 0.028, 0.023], r: 0.0148, pitch: -0.25, yaw: 0.5, roll: 0.8 };
// A skin under construction: rings round a centre line, each ring's points on the bones it follows.
class Skin {
  constructor() { this.p = []; this.uv = []; this.si = []; this.sw = []; this.ix = []; }
  v(x, y, z, u, w, sk) {
    const n = this.p.length / 3;
    this.p.push(x, y, z); this.uv.push(u, w);
    for (let k = 0; k < 4; k++) { const e = sk[k]; this.si.push(e ? e[0] : 0); this.sw.push(e ? e[1] : 0); }
    return n;
  }
  // a tube through rings { c: centre, X, Y: across it (X x Y along the tube), w: half width, h, hd: half height up and
  // down, n: how square (2 round), arch: the top raised in the middle, fold: [size, turn] a crease in the cloth, sk: [[bone,
  // weight]] }, closed with a point at the start or the end when asked (how far beyond)
  tube(R, seg, tile, cap0, cap1) {
    const base = [];
    let s = 0;
    R.forEach((r, i) => {
      if (i) s += r.c.distanceTo(R[i - 1].c);
      base.push(this.p.length / 3);
      const per = Math.PI * (r.w + (r.h + r.hd) / 2), e = 2 / (r.n || 2);
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), f = r.fold ? 1 + r.fold[0] * Math.sin(2 * a + r.fold[1]) : 1;
        const x = r.w * f * Math.sign(ca) * Math.abs(ca) ** e;
        const y = (sa >= 0 ? r.h : r.hd) * f * Math.sign(sa) * Math.abs(sa) ** e + (r.arch && sa > 0 ? r.arch * Math.max(0, 1 - (x / r.w) ** 2) : 0);
        this.v(r.c.x + r.X.x * x + r.Y.x * y, r.c.y + r.X.y * x + r.Y.y * y, r.c.z + r.X.z * x + r.Y.z * y, (j / seg) * per / tile, s / tile, r.sk);
      }
    });
    for (let i = 0; i + 1 < R.length; i++) for (let j = 0; j < seg; j++) { const a = base[i] + j, c = base[i + 1] + j; this.ix.push(a, a + 1, c, a + 1, c + 1, c); }
    const dir = (i, j, out) => out.subVectors(R[j].c, R[i].c).normalize();
    if (cap0) { const r = R[0], d = dir(0, 1, _h1), q = this.v(r.c.x - d.x * cap0, r.c.y - d.y * cap0, r.c.z - d.z * cap0, 0, -cap0 / tile, r.sk); for (let j = 0; j < seg; j++) this.ix.push(q, base[0] + j + 1, base[0] + j); }
    if (cap1) { const L = R.length - 1, r = R[L], d = dir(L - 1, L, _h1), q = this.v(r.c.x + d.x * cap1, r.c.y + d.y * cap1, r.c.z + d.z * cap1, 0, (s + cap1) / tile, r.sk); for (let j = 0; j < seg; j++) this.ix.push(base[L] + j, base[L] + j + 1, q); }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.ix);
    g.computeVertexNormals();
    // (where a ring closes on itself its two copies of the point get one normal, so no seam shows)
    const n = g.attributes.normal, p = g.attributes.position, seen = new Map();
    for (let i = 0; i < p.count; i++) {
      const k = Math.round(p.getX(i) * 1e5) + ',' + Math.round(p.getY(i) * 1e5) + ',' + Math.round(p.getZ(i) * 1e5), o = seen.get(k);
      if (o === undefined) { seen.set(k, i); continue; }
      const x = n.getX(i) + n.getX(o), y = n.getY(i) + n.getY(o), z = n.getZ(i) + n.getZ(o), l = Math.hypot(x, y, z) || 1;
      n.setXYZ(i, x / l, y / l, z / l); n.setXYZ(o, x / l, y / l, z / l);
    }
    return g;
  }
}
// (between two bones: how far along from the first to the second, round a joint at j, over 2*hw)
const across = (s, j, hw) => sm((s - (j - hw)) / (2 * hw));
const skinOf = (pairs) => pairs.filter((p) => p[1] > 1e-4);

// One arm (m: 1 the right, -1 the left) under `root`: the bones, the glove and the sleeve over them, the pads and the
// watch. The hand is `g` (place and turn it); the forearm and upper arm bones are set by reachArm. Its geometries go
// into `geos` (to be disposed of).
export function buildArm(M, m, root, geos) {
  const g = new THREE.Group(); root.add(g);
  const bone = (parent, x, y, z) => { const b = new THREE.Bone(); b.position.set(x, y, z); b.rotation.order = 'YXZ'; parent.add(b); return b; };
  const hb = bone(g, 0, 0, 0), fingers = [], bones = [hb];
  for (const [x, y, z, L, , sp] of FING) {
    const k1 = bone(hb, x * m, y, z), k2 = bone(k1, 0, 0, -L[0]), k3 = bone(k2, 0, 0, -L[1]);
    k1.rotation.y = sp * m;
    const tip = new THREE.Object3D(); tip.position.set(0, -0.003, -L[2] + 0.004); k3.add(tip);
    fingers.push({ k1, k2, k3, tip }); bones.push(k1, k2, k3);
  }
  const t0 = bone(hb, THUMB.at[0] * m, THUMB.at[1], THUMB.at[2]), t1 = bone(t0, 0, 0, -THUMB.L[0]), t2 = bone(t1, 0, 0, -THUMB.L[1]);
  t0.rotation.set(THUMB.pitch, THUMB.yaw * m, THUMB.roll * m);
  const ttip = new THREE.Object3D(); ttip.position.set(0, -0.003, -THUMB.L[2] + 0.004); t2.add(ttip);
  fingers.unshift({ k1: t0, k2: t1, k3: t2, tip: ttip, thumb: true }); bones.push(t0, t1, t2);
  // (the forearm and the upper arm: under the root, set each frame; bound lying straight back from the wrist)
  const fb = bone(root, ARM.wrist.x, ARM.wrist.y, ARM.wrist.z), ub = bone(root, ARM.wrist.x, ARM.wrist.y, ARM.wrist.z + ARM.fore);
  fb.quaternion.setFromUnitVectors(_h1.set(0, 1, 0), _h2.set(0, 0, 1)); ub.quaternion.copy(fb.quaternion);
  bones.push(fb, ub);
  const FB = 16, UB = 17;
  // (bound where the root is now: the bones' places relative to it are what counts)
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();

  // ---- the glove: the palm and the wrist as one tube from the knuckles back into the sleeve, then each finger and
  // the thumb, each over its three bones
  const G = new Skin(), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
  const palm = [
    // [z, half width, up, down, arch, squareness]
    [-0.056, 0.036, 0.0095, 0.009, 0, 3], [-0.048, 0.0428, 0.0142, 0.0125, 0.003, 3], [-0.03, 0.0438, 0.0165, 0.015, 0.004, 3],
    [-0.005, 0.0425, 0.017, 0.0165, 0.004, 3], [0.02, 0.039, 0.0165, 0.0172, 0.003, 2.8], [0.036, 0.034, 0.0155, 0.0165, 0.001, 2.5],
    [0.05, 0.0298, 0.0158, 0.0162, 0, 2.3], [0.062, 0.0292, 0.0172, 0.0172, 0, 2.1], [0.074, 0.031, 0.0195, 0.0195, 0, 2],
    [0.09, 0.0335, 0.022, 0.022, 0, 2], [0.11, 0.0345, 0.0235, 0.0235, 0, 2], [0.14, 0.035, 0.024, 0.024, 0, 2],
  ];
  G.tube(palm.map(([z, w, h, hd, arch, n]) => {
    const k = across(z, 0.05, 0.02);
    return { c: new THREE.Vector3(0, 0, z), X, Y, w, h, hd, arch, n, sk: skinOf([[0, 1 - k], [FB, k]]) };
  }), 18, 0.25, 0.006, 0);
  const P = new THREE.Vector3(), PX = new THREE.Vector3(), PY = new THREE.Vector3(), Q = new THREE.Quaternion();
  // (a finger or the thumb: its profile [distance along, width, height up, down] over the bones b0 (the hand), b1..b3)
  const digit = (b1, prof, joints, ids, end) => {
    _hm.multiplyMatrices(inv, b1.matrixWorld).decompose(P, Q, _h3);
    PX.set(-1, 0, 0).applyQuaternion(Q); PY.set(0, 1, 0).applyQuaternion(Q);
    const F = _h2.set(0, 0, -1).applyQuaternion(Q);
    G.tube(prof.map(([s, w, h, hd]) => {
      const k1 = across(s, joints[0][0], joints[0][1]), k2 = across(s, joints[1][0], joints[1][1]), k3 = across(s, joints[2][0], joints[2][1]);
      return { c: P.clone().addScaledVector(F, s), X: PX.clone(), Y: PY.clone(), w, h, hd, n: 2.1, sk: skinOf([[ids[0], 1 - k1], [ids[1], k1 * (1 - k2)], [ids[2], k1 * k2 * (1 - k3)], [ids[3], k1 * k2 * k3]]) };
    }), 12, 0.25, 0, end);
  };
  FING.forEach(([, , , L, r], i) => {
    const a = L[0], b = L[0] + L[1], e = b + L[2];
    digit(fingers[i + 1].k1, [
      [-0.013, r * 1.08, r * 0.95, r * 0.9], [-0.004, r * 1.06, r * 0.93, r * 0.88], [0.005, r, r * 0.88, r * 0.84], [a * 0.5, r * 0.93, r * 0.8, r * 0.82],
      [a - 0.003, r * 0.94, r * 0.82, r * 0.82], [a + 0.002, r * 0.95, r * 0.83, r * 0.82], [a + L[1] * 0.5, r * 0.89, r * 0.76, r * 0.8],
      [b - 0.002, r * 0.88, r * 0.75, r * 0.78], [b + 0.002, r * 0.88, r * 0.74, r * 0.79], [b + L[2] * 0.45, r * 0.86, r * 0.7, r * 0.8],
      [e - r * 0.55, r * 0.8, r * 0.62, r * 0.74], [e - r * 0.22, r * 0.56, r * 0.42, r * 0.5],
    ], [[0, 0.009], [a, 0.006], [b, 0.005]], [0, 1 + i * 3, 2 + i * 3, 3 + i * 3], r * 0.22);
  });
  {
    const [a0, a1, a2] = THUMB.L, r = THUMB.r, a = a0, b = a0 + a1, e = b + a2;
    digit(fingers[0].k1, [
      [-0.018, r * 0.9, r * 0.75, r * 0.8], [-0.006, r * 1.08, r * 0.85, r * 0.95], [0.01, r * 1.12, r * 0.88, r * 0.98], [a * 0.55, r * 1.04, r * 0.84, r * 0.9],
      [a - 0.004, r * 0.92, r * 0.78, r * 0.82], [a + 0.003, r * 0.88, r * 0.74, r * 0.8], [a + a1 * 0.5, r * 0.84, r * 0.7, r * 0.78],
      [b - 0.002, r * 0.8, r * 0.66, r * 0.76], [b + 0.002, r * 0.8, r * 0.66, r * 0.76], [b + a2 * 0.45, r * 0.78, r * 0.6, r * 0.76],
      [e - r * 0.5, r * 0.72, r * 0.55, r * 0.68], [e - r * 0.2, r * 0.5, r * 0.38, r * 0.48],
    ], [[0, 0.014], [a, 0.007], [b, 0.005]], [0, 13, 14, 15], r * 0.2);
  }
  const glove = new THREE.SkinnedMesh(G.geometry(), M.glove);

  // ---- the sleeve: from its cuff over the glove's, along the forearm with a few creases, over the elbow, up the arm
  const S = new Skin(), Z = ARM.wrist.z, E = Z + ARM.fore;
  const sleeve = [
    // [z, half width, up, down, crease]
    [0.087, 0.031, 0.0225, 0.0225, 0], [0.09, 0.039, 0.033, 0.034, 0], [0.098, 0.0415, 0.0355, 0.0365, 0], [0.12, 0.042, 0.036, 0.037, 0.02],
    [0.132, 0.0405, 0.035, 0.036, 0], [0.155, 0.0425, 0.036, 0.037, 0.03], [0.18, 0.0418, 0.0365, 0.037, -0.025], [0.205, 0.0452, 0.039, 0.04, 0.03],
    [0.228, 0.0445, 0.039, 0.0405, -0.02], [0.252, 0.048, 0.042, 0.043, 0.025], [0.276, 0.0478, 0.0425, 0.044, -0.02], [0.298, 0.0505, 0.045, 0.046, 0.02],
    [E, 0.052, 0.048, 0.048, 0.03], [E + 0.018, 0.053, 0.05, 0.05, -0.03], [E + 0.04, 0.054, 0.052, 0.052, 0.02], [E + 0.09, 0.056, 0.054, 0.054, 0],
    [E + 0.16, 0.058, 0.056, 0.056, 0.015], [E + 0.24, 0.06, 0.058, 0.058, 0],
  ];
  S.tube(sleeve.map(([z, w, h, hd, f], i) => {
    const k = across(z, E, 0.032);
    return { c: new THREE.Vector3(0, ARM.wrist.y, z), X, Y, w, h, hd, n: 2, fold: f ? [f, i * 1.7] : null, sk: skinOf([[FB, 1 - k], [UB, k]]) };
  }), 16, 0.6, 0, 0);
  const sl = new THREE.SkinnedMesh(S.geometry(), M.sleeve);
  const skel = new THREE.Skeleton(bones);
  for (const mesh of [glove, sl]) { mesh.frustumCulled = false; root.add(mesh); mesh.bind(skel); if (geos) geos.push(mesh.geometry); }

  // ---- hard parts on the bones: the knuckle guard, a pad on each finger, the watch on the left wrist
  const pad = M.glovePad || M.glove;
  FING.forEach(([x, y, z, L, r]) => vmBox(hb, pad, r * 1.55, 0.006, 0.013, x * m, y + 0.0128, z + 0.003, 0.15, 0, 0, 0.0028));
  FING.forEach(([, , , L, r], i) => vmBox(fingers[i + 1].k1, pad, r * 1.2, 0.003, L[0] * 0.36, 0, r * 0.8 + 0.0011, -L[0] * 0.52, 0, 0, 0, 0.0014));
  if (m < 0 && M.watch) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.012, 16, 1, true), M.watch); band.scale.set(0.0345, 1, 0.0218); band.position.y = 0.026; fb.add(band);
    vmBox(fb, M.watch, 0.024, 0.022, 0.009, 0, 0.026, -0.024, 0, 0, 0, 0.003);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.0085, 14), new THREE.MeshBasicMaterial({ color: 0x40ff90 })); face.position.set(0, 0.026, -0.0287); face.rotation.y = Math.PI; fb.add(face);
  }
  return { g, hb, fb, ub, fingers, mirror: m, meshes: [glove, sl] };
}

// the fingers bent: [thumb, index, middle, ring, little], 0 straight .. 1 in a fist (bent, they come together a little)
export function curlHand(H, c) {
  const F = H.fingers, m = H.mirror;
  for (let i = 1; i < 5; i++) {
    const v = c[i] ?? 0.4, f = F[i], d = FING[i - 1];
    f.k1.rotation.set(-v * 1.2, (d[5] + (d[6] - d[5]) * Math.min(1, Math.max(0, v))) * m, 0); f.k2.rotation.x = -v * 1.4; f.k3.rotation.x = -v * 1.0;
  }
  const v = c[0] ?? 0.4, T = F[0];
  T.k1.rotation.set(THUMB.pitch - v * 0.25, (THUMB.yaw - v * 0.35) * m, THUMB.roll * m); T.k2.rotation.x = -v * 0.7; T.k3.rotation.x = -v * 0.8;
}

// where a part of the hand is with the hand at the origin turned as it is: 'palm', 'index' (its tip), 'thumb' (its
// tip), 'grip' (inside the bent fingers), 'pinch' (between thumb and index). (The hand's parent is at the origin, unturned.)
export function handAnchor(H, name, out) {
  if (name === 'palm') return out.set(0, 0, 0);
  H.g.updateMatrixWorld(true);
  const P = H.g.parent ? _p.copy(H.g.position).applyMatrix4(H.g.parent.matrixWorld) : _p.copy(H.g.position);
  const at = (f, v) => f.tip.getWorldPosition(v).sub(P);
  if (name === 'index') return at(H.fingers[1], out);
  if (name === 'thumb') return at(H.fingers[0], out);
  if (name === 'pinch') { at(H.fingers[0], out); return out.add(at(H.fingers[1], _fw)).multiplyScalar(0.5); }
  // grip: the middle finger's first joint
  H.fingers[2].k2.getWorldPosition(out).sub(P);
  return out.lerp(at(H.fingers[2], _fw), 0.3);
}

// The arm behind a placed hand, everything in the space of the arm's root: from the wrist to the shoulder S, the elbow
// between them toward the pole P (low and out, usually), the forearm turned as the hand is.
export function reachArm(H, S, P) {
  const W = _w.copy(ARM.wrist).applyQuaternion(H.g.quaternion).add(H.g.position);
  const d = _d.subVectors(S, W), len = d.length() || 1; d.divideScalar(len);
  const L1 = ARM.fore, L2 = ARM.upper, dd = Math.min(L1 + L2 - 1e-4, Math.max(Math.abs(L1 - L2) + 1e-3, len));
  const a = (L1 * L1 - L2 * L2 + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const pole = _c.copy(P); pole.addScaledVector(d, -pole.dot(d)).normalize();
  const El = _el.copy(W).addScaledVector(d, a).addScaledVector(pole, h);
  const y = _a.subVectors(El, W).normalize(), x = _b.set(1, 0, 0).applyQuaternion(H.g.quaternion);
  x.addScaledVector(y, -x.dot(y)).normalize();
  H.fb.position.copy(W); H.fb.quaternion.setFromRotationMatrix(_hm.makeBasis(x, y, _c.crossVectors(x, y)));
  y.subVectors(S, El).normalize(); x.addScaledVector(y, -x.dot(y)).normalize();
  H.ub.position.copy(El); H.ub.quaternion.setFromRotationMatrix(_hm.makeBasis(x, y, _c.crossVectors(x, y)));
}
