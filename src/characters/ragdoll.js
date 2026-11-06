import * as THREE from 'three';

// =============================================================================
// Active ragdoll.
// The body: Verlet particles at the joints. Pelvis and ribcage are rigid blocks (shape matching) that turn on
// each other at the waist; arms, legs and the head hang on sticks. Joint limits (waist, neck, hips, knees,
// elbows), the body itself and the level keep every part where a body can put it.
// The muscles: for a moment after the hit the body still fights. It staggers one to three steps to stay up, each
// weaker than the last, a hand goes to the wound, the knees give, the arms reach for the ground it falls toward,
// the chin tucks when it goes over backwards. The legs carry it only while a foot stands on the ground, so it
// comes down with all its weight; there the muscles let go and it lies still. The hit decides how it fights: a
// head shot drops it where it stands, a shotgun up close knocks it back, a runner stumbles on and falls onto its
// hands. Once no will is left, nothing lifts it any more (see passive()).
// The skeleton's bones are re-oriented from the particles every frame.
// =============================================================================

// The 16 joints the finisher physics shares (motion.js): their order, sticks and sizes stay as they are.
const P = { pelvis: 0, chest: 1, neck: 2, head: 3, lHip: 4, rHip: 5, lKnee: 6, rKnee: 7, lFoot: 8, rFoot: 9, lSh: 10, rSh: 11, lElb: 12, rElb: 13, lHand: 14, rHand: 15 };
export const STICKS = [
  [0, 1], [1, 2], [2, 3],
  [4, 5], [10, 11], [10, 2], [11, 2], [10, 1], [11, 1], [4, 0], [5, 0], [10, 4], [11, 5], [10, 5], [11, 4], [1, 4], [1, 5], [3, 1], [3, 10], [3, 11],
  [4, 6], [6, 8], [5, 7], [7, 9], [10, 12], [12, 14], [11, 13], [13, 15],
];
export const RADIUS = [0.14, 0.15, 0.08, 0.13, 0.09, 0.09, 0.07, 0.07, 0.07, 0.07, 0.08, 0.08, 0.06, 0.06, 0.06, 0.06];

// Four more points of this ragdoll's own: the waist (where the ribcage turns on the pelvis), the sacrum, the pack
// on the back and the front of the vest. They give both blocks depth, and the torso its real shape on the ground.
const WAIST = 16, SACRUM = 17, BACK = 18, FRONT = 19, N = 20;
const RAD = [0.14, 0.15, 0.08, 0.13, 0.09, 0.09, 0.075, 0.075, 0.085, 0.085, 0.085, 0.085, 0.06, 0.06, 0.06, 0.06, 0.1, 0.09, 0.11, 0.1];
const MASS = [9, 10, 3, 5, 5, 5, 4, 4, 2.5, 2.5, 3.5, 3.5, 1.7, 1.7, 1, 1, 3, 3, 5, 4]; // kg, gear included
const IW = MASS.map((m) => 1 / m);
const PELVIS_BLOCK = [0, 4, 5, WAIST, SACRUM], RIB_BLOCK = [WAIST, 1, 2, 10, 11, BACK, FRONT];
const TORSO = [0, 4, 5, WAIST, SACRUM, 1, 2, 10, 11, BACK, FRONT, 3]; // what the balance holds up
const BLOCKS = [0, 4, 5, WAIST, SACRUM, 1, 2, 10, 11, BACK, FRONT];
const IN_BLOCK = new Uint8Array(20); for (const i of BLOCKS) IN_BLOCK[i] = 1;
const CARRY = [1, 1, 1, 1, 1, 1, 0.5, 0.5, 0, 0, 1, 1, 0.6, 0.6, 0.6, 0.6, 1, 1, 1, 1]; // how much of each part's weight the legs carry while it stands
const LINKS = [[4, 6], [6, 8], [5, 7], [7, 9], [10, 12], [12, 14], [11, 13], [13, 15], [2, 3]];
// how close parts may come: hands and elbows to the body, knees and feet to each other, the head to the pelvis and the knees
const NEAR = [
  [14, 0, 0.17], [15, 0, 0.17], [14, 1, 0.18], [15, 1, 0.18], [14, FRONT, 0.15], [15, FRONT, 0.15], [14, BACK, 0.16], [15, BACK, 0.16],
  [14, 3, 0.17], [15, 3, 0.17], [14, SACRUM, 0.14], [15, SACRUM, 0.14], [14, 15, 0.1], [14, 6, 0.12], [15, 7, 0.12], [14, 7, 0.12], [15, 6, 0.12],
  [12, 1, 0.17], [13, 1, 0.17], [12, 0, 0.17], [13, 0, 0.17], [12, FRONT, 0.15], [13, FRONT, 0.15], [12, BACK, 0.16], [13, BACK, 0.16],
  [6, 7, 0.14], [8, 9, 0.15], [6, 9, 0.13], [7, 8, 0.13], [6, 1, 0.21], [7, 1, 0.21], [6, FRONT, 0.18], [7, FRONT, 0.18],
  [3, 0, 0.3], [3, 6, 0.19], [3, 7, 0.19],
];
// how far the joints go (radians), as [toward +x, toward -x, forward, back] in the joint's own frame
const HIP_L = [0.35, 0.85, 2.05, 0.45], HIP_R = [0.85, 0.35, 2.05, 0.45]; // a leg goes far out, little across
// (the back bends leave room for a body lying on its pack: held tighter, the limits fight the floor and lift it)
const NECK_LIM = [0.6, 0.6, 0.95, 1.0], WAIST_LIM = [0.55, 0.55, 1.0, 0.6], WAIST_TWIST = 0.6;
// how far one pass of a joint limit may move a part (m) or turn a block (rad): a limb far out of its range comes back over a
// few steps instead of snapping across in one (the twitch of a body on the ground)
const STEP_MAX = 0.04, TURN_MAX = 0.1;
// (joint friction: LIMP_DAMP once the muscles are gone - heavy limbs don't swing on)
const G = 11, DAMP = 0.997, JOINT_DAMP = 0.025, LIMP_DAMP = 0.06, MU_S = 1.0, MU_K = 0.65;
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0), ORIGIN = new THREE.Vector3(), ZERO = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _q4 = new THREE.Quaternion(), _q5 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _bv = new THREE.Vector3(), _bq = new THREE.Quaternion(), _hit = {};
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// Keeps a direction u (unit, in a joint's own frame) inside an elliptic cone around +Y (ay = 1) or -Y (ay = -1).
// lim: [toward +x, toward -x, forward (-z), back (+z)]. True when u had to be moved.
function cone(u, ay, lim) {
  const hl = Math.hypot(u.x, u.z);
  if (hl < 1e-6) return false;
  const th = Math.atan2(hl, u.y * ay), cx = u.x / hl, cz = u.z / hl;
  const lx = cx >= 0 ? lim[0] : lim[1], lz = cz <= 0 ? lim[2] : lim[3];
  const max = 1 / Math.sqrt((cx / lx) * (cx / lx) + (cz / lz) * (cz / lz));
  if (th <= max) return false;
  const s = Math.sin(max);
  u.set(cx * s, Math.cos(max) * ay, cz * s);
  return true;
}

// A group of particles that keeps its shape: each step it is fitted (centroid and turn) to where the particles
// went, and they are put back in place. q is how the block is turned in the world, which is its bone's world rotation.
class Block {
  constructor(ids, bone, p) {
    this.ids = ids;
    this.m = ids.map((i) => MASS[i]);
    this.M = this.m.reduce((s, m) => s + m, 0);
    const loc = ids.map((i) => bone.worldToLocal(p[i].clone()));
    this.c0 = new THREE.Vector3();
    loc.forEach((l, k) => this.c0.addScaledVector(l, this.m[k] / this.M));
    this.r = loc.map((l) => l.sub(this.c0));
    this.q = bone.getWorldQuaternion(new THREE.Quaternion());
    this.c = new THREE.Vector3();
    this.match(p, 0);
  }

