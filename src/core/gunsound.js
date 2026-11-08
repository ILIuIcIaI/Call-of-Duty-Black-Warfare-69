// =============================================================================
// Gunshots made from numbers alone, one voice for every gun (GUNS below). A shot is built the way a real one happens:
//   pop    the blast wave leaving the muzzle: a Friedlander pulse, the instant rise and the suck back behind it
//   crack  the bullet's own shock wave (an N-wave), for the fast rounds
//   gas    the powder gas tearing out: noise through a lowpass that closes as it cools, coloured by the gun's resonances,
//          with the powder's crackle in it
//   kick   the punch in the chest: a sine falling in pitch, driven until it has overtones small speakers can play
//   mech   the gun working: bolt, slide, buffer spring, belt links; struck metal (a few inharmonic modes) and its thud
//   ring   a barrel or a frame ringing on (revolvers, big rifles, shotguns)
//   hiss   the air on top
//   world  what comes back: slaps off walls, a rolling tail, a low rumble
// The gas and the kick are pushed hard together (dense and loud); the pop and the crack go on top of that clean, so the
// shot keeps its snap. Takes: 'fp' your own gun (stereo, every detail, the mechanics toward the right where the port is;
// the tail is a buffer of its own so automatic fire does not drown in it), 'near' (mono, for the 3D panner) and 'far'
// (mono: the dull boom and the echoes that carry a few hundred metres).
// Plain numbers in, Float32Arrays out: the game renders every take at its own sample rate when the audio starts. The
// tails, dark anyway, are made at a quarter of the rate and brought up.
// =============================================================================

const TAU = Math.PI * 2;

function rng(seed) {
  let a = seed | 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// one-pole lowpass and highpass, in place
function lp1(a, f, sr) { const k = 1 - Math.exp(-TAU * Math.min(f, 0.45 * sr) / sr); let y = 0; for (let i = 0; i < a.length; i++) { y += k * (a[i] - y); a[i] = y; } return a; }
function hp1(a, f, sr) { const k = Math.exp(-TAU * f / sr); let x1 = 0, y = 0; for (let i = 0; i < a.length; i++) { const x = a[i]; y = k * (y + x - x1); x1 = x; a[i] = y; } return a; }

// RBJ biquad, in place: 'lp' | 'hp' | 'bp' | 'peak'
function biquad(a, type, f, Q, sr, dB = 0) {
  const w = TAU * Math.min(f, 0.45 * sr) / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * Q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else { const A = Math.pow(10, dB / 40); b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; a[i] = y; }
  return a;
}

// a lowpass whose cutoff moves (the trapezoidal state variable filter: it stays stable while it sweeps)
function sweepLP(a, fc, Q, sr) {
  const k = 1 / Q;
  let ic1 = 0, ic2 = 0, a1 = 0, a2 = 0, a3 = 0;
  for (let i = 0; i < a.length; i++) {
    if ((i & 15) === 0) { const g = Math.tan(Math.PI * Math.min(0.45 * sr, Math.max(20, fc(i / sr))) / sr); a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2; }
    const v3 = a[i] - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2; a[i] = v2;
  }
  return a;
}

function peak(...bufs) { let m = 0; for (const a of bufs) for (let i = 0; i < a.length; i++) { const v = a[i] < 0 ? -a[i] : a[i]; if (v > m) m = v; } return m; }
function scale(a, k) { for (let i = 0; i < a.length; i++) a[i] *= k; return a; }
function rms(a, from, to) { let s = 0; for (let i = from; i < to; i++) s += a[i] * a[i]; return Math.sqrt(s / Math.max(1, to - from)); }
// (layers are matched by their energy where it counts, not by a single sample's peak)
function normRms(a, to, from, upto) { const r = rms(a, from, Math.min(a.length, upto)); return r > 0 ? scale(a, to / r) : a; }
function norm(a, to = 1) { const m = peak(a); return m > 0 ? scale(a, to / m) : a; }
function addInto(dst, src, g = 1, off = 0) { const n = Math.min(src.length, dst.length - off); for (let i = Math.max(0, -off); i < n; i++) dst[off + i] += src[i] * g; return dst; }
function fade(a, sr, ms) { const n = Math.min(a.length, Math.floor(sr * ms / 1000)); for (let i = 0; i < n; i++) { const k = i / n; a[a.length - 1 - i] *= k * k; } return a; }
// a quarter-rate buffer up to the full rate (linear, then the images under it smoothed away)
function up4(a, n, sr) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / 4, j = x | 0, f = x - j; out[i] = j + 1 < a.length ? a[j] + (a[j + 1] - a[j]) * f : (j < a.length ? a[j] * (1 - f) : 0); }
  return lp1(lp1(out, 5200, sr), 6500, sr);
}
// soft knee over the top: below t untouched, above it rounded into 1
function knee(a, t) { const r = 1 - t; for (let i = 0; i < a.length; i++) { const v = a[i], m = v < 0 ? -v : v; if (m > t) a[i] = Math.sign(v) * (t + r * Math.tanh((m - t) / r)); } return a; }

