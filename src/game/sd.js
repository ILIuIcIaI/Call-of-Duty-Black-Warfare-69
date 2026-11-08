import * as THREE from 'three';
import { BombModel } from './bomb.js';
import { buildHands, box as vmBox } from '../weapons/models.js';
import { Shop, ECON } from './sdshop.js';

// =============================================================================
// Search and Destroy. Two teams, one bomb, no respawn within a round:
//   - the attackers carry the bomb to one of two sites and plant it there; the defenders stop them
//   - attackers win a round by killing all defenders or when the planted bomb goes off
//   - defenders win by killing all attackers before the bomb is down, by defusing it, or when the round
//     time runs out with nothing planted (a planted bomb keeps the round going even with no attacker left)
//   - ROUNDS rounds; after HALF of them the sides switch; whoever has more than half has won (4 of 6, so it can end early);
//     at 3 : 3 one more round decides, with the attackers drawn by lot
// Alone it all runs here; over the network the computer with the bots runs it and tells the others (see Net).
// =============================================================================
export const SD = {
  // (the user's times: 5 s to plant, 20 s on the clock once it is down, 5 s to defuse)
  FREEZE: 8, ROUND: 105, BOMB: 20, PLANT: 5, DEFUSE: 5, POST: 5, ROUNDS: 6, HALF: 3,
  BLAST: 9, BLAST_FAR: 22, SIZES: [4, 5, 6],
};
const SITES = ['A', 'B'];
const SIT_OUT = 'AB DER NÄCHSTEN RUNDE BIST DU DABEI';
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();
const _m4 = new THREE.Matrix4(), UPY = new THREE.Vector3(0, 1, 0);
// (on a back: the case flat against it, the panel facing out)
const ON_BACK = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));

// What the player's body and gun get to see of the input while he is held still: before the round begins, and
// while he plants or defuses. Looking around stays his.
const STILL = new Set(['forward', 'back', 'left', 'right', 'jump', 'sprint', 'dive', 'crouch', 'mount', 'reload', 'swap', 'weapon1', 'weapon2', 'melee', 'inspect', 'plate']);
class HeldInput {
  down(a) { return STILL.has(a) ? false : this.inp.down(a); }
  pressed(a) { return STILL.has(a) ? false : this.inp.pressed(a); }
  released(a) { return this.inp.released(a); }
  get fire() { return false; }
  get firePressed() { return false; }
  get ads() { return false; }
  get wheel() { return 0; }
  get dx() { return this.inp.dx; }
  get dy() { return this.inp.dy; }
  get suppress() { return this.inp.suppress; }
  set suppress(v) { this.inp.suppress = v; }
}

