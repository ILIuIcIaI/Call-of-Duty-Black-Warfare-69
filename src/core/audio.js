import { mulberry32, clamp } from './math.js';

// =============================================================================
// Procedural audio: every sound is synthesized at load time (no audio files).
// Gunshots are layered: transient crack + filtered noise body + sub "boom"
// + mechanical action, soft-clipped for punch, then sent into a generated
// convolution reverb (outdoor slapback / indoor room) for the tail.
// =============================================================================

const GUN = {
  ar: { crack: 0.9, bodyCut: 5200, bodyDecay: 0.07, body: 1.0, boom: 0.95, f0: 150, f1: 48, boomDecay: 0.12, mech: 0.22, drive: 2.6, len: 0.7 },
  smg: { crack: 0.85, bodyCut: 6800, bodyDecay: 0.045, body: 0.95, boom: 0.6, f0: 175, f1: 60, boomDecay: 0.075, mech: 0.3, drive: 2.3, len: 0.55 },
  lmg: { crack: 0.9, bodyCut: 4300, bodyDecay: 0.09, body: 1.05, boom: 1.05, f0: 125, f1: 44, boomDecay: 0.15, mech: 0.2, drive: 3.0, len: 0.8 },
  dmr: { crack: 1.0, bodyCut: 4700, bodyDecay: 0.11, body: 1.1, boom: 1.15, f0: 115, f1: 42, boomDecay: 0.19, mech: 0.18, drive: 3.1, len: 0.9 },
  sniper: { crack: 1.0, bodyCut: 3900, bodyDecay: 0.16, body: 1.15, boom: 1.35, f0: 95, f1: 36, boomDecay: 0.3, mech: 0.0, drive: 3.6, len: 1.3 },
  shotgun: { crack: 1.0, bodyCut: 3300, bodyDecay: 0.14, body: 1.25, boom: 1.45, f0: 100, f1: 38, boomDecay: 0.23, mech: 0.0, drive: 3.6, len: 1.0 },
  pistol: { crack: 0.9, bodyCut: 6200, bodyDecay: 0.05, body: 0.9, boom: 0.62, f0: 185, f1: 62, boomDecay: 0.075, mech: 0.25, drive: 2.1, len: 0.5 },
  revolver: { crack: 1.0, bodyCut: 4300, bodyDecay: 0.12, body: 1.1, boom: 1.25, f0: 105, f1: 40, boomDecay: 0.2, mech: 0.0, drive: 3.3, len: 0.9 },
  mpistol: { crack: 0.8, bodyCut: 7200, bodyDecay: 0.04, body: 0.9, boom: 0.5, f0: 190, f1: 70, boomDecay: 0.06, mech: 0.3, drive: 2.1, len: 0.45 },
};

function softclip(x, d) { return Math.tanh(x * d) / Math.tanh(d); }
function normalize(a, peak = 0.95) {
  let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]));
  if (m > 0) { const k = peak / m; for (let i = 0; i < a.length; i++) a[i] *= k; }
  return a;
}
function fadeOut(a, sr, ms = 10) {
  const n = Math.min(a.length, Math.floor(sr * ms / 1000));
  for (let i = 0; i < n; i++) a[a.length - 1 - i] *= i / n;
}
// RBJ biquad, in place
function biquad(a, type, f, Q, sr, gainDb = 0) {
  const w = 2 * Math.PI * f / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * Q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else { const A = Math.pow(10, gainDb / 40); b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y; a[i] = y;
  }
  return a;
}

