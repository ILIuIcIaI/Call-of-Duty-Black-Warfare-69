import * as THREE from 'three';

// =============================================================================
// The bomb of Search and Destroy, built here from plain shapes: a black hard case, 50 x 36 cm, with a hinged lid.
// Opened, the lid shows a screen (the device starting up, a skull, the clock once it is down) next to a block of
// electronics and a cable connector; the case holds four charges in tape with a detonator in each, a module with
// three arming switches, a small tablet over a circuit board, and the trigger box the hand holds down.
// One model for every use: carried on a back (closed, smaller), lying where a carrier fell, planted (open), and in
// the hands. The case's own space: origin at the bottom middle, +z toward whoever kneels at it (the latches and the
// handle), the hinge along the back.
// =============================================================================
const W = 0.5, D = 0.36, HB = 0.1, HL = 0.06, WALL = 0.012, OPEN = 1.78; // (OPEN: the lid's angle, open, in radians)
let shared = null;
function parts() {
  if (shared) return shared;
  const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
  shared = {
    shell: lam(0x1d1f20), shellEdge: lam(0x2b2e30), rib: lam(0x26292b), liner: lam(0x141516), metal: lam(0x8b8f93), steel: lam(0xb9bdc0),
    charge: lam(0xd9d3c2), seam: lam(0xb4ad99), tape: lam(0x2f6fd6), det: lam(0x161616), wire: lam(0x101010), wireY: lam(0xd8b62a), wireB: lam(0x2a62e0), ribbon: lam(0x9a9c9e),
    module: lam(0x232526), pcb: lam(0x1f5a2c), chip: lam(0x121212), gray: lam(0x6f7377), grayDark: lam(0x45494d), sticker: lam(0xd8d4c6), fan: lam(0x0c0c0c),
    btn: lam(0xb81d16), btnLit: lam(0xff3a28, { emissive: 0xff2a18, emissiveIntensity: 0.9 }),
    ledOff: lam(0x3a0806), ledOn: lam(0xff2a18, { emissive: 0xff2a18, emissiveIntensity: 1.6 }), ledGreen: lam(0x2aff6a, { emissive: 0x22ff55, emissiveIntensity: 1.4 }),
    tabScreen: new THREE.MeshBasicMaterial({ color: 0x9fc6e0 }),
    boxG: new THREE.BoxGeometry(1, 1, 1), cylG: new THREE.CylinderGeometry(1, 1, 1, 14), ledG: new THREE.SphereGeometry(1, 10, 8),
  };
  return shared;
}
function box(g, mat, w, h, d, x, y, z) {
  const m = new THREE.Mesh(parts().boxG, mat);
  m.scale.set(w, h, d); m.position.set(x, y, z); g.add(m);
  return m;
}
function cyl(g, mat, r, len, x, y, z, axis = 'y') {
  const m = new THREE.Mesh(parts().cylG, mat);
  m.scale.set(r, len, r); m.position.set(x, y, z);
  if (axis === 'x') m.rotation.z = Math.PI / 2; else if (axis === 'z') m.rotation.x = Math.PI / 2;
  g.add(m);
  return m;
}
function tube(g, mat, pts, r) {
  const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]))), 16, r, 5, false), mat);
  g.add(m);
  return m;
}
// a pixel skull, our own, 11 x 12
const SKULL = [
  '...#####...',
  '.#########.',
  '###########',
  '###########',
  '##...#...##',
  '##...#...##',
  '###########',
  '#####.#####',
  '.####.####.',
  '..#######..',
  '..#.#.#.#..',
  '..#######..',
];

