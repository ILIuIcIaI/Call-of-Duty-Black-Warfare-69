import * as THREE from 'three';
import { bake, armIK, HZ, JOINTS } from './motion.js';

// =============================================================================
// Warzone finishers: a melee on someone already hurt, from behind or from the front
// if he is low enough, or on someone lying down from any side (prone: true), turns
// into a short staged kill, shot like a film scene. Two bodies, each given as keys,
// and every channel has its own keys: what a key doesn't name just keeps moving.
//   p        : hips [x, y, z] in the scene's frame. The victim starts at the origin looking toward -z,
//              the attacker behind it at +z. y = 0.93 is standing.
//   r        : hips [pitch, yaw, roll]. A positive pitch bends forward, a positive yaw turns to the left.
//   rt       : the whole body turned around its own length, for someone flipping over in the air
//   sp,sy,sz / cp,cy,cz / hp,hy,hz: spine, chest, head (pitch, yaw, roll)
//   lf, rf   : where the soles are, [x, y, z] in the scene's frame. A foot stays planted until it steps to its next key.
//   lfp, rfp : pitch of the feet (0 = flat, positive = toes down). On the ground they roll over the ball or the heel.
//   lfy, rfy : yaw of the foot, if it isn't where the hips look when it lands
//   lfl, rfl : how high the foot lifts on this step, 0 = it drags. lfd, rfd: how long the step takes. lead: 'l' or 'r' goes first.
//   lh, rh   : where the hands are, in the scene's frame, or ['v.head', x, y, z]: on a bone of either body, so a
//              grip stays a grip however the two move. Bones: head, chest, pelvis, lhand, rhand, lfoot, rfoot.
//   le, re   : pushes the elbow's direction around, in chest space
//   gun      : 1 = the gun is out. gat: where the grip is, gaim: what it points at. two: 1 = left hand on the gun.
//   pto      : what the prop in the right hand points at
//   j        : struggling, 0 to 1. The body shakes and the hands can't hold still.
//   kt,kh,ka,kl: how hard torso, head, arms and legs still follow the keys. 1 = exactly, 0 = gone limp, only weight and speed left.
// ak, vk: knocks, { hp: [[t, speed], ...] }: a channel gets hit at that moment and swings back by itself.
// push: [t, [joints], x, y, z]: a limp body gets a shove, in m/s.
// cam: the camera's way, a key with cut starts a new one (only: 'a' cares for the attacker alone), crop: 1 lets the feet out of the picture, 2 the attacker as well.
// reach on the first camera key: room kept above the right hand for what it holds. front: where the scene starts when it comes from the front.
// slow: [[t, factor, in, hold, out]]: a soft slow motion. events: [t, name, ...] are played by the match (blood, sounds, the kill).
// =============================================================================
const UPPER = { rt: 0, sp: 0, sy: 0, sz: 0, cp: 0, cy: 0, cz: 0, hp: 0, hy: 0, hz: 0, j: 0, lfp: 0, rfp: 0, kt: 1, kh: 1, ka: 1, kl: 1, two: 0 };
const footAt = (x, z, yaw, lx, lz, y = 0) => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), y, z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];

// someone standing at x, z, turned by yaw
const stand = (x, z, yaw = 0, o = {}) => ({ p: [x, 0.93, z], r: [0, yaw, 0], lf: footAt(x, z, yaw, -0.13, 0.04), rf: footAt(x, z, yaw, 0.13, -0.04), ...o });
const relax = (who) => ({ lh: [who + '.chest', -0.24, -0.44, -0.08], rh: [who + '.chest', 0.25, -0.45, -0.03] });
const guard = (who) => ({ lh: [who + '.chest', -0.17, 0.12, -0.28], rh: [who + '.chest', 0.17, 0.08, -0.25] });
// down on both knees, toes tucked under, or on one with the other foot forward
const kneel = (x, z, yaw, o = {}) => ({ p: [x, 0.54, z], r: [0, yaw, 0], lf: footAt(x, z, yaw, -0.16, 0.62), rf: footAt(x, z, yaw, 0.16, 0.62), lfp: 1.35, rfp: 1.35, ...o });
const oneKnee = (x, z, yaw, o = {}) => ({ p: [x, 0.58, z], r: [0.1, yaw, 0], lf: footAt(x, z, yaw, -0.17, -0.42), rf: footAt(x, z, yaw, 0.16, 0.62), lfp: 0, rfp: 1.35, ...o });
// flat on the back, the feet toward where yaw looks
const onBack = (x, z, yaw = 0, o = {}) => ({ p: [x, 0.16, z], r: [-1.5, yaw, 0], lf: footAt(x, z, yaw, -0.22, -0.78), rf: footAt(x, z, yaw, 0.2, -0.82), lfp: -1.2, rfp: -1.2, ...o });
// flat on the belly, the head toward where yaw looks, the toes dug in
const onBelly = (x, z, yaw = 0, o = {}) => ({ p: [x, 0.17, z], r: [1.5, yaw, 0], lf: footAt(x, z, yaw, -0.2, 0.84), rf: footAt(x, z, yaw, 0.2, 0.86), lfp: 1.35, rfp: 1.35, hp: -0.85, lh: [-0.34, 0.06, -0.64], rh: [0.34, 0.06, -0.64], ...o });
// going down is never one stiff piece, and the keys only guide it: the muscles are going, weight and speed do the rest.
// Backward: the knees give, the backside lands, then the back, the head last of all. d: how far back, T: how long it takes, lean: how far back he already is.
const fallBack = (t, x, z, yaw = 0, o = {}) => {
  const { d = 0.62, T = 0.82, tilt = 0.08, k = 0.46, spread = 0.3, kneeling = false, lean = 0 } = o, bx = Math.sin(yaw), bz = Math.cos(yaw), at = (u, y) => [x + bx * d * u, y, z + bz * d * u], end = [x + bx * d, z + bz * d];
  const feet = kneeling ? {} : { lf: footAt(end[0], end[1], yaw, -spread * 0.6, -0.76, 0.02), rf: footAt(end[0], end[1], yaw, spread * 0.6, -0.68, 0.02), lfd: 0.3, rfd: 0.3 };
  return [
    { t: t - 0.08, kt: 1, kl: 1 },
    { t, kt: k * 1.5, kl: 0.5, ka: 0.12, kh: 0.3 },
    { t: t + T * 0.24, p: at(0.22, kneeling ? 0.48 : 0.7), r: [Math.min(-0.2, lean - 0.04), yaw, tilt * 0.5], sp: 0.12, cp: 0.14, hp: 0.22, kt: k * 1.2, kl: 0.34, ka: 0, kh: 0.2 },
    { t: t + T * 0.5, p: at(0.6, kneeling ? 0.34 : 0.38), r: [Math.min(-0.62, lean - 0.14), yaw, tilt], sp: 0.16, cp: 0.16, hp: 0.3, kt: k, kl: 0.2 },
    { t: t + T * 0.68, p: at(0.86, 0.21), r: [Math.min(-0.98, lean - 0.3), yaw, tilt], sp: 0.1, cp: 0.1, hp: 0.25, kt: k * 0.8, kl: 0.12, kh: 0.1, ...feet },
    { t: t + T * 0.92, p: at(1, 0.17), r: [-1.38, yaw, tilt], sp: 0, cp: 0, hp: 0, kt: k * 0.5, kl: 0.06, kh: 0 },
    { t: t + T * 1.3, p: at(1.03, 0.16), r: [-1.52, yaw, tilt * 0.6], kt: 0.05, kl: 0 },
    { t: t + T * 1.55, kt: 0 },
  ];
};
// Forward: the knees hit first, the hands try to, then the chest and the face. From kneeling: q 0, it just starts lower.
const fallForward = (t, x, z, yaw = 0, o = {}) => {
  const { d = 0.7, T = 0.8, tilt = 0.06, k = 0.46, kneeling = false } = o, fx = -Math.sin(yaw), fz = -Math.cos(yaw), at = (u, y) => [x + fx * d * u, y, z + fz * d * u], end = [x + fx * d, z + fz * d];
  return [
    { t: t - 0.08, kt: 1, kl: 1 },
    { t, kt: k * 1.5, kl: 0.5, ka: 0.15, kh: 0.3 },
    { t: t + T * 0.26, p: at(0.12, kneeling ? 0.5 : 0.66), r: [0.42, yaw, tilt * 0.5], sp: 0.2, cp: 0.2, hp: -0.1, kt: k * 1.2, kl: 0.36, ka: 0, kh: 0.2 },
    { t: t + T * 0.52, p: at(0.42, 0.42), r: [0.85, yaw, tilt], sp: 0.18, cp: 0.12, hp: -0.2, kt: k, kl: 0.24 },
    { t: t + T * 0.76, p: at(0.78, 0.25), r: [1.22, yaw, tilt], sp: 0.08, cp: 0.05, hp: -0.3, kt: k * 0.75, kl: 0.12, kh: 0.08, lf: footAt(end[0], end[1], yaw, -0.2, 0.8, 0.02), rf: footAt(end[0], end[1], yaw, 0.2, 0.84, 0.02), lfd: 0.34, rfd: 0.34 },
    { t: t + T * 1.0, p: at(1, 0.18), r: [1.46, yaw, tilt], sp: 0, cp: 0, hp: -0.5, kt: k * 0.4, kl: 0.05, kh: 0 },
    { t: t + T * 1.35, p: at(1.02, 0.17), r: [1.52, yaw, tilt * 0.6], kt: 0.05, kl: 0 },
    { t: t + T * 1.6, kt: 0 },
  ];
};
// a burst: n shots, dt apart, each one given by f(t, i)
const burst = (t, n, dt, f) => Array.from({ length: n }, (_, i) => f(t + i * dt, i));

