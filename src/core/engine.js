import * as THREE from 'three';

// Graphics presets. Everything expensive is tied to these so weak PCs stay smooth.
export const QUALITY = {
  low: { label: 'Niedrig', scale: 0.75, maxScale: 0.85, shadows: 0, aa: false, standard: false, particles: 0.5, decals: 60, viewDist: 140, anisotropy: 1, pipRes: 256 },
  medium: { label: 'Mittel', scale: 1.0, maxScale: 1.0, shadows: 2048, aa: true, standard: true, particles: 0.8, decals: 120, viewDist: 220, anisotropy: 4, pipRes: 384 },
  high: { label: 'Hoch', scale: 1.0, maxScale: 1.5, shadows: 4096, aa: true, standard: true, particles: 1.0, decals: 200, viewDist: 300, anisotropy: 8, pipRes: 512 },
};

export class Engine {
  constructor(container, settings) {
    this.settings = settings;
    this.q = QUALITY[settings.quality] || QUALITY.medium;
    this.renderer = new THREE.WebGLRenderer({ antialias: this.q.aa, powerPreference: 'high-performance', stencil: false });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = this.q.shadows > 0;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.shadowMap.autoUpdate = false; // static world shadows are baked once per map
    r.autoClear = false;
    r.info.autoReset = false;
    container.appendChild(r.domElement);
    r.domElement.id = 'game-canvas';

    this.scale = this.q.scale;
    this.frameTimes = [];
    this.dynTimer = 0;

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, this.q.viewDist + 100);
    this.vmCamera = new THREE.PerspectiveCamera(55, 1, 0.01, 10);

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  get maxAnisotropy() { return Math.min(this.q.anisotropy, this.renderer.capabilities.getMaxAnisotropy()); }

  setScale(s) {
    this.scale = THREE.MathUtils.clamp(s, 0.5, this.q.maxScale);
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr * this.scale);
    this.renderer.setSize(w, h, true);
    this.aspect = w / h;
    this.camera.aspect = this.aspect; this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = this.aspect; this.vmCamera.updateProjectionMatrix();
  }

  // Horizontal FOV (like most shooters) -> vertical FOV for three.js
  hfovToV(hdeg) {
    const h = THREE.MathUtils.degToRad(hdeg);
    return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h / 2) / this.aspect));
  }

  // Dynamic resolution: drop render scale when the frame rate sags, raise it again when there's headroom.
  trackFrame(dt) {
    if (!this.settings.dynamicRes) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 90) this.frameTimes.shift();
    this.dynTimer += dt;
    if (this.dynTimer < 1.5 || this.frameTimes.length < 60) return;
    this.dynTimer = 0;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const p80 = sorted[Math.floor(sorted.length * 0.8)];
    if (p80 > 1 / 48 && this.scale > 0.5) this.setScale(this.scale - 0.1);
    else if (p80 < 1 / 75 && this.scale < this.q.maxScale) this.setScale(this.scale + 0.05);
  }

  render(scene, vmScene, extraBefore) {
    const r = this.renderer;
    r.info.reset();
    r.clear();
    if (extraBefore) extraBefore();
    r.render(scene, this.camera);
    if (vmScene) { r.clearDepth(); r.render(vmScene, this.vmCamera); }
  }
}