// struck metal: a few inharmonic modes (a bar's and a plate's mixed), a burst of contact noise, and the thud of the mass
const MODES = [[1, 1, 1], [1.47, 0.72, 0.8], [2.09, 0.52, 0.62], [2.71, 0.38, 0.5], [3.62, 0.24, 0.38]];
function strike(out, sr, t0, f, d, a, thud, R) {
  const n = out.length;
  if (t0 >= n) return;
  const L = Math.min(n - t0, Math.floor(d * 8 * sr));
  for (const [r, g, dk] of MODES) {
    const w = TAU * f * r * (1 + (R() - 0.5) * 0.02) / sr, dec = Math.exp(-1 / (d * dk * sr)), ph = R() * TAU;
    let e = a * g;
    for (let i = 0; i < L; i++) { out[t0 + i] += Math.sin(w * i + ph) * e; e *= dec; }
  }
  // the contact: a millisecond of noise around the ring
  const c = new Float32Array(Math.floor(0.004 * sr));
  for (let i = 0; i < c.length; i++) c[i] = (R() * 2 - 1) * Math.exp(-i / (0.0006 * sr));
  biquad(c, 'bp', f * 1.3, 0.9, sr);
  addInto(out, c, a * 2.2, t0);
  // the thud: the bolt or the slide slamming home, low and short
  if (thud) {
    const m = Math.min(n - t0, Math.floor(0.03 * sr)), fw = TAU * (260 + R() * 90) / sr;
    for (let i = 0; i < m; i++) out[t0 + i] += Math.sin(fw * i) * Math.exp(-i / (0.0045 * sr)) * a * thud * 1.4;
  }
}

