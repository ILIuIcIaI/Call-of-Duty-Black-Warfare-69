import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp, lerp, Spring, wrapAngle, DEG } from '../core/math.js';
import { Ragdoll } from './ragdoll.js';
import { buildWeapon, weaponMaterials } from '../weapons/models.js';
import { projectUV } from '../world/textures.js';

// =============================================================================
// Procedural soldier: rigged from groups, animated procedurally.
// Used for bots and for the player's own first-person body (legs only).
// Local space: faces -Z, origin at the feet.
// =============================================================================

export const OUTFITS = {
  vanguard: { uniform: 0xb8a888, vest: 0x8a7a5a, helmet: 0x5a5240, pants: 0xa09070, boots: 0x4a3a2a, face: 'skin', band: 0x3aa0ff, gear: 0x6a5e46 },
  raven: { uniform: 0x5a5e62, vest: 0x2e3230, helmet: 0x1e2022, pants: 0x4a4e52, boots: 0x1a1a1a, face: 'mask', band: 0xff4a3a, gear: 0x3a3e34 },
  jungle: { uniform: 0x6a7a52, vest: 0x4a5638, helmet: 0x3e4a30, pants: 0x5e6a48, boots: 0x2a241e, face: 'skin', band: 0xffb030, gear: 0x48523a },
  urban: { uniform: 0x8a9096, vest: 0x2a2e34, helmet: 0x2a2e34, pants: 0x6a7076, boots: 0x18181a, face: 'mask', band: 0x30e0a0, gear: 0x34383e },
  desert: { uniform: 0xc8b08a, vest: 0xa08a62, helmet: 0xa08a62, pants: 0xb8a07a, boots: 0x6a5238, face: 'skin', band: 0xe060ff, gear: 0x8a7652 },
};

const matCache = new Map();
function getMats(game, outfit) {
  const key = JSON.stringify(outfit);
  if (matCache.has(key)) return matCache.get(key);
  const camo = game.tex.generate('camo'), fab = game.tex.generate('fabric');
  const paint = game.tex.generate('paint');
  const mk = (color, map) => new THREE.MeshLambertMaterial({ color, map: map ? map.map : null });
  const m = {
    uniform: mk(outfit.uniform, camo),
    pants: mk(outfit.pants, camo),
    vest: mk(outfit.vest, fab),
    gear: mk(outfit.gear, fab),
    helmet: mk(outfit.helmet, paint),
    boots: mk(outfit.boots, paint),
    glove: mk(0x2a2824, fab),
    skin: mk(0xc89878, paint),
    mask: mk(0x1a1a1a, fab),
    lens: mk(0x101418),
    band: new THREE.MeshBasicMaterial({ color: outfit.band }),
    black: mk(0x1a1a1a),
  };
  matCache.set(key, m);
  return m;
}

let woundGeo = null, woundMat = null;
function rbox(w, h, d, r = 0.02) { return new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)); }
function mesh(g, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o;
}
function limb(r1, r2, len, m, seg = 8) {
  const g = new THREE.CylinderGeometry(r1, r2, len, seg); g.translate(0, -len / 2, 0);
  return new THREE.Mesh(g, m);
}
// merge the direct mesh children of a bone group by material (fewer draw calls)
function mergeDirect(group) {
  const by = new Map();
  for (const c of [...group.children]) {
    if (!c.isMesh) continue;
    c.updateMatrix();
    const g = (c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone()).applyMatrix4(c.matrix);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!by.has(c.material)) by.set(c.material, []);
    by.get(c.material).push(g);
    group.remove(c);
  }
  for (const [mat, list] of by) group.add(new THREE.Mesh(mergeGeometries(list, false), mat));
}
function isInside(o, anc) { for (let p = o.parent; p; p = p.parent) if (p === anc) return true; return false; }

// Turns the Group-based rig into Bones + SkinnedMeshes (rigid skinning, weight 1 per part).
// Animation code keeps working because the bones get the same hierarchy and local transforms.
function skinify(sol, root, skipUpper) {
  root.updateMatrixWorld(true);
  const rootInv = root.matrixWorld.clone().invert();
  const boneOf = new Map(), bones = [];
  const make = (g, parentBone) => {
    const bone = new THREE.Bone();
    bone.position.copy(g.position); bone.quaternion.copy(g.quaternion); bone.scale.copy(g.scale);
    boneOf.set(g, bone); bones.push(bone);
    if (parentBone) parentBone.add(bone);
    for (const c of g.children) if (c.isGroup && c !== sol.weaponMount) make(c, bone);
    return bone;
  };
  const rootBone = make(sol.pelvis, null);
  const byMat = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.parent === sol.weaponMount || isInside(o, sol.weaponMount)) return;
    if (skipUpper && (o.parent === sol.spine || isInside(o, sol.spine))) return;
    const bi = bones.indexOf(boneOf.get(o.parent));
    if (bi < 0) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInv, o.matrixWorld));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
  });
  root.remove(sol.pelvis);
  root.add(rootBone);
  boneOf.get(sol.chest).add(sol.weaponMount);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  for (const [mat, list] of byMat) {
    const merged = mergeGeometries(list, false);
    projectUV(merged, 0.62);
    const mesh = new THREE.SkinnedMesh(merged, mat);
    root.add(mesh);
    mesh.bind(skeleton);
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.4);
    (sol.skinned || (sol.skinned = [])).push(mesh);
  }
  // remap rig references to bones
  sol.pelvis = boneOf.get(sol.pelvis); sol.spine = boneOf.get(sol.spine); sol.chest = boneOf.get(sol.chest); sol.head = boneOf.get(sol.head);
  for (const L of sol.legs) { L.thigh = boneOf.get(L.thigh); L.knee = boneOf.get(L.knee); L.foot = boneOf.get(L.foot); }
  for (const a of sol.arms) { a.shoulder = boneOf.get(a.shoulder); a.upper = boneOf.get(a.upper); a.elbow = boneOf.get(a.elbow); a.fore = boneOf.get(a.fore); a.hand = boneOf.get(a.hand); }
}

