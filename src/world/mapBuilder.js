import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CollisionWorld } from './collision.js';

// Material palette shared by all maps. tex = procedural texture, scale = meters per texture tile.
export const MATERIALS = {
  concrete: { tex: 'concrete', color: 0xb8b4ac, scale: 3, surface: 'concrete' },
  concreteDark: { tex: 'concrete', color: 0x7c7a76, scale: 3, surface: 'concrete' },
  concreteFloor: { tex: 'concrete', color: 0x9a978f, scale: 4, surface: 'concrete' },
  asphalt: { tex: 'asphalt', color: 0xffffff, scale: 4, surface: 'concrete' },
  brick: { tex: 'brick', color: 0xffffff, scale: 1.6, surface: 'concrete' },
  brickDark: { tex: 'brick', color: 0x9a8a80, scale: 1.6, surface: 'concrete' },
  plasterWhite: { tex: 'plaster', color: 0xf0ebe0, scale: 3, surface: 'concrete' },
  plasterOchre: { tex: 'plaster', color: 0xe0b878, scale: 3, surface: 'concrete' },
  plasterTerra: { tex: 'plaster', color: 0xd08a62, scale: 3, surface: 'concrete' },
  plasterBlue: { tex: 'plaster', color: 0x9fb8c8, scale: 3, surface: 'concrete' },
  plasterGreen: { tex: 'plaster', color: 0xa8b894, scale: 3, surface: 'concrete' },
  plasterGrey: { tex: 'plaster', color: 0xb8b8b4, scale: 3, surface: 'concrete' },
  metal: { tex: 'metal', color: 0x9aa0a6, scale: 2, surface: 'metal' },
  metalDark: { tex: 'metal', color: 0x4a4e52, scale: 2, surface: 'metal' },
  metalYellow: { tex: 'metal', color: 0xd8a820, scale: 2, surface: 'metal' },
  metalRed: { tex: 'metal', color: 0xa83228, scale: 2, surface: 'metal' },
  contRed: { tex: 'corrugated', color: 0xa8402e, scale: 2.4, surface: 'metal', pen: 0.5 },
  contBlue: { tex: 'corrugated', color: 0x2e5a8a, scale: 2.4, surface: 'metal', pen: 0.5 },
  contGreen: { tex: 'corrugated', color: 0x3e6e46, scale: 2.4, surface: 'metal', pen: 0.5 },
  contOrange: { tex: 'corrugated', color: 0xd06a22, scale: 2.4, surface: 'metal', pen: 0.5 },
  contWhite: { tex: 'corrugated', color: 0xc8c8c2, scale: 2.4, surface: 'metal', pen: 0.5 },
  contGrey: { tex: 'corrugated', color: 0x6a7072, scale: 2.4, surface: 'metal', pen: 0.5 },
  corrugated: { tex: 'corrugated', color: 0xa4a8a8, scale: 2.4, surface: 'metal', pen: 0.6 },
  wood: { tex: 'wood', color: 0xffffff, scale: 1.5, surface: 'wood', pen: 0.7 },
  woodDark: { tex: 'wood', color: 0x8a7464, scale: 1.5, surface: 'wood', pen: 0.7 },
  woodPale: { tex: 'wood', color: 0xe8dcc8, scale: 1.5, surface: 'wood', pen: 0.7 },
  tiles: { tex: 'tiles', color: 0xe8e2d6, scale: 1.2, surface: 'concrete' },
  tilesTerra: { tex: 'tiles', color: 0xc07850, scale: 1.4, surface: 'concrete' },
  dirt: { tex: 'dirt', color: 0xffffff, scale: 5, surface: 'dirt' },
  grass: { tex: 'grass', color: 0xffffff, scale: 4, surface: 'dirt' },
  rooftile: { tex: 'rooftile', color: 0xffffff, scale: 2, surface: 'concrete' },
  sandbag: { tex: 'fabric', color: 0xb0a07a, scale: 1, surface: 'dirt', pen: 0 },
  canvasGreen: { tex: 'fabric', color: 0x5e6e48, scale: 1, surface: 'wood', pen: 1 },
  canvasRed: { tex: 'fabric', color: 0xb04838, scale: 1, surface: 'wood', pen: 1 },
  canvasBlue: { tex: 'fabric', color: 0x3a6898, scale: 1, surface: 'wood', pen: 1 },
  canvasYellow: { tex: 'fabric', color: 0xd8b048, scale: 1, surface: 'wood', pen: 1 },
  rubber: { tex: null, color: 0x1c1c1c, surface: 'metal' },
  black: { tex: null, color: 0x101010, surface: 'metal' },
  carPaintRed: { tex: 'paint', scale: 2, color: 0x8a1c18, surface: 'metal', pen: 0.4 },
  carPaintBlue: { tex: 'paint', scale: 2, color: 0x1e3e6a, surface: 'metal', pen: 0.4 },
  carPaintWhite: { tex: 'paint', scale: 2, color: 0xd8d8d4, surface: 'metal', pen: 0.4 },
  carPaintGreen: { tex: 'paint', scale: 2, color: 0x3a5a3a, surface: 'metal', pen: 0.4 },
  carGlass: { tex: null, color: 0x1a2228, surface: 'glass', pen: 1 },
  foliage: { tex: 'grass', color: 0x6a8a4a, scale: 1.5, surface: 'wood', pen: 1 },
  foliageDark: { tex: 'grass', color: 0x4a6a3a, scale: 1.5, surface: 'wood', pen: 1 },
  bark: { tex: 'wood', color: 0x6a5444, scale: 1, surface: 'wood' },
  water: { tex: 'water', scale: 4, color: 0x4a7482, surface: 'water' },
  hazard: { tex: 'hazard', scale: 1, color: 0xffffff, surface: 'metal' },
  lampOn: { tex: null, color: 0xfff2d0, emissive: 0xfff0c8, emissiveIntensity: 2.2, surface: 'glass' },
  lampBlue: { tex: null, color: 0xa0e0ff, emissive: 0x70d0ff, emissiveIntensity: 2.4, surface: 'glass' },
  lampRed: { tex: null, color: 0xff6050, emissive: 0xff3020, emissiveIntensity: 2.4, surface: 'glass' },
  screen: { tex: null, color: 0x103040, emissive: 0x2a9ac0, emissiveIntensity: 1.2, surface: 'glass' },
  pavers: { tex: 'tiles', color: 0xe2cfa8, scale: 2.6, surface: 'concrete' },
  paversDark: { tex: 'tiles', color: 0xa89878, scale: 2.0, surface: 'concrete' },
  stoneWall: { tex: 'brick', color: 0xf0e2c8, scale: 2.4, surface: 'concrete' },
  plasterRose: { tex: 'plaster', color: 0xe8b0a0, scale: 3, surface: 'concrete' },
  plasterSand: { tex: 'plaster', color: 0xf0dcb0, scale: 3, surface: 'concrete' },
  marble: { tex: 'plaster', color: 0xeee6d8, scale: 1.5, surface: 'concrete' },
  waterFountain: { tex: 'water', scale: 2, color: 0x6ab0c0, surface: 'water' },
  shutterGreen: { tex: 'wood', color: 0x5a8a5a, scale: 0.8, surface: 'wood', pen: 0.8 },
  shutterBlue: { tex: 'wood', color: 0x4a6a9a, scale: 0.8, surface: 'wood', pen: 0.8 },
  labWall: { tex: 'metal', color: 0xd8dcdc, scale: 2.5, surface: 'metal', pen: 0.5 },
  labFloor: { tex: 'tiles', color: 0xb8c0c4, scale: 1.6, surface: 'concrete' },
  hazardStripe: { tex: 'hazard', scale: 1, color: 0xffffff, surface: 'metal' },
  paintWhite: { tex: 'paint', scale: 2, color: 0xe8e6de, surface: 'concrete' },
  paintYellow: { tex: 'paint', scale: 2, color: 0xe0b830, surface: 'concrete' },
  // rooms and fronts of the island's houses
  wallGreen: { tex: 'plaster', color: 0x7a9a7a, scale: 3, surface: 'concrete' },
  wallBlue: { tex: 'plaster', color: 0x7a96b4, scale: 3, surface: 'concrete' },
  wallWine: { tex: 'plaster', color: 0x96545a, scale: 3, surface: 'concrete' },
  wallMint: { tex: 'plaster', color: 0xc0e0d0, scale: 3, surface: 'concrete' },
  wallCream: { tex: 'plaster', color: 0xf6ecd0, scale: 3, surface: 'concrete' },
  wallNavy: { tex: 'plaster', color: 0x465878, scale: 3, surface: 'concrete' },
  parquet: { tex: 'wood', color: 0xd0a070, scale: 0.9, surface: 'wood', pen: 0.7 },
  carpetRed: { tex: 'fabric', color: 0x96383a, scale: 0.8, surface: 'wood', pen: 0.7 },
  carpetBlue: { tex: 'fabric', color: 0x405a80, scale: 0.8, surface: 'wood', pen: 0.7 },
  carpetGrey: { tex: 'fabric', color: 0x787c82, scale: 0.8, surface: 'wood', pen: 0.7 },
  carpetBeige: { tex: 'fabric', color: 0xc0b090, scale: 0.8, surface: 'wood', pen: 0.7 },
  tilesWhite: { tex: 'tiles', color: 0xf6f4ee, scale: 0.6, surface: 'concrete' },
  tilesBlue: { tex: 'tiles', color: 0x7ea8c8, scale: 0.6, surface: 'concrete' },
  tilesGreen: { tex: 'tiles', color: 0x8cbc9c, scale: 0.6, surface: 'concrete' },
  tilesCheck: { tex: 'tiles', color: 0xa0a09c, scale: 1.0, surface: 'concrete' },
  brickYellow: { tex: 'brick', color: 0xe6d29c, scale: 1.6, surface: 'concrete' },
  woodSiding: { tex: 'wood', color: 0xd4cab6, scale: 1.1, surface: 'wood', pen: 0.7 },
  woodBlue: { tex: 'wood', color: 0x7090a8, scale: 1.1, surface: 'wood', pen: 0.7 },
  woodRed: { tex: 'wood', color: 0xa85040, scale: 1.1, surface: 'wood', pen: 0.7 },
  roofSlate: { tex: 'rooftile', color: 0x78808a, scale: 2, surface: 'concrete' },
  roofGreen: { tex: 'rooftile', color: 0x789a8a, scale: 2, surface: 'concrete' },
  roofBrown: { tex: 'rooftile', color: 0xa87c60, scale: 2, surface: 'concrete' },
  metalWhite: { tex: 'metal', color: 0xe4e6e6, scale: 2, surface: 'metal', pen: 0.5 },
  fabricWhite: { tex: 'fabric', color: 0xece8de, scale: 1, surface: 'wood', pen: 1 },
  fabricDark: { tex: 'fabric', color: 0x404246, scale: 1, surface: 'wood', pen: 1 },
  hay: { tex: 'fabric', color: 0xd8bc64, scale: 0.8, surface: 'dirt', pen: 1 },
  chalk: { tex: 'paint', color: 0x2e4c3e, scale: 2, surface: 'concrete' },
  shutterRed: { tex: 'wood', color: 0x9a4a3c, scale: 0.8, surface: 'wood', pen: 0.8 },
  signs: { tex: 'signs', color: 0xffffff, scale: 1, surface: 'metal' },
};