// The guns. Times in seconds, frequencies in Hz.
// pop: level of the clean transient over the driven gas (about 2 = twice its top), tp (positive phase), popTone
// crack: level, crackT (length of the N-wave)    gas: body, bHi -> bLo (the lowpass closing), bFall, bFast/bSlow, bMix, bQ
// kick: level against the gas, k0 -> k1 (pitch fall), kDrop (how fast), kDecay, kDrive    form: resonances [Hz, Q, dB]
// crk (crackle), crkRate, crkDecay   siz (hiss), sizCut, sizDecay   mech: [time, Hz, decay, level, thud], mechLvl
// spring: [Hz, decay, level, time]   ring: [Hz, decay, level]
// world: slap [[delay, level]], tail, tDecay, tCut, rum (rumble), rumCut, rumDecay
// drive: how hard the gas and the kick are pushed, vol: how loud the gun plays against the others, len: seconds
export const GUNS = {
  // the reference: sharp and punchy, a crisp crack, the bolt carrier's "chk-chk" and the buffer spring's ping
  ar: {
    pop: 1.25, tp: 0.00052, popTone: 9000, crack: 0.55, crackT: 0.00028,
    body: 1.0, bHi: 9000, bLo: 1100, bFall: 0.012, bFast: 0.008, bSlow: 0.05, bMix: 0.34,
    kick: 0.6, k0: 170, k1: 68, kDrop: 0.010, kDecay: 0.055, kDrive: 2.2,
    form: [[480, 1.1, 5], [1250, 1.6, 3], [3200, 2.2, 3]],
    crk: 0.3, crkRate: 1600, crkDecay: 0.025, siz: 0.22, sizCut: 6000, sizDecay: 0.009,
    mech: [[0.014, 2300, 0.010, 0.55, 0], [0.038, 1700, 0.016, 0.45, 0.4]], spring: [520, 0.03, 0.12, 0.016],
    slap: [[0.06, 0.3], [0.17, 0.18], [0.33, 0.1]], tail: 0.5, tDecay: 0.55, tCut: 2600, rum: 0.25, rumCut: 170, rumDecay: 0.3,
    drive: 2.4, vol: 0.95, len: 1.4,
  },
  // 9 mm: snappy and tight, less low end, more spit; a blowback bolt clacking back and forth
  smg: {
    pop: 1.2, tp: 0.00038, popTone: 10000, crack: 0.15, crackT: 0.00022,
    body: 1.0, bHi: 10000, bLo: 1500, bFall: 0.009, bFast: 0.006, bSlow: 0.034, bMix: 0.3,
    kick: 0.5, k0: 190, k1: 78, kDrop: 0.008, kDecay: 0.042, kDrive: 2.4,
    form: [[650, 1.3, 5], [1800, 1.8, 4], [4200, 2.5, 2]],
    crk: 0.35, crkRate: 2000, crkDecay: 0.018, siz: 0.26, sizCut: 6500, sizDecay: 0.007,
    mech: [[0.009, 1500, 0.010, 0.5, 0.6], [0.026, 1250, 0.014, 0.5, 0.5]],
    slap: [[0.05, 0.28], [0.14, 0.14]], tail: 0.4, tDecay: 0.4, tCut: 2800, rum: 0.15, rumCut: 190, rumDecay: 0.2,
    knee: 0.58, drive: 2.3, vol: 0.9, len: 1.0,
  },
  // belt-fed 7.62: heavy and chesty, a deep clunk and the belt's links rattling after it
  lmg: {
    pop: 1.2, tp: 0.00065, popTone: 8000, crack: 0.55, crackT: 0.00032,
    body: 1.0, bHi: 7500, bLo: 800, bFall: 0.015, bFast: 0.01, bSlow: 0.065, bMix: 0.38,
    kick: 0.7, k0: 160, k1: 62, kDrop: 0.012, kDecay: 0.07, kDrive: 2.4,
    form: [[380, 1.0, 6], [950, 1.4, 4], [2600, 2, 2]],
    crk: 0.3, crkRate: 1500, crkDecay: 0.03, siz: 0.2, sizCut: 5500, sizDecay: 0.01,
    mech: [[0.018, 1100, 0.014, 0.55, 0.8], [0.05, 900, 0.02, 0.5, 0.9], [0.031, 4800, 0.004, 0.18, 0], [0.043, 5300, 0.004, 0.14, 0], [0.064, 4500, 0.005, 0.12, 0]],
    spring: [430, 0.035, 0.08, 0.02],
    slap: [[0.07, 0.34], [0.19, 0.22], [0.37, 0.12]], tail: 0.6, tDecay: 0.75, tCut: 2200, rum: 0.32, rumCut: 160, rumDecay: 0.4,
    drive: 2.7, vol: 1, len: 1.7,
  },
  // 7.62 semi-auto: a big crack, a strong punch, the action clanging and ringing, a long slap off the walls
  dmr: {
    pop: 1.3, tp: 0.0007, popTone: 8500, crack: 0.8, crackT: 0.00034,
    body: 1.0, bHi: 8500, bLo: 900, bFall: 0.015, bFast: 0.009, bSlow: 0.07, bMix: 0.36,
    kick: 0.75, k0: 150, k1: 60, kDrop: 0.012, kDecay: 0.075, kDrive: 2.6,
    form: [[420, 1.0, 5], [1100, 1.5, 4], [3500, 2.2, 4]],
    crk: 0.3, crkRate: 1500, crkDecay: 0.03, siz: 0.24, sizCut: 6000, sizDecay: 0.011,
    mech: [[0.02, 1900, 0.03, 0.5, 0], [0.055, 1500, 0.025, 0.45, 0.5]], ring: [2400, 0.07, 0.07],
    slap: [[0.075, 0.36], [0.2, 0.24], [0.42, 0.14]], tail: 0.65, tDecay: 0.9, tCut: 2400, rum: 0.35, rumCut: 160, rumDecay: 0.5,
    drive: 2.8, vol: 1, len: 1.9,
  },
  // .338 bolt action: an enormous crack and boom, then the valley answers; no action cycling, only the rifle ringing
  sniper: {
    pop: 1.35, tp: 0.0009, popTone: 8000, crack: 1.0, crackT: 0.0004,
    body: 1.0, bHi: 8000, bLo: 700, bFall: 0.018, bFast: 0.011, bSlow: 0.095, bMix: 0.38,
    kick: 0.8, k0: 140, k1: 54, kDrop: 0.015, kDecay: 0.1, kDrive: 2.6,
    form: [[340, 1.0, 6], [900, 1.3, 4], [3000, 2, 4]],
    crk: 0.35, crkRate: 1400, crkDecay: 0.035, siz: 0.24, sizCut: 5500, sizDecay: 0.013,
    mech: [], ring: [1900, 0.09, 0.06],
    slap: [[0.09, 0.4], [0.24, 0.3], [0.48, 0.2], [0.8, 0.12]], tail: 0.8, tDecay: 1.3, tCut: 2100, rum: 0.45, rumCut: 140, rumDecay: 0.8,
    drive: 3.0, vol: 1.05, len: 2.8,
  },
  // 12 gauge pump: wide and boomy, a rough roar of gas (lots of crackle), little crack; the pump plays on its own
  shotgun: {
    pop: 1, tp: 0.0011, popTone: 7000, crack: 0.1, crackT: 0.0003,
    body: 1.0, bHi: 6500, bLo: 600, bFall: 0.02, bFast: 0.013, bSlow: 0.095, bMix: 0.45, bQ: 0.8,
    kick: 0.9, k0: 130, k1: 52, kDrop: 0.015, kDecay: 0.11, kDrive: 2.8,
    form: [[260, 0.9, 6], [700, 1.2, 5], [1900, 1.6, 2]],
    crk: 0.7, crkRate: 3200, crkDecay: 0.04, siz: 0.2, sizCut: 4500, sizDecay: 0.014,
    mech: [], ring: [900, 0.08, 0.05],
    slap: [[0.08, 0.38], [0.21, 0.26], [0.42, 0.15]], tail: 0.75, tDecay: 1.0, tCut: 1900, rum: 0.45, rumCut: 150, rumDecay: 0.6,
    drive: 3.0, vol: 1, len: 2.2,
  },
  // 9 mm pistol: a snappy pop, short, the slide going "tick-tack"
  pistol: {
    pop: 1.2, tp: 0.00033, popTone: 11000, crack: 0.12, crackT: 0.0002,
    body: 1.0, bHi: 11000, bLo: 1700, bFall: 0.008, bFast: 0.005, bSlow: 0.03, bMix: 0.28,
    kick: 0.45, k0: 220, k1: 85, kDrop: 0.007, kDecay: 0.035, kDrive: 2.4,
    form: [[780, 1.4, 5], [2200, 1.8, 4], [5000, 2.5, 2]],
    crk: 0.3, crkRate: 1800, crkDecay: 0.015, siz: 0.26, sizCut: 7000, sizDecay: 0.006,
    mech: [[0.006, 3100, 0.007, 0.65, 0], [0.019, 2500, 0.01, 0.5, 0.3]],
    slap: [[0.045, 0.26], [0.12, 0.12]], tail: 0.36, tDecay: 0.35, tCut: 3000, rum: 0.12, rumCut: 200, rumDecay: 0.18,
    knee: 0.58, drive: 2.2, vol: 0.88, len: 0.9,
  },
  // .44 revolver: a round boom with a bright bark (the gas spitting out of the cylinder gap) and the frame ringing
  revolver: {
    pop: 1.3, tp: 0.0008, popTone: 9000, crack: 0.35, crackT: 0.0003,
    body: 1.0, bHi: 9000, bLo: 900, bFall: 0.014, bFast: 0.009, bSlow: 0.065, bMix: 0.36,
    kick: 0.75, k0: 150, k1: 60, kDrop: 0.012, kDecay: 0.08, kDrive: 2.6,
    form: [[420, 1.0, 5], [1400, 1.3, 5], [3800, 2, 3]],
    crk: 0.5, crkRate: 2600, crkDecay: 0.03, siz: 0.32, sizCut: 5500, sizDecay: 0.012,
    mech: [[0.0005, 2800, 0.006, 0.25, 0]], ring: [2650, 0.06, 0.09],
    slap: [[0.07, 0.34], [0.19, 0.22], [0.38, 0.12]], tail: 0.65, tDecay: 0.85, tCut: 2400, rum: 0.32, rumCut: 160, rumDecay: 0.45,
    drive: 2.8, vol: 1, len: 1.8,
  },
  // machine pistol: very fast, thin and buzzy, a light slide rattling
  mpistol: {
    pop: 1.2, tp: 0.0003, popTone: 11500, crack: 0.08, crackT: 0.0002,
    body: 1.0, bHi: 11500, bLo: 1900, bFall: 0.007, bFast: 0.0045, bSlow: 0.025, bMix: 0.26,
    kick: 0.4, k0: 230, k1: 90, kDrop: 0.006, kDecay: 0.03, kDrive: 2.4,
    form: [[850, 1.5, 5], [2500, 2, 4], [5600, 2.5, 2]],
    crk: 0.3, crkRate: 1800, crkDecay: 0.013, siz: 0.28, sizCut: 7500, sizDecay: 0.005,
    mech: [[0.005, 3400, 0.006, 0.55, 0], [0.015, 2900, 0.008, 0.42, 0.2]],
    slap: [[0.04, 0.24], [0.11, 0.1]], tail: 0.3, tDecay: 0.3, tCut: 3200, rum: 0.1, rumCut: 210, rumDecay: 0.15,
    knee: 0.56, drive: 2.1, vol: 0.85, len: 0.75,
  },
  // burst rifle: an AR's voice, tighter and more modern, a sharper "chk"
  burst: {
    pop: 1.3, tp: 0.00048, popTone: 9500, crack: 0.6, crackT: 0.00026,
    body: 1.0, bHi: 9500, bLo: 1200, bFall: 0.011, bFast: 0.007, bSlow: 0.046, bMix: 0.32,
    kick: 0.6, k0: 175, k1: 70, kDrop: 0.009, kDecay: 0.052, kDrive: 2.3,
    form: [[520, 1.2, 5], [1500, 1.6, 4], [3600, 2.3, 3]],
    crk: 0.25, crkRate: 1500, crkDecay: 0.022, siz: 0.24, sizCut: 6500, sizDecay: 0.008,
    mech: [[0.012, 2700, 0.009, 0.62, 0], [0.033, 2000, 0.013, 0.5, 0.35]], spring: [600, 0.025, 0.1, 0.014],
    slap: [[0.06, 0.3], [0.16, 0.18], [0.31, 0.1]], tail: 0.5, tDecay: 0.55, tCut: 2700, rum: 0.25, rumCut: 170, rumDecay: 0.3,
    drive: 2.5, vol: 0.95, len: 1.4,
  },
  // PDW: a small fast round, zippy and high, with its own little supersonic crack
  pdw: {
    pop: 1.2, tp: 0.00032, popTone: 12000, crack: 0.3, crackT: 0.00018,
    body: 1.0, bHi: 12000, bLo: 2100, bFall: 0.007, bFast: 0.004, bSlow: 0.022, bMix: 0.26,
    kick: 0.38, k0: 240, k1: 95, kDrop: 0.006, kDecay: 0.028, kDrive: 2.4,
    form: [[900, 1.5, 4], [2800, 2, 5], [6000, 2.5, 3]],
    crk: 0.25, crkRate: 1600, crkDecay: 0.012, siz: 0.3, sizCut: 8000, sizDecay: 0.005,
    mech: [[0.005, 3600, 0.005, 0.45, 0], [0.014, 3000, 0.007, 0.4, 0.2]],
    slap: [[0.04, 0.22], [0.1, 0.1]], tail: 0.3, tDecay: 0.3, tCut: 3400, rum: 0.08, rumCut: 220, rumDecay: 0.15,
    knee: 0.56, drive: 2.0, vol: 0.85, len: 0.75,
  },
  // .50 anti-materiel: the muzzle brake throws the blast sideways, the ground shakes, the thunder rolls; a massive clank
  amr: {
    pop: 1.2, tp: 0.0014, popTone: 7500, crack: 1.0, crackT: 0.0005,
    body: 1.0, bHi: 7500, bLo: 550, bFall: 0.02, bFast: 0.013, bSlow: 0.11, bMix: 0.42,
    kick: 0.95, k0: 120, k1: 46, kDrop: 0.018, kDecay: 0.14, kDrive: 2.8,
    form: [[260, 0.9, 6], [800, 1.2, 4], [2200, 1.6, 5]],
    crk: 0.45, crkRate: 2000, crkDecay: 0.045, siz: 0.26, sizCut: 5000, sizDecay: 0.016,
    mech: [[0.025, 800, 0.03, 0.55, 1.0], [0.07, 1300, 0.03, 0.45, 0.6]], ring: [1500, 0.12, 0.05],
    slap: [[0.1, 0.44], [0.27, 0.32], [0.55, 0.22], [0.9, 0.14]], tail: 0.9, tDecay: 1.6, tCut: 1800, rum: 0.55, rumCut: 130, rumDecay: 1.1,
    drive: 3.2, vol: 1.05, len: 3.2,
  },
  // semi-auto shotgun: the shotgun's roar, a little tighter, and a heavy action clanking after every shot
  autoshot: {
    pop: 1.05, tp: 0.001, popTone: 7000, crack: 0.1, crackT: 0.0003,
    body: 1.0, bHi: 7000, bLo: 650, bFall: 0.018, bFast: 0.012, bSlow: 0.085, bMix: 0.43, bQ: 0.8,
    kick: 0.85, k0: 135, k1: 54, kDrop: 0.014, kDecay: 0.1, kDrive: 2.7,
    form: [[290, 0.9, 5], [760, 1.2, 5], [2100, 1.6, 3]],
    crk: 0.65, crkRate: 3000, crkDecay: 0.035, siz: 0.2, sizCut: 4800, sizDecay: 0.012,
    mech: [[0.016, 1150, 0.018, 0.55, 0.8], [0.045, 1450, 0.02, 0.5, 0.6]],
    slap: [[0.08, 0.36], [0.2, 0.24], [0.4, 0.14]], tail: 0.7, tDecay: 0.95, tCut: 2000, rum: 0.4, rumCut: 150, rumDecay: 0.55,
    drive: 2.9, vol: 1, len: 2.0,
  },
  // .50 pistol: huge and barking, brighter than the revolver, a heavy slide clanking back and home
  handcannon: {
    pop: 1.3, tp: 0.00085, popTone: 9500, crack: 0.4, crackT: 0.0003,
    body: 1.0, bHi: 9500, bLo: 950, bFall: 0.013, bFast: 0.009, bSlow: 0.065, bMix: 0.36,
    kick: 0.78, k0: 150, k1: 60, kDrop: 0.012, kDecay: 0.085, kDrive: 2.6,
    form: [[460, 1.0, 5], [1600, 1.4, 5], [4200, 2, 3]],
    crk: 0.45, crkRate: 2300, crkDecay: 0.028, siz: 0.3, sizCut: 5500, sizDecay: 0.011,
    mech: [[0.01, 1700, 0.015, 0.65, 0.5], [0.032, 1400, 0.02, 0.5, 0.6]], ring: [2300, 0.05, 0.05],
    slap: [[0.07, 0.34], [0.19, 0.22], [0.38, 0.12]], tail: 0.65, tDecay: 0.85, tCut: 2400, rum: 0.35, rumCut: 160, rumDecay: 0.5,
    drive: 2.9, vol: 1, len: 1.8,
  },
};