  // (the turn comes from the covariance of the block, found by Mueller et al.'s iteration from the last turn)
  match(p, stiff = 1) {
    const ids = this.ids, m = this.m, r = this.r, n = ids.length;
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < n; k++) { const q = p[ids[k]]; cx += q.x * m[k]; cy += q.y * m[k]; cz += q.z * m[k]; }
    cx /= this.M; cy /= this.M; cz /= this.M;
    let a0x = 0, a0y = 0, a0z = 0, a1x = 0, a1y = 0, a1z = 0, a2x = 0, a2y = 0, a2z = 0;
    for (let k = 0; k < n; k++) {
      const q = p[ids[k]], R = r[k], dx = (q.x - cx) * m[k], dy = (q.y - cy) * m[k], dz = (q.z - cz) * m[k];
      a0x += dx * R.x; a0y += dy * R.x; a0z += dz * R.x;
      a1x += dx * R.y; a1y += dy * R.y; a1z += dz * R.y;
      a2x += dx * R.z; a2y += dy * R.z; a2z += dz * R.z;
    }
    const q = this.q;
    for (let it = 0; it < 4; it++) {
      const x = q.x, y = q.y, z = q.z, w = q.w;
      const r0x = 1 - 2 * (y * y + z * z), r0y = 2 * (x * y + w * z), r0z = 2 * (x * z - w * y);
      const r1x = 2 * (x * y - w * z), r1y = 1 - 2 * (x * x + z * z), r1z = 2 * (y * z + w * x);
      const r2x = 2 * (x * z + w * y), r2y = 2 * (y * z - w * x), r2z = 1 - 2 * (x * x + y * y);
      const den = Math.abs(r0x * a0x + r0y * a0y + r0z * a0z + r1x * a1x + r1y * a1y + r1z * a1z + r2x * a2x + r2y * a2y + r2z * a2z) + 1e-9;
      const ox = (r0y * a0z - r0z * a0y + r1y * a1z - r1z * a1y + r2y * a2z - r2z * a2y) / den;
      const oy = (r0z * a0x - r0x * a0z + r1z * a1x - r1x * a1z + r2z * a2x - r2x * a2z) / den;
      const oz = (r0x * a0y - r0y * a0x + r1x * a1y - r1y * a1x + r2x * a2y - r2y * a2x) / den;
      const ang = Math.sqrt(ox * ox + oy * oy + oz * oz);
      if (ang < 1e-6) break;
      _bq.setFromAxisAngle(_bv.set(ox / ang, oy / ang, oz / ang), ang);
      q.premultiply(_bq).normalize();
    }
    this.c.set(cx, cy, cz);
    if (stiff > 0) for (let k = 0; k < n; k++) {
      const g = _bv.copy(r[k]).applyQuaternion(q), t = p[ids[k]];
      t.x += (cx + g.x - t.x) * stiff; t.y += (cy + g.y - t.y) * stiff; t.z += (cz + g.z - t.z) * stiff;
    }
  }

  // a point given in the bone's frame, where it is in the world now
  toWorld(local, out) { return out.copy(local).sub(this.c0).applyQuaternion(this.q).add(this.c); }
}

export class Ragdoll {
  constructor(sol, col, opts = {}) {
    this.sol = sol; this.col = col;
    sol.root.updateMatrixWorld(true);
    const wp = (o, x = 0, y = 0, z = 0) => o.localToWorld(new THREE.Vector3(x, y, z));
    const L = sol.legs, A = sol.arms;
    const p = this.p = [
      wp(sol.pelvis), wp(sol.chest), wp(sol.head), wp(sol.head, 0, 0.12, 0),
      wp(L[0].thigh), wp(L[1].thigh), wp(L[0].knee), wp(L[1].knee), wp(L[0].foot), wp(L[1].foot),
      wp(A[0].upper), wp(A[1].upper), wp(A[0].fore), wp(A[1].fore), wp(A[0].hand), wp(A[1].hand),
      wp(sol.spine), wp(sol.pelvis, 0, 0, 0.1), wp(sol.chest, 0, 0.1, 0.13), wp(sol.chest, 0, 0.1, -0.08),
    ];
    this.h = 1 / 120; // the length of the last step
    const v = opts.vel || ZERO;
    this.o = p.map((q) => q.clone().addScaledVector(v, -this.h));
    this.pb = new Block(PELVIS_BLOCK, sol.pelvis, p);
    this.tb = new Block(RIB_BLOCK, sol.chest, p);
    this.qP0 = this.pb.q.clone(); this.qT0 = this.tb.q.clone(); this.wP = new THREE.Vector3(); this.wT = new THREE.Vector3();
    this.len = LINKS.map(([a, b]) => p[a].distanceTo(p[b]));
    const leg = [this.len[0] + this.len[1], this.len[2] + this.len[3]], arm = [this.len[4] + this.len[5], this.len[6] + this.len[7]];
    this.fold = [[4, 8, leg[0] * 0.28], [5, 9, leg[1] * 0.28], [10, 14, arm[0] * 0.26], [11, 15, arm[1] * 0.26]]; // knees and elbows fold only so far
    this.acc = new Float32Array(N * 3); this.vel = new Float32Array(N * 3);
    this.back1 = new Float32Array(N * 3); this.back2 = new Float32Array(N * 3); this.moved = 1;
    this.touch = new Uint8Array(N); this.touched = new Uint8Array(N); this.lying = new Float32Array(N); // lying: contact, remembered for a few steps
    // parts that start inside the level (boots sunk into the floor, a hand in a wall) grow into their full size instead of being shot out
    this.rad = Float32Array.from(RAD);
    for (let i = 0; i < N; i++) {
      if (!col.pushOutSphere(_a.copy(p[i]), RAD[i])) continue;
      this.rad[i] = Math.max(0.01, RAD[i] - _a.distanceTo(p[i]) - 0.003);
    }
    this.handT = [new THREE.Vector3(), new THREE.Vector3()]; this.handOm = [0, 0];
    this.footT = [new THREE.Vector3(), new THREE.Vector3()]; this.footOm = [0, 0];
    this.fall = new THREE.Vector3();
    this.t = 0; this.ls = 1; this.kneelT = -1; this.still = 0; this.asleep = false; this.landT = -1; this.gave = false;
    this.S = 0; this.tone = 0; this.headT = 0; this.neckOm = 0; this.waistFlex = 0; this.waistOm = 0;
    this.plan = this.makePlan(sol, opts);
    this.kick(opts);
    // the skeleton now lives in world space
    sol.root.position.set(0, 0, 0); sol.root.rotation.set(0, 0, 0); sol.root.updateMatrixWorld(true);
  }