export class MapBuilder {
  constructor(engine, texLib) {
    this.engine = engine;
    this.tex = texLib;
    this.q = engine.q;
    this.col = new CollisionWorld();
    this.parts = new Map(); // key "mat|cx|cz" -> geometries
    this.transparentParts = new Map();
    this.skirts = [];
    this.materials = {};
    this.tints = {};
    this.boxesForAO = [];
    this.glass = [];
    this.lights = [];
    this.root = new THREE.Group();
    this.root.name = 'map';
    this.chunk = 40; // meters per merged mesh
  }

  // Everything with the same texture shares a mesh per chunk: the tint goes into the vertices, not into a draw call of its own
  group(key) {
    const d = MATERIALS[key];
    if (!d) throw new Error('Unknown material ' + key);
    return d.tex && !d.emissive ? '~' + d.tex : key;
  }

  tint(g, key) {
    const d = MATERIALS[key];
    if (!d.tex || d.emissive) return g;
    const c = this.tints[key] || (this.tints[key] = new THREE.Color(d.color)), a = g.attributes.color.array;
    for (let i = 0; i < a.length; i += 3) { a[i] *= c.r; a[i + 1] *= c.g; a[i + 2] *= c.b; }
    return g;
  }

  material(key) {
    if (this.materials[key]) return this.materials[key];
    let m;
    if (key[0] === '~') m = new THREE.MeshLambertMaterial({ color: 0xffffff, map: this.tex.generate(key.slice(1)).map, vertexColors: true });
    else {
      const d = MATERIALS[key];
      if (!d) throw new Error('Unknown material ' + key);
      const t = d.tex ? this.tex.generate(d.tex) : null;
      m = new THREE.MeshLambertMaterial({ color: d.color, map: t ? t.map : null, vertexColors: true });
      if (d.emissive) { m.emissive = new THREE.Color(d.emissive); m.emissiveIntensity = d.emissiveIntensity || 1; }
    }
    this.materials[key] = m;
    return m;
  }