function grp(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);

// ---- gait curves: [phase, degrees], phase 0 = heel strike of that leg
const WALK_HIP = [[0, 22], [0.12, 17], [0.3, 4], [0.5, -12], [0.62, -14], [0.75, 4], [0.88, 24]];
const WALK_KNEE = [[0, 4], [0.12, 16], [0.3, 7], [0.5, 6], [0.62, 36], [0.73, 60], [0.86, 26], [0.96, 4]];
const WALK_ANK = [[0, 4], [0.08, -6], [0.4, 8], [0.6, -16], [0.72, 2], [0.9, 6]];
const RUN_HIP = [[0, 30], [0.14, 14], [0.32, -20], [0.42, -16], [0.6, 18], [0.76, 46], [0.9, 38]];
const RUN_KNEE = [[0, 24], [0.12, 42], [0.3, 20], [0.4, 32], [0.55, 96], [0.68, 122], [0.8, 74], [0.92, 30]];
const RUN_ANK = [[0, 6], [0.14, -8], [0.32, -26], [0.45, -4], [0.7, 8], [0.88, 10]];
// periodic Catmull-Rom through [phase, value] keys
function curve(keys, p) {
  const n = keys.length;
  let i = n - 1;
  for (let k = 0; k < n; k++) if (keys[k][0] > p) { i = k - 1; break; }
  if (i < 0) i = n - 1;
  const k0 = keys[(i - 1 + n) % n], k1 = keys[i], k2 = keys[(i + 1) % n], k3 = keys[(i + 2) % n];
  let t1 = k1[0], t2 = k2[0];
  if (t2 <= t1) t2 += 1;
  let pp = p; if (pp < t1) pp += 1;
  const u = (pp - t1) / (t2 - t1);
  const m1 = (k2[1] - k0[1]) * 0.5, m2 = (k3[1] - k1[1]) * 0.5;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * k1[1] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * k2[1] + (u3 - u2) * m2;
}
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