function synthGun(sr, p, seed) {
  const n = Math.floor(sr * p.len);
  const out = new Float32Array(n);
  const rng = mulberry32(seed);
  let lp1 = 0, lp2 = 0, prev = 0, ph = 0;
  const mechT = 0.012 + rng() * 0.006;
  const mf = [2300 + rng() * 400, 3900 + rng() * 500, 5600 + rng() * 600];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const nz = rng() * 2 - 1;
    // transient crack (differentiated noise = bright)
    const crack = (nz - prev) * 0.5 * Math.exp(-t / 0.0016) * p.crack; prev = nz;
    // body: 2-pole lowpass with falling cutoff
    const fc = p.bodyCut * Math.exp(-t * 14) + 260;
    const a = 1 - Math.exp(-2 * Math.PI * fc / sr);
    lp1 += a * (nz - lp1); lp2 += a * (lp1 - lp2);
    const att = Math.min(1, t / 0.0006);
    const body = lp2 * 2.6 * att * (Math.exp(-t / p.bodyDecay) * 0.85 + Math.exp(-t / (p.bodyDecay * 4)) * 0.15) * p.body;
    // sub boom with pitch drop
    const f = p.f1 + (p.f0 - p.f1) * Math.exp(-t * 28);
    ph += 2 * Math.PI * f / sr;
    const boom = Math.sin(ph) * att * Math.exp(-t / p.boomDecay) * p.boom;
    // mechanical action
    let mech = 0;
    if (p.mech > 0 && t > mechT) {
      const tm = t - mechT;
      const e = Math.exp(-tm / 0.012);
      mech = (Math.sin(2 * Math.PI * mf[0] * tm) * 0.5 + Math.sin(2 * Math.PI * mf[1] * tm) * 0.35 + Math.sin(2 * Math.PI * mf[2] * tm) * 0.2 + nz * 0.3) * e * p.mech;
    }
    out[i] = softclip(crack + body + boom + mech, p.drive);
  }
  biquad(out, 'peak', 180, 0.8, sr, 3);
  fadeOut(out, sr, 40);
  return normalize(out);
}

function synthNoiseHit(sr, len, cut, decay, q = 1, type = 'bp', seed = 1, tone = 0, toneF = 0) {
  const n = Math.floor(sr * len), a = new Float32Array(n), r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    a[i] = (r() * 2 - 1) * Math.exp(-t / decay) * Math.min(1, t / 0.0005);
  }
  biquad(a, type, cut, q, sr);
  if (tone) for (let i = 0; i < n; i++) { const t = i / sr; a[i] += Math.sin(2 * Math.PI * toneF * t) * Math.exp(-t / (decay * 1.5)) * tone; }
  fadeOut(a, sr, 5);
  return normalize(a, 0.9);
}

function synthMetalClick(sr, len, freqs, decay, noise = 0.3, seed = 1) {
  const n = Math.floor(sr * len), a = new Float32Array(n), r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let s = 0;
    freqs.forEach((f, k) => { s += Math.sin(2 * Math.PI * f * t + k) * Math.exp(-t / (decay * (1 - k * 0.15))) / (k + 1); });
    s += (r() * 2 - 1) * noise * Math.exp(-t / (decay * 0.3));
    a[i] = s;
  }
  fadeOut(a, sr, 5);
  return normalize(a, 0.85);
}

function concat(sr, parts) {
  // parts: [[buffer, offsetSeconds, gain]]
  let len = 0; for (const [b, o] of parts) len = Math.max(len, Math.floor(o * sr) + b.length);
  const out = new Float32Array(len);
  for (const [b, o, g = 1] of parts) { const off = Math.floor(o * sr); for (let i = 0; i < b.length; i++) out[off + i] += b[i] * g; }
  return normalize(out, 0.9);
}

function sweepNoise(sr, len, f0, f1, decayShape, seed = 3, q = 2) {
  const n = Math.floor(sr * len), a = new Float32Array(n), r = mulberry32(seed);
  let lp = 0, bp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const f = f0 + (f1 - f0) * t;
    const k = 2 * Math.sin(Math.PI * Math.min(0.45, f / sr));
    const x = r() * 2 - 1;
    // state variable filter (bandpass)
    lp += k * bp; const hp = x - lp - bp / q; bp += k * hp;
    a[i] = bp * decayShape(t);
  }
  fadeOut(a, sr, 8);
  return normalize(a, 0.85);
}