export const FINISHERS = [
  // ---------------------------------------------------------------------------
  // A tap on the shoulder. He turns around. Bare hands: a right to the face, a knee, and he's on his back.
  // ---------------------------------------------------------------------------
  {
    name: 'DER GRUSS', dur: 3.7, front: 0.98,
    a: [
      { t: 0, ...UPPER, ...stand(0, 1.04), ...relax('a') },
      { t: 0.2, lf: [-0.14, 0, 0.64], p: [0, 0.925, 0.84] },
      { t: 0.34, rf: [0.15, 0, 0.94], p: [-0.01, 0.91, 0.74], r: [0.02, 0, 0], lh: ['v.chest', -0.21, 0.23, 0.08] },
      { t: 0.41, lh: ['v.chest', -0.21, 0.27, 0.08] },
      { t: 0.48, lh: ['v.chest', -0.21, 0.23, 0.08] },
      { t: 0.6, rh: ['a.chest', 0.25, -0.2, -0.16], cy: 0, sy: 0, hp: 0.06 },
      { t: 0.8, lh: ['a.chest', -0.16, 0.13, -0.3], rh: ['a.chest', 0.21, 0.12, -0.2], p: [0, 0.905, 0.74], r: [0.03, -0.1, 0] },
      // the weight goes back onto the right foot, the shoulder with it
      { t: 1.0, p: [0.02, 0.885, 0.84], r: [-0.05, -0.42, 0], sy: -0.22, cy: -0.42, cp: 0.02, rh: ['a.chest', 0.27, 0.02, -0.1], rfp: 0, hy: 0.22 },
      // and all of it into the jaw
      { t: 1.14, p: [-0.03, 0.87, 0.66], r: [0.12, 0.3, 0], sy: 0.26, cy: 0.5, cp: 0.12, hy: -0.1, hp: 0.12, rh: ['v.head', 0.03, 0.06, -0.13], rfp: 0.75 },
      { t: 1.26, rh: ['v.head', -0.02, 0.05, -0.16], p: [-0.04, 0.875, 0.6], r: [0.12, 0.42, 0], cy: 0.42, sy: 0.22, hy: 0 },
      { t: 1.42, p: [-0.01, 0.89, 0.5], r: [0.1, 0.12, 0], sy: 0.04, cy: 0.05, rh: ['a.chest', 0.19, 0.11, -0.26], rfp: 0.2, lf: [-0.16, 0, 0.32] },
      // he is pulled down by the neck, and the knee comes up to meet him
      { t: 1.58, p: [-0.01, 0.9, 0.4], r: [0.14, 0, 0], cp: 0.2, sp: 0.06, hp: 0.25, lh: ['v.head', -0.09, 0.09, 0.07], rh: ['v.head', 0.09, 0.09, 0.07], rf: [0.17, 0, 0.72], rfp: 0.3 },
      { t: 1.76, p: [0, 0.965, 0.33], r: [-0.16, 0, 0], sp: -0.06, cp: 0.34, hp: 0.32, rf: [0.09, 0.44, 0.0], rfp: 0.35 },
      { t: 1.9, p: [0, 0.94, 0.3], r: [-0.06, 0, 0], cp: 0.2, lh: ['a.chest', -0.18, 0.14, -0.34], rh: ['a.chest', 0.18, 0.14, -0.34], rf: [0.14, 0.24, 0.16], rfp: 0.1 },
      { t: 2.1, p: [0, 0.9, 0.26], r: [0.03, 0, 0], cp: 0.06, sp: 0, rf: [0.19, 0, 0.5], rfp: 0, hp: 0.3 },
      { t: 2.6, ...stand(0.02, 0.34), lf: [-0.14, 0, 0.28], rf: [0.17, 0, 0.42], ...guard('a'), cp: 0.1, hp: 0.34, hy: -0.08 },
      { t: 3.2, hp: 0.3, hy: 0.05, cp: 0.08, ...relax('a') },
      { t: 3.7, hp: 0, hy: 0, cp: 0 },
    ],
    v: [
      { t: 0, ...UPPER, ...stand(0, 0), ...relax('v') },
      // the head first, then the chest, then the hips, the feet last
      { t: 0.42, hy: 0, cy: 0, r: [0, 0, 0] },
      { t: 0.58, hy: 0.62, hp: 0.04, cy: 0.1 },
      { t: 0.74, cy: 0.42, sy: 0.2, r: [0, 0.75, 0] },
      { t: 0.98, ...stand(0.01, 0.03, 3.06), hy: 0, hp: 0, cy: 0, sy: 0 },
      { t: 1.1, lh: ['v.chest', -0.25, -0.41, -0.09], rh: ['v.chest', 0.26, -0.43, -0.04] },
      { t: 1.14, p: [0.01, 0.92, 0.03], r: [0, 3.06, 0], ka: 1 },
      { t: 1.22, ka: 0.4, lh: ['v.chest', -0.42, 0.02, -0.12], rh: ['v.chest', 0.4, 0.1, -0.1] },
      // he goes back a step and a half, not quite on his feet any more
      { t: 1.42, p: [0.03, 0.86, -0.3], r: [-0.14, 3.06, 0.08], cp: -0.06, sp: -0.04, hp: -0.1, lf: [0.17, 0, -0.32] },
      { t: 1.6, p: [0.01, 0.8, -0.5], r: [0.58, 3.06, 0.02], cp: 0.24, sp: 0.14, hp: 0.02, rf: [-0.14, 0, -0.62], ka: 0.55, lh: ['v.pelvis', -0.2, 0.1, -0.24], rh: ['v.pelvis', 0.2, 0.08, -0.24] },
      { t: 1.76, p: [0, 0.8, -0.52], r: [0.74, 3.06, 0], cp: 0.3, sp: 0.16, hp: 0.05, kh: 1, kt: 1, ka: 0.5 },
      // the knee: up and back
      { t: 1.92, p: [0, 0.97, -0.62], r: [0.06, 3.06, 0.05], cp: -0.28, sp: -0.14, hp: -0.3, ka: 0.15, kl: 1, lfp: 0.5, rfp: 0.4 },
      { t: 2.04, p: [0, 0.88, -0.78], r: [-0.34, 3.06, 0.06], kt: 1 },
      ...fallBack(2.1, 0, -0.86, 3.06, { d: 0.5, T: 0.8, lean: -0.34 }),
    ],
    vk: { hp: [[1.14, -14], [1.76, -20]], hy: [[1.14, -11]], hz: [[1.14, -7]], cy: [[1.14, -3]], cp: [[1.14, -2.5], [1.76, -5]], sp: [[1.76, -2]] },
    ak: { cp: [[1.14, 1.2]], hp: [[1.14, 1.4]] },
    cam: [
      { t: 0, pos: [-3.1, 1.2, 1.7], look: ['mid', 0, -0.3, 0], fov: 40 },
      { t: 1.1, pos: [-3.3, 1.08, 0.7], look: ['mid', 0, -0.32, 0], fov: 38 },
      { t: 2.0, pos: [-3.2, 0.9, -0.1], look: [0, 0.8, -0.2], fov: 38 },
      { t: 3.4, pos: [-2.95, 0.72, -0.7], look: [0, 0.66, -0.35], fov: 40 },
    ],
    events: [
      [0.34, 'sfx', 'pouch', { vol: 0.7, rate: 1.3 }], [0.48, 'sfx', 'pouch', { vol: 0.5, rate: 1.4 }], [1.02, 'sfx', 'swing', { vol: 1, rate: 1 }], [1.14, 'drop'],
      [1.14, 'hit', 'v.head', 0, 0.04, -0.12, 0, 0.3, 1, 1, 'punch'],
      [1.76, 'hit', 'v.head', 0, 0.02, -0.14, 0, 0.8, 0.6, 1.2, 'crack'], [1.76, 'sfx', 'punch', { vol: 1 }],
      [2.5, 'thud'], [2.3, 'kill', [0, 0, -1], 0.4, 'head'], [2.6, 'pool', 'v.head', 0.5],
    ],
  },
  // ---------------------------------------------------------------------------
  // Yanked off his feet by the collar, he lands on his backside, turns around and looks up into the muzzle.
  // ---------------------------------------------------------------------------
  {
    name: 'AUFGESETZT', dur: 3.9, gun: 'handcannon',
    a: [
      { t: 0, ...UPPER, ...stand(0, 0.96), ...relax('a'), gat: ['a.pelvis', 0.22, -0.08, -0.06], gaim: ['a.pelvis', 0.22, -0.6, -0.4], gun: 0 },
      { t: 0.14, lf: [-0.14, 0, 0.62], p: [0, 0.92, 0.82] },
      { t: 0.28, rf: [0.15, 0, 0.84], p: [0, 0.89, 0.66], r: [0.08, 0, 0], cp: 0.1, hp: 0.1, lh: ['v.chest', -0.1, 0.26, 0.12], rh: ['v.chest', 0.1, 0.26, 0.12] },
      // all his weight goes backward
      { t: 0.62, p: [0, 0.84, 0.88], r: [-0.2, 0, 0], sp: -0.03, cp: 0, hp: 0.22, rf: [0.18, 0, 1.14] },
      { t: 0.86, p: [0, 0.86, 1.12], r: [-0.1, 0, 0], lf: [-0.15, 0, 1.0], lh: ['v.chest', -0.12, 0.28, 0.14], rh: ['v.chest', 0.12, 0.28, 0.14] },
      { t: 1.02, lh: ['a.chest', -0.24, -0.24, -0.2], rh: ['a.pelvis', 0.22, -0.08, -0.06], p: [0, 0.91, 1.18], r: [0, 0, 0], rf: [0.17, 0, 1.3], cp: 0.06, hp: 0.3 },
      { t: 1.22, gun: 1, gat: ['a.pelvis', 0.22, -0.08, -0.06], gaim: ['a.pelvis', 0.22, -0.6, -0.4], hp: 0.3 },
      { t: 1.5, gat: ['a.chest', 0.24, -0.08, -0.3], gaim: ['v.head', 0, 0.05, 0], cp: 0.12 },
      { t: 1.74, gat: ['a.chest', 0.16, -0.04, -0.46], p: [0, 0.9, 1.24], cp: 0.16, hp: 0.34 },
      { t: 2.14, lf: [-0.15, 0, 1.06], p: [0, 0.86, 1.22], r: [0.2, 0, 0], cp: 0.26, sp: 0.08, hp: 0.36, gat: ['a.chest', 0.12, -0.02, -0.54] },
      { t: 2.26, rf: [0.17, 0, 1.44] },
      { t: 2.36, gat: ['a.chest', 0.12, -0.02, -0.54], gaim: ['v.head', 0, 0.05, 0], p: [0, 0.86, 1.2] },
      // the kick goes up his arm
      { t: 2.45, gat: ['a.chest', 0.14, 0.1, -0.47], gaim: ['a.chest', 0.14, 0.62, -1.2], p: [0, 0.87, 1.23] },
      { t: 2.74, gat: ['a.chest', 0.13, -0.02, -0.5], gaim: ['v.chest', 0, 0, 0], p: [0, 0.88, 1.22], r: [0.14, 0, 0], cp: 0.2 },
      { t: 3.2, ...stand(0, 1.28), lf: [-0.14, 0, 1.2], rf: [0.17, 0, 1.36], cp: 0.1, sp: 0, hp: 0.3, gat: ['a.chest', 0.22, -0.28, -0.24], gaim: ['a.chest', 0.3, -0.9, -0.9] },
      { t: 3.9, cp: 0, hp: 0 },
    ],
    v: [
      { t: 0, ...UPPER, ...stand(0, 0), ...relax('v') },
      { t: 0.28, hp: 0, r: [0, 0, 0], p: [0, 0.93, 0] },
      { t: 0.38, hp: -0.3, cp: -0.14, ka: 0.4, lh: ['v.chest', -0.42, 0.05, -0.05], rh: ['v.chest', 0.42, 0.08, -0.05] },
      // the feet go out from under him
      { t: 0.52, p: [0, 0.76, 0.28], r: [-0.48, 0, 0], sp: -0.08, cp: -0.1, lf: [-0.16, 0, -0.14], rf: [0.18, 0, -0.22], lfl: 0, rfl: 0, lfd: 0.3, rfd: 0.3, lfp: -0.45, rfp: -0.45 },
      { t: 0.72, p: [0, 0.44, 0.46], r: [-0.82, 0, 0], lf: [-0.2, 0.02, -0.34], rf: [0.22, 0.02, -0.44], lfl: 0, rfl: 0, lfd: 0.2, rfd: 0.2, lfp: -0.8, rfp: -0.8, hp: -0.25 },
      { t: 0.86, p: [0, 0.19, 0.52], r: [-0.62, 0, 0], lf: [-0.22, 0.02, -0.26], rf: [0.24, 0.02, -0.38], lfl: 0, rfl: 0, lfp: -0.5, rfp: -0.5, sp: 0.06, cp: 0.1, hp: 0.05 },
      { t: 0.97, p: [0, 0.22, 0.5], r: [-0.56, 0, 0] },
      { t: 1.08, p: [0, 0.18, 0.48], r: [-0.55, -0.1, 0], hp: -0.05, hy: -0.5, cy: -0.25, sy: -0.1, ka: 0.8, lh: ['v.pelvis', -0.3, -0.08, 0.22], rh: ['v.pelvis', 0.34, -0.06, 0.2] },
      // around on his backside, the legs sweep over
      { t: 1.4, p: [0.02, 0.18, 0.44], r: [-0.52, -1.5, 0], lf: [0.76, 0.03, 0.36], rf: [0.7, 0.03, 0.62], lfl: 0.06, rfl: 0.06, lfd: 0.3, rfd: 0.3, lfp: -0.7, rfp: -0.7, hy: -0.2, hp: -0.15, cy: -0.1 },
      { t: 1.74, p: [0.03, 0.18, 0.4], r: [-0.48, -2.95, 0], lf: [0.2, 0.03, 1.08], rf: [-0.18, 0.03, 1.02], lfl: 0.05, rfl: 0.05, lfd: 0.32, rfd: 0.32, lfp: -0.8, rfp: -0.8, hy: 0, cy: 0, sy: 0, hp: -0.28, sp: 0.12, cp: 0.1, lh: ['v.pelvis', 0.3, -0.06, 0.22], rh: ['v.chest', 0.22, 0.14, -0.32], j: 0.3 },
      // and back, away from it, one hand up
      { t: 2.3, p: [0.03, 0.17, 0.16], r: [-0.55, -2.95, 0], lf: [0.2, 0.03, 0.92], rf: [-0.18, 0.03, 0.78], lfl: 0.04, rfl: 0.04, lfd: 0.3, rfd: 0.34, hp: -0.42, cp: 0.04, lh: ['v.pelvis', 0.3, -0.08, 0.26], rh: ['v.chest', 0.2, 0.3, -0.3], j: 0.75, ka: 1 },
      { t: 2.36, ka: 1, kh: 1, kt: 1, kl: 1 },
      { t: 2.42, kh: 0, ka: 0.15 },
      { t: 2.5, kt: 0.55, ka: 0, kl: 0.5, p: [0.02, 0.2, 0.1], r: [-0.8, -2.95, 0] },
      { t: 2.72, kt: 0.34, kl: 0.25, p: [0.0, 0.17, 0.0], r: [-1.22, -2.95, 0.05], hp: 0, cp: 0, sp: 0 },
      { t: 2.96, kt: 0.1, kl: 0.05, p: [-0.01, 0.16, -0.05], r: [-1.5, -2.95, 0.05] },
      { t: 3.2, kt: 0, kl: 0 },
    ],
    vk: { hp: [[0.28, -5], [0.86, 5], [2.36, -22]], hy: [[2.36, 6]], cp: [[0.86, 4], [2.36, -6]], sp: [[0.86, 2.5], [2.36, -3]] },
    ak: { cp: [[2.36, -2.2]], hp: [[2.36, -1.2]] },
    push: [[2.37, [3, 2], 0.3, 0.5, -3], [2.37, [1], 0, 0, -1.2]],
    slow: [[2.36, 0.84, 0.1, 0.04, 0.32]],
    cam: [
      { t: 0, pos: [3.0, 1.2, 2.2], look: [0, 0.92, 0.55], fov: 42 },
      { t: 1.0, pos: [3.3, 0.95, 1.8], look: [0, 0.85, 0.75], fov: 42 },
      { t: 1.9, pos: [2.9, 0.75, 2.25], look: [0, 0.85, 0.75], fov: 42 },
      { t: 2.7, pos: [2.7, 0.68, 2.1], look: [0, 0.78, 0.6], fov: 42 },
      { t: 3.5, pos: [2.8, 0.7, 1.9], look: [0, 0.82, 0.65], fov: 42 },
    ],
    events: [
      [0.24, 'sfx', 'pouch', { vol: 0.8 }], [0.32, 'drop'], [0.86, 'slam', 'v.pelvis', 0.6], [1.04, 'sfx', 'pouch', { vol: 0.8, rate: 0.8 }], [1.24, 'sfx', 'chargeBack', { vol: 0.9 }],
      [2.36, 'shot', 'v.head', 0, 0.06, -0.1, 0, 0.2, 1, 2.2], [2.5, 'kill', [0, 0.1, -1], 0.5, 'head'], [2.8, 'pool', 'v.head', 0.7], [2.9, 'sfx', 'magTouch', { vol: 0.5 }],
    ],
  },
  // ---------------------------------------------------------------------------
  // A boot in the back sends him stumbling. By the time he turns around your own gun is up. A burst, close.
  // ---------------------------------------------------------------------------
  {
    name: 'FEUERSTOSS', dur: 3.8, gun: 'own',
    a: [
      { t: 0, ...UPPER, ...stand(0, 1.04), ...relax('a'), gun: 0, gat: ['a.chest', 0.24, -0.12, -0.1], gaim: ['a.chest', 0.5, 0.1, -1.2] },
      { t: 0.12, lf: [-0.13, 0, 0.94], p: [0, 0.915, 1.0], r: [-0.08, 0, 0], lh: ['a.chest', -0.27, -0.12, -0.14], rh: ['a.chest', 0.27, -0.12, -0.06] },
      { t: 0.2, rf: [0.06, 0.24, 0.74], rfp: -0.2, p: [0, 0.925, 0.96], r: [-0.2, 0, 0], cp: 0.1 },
      { t: 0.31, rf: [0.04, 0.72, 0.18], rfp: -0.6, p: [0, 0.97, 0.82], r: [-0.46, 0, 0], sp: -0.12, cp: 0.28, hp: 0.3, lh: ['a.chest', -0.42, -0.08, 0.02], rh: ['a.chest', 0.42, -0.08, 0.05] },
      { t: 0.45, rf: [0.12, 0.3, 0.42], rfp: -0.1, p: [0, 0.93, 0.76], r: [-0.12, 0, 0], sp: 0, cp: 0.1, hp: 0.16 },
      { t: 0.58, rf: [0.18, 0, 0.72], rfp: 0, p: [0, 0.91, 0.72], r: [0.02, 0, 0], rh: ['a.chest', 0.24, -0.12, -0.1], lh: ['a.chest', -0.2, -0.05, -0.28] },
      { t: 0.6, gun: 1, gat: ['a.chest', 0.24, -0.12, -0.1], gaim: ['a.chest', 0.5, 0.1, -1.2], two: 0 },
      { t: 0.88, gat: ['a.chest', 0.16, 0.02, -0.2], gaim: ['v.chest', 0, 0.02, 0], two: 1, hp: 0.05 },
      { t: 1.08, lf: [-0.16, 0, 0.36], p: [0, 0.88, 0.62], r: [0.06, 0, 0], cp: 0.1 },
      { t: 1.26, gat: ['a.chest', 0.11, 0.12, -0.27], gaim: ['v.chest', 0, 0.02, 0], hp: 0.13, hy: 0.12, cy: 0.06 },
      { t: 1.62, rf: [0.17, 0, 0.4], rfd: 0.34, p: [0, 0.875, 0.42] },
      { t: 1.96, p: [0, 0.875, 0.24], gaim: ['v.chest', 0, 0.02, 0] },
      { t: 2.14, lf: [-0.16, 0, 0.02], lfd: 0.36, gaim: ['v.chest', 0, 0, 0], hp: 0.16 },
      { t: 2.34, p: [0, 0.885, 0.1] },
      { t: 2.6, gat: ['a.chest', 0.12, 0.08, -0.26], gaim: ['v.pelvis', 0, 0, 0] },
      { t: 3.2, ...stand(0, 0.08), lf: [-0.15, 0, -0.02], rf: [0.17, 0, 0.2], gat: ['a.chest', 0.14, -0.14, -0.2], gaim: [0.6, 0.1, -3], hp: 0.08, hy: 0, cp: 0.04, cy: 0 },
      { t: 3.8, gat: ['a.chest', 0.14, -0.18, -0.18], gaim: [0.8, 0, -3], hp: 0, cp: 0 },
    ],
    v: [
      { t: 0, ...UPPER, ...stand(0, 0), ...relax('v') },
      { t: 0.31, p: [0, 0.93, 0], r: [0, 0, 0] },
      { t: 0.42, p: [0, 0.95, -0.28], r: [0.24, 0, 0], ka: 0.3, lh: ['v.chest', -0.44, 0.05, 0.12], rh: ['v.chest', 0.44, 0.02, 0.14] },
      { t: 0.5, lf: [-0.18, 0, -0.82] },
      { t: 0.56, p: [0, 0.9, -0.72], r: [0.44, 0, 0] },
      { t: 0.7, rf: [0.2, 0, -1.34] },
      { t: 0.76, p: [0, 0.86, -1.4], r: [0.38, 0.1, 0], ka: 0.45, lh: ['v.chest', -0.36, -0.2, -0.16], rh: ['v.chest', 0.34, -0.22, -0.12] },
      { t: 0.9, lf: [-0.2, 0, -2.0] },
      { t: 0.98, p: [0, 0.86, -1.96], r: [0.2, 0.22, 0], hy: 0.2 },
      // he catches himself, and comes around
      { t: 1.08, rf: [0.14, 0, -2.44], cy: 0.42, sy: 0.2, hy: 0.45 },
      { t: 1.32, p: [0.02, 0.87, -2.42], r: [-0.04, 2.4, 0], lf: [0.07, 0, -2.22], rf: [-0.03, 0, -2.6], cy: 0.15, sy: 0.05, hy: 0.15, hp: 0.02, ka: 0.6, lh: ['v.chest', -0.22, 0.12, -0.3], rh: ['v.chest', 0.22, 0.1, -0.3], lfd: 0.2, rfd: 0.2 },
      // a burst: every round knocks him a little further
      { t: 1.72, p: [0.02, 0.8, -2.68], r: [-0.3, 2.55, 0.06], cy: 0, sy: 0, hy: 0, ka: 0.15, lf: [0.08, 0, -2.44], lfd: 0.2 },
      { t: 1.76, kt: 1, kl: 1, kh: 0.7 },
      { t: 1.84, kh: 0.2, ka: 0, p: [0.02, 0.78, -2.84], r: [-0.42, 2.55, 0.06] },
      ...fallBack(1.9, 0.02, -2.84, 2.55, { d: 0.55, T: 0.85, lean: -0.42 }),
    ],
    vk: { hp: [[0.31, -8], [1.34, -5], [1.46, -5], [1.58, -6], [1.72, -9]], cp: [[0.31, -5], [1.34, -6], [1.46, -6], [1.58, -7], [1.72, -9]], sp: [[0.31, -4], [1.34, -2], [1.46, -2], [1.58, -2.5], [1.72, -3]], cy: [[1.34, 3], [1.46, -3.5], [1.58, 2.5], [1.72, -2]] },
    ak: { cp: [[1.34, -0.9], [1.46, -0.9], [1.58, -0.9], [1.72, -1]], sp: [[1.34, -0.5], [1.46, -0.5], [1.58, -0.5], [1.72, -0.5]] },
    cam: [
      { t: 0, pos: [3.5, 1.12, 1.3], look: ['mid', 0, -0.3, 0], fov: 42 },
      { t: 0.8, pos: [3.9, 1.08, -0.2], look: [0, 0.95, -0.55], fov: 44 },
      { t: 1.5, pos: [3.75, 1.0, -0.72], look: [0, 0.92, -0.85], fov: 44 },
      { t: 2.4, pos: [3.35, 0.84, -1.35], look: [0, 0.74, -1.3], fov: 44 },
      { t: 3.4, pos: [3.2, 0.76, -1.45], look: [0, 0.74, -1.15], fov: 44 },
    ],
    events: [
      [0.16, 'sfx', 'swing', { vol: 0.5, rate: 0.7 }], [0.31, 'hit', 'v.chest', 0, 0, 0.16, 0, 0.3, -1, 0, 'punch'], [0.34, 'drop'], [0.72, 'sfx', 'land', { vol: 0.6 }], [0.7, 'sfx', 'chargeBack', { vol: 0.8 }],
      [1.34, 'shot', 'v.chest', 0, 0.06, -0.14, 0, 0.1, -1, 1.4], [1.46, 'shot', 'v.chest', 0.05, 0.0, -0.14, 0, 0.1, -1, 1.4], [1.58, 'shot', 'v.chest', -0.06, 0.1, -0.14, 0, 0.1, -1, 1.5], [1.72, 'shot', 'v.chest', 0, 0.12, -0.14, 0, 0.2, -1, 1.8],
      [2.2, 'kill', [0, 0, -1], 0.3, 'chest'], [2.5, 'thud'], [2.6, 'pool', 'v.chest', 0.7],
    ],
  },
  // ---------------------------------------------------------------------------
  // Arms around the waist, and over backward: a suplex. He comes down on his neck, you are on him with the knife before he knows where he is.
  // ---------------------------------------------------------------------------
  {
    name: 'ABFLUG', dur: 4.7, prop: 'knife',
    a: [
      { t: 0, ...UPPER, ...stand(0, 0.84), ...relax('a') },
      { t: 0.2, lf: [-0.18, 0, 0.5], rf: [0.2, 0, 0.84], p: [0, 0.76, 0.52], r: [0.38, 0, 0], cp: 0.1, hp: 0.02, lh: ['v.pelvis', -0.18, 0.08, -0.17], rh: ['v.pelvis', 0.18, 0.08, -0.17] },
      { t: 0.46, p: [0, 0.62, 0.44], r: [0.36, 0, 0], lf: [-0.24, 0, 0.3], rf: [0.24, 0, 0.66], cp: 0.12, lfd: 0.14, rfd: 0.14 },
      // he goes up with everything he has
      { t: 0.76, p: [0, 0.92, 0.5], r: [-0.42, 0, 0], sp: -0.25, cp: -0.25, hp: -0.3, lfp: 0.25, rfp: 0.25 },
      { t: 0.84, lh: ['v.pelvis', -0.18, 0.08, -0.17], rh: ['v.pelvis', 0.18, 0.08, -0.17] },
      { t: 1.0, p: [0, 0.74, 0.92], r: [-1.02, 0, 0], sp: -0.3, cp: -0.3, hp: -0.2, lfp: 0, rfp: 0 },
      { t: 1.14, lh: ['a.chest', -0.42, 0.02, -0.14], rh: ['a.chest', 0.42, 0.02, -0.14] },
      { t: 1.2, p: [0, 0.34, 1.12], r: [-1.25, 0, 0], sp: -0.1, cp: -0.05, hp: 0.2 },
      { t: 1.36, lh: ['a.chest', -0.5, -0.1, 0.1], rh: ['a.chest', 0.5, -0.1, 0.1] },
      { t: 1.5, p: [0.04, 0.3, 1.16], r: [-0.8, 0, 0], lf: [-0.24, 0.02, 0.84], rf: [0.22, 0.02, 0.9], lfl: 0.03, rfl: 0.03, lfd: 0.26, rfd: 0.26, cp: 0.1, hp: 0.3, hy: -0.3 },
      { t: 1.66, lh: [-0.36, 0.08, 1.0], rh: [0.38, 0.08, 0.94] },
      // forward over his own feet, around, and down beside him
      { t: 1.78, p: [0, 0.56, 1.06], r: [0.62, -0.1, 0], sp: 0.14, cp: 0.2, hp: 0.05, hy: -0.35, lh: [-0.34, 0.08, 1.02], rh: [0.36, 0.08, 0.96] },
      { t: 1.98, rf: [-0.22, 0, 1.46], p: [-0.1, 0.64, 1.36], r: [0.5, -1.5, 0], hy: -0.25, cp: 0.2, sp: 0.1, lh: ['a.chest', -0.32, -0.3, -0.26], rh: [-0.1, 0.08, 1.2] },
      { t: 2.22, lf: [-0.3, 0, 1.9], p: [-0.2, 0.64, 1.56], r: [0.42, -2.9, 0], hy: -0.05, rh: ['a.chest', 0.3, -0.34, -0.2] },
      { t: 2.48, ...oneKnee(-0.3, 1.8, -3.14), r: [0.2, -3.14, 0], lf: [-0.3, 0, 2.2], rf: [-0.46, 0.02, 1.18], lfd: 0.24, rfd: 0.24, hy: 0, hp: 0.34, cp: 0.12, cy: 0.15, rh: ['a.pelvis', 0.24, -0.05, 0.02], lh: ['a.chest', -0.2, -0.24, -0.34] },
      { t: 2.64, rh: ['a.chest', 0.14, 0.26, -0.26], pto: ['a.chest', 0.14, 1.2, -0.3], lh: ['v.chest', -0.16, 0.16, 0.2], cp: 0.2 },
      // the knife goes up
      { t: 2.86, p: [-0.3, 0.68, 1.82], r: [0.02, -3.14, 0], cp: -0.08, sp: -0.05, hp: 0.4, cy: 0.1, rh: ['a.chest', 0.06, 0.6, -0.1], pto: ['a.chest', 0.06, 1.4, 0.2] },
      { t: 2.94, rh: ['a.chest', 0.06, 0.62, -0.08], pto: ['a.chest', 0.06, 1.4, 0.2] },
      // and down
      { t: 3.04, p: [-0.3, 0.5, 1.86], r: [0.6, -3.14, 0], cp: 0.36, sp: 0.28, hp: 0.42, cy: 0.34, rh: ['v.chest', 0, 0.08, 0.2], pto: ['v.chest', 0, 0.02, -0.1] },
      { t: 3.44, p: [-0.3, 0.55, 1.84], r: [0.46, -3.14, 0], cp: 0.28, sp: 0.2, cy: 0.28, rh: ['v.chest', 0, 0.1, 0.24], pto: ['v.chest', 0, 0.02, -0.1] },
      { t: 3.9, ...stand(-0.34, 1.45, -3.14), sp: 0, cp: 0.1, cy: 0, hp: 0.28, rh: ['a.chest', 0.28, -0.3, -0.16], lh: ['a.chest', -0.24, -0.38, -0.08], pto: ['a.chest', 0.4, -0.9, -0.3], lfp: 0, rfp: 0 },
      { t: 4.7, hp: 0.05, cp: 0 },
    ],
    v: [
      { t: 0, ...UPPER, ...stand(0, 0), ...relax('v') },
      { t: 0.2, p: [0, 0.93, 0], r: [0, 0, 0], hp: 0, cp: 0 },
      { t: 0.3, hp: -0.12, cp: -0.1, j: 0.6, lh: ['a.lhand', -0.03, 0.06, 0], rh: ['a.rhand', 0.03, 0.06, 0] },
      { t: 0.46, p: [0, 0.97, 0.02], r: [-0.06, 0, 0], j: 0.9, lfp: 0.35, rfp: 0.35 },
      { t: 0.58, kl: 1, ka: 1 },
      { t: 0.76, p: [0, 1.52, 0.16], r: [-0.8, 0, 0], kl: 0.4, ka: 0.3, hp: -0.3, cp: -0.15, j: 0.3, lf: [-0.16, 0.5, -0.1], rf: [0.16, 0.56, -0.2], lfp: 0.6, rfp: 0.6, lh: ['v.chest', -0.5, 0.1, 0.1], rh: ['v.chest', 0.5, 0.12, 0.1] },
      { t: 1.0, p: [0, 1.72, 0.82], r: [-1.9, 0, 0], hp: -0.32, cp: -0.08, j: 0, lf: [-0.2, 2.4, 0.3], rf: [0.2, 2.45, 0.2] },
      { t: 1.16, p: [0, 1.08, 1.75], r: [-2.85, 0, 0], hp: -0.1, cp: 0.05, lf: [-0.22, 1.9, 1.45], rf: [0.22, 1.9, 1.35], kt: 1 },
      // on his neck, and the rest comes over after him
      { t: 1.22, p: [0, 0.8, 2.0], r: [-3.05, 0, 0], kh: 0.5 },
      { t: 1.28, kt: 0.1, kh: 0, ka: 0, kl: 0.05 },
      { t: 1.36, kt: 0, kl: 0 },
    ],
    vk: { hp: [[0.26, -3]] },
    ak: { cp: [[3.04, 1.5]], hp: [[3.04, 1]] },
    push: [[1.24, [8, 9, 6, 7], 0, 0.6, 1.0], [3.04, [1, 10, 11], 0, -1.6, 0], [3.04, [3], 0, 1.8, 0], [3.04, [8, 9], 0, 1.3, 0]],
    slow: [[1.0, 0.84, 0.2, 0.1, 0.22], [3.04, 0.84, 0.1, 0.04, 0.3]],
    cam: [
      { t: 0, pos: [3.2, 1.05, 1.1], look: ['mid', 0, -0.25, 0], fov: 44 },
      { t: 0.7, pos: [3.85, 0.85, 1.15], look: [0, 1.08, 0.85], fov: 48 },
      { t: 1.3, pos: [3.7, 0.72, 1.6], look: [0, 0.65, 1.4], fov: 46 },
      { t: 2.5, pos: [3.0, 0.74, 2.3], look: [0.2, 0.55, 1.95], fov: 40 },
      { t: 3.3, pos: [2.7, 0.66, 2.2], look: [0.2, 0.52, 2.0], fov: 38 },
      { t: 4.3, pos: [2.9, 0.82, 2.2], look: [0.25, 0.78, 1.8], fov: 40 },
    ],
    events: [
      [0.2, 'sfx', 'pouch', { vol: 0.9 }], [0.3, 'drop'], [0.72, 'sfx', 'swing', { vol: 0.8, rate: 0.6 }], [1.26, 'slam', 'v.head', 1.5], [1.28, 'sfx', 'crack', { vol: 0.8, rate: 0.8 }],
      [1.44, 'sfx', 'thud', { vol: 0.8, rate: 1.2 }], [2.34, 'prop', 1], [2.36, 'sfx', 'chargeBack', { vol: 0.5, rate: 1.4 }], [2.92, 'sfx', 'swing', { vol: 0.7, rate: 0.6 }],
      [3.04, 'hit', 'v.chest', 0, 0.08, 0.16, 0, 1, 0.1, 2.0, 'stab'], [3.22, 'hit', 'v.chest', 0, 0.08, 0.16, 0.1, 0.8, 0, 1.0], [3.4, 'kill', [0, 0.1, 0.3], 0.1, 'chest'], [3.46, 'pool', 'v.chest', 0.8],
    ],
  },
  // ---------------------------------------------------------------------------
  // The pin comes out with him watching, the grenade goes into his vest, a kick, and you walk away.
  // Toward the camera. You don't look back.
  // ---------------------------------------------------------------------------
  {
    name: 'GESCHENK', dur: 5.2, prop: 'nade', stuck: true,
    a: [
      { t: 0, ...UPPER, ...stand(0, 0.92), ...relax('a') },
      { t: 0.16, lf: [-0.14, 0, 0.58], p: [0, 0.92, 0.76] },
      { t: 0.3, rf: [0.15, 0, 0.72], p: [0, 0.9, 0.5], r: [0.04, 0, 0], cp: 0.05, lh: ['v.head', 0.1, -0.09, -0.03], rh: ['a.chest', 0.18, -0.08, -0.1] },
      { t: 0.62, rh: ['a.chest', 0.3, 0.14, -0.3], pto: ['a.chest', 0.3, 1.0, -0.5], hy: -0.25, hp: 0.05, p: [0, 0.9, 0.46] },
      { t: 0.86, p: [0.02, 0.89, 0.42], r: [0.09, 0.05, 0] },
      { t: 1.0, rh: ['v.head', 0.26, -0.08, -0.32], hy: -0.32, cy: -0.14 },
      { t: 1.16, lh: ['v.head', 0.1, -0.09, -0.03], rh: ['v.head', 0.26, -0.08, -0.32] },
      // the pin, with the left hand, right in front of his eyes
      { t: 1.32, lh: ['a.rhand', 0.02, 0.09, -0.03], cy: -0.2, sy: -0.06 },
      { t: 1.36, p: [-0.01, 0.9, 0.5], r: [0.02, -0.04, 0] },
      { t: 1.46, lh: ['a.rhand', 0.14, 0.2, 0.02], rh: ['v.head', 0.25, -0.08, -0.31] },
      { t: 1.64, lh: ['v.head', 0.08, -0.1, -0.06], cy: 0.02, sy: 0, hy: 0, hp: 0.15 },
      { t: 1.76, rh: ['v.chest', 0.08, 0.12, -0.3], cy: 0.1, sy: 0.04, hp: 0.25, cp: 0.1 },
      { t: 1.86, p: [0.01, 0.89, 0.46], r: [0.06, 0.03, 0] },
      { t: 1.94, rh: ['v.chest', 0, 0.03, -0.2], cp: 0.14 },
      { t: 2.08, rh: ['a.chest', 0.28, -0.1, -0.14], lh: ['a.chest', -0.26, -0.1, -0.2], cy: 0, sy: 0, hp: 0.1, cp: 0.04, p: [0, 0.91, 0.52] },
      // a foot in his back
      { t: 2.16, rf: [0.08, 0.2, 0.52], rfp: -0.2, p: [0, 0.93, 0.58], r: [-0.18, 0, 0] },
      { t: 2.28, rf: [0.03, 0.7, 0.02], rfp: -0.5, p: [0, 0.97, 0.5], r: [-0.46, 0, 0], sp: -0.1, cp: 0.3, hp: 0.3, lh: ['a.chest', -0.42, -0.08, 0.02], rh: ['a.chest', 0.42, -0.08, 0.05] },
      { t: 2.42, rf: [0.1, 0.28, 0.3], rfp: 0, p: [0, 0.93, 0.46], r: [-0.1, 0, 0], sp: 0, cp: 0.08 },
      { t: 2.56, rf: [0.16, 0, 0.5], p: [0, 0.92, 0.5], r: [0, 0, 0], cp: 0, hp: 0.05, ...relax('a') },
      // and around, not fast
      { t: 2.74, r: [0, 1.4, 0], p: [0.03, 0.92, 0.6], hy: 0.2 },
      { t: 2.98, r: [0, 3.1, 0], p: [0.06, 0.925, 0.78], lf: footAt(0.06, 0.78, 3.1, -0.13, 0.04), rf: footAt(0.06, 0.78, 3.1, 0.13, -0.04), hy: -0.08, hp: 0 },
      { t: 3.4, lf: [0.2, 0, 1.3], p: [0.08, 0.925, 1.08], lh: ['a.chest', -0.24, -0.34, 0.06], rh: ['a.chest', 0.24, -0.36, -0.14], hy: 0 },
      { t: 3.84, rf: [-0.04, 0, 1.82], p: [0.08, 0.925, 1.6], lh: ['a.chest', -0.24, -0.36, -0.14], rh: ['a.chest', 0.24, -0.34, 0.06] },
      { t: 4.28, lf: [0.2, 0, 2.34], p: [0.08, 0.925, 2.12], lh: ['a.chest', -0.24, -0.34, 0.06], rh: ['a.chest', 0.24, -0.36, -0.14] },
      { t: 4.72, rf: [-0.04, 0, 2.86], p: [0.08, 0.925, 2.64], lh: ['a.chest', -0.24, -0.36, -0.14], rh: ['a.chest', 0.24, -0.34, 0.06] },
      { t: 5.2, lf: [0.2, 0, 3.02], p: [0.08, 0.93, 2.94], ...relax('a') },
    ],
    v: [
      { t: 0, ...UPPER, ...stand(0, 0), ...relax('v') },
      { t: 0.22, hp: 0, cp: 0, p: [0, 0.93, 0] },
      { t: 0.34, hp: -0.3, cp: -0.15, sp: -0.08, p: [0, 0.91, 0.08], lh: ['a.lhand', -0.02, 0.05, -0.02], rh: ['a.lhand', 0.04, -0.02, 0.05], j: 0.7 },
      { t: 0.8, p: [0.03, 0.9, 0.03], r: [0.12, 0.08, -0.02] },
      { t: 0.96, hy: -0.2, hp: -0.2, j: 0.5 },
      { t: 1.12, rh: ['v.chest', 0.2, 0.12, -0.32] },
      { t: 1.25, hy: -0.34, hp: -0.16, j: 0.35, cy: -0.06 },
      { t: 1.3, p: [-0.02, 0.91, 0.08], r: [-0.04, -0.06, 0.03] },
      { t: 1.6, hy: 0, hp: 0.1, cy: 0, rh: ['a.rhand', 0, -0.03, 0.04], j: 1 },
      { t: 1.82, p: [0.02, 0.895, 0.03], r: [0.08, 0.05, -0.02] },
      { t: 2.0, hp: 0.22, j: 1 },
      { t: 2.27, p: [0, 0.91, 0.06], r: [0, 0, 0], hp: 0.28, cp: -0.05, sp: -0.05 },
      { t: 2.3, ka: 1 },
      { t: 2.38, p: [0, 0.97, -0.22], r: [0.26, 0, 0], ka: 0.3, cp: -0.05, lh: ['v.chest', -0.44, 0.06, 0.1], rh: ['v.chest', 0.44, 0.06, 0.1] },
      { t: 2.5, lf: [-0.2, 0, -0.8] },
      { t: 2.54, p: [0, 0.9, -0.74], r: [0.46, 0, 0], j: 0.2 },
      { t: 2.72, rf: [0.2, 0, -1.38] },
      { t: 2.8, p: [0, 0.86, -1.5], r: [0.38, 0, 0], ka: 0.7, lh: ['v.chest', -0.08, 0.02, -0.22], rh: ['v.chest', 0.1, 0.02, -0.22], cp: 0.22, sp: 0.2, hp: 0.28, j: 1 },
      { t: 2.96, lf: [-0.2, 0, -2.02] },
      { t: 3.08, p: [0, 0.84, -2.2], r: [0.32, 0, 0] },
      { t: 3.2, rf: [0.18, 0, -2.5] },
      { t: 3.4, p: [0.03, 0.84, -2.5], r: [0.28, 1.2, 0], lf: [-0.12, 0, -2.3] },
      { t: 3.72, p: [0.05, 0.84, -2.6], r: [0.2, 2.7, 0], rf: [0.12, 0, -2.76], hp: 0.36 },
      { t: 3.96, kt: 1, ka: 1, kl: 1, kh: 1 },
      { t: 3.98, kt: 0, ka: 0, kl: 0, kh: 0 },
    ],
    vk: { hp: [[0.3, -3], [2.28, -9]], cp: [[2.28, -5]], sp: [[2.28, -4]] },
    push: [[3.98, [0, 4, 5], 0, 6.2, -2.2], [3.98, [1, 2, 3, 10, 11], 0.4, 7.8, -3.8], [3.98, [6, 7, 8, 9], -0.4, 4.6, -0.8], [3.98, [12, 13, 14, 15], 0.5, 6.8, -3]],
    cam: [
      { t: 0, pos: [2.5, 1.3, 1.2], look: ['mid', 0, -0.15, 0], fov: 42 },
      { t: 0.7, crop: 1, pos: [2.8, 1.35, -0.75], look: [0.05, 1.22, 0.12], fov: 32 },
      { t: 1.3, crop: 1, pos: [2.55, 1.35, -1.25], look: [0.08, 1.3, 0.02], fov: 26 },
      { t: 1.95, crop: 1, pos: [2.65, 1.2, -1.3], look: [0.05, 1.18, 0.02], fov: 28 },
      { t: 2.55, pos: [3.4, 1.05, -0.6], look: [0, 0.95, -0.4], fov: 42 },
      { t: 2.74, cut: true, only: 'a', pos: [1.35, 1.1, 5.7], look: [0.3, 1.15, 0.6], fov: 34 },
      { t: 5.1, pos: [1.2, 1.2, 5.1], look: [0.2, 1.2, 2.2], fov: 36 },
    ],
    events: [
      [0.22, 'sfx', 'pouch', { vol: 0.9 }], [0.42, 'drop'], [0.5, 'prop', 1], [0.55, 'sfx', 'pouch', { vol: 0.7, rate: 1.2 }], [1.4, 'pin'], [1.94, 'stick', 'v.chest', 0, 0.03, -0.2], [1.94, 'sfx', 'pouch', { vol: 0.9, rate: 0.8 }],
      [2.28, 'hit', 'v.chest', 0, 0, 0.16, 0, 0.3, -1, 0, 'punch'], [3.98, 'explode', 'v.chest'], [4.0, 'kill', [0.1, 1.2, -1], 11, 'chest'], [4.9, 'pool', 'v.pelvis', 1.3],
    ],
  },
  // ---------------------------------------------------------------------------
  // Quiet. A hand over the mouth, dragged back into the shadow, one cut, and you let him down gently.
  // ---------------------------------------------------------------------------
  {
    name: 'STILLE', dur: 4.2, prop: 'knife',
    a: [
      { t: 0, ...UPPER, ...stand(0, 0.74), ...relax('a') },
      { t: 0.14, lf: [-0.14, 0, 0.42], p: [0, 0.92, 0.56] },
      { t: 0.26, rf: [0.15, 0, 0.5], p: [0, 0.9, 0.36], cp: 0.05, lh: ['v.head', 0, 0.02, -0.12], rh: ['a.chest', 0.24, -0.2, -0.12] },
      // back, a step at a time, all his weight on the arm
      { t: 0.5, rf: [0.16, 0, 0.76], p: [0, 0.88, 0.6], r: [-0.14, 0, 0], sp: -0.05, cp: -0.05 },
      { t: 0.86, lf: [-0.14, 0, 0.9], p: [0, 0.87, 1.0], r: [-0.18, 0, 0] },
      { t: 1.16, rf: [0.16, 0, 1.28], p: [0, 0.86, 1.3], r: [-0.14, 0, 0], hy: 0 },
      { t: 1.24, rh: ['a.chest', 0.3, 0.12, -0.28], pto: ['v.head', -0.4, -0.1, -0.2], hy: -0.15, hp: 0.15 },
      { t: 1.52, rh: ['v.head', 0.2, -0.1, -0.08], pto: ['v.head', -0.2, -0.1, -0.1], cy: 0 },
      { t: 1.62, rh: ['v.head', 0.2, -0.1, -0.08], pto: ['v.head', -0.2, -0.1, -0.1], sy: 0 },
      { t: 1.8, rh: ['v.head', -0.22, -0.12, -0.05], pto: ['v.head', -0.6, -0.1, 0.1], cy: 0.2, sy: 0.08 },
      { t: 2.14, rh: ['a.chest', -0.05, 0.05, -0.34], pto: ['a.chest', -0.3, 0.1, -0.7], cy: 0.05, sy: 0 },
      // and down with him, slowly
      { t: 2.5, p: [-0.24, 0.66, 1.24], r: [0.28, 0, 0], lf: [-0.44, 0, 0.98], rf: [-0.06, 0.02, 1.6], lfd: 0.34, rfd: 0.34, rfp: 0.9, cp: 0.2, sp: 0.1, hp: 0.25, hy: 0, lh: ['v.chest', -0.06, 0.26, 0.05], rh: ['a.chest', 0.28, -0.22, -0.12], pto: ['a.chest', 0.5, -0.8, -0.5] },
      { t: 3.0, p: [-0.46, 0.56, 1.3], r: [0.35, 0, 0], lf: [-0.64, 0, 0.92], rf: [-0.3, 0.02, 1.86], rfp: 1.25, cp: 0.25, hp: 0.3, lh: ['v.chest', -0.06, 0.2, 0.05] },
      { t: 3.36, hy: 0.5, hp: -0.05, cp: 0.05, cy: 0.2, r: [0.1, 0, 0], lh: ['a.pelvis', -0.24, 0.05, -0.3], p: [-0.46, 0.6, 1.32] },
      { t: 4.2, ...stand(-0.46, 1.45), lf: [-0.6, 0, 1.36], rf: [-0.32, 0, 1.56], cp: 0, hy: 0, hp: 0, cy: 0, sp: 0, rfp: 0, ...relax('a'), pto: ['a.chest', 0.4, -0.9, -0.5] },
    ],
    v: [
      { t: 0, ...UPPER, ...stand(0, 0), ...relax('v') },
      { t: 0.16, hp: 0, cp: 0, p: [0, 0.93, 0] },
      { t: 0.28, p: [0, 0.92, 0.04], hp: -0.38, cp: -0.14, j: 1 },
      { t: 0.4, lh: ['a.lhand', -0.02, 0.1, -0.05], rh: ['a.lhand', 0.04, 0.2, 0.02] },
      { t: 0.5, p: [0, 0.82, 0.3], r: [-0.3, 0, 0], lf: [-0.15, 0, -0.04], rf: [0.17, 0, -0.08], lfl: 0, rfl: 0, lfd: 0.3, rfd: 0.3, lfp: -0.35, rfp: -0.35, hp: -0.5, cp: -0.15, j: 0.9 },
      { t: 0.86, p: [0, 0.78, 0.66], r: [-0.38, 0, 0], lf: [-0.17, 0, 0.2], rf: [0.17, 0, 0.08], lfl: 0, rfl: 0, lfd: 0.34, rfd: 0.34 },
      { t: 1.16, p: [0, 0.76, 0.94], r: [-0.42, 0, 0], lf: [-0.17, 0, 0.5], rf: [0.17, 0, 0.32], lfl: 0, rfl: 0, lfd: 0.3, rfd: 0.3, j: 0.8 },
      { t: 1.62, hp: -0.72, j: 0.7, rh: ['a.rhand', 0, 0, 0.08] },
      { t: 1.8, hp: -0.78, j: 1 },
      { t: 2.14, hp: -0.4, cp: 0.05, lh: ['v.head', -0.05, -0.14, -0.1], rh: ['v.head', 0.06, -0.14, -0.1], j: 0.75 },
      { t: 2.5, p: [0, 0.54, 0.86], r: [-0.3, 0, 0], lf: [-0.2, 0, 0.3], rf: [0.2, 0, 0.1], lfl: 0, rfl: 0, lfd: 0.34, rfd: 0.34, lfp: -0.4, rfp: -0.4, hp: 0.1, cp: 0.1, sp: 0.06, j: 0.4, ka: 0.9, kl: 0.9 },
      { t: 2.86, p: [0, 0.34, 0.8], r: [-0.8, 0, 0], kt: 1, ka: 0.5, kl: 0.5, j: 0.12, kh: 0.8 },
      { t: 3.14, p: [0, 0.2, 0.74], r: [-1.25, 0, 0], kt: 0.42, ka: 0, kl: 0.2, kh: 0, j: 0 },
      { t: 3.4, p: [0, 0.17, 0.66], r: [-1.5, 0, 0], sp: 0, cp: 0, kt: 0.15, kl: 0.05 },
      { t: 3.62, kt: 0, kl: 0 },
    ],
    vk: { hp: [[1.8, -3]] },
    slow: [[1.8, 0.84, 0.12, 0.1, 0.35]],
    cam: [
      { t: 0, pos: [2.6, 1.3, 1.4], look: ['mid', 0, -0.2, 0], fov: 38 },
      { t: 0.8, pos: [2.9, 1.22, 0.6], look: ['mid', 0, -0.12, 0], fov: 34 },
      { t: 1.3, crop: 1, pos: [2.75, 1.22, 0.5], look: ['mid', 0, -0.02, 0], fov: 31 },
      { t: 1.75, crop: 1, pos: [2.55, 1.16, 0.45], look: ['@v.head', 0, -0.2, 0], fov: 28 },
      { t: 2.4, pos: [2.95, 0.9, 0.85], look: ['mid', 0, -0.2, 0], fov: 32 },
      { t: 3.3, pos: [3.1, 0.62, 0.95], look: [-0.1, 0.5, 0.95], fov: 36 },
      { t: 4.0, pos: [3.1, 0.75, 0.85], look: [-0.2, 0.75, 1.1], fov: 40 },
    ],
    events: [
      [0.16, 'sfx', 'pouch', { vol: 0.9 }], [0.3, 'drop'], [1.2, 'prop', 1], [1.22, 'sfx', 'chargeBack', { vol: 0.4, rate: 1.5 }], [1.66, 'sfx', 'swing', { vol: 1, rate: 1.1 }],
      [1.72, 'hit', 'v.head', 0, -0.12, -0.12, 0.3, 0, -1, 1.6, 'stab'], [1.74, 'spurt', 1.2], [2.5, 'pool', 'v.head', 0.7], [3.1, 'kill', [0, 0, 0.2], 0.05, 'chest'], [3.3, 'thud'],
    ],
  },
  // ---------------------------------------------------------------------------
  // Kicked to his knees. Over him the axe goes up against the sky. Seen from below, slow.
  // ---------------------------------------------------------------------------
  {
    name: 'RICHTBEIL', dur: 3.9, prop: 'axe',
    a: [
      { t: 0, ...UPPER, ...stand(0, 0.98), ...relax('a') },
      { t: 0.12, lf: [-0.13, 0, 0.86], p: [0, 0.92, 0.92], r: [-0.06, 0, 0], lh: ['a.chest', -0.27, -0.1, -0.16], rh: ['a.chest', 0.27, -0.1, -0.06] },
      { t: 0.2, rf: [0.08, 0.2, 0.7], rfp: -0.1, p: [0, 0.92, 0.88], r: [-0.18, 0, 0], cp: 0.15 },
      { t: 0.3, rf: [0.08, 0.34, 0.22], rfp: 0.1, p: [0.02, 0.93, 0.8], r: [-0.3, 0, 0], cp: 0.25, hp: 0.25, lh: ['a.chest', -0.4, -0.1, 0], rh: ['a.chest', 0.42, -0.1, 0.05] },
      { t: 0.46, rf: [0.16, 0.1, 0.5], rfp: 0, p: [0, 0.91, 0.62], r: [-0.04, 0, 0], cp: 0.1 },
      { t: 0.58, rf: [0.2, 0, 0.58], p: [0, 0.89, 0.46], r: [0.06, 0, 0], hp: 0.28, rh: ['a.chest', 0.3, -0.26, -0.02] },
      { t: 0.74, lf: [-0.16, 0, 0.16], p: [0, 0.88, 0.32], lh: ['v.head', 0, 0.14, 0.08] },
      { t: 0.84, rh: ['a.chest', 0.32, -0.14, -0.1], pto: ['a.chest', 0.6, 0.5, -0.3], cy: -0.18, hy: 0.08, cp: 0.06 },
      { t: 1.06, rh: ['a.chest', 0.38, 0.22, -0.12], pto: ['a.chest', 0.42, 1.2, 0.2] },
      // up it goes, slowly
      { t: 1.3, p: [0, 0.875, 0.32], r: [-0.08, 0, 0], cp: -0.14, sp: -0.08, hp: 0.3, cy: -0.28, sy: -0.15, rh: ['a.chest', 0.14, 0.76, 0.1], pto: ['a.chest', 0.1, 1.6, 0.75], lh: ['v.head', 0, 0.14, 0.08] },
      { t: 1.72, p: [0, 0.88, 0.34], cp: -0.17, r: [-0.1, 0, 0], rh: ['a.chest', 0.12, 0.78, 0.14], pto: ['a.chest', 0.05, 1.6, 0.85], cy: -0.3, sy: -0.16, sp: -0.09 },
      // and down
      { t: 1.86, p: [0, 0.76, 0.2], r: [0.42, 0, 0], cp: 0.42, sp: 0.2, hp: 0.25, cy: 0.12, sy: 0.08, rh: ['v.chest', 0.02, 0.26, 0.2], pto: ['v.chest', 0, 0.1, -0.1], lh: ['v.head', 0, 0.12, 0.08] },
      { t: 2.22, cp: 0.38, r: [0.38, 0, 0], p: [0, 0.77, 0.22], rh: ['v.chest', 0.02, 0.26, 0.2], pto: ['v.chest', 0, 0.1, -0.1], hp: 0.28, lh: ['v.head', 0, 0.12, 0.08] },
      { t: 2.44, p: [0, 0.8, 0.32], r: [0.12, 0, 0], cp: 0.1, sp: 0.02, cy: -0.05, sy: 0, rh: ['a.chest', 0.26, 0.2, -0.28], pto: ['a.chest', 0.42, 0.8, -0.7], lh: ['a.chest', -0.24, 0, -0.3] },
      // the boot sends him the rest of the way
      { t: 2.64, rf: [0.08, 0.5, -0.2], rfp: -0.4, p: [0, 0.97, 0.36], r: [-0.3, 0, 0], sp: -0.1, cp: 0.22, hp: 0.3 },
      { t: 2.8, rf: [0.12, 0.2, 0.06], rfp: -0.05, p: [0, 0.93, 0.32], r: [-0.05, 0, 0], sp: 0, cp: 0.12 },
      { t: 2.96, rf: [0.18, 0, 0.42], rfp: 0, p: [0, 0.93, 0.34], r: [0, 0, 0], cp: 0.08, hp: 0.2, rh: ['a.chest', 0.28, -0.32, -0.16], pto: ['a.chest', 0.42, -0.95, -0.7], lh: ['a.chest', -0.24, -0.36, -0.08] },
      { t: 3.9, cp: 0, hp: 0 },
    ],
    v: [
      { t: 0, ...UPPER, ...stand(0, 0), ...relax('v') },
      { t: 0.3, p: [0, 0.93, 0], r: [0, 0, 0], hp: 0, cp: 0 },
      { t: 0.37, p: [0, 0.82, -0.08], r: [0.08, 0, 0], hp: -0.22, cp: -0.08, ka: 0.5, lh: ['v.chest', -0.38, -0.05, -0.1], rh: ['v.chest', 0.38, -0.05, -0.1], lfp: 0.2, rfp: 0.5 },
      // on his knees, the toes tucked under
      { t: 0.62, p: [0, 0.54, -0.38], r: [0.05, 0, 0], lf: [-0.17, 0, 0.22], rf: [0.17, 0, 0.22], lfl: 0, rfl: 0, lfd: 0.26, rfd: 0.26, lfp: 1.35, rfp: 1.35, hp: -0.4, cp: -0.05, j: 0.5 },
      { t: 1.2, hp: -0.3, j: 0.7, ka: 0.85, lh: ['v.chest', -0.22, 0.05, -0.28], rh: ['v.chest', 0.22, 0.05, -0.28], p: [0, 0.54, -0.38], r: [0.05, 0, 0], cp: -0.03 },
      { t: 1.84, hp: -0.34, j: 1, p: [0, 0.54, -0.38], r: [0.05, 0, 0], ka: 0.85, cp: -0.03, sp: 0 },
      { t: 1.94, p: [0, 0.5, -0.36], r: [0.38, 0, 0], sp: 0.2, cp: 0.28, hp: 0.12, ka: 0.2, lh: ['v.chest', -0.42, -0.1, -0.05], rh: ['v.chest', 0.42, -0.1, -0.05] },
      { t: 2.3, r: [0.24, 0, 0.05], sp: 0.05, cp: 0.05, hp: -0.12, j: 0.6, lh: ['v.chest', -0.3, -0.36, -0.1], rh: ['v.chest', 0.3, -0.36, -0.1], kh: 0.7 },
      { t: 2.62, kt: 1, kl: 1, kh: 0.2, ka: 0, j: 0, r: [0.3, 0, 0.05], p: [0, 0.5, -0.4] },
      ...fallForward(2.68, 0, -0.42, 0, { d: 0.62, T: 0.72, kneeling: true }),
    ],
    vk: { hp: [[0.3, -6], [0.62, 4], [1.86, -7]], cp: [[0.3, -2.5], [0.62, 2.5], [1.86, 5]], sp: [[1.86, 3]], hz: [[1.86, 5]] },
    ak: { cp: [[1.86, 1.4]], hp: [[1.86, 1]] },
    push: [[2.65, [1, 10, 11], 0, 0.2, -3.4], [2.65, [2, 3], 0, 0.2, -2.2]],
    slow: [[1.86, 0.84, 0.1, 0.1, 0.32]],
    cam: [
      { t: 0, pos: [2.7, 1.12, 1.7], look: ['mid', 0, -0.3, 0], fov: 42 },
      { t: 0.6, pos: [3.1, 0.85, 0.6], look: [0, 0.85, 0.05], fov: 40 },
      { t: 1.25, pos: [2.9, 0.42, -0.35], look: [0, 1.02, 0.02], fov: 44 },
      { t: 1.85, pos: [2.75, 0.38, -0.45], look: [0, 1.02, 0.02], fov: 42 },
      { t: 2.6, pos: [3.0, 0.52, -0.75], look: [0, 0.78, -0.15], fov: 40 },
      { t: 3.4, pos: [3.1, 0.62, -0.8], look: [0, 0.75, -0.15], fov: 42 },
    ],
    events: [
      [0.26, 'sfx', 'swing', { vol: 0.5, rate: 0.7 }], [0.3, 'hit', 'v.pelvis', 0, -0.3, 0.1, 0, 0.1, 1, 0, 'punch'], [0.42, 'drop'], [0.62, 'slam', 'v.pelvis', 0.3], [0.63, 'sfx', 'thud', { vol: 0.8, rate: 1.1 }], [0.74, 'prop', 1],
      [0.76, 'sfx', 'chargeBack', { vol: 0.4, rate: 0.8 }], [1.76, 'sfx', 'swing', { vol: 1, rate: 0.6 }], [1.86, 'hit', 'v.chest', 0, 0.26, 0.12, 0, 1, 0.3, 2.2, 'stab'], [1.86, 'sfx', 'crack', { vol: 0.8, rate: 0.7 }], [2.36, 'hit', 'v.chest', 0, 0.26, 0.12, 0, 0.9, 0.5, 1.2], [2.37, 'sfx', 'stab', { vol: 0.8, rate: 0.8 }],
      [2.64, 'sfx', 'punch', { vol: 0.8 }], [3.0, 'thud'], [2.9, 'kill', [0, 0, -0.3], 0.1, 'chest'], [3.1, 'pool', 'v.chest', 0.9],
    ],
  },
  // ---------------------------------------------------------------------------
  // A friendly hand on the shoulder, he turns, a knife goes into his belly and twists. On his knees he looks up once more.
  // ---------------------------------------------------------------------------
  {
    name: 'A FRIENDLY HELLO', dur: 4.2, prop: 'knife', front: 0.94,
    a: [
      { t: 0, ...UPPER, ...stand(0, 1.0), ...relax('a') },
      { t: 0.16, lf: [-0.14, 0, 0.66], p: [-0.02, 0.925, 0.82] },
      { t: 0.3, rf: [0.12, 0, 0.86], p: [-0.05, 0.915, 0.68], lh: ['v.chest', -0.2, 0.22, 0.1], rh: ['a.chest', 0.25, -0.38, -0.1], hy: 0.05 },
      { t: 0.46, lh: ['v.chest', -0.2, 0.18, 0.06] },
      { t: 0.56, p: [-0.06, 0.915, 0.66], lh: [-0.2, 1.44, 0.08], rh: ['a.chest', 0.25, -0.38, -0.08] },
      { t: 0.88, p: [-0.06, 0.905, 0.68], cy: -0.22, sy: -0.12, hy: 0.1, lh: [-0.2, 1.42, 0.06], rh: ['a.pelvis', 0.2, 0.02, 0.12], pto: ['a.pelvis', 0.2, 0.3, -0.3] },
      { t: 1.14, lf: [-0.16, 0, 0.5], p: [-0.05, 0.87, 0.62], r: [0.16, 0, 0], cy: 0.42, sy: 0.26, cp: 0.12, hp: 0.12, hy: 0, lh: ['v.chest', 0.18, 0.18, 0.02], rh: ['v.pelvis', 0.02, 0.2, -0.2], pto: ['v.pelvis', 0.02, 0.24, 0.12], rfp: 0.5 },
      { t: 1.48, cy: 0.3, rh: ['v.pelvis', 0.04, 0.24, -0.18], pto: ['v.pelvis', -0.1, 0.3, 0.1], p: [-0.05, 0.87, 0.62], r: [0.18, 0, 0], lh: ['v.chest', 0.18, 0.18, 0.02] },
      { t: 1.8, p: [-0.04, 0.9, 0.8], r: [0.02, 0, 0], cy: 0, sy: 0, cp: 0.1, hp: 0.28, lh: ['a.chest', -0.22, -0.1, -0.24], rh: ['a.chest', 0.28, -0.06, -0.18], pto: ['a.chest', 0.4, 0.4, -0.5], rfp: 0, rf: [0.16, 0, 0.92] },
      { t: 2.14, p: [-0.02, 0.82, 0.66], r: [0.14, 0, 0], cp: 0.2, hp: 0.32, lh: ['v.head', -0.02, 0.07, 0.1], rh: ['a.chest', 0.34, 0.06, -0.14], pto: ['v.head', 0.1, -0.1, 0] },
      { t: 2.48, r: [0.22, 0, 0], cy: 0.35, sy: 0.16, lh: ['v.head', -0.02, 0.05, 0.1], rh: ['v.head', 0.13, -0.13, -0.03], pto: ['v.head', -0.1, -0.14, 0], p: [-0.02, 0.82, 0.66] },
      { t: 2.78, rh: ['v.head', 0.13, -0.13, -0.03], pto: ['v.head', -0.1, -0.14, 0], lh: ['v.head', -0.02, 0.05, 0.1], cy: 0.3 },
      { t: 3.0, lh: ['a.chest', -0.25, -0.35, -0.12], rh: ['a.chest', 0.26, -0.34, -0.16], pto: ['a.chest', 0.4, -0.95, -0.4] },
      { t: 3.3, ...stand(-0.02, 0.8), lf: [-0.15, 0, 0.7], rf: [0.15, 0, 0.88], r: [0.02, 0, 0], cy: 0, sy: 0, cp: 0.1, hp: 0.3 },
      { t: 4.2, cp: 0, hp: 0.05 },
    ],
    v: [
      { t: 0, ...UPPER, ...stand(0, 0), ...relax('v') },
      { t: 0.3, hy: 0, hp: 0, cy: 0 },
      { t: 0.48, hy: 0.42, cy: 0.1, hp: 0.05, r: [0, 0, 0] },
      { t: 0.64, r: [0, 0.9, 0], cy: 0.2, sy: 0.1, hy: 0.3, lh: ['v.chest', -0.3, -0.24, -0.16], rh: ['v.chest', 0.3, -0.24, -0.16] },
      { t: 0.94, ...stand(0.02, 0.02, 2.8), hy: 0, cy: 0, sy: 0, hp: 0.02, lh: ['v.chest', -0.24, -0.1, -0.24], rh: ['v.chest', 0.24, -0.14, -0.22] },
      { t: 1.14, p: [0.02, 0.92, 0.02], r: [0, 2.8, 0] },
      // it goes in, he folds over it
      { t: 1.24, p: [0.03, 0.84, -0.04], r: [0.62, 2.8, 0], sp: 0.24, cp: 0.2, hp: -0.1, lh: ['v.pelvis', -0.12, 0.16, -0.24], rh: ['v.pelvis', 0.14, 0.16, -0.24], j: 0.7 },
      { t: 1.48, p: [0.04, 0.8, -0.06], r: [0.72, 2.8, 0], hp: -0.05, j: 1 },
      { t: 1.88, ...kneel(-0.04, 0.16, 2.8), lfl: 0, rfl: 0, lfd: 0.3, rfd: 0.3, r: [0.35, 2.8, 0], sp: 0.15, cp: 0.12, hp: 0.2, j: 0.4 },
      { t: 2.2, r: [0.08, 2.8, 0], sp: 0, cp: 0.04, hp: -0.3, j: 0.25, lh: ['v.pelvis', -0.14, 0.12, -0.2], rh: ['v.pelvis', 0.16, 0.12, -0.2] },
      { t: 2.48, hp: -0.32, hy: 0, cp: 0.04 },
      { t: 2.56, hp: -0.55, hy: 0.35, cp: -0.12, j: 1, lh: ['v.head', -0.06, -0.14, -0.1], rh: ['v.head', 0.06, -0.14, -0.1] },
      { t: 2.98, kt: 1, kl: 1, ka: 0.8, j: 0.3, kh: 0.7, r: [0.0, 2.8, 0], p: [-0.04, 0.54, 0.14] },
      ...fallBack(3.08, -0.03, 0.08, 2.8, { d: 0.42, T: 0.74, kneeling: true }),
    ],
    vk: { hp: [[1.14, 3], [2.48, -6]], cp: [[1.14, 5]], sp: [[1.14, 3]], hz: [[2.48, 4]] },
    ak: { cp: [[1.14, 1]] },
    push: [[3.04, [1, 2, 3, 10, 11], 0.15, 0, -1.1]],
    slow: [[1.14, 0.84, 0.08, 0.06, 0.25], [2.48, 0.84, 0.1, 0.1, 0.3]],
    cam: [
      { t: 0, pos: [-2.9, 1.2, 1.7], look: ['mid', 0, -0.28, 0], fov: 42 },
      { t: 0.9, pos: [-3.2, 1.08, 0.85], look: ['mid', 0, -0.3, 0], fov: 38 },
      { t: 1.5, pos: [-3.15, 0.98, 0.45], look: ['mid', 0, -0.32, 0], fov: 34 },
      { t: 2.3, pos: [-2.9, 0.85, 0.35], look: [0, 0.78, 0.4], fov: 34 },
      { t: 2.9, pos: [-2.8, 0.78, 0.35], look: [0, 0.75, 0.38], fov: 32 },
      { t: 3.7, pos: [-2.95, 0.78, 0.1], look: [0, 0.66, 0.25], fov: 38 },
    ],
    events: [
      [0.24, 'sfx', 'pouch', { vol: 0.8, rate: 1.2 }], [0.34, 'sfx', 'pouch', { vol: 0.5, rate: 1.3 }], [0.86, 'prop', 1], [0.88, 'sfx', 'chargeBack', { vol: 0.35, rate: 1.5 }], [1.14, 'drop'],
      [1.14, 'hit', 'v.pelvis', 0, 0.2, -0.2, -0.4, 0.1, 0.3, 0.9, 'stab'], [1.46, 'sfx', 'stab', { vol: 0.7, rate: 0.8 }], [1.48, 'hit', 'v.pelvis', 0, 0.22, -0.2, -0.4, 0, 0.3, 0.5],
      [1.88, 'sfx', 'thud', { vol: 0.6, rate: 1.3 }], [1.9, 'pool', 'v.pelvis', 0.4], [2.48, 'hit', 'v.head', 0.1, -0.13, -0.05, 0.6, 0.6, -0.3, 1.8, 'stab'], [2.5, 'spurt', 0.8], [3.2, 'kill', [0.3, 0, -0.3], 0.1, 'head'], [3.4, 'thud'], [3.5, 'pool', 'v.head', 0.7],
    ],
  },
  // ---------------------------------------------------------------------------
  // An arm around the neck, slung around your own body, his feet leave the ground, down on his back, the knife after him.
  // ---------------------------------------------------------------------------
  {
    name: 'SLING BLADE', dur: 4.2, prop: 'knife',
    a: [
      { t: 0, ...UPPER, ...stand(0, 0.86), ...relax('a'), re: [0, 0, 0] },
      { t: 0.12, lf: [-0.15, 0, 0.48], p: [0, 0.92, 0.66] },
      { t: 0.24, rf: [0.2, 0, 0.66], p: [0, 0.88, 0.44], r: [0.06, 0, 0], cp: 0.06, lh: ['v.chest', -0.2, 0.16, 0.12], rh: ['v.head', -0.1, -0.1, -0.06], re: [0.2, 0.35, 0] },
      // around himself, with all the weight of the other one on the arm
      { t: 0.42, p: [-0.08, 0.9, 0.36], r: [-0.04, 0.55, 0], cy: 0.08 },
      { t: 0.62, p: [-0.06, 0.92, 0.46], r: [-0.1, 1.05, 0], cy: 0.15 },
      { t: 0.7, lf: [-0.16, 0, 0.66] },
      { t: 0.8, rf: [-0.24, 0, 0.38], p: [-0.12, 0.96, 0.52], r: [-0.12, 1.5, 0], cy: 0.2 },
      { t: 0.96, p: [-0.22, 0.82, 0.56], r: [0.3, 1.85, 0], sp: 0.2, cp: 0.3, hp: 0.2, cy: 0.05, rh: ['v.head', -0.1, -0.1, -0.06], lh: ['v.chest', -0.2, 0.16, 0.12] },
      { t: 1.1, p: [-0.32, 0.6, 0.62], r: [0.72, 1.9, 0], rfp: 0.4, cy: 0, lh: ['a.chest', -0.34, -0.3, -0.2], rh: ['a.chest', 0.3, -0.3, -0.22], re: [0, 0, 0] },
      { t: 1.46, lf: [-0.89, 0, 0.9], lfd: 0.3, p: [-0.55, 0.62, 1.06], r: [0.35, 0.7, 0], sp: 0.1, cp: 0.2, hp: 0.3, lh: ['a.pelvis', -0.2, -0.08, -0.3], rh: ['a.pelvis', 0.22, -0.05, 0.05] },
      { t: 1.8, ...oneKnee(-0.72, 1.32, 0), rfd: 0.55, r: [0.3, 0.1, 0], cp: -0.05, sp: 0, hp: 0.35, rh: ['a.chest', 0.12, 0.58, -0.1], pto: ['a.chest', 0.1, 1.4, 0.15] },
      { t: 2.14, p: [-0.72, 0.66, 1.32], r: [0.2, 0.1, 0], cp: -0.12, rh: ['a.chest', 0.12, 0.66, -0.06], pto: ['a.chest', 0.1, 1.5, 0.15], lh: ['a.pelvis', -0.2, -0.04, -0.34] },
      { t: 2.28, p: [-0.72, 0.48, 1.22], r: [0.62, 0.1, 0], cp: 0.42, sp: 0.25, hp: 0.4, rh: ['v.chest', 0.02, 0.22, -0.16], pto: ['v.chest', 0.02, 0.16, 0.1], lh: ['v.chest', -0.1, 0.2, -0.14] },
      { t: 2.76, p: [-0.72, 0.5, 1.24], r: [0.58, 0.1, 0], cp: 0.36, rh: ['v.chest', 0.03, 0.24, -0.17], pto: ['v.chest', 0.02, 0.16, 0.1], lh: ['v.chest', -0.1, 0.2, -0.14] },
      { t: 3.2, ...stand(-0.62, 1.55, 0.1), lf: [-0.76, 0, 1.44], rf: [-0.46, 0, 1.72], rfp: 0, cp: 0.1, sp: 0, hp: 0.28, ...relax('a'), rh: ['a.chest', 0.26, -0.34, -0.16], pto: ['a.chest', 0.4, -0.95, -0.4] },
      { t: 4.2, cp: 0, hp: 0.05 },
    ],
    v: [
      { t: 0, ...UPPER, ...stand(0, 0), ...relax('v') },
      { t: 0.14, hp: 0, cp: 0 },
      { t: 0.3, hp: -0.38, cp: -0.18, j: 0.6, lh: ['a.rhand', 0, 0.12, -0.02], rh: ['a.rhand', 0, 0.22, 0.02] },
      { t: 0.42, p: [-0.27, 0.9, -0.02], r: [-0.2, 0.55, 0], lf: [-0.2, 0, -0.12], rf: [0, 0, 0], lfl: 0.03, rfl: 0.03, lfd: 0.2, rfd: 0.2, hp: -0.45 },
      { t: 0.52, kl: 1, ka: 1 },
      { t: 0.62, p: [-0.62, 1.0, 0.06], r: [-0.62, 1.05, 0], kl: 0.75, lf: [-0.98, 0.22, -0.22], rf: [-0.86, 0.34, -0.4], lfp: -0.4, rfp: -0.4, j: 0.3 },
      { t: 0.7, ka: 0.3, lh: ['v.chest', -0.5, 0.1, 0.1], rh: ['v.chest', 0.5, 0.1, 0.1] },
      { t: 0.8, p: [-0.9, 1.12, 0.36], r: [-1.25, 1.5, 0], lf: [-1.7, 0.92, 0.12], rf: [-1.6, 1.1, 0.42], hp: -0.3, cp: -0.1 },
      { t: 0.96, p: [-1.0, 0.82, 0.71], r: [-1.75, 1.85, 0], lf: [-1.62, 1.35, 0.82], rf: [-1.7, 1.25, 1.1], lfp: -1.6, rfp: -1.6, j: 0, kt: 1, kh: 1 },
      { t: 1.08, p: [-1.02, 0.3, 0.76], r: [-1.55, 1.9, 0], lf: [-1.8, 0.5, 1.0], rf: [-1.8, 0.58, 1.26], kt: 0.1, kh: 0.1, kl: 0.6, ka: 0 },
      { t: 1.14, kt: 0, kh: 0 },
      { t: 1.2, kl: 0 },
      // he is still there, and sees it coming
      { t: 1.8, ...onBack(-1.06, 0.78, 1.9), lfp: -1.2, rfp: -1.2, ka: 0, kh: 0, hp: 0.05, cp: 0 },
      { t: 2.0, ka: 0.55, kh: 0.5, hp: 0.3, lh: ['v.chest', -0.2, 0.3, -0.26], rh: ['v.chest', 0.3, 0.2, -0.2], j: 0.5 },
      { t: 2.28, hp: 0.5, lh: ['v.chest', -0.14, 0.22, -0.22], rh: ['v.chest', 0.14, 0.22, -0.22], j: 1, ka: 0.6 },
      { t: 2.7, ka: 0.4, kh: 0.3, j: 0.3 },
      { t: 2.9, ka: 0, kh: 0, j: 0 },
    ],
    push: [[2.28, [1, 10, 11], 0, -1.8, 0], [2.28, [3, 2], 0, 1.4, 0], [2.28, [8, 9], 0, 1.2, 0]],
    ak: { cp: [[2.28, 1.4]], hp: [[2.28, 1]] },
    slow: [[0.86, 0.84, 0.2, 0.08, 0.2], [2.28, 0.84, 0.1, 0.05, 0.3]],
    cam: [
      { t: 0, pos: [-2.6, 1.2, 2.2], look: ['mid', 0, -0.3, 0], fov: 44 },
      { t: 0.5, pos: [-3.3, 1.15, 0.7], look: ['mid', -0.1, -0.3, 0], fov: 46 },
      { t: 0.95, pos: [-3.4, 1.0, -0.35], look: [-0.55, 0.95, 0.45], fov: 46 },
      { t: 1.4, pos: [-3.1, 0.75, -0.9], look: [-0.75, 0.55, 0.85], fov: 42 },
      { t: 2.2, pos: [-2.85, 0.62, -1.0], look: [-0.8, 0.6, 1.0], fov: 36 },
      { t: 2.75, pos: [-2.75, 0.6, -0.95], look: [-0.8, 0.55, 1.0], fov: 34 },
      { t: 3.6, pos: [-2.9, 0.72, -0.75], look: [-0.7, 0.78, 1.2], fov: 40 },
    ],
    events: [
      [0.2, 'sfx', 'pouch', { vol: 0.9 }], [0.34, 'drop'], [0.62, 'sfx', 'swing', { vol: 0.9, rate: 0.6 }], [1.16, 'slam', 'v.chest', 1.3], [1.18, 'sfx', 'crack', { vol: 0.6, rate: 0.7 }],
      [1.44, 'prop', 1], [1.46, 'sfx', 'chargeBack', { vol: 0.4, rate: 1.5 }], [2.2, 'sfx', 'swing', { vol: 0.9, rate: 0.7 }], [2.28, 'hit', 'v.chest', 0.02, 0.22, -0.16, 0, 1, 0.1, 2.0, 'stab'], [2.48, 'hit', 'v.chest', 0.02, 0.22, -0.16, 0, 0.8, 0, 0.9], [2.9, 'kill', [0, 0, 0.1], 0.05, 'chest'], [2.92, 'pool', 'v.chest', 0.8],
    ],
  },
  // ---------------------------------------------------------------------------
  // Under him, up on the shoulders, slammed flat. A short run-up, a jump, and the boot comes down on his head.
  // ---------------------------------------------------------------------------
  {
    name: 'CAGE MATCH', dur: 4.6, front: 0.86,
    a: [
      { t: 0, ...UPPER, ...stand(0, 1.0), ...relax('a') },
      { t: 0.16, lf: [-0.14, 0, 0.66], p: [0, 0.925, 0.82] },
      { t: 0.3, rf: [0.15, 0, 0.86], p: [0, 0.905, 0.68], lh: ['v.chest', -0.2, 0.18, 0.08], rh: ['a.chest', 0.25, -0.3, -0.14] },
      { t: 0.58, p: [0, 0.9, 0.64], lh: ['v.chest', 0.2, 0.12, -0.04], r: [0.04, 0, 0], sp: 0, cp: 0, hp: 0 },
      // he ducks under him
      { t: 0.86, lf: [-0.18, 0, 0.24], rf: [0.2, 0, 0.76], p: [0, 0.7, 0.48], r: [0.62, 0, 0], sp: 0.2, cp: 0.2, hp: -0.25, lh: ['v.chest', 0.24, 0.2, 0], rh: ['v.pelvis', -0.02, -0.3, 0.1] },
      { t: 1.12, p: [0.04, 0.72, 0.46], r: [0.55, 0, 0], cp: 0.1, lh: ['v.chest', 0.22, 0.22, 0], rh: ['a.chest', 0.44, -0.04, -0.2] },
      // and comes up with him
      { t: 1.4, p: [0.03, 0.9, 0.46], r: [0.12, -0.2, 0], sp: 0.05, cp: 0.05, hp: 0.05, lh: ['a.chest', -0.36, 0.14, -0.2], rh: ['a.chest', 0.36, 0.12, -0.18] },
      { t: 1.66, p: [0.03, 0.92, 0.44], r: [0.04, -0.45, 0], lf: [-0.24, 0, 0.36], rf: [0.26, 0, 0.5], lh: ['a.chest', -0.36, 0.16, -0.2], rh: ['a.chest', 0.36, 0.14, -0.18] },
      { t: 1.86, p: [-0.05, 0.78, 0.3], r: [0.72, -0.5, 0], sp: 0.22, cp: 0.35, hp: 0.3, lf: [-0.3, 0, 0.1], rf: [0.3, 0, 0.54], lh: ['a.chest', -0.3, -0.04, -0.42], rh: ['a.chest', 0.3, -0.04, -0.42] },
      { t: 2.02, p: [-0.05, 0.7, 0.26], r: [0.85, -0.5, 0], lh: ['a.chest', -0.28, -0.3, -0.24], rh: ['a.chest', 0.28, -0.3, -0.24] },
      { t: 2.26, ...stand(-0.08, 0.32, -0.5), lf: [-0.26, 0, 0.14], rf: [0.2, 0, 0.42], sp: 0.04, cp: 0.12, hp: 0.32, ...guard('a') },
      // two steps, and up
      { t: 2.52, p: [-0.34, 0.72, -0.2], r: [0.24, -0.2, 0], sp: 0.1, cp: 0.1, hp: 0.34, lf: [-0.48, 0, -0.16], rf: [-0.16, 0, -0.08], lfp: 0.2, rfp: 0.2, lh: ['a.chest', -0.3, -0.16, 0.18], rh: ['a.chest', 0.3, -0.16, 0.18] },
      { t: 2.78, p: [-0.52, 1.42, -0.46], r: [-0.1, -0.2, 0], sp: -0.05, cp: 0.1, hp: 0.42, lf: [-0.68, 0.56, -0.28], rf: [-0.52, 0.76, -0.64], lfp: 0.4, rfp: -0.1, lh: ['a.chest', -0.5, 0.22, -0.1], rh: ['a.chest', 0.5, 0.22, -0.1] },
      { t: 2.98, p: [-0.56, 0.84, -0.53], r: [0.18, -0.2, 0], sp: 0.1, cp: 0.2, hp: 0.5, lf: [-0.72, 0, -0.16], rf: [-0.66, 0.2, -0.6], lfp: 0, rfp: 0.1, lh: ['a.chest', -0.46, -0.22, -0.1], rh: ['a.chest', 0.46, -0.22, -0.1] },
      { t: 3.44, p: [-0.56, 0.88, -0.53], r: [0.14, -0.2, 0], cp: 0.14, hp: 0.42 },
      { t: 3.9, ...stand(-0.38, -0.14, -0.2), lf: [-0.56, 0, -0.14], rf: [-0.22, 0, -0.02], cp: 0.1, hp: 0.3, sp: 0, rfp: 0, ...relax('a') },
      { t: 4.6, cp: 0, hp: 0.05 },
    ],
    v: [
      { t: 0, ...UPPER, ...stand(0, 0), ...relax('v') },
      { t: 0.3, hy: 0, hp: 0 },
      { t: 0.44, hy: 0.4, hp: 0.05, r: [0, 0, 0] },
      { t: 0.62, ...stand(0.02, 0.02, 1.5), hy: 0.2 },
      { t: 0.86, ...stand(0.02, 0.02, 3.0), hy: 0, hp: -0.12, lh: ['v.chest', -0.22, 0.02, -0.3], rh: ['v.chest', 0.22, 0.02, -0.3], j: 0.4 },
      { t: 1.02, kl: 1, ka: 1, p: [0.05, 1.06, 0.1], r: [0.3, 2.9, 0] },
      { t: 1.14, p: [0.14, 1.38, 0.3], r: [1.0, 2.2, 0], sp: 0.2, cp: 0.2, hp: -0.2, lf: [0.4, 0.62, 0.02], rf: [0.62, 0.72, 0.2], lfp: 0.6, rfp: 0.6, lh: ['a.chest', -0.1, 0.1, 0.2], rh: ['a.chest', 0.1, 0.2, 0.2], j: 0.8, kl: 0.5 },
      { t: 1.26, ka: 0.35 },
      { t: 1.4, p: [0.33, 1.6, 0.46], r: [1.45, 1.6, 0], sp: 0.12, cp: 0.12, hp: -0.1, lf: [1.1, 1.35, 0.36], rf: [1.08, 1.4, 0.6], lfp: 1.3, rfp: 1.3, lh: ['v.chest', -0.15, 0.3, -0.25], rh: ['v.chest', 0.22, 0.2, -0.3], j: 0.3, kl: 0.4 },
      { t: 1.66, p: [0.3, 1.64, 0.62], r: [1.45, 1.15, 0], lf: [1.0, 1.4, 0.98], rf: [0.92, 1.45, 1.18], rt: 0 },
      // over, and flat on his back
      { t: 1.86, p: [0.12, 1.2, -0.05], r: [1.45, 1.15, 0], rt: 1.4, lf: [0.8, 1.1, 0.2], rf: [0.75, 1.2, 0.45], lh: ['v.chest', -0.5, 0.1, 0], rh: ['v.chest', 0.5, 0.1, 0], j: 0.2, kt: 1, kh: 1, ka: 0.2, kl: 0.3 },
      { t: 1.98, p: [-0.02, 0.58, -0.38], r: [1.5, 1.15, 0], rt: 2.6, kt: 1, kh: 0.4, ka: 0, lf: [0.72, 0.7, -0.15], rf: [0.7, 0.78, 0.06], kl: 0.7 },
      { t: 2.05, p: [-0.08, 0.24, -0.5], r: [1.52, 1.15, 0], rt: 3.05, kt: 0.95, kh: 0.1, lf: [0.72, 0.1, -0.15], rf: [0.7, 0.18, 0.06], kl: 0.7, j: 0 },
      { t: 2.12, p: [-0.08, 0.17, -0.5], r: [1.52, 1.15, 0], rt: 3.14, kt: 0.5, kh: 0, kl: 0.3 },
      { t: 2.2, kt: 0, kl: 0 },
      // he gets one hand up
      { t: 2.6, ka: 0, kh: 0, lh: ['v.chest', -0.5, -0.1, 0.12], rh: ['v.chest', 0.5, -0.1, 0.12] },
      { t: 2.8, ka: 0.4, kh: 0.4, hp: 0.25, hy: 0.25, lh: ['v.chest', -0.2, 0.2, -0.3], rh: ['v.chest', 0.26, 0.2, -0.3] },
      { t: 2.98, ka: 0.4, kh: 0.4 },
      { t: 3.02, ka: 0, kh: 0 },
    ],
    push: [[2.98, [3, 2], 0, -2.6, 0], [2.98, [8, 9, 6, 7], 0, 2.0, 0], [2.98, [14, 15], 0, 1.6, 0]],
    ak: { cp: [[2.98, 1.5]], hp: [[2.98, 1.2]] },
    slow: [[1.5, 0.84, 0.15, 0.1, 0.2], [2.98, 0.84, 0.1, 0.05, 0.3]],
    cam: [
      { t: 0, pos: [2.7, 1.1, 1.75], look: ['mid', 0, -0.3, 0], fov: 44 },
      { t: 0.85, pos: [3.1, 1.02, 0.9], look: ['mid', 0, -0.3, 0], fov: 44 },
      { t: 1.45, pos: [3.5, 0.98, 0.7], look: [0.15, 1.12, 0.35], fov: 46 },
      { t: 2.0, pos: [3.1, 0.72, 0.35], look: [-0.12, 0.72, -0.05], fov: 44 },
      { t: 2.7, pos: [2.6, 0.62, -1.0], look: [-0.42, 0.78, -0.42], fov: 44 },
      { t: 3.05, pos: [2.45, 0.58, -1.1], look: [-0.45, 0.66, -0.5], fov: 42 },
      { t: 3.9, pos: [2.4, 0.58, -1.15], look: [-0.42, 0.72, -0.42], fov: 42 },
    ],
    events: [
      [0.2, 'sfx', 'pouch', { vol: 0.7, rate: 1.2 }], [0.7, 'drop'], [0.86, 'sfx', 'pouch', { vol: 0.9, rate: 0.8 }], [1.2, 'sfx', 'swing', { vol: 0.6, rate: 0.5 }], [1.84, 'sfx', 'swing', { vol: 1, rate: 0.6 }],
      [2.1, 'slam', 'v.chest', 1.6], [2.52, 'sfx', 'land', { vol: 0.6 }], [2.64, 'sfx', 'swing', { vol: 0.6, rate: 0.7 }], [2.98, 'hit', 'v.head', 0, 0, 0, 0.1, 0.6, 0.3, 1.8, 'crack'], [2.98, 'sfx', 'punch', { vol: 1 }], [2.98, 'slam', 'v.head', 0.6], [3.2, 'kill', [0, 0, 0], 0.05, 'head'], [3.22, 'pool', 'v.head', 0.8],
    ],
  },
  // ---------------------------------------------------------------------------
  // The arm around the throat, both go over backward. On the ground he kicks, then less, then not at all. No blood, no sound.
  // ---------------------------------------------------------------------------
  {
    name: 'SWEET DREAMS', dur: 4.4,
    a: [
      { t: 0, ...UPPER, ...stand(0, 0.82), ...relax('a'), re: [0, 0, 0] },
      { t: 0.12, lf: [-0.14, 0, 0.42], p: [0, 0.92, 0.6] },
      { t: 0.24, rf: [0.16, 0, 0.56], p: [0, 0.89, 0.34], r: [0.04, 0, 0], cp: 0.04, hp: 0.12, rh: ['v.head', -0.1, -0.12, -0.07], lh: ['v.head', 0, 0.06, 0.13], re: [0.2, 0.3, 0] },
      { t: 0.56, p: [0, 0.8, 0.44], r: [-0.3, 0, 0], sp: -0.08, cp: 0.1, hp: 0.2, lf: [-0.15, 0, 0.22], rf: [0.2, 0, 0.5], lfd: 0.26, rfd: 0.26 },
      // down, with him on top
      { t: 0.96, p: [0, 0.2, 0.76], r: [-1.0, 0, 0], sp: 0.05, cp: 0.25, hp: 0.42, lf: [-0.38, 0.02, 0.12], rf: [0.38, 0.02, 0.12], lfl: 0.04, rfl: 0.04, lfd: 0.34, rfd: 0.34, lfp: -0.3, rfp: -0.3 },
      { t: 1.4, cp: 0.34, sy: 0.12, cy: 0.1, hp: 0.5, r: [-1.05, 0, 0] },
      { t: 1.85, cp: 0.3, sy: -0.12, cy: -0.1, r: [-1.0, 0, 0], p: [0, 0.2, 0.78] },
      { t: 2.3, cp: 0.34, sy: 0.05, cy: 0.04, r: [-1.04, 0, 0] },
      { t: 2.74, cp: 0.25, sy: 0, cy: 0, hp: 0.4, r: [-0.95, 0, 0], p: [0, 0.2, 0.78], lf: [-0.38, 0.02, 0.12], rf: [0.38, 0.02, 0.12] },
      // he lets go and gets out from under
      { t: 3.0, p: [-0.25, 0.3, 0.72], r: [-0.3, 0.3, 0.1], sp: 0.2, cp: 0.3, hp: 0.3, lf: [-0.62, 0.02, 0.42], rf: [0.02, 0.02, 0.32], lfd: 0.2, rfd: 0.2, lfp: 0, rfp: 0, lh: ['a.chest', -0.3, -0.42, -0.1], rh: ['v.chest', 0.1, 0.1, 0.05], re: [0, 0, 0] },
      { t: 3.38, p: [-0.42, 0.62, 0.92], r: [0.5, 0.2, 0], sp: 0.2, cp: 0.2, hp: 0.3, lf: [-0.62, 0, 0.62], rf: [-0.14, 0, 1.12], lfd: 0.3, rfd: 0.3, ...relax('a') },
      { t: 3.82, ...stand(-0.44, 1.02, 0.2), lf: [-0.6, 0, 0.92], rf: [-0.26, 0, 1.12], r: [0.02, 0.2, 0], sp: 0, cp: 0.08, hp: 0.28 },
      { t: 4.4, cp: 0, hp: 0.05 },
    ],
    v: [
      { t: 0, ...UPPER, ...stand(0, 0), ...relax('v') },
      { t: 0.14, hp: 0, cp: 0, p: [0, 0.93, 0] },
      { t: 0.26, p: [0, 0.92, 0.04], hp: -0.42, cp: -0.16, j: 0.9 },
      { t: 0.36, lh: ['a.rhand', 0, 0.12, -0.02], rh: ['a.rhand', 0, 0.22, 0.02] },
      { t: 0.56, p: [0, 0.82, 0.16], r: [-0.32, 0, 0], lf: [-0.16, 0, -0.14], rf: [0.17, 0, -0.08], lfl: 0, rfl: 0, lfd: 0.26, rfd: 0.26, lfp: -0.3, rfp: -0.3, hp: -0.5, j: 1 },
      { t: 0.96, p: [0, 0.2, 0.26], r: [-0.78, 0, 0], sp: 0, cp: 0, hp: -0.34, lf: [-0.24, 0.02, -0.58], rf: [0.24, 0.02, -0.52], lfl: 0, rfl: 0, lfd: 0.34, rfd: 0.34, lfp: -0.9, rfp: -0.9 },
      // the legs fight on their own, slower and slower
      { t: 1.16, lf: [-0.22, 0.14, -0.42], rf: [0.26, 0.02, -0.64] },
      { t: 1.36, lf: [-0.28, 0.02, -0.66], rf: [0.22, 0.18, -0.38], hy: 0.25 },
      { t: 1.6, lf: [-0.2, 0.16, -0.4], rf: [0.26, 0.02, -0.66], hy: -0.25 },
      { t: 1.86, lf: [-0.28, 0.02, -0.68], rf: [0.24, 0.1, -0.48], hy: 0.1, j: 0.8 },
      { t: 2.16, lf: [-0.26, 0.05, -0.56], rf: [0.26, 0.02, -0.68], hy: 0, j: 0.5, lh: ['a.rhand', 0, 0.1, -0.03], rh: ['a.rhand', 0, 0.2, 0] },
      { t: 2.3, ka: 1, kl: 1 },
      { t: 2.48, lf: [-0.3, 0.02, -0.7], rf: [0.28, 0.02, -0.7], lfp: -1.2, rfp: -1.2, hp: -0.2, j: 0.18, ka: 0.5, rh: ['v.chest', 0.42, -0.2, -0.05], kl: 0.5 },
      { t: 2.7, hp: 0.12, hy: 0.2, j: 0, ka: 0, kl: 0.1, kh: 0.5, lh: ['v.chest', -0.44, -0.25, -0.05], rh: ['v.chest', 0.46, -0.28, -0.02] },
      { t: 2.86, kl: 0, kh: 0.15, kt: 1, p: [0, 0.2, 0.26], r: [-0.78, 0, 0] },
      { t: 3.04, kt: 0.3, kh: 0, r: [-0.95, 0, 0.1], p: [0.04, 0.19, 0.26] },
      { t: 3.2, kt: 0 },
    ],
    push: [[3.02, [1, 2, 3, 10, 11], 0.5, 0, 0.25]],
    slow: [[2.72, 0.84, 0.3, 0.2, 0.3]],
    cam: [
      { t: 0, pos: [2.3, 1.22, 1.3], look: ['mid', 0, -0.1, 0], fov: 42 },
      { t: 0.6, pos: [2.8, 0.95, 0.85], look: ['mid', 0, -0.15, 0], fov: 42 },
      { t: 1.1, pos: [3.0, 0.7, 0.55], look: [0, 0.5, 0.45], fov: 38 },
      { t: 2.1, pos: [2.7, 0.62, 0.45], look: [0, 0.48, 0.42], fov: 34 },
      { t: 2.9, pos: [2.6, 0.6, 0.4], look: [0, 0.46, 0.4], fov: 32 },
      { t: 3.7, pos: [3.0, 0.75, 0.35], look: [-0.2, 0.7, 0.75], fov: 40 },
    ],
    events: [
      [0.18, 'sfx', 'pouch', { vol: 0.9 }], [0.3, 'drop'], [0.96, 'slam', 'a.pelvis', 1], [1.16, 'sfx', 'pouch', { vol: 0.5, rate: 0.7 }], [1.6, 'sfx', 'pouch', { vol: 0.4, rate: 0.8 }], [2.0, 'sfx', 'pouch', { vol: 0.3, rate: 0.7 }], [2.74, 'sfx', 'crack', { vol: 0.25, rate: 0.6 }], [3.0, 'kill', [0, 0, 0.3], 0.05, 'chest'],
    ],
  },
  // ---------------------------------------------------------------------------
  // Spun around and stuck in the belly past the hand he gets in the way. In the neck when he folds, the whole way down into the thigh when he straightens: his leg goes out from under him. On his back he sees the arm go up.
  // ---------------------------------------------------------------------------
  {
    name: 'STICK AND MOVE', dur: 5.2, prop: 'knife', front: 0.6,
    a: [
      { t: 0, ...UPPER, ...stand(0, 0.95), ...relax('a') },
      { t: 0.12, lf: [-0.14, 0, 0.66], p: [0, 0.925, 0.82] },
      // the hand on his shoulder turns him, the other one goes for the knife
      { t: 0.22, rf: [0.15, 0, 0.84], p: [0, 0.91, 0.68], lh: ['v.chest', -0.2, 0.2, 0.1], rh: ['a.pelvis', 0.2, 0.02, 0.12], pto: ['a.pelvis', 0.2, 0.4, -0.3] },
      { t: 0.5, p: [0, 0.89, 0.64], lh: ['a.chest', -0.24, -0.04, -0.3], rh: ['a.chest', 0.34, -0.22, -0.02], pto: ['v.pelvis', 0, 0.1, 0], cy: -0.34, sy: -0.18, hp: 0.15 },
      // in the belly, the left hand on his shoulder
      { t: 0.78, p: [0, 0.85, 0.66], r: [0.2, 0, 0], cy: 0.42, sy: 0.24, hp: 0.25, lf: [-0.16, 0, 0.46], lfd: 0.2, rh: ['v.pelvis', 0.02, 0.14, -0.14], pto: ['v.pelvis', 0, 0.14, 0.1], lh: ['v.chest', -0.1, 0.2, -0.12] },
      // and turns it
      { t: 1.0, cy: 0.3, sy: 0.18, rh: ['v.pelvis', 0.02, 0.14, -0.14], pto: ['v.pelvis', -0.1, 0.16, 0.08], lh: ['v.chest', -0.1, 0.2, -0.12] },
      { t: 1.22, cy: 0.42, rh: ['v.pelvis', 0.02, 0.14, -0.14], pto: ['v.pelvis', 0.1, 0.12, 0.08], lh: ['v.chest', -0.1, 0.2, -0.12] },
      // out, and up under his jaw
      { t: 1.38, cy: -0.16, sy: -0.08, r: [0.1, 0, 0], p: [0, 0.86, 0.66], rh: ['a.chest', 0.3, -0.04, -0.2], pto: ['v.head', 0, -0.13, 0], lh: ['v.chest', -0.1, 0.2, -0.12] },
      { t: 1.52, cy: 0.42, sy: 0.22, r: [0.14, 0, 0], rh: ['v.head', 0.1, -0.15, -0.1], pto: ['v.head', -0.1, -0.15, 0.02], lh: ['v.chest', -0.1, 0.2, -0.12] },
      // pulls back
      { t: 1.72, p: [0, 0.87, 0.72], r: [0.06, 0, 0], cy: 0, sy: 0, rf: [0.2, 0, 1.02], rfd: 0.2, rh: ['a.chest', 0.32, -0.1, -0.2], pto: ['a.chest', 0.5, 0.1, -0.8], lh: ['a.chest', -0.26, -0.1, -0.26] },
      // and all the way down
      { t: 2.02, p: [-0.06, 0.56, 0.6], r: [0.72, 0.3, 0], cp: 0.24, sp: 0.12, hp: 0.05, hy: -0.2, lf: [-0.36, 0, 0.5], lfd: 0.22, rh: ['a.chest', 0.44, -0.1, 0.06], pto: ['v.pelvis', 0.1, -0.4, 0], lh: ['a.chest', -0.36, -0.12, -0.3], cy: -0.28, sy: -0.14 },
      // the thigh
      { t: 2.26, p: [-0.02, 0.56, 0.46], r: [0.8, 0.3, 0], cy: 0.38, sy: 0.2, rh: ['v.pelvis', 0.1, -0.3, -0.12], pto: ['v.pelvis', 0.1, -0.3, 0.1], lh: ['a.chest', -0.42, -0.14, -0.2] },
      // up after him
      { t: 2.56, p: [-0.02, 0.74, 0.44], r: [0.4, 0.15, 0], cp: 0.1, sp: 0.04, cy: 0, sy: 0, hp: 0.25, hy: 0, rh: ['a.chest', 0.34, -0.14, -0.2], pto: ['a.chest', 0.6, -0.1, -0.8] },
      { t: 2.86, ...stand(0.02, 0.2), lf: [-0.2, 0, 0.1], rf: [0.2, 0, 0.5], rfd: 0.3, lfd: 0.26, r: [0.06, 0, 0], cp: 0.06, hp: 0.32, rh: ['a.chest', 0.3, -0.06, -0.14], pto: ['a.chest', 0.4, 0.5, -0.6], lh: ['a.chest', -0.3, -0.16, -0.22] },
      // over him, the arm goes up
      { t: 3.14, p: [0.0, 0.92, -0.32], r: [-0.05, 0, 0], cp: -0.05, hp: 0.38, rf: [0.3, 0, -0.32], rfd: 0.28, rh: ['a.chest', 0.18, 0.46, -0.06], pto: ['a.chest', 0.16, 1.3, 0.1], lh: ['a.chest', -0.42, -0.02, -0.14] },
      { t: 3.42, p: [0.0, 0.92, -0.42], r: [-0.14, 0, 0], cp: -0.14, sp: -0.06, cy: -0.2, sy: -0.1, hp: 0.45, lf: [-0.3, 0, -0.5], lfd: 0.24, rh: ['a.chest', 0.14, 0.76, 0.1], pto: ['a.chest', 0.1, 1.6, 0.7], lh: ['a.chest', -0.46, 0.06, -0.1] },
      // down on him with a knee in his chest
      { t: 3.66, p: [0.05, 0.62, -0.74], r: [0.6, 0, 0], cp: 0.3, sp: 0.14, cy: 0.16, sy: 0.08, hp: 0.3, lf: [-0.24, 0, -0.62], rf: [0.16, 0.26, -0.44], rfp: 0.4, rfd: 0.2, rh: ['v.chest', 0.04, 0.1, -0.22], pto: ['v.chest', 0.02, 0.06, 0.12], lh: ['a.chest', -0.32, -0.12, -0.3] },
      // leans on it
      { t: 3.94, p: [0.05, 0.6, -0.76], r: [0.66, 0, 0], cy: 0.24, rh: ['v.chest', 0.04, 0.1, -0.22], pto: ['v.chest', 0.06, 0.08, 0.12] },
      { t: 4.2, p: [0.05, 0.6, -0.74], cy: 0.12, rh: ['v.chest', 0.04, 0.1, -0.22], pto: ['v.chest', 0, 0.04, 0.12] },
      // and up
      { t: 4.5, p: [0.02, 0.78, -0.44], r: [0.3, 0, 0], cp: 0.14, sp: 0.04, cy: 0, sy: 0, rf: [0.3, 0, -0.1], rfp: 0, rfd: 0.26, hp: 0.3, rh: ['a.chest', 0.3, -0.18, -0.18], pto: ['a.chest', 0.45, -0.3, -0.8], lh: ['a.chest', -0.26, -0.3, -0.16] },
      { t: 5.2, ...stand(0.02, -0.28), lf: [-0.24, 0, -0.62], rf: [0.3, 0, -0.1], cp: 0.04, hp: 0.15, rh: ['a.chest', 0.26, -0.34, -0.16], pto: ['a.chest', 0.4, -0.95, -0.4], lh: ['a.chest', -0.25, -0.42, -0.06] },
    ],
    v: [
      { t: 0, ...UPPER, ...stand(0, 0), ...relax('v') },
      { t: 0.2, hy: 0, r: [0, 0, 0] },
      { t: 0.3, hy: 0.4 },
      { t: 0.44, ...stand(0.02, 0.02, 2.2), hy: 0.3, lh: ['v.chest', -0.32, -0.2, -0.2], rh: ['v.chest', 0.32, -0.22, -0.2] },
      // the hands low, open: he has nothing left
      { t: 0.6, ...stand(0.02, 0.04, 3.04), hy: 0, hp: -0.05, lh: ['v.chest', -0.36, -0.2, -0.24], rh: ['v.chest', 0.36, -0.2, -0.24] },
      // a hand in the way
      { t: 0.72, rh: ['v.chest', 0.1, -0.02, -0.42], lh: ['v.chest', -0.26, -0.24, -0.3], hp: 0.1 },
      // folds around it
      { t: 0.86, p: [0.02, 0.87, 0.02], r: [0.36, 3.04, 0], sp: 0.16, cp: 0.22, hp: 0.1, j: 0.6, lh: ['a.rhand', 0.05, -0.16, 0], rh: ['v.pelvis', 0.16, 0.16, -0.16] },
      { t: 1.22, p: [0.02, 0.85, 0], r: [0.5, 3.04, 0], sp: 0.22, cp: 0.3, hp: 0.05, j: 1, lh: ['a.rhand', 0.05, -0.16, 0], rh: ['v.pelvis', 0.16, 0.16, -0.16] },
      // the neck straightens him up, one hand comes up, open
      { t: 1.54, r: [0.26, 3.04, 0.04], sp: 0.1, cp: 0.12, hp: -0.3, hy: 0.3, j: 0.7, lh: ['v.chest', -0.24, 0.36, -0.34], rh: ['v.pelvis', 0.16, 0.16, -0.16] },
      { t: 1.74, p: [0.02, 0.91, -0.1], r: [-0.08, 3.04, 0.04], sp: -0.04, cp: -0.1, hp: -0.25, hy: 0.45, lf: [0.18, 0, -0.06], lfd: 0.2, lh: ['v.chest', -0.22, 0.42, -0.36], rh: ['v.chest', 0.2, -0.1, -0.3] },
      // both hands to the neck, he staggers back
      { t: 2.0, p: [0.02, 0.92, -0.2], r: [-0.1, 3.04, 0], cp: -0.08, sp: -0.02, hp: -0.1, hy: 0.15, rf: [-0.14, 0, -0.4], rfd: 0.22, lh: ['v.head', -0.12, -0.16, -0.12], rh: ['v.head', 0.12, -0.16, -0.12], j: 0.8 },
      // the leg: the knee comes up by itself, the other one can't hold him
      { t: 2.26, p: [0.02, 0.91, -0.26], r: [-0.14, 3.04, 0.05], j: 0.3, rf: [-0.14, 0, -0.4], rfp: 0 },
      { t: 2.42, p: [0.02, 0.84, -0.42], r: [-0.34, 3.04, 0.08], rf: [-0.14, 0.42, -0.16], rfp: -0.1, hp: -0.3, ka: 0.6, lh: ['v.chest', -0.5, 0.24, -0.06], rh: ['v.chest', 0.5, 0.22, -0.06], kt: 1, kl: 1, kh: 0.8, j: 0 },
      ...fallBack(2.48, 0.02, -0.5, 3.04, { d: 0.45, T: 0.72, lean: -0.34 }),
      { t: 3.34, kh: 0, ka: 0, lh: ['v.chest', -0.5, -0.1, 0.1], rh: ['v.chest', 0.48, -0.08, 0.12] },
      // he sees it come
      { t: 3.56, kh: 0.5, ka: 0.5, hp: 0.3, rh: ['v.chest', 0.14, 0.26, -0.26], j: 0.5 },
      { t: 3.66, kh: 0.5, ka: 0.5, j: 1 },
      { t: 3.74, kh: 0, ka: 0.2, j: 0.3 },
      { t: 4.2, ka: 0, j: 0 },
    ],
    vk: { hp: [[0.78, 4], [1.52, -10], [3.66, -6]], hy: [[1.52, 5]], cp: [[0.78, 5], [1.52, -3], [2.26, -3]], sp: [[0.78, 3]], cy: [[1.0, 1.5], [1.22, -1.5]] },
    ak: { cp: [[0.78, 1], [1.52, 0.8], [2.26, 1], [3.66, 1.3]] },
    push: [[2.44, [1, 2, 3], 0, 0.3, -1.8], [2.44, [0], 0, 0.2, -1.0], [3.68, [2, 3], 0, -1.2, 0], [3.68, [8, 9], 0, 0.8, 0]],
    slow: [[0.78, 0.84, 0.06, 0.06, 0.2], [2.26, 0.84, 0.08, 0.1, 0.26], [3.66, 0.84, 0.1, 0.05, 0.3]],
    cam: [
      { t: 0, crop: 1, pos: [0.85, 1.45, 1.9], look: [-0.25, 1.1, 0], fov: 46 },
      { t: 0.7, crop: 1, pos: [1.15, 1.35, 1.2], look: [-0.2, 1.05, -0.1], fov: 42 },
      { t: 1.3, crop: 1, pos: [1.4, 1.2, 0.95], look: [-0.1, 1.0, 0.1], fov: 40 },
      { t: 1.8, crop: 1, pos: [1.75, 1.1, 0.75], look: [0, 0.95, 0.05], fov: 38 },
      { t: 2.3, crop: 1, pos: [1.95, 0.55, 0.3], look: [0, 0.72, 0.05], fov: 44 },
      { t: 2.7, crop: 1, pos: [1.6, 0.28, -0.35], look: [0.05, 0.75, -0.2], fov: 48 },
      { t: 3.2, crop: 1, pos: [1.15, 0.3, -2.35], look: [-0.05, 0.85, -0.3], fov: 50 },
      { t: 3.8, crop: 1, pos: [0.98, 0.32, -2.28], look: [-0.05, 0.42, -0.7], fov: 48 },
      { t: 4.5, crop: 1, pos: [1.15, 0.36, -2.35], look: [-0.05, 0.6, -0.55], fov: 48 },
    ],
    events: [
      [0.16, 'sfx', 'pouch', { vol: 0.8 }], [0.3, 'prop', 1], [0.34, 'sfx', 'chargeBack', { vol: 0.35, rate: 1.5 }], [0.5, 'drop'], [0.72, 'sfx', 'swing', { vol: 0.8, rate: 1 }], [0.78, 'hit', 'v.pelvis', 0.02, 0.14, -0.14, 0, 0.3, 0.8, 1.0, 'stab'], [1.0, 'sfx', 'stab', { vol: 0.4, rate: 0.8 }], [1.22, 'hit', 'v.pelvis', 0.02, 0.14, -0.14, 0, 0, 0.5, 0.4],
      [1.46, 'sfx', 'swing', { vol: 0.8, rate: 1.1 }], [1.52, 'hit', 'v.head', 0.1, -0.15, -0.1, 0.4, 0.5, 0.7, 1.3, 'stab'], [1.58, 'hit', 'v.head', 0.08, -0.15, -0.1, 0.5, 0.5, 0.6, 0.8], [1.96, 'sfx', 'swing', { vol: 0.7, rate: 0.8 }], [2.26, 'hit', 'v.pelvis', 0.1, -0.3, -0.12, 0.3, 0.2, 0.8, 1.4, 'stab'], [2.34, 'hit', 'v.pelvis', 0.1, -0.3, -0.12, 0.3, 0.3, 0.7, 0.8], [2.86, 'thud'], [2.9, 'slam', 'v.chest', 0.7], [2.92, 'pool', 'v.chest', 0.4],
      [3.5, 'sfx', 'swing', { vol: 0.9, rate: 0.7 }], [3.66, 'hit', 'v.chest', 0.04, 0.1, -0.2, 0, 1, 0.2, 1.8, 'stab'], [3.68, 'sfx', 'punch', { vol: 0.8, rate: 0.9 }], [3.94, 'sfx', 'stab', { vol: 0.5, rate: 0.8 }], [4.0, 'kill', [0, -0.1, 0], 0.05, 'chest'], [4.1, 'pool', 'v.chest', 0.8],
    ],
  },
  // ---------------------------------------------------------------------------
  // He grabs the barrel when he turns. A short struggle, the stock in his face. Your own gun, close enough to touch him.
  // ---------------------------------------------------------------------------
  {
    name: 'POINT BLANK', dur: 4.0, gun: 'own', front: 0.7,
    a: [
      { t: 0, ...UPPER, ...stand(0, 1.0), ...relax('a'), gun: 0, gat: ['a.chest', 0.24, -0.2, -0.14], gaim: ['v.chest', 0, 0.05, 0] },
      { t: 0.14, lf: [-0.14, 0, 0.72], p: [0, 0.925, 0.88] },
      { t: 0.26, rf: [0.15, 0, 0.92], p: [0, 0.91, 0.74], lh: ['v.chest', -0.2, 0.2, 0.1], rh: ['a.chest', 0.24, -0.2, -0.14] },
      { t: 0.46, gun: 1, rh: ['a.chest', 0.14, -0.04, -0.24], gat: ['a.chest', 0.14, -0.04, -0.24], gaim: ['v.chest', 0, 0.05, 0], lh: ['a.chest', -0.18, -0.08, -0.42], cy: -0.08 },
      { t: 0.72, lf: [-0.16, 0, 0.46], p: [0, 0.87, 0.68], r: [0.08, 0, 0], gat: ['a.chest', 0.12, -0.02, -0.3], lh: ['a.chest', -0.1, -0.02, -0.5] },
      { t: 0.92, cy: 0.22, sy: 0.12, gat: ['a.chest', 0.1, 0, -0.3], gaim: ['v.chest', -0.5, 0.05, 0], j: 0.6 },
      { t: 1.1, cy: -0.22, sy: -0.12, gat: ['a.chest', 0.12, -0.04, -0.3], gaim: ['v.chest', 0.45, 0.05, 0] },
      // the stock comes around
      { t: 1.28, cy: -0.42, sy: -0.24, j: 0, r: [-0.06, 0, 0], p: [0, 0.875, 0.72], gat: ['a.chest', 0.34, 0.1, -0.18], gaim: ['a.chest', 0.3, 0.7, 0.6], lh: ['a.chest', -0.05, 0.16, -0.36] },
      { t: 1.44, cy: 0.42, sy: 0.24, r: [0.16, 0, 0], p: [0, 0.86, 0.56], gat: ['a.chest', 0.12, 0.2, -0.3], gaim: ['a.chest', 0.3, 0.32, 0.6], lh: ['a.chest', 0, 0.2, -0.44] },
      { t: 1.82, p: [0, 0.91, 0.92], r: [0, 0, 0], lf: [-0.14, 0, 0.72], rf: [0.15, 0, 1.06], cy: 0, sy: 0, cp: 0.08, two: 1, gat: ['a.chest', 0.14, -0.02, -0.22], gaim: ['v.head', 0, 0, 0], hp: 0.2 },
      { t: 2.1, p: [0, 0.875, 0.9], cp: 0.1, gat: ['a.chest', 0.11, 0.12, -0.27], gaim: ['v.head', 0, 0, 0], hp: 0.26, hy: 0.12, cy: 0.06 },
      { t: 2.52, p: [0, 0.875, 0.9], gat: ['a.chest', 0.11, 0.12, -0.27], gaim: ['v.chest', 0, 0.2, 0] },
      { t: 2.66, lf: [-0.14, 0, 0.6], lfd: 0.3 },
      { t: 2.86, gaim: ['v.pelvis', 0, 0, 0], p: [0, 0.885, 0.78] },
      { t: 3.36, ...stand(0, 0.8), lf: [-0.14, 0, 0.6], rf: [0.15, 0, 0.92], gat: ['a.chest', 0.14, -0.14, -0.2], gaim: [0.7, 0.1, -3], hp: 0.08, cy: 0, hy: 0, cp: 0.04 },
      { t: 4.0, gat: ['a.chest', 0.14, -0.18, -0.18], gaim: [0.9, 0, -3], hp: 0, cp: 0 },
    ],
    v: [
      { t: 0, ...UPPER, ...stand(0, 0), ...relax('v') },
      { t: 0.24, hy: 0, hp: 0, r: [0, 0, 0] },
      { t: 0.34, hy: 0.4, hp: 0.05 },
      { t: 0.48, ...stand(0.02, 0, 1.6), hy: 0.2, lh: ['v.chest', -0.28, -0.1, -0.22], rh: ['v.chest', 0.28, -0.1, -0.22] },
      { t: 0.7, ...stand(0.02, 0.02, 3.04), hy: 0, hp: -0.1, cp: -0.05, lh: ['a.chest', 0, 0, -0.66], rh: ['a.chest', 0.08, 0.02, -0.56], j: 0.7 },
      { t: 0.92, cy: 0.18, sy: 0.1, p: [0.08, 0.91, 0.02], j: 1, lh: ['a.chest', -0.1, 0.02, -0.62], rh: ['a.chest', 0, 0.02, -0.54] },
      { t: 1.1, cy: -0.18, sy: -0.1, p: [-0.06, 0.91, 0.02], lh: ['a.chest', 0.1, 0, -0.62], rh: ['a.chest', 0.16, 0, -0.54] },
      { t: 1.42, p: [-0.02, 0.91, 0.0], cy: -0.08, sy: -0.04, r: [0, 3.04, 0], hp: -0.1, cp: -0.05, ka: 1, lh: ['a.chest', 0.06, 0, -0.62], rh: ['a.chest', 0.12, 0, -0.54] },
      // full in the face
      { t: 1.56, p: [0, 0.87, -0.2], r: [-0.25, 3.04, 0.1], cy: 0, sy: 0, ka: 0.3, lh: ['v.chest', -0.46, 0.05, 0], rh: ['v.chest', 0.46, 0.12, 0], j: 0, hp: -0.2 },
      { t: 1.9, ...oneKnee(0.02, -0.28, 3.04), r: [0.4, 3.04, 0], rfd: 0.3, lfd: 0.3, sp: 0.2, cp: 0.25, hp: 0.4, hy: 0.1, ka: 0.8, lh: ['v.pelvis', -0.1, 0.05, -0.3], rh: ['v.chest', 0.1, -0.25, -0.28], j: 0.2 },
      { t: 2.14, r: [0.14, 3.04, 0], sp: 0.04, cp: 0.05, hp: -0.25, hy: 0, lh: ['v.chest', -0.2, 0.05, -0.34], rh: ['v.chest', 0.2, 0.12, -0.34], j: 0.5 },
      { t: 2.2, ka: 0.8 },
      { t: 2.32, ka: 0.25, lh: ['v.chest', -0.44, 0.1, -0.05], rh: ['v.chest', 0.42, 0.14, 0], j: 0, r: [-0.05, 3.04, 0], p: [0.02, 0.58, -0.28] },
      { t: 2.54, r: [-0.3, 3.04, 0.05], p: [0.02, 0.56, -0.32], kt: 1, kl: 1, kh: 0.7 },
      ...fallBack(2.6, 0.02, -0.36, 3.04, { d: 0.46, T: 0.78, kneeling: true, lean: -0.3 }),
    ],
    vk: { hp: [[1.44, -13], [2.2, -5], [2.3, -5], [2.4, -6], [2.52, -14]], hy: [[1.44, 6]], hz: [[1.44, 4]], cp: [[1.44, -4], [2.2, -5], [2.3, -5], [2.4, -6], [2.52, -7]], sp: [[1.44, -2], [2.2, -2], [2.3, -2], [2.4, -2], [2.52, -2.5]], cy: [[2.2, 3], [2.3, -3.5], [2.4, 2.5]] },
    ak: { cp: [[2.2, -0.9], [2.3, -0.9], [2.4, -0.9], [2.52, -1]], sp: [[2.2, -0.5], [2.3, -0.5], [2.4, -0.5], [2.52, -0.5]] },
    push: [[2.56, [3, 2], 0, 0.3, -2.4], [2.56, [1], 0, 0, -1.2]],
    slow: [[1.44, 0.84, 0.08, 0.05, 0.22], [2.4, 0.84, 0.15, 0.14, 0.25]],
    cam: [
      { t: 0, pos: [2.6, 1.2, 1.6], look: ['mid', 0, -0.25, 0], fov: 44 },
      { t: 0.7, pos: [3.1, 1.08, 0.85], look: ['mid', 0, -0.3, 0], fov: 38 },
      { t: 1.4, pos: [3.2, 1.02, 0.6], look: ['mid', 0, -0.3, 0], fov: 36 },
      { t: 2.2, pos: [2.9, 0.95, 0.8], look: [0, 0.85, 0.35], fov: 40 },
      { t: 3.0, pos: [3.0, 0.82, 0.5], look: [0, 0.72, 0.2], fov: 42 },
      { t: 3.6, pos: [3.0, 0.8, 0.35], look: [0, 0.8, 0.3], fov: 42 },
    ],
    events: [
      [0.2, 'sfx', 'pouch', { vol: 0.8 }], [0.45, 'sfx', 'chargeBack', { vol: 0.7 }], [0.62, 'drop'], [0.72, 'sfx', 'pouch', { vol: 0.8, rate: 0.8 }], [0.94, 'sfx', 'pouch', { vol: 0.6, rate: 1.1 }], [1.12, 'sfx', 'pouch', { vol: 0.6, rate: 0.9 }],
      [1.3, 'sfx', 'swing', { vol: 0.8, rate: 0.7 }], [1.44, 'hit', 'v.head', 0, 0.04, -0.12, 0, 0.3, -1, 1, 'crack'], [1.44, 'sfx', 'punch', { vol: 1 }], [1.9, 'sfx', 'thud', { vol: 0.7, rate: 1.3 }],
      [2.2, 'shot', 'v.chest', 0, 0.12, -0.14, 0, 0.1, -1, 1.5], [2.3, 'shot', 'v.chest', 0.05, 0.06, -0.14, 0, 0.1, -1, 1.5], [2.4, 'shot', 'v.chest', -0.05, 0.16, -0.14, 0, 0.1, -1, 1.5], [2.52, 'shot', 'v.head', 0, 0.06, -0.1, 0, 0.2, -1, 2.0],
      [2.9, 'kill', [0, 0, -0.2], 0.1, 'chest'], [3.0, 'thud'], [3.1, 'pool', 'v.chest', 0.8],
    ],
  },
  // ===========================================================================
  // On someone lying on the ground. The victim starts flat on the belly at the origin, the head toward -z.
  // ===========================================================================
  // ---------------------------------------------------------------------------
  // He rears up and throws an arm in the way. The arm is caught, a knee drives him flat, the head comes up by the helmet.
  // ---------------------------------------------------------------------------
  {
    name: 'KNIE IM KREUZ', dur: 4.3, prop: 'knife', prone: true,
    a: [
      { t: 0, ...UPPER, ...stand(0.62, 1.9), ...relax('a') },
      { t: 0.16, lf: [0.46, 0, 1.46], p: [0.6, 0.925, 1.64] },
      { t: 0.34, rf: [0.76, 0, 1.04], p: [0.62, 0.92, 1.24], r: [0.05, 0, 0], hp: 0.15 },
      { t: 0.52, lf: [0.5, 0, 0.62], p: [0.62, 0.9, 0.82], r: [0.1, 0.05, 0], hp: 0.25 },
      { t: 0.72, rf: [0.74, 0, 0.18], p: [0.62, 0.87, 0.38], r: [0.2, 0.1, 0], cp: 0.06, hp: 0.3, lh: ['a.chest', -0.32, -0.1, -0.2], rh: ['a.chest', 0.3, -0.2, -0.12] },
      // he catches the arm
      { t: 0.96, p: [0.58, 0.84, 0.24], r: [0.32, 0.16, 0], cp: 0.1, hp: 0.25, lh: ['v.rhand', -0.03, 0.03, 0] },
      // the knee, with everything he weighs
      { t: 1.2, p: [0.3, 0.68, 0.07], r: [0.9, 0.1, 0], cp: 0.2, sp: 0.1, hp: 0.12, lf: [-0.02, 0.19, 0.26], lfp: 0.5, lfd: 0.26, rf: [0.64, 0, -0.02], rfd: 0.22, lh: ['v.rhand', -0.03, 0.03, 0] },
      { t: 1.42, p: [0.3, 0.67, 0.06], r: [0.94, 0.1, 0], lh: ['v.head', 0, 0.17, 0.05], rh: ['a.pelvis', 0.2, 0.02, 0.12], pto: ['a.pelvis', 0.2, 0.4, -0.3] },
      // the head comes up, the knife goes back
      { t: 1.76, p: [0.3, 0.71, 0.1], r: [0.76, 0.1, 0], cp: 0.1, cy: -0.24, sy: -0.1, hp: 0.2, lh: ['v.head', 0, 0.17, 0.05], rh: ['a.chest', 0.38, 0.06, -0.2], pto: ['v.head', 0.12, -0.1, -0.1] },
      { t: 1.96, rh: ['a.chest', 0.42, 0.14, -0.14], pto: ['v.head', 0.1, -0.12, -0.1], cy: -0.3, sy: -0.13, lh: ['v.head', 0, 0.17, 0.05] },
      // and through
      { t: 2.1, p: [0.28, 0.66, 0.05], r: [0.98, 0.06, 0], cp: 0.24, cy: 0.28, sy: 0.14, rh: ['v.head', 0.09, -0.12, -0.07], pto: ['v.head', -0.14, -0.13, -0.04], lh: ['v.head', 0, 0.17, 0.05] },
      { t: 2.5, p: [0.28, 0.66, 0.05], r: [0.96, 0.06, 0], cy: 0.2, cp: 0.22, rh: ['v.head', 0.09, -0.12, -0.07], pto: ['v.head', -0.14, -0.13, -0.04], lh: ['v.head', 0, 0.17, 0.05] },
      { t: 2.8, p: [0.32, 0.72, 0.12], r: [0.6, 0.06, 0], cp: 0.12, cy: 0, sy: 0, rh: ['a.chest', 0.3, -0.06, -0.22], pto: ['a.chest', 0.42, 0.3, -0.7], lh: ['a.chest', -0.26, -0.2, -0.3] },
      // up and off him
      { t: 3.24, p: [0.56, 0.86, 0.24], r: [0.2, 0, 0], lf: [0.36, 0, 0.5], lfp: 0, lfd: 0.38, cp: 0.1, hp: 0.3 },
      { t: 3.7, ...stand(0.66, 0.36), lf: [0.5, 0, 0.44], rf: [0.8, 0, 0.28], cp: 0.08, hp: 0.32, ...relax('a'), rh: ['a.chest', 0.26, -0.34, -0.16], pto: ['a.chest', 0.4, -0.95, -0.4] },
      { t: 4.3, cp: 0, hp: 0.1 },
    ],
    v: [
      { t: 0, ...UPPER, ...onBelly(0, 0) },
      // crawling: the left hand out, the body after it
      { t: 0.24, lh: [-0.36, 0.05, -0.9], cy: 0.14, rt: 0.08, hy: 0.1, p: [0, 0.175, -0.01] },
      { t: 0.5, p: [0, 0.18, -0.07], cy: 0.05, rt: 0, hy: 0 },
      // he hears it, and comes around with his arm up
      { t: 0.7, rt: -0.2, cy: -0.2, sy: -0.08, hp: -0.92, hy: -0.45, p: [-0.01, 0.2, -0.08], rh: [0.42, 0.34, -0.44], lh: [-0.36, 0.05, -0.72] },
      { t: 0.96, rt: -0.62, cy: -0.42, sy: -0.2, p: [-0.03, 0.25, -0.08], r: [1.38, 0, 0], hp: -0.75, hy: -1.0, rh: [0.44, 0.72, -0.2], lh: [-0.34, 0.05, -0.56], rf: [0.2, 0.12, 0.76], rfp: 0.5 },
      { t: 1.06, rh: [0.46, 0.72, -0.16] },
      // flat, the air gone out of him
      { t: 1.24, rt: 0, cy: 0, sy: 0, p: [0, 0.15, -0.08], r: [1.5, 0, 0], hp: -0.35, hy: -0.3, rh: [0.38, 0.12, -0.3], lh: [-0.42, 0.05, -0.6], rf: [0.2, 0.02, 0.8], rfp: 1.3 },
      { t: 1.44, hp: -0.55, hy: -0.15, rh: [0.42, 0.06, -0.5], p: [0, 0.15, -0.08] },
      // the head goes up with the hand in the helmet
      { t: 1.8, hp: -1.22, hy: 0, cp: -0.42, sp: -0.26, r: [1.42, 0, 0], p: [0, 0.19, -0.08], rh: [0.42, 0.06, -0.62], lh: [-0.4, 0.06, -0.72] },
      { t: 2.1, hp: -1.3, cp: -0.48, sp: -0.3, r: [1.42, 0, 0], p: [0, 0.19, -0.08], lh: [-0.38, 0.14, -0.74], rh: [0.44, 0.06, -0.6], lf: [-0.2, 0.02, 0.84], rf: [0.2, 0.02, 0.8], lfp: 1.3, rfp: 1.3 },
      // the legs come up by themselves
      { t: 2.36, lf: [-0.18, 0.3, 0.68], rf: [0.2, 0.36, 0.64], lfp: 0.5, rfp: 0.5, ka: 0.5, lh: [-0.42, 0.06, -0.56] },
      { t: 2.62, hp: -1.22, cp: -0.42, sp: -0.26, r: [1.42, 0, 0], lf: [-0.2, 0.2, 0.74], rf: [0.2, 0.26, 0.7], ka: 0.25, kl: 0.8, p: [0, 0.19, -0.08] },
      { t: 2.8, kt: 1, kh: 0.7, ka: 0, kl: 0.5, lf: [-0.2, 0.04, 0.84], rf: [0.2, 0.04, 0.82] },
      { t: 2.94, kt: 0.2, kh: 0, kl: 0.1 },
      { t: 3.08, kt: 0, kl: 0 },
    ],
    vk: { hp: [[1.22, 7]], cp: [[1.22, 5]], sp: [[1.22, 4]], hy: [[2.1, 3]] },
    ak: { cp: [[2.1, 1]] },
    slow: [[2.1, 0.84, 0.1, 0.12, 0.3]],
    cam: [
      { t: 0, crop: 1, pos: [-1.5, 0.46, -1.65], look: [0.15, 0.62, 0.15], fov: 46 },
      { t: 0.9, crop: 1, pos: [-1.55, 0.44, -1.45], look: [0.22, 0.66, -0.2], fov: 46 },
      { t: 1.5, crop: 1, pos: [-1.6, 0.42, -1.1], look: [0.14, 0.62, -0.38], fov: 42 },
      { t: 2.1, crop: 1, pos: [-1.5, 0.44, -0.85], look: [0.08, 0.56, -0.48], fov: 38 },
      { t: 2.9, crop: 1, pos: [-1.75, 0.55, -0.4], look: [0.15, 0.55, -0.2], fov: 42 },
      { t: 3.9, pos: [-2.1, 0.78, 0.1], look: [0.3, 0.7, 0.05], fov: 44 },
    ],
    events: [
      [0.2, 'sfx', 'pouch', { vol: 0.5 }], [0.3, 'drop'], [0.56, 'sfx', 'pouch', { vol: 0.5 }], [0.96, 'sfx', 'pouch', { vol: 0.9, rate: 0.8 }], [1.14, 'sfx', 'swing', { vol: 0.5, rate: 0.7 }], [1.22, 'hit', 'v.chest', 0, -0.2, 0.14, 0, 0.5, 0.2, 0.2, 'punch'], [1.23, 'sfx', 'thud', { vol: 0.9, rate: 1.1 }],
      [1.44, 'prop', 1], [1.46, 'sfx', 'chargeBack', { vol: 0.4, rate: 1.5 }], [2.04, 'sfx', 'swing', { vol: 0.9, rate: 1.1 }], [2.1, 'hit', 'v.head', 0, -0.12, -0.1, 0.3, -0.2, -1, 1.5, 'stab'], [2.12, 'spurt', 0.9], [2.8, 'kill', [0, -0.2, 0], 0.05, 'chest'], [2.92, 'thud'], [3.0, 'pool', 'v.head', 0.8],
    ],
  },
  // ---------------------------------------------------------------------------
  // On one knee beside him. Rolled over onto his back he kicks and fends off, is pulled up by the vest and sees the knife coming.
  // ---------------------------------------------------------------------------
  {
    name: 'UMGEDREHT', dur: 4.7, prop: 'knife', prone: true,
    a: [
      { t: 0, ...UPPER, ...stand(1.02, 1.25, 0.35), ...relax('a') },
      { t: 0.18, lf: [0.84, 0, 0.92], p: [0.98, 0.925, 1.04], r: [0.03, 0.6, 0] },
      { t: 0.38, rf: [1.02, 0, 0.5], p: [0.96, 0.91, 0.66], r: [0.08, 1.1, 0], hp: 0.2 },
      { t: 0.6, lf: [0.62, 0, 0.16], p: [0.9, 0.84, 0.26], r: [0.2, 1.45, 0], hp: 0.25, cp: 0.06 },
      // down on one knee
      { t: 0.9, p: [0.76, 0.58, 0], r: [0.38, 1.57, 0], rf: [1.34, 0.02, -0.1], rfp: 1.35, rfd: 0.3, cp: 0.2, sp: 0.08, hp: 0.25, lh: ['a.chest', -0.22, -0.1, -0.4], rh: ['a.chest', 0.22, -0.14, -0.38] },
      { t: 1.08, r: [0.8, 1.57, 0], cp: 0.34, sp: 0.2, lh: ['v.pelvis', 0.2, 0, 0.04], rh: ['v.chest', 0.22, 0.1, 0.04] },
      { t: 1.2, lh: ['v.pelvis', 0.2, 0, 0.04], rh: ['v.chest', 0.22, 0.1, 0.04] },
      // over he goes
      { t: 1.46, p: [0.8, 0.6, 0.02], r: [0.44, 1.5, 0], cp: 0.14, sp: 0.06, lh: [0.42, 0.42, 0.14], rh: [0.4, 0.62, -0.42] },
      { t: 1.74, p: [0.78, 0.6, 0.04], r: [0.6, 1.4, 0], cp: 0.26, sp: 0.14, lh: ['a.chest', -0.1, -0.1, -0.42], rh: ['a.pelvis', 0.2, 0.02, 0.12], pto: ['a.pelvis', 0.2, 0.4, -0.3] },
      // the hand that was in the way is knocked aside, into the vest, and up with him
      { t: 2.0, p: [0.76, 0.6, 0.06], r: [0.72, 1.25, 0], cp: 0.3, sp: 0.16, lh: ['v.chest', -0.02, 0.12, -0.18], rh: ['a.chest', 0.3, -0.06, -0.14], pto: ['v.chest', 0, 0.1, -0.1] },
      { t: 2.32, p: [0.8, 0.62, 0.06], r: [0.34, 1.25, 0], cp: 0.08, sp: 0.02, hp: 0.3, lh: ['v.chest', -0.02, 0.12, -0.18], rh: ['a.chest', 0.3, 0.14, -0.1], pto: ['v.chest', 0, 0.1, -0.1] },
      { t: 2.56, rh: ['a.chest', 0.26, 0.42, -0.08], pto: ['v.chest', 0, 0.1, -0.1], cy: -0.2, sy: -0.1, lh: ['v.chest', -0.02, 0.12, -0.18] },
      // and down
      { t: 2.72, p: [0.74, 0.6, 0.06], r: [0.54, 1.25, 0], cp: 0.3, sp: 0.14, cy: 0.2, sy: 0.1, rh: ['v.chest', 0.06, 0.1, -0.2], pto: ['v.chest', 0.02, 0.04, 0.12], lh: ['v.chest', -0.02, 0.12, -0.18] },
      { t: 3.14, rh: ['v.chest', 0.06, 0.1, -0.2], pto: ['v.chest', 0.02, 0.04, 0.12], lh: ['v.chest', -0.02, 0.12, -0.18] },
      { t: 3.46, p: [0.8, 0.6, 0.06], r: [0.5, 1.3, 0], cp: 0.2, cy: 0, sy: 0, rh: ['a.chest', 0.28, -0.1, -0.24], pto: ['a.chest', 0.42, 0.2, -0.7], lh: ['v.chest', -0.02, 0.12, -0.18] },
      { t: 3.66, lh: ['a.chest', -0.26, -0.3, -0.16] },
      { t: 4.06, ...stand(1.04, 0.14, 1.57), lf: [0.9, 0, 0.28], rf: [1.14, 0, 0], cp: 0.1, sp: 0, hp: 0.28, rfp: 0, ...relax('a'), rh: ['a.chest', 0.26, -0.34, -0.16], pto: ['a.chest', 0.4, -0.95, -0.4] },
      { t: 4.7, cp: 0, hp: 0.12 },
    ],
    v: [
      { t: 0, ...UPPER, ...onBelly(0, 0) },
      { t: 0.28, lh: [-0.36, 0.05, -0.9], cy: 0.14, rt: 0.08, hy: 0.1, p: [0, 0.175, -0.01] },
      { t: 0.56, rh: [0.36, 0.05, -0.92], lh: [-0.34, 0.05, -0.62], cy: -0.12, rt: -0.08, hy: -0.15, p: [0, 0.18, -0.08] },
      { t: 1.1, rt: 0, cy: 0, hy: -0.3, r: [1.5, 0, 0], p: [0, 0.17, -0.08], hp: -0.7, lfp: 1.35, rfp: 1.35, ka: 1, kl: 1, lf: [-0.2, 0, 0.76], rf: [0.2, 0, 0.78], lh: [-0.36, 0.05, -0.66], rh: [0.36, 0.05, -0.7] },
      { t: 1.22, ka: 1, kl: 0.9 },
      // rolling away from the hands, the legs come along
      { t: 1.46, rt: -1.57, p: [-0.06, 0.27, -0.08], hp: -0.2, hy: 0, cp: 0.1, lh: [-0.16, 0.08, -0.98], rh: [0.3, 0.48, -0.42], lf: [-0.1, 0.14, 0.76], rf: [0.12, 0.14, 0.72], lfy: -1.57, rfy: -1.57, lfp: 0, rfp: 0 },
      { t: 1.6, lh: [0.26, 0.22, -1.0], rh: [-0.24, 0.62, -0.24] },
      { t: 1.74, rt: -3.14, p: [-0.04, 0.17, -0.08], r: [1.48, 0, 0], hp: 0.3, hy: 0.6, cp: 0, lf: [0.2, 0, 0.42], rf: [-0.2, 0, 0.74], lfy: -3.14, rfy: -3.14, lfp: 0, rfp: -1.1, ka: 0.9, kl: 1, lh: [0.34, 0.6, -0.36], rh: [-0.52, 0.06, -0.36] },
      // the hand up, the heel digging in
      { t: 2.02, hp: 0.4, hy: 0.75, lh: [0.34, 0.68, -0.28], rf: [-0.2, 0.14, 0.64], rfy: -3.14, rfp: -0.7 },
      // up by the vest, the head falls back
      { t: 2.34, rt: -3.14, p: [0.03, 0.2, -0.05], r: [0.8, 0, 0], sp: 0.1, cp: 0.12, hp: -0.3, hy: 0.2, ka: 0.8, lh: ['a.lhand', 0.06, -0.14, -0.02], rh: ['a.lhand', -0.06, -0.16, -0.02], rf: [-0.2, 0, 0.72], rfy: -3.14, rfp: -1.1 },
      { t: 2.72, rt: -3.14, r: [0.8, 0, 0], p: [0.03, 0.2, -0.05], hp: -0.28, hy: 0.15, ka: 0.8 },
      { t: 2.8, sp: 0.2, cp: 0.25, hp: 0.08, ka: 0.4, lh: ['v.chest', 0.18, -0.1, -0.2], rh: ['v.chest', -0.18, -0.1, -0.2] },
      { t: 3.16, hp: -0.15, ka: 0.3 },
      { t: 3.48, r: [0.82, 0, 0], kh: 0.5, ka: 0, kt: 1, p: [0.03, 0.2, -0.05] },
      { t: 3.8, r: [1.42, 0, 0], p: [0.02, 0.17, -0.06], kt: 0.7, kh: 0, sp: 0, cp: 0, kl: 0.4 },
      { t: 3.96, kt: 0, kl: 0 },
    ],
    vk: { hp: [[2.72, 7]], cp: [[2.72, 4]], sp: [[2.72, 3]] },
    ak: { cp: [[2.72, 1.2]] },
    slow: [[2.72, 0.84, 0.1, 0.14, 0.32]],
    cam: [
      { t: 0, crop: 1, pos: [-1.55, 0.52, 1.25], look: [0.35, 0.6, 0.15], fov: 46 },
      { t: 0.9, crop: 1, pos: [-1.5, 0.62, 0.95], look: [0.42, 0.52, 0.02], fov: 44 },
      { t: 1.7, crop: 1, pos: [-1.35, 0.62, 0.72], look: [0.38, 0.5, -0.06], fov: 42 },
      { t: 2.6, crop: 1, pos: [-1.2, 0.56, 0.5], look: [0.28, 0.62, -0.1], fov: 36 },
      { t: 3.4, crop: 1, pos: [-1.4, 0.6, 0.55], look: [0.34, 0.52, -0.05], fov: 40 },
      { t: 4.4, pos: [-1.95, 0.85, 0.5], look: [0.55, 0.7, 0.05], fov: 44 },
    ],
    events: [
      [0.3, 'drop'], [0.42, 'sfx', 'pouch', { vol: 0.5 }], [0.9, 'sfx', 'thud', { vol: 0.5, rate: 1.3 }], [1.22, 'sfx', 'pouch', { vol: 0.9, rate: 0.8 }], [1.76, 'sfx', 'thud', { vol: 0.8 }], [1.84, 'prop', 1], [1.86, 'sfx', 'chargeBack', { vol: 0.4, rate: 1.5 }],
      [2.64, 'sfx', 'swing', { vol: 1, rate: 1.1 }], [2.72, 'hit', 'v.chest', 0, 0.1, -0.16, 0, 0.8, 0.2, 1.6, 'stab'], [2.74, 'spurt', 0.5], [3.2, 'sfx', 'stab', { vol: 0.5, rate: 0.8 }], [3.66, 'kill', [0, -0.2, 0], 0.05, 'chest'], [3.82, 'thud'], [3.86, 'pool', 'v.chest', 0.8],
    ],
  },
  // ---------------------------------------------------------------------------
  // Hauled up by the collar onto his knees, the head pulled back, the blade across the throat, a boot in the back.
  // ---------------------------------------------------------------------------
  {
    name: 'HOCHGERISSEN', dur: 4.4, prop: 'knife', prone: true,
    a: [
      { t: 0, ...UPPER, ...stand(0.1, 1.9), ...relax('a') },
      { t: 0.18, lf: [-0.2, 0, 1.46], p: [0.04, 0.925, 1.62] },
      { t: 0.36, rf: [0.38, 0, 1.06], p: [0.04, 0.92, 1.22], hp: 0.2 },
      { t: 0.54, lf: [-0.38, 0, 0.72], p: [0, 0.9, 0.84], r: [0.14, 0, 0], hp: 0.3 },
      { t: 0.72, rf: [0.38, 0, 0.44], p: [0, 0.8, 0.52], r: [0.6, 0, 0], cp: 0.2, sp: 0.1, hp: 0.3, lfd: 0.2 },
      // bent over him: both hands in the collar
      { t: 0.94, p: [0, 0.58, 0.32], r: [1.02, 0, 0], cp: 0.3, sp: 0.2, hp: 0.3, lh: ['v.chest', -0.1, 0.24, 0.13], rh: ['v.chest', 0.1, 0.24, 0.13] },
      { t: 1.06, lh: ['v.chest', -0.1, 0.24, 0.13], rh: ['v.chest', 0.1, 0.24, 0.13], p: [0, 0.58, 0.32] },
      // up with him
      { t: 1.5, p: [0, 0.86, 0.46], r: [0.14, 0, 0], cp: 0.12, sp: 0.02, hp: 0.3, lh: ['v.chest', -0.1, 0.24, 0.13], rh: ['v.chest', 0.1, 0.24, 0.13] },
      { t: 1.7, lh: ['v.head', -0.02, 0.1, -0.1], rh: ['a.pelvis', 0.2, 0.02, 0.12], pto: ['a.pelvis', 0.2, 0.4, -0.3], p: [0, 0.87, 0.44], cp: 0.1 },
      { t: 2.0, rh: ['a.chest', 0.1, 0.1, -0.36], pto: ['v.head', -0.3, -0.12, -0.1], cy: -0.26, sy: -0.12, lh: ['v.head', -0.02, 0.1, -0.1], hp: 0.34 },
      { t: 2.18, rh: ['v.head', -0.19, -0.13, -0.1], pto: ['v.head', 0.1, -0.13, -0.12], lh: ['v.head', -0.02, 0.1, -0.1], cy: -0.34, sy: -0.16 },
      // across
      { t: 2.36, rh: ['v.head', 0.22, -0.13, -0.12], pto: ['v.head', 0.55, -0.13, -0.1], cy: 0.32, sy: 0.14, lh: ['v.head', -0.02, 0.1, -0.1] },
      { t: 2.66, rh: ['a.chest', 0.42, 0.04, -0.24], pto: ['a.chest', 0.8, 0.2, -0.5], cy: 0.2, sy: 0.08, lh: ['v.head', -0.02, 0.1, -0.1] },
      { t: 2.92, lh: ['a.chest', -0.28, -0.2, -0.2], rh: ['a.chest', 0.3, -0.14, -0.18], cy: 0, sy: 0, p: [0, 0.89, 0.48], r: [0, 0, 0], cp: 0.08 },
      // the boot in his back
      { t: 3.1, rf: [0.14, 0.42, 0.2], rfp: -0.2, rfd: 0.14, p: [0, 0.94, 0.56], r: [-0.26, 0, 0], cp: 0.2, sp: -0.05, hp: 0.3, lh: ['a.chest', -0.38, -0.08, 0], rh: ['a.chest', 0.38, -0.1, 0.02], pto: ['a.chest', 0.8, -0.2, 0] },
      { t: 3.3, rf: [0.3, 0, 0.6], rfp: 0, p: [0, 0.92, 0.58], r: [0, 0, 0], sp: 0, cp: 0.1, hp: 0.3 },
      { t: 3.8, ...stand(0, 0.72), lf: [-0.2, 0, 0.72], rf: [0.26, 0, 0.72], cp: 0.08, hp: 0.28, ...relax('a'), rh: ['a.chest', 0.26, -0.34, -0.16], pto: ['a.chest', 0.4, -0.95, -0.4] },
      { t: 4.4, cp: 0, hp: 0.1 },
    ],
    v: [
      { t: 0, ...UPPER, ...onBelly(0, 0) },
      { t: 0.3, lh: [-0.36, 0.05, -0.9], cy: 0.14, rt: 0.08, hy: 0.1, p: [0, 0.175, -0.01] },
      { t: 0.64, rh: [0.38, 0.05, -0.92], lh: [-0.34, 0.05, -0.62], cy: -0.12, rt: -0.08, hy: -0.15, p: [0, 0.18, -0.08] },
      { t: 1.04, p: [0, 0.17, -0.08], r: [1.5, 0, 0], rt: 0, cy: 0, hy: 0, hp: -0.85, lf: [-0.2, 0, 0.76], rf: [0.2, 0, 0.78], lh: [-0.34, 0.05, -0.66], rh: [0.38, 0.05, -0.76] },
      // up by the collar, the knees under him, the toes tucked, the hands letting go of the ground last
      { t: 1.28, p: [0, 0.36, -0.04], r: [0.98, 0, 0], sp: 0.08, cp: 0.05, hp: -0.3, ka: 0.8, lh: [-0.36, 0.1, -0.56], rh: [0.38, 0.1, -0.58] },
      { t: 1.52, ...kneel(0, -0.02, 0), lfl: 0, rfl: 0, lfd: 0.46, rfd: 0.46, r: [0.08, 0, 0], sp: 0, cp: -0.02, hp: -0.15, lh: ['v.chest', -0.32, -0.2, -0.18], rh: ['v.chest', 0.32, -0.2, -0.18] },
      { t: 1.72, hp: -0.15, cp: -0.02 },
      // the head back, he gets a hand up to the arm
      { t: 2.0, hp: -0.62, cp: -0.12, sp: -0.05, r: [-0.02, 0, 0], p: [0, 0.54, 0], lh: ['a.lhand', -0.06, -0.16, 0], rh: ['v.chest', 0.3, -0.06, -0.26] },
      { t: 2.36, hp: -0.68, cp: -0.12, sp: -0.05, r: [-0.02, 0, 0], p: [0, 0.54, 0], lh: ['v.head', -0.08, -0.1, -0.1], rh: ['v.head', 0.08, -0.12, -0.1] },
      { t: 2.7, hp: -0.5, ka: 0.8, lh: ['v.head', -0.06, -0.14, -0.1], rh: ['v.head', 0.06, -0.14, -0.1] },
      { t: 2.96, hp: -0.1, cp: 0.05, sp: 0.03, r: [0.1, 0, 0], kh: 0.6, ka: 0.2, lh: ['v.chest', -0.28, -0.3, -0.16], rh: ['v.chest', 0.28, -0.3, -0.16] },
      { t: 3.1, kt: 1, kl: 1, ka: 0, kh: 0.2, p: [0, 0.54, 0], r: [0.14, 0, 0] },
      ...fallForward(3.13, 0, -0.02, 0, { d: 0.62, T: 0.66, kneeling: true }),
    ],
    vk: { hp: [[1.06, -3]] },
    push: [[3.12, [0, 1, 2], 0, 0.1, -2.6], [3.12, [3], 0, 0.1, -2.2]],
    slow: [[2.3, 0.84, 0.12, 0.14, 0.32]],
    cam: [
      { t: 0, crop: 1, pos: [1.65, 0.52, -1.25], look: [-0.1, 0.62, 0.3], fov: 46 },
      { t: 1.0, crop: 1, pos: [1.6, 0.56, -1.2], look: [-0.05, 0.6, 0.12], fov: 44 },
      { t: 1.7, crop: 1, pos: [1.2, 0.74, -1.4], look: [0.02, 0.98, 0.14], fov: 40 },
      { t: 2.3, crop: 1, pos: [0.95, 0.8, -1.4], look: ['@v.head', 0, -0.1, 0], fov: 34 },
      { t: 3.1, crop: 1, pos: [1.35, 0.62, -1.45], look: [0, 0.55, -0.12], fov: 42 },
      { t: 4.1, pos: [1.8, 0.8, -1.15], look: [0, 0.7, 0.2], fov: 44 },
    ],
    events: [
      [0.3, 'drop'], [0.2, 'sfx', 'pouch', { vol: 0.5 }], [0.56, 'sfx', 'pouch', { vol: 0.5 }], [1.04, 'sfx', 'pouch', { vol: 1, rate: 0.8 }], [1.54, 'sfx', 'thud', { vol: 0.7, rate: 1.2 }], [1.72, 'prop', 1], [1.74, 'sfx', 'chargeBack', { vol: 0.4, rate: 1.5 }],
      [2.24, 'sfx', 'swing', { vol: 0.9, rate: 1.3 }], [2.28, 'hit', 'v.head', 0, -0.12, -0.12, 0.8, 0, -1, 1.5, 'stab'], [2.3, 'spurt', 1.3], [3.1, 'sfx', 'punch', { vol: 0.8, rate: 0.9 }], [3.2, 'kill', [0, 0, -1], 1.2, 'head'], [3.52, 'slam', 'v.chest', 0.6], [3.54, 'thud'], [3.7, 'pool', 'v.head', 0.8],
    ],
  },
  // ---------------------------------------------------------------------------
  // A boot on his back and he stays where he is. He looks round once more, into the muzzle.
  // ---------------------------------------------------------------------------
  {
    name: 'LETZTER TRITT', dur: 3.9, gun: 'handcannon', prone: true,
    a: [
      { t: 0, ...UPPER, ...stand(0.58, 1.8, 0.2), ...relax('a'), gat: ['a.pelvis', 0.22, -0.08, -0.06], gaim: ['a.pelvis', 0.22, -0.6, -0.4], gun: 0 },
      { t: 0.18, lf: [0.42, 0, 1.38], p: [0.56, 0.925, 1.55] },
      { t: 0.36, rf: [0.7, 0, 1.0], p: [0.56, 0.92, 1.18], r: [0.05, 0.1, 0], hp: 0.2 },
      { t: 0.56, lf: [0.44, 0, 0.6], p: [0.54, 0.9, 0.76], r: [0.08, 0.2, 0], hp: 0.3 },
      // the boot comes up, and down
      { t: 0.8, p: [0.52, 0.97, 0.6], r: [-0.14, 0.3, 0], cp: 0.2, hp: 0.32, rf: [0.22, 0.52, 0.22], rfp: -0.1, rfd: 0.22, lh: ['a.chest', -0.36, -0.1, -0.05], rh: ['a.chest', 0.36, -0.1, -0.04] },
      { t: 0.94, p: [0.46, 0.9, 0.52], r: [0.02, 0.3, 0], cp: 0.2, rf: [0.14, 0.32, 0.02], rfp: 0.05 },
      { t: 1.16, rh: ['a.pelvis', 0.22, -0.08, -0.06], lh: ['a.chest', -0.26, -0.3, -0.14], p: [0.46, 0.88, 0.52], hp: 0.34 },
      { t: 1.34, gun: 1, gat: ['a.pelvis', 0.22, -0.08, -0.06], gaim: ['a.pelvis', 0.22, -0.6, -0.4] },
      { t: 1.66, gat: ['a.chest', 0.24, -0.12, -0.34], gaim: ['v.head', 0, 0.05, 0], cp: 0.2 },
      { t: 1.74, lf: [0.4, 0, 0.66], lfd: 0.26, p: [0.46, 0.875, 0.52] },
      { t: 2.0, gat: ['a.chest', 0.18, -0.16, -0.44], gaim: ['v.head', 0, 0.05, 0], cp: 0.26, r: [0.08, 0.3, 0], p: [0.46, 0.87, 0.5], hp: 0.4 },
      { t: 2.4, gat: ['a.chest', 0.18, -0.16, -0.44], gaim: ['v.head', 0, 0.05, 0] },
      // the kick goes up his arm
      { t: 2.49, gat: ['a.chest', 0.2, -0.02, -0.42], gaim: ['a.chest', 0.2, 0.5, -1.3] },
      { t: 2.84, gat: ['a.chest', 0.18, -0.14, -0.42], gaim: ['v.chest', 0, 0, 0], p: [0.48, 0.89, 0.52], r: [0.02, 0.3, 0] },
      { t: 3.2, rf: [0.74, 0, 0.32], rfp: 0, rfd: 0.32, p: [0.58, 0.92, 0.58], r: [0, 0.3, 0], cp: 0.1, hp: 0.3, gat: ['a.chest', 0.22, -0.28, -0.24], gaim: ['a.chest', 0.3, -0.9, -0.9] },
      { t: 3.9, cp: 0, hp: 0.12 },
    ],
    v: [
      { t: 0, ...UPPER, ...onBelly(0, 0) },
      { t: 0.26, lh: [-0.36, 0.05, -0.9], cy: 0.14, rt: 0.08, hy: 0.1, p: [0, 0.175, -0.01] },
      { t: 0.56, rh: [0.38, 0.05, -0.92], lh: [-0.34, 0.05, -0.62], cy: -0.12, rt: -0.08, hy: -0.15, p: [0, 0.18, -0.09] },
      { t: 0.92, lh: [-0.38, 0.05, -0.86], rh: [0.34, 0.05, -0.66], cy: 0.1, rt: 0.05, hy: 0.1, p: [0, 0.18, -0.13], hp: -0.85, sp: 0 },
      // it knocks the air out of him
      { t: 1.0, p: [0, 0.145, -0.14], rt: 0, cy: 0, hp: -0.3, cp: 0.08, ka: 0.7 },
      { t: 1.4, hp: -0.7, cp: -0.1, ka: 1, lh: [-0.42, 0.05, -0.6], rh: [0.38, 0.05, -0.72], p: [0, 0.15, -0.14] },
      // he looks round, the free arm reaches back for the boot
      { t: 1.86, hp: -0.95, hy: -0.9, hz: -0.2, cy: -0.3, cp: -0.2, sp: -0.1, r: [1.45, 0, 0], rt: -0.18, rh: [0.46, 0.34, -0.3], p: [0, 0.16, -0.14] },
      { t: 2.4, hp: -0.95, hy: -0.95, hz: -0.2, cy: -0.3, cp: -0.2, sp: -0.1, r: [1.45, 0, 0], rt: -0.18, kh: 1, rh: [0.48, 0.4, -0.22], lf: [-0.2, 0, 0.76], rf: [0.2, 0, 0.78] },
      { t: 2.44, kh: 0, ka: 0.1 },
      { t: 2.52, lf: [-0.2, 0.3, 0.68], rf: [0.2, 0.34, 0.66], lfp: 0.3, rfp: 0.3 },
      { t: 2.6, kt: 0.4, ka: 0, kl: 0.2 },
      { t: 2.74, kt: 0, kl: 0 },
    ],
    vk: { hp: [[0.96, 6], [2.4, 12]], cp: [[0.96, 4]], sp: [[0.96, 3]], hy: [[2.4, 6]] },
    ak: { cp: [[2.4, -1.3]], hp: [[2.4, -1]] },
    push: [[2.44, [3], 0, -0.6, -0.8]],
    slow: [[2.4, 0.84, 0.14, 0.12, 0.3]],
    cam: [
      { t: 0, crop: 1, pos: [1.75, 0.46, -0.85], look: [0.3, 0.66, 0.4], fov: 46 },
      { t: 0.9, crop: 1, pos: [1.6, 0.34, -1.15], look: [0.3, 0.72, 0.15], fov: 46 },
      { t: 1.6, crop: 1, pos: [1.35, 0.3, -1.45], look: [0.25, 0.78, 0.1], fov: 44 },
      { t: 2.4, crop: 1, pos: [1.12, 0.3, -1.52], look: [0.2, 0.74, 0.04], fov: 42 },
      { t: 3.6, pos: [1.3, 0.5, -1.75], look: [0.18, 0.6, 0.05], fov: 44 },
    ],
    events: [
      [0.3, 'drop'], [0.2, 'sfx', 'pouch', { vol: 0.5 }], [0.56, 'sfx', 'pouch', { vol: 0.5 }], [0.94, 'hit', 'v.chest', 0, -0.05, 0.16, 0, 0.5, 0.2, 0, 'punch'], [0.95, 'sfx', 'thud', { vol: 1, rate: 1 }], [1.34, 'sfx', 'chargeBack', { vol: 0.7 }],
      [2.4, 'shot', 'v.head', 0, 0.08, 0.02, 0, -0.5, 0.5, 2.2], [2.68, 'kill', [0, -0.3, 0], 0.05, 'head'], [2.78, 'pool', 'v.head', 0.8],
    ],
  },
  // ---------------------------------------------------------------------------
  // He crawls. A hand closes around his ankle, back he comes, and the knife comes down between the shoulders.
  // ---------------------------------------------------------------------------
  {
    name: 'ZURÜCKGEZOGEN', dur: 4.6, prop: 'knife', prone: true,
    a: [
      { t: 0, ...UPPER, ...stand(0.3, 2.0), ...relax('a') },
      { t: 0.16, lf: [0.14, 0, 1.6], p: [0.28, 0.92, 1.76], hp: 0.2 },
      // down to his ankle
      { t: 0.44, rf: [0.52, 0, 1.36], p: [0.3, 0.56, 1.2], r: [1.1, 0, 0], cp: 0.34, sp: 0.2, hp: 0.25, lf: [0.08, 0, 1.08], lfd: 0.28, rfd: 0.26, lh: ['a.chest', -0.2, -0.04, -0.46], rh: ['a.chest', 0.2, -0.04, -0.46] },
      { t: 0.62, lh: ['v.rfoot', -0.05, 0.02, -0.02], rh: ['v.rfoot', 0.05, 0.05, 0] },
      { t: 0.74, p: [0.3, 0.56, 1.2], r: [1.1, 0, 0], lh: ['v.rfoot', -0.05, 0.02, -0.02], rh: ['v.rfoot', 0.05, 0.05, 0] },
      // back with him: the weight goes back, a step, another
      { t: 1.06, p: [0.3, 0.66, 1.62], r: [0.72, 0, 0], cp: 0.2, sp: 0.1, hp: 0.3, rf: [0.52, 0, 1.92], rfd: 0.28, lh: ['v.rfoot', -0.05, 0.02, -0.02], rh: ['v.rfoot', 0.05, 0.05, 0] },
      { t: 1.38, p: [0.3, 0.68, 1.98], r: [0.62, 0, 0], lf: [0.08, 0, 1.8], lfd: 0.28, lh: ['v.rfoot', -0.05, 0.02, -0.02], rh: ['v.rfoot', 0.05, 0.05, 0] },
      { t: 1.56, lh: ['a.chest', -0.24, -0.3, -0.16], rh: ['a.chest', 0.24, -0.3, -0.14], p: [0.32, 0.86, 1.98], r: [0.1, 0, 0], cp: 0.06 },
      // after him, drawing the knife on the way
      { t: 1.8, lf: [0.44, 0, 1.4], p: [0.46, 0.92, 1.56], rh: ['a.pelvis', 0.2, 0.02, 0.12], pto: ['a.pelvis', 0.2, 0.4, -0.3], hp: 0.3 },
      { t: 2.02, rf: [0.74, 0, 1.0], p: [0.56, 0.9, 1.16], r: [0.12, 0, 0], rh: ['a.chest', 0.3, 0.12, -0.14], pto: ['v.chest', 0, 0.1, 0.1] },
      { t: 2.24, lf: [0.44, 0, 0.72], p: [0.52, 0.82, 0.84], r: [0.3, -0.1, 0], rh: ['a.chest', 0.22, 0.46, -0.14], pto: ['a.chest', 0.2, 1.3, 0.1], cp: 0.1 },
      // the knee, the knife
      { t: 2.48, p: [0.3, 0.68, 0.72], r: [0.82, -0.1, 0], cp: 0.2, sp: 0.08, lf: [-0.02, 0.18, 0.96], lfp: 0.5, lfd: 0.22, rf: [0.66, 0, 0.62], rfd: 0.22, lh: ['v.chest', -0.1, 0.3, 0.14], rh: ['a.chest', 0.16, 0.52, -0.1], pto: ['a.chest', 0.14, 1.3, 0.2] },
      { t: 2.6, cp: 0.42, r: [1.0, -0.1, 0], p: [0.28, 0.66, 0.7], rh: ['v.chest', 0.06, 0.08, 0.2], pto: ['v.chest', 0.04, 0.06, -0.14], lh: ['v.chest', -0.1, 0.3, 0.14] },
      { t: 2.96, cp: 0.4, r: [0.98, -0.1, 0], rh: ['v.chest', 0.06, 0.08, 0.2], pto: ['v.chest', 0.04, 0.06, -0.14], lh: ['v.chest', -0.1, 0.3, 0.14] },
      { t: 3.24, p: [0.32, 0.72, 0.78], r: [0.5, -0.05, 0], cp: 0.1, sp: 0, rh: ['a.chest', 0.3, -0.04, -0.22], pto: ['a.chest', 0.42, 0.3, -0.7], lh: ['a.chest', -0.26, -0.22, -0.28] },
      // up and off him
      { t: 3.66, p: [0.54, 0.86, 0.9], r: [0.1, 0, 0], lf: [0.36, 0, 1.2], lfd: 0.34, lfp: 0, rf: [0.74, 0, 0.74], cp: 0.1, hp: 0.3 },
      { t: 4.06, ...stand(0.64, 1.0), lf: [0.48, 0, 1.08], rf: [0.78, 0, 0.92], cp: 0.08, hp: 0.3, ...relax('a'), rh: ['a.chest', 0.26, -0.34, -0.16], pto: ['a.chest', 0.4, -0.95, -0.4] },
      { t: 4.6, cp: 0, hp: 0.1 },
    ],
    v: [
      { t: 0, ...UPPER, ...onBelly(0, 0) },
      // crawling away, as fast as it goes
      { t: 0.24, lh: [-0.36, 0.05, -0.9], hp: -0.95, cy: 0.14, rt: 0.08, hy: 0.1, p: [0, 0.175, -0.02] },
      { t: 0.5, rh: [0.36, 0.05, -0.96], lh: [-0.34, 0.05, -0.62], cy: -0.12, rt: -0.08, hy: -0.1, p: [0, 0.18, -0.13] },
      { t: 0.74, p: [0, 0.18, -0.18], cy: 0, rt: 0, hy: 0, lf: [-0.2, 0, 0.7], lfl: 0, lfd: 0.3, rf: [0.2, 0.16, 0.72], rfp: 0.4, rfd: 0.16, lh: [-0.36, 0.05, -0.9], rh: [0.34, 0.05, -0.78] },
      // back he comes, the fingers dragging, the head up
      { t: 1.08, p: [0, 0.17, 0.26], lf: [-0.2, 0, 1.1], lfl: 0, lfd: 0.3, rf: [0.2, 0.34, 1.16], rfp: 0.4, lh: [-0.36, 0.05, -0.56], rh: [0.34, 0.05, -0.5], hp: -1.05, cp: -0.1, hy: 0.25 },
      { t: 1.4, p: [0, 0.17, 0.6], lf: [-0.2, 0, 1.44], lfl: 0, lfd: 0.3, rf: [0.2, 0.3, 1.52], lh: [-0.36, 0.05, -0.2], rh: [0.34, 0.05, -0.14], hp: -1.0, hy: 0.45 },
      // the foot is let go, he tries again at once
      { t: 1.64, rf: [0.2, 0.02, 1.42], rfp: 1.3, hp: -0.85, hy: 0.2, lh: [-0.36, 0.05, -0.34] },
      { t: 2.0, rh: [0.36, 0.05, -0.34], p: [0, 0.18, 0.52], hp: -1, hy: 0, cy: -0.1, rt: -0.06 },
      { t: 2.46, p: [0, 0.17, 0.5], hp: -0.85, cp: 0, sp: 0, cy: 0, rt: 0, ka: 1, lh: [-0.38, 0.05, -0.46] },
      // the blade
      { t: 2.58, p: [0, 0.145, 0.49], hp: -1.2, cp: -0.3, sp: -0.15, ka: 0.4, lf: [-0.2, 0.02, 1.36], rf: [0.2, 0.02, 1.4] },
      { t: 2.82, lf: [-0.18, 0.3, 1.22], rf: [0.2, 0.34, 1.18], lfp: 0.5, rfp: 0.5 },
      { t: 3.06, hp: -0.9, cp: -0.15, ka: 0.15, p: [0, 0.15, 0.49], lf: [-0.2, 0.2, 1.28], rf: [0.2, 0.22, 1.24] },
      { t: 3.26, kt: 1, kh: 0.6, ka: 0, kl: 0.6, lf: [-0.2, 0.03, 1.36], rf: [0.2, 0.03, 1.38] },
      { t: 3.38, kt: 0.2, kh: 0, kl: 0.1 },
      { t: 3.5, kt: 0, kl: 0 },
    ],
    vk: { hp: [[2.6, -5]], cp: [[2.6, -3]] },
    ak: { cp: [[2.6, 1.3]] },
    slow: [[2.6, 0.84, 0.08, 0.1, 0.28]],
    cam: [
      { t: 0, crop: 1, pos: [-1.6, 0.46, -1.05], look: [0.18, 0.5, 0.6], fov: 46 },
      { t: 0.7, crop: 1, pos: [-1.8, 0.46, -0.5], look: [0.2, 0.42, 0.75], fov: 46 },
      { t: 1.4, crop: 1, pos: [-1.9, 0.5, 0.1], look: [0.2, 0.45, 0.95], fov: 46 },
      { t: 2.2, crop: 1, pos: [-1.65, 0.55, 0.3], look: [0.2, 0.5, 0.7], fov: 42 },
      { t: 2.7, crop: 1, pos: [-1.45, 0.56, 0.42], look: [0.12, 0.5, 0.45], fov: 38 },
      { t: 3.5, crop: 1, pos: [-1.75, 0.62, 0.5], look: [0.15, 0.46, 0.6], fov: 40 },
      { t: 4.3, pos: [-2.1, 0.82, 0.7], look: [0.25, 0.6, 0.75], fov: 44 },
    ],
    events: [
      [0.3, 'drop'], [0.2, 'sfx', 'pouch', { vol: 0.5 }], [0.5, 'sfx', 'pouch', { vol: 0.4, rate: 1.2 }], [0.74, 'sfx', 'pouch', { vol: 1, rate: 0.8 }], [1.1, 'sfx', 'thud', { vol: 0.35, rate: 1.4 }], [1.8, 'prop', 1], [1.82, 'sfx', 'chargeBack', { vol: 0.4, rate: 1.5 }], [2.48, 'sfx', 'thud', { vol: 0.8, rate: 1.1 }],
      [2.52, 'sfx', 'swing', { vol: 1, rate: 1.1 }], [2.6, 'hit', 'v.chest', 0.05, 0.1, 0.18, 0, 0.8, 0.3, 1.6, 'stab'], [2.62, 'spurt', 0.4], [3.2, 'sfx', 'stab', { vol: 0.5, rate: 0.8 }], [3.3, 'kill', [0, -0.2, 0], 0.05, 'chest'], [3.5, 'pool', 'v.chest', 0.8],
    ],
  },
  // ---------------------------------------------------------------------------
  // Flipped onto his back with a boot. Astride him the axe goes up against the sky, he gets his hands up, it doesn't help.
  // ---------------------------------------------------------------------------
  {
    name: 'FALLBEIL', dur: 4.6, prop: 'axe', prone: true,
    a: [
      { t: 0, ...UPPER, ...stand(0.62, 1.55), ...relax('a') },
      { t: 0.18, lf: [0.46, 0, 1.14], p: [0.6, 0.925, 1.3], hp: 0.2 },
      { t: 0.38, rf: [0.72, 0, 0.74], p: [0.6, 0.92, 0.92], hp: 0.3, r: [0.04, 0, 0] },
      { t: 0.58, lf: [0.5, 0, 0.3], p: [0.6, 0.91, 0.5], hp: 0.34, r: [0.06, 0.1, 0] },
      // the boot goes under his hip
      { t: 0.8, p: [0.62, 0.9, 0.42], r: [-0.08, 0.25, 0], cp: 0.14, hp: 0.34, rf: [0.46, 0.08, 0.2], rfd: 0.22, rfp: 0.2, lh: ['a.chest', -0.36, -0.14, -0.06], rh: ['a.chest', 0.36, -0.14, -0.02] },
      { t: 0.98, p: [0.56, 0.94, 0.42], r: [-0.16, 0.3, 0], rf: [0.2, 0.34, 0.16], rfp: -0.2 },
      { t: 1.2, p: [0.52, 0.92, 0.34], r: [0, 0.2, 0], rf: [0.42, 0, 0.0], rfd: 0.22, rfp: 0, cp: 0.08 },
      // and over him
      { t: 1.56, lf: [-0.4, 0, -0.02], lfl: 0.42, lfd: 0.36, p: [0.02, 0.91, 0.02], r: [0.05, 0, 0], hp: 0.4, rf: [0.42, 0, 0.0], rh: ['a.chest', 0.27, -0.42, -0.04], lh: ['a.chest', -0.27, -0.4, -0.08] },
      { t: 1.72, rh: ['a.chest', 0.32, -0.14, -0.1], pto: ['a.chest', 0.6, 0.5, -0.3], cy: -0.18, hy: 0.08, cp: 0.04 },
      { t: 1.92, rh: ['a.chest', 0.38, 0.22, -0.12], pto: ['a.chest', 0.42, 1.2, 0.2], lh: ['a.chest', -0.1, 0.1, -0.3] },
      // up it goes, slowly
      { t: 2.24, p: [0, 0.915, 0.04], r: [-0.08, 0, 0], cp: -0.14, sp: -0.08, hp: 0.42, cy: -0.28, sy: -0.15, rh: ['a.chest', 0.14, 0.76, 0.1], pto: ['a.chest', 0.1, 1.6, 0.75], lh: ['a.chest', 0.03, 0.6, -0.1] },
      { t: 2.6, p: [0, 0.92, 0.06], cp: -0.17, r: [-0.1, 0, 0], rh: ['a.chest', 0.12, 0.78, 0.14], pto: ['a.chest', 0.05, 1.6, 0.85], cy: -0.3, sy: -0.16, sp: -0.09, lh: ['a.chest', 0.03, 0.62, -0.08] },
      // and down
      { t: 2.7, p: [0, 0.84, 0.02], r: [0.2, 0, 0], cp: 0.1, sp: 0.02, cy: -0.05, sy: -0.03, rh: ['a.chest', 0.16, 0.42, -0.42], pto: ['a.chest', 0.14, 0.9, -1.1], lh: ['a.chest', -0.02, 0.2, -0.3] },
      { t: 2.8, p: [0, 0.68, -0.12], r: [0.6, 0, 0], cp: 0.44, sp: 0.2, hp: 0.25, cy: 0.1, sy: 0.06, rh: ['v.chest', 0.02, 0.1, -0.26], pto: ['v.chest', 0, 0.06, 0.1], lh: ['a.chest', -0.1, -0.1, -0.44] },
      { t: 3.16, cp: 0.42, r: [0.56, 0, 0], p: [0, 0.7, -0.1], rh: ['v.chest', 0.02, 0.1, -0.26], pto: ['v.chest', 0, 0.06, 0.1], hp: 0.28 },
      { t: 3.44, p: [0, 0.84, 0], r: [0.14, 0, 0], cp: 0.1, sp: 0.02, cy: -0.05, sy: 0, rh: ['a.chest', 0.26, 0.1, -0.28], pto: ['a.chest', 0.42, 0.7, -0.7], lh: ['a.chest', -0.24, -0.2, -0.26] },
      { t: 3.8, rf: [0.42, 0, 0.42], lfd: 0.3, rfd: 0.3, p: [0, 0.9, 0.26], r: [0, 0, 0], rh: ['a.chest', 0.28, -0.32, -0.16], pto: ['a.chest', 0.42, -0.95, -0.7], cp: 0.08, hp: 0.3, lh: ['a.chest', -0.24, -0.36, -0.08] },
      { t: 4.1, lf: [-0.42, 0, 0.74], p: [0, 0.92, 0.56], cp: 0.06, hp: 0.28 },
      { t: 4.6, cp: 0, hp: 0.1 },
    ],
    v: [
      { t: 0, ...UPPER, ...onBelly(0, 0) },
      { t: 0.3, lh: [-0.36, 0.05, -0.9], cy: 0.14, rt: 0.08, hy: 0.1, p: [0, 0.175, -0.01] },
      { t: 0.62, rh: [0.38, 0.05, -0.9], lh: [-0.34, 0.05, -0.62], cy: -0.12, rt: -0.08, hy: -0.15, p: [0, 0.18, -0.08] },
      { t: 0.92, rt: 0, cy: 0, hy: -0.25, r: [1.5, 0, 0], p: [0, 0.17, -0.08], hp: -0.7, lfp: 1.35, rfp: 1.35, kl: 1, ka: 1, lf: [-0.2, 0, 0.76], rf: [0.2, 0, 0.78], lh: [-0.36, 0.05, -0.66], rh: [0.38, 0.05, -0.72] },
      // the boot sends him over
      { t: 1.14, rt: -1.57, p: [-0.06, 0.28, -0.08], hp: -0.2, hy: 0, cp: 0.1, ka: 1, lh: [-0.16, 0.08, -0.98], rh: [0.32, 0.5, -0.4], lf: [-0.1, 0.14, 0.76], rf: [0.12, 0.14, 0.72], lfy: -1.57, rfy: -1.57, lfp: 0, rfp: 0 },
      { t: 1.27, lh: [0.22, 0.06, -1.02], rh: [-0.25, 0.62, -0.24] },
      { t: 1.42, rt: -3.14, p: [-0.04, 0.17, -0.08], r: [1.48, 0, 0], hp: 0.2, hy: 0, cp: 0, lf: [0.22, 0, 0.72], rf: [-0.22, 0, 0.74], lfy: -3.14, rfy: -3.14, lfp: -1.1, rfp: -1.1, ka: 0.9, lh: [0.44, 0.06, -0.84], rh: [-0.52, 0.06, -0.34] },
      // he sees it coming: up on the elbows, then the hands up
      { t: 2.0, hp: 0.5, sp: 0.1, cp: 0.14, r: [1.34, 0, 0], p: [-0.04, 0.2, -0.08], ka: 0.9, lh: [0.52, 0.06, -0.34], rh: [-0.5, 0.06, -0.26], lf: [0.2, 0, 0.5], lfy: -3.14, lfp: -0.3, rf: [-0.2, 0, 0.6], rfy: -3.14, rfp: -0.7 },
      { t: 2.5, hp: 0.5, sp: 0.16, cp: 0.2, r: [1.28, 0, 0], p: [-0.04, 0.22, -0.08], lh: [0.16, 0.86, -0.42], rh: [-0.2, 0.84, -0.42], ka: 1 },
      { t: 2.76, hp: 0.5, sp: 0.16, cp: 0.2, r: [1.28, 0, 0], p: [-0.04, 0.22, -0.08], kt: 1, kh: 1, ka: 1, lh: [0.14, 0.88, -0.42], rh: [-0.18, 0.86, -0.42], kl: 1 },
      // it goes through the hands: the back hits the ground, the legs jump
      { t: 2.84, kt: 0.6, kh: 0.1, ka: 0, r: [1.48, 0, 0], p: [-0.04, 0.16, -0.08], sp: 0, cp: 0, hp: 0.1, },
      { t: 2.98, lf: [0.2, 0.2, 0.58], rf: [-0.2, 0.24, 0.62], lfy: -3.14, rfy: -3.14 },
      { t: 3.2, kt: 0.2, kh: 0, kl: 0.1, lf: [0.22, 0.03, 0.72], rf: [-0.22, 0.03, 0.74], lfy: -3.14, rfy: -3.14 },
      { t: 3.34, kt: 0, kl: 0 },
    ],
    vk: { hp: [[2.8, 7]], cp: [[2.8, 5]] },
    ak: { cp: [[2.8, 1.4]], hp: [[2.8, 1]] },
    push: [[2.82, [0, 1, 2], 0, -1.8, 0], [2.82, [10, 11, 13, 14], 0, -1, 0.3]],
    slow: [[2.8, 0.84, 0.12, 0.1, 0.32]],
    cam: [
      { t: 0, crop: 1, reach: 0.5, pos: [-1.0, 0.46, -1.6], look: [0.2, 0.62, 0.6], fov: 46 },
      { t: 1.0, crop: 1, pos: [-0.95, 0.42, -1.7], look: [0.1, 0.62, 0.2], fov: 46 },
      { t: 1.7, crop: 1, pos: [-0.3, 0.52, -2.05], look: [0, 0.98, 0.05], fov: 46 },
      { t: 2.5, crop: 1, pos: [0.6, 0.62, -2.2], look: [0, 1.25, 0.05], fov: 46 },
      { t: 2.85, crop: 1, pos: [0.65, 0.6, -2.0], look: [0, 0.8, -0.1], fov: 42 },
      { t: 3.6, crop: 1, pos: [1.0, 0.55, -1.75], look: [0, 0.62, -0.1], fov: 42 },
      { t: 4.3, pos: [1.35, 0.66, -1.55], look: [0, 0.74, 0.2], fov: 44 },
    ],
    events: [
      [0.3, 'drop'], [0.2, 'sfx', 'pouch', { vol: 0.5 }], [0.6, 'sfx', 'pouch', { vol: 0.5 }], [0.98, 'sfx', 'punch', { vol: 0.7, rate: 0.8 }], [1.42, 'sfx', 'thud', { vol: 0.8 }], [1.56, 'sfx', 'pouch', { vol: 0.5 }], [1.7, 'prop', 1], [1.72, 'sfx', 'chargeBack', { vol: 0.4, rate: 0.8 }], [2.68, 'sfx', 'swing', { vol: 1, rate: 0.6 }],
      [2.8, 'hit', 'v.chest', 0, 0.1, -0.18, 0, 1, 0.3, 1.5, 'stab'], [2.8, 'sfx', 'crack', { vol: 0.8, rate: 0.7 }], [2.86, 'kill', [0, -0.5, 0], 0.05, 'chest'], [2.9, 'thud'], [3.2, 'hit', 'v.chest', 0, 0.1, -0.18, 0, 0.9, 0.3, 0.8], [3.1, 'pool', 'v.chest', 0.9],
    ],
  },
  // ---------------------------------------------------------------------------
  // Three steps' run, then both knees on his back. Hands around the head, a sharp turn, quiet.
  // ---------------------------------------------------------------------------
  {
    name: 'SPRUNGKNIE', dur: 3.7, prone: true,
    a: [
      { t: 0, ...UPPER, ...stand(0, 3.0), ...relax('a'), r: [0.1, 0, 0] },
      { t: 0.16, lf: [-0.14, 0, 2.4], p: [0, 0.92, 2.62], r: [0.14, 0, 0], lfd: 0.16 },
      { t: 0.32, rf: [0.14, 0, 1.76], p: [0, 0.91, 2.06], r: [0.16, 0, 0], rfd: 0.16, lh: ['a.chest', -0.22, -0.2, -0.28], rh: ['a.chest', 0.22, -0.26, 0] },
      { t: 0.48, lf: [-0.12, 0, 1.2], p: [0, 0.86, 1.42], r: [0.18, 0, 0], lfd: 0.16 },
      // off the ground
      { t: 0.62, p: [0, 1.28, 0.9], r: [0.14, 0, 0], cp: 0.1, hp: 0.3, rf: [0.15, 0.5, 1.2], lf: [-0.15, 0.42, 1.26], rfp: 0.3, lfp: 0.5, lh: ['a.chest', -0.44, 0.14, -0.1], rh: ['a.chest', 0.44, 0.14, -0.1] },
      { t: 0.78, p: [0, 1.02, 0.34], r: [0.42, 0, 0], cp: 0.15, hp: 0.34, rf: [0.17, 0.6, 0.72], lf: [-0.17, 0.6, 0.72] },
      // on him
      { t: 0.88, p: [0, 0.66, 0.1], r: [0.82, 0, 0], cp: 0.28, sp: 0.1, hp: 0.25, rf: [0.17, 0.2, 0.34], lf: [-0.17, 0.2, 0.34], lh: ['a.chest', -0.3, -0.24, -0.3], rh: ['a.chest', 0.3, -0.24, -0.3] },
      { t: 1.14, p: [0, 0.62, -0.09], r: [1.05, 0, 0], cp: 0.25, sp: 0.12, lh: ['v.head', -0.11, 0.1, 0], rh: ['v.head', 0.1, 0.03, -0.08] },
      { t: 1.46, cy: -0.26, sy: -0.12, p: [0, 0.63, -0.09], lh: ['v.head', -0.11, 0.1, 0], rh: ['v.head', 0.1, 0.03, -0.08] },
      // the turn
      { t: 1.56, cy: 0.42, sy: 0.2, r: [1.08, 0, 0], lh: ['v.head', -0.11, 0.1, 0], rh: ['v.head', 0.1, 0.03, -0.08] },
      { t: 1.86, cy: 0.3, sy: 0.14, lh: ['v.head', -0.11, 0.1, 0], rh: ['v.head', 0.1, 0.03, -0.08] },
      { t: 2.14, cy: 0, sy: 0, r: [0.66, 0, 0], p: [0, 0.7, 0.14], cp: 0.12, lh: ['a.chest', -0.26, -0.3, -0.18], rh: ['a.chest', 0.26, -0.3, -0.16] },
      // up and off him, one foot at a time
      { t: 2.5, rf: [0.38, 0, 0.56], rfp: 0, p: [0.06, 0.78, 0.3], r: [0.3, 0, 0], rfd: 0.32 },
      { t: 2.82, lf: [-0.38, 0, 0.7], lfp: 0, p: [0, 0.88, 0.58], r: [0.08, 0, 0], lfd: 0.28, cp: 0.08, hp: 0.3 },
      { t: 3.26, ...stand(0, 0.78), lf: [-0.36, 0, 0.82], rf: [0.36, 0, 0.74], hp: 0.3, ...relax('a') },
      { t: 3.7, hp: 0.12, cp: 0 },
    ],
    v: [
      { t: 0, ...UPPER, ...onBelly(0, 0) },
      { t: 0.28, lh: [-0.36, 0.05, -0.9], cy: 0.14, rt: 0.08, hy: 0.1, p: [0, 0.175, -0.01] },
      { t: 0.6, rh: [0.38, 0.05, -0.92], lh: [-0.34, 0.05, -0.62], cy: -0.12, rt: -0.08, hy: -0.2, p: [0, 0.18, -0.08] },
      { t: 0.86, p: [0, 0.17, -0.08], rt: 0, cy: 0, hp: -0.85, hy: 0, cp: 0, sp: 0, ka: 1, lh: [-0.36, 0.05, -0.68], rh: [0.36, 0.05, -0.8] },
      // the air goes out of him, the legs jump
      { t: 0.94, p: [0, 0.135, -0.1], hp: -0.2, cp: 0.08, sp: 0.04, ka: 0.5, lf: [-0.2, 0.02, 0.76], rf: [0.2, 0.02, 0.78] },
      { t: 1.14, lf: [-0.18, 0.26, 0.68], rf: [0.2, 0.3, 0.64], lfp: 0.5, rfp: 0.5 },
      { t: 1.38, p: [0, 0.145, -0.1], hp: -0.7, ka: 0.8, lf: [-0.2, 0.03, 0.76], rf: [0.2, 0.03, 0.78], lfp: 1.2, rfp: 1.2 },
      { t: 1.46, hp: -0.85, hy: -0.46, cp: -0.1, lh: ['a.lhand', -0.05, -0.15, 0], rh: [0.4, 0.05, -0.6] },
      { t: 1.56, hy: 1.05, hp: -0.7, hz: 0.25, ka: 0.2, lh: [-0.42, 0.05, -0.56], rh: [0.42, 0.05, -0.6] },
      { t: 1.62, kh: 1, ka: 0, kt: 1, kl: 0.8 },
      { t: 2.1, kh: 1, hy: 1.05, hp: -0.5, hz: 0.25 },
      { t: 2.26, kh: 0.2, kt: 0.3, kl: 0.3, hp: -0.1 },
      { t: 2.42, kh: 0, kt: 0, kl: 0 },
    ],
    vk: { hp: [[0.9, 8]], cp: [[0.9, 6]], sp: [[0.9, 5]], hy: [[1.56, 6]] },
    ak: { cp: [[0.9, 1.8]], sp: [[0.9, 1.2]], hp: [[0.9, 1]] },
    slow: [[0.88, 0.84, 0.1, 0.05, 0.25], [1.56, 0.84, 0.08, 0.08, 0.24]],
    cam: [
      { t: 0, crop: 1, pos: [1.5, 0.42, -0.95], look: [-0.1, 0.72, 0.8], fov: 48 },
      { t: 0.7, crop: 1, pos: [1.55, 0.4, -0.9], look: [-0.05, 0.72, 0.28], fov: 48 },
      { t: 1.2, crop: 1, pos: [1.35, 0.42, -1.1], look: [0, 0.56, -0.2], fov: 42 },
      { t: 1.65, crop: 1, pos: [1.0, 0.42, -1.3], look: ['@v.head', 0, 0.05, 0], fov: 38 },
      { t: 2.4, crop: 1, pos: [1.35, 0.55, -1.0], look: [0, 0.52, -0.1], fov: 42 },
      { t: 3.4, pos: [1.85, 0.75, -0.55], look: [0, 0.68, 0.35], fov: 44 },
    ],
    events: [
      [0.3, 'drop'], [0.16, 'sfx', 'pouch', { vol: 0.5, rate: 1.2 }], [0.32, 'sfx', 'pouch', { vol: 0.5, rate: 1.2 }], [0.48, 'sfx', 'pouch', { vol: 0.6, rate: 1 }], [0.88, 'hit', 'v.chest', 0, -0.1, 0.16, 0, 0.6, 0.2, 0.4, 'punch'], [0.89, 'sfx', 'thud', { vol: 1, rate: 0.9 }],
      [1.16, 'sfx', 'pouch', { vol: 0.7, rate: 0.9 }], [1.56, 'sfx', 'crack', { vol: 1 }], [1.62, 'kill', [0, -0.1, 0], 0.05, 'head'], [2.42, 'thud'],
    ],
  },
  // ---------------------------------------------------------------------------
  // Nothing fancy. He comes up behind him with the gun at the shoulder and puts it into his back while he crawls. One for the head.
  // ---------------------------------------------------------------------------
  {
    name: 'GNADENSCHUSS', dur: 3.9, gun: 'own', prone: true,
    a: [
      { t: 0, ...UPPER, ...stand(0.62, 1.95, 0.22), ...relax('a'), gun: 1, two: 1, gat: ['a.chest', 0.14, -0.1, -0.24], gaim: ['v.chest', 0, 0.1, 0] },
      { t: 0.18, lf: [0.46, 0, 1.56], p: [0.6, 0.925, 1.72], gat: ['a.chest', 0.14, -0.06, -0.26] },
      { t: 0.38, rf: [0.76, 0, 1.2], p: [0.6, 0.915, 1.36], r: [0.04, 0.2, 0], hp: 0.2 },
      { t: 0.6, lf: [0.5, 0, 0.84], p: [0.6, 0.9, 1.0], r: [0.06, 0.24, 0], hp: 0.3, gat: ['a.chest', 0.12, 0.02, -0.28], cp: 0.1 },
      { t: 0.86, p: [0.58, 0.88, 0.98], r: [0.1, 0.26, 0], cp: 0.2, hp: 0.36, gat: ['a.chest', 0.11, 0.1, -0.27], gaim: ['v.chest', 0, 0.12, 0] },
      { t: 1.3, gat: ['a.chest', 0.11, 0.12, -0.27], gaim: ['v.chest', 0, 0.12, 0], cp: 0.2, r: [0.1, 0.26, 0], p: [0.58, 0.88, 0.98] },
      { t: 1.68, rf: [0.78, 0, 1.14], rfd: 0.26 },
      { t: 2.08, gaim: ['v.chest', 0.04, 0.08, 0] },
      // the last one, a step closer
      { t: 2.36, lf: [0.42, 0, 0.5], p: [0.5, 0.84, 0.68], r: [0.22, 0.3, 0], cp: 0.25, hp: 0.4, gat: ['a.chest', 0.11, 0.12, -0.3], gaim: ['v.head', 0, 0.08, 0], lfd: 0.28 },
      { t: 2.66, gaim: ['v.head', 0, 0.08, 0], p: [0.5, 0.84, 0.68] },
      { t: 3.04, p: [0.54, 0.9, 0.76], r: [0.04, 0.26, 0], cp: 0.1, hp: 0.3, gat: ['a.chest', 0.14, -0.12, -0.22], gaim: ['a.chest', 0.3, -0.7, -1.2] },
      { t: 3.9, cp: 0.02, hp: 0.14, gat: ['a.chest', 0.14, -0.16, -0.2], gaim: ['a.chest', 0.34, -0.9, -1] },
    ],
    v: [
      { t: 0, ...UPPER, ...onBelly(0, 0) },
      // he keeps crawling, looking back over his shoulder
      { t: 0.3, lh: [-0.36, 0.05, -0.9], cy: 0.14, rt: 0.08, hy: 0.1, p: [0, 0.175, -0.01] },
      { t: 0.62, rh: [0.38, 0.05, -0.92], lh: [-0.34, 0.05, -0.62], cy: -0.12, rt: -0.08, hy: -0.2, p: [0, 0.18, -0.09], hp: -1.0 },
      { t: 0.96, lh: [-0.38, 0.05, -0.9], rh: [0.34, 0.05, -0.64], cy: 0.14, rt: 0.08, hy: -0.6, p: [0, 0.18, -0.18], hp: -1.05, cp: -0.06 },
      { t: 1.3, cy: -0.1, rt: -0.06, hy: -0.8, p: [0, 0.18, -0.24], hp: -1.05, ka: 0.9, kt: 1 },
      // it hits him: each one presses him down, the legs kick
      { t: 1.42, ka: 0.6, lf: [-0.2, 0.02, 0.6], rf: [0.2, 0.02, 0.62], rt: 0, cy: 0 },
      { t: 1.62, lf: [-0.18, 0.26, 0.48], rf: [0.2, 0.16, 0.54], lfp: 0.5, rfp: 0.8 },
      { t: 1.84, lf: [-0.2, 0.1, 0.56], rf: [0.2, 0.28, 0.46], lfp: 0.9, rfp: 0.5 },
      { t: 2.08, hp: -0.8, hy: -0.5, cp: 0, kh: 1, kt: 1, ka: 0.3, kl: 0.8, lf: [-0.2, 0.03, 0.6], rf: [0.2, 0.03, 0.62], lfp: 1.2, rfp: 1.2 },
      { t: 2.36, hp: -0.72, hy: -0.4, ka: 0.1, kl: 0.5 },
      { t: 2.66, kh: 1, kt: 0.8 },
      { t: 2.7, kh: 0, kt: 0.1, ka: 0, kl: 0.1 },
      { t: 2.82, kt: 0, kl: 0 },
    ],
    vk: { cp: [[1.4, 2.5], [1.58, 3], [1.76, 3], [1.96, 3.5]], sp: [[1.4, 1.5], [1.58, 1.5], [1.76, 1.5], [1.96, 2]], hp: [[1.4, 3], [1.58, 3], [1.76, 3], [1.96, 4], [2.66, 10]] },
    ak: { cp: [[1.4, -0.9], [1.58, -0.9], [1.76, -0.9], [1.96, -0.9], [2.66, -1.1]], sp: [[1.4, -0.4], [1.58, -0.4], [1.76, -0.4], [1.96, -0.4], [2.66, -0.5]] },
    slow: [[2.66, 0.84, 0.14, 0.1, 0.28]],
    cam: [
      { t: 0, crop: 1, pos: [-1.35, 0.34, -1.7], look: [0.25, 0.62, 0.6], fov: 46 },
      { t: 0.9, crop: 1, pos: [-1.2, 0.3, -1.85], look: [0.25, 0.66, 0.4], fov: 46 },
      { t: 1.8, crop: 1, pos: [-1.0, 0.3, -1.95], look: [0.22, 0.68, 0.3], fov: 44 },
      { t: 2.7, crop: 1, pos: [-0.8, 0.3, -1.9], look: [0.18, 0.64, 0.1], fov: 42 },
      { t: 3.6, pos: [-0.8, 0.45, -2.1], look: [0.3, 0.75, 0.4], fov: 44 },
    ],
    events: [
      [0.3, 'drop'], [0.2, 'sfx', 'pouch', { vol: 0.5 }], [0.6, 'sfx', 'pouch', { vol: 0.5 }],
      [1.4, 'shot', 'v.chest', 0.02, 0.1, 0.17, 0, 0.5, 0.2, 1.3], [1.58, 'shot', 'v.chest', -0.05, 0.02, 0.17, 0, 0.5, 0.2, 1.3], [1.76, 'shot', 'v.chest', 0.06, 0.16, 0.17, 0, 0.5, 0.2, 1.3], [1.96, 'shot', 'v.chest', 0, 0.06, 0.17, 0, 0.6, 0.2, 1.5],
      [2.66, 'shot', 'v.head', 0, 0.1, 0.06, 0, -0.4, 0.5, 2.0], [2.8, 'kill', [0, -0.3, 0], 0.05, 'head'], [2.9, 'pool', 'v.chest', 0.9],
    ],
  },
  // ---------------------------------------------------------------------------
  // Over him in one stride. He gets up onto hands and knees and onto his knees, right into it: the blade with the whole body behind it.
  // ---------------------------------------------------------------------------
  {
    name: 'DURCHSTOSS', dur: 4.8, prop: 'knife', prone: true,
    a: [
      { t: 0, ...UPPER, ...stand(0.56, 1.5), ...relax('a'), r: [0.06, 0, 0] },
      { t: 0.18, lf: [0.42, 0, 1.08], p: [0.58, 0.92, 1.24] },
      { t: 0.38, rf: [0.72, 0, 0.62], p: [0.58, 0.92, 0.82], r: [0.06, 0.15, 0], hp: 0.18 },
      { t: 0.6, lf: [0.5, 0, 0.1], p: [0.6, 0.9, 0.3], r: [0.08, 0.6, 0], hp: 0.25 },
      { t: 0.82, rf: [0.56, 0, -0.5], p: [0.55, 0.92, -0.26], r: [0.05, 1.5, 0], hp: 0.28, rfy: 2.4, rfd: 0.28 },
      // around in front of him, turning
      { t: 1.06, lf: [0.26, 0, -1.02], lfy: 3.14, lfd: 0.28, p: [0.28, 0.92, -0.86], r: [0.08, 2.5, 0], hp: 0.3 },
      { t: 1.32, rf: [0.16, 0, -1.18], rfy: 3.14, rfd: 0.26, p: [0.1, 0.92, -1.08], r: [0.1, 3.14, 0], hp: 0.3, lf: [-0.16, 0, -1.02], lfd: 0.24, lfy: 3.14 },
      // he waits for him to come up: the left hand into the vest
      { t: 1.82, p: [0.04, 0.9, -1.02], r: [0.2, 3.14, 0], cp: 0.1, hp: 0.25, lh: ['a.chest', -0.26, -0.1, -0.34], rh: ['a.chest', 0.3, -0.2, -0.1] },
      { t: 2.1, p: [0.02, 0.86, -0.94], r: [0.34, 3.14, 0], lh: ['v.chest', 0, 0.16, -0.18], rh: ['a.pelvis', 0.2, 0.02, 0.12], pto: ['a.pelvis', 0.2, 0.4, -0.3], cp: 0.14 },
      // the wind-up: hips and shoulder go back, the weight onto the rear foot
      { t: 2.46, p: [0.04, 0.85, -1.04], r: [0.1, 2.86, 0], cy: -0.46, sy: -0.24, cp: 0.04, hp: 0.14, hy: 0.25, lh: ['v.chest', 0, 0.16, -0.18], rh: ['a.chest', 0.46, -0.1, 0.2], pto: ['v.chest', 0, 0.06, -0.3] },
      { t: 2.64, cy: -0.5, sy: -0.26, rh: ['a.chest', 0.46, -0.08, 0.22], pto: ['v.chest', 0, 0.06, -0.3], lh: ['v.chest', 0, 0.16, -0.18], rf: [0.16, 0, -1.26] },
      // and through
      { t: 2.8, p: [0, 0.8, -0.76], r: [0.36, 3.34, 0], cy: 0.42, sy: 0.24, cp: 0.2, hp: 0.15, hy: -0.1, lf: [-0.14, 0, -0.74], lfd: 0.16, rfp: 0.5, lh: ['v.chest', 0, 0.16, -0.18], rh: ['v.chest', 0.04, 0.05, -0.22], pto: ['v.chest', 0, 0.03, 0.14] },
      { t: 3.2, p: [0, 0.8, -0.76], r: [0.32, 3.3, 0], cy: 0.36, sy: 0.2, rh: ['v.chest', 0.04, 0.05, -0.22], pto: ['v.chest', 0, 0.03, 0.14], lh: ['v.chest', 0, 0.16, -0.18] },
      // the blade out, and the hand lets him go
      { t: 3.5, p: [0, 0.86, -0.92], r: [0.12, 3.14, 0], cy: 0, sy: 0, cp: 0.1, hp: 0.3, hy: 0, rfp: 0, rh: ['a.chest', 0.3, -0.06, -0.2], pto: ['a.chest', 0.45, 0.2, -0.7], lh: ['a.chest', -0.26, -0.2, -0.28] },
      { t: 4.1, ...stand(0, -0.98, 3.14), lf: [-0.15, 0, -0.84], rf: [0.17, 0, -1.08], cp: 0.08, hp: 0.3, ...relax('a'), rh: ['a.chest', 0.26, -0.34, -0.16], pto: ['a.chest', 0.4, -0.95, -0.4] },
      { t: 4.8, cp: 0, hp: 0.1 },
    ],
    v: [
      { t: 0, ...UPPER, ...onBelly(0, 0) },
      { t: 0.28, lh: [-0.36, 0.05, -0.86], cy: 0.12, rt: 0.06, hy: 0.15, p: [0, 0.175, -0.01] },
      // the hands under the shoulders, he pushes himself up
      { t: 0.62, lh: [-0.3, 0.05, -0.64], rh: [0.3, 0.05, -0.66], cy: 0, rt: 0, hy: 0.1, hp: -0.95, p: [0, 0.2, -0.02], r: [1.42, 0, 0], cp: -0.05 },
      { t: 1.02, p: [0, 0.38, 0], r: [1.2, 0, 0], sp: -0.04, cp: -0.1, hp: -0.9, lh: [-0.28, 0.05, -0.68], rh: [0.28, 0.05, -0.7], lf: [-0.2, 0, 0.72], rf: [0.2, 0, 0.74], lfl: 0, rfl: 0, lfd: 0.34, rfd: 0.34 },
      { t: 1.36, p: [0, 0.5, 0.02], r: [1.22, 0, 0], cp: -0.05, hp: -0.85, lf: [-0.17, 0, 0.54], rf: [0.17, 0, 0.56], lfl: 0, rfl: 0, lfd: 0.34, rfd: 0.34, lh: [-0.26, 0.05, -0.62], rh: [0.26, 0.05, -0.64] },
      // he looks up at him, one hand off the ground
      { t: 1.72, p: [0, 0.52, 0.02], r: [1.04, 0, 0], hp: -0.72, cp: -0.1, rh: [0.3, 0.05, -0.56], lh: [-0.28, 0.26, -0.6] },
      // up onto his knees by the vest
      { t: 2.22, p: [0, 0.54, 0], r: [0.16, 0, 0], sp: 0, cp: -0.05, hp: -0.3, lh: ['a.lhand', -0.05, -0.16, 0], rh: ['v.chest', 0.3, -0.16, -0.24], lf: [-0.17, 0, 0.56], rf: [0.17, 0, 0.58] },
      { t: 2.74, p: [0, 0.54, 0], r: [0.1, 0, 0], hp: -0.35, cp: -0.08, lh: ['a.lhand', -0.05, -0.16, 0], rh: ['v.chest', 0.34, -0.1, -0.2] },
      // it lifts him a little, and he hangs on it
      { t: 2.86, p: [0, 0.6, 0.08], r: [-0.04, 0, 0], sp: 0.14, cp: 0.24, hp: 0.28, ka: 0.4, lh: ['v.chest', -0.26, -0.2, -0.2], rh: ['v.chest', 0.28, -0.2, -0.22] },
      { t: 3.24, p: [0, 0.58, 0.06], r: [0.02, 0, 0], sp: 0.16, cp: 0.26, hp: 0.22, ka: 0.25 },
      // and over backward when the hand opens
      { t: 3.52, p: [0, 0.54, 0.06], r: [-0.1, 0, 0], kh: 0.4, ka: 0, kt: 1, kl: 1 },
      ...fallBack(3.56, 0, 0.06, 0, { d: 0.46, T: 0.85, kneeling: true }),
    ],
    ak: { cp: [[2.8, 1.5]], sp: [[2.8, 0.8]] },
    vk: { hp: [[2.8, 5]], cp: [[2.8, 4]] },
    push: [[3.54, [1, 2, 3], 0, 0, 2.2], [3.54, [0], 0, 0, 0.8]],
    slow: [[2.8, 0.84, 0.14, 0.1, 0.34]],
    cam: [
      { t: 0, crop: 1, pos: [-1.5, 0.5, 0.2], look: [0.2, 0.72, 0.2], fov: 48 },
      { t: 0.8, crop: 1, pos: [-1.55, 0.42, -0.3], look: [0.16, 0.74, -0.3], fov: 48 },
      { t: 1.5, crop: 1, pos: [-1.6, 0.46, -0.4], look: [0, 0.72, -0.5], fov: 46 },
      { t: 2.3, crop: 1, pos: [-1.35, 0.62, -0.32], look: [0, 0.9, -0.42], fov: 40 },
      { t: 2.85, crop: 1, pos: [-1.05, 0.62, -0.5], look: [0, 0.88, -0.34], fov: 36 },
      { t: 3.6, crop: 1, pos: [-1.6, 0.6, -0.3], look: [0, 0.66, -0.3], fov: 40 },
      { t: 4.5, pos: [-2.0, 0.8, -0.2], look: [0, 0.72, -0.5], fov: 44 },
    ],
    events: [
      [0.3, 'drop'], [0.2, 'sfx', 'pouch', { vol: 0.5 }], [0.6, 'sfx', 'pouch', { vol: 0.5 }], [1.06, 'sfx', 'pouch', { vol: 0.5 }], [2.1, 'sfx', 'pouch', { vol: 0.9, rate: 0.8 }], [2.2, 'prop', 1], [2.22, 'sfx', 'chargeBack', { vol: 0.4, rate: 1.5 }],
      [2.68, 'sfx', 'swing', { vol: 1, rate: 0.95 }], [2.8, 'hit', 'v.chest', 0, 0.05, -0.18, 0, 0.3, 0.9, 2.0, 'stab'], [2.8, 'sfx', 'punch', { vol: 0.8 }], [2.82, 'spurt', 0.5], [3.5, 'sfx', 'stab', { vol: 0.5, rate: 0.8 }], [3.6, 'kill', [0, 0, 1], 0.6, 'chest'], [4.0, 'thud'], [4.05, 'pool', 'v.chest', 0.9],
    ],
  },
  // ---------------------------------------------------------------------------
  // He gets up on all fours and crawls for it, and comes around on one knee when he hears you. The whole belt from the hip, until he goes over backward.
  // ---------------------------------------------------------------------------
  {
    name: 'VOLLES MAGAZIN', dur: 4.6, gun: 'lmg', prone: true,
    a: [
      { t: 0, ...UPPER, ...stand(0.2, 2.35, -0.12), ...relax('a'), gun: 1, two: 1, gat: ['a.chest', 0.15, -0.3, -0.16], gaim: ['a.chest', 0, -0.85, -1.25], hp: 0.25 },
      { t: 0.32, lf: [0.06, 0, 1.96], p: [0.2, 0.925, 2.02], lfd: 0.32 },
      { t: 0.68, rf: [0.36, 0, 1.62], p: [0.2, 0.92, 1.68], rfd: 0.34, r: [0.04, -0.14, 0] },
      { t: 1.04, lf: [0.04, 0, 1.24], p: [0.2, 0.915, 1.38], lfd: 0.34, gat: ['a.chest', 0.15, -0.28, -0.18], gaim: ['v.pelvis', 0, 0, 0], hp: 0.3 },
      // set: the left foot forward, the hips turned away, the butt against the hip
      { t: 1.42, rf: [0.42, 0, 1.52], rfd: 0.3, p: [0.22, 0.89, 1.32], r: [0.06, -0.4, 0], cy: 0.22, sy: 0.12, hy: 0.06, hp: 0.22, gat: ['a.chest', 0.13, -0.25, -0.22], gaim: ['v.chest', 0, 0.02, 0] },
      { t: 1.85, gat: ['a.chest', 0.13, -0.24, -0.23], gaim: ['v.chest', 0, 0.06, 0], cp: 0.06 },
      { t: 2.14, rf: [0.44, 0, 1.58], rfd: 0.24 },
      // it climbs
      { t: 2.45, gat: ['a.chest', 0.13, -0.22, -0.22], gaim: ['v.chest', 0, 0.14, 0], p: [0.22, 0.885, 1.35], r: [0.03, -0.4, 0] },
      { t: 2.62, lf: [0.06, 0, 1.3], lfd: 0.24 },
      { t: 2.85, gat: ['a.chest', 0.13, -0.2, -0.22], gaim: [-0.1, 0.9, -0.5], hp: 0.15 },
      { t: 3.08, gat: ['a.chest', 0.13, -0.2, -0.22], gaim: [-0.1, 1.05, -0.6], p: [0.22, 0.885, 1.37], r: [0, -0.4, 0], two: 1 },
      // done: the left hand lets go, the gun sinks with the right
      { t: 3.42, gat: ['a.chest', 0.2, -0.34, -0.1], gaim: ['a.chest', 0.55, -0.6, -1.0], two: 0, lh: ['a.chest', -0.27, -0.42, -0.08], hp: 0.3, p: [0.22, 0.9, 1.34], r: [0.03, -0.35, 0], cy: 0.12, sy: 0.06 },
      { t: 4.6, gat: ['a.chest', 0.22, -0.36, -0.08], gaim: ['a.chest', 0.6, -0.8, -0.9], hp: 0.2, r: [0.02, -0.3, 0], cy: 0.08, sy: 0.04 },
    ],
    v: [
      { t: 0, ...UPPER, ...onBelly(0, 0), lh: [-0.56, 0.06, -0.58], rh: [0.56, 0.06, -0.56] },
      // the hands come in under the shoulders
      { t: 0.24, lh: [-0.34, 0.05, -0.72], rh: [0.34, 0.05, -0.72], hp: -0.95, p: [0, 0.18, -0.01] },
      // up, the knees after him
      { t: 0.5, p: [0, 0.3, -0.04], r: [1.38, 0, 0], cp: -0.06, lf: [-0.19, 0, 0.7], rf: [0.19, 0, 0.72], lfl: 0, rfl: 0, lfd: 0.28, rfd: 0.28 },
      { t: 0.76, p: [0, 0.5, -0.07], r: [1.24, 0, 0], sp: -0.04, cp: -0.06, hp: -0.88, lf: [-0.17, 0, 0.46], rf: [0.17, 0, 0.48], lfl: 0, rfl: 0, lfd: 0.26, rfd: 0.26, lh: [-0.27, 0.05, -0.75], rh: [0.27, 0.05, -0.76] },
      // and away: hand and knee, hand and knee
      { t: 1.0, p: [0.01, 0.5, -0.2], r: [1.2, 0.05, 0.03], cy: -0.1, rh: [0.27, 0.05, -0.92], lf: [-0.17, 0, 0.3], lfl: 0.02, lfd: 0.24 },
      { t: 1.22, p: [-0.01, 0.51, -0.34], r: [1.16, 0.1, -0.03], cy: 0.12, lh: [-0.29, 0.05, -1.06], rf: [0.17, 0, 0.16], rfl: 0.02, rfd: 0.24, hy: 0.4, hp: -0.72 },
      // he looks back, and comes around on the right knee
      { t: 1.42, p: [-0.03, 0.52, -0.38], r: [0.98, 0.85, 0], cy: 0.25, sy: 0.12, hy: 0.55, hp: -0.4, rf: [0.42, 0.08, 0.02], rfy: 0.9, rfp: 0.6, lh: [-0.62, 0.34, -0.72], rh: [-0.06, 0.14, -0.92] },
      { t: 1.62, p: [-0.05, 0.56, -0.4], r: [0.52, 1.95, 0], cy: 0.18, sy: 0.08, cp: 0.05, hy: 0.25, hp: -0.3, lf: [-0.12, 0.1, 0.3], lfy: 1.6, lfp: 0, rf: [0.42, 0.08, -0.62], rfy: 2.1, rfp: 0.9, lh: [-0.62, 0.84, -0.12], rh: [-0.38, 0.46, -0.78] },
      // on one knee, and he sees it
      { t: 1.84, ...oneKnee(-0.05, -0.38, 3.26), r: [0.06, 3.26, 0], cy: 0, sy: 0, cp: 0, hy: 0, hp: -0.12, lfy: 3.26, rfy: 3.26, lh: ['v.chest', -0.2, 0, -0.46], rh: ['v.chest', 0.34, -0.18, -0.26] },
      // each one hits him: he folds, comes up again, the arms give out
      { t: 2.0, hp: -0.25, j: 0.25, lh: ['v.chest', -0.32, -0.18, -0.3], rh: ['v.chest', 0.34, -0.26, -0.2] },
      { t: 2.26, r: [0.42, 3.26, 0.14], sp: 0.16, cp: 0.22, hp: 0.25, hz: 0.12, ka: 0.8, lh: [0.36, 0.14, -0.1], rh: ['v.chest', 0.3, -0.36, -0.14] },
      { t: 2.52, r: [0.02, 3.26, -0.06], p: [-0.05, 0.58, -0.4], sp: -0.02, cp: -0.1, hp: -0.12, hy: 0.22, hz: 0.24, ka: 0.6, lh: ['v.chest', -0.3, -0.38, -0.1], rh: ['v.chest', 0.3, -0.38, -0.1] },
      { t: 2.76, r: [-0.38, 3.26, 0], p: [-0.05, 0.57, -0.46], sp: -0.12, cp: -0.24, hp: -0.42, hy: 0.1, hz: 0.1, ka: 0.7, kl: 0.8, lh: ['v.chest', -0.52, 0.2, 0.02], rh: ['v.chest', 0.52, 0.16, 0.04] },
      // and over, the arms go up by themselves
      { t: 2.92, r: [-0.72, 3.26, 0], p: [-0.05, 0.54, -0.54], kt: 1, kh: 0.5, ka: 0.3, j: 0, lh: ['v.chest', -0.5, 0.42, 0.1], rh: ['v.chest', 0.5, 0.38, 0.1] },
      ...fallBack(2.98, -0.05, -0.54, 3.26, { d: 0.5, T: 0.82, kneeling: true, lean: -0.72 }),
    ],
    vk: {
      cp: burst(1.85, 15, 0.085, (t, i) => [t, i < 6 ? 1.6 : -2.6]),
      sp: burst(1.85, 15, 0.085, (t, i) => [t, i < 6 ? 0.8 : -1.2]),
      hp: burst(1.85, 15, 0.085, (t, i) => [t, i % 2 ? 3 : -3.5]),
      cy: burst(1.85, 15, 0.085, (t, i) => [t, i % 2 ? 1.5 : -1.5]),
    },
    ak: {
      cp: burst(1.85, 15, 0.085, (t) => [t, -0.75]),
      sp: burst(1.85, 15, 0.085, (t) => [t, -0.3]),
      hp: burst(1.85, 15, 0.085, (t) => [t, -0.45]),
      cy: burst(1.85, 15, 0.085, (t, i) => [t, i % 2 ? 0.5 : -0.5]),
    },
    push: [[2.96, [1, 2, 3], 0, 0.3, -2.0], [2.96, [10, 11, 12, 13, 14, 15], 0, 1.0, -1.0], [2.96, [0], 0, 0, -0.6]],
    cam: [
      { t: 0, crop: 2, pos: [1.1, 1.5, 2.65], look: [-0.1, 0.6, 0.2], fov: 46 },
      { t: 0.8, crop: 2, pos: [1.3, 1.42, 2.3], look: [-0.2, 0.85, 0.2], fov: 44 },
      { t: 1.4, crop: 2, pos: [1.45, 1.38, 1.88], look: [-0.16, 1.25, 0.45], fov: 42 },
      { t: 1.9, crop: 2, pos: [1.48, 1.38, 1.68], look: [-0.14, 1.42, 0.52], fov: 40 },
      { t: 2.6, crop: 2, pos: [1.3, 1.42, 1.6], look: [-0.2, 1.34, 0.5], fov: 42 },
      { t: 3.1, crop: 2, pos: [1.25, 1.45, 1.55], look: [-0.2, 1.08, 0.2], fov: 44 },
      { t: 3.5, crop: 2, pos: [1.3, 1.45, 1.25], look: [-0.2, 0.6, -0.6], fov: 42 },
      { t: 3.95, crop: 2, pos: [1.4, 1.42, 0.8], look: [-0.1, 0.35, -1.0], fov: 42 },
    ],
    events: [
      [0.2, 'sfx', 'pouch', { vol: 0.5 }], [0.3, 'drop'], [0.62, 'sfx', 'pouch', { vol: 0.5 }], [1.0, 'sfx', 'pouch', { vol: 0.4, rate: 1.2 }], [1.3, 'sfx', 'chargeBack', { vol: 0.7, rate: 0.9 }], [1.84, 'sfx', 'thud', { vol: 0.4, rate: 1.3 }],
      ...burst(1.85, 15, 0.085, (t, i) => [t, 'shot', i % 4 === 3 ? 'v.pelvis' : 'v.chest', [0.04, -0.09, 0.1, -0.03, 0.12][i % 5], i % 4 === 3 ? 0.02 : [0.1, -0.06, 0.2, 0.02][i % 4], i % 4 === 3 ? -0.13 : -0.19, 0, 0.3, 0.9, 0.7, 0.55]),
      [3.0, 'kill', [0, 0.1, -1], 0.6, 'chest'], [3.46, 'thud'], [3.52, 'slam', 'v.chest', 0.5], [3.6, 'pool', 'v.chest', 0.9],
    ],
  },
  // ---------------------------------------------------------------------------
  // BLICKED UP. A hand on his shoulder, an arm across his chest, doubled over and swung around chest to chest. The pistol from the holster: neck, ribs, belly. A shove, and one for the road.
  // ---------------------------------------------------------------------------
  {
    name: 'BLICKED UP', dur: 5.1, gun: 'pistol', front: 1.75,
    a: [
      { t: 0, ...UPPER, ...stand(0, 0.95), ...relax('a'), gun: 0, gat: ['a.pelvis', 0.22, -0.08, -0.06], gaim: ['a.pelvis', 0.22, -0.6, -0.4] },
      { t: 0.14, lf: [-0.14, 0, 0.62], p: [0, 0.925, 0.76] },
      // the left hand on his shoulder
      { t: 0.3, rf: [0.15, 0, 0.74], p: [0, 0.91, 0.6], r: [0.08, 0, 0], hp: 0.1, lh: ['v.chest', -0.2, 0.16, 0.06] },
      // across his chest, and he is pulled in
      { t: 0.62, p: [0.02, 0.88, 0.5], r: [0.14, 0.1, 0], cy: 0.16, sy: 0.08, hp: 0.2, lh: ['v.chest', 0.12, 0.08, -0.18], lf: [-0.16, 0, 0.42], lfd: 0.24 },
      // down with him, the hand goes for the holster
      { t: 0.95, p: [0.04, 0.86, 0.56], r: [0.24, 0.3, 0], cy: 0.12, cp: 0.1, sp: 0.04, hp: 0.3, lh: ['v.chest', 0, 0.12, 0.2], rh: ['a.pelvis', 0.22, -0.08, -0.06] },
      { t: 1.08, gun: 1, gat: ['a.pelvis', 0.22, -0.08, -0.06], gaim: ['a.pelvis', 0.22, -0.6, -0.4] },
      { t: 1.3, p: [0.06, 0.88, 0.6], r: [0.26, 0.15, 0], cy: 0, cp: 0.12, hp: 0.34, lh: ['v.chest', 0.1, 0.2, 0.14], gat: ['a.pelvis', 0.26, 0.02, -0.08], gaim: ['a.pelvis', 0.5, -0.2, -1.0] },
      // he comes up in front of him, chest to chest, the arm around his back
      { t: 1.65, p: [0.04, 0.9, 0.66], r: [0.08, 0, 0], cp: 0.06, hp: 0.3, lh: ['v.chest', 0.14, 0.1, 0.17], rf: [0.17, 0, 0.84], rfd: 0.28, gat: ['a.chest', 0.32, -0.2, -0.1], gaim: ['a.chest', 0.3, -0.1, -1.0] },
      { t: 1.98, gat: ['a.chest', 0.34, -0.06, -0.14], gaim: ['v.chest', -0.12, 0.1, 0], lh: ['v.chest', 0.14, 0.1, 0.17] },
      { t: 2.3, p: [0.06, 0.885, 0.68], r: [0.11, 0.06, 0] },
      // the muzzle in his neck
      { t: 2.36, gat: ['a.chest', 0.26, 0.02, -0.26], gaim: ['v.head', 0, -0.12, 0], cy: -0.12, sy: -0.06, hp: 0.38, hy: 0.15, lh: ['v.chest', 0.14, 0.1, 0.17] },
      { t: 2.6, gat: ['a.chest', 0.26, 0.02, -0.27], gaim: ['v.head', 0, -0.12, 0] },
      { t: 2.74, p: [0.02, 0.89, 0.64], r: [0.04, -0.05, 0] },
      // ribs
      { t: 2.86, gat: ['a.chest', 0.28, -0.16, -0.26], gaim: ['v.chest', 0.1, 0, 0], cy: 0, sy: 0, hp: 0.34, hy: 0.05 },
      // belly
      { t: 3.14, gat: ['a.chest', 0.26, -0.3, -0.28], gaim: ['v.pelvis', 0.05, 0.1, 0], cy: 0.06, hp: 0.4 },
      // he sags, the elbow comes up to hold him
      { t: 3.56, gat: ['a.chest', 0.28, -0.28, -0.22], gaim: ['v.pelvis', 0.05, 0.1, 0], lh: ['v.chest', 0.18, 0.24, 0.04], cp: 0.02, p: [0.04, 0.9, 0.7] },
      // the shove
      { t: 3.84, p: [0.04, 0.9, 0.76], r: [-0.02, 0, 0], cp: 0, cy: 0.2, sy: 0.1, hp: 0.22, rf: [0.2, 0, 1.0], rfd: 0.24, lh: ['a.chest', -0.2, 0.08, -0.56], gat: ['a.chest', 0.2, 0.06, -0.4], gaim: ['v.chest', 0, 0.05, 0] },
      { t: 4.12, gat: ['a.chest', 0.17, 0.08, -0.46], gaim: ['v.chest', 0, 0.1, 0], lh: ['a.chest', -0.34, -0.12, -0.3] },
      { t: 4.22, gat: ['a.chest', 0.17, 0.14, -0.42], gaim: ['a.chest', 0.15, 0.7, -1.2] },
      // and he turns away from it
      { t: 4.5, gat: ['a.chest', 0.24, -0.24, -0.16], gaim: ['a.chest', 0.4, -0.7, -1.0], lh: ['a.chest', -0.26, -0.4, -0.08], cy: -0.1, sy: -0.05, hp: 0.15, hy: -0.2, r: [0, -0.5, 0], lf: [-0.1, 0, 0.5], lfd: 0.34 },
      { t: 5.1, gat: ['a.chest', 0.24, -0.34, -0.12], gaim: ['a.chest', 0.45, -0.9, -0.8], hp: 0.05, hy: 0, cy: 0, sy: 0, r: [0, -0.7, 0] },
    ],
    v: [
      { t: 0, ...UPPER, ...stand(0, 0), ...relax('v') },
      { t: 0.2, hy: 0.1 },
      // what was that: he looks over his shoulder
      { t: 0.42, hy: 0.75, r: [0, 0.14, 0], rh: ['v.chest', 0.3, -0.24, -0.2], lh: ['v.chest', -0.28, -0.24, -0.16] },
      // pulled around, the free arm flies out
      { t: 0.68, ...stand(-0.02, -0.02, 0.8), p: [-0.02, 0.9, -0.02], r: [0.1, 0.8, 0], sp: 0.06, cp: 0.06, hy: 0.25, hp: -0.1, j: 0.5, lh: ['a.lhand', -0.02, -0.16, 0], rh: ['v.chest', 0.62, 0.12, -0.1], lfd: 0.26, rfd: 0.26 },
      // doubled over
      { t: 0.98, ...stand(-0.05, 0, 1.55), p: [-0.05, 0.84, 0], r: [0.78, 1.55, 0], sp: 0.2, cp: 0.28, hp: 0.05, hy: 0, j: 0.6, lh: ['v.chest', -0.26, -0.34, -0.26], rh: ['v.chest', 0.58, -0.08, -0.14], lfd: 0.28, rfd: 0.28 },
      { t: 1.3, ...stand(-0.05, 0.02, 2.3), p: [-0.05, 0.8, 0.02], r: [1.0, 2.3, 0], sp: 0.24, cp: 0.28, hp: -0.1, j: 0.5, lh: ['v.chest', -0.28, -0.36, -0.22], rh: ['v.chest', 0.56, -0.2, -0.16], lfd: 0.28, rfd: 0.28 },
      // and up in front of him
      { t: 1.65, ...stand(-0.02, 0.05, 2.95), p: [-0.02, 0.84, 0.05], r: [0.58, 2.95, 0], sp: 0.14, cp: 0.18, hp: -0.14, j: 0.4, lh: ['v.chest', -0.26, -0.28, -0.34], rh: ['v.chest', 0.56, 0, -0.14], lfd: 0.28, rfd: 0.28 },
      { t: 2.0, ...stand(0, 0.08, 3.14), p: [0, 0.89, 0.08], r: [0.1, 3.14, 0], sp: 0.04, cp: 0.04, hp: -0.2, j: 0.5, rh: ['v.chest', 0.56, 0.06, -0.1], lh: ['a.chest', 0.24, 0.14, -0.06], lfd: 0.26, rfd: 0.26 },
      { t: 2.26, p: [0.03, 0.875, 0.1], r: [0.16, 3.08, 0.04] },
      { t: 2.5, hp: -0.3, hy: -0.2, j: 0.5, rh: ['v.chest', 0.58, 0.14, -0.08] },
      // each one goes through him
      { t: 2.62, hp: -0.35, hy: -0.35, hz: 0.2, j: 0.3 },
      { t: 2.88, hp: 0.1, hy: -0.1, hz: 0.1, rh: ['v.chest', 0.5, -0.1, -0.12], cp: 0.12, sp: 0.06 },
      { t: 3.18, hp: 0.3, cp: 0.22, sp: 0.1, rh: ['v.chest', 0.42, -0.24, -0.14], j: 0.2 },
      // it goes out of him
      { t: 3.56, p: [0, 0.82, 0.08], r: [0.24, 3.14, 0], sp: 0.12, cp: 0.26, hp: 0.45, hz: 0.14, lh: ['v.chest', -0.3, -0.34, -0.14], rh: ['v.chest', 0.3, -0.36, -0.12], j: 0 },
      // pushed off
      { t: 3.84, p: [0, 0.86, -0.32], r: [-0.06, 3.14, 0], sp: 0, cp: 0.06, hp: 0.2, lf: [0.16, 0, -0.26], rf: [-0.17, 0, -0.5], lfd: 0.2, rfd: 0.2 },
      { t: 4.1, p: [0, 0.86, -0.52], r: [-0.12, 3.14, 0], hp: 0.05, cp: 0, lf: [0.16, 0, -0.56], lfd: 0.2, lh: ['v.chest', -0.5, -0.2, -0.12], rh: ['v.chest', 0.5, -0.2, -0.12] },
      { t: 4.16, lh: ['v.chest', -0.56, 0.12, -0.06], rh: ['v.chest', 0.56, 0.14, -0.06] },
      // the last one, and the arms go up
      { t: 4.2, r: [-0.34, 3.14, 0], p: [0, 0.86, -0.6], hp: -0.5, cp: -0.2, sp: -0.1, lh: ['v.chest', -0.32, 0.58, 0.02], rh: ['v.chest', 0.32, 0.62, 0.04], kl: 0.8 },
      ...fallBack(4.3, 0, -0.7, 3.14, { d: 0.62, T: 0.82, lean: -0.34 }),
    ],
    vk: {
      hp: [[2.6, -7], [2.88, 5], [3.16, 6], [4.16, -12]], cp: [[2.6, -2], [2.88, 3.5], [3.16, 5], [4.16, -5]], sp: [[2.88, 2], [3.16, 3], [4.16, -3]], hy: [[2.6, -5], [2.88, 2]], cy: [[2.6, 2], [2.88, -3], [3.16, 2]],
    },
    ak: { cp: [[2.6, -0.5], [2.88, -0.5], [3.16, -0.5], [4.16, -0.9]], cy: [[2.6, 0.5], [2.88, 0.5], [3.16, 0.5], [4.16, 0.8]] },
    push: [[4.22, [1, 2, 3], 0, 0.4, -2.2], [4.22, [10, 11, 12, 13, 14, 15], 0, 1.2, -0.8]],
    slow: [[2.6, 0.84, 0.1, 0.06, 0.2], [4.16, 0.84, 0.1, 0.06, 0.3]],
    cam: [
      { t: 0, crop: 1, pos: [0.72, 1.48, 1.72], look: [-0.15, 1.2, 0.05], fov: 44 },
      { t: 0.45, crop: 1, pos: [1.15, 1.42, 1.15], look: [-0.1, 1.15, 0.05], fov: 42 },
      { t: 1.0, crop: 1, pos: [1.5, 1.5, 0.1], look: [-0.15, 1.0, 0.2], fov: 42 },
      { t: 1.6, crop: 1, pos: [1.4, 1.38, -0.75], look: [0, 1.1, 0.3], fov: 42 },
      { t: 2.2, crop: 1, pos: [0.85, 1.26, -1.3], look: [0, 1.15, 0.3], fov: 38 },
      { t: 2.65, crop: 1, pos: [1.25, 1.2, -1.0], look: [0, 1.15, 0.3], fov: 38 },
      { t: 3.2, crop: 1, pos: [1.75, 1.16, -0.1], look: [0, 1.08, 0.3], fov: 38 },
      { t: 3.7, crop: 1, pos: [1.9, 1.2, 0.5], look: [0, 1.05, 0.15], fov: 40 },
      { t: 4.25, crop: 1, pos: [1.95, 1.25, 0.95], look: [0, 1.05, -0.15], fov: 42 },
      { t: 4.7, crop: 1, pos: [1.95, 1.3, 1.1], look: [0, 1.1, 0.1], fov: 44 },
    ],
    events: [
      [0.28, 'sfx', 'pouch', { vol: 0.9 }], [0.6, 'sfx', 'pouch', { vol: 0.7, rate: 0.8 }], [0.68, 'drop'], [0.95, 'sfx', 'thud', { vol: 0.5, rate: 1.3 }], [1.08, 'sfx', 'chargeBack', { vol: 0.7, rate: 1.2 }], [1.7, 'sfx', 'pouch', { vol: 0.7 }],
      [2.6, 'shot', 'v.head', 0, -0.12, 0.02, 0.8, 0.3, 0.2, 1.3, 0.6], [2.88, 'shot', 'v.chest', -0.17, 0.05, -0.08, 0.8, 0.2, -0.2, 1.0, 0.6], [3.16, 'shot', 'v.pelvis', 0.02, 0.1, -0.13, 0, 0.2, -0.8, 1.0, 0.6],
      [3.84, 'sfx', 'punch', { vol: 0.5, rate: 0.8 }], [4.16, 'shot', 'v.chest', 0, 0.08, -0.19, 0, 0.3, 0.9, 1.6, 0.8], [4.24, 'kill', [0, 0.2, -1], 0.5, 'chest'], [4.6, 'thud'], [4.64, 'slam', 'v.chest', 0.5], [4.72, 'pool', 'v.chest', 0.8],
    ],
  },
  // ---------------------------------------------------------------------------
  // He gets up and turns on his knee right into it. He catches the arm, it goes in anyway, up at the neck and low in the thigh, and he sits down. A long look, an arm in the collar, the blade in the belly, and a boot sends him off it.
  // ---------------------------------------------------------------------------
  {
    name: 'ZWEIKAMPF', dur: 4.9, prop: 'knife', prone: true,
    a: [
      { t: 0, ...UPPER, ...stand(0.3, 1.7, 0.05), ...relax('a') },
      { t: 0.2, lf: [0.16, 0, 1.4], p: [0.3, 0.925, 1.52] },
      // the knife comes out on the way
      { t: 0.42, rf: [0.46, 0, 1.08], p: [0.3, 0.915, 1.18], rh: ['a.pelvis', 0.2, 0.02, 0.12], pto: ['a.pelvis', 0.2, 0.4, -0.3], hp: 0.15 },
      { t: 0.64, lf: [0.12, 0, 0.84], p: [0.26, 0.89, 0.92], r: [0.12, -0.12, 0], hp: 0.22, rh: ['a.chest', 0.22, 0.02, -0.36], pto: ['a.chest', 0.26, 0.3, -1.2], lh: ['a.chest', -0.18, 0.04, -0.3] },
      { t: 0.86, rf: [0.44, 0, 0.92], rfd: 0.2, p: [0.24, 0.86, 0.8], r: [0.2, -0.18, 0], cp: 0.06, rh: ['a.chest', 0.3, 0.06, -0.14], pto: ['v.chest', 0, 0.2, 0] },
      // the hands meet
      { t: 1.06, lh: ['v.chest', 0.22, 0.14, -0.08], rh: ['a.chest', 0.36, 0.08, 0.02], pto: ['v.chest', 0, 0.2, 0], cy: -0.34, sy: -0.18 },
      // up at the neck
      { t: 1.22, p: [0.2, 0.84, 0.7], r: [0.28, -0.18, 0], cy: 0.38, sy: 0.2, rh: ['v.chest', 0.08, 0.26, -0.14], pto: ['v.head', 0, -0.14, 0.02], lh: ['v.chest', 0.22, 0.14, -0.08] },
      // he ducks under the arm that comes for him
      { t: 1.4, p: [0.2, 0.68, 0.66], r: [0.8, -0.14, 0], cp: 0.24, sp: 0.14, hp: 0.05, cy: 0.05, sy: 0, rh: ['a.chest', 0.3, -0.16, -0.22], pto: ['v.pelvis', 0.1, -0.1, 0], lh: ['a.chest', -0.24, -0.12, -0.34] },
      { t: 1.54, p: [0.18, 0.62, 0.62], r: [0.94, -0.1, 0], rf: [0.46, 0, 0.98], rh: ['a.chest', 0.36, -0.16, -0.08], pto: ['v.pelvis', 0.1, -0.1, 0], cy: -0.28, sy: -0.14 },
      // low, into the thigh, with the shoulder behind it
      { t: 1.68, p: [0.16, 0.6, 0.56], r: [1.0, -0.1, 0], cy: 0.3, sy: 0.16, rh: ['v.pelvis', 0.1, -0.14, -0.14], pto: ['v.pelvis', 0.1, -0.14, 0.1], lh: ['v.pelvis', -0.16, -0.04, -0.14] },
      { t: 1.84, p: [0.14, 0.58, 0.5], r: [1.02, -0.1, 0], rh: ['v.pelvis', 0.1, -0.14, -0.14], pto: ['v.pelvis', 0.1, -0.14, 0.1], lh: ['v.pelvis', -0.16, -0.04, -0.14] },
      // down on one knee, it comes out
      { t: 2.02, p: [0.2, 0.54, 0.72], r: [0.42, -0.1, 0], cp: 0.14, sp: 0.06, cy: 0, sy: 0, rf: [0.44, 0.02, 1.24], rfp: 1.35, rfd: 0.18, lf: [0.04, 0, 0.5], lfd: 0.2, rh: ['a.chest', 0.3, -0.2, -0.2], pto: ['a.chest', 0.6, -0.4, -0.7], lh: ['a.chest', -0.28, -0.22, -0.26] },
      { t: 2.2, p: [0.2, 0.64, 0.76], r: [0.22, -0.1, 0], cp: 0.08, sp: 0.02, hp: 0.2 },
      // and up over him: a long look, the arms wide
      { t: 2.42, p: [0.22, 0.88, 0.84], r: [0.03, -0.14, 0], rf: [0.44, 0, 1.04], rfp: 0, rfd: 0.22, lh: ['a.chest', -0.32, 0.06, -0.16], rh: ['a.chest', 0.4, -0.3, -0.02], pto: ['a.chest', 0.9, -0.5, -0.4], hp: 0.3 },
      { t: 2.72, p: [0.22, 0.93, 0.84], r: [-0.04, -0.08, 0], cp: -0.04, sp: 0, hp: 0.42, lh: ['a.chest', -0.6, 0.08, -0.04], rh: ['a.chest', 0.58, 0.04, 0.02], pto: ['a.chest', 1.3, 0.1, 0] },
      // in the collar
      { t: 2.92, lf: [0.06, 0, 0.26], lfd: 0.22, rf: [0.4, 0, 0.72], rfd: 0.26, lead: 'l', p: [0.2, 0.84, 0.54], r: [0.34, -0.1, 0], cp: 0.12, hp: 0.25, lh: ['v.chest', 0.06, 0.24, -0.12], rh: ['a.chest', 0.42, -0.12, 0.08], pto: ['v.pelvis', 0, 0.1, -0.1], cy: -0.3, sy: -0.16 },
      // the belly
      { t: 3.06, p: [0.17, 0.76, 0.38], r: [0.7, -0.1, 0], cp: 0.28, sp: 0.16, cy: 0.3, sy: 0.16, hp: 0.15, rh: ['v.pelvis', 0.02, 0.14, -0.14], pto: ['v.pelvis', 0, 0.14, 0.1], lh: ['v.chest', 0.06, 0.24, -0.12] },
      { t: 3.24, p: [0.19, 0.8, 0.44], r: [0.5, -0.1, 0], cp: 0.2, cy: 0.18, rh: ['v.pelvis', 0.02, 0.14, -0.14], pto: ['v.pelvis', 0, 0.14, 0.1], lh: ['v.chest', 0.06, 0.24, -0.12] },
      // and out, up along him
      { t: 3.4, p: [0.22, 0.88, 0.6], r: [0.2, -0.1, 0], cp: 0.1, cy: 0, sy: 0, rh: ['a.chest', 0.28, -0.04, -0.3], pto: ['a.chest', 0.32, -0.7, -0.36], lh: ['v.chest', 0.06, 0.24, -0.12] },
      { t: 3.42, rf: [0.4, 0, 0.72], rfp: 0 },
      // the boot
      { t: 3.58, p: [0.24, 0.95, 0.56], r: [-0.28, -0.1, 0], cp: 0.24, sp: -0.04, hp: 0.3, rf: [0.14, 0.74, -0.14], rfp: -0.2, rfy: 0, lh: ['a.chest', -0.42, 0.02, 0], rh: ['a.chest', 0.46, -0.1, 0.04], pto: ['a.chest', 0.9, -0.6, -0.1] },
      // back on his feet, the blade low
      { t: 3.82, p: [0.22, 0.92, 0.52], r: [0.03, -0.1, 0], cp: 0.06, sp: 0, hp: 0.3, rf: [0.44, 0, 0.74], rfp: 0, lh: ['a.chest', -0.26, -0.22, -0.2], rh: ['a.chest', 0.48, -0.26, -0.02], pto: ['a.chest', 0.9, -0.9, -0.3] },
      { t: 4.3, ...stand(0.25, 0.54, -0.1), lf: [0.06, 0, 0.26], rf: [0.44, 0, 0.74], hp: 0.2, cp: 0.04, rh: ['a.chest', 0.4, -0.3, -0.04], pto: ['a.chest', 0.8, -1, -0.3], lh: ['a.chest', -0.26, -0.34, -0.12] },
      { t: 4.9, r: [0, -0.35, 0], hp: 0.08, cp: 0, hy: 0.1 },
    ],
    v: [
      { t: 0, ...UPPER, ...onBelly(0, 0) },
      { t: 0.22, lh: [-0.32, 0.05, -0.7], rh: [0.32, 0.05, -0.7], hp: -0.95, p: [0, 0.19, -0.01] },
      // up, and the first look back
      { t: 0.48, p: [0, 0.36, -0.03], r: [1.32, -0.06, 0], cp: -0.06, hy: -0.3, hp: -0.8, lf: [-0.19, 0, 0.66], rf: [0.19, 0, 0.68], lfl: 0, rfl: 0, lfd: 0.26, rfd: 0.26, lh: [-0.3, 0.05, -0.68], rh: [0.3, 0.05, -0.68] },
      { t: 0.7, p: [0.02, 0.5, -0.03], r: [1.08, -0.42, 0], cp: -0.08, cy: -0.25, sy: -0.12, hy: -0.5, hp: -0.55, lf: [-0.16, 0, 0.48], rf: [0.28, 0, 0.42], lfl: 0, rfl: 0, lfd: 0.22, rfd: 0.22, rh: [0.4, 0.3, -0.6], lh: [-0.1, 0.05, -0.72] },
      // he comes around on his knee, the right hand first
      { t: 0.92, p: [0.04, 0.56, -0.03], r: [0.56, -1.75, 0], cy: -0.2, sy: -0.1, cp: 0.02, hy: -0.2, hp: -0.3, lf: [-0.28, 0.09, 0.14], lfy: -1.8, rf: [0.52, 0.08, 0.06], rfy: -1.6, rfp: 0.6, lfp: 0.8, rh: [0.72, 0.84, 0.05], lh: [0.26, 0.4, -0.5] },
      { t: 1.04, rf: [0.26, 0.09, -0.5], rfy: -2.5, rfp: 0.9 },
      { t: 1.12, ...oneKnee(0.04, -0.04, -3.05), lf: [0.34, 0, 0.36], lfy: -3.05, rf: [-0.18, 0, -0.64], rfy: -3.05, rfp: 1.35, lfp: 0, r: [0.14, -3.05, 0], cy: 0, sy: 0, hy: 0, hp: -0.15, cp: 0.02, rh: ['a.lhand', -0.03, -0.17, 0], lh: ['a.rhand', 0.03, -0.17, 0] },
      // the neck: the head goes back, the free arm flies up
      { t: 1.24, hp: -0.5, hy: 0.25, cp: -0.14, sp: -0.06, r: [0.02, -3.05, 0], rh: ['v.chest', 0.2, 0.36, -0.3], lh: ['a.rhand', 0.03, -0.17, 0], j: 0.3 },
      { t: 1.42, hp: -0.3, hy: 0.1, cp: -0.1, r: [-0.04, -3.05, 0], rh: ['v.chest', 0.24, 0.34, -0.34], lh: ['v.chest', -0.2, 0.2, -0.36] },
      // he pulls the arms in
      { t: 1.56, hp: 0.05, hy: 0, cp: 0.04, sp: 0, r: [0.04, -3.05, 0], rh: ['v.chest', 0.12, 0.08, -0.32], lh: ['v.chest', -0.14, -0.02, -0.34] },
      // the thigh: down over it, a hand goes after the blade
      { t: 1.72, hp: 0.35, cp: 0.2, sp: 0.1, r: [0.2, -3.05, 0], lh: ['a.rhand', 0.04, -0.15, 0], rh: ['v.chest', 0.16, -0.08, -0.32], j: 0.4 },
      { t: 1.88, hp: 0.1, cp: 0.05, sp: 0, r: [-0.14, -3.05, 0], p: [0.04, 0.56, -0.12], lh: ['a.rhand', 0.04, -0.15, 0] },
      // over backward onto his seat, one leg forward
      { t: 2.1, p: [0.04, 0.36, -0.3], r: [-0.42, -3.05, 0], sp: 0.08, cp: 0.2, hp: 0.15, lf: [0.32, 0, 0.32], lfp: -0.4, rf: [-0.42, 0, -0.08], rfy: -2.2, rfp: -0.3, rfd: 0.22, rfl: 0, j: 0.2, lh: ['v.chest', -0.3, -0.32, -0.1], rh: ['v.chest', 0.14, 0.1, -0.56] },
      { t: 2.3, r: [-0.3, -3.05, 0], sp: 0.06, cp: 0.16, hp: -0.25, rh: ['v.chest', 0.14, 0.14, -0.58], j: 0.3 },
      // the head sinks, the hand with it
      { t: 2.72, r: [-0.12, -3.05, 0], p: [0.04, 0.36, -0.28], sp: 0.1, cp: 0.26, hp: 0.5, rh: ['v.chest', 0.26, -0.28, -0.3], j: 0.1 },
      // pulled up by the collar
      { t: 3.02, r: [0.02, -3.05, 0], p: [0.05, 0.38, -0.26], sp: 0.04, cp: 0.06, hp: 0.05, j: 0.2, lh: ['a.lhand', 0.05, -0.17, 0], rh: ['v.chest', 0.3, -0.2, -0.3] },
      // it goes in
      { t: 3.1, cp: 0.24, sp: 0.12, hp: 0.3, j: 0.3 },
      { t: 3.42, cp: 0.12, sp: 0.04, hp: -0.15, hz: 0.1, j: 0.1, lh: ['a.lhand', 0.05, -0.17, 0] },
      // the boot, and the arms fly out
      { t: 3.56, p: [0.05, 0.38, -0.3], r: [-0.3, -3.05, 0], cp: -0.1, sp: -0.05, hp: -0.3, j: 0, ka: 0.6, lh: ['v.chest', -0.56, 0.2, -0.04], rh: ['v.chest', 0.56, 0.18, -0.04], kt: 1, kh: 0.6 },
      { t: 3.68, kt: 0.52, kh: 0, ka: 0, kl: 0.45, p: [0.05, 0.3, -0.4], r: [-0.62, -3.05, 0] },
      { t: 3.86, kt: 0.34, kl: 0.25, p: [0.05, 0.2, -0.52], r: [-1.1, -3.05, 0.05], sp: 0, cp: 0, hp: 0 },
      { t: 4.06, kt: 0.12, kl: 0.08, p: [0.05, 0.16, -0.6], r: [-1.5, -3.05, 0.05] },
      { t: 4.28, kt: 0, kl: 0 },
    ],
    vk: { hp: [[1.24, -9], [1.7, 5], [3.08, 5], [3.58, -10]], cp: [[1.24, -3], [1.7, 5], [3.08, 5], [3.58, -7]], sp: [[1.7, 3], [3.08, 3], [3.58, -4]], hy: [[1.24, 5]] },
    ak: { cp: [[1.24, 0.9], [1.68, 1.2], [3.06, 1.3]], hp: [[1.68, 0.8]] },
    push: [[3.6, [1, 2, 3], 0, 0.5, -3.0], [3.6, [0, 4, 5], 0, 0.2, -1.4], [3.6, [10, 11, 12, 13, 14, 15], 0, 0.8, -1.2]],
    slow: [[1.68, 0.84, 0.06, 0.06, 0.2], [3.06, 0.84, 0.08, 0.06, 0.2], [3.58, 0.84, 0.06, 0.1, 0.34]],
    cam: [
      { t: 0, crop: 1, pos: [2.0, 0.62, 0.95], look: [0.1, 0.7, 0.5], fov: 46 },
      { t: 0.9, crop: 1, pos: [1.75, 0.5, 0.55], look: [0.15, 0.85, 0.35], fov: 46 },
      { t: 1.4, crop: 1, pos: [1.5, 0.42, 0.1], look: [0.12, 0.75, 0.35], fov: 46 },
      { t: 1.9, crop: 1, pos: [1.25, 0.4, -0.45], look: [0.12, 0.62, 0.45], fov: 46 },
      { t: 2.6, crop: 1, pos: [1.35, 0.36, -1.35], look: [0.2, 0.9, 0.45], fov: 46 },
      { t: 3.0, crop: 1, pos: [1.7, 0.42, -0.9], look: [0.12, 0.82, 0.2], fov: 44 },
      { t: 3.6, crop: 1, pos: [1.85, 0.44, -0.95], look: [0.15, 0.8, 0.12], fov: 46 },
      { t: 4.3, crop: 1, pos: [2.0, 0.56, -0.85], look: [0.25, 0.86, 0.15], fov: 46 },
    ],
    events: [
      [0.2, 'sfx', 'pouch', { vol: 0.5 }], [0.3, 'drop'], [0.34, 'prop', 1], [0.36, 'sfx', 'chargeBack', { vol: 0.4, rate: 1.5 }], [0.62, 'sfx', 'pouch', { vol: 0.5 }], [1.06, 'sfx', 'pouch', { vol: 0.9, rate: 0.9 }],
      [1.16, 'sfx', 'swing', { vol: 0.8, rate: 1.1 }], [1.22, 'hit', 'v.chest', 0.1, 0.26, -0.14, 0, 0.5, 0.8, 1.0, 'stab'], [1.62, 'sfx', 'swing', { vol: 0.7, rate: 1 }], [1.68, 'hit', 'v.pelvis', 0.1, -0.14, -0.14, 0.5, 0.3, 0.6, 1.2, 'stab'], [1.76, 'hit', 'v.pelvis', 0.1, -0.14, -0.14, 0.7, 0.4, 0.2, 0.7], [2.1, 'sfx', 'thud', { vol: 0.7 }],
      [2.92, 'sfx', 'pouch', { vol: 0.9, rate: 0.8 }], [3.0, 'sfx', 'swing', { vol: 0.9, rate: 0.9 }], [3.06, 'hit', 'v.pelvis', 0.02, 0.14, -0.14, 0, 0.3, 0.8, 1.4, 'stab'], [3.3, 'sfx', 'stab', { vol: 0.5, rate: 0.8 }],
      [3.4, 'hit', 'v.pelvis', 0.02, 0.16, -0.14, 0.1, 0.8, 0.8, 1.8, 'stab'], [3.46, 'hit', 'v.chest', 0.02, -0.1, -0.16, 0.1, 0.9, 0.8, 1.2], [3.52, 'hit', 'v.chest', 0.02, -0.04, -0.16, 0.1, 0.9, 0.7, 1.0], [3.58, 'sfx', 'punch', { vol: 1, rate: 0.85 }], [3.6, 'hit', 'v.chest', 0, 0.02, -0.16, 0, 0.5, -0.5, 0.8],
      [3.62, 'kill', [0, 0.1, -1], 0.6, 'chest'], [3.92, 'thud'], [3.96, 'slam', 'v.chest', 0.5], [4.0, 'pool', 'v.chest', 0.9],
    ],
  },
  // ---------------------------------------------------------------------------
  // He crawls. You walk beside him without hurrying, the knife comes out. He props himself up and looks at you, and that is all you need: across the throat. He holds it shut, gets back on all fours, and doesn't get far.
  // ---------------------------------------------------------------------------
  {
    name: 'KEHLSCHNITT', dur: 5.0, prop: 'knife', prone: true,
    a: [
      { t: 0, ...UPPER, ...stand(-0.72, 1.7), ...relax('a'), hp: 0.2 },
      { t: 0.34, lf: [-0.86, 0, 1.3], lfd: 0.34, p: [-0.72, 0.925, 1.36] },
      { t: 0.72, rf: [-0.58, 0, 0.92], rfd: 0.36, p: [-0.72, 0.92, 0.98], hp: 0.28 },
      // the knife comes out on the way
      { t: 1.1, lf: [-0.86, 0, 0.56], lfd: 0.36, p: [-0.72, 0.915, 0.62], r: [0.03, -0.2, 0], rh: ['a.pelvis', 0.2, 0.02, 0.12], pto: ['a.pelvis', 0.2, 0.4, -0.3], hp: 0.32, hy: -0.2 },
      { t: 1.46, rf: [-0.5, 0, 0.3], rfd: 0.34, p: [-0.68, 0.9, 0.26], r: [0.08, -0.7, 0], hy: -0.3, hp: 0.34, rh: ['a.chest', 0.3, -0.16, -0.22], pto: ['a.chest', 0.5, -0.1, -1.0], lh: ['a.chest', -0.3, -0.3, -0.14] },
      // over him
      { t: 1.74, lf: [-0.72, 0, -0.1], lfd: 0.26, p: [-0.62, 0.84, 0.0], r: [0.42, -1.04, 0], cp: 0.2, sp: 0.1, hy: 0, hp: 0.25, lh: ['a.chest', -0.5, 0.02, -0.14], rh: ['v.head', 0.3, -0.2, -0.18], pto: ['v.head', 0.1, -0.13, -0.14] },
      { t: 1.92, p: [-0.58, 0.82, -0.02], r: [0.5, -1.04, 0], cy: -0.2, sy: -0.1, rh: ['v.head', 0.17, -0.13, -0.11], pto: ['v.head', 0, -0.13, -0.14] },
      // across
      { t: 2.06, cy: 0.3, sy: 0.14, r: [0.46, -0.98, 0], rh: ['v.head', -0.2, -0.14, -0.12], pto: ['v.head', -0.5, -0.14, -0.2] },
      // and away with it
      { t: 2.26, p: [-0.62, 0.86, 0.02], r: [0.26, -0.98, 0], cp: 0.1, sp: 0.04, cy: 0.34, sy: 0.16, rh: ['a.chest', 0.56, -0.02, -0.22], pto: ['a.chest', 1.1, 0.1, -0.5], lh: ['a.chest', -0.42, -0.16, -0.12], hp: 0.3 },
      // wide on his feet, the arm comes down
      { t: 2.7, p: [-0.64, 0.88, 0.06], r: [0.05, -1.1, 0], cp: 0.04, sp: 0, cy: 0.1, sy: 0.04, hp: 0.28, hy: 0.12, rh: ['a.chest', 0.33, -0.36, -0.08], pto: ['a.chest', 0.7, -1.1, -0.3], lh: ['a.chest', -0.28, -0.4, -0.08] },
      // and he turns his back on it, toward you
      { t: 3.08, rf: [-0.38, 0, 0.5], rfd: 0.36, p: [-0.58, 0.905, 0.3], r: [0.03, -2.2, 0], cy: 0.04, sy: 0, hy: 0.3, hp: 0.2 },
      { t: 3.46, lf: [-0.72, 0, 0.82], lfd: 0.36, lfy: -3, p: [-0.56, 0.92, 0.68], r: [0.02, -2.95, 0], cy: 0, hy: 0.25, hp: 0.14 },
      { t: 3.84, rf: [-0.38, 0, 1.18], rfd: 0.36, rfy: -3.1, p: [-0.56, 0.92, 1.05], r: [0.02, -3.1, 0], hy: 0.1, hp: 0.08 },
      { t: 4.22, lf: [-0.7, 0, 1.46], lfd: 0.36, lfy: -3.1, p: [-0.56, 0.925, 1.38], r: [0.01, -3.14, 0], hy: 0, hp: 0.02, rh: ['a.chest', 0.3, -0.38, -0.08] },
      { t: 5.0, hp: 0, cp: 0 },
    ],
    v: [
      { t: 0, ...UPPER, ...onBelly(0, 0) },
      { t: 0.24, lh: [-0.33, 0.05, -0.72], rh: [0.33, 0.05, -0.72], hp: -0.95, p: [0, 0.19, -0.02] },
      { t: 0.52, p: [0, 0.34, -0.08], r: [1.36, 0, 0], cp: -0.05, lf: [-0.19, 0, 0.62], rf: [0.19, 0, 0.64], lfl: 0, rfl: 0, lfd: 0.28, rfd: 0.28 },
      { t: 0.8, p: [0, 0.48, -0.16], r: [1.26, 0, 0], sp: -0.03, cp: -0.05, hp: -0.88, lf: [-0.17, 0, 0.36], rf: [0.17, 0, 0.4], lfl: 0, rfl: 0, lfd: 0.26, rfd: 0.26, lh: [-0.27, 0.05, -0.84], rh: [0.27, 0.05, -0.86] },
      // hand and knee, hand and knee, looking for somewhere to go
      { t: 1.04, p: [0.01, 0.48, -0.3], r: [1.22, 0.04, 0.03], cy: -0.1, rh: [0.27, 0.05, -1.02], lf: [-0.17, 0, 0.24], lfl: 0.02, lfd: 0.24, hy: -0.15 },
      { t: 1.26, p: [-0.01, 0.48, -0.44], r: [1.2, 0.08, -0.03], cy: 0.12, lh: [-0.3, 0.05, -1.14], rf: [0.17, 0, 0.08], rfl: 0.02, rfd: 0.24, hy: 0.35, hp: -0.7 },
      // he hears the steps: around onto his hip, propped on one arm
      { t: 1.5, p: [-0.04, 0.4, -0.5], r: [0.9, 1.0, 0.1], cy: 0.2, sy: 0.1, hy: 0.4, hp: -0.42, lf: [-0.28, 0.08, 0.08], lfy: 1, lfp: 0.3, rf: [-0.06, 0.08, -0.04], rfy: 1, rfp: 0.3, rh: [-0.12, 0.05, -0.98], lh: [-0.46, 0.28, -0.82] },
      { t: 1.76, p: [-0.05, 0.3, -0.5], r: [0.26, 2.3, 0.1], cy: 0.04, sy: 0.02, cp: 0, hy: 0.1, hp: -0.55, lf: [-0.36, 0, 0.06], lfy: 2.3, lfp: -0.5, rf: [-0.54, 0, -0.32], rfy: 2.3, rfp: -0.5, rh: [-0.42, 0.05, -0.92], lh: [0.22, 0.05, -0.74] },
      // the chin up, he doesn't look away
      { t: 1.92, hp: -0.72, hy: 0.15, cp: -0.08, r: [0.2, 2.3, 0.1] },
      { t: 2.06, hp: -0.85, hy: -0.1, cp: -0.14, sp: -0.05, r: [0.12, 2.3, 0.1] },
      // the hand comes up by itself, then to the throat
      { t: 2.24, hp: -0.72, cp: -0.1, rh: [-0.24, 0.72, -0.32], j: 0.5 },
      { t: 2.44, hp: -0.5, hy: 0.2, cp: 0, sp: 0.02, r: [0.28, 2.3, 0.1], rh: ['v.head', 0.12, -0.14, -0.12], j: 0.7 },
      { t: 2.7, hp: -0.1, hy: 0.35, hz: 0.1, cp: 0.12, sp: 0.06, r: [0.6, 2.2, 0.1], p: [-0.06, 0.34, -0.5], rh: ['v.head', 0.1, -0.14, -0.12], lh: [0.14, 0.05, -0.86], j: 0.7 },
      // he gets back on all fours, one hand still at his neck
      { t: 3.02, p: [-0.08, 0.44, -0.58], r: [1.02, 1.6, 0], cp: 0.05, sp: 0, hp: -0.15, hy: 0.1, hz: 0, lf: [0.28, 0, -0.42], lfy: 1.6, lfp: 1.35, lfl: 0, lfd: 0.42, rf: [0.28, 0, -0.76], rfy: 1.6, rfp: 1.35, rfl: 0, rfd: 0.42, rh: ['v.head', 0.1, -0.14, -0.12], lh: [-0.62, 0.05, -0.34], j: 0.7 },
      { t: 3.4, p: [-0.14, 0.46, -0.58], r: [1.12, 1.6, 0], hp: -0.3, lh: [-0.72, 0.05, -0.36], j: 0.8 },
      // a little further
      { t: 3.72, p: [-0.24, 0.42, -0.58], r: [1.22, 1.6, 0], hp: 0, rh: [-0.74, 0.05, -0.78], lh: [-0.84, 0.05, -0.34], j: 0.5, ka: 0.8 },
      // that's it
      ...fallForward(3.86, -0.24, -0.58, 1.6, { d: 0.36, T: 0.85, kneeling: true }),
    ],
    vk: { hp: [[2.06, 6]], cp: [[2.06, 2]] },
    ak: { cp: [[2.06, 0.6]] },
    push: [[4.0, [1, 2, 3], -0.4, -0.6, 0]],
    slow: [[2.06, 0.84, 0.08, 0.14, 0.3]],
    cam: [
      { t: 0, crop: 2, pos: [0.5, 1.6, 2.6], look: [-0.2, 0.45, -0.1], fov: 46 },
      { t: 0.9, crop: 2, pos: [0.45, 1.5, 2.3], look: [-0.3, 0.62, -0.2], fov: 44 },
      { t: 1.4, crop: 2, pos: [0.5, 1.38, 1.75], look: [-0.3, 0.72, -0.45], fov: 44 },
      { t: 1.85, crop: 1, pos: [0.44, 1.02, 0.72], look: [-0.3, 0.82, -0.4], fov: 42 },
      { t: 2.3, crop: 1, pos: [0.48, 0.95, 0.52], look: [-0.28, 0.82, -0.42], fov: 40 },
      { t: 2.7, crop: 1, pos: [0.4, 1.0, 0.8], look: [-0.34, 0.72, -0.34], fov: 44 },
      { t: 3.2, crop: 1, pos: [0.42, 1.08, 1.75], look: [-0.45, 0.68, 0.0], fov: 44 },
      { t: 3.8, crop: 1, pos: [0.4, 1.12, 2.3], look: [-0.45, 0.78, 0.35], fov: 46 },
      { t: 4.4, crop: 1, pos: [0.85, 1.28, 2.25], look: [-0.5, 1.25, 1.1], fov: 46 },
    ],
    events: [
      [0.2, 'sfx', 'pouch', { vol: 0.5 }], [0.3, 'drop'], [0.34, 'sfx', 'pouch', { vol: 0.3 }], [0.72, 'sfx', 'pouch', { vol: 0.3 }], [1.04, 'prop', 1], [1.06, 'sfx', 'chargeBack', { vol: 0.4, rate: 1.5 }], [1.46, 'sfx', 'pouch', { vol: 0.5 }], [1.74, 'sfx', 'pouch', { vol: 0.5, rate: 0.8 }],
      [1.98, 'sfx', 'swing', { vol: 1, rate: 1.2 }], [2.04, 'hit', 'v.head', 0.05, -0.14, -0.12, -0.2, 0.5, 0.9, 1.6, 'stab'], [2.1, 'hit', 'v.head', -0.05, -0.14, -0.12, -0.4, 0.6, 0.9, 1.4], [2.16, 'hit', 'v.head', -0.08, -0.14, -0.12, -0.5, 0.5, 0.8, 1.2], [2.24, 'hit', 'v.head', 0, -0.14, -0.12, -0.2, 0.3, 0.8, 0.8], [2.34, 'hit', 'v.head', 0, -0.14, -0.12, 0, 0.2, 0.8, 0.6], [2.5, 'hit', 'v.head', 0, -0.14, -0.12, 0, 0, 0.6, 0.4], [2.74, 'hit', 'v.head', 0, -0.14, -0.12, 0, -0.2, 0.3, 0.4],
      [3.02, 'sfx', 'thud', { vol: 0.4, rate: 1.3 }], [3.1, 'pool', 'v.head', 0.5], [3.9, 'kill', [0, -0.2, 0], 0.05, 'head'], [4.18, 'thud'], [4.3, 'pool', 'v.head', 0.8],
    ],
  },
];

