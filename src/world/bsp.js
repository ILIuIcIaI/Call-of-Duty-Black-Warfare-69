// =============================================================================
// Reader for a GoldSrc map file (BSP version 30, the format of Half-Life and
// Counter-Strike 1.6). Gives us the map's faces, textures, baked light, entities
// and, walking its tree, the solid parts as axis-aligned boxes.
// Plain data only, so it can also run outside the browser.
// =============================================================================
const LUMPS = ['entities', 'planes', 'textures', 'vertices', 'visibility', 'nodes', 'texinfo', 'faces', 'lighting', 'clipnodes', 'leaves', 'marksurfaces', 'edges', 'surfedges', 'models'];
export const CONTENTS = { empty: -1, solid: -2, water: -3, sky: -6 };

export function readBsp(buffer) {
  const d = new DataView(buffer), bytes = new Uint8Array(buffer);
  if (d.getInt32(0, true) !== 30) throw new Error('Not a BSP version 30 file');
  const L = {};
  LUMPS.forEach((n, i) => { L[n] = { off: d.getInt32(4 + i * 8, true), len: d.getInt32(8 + i * 8, true) }; });
  const name16 = (p) => { let s = ''; for (let i = 0; i < 16 && bytes[p + i]; i++) s += String.fromCharCode(bytes[p + i]); return s; };

  const planes = [];
  for (let i = 0; i < L.planes.len / 20; i++) { const o = L.planes.off + i * 20; planes.push({ n: [d.getFloat32(o, true), d.getFloat32(o + 4, true), d.getFloat32(o + 8, true)], dist: d.getFloat32(o + 12, true), type: d.getInt32(o + 16, true) }); }
  const vertices = new Float32Array(L.vertices.len / 4);
  for (let i = 0; i < vertices.length; i++) vertices[i] = d.getFloat32(L.vertices.off + i * 4, true);

  // ---- textures: 8 bit pictures with a palette behind the last mip level
  const textures = [], count = d.getInt32(L.textures.off, true);
  for (let i = 0; i < count; i++) {
    const rel = d.getInt32(L.textures.off + 4 + i * 4, true);
    if (rel < 0) { textures.push({ name: '', w: 1, h: 1, rgba: null }); continue; }
    const p = L.textures.off + rel, w = d.getUint32(p + 16, true), h = d.getUint32(p + 20, true), m0 = d.getUint32(p + 24, true);
    const t = { name: name16(p), w, h, rgba: null };
    if (m0) {
      const m3 = d.getUint32(p + 36, true), pal = p + m3 + ((w >> 3) * (h >> 3)) + 2, src = p + m0, rgba = new Uint8Array(w * h * 4), masked = t.name[0] === '{';
      for (let k = 0; k < w * h; k++) { const c = bytes[src + k] * 3; rgba[k * 4] = bytes[pal + c]; rgba[k * 4 + 1] = bytes[pal + c + 1]; rgba[k * 4 + 2] = bytes[pal + c + 2]; rgba[k * 4 + 3] = masked && bytes[src + k] === 255 ? 0 : 255; }
      t.rgba = rgba;
    }
    textures.push(t);
  }

  const texinfo = [];
  for (let i = 0; i < L.texinfo.len / 40; i++) { const o = L.texinfo.off + i * 40, f = (k) => d.getFloat32(o + k * 4, true); texinfo.push({ s: [f(0), f(1), f(2), f(3)], t: [f(4), f(5), f(6), f(7)], tex: d.getInt32(o + 32, true) }); }

  // ---- faces with their corner points
  const faces = [];
  for (let i = 0; i < L.faces.len / 20; i++) {
    const o = L.faces.off + i * 20, first = d.getInt32(o + 4, true), n = d.getInt16(o + 8, true), pts = [];
    for (let j = 0; j < n; j++) {
      const se = d.getInt32(L.surfedges.off + (first + j) * 4, true), e = Math.abs(se), v = d.getUint16(L.edges.off + e * 4 + (se < 0 ? 2 : 0), true);
      pts.push(vertices[v * 3], vertices[v * 3 + 1], vertices[v * 3 + 2]);
    }
    faces.push({ plane: d.getUint16(o, true), side: d.getInt16(o + 2, true), pts, texinfo: d.getInt16(o + 10, true), style: bytes[o + 12], lightofs: d.getInt32(o + 16, true) });
  }

  const nodes = [];
  for (let i = 0; i < L.nodes.len / 24; i++) { const o = L.nodes.off + i * 24; nodes.push({ plane: d.getInt32(o, true), front: d.getInt16(o + 4, true), back: d.getInt16(o + 6, true) }); }
  const leaves = [];
  for (let i = 0; i < L.leaves.len / 28; i++) leaves.push(d.getInt32(L.leaves.off + i * 28, true));
  const clipnodes = [];
  for (let i = 0; i < L.clipnodes.len / 8; i++) { const o = L.clipnodes.off + i * 8; clipnodes.push({ plane: d.getInt32(o, true), front: d.getInt16(o + 4, true), back: d.getInt16(o + 6, true) }); }

  const models = [];
  for (let i = 0; i < L.models.len / 64; i++) {
    const o = L.models.off + i * 64, f = (k) => d.getFloat32(o + k * 4, true);
    models.push({ mins: [f(0), f(1), f(2)], maxs: [f(3), f(4), f(5)], head: d.getInt32(o + 36, true), hull1: d.getInt32(o + 40, true), first: d.getInt32(o + 56, true), count: d.getInt32(o + 60, true) });
  }

  // ---- entities: blocks of "key" "value" text
  let text = ''; for (let i = 0; i < L.entities.len; i++) { const c = bytes[L.entities.off + i]; if (c) text += String.fromCharCode(c); }
  const entities = [];
  for (const block of text.split('}')) { const e = {}; for (const kv of block.matchAll(/"([^"]*)"\s+"([^"]*)"/g)) e[kv[1]] = kv[2]; if (e.classname) entities.push(e); }

  const lighting = bytes.subarray(L.lighting.off, L.lighting.off + L.lighting.len);
  return { planes, textures, texinfo, faces, nodes, leaves, clipnodes, models, entities, lighting };
}

