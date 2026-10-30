import * as THREE from 'three';

// =============================================================================
// Heightfield for large outdoor maps: exact height queries that match the
// rendered triangles, ray tests for bullets and sight lines, and the ground mesh
// with one big painted texture (grass, rock, sand, roads) plus a fine detail tile.
// =============================================================================

// small seeded value noise
export function makeNoise(seed = 1) {
  const P = new Float32Array(4096);
  let s = seed >>> 0;
  for (let i = 0; i < 4096; i++) { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; P[i] = ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  const v = (x, y) => P[(((x * 73) ^ (y * 179)) & 4095)];
  const n = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y); let fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const fbm = (x, y, oct = 4) => { let t = 0, a = 0.5, f = 1, m = 0; for (let i = 0; i < oct; i++) { t += a * n(x * f, y * f); m += a; a *= 0.5; f *= 2.03; } return t / m; };
  return { n, fbm };
}
export const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const _nrm = new THREE.Vector3();

export class Terrain {
  constructor(size, cell) {
    this.size = size; this.cell = cell;
    this.n = Math.round(size / cell); this.w = this.n + 1;
    this.ox = -size / 2; this.oz = -size / 2;
    this.h = new Float32Array(this.w * this.w);
    this.maxH = 0; this.minH = 0;
  }

  fill(fn) {
    const { w, h, ox, oz, cell } = this;
    for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) h[j * w + i] = fn(ox + i * cell, oz + j * cell);
  }

  finish() {
    let a = Infinity, b = -Infinity;
    for (const v of this.h) { if (v < a) a = v; if (v > b) b = v; }
    this.minH = a; this.maxH = b;
  }

  // same triangle split as the mesh, so what you see is what you stand on
  heightAt(x, z) {
    const { w, h, ox, oz, cell, n } = this;
    let fx = (x - ox) / cell, fz = (z - oz) / cell;
    if (fx < 0) fx = 0; else if (fx > n - 1e-3) fx = n - 1e-3;
    if (fz < 0) fz = 0; else if (fz > n - 1e-3) fz = n - 1e-3;
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * w + i;
    if (u + v <= 1) { const a = h[k]; return a + (h[k + 1] - a) * u + (h[k + w] - a) * v; }
    const d = h[k + w + 1];
    return d + (h[k + w] - d) * (1 - u) + (h[k + 1] - d) * (1 - v);
  }

  normalAt(x, z, out = _nrm) {
    const e = this.cell * 0.5;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z), hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    const L = Math.hypot(hx, 2 * e, hz);
    out.x = -hx / L; out.y = 2 * e / L; out.z = -hz / L;
    return out;
  }

  // steepness as rise over run
  slopeAt(x, z) {
    const e = this.cell * 0.5;
    return Math.hypot(this.heightAt(x + e, z) - this.heightAt(x - e, z), this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
  }

  // distance along the ray to the ground, or -1
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let t = 0, t1 = maxT;
    const top = this.maxH + 0.01;
    if (oy > top) {
      if (dy >= 0) return -1;
      t = (top - oy) / dy;
      if (t > t1) return -1;
    } else if (dy > 0) {
      const leave = (top - oy) / dy;
      if (leave < t1) t1 = leave;
    }
    let prev = oy + dy * t - this.heightAt(ox + dx * t, oz + dz * t);
    if (prev < -0.02) return -1; // starting below the surface: never block
    const step = this.cell * 0.7;
    while (t < t1) {
      const nt = Math.min(t + step, t1);
      const d = oy + dy * nt - this.heightAt(ox + dx * nt, oz + dz * nt);
      if (d < 0) {
        let a = t, b = nt;
        for (let i = 0; i < 7; i++) {
          const m = (a + b) * 0.5;
          if (oy + dy * m - this.heightAt(ox + dx * m, oz + dz * m) < 0) b = m; else a = m;
        }
        return b;
      }
      t = nt; prev = d;
    }
    return -1;
  }

  // ---- ground mesh split into chunks, so what's behind the camera gets culled
  buildMesh(root, canvas, quality) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false;
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 4;
    // fine grain so the ground doesn't turn to mush up close
    const dc = document.createElement('canvas'); dc.width = dc.height = 128;
    const dx = dc.getContext('2d'), id = dx.createImageData(128, 128), N = makeNoise(7);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const v = 128 + (N.fbm(x / 6.4, y / 6.4, 3) - 0.5) * 120 + (Math.random() - 0.5) * 34;
      const k = (y * 128 + x) * 4; id.data[k] = id.data[k + 1] = id.data[k + 2] = v; id.data[k + 3] = 255;
    }
    dx.putImageData(id, 0, 0);
    const detail = new THREE.CanvasTexture(dc);
    detail.wrapS = detail.wrapT = THREE.RepeatWrapping; detail.magFilter = THREE.LinearFilter; detail.anisotropy = 4;
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    mat.onBeforeCompile = (s) => {
      s.uniforms.detailMap = { value: detail };
      s.fragmentShader = 'uniform sampler2D detailMap;\n' + s.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        { float d1 = texture2D(detailMap, vMapUv * ${(this.size / 3.2).toFixed(1)}).r, d2 = texture2D(detailMap, vMapUv * ${(this.size / 17).toFixed(1)}).r;
          diffuseColor.rgb *= (0.62 + d1 * 0.76) * (0.72 + d2 * 0.56); }`);
    };
    const C = 32, { n, w, h, ox, oz, cell } = this;
    for (let cz = 0; cz < n; cz += C) for (let cx = 0; cx < n; cx += C) {
      const nx = Math.min(C, n - cx), nz = Math.min(C, n - cz);
      const vc = (nx + 1) * (nz + 1), P = new Float32Array(vc * 3), Nm = new Float32Array(vc * 3), U = new Float32Array(vc * 2), I = [];
      let hi = -Infinity, k = 0;
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
        const gi = cx + i, gj = cz + j, y = h[gj * w + gi];
        if (y > hi) hi = y;
        P[k * 3] = ox + gi * cell; P[k * 3 + 1] = y; P[k * 3 + 2] = oz + gj * cell;
        const a = h[gj * w + Math.max(0, gi - 1)], b = h[gj * w + Math.min(w - 1, gi + 1)], c = h[Math.max(0, gj - 1) * w + gi], d = h[Math.min(w - 1, gj + 1) * w + gi];
        const L = Math.hypot(a - b, 2 * cell, c - d);
        Nm[k * 3] = (a - b) / L; Nm[k * 3 + 1] = 2 * cell / L; Nm[k * 3 + 2] = (c - d) / L;
        U[k * 2] = gi / n; U[k * 2 + 1] = gj / n;
        k++;
      }
      // skip chunks that are completely under the sea floor's reach
      if (hi < -0.8) continue;
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
        I.push(a, c, b, b, c, d);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(P, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(Nm, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
      g.setIndex(I);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = quality.shadows > 0; m.castShadow = quality.shadows > 0;
      m.matrixAutoUpdate = false;
      root.add(m);
    }
    this.mat = mat;
  }
}