export function bakeFinishers() { for (const F of FINISHERS) clipOf(F); }
// which way round a scene has to stand for the attacker to start at dx, dz from the victim
export function startYaw(F, dx, dz) { const P = clipOf(F).a.pos; return Math.atan2(dx, dz) - Math.atan2(P[0], P[2]); }
// where the victim's hips look at a time in the scene
export function victimYaw(F, t) {
  const C = clipOf(F).v, k = Math.min(C.pos.length / 3 - 1, Math.round(t * HZ)) * JOINTS.length * 4;
  return Math.atan2(2 * (C.q[k + 1] * C.q[k + 3] + C.q[k] * C.q[k + 2]), 1 - 2 * (C.q[k] * C.q[k] + C.q[k + 1] * C.q[k + 1]));
}
export function roomOf(F) { return clipOf(F).room; }
function clipOf(F) { return F.clip || (F.clip = bake(F)); }

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _eu = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const quint = (u) => u * u * u * (u * (u * 6 - 15) + 10);
const EXIT = 0.6, ENTER = 0.6;

// ---------------------------------------------------------------------------
// One running scene: plays both bodies, what they hold, and the camera
// ---------------------------------------------------------------------------
// how far the camera's way stays clear of walls, on either side of the action: the lowest it gets, 0 to 1
export function clearance(F, origin, q, col, side = 1, out = null) {
  const C = clipOf(F).cam, n = clipOf(F).n, step = 6, m = Math.ceil(n / step), hit = {}, a = new THREE.Vector3(), b = new THREE.Vector3();
  let low = 1;
  for (let k = 0; k < m; k++) {
    const i = Math.min(n - 1, k * step), lx = C.look[i * 3];
    a.set(lx, C.look[i * 3 + 1], C.look[i * 3 + 2]).applyQuaternion(q).add(origin);
    b.set(side > 0 ? C.pos[i * 3] : 2 * lx - C.pos[i * 3], C.pos[i * 3 + 1], C.pos[i * 3 + 2]).applyQuaternion(q).add(origin);
    const dist = a.distanceTo(b), h = col.raycast(a.x, a.y, a.z, (b.x - a.x) / dist, (b.y - a.y) / dist, (b.z - a.z) / dist, dist, hit), r = h ? Math.max(0.2, (h.t - 0.2) / dist) : 1;
    if (out) out[k] = r;
    if (r < low) low = r;
  }
  return low;
}

