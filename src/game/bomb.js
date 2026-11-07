import * as THREE from 'three';

// =============================================================================
// The bomb of Search and Destroy, built here from plain shapes: a dented olive case with two charges strapped
// along its back, a control panel on top (a green display, a keypad of twelve keys, a red lamp), three wires
// from the panel into the charges and a stub of an antenna. About 26 x 17 cm, 9 cm high.
// One model for every use: carried on a back, lying where a carrier fell, planted, and in the hands.
// =============================================================================
const W = 0.26, H = 0.07, D = 0.17;
let shared = null;
function parts() {
  if (shared) return shared;
  const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
  shared = {
    case: lam(0x3d4232), caseDark: lam(0x2a2e24), panel: lam(0x1d1f1e), metal: lam(0x7c7f7a), charge: lam(0x8a7d55), tape: lam(0x1a1a18),
    key: lam(0xa9a89e), keyLit: lam(0xd8f5c8, { emissive: 0x6fe05a, emissiveIntensity: 0.9 }),
    ledOff: lam(0x3a0806), ledOn: lam(0xff2a18, { emissive: 0xff2a18, emissiveIntensity: 1.6 }), ledGreen: lam(0x2aff6a, { emissive: 0x22ff55, emissiveIntensity: 1.4 }),
    wire: [lam(0xc81e16), lam(0x1d4fc8), lam(0xd8b818)],
    boxG: new THREE.BoxGeometry(1, 1, 1), cylG: new THREE.CylinderGeometry(1, 1, 1, 14), ledG: new THREE.SphereGeometry(1, 10, 8),
  };
  return shared;
}
function box(g, mat, w, h, d, x, y, z) {
  const m = new THREE.Mesh(parts().boxG, mat);
  m.scale.set(w, h, d); m.position.set(x, y, z); g.add(m);
  return m;
}
function cyl(g, mat, r, len, x, y, z, axis = 'x') {
  const m = new THREE.Mesh(parts().cylG, mat);
  m.scale.set(r, len, r); m.position.set(x, y, z);
  if (axis === 'x') m.rotation.z = Math.PI / 2; else if (axis === 'z') m.rotation.x = Math.PI / 2;
  g.add(m);
  return m;
}

export class BombModel {
  constructor() {
    const P = parts();
    const g = this.root = new THREE.Group();
    // the case, with a darker rim where the lid closes and four rubber feet
    box(g, P.case, W, H * 0.62, D, 0, H * 0.31, 0);
    box(g, P.caseDark, W + 0.004, 0.01, D + 0.004, 0, H * 0.62, 0);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, P.tape, 0.03, 0.006, 0.03, x * (W / 2 - 0.025), 0.003, z * (D / 2 - 0.025));
    // two charges along the back, held by black tape
    for (const z of [-D / 2 + 0.03, -D / 2 + 0.075]) {
      cyl(g, P.charge, 0.022, W - 0.03, 0, H * 0.62 + 0.022, z);
      for (const x of [-0.08, 0.0, 0.08]) cyl(g, P.tape, 0.0235, 0.018, x, H * 0.62 + 0.022, z);
    }
    // the panel on the front half: display, lamp, keypad
    const top = H * 0.62 + 0.004;
    this.panel = box(g, P.panel, 0.15, 0.008, 0.07, 0.03, top, D / 2 - 0.042);
    const cv = this.lcdCanvas = document.createElement('canvas');
    cv.width = 128; cv.height = 32;
    this.lcdTex = new THREE.CanvasTexture(cv);
    this.lcdTex.colorSpace = THREE.SRGBColorSpace;
    this.lcdMat = new THREE.MeshBasicMaterial({ map: this.lcdTex });
    const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.017), this.lcdMat);
    lcd.rotation.x = -Math.PI / 2; lcd.position.set(-0.012, top + 0.0045, D / 2 - 0.062);
    g.add(lcd);
    this.led = new THREE.Mesh(P.ledG, P.ledOff);
    this.led.scale.setScalar(0.0055); this.led.position.set(0.045, top + 0.005, D / 2 - 0.062);
    g.add(this.led);
    // the keypad: 3 x 4 keys, 1-9, *, 0, #
    this.keys = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      const k = box(g, P.key, 0.016, 0.005, 0.0105, -0.012 + (c - 1) * 0.021, top + 0.006, D / 2 - 0.0415 + r * 0.0125);
      this.keys.push(k);
    }
    // the wires: panel to the charges, in loose arcs
    this.wires = P.wire.map((mat, i) => {
      const x0 = -0.03 + i * 0.012, curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x0 - 0.055, top + 0.004, D / 2 - 0.075),
        new THREE.Vector3(x0 - 0.07, top + 0.03 + i * 0.006, D / 2 - 0.1),
        new THREE.Vector3(x0 - 0.06 - i * 0.01, H * 0.62 + 0.045, -D / 2 + 0.05),
      ]);
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.0022, 5, false), mat);
      g.add(m);
      return m;
    });
    // the antenna stub at the corner
    cyl(g, P.tape, 0.003, 0.07, W / 2 - 0.02, top + 0.035, D / 2 - 0.018, 'y');
    box(g, P.metal, 0.012, 0.012, 0.012, W / 2 - 0.02, top + 0.003, D / 2 - 0.018);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.code = null; this.lit = -1;
    this.setCode('');
  }

  // where a key's top is, in the bomb's own space (for the finger that presses it)
  keyTop(i, out = new THREE.Vector3()) { const k = this.keys[i]; return out.set(k.position.x, k.position.y + 0.003, k.position.z); }

  // what the display shows
  setCode(text, color = '#7dff6a') {
    const key = text + '|' + color;
    if (key === this.code) return;
    this.code = key;
    const c = this.lcdCanvas.getContext('2d');
    c.fillStyle = '#0b1a0b'; c.fillRect(0, 0, 128, 32);
    c.fillStyle = color; c.font = 'bold 24px monospace'; c.textBaseline = 'middle'; c.textAlign = 'center';
    c.fillText(text, 64, 17);
    this.lcdTex.needsUpdate = true;
  }

  // one key lit while it is pressed (-1: none)
  press(i) {
    if (i === this.lit) return;
    const P = parts();
    if (this.lit >= 0) this.keys[this.lit].material = P.key;
    this.lit = i;
    if (i >= 0) this.keys[i].material = P.keyLit;
  }

  // the lamp: off, red, or green (defused)
  setLed(state) { const P = parts(); this.led.material = state === 'green' ? P.ledGreen : state ? P.ledOn : P.ledOff; }

  dispose() {
    this.lcdTex.dispose(); this.lcdMat.dispose();
    for (const w of this.wires) w.geometry.dispose();
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}