const SHOT = 0.5; // seconds: the shot itself (gas, kick, mechanics, the first slaps); the rest is tail

// One take of one gun. take: 'fp' -> { L, R } (the shot, stereo) and { tL, tR } (its tail, unless opt.noTail);
// 'near' | 'far' -> { M }.
export function renderGun(sr, G, take, seed, opt = {}) {
  const R = rng(seed), J = (v, amt) => v * (1 + (R() * 2 - 1) * amt), N = () => R() * 2 - 1;
  const fp = take === 'fp', far = take === 'far';
  const ns = Math.floor(SHOT * sr), at = (s) => Math.max(1, Math.min(ns, Math.floor(s * sr)));

  // ---- the gas: noise, two decays, through a lowpass closing as it cools; the crackle in it; the gun's voice on it
  const gas = new Float32Array(ns);
  {
    const bF = G.bFast * (far ? 1.8 : 1), bS = G.bSlow * (far ? 1.6 : 1), mix = G.bMix, m = at(bS * 9 + 0.01);
    const kF = Math.exp(-1 / (bF * sr)), kS = Math.exp(-1 / (bS * sr)), att = Math.max(1, Math.round((far ? 0.003 : 0.0004) * sr));
    let eF = 1, eS = 1;
    for (let i = 0; i < m; i++) { gas[i] = N() * ((1 - mix) * eF + mix * eS) * (i < att ? i / att : 1); eF *= kF; eS *= kS; }
    // (the gas is darker than white noise: most of its energy low in the mids)
    const dk = Float32Array.from(gas.subarray(0, m)); lp1(dk, G.bTilt ?? 650, sr);
    for (let i = 0; i < m; i++) gas[i] = dk[i] * 2.2 + gas[i] * 0.3;
    const hi = far ? Math.min(1500, G.bHi) : J(G.bHi, 0.06), lo = far ? Math.min(420, G.bLo) : J(G.bLo, 0.06), fall = G.bFall;
    sweepLP(gas, (t) => lo + (hi - lo) * Math.exp(-t / fall), G.bQ ?? 0.9, sr);
  }
  if (!far && G.crk) {
    const c = new Float32Array(at(G.crkDecay * 6 + 0.004)), kC = Math.exp(-1 / (G.crkDecay * sr)), p = G.crkRate / sr;
    let e = 1;
    for (let i = Math.round(0.0006 * sr); i < c.length; i++) { if (R() < p * e) { const v = (0.35 + 0.65 * R()) * (R() < 0.5 ? -1 : 1) * e; c[i] += v; if (i + 1 < c.length) c[i + 1] -= v * 0.55; } e *= kC; }
    biquad(c, 'hp', 1800, 0.7, sr); biquad(c, 'lp', 9000, 0.7, sr);
    addInto(gas, norm(c), G.crk * 0.7);
  }
  const form = G.form.map(([f, q, dB]) => [J(f, 0.03), q, dB]);
  for (const [f, q, dB] of form) biquad(gas, 'peak', f, q, sr, far ? dB * 0.6 : dB);
  biquad(gas, 'hp', far ? 90 : 70, 0.7, sr);
  if (far) { lp1(gas, 1500, sr); lp1(gas, 2000, sr); }
  normRms(gas, G.body, 0, at(0.02));

  // ---- the kick, then gas and kick pushed hard together: dense and loud
  const sus = gas;
  {
    const k0 = J(G.k0, 0.05) * (far ? 0.82 : 1), k1 = J(G.k1, 0.04) * (far ? 0.9 : 1), kd = G.kDecay * (far ? 1.5 : 1), dr = G.kDrive ?? 2.2, tn = Math.tanh(dr);
    const m = at(kd * 7), aF = Math.exp(-1 / (G.kDrop * sr)), aE = Math.exp(-1 / (kd * sr)), att = Math.max(1, Math.round(0.0007 * sr)), lv = G.kick * (far ? 0.75 : 1);
    const kb = new Float32Array(m);
    let ph = 0, fe = 1, e = 1;
    for (let i = 0; i < m; i++) { ph += TAU * (k1 + (k0 - k1) * fe) / sr; fe *= aF; const s = Math.sin(ph) * e * (i < att ? i / att : 1); e *= aE; kb[i] = Math.tanh(s * dr) / tn; }
    addInto(sus, normRms(kb, 1, 0, at(0.03)), lv);
  }
  if (G.ring && !far) {
    const [f0, d, lv] = G.ring, m = at(d * 7), f = J(f0, 0.02);
    for (let i = 0; i < m; i++) { const t = i / sr; sus[i] += (Math.sin(TAU * f * t) + 0.45 * Math.sin(TAU * f * 2.76 * t + 1.3) * Math.exp(-t / (d * 0.4))) * Math.exp(-t / d) * lv * 2.5 * (fp ? 1 : 0.6); }
  }
  {
    const dr = G.drive * (far ? 0.55 : fp ? 1 : 0.85), tn = Math.tanh(dr), p = peak(sus);
    for (let i = 0; i < ns; i++) sus[i] = Math.tanh(sus[i] / p * dr) / tn;
  }

  // ---- the transient on top, clean: the blast wave and the bullet's crack, through the gun's voice (lighter)
  const tr = new Float32Array(at(0.03));
  {
    const tp = J(G.tp, 0.08) * (far ? 1.7 : 1), b = G.popB ?? 1.15, m = Math.min(tr.length, Math.floor(tp * 12 * sr));
    for (let i = 0; i < m; i++) { const x = i / sr / tp; tr[i] = (1 - x) * Math.exp(-b * x); }
    if (!far && G.crack) {
      const c = Math.max(3, Math.round(J(G.crackT, 0.1) * sr)), o = Math.round(0.00015 * sr);
      for (let i = 0; i < c && o + i < tr.length; i++) tr[o + i] += G.crack * 0.8 * (1 - 2 * i / (c - 1));
    }
    lp1(tr, far ? 900 : G.popTone, sr); if (far) lp1(tr, 1300, sr);
    for (const [f, q, dB] of form) biquad(tr, 'peak', f, q, sr, dB * 0.5);
    hp1(tr, 60, sr);
    norm(tr, G.pop * (far ? 0.35 : 1));
  }

  // ---- the mechanics (in your hands every detail; near a hint; far nothing)
  const mech = new Float32Array(far ? 0 : ns);
  if (!far) {
    for (const [t, f, d, a, th] of G.mech || []) strike(mech, sr, at(J(t, 0.08)), J(f, 0.05), J(d, 0.1), a * J(1, 0.12), th, R);
    if (G.spring) {
      const [f0, d, lv, t0] = G.spring, o = at(J(t0, 0.08)), m = Math.min(ns - o, at(d * 7)), f = J(f0, 0.04);
      let ph = 0;
      for (let i = 0; i < m; i++) { const t = i / sr; ph += TAU * f * (1 + 0.06 * Math.exp(-t / 0.008)) / sr; mech[o + i] += Math.sin(ph) * Math.exp(-t / d) * Math.min(1, t / 0.001) * lv; }
    }
    if (peak(mech) > 0) norm(mech, (G.mechLvl ?? 0.6) * (fp ? 1 : 0.3));
  }
  // ---- the hiss on top (each ear its own in your hands)
  const hiss = (ch) => {
    const r2 = rng(seed * 13 + ch * 3 + 1), a = new Float32Array(at(G.sizDecay * 8 + 0.002)), k = Math.exp(-1 / (G.sizDecay * sr)), att = Math.max(1, Math.round(0.0002 * sr));
    let e = 1;
    for (let i = 0; i < a.length; i++) { a[i] = (r2() * 2 - 1) * e * (i < att ? i / att : 1); e *= k; }
    biquad(a, 'hp', G.sizCut, 0.7, sr); biquad(a, 'hp', G.sizCut * 0.85, 0.7, sr); lp1(a, 15000, sr);
    return norm(a);
  };

  // ---- the world, made at a quarter of the rate: what the slaps send back is the shot itself, darkened
  const qsr = sr / 4, dry = new Float32Array(Math.floor(0.3 * qsr));
  {
    const full = new Float32Array(Math.floor(0.3 * sr));
    for (let i = 0; i < full.length; i++) full[i] = sus[i] * 0.8 + (i < tr.length ? tr[i] * 0.5 : 0);
    biquad(full, 'lp', far ? 1100 : 2600, 0.7, sr); lp1(full, far ? 1500 : 3400, sr); hp1(full, 140, sr);
    for (let i = 0; i < dry.length; i++) dry[i] = full[i * 4];
  }
  const tLen = fp ? G.len : far ? Math.min(G.len * 1.2, 2.6) : Math.min(G.len * 0.8, 1.6), nq = Math.floor(tLen * qsr);
  const world = (ch, from, to, shift, withTail) => {
    const a = new Float32Array(nq);
    if (withTail) {
      // the rolling tail: noise rising, falling, swelling at random, darker as it goes
      const r2 = rng(seed * 31 + ch * 7 + 3), tD = G.tDecay * (far ? 1.8 : 1), cut = far ? Math.min(1300, G.tCut) : G.tCut;
      const k = Math.exp(-1 / (tD * qsr)), rise = Math.max(1, Math.floor((far ? 0.05 : 0.04) * qsr)), s0 = Math.floor((far ? 0.004 : 0.012) * qsr), mk = 1 - Math.exp(-TAU * 6 / qsr);
      const t = new Float32Array(nq);
      let e = 1, m = 0;
      for (let i = s0; i < nq; i++) { const j = i - s0, x = j < rise ? j / rise : 1; m += mk * ((r2() * 2 - 1) - m); t[i] = (r2() * 2 - 1) * x * x * e * Math.max(0.15, 1 + 7.5 * m); e *= k; }
      sweepLP(t, (s) => cut * (0.35 + 0.65 * Math.exp(-s / 0.3)), 0.7, qsr); hp1(t, 90, qsr);
      addInto(a, norm(t), G.tail * (far ? 1.6 : 1));
      // the rumble: low, slow
      const r3 = rng(seed * 17 + 11), rD = G.rumDecay * (far ? 1.6 : 1), kr = Math.exp(-1 / (rD * qsr)), rr = Math.floor(0.03 * qsr), u = new Float32Array(nq);
      let er = 1;
      for (let i = 0; i < nq; i++) { u[i] = (r3() * 2 - 1) * (i < rr ? i / rr : 1) * er; er *= kr; }
      biquad(u, 'lp', G.rumCut, 0.7, qsr); biquad(u, 'lp', G.rumCut * 1.2, 0.7, qsr); hp1(u, 30, qsr);
      addInto(a, norm(u), G.rum * (far ? 1.5 : 1));
    }
    for (const [d, g] of G.slap) if (d >= from && d < to) addInto(a, dry, g * (far ? 1.3 : 1) * J(1, 0.15), Math.floor((J(d, 0.12) + shift) * qsr));
    if (far && withTail) addInto(a, dry, 0.2, Math.floor(J(1.15, 0.1) * qsr));
    return a;
  };

  // ---- the shot together: the dense gas and kick, the clean snap on top, the mechanics, the hiss, the first slap;
  // a soft knee over the top, to just under full scale
  const finish = (chs, kneeAt) => {
    const p = peak(...chs);
    for (const a of chs) { scale(a, 1 / p); knee(a, kneeAt); hp1(a, 22, sr); }
    const p2 = peak(...chs);
    for (const a of chs) scale(a, 0.97 / p2);
    return 0.97 / (p * p2);
  };
  if (fp) {
    const L = new Float32Array(ns), Rr = new Float32Array(ns), hL = hiss(1), hR = hiss(2);
    for (let i = 0; i < ns; i++) { const c = sus[i] + (i < tr.length ? tr[i] : 0); L[i] = c + mech[i] * 0.72; Rr[i] = c + mech[i]; }
    addInto(L, hL, G.siz); addInto(Rr, hR, G.siz);
    const eL = up4(world(1, 0, 0.12, 0, false), ns, sr), eR = up4(world(2, 0, 0.12, 0.007, false), ns, sr);
    addInto(L, eL); addInto(Rr, eR);
    const k = finish([L, Rr], G.knee ?? 0.65);
    fade(L, sr, 40); fade(Rr, sr, 40);
    if (opt.noTail) return { L, R: Rr };
    // the tail: its own pair of buffers (the later slaps, the rolling tail, the rumble), each ear its own
    const n = Math.floor(G.len * sr), tL = up4(world(1, 0.12, 9, 0, true), n, sr), tR = up4(world(2, 0.12, 9, 0.011, true), n, sr);
    for (const a of [tL, tR]) { scale(a, k * 0.75); hp1(a, 22, sr); fade(a, sr, 80); }
    const pt = peak(tL, tR); if (pt > 0.85) { scale(tL, 0.85 / pt); scale(tR, 0.85 / pt); }
    return { L, R: Rr, tL, tR };
  }
  // near and far: one mono buffer with everything
  const n = Math.floor(tLen * sr), M = new Float32Array(n);
  for (let i = 0; i < ns; i++) M[i] = sus[i] + (i < tr.length ? tr[i] : 0) + (far ? 0 : mech[i]);
  if (!far) addInto(M, hiss(1), G.siz * 0.8);
  addInto(M, up4(world(1, 0, 9, 0, true), n, sr), far ? 1 : 0.8);
  finish([M], far ? 0.8 : G.knee ?? 0.65);
  fade(M, sr, 80);
  return { M };
}
