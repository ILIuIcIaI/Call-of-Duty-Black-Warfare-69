import * as THREE from 'three';
import { Spring, Spring3, clamp, damp, lerp, smoother, rand } from '../core/math.js';
import { buildWeapon, buildHands, weaponMaterials, basisQuat } from './models.js';
import { sampleKeys, sampleScalar, stateAt } from './anim.js';
import { Particles } from '../fx/effects.js';

// =============================================================================
// First-person viewmodel: weapon + gloved hands rendered in their own scene
// (camera space) so they never clip into walls. Motion is layered:
//   base pose (hip/ADS) + stance poses (sprint/tac/slide/dive/mantle)
//   + keyframed clip offsets (followed by springs => overshoot & weight)
//   + event jolts (mag slap, bolt release) + recoil springs (physical units)
//   + bob / sway / breathing.
// =============================================================================

const HIP_RIFLE = new THREE.Vector3(0.155, -0.165, -0.41);
const HIP_PISTOL = new THREE.Vector3(0.125, -0.14, -0.37);
// rifle tac sprint (BO6/BO7): rifle pitched straight up in the right third of the frame, top rail facing the
// player, magazine and grip pointing forward (away from the camera; the foregrip juts toward the center).
// [x, y, z] offset from the hip + Euler 'YXZ' of the carry. The rotation is its own (quaternion) layer so bob
// and sway on top stay screen-relative instead of skewing the carry into a diagonal.
export const TAC_POSE = [0.64, -0.03, 0.11, Math.PI / 2, 0.12, 0]; // x: where on screen (-1..1), so it also fits narrow windows
// pistol sprint (BO1/BO2): the whole right arm pumps like a runner's. [x, y, z, pitch, yaw, roll] offsets from
// the hip at the back and the front of the stroke: the pistol only swings up into the lower frame on the forward
// stroke (muzzle up-left, top of the slide showing) and drops out of view behind. The left fist pumps in
// counter-phase (camera space).
export const PISTOL_SWING = {
  back: [0.09, -0.3, 0.12, -0.6, 0.2, -0.25],
  front: [-0.06, -0.015, 0.0, 0.45, 0.8, 0.3],
  // fist orientation solved from "forearm runs down-left out of frame, back of the hand up toward the camera"
  fistBack: [-0.24, -0.44, -0.12, 0.63, 0.52, -0.75],
  fistFront: [-0.1, -0.165, -0.3, 1.23, 0.52, -0.75],
};
// slide out of a tac sprint (BO6): the weapon stays in the right hand only, swung low and tipped toward the
// ground ahead; the left hand lets go and only takes it back once the player is up again (or aims / fires)
export const SLIDE_ONE_HAND = [-0.015, -0.035, 0.01, -0.06, 0.38, 0.1];
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _v3 = new THREE.Vector3(), _s3 = new THREE.Vector3();
const ONE3 = new THREE.Vector3(1, 1, 1);
const tmpA = [0, 0, 0, 0, 0, 0], tmpB = [0, 0, 0];
const ZERO6 = [0, 0, 0, 0, 0, 0];

function flashTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.15, 'rgba(255,230,140,1)'); g.addColorStop(0.42, 'rgba(255,150,50,0.55)'); g.addColorStop(1, 'rgba(255,90,20,0)');
  x.fillStyle = g;
  x.beginPath();
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2, r = i % 2 === 0 ? 50 + Math.random() * 12 : 16 + Math.random() * 10;
    x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  x.closePath(); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function flashSideTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, 'rgba(255,255,230,1)'); g.addColorStop(0.25, 'rgba(255,210,100,0.9)'); g.addColorStop(1, 'rgba(255,100,20,0)');
  x.fillStyle = g;
  x.beginPath(); x.moveTo(0, 32); x.quadraticCurveTo(40, 2, 128, 26); x.lineTo(128, 38); x.quadraticCurveTo(40, 62, 0, 32); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Viewmodel {
  constructor(game) {
    this.game = game;
    this.scene = game.vmScene;
    this.mats = weaponMaterials(game.tex);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.pivot = new THREE.Group();
    this.root.add(this.pivot);
    const hands = buildHands(this.mats);
    this.rhand = hands.right; this.lhand = hands.left; this.lhandOpen = hands.leftOpen; this.rhandOpen = hands.rightOpen;
    this.pivot.add(this.rhand, this.lhand);
    this.root.add(this.lhandOpen, this.rhandOpen);
    this.lhandOpen.visible = false; this.rhandOpen.visible = false;
    this.ledge = null; this.ledgeK = 0;
    this.freeW = 0;

    // lights (camera space); key light follows the world sun direction
    this.hemi = new THREE.HemisphereLight(0xe8e6e0, 0x5a5044, 1.7);
    this.key = new THREE.DirectionalLight(0xffffff, 2.0);
    this.fill = new THREE.DirectionalLight(0x9aa8b8, 0.5);
    this.fill.position.set(-1, -0.3, 0.6);
    this.rim = new THREE.DirectionalLight(0xc6d8ff, 0.5);
    this.rim.position.set(-1.3, 1.1, -0.9);
    this.scene.add(this.rim);
    this.scene.add(this.hemi, this.key, this.key.target, this.fill);
    this.shadowAmt = 1;

    // ---- springs (physical units: meters / radians)
    this.recoilPos = new Spring3(520, 26);
    this.recoilRot = new Spring3(420, 22);
    this.clipPos = new Spring3(620, 36);
    this.clipRot = new Spring3(620, 36);
    this.joltPos = new Spring3(240, 16);
    this.joltRot = new Spring3(240, 16);
    this.swayRot = new Spring3(110, 12);
    this.swayPos = new Spring3(130, 14);
    this.moveRot = new Spring3(90, 12);
    this.land = new Spring(120, 11);
    this.adsVis = new Spring(900, 48);
    this.vib = 0;
    this.tacQ = new THREE.Quaternion();
    this.cam = new THREE.Vector3(); // small camera rotation (pitch, yaw, roll) that rides along with reloads
    this.cornerRoll = 0;
    this.breath = 0;
    this.poseVals = { sprint: 0, tac: 0, slide: 0, dive: 0, mantle: 0, crawl: 0, crouch: 0, lower: 0, oneHand: 0, stow: 0 };
    this.slideOneHand = false; this.upT = 0;

    // ---- muzzle flash
    this.flashTex = flashTexture(); this.flashSide = flashSideTexture();
    const fm = new THREE.MeshBasicMaterial({ map: this.flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const sm = new THREE.MeshBasicMaterial({ map: this.flashSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.flash = new THREE.Group();
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.17), fm); this.flash.add(front);
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.1), sm);
      s.rotation.y = Math.PI / 2; s.rotation.x = i * Math.PI / 3; s.position.z = -0.11; this.flash.add(s);
    }
    this.flash.visible = false; this.flashT = 0;
    this.flashLight = new THREE.PointLight(0xffa850, 0, 1.4, 2);
    this.root.add(this.flashLight);

    // ---- barrel smoke (camera space particles)
    this.smoke = new Particles(this.scene, 90, false);
    this.smoke.points.renderOrder = 10;
    this.heat = 0;

    this.casings = [];
    this.clip = null; this.clipT = 0; this.clipFired = new Set();
    this.onEvent = null;
    this.shotKick = 0;
    this.scalars = {};
    this.persist = { slide: 0 };
  }

  // -------------------------------------------------------------- weapon setup
  setWeapon(def, optic) {
    if (this.model) this.pivot.remove(this.model.root);
    if (this.spare && this.spare.parent) this.spare.parent.remove(this.spare);
    const key = def.id + '|' + (optic || 'iron');
    this.cache = this.cache || {};
    if (!this.cache[key]) this.cache[key] = buildWeapon(def.model, optic, this.mats);
    const w = this.model = this.cache[key];
    this.def = def;
    this.pivot.add(w.root);
    this.isPistol = !!w.pistol;
    this.hip = (this.isPistol ? HIP_PISTOL : HIP_RIFLE).clone();
    if (def.id === 'lmg') this.hip.add(_v.set(0.0, -0.01, 0.02));
    if (def.id === 'sniper') this.hip.add(_v.set(0.0, -0.005, 0.03));
    // rest transforms live on the (cached) model so they can never get out of sync with it
    if (!w.rest) { w.rest = {}; for (const [k, p] of Object.entries(w.parts)) w.rest[k] = { pos: p.position.clone(), rot: p.rotation.clone(), parent: p.parent }; }
    this.rest = w.rest;
    this.rHome = w.anchors.rhand;
    if (w.anchors.lhand) this.lHome = w.anchors.lhand;
    else {
      const r = this.rHome;
      this.lHome = { pos: r.pos.clone().add(_v.set(-0.012, -0.022, -0.004)), quat: r.quat.clone().multiply(_q.setFromEuler(_e.set(0.1, 0.0, 0.15))) };
    }
    this.lhand.visible = true;
    if (w.parts.mag) {
      const magRest = new THREE.Matrix4().compose(this.rest.mag.pos, new THREE.Quaternion().setFromEuler(this.rest.mag.rot), new THREE.Vector3(1, 1, 1));
      const a = this.resolveAnchor('mag', true, {});
      const handAt = new THREE.Matrix4().compose(a.pos, a.quat, new THREE.Vector3(1, 1, 1));
      this.magInHand = handAt.clone().invert().multiply(magRest);
      // second magazine for two-mag swaps, held right beside the first one (camera side of the hand)
      if (!w.spare) w.spare = w.parts.mag.clone(true);
      this.spare = w.spare; this.spare.visible = false;
      this.spareInHand = new THREE.Matrix4().makeTranslation(-0.042, 0, 0).multiply(this.magInHand);
      this.magState = null;
    } else this.spare = null;
    if (w.parts.shellHand) this.shellRel = new THREE.Matrix4().makeTranslation(-0.01, 0.0, -0.035);
    w.root.add(this.flash);
    this.flash.position.copy(w.anchors.muzzle);
    this.flash.scale.setScalar(def.id === 'shotgun' || def.id === 'sniper' || def.id === 'revolver' ? 1.6 : def.id === 'smg' ? 0.8 : def.id === 'lmg' ? 1.25 : 1.1);
    this.persist.slide = 0;
    this.clip = null;
    this.setMagState('gun');
  }

  // -------------------------------------------------------------- anchors (weapon space)
  resolveAnchor(name, left, out) {
    const w = this.model, A = w.anchors;
    out.pos = out.pos || new THREE.Vector3(); out.quat = out.quat || new THREE.Quaternion();
    const home = left ? this.lHome : this.rHome;
    switch (name) {
      case 'mag': {
        const mp = this.rest.mag ? this.rest.mag.pos : _v.set(0, 0, 0);
        out.pos.copy(mp).add(A.magGrab);
        out.quat.copy(this.isPistol ? basisQuat([1, 0, 0], [0, 0.94, -0.34], [0, 0.34, 0.94]) : basisQuat([0.9, 0.0, 0.43], [0, 1, 0], [-0.43, 0, 0.9]));
        break;
      }
      case 'low':
        out.pos.copy(home.pos).add(_v.set(left ? -0.12 : 0.1, -0.32, 0.16));
        out.quat.copy(home.quat).multiply(_q.setFromEuler(_e.set(-0.5, 0, 0.6)));
        break;
      case 'vest': {
        // magazine pouches on the chest rig: fixed to the body (camera space), not to the tilted weapon, so the
        // hand really travels down to the vest and back even where a wide FOV shows the whole trip
        _m.copy(this.pivot.matrix).invert();
        out.pos.set(-0.075, -0.42, -0.13).applyMatrix4(_m);
        out.quat.copy(this.isPistol ? basisQuat([1, 0, 0], [0, 0.94, -0.34], [0, 0.34, 0.94]) : basisQuat([0.9, 0.0, 0.43], [0, 1, 0], [-0.43, 0, 0.9]));
        break;
      }
      case 'charge':
        out.pos.copy(A.charge).add(_v.set(left ? -0.035 : 0.035, -0.012, 0.01));
        out.quat.copy(basisQuat([0, 1, 0], [0.3, 0, -0.95], [-0.95, 0, -0.3]));
        break;
      case 'bcatch': {
        // bolt catch on the left side of the receiver, just above the magwell
        const mp = this.rest.mag ? this.rest.mag.pos : _v.set(0, 0, -0.07);
        out.pos.set(-0.045, 0.035, mp.z + 0.01);
        out.quat.copy(basisQuat([0, 1, 0], [0, 0, -1], [-1, 0, 0]));
        break;
      }
      case 'cover': {
        const c = w.parts.cover;
        out.pos.set(0.0, c.position.y + 0.02, c.position.z - 0.12);
        out.pos.y += Math.sin(c.rotation.x) * 0.12;
        out.quat.copy(basisQuat([0, 1, 0], [0, 0, -1], [-1, 0, 0]));
        break;
      }
      case 'port':
        out.pos.set(-0.01, -0.005, -0.06);
        out.quat.copy(basisQuat([0.2, 0.98, 0], [0, 0, -1], [-0.98, 0.2, 0]));
        break;
      case 'slide':
        out.pos.set(-0.03, 0.035, 0.03);
        out.quat.copy(basisQuat([0, 1, 0], [0, 0, -1], [-1, 0, 0]));
        break;
      case 'cyl':
        out.pos.set(-0.05, 0.02, -0.06);
        out.quat.copy(basisQuat([0.3, 0.95, 0], [0, 0, -1], [-0.95, 0.3, 0]));
        break;
      case 'cylBack':
        out.pos.set(-0.055, 0.04, 0.0);
        out.quat.copy(basisQuat([0.3, 0.95, 0], [0, 0, -1], [-0.95, 0.3, 0]));
        break;
      case 'bolt': {
        const b = w.parts.bolt;
        out.pos.set(0.062 + 0.04, b.position.y - 0.012 - 0.01, b.position.z + 0.03);
        out.quat.copy(basisQuat([0, 1, 0], [-0.2, 0, -0.98], [-0.98, 0, 0.2]));
        break;
      }
      default:
        out.pos.copy(home.pos); out.quat.copy(home.quat);
        if (left && w.parts.pump) out.pos.z += (this.scalars.pump || 0) * (w.pumpTravel || 0.08);
    }
    return out;
  }

  sampleHand(keys, t, left, outPos, outQuat) {
    const res = this._res || (this._res = []);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const r = res[i] || (res[i] = { t: 0, p: [0, 0, 0], q: new THREE.Quaternion(), a: {} });
      this.resolveAnchor(k[1], left, r.a);
      r.t = k[0];
      r.p[0] = r.a.pos.x + k[2]; r.p[1] = r.a.pos.y + k[3]; r.p[2] = r.a.pos.z + k[4];
      r.q.copy(r.a.quat).multiply(_q.setFromEuler(_e.set(k[5], k[6], k[7])));
    }
    const n = keys.length;
    const flat = this._flat || (this._flat = []);
    for (let i = 0; i < n; i++) { flat[i] = flat[i] || [0, 0, 0, 0]; flat[i][0] = res[i].t; flat[i][1] = res[i].p[0]; flat[i][2] = res[i].p[1]; flat[i][3] = res[i].p[2]; }
    flat.length = n;
    sampleKeys(flat, t, 1, 3, tmpB);
    outPos.set(tmpB[0], tmpB[1], tmpB[2]);
    if (t <= res[0].t) outQuat.copy(res[0].q);
    else if (t >= res[n - 1].t) outQuat.copy(res[n - 1].q);
    else {
      let k = 0; while (k < n - 2 && res[k + 1].t < t) k++;
      let u = (t - res[k].t) / Math.max(1e-6, res[k + 1].t - res[k].t); u = u * u * (3 - 2 * u);
      outQuat.copy(res[k].q).slerp(res[k + 1].q, u);
    }
  }

  // -------------------------------------------------------------- clips & jolts
  play(clip) {
    this.clip = clip; this.clipT = 0; this.clipFired.clear();
    if (clip.name === 'draw' || clip.name === 'raise' || clip.name === 'holster') {
      // snap the follow springs so the weapon starts exactly at the first key
      const W = sampleKeys(clip.W, 0, 1, 6, tmpA);
      this.clipPos.x.x = W[0]; this.clipPos.y.x = W[1]; this.clipPos.z.x = W[2];
      this.clipRot.x.x = W[3]; this.clipRot.y.x = W[4]; this.clipRot.z.x = W[5];
      for (const s of [this.clipPos, this.clipRot]) { s.x.v = s.y.v = s.z.v = 0; }
    }
  }
  stop() {
    if (this.clip && this.clip.A) this.setMagState('gun');
    this.clip = null;
  }
  get playing() { return this.clip ? this.clip.name : null; }

  // short physical kick (m/s, rad/s) used for mag slaps, bolt releases, etc.
  jolt(px, py, pz, rx, ry, rz) {
    this.joltPos.impulse(px, py, pz);
    this.joltRot.impulse(rx, ry, rz);
  }

  setMagState(s) {
    const mag = this.model && this.model.parts.mag;
    if (!mag || s === this.magState) { this.magState = s; return; }
    const isLoader = this.model.revolver;
    // main magazine: 'spare' / 'swapIn' keep it in the gun ('swapIn' = the fresh one just went in)
    if (s === 'gun' || s === 'hidden' || s === 'spare' || s === 'swapIn') {
      this.model.root.add(mag);
      mag.position.copy(this.rest.mag.pos); mag.rotation.copy(this.rest.mag.rot); mag.scale.set(1, 1, 1);
      mag.visible = !(isLoader || s === 'hidden');
    } else if (s === 'hand' || s === 'handNew' || s === 'swap' || s === 'pair') {
      this.lhand.add(mag);
      this.magInHand.decompose(mag.position, mag.quaternion, mag.scale);
      mag.visible = true;
    } else if (s === 'drop') {
      // released and falling free (pistols)
      this.spawnDroppedMag(new THREE.Vector3(-0.12, -0.7, 0.06), new THREE.Vector3(3, 0.5, 4), 9.8);
      mag.visible = false;
    } else if (s === 'fling') {
      // BO7 empty reload: the spent mag is flicked out of the well and sails off to the upper left
      this.spawnDroppedMag(new THREE.Vector3(-1.05, 1.35, -0.45), new THREE.Vector3(7, 2.5, 13), 9.8);
      mag.visible = false;
    }
    // second magazine for two-mag swaps: fresh mag beside the old one ('spare', 'pair'), then (after the
    // fresh one went in) it stands in for the old mag still in the hand ('swapIn') until it is thrown away
    const sp = this.spare;
    if (sp) {
      if (s === 'spare' || s === 'pair' || s === 'swapIn') {
        this.lhand.add(sp);
        (s === 'swapIn' ? this.magInHand : this.spareInHand).decompose(sp.position, sp.quaternion, sp.scale);
        sp.visible = true;
      } else if (s === 'toss') {
        if (sp.visible) this.spawnDroppedMag(new THREE.Vector3(-0.75, -0.25, 0.25), new THREE.Vector3(9, 3, -6), 9.8, sp);
        sp.visible = false;
      } else sp.visible = false;
    }
    this.magState = s;
  }

  spawnDroppedMag(vel, spin, grav, src) {
    const mag = src || this.model.parts.mag;
    const c = mag.clone(true);
    c.visible = true;
    mag.updateMatrixWorld(true);
    this.root.updateMatrixWorld(true);
    _m2.multiplyMatrices(_m.copy(this.root.matrixWorld).invert(), mag.matrixWorld);
    _m2.decompose(c.position, c.quaternion, c.scale);
    this.root.add(c);
    this.casings.push({ obj: c, vel, spin, grav, life: 1.0 });
  }

  // -------------------------------------------------------------- per-shot
  onShot(def, ads) {
    const r = def.recoil;
    const k = r.vis * (ads ? 0.55 : 1);
    this.recoilPos.impulse(rand(-0.07, 0.07) * k, rand(0.02, 0.1) * k, (0.95 + Math.random() * 0.35) * k);
    this.recoilRot.impulse((1.9 + Math.random() * 0.8) * k, rand(-0.5, 0.5) * k, rand(-1.1, 1.1) * k);
    this.vib = Math.min(1, this.vib + 0.45);
    this.shotKick = 1;
    if (this.model && this.model.parts.slide && this.isPistol) this.slideKick = 1;
    this.flash.visible = true; this.flashT = 0.04 + Math.random() * 0.02;
    this.flash.rotation.z = Math.random() * Math.PI;
    const s = 0.8 + Math.random() * 0.5;
    this.flash.children[0].scale.setScalar(s);
    for (let i = 1; i < this.flash.children.length; i++) this.flash.children[i].scale.set(0.7 + Math.random() * 0.6, 0.8 + Math.random() * 0.4, 1);
    this.flashLight.intensity = 3.2;
    this.heat = Math.min(1.5, this.heat + (def.fire === 'auto' ? 0.09 : 0.35));
  }

  ejectCasing() {
    const w = this.model;
    if (!w.casingModel) return;
    let c = this.casings.find((o) => !o.active && o.kind === w.casing);
    if (!c) {
      c = { obj: w.casingModel.clone(true), kind: w.casing, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, active: false };
      this.casings.push(c); this.root.add(c.obj);
    }
    _v.copy(w.anchors.eject);
    w.root.localToWorld(_v);
    this.root.worldToLocal(_v);
    c.obj.position.copy(_v);
    c.obj.rotation.set(0, Math.random() * Math.PI, 0);
    c.vel.set(rand(1.0, 1.6), rand(0.8, 1.3), rand(0.1, 0.5));
    if (w.revolver) c.vel.set(rand(-0.3, 0.3), rand(-0.6, -0.2), rand(0.3, 0.6));
    c.spin.set(rand(-25, 25), rand(-25, 25), rand(-25, 25));
    c.life = 0.6; c.active = true; c.obj.visible = true;
  }

  // Hands on a ledge. Anchored in the world so they stay put on the edge while the camera climbs past them.
  // Runs after the camera has moved. Positions are converted so they line up with the world picture even
  // though the viewmodel camera has its own (narrower) FOV. High ledge: both open hands come up from below the
  // frame, grip the edge and get left behind below the frame. Low ledge: only the left hand comes off the weapon.
  updateLedgeHands(cam) {
    const L = this.ledge;
    if (!L) return;
    const k = this.ledgeK, vmc = this.game.engine.vmCamera;
    const ratio = Math.tan(cam.fov * Math.PI / 360) / Math.tan(vmc.fov * Math.PI / 360);
    _invQ.copy(cam.quaternion).invert();
    const inX = -L.ax, inZ = -L.az;
    for (let side = -1; side <= 1; side += 2) {
      const hand = side < 0 ? this.lhandOpen : this.rhandOpen;
      if (side > 0 && !L.high) { hand.visible = false; continue; }
      const g = L.high ? smoother(clamp((k - 0.07) / 0.2, 0, 1)) : smoother(clamp(k / 0.28, 0, 1));
      const off = L.high ? smoother(clamp((k - 0.86) / 0.12, 0, 1)) : smoother(clamp((k - (L.over ? 0.5 : 0.68)) / 0.26, 0, 1));
      // on top of the edge, about shoulder width apart
      if (L.high) {
        // halfway up the hands re-plant further onto the top, one after the other, to press up on them
        const re = clamp((k - (side < 0 ? 0.42 : 0.47)) / 0.11, 0, 1);
        const plant = 0.035 + smoother(re) * 0.27, lift = Math.sin(re * Math.PI) * 0.05;
        _v.set(L.ex + L.sx * side * 0.2 + L.ax * plant, L.top + 0.018 + lift, L.ez + L.sz * side * 0.2 + L.az * plant);
        _v.applyMatrix4(cam.matrixWorldInverse);
        _v.z *= ratio;
      } else _v.set(-0.16, -0.1 - k * 0.18, -0.44 + k * 0.1); // low ledge: the camera passes it too fast, keep the hand in view
      // from / to below the frame (or from the weapon)
      if (L.high) _v3.set(side * 0.24, -0.46, -0.26);
      else this.lhand.getWorldPosition(_v3);
      _v3.lerp(_v, g);
      _v3.lerp(_v2.set(side * 0.28, -0.52, -0.14), off);
      hand.position.copy(_v3);
      // forearm runs back toward the shoulder, fingers lie over the edge: split the difference at the wrist
      _va.set(side * 0.3 - _v3.x, -0.38 - _v3.y, 0.06 - _v3.z).normalize();
      _vb.set(inX, 0, inZ).applyQuaternion(_invQ); // from the edge back toward the player, camera space
      _vz.copy(_va).multiplyScalar(0.8).addScaledVector(_vb, 0.2).normalize();
      _vy.set(0, 1, 0).applyQuaternion(_invQ);
      _vy.addScaledVector(_vz, -_vy.dot(_vz)).normalize();
      _vx.crossVectors(_vy, _vz);
      _m.makeBasis(_vx, _vy, _vz);
      hand.quaternion.setFromRotationMatrix(_m);
      hand.visible = L.high ? k > 0.07 && off < 0.999 : k < 0.98;
    }
    if (!L.high) this.lhand.visible = false;
  }

  // -------------------------------------------------------------- update
  update(dt, st) {
    if (!this.model) return;
    const w = this.model;
    const P = this.poseVals;
    this.adsVis.target = st.ads;
    this.adsVis.update(dt);
    const adsE = smoother(clamp(this.adsVis.x, 0, 1));
    const adsOver = Math.max(0, this.adsVis.x - 1); // tiny overshoot = settle feeling

    // ---- clip playback
    let W = ZERO6;
    if (this.clip) {
      const c = this.clip;
      this.clipT += dt / c.dur;
      const t = Math.min(1, this.clipT);
      for (const [et, name] of c.E || []) {
        if (t >= et && !this.clipFired.has(et + name)) { this.clipFired.add(et + name); if (this.onEvent) this.onEvent(name, c); }
      }
      W = sampleKeys(c.W, t, 1, 6, tmpA);
      for (const [k, keys] of Object.entries(c.S || {})) this.scalars[k] = sampleScalar(keys, t);
      if (c.A) this.setMagState(stateAt(c.A, t));
      if (this.clipT >= 1) {
        const done = c;
        this.clip = null;
        this.scalars = {};
        if (done.A) this.setMagState('gun');
        if (this.onEvent) this.onEvent('end', done);
      }
    } else this.scalars = {};
    // clip offsets followed by springs => organic overshoot / weight
    this.clipPos.setTarget(W[0], W[1], W[2]); this.clipRot.setTarget(W[3], W[4], W[5]);
    this.clipPos.update(dt); this.clipRot.update(dt);
    this.joltPos.update(dt); this.joltRot.update(dt);

    // ---- stance pose weights
    P.sprint = damp(P.sprint, st.sprint && !st.tac ? 1 : 0, 11, dt);
    P.tac = damp(P.tac, st.tac ? 1 : 0, 10, dt);
    P.slide = damp(P.slide, st.slide ? 1 : 0, 13, dt);
    P.dive = damp(P.dive, st.dive ? 1 : 0, 11, dt);
    P.mantle = damp(P.mantle, st.mantle && !st.mantleHigh ? 1 : 0, 16, dt);
    P.crawl = damp(P.crawl, st.crawl ? 1 : 0, 8, dt);
    P.crouch = damp(P.crouch, st.crouch ? 1 : 0, 9, dt);
    P.lower = damp(P.lower, st.lower ? 1 : 0, 10, dt);
    // climbing a high ledge: the weapon is swung down out of the frame so both hands are free
    // (slow in, so you see it go; it comes back as the hands let go of the edge)
    const stowK = st.mantle && st.mantleHigh ? st.mantleK || 0 : 1;
    if (stowK < 0.84) { const x = clamp(stowK / 0.24, 0, 1); P.stow = Math.max(P.stow, x * x * x); }
    else P.stow = damp(P.stow, 0, 9, dt);
    this.ledge = st.mantle ? st.ledge || null : null; this.ledgeK = st.mantleK || 0;
    // one-handed slide: starts when a slide begins out of the tac sprint carry, ends once the player is back up
    if (st.slide && P.tac > 0.3) this.slideOneHand = true;
    this.upT = st.slide ? 0 : this.upT + dt;
    if (this.slideOneHand && (this.upT > 0.12 || st.ads > 0.1 || st.firing || this.clip)) this.slideOneHand = false;
    P.oneHand = damp(P.oneHand, this.slideOneHand ? 1 : 0, this.slideOneHand ? 12 : 9, dt);
    const noAds = 1 - adsE;

    // ---- base pose
    const ey = w.sightY, ez = w.sightZ, er = w.eyeRelief;
    const pos = _v.set(lerp(this.hip.x, 0, adsE), lerp(this.hip.y, -ey, adsE), lerp(this.hip.z, -(er + ez), adsE) - adsOver * 0.06);
    let rx = 0, ry = 0, rz = 0;
    // hip: slight inward cant like CoD
    ry += 0.025 * noAds; rz += 0.02 * noAds;
    const pistol = this.isPistol ? 1 : 0;
    const rifleSprint = P.sprint * (1 - pistol), rifleTac = P.tac * (1 - pistol);
    const prun = Math.max(P.sprint, P.tac) * pistol;
    const ph = st.bobPhase;
    // sprint: lowered and canted across the body
    pos.x += -0.035 * rifleSprint; pos.y += -0.035 * rifleSprint; pos.z += 0.035 * rifleSprint;
    rx += -0.36 * rifleSprint; ry += 0.62 * rifleSprint; rz += 0.34 * rifleSprint;
    // tac sprint: carry position here, the vertical carry itself is a rotation layer applied below
    const TP = TAC_POSE;
    const vmc0 = this.game.engine.vmCamera;
    const tacX = TP[0] * -(this.hip.z + TP[2]) * Math.tan(vmc0.fov * Math.PI / 360) * vmc0.aspect;
    pos.x += (tacX - this.hip.x) * rifleTac; pos.y += TP[1] * rifleTac; pos.z += TP[2] * rifleTac;
    // pistol sprint (BO1/BO2): whole-arm pump, the hand bulges forward through the middle of the stroke
    if (prun > 0.001) {
      const k = (1 + Math.sin(ph)) / 2, arc = Math.sin(k * Math.PI);
      const B = PISTOL_SWING.back, F = PISTOL_SWING.front;
      pos.x += lerp(B[0], F[0], k) * prun; pos.y += (lerp(B[1], F[1], k) + arc * 0.03) * prun; pos.z += (lerp(B[2], F[2], k) - arc * 0.045) * prun;
      rx += lerp(B[3], F[3], k) * prun; ry += lerp(B[4], F[4], k) * prun; rz += lerp(B[5], F[5], k) * prun;
    }
    // slide / dive: hard cant (a one-handed slide carry replaces most of it)
    const oh = P.oneHand * noAds, SO = SLIDE_ONE_HAND;
    rz += (-0.34 * P.slide * (1 - oh * 0.8) - 0.55 * P.dive) * noAds; pos.y += -0.018 * P.slide * noAds; pos.x += -0.022 * P.slide * noAds;
    pos.x += SO[0] * oh; pos.y += SO[1] * oh; pos.z += SO[2] * oh;
    rx += SO[3] * oh; ry += SO[4] * oh; rz += SO[5] * oh;
    // mantle: weapon swung down & right (right hand only)
    pos.y += -0.16 * P.mantle; pos.x += 0.05 * P.mantle; rx += -0.75 * P.mantle; rz += 0.45 * P.mantle; ry += -0.2 * P.mantle;
    pos.y += -0.62 * P.stow; pos.x += 0.08 * P.stow; pos.z += 0.1 * P.stow; rx += -1.1 * P.stow; rz += 0.6 * P.stow;
    // prone crawl / lowered
    pos.y += -0.06 * P.crawl * noAds; rx += -0.35 * P.crawl * noAds; ry += 0.35 * P.crawl * noAds;
    pos.y += -0.08 * P.lower; rx += -0.5 * P.lower;
    rz += 0.05 * P.crouch * noAds;
    // corner slicing (cosmetic cant toward the opening)
    this.cornerRoll = damp(this.cornerRoll, st.corner || 0, 4, dt);
    rz += this.cornerRoll * 0.18 * noAds;

    // ---- bob (figure 8 with weighted footfalls), reduced while aiming
    const bobA = st.bobAmt * (1 - adsE * 0.88) * (1 - prun * 0.8);
    const sprintMul = 1 + rifleSprint * 1.1;
    const step = Math.pow(Math.abs(Math.cos(ph)), 1.6);
    pos.x += Math.sin(ph) * 0.013 * bobA * sprintMul;
    pos.y += -step * 0.013 * bobA * sprintMul;
    rz += Math.sin(ph) * 0.035 * bobA * sprintMul;
    ry += Math.cos(ph) * 0.012 * bobA * sprintMul;
    rx += (step - 0.5) * 0.02 * bobA * sprintMul;
    if (rifleTac > 0.01) {
      // the vertical carry hops with every footfall and rocks side to side (screen-relative, see layer below)
      const k = rifleTac * st.bobAmt;
      pos.y += (0.008 - step * 0.016) * k; pos.x += Math.sin(ph) * 0.01 * k;
      rz += Math.sin(ph) * 0.012 * k; rx += (step - 0.5) * 0.03 * k;
    }

    // ---- idle breathing
    this.breath += dt;
    const br = (1 - adsE * 0.85);
    pos.y += Math.sin(this.breath * 1.6) * 0.0018 * br;
    rx += Math.sin(this.breath * 1.6 + 0.6) * 0.004 * br;
    ry += Math.sin(this.breath * 0.8) * 0.003 * br;

    // ---- mouse sway (weapon lags behind the look direction)
    const swayK = 1 - adsE * 0.7;
    this.swayRot.setTarget(clamp(-st.lookDY * 0.0028, -0.14, 0.14) * swayK, clamp(-st.lookDX * 0.0028, -0.16, 0.16) * swayK, clamp(-st.lookDX * 0.002, -0.12, 0.12) * swayK);
    this.swayPos.setTarget(clamp(-st.lookDX * 0.00028, -0.014, 0.014) * swayK, clamp(st.lookDY * 0.00028, -0.014, 0.014) * swayK, 0);
    this.swayRot.update(dt); this.swayPos.update(dt);
    this.moveRot.setTarget(clamp(-st.vy * 0.014, -0.1, 0.1), 0, -st.strafe * 0.07 * swayK);
    this.moveRot.update(dt);
    if (st.landImpulse) this.land.impulse(st.landImpulse);
    this.land.update(dt);

    // ---- recoil + vibration
    this.recoilPos.update(dt); this.recoilRot.update(dt);
    this.vib = Math.max(0, this.vib - dt * 7);
    const vb = this.vib * (1 - adsE * 0.5);

    pos.x += this.clipPos.vx + this.joltPos.vx + this.swayPos.vx + this.recoilPos.vx + (Math.random() - 0.5) * 0.002 * vb;
    pos.y += this.clipPos.vy + this.joltPos.vy + this.swayPos.vy + this.recoilPos.vy + this.land.x * 0.055 + (Math.random() - 0.5) * 0.002 * vb;
    pos.z += this.clipPos.vz + this.joltPos.vz + this.recoilPos.vz;
    rx += this.clipRot.vx + this.joltRot.vx + this.swayRot.vx + this.moveRot.vx + this.recoilRot.vx + this.land.x * 0.14 + (Math.random() - 0.5) * 0.008 * vb;
    ry += this.clipRot.vy + this.joltRot.vy + this.swayRot.vy + this.recoilRot.vy + (Math.random() - 0.5) * 0.006 * vb;
    rz += this.clipRot.vz + this.joltRot.vz + this.swayRot.vz + this.moveRot.vz + this.recoilRot.vz + (Math.random() - 0.5) * 0.016 * vb;

    this.pivot.position.copy(pos);
    this.pivot.rotation.set(rx, ry, rz, 'YXZ');
    if (rifleTac > 0.001) {
      this.tacQ.setFromEuler(_e.set(TP[3], TP[4], TP[5], 'YXZ'));
      this.pivot.quaternion.multiply(_q.identity().slerp(this.tacQ, rifleTac));
    }
    this.pivot.updateMatrix();
    // the camera rides along a little with the reload pose and every mechanical jolt
    this.cam.set(this.clipRot.vx * 0.02 + this.joltRot.vx * 0.12, this.clipRot.vy * 0.012 + this.joltRot.vy * 0.05, -this.clipRot.vy * 0.015 + this.clipRot.vz * 0.03 + this.joltRot.vz * 0.1);

    // ---- animated parts
    const parts = w.parts, R = w.rest, S = this.scalars;
    this.shotKick = Math.max(0, this.shotKick - dt * 16);
    const kick = this.shotKick > 0 ? Math.sin(Math.min(1, this.shotKick) * Math.PI) : 0;
    if (parts.charge) parts.charge.position.z = R.charge.pos.z + (S.charge || 0) * 0.06;
    if (parts.bolt && this.def.fire !== 'bolt') parts.bolt.position.z = R.bolt.pos.z + kick * 0.035;
    if (parts.cover) parts.cover.rotation.x = (S.cover || 0) * 1.1;
    if (parts.pump) parts.pump.position.z = R.pump.pos.z + (S.pump || 0) * (w.pumpTravel || 0.08);
    if (parts.slide) {
      this.slideKick = Math.max(0, (this.slideKick || 0) - dt * 14);
      const sk = Math.sin(Math.min(1, this.slideKick) * Math.PI);
      const locked = S.slide !== undefined ? S.slide : this.persist.slide;
      parts.slide.position.z = Math.max(sk, locked) * 0.045;
    }
    if (parts.boltHandle) {
      parts.boltHandle.rotation.z = (S.boltLift || 0) * 1.25;
      parts.bolt.position.z = R.bolt.pos.z + (S.boltPull || 0) * 0.085;
    }
    if (parts.cylArm) parts.cylArm.rotation.z = (S.cyl || 0) * 1.25;
    if (parts.rounds) parts.rounds.visible = S.rounds === undefined ? true : S.rounds > 0.5;
    if (parts.shellHand) {
      const vis = (S.shell || 0) > 0.5;
      if (vis && parts.shellHand.parent !== this.lhand) { this.lhand.add(parts.shellHand); this.shellRel.decompose(parts.shellHand.position, parts.shellHand.quaternion, parts.shellHand.scale); }
      parts.shellHand.visible = vis;
    }

    // ---- hands on the weapon
    const c = this.clip;
    if (c && c.L) this.sampleHand(c.L, Math.min(1, this.clipT), true, this.lhand.position, this.lhand.quaternion);
    else { this.resolveAnchor('home', true, this._lh || (this._lh = {})); this.lhand.position.copy(this._lh.pos); this.lhand.quaternion.copy(this._lh.quat); }
    if (c && c.R) this.sampleHand(c.R, Math.min(1, this.clipT), false, this.rhand.position, this.rhand.quaternion);
    else { this.rhand.position.copy(this.rHome.pos); this.rhand.quaternion.copy(this.rHome.quat); }

    // ---- free left hand: plants on the ledge while mantling, pumps while sprinting, lets go in a tac slide
    const wantFree = !c && (st.mantle || (st.tac && !this.isPistol) || (this.isPistol && (st.sprint || st.tac)) || this.slideOneHand);
    this.freeW = damp(this.freeW, wantFree ? 1 : 0, wantFree ? 16 : 12, dt);
    if (this.freeW > 0.02) {
      this.pivot.updateMatrixWorld(true);
      const f = smoother(this.freeW);
      let tx, ty, tz;
      if (this.ledge) {
        // placed in updateLedgeHands, once the camera has moved this frame
      } else if (this.isPistol && !st.mantle && !this.slideOneHand) {
        // BO1/BO2: the left FIST pumps in counter-phase and only peeks into the lower left on its forward stroke.
        // The closed grip hand is lifted off the pistol into camera space.
        const k = (1 - Math.sin(ph)) / 2, arc = Math.sin(k * Math.PI);
        const B = PISTOL_SWING.fistBack, F = PISTOL_SWING.fistFront;
        _v3.set(lerp(B[0], F[0], k), lerp(B[1], F[1], k) + arc * 0.025, lerp(B[2], F[2], k) - arc * 0.04);
        _q.setFromEuler(_e.set(lerp(B[3], F[3], k), lerp(B[4], F[4], k), lerp(B[5], F[5], k), 'YXZ'));
        _m.compose(this.lhand.position, this.lhand.quaternion, ONE3).premultiply(this.pivot.matrix);
        _m.decompose(_v2, _q2, _s3);
        _v2.lerp(_v3, f); _q2.slerp(_q, f);
        _m.compose(_v2, _q2, ONE3).premultiply(_m2.copy(this.pivot.matrix).invert());
        _m.decompose(this.lhand.position, this.lhand.quaternion, _s3);
        this.lhandOpen.visible = false; this.lhand.visible = true;
      } else {
        const fist = this.lhand.getWorldPosition(_v2);
        const fq = this.lhand.getWorldQuaternion(_q2);
        if (st.mantle) {
          const k = st.mantleK || 0;
          tx = -0.16; ty = -0.1 - k * 0.18; tz = -0.44 + k * 0.1;
          _q.setFromEuler(_e.set(-0.25 - k * 0.3, 0.15, 0.05));
        } else if (this.slideOneHand) {
          // let go: the hand drops away out of the frame to the lower left for the slide
          tx = -0.26; ty = -0.44; tz = -0.2;
          _q.setFromEuler(_e.set(0.3, 0.4, 0.8));
        } else {
          tx = -0.2 + Math.sin(ph) * 0.03; ty = -0.32 + Math.max(0, Math.sin(ph)) * 0.13; tz = -0.26 + Math.cos(ph) * 0.13;
          _q.setFromEuler(_e.set(0.5 + Math.cos(ph) * 0.4, 0.35, 0.6));
        }
        this.lhandOpen.position.set(lerp(fist.x, tx, f), lerp(fist.y, ty, f), lerp(fist.z, tz, f));
        this.lhandOpen.quaternion.copy(fq).slerp(_q, f);
        this.lhandOpen.visible = this.freeW > 0.3;
        this.lhand.visible = this.freeW <= 0.3;
      }
    } else { this.lhandOpen.visible = false; this.lhand.visible = true; }
    if (!this.ledge) this.rhandOpen.visible = false;
    // ---- flat-hand slaps during clips (magazine tap / bolt release)
    const openUp = (S.openUp || 0) > 0.5, openSide = (S.openSide || 0) > 0.5;
    if (c && (openUp || openSide)) {
      this.pivot.updateMatrixWorld(true);
      this.lhandOpen.position.copy(this.lhand.position);
      this.pivot.localToWorld(this.lhandOpen.position);
      this.lhandOpen.position.add(_v2.set(0, openUp ? -0.02 : 0, 0).applyQuaternion(this.pivot.quaternion));
      // palm up under the mag / palm facing the receiver side, fingers forward
      _q.setFromEuler(_e.set(openUp ? 0.25 : 0.1, openUp ? 0.15 : 0.25, openUp ? Math.PI : Math.PI / 2));
      this.lhandOpen.quaternion.copy(this.pivot.quaternion).multiply(_q);
      this.lhandOpen.visible = true; this.lhand.visible = false;
    }

    // ---- muzzle flash + light
    if (this.flash.visible) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 70);
    if (this.flashLight.intensity > 0) this.flash.getWorldPosition(this.flashLight.position);

    // ---- barrel smoke after sustained fire
    this.heat = Math.max(0, this.heat - dt * 0.5);
    if (this.heat > 0.25 && Math.random() < dt * 14 * Math.min(1, this.heat)) {
      this.flash.getWorldPosition(_v2);
      this.smoke.spawn(_v2.x, _v2.y, _v2.z, rand(-0.01, 0.01), rand(0.03, 0.07), rand(-0.02, 0.01), rand(0.7, 1.3), rand(0.012, 0.022), 0.75, 0.75, 0.75, 0.12 * Math.min(1, this.heat), -0.01, 0.6, 3.5);
    }
    this.smoke.update(dt);
    const vmc = this.game.engine.vmCamera;
    this.smoke.mat.uniforms.scale.value = window.innerHeight / (2 * Math.tan(vmc.fov * Math.PI / 360));

    // ---- casings / dropped mags
    for (const o of this.casings) {
      if (o.life <= 0) continue;
      o.life -= dt;
      o.vel.y -= (o.grav || 5.5) * dt;
      o.obj.position.addScaledVector(o.vel, dt);
      o.obj.rotation.x += o.spin.x * dt; o.obj.rotation.y += o.spin.y * dt; o.obj.rotation.z += o.spin.z * dt;
      if (o.life <= 0) { o.active = false; o.obj.visible = false; if (!o.kind) { this.root.remove(o.obj); o.dead = true; } }
    }
    if (this.casings.some((o) => o.dead)) this.casings = this.casings.filter((o) => !o.dead);

    // ---- light: follow world sun, darken in shadow
    if (st.sunDirCam) { this.key.position.copy(st.sunDirCam).multiplyScalar(5); this.key.target.position.set(0, 0, 0); }
    this.shadowAmt = damp(this.shadowAmt, st.inShadow ? 0.22 : 1, 6, dt);
    this.key.intensity = 2.0 * this.shadowAmt;
    this.hemi.intensity = 1.35 + 0.45 * this.shadowAmt;
  }
}
const _v2 = new THREE.Vector3(), _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vx = new THREE.Vector3(), _vy = new THREE.Vector3(), _vz = new THREE.Vector3();
const _invQ = new THREE.Quaternion();
