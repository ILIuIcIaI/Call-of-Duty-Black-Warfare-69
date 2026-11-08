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
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, P.shellEdge, 0.034, HB + 0.004, 0.034, x * (W / 2 - 0.012), HB / 2, z * (D / 2 - 0.012));
    this.latches = [-0.15, 0.15].map((x) => box(g, P.grayDark, 0.05, 0.03, 0.012, x, HB - 0.006, D / 2 + 0.005));
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
    for (const [x, z] of [[-1, 0], [1, 0], [-1, 1], [1, 1]]) box(lid, P.shellEdge, 0.034, HL + 0.004, 0.034, x * (W / 2 - 0.012), HL / 2, 0.012 + z * (D - 0.024));
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
    this.levers = []; this.lamps = [];
    for (let i = 0; i < 3; i++) {
      const z = -0.03 + i * 0.045;
      box(g, P.metal, 0.03, 0.004, 0.022, -0.068, F + 0.047, z);
      const lv = new THREE.Group(); lv.position.set(-0.068, F + 0.049, z); g.add(lv);
      cyl(lv, P.steel, 0.0035, 0.024, 0, 0.012, 0);
      box(lv, P.steel, 0.008, 0.006, 0.008, 0, 0.025, 0);
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
      this.dets.push(det);
      const w = tube(g, P.wire, [[x, F + 0.08, -0.085], [x - 0.01, F + 0.1, -0.06], [-0.03 - i * 0.004, F + 0.075, -0.02 + i * 0.012], [-0.045, F + 0.05, -0.04 + i * 0.03]], 0.0022);
      if (i === 0) this.detWire = w;
      this.geos.push(w.geometry);
    }
    for (const z of [-0.06, 0.07]) box(g, P.tape, 0.238, 0.054, 0.026, 0.082, F + 0.026, z);
    // right: the trigger box, its button and lamp, the blue cable up into the lid
    box(g, P.gray, 0.048, 0.04, 0.16, 0.208, F + 0.02, 0.025);
    box(g, P.grayDark, 0.05, 0.006, 0.05, 0.208, F + 0.043, -0.025);
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
    box(lid, P.module, 0.085, 0.03, 0.12, -0.185, iy - 0.015, D - 0.09);
    box(lid, P.sticker, 0.05, 0.002, 0.03, -0.19, iy - 0.031, D - 0.06);
    cyl(lid, P.fan, 0.022, 0.004, -0.185, iy - 0.031, D - 0.115);
    this.geos.push(tube(lid, P.wireY, [[-0.145, iy - 0.02, D - 0.06], [-0.13, iy - 0.03, D - 0.03], [-0.215, iy - 0.025, D - 0.03]], 0.0025).geometry);
    this.geos.push(tube(lid, P.wire, [[-0.145, iy - 0.02, D - 0.13], [-0.13, iy - 0.035, D - 0.17], [-0.215, iy - 0.02, D - 0.17]], 0.0025).geometry);
    box(lid, P.module, 0.035, 0.02, 0.03, 0.19, iy - 0.01, D - 0.07);
    this.geos.push(tube(lid, P.wireB, [[0.19, iy - 0.02, D - 0.07], [0.205, iy - 0.03, D - 0.2], [0.19, iy - 0.01, 0.02]], 0.004).geometry);
    box(lid, P.ribbon, 0.035, 0.003, 0.11, 0.035, iy - 0.004, 0.065);
  }

  // the tablet's picture: a map with lines, our own
  tabletMat() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 80;
    const x = c.getContext('2d');
    x.fillStyle = '#9fc6e0'; x.fillRect(0, 0, 64, 80);
    x.strokeStyle = '#4a7fa8'; x.lineWidth = 2;
    for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(4, 10 + i * 11); x.lineTo(60, 8 + i * 12); x.stroke(); }
    x.fillStyle = '#d23a2a'; x.fillRect(38, 30, 8, 8);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    this.tabTex = t;
    return (this.tabMat = new THREE.MeshBasicMaterial({ map: t }));
  }

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
    const key = mode + '|' + (mode === 'boot' ? Math.floor(a * 40) : mode === 'arm' || mode === 'defuse' ? Math.floor((mode === 'arm' ? a : b) * 60) + '|' + Math.ceil(a * (mode === 'defuse' ? 1 : 0)) : mode === 'count' ? Math.ceil(a * 10) : '');
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
      skull(Wc / 2, 76, 10, '#e8edf0');
      line('SCHARF MACHEN', 152, '#ffffff', 20, 'center');
      bar(a, 168, '#3a8fe8');
      line('ZUENDER WIRD INITIALISIERT', 196, '#9fb3bb', 14, 'center');
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

  // the i-th arming switch: off (toward the back, lamp red) or on (forward, lamp green)
  flip(i, on, force) {
    if (this.simple || (!force && this.flips[i] === on)) return;
    this.flips[i] = on;
    const P = parts();
    this.levers[i].rotation.x = on ? 0.5 : -0.5;
    this.lamps[i].material = on ? P.ledGreen : P.ledOff;
  }
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
    this.lid(0);
    if (this.simple) return;
    this.screen('off'); for (let i = 0; i < 3; i++) this.flip(i, false); this.trigger(false); this.pull(0); this.setLed(false);
  }

  // where the hands go, in the case's own space
  spot(name, out = new THREE.Vector3()) {
    const F = WALL;
    if (name === 'handle') return out.set(0, HB - 0.01, D / 2 + 0.04);
    if (name === 'latchL') return out.set(-0.15, HB - 0.004, D / 2 + 0.014);
    if (name === 'latchR') return out.set(0.15, HB - 0.004, D / 2 + 0.014);
    if (name === 'lidEdge') { // the front edge of the lid, wherever it is
      const a = -OPEN * Math.max(0, this.k);
      const y = HL * 0.5, z = D;
      return out.set(-0.12, HB + y * Math.cos(a) - z * Math.sin(a), -D / 2 + y * Math.sin(a) + z * Math.cos(a));
    }
    if (name.startsWith('switch')) { const i = +name.slice(6); return out.set(-0.068, F + 0.078, -0.03 + i * 0.045); }
    if (name === 'trigger') return out.set(0.208, F + 0.052, 0.06);
    if (name === 'det') return out.copy(this.dets[0].position).add(new THREE.Vector3(0, 0.035, 0));
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