// ---- Planting and defusing, one sequence for everybody who sees it. Its steps in seconds for the 5 s plant and
// the 5 s defuse (a shorter one runs all of it faster; the last pose holds when it is longer).
// Plant: the case comes down in the right hand; the left flicks a latch and throws the lid open; the screen starts
// up; the right index finger flips the three arming switches, runs over the detonators (each lamp comes on), types
// the code on the trigger box while the left hand confirms it on the tablet, then holds the red button down while
// the device arms. Defuse: the switches back off, a code typed, the button held, the first detonator pulled out.
// The hands go from pose to pose on arcs; each press has its own little movement (the finger bends, the wrist
// follows it down and springs back) and the hands are never quite still.
// [time, spot on the case, offset from it, [pitch, yaw, roll] of the hand, finger bends, the part of the hand on it]
const HOVER = [-0.85, 0.25, -0.2], PRESS_C = [0.55, 0.16, 0.82, 0.88, 0.9];
const KEYC = [0.55, 0.14, 0.8, 0.85, 0.88], KEYR = [-0.8, 0.2, -0.15];
const SEQ = {
  plant: {
    // (calm and a little uneven, as hands are: the switches a third of a second apart, the detonators checked one by
    // one, the code typed with small pauses, the wrist a little different on every key)
    R: [
      [0, 'handle', [0, 0.012, -0.004], [0.25, 0, 0], [0.75, 0.92, 0.95, 0.95, 0.95], 'grip'],
      [0.6, 'handle', [0, 0.012, -0.004], [0.25, 0, 0], [0.75, 0.92, 0.95, 0.95, 0.95], 'grip'],
      [0.98, 'switch0', [0, 0.03, 0.018], HOVER, PRESS_C, 'index'],
      [1.37, 'switch1', [0.001, 0.03, 0.017], [-0.82, 0.22, -0.17], PRESS_C, 'index'],
      [1.74, 'switch2', [0, 0.031, 0.018], [-0.87, 0.27, -0.22], PRESS_C, 'index'],
      [2.04, 'switch2', [0.004, 0.04, 0.024], [-0.78, 0.25, -0.18], [0.5, 0.2, 0.7, 0.8, 0.85], 'index'],
      [2.2, 'det0', [-0.004, 0.027, 0.018], [-0.64, 0.14, -0.1], [0.42, 0.24, 0.52, 0.62, 0.68], 'index'],
      [2.39, 'det1', [-0.003, 0.026, 0.019], [-0.6, 0.1, -0.06], [0.42, 0.24, 0.55, 0.64, 0.7], 'index'],
      [2.57, 'det2', [-0.005, 0.027, 0.017], [-0.58, 0.07, -0.09], [0.44, 0.26, 0.55, 0.65, 0.7], 'index'],
      [2.76, 'det3', [-0.004, 0.026, 0.018], [-0.62, 0.05, -0.12], [0.42, 0.24, 0.53, 0.63, 0.69], 'index'],
      [3.0, 'key4', [0, 0.032, 0.022], KEYR, KEYC, 'index'],
      [3.12, 'key3', [0, 0.026, 0.018], [-0.78, 0.22, -0.14], KEYC, 'index'],
      [3.4, 'key6', [0.001, 0.026, 0.018], [-0.82, 0.18, -0.17], KEYC, 'index'],
      [3.63, 'key0', [0, 0.027, 0.019], [-0.79, 0.23, -0.13], KEYC, 'index'],
      [3.93, 'key8', [0, 0.026, 0.018], [-0.83, 0.17, -0.16], KEYC, 'index'],
      [4.16, 'button', [0, 0.03, 0.01], [-0.7, 0.15, -0.12], [0.5, 0.2, 0.75, 0.8, 0.85], 'index'],
      [4.32, 'button', [0, 0.007, 0.0], [-0.62, 0.15, -0.12], [0.45, 0.34, 0.74, 0.8, 0.85], 'index'],
      [5, 'button', [0, 0.006, 0.0], [-0.6, 0.15, -0.1], [0.45, 0.36, 0.72, 0.78, 0.84], 'index'],
    ],
    L: [
      [0, 'latchL', [0, 0.05, 0.035], [-0.6, 0.2, 0.2], [0.4, 0.4, 0.55, 0.6, 0.65], 'index'],
      [0.3, 'latchL', [0, 0.016, 0.012], [-0.8, 0.2, 0.2], [0.4, 0.35, 0.6, 0.65, 0.7], 'index'],
      [0.44, 'latchL', [0, 0.022, 0.012], [-0.8, 0.2, 0.2], [0.4, 0.35, 0.6, 0.65, 0.7], 'index'],
      [0.5, 'lidEdge', [0, -0.006, 0.012], [-0.35, 0.15, 0.15], [0.6, 0.6, 0.62, 0.64, 0.66], 'grip'],
      [0.74, 'lidEdge', [0, -0.006, 0.012], [-1.2, 0.15, 0.15], [0.6, 0.6, 0.62, 0.64, 0.66], 'grip'],
      [1.04, 'rimL', [0.03, 0.022, 0], [0.08, -0.35, 0.1], [0.3, 0.25, 0.28, 0.3, 0.32], 'palm'],
      [3.1, 'rimL', [0.03, 0.024, 0.004], [0.06, -0.33, 0.1], [0.32, 0.27, 0.3, 0.32, 0.34], 'palm'],
      [3.3, 'tablet', [0, 0.032, 0.016], [-0.75, -0.2, 0.15], [0.5, 0.15, 0.75, 0.8, 0.85], 'index'],
      [3.6, 'tablet', [0.002, 0.034, 0.018], [-0.72, -0.22, 0.17], [0.5, 0.18, 0.72, 0.8, 0.85], 'index'],
      [3.92, 'rimL', [0.035, 0.022, -0.01], [0.08, -0.38, 0.1], [0.3, 0.25, 0.28, 0.3, 0.32], 'palm'],
      [5, 'rimL', [0.035, 0.022, -0.012], [0.07, -0.36, 0.1], [0.3, 0.26, 0.29, 0.31, 0.33], 'palm'],
    ],
    // [time, length, hand, how deep, what it presses]
    taps: [[0.34, 0.12, 'L', 0.012, 'latch'], [1.06, 0.26, 'R', 0.022, 'sw0'], [1.44, 0.25, 'R', 0.022, 'sw1'], [1.8, 0.26, 'R', 0.022, 'sw2'],
      [2.24, 0.14, 'R', 0.018, 'det0'], [2.43, 0.13, 'R', 0.018, 'det1'], [2.61, 0.14, 'R', 0.018, 'det2'], [2.8, 0.13, 'R', 0.018, 'det3'],
      [3.17, 0.19, 'R', 0.02, 'key3'], [3.45, 0.18, 'R', 0.02, 'key6'], [3.68, 0.19, 'R', 0.02, 'key0'], [3.98, 0.18, 'R', 0.02, 'key8'],
      [3.38, 0.17, 'L', 0.02, 'tab'], [4.24, 0.15, 'R', 0.014, 'btn']],
    held: 4.32,
  },
  defuse: {
    R: [
      [0, 'switch2', [0, 0.034, 0.02], HOVER, PRESS_C, 'index'],
      [0.28, 'switch2', [0, 0.03, 0.018], HOVER, PRESS_C, 'index'],
      [0.62, 'switch1', [0.001, 0.03, 0.017], [-0.82, 0.22, -0.17], PRESS_C, 'index'],
      [0.96, 'switch0', [0, 0.031, 0.018], [-0.87, 0.27, -0.22], PRESS_C, 'index'],
      [1.24, 'switch0', [0.004, 0.04, 0.024], [-0.78, 0.25, -0.18], [0.5, 0.2, 0.7, 0.8, 0.85], 'index'],
      [1.44, 'key1', [0, 0.026, 0.018], [-0.78, 0.22, -0.14], KEYC, 'index'],
      [1.7, 'key5', [0.001, 0.026, 0.018], [-0.82, 0.18, -0.17], KEYC, 'index'],
      [1.95, 'key7', [0, 0.027, 0.019], [-0.79, 0.23, -0.13], KEYC, 'index'],
      [2.22, 'button', [0, 0.03, 0.01], [-0.7, 0.15, -0.12], [0.5, 0.2, 0.75, 0.8, 0.85], 'index'],
      [2.4, 'button', [0, 0.007, 0.0], [-0.62, 0.15, -0.12], [0.45, 0.34, 0.74, 0.8, 0.85], 'index'],
      [3.65, 'button', [0, 0.006, 0.0], [-0.6, 0.15, -0.1], [0.45, 0.36, 0.72, 0.78, 0.84], 'index'],
      [4.15, 'det', [0, 0.006, 0.004], [-0.7, 0.3, -0.3], [0.45, 0.5, 0.8, 0.9, 0.9], 'pinch'],
      [5, 'det', [0, 0.006, 0.004], [-0.75, 0.3, -0.32], [0.55, 0.55, 0.82, 0.9, 0.9], 'pinch'],
    ],
    L: [
      [0, 'rimL', [0.03, 0.022, 0], [0.08, -0.35, 0.1], [0.3, 0.25, 0.28, 0.3, 0.32], 'palm'],
      [1.05, 'rimL', [0.03, 0.022, 0], [0.08, -0.35, 0.1], [0.3, 0.25, 0.28, 0.3, 0.32], 'palm'],
      [1.25, 'tablet', [0, 0.032, 0.016], [-0.75, -0.2, 0.15], [0.5, 0.15, 0.75, 0.8, 0.85], 'index'],
      [1.55, 'tablet', [0.002, 0.034, 0.018], [-0.72, -0.22, 0.17], [0.5, 0.18, 0.72, 0.8, 0.85], 'index'],
      [1.85, 'rimL', [0.035, 0.022, -0.01], [0.08, -0.38, 0.1], [0.3, 0.25, 0.28, 0.3, 0.32], 'palm'],
      [5, 'rimL', [0.035, 0.022, -0.012], [0.07, -0.36, 0.1], [0.3, 0.26, 0.29, 0.31, 0.33], 'palm'],
    ],
    taps: [[0.34, 0.25, 'R', 0.022, 'sw2'], [0.68, 0.25, 'R', 0.022, 'sw1'], [1.02, 0.25, 'R', 0.022, 'sw0'],
      [1.49, 0.18, 'R', 0.02, 'key1'], [1.75, 0.18, 'R', 0.02, 'key5'], [2.0, 0.18, 'R', 0.02, 'key7'],
      [1.33, 0.17, 'L', 0.02, 'tab'], [2.31, 0.15, 'R', 0.014, 'btn']],
    held: 2.4,
  },
};
const sm = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
// a press: a little lift first, quick down, a moment on it, back up slower
const pressCurve = (v) => (v < 0.12 ? -0.25 * Math.sin((v / 0.12) * Math.PI) : v < 0.42 ? sm((v - 0.12) / 0.3) : v < 0.56 ? 1 : 1 - sm((v - 0.56) / 0.44));
// the lid's way open: quick, a little past, back
const lidK = (u) => { u = Math.max(0, Math.min(1, u)); return u < 0.75 ? sm(u / 0.75) * 1.05 : 1.05 - 0.05 * sm((u - 0.75) / 0.25); };
const seqScale = (need) => Math.min(1, need / 5);
// what the bomb shows at time t of a piece of work (for its model, its sounds and the hands)
function workState(kind, t, need) {
  const S = SEQ[kind], s = seqScale(need), T = (x) => x * s;
  const tap = (what) => S.taps.find((p) => p[4] === what);
  const after = (what, k = 0.5) => { const p = tap(what); return p ? t > T(p[0] + p[1] * k) : false; };
  let key = -1, digits = 0;
  for (const p of S.taps) {
    if (!p[4].startsWith('key')) continue;
    if (t >= T(p[0] + p[1] * 0.3) && t < T(p[0] + p[1] * 0.75)) key = +p[4].slice(3);
    if (t > T(p[0] + p[1] * 0.5)) digits++;
  }
  if (kind === 'plant') {
    const st = { bring: Math.min(1, t / T(0.3)), lid: lidK((t - T(0.46)) / T(0.24)), sw: [0, 1, 2].map((i) => after('sw' + i, 0.55)), det: [0, 1, 2, 3].map((i) => after('det' + i, 0.4)), key, tab: after('tab', 0.5), trig: t > T(S.held) };
    st.screen = t < T(0.72) ? ['off'] : t < T(1.0) ? ['boot', (t - T(0.72)) / T(0.28)] : ['arm', (t - T(1.0)) / Math.max(0.1, need - T(1.0)), digits];
    return st;
  }
  return { bring: 1, lid: 1, sw: [0, 1, 2].map((i) => !after('sw' + i, 0.55)), det: [!(t > need - 0.6), true, true, true], key, tab: true, trig: t > T(S.held) && t < need - 1.35, pull: sm((t - (need - 0.75)) / 0.65) };
}
// the sounds of it, each once when its moment is passed
function workSounds(g, w, t0, t1, pos) {
  const S = SEQ[w.kind], s = seqScale(w.need), T = (x) => x * s;
  const at = (x, name, vol, rate) => { if (T(x) > t0 && T(x) <= t1) g.audio.play(name, { pos, vol, rate }); };
  if (w.kind === 'plant') { at(0.3, 'caseDown', 1, 1); at(0.46, 'lidOpen', 1, 1); at(0.76, 'bootBeep', 0.6, 1); at(0.86, 'bootBeep', 0.6, 1.12); at(0.96, 'bootBeep', 0.6, 1.25); }
  for (const p of S.taps) {
    const hit = p[0] + p[1] * 0.45, w4 = p[4];
    if (w4 === 'latch') at(hit, 'latch', 0.9, 1);
    else if (w4.startsWith('sw')) at(hit, 'toggle', 1, 1 + (+w4[2]) * 0.05);
    else if (w4.startsWith('det')) at(hit, 'uiClick', 0.55, 2.3 + (+w4[3]) * 0.1);
    else if (w4.startsWith('key')) at(hit, 'bootBeep', 0.5, 1.45 + (+w4[3] % 3) * 0.08);
    else if (w4 === 'tab') at(hit, 'uiClick', 0.6, 1.7);
    else if (w4 === 'btn') at(hit, 'toggle', 0.9, 0.7);
  }
  // (the button held: a soft beep every half second, rising while it arms; pulling the detonator out)
  const from = T(S.held), until = w.kind === 'plant' ? w.need : w.need - 1.35;
  if (t1 > from && t1 < until && Math.floor((t1 - from) / 0.45) !== Math.floor((t0 - from) / 0.45)) g.audio.play('holdBeep', { pos, vol: 0.5, rate: w.kind === 'plant' ? 1 + Math.min(0.5, (t1 - from) * 0.3) : 0.85 });
  if (w.kind === 'defuse' && t0 <= w.need - 0.75 && t1 > w.need - 0.75) g.audio.play('detPull', { pos, vol: 1 });
}
// the model of the bomb at that moment (the case comes down from `from` to where it is put, as `at`)
const _bq = new THREE.Quaternion(), _be = new THREE.Euler();
function poseBomb(bomb, st, from, at, yaw) {
  const R = bomb.root;
  if (st.bring < 1 && from) {
    const u = sm(st.bring);
    R.position.lerpVectors(from, at, u); R.position.y += Math.sin(u * Math.PI) * 0.06;
    R.quaternion.setFromEuler(_be.set(0.4 * (1 - u), yaw, -0.3 * (1 - u), 'YXZ'));
  } else { R.position.copy(at); R.quaternion.setFromEuler(_be.set(0, yaw, 0, 'YXZ')); }
  bomb.handle.rotation.x = st.bring < 1 || st.lid < 0.2 ? 0 : -1.2;
  bomb.lid(st.lid);
  st.sw.forEach((on, i) => bomb.flip(i, on));
  if (st.det) st.det.forEach((on, i) => bomb.detLed(i, on));
  bomb.key(st.key ?? -1);
  if (st.tab !== undefined) bomb.tablet(st.tab);
  bomb.trigger(!!st.trig);
  if (st.pull !== undefined) bomb.pull(st.pull);
}

