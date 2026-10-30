// =============================================================================
// Navigation graph generated from the collision world:
// a 2.5D grid (1m cells, multiple floors per cell) with walk, drop and jump
// links, A* search with a binary heap and string-pulling path smoothing.
// =============================================================================
const R = 0.3;        // agent radius used for clearance
const HEIGHT = 1.7;   // standing clearance
const STEP = 0.46;

export class NavGraph {
  constructor(col, bounds) {
    this.col = col;
    this.b = bounds;
    this.cs = 1.0;
  }

  build() {
    const col = this.col, b = this.b, cs = this.cs;
    this.ox = b.minX; this.oz = b.minZ;
    this.w = Math.ceil((b.maxX - b.minX) / cs); this.h = Math.ceil((b.maxZ - b.minZ) / cs);
    const X = [], Y = [], Z = [];
    this.cells = new Map();
    const B = col.B;
    for (let gz = 0; gz < this.h; gz++) {
      for (let gx = 0; gx < this.w; gx++) {
        const x = this.ox + (gx + 0.5) * cs, z = this.oz + (gz + 0.5) * cs;
        // all box tops covering this point
        const n = col.gather(x - 0.05, -3, z - 0.05, x + 0.05, 40, z + 0.05);
        const tops = [];
        for (let k = 0; k < n; k++) {
          const i = col.cand[k] * 6;
          if (B[i] <= x && B[i + 3] >= x && B[i + 2] <= z && B[i + 5] >= z) tops.push(B[i + 4]);
        }
        tops.sort((p, q) => p - q);
        let last = -99;
        const list = [];
        for (const top of tops) {
          if (top - last < 0.2) continue;
          last = top;
          if (top > 25) continue;
          if (col.overlaps(x - R, top + 0.02, z - R, x + R, top + HEIGHT, z + R)) continue;
          list.push(X.length);
          X.push(x); Y.push(top); Z.push(z);
        }
        if (list.length) this.cells.set(gz * this.w + gx, list);
      }
    }
    const N = this.n = X.length;
    this.X = new Float32Array(X); this.Y = new Float32Array(Y); this.Z = new Float32Array(Z);
    this.links = Array.from({ length: N }, () => []);
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (const [key, list] of this.cells) {
      const gx = key % this.w, gz = (key / this.w) | 0;
      for (const [dx, dz] of dirs) {
        const nx = gx + dx, nz = gz + dz;
        if (nx < 0 || nz < 0 || nx >= this.w || nz >= this.h) continue;
        const other = this.cells.get(nz * this.w + nx);
        if (!other) continue;
        for (const a of list) for (const c of other) this.tryLink(a, c, dx !== 0 && dz !== 0, gx, gz, dx, dz);
      }
    }
    // spatial structures for nearest-node queries
    return this;
  }

  tryLink(a, c, diag, gx, gz, dx, dz) {
    const dy = this.Y[c] - this.Y[a];
    if (diag) {
      // no corner cutting: both orthogonal cells must have a node at a similar height
      const o1 = this.nodeNearHeight(gx + dx, gz, this.Y[a], 0.6), o2 = this.nodeNearHeight(gx, gz + dz, this.Y[a], 0.6);
      if (o1 < 0 || o2 < 0) return;
    }
    const d = Math.hypot(this.X[c] - this.X[a], dy, this.Z[c] - this.Z[a]);
    if (Math.abs(dy) <= 0.95) {
      if (this.walkable(a, c)) { this.link(a, c, d, 0); this.link(c, a, d, 0); }
      else if (dy > 0.5 && dy <= 1.3 && this.clearAbove(a, c)) { this.link(a, c, d + 2, 2); this.link(c, a, d + 0.5, 1); }
      return;
    }
    // drops (one-way) and jump-ups onto crates (mantle)
    if (dy < -0.95 && dy >= -4.2 && this.clearAbove(c, a)) this.link(a, c, d + 1, 1);
    else if (dy > 0.95 && dy <= 1.3 && this.clearAbove(a, c)) { this.link(a, c, d + 2.5, 2); this.link(c, a, d + 0.5, 1); }
    else if (dy < -0.95 && dy >= -1.3) { /* handled from the other side */ }
  }

  link(a, c, cost, type) {
    for (const l of this.links[a]) if (l.to === c) return;
    this.links[a].push({ to: c, cost, type }); // type 0 walk, 1 drop, 2 jump/mantle
  }

  nodeNearHeight(gx, gz, y, tol) {
    if (gx < 0 || gz < 0 || gx >= this.w || gz >= this.h) return -1;
    const list = this.cells.get(gz * this.w + gx);
    if (!list) return -1;
    for (const i of list) if (Math.abs(this.Y[i] - y) <= tol) return i;
    return -1;
  }