export class Stage {
  // t0: where in the scene it starts (from the front the part where he turns around is skipped).
  // turn: how far around his own axis the victim still has to be yanked until his place in the scene.
  constructor(game, F, attacker, victim, origin, yaw, tilt, t0 = 0, turn = 0) {
    this.g = game; this.F = F; this.a = attacker; this.v = victim; this.o = origin.clone(); this.yaw = yaw;
    this.clip = clipOf(F);
    this.t = t0; this.t0 = t0; this.turn = turn; this.prop = null; this.loose = false; this.bump = 0; this.exit = F.dur - EXIT;
    // (the ground may slope a little: the whole scene stands on it)
    this.rootQ = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    if (tilt) this.rootQ.premultiply(tilt);
    // how he stood when it started: he comes out of that, not out of nowhere
    const B = victim.poseBones;
    this.from = { q: B.map((b) => b.quaternion.clone()), p: victim.pelvis.position.clone() };
    this.dropAt = (F.events.find((e) => e[1] === 'drop') || [Infinity])[0];
    const w = victim.weapon;
    if (w) {
      const wm = victim.weaponMount;
      wm.updateMatrix();
      this.carry = [w.lh.clone().applyMatrix4(wm.matrix), w.rh.clone().applyMatrix4(wm.matrix)];
    }
    this.place(attacker); this.place(victim);
    this.plan();
  }

