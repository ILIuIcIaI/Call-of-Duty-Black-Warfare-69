import * as THREE from 'three';
import { readBsp, treeBoxes, mergeBoxes, lightAtlas, CONTENTS } from '../bsp.js';
import { fileBytes } from '../../core/files.js';

// =============================================================================
// POOLDAY: the Counter-Strike 1.6 map by Squall, not rebuilt but taken
// straight from its map file (poolday.bsp next to this file): every face, its
// original textures and baked light, the solid parts, the spawns and the doors.
// The big pool stands empty here: jump in, climb out. The file has water in it,
// POOL_WATER brings it back. One crate texture in the file was replaced by planks.
// =============================================================================
const POOL_WATER = false;
const UNIT = 0.0254;          // one map unit is an inch
const OX = 2, OZ = 13;        // the building's middle goes to the world's middle
const CLIMB = 2.6;            // bots climb this high, the pool's rim included

const file = await fileBytes(new URL('./poolday.bsp', import.meta.url));
const bsp = readBsp(file);

// map units -> world: x stays, z is up, y points the other way
const wx = (x) => x * UNIT + OX, wy = (z) => z * UNIT, wz = (y) => OZ - y * UNIT;

const ents = (cls) => bsp.entities.filter((e) => e.classname === cls);
const originOf = (e) => (e.origin || '0 0 0').split(' ').map(Number);

const NEVER_DRAWN = new Set(['sky', 'aaatrigger', 'origin']);
const faceIdsOf = (m) => { const out = [], M = bsp.models[m]; for (let i = M.first; i < M.first + M.count; i++) if (!NEVER_DRAWN.has(texName(i))) out.push(i); return out; };
const texName = (i) => bsp.textures[bsp.texinfo[bsp.faces[i].texinfo].tex].name;
const modelOf = (e) => +e.model.slice(1);

// ---- which model is what
const SOLID_GLASS = ents('func_wall').map(modelOf);   // the window band under the roof
const SIGNS = ents('func_illusionary').map(modelOf);  // pool rules: seen, not felt
const DOORS = ents('func_door_rotating');
const POOLS = ents('func_water').map(modelOf).sort((a, b) => a - b);
const USED = [0, ...SOLID_GLASS, ...SIGNS, ...DOORS.map(modelOf), ...POOLS];

// Baked light, one picture for everything. GoldSrc shows its light through a brightening gamma table: this is that curve.
const lightCurve = (v) => Math.pow(v, 0.66) * 1.25;
let atlas = null, textures = null;
function shared(engine) {
  if (atlas) return;
  const ids = []; for (const m of USED) ids.push(...faceIdsOf(m));
  const A = lightAtlas(bsp, ids, lightCurve);
  const lm = new THREE.DataTexture(A.rgba, A.size, A.size, THREE.RGBAFormat);
  lm.channel = 1; lm.colorSpace = THREE.SRGBColorSpace; lm.magFilter = lm.minFilter = THREE.LinearFilter; lm.needsUpdate = true;
  atlas = { tex: lm, map: A.map, size: A.size };
  textures = new Map();
  for (const t of bsp.textures) {
    if (!t.rgba) continue;
    const m = new THREE.DataTexture(t.rgba, t.w, t.h, THREE.RGBAFormat);
    m.wrapS = m.wrapT = THREE.RepeatWrapping; m.colorSpace = THREE.SRGBColorSpace;
    m.magFilter = THREE.LinearFilter; m.minFilter = THREE.LinearMipmapLinearFilter; m.generateMipmaps = true; m.anisotropy = engine.maxAnisotropy; m.needsUpdate = true;
    textures.set(t.name, m);
  }
}

