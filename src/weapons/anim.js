// =============================================================================
// Keyframed viewmodel animation clips (reloads, bolt/pump cycles, draw, inspect)
//   W  (weapon offset, camera space):   [t, px,py,pz, rx,ry,rz]
//   L/R (hand target, weapon space):    [t, anchor, px,py,pz, rx,ry,rz]
//   S  (scalar part drives):            { name: [[t, v], ...] }
//   A  (magazine attachment states):    [[t, 'gun'|'hand'|'swap'|'drop'|'hidden'], ...]
//   E  (events, fired once):            [[t, name], ...]
// t is normalized 0..1, scaled by the clip duration.
// =============================================================================

const Z6 = [0, 0, 0, 0, 0, 0];

// Catmull-Rom over numeric keys (columns from `start`)
export function sampleKeys(keys, t, start, n, out) {
  if (!keys || !keys.length) { for (let i = 0; i < n; i++) out[i] = 0; return out; }
  if (t <= keys[0][0]) { for (let i = 0; i < n; i++) out[i] = keys[0][start + i]; return out; }
  const last = keys[keys.length - 1];
  if (t >= last[0]) { for (let i = 0; i < n; i++) out[i] = last[start + i]; return out; }
  let k = 0;
  while (k < keys.length - 2 && keys[k + 1][0] < t) k++;
  const k0 = keys[Math.max(0, k - 1)], k1 = keys[k], k2 = keys[k + 1], k3 = keys[Math.min(keys.length - 1, k + 2)];
  const u = (t - k1[0]) / Math.max(1e-6, k2[0] - k1[0]);
  const u2 = u * u, u3 = u2 * u;
  for (let i = 0; i < n; i++) {
    const p0 = k0[start + i], p1 = k1[start + i], p2 = k2[start + i], p3 = k3[start + i];
    // damped tangents to avoid overshoot on holds (springs add the "life" later)
    const m1 = (p2 - p0) * 0.5 * 0.8, m2 = (p3 - p1) * 0.5 * 0.8;
    out[i] = (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * m2;
  }
  return out;
}

export function sampleScalar(keys, t) {
  if (!keys) return 0;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t <= b[0]) {
      let u = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
      u = u * u * (3 - 2 * u);
      return a[1] + (b[1] - a[1]) * u;
    }
  }
  return keys[keys.length - 1][1];
}

export function stateAt(keys, t) {
  if (!keys) return null;
  let s = keys[0][1];
  for (const k of keys) { if (k[0] <= t) s = k[1]; else break; }
  return s;
}