  place(s) { s.root.position.copy(this.o); s.root.quaternion.copy(this.rootQ); }

  // the body starts where you stand, if that is anywhere near where the scene has it: the camera leaves your own head
  startFrom(feet) {
    const P = this.clip.a.pos, i = Math.round(this.t0 * HZ);
    this.world(P[i * 3], 0, P[i * 3 + 2], _a).sub(feet).setY(0).negate();
    this.slide = _a.length() < (this.staysOut ? 4 : 1.5) ? _a.clone() : null;
  }
  // what is left of that right now
  slideLeft(t) { return this.slide ? 1 - quint(clamp01((t - this.t0) / 0.45)) : 0; }

  // scene frame to world
  world(x, y, z, out) { return out.set(x, y, z).applyQuaternion(this.rootQ).add(this.o); }

  bone(name) {
    const s = name[0] === 'a' ? this.a : this.v, b = name.slice(2);
    if (b === 'head') return s.head;
    if (b === 'chest') return s.chest;
    if (b === 'pelvis') return s.pelvis;
    if (b === 'lhand') return s.arms[0].hand;
    if (b === 'rhand') return s.arms[1].hand;
    if (b === 'lfoot') return s.legs[0].foot;
    if (b === 'rfoot') return s.legs[1].foot;
    return s.chest;
  }