// One mesh per texture for the given faces. origin: a door's hinge in map units, the mesh then sits around it.
function meshesOf(faceIds, makeMat, origin) {
  const groups = new Map();
  for (const id of faceIds) { const n = texName(id); let g = groups.get(n); if (!g) groups.set(n, g = []); g.push(id); }
  const out = [];
  const ox = origin ? origin[0] : 0, oy = origin ? origin[1] : 0, oz = origin ? origin[2] : 0;
  for (const [name, ids] of groups) {
    const P = [], N = [], U = [], L = [], T = bsp.textures.find((t) => t.name === name);
    for (const id of ids) {
      const f = bsp.faces[id], ti = bsp.texinfo[f.texinfo], pl = bsp.planes[f.plane], s = f.side ? -1 : 1, e = atlas.map.get(id);
      const nx = pl.n[0] * s, ny = pl.n[1] * s, nz = pl.n[2] * s, count = f.pts.length / 3;
      // the corners in world space, and which way round they have to go to face the plane's front
      const c = [];
      for (let i = 0; i < count; i++) {
        const x = f.pts[i * 3], y = f.pts[i * 3 + 1], z = f.pts[i * 3 + 2];
        const su = x * ti.s[0] + y * ti.s[1] + z * ti.s[2] + ti.s[3], tv = x * ti.t[0] + y * ti.t[1] + z * ti.t[2] + ti.t[3];
        const px = origin ? (x - ox) * UNIT : wx(x), py = origin ? (z - oz) * UNIT : wy(z), pz = origin ? -(y - oy) * UNIT : wz(y);
        c.push({ px, py, pz, u: su / T.w, v: tv / T.h, lu: e ? (e.ax + su / 16 - e.ls + 0.5) / atlas.size : 0, lv: e ? (e.ay + tv / 16 - e.lt + 0.5) / atlas.size : 0 });
      }
      let area = 0;
      for (let i = 1; i + 1 < count; i++) {
        const a = c[0], b = c[i], d = c[i + 1], ux = b.px - a.px, uy = b.py - a.py, uz = b.pz - a.pz, vx = d.px - a.px, vy = d.py - a.py, vz = d.pz - a.pz;
        area += (uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * nz - (ux * vy - uy * vx) * ny;
      }
      if (area < 0) c.reverse();
      for (let i = 1; i + 1 < count; i++) for (const q of [c[0], c[i], c[i + 1]]) { P.push(q.px, q.py, q.pz); N.push(nx, nz, -ny); U.push(q.u, q.v); L.push(q.lu, q.lv); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setAttribute('uv1', new THREE.Float32BufferAttribute(L, 2));
    const mesh = new THREE.Mesh(g, makeMat(name));
    mesh.matrixAutoUpdate = false;
    out.push(mesh);
  }
  return out;
}

const solidMat = new Map(), flash = { pos: { value: new THREE.Vector3() }, i: { value: 0 } };
function litMat(name) {
  let m = solidMat.get(name);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ map: textures.get(name) || null, lightMap: atlas.tex, lightMapIntensity: Math.PI, fog: false });
    // the light is baked, only the flash of your own gun still falls on the walls
    m.onBeforeCompile = (s) => {
      s.uniforms.uFlashPos = flash.pos; s.uniforms.uFlashI = flash.i;
      s.vertexShader = 'varying vec3 vWorldF;\n' + s.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvWorldF = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      s.fragmentShader = 'uniform vec3 uFlashPos; uniform float uFlashI; varying vec3 vWorldF;\n' + s.fragmentShader.replace('#include <aomap_fragment>', '#include <aomap_fragment>\n{ vec3 fd = vWorldF - uFlashPos; reflectedLight.indirectDiffuse += vec3(1.0, 0.72, 0.42) * uFlashI / (1.0 + dot(fd, fd) * 0.32); }');
    };
    solidMat.set(name, m);
  }
  return m;
}

// ---- the solid world as boxes, in world space
const worldBoxes = mergeBoxes(treeBoxes(bsp, bsp.models[0], (c) => c === CONTENTS.solid, 2)).map(toWorld);
const glassBoxes = SOLID_GLASS.flatMap((m) => mergeBoxes(treeBoxes(bsp, bsp.models[m], (c) => c !== CONTENTS.empty, 8)).map(toWorld));
function toWorld(b) { return [wx(b[0]), wy(b[2]), wz(b[4]), wx(b[3]), wy(b[5]), wz(b[1])]; }

// In the original nobody gets high enough to leave. With wall jumps and climbing we would: a lid over the hall,
// as high as the window band, that only stops bodies, not bullets.
const LID = 4.06;