// What is at this point, in the tree that starts at node `head`? (a point in the map's own units)
export function contentsAt(bsp, head, x, y, z) {
  let i = head;
  while (i >= 0) { const nd = bsp.nodes[i], pl = bsp.planes[nd.plane]; i = pl.n[0] * x + pl.n[1] * y + pl.n[2] * z - pl.dist >= 0 ? nd.front : nd.back; }
  return bsp.leaves[-(i + 1)];
}

// The same for a clip hull: the space a standing player's center may be in (hull 1), as the original game sees it
export function hullContentsAt(bsp, head, x, y, z) {
  let i = head;
  while (i >= 0) { const nd = bsp.clipnodes[i], pl = bsp.planes[nd.plane]; i = pl.n[0] * x + pl.n[1] * y + pl.n[2] * z - pl.dist >= 0 ? nd.front : nd.back; }
  return i;
}

// Walks the tree of one model and returns everything that passes `keep(contents)` as boxes
// [minx, miny, minz, maxx, maxy, maxz, contents] in the map's units. Straight planes cut a box exactly.
// A slanted plane can't, so a box it runs through is halved until it is `res` units small and then goes down both
// sides: if anything in it passes, all of it does. Slanted things come out a little too big, thin ones (a chair's
// back, a pipe, a urinal) don't fall through the cuts.
export function treeBoxes(bsp, model, keep, res = 4, grow = 0) {
  const out = [], { nodes, planes, leaves } = bsp;
  const walk = (i, b) => {
    if (i < 0) { const c = leaves[-(i + 1)]; if (keep(c)) out.push([b[0], b[1], b[2], b[3], b[4], b[5], c]); return; }
    const nd = nodes[i], pl = planes[nd.plane], n = pl.n;
    if (pl.type < 3) {
      const a = pl.type, s = n[a] < 0 ? -1 : 1, cut = pl.dist * s;
      const hiChild = s > 0 ? nd.front : nd.back, loChild = s > 0 ? nd.back : nd.front;
      if (b[a] >= cut) return walk(hiChild, b);
      if (b[a + 3] <= cut) return walk(loChild, b);
      const lo = b.slice(), hi = b.slice(); lo[a + 3] = cut; hi[a] = cut;
      walk(loChild, lo); walk(hiChild, hi);
      return;
    }
    const lo = n[0] * (n[0] > 0 ? b[0] : b[3]) + n[1] * (n[1] > 0 ? b[1] : b[4]) + n[2] * (n[2] > 0 ? b[2] : b[5]) - pl.dist;
    const hi = n[0] * (n[0] > 0 ? b[3] : b[0]) + n[1] * (n[1] > 0 ? b[4] : b[1]) + n[2] * (n[2] > 0 ? b[5] : b[2]) - pl.dist;
    if (lo >= 0) return walk(nd.front, b);
    if (hi <= 0) return walk(nd.back, b);
    const sx = b[3] - b[0], sy = b[4] - b[1], sz = b[5] - b[2], big = Math.max(sx, sy, sz);
    if (big <= res) { walk(nd.front, b); walk(nd.back, b); return; }
    const a = big === sx ? 0 : big === sy ? 1 : 2, mid = (b[a] + b[a + 3]) / 2, p = b.slice(), q = b.slice();
    p[a + 3] = mid; q[a] = mid;
    walk(i, p); walk(i, q);
  };
  const m = model;
  walk(m.head, [m.mins[0] - grow, m.mins[1] - grow, m.mins[2] - grow, m.maxs[0] + grow, m.maxs[1] + grow, m.maxs[2] + grow]);
  return out;
}