  _bucket(map, key, x, z) {
    const k = key + '|' + Math.floor(x / this.chunk) + '|' + Math.floor(z / this.chunk);
    let arr = map.get(k);
    if (!arr) { arr = []; map.set(k, arr); }
    return arr;
  }

  // Box from min/max corners. opts: collide, visual, ao, scale(uv), surface, pen
  box(x0, y0, z0, x1, y1, z1, mat, opts = {}) {
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (y0 > y1) [y0, y1] = [y1, y0];
    if (z0 > z1) [z0, z1] = [z1, z0];
    const d = MATERIALS[mat];
    if (opts.collide !== false) {
      this.col.add(x0, y0, z0, x1, y1, z1, opts.surface || d.surface, opts.pen ?? d.pen ?? 0, opts.noBullet);
    }
    if (opts.visual !== false) {
      const g = boxGeometry(x0, y0, z0, x1, y1, z1, opts.uvScale || d.scale || 2, opts.ao !== false, opts.faces);
      this._bucket(this.parts, this.group(mat), (x0 + x1) / 2, (z0 + z1) / 2).push(this.tint(g, mat));
      if (opts.ao !== false && opts.skirt !== false && (y1 - y0) > 0.25) this.boxesForAO.push([x0, y0, z0, x1, y1, z1]);
    }
    return this;
  }

