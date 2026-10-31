import * as THREE from 'three';
import { rand } from '../core/math.js';

// =============================================================================
// World-space effects, all pooled and batched (1 draw call per effect type):
// particles (sparks, dust, blood, glass), tracers, bullet-hole decals, world
// muzzle flashes for bots.
// =============================================================================

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function holeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 30);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.18, 'rgba(10,8,6,0.95)'); g.addColorStop(0.32, 'rgba(40,34,30,0.6)'); g.addColorStop(0.65, 'rgba(60,50,40,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  x.strokeStyle = 'rgba(20,16,12,0.5)'; x.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) { const a = Math.random() * Math.PI * 2, r0 = 6, r1 = 12 + Math.random() * 14; x.beginPath(); x.moveTo(32 + Math.cos(a) * r0, 32 + Math.sin(a) * r0); x.lineTo(32 + Math.cos(a) * r1, 32 + Math.sin(a) * r1); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const PARTICLE_VS = `
attribute float size; attribute vec4 pcolor;
varying vec4 vColor;
uniform float scale;
void main(){
  vColor = pcolor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * scale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const PARTICLE_FS = `
uniform sampler2D map; varying vec4 vColor;
void main(){
  vec4 t = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(vColor.rgb, vColor.a * t.a);
  if (gl_FragColor.a < 0.01) discard;
}`;

export class Particles {
  constructor(scene, max, additive) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.baseA = new Float32Array(max);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: dotTexture() }, scale: { value: 600 } },
      vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
    this.geo = g;
    this.alive = 0;
  }
  spawn(x, y, z, vx, vy, vz, life, size, r, g, b, a, grav = 0, drag = 0, grow = 0) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.baseSize[i] = size; this.grow[i] = grow;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.baseA[i] = a;
    this.grav[i] = grav; this.drag[i] = drag;
    this.alive = this.max;
  }
  update(dt) {
    if (!this.alive) return;
    let any = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      any++;
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= dr; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt; this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.baseSize[i] * (1 + this.grow[i] * (1 - k));
      this.col[i * 4 + 3] = this.baseA[i] * Math.min(1, k * 1.5);
    }
    if (!any) this.alive = 0;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.pcolor.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }
}

export class Effects {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    const q = game.engine.q;
    this.q = q;
    this.dust = new Particles(scene, Math.floor(700 * q.particles), false);
    this.sparks = new Particles(scene, Math.floor(400 * q.particles), true);