export class Soldier {
  constructor(game, outfit, opts = {}) {
    this.game = game;
    this.outfit = outfit;
    this.fp = !!opts.firstPerson;
    const m = this.m = getMats(game, outfit);
    const root = this.root = new THREE.Group();
    this.hipH = 0.93;
    const pelvis = this.pelvis = grp(root, 0, this.hipH, 0);
    // --- hips
    pelvis.add(mesh(rbox(0.34, 0.2, 0.22, 0.05), m.pants, 0, -0.02, 0));
    pelvis.add(mesh(rbox(0.36, 0.05, 0.24, 0.015), m.gear, 0, 0.07, 0));
    pelvis.add(mesh(rbox(0.08, 0.1, 0.06, 0.015), m.gear, 0.15, 0.02, -0.06));
    pelvis.add(mesh(rbox(0.09, 0.12, 0.07, 0.015), m.gear, -0.17, 0.0, 0.02));
    // --- legs
    this.legs = [];
    for (const s of [-1, 1]) {
      const thigh = grp(pelvis, s * 0.1, -0.04, 0);
      thigh.add(limb(0.085, 0.066, 0.44, m.pants));
      if (s > 0) thigh.add(mesh(rbox(0.07, 0.12, 0.1, 0.015), m.gear, 0.07, -0.16, 0.0)); // thigh rig
      const knee = grp(thigh, 0, -0.44, 0);
      knee.add(mesh(rbox(0.11, 0.1, 0.06, 0.02), m.gear, 0, 0.0, -0.06));
      thigh.add(mesh(rbox(0.05, 0.12, 0.09, 0.015), m.pants, s * 0.075, -0.25, 0.0)); // cargo pocket
      for (let k = 0; k < 3; k++) knee.add(mesh(rbox(0.07, 0.008, 0.01, 0.002), m.black, 0, -0.33 - k * 0.025, -0.05)); // laces
      knee.add(limb(0.064, 0.05, 0.43, m.pants));
      const foot = grp(knee, 0, -0.43, 0);
      foot.add(mesh(rbox(0.11, 0.11, 0.27, 0.03), m.boots, 0, -0.03, -0.06));
      foot.add(mesh(rbox(0.115, 0.03, 0.28, 0.01), m.black, 0, -0.08, -0.06));
      this.legs.push({ thigh, knee, foot, s });
    }
    // --- upper body
    const spine = this.spine = grp(pelvis, 0, 0.08, 0);
    const chest = this.chest = grp(spine, 0, 0.24, 0);
    spine.add(mesh(rbox(0.32, 0.3, 0.2, 0.05), m.uniform, 0, 0.12, 0));
    chest.add(mesh(rbox(0.4, 0.34, 0.24, 0.05), m.uniform, 0, 0.08, 0.0));
    // plate carrier + pouches
    chest.add(mesh(rbox(0.36, 0.36, 0.08, 0.02), m.vest, 0, 0.04, -0.12));
    chest.add(mesh(rbox(0.36, 0.34, 0.06, 0.02), m.vest, 0, 0.05, 0.12));
    for (let i = -1; i <= 1; i++) chest.add(mesh(rbox(0.09, 0.13, 0.06, 0.015), m.gear, i * 0.1, -0.03, -0.17));
    chest.add(mesh(rbox(0.14, 0.08, 0.05, 0.015), m.gear, 0.08, 0.13, -0.16));
    chest.add(mesh(rbox(0.06, 0.12, 0.04, 0.01), m.black, -0.1, 0.14, -0.16)); // radio
    chest.add(mesh(rbox(0.2, 0.22, 0.1, 0.03), m.gear, 0, 0.0, 0.18)); // back pack
    // magazines poking out of the front pouches, MOLLE webbing, shoulder straps, admin pouch, med kit
    for (let i = -1; i <= 1; i++) chest.add(mesh(rbox(0.06, 0.05, 0.03, 0.006), m.black, i * 0.1, 0.055, -0.165));
    for (const y of [-0.08, -0.03, 0.02, 0.07, 0.12]) chest.add(mesh(rbox(0.37, 0.008, 0.012, 0.003), m.black, 0, y, -0.158));
    for (const sx of [-1, 1]) chest.add(mesh(rbox(0.07, 0.03, 0.3, 0.01), m.vest, sx * 0.12, 0.23, 0.0));
    chest.add(mesh(rbox(0.12, 0.09, 0.03, 0.01), m.gear, -0.06, 0.15, -0.165));
    chest.add(mesh(rbox(0.06, 0.06, 0.05, 0.012), m.band, 0.13, -0.12, -0.13));
    chest.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 10), m.gear, 0.0, 0.03, 0.24, Math.PI / 2, 0, Math.PI / 2)); // bedroll
    chest.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 6), m.black, -0.09, 0.12, 0.05, 0.4, 0, 0.3)); // hydration tube
    // team band on both shoulders
    for (const s of [-1, 1]) chest.add(mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.035, 10), m.band, s * 0.22, 0.12, 0, 0, 0, Math.PI / 2 * 0));
    // neck + head
    const head = this.head = grp(chest, 0, 0.29, 0);
    head.add(mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.1, 8), m.uniform, 0, -0.03, 0));
    const skull = mesh(new THREE.SphereGeometry(0.105, 14, 10), outfit.face === 'mask' ? m.mask : m.skin, 0, 0.09, 0);
    skull.scale.set(0.95, 1.08, 1.0); head.add(skull);
    head.add(mesh(new THREE.SphereGeometry(0.128, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), m.helmet, 0, 0.12, 0.01));
    head.add(mesh(rbox(0.21, 0.025, 0.07, 0.01), m.helmet, 0, 0.11, -0.1)); // brim
    head.add(mesh(rbox(0.06, 0.05, 0.04, 0.01), m.black, 0, 0.17, -0.12)); // NVG mount
    for (const s of [-1, 1]) head.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 10), m.black, s * 0.11, 0.08, 0.0, 0, 0, Math.PI / 2));
    head.add(mesh(rbox(0.17, 0.045, 0.05, 0.02), m.lens, 0, 0.1, -0.09)); // goggles / glasses
    if (outfit.face !== 'mask') head.add(mesh(rbox(0.12, 0.05, 0.05, 0.02), m.mask, 0, 0.02, -0.08)); // shemagh
    // helmet rails, back velcro patch, chin strap
    for (const s of [-1, 1]) head.add(mesh(rbox(0.012, 0.03, 0.12, 0.004), m.black, s * 0.127, 0.15, 0.0));
    head.add(mesh(rbox(0.06, 0.04, 0.012, 0.004), m.band, 0, 0.17, 0.125));
    head.add(mesh(new THREE.TorusGeometry(0.095, 0.006, 4, 16, Math.PI), m.black, 0, 0.07, 0.01, 0, Math.PI / 2, Math.PI));
    // belt gear: holster with pistol on the right thigh, dump pouch left
    pelvis.add(mesh(rbox(0.05, 0.16, 0.08, 0.012), m.gear, 0.2, -0.12, -0.0));
    pelvis.add(mesh(rbox(0.035, 0.06, 0.03, 0.006), m.black, 0.2, -0.02, -0.03, 0.25));
    pelvis.add(mesh(rbox(0.08, 0.1, 0.06, 0.015), m.gear, -0.18, -0.06, 0.06));
    // arms (IK driven)
    this.arms = [];
    for (const s of [-1, 1]) {
      const shoulder = grp(chest, s * 0.2, 0.16, s < 0 ? -0.07 : 0.03);
      const upper = grp(shoulder);
      upper.add(mesh(new THREE.SphereGeometry(0.07, 10, 8), m.uniform));
      upper.add(limb(0.058, 0.048, 0.3, m.uniform));
      const elbow = grp(upper, 0, -0.3, 0);
      const fore = grp(elbow);
      fore.add(limb(0.048, 0.04, 0.27, m.uniform));
      const hand = grp(fore, 0, -0.29, 0);
      hand.add(mesh(rbox(0.07, 0.1, 0.06, 0.02), m.glove, 0, -0.02, 0));
      hand.add(mesh(rbox(0.06, 0.03, 0.03, 0.008), m.black, 0, -0.04, -0.025)); // knuckle pad
      fore.add(mesh(rbox(0.07, 0.08, 0.07, 0.015), m.gear, 0, -0.02, 0.0)); // elbow pad
      this.arms.push({ shoulder, upper, elbow, fore, hand, s, L1: 0.3, L2: 0.29 });
    }
    // weapon mount (chest space)
    this.weaponMount = grp(chest, 0.08, 0.22, -0.3);
    this.weapon = null;

    // blob shadow
    const sm = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false, map: blobTexture() });
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), sm);
    this.blob.rotation.x = -Math.PI / 2; this.blob.renderOrder = 2;
    game.scene.add(this.blob);

    // convert the group rig into one skinned mesh per material (a handful of draw calls per soldier)
    skinify(this, root, this.fp);
    if (this.fp) {
      root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
      const fc = this.fpChest = new THREE.Group();
      fc.add(mesh(rbox(0.32, 0.3, 0.2, 0.05), m.uniform, 0, -0.12, 0));
      fc.add(mesh(rbox(0.4, 0.34, 0.24, 0.05), m.uniform, 0, 0.08, 0));
      fc.add(mesh(rbox(0.36, 0.36, 0.08, 0.02), m.vest, 0, 0.04, -0.12));
      for (let i = -1; i <= 1; i++) { fc.add(mesh(rbox(0.09, 0.13, 0.06, 0.015), m.gear, i * 0.1, -0.03, -0.17)); fc.add(mesh(rbox(0.06, 0.05, 0.03, 0.006), m.black, i * 0.1, 0.055, -0.165)); }
      for (const y of [-0.08, -0.03, 0.02, 0.07, 0.12]) fc.add(mesh(rbox(0.37, 0.008, 0.012, 0.003), m.black, 0, y, -0.158));
      fc.add(mesh(rbox(0.12, 0.09, 0.03, 0.01), m.gear, -0.06, 0.15, -0.165));
      fc.traverse((o) => {
        if (!o.isMesh) return;
        o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false;
        if (o.geometry.index) o.geometry = o.geometry.toNonIndexed();
        projectUV(o.geometry, 0.62);
      });
      fc.visible = false;
      this.chest.add(fc);
    }
    root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    game.scene.add(root);
    // thermal optics: bodies glow on layer 1, the fake shadow blob stays out of that picture
    if (!this.fp) root.traverse((o) => { if (o.isMesh) o.layers.enable(1); });
    this.blob.layers.set(2);

    // animation state
    this.phase = 0;
    this.anim = { crouch: 0, slide: 0, dive: 0, prone: 0, supine: 0, air: 0, run: 0, tac: 0, sprint: 0, aim: 0, reload: 0, mantle: 0, fall: 0, seat: 0, downed: 0 };
    this.lowerYaw = 0;
    this.flinch = new Spring(120, 10);
    this.dead = false; this.deathT = 0;
    this.weaponDrop = null;
  }

  setWeapon(def, optic) {
    if (this.weapon) this.weaponMount.remove(this.weapon.root);
    const key = def.model + '|' + optic;
    Soldier.wcache = Soldier.wcache || {};
    if (!Soldier.wcache[key]) Soldier.wcache[key] = buildWeapon(def.model, optic, weaponMaterials(this.game.tex));
    const proto = Soldier.wcache[key];
    const root = proto.root.clone(true);
    this.weapon = { root, proto, def };
    // hide PIP lens (not rendered for third person)
    root.traverse((o) => { if (o.material && o.material.isMeshBasicMaterial && !o.material.map) o.visible = false; });
    this.weaponMount.add(root);
    // pistols are held further forward/lower with both hands
    if (proto.pistol) this.weaponMount.position.set(0.04, 0.14, -0.42); else this.weaponMount.position.set(0.075, 0.2, -0.27);
    this.weapon.rh = proto.anchors.rhand.pos.clone();
    this.weapon.lh = proto.anchors.lhand ? proto.anchors.lhand.pos.clone() : proto.anchors.rhand.pos.clone().add(new THREE.Vector3(-0.03, -0.01, -0.01));
    this.weapon.muzzle = proto.anchors.muzzle.clone();
    if (this.fp) root.visible = false;
  }

  muzzleWorld(out) {
    if (!this.weapon) return out.copy(this.root.position).setY(this.root.position.y + 1.5);
    out.copy(this.weapon.muzzle);
    return this.weapon.root.localToWorld(out);
  }

  // 2-bone IK for an arm toward a target given in chest space
  solveArm(arm, target, poleX) {
    const sh = arm.shoulder.position;
    _a.copy(target).sub(sh);
    let d = _a.length();
    const L1 = arm.L1, L2 = arm.L2 + 0.04;
    d = clamp(d, 0.05, L1 + L2 - 0.001);
    _a.setLength(d);
    // elbow angle via law of cosines
    const cosE = clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1);
    const elbowBend = Math.PI - Math.acos(cosE);
    const cosS = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
    const sAng = Math.acos(cosS);
    // plane: direction to target + pole (elbow down & out)
    const dir = _b.copy(_a).normalize();
    const pole = _c.set(poleX, -1, 0.15).normalize();
    const n = _d.crossVectors(dir, pole).normalize();
    // upper arm direction = dir rotated by sAng toward the pole around n
    const upDir = _a.copy(dir).applyAxisAngle(n, sAng);
    // orient upper arm: its local -Y should point along upDir (in chest space; shoulder has no rotation)
    arm.upper.quaternion.setFromUnitVectors(DOWN, upDir.normalize());
    // forearm bends at the elbow (in the upper arm's local frame)
    const elbowWorldBend = _q.setFromAxisAngle(n, -elbowBend);
    const foreDirChest = upDir.clone().applyQuaternion(elbowWorldBend);
    const inv = arm.upper.quaternion.clone().invert();
    arm.fore.quaternion.setFromUnitVectors(DOWN, foreDirChest.applyQuaternion(inv).normalize());
  }

  // st: { yaw, pitch, speed, moveAngle, crouch, slide, dive, prone, supine, air, tac, sprint, reload, mantle, grounded }
  update(dt, st, pos) {
    const A = this.anim, root = this.root;
    if (this.dead) { this.updateDeath(dt); return; }
    root.position.copy(pos);
    root.rotation.y = st.yaw;
    const k = 12;
    A.crouch = damp(A.crouch, st.crouch ? 1 : 0, k, dt);
    A.slide = damp(A.slide, st.slide ? 1 : 0, 14, dt);
    A.dive = damp(A.dive, st.dive ? 1 : 0, 10, dt);
    A.prone = damp(A.prone, st.prone ? 1 : 0, 9, dt);
    A.supine = damp(A.supine, st.prone && st.supine ? 1 : 0, 9, dt);
    A.air = damp(A.air, st.air ? 1 : 0, 8, dt);
    A.tac = damp(A.tac, st.tac ? 1 : 0, 8, dt);
    A.reload = damp(A.reload, st.reload ? 1 : 0, 10, dt);
    A.mantle = damp(A.mantle, st.mantle ? 1 : 0, 14, dt);
    A.fall = damp(A.fall, st.fall ? 1 : 0, 7, dt);
    A.seat = damp(A.seat, st.seat ? 1 : 0, 12, dt);
    A.downed = damp(A.downed, st.downed ? 1 : 0, 7, dt);
    const speed = st.speed;
    A.run = damp(A.run, clamp(speed / 7.5, 0, 1.3), 8, dt);
    this.flinch.update(dt);

    A.sprint = damp(A.sprint, st.sprint && !st.tac ? 1 : 0, 8, dt);
    // ---- gait: phase advances with distance travelled (feet don't slide)
    const run = sstep(2.6, 6.2, speed);
    const crouchK = A.crouch;
    const strideLen = lerp(1.3, lerp(2.5, 3.0, A.tac), run) * (1 - crouchK * 0.35);
    const lying = Math.max(A.prone, A.downed), dw = A.downed;
    // hurt, on the ground: up on the forearms, hauling the body along, the legs dragging behind
    this.crawl = (this.crawl || 0) + (dw > 0.01 ? speed * dt * 3.6 : 0);
    const cr = Math.sin(this.crawl);
    const moving = clamp(speed / 1.1, 0, 1) * (1 - A.slide) * (1 - A.dive) * (1 - lying) * (1 - A.air) * (1 - A.mantle) * (1 - A.fall) * (1 - A.seat);
    // lower body turns into the movement direction; walking backwards plays the cycle in reverse
    const rel = -(st.moveAngle || 0);
    let lowerYaw = 0, dirSign = 1;
    if (speed > 0.6) {
      if (Math.abs(rel) <= 1.95) lowerYaw = clamp(rel, -1.15, 1.15) * 0.85;
      else { lowerYaw = clamp(wrapAngle(rel - Math.PI), -1.15, 1.15) * 0.85; dirSign = -1; }
    }
    this.lowerYaw = damp(this.lowerYaw, lowerYaw * moving * (1 - A.tac * 0.6), 8, dt);
    this.phase = (((this.phase + dirSign * speed * dt / strideLen) % 1) + 1) % 1;
    const ph = this.phase;
    const amp = moving * (1 - crouchK * 0.4) * (1 + A.tac * 0.12);

    // ---- pelvis: bob (inverted pendulum when walking, low at mid-stance when running), sway, lean
    const bob = lerp(0.022 * Math.cos(4 * Math.PI * (ph - 0.3)), 0.05 * Math.cos(4 * Math.PI * (ph - 0.4)), run) * moving;
    const crouchDrop = 0.36 * crouchK;
    let py = this.hipH - crouchDrop + bob - 0.03 * run * moving;
    let pRotX = -(0.04 + 0.12 * run + 0.1 * A.tac + 0.05 * A.sprint) * moving + 0.15 * crouchK;
    let pRotZ = Math.sin(ph * Math.PI * 2) * (0.035 + 0.02 * run) * moving;
    const pYawOsc = Math.sin(ph * Math.PI * 2) * (0.06 + 0.1 * run) * moving;
    py = lerp(py, 0.42, A.slide); pRotX += 0.55 * A.slide;
    py = lerp(py, 0.75, A.dive); pRotX = lerp(pRotX, -1.25, A.dive);
    py = lerp(py, 0.16, lying);
    pRotX = lerp(pRotX, -1.52, A.prone);
    py = lerp(py, 0.22, dw); pRotX = lerp(pRotX, -1.3, dw); pRotZ += cr * 0.07 * dw;
    py = lerp(py, this.hipH - 0.25, A.mantle);
    py = lerp(py, 0.95, A.fall); pRotX = lerp(pRotX, -1.38, A.fall); // skydiving: flat on the air, arms and legs out
    py = lerp(py, 0.1, A.seat); pRotX = lerp(pRotX, 0.06, A.seat);   // driving: sitting on the seat
    py += this.flinch.x * 0.01;
    this.pelvis.position.y = py;
    this.pelvis.rotation.set(pRotX, this.lowerYaw + pYawOsc, pRotZ, 'YXZ');
    // lying on the back = the flat body rolled around its own long axis (never through standing up)
    const spin = st.proneSpin !== undefined ? st.proneSpin : A.supine * Math.PI;
    if (Math.abs(spin) > 1e-3) this.pelvis.quaternion.multiply(_q.setFromAxisAngle(UP, spin));

    // ---- legs: hip / knee / ankle curves blended walk -> run
    for (const L of this.legs) {
      const p = (ph + (L.s < 0 ? 0 : 0.5)) % 1;
      const hip = lerp(curve(WALK_HIP, p), curve(RUN_HIP, p), run);
      const knee = lerp(curve(WALK_KNEE, p), curve(RUN_KNEE, p), run);
      const ank = lerp(curve(WALK_ANK, p), curve(RUN_ANK, p), run);
      let tx = hip * DEG * amp, kx = -knee * DEG * amp, ax = ank * DEG * amp;
      let tz = -0.05 * L.s;
      kx += -0.07 * (1 - moving);
      tx += 1.12 * crouchK; kx += -1.72 * crouchK;
      tx += A.air * (L.s > 0 ? 0.8 : 0.15); kx += A.air * (L.s > 0 ? -1.2 : -0.55);
      if (A.slide > 0.01) {
        const lead = L.s > 0;
        tx = lerp(tx, lead ? 0.75 : 0.15, A.slide); kx = lerp(kx, lead ? -0.12 : -2.0, A.slide);
        tz = lerp(tz, lead ? 0.28 : -0.3 * L.s, A.slide);
      }
      tx = lerp(tx, -0.1, A.dive); kx = lerp(kx, -0.25, A.dive);
      tx = lerp(tx, 0.0, lying); kx = lerp(kx, -0.05, lying);
      tz = lerp(tz, -0.12 * L.s, lying);
      if (dw > 0.01) { const c = cr * L.s; tx = lerp(tx, 0.06 + c * 0.2, dw); kx = lerp(kx, -0.22 - Math.max(0, c) * 0.5, dw); tz = lerp(tz, -0.16 * L.s, dw); }
      // on the back: left knee up with the boot planted, right leg stretched out
      if (A.supine > 0.01) {
        if (L.s < 0) { tx = lerp(tx, 0.5, A.supine); kx = lerp(kx, -0.95, A.supine); tz = lerp(tz, -0.42, A.supine); }
        else { tx = lerp(tx, 0.1, A.supine); kx = lerp(kx, -0.12, A.supine); tz = lerp(tz, 0.05, A.supine); }
      }
      tx = lerp(tx, L.s > 0 ? 1.2 : 0.2, A.mantle); kx = lerp(kx, L.s > 0 ? -1.6 : -0.3, A.mantle);
      tx = lerp(tx, 0.14, A.fall); kx = lerp(kx, -0.6, A.fall); tz = lerp(tz, -0.24 * L.s, A.fall);
      tx = lerp(tx, 1.5, A.seat); kx = lerp(kx, -1.32, A.seat); tz = lerp(tz, -0.07 * L.s, A.seat);
      L.thigh.rotation.set(tx, 0, tz);
      L.knee.rotation.set(kx, 0, 0);
      L.foot.rotation.set(-(tx + kx + pRotX * (1 - lying)) * 0.85 + ax, 0, 0);
    }

    // ---- upper body: counter-rotate the hips, distribute aim pitch, lean into sprints
    const aim = clamp(st.pitch, -1.2, 1.2);
    const counter = -pRotX * (1 - lying - A.dive - A.fall) * 0.8;
    const lean = -(0.1 * A.sprint + 0.22 * A.tac) * moving;
    this.spine.rotation.set(aim * 0.3 + counter * 0.6 + lean + dw * 0.2, -(this.lowerYaw + pYawOsc) * 0.75 + cr * 0.12 * dw, -pRotZ * 0.6, 'YXZ');
    this.chest.rotation.set(aim * 0.35 + counter * 0.4 + lean * 0.5 + this.flinch.x * 0.2 + dw * 0.14, -(this.lowerYaw + pYawOsc) * 0.25 + cr * 0.1 * dw, Math.sin(ph * Math.PI * 4) * 0.02 * moving * run, 'YXZ');
    this.head.rotation.set(aim * 0.3 - lean * 0.9 + A.prone * 0.9 - A.supine * 1.3 + A.fall * 1.0 + dw * 0.5, 0, 0);

    // ---- weapon carry: ready (aiming), low-ready across the chest (sprint), straight up at the shoulder (tac sprint)
    const wm = this.weaponMount, pistol = this.weapon && this.weapon.proto.pistol;
    const base = pistol ? [0.04, 0.14, -0.42] : [0.075, 0.2, -0.27];
    const S = A.sprint * (1 - A.reload), T = A.tac;
    const bounce = Math.sin(ph * Math.PI * 4) * moving;
    wm.position.set(
      base[0] - 0.07 * S + 0.085 * T,
      base[1] - 0.12 * S - 0.02 * T + bounce * (0.012 * S + 0.02 * T),
      base[2] + 0.07 * S + 0.13 * T);
    wm.rotation.set(-0.75 * S + 1.42 * T - 0.5 * A.reload + bounce * 0.04 * S, 0.75 * S + 0.12 * T, 0.35 * S - 0.18 * T + 0.4 * A.reload + Math.sin(ph * Math.PI * 2) * 0.06 * T, 'YXZ');
    // flat on the belly the chest looks at the ground, the gun points forward over the elbows
    if (A.prone > 0.01 && dw < 0.5) { wm.position.lerp(_c.set(0.06, 0.34, -0.17), A.prone); wm.rotation.x += 1.42 * A.prone; }

    // ---- arms IK to the weapon
    if (this.weapon && !this.fp) {
      this.weaponMount.updateMatrix();
      const wmM = this.weaponMount.matrix;
      const rt = _d.copy(this.weapon.rh).applyMatrix4(wmM).clone();
      let lt = new THREE.Vector3().copy(this.weapon.lh).applyMatrix4(wmM);
      if (A.reload > 0.05) {
        // left hand: grab the mag, drop it to the pouch, bring a fresh one, slap it in
        const k = st.reloadK || 0;
        const well = _c.set(0, -0.08, -0.08).applyMatrix4(wmM);
        const pouch = _a.set(-0.16, -0.32, -0.05);
        const u = k < 0.2 ? 0 : k < 0.45 ? (k - 0.2) / 0.25 : k < 0.6 ? 1 : k < 0.8 ? 1 - (k - 0.6) / 0.2 : 0;
        const e = u * u * (3 - 2 * u);
        const tgt = new THREE.Vector3().lerpVectors(well, pouch, e);
        if (k > 0.78 && k < 0.84) tgt.y += 0.03; // slap
        lt.lerp(tgt, A.reload);
      }
      if (A.tac > 0.05) {
        // runner's arm: swings opposite to the left leg, elbow bent ~90°
        const sw = Math.sin((ph + 0.5) * Math.PI * 2);
        lt.lerp(_c.set(-0.24 - 0.03 * sw, -0.16 + 0.13 * Math.max(0, sw) - 0.06 * Math.max(0, -sw), -0.06 - 0.2 * sw), A.tac);
      }
      if (st.melee > 0) {
        // knife in the left hand: swings across the chest
        const k = st.melee, e = Math.sin(k * Math.PI);
        lt.lerp(_c.set(-0.26 + 0.62 * k, 0.12 - 0.22 * k, -0.52 + 0.1 * e), e);
        this.chest.rotation.y += (0.35 - 0.9 * k) * e;
      }
      if (A.fall > 0.02) { rt.lerp(_c.set(0.56, 0.12, -0.14), A.fall); lt.lerp(_c.set(-0.56, 0.12, -0.14), A.fall); }
      if (dw > 0.02) {
        if (st.reviving) { rt.lerp(_c.set(0.1, -0.08 + Math.sin(this.game.time * 19) * 0.006, -0.24), dw); lt.lerp(_c.set(-0.08, -0.1, -0.22), dw); }
        else { rt.lerp(_c.set(0.27, 0.06 + cr * 0.12, -0.42 + cr * 0.05), dw); lt.lerp(_c.set(-0.27, 0.06 - cr * 0.12, -0.42 - cr * 0.05), dw); }
      }
      if (A.seat > 0.02) { rt.lerp(_c.set(0.17, -0.12, -0.42), A.seat); lt.lerp(_c.set(-0.17, -0.12, -0.42), A.seat); }
      this.weapon.root.visible = A.fall < 0.5 && A.seat < 0.5 && dw < 0.5;
      this.solveArm(this.arms[1], rt, 0.8);
      this.solveArm(this.arms[0], lt, -0.8);
    }

    if (this.fpChest) this.fpChest.visible = A.supine > 0.5;

    // blob shadow
    this.updateBlob(pos, st.floorY);
  }

  // ---- a baked pose, see game/motion.js. T: one body of the clip, s: the sample, between two frames if it has to be.
  // from: the pose it was in before (bones, hips) and how far it has left it, w.
  get poseBones() {
    if (!this.pb) { const L = this.legs, A = this.arms; this.pb = [this.pelvis, this.spine, this.chest, this.head, L[0].thigh, L[0].knee, L[0].foot, L[1].thigh, L[1].knee, L[1].foot, A[0].upper, A[0].fore, A[1].upper, A[1].fore, A[0].hand, A[1].hand]; }
    return this.pb;
  }
  playPose(T, s, from, w = 1) {
    const B = this.poseBones, nj = B.length, n = T.pos.length / 3, i = Math.min(n - 2, Math.floor(s)), f = s - i, g = 1 - f, Q = T.q, S = T.sh, P = T.pos;
    for (let j = 0; j < nj; j++) {
      const a = (i * nj + j) * 4, b = a + nj * 4;
      _q.set(Q[a] * g + Q[b] * f, Q[a + 1] * g + Q[b + 1] * f, Q[a + 2] * g + Q[b + 2] * f, Q[a + 3] * g + Q[b + 3] * f).normalize();
      if (from && w < 1) _q.slerp(from.q[j], 1 - w);
      B[j].quaternion.copy(_q);
    }
    this.pelvis.position.set(P[i * 3] * g + P[i * 3 + 3] * f, P[i * 3 + 1] * g + P[i * 3 + 4] * f, P[i * 3 + 2] * g + P[i * 3 + 5] * f);
    if (from && w < 1) this.pelvis.position.lerp(from.p, 1 - w);
    for (let k = 0; k < 2; k++) {
      const a = i * 6 + k * 3, b = a + 6;
      this.arms[k].shoulder.position.set(S[a] * g + S[b] * f, S[a + 1] * g + S[b + 1] * f, S[a + 2] * g + S[b + 2] * f);
    }
    for (const m of this.skinned || []) m.boundingSphere.center.copy(this.pelvis.position);
  }

  updateBlob(pos, floorY) {
    const fy = floorY !== undefined ? floorY : pos.y;
    this.blob.position.set(pos.x, fy + 0.03, pos.z);
    const lying = Math.max(this.anim.prone, this.anim.supine, this.anim.downed, this.dead ? 1 : 0);
    this.blob.scale.set(1 + lying * 0.2, 1 + lying * 1.2, 1);
    this.blob.rotation.z = this.root.rotation.y;
  }

  flinchHit(strength = 1) { this.flinch.impulse(-6 * strength); }

  // opts: { part, point, strength, vel }
  die(dir, opts = {}) {
    this.dead = true; this.deathT = 0;
    if (!this.weaponDrop) this.dropWeapon(dir);
    this.floorY = this.root.position.y;
    if (opts.staged) return; // the scene still has hold of this body, and leaves it where it ends
    const d = dir.clone(); d.y = Math.max(d.y, -0.2) + 0.12; d.normalize();
    this.ragdoll = new Ragdoll(this, this.game.col, { dir: d, part: opts.part, point: opts.point, strength: opts.strength || 3.2, vel: opts.vel });
  }

  // the gun falls out of the hands
  dropWeapon(dir) {
    if (!this.weapon) return;
    const w = this.weapon.root;
    w.updateMatrixWorld(true);
    const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
    w.matrixWorld.decompose(wp, wq, ws);
    this.game.scene.add(w); w.position.copy(wp); w.quaternion.copy(wq);
    const dv = dir.clone().multiplyScalar(1.5);
    this.weaponDrop = { obj: w, vel: new THREE.Vector3((Math.random() - 0.5) * 2 + dv.x, 1.5, (Math.random() - 0.5) * 2 + dv.z), spin: new THREE.Vector3(Math.random() * 6 - 3, Math.random() * 4 - 2, Math.random() * 6 - 3), floor: this.root.position.y + 0.05 };
  }

  updateWeaponDrop(dt) {
    const d = this.weaponDrop;
    if (!d || d.obj.position.y <= d.floor) return;
    d.vel.y -= 9.8 * dt;
    d.obj.position.addScaledVector(d.vel, dt);
    d.obj.rotation.x += d.spin.x * dt; d.obj.rotation.y += d.spin.y * dt; d.obj.rotation.z += d.spin.z * dt;
    if (d.obj.position.y <= d.floor) { d.obj.position.y = d.floor; d.obj.rotation.x = 0; d.obj.rotation.z = Math.PI / 2; }
  }

  updateDeath(dt) {
    this.deathT += dt;
    const t = this.deathT;
    if (this.ragdoll) {
      this.ragdoll.update(dt);
      const c = this.ragdoll.center;
      this.blob.position.set(c.x, this.floorY + 0.03, c.z);
      for (const m of this.skinned) m.boundingSphere.center.copy(c); // root sits at the origin while ragdolling
      this.blob.scale.set(1.3, 2.2, 1);
    }
    // after a while, sink into the ground
    if (t > 6) { this.root.position.y -= dt * 0.3; }
    this.updateWeaponDrop(dt);
  }

  // back to a clean standing pose (after a ragdoll)
  // where a bullet went in: it stays on the body as long as it lies there
  addWound(bone, x, y, z) {
    if (!woundGeo) { woundGeo = new THREE.SphereGeometry(1, 8, 6); woundMat = new THREE.MeshLambertMaterial({ color: 0x6a0a0c, emissive: 0x2a0204 }); }
    const m = new THREE.Mesh(woundGeo, woundMat), r = 0.024 + Math.random() * 0.024;
    m.position.set(x, y, z); m.scale.set(r, r * (0.8 + Math.random() * 0.6), 0.016); m.rotation.z = Math.random() * 3;
    bone.add(m);
    (this.wounds || (this.wounds = [])).push(m);
  }
  clearWounds() { if (this.wounds) { for (const m of this.wounds) m.removeFromParent(); this.wounds.length = 0; } }

  resetPose() {
    this.clearWounds();
    this.dead = false; this.ragdoll = null; this.deathT = 0;
    this.root.position.set(0, 0, 0); this.root.rotation.set(0, 0, 0);
    this.pelvis.position.set(0, this.hipH, 0);
    this.root.traverse((o) => { if (o.isBone) o.quaternion.identity(); });
    for (const a of this.arms) a.shoulder.position.set(a.s * 0.2, 0.16, a.s < 0 ? -0.07 : 0.03);
    for (const m of this.skinned || []) m.boundingSphere.center.set(0, 0.9, 0);
    for (const k of Object.keys(this.anim)) this.anim[k] = 0;
  }

  setVisible(v) { this.root.visible = v; this.blob.visible = v; }

  dispose() {
    this.game.scene.remove(this.root); this.game.scene.remove(this.blob);
    if (this.weaponDrop) this.game.scene.remove(this.weaponDrop.obj);
  }

  // ---- hitboxes in world space (computed on demand)
  hitboxes(out) {
    this.root.updateMatrixWorld(true);
    const hp = this.head.localToWorld(new THREE.Vector3(0, 0.1, 0));
    const neck = this.chest.localToWorld(new THREE.Vector3(0, 0.24, 0));
    const pelvis = this.pelvis.localToWorld(new THREE.Vector3(0, -0.02, 0));
    const chestC = this.chest.localToWorld(new THREE.Vector3(0, 0.06, 0));
    out.length = 0;
    out.push({ type: 'sphere', part: 'head', c: hp, r: 0.135 });
    out.push({ type: 'capsule', part: 'chest', a: chestC, b: neck, r: 0.2 });
    out.push({ type: 'capsule', part: 'stomach', a: pelvis, b: chestC, r: 0.19 });
    for (const L of this.legs) {
      const h = L.thigh.localToWorld(new THREE.Vector3(0, 0, 0));
      const kn = L.knee.localToWorld(new THREE.Vector3(0, 0, 0));
      const ft = L.foot.localToWorld(new THREE.Vector3(0, 0, 0));
      out.push({ type: 'capsule', part: 'limb', a: h, b: kn, r: 0.09 });
      out.push({ type: 'capsule', part: 'limb', a: kn, b: ft, r: 0.075 });
    }
    for (const a of this.arms) {
      const s = a.upper.localToWorld(new THREE.Vector3(0, 0, 0));
      const e = a.fore.localToWorld(new THREE.Vector3(0, 0, 0));
      const h = a.hand.localToWorld(new THREE.Vector3(0, 0, 0));
      out.push({ type: 'capsule', part: 'limb', a: s, b: e, r: 0.065 });
      out.push({ type: 'capsule', part: 'limb', a: e, b: h, r: 0.055 });
    }
    return out;
  }
}

let BLOB = null;
function blobTexture() {
  if (BLOB) return BLOB;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  BLOB = new THREE.CanvasTexture(c);
  return BLOB;
}