  // How this body is going to fight, from what hit it and how it stood. (Called while the bones still stand as they died.)
  makePlan(sol, opts) {
    const p = this.p, s = opts.strength || 3, part = opts.part || 'chest', d = opts.dir || ZERO, v = opts.vel || ZERO, rnd = Math.random;
    const fwd = _a.set(0, 0, -1).applyQuaternion(this.pb.q); fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const back = d.x * fwd.x + d.z * fwd.z > 0.45; // the bullet came from behind
    // what it stands on
    const g0 = this.groundAt(p[8]), g1 = this.groundAt(p[9]);
    const gy = Math.max(g0 === null ? -1e9 : g0, g1 === null ? -1e9 : g1);
    const grounded = gy > -1e8 && Math.min(p[8].y, p[9].y) - gy < 0.25;
    this.gy = grounded ? gy : Math.min(p[8].y, p[9].y) - 0.1;
    const standH = p[0].y - this.gy;
    // a limb hit: which leg or arm is nearest to where the bullet went in (the even joints are the left side)
    let near = -1;
    if (part === 'limb' && opts.point) {
      let bd = Infinity;
      for (const i of [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) { const dd = p[i].distanceToSquared(opts.point); if (dd < bd) { bd = dd; near = i; } }
    }
    const legHit = near >= 4 && near <= 9 ? near % 2 : -1, armHit = near >= 10 ? near % 2 : -1;
    const run = Math.hypot(v.x, v.z);
    const kind = part === 'head' ? 'head' : s >= 5.6 ? 'blast' : !grounded || standH < 0.55 ? 'down' : run > 3.6 ? 'run' : legHit >= 0 ? 'leg' : back ? 'back' : 'torso';
    // (stag: how fast the body staggers off the hit, m/s - its own reaction more than the bullet's push; the steps catch it)
    //                 support  hold  fade  steps tone  relax lean  stag
    const K = {
      torso: [1, 0.42, 0.3, 3, 0.95, 1.1, 0.1, 0.8],
      back: [0.95, 0.38, 0.3, 3, 0.9, 1.0, 0.22, 0.95],
      run: [0.9, 0.36, 0.28, 3, 0.9, 0.9, 0.3, 0],
      leg: [0.75, 0.16, 0.24, 1, 0.9, 1.0, 0.22, 0.25],
      head: [0, 0, 0, 0, 0.3, 0.22, 0, 0],
      blast: [0.55, 0.1, 0.18, 1, 0.45, 0.45, 0, 1.0],
      down: [0, 0, 0, 0, 0.75, 0.9, 0, 0],
    }[kind];
    const pl = { kind, sup: K[0], hold: K[1] * (0.8 + rnd() * 0.5), fade: K[2], steps: K[3] > 1 && rnd() < 0.35 ? K[3] - 1 : K[3], tone: K[4], relax: K[5], lean: K[6], stag: K[7] * (0.85 + rnd() * 0.35), standH, legHit, armHit, clutch: -1 };
    // which way it leans: with the hit; a runner with the run, a shot leg toward its side
    pl.leanDir = new THREE.Vector3(d.x, 0, d.z);
    if (kind === 'run') pl.leanDir.set(v.x, 0, v.z);
    if (kind === 'leg') pl.leanDir.copy(right).multiplyScalar(legHit === 0 ? -1 : 1);
    if (pl.leanDir.lengthSq() < 1e-6) pl.leanDir.copy(fwd).negate();
    pl.leanDir.normalize();
    // a hand goes to a wound in the chest or the belly, when it can reach it (not on the back)
    if ((kind === 'torso' || kind === 'down' || kind === 'run') && (part === 'chest' || part === 'stomach') && opts.point) {
      const w = (part === 'chest' ? sol.chest : sol.pelvis).worldToLocal(opts.point.clone());
      if (w.z < 0.04) {
        pl.clutch = Math.abs(w.x) < 0.04 ? (rnd() < 0.65 ? 1 : 0) : w.x > 0 ? 1 : 0;
        pl.clutchBlock = part === 'chest' ? 1 : 0;
        pl.clutchAt = part === 'chest' ? new THREE.Vector3(clamp(w.x, -0.15, 0.15), clamp(w.y, -0.04, 0.2), -0.25) : new THREE.Vector3(clamp(w.x, -0.13, 0.13), clamp(w.y, 0.02, 0.18), -0.19);
      }
    }
    // the torso as it stood, seen from the pelvis: the shape the balance holds it in, upright and without the heading
    const qi = _q.copy(this.pb.q).invert();
    pl.shape = TORSO.map((i) => _b.subVectors(p[i], p[0]).applyQuaternion(qi).clone());
    pl.tilt = new THREE.Quaternion().setFromAxisAngle(UP, -Math.atan2(-fwd.x, -fwd.z)).multiply(this.pb.q);
    // the feet: on the ground they stand, a shot leg doesn't
    // (each foot is planted on the ground under it: one that was in the air as it died - a runner's - isn't standing anywhere yet)
    this.feet = [0, 1].map((k) => { const gk = k === 0 ? g0 : g1; return { mode: grounded && pl.sup > 0 && k !== legHit ? 'stance' : 'free', plant: new THREE.Vector3(p[8 + k].x, gk === null ? p[8 + k].y : Math.min(p[8 + k].y, gk + RAD[8] + 0.03), p[8 + k].z), from: new THREE.Vector3(), to: new THREE.Vector3(), t0: 0, dur: 0.2 }; });
    this.stepsLeft = pl.steps; this.stepsDone = 0; this.stepEnd = -1; this.grip = 1;
    return pl;
  }

  groundAt(pt, from = 0.3, len = 1.4) { const r = this.col.raycast(pt.x, pt.y + from, pt.z, 0, -1, 0, len, _hit); return r ? r.y : null; }

  // The bullet: a kick to the part it hit, fading with the distance from where it went in, and a little for the whole body.
  kick(opts) {
    const d = opts.dir, p = this.p, o = this.o, h = this.h, pl = this.plan;
    if (d) {
      const s = opts.strength || 3, at = opts.point || p[opts.part === 'head' ? 3 : opts.part === 'stomach' ? 0 : 1];
      for (let i = 0; i < N; i++) {
        // the part that was hit jerks; the body as a whole hardly moves (a bullet doesn't throw a man, his legs give)
        const w = Math.exp(-p[i].distanceToSquared(at) / 0.06);
        o[i].addScaledVector(d, -s * (0.75 * w + 0.05) * (pl.kind === 'head' ? 0.5 : 1) * h);
      }
    }
    // it staggers off the hit: the torso and the arms move off the feet, which stay where they stand (the steps catch it)
    if (pl.stag > 0) for (let i = 0; i < N; i++) {
      const f = i === 8 || i === 9 ? 0 : i === 6 || i === 7 ? 0.5 : 1;
      o[i].addScaledVector(pl.leanDir, -pl.stag * f * h);
    }
    // a little twist of the arms, so no two deaths look the same
    for (const i of [10, 11, 14, 15]) o[i].add(_a.set((Math.random() - 0.5) * 0.9, 0, (Math.random() - 0.5) * 0.9).multiplyScalar(h));
    const fwd = _a.set(0, 0, -1).applyQuaternion(this.pb.q);
    if (pl.kind === 'head') this.give(1.25, 0.8); // the lights go out: the knees fold where it stands
    if (pl.kind === 'blast') { for (let i = 0; i < N; i++) o[i].addScaledVector(d, -(opts.strength || 3) * 0.11 * h); this.give(0.5, 0.1); } // knocked back off its feet
    if (pl.legHit >= 0) o[6 + pl.legHit].addScaledVector(fwd, -1.2 * h); // the shot leg buckles
  }

  // the knees give: forward, and the hips drop
  give(knee, hips) {
    const fwd = _a.set(0, 0, -1).applyQuaternion(this.pb.q), h = this.h, o = this.o;
    o[6].addScaledVector(fwd, -knee * h); o[7].addScaledVector(fwd, -knee * h);
    for (const i of PELVIS_BLOCK) o[i].y += hips * h;
  }

  update(dt) {
    if (this.asleep) return;
    const n = Math.min(4, Math.max(1, Math.ceil(dt * Ragdoll.hz - 0.01))), h = dt / n;
    for (let i = 0; i < n; i++) { this.t += h; this.step(h); }
    if (!(this.p[0].x === this.p[0].x)) { this.asleep = true; return; } // (never happens; if it did, the last good pose stays)
    // asleep once the muscles are gone and nothing moves any more; and a body that has lain there a while and only still
    // creeps (the joint limits nudging against the floor, slower than anything falls) is at rest as well
    let vmax = 0;
    if (this.tone < 0.01 && this.landT >= 0 && this.t > this.landT + 1.4) {
      const p = this.p, o = this.o, ih = 1 / this.h;
      for (let i = 0; i < N; i++) vmax = Math.max(vmax, Math.abs(p[i].x - o[i].x) + Math.abs(p[i].y - o[i].y) + Math.abs(p[i].z - o[i].z));
      vmax *= ih;
    }
    const calm = this.tone < 0.01 && this.landT >= 0 && (this.moved < 0.06 || (this.t > this.landT + 1.4 && vmax < 0.45));
    this.still = calm ? this.still + dt : 0;
    if (this.still > 0.35 || this.t > 9) this.asleep = true;
    this.apply();
  }

  step(h) {
    const p = this.p, o = this.o, A = this.acc, V = this.vel, ih = 1 / this.h, r = clamp(h * ih, 0.5, 2);
    for (let i = 0; i < N; i++) { V[i * 3] = (p[i].x - o[i].x) * ih; V[i * 3 + 1] = (p[i].y - o[i].y) * ih; V[i * 3 + 2] = (p[i].z - o[i].z) * ih; }
    this.spin(this.pb.q, this.qP0, ih, this.wP); this.spin(this.tb.q, this.qT0, ih, this.wT);
    this.touched.set(this.touch);
    for (let i = 0; i < N; i++) this.lying[i] = this.touch[i] ? 1 : this.lying[i] * 0.85;
    this.think();
    A.fill(0);
    for (let i = 0; i < N; i++) A[i * 3 + 1] = -G;
    this.muscles();
    const h2 = h * h;
    let E0 = 1e-9;
    // once it lies there without a will, what still moves slowly comes to rest (clothes, gear and the ground see to that)
    const settle = this.landT >= 0 && this.tone < 0.05, slow = 0.3 * this.h * 0.3 * this.h;
    for (let i = 0; i < N; i++) {
      const pi = p[i], oi = o[i], k = r * (settle && pi.distanceToSquared(oi) < slow ? 0.96 : DAMP);
      const vx = (pi.x - oi.x) * k + A[i * 3] * h2, vy = (pi.y - oi.y) * k + A[i * 3 + 1] * h2, vz = (pi.z - oi.z) * k + A[i * 3 + 2] * h2;
      oi.copy(pi);
      pi.x += vx; pi.y += vy; pi.z += vz;
      E0 += MASS[i] * (vx * vx + vy * vy + vz * vz);
    }
    // the joints have friction: what swings at a joint slows down, the body as a whole doesn't (arms and legs don't swing on like
    // pendulums), and more of it once the muscles are gone: a limp arm is heavy, it flops and lies, it doesn't swing
    const jd = JOINT_DAMP + (LIMP_DAMP - JOINT_DAMP) * (1 - Math.min(1, this.tone * 1.5 + this.S));
    for (let k = 0; k < LINKS.length; k++) {
      const a = LINKS[k][0], b = LINKS[k][1], oa = o[a], ob = o[b], pa = p[a], pb = p[b], wa = IW[a], wb = IW[b], f = jd / (wa + wb);
      const dx = (pb.x - ob.x) - (pa.x - oa.x), dy = (pb.y - ob.y) - (pa.y - oa.y), dz = (pb.z - ob.z) - (pa.z - oa.z);
      ob.x += dx * f * wb; ob.y += dy * f * wb; ob.z += dz * f * wb;
      oa.x -= dx * f * wa; oa.y -= dy * f * wa; oa.z -= dz * f * wa;
    }
    this.h = h;
    for (let i = 0; i < N; i++) if (this.rad[i] < RAD[i]) this.rad[i] = Math.min(RAD[i], this.rad[i] + 0.12 * h);
    this.qP0.copy(this.pb.q); this.qT0.copy(this.tb.q);
    this.touch.fill(0);
    // Once it has lain there a moment without a will, the joint limits go soft: a body at rest doesn't hold itself in shape, it
    // lies how it fell, and hard limits fighting the floor would push it about (a corpse sitting itself up, a leg twitching).
    this.ls = this.landT >= 0 ? 1 - 0.65 * smooth((this.t - this.landT - 0.3) / 0.5) * (1 - Math.min(1, this.tone * 4)) : 1;
    const n = Ragdoll.iter;
    for (let k = 0; k < n; k++) {
      this.links();
      this.pb.match(p); this.tb.match(p);
      this.waist(); this.neck(); this.hips(); this.hinges();
      this.near();
      if (k & 1 || k === n - 1) this.collide();
    }
    // what of the torso rests on the floor keeps no speed upward from the corrections: pushed out of it, yes, thrown up, no
    if (settle) for (let i = 0; i < N; i++) {
      if ((IN_BLOCK[i] || i === 3) && this.lying[i] > 0.5 && p[i].y - o[i].y > 0.25 * h) o[i].y = p[i].y - 0.25 * h;
    }
    this.passive(h);
    // how far anything got in two steps
    let m = 0;
    for (let i = 0; i < N; i++) {
      const k = i * 3, B1 = this.back1, B2 = this.back2;
      m = Math.max(m, Math.abs(p[i].x - B2[k]) + Math.abs(p[i].y - B2[k + 1]) + Math.abs(p[i].z - B2[k + 2]));
      B2[k] = B1[k]; B2[k + 1] = B1[k + 1]; B2[k + 2] = B1[k + 2]; B1[k] = p[i].x; B1[k + 1] = p[i].y; B1[k + 2] = p[i].z;
    }
    this.moved = m / (2 * h);
    // The limits only ever hold the body together; they don't give it speed. When parts fight each other (folded up on the
    // ground, say) they would, a little every step, until the body jumps: whatever they added is taken back.
    let E1 = 0;
    for (let i = 0; i < N; i++) { const dx = p[i].x - o[i].x, dy = p[i].y - o[i].y, dz = p[i].z - o[i].z; E1 += MASS[i] * (dx * dx + dy * dy + dz * dz); }
    if (E1 > E0) {
      const f = Math.sqrt(E0 / E1);
      for (let i = 0; i < N; i++) { const pi = p[i], oi = o[i]; oi.x = pi.x - (pi.x - oi.x) * f; oi.y = pi.y - (pi.y - oi.y) * f; oi.z = pi.z - (pi.z - oi.z) * f; }
    }
  }

  // With no will left, nothing can lift the body: the energy of a passive body (its speed and its height) only ever goes down,
  // to friction and the floor. What the solver adds anyway, limits pushing against the floor a little every step until a corpse
  // sits itself up or creeps, is taken back: speed first, then whatever rose this step. (While the muscles still work, they may
  // lift it: staggering, bracing.)
  passive(h) {
    if (this.tone > 0.02 || this.S > 1e-3) { this.Emax = Infinity; return; }
    const p = this.p, o = this.o, B = this.back1, ih2 = 1 / (h * h);
    let ke = 0, pe = 0;
    for (let i = 0; i < N; i++) {
      const dx = p[i].x - o[i].x, dy = p[i].y - o[i].y, dz = p[i].z - o[i].z;
      ke += 0.5 * MASS[i] * (dx * dx + dy * dy + dz * dz) * ih2; pe += MASS[i] * G * p[i].y;
    }
    const E = ke + pe, tol = 0.4; // J (for the whole body: well under a millimetre of height)
    if (!(this.Emax < Infinity)) { this.Emax = E; return; }
    let excess = E - this.Emax - tol;
    if (excess > 0) {
      if (ke > excess) {
        const f = Math.sqrt((ke - excess) / ke);
        for (let i = 0; i < N; i++) { const pi = p[i], oi = o[i]; oi.x = pi.x - (pi.x - oi.x) * f; oi.y = pi.y - (pi.y - oi.y) * f; oi.z = pi.z - (pi.z - oi.z) * f; }
      } else {
        for (let i = 0; i < N; i++) o[i].copy(p[i]);
        excess -= ke;
        // the height it gained this step: what rose goes back toward where it was a step ago (that place was out of the floor)
        let up = 0;
        for (let i = 0; i < N; i++) { const d = p[i].y - B[i * 3 + 1]; if (d > 0) up += MASS[i] * G * d; }
        if (up > 1e-9) {
          const f = Math.max(0, 1 - excess / up);
          for (let i = 0; i < N; i++) { const d = p[i].y - B[i * 3 + 1]; if (d > 0) { p[i].y = B[i * 3 + 1] + d * f; o[i].y = p[i].y; } }
        }
      }
    } else this.Emax = Math.min(this.Emax, E);
  }

  // how fast a block turns (world, rad/s), from its turn now and one step ago
  spin(q, q0, ih, out) {
    const d = _q5.copy(q0).invert().premultiply(q);
    const s = d.w < 0 ? -2 * ih : 2 * ih;
    out.set(d.x * s, d.y * s, d.z * s);
  }

  // ---------------------------------------------------------------- the will: what the muscles want this step
  think() {
    const t = this.t, pl = this.plan, p = this.p, V = this.vel, pb = this.pb, tb = this.tb;
    const end = pl.hold + pl.fade;
    const S = this.S = t < pl.hold ? pl.sup : t < end ? pl.sup * (1 - smooth((t - pl.hold) / pl.fade)) : 0;
    let tone = pl.tone * (1 - smooth((t - end) / pl.relax));
    // (on the ground it goes limp soon: what is left of the muscles there would only push against the floor and lift it; and once it
    // has sunk onto its knees it doesn't kneel there upright for long, it topples)
    if (this.landT >= 0) tone *= 1 - smooth((t - this.landT - 0.15) / 0.6);
    if (this.kneelT < 0 && this.S < 0.05 && (this.touched[6] || this.touched[7]) && p[0].y - this.gy < pl.standH * 0.62) this.kneelT = t;
    if (this.kneelT >= 0) tone *= 1 - smooth((t - this.kneelT - 0.2) / 0.45);
    this.tone = tone;
    // the knees give as the balance goes
    if (!this.gave && pl.sup > 0 && S < pl.sup * 0.45) { this.gave = true; if (this.touched[8] || this.touched[9]) this.give(0.7, 0.35); }
    // the legs hold the body up only while a foot stands on something: what is in the air falls with all its weight
    // and only as far as it stands over them: a body that has gone too far past its feet, is bent over toward the ground or
    // has already sunk to its knees doesn't get held (or pushed back) up, it goes down
    let grip = 0, fx = 0, fz = 0, nf = 0;
    for (let j = 0; j < 2; j++) {
      const F = this.feet[j];
      if (F.mode !== 'stance') continue;
      grip = Math.max(grip, 1 - smooth((p[8 + j].y - F.plant.y - 0.04) / 0.1));
      fx += p[8 + j].x; fz += p[8 + j].z; nf++;
    }
    if (nf) {
      const off = Math.hypot(p[0].x - fx / nf, p[0].z - fz / nf);
      const dx = p[1].x - p[0].x, dy = p[1].y - p[0].y, dz = p[1].z - p[0].z, up = dy / (Math.sqrt(dx * dx + dy * dy + dz * dz) || 1);
      // (a runner's hips are well ahead of the foot it stands on, mid-stride: that is no reason yet to give up)
      const offOk = pl.kind === 'run' ? 0.5 : 0.28;
      grip *= (1 - smooth((off - offOk) / 0.32)) * smooth((up - 0.35) / 0.4) * smooth(((p[0].y - this.gy) / pl.standH - 0.5) / 0.22);
    }
    this.grip = grip;
    // down on the ground (and how hard it came down: for the sound)
    const T = this.touched;
    if (this.landT < 0 && t > end + 0.05 && (T[0] || T[1] || T[BACK] || T[FRONT] || T[SACRUM] || T[WAIST])) {
      this.landT = t;
      let v = 0;
      for (const i of BLOCKS) v = Math.max(v, -V[i * 3 + 1]);
      if (this.onLand) this.onLand(v, p[1]);
    }
    if (S > 0.3 && this.stepsLeft > 0) this.stepping(t);
    // falling: where to, and is that forward (or to the side) for the ribcage?
    const falling = this.landT < 0 && S < 0.35 && t > 0.08;
    let front = 0, fallOk = false;
    const ft = _d.set(0, 0, -1).applyQuaternion(tb.q); ft.y = 0; ft.normalize();
    if (falling) {
      const fx = p[1].x - (p[8].x + p[9].x) * 0.5 + V[3] * 0.25, fz = p[1].z - (p[8].z + p[9].z) * 0.5 + V[5] * 0.25, fl = Math.hypot(fx, fz);
      if (fl > 0.08) { this.fall.set(fx / fl, 0, fz / fl); fallOk = true; front = this.fall.dot(ft); }
    }
    const chestH = p[1].y - this.gy, ahead = fallOk && chestH > 0.3 && front > -0.35, over = fallOk && chestH > 0.3 && !ahead;
    // the arms
    const side = _e.set(1, 0, 0).applyQuaternion(tb.q); side.y = 0; side.normalize();
    for (let k = 0; k < 2; k++) {
      const s = k === 0 ? -1 : 1, H = this.handT[k];
      let om = 0;
      if (k === pl.armHit || tone < 0.02) om = 0; // a shot arm hangs
      else if (falling && ahead) {
        // forward or to the side: both hands go out to the ground ahead
        // (once the hand is down, the arm holds, it doesn't push the body back up)
        H.set(p[1].x + this.fall.x * 0.38 + side.x * s * 0.2, this.gy + 0.07, p[1].z + this.fall.z * 0.38 + side.z * s * 0.2); om = T[14 + k] ? 2.5 : 18;
      } else if (falling && over && k !== pl.clutch) {
        // over backwards: the free hand reaches back for the ground
        H.set(p[1].x - ft.x * 0.3 + side.x * s * 0.32, this.gy + 0.1, p[1].z - ft.z * 0.3 + side.z * s * 0.32); om = 12;
      } else if (k === pl.clutch && (this.landT < 0 || t < this.landT + 0.5)) {
        // the hand on the wound
        (pl.clutchBlock ? tb : pb).toWorld(pl.clutchAt, H); om = 20;
      } else if (S > 0.2) {
        // the other arm out, for balance
        tb.toWorld(_b.set(s * 0.44, -0.28, -0.14), H); om = 10;
      }
      this.handOm[k] = om * tone;
    }
    // the head: looking at what hit it; then up when it falls forward, chin in when it goes over backwards
    this.headT = falling && ahead ? 0.3 : falling && over ? -0.6 : -0.15;
    this.neckOm = pl.kind === 'head' || this.lying[3] > 0.2 ? 0 : 22 * tone; // (a head on the floor isn't held up)
    // the waist: a little curl round the wound (arched from a shot in the back), more of one as it falls; nothing once it is down
    this.waistFlex = pl.kind === 'back' && S > 0.2 ? 0.15 : falling ? -0.3 : -0.12;
    this.waistOm = this.landT < 0 ? 14 * tone : 0;
    // the legs, once the balance is gone and while it falls: knees a little bent and together (not when a knee is already
    // on the ground: that would stand it back up). (No last kick of a leg once it lies: drawn up against the floor, it
    // tipped the whole body up, and it looked wound up.)
    for (let k = 0; k < 2; k++) {
      const s = k === 0 ? -1 : 1;
      let om = S > 0.05 || k === pl.legHit || this.landT >= 0 || T[6] || T[7] ? 0 : 6 * tone;
      _b.set(s * 0.13, -0.8, -0.1);
      pb.toWorld(_b, this.footT[k]);
      this.footOm[k] = om;
    }
  }

  // Staggering: when the body moves too far to stop over its feet, a foot steps to where it can (the capture point).
  stepping(t) {
    const p = this.p, V = this.vel, F = this.feet;
    if (F[0].mode === 'swing' || F[1].mode === 'swing' || F[0].mode !== 'stance' || F[1].mode !== 'stance' || t < 0.06 || t - this.stepEnd < 0.05) return;
    const T = Math.sqrt(Math.max(0.3, p[0].y - this.gy) / G) * 1.1;
    const cx = p[0].x + V[0] * T, cz = p[0].z + V[2] * T;
    const sx = (F[0].plant.x + F[1].plant.x) * 0.5, sz = (F[0].plant.z + F[1].plant.z) * 0.5;
    if (Math.hypot(cx - sx, cz - sz) < 0.11) return;
    // the foot farther from there steps, to its own side of the body, never across the other one, at most 60 cm
    const k = Math.hypot(cx - F[0].plant.x, cz - F[0].plant.z) > Math.hypot(cx - F[1].plant.x, cz - F[1].plant.z) ? 0 : 1, s = k === 0 ? -1 : 1;
    const right = _a.set(1, 0, 0).applyQuaternion(this.pb.q); right.y = 0; right.normalize();
    let tx = cx + right.x * s * 0.11, tz = cz + right.z * s * 0.11;
    const other = F[1 - k].plant, across = ((tx - other.x) * right.x + (tz - other.z) * right.z) * s;
    if (across < 0.14) { tx += right.x * s * (0.14 - across); tz += right.z * s * (0.14 - across); }
    const f = p[8 + k], dx = tx - f.x, dz = tz - f.z, dl = Math.hypot(dx, dz);
    const reach = this.plan.kind === 'run' ? 0.85 : 0.6;
    if (dl > reach) { tx = f.x + dx * reach / dl; tz = f.z + dz * reach / dl; }
    const g = this.col.raycast(tx, p[0].y, tz, 0, -1, 0, 2.5, _hit);
    const sw = F[k];
    // (a stagger: slower than a walking step, and each one lower and weaker than the one before - the legs are going)
    sw.mode = 'swing'; sw.t0 = t; sw.dur = (this.plan.kind === 'run' ? 0.16 : 0.22) + Math.random() * 0.07 + this.stepsDone * 0.03;
    sw.lift = Math.max(0.05, 0.13 - this.stepsDone * 0.03);
    sw.from.copy(f); sw.to.set(tx, (g ? g.y : f.y - 0.3) + RAD[8], tz);
    this.stepsLeft--; this.stepsDone++;
  }

  // ---------------------------------------------------------------- forces: weight, balance, muscles
  muscles() {
    const p = this.p, A = this.acc, V = this.vel, t = this.t, pl = this.plan, S = this.S, dmax = 0.9 / this.h;
    if (S > 1e-3) {
      // (the muscles answer the hit a moment late; they only hold up what stands on a foot, and less with every stagger)
      const k = S * smooth((t - 0.03) / 0.12) * this.grip * (1 - 0.12 * this.stepsDone);
      for (let i = 0; i < N; i++) A[i * 3 + 1] += G * k * CARRY[i];
      if (k > 1e-3) {
        // the torso held in its standing shape: upright or leaning, heading where it heads now, the pelvis at standing height
        const f = _a.set(0, 0, -1).applyQuaternion(this.pb.q);
        // (a runner and a body shot in the back pitch on forward, ever more; every stagger bends it further over and lower)
        const lean = (pl.kind === 'run' ? pl.lean + 0.45 * smooth(t / 0.5) : pl.kind === 'back' ? pl.lean + 0.35 * smooth(t / 0.35) : pl.lean) + 0.08 * this.stepsDone;
        const Q = _q.setFromAxisAngle(UP, Math.atan2(-f.x, -f.z)).multiply(pl.tilt);
        Q.premultiply(_q2.setFromAxisAngle(_b.crossVectors(UP, pl.leanDir).normalize(), lean));
        const y = this.gy + pl.standH * (1 - 0.14 * smooth(t / Math.max(0.05, pl.hold + pl.fade)) - 0.035 * this.stepsDone);
        const om = 16, dm = Math.min(2 * 0.8 * om, dmax), brake = pl.kind === 'run' || pl.kind === 'back' ? 0.95 : 0.85, bx = V[0] * brake, bz = V[2] * brake;
        for (let n = 0; n < TORSO.length; n++) {
          const i = TORSO[n], T = _c.copy(pl.shape[n]).applyQuaternion(Q);
          T.x += p[0].x; T.y += y; T.z += p[0].z;
          A[i * 3] += k * (om * om * (T.x - p[i].x) - dm * (V[i * 3] - bx));
          A[i * 3 + 1] += k * (om * om * (T.y - p[i].y) - dm * V[i * 3 + 1]);
          A[i * 3 + 2] += k * (om * om * (T.z - p[i].z) - dm * (V[i * 3 + 2] - bz));
        }
      }
      // the feet: a planted one stays, a stepping one swings to its spot
      for (let j = 0; j < 2; j++) {
        const F = this.feet[j], i = 8 + j;
        if (F.mode === 'swing') {
          const u = Math.min(1, (t - F.t0) / F.dur), e = smooth(u), om = 55, dm = Math.min(2 * 0.9 * om, dmax);
          const tx = F.from.x + (F.to.x - F.from.x) * e, ty = F.from.y + (F.to.y - F.from.y) * e + (F.lift || 0.1) * Math.sin(Math.PI * u), tz = F.from.z + (F.to.z - F.from.z) * e;
          A[i * 3] += S * (om * om * (tx - p[i].x) - dm * V[i * 3]);
          A[i * 3 + 1] += S * (om * om * (ty - p[i].y) - dm * V[i * 3 + 1] + G);
          A[i * 3 + 2] += S * (om * om * (tz - p[i].z) - dm * V[i * 3 + 2]);
          if (u >= 1) { F.mode = 'stance'; F.plant.copy(F.to); this.stepEnd = t; }
        } else if (F.mode === 'stance') {
          // (it holds only while it is down on the ground: a foot lifted off it swings with the body instead of dragging it back)
          const c = 1 - smooth((p[i].y - F.plant.y - 0.04) / 0.1), om = pl.kind === 'run' ? 14 : 30, dm = Math.min(2 * 0.9 * om, dmax), Sc = S * c;
          A[i * 3] += Sc * (om * om * (F.plant.x - p[i].x) - dm * V[i * 3]);
          A[i * 3 + 2] += Sc * (om * om * (F.plant.z - p[i].z) - dm * V[i * 3 + 2]);
        }
      }
    }
    if (this.tone > 0.005) {
      if (this.neckOm > 0) {
        const L = this.len[8];
        this.pull(3, 2, _c.set(0, Math.cos(this.headT) * L, Math.sin(this.headT) * L).applyQuaternion(this.tb.q).add(p[2]), this.neckOm, 0.85);
      }
      if (this.waistOm > 0) this.waistMuscle(this.waistOm, 0.8);
      for (let k = 0; k < 2; k++) if (this.handOm[k] > 0) this.pull(14 + k, 10 + k, this.handT[k], this.handOm[k], 0.9);
    }
    for (let k = 0; k < 2; k++) if (this.footOm[k] > 0) this.pull(8 + k, 4 + k, this.footT[k], this.footOm[k], 0.9);
  }

  // a muscle: i is pulled toward T (spring and damper, against j's motion), j takes the other end
  pull(i, j, T, om, z) {
    const A = this.acc, V = this.vel, p = this.p, dm = Math.min(2 * z * om, 0.9 / this.h);
    let ax = om * om * (T.x - p[i].x) - dm * (V[i * 3] - V[j * 3]);
    let ay = om * om * (T.y - p[i].y) - dm * (V[i * 3 + 1] - V[j * 3 + 1]);
    let az = om * om * (T.z - p[i].z) - dm * (V[i * 3 + 2] - V[j * 3 + 2]);
    const a = Math.sqrt(ax * ax + ay * ay + az * az);
    if (a > 160) { const f = 160 / a; ax *= f; ay *= f; az *= f; }
    const wi = IW[i], wj = IW[j], f = 1 / (wi + wj);
    A[i * 3] += ax * wi * f; A[i * 3 + 1] += ay * wi * f; A[i * 3 + 2] += az * wi * f;
    A[j * 3] -= ax * wj * f; A[j * 3 + 1] -= ay * wj * f; A[j * 3 + 2] -= az * wj * f;
  }

  // the waist muscles: turn the ribcage on the pelvis toward a bend forward (waistFlex < 0) or back
  waistMuscle(om, z) {
    const p = this.p, A = this.acc, qP = this.pb.q;
    const rel = _q.copy(qP).invert().multiply(this.tb.q).invert(); // (the other way round, see e)
    const e = _q2.setFromAxisAngle(_a.set(1, 0, 0), this.waistFlex).multiply(rel); // want x rel^-1: what is left to turn, in the pelvis frame
    if (e.w < 0) { e.x = -e.x; e.y = -e.y; e.z = -e.z; e.w = -e.w; }
    const sn = Math.sqrt(Math.max(0, 1 - e.w * e.w)), ang = 2 * Math.acos(Math.min(1, e.w));
    const phi = sn < 1e-6 ? _a.set(0, 0, 0) : _a.set(e.x / sn * ang, e.y / sn * ang, e.z / sn * ang).applyQuaternion(qP);
    const dm = Math.min(2 * z * om, 0.9 / this.h);
    const al = _b.set(om * om * phi.x - dm * (this.wT.x - this.wP.x), om * om * phi.y - dm * (this.wT.y - this.wP.y), om * om * phi.z - dm * (this.wT.z - this.wP.z));
    const L = al.length();
    if (L > 80) al.multiplyScalar(80 / L);
    const W = p[WAIST];
    for (const i of RIB_BLOCK) {
      if (i === WAIST) continue;
      _c.subVectors(p[i], W); _d.crossVectors(al, _c);
      A[i * 3] += _d.x * 0.5; A[i * 3 + 1] += _d.y * 0.5; A[i * 3 + 2] += _d.z * 0.5;
    }
    for (const i of PELVIS_BLOCK) {
      if (i === WAIST) continue;
      _c.subVectors(p[i], W); _d.crossVectors(al, _c);
      A[i * 3] -= _d.x * 0.5; A[i * 3 + 1] -= _d.y * 0.5; A[i * 3 + 2] -= _d.z * 0.5;
    }
  }

  // ---------------------------------------------------------------- limits
  links() {
    const p = this.p;
    for (let k = 0; k < LINKS.length; k++) {
      const a = LINKS[k][0], b = LINKS[k][1], pa = p[a], pb = p[b];
      const dx = pb.x - pa.x, dy = pb.y - pa.y, dz = pb.z - pa.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      const wa = IW[a], wb = IW[b], f = (d - this.len[k]) / (d * (wa + wb));
      pa.x += dx * f * wa; pa.y += dy * f * wa; pa.z += dz * f * wa;
      pb.x -= dx * f * wb; pb.y -= dy * f * wb; pb.z -= dz * f * wb;
    }
  }

  // the waist bends forward far, back and to the sides a little, and twists a little; each block takes half of the correction
  waist() {
    const qP = this.pb.q, qT = this.tb.q;
    const rel = _q.copy(qP).invert().multiply(qT);
    const u = _a.copy(UP).applyQuaternion(rel);
    let changed = cone(u, 1, WAIST_LIM);
    const tw = Math.hypot(rel.y, rel.w);
    let ang = tw > 1e-6 ? 2 * Math.atan2(rel.y / tw, rel.w / tw) : 0;
    if (ang > Math.PI) ang -= 2 * Math.PI; else if (ang < -Math.PI) ang += 2 * Math.PI;
    if (Math.abs(ang) > WAIST_TWIST) { ang = Math.sign(ang) * WAIST_TWIST; changed = true; }
    if (!changed) return;
    const want = _q2.setFromUnitVectors(UP, u).multiply(_q3.setFromAxisAngle(UP, ang));
    const fix = _q4.copy(qP).multiply(want).multiply(_q3.copy(qT).invert()); // world: from the ribcage's turn to the allowed one
    // what lies on the ground stays there and the other block turns (else the two would ratchet each other up off the floor);
    // with both down the limit only gives a gentle push: the floor wins, or a body on its back sits itself up a little every step
    const onP = this.lies(this.pb), onT = this.lies(this.tb), sT = onP === onT ? 0.5 : onP ? 1 : 0;
    const fa = 2 * Math.acos(Math.min(1, Math.abs(fix.w))), s = (onP && onT ? 0.12 : 0.6) * this.ls * (fa > TURN_MAX ? TURN_MAX / fa : 1);
    if (sT > 0) this.turn(this.tb, _q5.identity().slerp(fix, sT * s));
    if (sT < 1) this.turn(this.pb, _q5.identity().slerp(fix, (1 - sT) * s).invert());
  }

  // (decided from the contacts of the last steps, not this one's: a block that lies on the ground lies there for the whole step)
  lies(B) { for (const i of B.ids) if (i !== WAIST && this.lying[i] > 0.2) return true; return false; }

  turn(B, R) {
    const p = this.p, W = p[WAIST];
    for (const i of B.ids) { if (i === WAIST) continue; _e.subVectors(p[i], W).applyQuaternion(R); p[i].addVectors(W, _e); }
    B.q.premultiply(R);
  }

  neck() {
    const p = this.p, q = this.tb.q;
    const u = _a.subVectors(p[3], p[2]).applyQuaternion(_q.copy(q).invert()).normalize();
    if (!cone(u, 1, NECK_LIM)) return;
    u.applyQuaternion(q).multiplyScalar(this.len[8]).add(p[2]).sub(p[3]);
    const ul = u.length(); if (ul > STEP_MAX) u.multiplyScalar(STEP_MAX / ul);
    // (the head and the ribcage share the correction by their weight, always: pushing only the head would push the whole body
    // up off the floor, a little every step, until a body on its back sits up; a head on the ground gives no more than that)
    const onH = this.lying[3] > 0.2, sH = onH ? 0.5 : 0.85;
    const k = 0.6 * this.ls;
    p[3].addScaledVector(u, sH * k); p[2].addScaledVector(u, (sH - 1) * k);
  }

  hips() {
    const p = this.p, q = this.pb.q, qi = _q.copy(q).invert();
    for (let j = 0; j < 2; j++) {
      const h = 4 + j, k = 6 + j;
      const u = _a.subVectors(p[k], p[h]).applyQuaternion(qi).normalize();
      if (!cone(u, -1, j === 0 ? HIP_L : HIP_R)) continue;
      u.applyQuaternion(q).multiplyScalar(this.len[j * 2]).add(p[h]).sub(p[k]);
      const ul = u.length(); if (ul > STEP_MAX) u.multiplyScalar(STEP_MAX / ul);
      const onK = this.lying[k] > 0.2, onP = this.lies(this.pb), sK = onK === onP ? IW[k] / (IW[k] + IW[h]) : onK ? 0 : 1, s = (onK && onP ? 0.25 : 1) * this.ls;
      p[k].addScaledVector(u, sK * s); p[h].addScaledVector(u, (sK - 1) * s);
    }
  }

  // Knees and elbows are hinges, each in the frame of the bone above it (the pelvis' or the ribcage's frame, swung along with the
  // thigh or the upper arm). The shin only swings back, and never quite in line, so the knee knows which way it bends; the forearm
  // only swings forward (a little back is the upper arm's own turn).
  hinges() {
    this.hinge(this.pb.q, 4, 6, 8, -1, 0.06); this.hinge(this.pb.q, 5, 7, 9, -1, 0.06);
    this.hinge(this.tb.q, 10, 12, 14, 1, -0.3); this.hinge(this.tb.q, 11, 13, 15, 1, -0.3);
  }

  // a: the upper joint, b: the hinge, c: the end. How far the lower bone goes along the upper one's forward (times sign, per length) is at least min.
  hinge(q, a, b, c, sign, min) {
    const p = this.p;
    const u = _a.subVectors(p[b], p[a]).normalize();
    const F = _b.set(0, 0, -1).applyQuaternion(_q.setFromUnitVectors(_c.copy(DOWN).applyQuaternion(q), u).multiply(q));
    const l = _c.subVectors(p[c], p[b]), L = l.length() || 1e-6, x = sign * l.dot(F) / L;
    if (x >= min) return;
    const e = Math.min((min - x) * L, STEP_MAX) * sign;
    p[c].addScaledVector(F, e * 0.6 * this.ls); p[b].addScaledVector(F, -e * 0.4 * this.ls);
  }

  near() {
    const p = this.p;
    for (let l = 0; l < 2; l++) {
      const L = l === 0 ? NEAR : this.fold;
      for (let k = 0; k < L.length; k++) {
        const a = L[k][0], b = L[k][1], min = L[k][2], pa = p[a], pb = p[b];
        const dx = pb.x - pa.x, dy = pb.y - pa.y, dz = pb.z - pa.z, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= min * min) continue;
        // (a torso part on the floor doesn't give way to a hand, elbow or knee under it: the limb moves, or the body would climb onto its own arm)
        const d = Math.sqrt(d2) || 1e-6, wa = IW[a], wb = IN_BLOCK[b] && this.lying[b] > 0.2 && !IN_BLOCK[a] ? 0 : IW[b], f = (d - min) / (d * (wa + wb));
        pa.x += dx * f * wa; pa.y += dy * f * wa; pa.z += dz * f * wa;
        pb.x -= dx * f * wb; pb.y -= dy * f * wb; pb.z -= dz * f * wb;
      }
    }
  }