    // tracers (instanced, additive)
    const tg = new THREE.PlaneGeometry(1, 1); tg.translate(0, 0.5, 0);
    const tm = new THREE.MeshBasicMaterial({ color: 0xffd890, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.tracerMesh = new THREE.InstancedMesh(tg, tm, 64);
    this.tracerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tracerMesh.frustumCulled = false;
    this.tracers = Array.from({ length: 64 }, () => ({ life: 0 }));
    this.tracerNext = 0;
    scene.add(this.tracerMesh);

    // decals
    const dmax = q.decals;
    const dg = new THREE.PlaneGeometry(1, 1);
    const dm = new THREE.MeshBasicMaterial({ map: holeTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.decalMesh = new THREE.InstancedMesh(dg, dm, dmax);
    this.decalMesh.count = 0; this.decalMax = dmax; this.decalNext = 0;
    this.decalMesh.frustumCulled = false;
    scene.add(this.decalMesh);

    // world muzzle flashes (for bots)
    this.flashes = [];
    const fmat = new THREE.SpriteMaterial({ map: dotTexture(), color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    for (let i = 0; i < 10; i++) { const s = new THREE.Sprite(fmat); s.visible = false; scene.add(s); this.flashes.push({ s, t: 0 }); }
    this.flashNext = 0;

    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
  }

  setPixelScale(h, vfovDeg) {
    const s = h / (2 * Math.tan((vfovDeg * Math.PI / 180) / 2));
    this.dust.mat.uniforms.scale.value = s; this.sparks.mat.uniforms.scale.value = s;
  }

  tracer(from, to, speed = 520, width = 0.025) {
    const t = this.tracers[this.tracerNext]; this.tracerNext = (this.tracerNext + 1) % this.tracers.length;
    t.from = from.clone(); t.to = to.clone();
    t.dir = to.clone().sub(from); t.len = t.dir.length(); t.dir.divideScalar(t.len || 1);
    t.d = 0; t.speed = speed; t.life = 1; t.w = width; t.seg = Math.min(6, 2 + t.len * 0.05);
  }

  muzzleWorld(pos, size = 0.5, puffs = 2) {
    const f = this.flashes[this.flashNext]; this.flashNext = (this.flashNext + 1) % this.flashes.length;
    f.s.position.copy(pos); f.s.scale.setScalar(size * rand(0.8, 1.2)); f.s.visible = true; f.t = 0.05;
    for (let i = 0; i < puffs; i++) this.dust.spawn(pos.x, pos.y, pos.z, rand(-0.3, 0.3), rand(0.1, 0.5), rand(-0.3, 0.3), 0.6, 0.25, 0.7, 0.7, 0.7, 0.18, -0.2, 1.2, 2.5);
  }

  impact(p, n, surface, power = 1) {
    const q = this.q.particles;
    const x = p.x + n.x * 0.02, y = p.y + n.y * 0.02, z = p.z + n.z * 0.02;
    if (surface === 'flesh') {
      for (let i = 0; i < 10 * q; i++) this.dust.spawn(x, y, z, n.x * rand(0.3, 1.5) + rand(-0.8, 0.8), n.y * rand(0.3, 1.5) + rand(-0.5, 1.0), n.z * rand(0.3, 1.5) + rand(-0.8, 0.8), rand(0.25, 0.5), rand(0.08, 0.2), 0.45, 0.02, 0.02, 0.85, 4, 2, 1.5);
      return;
    }
    let col = [0.62, 0.6, 0.56];
    if (surface === 'wood') col = [0.5, 0.38, 0.26];
    else if (surface === 'dirt') col = [0.45, 0.38, 0.28];
    else if (surface === 'metal') col = [0.5, 0.5, 0.5];
    else if (surface === 'glass') col = [0.75, 0.85, 0.9];
    else if (surface === 'water') col = [0.7, 0.8, 0.85];
    // dust puff
    const nd = (surface === 'metal' ? 4 : 9) * q * power;
    for (let i = 0; i < nd; i++) {
      this.dust.spawn(x, y, z, n.x * rand(0.5, 2.2) + rand(-0.6, 0.6), n.y * rand(0.5, 2.2) + rand(-0.3, 0.9), n.z * rand(0.5, 2.2) + rand(-0.6, 0.6),
        rand(0.45, 1.1), rand(0.12, 0.3), col[0], col[1], col[2], 0.55, 0.6, 3, 3);
    }
    // chunks
    for (let i = 0; i < 5 * q; i++) {
      this.dust.spawn(x, y, z, n.x * rand(2, 5) + rand(-2, 2), n.y * rand(2, 5) + rand(0, 3), n.z * rand(2, 5) + rand(-2, 2), rand(0.4, 0.8), 0.04, col[0] * 0.6, col[1] * 0.6, col[2] * 0.6, 1, 9.8, 0.5, 0);
    }
    // sparks on metal / concrete
    if (surface === 'metal' || surface === 'concrete') {
      const ns = (surface === 'metal' ? 12 : 4) * q;
      for (let i = 0; i < ns; i++) {
        this.sparks.spawn(x, y, z, n.x * rand(1, 6) + rand(-3, 3), n.y * rand(1, 6) + rand(-1, 4), n.z * rand(1, 6) + rand(-3, 3), rand(0.1, 0.35), rand(0.03, 0.06), 1, 0.75, 0.35, 1, 9.8, 1.5, 0);
      }
    }
  }

  // a wet burst in direction d: heavy drops that fall and a fine cloud that hangs in the air
  bloodBurst(p, d, power = 1) {
    const q = this.q.particles, k = Math.sqrt(power);
    for (let i = 0; i < 44 * power * q; i++) {
      const s = rand(0.8, 4.8) * k;
      this.dust.spawn(p.x, p.y, p.z, d.x * s + rand(-0.8, 0.8), d.y * s + rand(-0.4, 1.3), d.z * s + rand(-0.8, 0.8), rand(0.3, 0.7), rand(0.02, 0.055), 0.56, 0.015, 0.02, 1, 9.8, 0.6, 0);
    }
    for (let i = 0; i < 14 * power * q; i++) {
      const s = rand(0.2, 1.2);
      this.dust.spawn(p.x, p.y, p.z, d.x * s + rand(-0.3, 0.3), d.y * s + rand(-0.1, 0.4), d.z * s + rand(-0.3, 0.3), rand(0.22, 0.5), rand(0.05, 0.13) * k, 0.46, 0.02, 0.025, 0.5, 0.35, 2.6, 1.1);
    }
  }

  // blood that spreads on the ground under someone
  pool(p, r = 0.8) {
    if (!this.pools) {
      this.pools = [];
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x = c.getContext('2d');
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * 6.28, q = i < 8 ? rand(0, 12) : rand(14, 42), R = i < 8 ? rand(18, 28) : rand(3, 12), X = 64 + Math.cos(a) * q, Y = 64 + Math.sin(a) * q;
        const g = x.createRadialGradient(X, Y, 0, X, Y, R);
        g.addColorStop(0, 'rgba(92,6,8,0.95)'); g.addColorStop(0.75, 'rgba(82,5,7,0.85)'); g.addColorStop(1, 'rgba(70,4,6,0)');
        x.fillStyle = g; x.fillRect(X - R, Y - R, R * 2, R * 2);
      }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      this.poolMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      this.poolGeo = new THREE.PlaneGeometry(1, 1);
    }
    let o = this.pools.length >= 12 ? this.pools.shift() : null;
    if (!o) { o = { m: new THREE.Mesh(this.poolGeo, this.poolMat) }; o.m.rotation.x = -Math.PI / 2; o.m.renderOrder = 1; this.game.scene.add(o.m); }
    o.t = 0; o.r = r * 2.2; o.m.rotation.z = Math.random() * 6.28;
    o.m.position.set(p.x, p.y + 0.03, p.z); o.m.scale.setScalar(0.01);
    this.pools.push(o);
  }

  // a grenade going off
  explosion(p) {
    const q = this.q.particles;
    this.muzzleWorld(p, 12);
    for (let i = 0; i < 60 * q; i++) {
      const a = Math.random() * 6.28, u = rand(-0.2, 1), s = rand(2, 9), h = Math.sqrt(1 - u * u);
      this.sparks.spawn(p.x, p.y, p.z, Math.cos(a) * h * s, u * s, Math.sin(a) * h * s, rand(0.22, 0.6), rand(0.4, 1.5), 1, rand(0.5, 0.72), 0.18, 1, -0.5, 4, 1.4);
    }
    for (let i = 0; i < 50 * q; i++) {
      const a = Math.random() * 6.28, u = rand(0.1, 1), s = rand(8, 20), h = Math.sqrt(1 - u * u);
      this.sparks.spawn(p.x, p.y, p.z, Math.cos(a) * h * s, u * s, Math.sin(a) * h * s, rand(0.3, 0.9), rand(0.03, 0.07), 1, 0.8, 0.4, 1, 9.8, 0.6, 0);
    }
    for (let i = 0; i < 46 * q; i++) {
      const a = Math.random() * 6.28, s = rand(0.6, 3.6);
      this.dust.spawn(p.x + Math.cos(a) * 0.5, p.y, p.z + Math.sin(a) * 0.5, Math.cos(a) * s, rand(0.5, 3.4), Math.sin(a) * s, rand(1.6, 3.6), rand(0.9, 2.2), 0.16, 0.15, 0.14, 0.72, -0.3, 1.1, 1.4);
    }
    for (let i = 0; i < 26 * q; i++) {
      const a = Math.random() * 6.28, s = rand(3, 10);
      this.dust.spawn(p.x, p.y, p.z, Math.cos(a) * s, rand(2, 9), Math.sin(a) * s, rand(0.6, 1.3), rand(0.04, 0.1), 0.3, 0.25, 0.2, 1, 9.8, 0.3, 0);
    }
  }

  decal(p, n, size = 0.09) {
    const i = this.decalNext; this.decalNext = (this.decalNext + 1) % this.decalMax;
    this.decalMesh.count = Math.max(this.decalMesh.count, i + 1);
    const nv = this._v.set(n.x, n.y, n.z);
    this._q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nv);
    const rot = new THREE.Quaternion().setFromAxisAngle(nv, Math.random() * Math.PI * 2);
    this._q.premultiply(rot);
    const s = size * rand(0.8, 1.25);
    this._m.compose(new THREE.Vector3(p.x + n.x * 0.004, p.y + n.y * 0.004, p.z + n.z * 0.004), this._q, this._s.set(s, s, s));
    this.decalMesh.setMatrixAt(i, this._m);
    this.decalMesh.instanceMatrix.needsUpdate = true;
  }

  glassShatter(mesh) {
    const p = mesh.position, g = mesh.geometry.parameters;
    const q = this.q.particles;
    for (let i = 0; i < 40 * q; i++) {
      this.sparks.spawn(p.x + rand(-g.width / 2, g.width / 2), p.y + rand(-g.height / 2, g.height / 2), p.z + rand(-g.depth / 2, g.depth / 2),
        rand(-2, 2), rand(-1, 2), rand(-2, 2), rand(0.5, 1.2), rand(0.03, 0.07), 0.6, 0.75, 0.85, 0.8, 9.8, 0.3, 0);
    }
  }

  update(dt, camera) {
    this.dust.update(dt); this.sparks.update(dt);
    if (this.pools) for (const o of this.pools) if (o.t < 2.4) { o.t += dt; o.m.scale.setScalar(o.r * Math.max(0.03, Math.sqrt(Math.min(1, o.t / 2.4)))); }
    // tracers
    const m = this._m, qq = this._q, v = this._v, sc = this._s;
    let n = 0;
    for (let i = 0; i < this.tracers.length; i++) {
      const t = this.tracers[i];
      if (t.life <= 0) continue;
      t.d += t.speed * dt;
      const headD = Math.min(t.d, t.len), tailD = Math.max(0, t.d - t.seg);
      if (tailD >= t.len) { t.life = 0; continue; }
      // segment from tail to head, billboard around its axis toward the camera
      const a = v.copy(t.from).addScaledVector(t.dir, tailD);
      const segLen = headD - tailD;
      const toCam = camera.position.clone().sub(a);
      const side = new THREE.Vector3().crossVectors(t.dir, toCam).normalize();
      const nrm = new THREE.Vector3().crossVectors(side, t.dir).normalize();
      const basis = new THREE.Matrix4().makeBasis(side, t.dir, nrm);
      qq.setFromRotationMatrix(basis);
      m.compose(a, qq, sc.set(t.w * (1 + Math.min(1, a.distanceTo(camera.position) / 30)), segLen, 1));
      this.tracerMesh.setMatrixAt(n++, m);
    }
    this.tracerMesh.count = n;
    this.tracerMesh.instanceMatrix.needsUpdate = true;
    for (const f of this.flashes) { if (f.t > 0) { f.t -= dt; if (f.t <= 0) f.s.visible = false; } }
  }
}