  // Centered convenience: center x/z, size w (x) d (z), bottom y, height h
  boxC(cx, cz, w, d, y, h, mat, opts) { return this.box(cx - w / 2, y, cz - d / 2, cx + w / 2, y + h, cz + d / 2, mat, opts); }

  // Arbitrary (decorative) geometry already positioned in world space via matrix
  geom(geometry, mat, matrix, opts = {}) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (matrix) { g.applyMatrix4(matrix); if (matrix.determinant() < 0) flipWinding(g); }
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.color) {
      const c = new Float32Array(g.attributes.position.count * 3).fill(opts.shade ?? 1);
      g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    }
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3());
    if (opts.transparent) this._bucket(this.transparentParts, mat, c.x, c.z).push(g);
    else this._bucket(this.parts, this.group(mat), c.x, c.z).push(this.tint(g, mat));
    return this;
  }

  // Breakable glass pane (separate mesh so it can shatter)
  glassPane(x0, y0, z0, x1, y1, z1, tint = 0x9cc8d8) {
    const idx = this.col.add(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1), 'glass', 1);
    this.glass.push({ idx, box: [x0, y0, z0, x1, y1, z1], tint });
    return this;
  }

  // Proxy that mirrors everything across x = 0 (for symmetric map halves)
  mirrored() {
    const b = this, S = new THREE.Matrix4().makeScale(-1, 1, 1);
    return {
      box: (x0, y0, z0, x1, y1, z1, mat, opts) => b.box(-x1, y0, z0, -x0, y1, z1, mat, opts),
      boxC: (cx, cz, w, d, y, h, mat, opts) => b.boxC(-cx, cz, w, d, y, h, mat, opts),
      geom: (g, mat, mm, opts) => b.geom(g, mat, S.clone().multiply(mm || new THREE.Matrix4()), opts),
      glassPane: (x0, y0, z0, x1, y1, z1, t) => b.glassPane(-x1, y0, z0, -x0, y1, z1, t),
      pointLight: (x, y, z, c, i, d) => b.pointLight(-x, y, z, c, i, d),
      mirrored: () => b,
    };
  }
  // Proxy that mirrors everything across z = 0
  mirroredZ() {
    const b = this, S = new THREE.Matrix4().makeScale(1, 1, -1);
    return {
      box: (x0, y0, z0, x1, y1, z1, mat, opts) => b.box(x0, y0, -z1, x1, y1, -z0, mat, opts),
      boxC: (cx, cz, w, d, y, h, mat, opts) => b.boxC(cx, -cz, w, d, y, h, mat, opts),
      geom: (g, mat, mm, opts) => b.geom(g, mat, S.clone().multiply(mm || new THREE.Matrix4()), opts),
      glassPane: (x0, y0, z0, x1, y1, z1, t) => b.glassPane(x0, y0, -z1, x1, y1, -z0, t),
      pointLight: (x, y, z, c, i, d) => b.pointLight(x, y, -z, c, i, d),
      mirroredZ: () => b,
    };
  }

  pointLight(x, y, z, color = 0xffe0b0, intensity = 4, dist = 12) {
    this.lights.push({ x, y, z, color, intensity, dist });
  }

  finalize(scene) {
    this.col.build();
    // AO skirts: soft dark gradient on the floor around boxes that rest on something
    const skirtGeo = this.buildSkirts();
    for (const [k, list] of this.parts) {
      const [mat] = k.split('|');
      const geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!geo) continue;
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.material(mat));
      mesh.castShadow = this.q.shadows > 0 && (mat[0] === '~' || !MATERIALS[mat].emissive);
      mesh.receiveShadow = this.q.shadows > 0;
      mesh.matrixAutoUpdate = false;
      this.root.add(mesh);
    }
    for (const [k, list] of this.transparentParts) {
      const [mat] = k.split('|');
      const geo = mergeGeometries(list, false);
      const m = this.material(mat).clone();
      m.transparent = true; m.opacity = 0.85; m.depthWrite = false;
      const mesh = new THREE.Mesh(geo, m);
      mesh.matrixAutoUpdate = false;
      this.root.add(mesh);
    }
    if (skirtGeo) {
      const m = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, vertexColors: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      m.onBeforeCompile = (s) => { // use vertex color .r as alpha
        s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', 'diffuseColor.a *= vColor.r; diffuseColor.rgb = vec3(0.0);');
      };
      const mesh = new THREE.Mesh(skirtGeo, m);
      mesh.renderOrder = 1; mesh.matrixAutoUpdate = false;
      this.root.add(mesh);
    }
    // glass panes
    this.glassMeshes = [];
    const gmat = new THREE.MeshLambertMaterial({ color: 0xa8d0dc, transparent: true, opacity: 0.32, depthWrite: false });
    for (const g of this.glass) {
      const [x0, y0, z0, x1, y1, z1] = g.box;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), gmat);
      mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      mesh.updateMatrix(); mesh.matrixAutoUpdate = false;
      mesh.userData.glassIdx = g.idx;
      this.root.add(mesh);
      this.glassMeshes.push(mesh);
    }
    // a few real point lights only on higher quality (they are expensive with forward rendering)
    if (this.q.standard) {
      const maxLights = this.q.shadows >= 4096 ? 8 : 4;
      const sorted = [...this.lights].sort((p, q) => q.intensity - p.intensity);
      for (const L of sorted.slice(0, maxLights)) {
        const pl = new THREE.PointLight(L.color, L.intensity, L.dist, 2);
        pl.position.set(L.x, L.y, L.z);
        this.root.add(pl);
      }
    }
    scene.add(this.root);
    this.parts.clear(); this.transparentParts.clear();
    return this.col;
  }

  buildSkirts() {
    const col = this.col, W = 0.55;
    const pos = [], colr = [];
    const quad = (ax, az, bx, bz, cx, cz, dx, dz, y, ia, ib) => {
      // a,b inner (dark) c,d outer
      pos.push(ax, y, az, bx, y, bz, cx, y, cz, ax, y, az, cx, y, cz, dx, y, dz);
      colr.push(ia, ia, ia, ib, ib, ib, 0, 0, 0, ia, ia, ia, 0, 0, 0, 0, 0, 0);
    };
    for (const [x0, y0, z0, x1, y1, z1] of this.boxesForAO) {
      const fl = col.floorBelow((x0 + x1) / 2, (z0 + z1) / 2, 0.01, y0 + 0.02, y0 - 0.3);
      if (Math.abs(fl - y0) > 0.03) continue;
      const y = y0 + 0.012, a = 0.42;
      quad(x0, z1, x1, z1, x1 + W * 0.3, z1 + W, x0 - W * 0.3, z1 + W, y, a, a);
      quad(x1, z0, x0, z0, x0 - W * 0.3, z0 - W, x1 + W * 0.3, z0 - W, y, a, a);
      quad(x1, z1, x1, z0, x1 + W, z0 - W * 0.3, x1 + W, z1 + W * 0.3, y, a, a);
      quad(x0, z0, x0, z1, x0 - W, z1 + W * 0.3, x0 - W, z0 - W * 0.3, y, a, a);
    }
    if (!pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    g.computeVertexNormals();
    return g;
  }
}