// Our climbing also gets onto tops nobody could reach in the original. Two kinds are filled up to their ceiling, again
// for bodies only: the stall walls, lockers and partitions 2.4 m up, where the ceiling leaves room only to crawl along
// under it, and tops narrower than a foot (urinals, flush pipes, shower heads) that nobody could really stand on.
const STAND_ROOM = 1.85, FOOT = 0.45;
function narrowTop(b, boxes) {
  // b's top together with everything touching it at the same height
  const part = new Set([b]);
  let x0 = b[0], x1 = b[3], z0 = b[2], z1 = b[5];
  for (const a of part) for (const c of boxes) {
    if (part.has(c) || Math.abs(c[4] - a[4]) > 0.01 || c[0] > a[3] + 0.01 || c[3] < a[0] - 0.01 || c[2] > a[5] + 0.01 || c[5] < a[2] - 0.01) continue;
    part.add(c); x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[3]); z0 = Math.min(z0, c[2]); z1 = Math.max(z1, c[5]);
    if (x1 - x0 >= FOOT && z1 - z0 >= FOOT) return false;
  }
  return x1 - x0 < FOOT || z1 - z0 < FOOT;
}
function unreachableTops(boxes) {
  const out = [];
  for (const b of boxes) {
    const top = b[4];
    if (top < 1 || top > LID - 0.5) continue;
    // what lies over the top: its footprint is cut where those things begin and end, each piece gets its own ceiling
    const over = boxes.filter((c) => c !== b && c[4] > top + 0.01 && c[0] < b[3] && c[3] > b[0] && c[2] < b[5] && c[5] > b[2]);
    const xs = [b[0], b[3]], zs = [b[2], b[5]];
    for (const c of over) { if (c[0] > b[0]) xs.push(c[0]); if (c[3] < b[3]) xs.push(c[3]); if (c[2] > b[2]) zs.push(c[2]); if (c[5] < b[5]) zs.push(c[5]); }
    xs.sort((p, q) => p - q); zs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < zs.length; j++) {
      const x0 = xs[i], x1 = xs[i + 1], z0 = zs[j], z1 = zs[j + 1];
      if (x1 - x0 < 0.005 || z1 - z0 < 0.005) continue;
      let ceil = LID;
      for (const c of over) if (c[0] < x1 && c[3] > x0 && c[2] < z1 && c[5] > z0) ceil = Math.min(ceil, Math.max(c[1], top));
      const room = ceil - top;
      if (room <= 0.5) continue; // covered, or no body fits in there anyway
      if (room < STAND_ROOM || narrowTop(b, boxes)) out.push([x0, top, z0, x1, ceil, z1, 0]);
    }
  }
  return mergeBoxes(out);
}
const fillBoxes = unreachableTops([...worldBoxes, ...glassBoxes]);

// the texture on a box's top decides how it sounds to walk on
const LOUD_METAL = new Set(['locker', 'lockerside', 'steel', 'stallred', 'walmart_blue']);
function surfaceOf(box) {
  const cx = (box[0] + box[3]) / 2, cz = (box[2] + box[5]) / 2, top = box[4], E = 0.02;
  for (let i = bsp.models[0].first, e = i + bsp.models[0].count; i < e; i++) {
    const f = bsp.faces[i]; if (Math.abs(wy(f.pts[2]) - top) > E) continue;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, flat = true;
    for (let k = 0; k < f.pts.length; k += 3) { const x = wx(f.pts[k]), z = wz(f.pts[k + 1]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); if (Math.abs(wy(f.pts[k + 2]) - top) > E) flat = false; }
    if (flat && cx >= x0 && cx <= x1 && cz >= z0 && cz <= z1) return LOUD_METAL.has(texName(i)) ? 'metal' : 'concrete';
  }
  return 'concrete';
}
const worldSurfaces = worldBoxes.map(surfaceOf);

// ---- spawns: dropped from where the file has them onto the floor below
const CENTER = [0, 0];
function spawnList(cls) {
  return ents(cls).map((e) => { const o = originOf(e), x = wx(o[0]), z = wz(o[1]); return [x, 0, z, Math.atan2(-(CENTER[0] - x), -(CENTER[1] - z))]; });
}
const SPAWN_SOUTH = spawnList('info_player_start'), SPAWN_NORTH = spawnList('info_player_deathmatch');

