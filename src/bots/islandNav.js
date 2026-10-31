import { NavGraph } from './nav.js';

// =============================================================================
// Navigation for the big island: the normal 1 m graph (all floors) only in and
// around buildings, a coarse 5 m grid over open ground, both stitched together.
// Plain NavGraph API, so bots don't need to know the difference.
// =============================================================================
const R = 0.25, HEIGHT = 1.8, COARSE = 5, STEP = 0.46;

export class IslandNav extends NavGraph {
  constructor(col, bounds, rects, terrain, hub = [0, 12.2, 40]) {
    super(col, bounds);
    this.rects = rects;
    this.t = terrain;
    this.hub = hub;
  }

  boxesBlock(x0, y0, z0, x1, y1, z1) {
    const col = this.col, n = col.gather(x0, y0, z0, x1, y1, z1), B = col.B;
    for (let k = 0; k < n; k++) {
      const b = col.cand[k] * 6;
      if (B[b] < x1 && B[b + 3] > x0 && B[b + 1] < y1 && B[b + 4] > y0 && B[b + 2] < z1 && B[b + 5] > z0) return true;
    }
    return false;
  }

  build() {
    const col = this.col, b = this.b, t = this.t, B = col.B;
    this.cs = 1;
    this.ox = b.minX; this.oz = b.minZ;
    this.w = Math.ceil(b.maxX - b.minX); this.h = Math.ceil(b.maxZ - b.minZ);
    const X = [], Y = [], Z = [];
    this.cells = new Map();
    // ---- fine cells around buildings, every floor
    for (const [rx0, rz0, rx1, rz1] of this.rects) {
      const g0 = Math.floor(rx0 - this.ox), g1 = Math.ceil(rx1 - this.ox), h0 = Math.floor(rz0 - this.oz), h1 = Math.ceil(rz1 - this.oz);
      for (let gz = h0; gz < h1; gz++) for (let gx = g0; gx < g1; gx++) {
        const key = gz * this.w + gx;
        if (this.cells.has(key)) continue;
        const x = this.ox + gx + 0.5, z = this.oz + gz + 0.5;
        const n = col.gather(x - 0.05, -3, z - 0.05, x + 0.05, 140, z + 0.05);
        const tops = [t.heightAt(x, z)];
        for (let k = 0; k < n; k++) {
          const i = col.cand[k] * 6;
          if (B[i] <= x && B[i + 3] >= x && B[i + 2] <= z && B[i + 5] >= z) tops.push(B[i + 4]);
        }
        tops.sort((p, q) => p - q);
        const list = [];
        for (let q = 0; q < tops.length; q++) {
          const top = tops[q];
          if (q + 1 < tops.length && tops[q + 1] - top < 0.2) continue; // of surfaces this close only the upper one counts
          if (this.boxesBlock(x - R, top + STEP + 0.03, z - R, x + R, top + HEIGHT, z + R)) continue; // thresholds and stairs are no obstacle
          list.push(X.length); X.push(x); Y.push(top); Z.push(z);
        }
        if (list.length) this.cells.set(key, list);
      }
    }
    this.fineN = X.length;
    // ---- coarse grid on open land
    const cw = Math.ceil((b.maxX - b.minX) / COARSE), ch = Math.ceil((b.maxZ - b.minZ) / COARSE);
    this.coarse = new Int32Array(cw * ch).fill(-1);
    this.cw = cw; this.ch = ch;
    const inRect = (x, z) => this.rects.some((r) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]);
    for (let gz = 0; gz < ch; gz++) for (let gx = 0; gx < cw; gx++) {
      const x = this.ox + (gx + 0.5) * COARSE, z = this.oz + (gz + 0.5) * COARSE;
      const th = t.heightAt(x, z);
      if (th < 0.6 || Math.hypot(x, z) > 355 || t.slopeAt(x, z) > 1.05 || inRect(x, z)) continue;
      if (this.boxesBlock(x - R, th + 0.4, z - R, x + R, th + HEIGHT, z + R)) continue;
      this.coarse[gz * cw + gx] = X.length;
      X.push(x); Y.push(th); Z.push(z);
    }
    const N = this.n = X.length;
    this.X = new Float32Array(X); this.Y = new Float32Array(Y); this.Z = new Float32Array(Z);
    this.links = Array.from({ length: N }, () => []);
    // ---- fine links
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (const [key, list] of this.cells) {
      const gx = key % this.w, gz = (key / this.w) | 0;
      for (const [dx, dz] of dirs) {
        const other = this.cells.get((gz + dz) * this.w + gx + dx);
        if (!other) continue;
        for (const a of list) for (const c of other) this.tryLink(a, c, dx !== 0 && dz !== 0, gx, gz, dx, dz);
      }
    }
    // ---- coarse links: slope check and a walk along the line for anything solid
    for (let gz = 0; gz < ch; gz++) for (let gx = 0; gx < cw; gx++) {
      const a = this.coarse[gz * cw + gx];
      if (a < 0) continue;
      for (const [dx, dz] of dirs) {
        const nx = gx + dx, nz = gz + dz;
        if (nx < 0 || nz < 0 || nx >= cw || nz >= ch) continue;
        const c = this.coarse[nz * cw + nx];
        if (c < 0) continue;
        if (this.coarseClear(a, c)) { const d = Math.hypot(X[a] - X[c], Y[a] - Y[c], Z[a] - Z[c]); this.link(a, c, d, 0); this.link(c, a, d, 0); }
      }
    }
    // ---- stitch: open ground meets the fine cells around buildings
    for (let gz = 0; gz < ch; gz++) for (let gx = 0; gx < cw; gx++) {
      const c = this.coarse[gz * cw + gx];
      if (c < 0) continue;
      let done = 0;
      for (let r = 2; r <= 7 && done < 3; r += 1) {
        for (let k = 0; k < 8 && done < 3; k++) {
          const a = k / 8 * Math.PI * 2, x = X[c] + Math.cos(a) * r, z = Z[c] + Math.sin(a) * r;
          const list = this.cells.get(Math.floor(z - this.oz) * this.w + Math.floor(x - this.ox));
          if (!list) continue;
          for (const i of list) {
            if (Math.abs(Y[i] - Y[c]) > 1.2) continue;
            if (this.links[c].some((l) => l.to === i)) continue;
            if (this.walkable(c, i) && this.walkable(i, c)) { const d = Math.hypot(X[i] - X[c], Y[i] - Y[c], Z[i] - Z[c]); this.link(c, i, d, 0); this.link(i, c, d, 0); done++; break; }
          }
        }
      }
    }
    this.prune();
    return this;
  }

  // what nobody can walk to or get down from (closed roofs and the like) doesn't exist for bots
  prune() {
    const N = this.n, links = this.links, back = Array.from({ length: N }, () => []);
    for (let i = 0; i < N; i++) for (const l of links[i]) back[l.to].push(i);
    const start = this.nearest(this.hub[0], this.hub[1], this.hub[2], 3), keep = new Uint8Array(N);
    if (start < 0) return;
    for (const [bit, next] of [[1, (i) => links[i].map((l) => l.to)], [2, (i) => back[i]]]) {
      const st = [start]; keep[start] |= bit;
      while (st.length) for (const to of next(st.pop())) if (!(keep[to] & bit)) { keep[to] |= bit; st.push(to); }
    }
    for (const [key, list] of this.cells) {
      const left = list.filter((i) => keep[i]);
      if (left.length) this.cells.set(key, left); else this.cells.delete(key);
    }
    for (let i = 0; i < this.coarse.length; i++) if (this.coarse[i] >= 0 && !keep[this.coarse[i]]) this.coarse[i] = -1;
    for (let i = 0; i < N; i++) if (!keep[i]) links[i] = [];
    for (let i = 0; i < N; i++) if (keep[i]) links[i] = links[i].filter((l) => keep[l.to]);
    this.pruned = keep;
  }

  // many floors on top of each other: only a real ledge is a way down, never the slab under your feet
  tryLink(a, c, diag, gx, gz, dx, dz) {
    const Y = this.Y, dy = Y[c] - Y[a];
    if (diag && (this.nodeNearHeight(gx + dx, gz, Y[a], 0.6) < 0 || this.nodeNearHeight(gx, gz + dz, Y[a], 0.6) < 0)) return;
    const d = Math.hypot(this.X[c] - this.X[a], dy, this.Z[c] - this.Z[a]);
    // treads are easy to walk however steep the flight looks on a 1 m grid
    if (Math.abs(dy) <= 1.4 && this.walkable(a, c)) { this.link(a, c, d, 0); this.link(c, a, d, 0); return; }
    const hi = dy > 0 ? c : a, lo = dy > 0 ? a : c, h = Math.abs(dy);
    if (h <= 0.45 || h > 4.2 || !this.dropClear(hi, lo)) return;
    this.link(hi, lo, d + 1, 1);
    if (h <= 1.3 && this.clearAbove(lo, hi)) this.link(lo, hi, d + 2, 2);
  }

  dropClear(hi, lo) {
    const X = this.X, Y = this.Y, Z = this.Z, r = 0.2, top = Y[hi] + HEIGHT, mx = (X[hi] + X[lo]) / 2, mz = (Z[hi] + Z[lo]) / 2;
    return !this.boxesBlock(X[lo] - r, Y[lo] + 0.05, Z[lo] - r, X[lo] + r, top, Z[lo] + r) && !this.boxesBlock(mx - r, Y[hi] + 0.3, mz - r, mx + r, top, mz + r);
  }

  // like the small maps, but what you can step onto (doorsteps, stair treads) doesn't count as blocking
  walkableXYZ(ax, ay, az, bx, by, bz) {
    const col = this.col, dist = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(dist / 0.3));
    let prevY = ay;
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const f = col.floorBelow(x, z, 0.1, prevY + STEP + 0.02, prevY - STEP - 0.05);
      if (!isFinite(f) || Math.abs(f - prevY) > STEP + 0.02) return false;
      if (this.boxesBlock(x - R, f + STEP + 0.03, z - R, x + R, f + HEIGHT, z + R)) return false;
      prevY = f;
    }
    return Math.abs(prevY - by) < STEP + 0.05;
  }

  coarseClear(a, c) {
    const t = this.t, ax = this.X[a], az = this.Z[a], cx = this.X[c], cz = this.Z[c], d = Math.hypot(cx - ax, cz - az);
    if (Math.abs(this.Y[c] - this.Y[a]) / d > 1.0) return false;
    const n = Math.ceil(d / 1.25);
    for (let i = 1; i < n; i++) {
      const u = i / n, x = ax + (cx - ax) * u, z = az + (cz - az) * u, y = t.heightAt(x, z);
      if (y < 0.3 || this.boxesBlock(x - R, y + 0.4, z - R, x + R, y + HEIGHT, z + R)) return false;
    }
    return true;
  }

  nearest(x, y, z, maxDy = 2.5) {
    const f = super.nearest(x, y, z, maxDy);
    if (f >= 0) return f;
    const gx = Math.floor((x - this.ox) / COARSE), gz = Math.floor((z - this.oz) / COARSE);
    let best = -1, bd = Infinity;
    for (let r = 0; r <= 3 && best < 0; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const nx = gx + dx, nz = gz + dz;
        if (nx < 0 || nz < 0 || nx >= this.cw || nz >= this.ch) continue;
        const i = this.coarse[nz * this.cw + nx];
        if (i < 0 || !this.links[i].length) continue;
        const d = (this.X[i] - x) ** 2 + (this.Z[i] - z) ** 2 + (this.Y[i] - y) ** 2 * 0.25;
        if (d < bd) { bd = d; best = i; }
      }
    }
    return best;
  }

  findPath(s, g, maxIter = 45000) { return super.findPath(s, g, maxIter); }

  // string pulling, kept cheap on open ground
  toWaypoints(path) {
    const out = [];
    if (!path || !path.length) return out;
    const X = this.X, Y = this.Y, Z = this.Z, fine = this.fineN;
    out.push({ x: X[path[0]], y: Y[path[0]], z: Z[path[0]], type: 0 });
    let i = 0;
    while (i < path.length - 1) {
      let j = i + 1;
      if (path[i] >= fine) {
        // skip ahead over coarse nodes as long as nothing stands in the way
        let k = i + 1;
        while (k < path.length - 1 && k < i + 9 && path[k + 1] >= fine && this.coarseClear(path[i], path[k + 1])) k++;
        j = k;
      } else {
        for (let k = Math.min(path.length - 1, i + 8); k > i + 1; k--) {
          let plain = true;
          for (let m = i; m < k; m++) if (this.linkType(path[m], path[m + 1]) !== 0) { plain = false; break; }
          if (plain && this.walkable(path[i], path[k])) { j = k; break; }
        }
      }
      out.push({ x: X[path[j]], y: Y[path[j]], z: Z[path[j]], type: this.linkType(path[j - 1], path[j]) });
      i = j;
    }
    return out;
  }
}
