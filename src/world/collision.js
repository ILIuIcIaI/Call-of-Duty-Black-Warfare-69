// Static collision world made of axis-aligned boxes with a uniform XZ grid broadphase.
// Used for character movement (swept AABB hulls), bullets and line-of-sight checks.
const EPS = 1e-4;

export class CollisionWorld {
  constructor() {
    this.raw = [];
    this.n = 0;
    this.cell = 4;
  }

  // surface: 'concrete' | 'metal' | 'wood' | 'dirt' | 'glass' | 'flesh' ...
  // pen: bullet penetration factor (0 = solid, 1 = paper thin)
  add(minx, miny, minz, maxx, maxy, maxz, surface = 'concrete', pen = 0, noBullet = false) {
    if (maxx - minx < 1e-3 || maxy - miny < 1e-3 || maxz - minz < 1e-3) return -1;
    this.raw.push([minx, miny, minz, maxx, maxy, maxz, surface, pen, noBullet]);
    return this.raw.length - 1;
  }

  build() {
    const n = this.n = this.raw.length;
    this.B = new Float32Array(n * 6);
    this.surface = new Array(n);
    this.pen = new Float32Array(n);
    this.noBullet = new Uint8Array(n);
    let mnx = Infinity, mnz = Infinity, mxx = -Infinity, mxz = -Infinity;
    for (let i = 0; i < n; i++) {
      const r = this.raw[i];
      for (let k = 0; k < 6; k++) this.B[i * 6 + k] = r[k];
      this.surface[i] = r[6]; this.pen[i] = r[7]; this.noBullet[i] = r[8] ? 1 : 0;
      mnx = Math.min(mnx, r[0]); mnz = Math.min(mnz, r[2]); mxx = Math.max(mxx, r[3]); mxz = Math.max(mxz, r[5]);
    }
    const cs = this.cell;
    this.minX = Math.floor(mnx / cs) * cs - cs; this.minZ = Math.floor(mnz / cs) * cs - cs;
    this.gw = Math.ceil((mxx - this.minX) / cs) + 2; this.gh = Math.ceil((mxz - this.minZ) / cs) + 2;
    const cells = Array.from({ length: this.gw * this.gh }, () => []);
    for (let i = 0; i < n; i++) {
      const b = i * 6;
      const x0 = this.cx(this.B[b]), x1 = this.cx(this.B[b + 3]);
      const z0 = this.cz(this.B[b + 2]), z1 = this.cz(this.B[b + 5]);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) cells[z * this.gw + x].push(i);
    }
    // flatten into CSR arrays
    this.cellStart = new Int32Array(cells.length + 1);
    let total = 0;
    for (let c = 0; c < cells.length; c++) { this.cellStart[c] = total; total += cells[c].length; }
    this.cellStart[cells.length] = total;
    this.cellItems = new Int32Array(total);
    let o = 0;
    for (const c of cells) for (const i of c) this.cellItems[o++] = i;
    this.stamp = new Uint32Array(n);
    this.stampId = 1;
    this.cand = new Int32Array(Math.max(64, n));
    this.candN = 0;
    this.raw = null;
  }

  cx(x) { return Math.max(0, Math.min(this.gw - 1, Math.floor((x - this.minX) / this.cell))); }
  cz(z) { return Math.max(0, Math.min(this.gh - 1, Math.floor((z - this.minZ) / this.cell))); }

  nextStamp() {
    this.stampId++;
    if (this.stampId > 4e9) { this.stamp.fill(0); this.stampId = 1; }
    return this.stampId;
  }

  // Collect candidate boxes overlapping the given region into this.cand
  gather(minx, miny, minz, maxx, maxy, maxz) {
    const s = this.nextStamp();
    const B = this.B;
    let cn = 0;
    const x0 = this.cx(minx), x1 = this.cx(maxx), z0 = this.cz(minz), z1 = this.cz(maxz);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const c = z * this.gw + x;
        for (let k = this.cellStart[c], e = this.cellStart[c + 1]; k < e; k++) {
          const i = this.cellItems[k];
          if (this.stamp[i] === s) continue;
          this.stamp[i] = s;
          const b = i * 6;
          if (B[b] > maxx || B[b + 3] < minx || B[b + 1] > maxy || B[b + 4] < miny || B[b + 2] > maxz || B[b + 5] < minz) continue;
          this.cand[cn++] = i;
        }
      }
    }
    this.candN = cn;
    return cn;
  }

  // Does an AABB intersect any static box (strictly)?
  overlaps(minx, miny, minz, maxx, maxy, maxz) {
    const n = this.gather(minx, miny, minz, maxx, maxy, maxz);
    const B = this.B;
    for (let k = 0; k < n; k++) {
      const b = this.cand[k] * 6;
      if (B[b] < maxx - EPS && B[b + 3] > minx + EPS && B[b + 1] < maxy - EPS && B[b + 4] > miny + EPS && B[b + 2] < maxz - EPS && B[b + 5] > minz + EPS) return true;
    }
    return false;
  }

  // Sweep a hull along one axis against the current candidate set. Returns the allowed delta.
  sweepAxis(axis, hmin, hmax, d) {
    if (d === 0) return 0;
    const B = this.B, n = this.candN;
    const a1 = (axis + 1) % 3, a2 = (axis + 2) % 3;
    let allowed = d;
    for (let k = 0; k < n; k++) {
      const b = this.cand[k] * 6;
      if (!(B[b + a1] < hmax[a1] - EPS && B[b + 3 + a1] > hmin[a1] + EPS)) continue;
      if (!(B[b + a2] < hmax[a2] - EPS && B[b + 3 + a2] > hmin[a2] + EPS)) continue;
      if (d > 0) {
        if (B[b + axis] >= hmax[axis] - EPS) {
          const gap = B[b + axis] - hmax[axis];
          if (gap < allowed) allowed = Math.max(0, gap);
        }
      } else if (B[b + 3 + axis] <= hmin[axis] + EPS) {
        const gap = B[b + 3 + axis] - hmin[axis];
        if (gap > allowed) allowed = Math.min(0, gap);
      }
    }
    return allowed;
  }

  // Highest walkable surface under a footprint, at or below maxY. Returns -Infinity if none.
  floorBelow(x, z, r, maxY, minY = -50) {
    const n = this.gather(x - r, minY, z - r, x + r, maxY, z + r);
    const B = this.B;
    let best = -Infinity;
    for (let k = 0; k < n; k++) {
      const b = this.cand[k] * 6;
      const top = B[b + 4];
      if (top <= maxY + EPS && top > best && B[b] < x + r && B[b + 3] > x - r && B[b + 2] < z + r && B[b + 5] > z - r) best = top;
    }
    return best;
  }

  // Top of the solid stack in the column (x, z) that contains height y (touching boxes count as one stack).
  // Returns y itself if nothing solid is there, Infinity once the stack rises above maxY.
  columnTop(x, z, y, maxY, e = 0.03) {
    const B = this.B;
    let cur = y;
    for (let it = 0; it < 12; it++) {
      const n = this.gather(x - e, cur - 0.02, z - e, x + e, cur + 0.03, z + e);
      let best = cur;
      for (let k = 0; k < n; k++) {
        const b = this.cand[k] * 6;
        if (B[b] < x + e && B[b + 3] > x - e && B[b + 2] < z + e && B[b + 5] > z - e && B[b + 1] <= cur + 0.03 && B[b + 4] > best) best = B[b + 4];
      }
      if (best <= cur + 1e-4) return cur;
      cur = best;
      if (cur > maxY) return Infinity;
    }
    return cur;
  }

  // Middle heights (within y0..y1) of all boxes a horizontal ray crosses, lowest first. Returns the count.
  heightsAlong(ox, oz, dx, dz, len, y0, y1, out) {
    const ex = ox + dx * len, ez = oz + dz * len;
    const n = this.gather(Math.min(ox, ex), y0, Math.min(oz, ez), Math.max(ox, ex), y1, Math.max(oz, ez));
    const B = this.B;
    let c = 0;
    for (let k = 0; k < n; k++) {
      const b = this.cand[k] * 6;
      let t0 = 0, t1 = len;
      if (Math.abs(dx) > 1e-9) { const a = (B[b] - ox) / dx, d = (B[b + 3] - ox) / dx; t0 = Math.max(t0, Math.min(a, d)); t1 = Math.min(t1, Math.max(a, d)); } else if (ox < B[b] || ox > B[b + 3]) continue;
      if (Math.abs(dz) > 1e-9) { const a = (B[b + 2] - oz) / dz, d = (B[b + 5] - oz) / dz; t0 = Math.max(t0, Math.min(a, d)); t1 = Math.min(t1, Math.max(a, d)); } else if (oz < B[b + 2] || oz > B[b + 5]) continue;
      if (t0 > t1) continue;
      out[c++] = (Math.max(B[b + 1], y0) + Math.min(B[b + 4], y1)) / 2;
    }
    out.length = c;
    out.sort((a, b) => a - b);
    return c;
  }

  // Ray vs boxes using a 2D DDA over the grid. Returns hit object or null.
  raycast(ox, oy, oz, dx, dy, dz, maxDist, out = {}, bullet = false) {
    const B = this.B, cs = this.cell;
    if (dx === 0) dx = 1e-9; if (dy === 0) dy = 1e-9; if (dz === 0) dz = 1e-9;
    const s = this.nextStamp();
    let best = maxDist, bestI = -1, bestAxis = 0;
    const gx = (ox - this.minX) / cs, gz = (oz - this.minZ) / cs;
    let cx = Math.floor(gx), cz = Math.floor(gz);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const adx = Math.abs(dx), adz = Math.abs(dz);
    let tMaxX = adx > 1e-9 ? ((dx > 0 ? (cx + 1 - gx) : (gx - cx)) * cs) / adx : Infinity;
    let tMaxZ = adz > 1e-9 ? ((dz > 0 ? (cz + 1 - gz) : (gz - cz)) * cs) / adz : Infinity;
    const tDX = adx > 1e-9 ? cs / adx : Infinity, tDZ = adz > 1e-9 ? cs / adz : Infinity;
    const idx = 1 / dx, idy = 1 / dy, idz = 1 / dz;
    let guard = 0;
    while (guard++ < 512) {
      if (cx >= 0 && cz >= 0 && cx < this.gw && cz < this.gh) {
        const c = cz * this.gw + cx;
        for (let k = this.cellStart[c], e = this.cellStart[c + 1]; k < e; k++) {
          const i = this.cellItems[k];
          if (this.stamp[i] === s) continue;
          this.stamp[i] = s;
          if (bullet && this.noBullet[i]) continue;
          const b = i * 6;
          // slab test
          let t1 = (B[b] - ox) * idx, t2 = (B[b + 3] - ox) * idx;
          let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2), ax = 0;
          t1 = (B[b + 1] - oy) * idy; t2 = (B[b + 4] - oy) * idy;
          let lo = Math.min(t1, t2), hi = Math.max(t1, t2);
          if (lo > tmin) { tmin = lo; ax = 1; }
          if (hi < tmax) tmax = hi;
          t1 = (B[b + 2] - oz) * idz; t2 = (B[b + 5] - oz) * idz;
          lo = Math.min(t1, t2); hi = Math.max(t1, t2);
          if (lo > tmin) { tmin = lo; ax = 2; }
          if (hi < tmax) tmax = hi;
          if (tmax >= Math.max(tmin, 0) && tmin < best && tmin >= 0) { best = tmin; bestI = i; bestAxis = ax; }
        }
      }
      const tNext = Math.min(tMaxX, tMaxZ);
      if (best <= tNext || tNext > maxDist) break;
      if (tMaxX < tMaxZ) { tMaxX += tDX; cx += stepX; } else { tMaxZ += tDZ; cz += stepZ; }
      if ((cx < -1 && stepX < 0) || (cz < -1 && stepZ < 0) || (cx > this.gw && stepX > 0) || (cz > this.gh && stepZ > 0)) break;
    }
    if (bestI < 0) return null;
    out.t = best; out.index = bestI;
    out.x = ox + dx * best; out.y = oy + dy * best; out.z = oz + dz * best;
    out.nx = 0; out.ny = 0; out.nz = 0;
    if (bestAxis === 0) out.nx = dx > 0 ? -1 : 1; else if (bestAxis === 1) out.ny = dy > 0 ? -1 : 1; else out.nz = dz > 0 ? -1 : 1;
    out.surface = this.surface[bestI];
    out.pen = this.pen[bestI];
    return out;
  }

  // Exit distance of a ray that starts inside box i (for wall penetration)
  exitDistance(i, ox, oy, oz, dx, dy, dz) {
    const B = this.B, b = i * 6;
    const tx = dx > 0 ? (B[b + 3] - ox) / dx : dx < 0 ? (B[b] - ox) / dx : Infinity;
    const ty = dy > 0 ? (B[b + 4] - oy) / dy : dy < 0 ? (B[b + 1] - oy) / dy : Infinity;
    const tz = dz > 0 ? (B[b + 5] - oz) / dz : dz < 0 ? (B[b + 2] - oz) / dz : Infinity;
    return Math.min(tx, ty, tz);
  }

  // Push a sphere (center p: {x,y,z}) out of all static boxes. Returns true on contact.
  pushOutSphere(p, r) {
    const n = this.gather(p.x - r, p.y - r, p.z - r, p.x + r, p.y + r, p.z + r);
    const B = this.B;
    let hit = false;
    for (let k = 0; k < n; k++) {
      const b = this.cand[k] * 6;
      const cx = Math.max(B[b], Math.min(p.x, B[b + 3]));
      const cy = Math.max(B[b + 1], Math.min(p.y, B[b + 4]));
      const cz = Math.max(B[b + 2], Math.min(p.z, B[b + 5]));
      let dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2), push = (r - d) / d;
        p.x += dx * push; p.y += dy * push; p.z += dz * push;
      } else {
        // center inside the box: leave through the closest face
        const px0 = p.x - B[b], px1 = B[b + 3] - p.x, py0 = p.y - B[b + 1], py1 = B[b + 4] - p.y, pz0 = p.z - B[b + 2], pz1 = B[b + 5] - p.z;
        const m = Math.min(px0, px1, py0, py1, pz0, pz1);
        if (m === py1) p.y = B[b + 4] + r; else if (m === py0) p.y = B[b + 1] - r;
        else if (m === px0) p.x = B[b] - r; else if (m === px1) p.x = B[b + 3] + r;
        else if (m === pz0) p.z = B[b + 2] - r; else p.z = B[b + 5] + r;
      }
    }
    return hit;
  }

  // Remove a box (e.g. shattered glass) without rebuilding the grid
  disable(i) {
    const b = i * 6;
    this.B[b] = this.B[b + 1] = this.B[b + 2] = 1e6;
    this.B[b + 3] = this.B[b + 4] = this.B[b + 5] = 1e6 + 0.001;
  }

  lineClear(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const L = Math.hypot(dx, dy, dz);
    if (L < 1e-5) return true;
    return !this.raycast(ax, ay, az, dx / L, dy / L, dz / L, L, this._tmpHit || (this._tmpHit = {}));
  }
}