// ---- the stall doors: open when someone comes close, shut again a moment after the last one has gone.
// Closed they are solid; while they swing they don't push anyone around.
const DOOR_OPEN = Math.PI / 2, DOOR_SPEED = 100 * Math.PI / 180, DOOR_NEAR = 1.45, DOOR_WAIT = 2.2;
function updateDoors(game, dt) {
  const list = game.poolDoors; if (!list) return;
  for (const d of list) {
    let near = null, nd = DOOR_NEAR;
    for (const c of game.combatants) { if (!c.alive || c.pos.y < -50) continue; const m = Math.hypot(c.pos.x - d.mx, c.pos.z - d.mz); if (m < nd && Math.abs(c.pos.y - d.y0) < 2.2) { nd = m; near = c; } }
    if (near) {
      if (d.want === 0 && d.a === 0) d.dir = near.pos.x - d.hx > 0 ? -1 : 1; // away from whoever comes (the leaf hangs along z)
      d.want = 1; d.wait = DOOR_WAIT;
    } else if (d.want && (d.wait -= dt) <= 0) d.want = 0;
    const target = d.want ? d.dir * DOOR_OPEN : 0;
    if (d.a !== target) {
      const step = DOOR_SPEED * dt;
      d.a = Math.abs(target - d.a) <= step ? target : d.a + Math.sign(target - d.a) * step;
      d.mesh.rotation.y = d.a;
      const open = Math.abs(d.a) > 0.05;
      if (open !== d.isOpen) {
        d.isOpen = open;
        const B = game.col.B, o = d.box * 6;
        if (open) game.col.disable(d.box); else for (let k = 0; k < 6; k++) B[o + k] = d.boxAt[k];
        if (d.want) game.audio.play('imp_metal', { pos: new THREE.Vector3(d.mx, d.y0 + 1, d.mz), vol: 0.5, rate: 0.7, maxDist: 25 });
      }
    }
  }
}

// The file's sky is a stock picture of a desert with red rocks, and it isn't in the file. Ours are drawn here.
function desertRocks(root) {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const P = [], C = [];
  const tri = (a, b, c, k) => { P.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) C.push(...k); };
  // red rock in layers, darker at the foot
  const shade = (t, f) => { const band = 0.72 + 0.28 * Math.sin(t * 19 + f); return [(0.14 + t * 0.2) * band, (0.05 + t * 0.07) * band, (0.03 + t * 0.03) * band]; };
  const N = 17;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + rnd() * 0.22, R = 125 + rnd() * 55, h = 24 + rnd() * 30, r0 = 15 + rnd() * 24, cx = Math.cos(a) * R, cz = Math.sin(a) * R, sides = 11, foot = rnd() * 3;
    const levels = [[0, 1.3], [0.16, 1.16], [0.3, 1.02], [0.44, 0.92], [0.56, 0.74], [0.68, 0.68], [0.8, 0.62], [0.92, 0.58], [1, 0.5]];
    const dent = []; for (let s = 0; s < sides; s++) dent.push(0.84 + rnd() * 0.32);
    const ring = levels.map(([t, w]) => { const pts = []; for (let s = 0; s < sides; s++) { const b = (s / sides) * Math.PI * 2 + i, rr = r0 * w * dent[s] * (0.95 + rnd() * 0.1); pts.push([cx + Math.cos(b) * rr, -6 + (h + 6) * t, cz + Math.sin(b) * rr]); } return { t, pts }; });
    for (let l = 0; l + 1 < ring.length; l++) for (let s = 0; s < sides; s++) {
      const n = (s + 1) % sides, A = ring[l].pts[s], B = ring[l].pts[n], D = ring[l + 1].pts[n], E = ring[l + 1].pts[s];
      tri(A, D, B, shade(ring[l].t, foot + s * 0.13)); tri(A, E, D, shade(ring[l + 1].t, foot + s * 0.13));
    }
    const top = ring[ring.length - 1].pts, mid = [cx, h, cz];
    for (let s = 0; s < sides; s++) tri(top[s], mid, top[(s + 1) % sides], [0.3, 0.13, 0.07]);
  }
  // the ground out there
  const G = 300; for (let s = 0; s < 16; s++) { const u = (s / 16) * Math.PI * 2, v = ((s + 1) / 16) * Math.PI * 2; tri([0, -6, 0], [Math.cos(v) * G, -6, Math.sin(v) * G], [Math.cos(u) * G, -6, Math.sin(u) * G], [0.4, 0.24, 0.13]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }));
  m.matrixAutoUpdate = false;
  root.add(m);
}