// Boxes that touch and line up become one, so the collision world stays small
export function mergeBoxes(list) {
  const boxes = list.map((b) => b.slice());
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (const a of [0, 1, 2]) {
      const u = (a + 1) % 3, v = (a + 2) % 3, groups = new Map();
      for (const b of boxes) {
        if (!b) continue;
        const k = [b[6], b[u].toFixed(2), b[u + 3].toFixed(2), b[v].toFixed(2), b[v + 3].toFixed(2)].join('|');
        let g = groups.get(k); if (!g) groups.set(k, g = []); g.push(b);
      }
      boxes.length = 0;
      for (const g of groups.values()) {
        g.sort((p, q) => p[a] - q[a]);
        let cur = g[0];
        for (let i = 1; i < g.length; i++) {
          if (g[i][a] <= cur[a + 3] + 0.01) { cur[a + 3] = Math.max(cur[a + 3], g[i][a + 3]); changed = true; }
          else { boxes.push(cur); cur = g[i]; }
        }
        boxes.push(cur);
      }
    }
    if (!changed) break;
  }
  return boxes;
}

// Packs the baked light of the given faces into one picture. Returns the picture and, per face, where its light is.
export function lightAtlas(bsp, faceIds, curve) {
  const entries = [];
  for (const id of faceIds) {
    const f = bsp.faces[id];
    if (f.lightofs < 0 || f.style === 255) continue;
    const ti = bsp.texinfo[f.texinfo];
    let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
    for (let i = 0; i < f.pts.length; i += 3) {
      const x = f.pts[i], y = f.pts[i + 1], z = f.pts[i + 2];
      const s = x * ti.s[0] + y * ti.s[1] + z * ti.s[2] + ti.s[3], t = x * ti.t[0] + y * ti.t[1] + z * ti.t[2] + ti.t[3];
      s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t);
    }
    const ls = Math.floor(s0 / 16), lt = Math.floor(t0 / 16), w = Math.ceil(s1 / 16) - ls + 1, h = Math.ceil(t1 / 16) - lt + 1;
    entries.push({ id, ls, lt, w, h, ofs: f.lightofs });
  }
  entries.sort((a, b) => b.h - a.h);
  let area = 0; for (const e of entries) area += (e.w + 2) * (e.h + 2);
  let size = 256; while (size * size < area * 1.35) size *= 2;
  const place = (S) => { let x = 0, y = 0, row = 0; for (const e of entries) { if (x + e.w + 2 > S) { x = 0; y += row; row = 0; } e.ax = x + 1; e.ay = y + 1; x += e.w + 2; row = Math.max(row, e.h + 2); } return y + row <= S; };
  while (!place(size)) size *= 2;
  const rgba = new Uint8Array(size * size * 4), L = bsp.lighting;
  const lut = new Uint8Array(256); for (let i = 0; i < 256; i++) lut[i] = curve ? Math.min(255, Math.round(curve(i / 255) * 255)) : i;
  const map = new Map();
  for (const e of entries) {
    for (let v = -1; v <= e.h; v++) for (let u = -1; u <= e.w; u++) {
      const cu = Math.max(0, Math.min(e.w - 1, u)), cv = Math.max(0, Math.min(e.h - 1, v)), p = e.ofs + (cv * e.w + cu) * 3, q = ((e.ay + v) * size + e.ax + u) * 4;
      rgba[q] = lut[L[p]]; rgba[q + 1] = lut[L[p + 1]]; rgba[q + 2] = lut[L[p + 2]]; rgba[q + 3] = 255;
    }
    map.set(e.id, e);
  }
  return { size, rgba, map };
}