// The hands you see while you plant or defuse: gloves with jointed fingers, the forearms turned toward the
// shoulders every frame (long sleeves that run out of the picture). In the world, next to the bomb everybody sees.
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const _e = new THREE.Euler(0, 0, 0, 'YXZ'), _hq = new THREE.Quaternion(), _hx = new THREE.Vector3(1, 0, 0), _fw = new THREE.Vector3();
class HandsAtWork {
  constructor(game) {
    const M = game.weapons.vm.mats;
    // A hand as the ones on the guns: a rounded palm with a pad over the knuckles and the ball of the thumb, four
    // fingers of three joints each, thinner toward the tip, a pad on each knuckle, the thumb of three joints; fingers
    // along -Z, the palm facing down. Then the wrist, the sleeve's cuff and the forearm, a watch on the left.
    const hand = (mirror) => {
      const g = new THREE.Group(), fingers = [];
      const cap = (r, L, mat = M.glove) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, L, 4, 10), mat); m.rotation.x = Math.PI / 2; m.position.z = -L / 2; return m; };
      vmBox(g, M.glove, 0.08, 0.028, 0.088, 0, 0, -0.004, 0, 0, 0, 0.011);
      vmBox(g, M.glovePad || M.glove, 0.066, 0.007, 0.044, 0, 0.0145, -0.017, 0, 0, 0, 0.003);
      vmBox(g, M.glove, 0.032, 0.022, 0.042, 0.025 * -mirror, -0.005, 0.012, 0, 0, 0, 0.009);
      // [x across the palm, length, radius]
      for (const [x, L, r] of [[-0.0275, 0.064, 0.0088], [-0.0092, 0.076, 0.0093], [0.0092, 0.073, 0.0091], [0.0275, 0.059, 0.0083]]) {
        const xm = x * mirror, L1 = L * 0.45, L2 = L * 0.31, L3 = L * 0.24;
        vmBox(g, M.glovePad || M.glove, 0.015, 0.007, 0.016, xm, 0.0105, -0.045, 0, 0, 0, 0.003);
        const k1 = new THREE.Group(); k1.position.set(xm, -0.003, -0.045); g.add(k1);
        k1.add(cap(r, L1));
        const k2 = new THREE.Group(); k2.position.z = -L1 - r * 0.45; k1.add(k2);
        k2.add(cap(r * 0.94, L2));
        const k3 = new THREE.Group(); k3.position.z = -L2 - r * 0.42; k2.add(k3);
        k3.add(cap(r * 0.87, L3));
        const tip = new THREE.Object3D(); tip.position.z = -L3 - r * 0.85; k3.add(tip);
        fingers.push({ k1, k2, k3, tip });
      }
      // the thumb from the ball of the hand, angled in
      const t0 = new THREE.Group(); t0.position.set(0.033 * -mirror, -0.007, 0.004); t0.rotation.set(0.15, 0.8 * mirror, 0); g.add(t0);
      t0.add(cap(0.0112, 0.028));
      const t1 = new THREE.Group(); t1.position.z = -0.034; t0.add(t1);
      t1.add(cap(0.0102, 0.022));
      const t2 = new THREE.Group(); t2.position.z = -0.028; t1.add(t2);
      t2.add(cap(0.0094, 0.015));
      const ttip = new THREE.Object3D(); ttip.position.z = -0.024; t2.add(ttip);
      fingers.unshift({ k1: t0, k2: t1, k3: t2, tip: ttip, thumb: true });
      // the wrist (the glove's), the sleeve's cuff and the forearm, as on the guns
      const arm = new THREE.Group(); arm.position.set(0, 0.002, 0.04); g.add(arm);
      const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.033, 0.06, 12), M.glove); wrist.position.y = 0.02; arm.add(wrist);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.04, 14), M.sleeve); cuff.position.y = 0.07; arm.add(cuff);
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.052, 0.56, 14), M.sleeve); fore.position.y = 0.36; arm.add(fore);
      if (mirror < 0 && M.watch) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.0335, 0.0335, 0.02, 14), M.watch); w.position.y = 0.035; arm.add(w);
        vmBox(arm, M.watch, 0.022, 0.012, 0.024, 0, 0.035, -0.033);
        const face = new THREE.Mesh(new THREE.CircleGeometry(0.009, 12), new THREE.MeshBasicMaterial({ color: 0x40ff90 })); face.position.set(0, 0.035, -0.0395); face.rotation.y = Math.PI; arm.add(face);
      }
      return { g, arm, fingers, mirror };
    };
    this.L = hand(-1); this.R = hand(1);
    this.arms = [this.L, this.R];
    void buildHands;
    this.inv = new THREE.Matrix4();
    this.root = new THREE.Group();
    this.root.add(this.L.g, this.R.g);
    this.root.visible = false;
    game.scene.add(this.root);
    this.k = 0;
    this.tgt = new THREE.Vector3();
  }
  dispose() { if (this.root.parent) this.root.parent.remove(this.root); }

  // the fingers bent: [thumb, index, middle, ring, little], 0 straight .. 1 in a fist
  curl(H, c) {
    H.fingers.forEach((f, i) => {
      const v = c[i] ?? 0.5;
      if (f.thumb) { f.k1.rotation.x = 0.15 - v * 0.45; f.k2.rotation.x = -v * 0.7; f.k3.rotation.x = -v * 0.6; } else { f.k1.rotation.x = -v * 1.15; f.k2.rotation.x = -v * 1.35; f.k3.rotation.x = -v * 1.05; }
    });
  }
  // where a part of the hand is with the hand at the origin turned as it is: 'palm', 'index' (its tip), 'thumb' (its
  // tip), 'grip' (inside the bent fingers), 'pinch' (between thumb and index)
  anchor(H, name, out) {
    if (name === 'palm') return out.set(0, 0, 0);
    H.g.updateMatrixWorld(true);
    const P = H.g.position;
    const at = (f, v) => f.tip.getWorldPosition(v).sub(P);
    if (name === 'index') return at(H.fingers[1], out);
    if (name === 'thumb') return at(H.fingers[0], out);
    if (name === 'pinch') { at(H.fingers[0], out); return out.add(at(H.fingers[1], _fw)).multiplyScalar(0.5); }
    // grip: the middle finger's first joint
    H.fingers[2].k2.getWorldPosition(out).sub(P);
    return out.lerp(at(H.fingers[2], _fw), 0.3);
  }
  // a hand turned (pitch, yaw, roll, around the bomb's own yaw) and bent, with its `anchor` on `target`
  place(H, target, yaw, pitch, dyaw, roll, curls, anchor) {
    H.g.rotation.copy(_e.set(pitch, yaw + dyaw, roll, 'YXZ'));
    this.curl(H, curls);
    H.g.position.set(0, 0, 0);
    const a = this.anchor(H, anchor, _c);
    H.g.position.copy(target).sub(a);
  }
  // one pose of the sequence, where it puts the hand
  solve(H, key, bomb, yaw, M) {
    bomb.spot(key[1], _a).add(_b.set(key[2][0], key[2][1], key[2][2])).applyMatrix4(M);
    this.place(H, _a, yaw, key[3][0], key[3][1], key[3][2], key[4], key[5]);
    return { p: H.g.position.clone(), q: H.g.quaternion.clone(), c: key[4] };
  }
  // the hand at time t: between two poses on an arc, a press if one is on, and a little life in it
  pose(H, keys, taps, hand, t, s, bomb, yaw, M, seed) {
    let i = keys.findIndex((k) => k[0] * s > t);
    if (i < 0) i = keys.length;
    const k0 = keys[Math.max(0, i - 1)], k1 = keys[Math.min(keys.length - 1, i)];
    const t0 = k0[0] * s, t1 = k1[0] * s, raw = t1 > t0 ? Math.max(0, Math.min(1, (t - t0) / (t1 - t0))) : 1;
    // (the wrist turns first, the hand follows on its way, the fingers settle last)
    const u = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2, ur = sm(Math.min(1, raw * 1.4)), uc = sm(raw * 0.85 + (raw > 0.9 ? (raw - 0.9) * 1.5 : 0));
    const A = this.solve(H, k0, bomb, yaw, M), B = k1 === k0 ? A : this.solve(H, k1, bomb, yaw, M);
    const dist = A.p.distanceTo(B.p);
    H.g.position.lerpVectors(A.p, B.p, u); H.g.position.y += Math.sin(u * Math.PI) * Math.min(0.045, dist * 0.45);
    H.g.quaternion.slerpQuaternions(A.q, B.q, ur);
    const c = A.c.map((v, j) => v + (B.c[j] - v) * Math.min(1, uc));
    // the press on now: down along the finger, the finger bending, the wrist following it down and back, the
    // fingers beside it going a little with it
    for (const p of taps) {
      if (p[2] !== hand) continue;
      const v = (t - p[0] * s) / (p[1] * s);
      if (v < 0 || v > 1) continue;
      const d = pressCurve(v), after = v > 0.56 ? Math.sin((v - 0.56) / 0.44 * Math.PI) * 0.25 : 0;
      H.g.position.y -= d * p[3];
      _fw.set(0, 0, -1).applyQuaternion(H.g.quaternion); _fw.y = 0;
      if (_fw.lengthSq() > 1e-6) H.g.position.addScaledVector(_fw.normalize(), d * 0.006);
      H.g.quaternion.multiply(_hq.setFromAxisAngle(_hx, -0.15 * d + 0.05 * after));
      c[1] += 0.3 * d; c[2] += 0.12 * d; c[3] += 0.06 * d; c[0] -= 0.07 * d;
    }
    // (never quite still: the hand rises and sinks with the breath, drifts a little, trembles a very little; the
    // fingers too)
    const n = (a, b, amp) => Math.sin(t * a + seed * b) * amp;
    H.g.position.x += n(1.1, 1.3, 0.0016) + n(3.7, 0.9, 0.0004); H.g.position.y += n(1.6, 2.1, 0.0022) + n(8.3, 1.1, 0.00025); H.g.position.z += n(0.9, 0.7, 0.0015);
    H.g.quaternion.multiply(_hq.setFromEuler(_e.set(n(1.25, 1, 0.025), n(0.8, 1.7, 0.02), n(0.95, 2.3, 0.03), 'YXZ')));
    this.curl(H, c.map((v, j) => v + n(1.8 + j * 0.4, 1.7 + j, 0.045)));
  }

  // w: the work under way (or null), bomb: the BombModel, p: the player, cam: the camera
  update(dt, w, bomb, p, cam) {
    const on = !!(w && w.ent === p);
    this.k = Math.max(0, Math.min(1, this.k + (on ? dt / 0.16 : -dt / 0.18)));
    this.root.visible = this.k > 0.01;
    if (!this.root.visible) return;
    const R = bomb.root;
    R.updateWorldMatrix(true, false);
    const yaw = this.yaw = on ? w.yaw : this.yaw ?? 0;
    const t = on ? w.t : this.lastT || 0;
    if (on) this.lastT = t;
    const kind = this.kind = on ? w.kind : this.kind || 'plant';
    const need = this.need = on ? w.need : this.need || SD.PLANT;
    const S = SEQ[kind], s = seqScale(need), e = cam.matrixWorld.elements;
    // (where the hands come from and go back to: below the eyes, left and right)
    const away = (m, out) => out.set(cam.position.x - e[4] * 0.5 + e[0] * 0.2 * m - e[8] * 0.1, cam.position.y - e[5] * 0.5 + e[1] * 0.2 * m - e[9] * 0.1, cam.position.z - e[6] * 0.5 + e[2] * 0.2 * m - e[10] * 0.1);
    for (const [H, keys, hand, seed] of [[this.R, S.R, 'R', 1], [this.L, S.L, 'L', 2]]) {
      this.pose(H, keys, S.taps, hand, t, s, bomb, yaw, R.matrixWorld, seed);
      this.tgt.copy(H.g.position);
      away(H.mirror, _b);
      H.g.position.lerpVectors(_b, this.tgt, sm(this.k));
    }
    // the forearms: from the wrist back to a shoulder a little below and beside the eyes
    this.arms.forEach(({ g, arm, mirror }) => {
      _a.set(cam.position.x + e[0] * 0.36 * mirror - e[4] * 0.45 + e[8] * 0.1, cam.position.y + e[1] * 0.36 * mirror - e[5] * 0.45 + e[9] * 0.1, cam.position.z + e[2] * 0.36 * mirror - e[6] * 0.45 + e[10] * 0.1);
      g.updateWorldMatrix(true, false);
      _a.applyMatrix4(this.inv.copy(g.matrixWorld).invert()).sub(arm.position).normalize();
      arm.quaternion.setFromUnitVectors(UP, _a);
    });
  }
}
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// The sites and the spawns of both sides: the map's own (`sd`), or for trying it out on a map that has none (dev)
// two spots on the defenders' half, the ones furthest apart.
export function sdOf(def) {
  if (def.sd) {
    const S = def.sd.sites;
    return { sites: SITES.map((id) => ({ id, x: S[id][0], y: S[id][1], z: S[id][2], r: S[id][3] })), attack: def.sd.attack, defend: def.sd.defend };
  }
  const sp = def.spawns(), att = sp[0], dfd = sp[1];
  const mid = (l) => l.reduce((a, s) => ({ x: a.x + s[0] / l.length, z: a.z + s[2] / l.length }), { x: 0, z: 0 });
  const A = mid(att), Dm = mid(dfd);
  // (on the ground: a spot on a roof or a container would be a site nobody can stand on from below)
  const hs = (def.hotspots || []).filter((h) => h[1] < 0.6 && Math.hypot(h[0] - Dm.x, h[2] - Dm.z) < Math.hypot(h[0] - A.x, h[2] - A.z) && Math.hypot(h[0] - Dm.x, h[2] - Dm.z) > 6);
  let best = null, bd = -1;
  for (const a of hs) for (const b of hs) { const d = Math.hypot(a[0] - b[0], a[2] - b[2]); if (d > bd) { bd = d; best = [a, b]; } }
  if (!best) best = [[Dm.x - 8, 0, Dm.z], [Dm.x + 8, 0, Dm.z]];
  return { sites: best.map((h, i) => ({ id: SITES[i], x: h[0], y: h[1], z: h[2], r: 4.5 })), attack: att, defend: dfd };
}