// ------------------------------------------------------------------- clips
// Rifle reload poses: the weapon is swung up to ~60° on screen,
// muzzle up-left, left flank turned to the camera so the magwell faces the left hand; a little
// anticipation before big moves, a hard kick when the new magazine seats. Springs in the viewmodel add
// follow-through on top. The left hand fetches magazines from the vest ('vest' anchor, fixed to the body),
// so its whole trip stays believable where our wider FOV shows more than the reference does.
// [x, y, z] offset from the hip + Euler 'YXZ' (pitch, yaw, roll)
export const RPA = [-0.02, 0.03, -0.03, 0.95, 1.0, 0.0];  // tactical, first beat: ~45° on screen
export const RP = [-0.01, 0.04, -0.03, 1.25, 1.1, 0.0];   // tactical, settles steeper: ~60°
export const RPE = [0.0, 0.05, -0.02, 1.38, 1.15, 0.04];  // empty: ~65°, the spent mag is flicked out
const at = (t, p, dx = 0, dy = 0, dz = 0, drx = 0, dry = 0, drz = 0) => [t, p[0] + dx, p[1] + dy, p[2] + dz, p[3] + drx, p[4] + dry, p[5] + drz];
const H = (t, anchor, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => [t, anchor, x, y, z, rx, ry, rz];
// the fresh mag comes in from the lower left close to the camera, lying on its side (feed end pointing at the
// well), turns upright on the way and is rocked into the well front-first
const MAG_IN = (t0) => [
  H(t0, 'mag', -0.14, -0.2, 0.04, 0.9, 0, 0.2), H(t0 + 0.06, 'mag', -0.07, -0.1, 0.02, 0.5, 0, 0.12),
  H(t0 + 0.13, 'mag', -0.01, -0.035, 0.005, 0.15, 0, 0.04),
];

// Magazine reloads (2.5 s tactical / 1.65 s empty).
//   tactical: two-mag speed swap. The rifle swings up-left while the left hand dives to the vest for the
//             fresh mag, brings it up and clacks it against the old one, rips both out together, hops sideways
//             so the fresh one lines up, slams it home and tugs it to check, then throws the old mag away and
//             the rifle twists back down
//   empty:    the rifle is swung up hard and the spent mag is flicked out of the well (it sails off to the
//             upper left); fresh mag from the vest comes in on its side, slammed home, palm smack on the
//             baseplate, then a flat-hand slap on the bolt catch and a twist back ('charge' style racks the
//             handle instead)
// The fresh mag sits on the camera side of the old one in the hand, so lining it up is a hop toward the rifle's
// right side (hand X runs along weapon (0.9, 0, 0.43)).
const SW = [0.038, 0, 0.018];
export function magReload(dur, empty, style = 'bolt') {
  if (empty) return magReloadEmpty(dur, style);
  const W = [
    [0, ...Z6],
    [0.035, 0.006, -0.012, 0.01, -0.07, -0.05, 0.08],        // anticipation: dip & counter-roll
    at(0.1, RPA),                                            // swung up-left, the hand is already gone
    at(0.22, RPA, -0.004, 0.006, 0, 0.1, 0.04, 0),           // climbing while the fresh mag is fetched
    at(0.3, RP, 0.004, -0.006, 0, -0.04, 0, 0.02),           // fresh mag arrives: clack
    at(0.345, RP, 0, 0.004, 0, 0.03, 0, 0),
    at(0.38, RP, -0.004, 0.016, 0, 0.12, 0.03, -0.04),       // RIP both out: the rifle kicks up
    at(0.47, RP, 0.004, -0.004, 0, -0.03, -0.02, 0.03),      // the hand hops sideways
    at(0.54, RP, 0.004, -0.014, 0, -0.08, 0, 0.02),          // dips to meet it
    at(0.58, RP, 0.008, 0.026, 0, 0.18, -0.03, -0.05),       // SLAM
    at(0.615, RP, 0.004, -0.008, 0, -0.06, 0, 0.02),         // tug check
    at(0.66, RP, 0.006, 0.006, 0, 0.04, 0.02, 0),
    [0.74, -0.025, 0.018, 0.012, 0.42, 0.3, 0.32],           // twists the other way as it swings down
    [0.83, 0.006, -0.004, 0.004, 0.04, -0.02, -0.08],        // overshoots
    [0.92, 0.002, -0.004, 0, -0.03, 0, 0.025],               // settles
    [1, ...Z6],
  ];
  const L = [
    H(0, 'home'), H(0.06, 'mag', -0.05, -0.1, 0.05, 0.3, 0, 0.3),   // off the handguard, straight down...
    H(0.15, 'vest'), H(0.19, 'vest', 0.01, 0.03),                   // ...to the vest: draw the fresh mag
    H(0.25, 'mag', -0.03, -0.11, 0.02, 0.1, 0, 0.12),               // up beside the old one
    H(0.3, 'mag', 0, -0.006, 0), H(0.345, 'mag'),                   // clack, grip both
    H(0.4, 'mag', 0, -0.13, 0),                                     // rip both out
    H(0.47, 'mag', SW[0], -0.12, SW[2], 0, 0, 0.08),                // hop: fresh one under the well
    H(0.53, 'mag', SW[0], -0.035, SW[2], 0, 0, 0.04),               // front-first into the well
    H(0.58, 'mag', ...SW), H(0.6, 'mag', SW[0], -0.014, SW[2]), H(0.625, 'mag', ...SW),  // slam, tug
    H(0.66, 'mag', -0.02, -0.12, 0.06, 0.3, 0, 0.4),                // pulls away with the old mag...
    H(0.7, 'mag', -0.12, -0.22, 0.1, 0.6, 0, 0.8),                  // ...and throws it
    H(0.82, 'home'), H(1, 'home'),
  ];
  const E = [[0.04, 'pouch'], [0.17, 'magGrab'], [0.3, 'magKnock'], [0.38, 'magOut'], [0.58, 'magIn'], [0.58, 'refill'], [0.6, 'magTug'], [0.69, 'toss']];
  return { name: 'reload', dur, W, L, S: {}, E, A: [[0, 'gun'], [0.17, 'spare'], [0.37, 'pair'], [0.58, 'swapIn'], [0.69, 'toss']] };
}

function magReloadEmpty(dur, style) {
  const W = [
    [0, ...Z6],
    [0.04, 0.006, -0.014, 0.01, -0.08, -0.06, 0.1],          // anticipation
    at(0.1, RPE, 0.01, -0.01, 0, -0.12, -0.12, 0.1),         // swing up...
    at(0.14, RPE, -0.01, 0.022, -0.01, 0.14, 0.16, -0.14),   // ...and FLICK: the spent mag sails out of the well
    at(0.2, RPE, 0, 0, 0, -0.02, -0.02, 0.02),
    at(0.32, RPE, -0.006, 0.004, 0.004, 0.02, 0.03, 0.02),   // drifts while the fresh mag is fetched
    at(0.48, RPE, 0.004, -0.012, 0, -0.06, 0, 0.02),         // dips to meet it
    at(0.57, RPE, 0.006, 0.02, 0, 0.15, -0.02, -0.03),       // SEAT
    at(0.62, RPE, 0.004, 0, 0, -0.01, -0.01, 0),
  ];
  const L = [
    H(0, 'home'), H(0.06, 'mag', -0.04, -0.1, 0.04, 0.3, 0, 0.3),   // off the handguard, out of the mag's way
    H(0.16, 'vest'), H(0.2, 'vest', 0.01, 0.03),                    // straight down to the vest, draw
    ...MAG_IN(0.3), H(0.57, 'mag'), H(0.62, 'mag', 0, -0.012, 0),   // in from the left, palm on the baseplate
  ];
  const E = [[0.05, 'magTouch'], [0.12, 'pouch'], [0.14, 'magOut'], [0.2, 'magGrab'], [0.57, 'magIn'], [0.57, 'refill'], [0.605, 'magTap']];
  const S = { openUp: [[0, 0], [0.575, 0], [0.58, 1], [0.63, 1], [0.64, 0], [1, 0]] };
  if (style === 'bolt') {
    W.push(
      at(0.68, RPE, 0.02, -0.004, 0.01, -0.12, -0.1, -0.18),  // presents the left side of the receiver
      at(0.73, RPE, 0.022, -0.008, 0.012, -0.14, -0.1, -0.2),
      at(0.76, RPE, 0.03, 0.022, 0, 0.02, -0.1, -0.1),        // bolt slams home: kick, and down it goes...
      [0.84, -0.02, 0.016, 0.006, 0.2, 0.18, 0.3],            // ...twisting the other way
      [0.92, 0.004, -0.005, 0, -0.02, -0.02, -0.06], [1, ...Z6]);
    L.push(H(0.68, 'bcatch', -0.05, 0.01, 0), H(0.73, 'bcatch', -0.01, 0, 0), H(0.76, 'bcatch', -0.045, 0.01, 0.01), H(0.88, 'home'), H(1, 'home'));
    S.openSide = [[0, 0], [0.665, 0], [0.67, 1], [0.79, 1], [0.8, 0], [1, 0]];
    E.push([0.755, 'boltRelease']);
  } else {
    W.push([0.7, -0.045, 0.036, 0.035, 0.42, 0.16, -0.2], [0.75, -0.04, 0.03, 0.055, 0.38, 0.15, -0.18], [0.785, -0.038, 0.046, 0.03, 0.5, 0.14, -0.17],
      [0.9, 0.003, -0.005, 0, -0.035, -0.01, 0.025], [1, ...Z6]);
    L.push(H(0.7, 'charge', 0, 0.01, -0.01), H(0.75, 'charge', 0, 0, 0.075), H(0.78, 'charge', 0.02, 0.035, 0.075, 0.3), H(0.9, 'home'), H(1, 'home'));
    S.charge = [[0, 0], [0.7, 0], [0.75, 1], [0.765, 1], [0.785, 0], [1, 0]];
    E.push([0.745, 'chargeBack'], [0.785, 'chargeFwd']);
  }
  return { name: 'reload', dur, W, L, S, E, A: [[0, 'gun'], [0.14, 'fling'], [0.2, 'handNew'], [0.57, 'gun']] };
}

export function boxReload(dur) {
  const P1 = [-0.045, 0.045, 0.03, 0.22, 0.26, 0.28];   // rolled left: show the feed cover
  const P2 = [-0.06, 0.05, 0.03, 0.5, 0.26, -0.38];     // rolled right: magwell
  const W = [
    [0, ...Z6], [0.04, 0.004, -0.01, 0.006, -0.05, -0.03, -0.06], at(0.12, P1), at(0.18, P1, 0, 0, 0, 0.04),
    at(0.26, P2), at(0.42, P2), at(0.62, P2), at(0.68, P2, 0, 0, 0, -0.06), at(0.72, P2, 0, 0.012, 0, 0.1),
    at(0.77, P1), at(0.84, P1, 0, -0.012, 0, -0.06), [0.9, -0.01, 0.01, 0.01, 0.06, 0.04, 0.0], [1, ...Z6],
  ];
  const L = [
    H(0, 'home'), H(0.08, 'cover', 0, 0.01, -0.06), H(0.15, 'cover', 0, 0.08, -0.04, 0.3),
    H(0.24, 'mag', 0, -0.03), H(0.3, 'mag'), H(0.42, 'mag', -0.09, -0.22, 0.06, 0.4, 0, 0.3),
    H(0.5, 'low'), H(0.58, 'low'), H(0.66, 'mag', -0.03, -0.1, 0.02, 0.1, 0, 0.1),
    H(0.72, 'mag'), H(0.78, 'cover', 0, 0.09, -0.05, 0.3), H(0.84, 'cover', 0, -0.005, -0.06), H(0.95, 'home'), H(1, 'home'),
  ];
  return {
    name: 'reload', dur, W, L, S: { cover: [[0, 0], [0.1, 0], [0.16, 1], [0.78, 1], [0.84, 0], [1, 0]] },
    E: [[0.15, 'coverOpen'], [0.32, 'magOut'], [0.72, 'magIn'], [0.72, 'refill'], [0.84, 'coverClose'], [0.9, 'chargeFwd']],
    A: [[0, 'gun'], [0.3, 'hand'], [0.54, 'swap'], [0.72, 'gun']],
  };
}

// Pistol reload: the pistol is rolled hard so the grip points at the left hand and
// lifted toward the center; the mag falls free, the left hand brings the fresh one from the vest and drives it home
export const PP = [-0.05, 0.06, -0.01, 0.5, 0.35, -1.0];
export function pistolReload(dur, empty) {
  const W = [
    [0, ...Z6], [0.05, 0.005, -0.012, 0.008, -0.08, -0.05, 0.1], at(0.14, PP, 0.006, -0.006, 0, -0.04, 0, 0.06),
    at(0.19, PP, -0.006, 0.01, 0, 0.06, 0.02, -0.06),        // mag released: a little flick
    at(0.45, PP, -0.004, 0.004, 0, 0.03),
    at(0.52, PP, 0, -0.012, 0, -0.08), at(0.56, PP, 0, 0.018, 0, 0.13), at(0.62, PP, 0, 0, 0, -0.02),
  ];
  const L = [H(0, 'home'), H(0.12, 'mag', -0.03, -0.12, 0.04, 0.3, 0, 0.3), H(0.27, 'vest'), H(0.33, 'vest', 0.01, 0.03),
    H(0.47, 'mag', 0, -0.08, 0.01, 0.1), H(0.56, 'mag'), H(0.6, 'mag', 0, 0.005), H(0.66, 'mag', 0, -0.04, 0.01)];
  const S = {};
  const E = [[0.18, 'magOut'], [0.33, 'magGrab'], [0.56, 'magIn'], [0.56, 'refill']];
  if (empty) {
    W.push([0.72, -0.03, 0.04, 0.03, 0.36, 0.2, -0.3], [0.785, -0.026, 0.052, 0.02, 0.48, 0.18, -0.26]);
    L.push(H(0.73, 'slide', 0, 0.01), H(0.77, 'slide', 0, 0.012, 0.03));
    S.slide = [[0, 1], [0.76, 1], [0.785, 0], [1, 0]];
    E.push([0.78, 'slideFwd']);
  }
  W.push([0.9, 0.003, -0.005, 0, -0.035, 0, 0.025], [1, ...Z6]);
  L.push(H(0.9, 'home'), H(1, 'home'));
  return { name: 'reload', dur, W, L, S, E, A: [[0, 'gun'], [0.18, 'drop'], [0.33, 'handNew'], [0.56, 'gun']] };
}

export function revolverReload(dur) {
  const OP = [-0.035, 0.05, 0.03, 0.5, 0.18, 0.62];
  return {
    name: 'reload', dur,
    W: [[0, ...Z6], [0.06, 0.004, -0.01, 0.006, -0.06, -0.03, -0.08], at(0.15, OP), at(0.21, OP, 0, 0.02, 0, 0.45, 0, -0.1), at(0.26, OP, 0, -0.01, 0, -0.05),
      at(0.58, OP), at(0.63, OP, 0, 0.012, 0, 0.08), at(0.82, OP, 0, 0, 0, -0.1, 0, -0.2), [0.87, -0.02, 0.03, 0.0, 0.18, 0.0, -0.22], [0.94, 0.003, -0.004, 0, -0.03, 0, 0.02], [1, ...Z6]],
    L: [H(0, 'home'), H(0.12, 'cyl', 0.0, -0.02, -0.02), H(0.2, 'cyl', 0.0, -0.02, 0.01), H(0.3, 'low'), H(0.46, 'low'),
      H(0.56, 'cylBack', 0, 0, 0.07), H(0.63, 'cylBack', 0, 0, 0.03), H(0.72, 'low', 0.04, 0.12, 0.05), H(0.88, 'home'), H(1, 'home')],
    S: { cyl: [[0, 0], [0.1, 0], [0.16, 1], [0.8, 1], [0.86, 0], [1, 0]], rounds: [[0, 1], [0.23, 1], [0.24, 0], [0.6, 0], [0.62, 1], [1, 1]] },
    E: [[0.16, 'cylOpen'], [0.23, 'ejectAll'], [0.62, 'loaderIn'], [0.62, 'refill'], [0.86, 'cylClose'], [0.93, 'hammer']],
    A: [[0, 'hidden'], [0.44, 'handNew'], [0.66, 'hidden']],
  };
}

const SP = [-0.03, 0.03, -0.045, 0.22, 0.22, -0.7]; // shotgun loading pose (port toward the left hand)
export function shotgunStart(dur = 0.36) {
  return { name: 'rstart', dur, W: [[0, ...Z6], [0.25, 0.004, -0.01, 0.006, -0.05, -0.03, 0.06], [1, ...SP]], L: [H(0, 'home'), H(1, 'port', 0, -0.05, 0.02)], S: {}, E: [] };
}
export function shotgunShell(dur) {
  return {
    name: 'rshell', dur,
    W: [[0, ...SP], at(0.78, SP, 0, -0.004, 0, -0.03), at(0.86, SP, 0, 0.01, -0.006, 0.07, 0, -0.03), [1, ...SP]],
    L: [H(0, 'port', 0, -0.05, 0.02), H(0.3, 'port', -0.05, -0.17, -0.02, 0.2, 0, 0.25), H(0.45, 'port', -0.05, -0.18, -0.02, 0.2, 0, 0.25), H(0.7, 'port', 0, -0.05, 0.02), H(0.84, 'port', 0, 0.004, 0.0), H(1, 'port', 0, -0.05, 0.02)],
    S: { shell: [[0, 0], [0.38, 0], [0.39, 1], [0.84, 1], [0.85, 0], [1, 0]] },
    E: [[0.84, 'shellIn']],
  };
}
export function shotgunEnd(dur = 0.34) {
  return { name: 'rend', dur, W: [[0, ...SP], [0.75, 0.003, -0.006, 0, -0.04, -0.01, 0.03], [1, ...Z6]], L: [H(0, 'port', 0, -0.05, 0.02), H(1, 'home')], S: {}, E: [] };
}
export function pumpCycle(dur) {
  return {
    name: 'pump', dur,
    W: [[0, ...Z6], [0.14, 0.0, 0.0, 0.0, 0.03, 0.02, -0.06], [0.34, -0.004, -0.014, 0.024, -0.07, 0.03, -0.14], [0.5, 0.0, -0.004, 0.006, -0.01, 0.01, -0.06], [0.66, 0.0, 0.008, -0.01, 0.05, 0, -0.02], [1, ...Z6]],
    L: [H(0, 'home'), H(1, 'home')],
    S: { pump: [[0, 0], [0.14, 0], [0.34, 1], [0.42, 1], [0.64, 0], [1, 0]] },
    E: [[0.33, 'pumpBack'], [0.36, 'eject'], [0.64, 'pumpFwd']],
  };
}
export function boltCycle(dur) {
  return {
    name: 'bolt', dur,
    W: [[0, ...Z6], [0.14, 0.006, 0.006, 0.0, 0.06, 0.04, 0.16], [0.42, 0.008, 0.0, 0.016, 0.03, 0.07, 0.22], [0.46, 0.008, 0.004, 0.01, 0.07, 0.07, 0.2], [0.62, 0.006, 0.002, -0.004, 0.05, 0.05, 0.16], [0.7, 0.003, 0.008, 0.0, 0.08, 0.03, 0.1], [1, ...Z6]],
    R: [H(0, 'home'), H(0.16, 'bolt'), H(0.23, 'bolt', 0, 0.012), H(0.43, 'bolt', 0, 0.012, 0.085), H(0.6, 'bolt', 0, 0.012, 0.0), H(0.68, 'bolt'), H(0.88, 'home'), H(1, 'home')],
    S: { boltLift: [[0, 0], [0.16, 0], [0.23, 1], [0.62, 1], [0.68, 0], [1, 0]], boltPull: [[0, 0], [0.23, 0], [0.43, 1], [0.6, 0], [1, 0]] },
    E: [[0.21, 'boltUp'], [0.41, 'boltBack'], [0.42, 'eject'], [0.58, 'boltFwd'], [0.67, 'boltDown']],
  };
}
export function drawClip(dur) {
  return { name: 'draw', dur, W: [[0, 0.03, -0.24, 0.06, -1.0, 0.3, -0.5], [0.55, -0.004, 0.01, 0, 0.07, -0.02, 0.05], [0.8, 0.002, -0.004, 0, -0.02, 0.0, -0.01], [1, ...Z6]], S: {}, E: [[0.05, 'draw']] };
}
export function holsterClip(dur) {
  return { name: 'holster', dur, W: [[0, ...Z6], [1, 0.03, -0.24, 0.06, -1.0, 0.3, -0.5]], S: {}, E: [[0.05, 'holster']] };
}
// armor plate: the gun dips away, the left hand goes to the vest and shoves the plate in
export function plateClip(dur) {
  return {
    name: 'plate', dur,
    W: [[0, ...Z6], [0.16, 0.01, -0.1, 0.04, -0.42, 0.16, 0.26], [0.72, 0.01, -0.11, 0.04, -0.44, 0.18, 0.28], [0.9, 0, -0.02, 0.01, -0.06, 0.02, 0.04], [1, ...Z6]],
    L: [H(0, 'home'), H(0.2, 'vest', 0, 0.02, -0.02), H(0.42, 'vest', 0, 0.14, -0.05), H(0.62, 'vest', 0, 0.1, -0.03, 0.3), H(0.85, 'home'), H(1, 'home')],
    S: {}, E: [[0.14, 'pouch'], [0.55, 'magKnock']],
  };
}
// knife: the gun drops down to the right, the knife comes across the screen from the upper left.
// K = the knife hand in camera space [t, x,y,z, twist of the blade around the forearm]
export function meleeClip(dur = 0.62) {
  return {
    name: 'melee', dur,
    W: [[0, ...Z6], [0.14, 0.05, -0.13, 0.03, -0.5, -0.22, -0.5], [0.42, 0.075, -0.17, 0.04, -0.62, -0.3, -0.62], [0.74, 0.03, -0.1, 0.02, -0.34, -0.12, -0.3], [1, ...Z6]],
    K: [
      [0, -0.42, -0.46, -0.24, 0.8],
      [0.13, -0.3, -0.02, -0.42, 0.75],     // cocked up at the left shoulder
      [0.21, -0.13, -0.04, -0.52, 0.2],     // starts across
      [0.3, 0.06, -0.1, -0.56, -0.7],       // through the middle: this is the hit
      [0.4, 0.27, -0.2, -0.48, -1.3],
      [0.58, 0.46, -0.52, -0.26, -1.6],     // out of the frame, lower right
      [1, 0.46, -0.6, -0.26, -1.6],
    ],
    S: {}, E: [[0.05, 'swing'], [0.27, 'meleeHit']],
  };
}
export function inspectClip(dur = 3.2) {
  return {
    name: 'inspect', dur,
    W: [[0, ...Z6], [0.05, 0.004, -0.01, 0.006, -0.05, -0.02, 0.06], [0.17, -0.07, 0.05, 0.04, 0.22, 0.6, 0.62], [0.4, -0.07, 0.056, 0.04, 0.27, 0.66, 0.7], [0.47, -0.06, 0.05, 0.04, 0.22, 0.5, 0.42],
      [0.6, -0.01, 0.06, 0.03, 0.12, -0.3, -0.62], [0.82, -0.01, 0.062, 0.03, 0.15, -0.34, -0.68], [0.9, -0.01, 0.02, 0.01, 0.06, -0.1, -0.2], [0.96, 0.003, -0.004, 0, -0.03, 0, 0.02], [1, ...Z6]],
    S: {}, E: [[0.1, 'inspect1'], [0.55, 'inspect2']],
  };
}
// first raise after spawning: weapon swings up and the charging handle is racked
export function firstRaise(dur, hasCharge) {
  return {
    name: 'raise', dur,
    W: [[0, 0.03, -0.24, 0.06, -1.0, 0.3, -0.5], [0.28, -0.04, 0.025, 0.02, 0.32, 0.18, -0.3], [0.48, -0.04, 0.02, 0.05, 0.28, 0.17, -0.27],
      [0.53, -0.038, 0.034, 0.03, 0.38, 0.15, -0.26], [0.72, -0.01, 0.01, 0.0, 0.08, 0.04, -0.06], [0.86, 0.003, -0.005, 0, -0.035, 0, 0.02], [1, ...Z6]],
    L: hasCharge ? [H(0, 'home'), H(0.3, 'charge', 0, 0.01, -0.01), H(0.46, 'charge', 0, 0, 0.075), H(0.53, 'charge', 0.02, 0.035, 0.075, 0.3), H(0.8, 'home'), H(1, 'home')] : undefined,
    S: hasCharge ? { charge: [[0, 0], [0.3, 0], [0.45, 1], [0.48, 1], [0.53, 0], [1, 0]] } : {},
    E: hasCharge ? [[0.02, 'draw'], [0.45, 'chargeBack'], [0.53, 'chargeFwd']] : [[0.02, 'draw']],
  };
}