  // [x, y, z] in the scene, ['v.head', x, y, z] on a bone
  point(spec, out) {
    if (typeof spec[0] !== 'string') return this.world(spec[0], spec[1], spec[2], out);
    return this.bone(spec[0]).localToWorld(out.set(spec[1], spec[2], spec[3]));
  }

  // ---- how fast the scene runs right now
  speed() {
    let k = 1;
    for (const [at, s, a, h, b] of this.F.slow || []) {
      const u = sstep(at - a, at, this.t) * (1 - sstep(at + h, at + h + b, this.t));
      k = Math.min(k, 1 - (1 - s) * u);
    }
    return k;
  }

  sample() { return Math.min(this.t * HZ, this.clip.n - 1.001); }

  pose(dt) {
    const { clip, a, v } = this, s = this.sample();
    this.dt = dt;
    this.place(a);
    const left = this.slideLeft(this.t);
    if (left > 0) a.root.position.addScaledVector(this.slide, left);
    a.playPose(clip.a, s);
    if (clip.gun) this.gunPose(s); else if (a.weapon) a.weapon.root.visible = false;
    a.root.updateMatrixWorld(true);
    if (!this.loose) {
      this.place(v);
      const into = quint(clamp01((this.t - this.t0) / 0.3));
      if (this.turn && into < 1) v.root.quaternion.multiply(_q.setFromAxisAngle(UP, this.turn * (1 - into)));
      v.playPose(clip.v, s, this.from, into);
      // until it falls, the gun is still in both hands
      const w = this.carry ? sstep(this.dropAt - 0.02, this.dropAt + 0.16, this.t) : 1;
      if (w < 1) {
        const T = clip.v.ht, i = Math.floor(s);
        for (let k = 0; k < 2; k++) {
          const A = v.arms[k], c = this.carry[k];
          _a.set(T[i * 6 + k * 3], T[i * 6 + k * 3 + 1], T[i * 6 + k * 3 + 2]).lerp(c, 1 - w);
          armIK(A.s, _a.x, _a.y, _a.z, 0, 0, 0, A.upper.quaternion, A.fore.quaternion, A.shoulder.position);
        }
      }
      v.root.updateMatrixWorld(true);
      v.pelvis.getWorldPosition(_b);
      v.updateBlob(_b, this.o.y);
    }
    a.pelvis.getWorldPosition(_b);
    a.updateBlob(_b, this.o.y);
    // ---- what's in the right hand
    const P = this.prop;
    if (P && P.visible && this.t > this.F.dur - 0.26 && !this.F.stuck) P.visible = false;
    if (P && P.visible) {
      const C = clip.prop, i = Math.floor(s), f = s - i, j = i + 1;
      this.world(C.pos[i * 3] + (C.pos[j * 3] - C.pos[i * 3]) * f, C.pos[i * 3 + 1] + (C.pos[j * 3 + 1] - C.pos[i * 3 + 1]) * f, C.pos[i * 3 + 2] + (C.pos[j * 3 + 2] - C.pos[i * 3 + 2]) * f, P.position);
      if (left > 0) P.position.addScaledVector(this.slide, left);
      P.quaternion.set(C.quat[i * 4], C.quat[i * 4 + 1], C.quat[i * 4 + 2], C.quat[i * 4 + 3]).premultiply(this.rootQ);
    }
  }