// The file's three buttons by the urinals: press F, hear the water run. As much of a game as it ever was.
const BUTTONS = ents('func_button').map((e) => { const M = bsp.models[modelOf(e)]; return { x: wx((M.mins[0] + M.maxs[0]) / 2), y: wy((M.mins[2] + M.maxs[2]) / 2), z: wz((M.mins[1] + M.maxs[1]) / 2) }; });
function useButtons(def, game, dt) {
  const p = game.player; if (!p.alive || (def.buttonCd = (def.buttonCd || 0) - dt) > 0) return;
  const at = BUTTONS.find((b) => Math.hypot(b.x - p.pos.x, b.z - p.pos.z) < 1.15);
  if (at && game.input.pressed('interact')) {
    def.buttonCd = 2;
    def.flush(game, at);
    if (game.net && game.net.inMatch) game.net.send({ t: 'ev', k: 'flush', x: at.x, y: at.y, z: at.z });
  }
}

export default {
  id: 'poolday',
  name: 'POOLDAY',
  desc: 'Der Klassiker aus Counter-Strike 1.6, direkt aus der Original-Map von Squall. Offene Schwimmhalle mit leerem Becken, Umkleiden und Toiletten.',
  size: 'Sehr klein',
  env: {
    sunDir: [0.3, 0.8, 0.2],
    sunColor: 0xfff8e8, sunIntensity: 1.6,
    skyTop: 0x1f62c8, skyHorizon: 0xa8ccf0, skyBottom: 0xb09878,
    cloudColor: 0xffffff, clouds: 0.62,
    hemiSky: 0xdce8f0, groundColor: 0x9aa8b0, ambient: 1.9,
    fogColor: 0xc8d8e0, fogNear: 100, fogFar: 320,
  },
  bounds: { minX: -16.5, maxX: 16.5, minZ: -18.5, maxZ: 18.5 },
  navClimb: CLIMB,
  navTop: 3,         // nobody walks on the roofs
  spawnMinY: -0.1,   // nobody starts at the bottom of the pool
  mmCeiling: 3.6,    // the minimap looks under the roof
  menuOrbit: { y: 3.1, r: 8.5, rz: 4.6, look: [-1.2, 0.2, -0.8] },
  previewBoxes() { return worldBoxes.filter((b) => b[4] > 0.4 && b[1] < 3.6).map((b) => [b[0], b[2], b[3], b[5], b[4]]); },

  build(B) {
    shared(B.engine);
    // ---- the solid world
    worldBoxes.forEach((b, i) => B.col.add(b[0], b[1], b[2], b[3], b[4], b[5], worldSurfaces[i], 0));
    for (const b of glassBoxes) B.col.add(b[0], b[1], b[2], b[3], b[4], b[5], 'glass', 1);
    B.col.add(this.bounds.minX, LID, this.bounds.minZ, this.bounds.maxX, 9, this.bounds.maxZ, 'concrete', 0, true);
    for (const b of fillBoxes) B.col.add(b[0], b[1], b[2], b[3], b[4], b[5], 'concrete', 0, true);
    desertRocks(B.root);
    // ---- what it looks like
    const world = faceIdsOf(0);
    for (const mesh of meshesOf(world, litMat)) B.root.add(mesh);
    for (const m of SIGNS) for (const mesh of meshesOf(faceIdsOf(m), litMat)) B.root.add(mesh);
    // the window band: see-through, as in the file
    const see = new Map();
    const glassMat = (name) => { let k = see.get(name); if (!k) see.set(name, k = new THREE.MeshBasicMaterial({ map: textures.get(name) || null, transparent: true, opacity: 130 / 255, depthWrite: false, fog: false, side: THREE.DoubleSide, forceSinglePass: true })); return k; };
    for (const m of SOLID_GLASS) for (const mesh of meshesOf(faceIdsOf(m), glassMat)) { mesh.renderOrder = 2; B.root.add(mesh); }
    // the water: the whirlpool, and the big pool only if it is switched on
    const water = new THREE.MeshBasicMaterial({ map: textures.get('bluewater'), transparent: true, opacity: 190 / 255, depthWrite: false, fog: false, side: THREE.DoubleSide, forceSinglePass: true });
    this.waterMat = water;
    POOLS.forEach((m, i) => { if (i === 0 && !POOL_WATER) return; for (const mesh of meshesOf(faceIdsOf(m), () => water)) { mesh.renderOrder = 1; B.root.add(mesh); } });
    // ---- the doors
    this.doors = [];
    for (const e of DOORS) {
      const o = originOf(e), M = bsp.models[modelOf(e)], group = new THREE.Group();
      group.position.set(wx(o[0]), wy(o[2]), wz(o[1]));
      group.rotation.order = 'YXZ';
      for (const mesh of meshesOf(faceIdsOf(modelOf(e)), litMat, o.map(() => 0))) { mesh.matrixAutoUpdate = false; group.add(mesh); }
      B.root.add(group);
      // the leaf is a thin plate along the hinge's own y: solid while it is shut
      const x0 = wx(M.mins[0] + o[0]) - 0.025, x1 = wx(M.maxs[0] + o[0]) + 0.025, y0 = wy(M.mins[2] + o[2]), y1 = wy(M.maxs[2] + o[2]), z0 = wz(M.maxs[1] + o[1]), z1 = wz(M.mins[1] + o[1]);
      const box = B.col.add(x0, y0, z0, x1, y1, z1, 'metal', 0.6);
      this.doors.push({ mesh: group, box, boxAt: [x0, y0, z0, x1, y1, z1], a: 0, want: 0, wait: 0, dir: 1, isOpen: false, hx: wx(o[0]), hz: wz(o[1]), mx: (x0 + x1) / 2, mz: (z0 + z1) / 2, y0: 0 });
    }
  },

  // what the game needs after the map stands
  onBuilt(game) {
    game.poolDoors = this.doors;
    // the doors don't count for the bots' paths: they open for anyone who comes
    for (const d of this.doors) game.col.disable(d.box);
  },
  onNavBuilt(game) {
    const B = game.col.B;
    for (const d of this.doors) { const o = d.box * 6; for (let k = 0; k < 6; k++) B[o + k] = d.boxAt[k]; }
    // spawns land on the floor below where the file has them
    for (const list of [SPAWN_SOUTH, SPAWN_NORTH]) for (const s of list) { const f = game.col.floorBelow(s[0], s[2], 0.1, 1.2, -1); s[1] = isFinite(f) ? f : 0; }
  },
  update(game, dt) {
    updateDoors(game, dt);
    if (this.waterMat && this.waterMat.map) { const t = game.time * 0.05; this.waterMat.map.offset.set(Math.sin(t) * 0.5, t); }
    const L = game.muzzleLight; if (L) { flash.pos.value.copy(L.position); flash.i.value = Math.min(1.1, L.intensity * 0.05); }
    useButtons(this, game, dt);
  },

  flush(game, at) { game.audio.play('trickle', { pos: new THREE.Vector3(at.x, at.y, at.z), vol: 1, maxDist: 16 }); },
  onNetEvent(game, m) { if (m.k === 'flush') this.flush(game, m); },

  spawns() { return { 0: SPAWN_SOUTH, 1: SPAWN_NORTH }; },
  // the 2 vs 2 mode: only the spawns from which the flag down in the pool is out of sight (the others look in through
  // the doors of the pool hall)
  wingSpawns() {
    const seen = [[-8.16, 8.68], [8.73, 10.03], [-9.43, -14.94], [-8.24, -8.51], [-8.11, -11.51], [9.62, -10.06], [6.06, -9.25]];
    const ok = (s) => !seen.some(([x, z]) => Math.hypot(s[0] - x, s[2] - z) < 0.3);
    return { 0: SPAWN_SOUTH.filter(ok), 1: SPAWN_NORTH.filter(ok) };
  },

  // where the fights are: the hall, the pool and both wings
  hotspots: [
    [0, 0, 0], [-1, -2.44, 0], [-9, 0, 0], [8, 0, -3], [8, 0, 3], [-1, 0, -6], [-1, 0, 6], [10.5, 0, 0],
    [-10, 0, -9], [-10, 0, 9], [-1, 0, -13], [-1, 0, 13], [6, 0, -13], [6, 0, 13], [-11, 0, -14], [-11, 0, 14],
  ],
};