export class SearchDestroy {
  constructor(game, match) {
    this.game = game; this.match = match;
    const d = sdOf(game.mapDef);
    this.sites = d.sites;
    const pts = (l) => l.map(([x, y, z, yaw]) => ({ x, y, z, yaw }));
    this.spawnList = { attack: pts(d.attack), defend: pts(d.defend) };
    this.score = [0, 0];
    this.round = 0;
    this.attack = match.cfg.attack ?? 0; // (the player's team carries the bomb first)
    this.phase = 'wait'; this.left = 0;
    this.carrier = null; this.dropped = null; this.planted = null;
    this.work = null;
    this.used = new Set();
    this.final = -1;
    this.targetSite = null; this.defuser = null; this.fetcher = null;
    this.hot = null; this.anchor = null; this.execute = false; this.gatherT = null; this.fallen = new Set(); this.goals = new Map();
    this.beepT = 0;
    this.bomb = new BombModel(); this.bomb.root.visible = false; game.scene.add(this.bomb.root);
    this.packed = new BombModel({ simple: true }); this.packed.root.visible = false; game.scene.add(this.packed.root);
    this.packed.root.scale.setScalar(0.58);
    this.spectate = null; this.specT = 0;
    this.el = null;
    this.hands = new HandsAtWork(game);
    this.shop = new Shop(this);
  }

  // while you plant or defuse: no gun in your hands, and your eyes on the bomb
  hidesGun() { return this.hands.root.visible; }
  // Kneeling at it: the eyes go down onto the spot while the case comes down, then lean in over it as the lid opens,
  // low and close (breathing a little).
  workCam(cam) {
    const k = this.hands.k, e = k * k * (3 - 2 * k);
    if (e <= 0.001) return;
    const w = this.work, at = w && w.at ? w.at : this.bomb.root.position, yaw = w && w.yaw !== undefined ? w.yaw : this.hands.yaw || 0;
    const t = this.game.time, cy = Math.cos(yaw), sy = Math.sin(yaw);
    const loc = (x, y, z, out) => out.set(at.x + x * cy + z * sy, at.y + y, at.z - x * sy + z * cy);
    const s = w ? Math.min(1, w.need / 3.2) : 1, lean = !w ? 1 : w.kind === 'plant' ? sm((w.t - 0.44 * s) / (0.32 * s)) : sm(w.t / 0.35);
    const br = Math.sin(t * 1.3) * 0.003, bu = Math.sin(t * 0.9 + 1) * 0.004;
    loc(br, 0.66 - 0.16 * lean + bu, 0.44 - 0.18 * lean, _v);
    loc(0.0, 0.07 + 0.1 * lean, -0.01 - 0.09 * lean, _w);
    cam.position.lerp(_v, e);
    _m4.lookAt(cam.position, _w, UPY);
    _q.setFromRotationMatrix(_m4);
    cam.quaternion.slerp(_q, e);
    // (a wider view this close, so the whole case is in it)
    cam.fov += (62 - cam.fov) * e;
    cam.updateProjectionMatrix();
  }
  lookAtWork(dt) {
    const g = this.game, p = g.player, w = this.work;
    if (!w || w.ent !== p) return;
    const B = w.at || this.bomb.root.position, eye = p.pos.y + (p.eyeH ?? 1.05);
    const yaw = Math.atan2(-(B.x - p.pos.x), -(B.z - p.pos.z)), pitch = -Math.atan2(eye - B.y, Math.max(0.2, flat(p.pos, B)));
    let dy = yaw - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const k = 1 - Math.exp(-7 * dt);
    p.yaw += dy * k; p.pitch += (Math.max(-1.25, pitch + 0.3) - p.pitch) * k;
  }

  dispose() {
    this.bomb.dispose(); this.packed.dispose(); this.hands.dispose(); this.shop.dispose();
    document.getElementById('sb-timer').classList.remove('bomb');
    document.getElementById('hud').classList.remove('sd-working');
    document.getElementById('death-screen').classList.remove('watching');
    if (this.el) { this.el.remove(); this.el = null; }
    if (this.marks) for (const m of this.marks) m.remove();
    this.marks = null;
  }

  role(team) { return team === this.attack ? 'attack' : 'defend'; }

  // ---- over the network the PC with the bots decides the rounds and tells the others (snapshot); they follow it,
  // and what their own player does to the bomb they say as an event (plant, defuse, pick, work)
  get net() { const n = this.game.net; return n && n.inMatch ? n : null; }
  get auth() { const n = this.net; return !n || n.isAuth; }
  idOf(c) { const g = this.game; return !c ? null : c === g.player ? (this.net ? this.net.you : 'me') : c.netId || null; }
  byId(id) { const g = this.game, n = this.net; return !id || !n ? null : id === n.you ? g.player : n.byId.get(id) || null; }
  changed() { this.dirty = true; }
  // the bots changed hands (the PC that ran them left, or this one gave them up): the same people in new objects;
  // whatever a bot was doing stops, and this PC may be the one that decides from now on
  reresolve() {
    const re = (c) => (c && c.netId ? this.byId(c.netId) || c : c);
    this.carrier = re(this.carrier); this.defuser = re(this.defuser); this.fetcher = re(this.fetcher); this.anchor = re(this.anchor);
    if (this.planted) this.planted.by = re(this.planted.by);
    if (this.work && this.work.ent !== this.game.player) this.stopWork();
    this.remoteWork = null;
    if (!this.targetSite) this.targetSite = this.sites[(Math.random() * this.sites.length) | 0];
    for (const b of this.game.bots) if (!b.remote) b.hold = this.phase === 'freeze';
    this.changed();
  }
  send(a, extra = {}) { if (this.net) this.net.send({ t: 'ev', k: 'sd', a, ...extra }); }
  snapshot() {
    const P = this.planted, W = this.work || this.remoteWork, r2 = (v) => +v.toFixed(2);
    return { r: this.round, ph: this.phase, l: +this.left.toFixed(1), sc: [this.score[0], this.score[1]], a: this.attack, c: this.idOf(this.carrier),
      d: this.dropped ? [r2(this.dropped.x), r2(this.dropped.y), r2(this.dropped.z)] : null,
      p: P ? { s: P.site.id, x: r2(P.pos.x), y: r2(P.pos.y), z: r2(P.pos.z), w: r2(P.yaw), l: +P.left.toFixed(1), ok: !!P.done, by: this.idOf(P.by) } : null,
      w: W && W.ent ? { i: this.idOf(W.ent), k: W.kind, t: +(W.t || 0).toFixed(1) } : null,
      res: this.result || null, f: this.final };
  }
  // (sent when something changes, and once a second for the clocks; the end with the winner)
  sync(dt) {
    const n = this.net;
    if (!n || !n.isAuth) return;
    this.syncT = (this.syncT || 0) - dt;
    if (!this.dirty && this.syncT > 0) return;
    this.dirty = false; this.syncT = 1;
    const s = this.snapshot();
    n.send(this.phase === 'over' && this.final >= 0 ? { t: 'obj', s, win: this.final } : { t: 'obj', s });
  }
  // a PC that doesn't run the bots: the round as the one that does sees it
  apply(s) {
    if (!s || this.auth) return;
    const g = this.game;
    if (s.r > this.round || (this.phase === 'wait' && s.r >= 1)) {
      this.followRound(s);
      if (s.ph !== 'freeze') this.sitOut(); // (in while a round runs: from the next one)
    }
    this.attack = s.a; this.score = [s.sc[0], s.sc[1]]; this.final = s.f;
    const car = s.c ? this.byId(s.c) : null;
    if (car !== this.carrier) { this.carrier = car; if (car === g.player && s.ph !== 'post') g.hud.popup('', 'DU HAST DIE BOMBE'); }
    this.dropped = s.d ? new THREE.Vector3(s.d[0], s.d[1], s.d[2]) : null;
    if (s.p && !this.planted) {
      const site = this.sites.find((x) => x.id === s.p.s) || this.sites[0], by = this.byId(s.p.by);
      if (this.work && this.work.ent === g.player) this.stopWork();
      this.showPlant({ site, pos: new THREE.Vector3(s.p.x, s.p.y, s.p.z), yaw: s.p.w }, by);
      if (by === g.player) this.shop.pay(g.player, ECON.PLANT, 'BOMBE GELEGT');
    }
    if (this.planted && s.p) { this.planted.left = s.p.l; this.planted.done = s.p.ok; }
    const w = s.w ? this.byId(s.w.i) : null;
    const rw0 = this.remoteWork;
    this.remoteWork = w && w !== g.player ? (rw0 && rw0.ent === w && rw0.kind === s.w.k ? rw0 : { ent: w, kind: s.w.k, t: s.w.t }) : null;
    if (rw0 && rw0 !== this.remoteWork) this.remoteDone(rw0);
    if (s.ph === 'live' && this.phase === 'freeze') g.audio.play('spawn', { vol: 0.6 });
    if (s.ph === 'post' && s.res && this.resultRound !== s.r) { this.resultRound = s.r; this.roundOver(s.res.team, s.res.how, this.byId(s.res.by)); }
    this.phase = s.ph; this.left = s.l;
  }
  // what the others say their player did; only the PC with the bots decides on it (the rest is to see)
  onNet(m) {
    const g = this.game, e = this.byId(m.from);
    if (m.a === 'wdrop') { this.shop.netDrop(m); return; }
    if (m.a === 'work') { const rw0 = this.remoteWork; this.remoteWork = m.on && e ? { ent: e, kind: m.kind, t: 0 } : null; if (rw0 && rw0 !== this.remoteWork) this.remoteDone(rw0); if (this.auth) this.changed(); return; }
    if (!this.auth || !e) return;
    if (m.a === 'plant' && this.phase === 'live' && e === this.carrier && m.p) {
      const site = this.sites.find((x) => x.id === m.s) || this.inSite(e) || this.sites[0];
      this.plantAt(e, { site, pos: new THREE.Vector3(m.p[0], m.p[1], m.p[2]), yaw: +m.y || 0 });
    } else if (m.a === 'defuse' && this.phase === 'planted' && !this.planted.done && e.team !== this.attack && flat(e.pos, this.planted.pos) < 2.5) {
      this.remoteWork = null;
      this.defuse(e);
    } else if (m.a === 'pick' && this.phase === 'live' && this.dropped && e.team === this.attack && !this.carrier) {
      this.carrier = e; this.dropped = null; this.fetcher = null; this.changed();
      g.audio.play('pouch', { pos: e.pos, vol: 0.9 });
    }
  }
  holdsPlayer() { return this.phase === 'freeze' || (!!this.work && this.work.ent === this.game.player); }
  heldInput(inp) { const H = this.held || (this.held = new HeldInput()); H.inp = inp; return H; }
  aliveOf(team) { let n = 0; for (const c of this.game.combatants) if (c.alive && c.team === team) n++; return n; }
  inSite(e) {
    for (const s of this.sites) if (flat(e.pos, s) < s.r && Math.abs(e.pos.y - s.y) < 1.1) return s;
    return null;
  }