  gunPose(s) {
    const { clip, a } = this, w = a.weapon, G = clip.gun, B = clip.a, i = Math.floor(s), f = s - i, j = i + 1, on = B.gun[i] > 0.5;
    if (!w) return;
    w.root.visible = on;
    if (!on) return;
    const wm = a.weaponMount;
    _q.set(G.quat[i * 4], G.quat[i * 4 + 1], G.quat[i * 4 + 2], G.quat[i * 4 + 3]);
    _q2.set(G.quat[j * 4], G.quat[j * 4 + 1], G.quat[j * 4 + 2], G.quat[j * 4 + 3]);
    wm.quaternion.copy(_q.slerp(_q2, f));
    _a.set(G.grip[i * 3] + (G.grip[j * 3] - G.grip[i * 3]) * f, G.grip[i * 3 + 1] + (G.grip[j * 3 + 1] - G.grip[i * 3 + 1]) * f, G.grip[i * 3 + 2] + (G.grip[j * 3 + 2] - G.grip[i * 3 + 2]) * f);
    wm.position.copy(_a).sub(_b.copy(w.rh).applyQuaternion(_q));
    wm.updateMatrix();
    // the left hand goes onto the gun, wherever this gun has its grip
    const two = B.two[i];
    if (two > 0.01) {
      const A = a.arms[0], T = B.ht;
      _c.copy(w.lh).applyMatrix4(wm.matrix);
      _a.set(T[i * 6], T[i * 6 + 1], T[i * 6 + 2]).lerp(_c, two);
      armIK(-1, _a.x, _a.y, _a.z, 0, 0, 0, A.upper.quaternion, A.fore.quaternion, A.shoulder.position);
    }
  }