function flipWinding(g) {
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name], n = a.itemSize, arr = a.array;
    for (let i = 0; i < a.count; i += 3) {
      for (let k = 0; k < n; k++) { const t = arr[(i + 1) * n + k]; arr[(i + 1) * n + k] = arr[(i + 2) * n + k]; arr[(i + 2) * n + k] = t; }
    }
  }
}

// ---------------------------------------------------------------------------
// Box geometry with world-space UVs and baked vertical AO gradient.
// faces: optional string of faces to include e.g. "+x-x+y-y+z-z"
// ---------------------------------------------------------------------------
export function boxGeometry(x0, y0, z0, x1, y1, z1, uvScale, ao = true, faces) {
  const P = [], N = [], U = [], C = [];
  const s = 1 / uvScale;
  const h = y1 - y0;
  const aoAt = (y) => {
    if (!ao) return 1;
    const t = (y - y0);
    if (t <= 0.001) return 0.62;
    if (t < 0.55) return 0.62 + (t / 0.55) * 0.3;
    return 1;
  };
  // rows for vertical faces (extra ring near the bottom for the AO gradient)
  const rows = ao && h > 0.8 ? [y0, y0 + 0.55, y1] : [y0, y1];
  const want = (f) => !faces || faces.includes(f);
  const pushQuad = (a, b, c, d, n, ua, ub, uc, ud, ca, cb, cc, cd) => {
    P.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) N.push(...n);
    U.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud);
    C.push(ca, ca, ca, cb, cb, cb, cc, cc, cc, ca, ca, ca, cc, cc, cc, cd, cd, cd);
  };
  for (let r = 0; r < rows.length - 1; r++) {
    const ya = rows[r], yb = rows[r + 1], ca = aoAt(ya), cb = aoAt(yb);
    // +X
    if (want('+x')) pushQuad([x1, ya, z1], [x1, ya, z0], [x1, yb, z0], [x1, yb, z1], [1, 0, 0],
      [-z1 * s, ya * s], [-z0 * s, ya * s], [-z0 * s, yb * s], [-z1 * s, yb * s], ca, ca, cb, cb);
    // -X
    if (want('-x')) pushQuad([x0, ya, z0], [x0, ya, z1], [x0, yb, z1], [x0, yb, z0], [-1, 0, 0],
      [z0 * s, ya * s], [z1 * s, ya * s], [z1 * s, yb * s], [z0 * s, yb * s], ca, ca, cb, cb);
    // +Z
    if (want('+z')) pushQuad([x0, ya, z1], [x1, ya, z1], [x1, yb, z1], [x0, yb, z1], [0, 0, 1],
      [x0 * s, ya * s], [x1 * s, ya * s], [x1 * s, yb * s], [x0 * s, yb * s], ca, ca, cb, cb);
    // -Z
    if (want('-z')) pushQuad([x1, ya, z0], [x0, ya, z0], [x0, yb, z0], [x1, yb, z0], [0, 0, -1],
      [-x1 * s, ya * s], [-x0 * s, ya * s], [-x0 * s, yb * s], [-x1 * s, yb * s], ca, ca, cb, cb);
  }
  // +Y
  if (want('+y')) pushQuad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0],
    [x0 * s, -z1 * s], [x1 * s, -z1 * s], [x1 * s, -z0 * s], [x0 * s, -z0 * s], 1, 1, 1, 1);
  // -Y
  if (want('-y')) pushQuad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0],
    [x0 * s, z0 * s], [x1 * s, z0 * s], [x1 * s, z1 * s], [x0 * s, z1 * s], 0.85, 0.85, 0.85, 0.85);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return g;
}
