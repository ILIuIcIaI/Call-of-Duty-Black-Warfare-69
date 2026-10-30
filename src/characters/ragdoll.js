import * as THREE from 'three';

// =============================================================================
// Verlet ragdoll: 16 joint particles, stick constraints for every bone, cross
// braces that keep the torso rigid, minimum-distance limits so knees/elbows
// can't fold through the body, knee-direction correction and sphere collision
// against the level. The skeleton's bones are re-oriented from the particles
// every frame, so the skinned soldier follows the simulation.
// =============================================================================
const P = { pelvis: 0, chest: 1, neck: 2, head: 3, lHip: 4, rHip: 5, lKnee: 6, rKnee: 7, lFoot: 8, rFoot: 9, lSh: 10, rSh: 11, lElb: 12, rElb: 13, lHand: 14, rHand: 15 };
const STICKS = [
  [0, 1], [1, 2], [2, 3],
  [4, 5], [10, 11], [10, 2], [11, 2], [10, 1], [11, 1], [4, 0], [5, 0], [10, 4], [11, 5], [10, 5], [11, 4], [1, 4], [1, 5], [3, 1], [3, 10], [3, 11],
  [4, 6], [6, 8], [5, 7], [7, 9], [10, 12], [12, 14], [11, 13], [13, 15],
];
const RADIUS = [0.14, 0.15, 0.08, 0.13, 0.09, 0.09, 0.07, 0.07, 0.07, 0.07, 0.08, 0.08, 0.06, 0.06, 0.06, 0.06];
const INV_MASS = [0.6, 0.6, 1, 1, 0.9, 0.9, 1, 1, 1.2, 1.2, 1, 1, 1.2, 1.2, 1.4, 1.4];
const DOWN = new THREE.Vector3(0, -1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();

export class Ragdoll {
  constructor(sol, col, opts = {}) {
    this.sol = sol; this.col = col;
    sol.root.updateMatrixWorld(true);
    const wp = (o, x = 0, y = 0, z = 0) => o.localToWorld(new THREE.Vector3(x, y, z));
    const L = sol.legs, A = sol.arms;
    const pos = [
      wp(sol.pelvis), wp(sol.chest), wp(sol.head), wp(sol.head, 0, 0.12, 0),
      wp(L[0].thigh), wp(L[1].thigh), wp(L[0].knee), wp(L[1].knee), wp(L[0].foot), wp(L[1].foot),
      wp(A[0].upper), wp(A[1].upper), wp(A[0].fore), wp(A[1].fore), wp(A[0].hand), wp(A[1].hand),
    ];
    this.p = pos;
    const dt = 1 / 60;
    const v = opts.vel || new THREE.Vector3();
    this.o = pos.map((p) => p.clone().addScaledVector(v, -dt * 0.8));
    // bullet impulse on the body part that was hit
    const imp = (i, s) => { this.o[i].addScaledVector(opts.dir, -s * dt); };
    if (opts.dir) {
      const s = opts.strength || 3;
      const part = opts.part;
      if (part === 'head') { imp(3, s * 1.4); imp(2, s * 0.8); imp(1, s * 0.3); }
      else if (part === 'chest') { imp(1, s); imp(10, s * 0.7); imp(11, s * 0.7); imp(2, s * 0.6); }
      else if (part === 'stomach') { imp(0, s); imp(1, s * 0.6); imp(4, s * 0.5); imp(5, s * 0.5); }
      else {
        // limb: nearest particle to the hit point
        let best = 0, bd = Infinity;
        if (opts.point) pos.forEach((p, i) => { const d = p.distanceToSquared(opts.point); if (d < bd) { bd = d; best = i; } });
        imp(best, s * 1.2); imp(0, s * 0.4);
      }
      // everyone gets a bit so the whole body reacts
      for (let i = 0; i < 16; i++) imp(i, s * 0.25);
    }
    // a little random twist so no two deaths look the same
    for (const i of [10, 11, 14, 15]) this.o[i].add(new THREE.Vector3((Math.random() - 0.5) * 0.03, 0, (Math.random() - 0.5) * 0.03));
    this.rest = STICKS.map(([a, b]) => pos[a].distanceTo(pos[b]));
    const legLen = [pos[4].distanceTo(pos[6]) + pos[6].distanceTo(pos[8]), pos[5].distanceTo(pos[7]) + pos[7].distanceTo(pos[9])];
    const armLen = [pos[10].distanceTo(pos[12]) + pos[12].distanceTo(pos[14]), pos[11].distanceTo(pos[13]) + pos[13].distanceTo(pos[15])];
    this.minD = [
      [4, 8, legLen[0] * 0.62], [5, 9, legLen[1] * 0.62], [10, 14, armLen[0] * 0.42], [11, 15, armLen[1] * 0.42],
      [3, 0, pos[3].distanceTo(pos[0]) * 0.82], [6, 1, pos[6].distanceTo(pos[1]) * 0.55], [7, 1, pos[7].distanceTo(pos[1]) * 0.55],
      [14, 0, 0.18], [15, 0, 0.18], [8, 9, 0.12], [6, 7, 0.14],
    ];
    this.t = 0; this.still = 0; this.asleep = false;
    // the skeleton now lives in world space
    sol.root.position.set(0, 0, 0); sol.root.rotation.set(0, 0, 0); sol.root.updateMatrixWorld(true);
  }

  step(h) {
    const p = this.p, o = this.o, g = -11.5 * h * h;
    for (let i = 0; i < 16; i++) {
      const pi = p[i], oi = o[i];
      const vx = (pi.x - oi.x) * 0.992, vy = (pi.y - oi.y) * 0.992, vz = (pi.z - oi.z) * 0.992;
      oi.copy(pi);
      pi.x += vx; pi.y += vy + g; pi.z += vz;
    }
    for (let it = 0; it < 10; it++) {
      for (let k = 0; k < STICKS.length; k++) {
        const [a, b] = STICKS[k];
        const pa = p[a], pb = p[b];
        const dx = pb.x - pa.x, dy = pb.y - pa.y, dz = pb.z - pa.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const wa = INV_MASS[a], wb = INV_MASS[b];
        const diff = (d - this.rest[k]) / (d * (wa + wb));
        pa.x += dx * diff * wa; pa.y += dy * diff * wa; pa.z += dz * diff * wa;
        pb.x -= dx * diff * wb; pb.y -= dy * diff * wb; pb.z -= dz * diff * wb;
      }
      for (const [a, b, min] of this.minD) {
        const pa = p[a], pb = p[b];
        const dx = pb.x - pa.x, dy = pb.y - pa.y, dz = pb.z - pa.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        if (d >= min) continue;
        const diff = (d - min) / (d * 2);
        pa.x += dx * diff; pa.y += dy * diff; pa.z += dz * diff;
        pb.x -= dx * diff; pb.y -= dy * diff; pb.z -= dz * diff;
      }
      // knees bend forward only (relative to the pelvis frame)
      const fwd = this.torsoForward(_c);
      for (const [h, k, f] of [[4, 6, 8], [5, 7, 9]]) {
        _a.copy(p[h]).add(p[f]).multiplyScalar(0.5);
        _b.copy(p[k]).sub(_a);
        const dd = _b.dot(fwd);
        if (dd < 0.02) p[k].addScaledVector(fwd, (0.02 - dd) * 0.5);
      }
      if (it % 3 === 2 || it === 9) for (let i = 0; i < 16; i++) {
        if (this.col.pushOutSphere(p[i], RADIUS[i])) {
          // ground friction: bleed tangential velocity
          o[i].x += (p[i].x - o[i].x) * 0.35; o[i].z += (p[i].z - o[i].z) * 0.35;
          if (o[i].y < p[i].y - 0.002) o[i].y = p[i].y - 0.002;
        }
      }
    }
  }

  torsoForward(out) {
    const p = this.p;
    _a.copy(p[5]).sub(p[4]);               // right
    _b.copy(p[1]).sub(p[0]);               // up
    return out.crossVectors(_b, _a).normalize(); // up x right = forward (-Z of the rig)
  }

  update(dt) {
    if (this.asleep) return;
    this.t += dt;
    const n = Math.min(4, Math.max(1, Math.ceil(dt / (1 / 90))));
    for (let i = 0; i < n; i++) this.step(dt / n);
    // sleep when settled
    let e = 0;
    for (let i = 0; i < 16; i++) e += this.p[i].distanceToSquared(this.o[i]);
    if (e < 1e-6 * n) this.still += dt; else this.still = 0;
    if (this.still > 0.4 || this.t > 6) this.asleep = true;
    this.apply();
  }

  // frame (rotation) from a right vector and an up vector: rig space is +X right, +Y up, +Z back
  frame(right, up, out) {
    const y = _a.copy(up).normalize();
    const x = _b.copy(right).addScaledVector(y, -right.dot(y)).normalize();
    const z = _c.crossVectors(x, y).normalize();
    _m.makeBasis(x, y, z);
    return out.setFromRotationMatrix(_m);
  }

  limb(bone, parentWorld, dir) {
    const restDir = new THREE.Vector3().copy(DOWN).applyQuaternion(parentWorld);
    const qWorld = new THREE.Quaternion().setFromUnitVectors(restDir, dir.clone().normalize()).multiply(parentWorld);
    bone.quaternion.copy(parentWorld).invert().multiply(qWorld);
    return qWorld;
  }

  apply() {
    const s = this.sol, p = this.p;
    const right = new THREE.Vector3().subVectors(p[5], p[4]);
    const up = new THREE.Vector3().subVectors(p[1], p[0]);
    const qPelvis = this.frame(right, up, new THREE.Quaternion());
    // pelvis is the root bone: world == local (root is identity while ragdolling)
    s.pelvis.position.copy(p[0]);
    s.pelvis.quaternion.copy(qPelvis);
    // spine bends toward the chest particle, chest frames from the shoulders
    s.spine.quaternion.identity();
    const qSpine = qPelvis.clone();
    const shR = new THREE.Vector3().subVectors(p[11], p[10]);
    const chestUp = new THREE.Vector3().subVectors(p[2], p[1]);
    const qChestW = this.frame(shR, chestUp, new THREE.Quaternion());
    s.chest.quaternion.copy(qSpine).invert().multiply(qChestW);
    const headUp = new THREE.Vector3().subVectors(p[3], p[2]);
    const qHeadW = this.frame(shR, headUp, new THREE.Quaternion());
    s.head.quaternion.copy(qChestW).invert().multiply(qHeadW);
    // legs
    for (let i = 0; i < 2; i++) {
      const L = s.legs[i], h = 4 + i, k = 6 + i, f = 8 + i;
      const qT = this.limb(L.thigh, qPelvis, new THREE.Vector3().subVectors(p[k], p[h]));
      const qK = this.limb(L.knee, qT, new THREE.Vector3().subVectors(p[f], p[k]));
      L.foot.quaternion.identity();
      void qK;
    }
    // arms (shoulder group has identity local rotation in the chest frame)
    for (let i = 0; i < 2; i++) {
      const a = s.arms[i], sh = 10 + i, el = 12 + i, ha = 14 + i;
      a.shoulder.quaternion.identity();
      const qU = this.limb(a.upper, qChestW, new THREE.Vector3().subVectors(p[el], p[sh]));
      a.elbow.quaternion.identity();
      this.limb(a.fore, qU, new THREE.Vector3().subVectors(p[ha], p[el]));
    }
  }

  get center() { return this.p[0]; }
}

export { P as RAGDOLL_POINTS };