export class BombModel {
  // simple: only the outside (the case on a back or on the floor never opens)
  constructor({ simple = false } = {}) {
    const P = parts();
    const g = this.root = new THREE.Group();
    this.geos = [];
    // ---- the base: a hollow shell, corner bumpers, latches and the handle at the front
    box(g, P.shell, W, WALL, D, 0, WALL / 2, 0);
    box(g, P.shell, W, HB, WALL, 0, HB / 2, D / 2 - WALL / 2);
    box(g, P.shell, W, HB, WALL, 0, HB / 2, -D / 2 + WALL / 2);
    for (const s of [-1, 1]) box(g, P.shell, WALL, HB, D, s * (W / 2 - WALL / 2), HB / 2, 0);
    // (rounded rubber corners, and a lip all round where the lid sits on it)
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl(g, P.shellEdge, 0.019, HB + 0.004, x * (W / 2 - 0.01), HB / 2, z * (D / 2 - 0.01));
    for (const s of [-1, 1]) { box(g, P.shellEdge, W - 0.03, 0.01, 0.008, 0, HB - 0.012, s * (D / 2 + 0.002)); box(g, P.shellEdge, 0.008, 0.01, D - 0.03, s * (W / 2 + 0.002), HB - 0.012, 0); }
    // (the latches turn out and down about their lower edge to let the lid go)
    this.latches = [-0.15, 0.15].map((x) => { const p = new THREE.Group(); p.position.set(x, HB - 0.021, D / 2 + 0.011); g.add(p); box(p, P.grayDark, 0.05, 0.03, 0.012, 0, 0.015, -0.006); return p; });
    const handle = this.handle = new THREE.Group(); handle.position.set(0, HB - 0.012, D / 2 + 0.008); g.add(handle);
    cyl(handle, P.grayDark, 0.009, 0.13, 0, 0, 0.032, 'x');
    for (const s of [-1, 1]) box(handle, P.grayDark, 0.014, 0.014, 0.034, s * 0.065, 0, 0.016);
    handle.rotation.x = -1.2; // (folded down against the case; carried, it swings up)
    // ---- the lid on its hinge along the back top edge
    const lid = this.lidPivot = new THREE.Group(); lid.position.set(0, HB, -D / 2); g.add(lid);
    box(lid, P.shell, W, WALL, D, 0, HL - WALL / 2, D / 2);
    box(lid, P.shell, W, HL, WALL, 0, HL / 2, D - WALL / 2);
    box(lid, P.shell, W, HL, WALL, 0, HL / 2, WALL / 2);
    for (const s of [-1, 1]) box(lid, P.shell, WALL, HL, D, s * (W / 2 - WALL / 2), HL / 2, D / 2);
    for (let i = 0; i < 6; i++) box(lid, P.rib, 0.014, 0.005, D - 0.07, -0.175 + i * 0.07, HL + 0.0025, D / 2);
    // (a raised rim round the top, rounded corners)
    for (const s of [-1, 1]) { box(lid, P.shellEdge, W - 0.02, 0.008, 0.014, 0, HL + 0.004, D / 2 + s * (D / 2 - 0.007)); box(lid, P.shellEdge, 0.014, 0.008, D - 0.02, s * (W / 2 - 0.007), HL + 0.004, D / 2); }
    for (const [x, z] of [[-1, 0], [1, 0], [-1, 1], [1, 1]]) cyl(lid, P.shellEdge, 0.019, HL + 0.006, x * (W / 2 - 0.01), HL / 2 + 0.001, 0.01 + z * (D - 0.02));
    for (const x of [-0.17, 0.17]) cyl(lid, P.metal, 0.008, 0.07, x, 0.004, 0.0, 'x'); // (the hinges)
    this.simple = simple;
    if (!simple) this.inside(P);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.k = -1; this.mode = null; this.flips = [false, false, false]; this.held = false; this.pulled = 0;
    this.lid(0);
    if (!simple) { this.screen('off'); for (let i = 0; i < 3; i++) this.flip(i, false, true); this.trigger(false, true); this.pull(0); }
  }

