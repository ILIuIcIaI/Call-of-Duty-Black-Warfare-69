import * as THREE from 'three';

// Graphics presets. Everything expensive is tied to these so weak PCs stay smooth.
// scale: share of the screen's pixels drawn (dynamic resolution moves it between minScale and maxScale)
// dpr: at most this many pixels per CSS pixel (high-DPI laptops), lodPx: a body smaller than this on screen (pixels tall) is drawn simple
// sky: 'flat' leaves out the clouds, hudHz: how often the minimap is drawn, skinRes: size of the painted weapon skins
// fps: below the first the picture gets smaller, above the second bigger again (a weak PC trades smoothness for a clearer picture)
export const QUALITY = {
  toaster: { label: 'Toaster', scale: 0.6, minScale: 0.35, maxScale: 0.75, dpr: 1, shadows: 0, aa: false, standard: false, particles: 0.35, decals: 30, viewDist: 110, anisotropy: 1, pipRes: 192, lodPx: 300, sky: 'flat', hudHz: 12, skinRes: 192, fps: [30, 45] },
  low: { label: 'Niedrig', scale: 0.75, minScale: 0.45, maxScale: 0.85, dpr: 1, shadows: 0, aa: false, standard: false, particles: 0.5, decals: 60, viewDist: 140, anisotropy: 1, pipRes: 256, lodPx: 130, sky: 'clouds', hudHz: 20, skinRes: 256, fps: [40, 62] },
  medium: { label: 'Mittel', scale: 1.0, minScale: 0.5, maxScale: 1.0, dpr: 1.5, shadows: 2048, aa: true, standard: true, particles: 0.8, decals: 120, viewDist: 220, anisotropy: 4, pipRes: 384, lodPx: 75, sky: 'clouds', hudHz: 30, skinRes: 384, fps: [48, 75] },
  high: { label: 'Hoch', scale: 1.0, minScale: 0.5, maxScale: 1.5, dpr: 2, shadows: 4096, aa: true, standard: true, particles: 1.0, decals: 200, viewDist: 300, anisotropy: 8, pipRes: 512, lodPx: 40, sky: 'clouds', hudHz: 30, skinRes: 384, fps: [48, 75] },
};
const ORDER = ['toaster', 'low', 'medium'];

// 'Auto': a look at the graphics chip (and the processor) before the real picture is made, on a canvas of its own.
// Never picks Hoch on its own: that one is the player's choice.
export function detectQuality() {
  let gpu = '', id = 'medium';
  try {
    const c = document.createElement('canvas'), gl = c.getContext('webgl2');
    if (!gl) return { id: 'toaster', gpu: 'kein WebGL 2' };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
  } catch (e) { return { id, gpu }; }
  const g = gpu.replace(/\(R\)|\(TM\)|®|™/gi, ' ');
  if (/swiftshader|llvmpipe|softpipe|basic render|software|gma|mali-[2-4]\d\d|powervr|intel\b[^,]*\bhd graphics(?!\s*\d)|hd graphics [23]\d{3}\b|hd graphics 4000\b/i.test(g)) id = 'toaster';
  else if (/intel\b[^,]*\b(u?hd graphics)|radeon\s*(r[2-7]\b|hd\s*[2-8]\d{3})|vega\s*[3-8]\b|geforce\s*(mx\s*1\d\d|[89]\d\dm|gt\s*[67]\d\d)|adreno|mali/i.test(g)) id = 'low';
  // two cores or a little memory: one step down
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 8;
  if ((cores <= 2 || mem <= 2) && id !== 'toaster') id = ORDER[ORDER.indexOf(id) - 1];
  return { id, gpu };
}

export class Engine {
  constructor(container, settings) {
    this.settings = settings;
    this.auto = settings.quality === 'auto' || !QUALITY[settings.quality];
    if (this.auto) { const d = detectQuality(); this.autoId = settings.autoDown && ORDER.indexOf(settings.autoDown) < ORDER.indexOf(d.id) ? settings.autoDown : d.id; this.gpu = d.gpu; }
    this.qid = this.auto ? this.autoId : settings.quality;
    this.q = QUALITY[this.qid];
    this.renderer = new THREE.WebGLRenderer({ antialias: this.q.aa, powerPreference: 'high-performance', stencil: false });
    if (!this.gpu) { try { const gl = this.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); this.gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''); } catch (e) { this.gpu = ''; } }
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
    this.scale = THREE.MathUtils.clamp(s, this.q.minScale, this.q.maxScale);
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.q.dpr);
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
    const [lo, hi] = this.q.fps;
    if (p80 > 1 / lo && this.scale > this.q.minScale) this.setScale(this.scale - 0.1);
    else if (p80 < 1 / hi && this.scale < this.q.maxScale) this.setScale(this.scale + 0.05);
    // Auto, and still slow with the smallest picture: next time one step lower
    this.slowT = p80 > 1 / 26 && this.scale <= this.q.minScale + 1e-3 ? (this.slowT || 0) + 1.5 : 0;
    if (this.auto && this.slowT >= 15 && this.qid !== 'toaster' && this.onTooSlow) { this.slowT = -1e9; this.onTooSlow(ORDER[ORDER.indexOf(this.qid) - 1]); }
  }

  render(scene, vmScene, extraBefore) {
    if (this.noDraw) return; // (nobody is looking)
    const r = this.renderer;
    r.info.reset();
    r.clear();
    if (extraBefore) extraBefore();
    r.render(scene, this.camera);
    if (vmScene) { r.clearDepth(); r.render(vmScene, this.vmCamera); }
    if (this.film > 0 || this.filmShot > 0) this.filmPass(); else this.filmOld = false;
  }

  // Film: every frame keeps a little of the one before, the way a film camera's shutter smears anything fast.
  // this.film is how much, only a finisher ever sets it.
  filmPass() {
    const r = this.renderer, w = r.domElement.width, h = r.domElement.height;
    if (!this.filmTex || this.filmTex.image.width !== w || this.filmTex.image.height !== h) {
      if (this.filmTex) this.filmTex.dispose();
      this.filmTex = new THREE.FramebufferTexture(w, h);
      this.filmOld = false;
    }
    if (!this.filmQuad) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { map: { value: null }, k: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: 'uniform sampler2D map; uniform float k; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(map, vUv).rgb, k); }',
        transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
      });
      this.filmQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      this.filmQuad.frustumCulled = false;
      this.filmScene = new THREE.Scene(); this.filmScene.add(this.filmQuad);
      this.filmCam = new THREE.Camera();
    }
    if (this.filmOld) {
      const u = this.filmQuad.material.uniforms;
      u.map.value = this.filmTex; u.k.value = Math.max(this.film, this.filmShot || 0);
      r.render(this.filmScene, this.filmCam);
    }
    r.copyFramebufferToTexture(this.filmTex);
    this.filmOld = true;
  }
}