  // ground-continuous straight walk between two points (step-height tolerant)
  walkableXYZ(ax, ay, az, bx, by, bz) {
    const col = this.col;
    const dist = Math.hypot(bx - ax, bz - az);
    const n = Math.max(2, Math.ceil(dist / 0.3));
    let prevY = ay;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const f = col.floorBelow(x, z, 0.1, prevY + STEP + 0.02, prevY - STEP - 0.05);
      if (!isFinite(f) || Math.abs(f - prevY) > STEP + 0.02) return false;
      if (col.overlaps(x - R + 0.04, f + 0.05, z - R + 0.04, x + R - 0.04, f + HEIGHT, z + R - 0.04)) return false;
      prevY = f;
    }
    return Math.abs(prevY - by) < STEP + 0.05;
  }
  walkable(a, c) { return this.walkableXYZ(this.X[a], this.Y[a], this.Z[a], this.X[c], this.Y[c], this.Z[c]); }

  // for drops/jumps: the space above the lower node toward the higher one must be free
  clearAbove(lo, hi) {
    const col = this.col;
    const x = (this.X[lo] + this.X[hi]) / 2, z = (this.Z[lo] + this.Z[hi]) / 2;
    const top = Math.max(this.Y[lo], this.Y[hi]);
    return !col.overlaps(x - 0.2, top + 0.05, z - 0.2, x + 0.2, top + HEIGHT, z + 0.2);
  }

  nearest(x, y, z, maxDy = 2.5) {
    const gx = Math.floor((x - this.ox) / this.cs), gz = Math.floor((z - this.oz) / this.cs);
    let best = -1, bd = Infinity;
    for (let r = 0; r <= 3; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const list = this.cells.get((gz + dz) * this.w + (gx + dx));
        if (!list || gx + dx < 0 || gx + dx >= this.w) continue;
        for (const i of list) {
          const dyv = this.Y[i] - y;
          if (dyv > 0.6 || dyv < -maxDy) continue;
          const d = (this.X[i] - x) ** 2 + (this.Z[i] - z) ** 2 + dyv * dyv * 4;
          if (d < bd) { bd = d; best = i; }
        }
      }
      if (best >= 0 && r >= 1) break;
    }
    return best;
  }

  randomNode(filter) {
    for (let k = 0; k < 40; k++) {
      const i = (Math.random() * this.n) | 0;
      if (this.links[i].length >= 3 && (!filter || filter(i))) return i;
    }
    return (Math.random() * this.n) | 0;
  }

  // A* -> array of node ids
  findPath(s, g, maxIter = 12000) {
    if (s < 0 || g < 0) return null;
    if (s === g) return [s];
    const N = this.n;
    if (!this.gScore || this.gScore.length !== N) {
      this.gScore = new Float32Array(N); this.came = new Int32Array(N); this.stamp = new Uint32Array(N); this.closed = new Uint32Array(N); this.sid = 0;
      this.heap = new Int32Array(N * 4); this.fh = new Float32Array(N * 4);
    }
    const sid = ++this.sid;
    const X = this.X, Y = this.Y, Z = this.Z;
    const hx = X[g], hy = Y[g], hz = Z[g];
    const H = (i) => Math.hypot(X[i] - hx, (Y[i] - hy) * 1.5, Z[i] - hz);
    let hn = 0;
    const heap = this.heap, fh = this.fh;
    const push = (i, f) => {
      let k = hn++; heap[k] = i; fh[k] = f;
      while (k > 0) { const p = (k - 1) >> 1; if (fh[p] <= fh[k]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; [fh[p], fh[k]] = [fh[k], fh[p]]; k = p; }
    };
    const pop = () => {
      const top = heap[0]; hn--;
      if (hn > 0) {
        heap[0] = heap[hn]; fh[0] = fh[hn];
        let k = 0;
        for (;;) {
          const l = k * 2 + 1, r = l + 1; let m = k;
          if (l < hn && fh[l] < fh[m]) m = l;
          if (r < hn && fh[r] < fh[m]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]]; [fh[m], fh[k]] = [fh[k], fh[m]]; k = m;
        }
      }
      return top;
    };
    this.stamp[s] = sid; this.gScore[s] = 0; this.came[s] = -1;
    push(s, H(s));
    let it = 0;
    while (hn > 0 && it++ < maxIter) {
      const cur = pop();
      if (cur === g) {
        const path = [];
        for (let c = g; c !== -1; c = this.came[c]) path.push(c);
        return path.reverse();
      }
      if (this.closed[cur] === sid) continue;
      this.closed[cur] = sid;
      const gc = this.gScore[cur];
      for (const l of this.links[cur]) {
        const nb = l.to;
        if (this.closed[nb] === sid) continue;
        const ng = gc + l.cost + (this.penalty ? this.penalty[nb] : 0);
        if (this.stamp[nb] !== sid || ng < this.gScore[nb]) {
          this.stamp[nb] = sid; this.gScore[nb] = ng; this.came[nb] = cur;
          if (hn < heap.length) push(nb, ng + H(nb));
        }
      }
    }
    return null;
  }

  linkType(a, b) {
    for (const l of this.links[a]) if (l.to === b) return l.type;
    return 0;
  }

  // path of node ids -> smoothed waypoints [{x,y,z,type}]
  toWaypoints(path) {
    const out = [];
    if (!path || !path.length) return out;
    let i = 0;
    out.push({ x: this.X[path[0]], y: this.Y[path[0]], z: this.Z[path[0]], type: 0 });
    while (i < path.length - 1) {
      let j = i + 1;
      // string pulling: skip ahead while the straight segment stays walkable (only over plain walk links)
      for (let k = Math.min(path.length - 1, i + 10); k > i + 1; k--) {
        let plain = true;
        for (let m = i; m < k; m++) if (this.linkType(path[m], path[m + 1]) !== 0) { plain = false; break; }
        if (plain && this.walkable(path[i], path[k])) { j = k; break; }
      }
      const t = this.linkType(path[j - 1], path[j]);
      out.push({ x: this.X[path[j]], y: this.Y[path[j]], z: this.Z[path[j]], type: t });
      i = j;
    }
    return out;
  }
}