  // the level: out of every wall and floor, and friction - what slides along a surface is held by as much as it was pressed into it
  collide() {
    const p = this.p, o = this.o, col = this.col;
    for (let i = 0; i < N; i++) {
      const q = p[i], x = q.x, y = q.y, z = q.z;
      if (!col.pushOutSphere(q, this.rad[i])) continue;
      this.touch[i] = 1;
      let nx = q.x - x, ny = q.y - y, nz = q.z - z;
      const dep = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (dep < 1e-7) continue;
      nx /= dep; ny /= dep; nz /= dep;
      const oi = o[i], vx = q.x - oi.x, vy = q.y - oi.y, vz = q.z - oi.z, vn = vx * nx + vy * ny + vz * nz;
      // no bounce: whatever the push out gave it along the normal (a foot a little in the floor as it died), it doesn't keep
      const vmax = 0.04 * this.h;
      if (vn > vmax) { oi.x += nx * (vn - vmax); oi.y += ny * (vn - vmax); oi.z += nz * (vn - vmax); }
      const tx = vx - vn * nx, ty = vy - vn * ny, tz = vz - vn * nz, tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
      if (tl < 1e-9) continue;
      const f = tl <= MU_S * dep ? 1 : MU_K * dep / tl;
      oi.x += tx * f; oi.y += ty * f; oi.z += tz * f;
    }
  }