function makeIR(ctx, kind) {
  const sr = ctx.sampleRate;
  const len = kind === 'indoor' ? 0.9 : 2.2;
  const n = Math.floor(sr * len);
  const buf = ctx.createBuffer(2, n, sr);
  const r = mulberry32(kind === 'indoor' ? 77 : 99);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const env = kind === 'indoor' ? Math.exp(-t / 0.16) : Math.exp(-t / 0.55) * 0.55;
      d[i] = (r() * 2 - 1) * env * (t < 0.008 ? t / 0.008 : 1);
    }
    if (kind !== 'indoor') {
      // discrete slapback echoes from buildings / containers
      for (const [dt, g] of [[0.09, 0.5], [0.17, 0.42], [0.26, 0.35], [0.41, 0.28], [0.63, 0.2], [0.9, 0.12]]) {
        const o = Math.floor((dt + (ch ? 0.013 : 0)) * sr);
        for (let i = 0; i < 1400 && o + i < n; i++) d[o + i] += (r() * 2 - 1) * g * Math.exp(-i / 380);
      }
    }
    biquad(d, 'lp', kind === 'indoor' ? 5000 : 3200, 0.7, sr);
  }
  return buf;
}

export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.buffers = {};
    this.ready = false;
    this.listener = { x: 0, y: 0, z: 0 };
    this.occlusionTest = null;
  }

  // must be called from a user gesture
  async unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.settings.volume;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -12; this.comp.ratio.value = 5; this.comp.attack.value = 0.002; this.comp.release.value = 0.18; this.comp.knee.value = 8;
    this.master.connect(this.comp); this.comp.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.reverb = c.createConvolver(); this.reverb.buffer = makeIR(c, 'outdoor');
    this.reverbIndoor = c.createConvolver(); this.reverbIndoor.buffer = makeIR(c, 'indoor');
    this.revGain = c.createGain(); this.revGain.gain.value = 0.42;
    this.revGainIn = c.createGain(); this.revGainIn.gain.value = 0.0;
    this.reverb.connect(this.revGain); this.revGain.connect(this.master);
    this.reverbIndoor.connect(this.revGainIn); this.revGainIn.connect(this.master);
    this.muffle = c.createBiquadFilter(); this.muffle.type = 'lowpass'; this.muffle.frequency.value = 22000;
    this.sfx.disconnect(); this.sfx.connect(this.muffle); this.muffle.connect(this.master);
    this.generate();
    this.startAmbience();
    this.ready = true;
  }

  setVolume(v) { if (this.master) this.master.gain.value = v; }
  setIndoor(amount) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.revGain.gain.setTargetAtTime(0.42 * (1 - amount) + 0.08, t, 0.3);
    this.revGainIn.gain.setTargetAtTime(0.35 * amount, t, 0.3);
  }
  // low health / explosion style muffling
  setMuffle(amount) {
    if (!this.ctx) return;
    this.muffle.frequency.setTargetAtTime(22000 - amount * 20500, this.ctx.currentTime, 0.08);
  }

  buf(data) {
    const b = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
    b.copyToChannel(data, 0);
    return b;
  }

  generate() {
    const sr = this.ctx.sampleRate;
    const B = this.buffers;
    const add = (name, arr) => { (B[name] || (B[name] = [])).push(this.buf(arr)); };
    for (const [k, p] of Object.entries(GUN)) for (let v = 0; v < 3; v++) add('gun_' + k, synthGun(sr, p, 1000 + v * 77 + k.length * 13));
    // hit feedback
    add('hit', concat(sr, [[synthMetalClick(sr, 0.05, [2600, 4100], 0.012, 0.6, 5), 0, 1], [synthNoiseHit(sr, 0.03, 3000, 0.006, 1.5, 'bp', 6), 0, 0.5]]));
    add('hitHead', concat(sr, [[synthMetalClick(sr, 0.18, [3300, 4950, 6600], 0.05, 0.3, 7), 0, 1], [synthNoiseHit(sr, 0.04, 2500, 0.01, 1, 'bp', 8), 0, 0.6]]));
    add('kill', concat(sr, [[synthNoiseHit(sr, 0.25, 120, 0.06, 0.8, 'lp', 9, 1.2, 70), 0, 1.0], [synthMetalClick(sr, 0.12, [1800, 2700], 0.03, 0.4, 10), 0.0, 0.7]]));
    add('armor', synthMetalClick(sr, 0.1, [1500, 2300, 3700], 0.025, 0.5, 11));
    // impacts
    for (let v = 0; v < 3; v++) {
      add('imp_concrete', concat(sr, [[synthNoiseHit(sr, 0.12, 1800 + v * 300, 0.025, 0.8, 'bp', 20 + v), 0, 1], [synthNoiseHit(sr, 0.2, 400, 0.05, 0.7, 'lp', 23 + v), 0.003, 0.5]]));
      add('imp_metal', concat(sr, [[synthMetalClick(sr, 0.35, [1700 + v * 230, 2900 + v * 160, 4400], 0.08, 0.4, 30 + v), 0, 1], [synthNoiseHit(sr, 0.05, 3500, 0.01, 1, 'bp', 33 + v), 0, 0.5]]));
      add('imp_wood', concat(sr, [[synthNoiseHit(sr, 0.15, 900 + v * 120, 0.03, 1.4, 'bp', 40 + v), 0, 1], [synthMetalClick(sr, 0.08, [420, 650], 0.02, 0.2, 43 + v), 0, 0.4]]));
      add('imp_dirt', synthNoiseHit(sr, 0.15, 700 + v * 100, 0.035, 0.7, 'bp', 50 + v));
      add('imp_flesh', concat(sr, [[synthNoiseHit(sr, 0.12, 500, 0.03, 0.9, 'lp', 60 + v, 0.8, 90), 0, 1], [synthNoiseHit(sr, 0.05, 1500, 0.01, 1, 'bp', 63 + v), 0, 0.5]]));
      add('step_concrete', concat(sr, [[synthNoiseHit(sr, 0.1, 300 + v * 40, 0.018, 0.9, 'lp', 70 + v, 0.6, 70), 0, 1], [synthNoiseHit(sr, 0.07, 2600, 0.012, 0.8, 'bp', 73 + v), 0.008, 0.35]]));
      add('step_metal', concat(sr, [[synthNoiseHit(sr, 0.1, 400, 0.02, 0.9, 'lp', 80 + v, 0.6, 80), 0, 1], [synthMetalClick(sr, 0.2, [700 + v * 90, 1300 + v * 70], 0.05, 0.3, 83 + v), 0.004, 0.55]]));
      add('step_dirt', concat(sr, [[synthNoiseHit(sr, 0.12, 260, 0.022, 0.8, 'lp', 90 + v), 0, 1], [synthNoiseHit(sr, 0.1, 1800, 0.02, 0.6, 'bp', 93 + v), 0.01, 0.5]]));
    }
    add('glass', concat(sr, Array.from({ length: 14 }, (_, i) => [synthMetalClick(sr, 0.12, [3000 + i * 337 % 2500, 5200 + i * 211 % 1800], 0.03, 0.6, 100 + i), i * 0.012 + Math.random() * 0.01, 0.6 + Math.random() * 0.4])));
    // movement foley
    add('slide', sweepNoise(sr, 0.75, 2200, 700, (t) => Math.min(1, t * 12) * (1 - t) * (1 - t), 5, 0.7));
    add('dive', sweepNoise(sr, 0.45, 600, 1800, (t) => Math.sin(t * Math.PI), 6, 0.8));
    add('jump', sweepNoise(sr, 0.18, 1400, 900, (t) => Math.sin(t * Math.PI) * 0.6, 7, 0.9));
    add('land', concat(sr, [[synthNoiseHit(sr, 0.18, 180, 0.04, 0.8, 'lp', 110, 1, 60), 0, 1], [sweepNoise(sr, 0.15, 1500, 800, (t) => 1 - t, 8, 0.8), 0.01, 0.4]]));
    add('mantle', concat(sr, [[synthNoiseHit(sr, 0.12, 220, 0.03, 0.8, 'lp', 111, 0.8, 70), 0, 1], [sweepNoise(sr, 0.25, 1200, 700, (t) => Math.sin(t * Math.PI), 9, 0.9), 0.02, 0.6]]));
    add('whiz', sweepNoise(sr, 0.16, 5200, 1600, (t) => Math.sin(Math.min(1, t * 1.3) * Math.PI), 12, 3));
    add('whiz', sweepNoise(sr, 0.13, 6000, 2000, (t) => Math.sin(Math.min(1, t * 1.2) * Math.PI), 13, 3));
    // weapon handling
    const clk = (fr, d, nz, s) => synthMetalClick(sr, d * 4, fr, d, nz, s);
    add('magOut', concat(sr, [[clk([1900, 3100], 0.012, 0.5, 200), 0, 1], [sweepNoise(sr, 0.12, 3000, 1500, (t) => 1 - t, 201, 1.5), 0.01, 0.5]]));
    add('magIn', concat(sr, [[synthNoiseHit(sr, 0.08, 400, 0.015, 0.8, 'lp', 202, 0.6, 140), 0, 0.8], [clk([2200, 3500, 5100], 0.018, 0.6, 203), 0.004, 1]]));
    add('magTouch', clk([1500, 2600], 0.008, 0.6, 204));
    add('magKnock', concat(sr, [[clk([1100, 2100, 3300], 0.02, 0.6, 290), 0, 1], [synthNoiseHit(sr, 0.04, 700, 0.01, 0.8, 'bp', 291), 0, 0.5]]));
    add('magDrop', concat(sr, [[synthNoiseHit(sr, 0.1, 260, 0.02, 0.8, 'lp', 292, 0.8, 90), 0, 1], [clk([1300, 2300], 0.02, 0.5, 293), 0.005, 0.7],
      [clk([1500, 2600], 0.015, 0.5, 294), 0.12, 0.35], [clk([1700, 2800], 0.012, 0.5, 295), 0.2, 0.15]]));
    add('pouch', sweepNoise(sr, 0.16, 900, 1700, (t) => Math.sin(t * Math.PI) * 0.8, 296, 1.2));
    add('chargeBack', concat(sr, [[sweepNoise(sr, 0.09, 2500, 4000, (t) => t, 205, 2), 0, 0.6], [clk([1600, 2800, 4200], 0.02, 0.5, 206), 0.07, 1]]));
    add('chargeFwd', concat(sr, [[clk([1300, 2400, 3900], 0.03, 0.6, 207), 0, 1], [synthNoiseHit(sr, 0.06, 300, 0.02, 0.8, 'lp', 208), 0, 0.6]]));
    add('boltUp', clk([1800, 3000], 0.012, 0.4, 209));
    add('boltBack', concat(sr, [[sweepNoise(sr, 0.12, 2000, 3500, (t) => t, 210, 2), 0, 0.6], [clk([1400, 2600], 0.02, 0.5, 211), 0.1, 1]]));
    add('boltFwd', concat(sr, [[sweepNoise(sr, 0.1, 3500, 2000, (t) => 1 - t, 212, 2), 0, 0.5], [clk([1500, 2700, 4000], 0.025, 0.5, 213), 0.08, 1]]));
    add('boltDown', clk([1700, 2900], 0.015, 0.5, 214));
    add('pumpBack', concat(sr, [[sweepNoise(sr, 0.1, 1200, 2400, (t) => t, 215, 1.5), 0, 0.7], [clk([900, 1700, 2600], 0.03, 0.6, 216), 0.08, 1]]));
    add('pumpFwd', concat(sr, [[sweepNoise(sr, 0.08, 2400, 1200, (t) => 1 - t, 217, 1.5), 0, 0.7], [clk([1000, 1900, 3000], 0.03, 0.6, 218), 0.06, 1]]));
    add('shellIn', concat(sr, [[clk([1200, 2200], 0.012, 0.5, 219), 0, 1], [synthNoiseHit(sr, 0.05, 500, 0.012, 0.8, 'lp', 220), 0, 0.5]]));
    add('coverOpen', clk([900, 1600, 2500], 0.03, 0.5, 221));
    add('coverClose', concat(sr, [[clk([800, 1500, 2300], 0.04, 0.6, 222), 0, 1], [synthNoiseHit(sr, 0.1, 250, 0.03, 0.8, 'lp', 223), 0, 0.7]]));
    add('slideFwd', clk([1700, 2900, 4300], 0.02, 0.6, 224));
    add('dryfire', clk([2500, 4200], 0.006, 0.4, 225));
    add('cylOpen', clk([2000, 3300], 0.015, 0.5, 226));
    add('cylClose', concat(sr, [[clk([1600, 2800], 0.025, 0.5, 227), 0, 1], [sweepNoise(sr, 0.1, 4000, 2000, (t) => 1 - t, 228, 2), 0.0, 0.4]]));
    add('hammer', clk([2400, 3900], 0.01, 0.5, 229));
    add('loaderIn', concat(sr, [[clk([1300, 2300], 0.015, 0.6, 230), 0, 1], [clk([1500, 2600], 0.012, 0.6, 231), 0.03, 0.8]]));
    add('ejectAll', concat(sr, Array.from({ length: 6 }, (_, i) => [clk([3200 + i * 300, 5000 + i * 200], 0.03, 0.3, 240 + i), 0.1 + i * 0.03, 0.4])));
    add('draw', concat(sr, [[sweepNoise(sr, 0.18, 900, 1600, (t) => Math.sin(t * Math.PI), 250, 1), 0, 0.6], [clk([1400, 2500], 0.012, 0.4, 251), 0.12, 0.7]]));
    add('holster', sweepNoise(sr, 0.15, 1500, 800, (t) => Math.sin(t * Math.PI), 252, 1));
    add('inspect1', sweepNoise(sr, 0.25, 800, 1300, (t) => Math.sin(t * Math.PI) * 0.6, 253, 1));
    add('inspect2', concat(sr, [[sweepNoise(sr, 0.25, 1200, 800, (t) => Math.sin(t * Math.PI) * 0.6, 254, 1), 0, 1], [clk([1800, 2900], 0.012, 0.4, 255), 0.15, 0.5]]));
    add('casing', concat(sr, [[clk([4200, 6100, 7900], 0.03, 0.2, 260), 0, 1], [clk([4600, 6600], 0.02, 0.2, 261), 0.07, 0.5], [clk([4400, 6300], 0.015, 0.2, 262), 0.13, 0.3]]));
    add('casingShotgun', concat(sr, [[synthNoiseHit(sr, 0.06, 800, 0.015, 1, 'bp', 263), 0, 1], [synthNoiseHit(sr, 0.05, 900, 0.012, 1, 'bp', 264), 0.09, 0.6]]));
    add('hurt', concat(sr, [[synthNoiseHit(sr, 0.3, 140, 0.08, 0.9, 'lp', 270, 1, 55), 0, 1], [sweepNoise(sr, 0.2, 600, 300, (t) => 1 - t, 271, 1), 0, 0.4]]));
    add('heartbeat', concat(sr, [[synthNoiseHit(sr, 0.15, 90, 0.04, 0.8, 'lp', 272, 1, 50), 0, 1], [synthNoiseHit(sr, 0.15, 80, 0.04, 0.8, 'lp', 273, 1, 45), 0.22, 0.7]]));
    add('uiClick', clk([2000, 3200], 0.01, 0.3, 280));
    add('uiHover', clk([3000], 0.006, 0.2, 281));
    add('spawn', sweepNoise(sr, 0.5, 400, 1600, (t) => Math.sin(t * Math.PI) * 0.5, 282, 1.2));
    add('denied', clk([400, 600], 0.04, 0.3, 283));
  }

  startAmbience() {
    const c = this.ctx, sr = c.sampleRate, n = sr * 6;
    const b = c.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let l = 0, l2 = 0;
      const r = mulberry32(500 + ch);
      for (let i = 0; i < n; i++) {
        const x = r() * 2 - 1;
        l += 0.02 * (x - l); l2 += 0.004 * (l - l2);
        const t = i / sr;
        d[i] = (l * 0.7 + l2 * 2.5) * (0.6 + 0.4 * Math.sin(t * 0.9 + ch) * Math.sin(t * 0.37));
      }
      // seamless loop crossfade
      const f = Math.floor(sr * 0.5);
      for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[n - f + i] * (1 - k); }
    }
    const s = c.createBufferSource(); s.buffer = b; s.loop = true;
    const g = c.createGain(); g.gain.value = 0.16;
    s.connect(g); g.connect(this.master); s.start();
    this.ambGain = g;
  }

  setListener(pos, fwd, up) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    this.listener.x = pos.x; this.listener.y = pos.y; this.listener.z = pos.z;
    if (L.positionX) {
      const t = this.ctx.currentTime;
      L.positionX.setValueAtTime(pos.x, t); L.positionY.setValueAtTime(pos.y, t); L.positionZ.setValueAtTime(pos.z, t);
      L.forwardX.setValueAtTime(fwd.x, t); L.forwardY.setValueAtTime(fwd.y, t); L.forwardZ.setValueAtTime(fwd.z, t);
      L.upX.setValueAtTime(up.x, t); L.upY.setValueAtTime(up.y, t); L.upZ.setValueAtTime(up.z, t);
    } else { L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }
  }

  // play a sound. opts: { pos, vol, rate, rev, lowpass, far }
  play(name, opts = {}) {
    if (!this.ready) return null;
    const list = this.buffers[name];
    if (!list) return null;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = list[(Math.random() * list.length) | 0];
    src.playbackRate.value = (opts.rate || 1) * (1 + (Math.random() - 0.5) * (opts.rateVar ?? 0.06));
    let node = src;
    const g = c.createGain();
    g.gain.value = opts.vol ?? 1;
    let dist = 0;
    if (opts.pos) {
      const dx = opts.pos.x - this.listener.x, dy = opts.pos.y - this.listener.y, dz = opts.pos.z - this.listener.z;
      dist = Math.hypot(dx, dy, dz);
      if (dist > (opts.maxDist || 120)) return null;
    }
    let cutoff = opts.lowpass || 0;
    if (opts.pos) {
      // distance softening + occlusion muffling
      if (dist > 25) cutoff = Math.min(cutoff || 20000, 12000 - Math.min(9500, (dist - 25) * 110));
      if (this.occlusionTest && opts.occlude !== false && !this.occlusionTest(opts.pos)) cutoff = Math.min(cutoff || 20000, 900);
    }
    if (cutoff) {
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 0.5;
      node.connect(f); node = f;
    }
    node.connect(g); node = g;
    if (opts.pos) {
      const p = c.createPanner();
      p.panningModel = 'equalpower'; p.distanceModel = 'inverse';
      p.refDistance = opts.ref || 4; p.rolloffFactor = opts.rolloff ?? 1.1; p.maxDistance = 300;
      if (p.positionX) { p.positionX.value = opts.pos.x; p.positionY.value = opts.pos.y; p.positionZ.value = opts.pos.z; }
      else p.setPosition(opts.pos.x, opts.pos.y, opts.pos.z);
      node.connect(p); node = p;
    }
    node.connect(this.sfx);
    if (opts.rev) {
      const rg = c.createGain(); rg.gain.value = opts.rev;
      node.connect(rg); rg.connect(this.reverb); rg.connect(this.reverbIndoor);
    }
    src.start(c.currentTime + (opts.delay || 0));
    return src;
  }

  gunshot(sound, opts = {}) {
    const own = !opts.pos;
    this.play('gun_' + sound, { ...opts, vol: (opts.vol ?? 1) * (own ? 0.85 : 1.25), rev: own ? 0.9 : 1.1, rateVar: 0.07, ref: 9, rolloff: 0.85, maxDist: 400 });
  }
}

export { GUN as GUN_SOUNDS, clamp as _clamp };