  inside(P) {
    const g = this.root, lid = this.lidPivot;
    const F = WALL; // the floor's top
    box(g, P.liner, W - 2 * WALL, 0.004, D - 2 * WALL, 0, F + 0.002, 0);
    // left: a small tablet on the circuit board it runs
    box(g, P.pcb, 0.135, 0.006, 0.12, -0.165, F + 0.006, 0.105);
    for (const [x, z, w, d] of [[-0.2, 0.08, 0.03, 0.03], [-0.15, 0.13, 0.04, 0.02], [-0.13, 0.08, 0.02, 0.025], [-0.205, 0.14, 0.02, 0.02]]) box(g, P.chip, w, 0.006, d, x, F + 0.012, z);
    box(g, P.grayDark, 0.14, 0.018, 0.175, -0.165, F + 0.013, -0.07);
    const tab = new THREE.Mesh(new THREE.PlaneGeometry(0.115, 0.145), this.tabletMat());
    tab.rotation.x = -Math.PI / 2; tab.position.set(-0.165, F + 0.0225, -0.07); g.add(tab);
    // middle left: the module with the three arming switches, each with its lamp
    box(g, P.module, 0.055, 0.045, 0.15, -0.068, F + 0.0225, 0.02);
    const st = new THREE.Mesh(P.ledG, P.ledOn); st.scale.setScalar(0.0035); st.position.set(-0.068, F + 0.046, 0.083); g.add(st); // (its own lamp: power)
    this.levers = []; this.lamps = [];
    for (let i = 0; i < 3; i++) {
      const z = -0.03 + i * 0.045;
      box(g, P.metal, 0.03, 0.004, 0.022, -0.068, F + 0.047, z);
      const lv = new THREE.Group(); lv.position.set(-0.068, F + 0.049, z); g.add(lv);
      cyl(lv, P.steel, 0.0035, 0.024, 0, 0.012, 0);
      box(lv, P.wireY, 0.009, 0.008, 0.009, 0, 0.026, 0); // (yellow caps)
      this.levers.push(lv);
      const lamp = new THREE.Mesh(P.ledG, P.ledOff); lamp.scale.setScalar(0.004); lamp.position.set(-0.049, F + 0.048, z); g.add(lamp);
      this.lamps.push(lamp);
    }
    // middle right: four charges in white wrap, two bands of blue tape, a detonator in each with its wire
    this.dets = [];
    for (let i = 0; i < 4; i++) {
      const x = -0.005 + i * 0.058;
      box(g, P.charge, 0.054, 0.05, 0.25, x, F + 0.025, 0.0);
      box(g, P.seam, 0.055, 0.004, 0.25, x, F + 0.05, 0.0);
      box(g, P.seam, 0.002, 0.051, 0.25, x + 0.026, F + 0.025, 0.0);
      const det = new THREE.Group(); det.position.set(x, F + 0.05, -0.085); g.add(det);
      cyl(det, P.det, 0.0075, 0.034, 0, 0.012, 0);
      cyl(det, P.metal, 0.0045, 0.012, 0, 0.033, 0);
      // (a small lamp on its side, lit once it has been checked and is live)
      const dl = new THREE.Mesh(P.ledG, P.ledOff); dl.scale.setScalar(0.0048); dl.position.set(0.0, 0.024, 0.0082); det.add(dl);
      det.userData.led = dl;
      this.dets.push(det);
      const w = tube(g, P.wire, [[x, F + 0.08, -0.085], [x - 0.01, F + 0.1, -0.06], [-0.03 - i * 0.004, F + 0.075, -0.02 + i * 0.012], [-0.045, F + 0.05, -0.04 + i * 0.03]], 0.0022);
      if (i === 0) this.detWire = w;
      this.geos.push(w.geometry);
    }
    for (const z of [-0.06, 0.07]) box(g, P.tape, 0.238, 0.054, 0.026, 0.082, F + 0.026, z);
    // right: the trigger box, its button and lamp, the blue cable up into the lid
    box(g, P.gray, 0.048, 0.04, 0.16, 0.208, F + 0.02, 0.025);
    // (its keypad: nine keys in a dark frame)
    box(g, P.grayDark, 0.046, 0.004, 0.05, 0.208, F + 0.041, -0.025);
    this.keys = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) this.keys.push(box(g, P.steel, 0.009, 0.004, 0.009, 0.196 + c * 0.012, F + 0.044, -0.04 + r * 0.014));
    this.lit = -1;
    this.button = cyl(g, P.btn, 0.012, 0.012, 0.208, F + 0.046, 0.06);
    this.led = new THREE.Mesh(P.ledG, P.ledOff); this.led.scale.setScalar(0.005); this.led.position.set(0.222, F + 0.043, 0.01); g.add(this.led);
    this.geos.push(tube(g, P.wireB, [[0.208, F + 0.03, -0.06], [0.205, F + 0.06, -0.12], [0.19, HB - 0.01, -D / 2 + 0.03]], 0.004).geometry);
    // the lid, inside: the screen in its frame, electronics to the left, the cable connector to the right, the ribbon
    const iy = HL - WALL; // (the inside of the lid's top plate)
    box(lid, P.liner, W - 2 * WALL, 0.004, D - 2 * WALL, 0, iy - 0.002, D / 2);
    box(lid, P.grayDark, 0.285, 0.012, 0.192, 0.035, iy - 0.006, D / 2 + 0.01);
    const cv = this.cv = document.createElement('canvas'); cv.width = 320; cv.height = 212;
    this.tex = new THREE.CanvasTexture(cv); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.screenMat = new THREE.MeshBasicMaterial({ map: this.tex });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.265, 0.175), this.screenMat);
    // (it faces down while the lid is shut; the canvas' top toward the lid's front edge, which is up when open)
    scr.rotation.x = Math.PI / 2; scr.position.set(0.035, iy - 0.0125, D / 2 + 0.01); lid.add(scr);
    this.geos.push(scr.geometry);
    // upper left: a hard disk in a bracket, its platter showing, a label on it
    box(lid, P.module, 0.09, 0.02, 0.125, -0.185, iy - 0.01, D - 0.09);
    box(lid, P.metal, 0.08, 0.004, 0.105, -0.185, iy - 0.022, D - 0.095);
    cyl(lid, P.steel, 0.03, 0.003, -0.185, iy - 0.0245, D - 0.105);
    cyl(lid, P.grayDark, 0.007, 0.004, -0.185, iy - 0.026, D - 0.105);
    box(lid, P.grayDark, 0.005, 0.003, 0.045, -0.165, iy - 0.026, D - 0.125);
    box(lid, P.sticker, 0.05, 0.002, 0.026, -0.19, iy - 0.0245, D - 0.052);
    this.geos.push(tube(lid, P.wireY, [[-0.145, iy - 0.02, D - 0.06], [-0.13, iy - 0.03, D - 0.03], [-0.215, iy - 0.025, D - 0.03]], 0.0025).geometry);
    this.geos.push(tube(lid, P.wire, [[-0.145, iy - 0.02, D - 0.13], [-0.13, iy - 0.035, D - 0.17], [-0.215, iy - 0.02, D - 0.17]], 0.0025).geometry);
    box(lid, P.module, 0.035, 0.02, 0.03, 0.19, iy - 0.01, D - 0.07);
    this.geos.push(tube(lid, P.wireB, [[0.19, iy - 0.02, D - 0.07], [0.205, iy - 0.03, D - 0.2], [0.19, iy - 0.01, 0.02]], 0.004).geometry);
    box(lid, P.ribbon, 0.035, 0.003, 0.11, 0.035, iy - 0.004, 0.065);
  }

  // the tablet's picture: a map with lines, our own; once tapped, a green bar over it
  tabletMat() {
    const c = this.tabCv = document.createElement('canvas'); c.width = 64; c.height = 80;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    this.tabTex = t;
    this.tabMat = new THREE.MeshBasicMaterial({ map: t });
    this.tablet(false, true);
    return this.tabMat;
  }
  tablet(ok, force) {
    if (!this.tabCv || (!force && this.tabOk === ok)) return;
    this.tabOk = ok;
    const x = this.tabCv.getContext('2d');
    x.fillStyle = '#9fc6e0'; x.fillRect(0, 0, 64, 80);
    x.strokeStyle = '#4a7fa8'; x.lineWidth = 2;
    for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(4, 10 + i * 11); x.lineTo(60, 8 + i * 12); x.stroke(); }
    x.fillStyle = '#d23a2a'; x.fillRect(38, 30, 8, 8);
    if (ok) { x.fillStyle = '#2fbf5a'; x.fillRect(6, 58, 52, 16); x.fillStyle = '#ffffff'; x.font = 'bold 12px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('OK', 32, 66); }
    this.tabTex.needsUpdate = true;
  }
  // one key of the keypad down and lit (-1: none)
  key(i) {
    if (this.simple || i === this.lit) return;
    const P = parts(), F = WALL;
    if (this.lit >= 0) { this.keys[this.lit].material = P.steel; this.keys[this.lit].position.y = F + 0.044; }
    this.lit = i;
    if (i >= 0) { this.keys[i].material = P.btnLit; this.keys[i].position.y = F + 0.0425; }
  }
  // the lamp of the i-th detonator
  detLed(i, on) { if (this.simple) return; const d = this.dets[i], P = parts(); if (d) d.userData.led.material = on ? P.ledOn : P.ledOff; }

  // the lid: 0 shut, 1 open (a little past upright)
  lid(k) {
    k = Math.max(0, Math.min(1.08, k));
    if (k === this.k) return;
    this.k = k;
    this.lidPivot.rotation.x = -OPEN * k;
  }

  // the screen in the lid: 'off', 'boot' (a: 0..1, the lines coming up), 'arm' (a: 0..1, the bar), 'count' (a: seconds
  // left), 'defuse' (a: seconds left, b: 0..1), 'safe', 'dead'
  screen(mode, a = 0, b = 0) {
    if (this.simple) return;
    const key = mode + '|' + (mode === 'boot' ? Math.floor(a * 40) : mode === 'arm' ? Math.floor(a * 60) + '|' + b : mode === 'defuse' ? Math.floor(b * 60) + '|' + Math.ceil(a * 10) : mode === 'count' ? Math.ceil(a * 10) : '');
    if (key === this.mode) return;
    this.mode = key;
    const x = this.cv.getContext('2d'), Wc = 320, Hc = 212;
    x.fillStyle = '#05080a'; x.fillRect(0, 0, Wc, Hc);
    const line = (txt, y, col = '#c9d6dc', size = 16, align = 'left', px = 18) => { x.fillStyle = col; x.font = 'bold ' + size + 'px monospace'; x.textAlign = align; x.textBaseline = 'middle'; x.fillText(txt, align === 'center' ? Wc / 2 : px, y); };
    const bar = (u, y, col) => { x.fillStyle = '#20282c'; x.fillRect(34, y, Wc - 68, 9); x.fillStyle = col; x.fillRect(34, y, (Wc - 68) * Math.max(0, Math.min(1, u)), 9); };
    const skull = (cx, cy, s, col) => { x.fillStyle = col; SKULL.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') x.fillRect(cx + (c - 5.5) * s, cy + (r - 6) * s, s - 1, s - 1); })); };
    if (mode === 'off') { /* dark */ }
    else if (mode === 'boot') {
      const L = ['SYS 4.1 ...... OK', 'ZUENDKREIS ... OK', 'FUNK ......... OK', 'SPRENGSATZ WIRD', 'SCHARF GEMACHT'];
      const n = a * (L.length + 1);
      L.forEach((t, i) => { if (n > i) line(t.slice(0, Math.max(0, Math.floor((n - i) * t.length))), 30 + i * 34, i >= 3 ? '#ffffff' : '#8fa4ac', i >= 3 ? 24 : 19); });
    } else if (mode === 'arm') {
      // (b: how many digits of the code are typed in so far)
      skull(Wc / 2, 64, 9, '#e8edf0');
      line('SCHARF MACHEN', 128, '#ffffff', 19, 'center');
      const code = '4719', n = Math.max(0, Math.min(4, b | 0));
      line('CODE  ' + [...code].map((ch, i) => (i < n ? ch : '_')).join(' '), 154, n >= 4 ? '#7dff9a' : '#ffd84a', 20, 'center');
      bar(a, 174, '#3a8fe8');
      line('ZUENDER WIRD INITIALISIERT', 198, '#9fb3bb', 13, 'center');
    } else if (mode === 'count' || mode === 'defuse') {
      const s = Math.max(0, a), mm = Math.floor(s / 60), ss = Math.floor(s % 60), cs = Math.floor((s % 1) * 100);
      x.fillStyle = '#2a0504'; x.fillRect(18, 40, Wc - 36, 82);
      line(String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0') + ':' + String(cs).padStart(2, '0'), 82, '#ff3b2a', 52, 'center');
      line(mode === 'defuse' ? 'ENTSCHAERFEN' : 'SCHARF', 150, mode === 'defuse' ? '#ffffff' : '#ff7a6a', 20, 'center');
      if (mode === 'defuse') bar(b, 170, '#3ad46a');
    } else if (mode === 'safe') {
      skull(Wc / 2, 74, 9, '#2a6a3a');
      line('ENTSCHAERFT', 160, '#5dff8a', 26, 'center');
    } else if (mode === 'dead') { x.fillStyle = '#ffffff'; x.fillRect(0, 0, Wc, Hc); }
    this.tex.needsUpdate = true;
  }

  // the i-th arming switch: off (toward the back, lamp red) or on (forward, lamp green); or how far over it is, 0..1,
  // while a finger takes it over (the lamp changes halfway)
  flip(i, on, force) {
    if (this.simple || (!force && this.flips[i] === on)) return;
    this.flips[i] = on;
    const P = parts(), k = typeof on === 'number' ? on : on ? 1 : 0;
    this.levers[i].rotation.x = -0.5 + k;
    this.lamps[i].material = k > 0.5 ? P.ledGreen : P.ledOff;
  }
  // a latch open, 0 (shut) .. 1 (turned out and down)
  latch(i, k) { const l = this.latches[i]; if (l) l.rotation.x = 1.3 * Math.max(0, Math.min(1, +k)); }
  // the trigger's button held down
  trigger(on, force) {
    if (this.simple || (!force && this.held === on)) return;
    this.held = on;
    const P = parts();
    this.button.position.y = WALL + (on ? 0.041 : 0.046);
    this.button.material = on ? P.btnLit : P.btn;
  }
  // the first detonator pulled out of its charge (defusing), 0..1
  pull(k) {
    if (this.simple) return;
    k = Math.max(0, Math.min(1, k));
    if (k === this.pulled) return;
    this.pulled = k;
    const d = this.dets[0];
    d.position.set(-0.005 + k * 0.02, WALL + 0.05 + k * 0.12, -0.085 + k * 0.07);
    d.rotation.x = k * 0.9;
    this.detWire.visible = k < 0.85;
  }
  // the lamp on the trigger box: off, red, or green (defused)
  setLed(state) { if (this.simple) return; const P = parts(); this.led.material = state === 'green' ? P.ledGreen : state ? P.ledOn : P.ledOff; }

  // everything back to how it comes out of a bag
  reset() {
    this.lid(0); this.latch(0, 0); this.latch(1, 0);
    if (this.simple) return;
    this.screen('off'); for (let i = 0; i < 3; i++) this.flip(i, false); this.trigger(false); this.pull(0); this.setLed(false);
    this.key(-1); for (let i = 0; i < 4; i++) this.detLed(i, false); this.tablet(false);
  }

  // where the hands go, in the case's own space
  spot(name, out = new THREE.Vector3()) {
    const F = WALL;
    // (a point on the lid, wherever the lid is, or where it was at an opening given after an @: x across, y up from its
    // inside, z from the hinge)
    const at = name.indexOf('@'), lk = at < 0 ? this.k : +name.slice(at + 1);
    if (at >= 0) name = name.slice(0, at);
    const onLid = (x, y, z) => { const a = -OPEN * Math.max(0, lk); return out.set(x, HB + y * Math.cos(a) - z * Math.sin(a), -D / 2 + y * Math.sin(a) + z * Math.cos(a)); };
    if (name === 'handle') return out.set(0, HB - 0.01, D / 2 + 0.04);
    if (name === 'latchL') return out.set(-0.15, HB - 0.004, D / 2 + 0.014);
    if (name === 'latchR') return out.set(0.15, HB - 0.004, D / 2 + 0.014);
    if (name === 'lidEdge') return onLid(-0.12, HL * 0.5, D); // the front edge of the lid
    if (name === 'lidSide') return onLid(-W / 2 + 0.006, HL * 0.5, D * 0.5); // its left side, halfway up
    if (name.startsWith('switch')) { const i = +name.slice(6); return out.set(-0.068, F + 0.078, -0.03 + i * 0.045); }
    if (name === 'trigger' || name === 'button') return out.set(0.208, F + 0.052, 0.06);
    if (name.startsWith('key')) { const i = +name.slice(3); return out.set(0.196 + (i % 3) * 0.012, F + 0.047, -0.04 + Math.floor(i / 3) * 0.014); }
    if (name === 'tablet') return out.set(-0.165, F + 0.024, -0.05);
    if (name === 'det') return out.copy(this.dets[0].position).add(new THREE.Vector3(0, 0.035, 0));
    if (/^det\d$/.test(name)) return out.copy(this.dets[+name[3]].position).add(new THREE.Vector3(0, 0.04, 0));
    if (name === 'rimL') return out.set(-W / 2 + 0.01, HB + 0.006, 0.08);
    return out.set(0, HB, 0);
  }

  dispose() {
    if (this.tex) { this.tex.dispose(); this.screenMat.dispose(); }
    if (this.tabTex) { this.tabTex.dispose(); this.tabMat.dispose(); }
    for (const g of this.geos) g.dispose();
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}
export const BOMB_SIZE = { W, D, HB, HL };