  // ---------------------------------------------------------------- the skeleton from the particles
  // frame (rotation) from a right vector and an up vector: rig space is +X right, +Y up, +Z back
  frame(right, up, out) {
    const y = _a.copy(up).normalize();
    const x = _b.copy(right).addScaledVector(y, -right.dot(y)).normalize();
    const z = _c.crossVectors(x, y).normalize();
    _m.makeBasis(x, y, z);
    return out.setFromRotationMatrix(_m);
  }

  // dir gets normalized in place; the bone's world rotation goes into out
  limb(bone, parentWorld, dir, out) {
    const restDir = _a.copy(DOWN).applyQuaternion(parentWorld);
    out.setFromUnitVectors(restDir, dir.normalize()).multiply(parentWorld);
    bone.quaternion.copy(parentWorld).invert().multiply(out);
    return out;
  }

  // (every frame for every body on the ground: scratch of its own, nothing new for the garbage collector)
  apply() {
    const s = this.sol, p = this.p, qP = this.pb.q, qT = this.tb.q;
    const V = this.sv || (this.sv = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
    const Q = this.sq || (this.sq = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()]);
    // pelvis: the root bone, world == local while ragdolling
    this.pb.toWorld(ORIGIN, s.pelvis.position);
    s.pelvis.quaternion.copy(qP);
    // the spine runs from the waist to the ribcage and takes the bend; the ribcage keeps the twist
    const chestAt = this.tb.toWorld(ORIGIN, V[0]);
    const spineW = Q[0].setFromUnitVectors(V[1].copy(UP).applyQuaternion(qP), V[2].subVectors(chestAt, p[WAIST]).normalize()).multiply(qP);
    s.spine.quaternion.copy(qP).invert().multiply(spineW);
    s.chest.quaternion.copy(spineW).invert().multiply(qT);
    // the head: up along the neck, its right the ribcage's right
    const qH = this.frame(V[1].set(1, 0, 0).applyQuaternion(qT), V[2].subVectors(p[3], p[2]), Q[1]);
    s.head.quaternion.copy(qT).invert().multiply(qH);
    // legs; the ankles go slack with the muscles (toes point, feet fall outward)
    const slack = 1 - Math.min(1, this.tone * 1.2 + this.S);
    for (let i = 0; i < 2; i++) {
      const L = s.legs[i];
      const qTh = this.limb(L.thigh, qP, V[3].subVectors(p[6 + i], p[4 + i]), Q[2]);
      this.limb(L.knee, qTh, V[3].subVectors(p[8 + i], p[6 + i]), Q[3]);
      L.foot.rotation.set(-0.55 * slack, -L.s * 0.3 * slack, 0);
    }
    // arms (the shoulder group sits unturned in the chest frame)
    for (let i = 0; i < 2; i++) {
      const a = s.arms[i];
      a.shoulder.quaternion.identity();
      const qU = this.limb(a.upper, qT, V[3].subVectors(p[12 + i], p[10 + i]), Q[2]);
      a.elbow.quaternion.identity();
      this.limb(a.fore, qU, V[3].subVectors(p[14 + i], p[12 + i]), Q[3]);
    }
  }

  get center() { return this.p[0]; }
}

// steps per second and solver rounds; a toaster gets fewer (see ragdollDetail)
Ragdoll.hz = 90;
Ragdoll.iter = 8;
export function ragdollDetail(lite) { Ragdoll.hz = lite ? 60 : 90; Ragdoll.iter = lite ? 5 : 8; }

export { P as RAGDOLL_POINTS };