  // ---- spawns: each one once per round, the order mixed
  spawnFor(ent) {
    const list = this.spawnList[this.role(ent.team)];
    if (this.net) {
      const side = this.game.combatants.filter((c) => c.team === ent.team).map((c) => [c.isBot || (c.remote && this.net.cfg && (this.net.cfg.roster.find((r) => r.id === c.netId) || {}).bot) ? 1 : 0, this.idOf(c) || '']).sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1)).map((x) => x[1]);
      const p = list[Math.max(0, side.indexOf(this.idOf(ent))) % list.length];
      return { x: p.x, y: p.y, z: p.z, yaw: p.yaw, team: ent.team };
    }
    const free = list.filter((p) => !this.used.has(p));
    const p = (free.length ? free : list)[(Math.random() * (free.length || list.length)) | 0];
    this.used.add(p);
    return { x: p.x, y: p.y, z: p.z, yaw: p.yaw, team: ent.team };
  }

  // ---- rounds
  startRound() {
    const g = this.game;
    this.round++;
    if (this.round === SD.HALF + 1) this.attack = 1 - this.attack;
    if (this.round === SD.ROUNDS + 1) this.attack = Math.random() < 0.5 ? 0 : 1; // (3 : 3: the decider, sides by lot)
    this.resetRound();
    const att = g.combatants.filter((c) => c.team === this.attack), up = att.filter((c) => c.alive), from = up.length ? up : att;
    this.carrier = from.length ? from[(Math.random() * from.length) | 0] : null;
    this.targetSite = this.sites[(Math.random() * this.sites.length) | 0];
    this.changed();
    this.announceRound();
    if (this.carrier === g.player) g.hud.popup('', 'DU HAST DIE BOMBE');
  }
  followRound(s) {
    this.round = s.r; this.attack = s.a;
    this.resetRound();
    this.carrier = null;
    this.announceRound();
  }
  // Late into the match (or back from the lobby) while a round runs: nobody comes back to life in a round, you
  // neither. You watch your side, with no body anywhere (the others never see you up), and are in from the next one.
  sitOut() {
    const g = this.game, p = g.player;
    this.benched = true;
    if (!p.alive) return;
    p.alive = false; p.health = 0;
    g.lastKiller = null; g.deathCamT = 3; // (straight to a teammate)
    if (g.playerCorpse) g.playerCorpse.setVisible(false);
    g.weapons.vm.root.visible = false;
    const ds = document.getElementById('death-screen');
    ds.classList.remove('hidden'); ds.classList.add('watching');
    document.getElementById('death-by').textContent = '';
    document.getElementById('death-timer').textContent = SIT_OUT;
    g.hud.message('<span style="font-size:26px;letter-spacing:5px">' + (this.round > SD.ROUNDS ? 'ENTSCHEIDUNGSRUNDE' : 'RUNDE ' + this.round + ' / ' + SD.ROUNDS) + '</span><div style="font-size:15px;letter-spacing:3px;margin-top:4px">DIE RUNDE LÄUFT SCHON · ' + SIT_OUT + '</div>', 5);
  }
  resetRound() {
    const g = this.game, m = this.match;
    this.phase = 'freeze'; this.left = SD.FREEZE;
    this.benched = false;
    this.result = null; this.remoteWork = null; this.pending = null;
    this.used.clear();
    this.shop.startRound(this.round, this.round === SD.HALF + 1, this.round === SD.ROUNDS + 1);
    this.botsBought = false;
    this.planted = null; this.dropped = null; this.work = null; this.defuser = null; this.fetcher = null;
    this.hot = null; this.anchor = null; this.execute = false; this.gatherT = null; this.fallen.clear(); this.goals.clear();
    this.bomb.root.visible = false; this.bomb.reset();
    this.spectate = null;
    document.getElementById('death-screen').classList.remove('watching');
    if (g.playerCorpse) g.playerCorpse.setVisible(false);
    // everybody up again, at his side's spawns
    for (const c of g.combatants) {
      if (c.remote) continue;
      if (c === g.player) { g.spawnPlayer(); g.weapons.vm.root.visible = true; } else { m.spawn(c); this.shop.armBot(c); c.hold = true; c.busy = false; }
    }
  }
  announceRound() {
    const g = this.game, mine = this.role(g.player.team) === 'attack';
    const half = this.round === SD.HALF + 1 ? '<div style="font-size:15px;letter-spacing:4px;opacity:.85">SEITENWECHSEL</div>' : '';
    const title = this.round > SD.ROUNDS ? 'ENTSCHEIDUNGSRUNDE' : 'RUNDE ' + this.round + ' / ' + SD.ROUNDS;
    g.hud.message(half + '<span style="font-size:26px;letter-spacing:5px">' + title + '</span><div style="font-size:15px;letter-spacing:3px;margin-top:4px">' + (mine ? 'ANGRIFF · LEGT DIE BOMBE AUF A ODER B' : 'VERTEIDIGUNG · HALTET A UND B') + '</div>', SD.FREEZE - 0.5);
  }

  endRound(team, how, by = null) {
    this.score[team]++;
    this.result = { team, how, by: this.idOf(by) };
    this.resultRound = this.round;
    if (this.score[team] > SD.ROUNDS / 2 || this.round > SD.ROUNDS) this.final = team;
    this.changed();
    this.roundOver(team, how, by);
  }
  roundOver(team, how, by) {
    const g = this.game;
    if (!this.auth && how === 'boom' && this.planted) this.explode();
    if (!this.auth && how === 'defused' && this.planted) { this.bombSafe(); this.planted.done = true; if (by === g.player) this.shop.pay(g.player, ECON.DEFUSE, 'ENTSCHÄRFT'); }
    this.phase = 'post'; this.left = SD.POST;
    this.shop.endRound(team, how, !!this.planted);
    this.stopWork();
    const mine = team === g.player.team, att = team === this.attack;
    const why = how === 'boom' ? 'DIE BOMBE IST EXPLODIERT' : how === 'defused' ? 'DIE BOMBE WURDE ENTSCHÄRFT' : how === 'time' ? 'DIE ZEIT IST UM' : att ? 'ALLE VERTEIDIGER AUSGESCHALTET' : 'ALLE ANGREIFER AUSGESCHALTET';
    g.hud.message('<span style="font-size:30px;letter-spacing:5px;color:' + (mine ? 'var(--accent)' : 'var(--enemy)') + '">' + (mine ? 'RUNDE GEWONNEN' : 'RUNDE VERLOREN') + '</span><div style="font-size:15px;letter-spacing:3px;margin-top:4px">' + why + ' · ' + this.score[g.player.team] + ' : ' + this.score[1 - g.player.team] + '</div>', SD.POST - 0.3);
    g.audio.play(mine ? 'chargeFwd' : 'magDrop', { vol: 0.8 });
  }

  // ---- the bomb
  dropAt(pos) {
    const g = this.game;
    const y = g.col.floorBelow(pos.x, pos.z, 0.15, pos.y + 1.2, pos.y - 30);
    this.dropped = new THREE.Vector3(pos.x, Number.isFinite(y) ? y : pos.y, pos.z);
    this.fetcher = null;
    this.changed();
  }

  plantedAt(ent) {
    const g = this.game, site = this.inSite(ent) || this.sites[0];
    // in front of his feet, on the floor; the whole case clear of walls (its corners, and the lid's room behind it),
    // nearer to him where it isn't
    const yaw = ent.isPlayer ? ent.yaw : ent.aimYaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), sx = Math.cos(yaw), sz = -Math.sin(yaw);
    for (const d of [0.52, 0.44, 0.36]) {
      const x = ent.pos.x + fx * d, z = ent.pos.z + fz * d;
      const fy = g.col.floorBelow(x, z, 0.12, ent.pos.y + 0.6, ent.pos.y - 2);
      if (!Number.isFinite(fy) || Math.abs(fy - ent.pos.y) > 0.6 || !g.col.lineClear(ent.pos.x, ent.pos.y + 0.3, ent.pos.z, x, fy + 0.1, z)) continue;
      let ok = true;
      for (const [a, b] of [[0.27, 0.26], [0.27, -0.26], [-0.18, 0.26], [-0.18, -0.26]]) if (ok) ok = g.col.lineClear(x, fy + 0.08, z, x + fx * a + sx * b, fy + 0.08, z + fz * a + sz * b);
      if (ok) return { site, pos: new THREE.Vector3(x, fy, z), yaw };
    }
    return { site, pos: new THREE.Vector3(ent.pos.x, ent.pos.y, ent.pos.z), yaw };
  }

  plant(ent) { this.plantAt(ent, this.plantedAt(ent)); }
  plantAt(ent, at) {
    this.showPlant(at, ent);
    this.shop.pay(ent, ECON.PLANT, 'BOMBE GELEGT');
    this.changed();
  }
  showPlant(at, ent) {
    const g = this.game;
    this.planted = { site: at.site, pos: at.pos, yaw: at.yaw, left: SD.BOMB, by: ent };
    this.carrier = null; this.dropped = null; this.pending = null;
    this.phase = 'planted';
    this.beepT = 0;
    this.bomb.root.position.copy(at.pos); this.bomb.root.rotation.set(0, at.yaw, 0);
    this.bomb.root.visible = true; this.bombArmed();
    this.defuser = null;
    g.audio.play('armTone', { pos: at.pos, vol: 1 });
    const mine = (ent ? ent.team : this.attack) === g.player.team;
    g.hud.message('<span style="font-size:24px;letter-spacing:4px;color:' + (mine ? 'var(--accent)' : 'var(--enemy)') + '">BOMBE GELEGT · ' + at.site.id + '</span>', 2.6);
  }

  defuse(by) {
    const g = this.game;
    this.shop.pay(by, ECON.DEFUSE, 'ENTSCHÄRFT');
    this.bombSafe();
    g.audio.play('safeTone', { pos: this.planted.pos, vol: 1.1 });
    this.planted.done = true;
    this.endRound(1 - this.attack, 'defused', by);
  }

  bombArmed() {
    const B = this.bomb;
    B.lid(1); for (let i = 0; i < 3; i++) B.flip(i, true); B.trigger(false); B.pull(0); B.handle.rotation.x = -1.2;
    for (let i = 0; i < 4; i++) B.detLed(i, true); B.tablet(true); B.key(-1);
    B.setLed(true); B.screen('count', this.planted ? this.planted.left : SD.BOMB);
  }
  bombSafe() {
    const B = this.bomb;
    for (let i = 0; i < 3; i++) B.flip(i, false); B.trigger(false); B.pull(1);
    for (let i = 0; i < 4; i++) B.detLed(i, false); B.key(-1);
    B.setLed('green'); B.screen('safe');
  }
  // where the case comes from when it is put down: in the right hand, up and to the right, toward whoever puts it
  // down (from below your eyes, for you)
  carryFrom(at, yaw) {
    const x = 0.12, y = 0.24, z = 0.3, cy = Math.cos(yaw), sy = Math.sin(yaw);
    return new THREE.Vector3(at.x + x * cy + z * sy, at.y + y, at.z - x * sy + z * cy);
  }
  // somebody else's work over: an unfinished defuse leaves it armed, an unfinished plant takes the case away
  remoteDone(rw) {
    if (rw.kind === 'defuse' && this.planted && !this.planted.done) this.bombArmed();
    if (rw.kind === 'plant' && !this.planted && !this.pending) { this.bomb.root.visible = false; this.bomb.reset(); }
  }
  // somebody else at work (a bot here, anybody on another computer): the case, its lid and switches, its sounds
  remoteVisuals(dt) {
    const rw = this.remoteWork;
    if (!rw || !rw.ent || !rw.ent.alive) return;
    const t0 = rw.t || 0; rw.t = t0 + dt;
    const need = rw.kind === 'plant' ? SD.PLANT : SD.DEFUSE;
    if (rw.kind === 'plant') {
      if (this.planted || this.phase !== 'live') return;
      if (!rw.at) { const at = this.plantedAt(rw.ent); rw.at = at.pos; rw.yaw = at.yaw; rw.from = this.carryFrom(rw.at, rw.yaw); this.bomb.reset(); }
      const st = workState('plant', rw.t, need);
      poseBomb(this.bomb, st, rw.from, rw.at, rw.yaw);
      this.bomb.screen(st.screen[0], st.screen[1], st.screen[2]);
      this.bomb.root.visible = true;
      workSounds(this.game, { kind: 'plant', need }, t0, rw.t, rw.at);
    } else if (this.planted && !this.planted.done) {
      poseBomb(this.bomb, workState('defuse', rw.t, need), null, this.planted.pos, this.planted.yaw);
      workSounds(this.game, { kind: 'defuse', need }, t0, rw.t, this.planted.pos);
    }
  }

  explode() {
    const g = this.game, P = this.planted.pos;
    this.bomb.root.visible = false;
    const at = _v.set(P.x, P.y + 0.4, P.z);
    for (let i = 0; i < 4; i++) g.fx.explosion(_w.set(at.x + (Math.random() - 0.5) * 3, at.y + Math.random() * 1.5, at.z + (Math.random() - 0.5) * 3));
    g.audio.play('boom', { pos: P, vol: 2.4, maxDist: 400, occlude: false });
    g.audio.play('gun_amr', { pos: P, vol: 1.8, rate: 0.45, maxDist: 400, occlude: false });
    g.shake.add(Math.max(0.15, 1.4 - g.player.pos.distanceTo(P) * 0.03));
    for (const c of g.combatants) {
      if (!c.alive || c.remote) continue;
      const d = c.pos.distanceTo(P);
      if (d > SD.BLAST_FAR) continue;
      const dmg = d < SD.BLAST ? 999 : 999 * (1 - (d - SD.BLAST) / (SD.BLAST_FAR - SD.BLAST)) ** 1.5;
      g.applyDamage(c, dmg, null, { part: 'chest', dir: _w.copy(c.pos).sub(P).setY(0.4).normalize().clone(), point: c.pos.clone(), weapon: { name: 'BOMBE', damage: [999, 999] } });
    }
  }

  // ---- planting and defusing: the player holding F, or a bot (see botWork)
  canWork(e) {
    if (!e.alive) return null;
    if (this.phase === 'live' && e === this.carrier && this.inSite(e) && (e.isBot || e.onGround)) return 'plant';
    if (this.phase === 'planted' && !this.planted.done && e.team !== this.attack && flat(e.pos, this.planted.pos) < 1.5 && Math.abs(e.pos.y - this.planted.pos.y) < 1.3) {
      if (this.work && this.work.kind === 'defuse' && this.work.ent !== e) return null; // (one at a time)
      return 'defuse';
    }
    return null;
  }

  startWork(e, kind) {
    const g = this.game;
    this.work = { ent: e, kind, t: 0, need: kind === 'plant' ? SD.PLANT : SD.DEFUSE, keyT: 0, key: -1 };
    if (e.isBot) e.busy = true;
    if (e === g.player) {
      this.work.stance = e.stance;
      if (e.stance === 'stand') e.stance = 'crouch';
    }
    if (kind === 'plant') { const at = this.plantedAt(e); this.work.at = at.pos.clone(); this.work.yaw = at.yaw; this.work.from = this.carryFrom(at.pos, at.yaw); this.bomb.reset(); this.bomb.root.visible = true; }
    else if (this.planted) { this.work.at = this.planted.pos.clone(); this.work.yaw = this.planted.yaw; }
    g.audio.play('pouch', { pos: e.pos, vol: 0.9 });
    if (kind === 'defuse') this.defuser = e;
    if (e === g.player) this.send('work', { on: 1, kind }); else this.changed();
  }

  stopWork() {
    const w = this.work;
    if (!w) return;
    this.work = null;
    if (w.ent.isBot) w.ent.busy = false;
    if (w.ent === this.game.player) this.send('work', { on: 0 }); else this.changed();
    if (w.ent === this.game.player && w.stance === 'stand' && w.ent.canStand && w.ent.canStand('stand')) w.ent.stance = 'stand';
    if (w.kind === 'defuse' && this.planted && !this.planted.done) this.bombArmed();
    if (w.kind === 'plant' && this.phase !== 'planted' && !this.pending) { this.bomb.root.visible = false; this.bomb.reset(); }
  }

  updateWork(dt) {
    const g = this.game, p = g.player, w = this.work;
    if (w) {
      const e = w.ent;
      const holding = e === p ? g.input.down('interact') && !g.paused : !(e.target && e.targetVisible && e.target.alive);
      if (!holding || this.canWork(e) !== w.kind) { this.stopWork(); return; }
      const t0 = w.t; w.t += dt;
      // the case, its lid, switches and screen at this moment of it, and its sounds
      const st = workState(w.kind, w.t, w.need);
      poseBomb(this.bomb, st, w.from, w.at, w.yaw);
      if (st.screen) this.bomb.screen(st.screen[0], st.screen[1], st.screen[2]);
      else if (this.planted) this.bomb.screen('defuse', this.planted.left, w.t / w.need);
      if (w.kind === 'plant') this.bomb.root.visible = true;
      workSounds(g, w, t0, w.t, w.at || this.bomb.root.position);
      if (w.t >= w.need) {
        const kind = w.kind;
        if (!this.auth) {
          // (said, and shown as done until the word comes back)
          const at = kind === 'plant' ? this.plantedAt(e) : null;
          this.pending = kind;
          this.stopWork();
          if (at) { this.send('plant', { s: at.site.id, p: [+at.pos.x.toFixed(2), +at.pos.y.toFixed(2), +at.pos.z.toFixed(2)], y: +at.yaw.toFixed(2) }); this.bomb.root.visible = true; this.bombArmed(); }
          else this.send('defuse');
          return;
        }
        this.stopWork();
        if (kind === 'plant') this.plant(e); else this.defuse(e);
      }
      return;
    }
    // you: hold F
    if (p.alive && g.input.down('interact') && !g.paused && !this.shop.focus && !this.pending) { // (F on a gun on the floor picks it up instead)
      const k = this.canWork(p);
      if (k) this.startWork(p, k);
    }
  }

  // ---- once per frame
  update(dt) {
    const g = this.game, auth = this.auth;
    if (this.phase === 'wait') { if (auth) this.startRound(); this.sync(dt); return; }
    this.left -= dt;
    if (this.phase === 'freeze' && !this.botsBought && this.left < SD.FREEZE - 1.5) { this.botsBought = true; for (const b of g.bots) this.shop.botBuy(b); }
    if (this.phase !== 'post' && this.phase !== 'over') this.shop.update(dt);
    if (this.phase === 'freeze') {
      if (this.left <= 0 && auth) { this.changed(); this.phase = 'live'; this.left = SD.ROUND; for (const b of g.bots) b.hold = false; g.audio.play('spawn', { vol: 0.6 }); }
    } else if (this.phase === 'live' || this.phase === 'planted') {
      // a carrier who falls drops it, the first attacker to step on it picks it up
      if (this.carrier && !this.carrier.alive && auth) { this.dropAt(this.carrier.pos); this.carrier = null; }
      if (this.dropped && this.phase === 'live') {
        for (const c of g.combatants) {
          if (!c.alive || c.team !== this.attack || c.remote || flat(c.pos, this.dropped) > 0.9 || Math.abs(c.pos.y - this.dropped.y) > 1.6) continue;
          if (!auth) { if (c === g.player && g.time > (this.pickT || 0)) { this.pickT = g.time + 0.6; this.send('pick'); } break; }
          this.carrier = c; this.dropped = null; this.fetcher = null; this.changed();
          g.audio.play('pouch', { pos: c.pos, vol: 0.9 });
          if (c === g.player) g.hud.popup('', 'DU HAST DIE BOMBE');
          break;
        }
      }
      if (auth) { this.botWork(); if (this.phase === 'live') this.spot(); }
      this.updateWork(dt);
      this.remoteVisuals(dt);
      if (this.phase === 'planted') {
        const P = this.planted;
        P.left -= dt;
        // the lamp and the beep, faster and faster
        const k = Math.max(0, P.left / SD.BOMB), every = 0.12 + 0.9 * k * k;
        this.beepT -= dt;
        if (this.beepT <= 0) { this.beepT = every; g.audio.play('bombBeep', { pos: P.pos, vol: 1.1, maxDist: 60 }); this.bomb.setLed(true); }
        else if (this.beepT < every - 0.06) this.bomb.setLed(false);
        if (!P.done && !(this.work && this.work.kind === 'defuse')) { const rw = this.remoteWork; if (rw && rw.kind === 'defuse') this.bomb.screen('defuse', P.left, (rw.t || 0) / SD.DEFUSE); else this.bomb.screen('count', P.left); }
        if (this.phase === 'planted' && P.left <= 0 && auth) { this.stopWork(); this.explode(); this.endRound(this.attack, 'boom', P.by); this.sync(dt); return; }
      }
      if (this.phase === 'post' || !auth) { this.sync(dt); this.showCarried(); this.lookAtWork(dt); this.hands.update(dt, this.work, this.bomb, g.player, g.engine.camera); return; }
      if (this.aliveOf(1 - this.attack) === 0) { this.endRound(this.attack, 'elim'); return; }
      if (this.phase === 'live' && this.aliveOf(this.attack) === 0) { this.endRound(1 - this.attack, 'elim'); return; }
      if (this.phase === 'live' && this.left <= 0) { this.endRound(1 - this.attack, 'time'); return; }
    } else if (this.phase === 'post') {
      if (this.left <= 0 && auth) {
        if (this.final >= 0) { this.phase = 'over'; this.changed(); if (this.net) this.sync(dt); else this.match.end(this.final, 'rounds'); return; }
        this.startRound();
      }
    }
    this.sync(dt);
    this.showCarried();
    this.lookAtWork(dt);
    this.hands.update(dt, this.work, this.bomb, g.player, g.engine.camera);
  }

  // the bomb on the carrier's back, or on the floor where he fell; somebody on another computer planting: in front of him
  showCarried() {
    const R = this.packed.root, c = this.carrier, rw = this.remoteWork;
    if (rw && rw.kind === 'plant' && rw.ent && rw.ent.alive && this.phase === 'live' && !this.work) { R.visible = false; return; }
    if (this.phase === 'live' && !this.work && !this.pending && !this.planted) this.bomb.root.visible = false;
    if (c && c.alive && !(this.work && this.work.kind === 'plant')) {
      if (c === this.game.player) { R.visible = false; return; }
      const ch = c.soldier && c.soldier.chest;
      if (ch) {
        ch.updateWorldMatrix(true, false);
        R.position.set(0, 0.04, 0.16).applyMatrix4(ch.matrixWorld);
        ch.getWorldQuaternion(_q); R.quaternion.copy(_q).multiply(ON_BACK);
      } else { R.position.set(c.pos.x, c.pos.y + 1.1, c.pos.z); }
      R.visible = true;
    } else if (this.dropped) {
      R.position.copy(this.dropped); R.rotation.set(0, 0.6, 0); R.visible = true;
    } else R.visible = false;
  }

  // ---- bots: where to go (Match.objectiveFor) and when to get down to work
  objectiveFor(b) {
    if (this.phase === 'freeze' || this.phase === 'post' || this.phase === 'over' || this.phase === 'wait') return null;
    const att = b.team === this.attack;
    if (this.phase === 'planted') {
      const P = this.planted.pos;
      if (att) return this.goal('guard', P.x, P.y, P.z, 7, this.entryOf(this.planted.site, 'defend'));
      // the bot closest to it defuses, the others come and cover him (a player defuses when he wants to)
      if (!this.defuser || !this.defuser.alive || this.defuser.team === this.attack) this.defuser = this.closest(1 - this.attack, P);
      return b === this.defuser ? this.goal('defuse', P.x, P.y, P.z, 1.2) : this.goal('cover', P.x, P.y, P.z, 6);
    }
    const gun = b !== this.carrier ? this.shop.wantFor(b) : null;
    if (gun) return this.goal(gun, gun.obj.position.x, gun.obj.position.y, gun.obj.position.z, 0.7);
    if (att) {
      if (this.dropped) {
        if (!this.fetcher || !this.fetcher.alive) this.fetcher = this.closest(this.attack, this.dropped);
        if (b === this.fetcher) return this.goal('fetch', this.dropped.x, this.dropped.y, this.dropped.z, 0.9);
      }
      const s = this.targetSite || (this.targetSite = this.sites[0]);
      // first together a little way out (the defenders hear them there and come over), then in all at once
      if (!this.execute) {
        const st = this.entryOf(s, 'attack', 18);
        if (st && SD.ROUND - this.left < 30 && !this.gathered(st)) return this.goal(b === this.carrier ? 'gatherC' : 'gather', st.x, st.y, st.z, b === this.carrier ? 2.5 : 4, s);
        this.execute = true;
      }
      return b === this.carrier ? this.goal('plant' + s.id, s.x, s.y, s.z, Math.max(1.4, s.r * 0.5)) : this.goal('take' + s.id, s.x, s.y, s.z, s.r + 3, this.entryOf(s, 'defend'));
    }
    // defenders: half on each site, watching the way the attackers come in; once the attackers are seen or heard at a
    // site, or one of the defenders falls there, the others come over (one stays home while three or more are still
    // up and an attacker is somewhere else); all to the bomb once it is down
    const home = this.homeOf(b), s = this.hot && this.hot !== home && b !== this.anchor ? this.hot : home;
    return this.goal('hold' + s.id, s.x, s.y, s.z, s.r, this.entryOf(s, 'attack'));
  }
  // Where the way from one side's spawns comes into a site (the last bit of it more than `out` m outside the
  // circle): what to watch while holding it (Bot reads obj.look).
  entryOf(s, side, out = 3) {
    const k = 'entry_' + side + out;
    if (s[k] !== undefined) return s[k];
    s[k] = null;
    const nav = this.game.nav, L = this.spawnList[side];
    if (!nav || !L || !L.length) return null;
    let x = 0, y = 0, z = 0;
    for (const p of L) { x += p.x / L.length; y += p.y / L.length; z += p.z / L.length; }
    let a = nav.nearest(x, y, z, 6);
    if (a < 0) a = nav.nearest(L[0].x, L[0].y, L[0].z, 6);
    const b = nav.nearest(s.x, s.y, s.z, 4);
    const path = a >= 0 && b >= 0 ? nav.findPath(a, b) : null;
    if (!path || !path.length) return null;
    for (let i = path.length - 1; i >= 0; i--) {
      const n = path[i];
      if (Math.hypot(nav.X[n] - s.x, nav.Z[n] - s.z) > s.r + out) { s[k] = { x: nav.X[n], y: nav.Y[n], z: nav.Z[n] }; break; }
    }
    return s[k];
  }
  // the attacking bots are together: all of them still up at the gathering point, or most and a moment gone, or
  // the first one there 5 s ago
  gathered(st) {
    const g = this.game, bots = g.bots.filter((c) => c.alive && !c.remote && c.team === this.attack);
    const there = bots.filter((c) => flat(c.pos, st) < 6.5 && Math.abs(c.pos.y - st.y) < 3).length;
    if (!there) return !bots.length;
    if (this.gatherT === null) this.gatherT = g.time;
    const wait = g.time - this.gatherT;
    return there >= bots.length || (there >= Math.min(3, bots.length) && wait > 2) || wait > 5;
  }
  homeOf(b) {
    const list = this.game.combatants.filter((c) => c.team === b.team);
    return this.sites[Math.max(0, list.indexOf(b)) % this.sites.length];
  }
  // The same goal as the same object: Bot.think starts over on a new one (a new spot to stand on, a new path) and
  // a bot holding a site would wander about in it instead of watching the ways in.
  goal(key, x, y, z, r, look = null) {
    let o = this.goals.get(key);
    if (!o || o.x !== x || o.y !== y || o.z !== z || o.r !== r) { o = { x, y, z, r, look }; this.goals.set(key, o); }
    return o;
  }

  // The defenders' call: attackers seen at a site (the bomb carrier anywhere near one), two or more of them heard
  // near one (running feet, a group getting together: about 20 m out), or one of the defenders down at a site.
  spot() {
    const g = this.game, t = g.time;
    if (t < (this.spotT || 0)) return;
    this.spotT = t + 0.25;
    for (const s of this.sites) {
      let n = 0;
      for (const c of g.combatants) if (c.alive && c.team === this.attack && flat(c.pos, s) < s.r + 20 && Math.abs(c.pos.y - s.y) < 8) n++;
      if (n >= 2) this.callSite(s);
    }
    // (one stays home only while an attacker is somewhere else)
    if (this.hot && this.anchor && !g.combatants.some((c) => c.alive && c.team === this.attack && flat(c.pos, this.hot) > 30)) this.anchor = null;
    for (const c of g.combatants) {
      if (c.team === this.attack) continue;
      if (!c.alive) {
        if (!this.fallen.has(c)) { this.fallen.add(c); const s = this.siteNear(c.pos, 10); if (s) this.callSite(s); }
        continue;
      }
      const e = c.isBot && !c.remote && c.targetVisible && c.target;
      if (!e || !e.alive || e.team !== this.attack) continue;
      const s = this.siteNear(e.pos, e === this.carrier ? 30 : 14);
      if (s) this.callSite(s);
    }
  }
  siteNear(p, m) {
    let best = null, bd = m;
    for (const s of this.sites) { const d = flat(p, s) - s.r; if (d < bd && Math.abs(p.y - s.y) < 8) { bd = d; best = s; } }
    return best;
  }
  callSite(s) {
    const t = this.game.time;
    if (this.hot === s || (this.hot && t - this.hotT < 8)) return; // (not back and forth: a call holds a while)
    this.hot = s; this.hotT = t;
    // the one who stays: the bot of the other site closest to it
    const other = this.sites.find((x) => x !== s);
    this.anchor = null;
    if (other && this.aliveOf(1 - this.attack) >= 3) {
      let bd = Infinity;
      for (const c of this.game.bots) if (c.alive && !c.remote && c.team !== this.attack && this.homeOf(c) === other && flat(c.pos, other) < bd) { bd = flat(c.pos, other); this.anchor = c; }
    }
  }

  // (bots only: one of them has to do it when no player does)
  closest(team, P) {
    let best = null, bd = Infinity;
    for (const c of this.game.combatants) { if (!c.alive || c.team !== team || c.remote || c === this.game.player) continue; const d = c.pos.distanceTo(P); if (d < bd) { bd = d; best = c; } }
    return best;
  }

  botWork() {
    if (this.work) return;
    for (const b of this.game.bots) {
      if (!b.alive || b.remote || (b.target && b.targetVisible && b.target.alive)) continue;
      const k = this.canWork(b);
      if (k === 'plant' || (k === 'defuse' && b === this.defuser)) { this.startWork(b, k); return; }
    }
  }

  // ---- what the round looks like on screen: the panel under the score and the markers in the world
  hud(dt) {
    const g = this.game, p = g.player;
    if (!this.el) {
      this.el = document.createElement('div'); this.el.id = 'sd-panel';
      this.el.innerHTML = '<div class="sd-role"></div><div class="sd-alive"><span class="f"></span><b></b><span class="e"></span></div><div class="sd-work"><span></span><i><b></b></i></div>';
      document.getElementById('hud').appendChild(this.el);
      this.marks = ['A', 'B', 'bomb'].map((t) => { const m = document.createElement('div'); m.className = 'sdmark'; m.innerHTML = '<b>' + (t === 'bomb' ? '&#x2620;' : t) + '</b><span></span>'; g.hud.tagRoot.appendChild(m); return m; });
      this.roleEl = this.el.children[0]; this.aliveEl = this.el.children[1]; this.workEl = this.el.children[2];
    }
    const mine = this.role(p.team);
    const working = this.hidesGun();
    if (this.workingCss !== working) { this.workingCss = working; document.getElementById('hud').classList.toggle('sd-working', working); } // (no crosshair over the bomb)
    const live = this.phase === 'planted' && !this.planted.done;
    if (this.timerLive !== live) { this.timerLive = live; document.getElementById('sb-timer').classList.toggle('bomb', live); }
    const role = (mine === 'attack' ? 'ANGRIFF' : 'VERTEIDIGUNG') + ' · ' + (this.round > SD.ROUNDS ? 'ENTSCHEIDUNG' : 'RUNDE ' + Math.max(1, this.round) + '/' + SD.ROUNDS) + (this.carrier === p ? ' · DU HAST DIE BOMBE' : '');
    if (this.roleEl.textContent !== role) this.roleEl.textContent = role;
    const dots = (n) => '&#9679;'.repeat(n);
    const af = this.aliveOf(p.team), ae = this.aliveOf(1 - p.team), ak = af + '|' + ae;
    if (this.aliveKey !== ak) { this.aliveKey = ak; this.aliveEl.children[0].innerHTML = dots(af); this.aliveEl.children[2].innerHTML = dots(ae); this.aliveEl.children[1].textContent = af + ' : ' + ae; }
    // F to plant / defuse, and how far it has got
    const w = this.work, k = !w && p.alive ? this.canWork(p) : null;
    let text = '', fill = 0;
    if (w && w.ent === p) { text = w.kind === 'plant' ? 'BOMBE WIRD GELEGT' : 'BOMBE WIRD ENTSCHÄRFT'; fill = w.t / w.need; }
    else if (k) text = k === 'plant' ? '[F] HALTEN · BOMBE LEGEN' : '[F] HALTEN · BOMBE ENTSCHÄRFEN';
    else if (w && w.kind === 'defuse' && w.ent.team === p.team) { text = w.ent.name.toUpperCase() + ' ENTSCHÄRFT'; fill = w.t / w.need; }
    else if (this.carrier === p && this.phase === 'live') text = 'BRING DIE BOMBE ZU A ODER B';
    this.workEl.style.display = text ? '' : 'none';
    if (text) { if (this.workEl.firstChild.textContent !== text) this.workEl.firstChild.textContent = text; this.workEl.lastChild.firstChild.style.transform = 'scaleX(' + Math.min(1, fill).toFixed(3) + ')'; this.workEl.classList.toggle('bar', fill > 0); }
    // markers: the two sites always; the bomb once it is down, and for the attackers where it was dropped
    const cam = g.engine.camera, Wd = window.innerWidth, Hd = window.innerHeight;
    const put = (M, P, label, cls) => {
      _v.set(P.x, P.y + 1.4, P.z).project(cam);
      const behind = _v.z > 1;
      let sx = behind ? -_v.x : _v.x, sy = behind ? -_v.y : _v.y;
      const edge = Math.max(Math.abs(sx) / 0.9, Math.abs(sy) / 0.8);
      if (behind || edge > 1) { const q = 1 / Math.max(edge, 1e-3); sx *= q; sy *= q; }
      M.style.transform = `translate(${Math.round((sx * 0.5 + 0.5) * Wd)}px, ${Math.round((-sy * 0.5 + 0.5) * Hd)}px) translate(-50%, -50%)`;
      M.lastChild.textContent = label;
      if (M.className !== cls) M.className = cls;
      M.style.display = '';
    };
    const view = p.alive ? p.pos : (this.spectate && this.spectate.pos) || p.pos;
    const show = this.phase !== 'over' && this.phase !== 'wait' && !working; // (not over the case you are working at)
    this.sites.forEach((s, i) => {
      const hot = this.planted && this.planted.site === s;
      if (show && !hot) put(this.marks[i], s, Math.round(flat(view, s)) + ' m', 'sdmark site ' + (mine === 'attack' ? 'att' : 'def'));
      else this.marks[i].style.display = 'none';
    });
    const B = this.planted ? this.planted.pos : this.dropped && mine === 'attack' ? this.dropped : null;
    if (show && B) put(this.marks[2], B, this.planted ? (this.planted.done ? 'ENTSCHÄRFT' : 'BOMBE ' + this.planted.site.id) : 'BOMBE', 'sdmark bomb' + (this.planted && !this.planted.done ? ' live' : ''));
    else this.marks[2].style.display = 'none';
    void dt;
  }

  // the clock under the score: the freeze, the round, then the bomb
  clock() {
    if (this.phase === 'freeze') return Math.max(0, this.left);
    if (this.phase === 'planted') return Math.max(0, this.planted.left);
    if (this.phase === 'live') return Math.max(0, this.left);
    return 0;
  }

  // ---- dead until the next round: watch a teammate who is still in it (click: the next one)
  watch(cam, dt) {
    const g = this.game, p = g.player;
    this.specT += dt;
    const mates = g.combatants.filter((c) => c !== p && c.alive && c.team === p.team);
    if (!mates.length) return false;
    if (!this.spectate || !this.spectate.alive || this.spectate.team !== p.team || (g.input.firePressed && this.specT > 0.3)) {
      const i = this.spectate ? (mates.indexOf(this.spectate) + 1) % mates.length : 0;
      this.spectate = mates[Math.max(0, i)]; this.specT = 0;
    }
    const c = this.spectate, yaw = c.isPlayer ? c.yaw : c.aimYaw;
    const hx = c.pos.x, hy = c.pos.y + 1.65, hz = c.pos.z;
    let bx = hx + Math.sin(yaw) * 2.6, by = hy + 0.55, bz = hz + Math.cos(yaw) * 2.6;
    const hit = g.col.raycast(hx, hy, hz, bx - hx, by - hy, bz - hz, 1, this._ray || (this._ray = {}));
    if (hit && hit.t < 1) { const k = Math.max(0.15, hit.t - 0.08); bx = hx + (bx - hx) * k; by = hy + (by - hy) * k; bz = hz + (bz - hz) * k; }
    cam.position.set(bx, by, bz);
    cam.lookAt(hx - Math.sin(yaw) * 6, hy - 0.4, hz - Math.cos(yaw) * 6);
    const box = document.getElementById('death-timer');
    document.getElementById('death-screen').classList.add('watching'); // (the big GETÖTET goes, the line under it stays)
    const t = 'DU SIEHST ' + c.name.toUpperCase() + ' · KLICKEN: NÄCHSTER';
    if (box && box.textContent !== t) box.textContent = t;
    return true;
  }
}