  // someone else killed him: he falls by himself, and the scene closes from here
  interrupt() { this.loose = true; this.exit = Math.min(this.exit, this.t); }
  over() { return this.t >= this.exit + EXIT; }

  // ---- where the attacker stands at the end of the scene
  endSample() { return Math.min(this.clip.n - 1, Math.round((this.exit + EXIT) * HZ)); }
  endGround(out) { const P = this.clip.a.pos, i = this.endSample(); return this.world(P[i * 3], 0, P[i * 3 + 2], out); }
  endYaw() {
    const Q = this.clip.a.q, k = this.endSample() * JOINTS.length * 4;
    _e.set(0, 0, -1).applyQuaternion(_q3.set(Q[k], Q[k + 1], Q[k + 2], Q[k + 3]));
    return this.yaw + Math.atan2(-_e.x, -_e.z);
  }

  // ---- worked out beforehand: where the camera would end up behind a wall, it stays closer all along, softly
  plan() {
    const n = this.clip.n, step = 6, m = Math.ceil(n / step), col = this.g.col, raw = new Float32Array(m), other = new Float32Array(m);
    // the side it was shot for, unless there is a wall in the way and the other one is free
    const one = clearance(this.F, this.o, this.rootQ, col, 1, raw), two = one < 0.9 ? clearance(this.F, this.o, this.rootQ, col, -1, other) : 0;
    this.side = two > one + 0.1 ? -1 : 1;
    if (this.side < 0) raw.set(other);
    // first as low as the lowest near it, then soft
    const low = new Float32Array(m), soft = new Float32Array(m), R = 5;
    for (let k = 0; k < m; k++) { let v = 1; for (let d = -R; d <= R; d++) v = Math.min(v, raw[Math.max(0, Math.min(m - 1, k + d))]); low[k] = v; }
    for (let k = 0; k < m; k++) { let v = 0; for (let d = -R; d <= R; d++) v += low[Math.max(0, Math.min(m - 1, k + d))]; soft[k] = v / (2 * R + 1); }
    this.reach = soft; this.reachStep = step;
  }

  camera(cam, from) {
    const { clip, t } = this, C = clip.cam, s = this.sample(), i = Math.floor(s), f = s - i, j = i + 1;
    // a cut is a cut: the frame before it isn't smeared into the one after
    for (const c of C.cuts) if (this.lastS < c && i >= c) this.g.engine.filmOld = false;
    this.lastS = i;
    const pos = _a, look = _b;
    const lx = C.look[i * 3] + (C.look[j * 3] - C.look[i * 3]) * f, px = C.pos[i * 3] + (C.pos[j * 3] - C.pos[i * 3]) * f;
    this.world(this.side > 0 ? px : 2 * lx - px, C.pos[i * 3 + 1] + (C.pos[j * 3 + 1] - C.pos[i * 3 + 1]) * f, C.pos[i * 3 + 2] + (C.pos[j * 3 + 2] - C.pos[i * 3 + 2]) * f, pos);
    this.world(lx, C.look[i * 3 + 1] + (C.look[j * 3 + 1] - C.look[i * 3 + 1]) * f, C.look[i * 3 + 2] + (C.look[j * 3 + 2] - C.look[i * 3 + 2]) * f, look);
    let fov = C.fov[i] + (C.fov[j] - C.fov[i]) * f;
    const q = this.reach[Math.min(this.reach.length - 1, Math.floor(s / this.reachStep))];
    if (q < 1) pos.lerpVectors(look, pos, q);
    // a blast is the one thing that moves the camera by itself
    if (this.bump > 0.001) {
      const b = this.bump * this.bump * 0.03;
      pos.y += Math.sin(t * 34) * b; pos.x += Math.sin(t * 27 + 1) * b;
      this.bump = Math.max(0, this.bump - this.dt * 1.8);
    }
    // into the scene from your head, back into your head at the end: all the way keeping an eye on whatever it looked at
    const ie = quint(clamp01((t - this.t0) / ENTER)), oe = this.staysOut ? 0 : quint(clamp01((t - this.exit) / EXIT));
    if (ie < 1) {
      if (!this.fromLook) {
        this.v.chest.getWorldPosition(_c);
        this.fromLook = new THREE.Vector3(0, 0, -1).applyQuaternion(from.quat).multiplyScalar(Math.max(1, _c.distanceTo(from.pos))).add(from.pos);
      }
      pos.lerpVectors(from.pos, pos, ie); look.lerpVectors(this.fromLook, look, ie); fov = from.fov + (fov - from.fov) * ie;
    }
    if (oe > 0) {
      this.endGround(_c); _c.y = this.o.y + 1.62;
      const y = this.endYaw();
      _d.set(_c.x - Math.sin(y) * 4, _c.y, _c.z - Math.cos(y) * 4);
      pos.lerp(_c, oe); look.lerp(_d, oe); fov += (from.fov - fov) * oe;
    }
    _m.lookAt(pos, look, UP);
    _q.setFromRotationMatrix(_m);
    cam.position.copy(pos); cam.quaternion.copy(_q); cam.fov = fov; cam.updateProjectionMatrix();
    // the camera starts and ends inside this head (with you as the victim it starts low down in your own body)
    if (this.staysOut) {
      this.v.head.getWorldPosition(_d); this.v.chest.getWorldPosition(_c);
      this.v.setVisible(Math.min(_d.distanceTo(pos), _c.distanceTo(pos)) > 0.8);
      return;
    }
    this.a.head.getWorldPosition(_d);
    this.a.setVisible(_d.distanceTo(pos) > 0.5);
  }
}

// ---------------------------------------------------------------------------
// What gets held
// ---------------------------------------------------------------------------
function box(g, m, w, h, d, x, y, z) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; }

export function makeProp(kind) {
  const g = new THREE.Group();
  const steel = new THREE.MeshLambertMaterial({ color: 0xe6eaee, emissive: 0x30363c }), grip = new THREE.MeshLambertMaterial({ color: 0x1c1c1e });
  if (kind === 'knife') {
    // a real combat knife: you have to see it from three meters away
    box(g, grip, 0.034, 0.12, 0.03, 0, -0.02, 0);
    box(g, steel, 0.05, 0.016, 0.03, 0, 0.045, 0);
    const v = [[-0.005, 0, -0.022], [0.005, 0, -0.022], [0.005, 0, 0.022], [-0.005, 0, 0.022], [0, 0.23, 0.014]], f = [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4], [0, 2, 1], [0, 3, 2]], p = [];
    for (const q of f) for (const i of q) p.push(...v[i]);
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); bg.computeVertexNormals();
    const b = new THREE.Mesh(bg, steel); b.position.y = 0.05; g.add(b);
  } else if (kind === 'axe') {
    const wood = new THREE.MeshLambertMaterial({ color: 0x6a4a30 }), head = new THREE.MeshLambertMaterial({ color: 0x70767c, emissive: 0x181a1c });
    box(g, wood, 0.034, 0.52, 0.03, 0, 0.14, 0);
    box(g, head, 0.05, 0.11, 0.09, 0, 0.36, -0.03);
    const v = [[-0.02, 0.3, -0.07], [0.02, 0.3, -0.07], [0.02, 0.42, -0.07], [-0.02, 0.42, -0.07], [0, 0.27, -0.21], [0, 0.45, -0.21]];
    const t = [[0, 1, 4], [1, 2, 5], [1, 5, 4], [2, 3, 5], [3, 0, 4], [3, 4, 5]], p = [];
    for (const q of t) for (const i of q) p.push(...v[i]);
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); bg.computeVertexNormals();
    const b = new THREE.Mesh(bg, steel); b.material = new THREE.MeshLambertMaterial({ color: 0xc8ced4, emissive: 0x20242a, side: THREE.DoubleSide }); g.add(b);
  } else {
    const o = new THREE.MeshLambertMaterial({ color: 0x46502e }), y = new THREE.MeshLambertMaterial({ color: 0xd8b838 });
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), o); s.scale.y = 1.25; g.add(s);
    box(g, y, 0.07, 0.012, 0.07, 0, 0.02, 0);
    box(g, grip, 0.028, 0.03, 0.028, 0, 0.06, 0);
    box(g, grip, 0.016, 0.07, 0.016, 0.018, 0.03, 0);
    g.scale.setScalar(1.6);
  }
  g.traverse((o) => { o.frustumCulled = false; o.layers.enable(1); });
  g.visible = false;
  return g;
}
