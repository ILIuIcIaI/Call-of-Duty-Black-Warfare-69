import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WEAPONS, OPTICS, PRIMARIES, SECONDARIES } from '../weapons/defs.js';
import { buildWeapon, weaponMaterials, buildPlate } from '../weapons/models.js';

// =============================================================================
// Warzone loot. Weapons and optics are rolled completely independently, so a
// pistol with the strongest sniper scope is a perfectly normal find. Rarity makes
// the gun itself better. Chests throw out their content; everything can be picked up.
// =============================================================================
export const RARITY = [
  { id: 'common', name: 'GEWÖHNLICH', color: '#c8ccd0', hex: 0xc8ccd0, dmg: 1, mag: 1, reload: 1, recoil: 1, perk: 'Standardausführung' },
  { id: 'uncommon', name: 'UNGEWÖHNLICH', color: '#5cd868', hex: 0x5cd868, dmg: 1.05, mag: 1.1, reload: 0.95, recoil: 0.95, perk: '+5 % Schaden · +10 % Magazin' },
  { id: 'rare', name: 'SELTEN', color: '#4aa8ff', hex: 0x4aa8ff, dmg: 1.1, mag: 1.2, reload: 0.9, recoil: 0.9, perk: '+10 % Schaden · +20 % Magazin · schneller nachladen' },
  { id: 'epic', name: 'EPISCH', color: '#c868ff', hex: 0xc868ff, dmg: 1.15, mag: 1.35, reload: 0.85, recoil: 0.85, perk: '+15 % Schaden · +35 % Magazin · weniger Rückstoß' },
  { id: 'legendary', name: 'LEGENDÄR', color: '#ffb02a', hex: 0xffb02a, dmg: 1.22, mag: 1.5, reload: 0.78, recoil: 0.78, perk: '+22 % Schaden · +50 % Magazin · alles besser' },
];
export const MAX_PLATES = 5;
export const PLATE_ARMOR = 50, MAX_ARMOR = 150;

const ALL_WEAPONS = [...PRIMARIES, ...SECONDARIES];
const ALL_OPTICS = Object.keys(OPTICS);
const roll = (w) => { let r = Math.random() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; } return 0; };
const FLOOR_ODDS = [40, 30, 18, 9, 3], CHEST_ODDS = [14, 28, 30, 20, 8];
const CHESTS = 170, ITEMS = 280; // on the whole island
const SEEN = 14; // from how far what you look at tells you what it is
// how something thrown away flies, against everything solid, and how far from any wall it comes to rest
const TOSS_G = 15, TOSS_R = 0.14, TOSS_BOUNCE = 0.35, TOSS_RUB = 0.6, TOSS_FRAMES = 240, REST_R = 0.42, REST_RISE = 0.3;
const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _hit = {};

// a weapon with its rarity worked into the numbers
export function makeWeaponDef(id, rarity = 0) {
  const base = WEAPONS[id], R = RARITY[rarity];
  if (!rarity) return base;
  const def = Object.create(base);
  def.rarity = rarity;
  def.damage = [base.damage[0] * R.dmg, base.damage[1] * R.dmg];
  def.mag = Math.round(base.mag * R.mag);
  def.reload = base.reload * R.reload; def.reloadEmpty = base.reloadEmpty * R.reload;
  def.recoil = { ...base.recoil, up: base.recoil.up * R.recoil, side: base.recoil.side * R.recoil };
  return def;
}

export function rollWeapon(odds) {
  const weaponId = ALL_WEAPONS[(Math.random() * ALL_WEAPONS.length) | 0];
  const optic = ALL_OPTICS[(Math.random() * ALL_OPTICS.length) | 0];
  return { kind: 'weapon', weaponId, optic, rarity: roll(odds) };
}

const mats = {
  chest: new THREE.MeshLambertMaterial({ vertexColors: true }),
  ammo: new THREE.MeshLambertMaterial({ color: 0x6a6238 }),
  ammoTop: new THREE.MeshLambertMaterial({ color: 0xc8b060 }),
};
let beamTex = null;
function beamTexture() {
  if (beamTex) return beamTex;
  const c = document.createElement('canvas'); c.width = 32; c.height = 128;
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.75)'); g.addColorStop(0.45, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 128);
  const e = x.createLinearGradient(0, 0, 32, 0);
  e.addColorStop(0, 'rgba(0,0,0,1)'); e.addColorStop(0.5, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(0,0,0,1)');
  x.globalCompositeOperation = 'destination-out'; x.fillStyle = e; x.fillRect(0, 0, 32, 128);
  beamTex = new THREE.CanvasTexture(c);
  return beamTex;
}
const beamGeo = new THREE.PlaneGeometry(0.9, 3.2).translate(0, 1.6, 0);
const beamMats = new Map();
function beamMat(hex) {
  if (!beamMats.has(hex)) beamMats.set(hex, new THREE.MeshBasicMaterial({ color: hex, map: beamTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  return beamMats.get(hex);
}

// many boxes, one mesh
function boxes(list) {
  const col = new THREE.Color();
  const parts = list.map(([w, h, d, x, y, z, hex]) => {
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z), n = g.attributes.position.count, c = new Float32Array(n * 3);
    col.set(hex);
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  });
  return mergeGeometries(parts);
}
// what is being looked at gets a line around it in its color: its own surface a little further out, seen from behind
const outlineMats = new Map();
function outlineMat(hex) {
  if (!outlineMats.has(hex)) {
    const m = new THREE.MeshBasicMaterial({ color: hex, side: THREE.BackSide, fog: false });
    m.onBeforeCompile = (s) => { s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normalize(normal) * 0.011;'); };
    outlineMats.set(hex, m);
  }
  return outlineMats.get(hex);
}
const OLIVE = 0x4f5a42, OLIVE2 = 0x5d6950, STEEL = 0x24262a, BRASS = 0xd8ae48, STENCIL = 0xc9b45a;
let chestGeo = null;
function chestMesh() {
  if (!chestGeo) chestGeo = {
    body: boxes([
      [1.1, 0.46, 0.62, 0, 0.23, 0, OLIVE],
      [0.08, 0.48, 0.64, -0.42, 0.24, 0, STEEL], [0.08, 0.48, 0.64, 0.42, 0.24, 0, STEEL],
      [1.12, 0.05, 0.64, 0, 0.025, 0, STEEL],
      [0.46, 0.05, 0.01, 0, 0.27, 0.315, STENCIL], [0.28, 0.05, 0.01, 0, 0.17, 0.315, STENCIL],
      [0.03, 0.05, 0.22, -0.57, 0.3, 0, STEEL], [0.03, 0.05, 0.22, 0.57, 0.3, 0, STEEL],
    ]),
    lid: boxes([
      [1.12, 0.18, 0.64, 0, 0.09, 0.32, OLIVE2],
      [0.08, 0.2, 0.66, -0.42, 0.09, 0.32, STEEL], [0.08, 0.2, 0.66, 0.42, 0.09, 0.32, STEEL],
      [0.16, 0.14, 0.03, 0, 0, 0.645, BRASS],
    ]),
  };
  const g = new THREE.Group();
  g.add(new THREE.Mesh(chestGeo.body, mats.chest));
  const lid = new THREE.Mesh(chestGeo.lid, mats.chest); lid.position.set(0, 0.46, -0.31); g.add(lid);
  return { g, lid };
}

// a whole gun as one mesh per material: lying around in the dozens, it must not cost dozens of draw calls each
function bake(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), M = new THREE.Matrix4(), byMat = new Map(), out = new THREE.Group();
  const shown = (o) => { for (let q = o; q && q !== root; q = q.parent) if (!q.visible) return false; return true; };
  root.traverse((o) => {
    if (!o.isMesh || !shown(o) || Array.isArray(o.material)) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(M.multiplyMatrices(inv, o.matrixWorld));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
  });
  for (const [mat, list] of byMat) out.add(new THREE.Mesh(list.length > 1 ? mergeGeometries(list) : list[0], mat));
  return out;
}

export class Loot {
  constructor(game, def) {
    this.game = game;
    this.items = [];
    this.chests = [];
    this.protos = new Map();
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.root.traverse((o) => o.layers.set(2));
    this.queue = [];
    this.near = [];
    this.scanT = 0;
    this.time = 0;
    this.buildsThisFrame = 0;
    this.scatter(def);
  }

  // where things lie: chests in rooms and yards, single items on floors and in the open
  scatter(def) {
    const col = this.game.col, t = def.terrain;
    const spots = def.layout.spots.filter((s) => {
      if (s.ground) { s.y = t.heightAt(s.x, s.z); const f = col.floorBelow(s.x, s.z, 0.2, s.y + 1.2, s.y - 1); if (isFinite(f)) s.y = f; }
      return !col.overlaps(s.x - 0.3, s.y + 0.05, s.z - 0.3, s.x + 0.3, s.y + 1.0, s.z + 0.3);
    });
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const rooms = shuffle(spots.filter((s) => s.kind === 'room')), floors = shuffle(spots.filter((s) => s.kind !== 'room'));
    const nChests = Math.min(rooms.length, CHESTS), nItems = Math.min(floors.length + rooms.length - nChests, ITEMS);
    const used = [];
    const farEnough = (s, r) => !used.some((u) => (u.x - s.x) ** 2 + (u.z - s.z) ** 2 + (u.y - s.y) ** 2 < r * r);
    // whoever lands on a house finds a chest in it, the rest is spread at random
    const stocked = new Set();
    for (const s of rooms) {
      if (stocked.has(s.house)) continue;
      stocked.add(s.house); used.push(s); this.addChest(s);
    }
    for (const s of rooms) {
      if (this.chests.length >= nChests) break;
      if (used.includes(s) || !farEnough(s, 6)) continue;
      used.push(s); this.addChest(s);
    }
    const rest = shuffle([...floors, ...rooms.filter((s) => !used.includes(s))]);
    let n = 0;
    for (const s of rest) {
      if (n >= nItems) break;
      if (!farEnough(s, 2.5)) continue;
      used.push(s); n++;
      const r = Math.random();
      if (r < 0.27) this.addItem({ kind: 'ammo' }, s.x, s.y, s.z);
      else if (r < 0.47) this.addItem({ kind: 'plate', count: 1 }, s.x, s.y, s.z);
      else this.addItem(rollWeapon(FLOOR_ODDS), s.x, s.y, s.z);
    }
  }

  addChest(s) {
    this.chests.push({ x: s.x, y: s.y, z: s.z, yaw: Math.floor(Math.random() * 4) * Math.PI / 2, open: false, openT: 0, obj: null, lid: null, claimed: null });
  }

  addItem(data, x, y, z) {
    const it = { ...data, x, y, z, gy: y, taken: false, obj: null, spin: Math.random() * 6, arc: null, claimed: null };
    this.items.push(it);
    return it;
  }

  // chest content: always a weapon, usually plates, often a second gun or ammo
  openChest(c, who) {
    if (c.open) return;
    c.open = true; c.openT = 0;
    this.game.audio.play('coverOpen', { pos: new THREE.Vector3(c.x, c.y, c.z), vol: 0.9, maxDist: 45 });
    this.game.audio.play('magDrop', { pos: new THREE.Vector3(c.x, c.y, c.z), vol: 0.5, maxDist: 45, delay: 0.1 });
    const list = [rollWeapon(CHEST_ODDS)];
    if (Math.random() < 0.3) list.push(rollWeapon(CHEST_ODDS));
    if (Math.random() < 0.75) list.push({ kind: 'plate', count: 1 + (Math.random() < 0.4 ? 1 : 0) });
    list.push({ kind: 'ammo' });
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    const col = this.game.col;
    list.forEach((d, i) => {
      const a = (i - (list.length - 1) / 2) * 0.7, r = 1.25 + Math.random() * 0.45;
      let tx = c.x + (fx * Math.cos(a) + fz * Math.sin(a)) * r, tz = c.z + (fz * Math.cos(a) - fx * Math.sin(a)) * r;
      // never into a wall: fall back to right next to the chest
      if (!col.lineClear(c.x, c.y + 0.6, c.z, tx, c.y + 0.6, tz)) { tx = c.x + (tx - c.x) * 0.45; tz = c.z + (tz - c.z) * 0.45; }
      const fy = col.floorBelow(tx, tz, 0.1, c.y + 0.7, c.y - 3);
      const it = this.addItem(d, tx, isFinite(fy) ? fy : c.y, tz);
      it.arc = { t: -0.12 * i - 0.12, dur: 0.42, sx: c.x, sy: c.y + 0.6, sz: c.z };
    });
    void who;
  }

  // What a dead bot leaves behind, and what you throw away when you take something else (yaw: the way you look).
  // It flies, bounces off whatever is in the way and comes to rest where it can be picked up.
  drop(data, x, y, z, yaw) {
    const s = this.tossFrom(x, y, z, yaw), A = this.flight(s[0], s[1], s[2], s[3], s[4], s[5]), it = this.addItem(data, A.x, A.y, A.z);
    it.arc = A;
    return it;
  }

  // from hand height (or what a low ceiling leaves of it), the way you look or just anywhere when it falls out of a body
  tossFrom(x, y, z, yaw) {
    const up = this.game.col.raycast(x, y + 0.2, z, 0, 1, 0, 0.8, _hit), sy = up ? y + 0.2 + Math.max(0, up.t - 0.2) : y + 1;
    const mine = yaw !== undefined, a = mine ? yaw + (Math.random() - 0.5) * 0.5 : Math.random() * 6.28, sp = mine ? 2.2 + Math.random() * 0.6 : 0.8 + Math.random() * 1.8;
    return [x, sy, z, -Math.sin(a) * sp, (mine ? 1.6 : 2.2) + Math.random() * 0.7, -Math.cos(a) * sp];
  }

  // Where something thrown ends up: off whatever is in the way, frame by frame, down to where it can be reached.
  // All of it worked out at once, so it is known right away where it will lie. The model just flies along (flyItem).
  flight(x, y, z, vx, vy, vz) {
    const col = this.game.col, p = _p.set(x, y, z), path = [], hits = [], dt = 1 / 60;
    col.pushOutSphere(p, TOSS_R);
    path.push(p.x, p.y, p.z);
    for (let i = 1; i < TOSS_FRAMES; i++) {
      vy -= TOSS_G * dt;
      // (a ray first: nothing is thin enough to fall through at any speed)
      const sp = Math.hypot(vx, vy, vz), ray = sp > 1e-3 ? col.raycast(p.x, p.y, p.z, vx / sp, vy / sp, vz / sp, sp * dt, _hit) : null;
      if (ray) p.set(ray.x + ray.nx * 0.01, ray.y + ray.ny * 0.01, ray.z + ray.nz * 0.01);
      else p.set(p.x + vx * dt, p.y + vy * dt, p.z + vz * dt);
      _q.copy(p);
      col.pushOutSphere(p, TOSS_R);
      let nx = p.x - _q.x, ny = p.y - _q.y, nz = p.z - _q.z;
      const d = Math.hypot(nx, ny, nz);
      if (ray) { nx = ray.nx; ny = ray.ny; nz = ray.nz; } else if (d > 1e-5) { nx /= d; ny /= d; nz /= d; }
      path.push(p.x, p.y, p.z);
      if (!ray && d <= 1e-5) continue;
      // what goes into the surface comes back with a third of it, what runs along it rubs off
      const vn = vx * nx + vy * ny + vz * nz;
      if (vn < 0) {
        vx = (vx - vn * nx) * TOSS_RUB - vn * TOSS_BOUNCE * nx;
        vy = (vy - vn * ny) * TOSS_RUB - vn * TOSS_BOUNCE * ny;
        vz = (vz - vn * nz) * TOSS_RUB - vn * TOSS_BOUNCE * nz;
        if (vn < -1.1) hits.push(i, -vn);
      }
      if (ny > 0.5 && Math.hypot(vx, vy, vz) < 0.9) break;
    }
    // where it floats from now on: on something, with room to turn around itself
    const fy = col.floorBelow(p.x, p.z, 0.1, p.y + 0.02, p.y - 40), floor = isFinite(fy) ? fy : p.y - TOSS_R;
    _q.copy(p);
    for (let i = 0; i < 3; i++) if (!col.pushOutCircle(_q, REST_R, floor + 0.2, floor + 1)) break;
    let gy = col.floorBelow(_q.x, _q.z, 0.1, floor + 0.3, floor - 3);
    // (pushed over an edge or through something: then it stays where it came down)
    if (!isFinite(gy) || gy < floor - 0.4 || !col.lineClear(p.x, floor + 0.5, p.z, _q.x, floor + 0.5, _q.z)) { _q.copy(p); gy = floor; }
    return { t: 0, path, hits, hit: 0, x: _q.x, y: gy, z: _q.z };
  }

  // on the way: it tumbles, is heard where it hits, and floats up to its place at the end
  flyItem(it, dt) {
    const A = it.arc, P = A.path, s = (A.t += dt) * 60, last = P.length / 3 - 1, end = last + REST_RISE * 60;
    while (A.hit < A.hits.length && A.hits[A.hit] <= s) {
      const i = A.hits[A.hit] * 3, v = A.hits[A.hit + 1]; A.hit += 2;
      this.game.audio.play('magDrop', { pos: new THREE.Vector3(P[i], P[i + 1], P[i + 2]), vol: Math.min(0.9, 0.25 + v * 0.12), rate: 0.75 + Math.random() * 0.2, maxDist: 35 });
    }
    const U = it.obj && it.obj.userData;
    if (s >= end) {
      it.arc = null;
      if (it.obj) { it.obj.position.set(it.x, it.y + 0.45, it.z); U.spin.rotation.x = U.spin.rotation.z = 0; }
      return;
    }
    if (!it.obj) return;
    if (s < last) {
      const i = Math.floor(s), f = s - i, a = i * 3;
      it.obj.position.set(P[a] + (P[a + 3] - P[a]) * f, P[a + 1] + (P[a + 4] - P[a + 1]) * f, P[a + 2] + (P[a + 5] - P[a + 2]) * f);
    } else {
      const k = (s - last) / (end - last), e = k * k * (3 - 2 * k), a = last * 3;
      it.obj.position.set(P[a] + (it.x - P[a]) * e, P[a + 1] + (it.y + 0.45 - P[a + 1]) * e, P[a + 2] + (it.z - P[a + 2]) * e);
    }
    const left = 1 - s / end;
    it.spin += dt * 7 * left;
    U.spin.rotation.x = Math.sin(A.t * 9 + it.spin) * 0.8 * left;
    U.spin.rotation.z = Math.cos(A.t * 11) * 0.7 * left;
  }

  proto(it) {
    const p = this.protos.get(it.weaponId + '|' + it.optic);
    if (p) return p;
    if (this.buildsThisFrame > 0) return null; // one new model per frame keeps walking into town smooth
    this.buildsThisFrame++;
    return this.buildProto(it);
  }
  buildProto(it) {
    const key = it.weaponId + '|' + it.optic;
    if (this.protos.has(key)) return this.protos.get(key);
    const w = buildWeapon(WEAPONS[it.weaponId].model, it.optic, weaponMaterials(this.game.tex));
    w.root.traverse((o) => { if (o.material && o.material.isMeshBasicMaterial && !o.material.map) o.visible = false; });
    const root = bake(w.root), p = { root, center: new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3()) };
    this.protos.set(key, p);
    return p;
  }

  itemVisual(it) {
    const g = new THREE.Group();
    let hex = 0xffffff, body = null;
    if (it.kind === 'weapon') {
      const p = this.proto(it);
      if (!p) return null;
      body = p.root.clone(true);
      body.position.copy(p.center).negate();
      const holder = new THREE.Group(); holder.add(body); holder.scale.setScalar(WEAPONS[it.weaponId].slot === 'secondary' ? 1.5 : 1);
      g.add(holder); g.userData.spin = holder;
      hex = RARITY[it.rarity].hex;
    } else if (it.kind === 'plate') {
      const h = new THREE.Group(); h.add(buildPlate());
      g.add(h); g.userData.spin = h; hex = 0x46c8e0;
    } else {
      const h = new THREE.Group();
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.2), mats.ammo); h.add(a);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.16), mats.ammoTop); b.position.y = 0.12; h.add(b);
      g.add(h); g.userData.spin = h; hex = 0xe8d890;
    }
    const beam = new THREE.Mesh(beamGeo, beamMat(hex)); beam.position.y = -0.35; g.add(beam); g.userData.beam = beam;
    g.traverse((o) => o.layers.set(2));
    this.root.add(g);
    return g;
  }

  // what the thing looks like on its own, for the picture on the card
  model(o, kind) {
    if (kind === 'chest') return chestMesh().g;
    if (o.kind === 'weapon') { const p = this.proto(o) || this.buildProto(o); const r = p.root.clone(true); r.position.copy(p.center).negate(); const h = new THREE.Group(); h.add(r); return h; }
    if (o.kind === 'plate') return buildPlate();
    const h = new THREE.Group();
    h.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.2), mats.ammo));
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.16), mats.ammoTop); b.position.y = 0.12; h.add(b);
    return h;
  }

  // the line around what is being looked at
  highlight(o, kind) {
    if (this.lit === o) return;
    if (this.lit && this.lit.obj && this.lit.obj.userData.hulls) for (const h of this.lit.obj.userData.hulls) h.visible = false;
    this.lit = o && o.obj ? o : null;
    if (!this.lit) return;
    const U = o.obj.userData;
    if (!U.hulls) {
      const hex = kind === 'chest' ? 0xd8ae48 : o.kind === 'weapon' ? RARITY[o.rarity].hex : o.kind === 'plate' ? 0x46c8e0 : 0xe8d890, meshes = [];
      o.obj.traverse((m) => { if (m.isMesh && m !== U.beam) meshes.push(m); });
      U.hulls = meshes.map((m) => { const h = new THREE.Mesh(m.geometry, outlineMat(hex)); h.layers.set(2); m.add(h); return h; });
    }
    for (const h of U.hulls) h.visible = true;
  }

  removeItem(it) {
    it.taken = true;
    if (it.obj) { this.root.remove(it.obj); it.obj = null; }
    const i = this.near.indexOf(it); if (i >= 0) this.near.splice(i, 1);
  }

  update(dt) {
    this.time += dt; this.buildsThisFrame = 0;
    const cam = this.game.engine.camera, cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
    this.scanT -= dt;
    const scan = this.scanT <= 0;
    if (scan) this.scanT = 0.25;
    if (scan) {
      for (const c of this.chests) {
        const d2 = (c.x - cx) ** 2 + (c.y - cy) ** 2 + (c.z - cz) ** 2;
        const show = d2 < 80 * 80;
        if (show && !c.obj) {
          const m = chestMesh(); c.obj = m.g; c.lid = m.lid;
          m.g.position.set(c.x, c.y, c.z); m.g.rotation.y = c.yaw;
          m.g.traverse((o) => o.layers.set(2));
          this.root.add(m.g);
          if (c.open) c.lid.rotation.x = -1.9;
        } else if (!show && c.obj) { this.root.remove(c.obj); c.obj = null; c.lid = null; }
      }
      this.queue.length = 0;
      for (const it of this.items) {
        if (it.taken) continue;
        const d2 = (it.x - cx) ** 2 + (it.y - cy) ** 2 + (it.z - cz) ** 2;
        const show = d2 < 60 * 60;
        if (show && !it.obj) { it.dist2 = d2; this.queue.push(it); }
        else if (!show && it.obj) { this.root.remove(it.obj); it.obj = null; }
      }
      this.queue.sort((a, b) => a.dist2 - b.dist2);
    }
    // what's close comes first; one model has to be built per frame at most
    while (this.queue.length) {
      const it = this.queue[0];
      if (!it.taken) { it.obj = this.itemVisual(it); if (!it.obj) break; it.obj.position.set(it.x, it.y + 0.45, it.z); }
      this.queue.shift();
    }
    for (const c of this.chests) if (c.open && c.openT < 1 && c.obj) {
      c.openT = Math.min(1, c.openT + dt / 0.35);
      const k = 1 - (1 - c.openT) ** 3;
      c.lid.rotation.x = -1.9 * k;
    }
    for (const it of this.items) {
      if (it.taken) continue;
      if (it.arc && it.arc.path) this.flyItem(it, dt);
      else if (it.arc) {
        it.arc.t += dt;
        const k = Math.max(0, Math.min(1, it.arc.t / it.arc.dur));
        if (it.obj) it.obj.position.set(it.arc.sx + (it.x - it.arc.sx) * k, it.arc.sy + (it.y + 0.45 - it.arc.sy) * k + Math.sin(k * Math.PI) * 0.9, it.arc.sz + (it.z - it.arc.sz) * k);
        if (k >= 1) it.arc = null;
      }
      if (!it.obj) continue;
      if (!it.arc) it.obj.position.y = it.y + 0.45 + Math.sin(this.time * 2 + it.spin) * 0.04;
      it.spin += dt * 0.9;
      it.obj.userData.spin.rotation.y = it.spin;
      const b = it.obj.userData.beam;
      if (b) { b.rotation.y = Math.atan2(cx - it.x, cz - it.z); b.visible = !(it.arc && it.arc.path); }
    }
    // hide what's finished for good
    if (scan) this.items = this.items.filter((i) => !i.taken);
  }

  // What the player is really looking at, as in Warzone: how big it is in the view decides how exactly it has to be
  // looked at, what already has the card keeps it a little longer. far: seen, but out of reach (its name, nothing more).
  focus(eye, fwd, keep = null) {
    let best = null, bs = Infinity;
    const col = this.game.col;
    const test = (o, kind, reach, y) => {
      const dx = o.x - eye.x, dy = y - eye.y, dz = o.z - eye.z, d = Math.hypot(dx, dy, dz);
      if (d > SEEN) return;
      const a = d > 1e-3 ? Math.acos(Math.max(-1, Math.min(1, (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d))) : 0;
      const lim = Math.max(0.055, Math.atan2(d > reach ? 0.36 : 0.56, d)) * (o === keep ? 1.35 : 1);
      if (a > lim) return;
      const s = a / lim + d * 0.04;
      if (s < bs && col.lineClear(eye.x, eye.y, eye.z, o.x, y + 0.05, o.z)) { bs = s; best = { o, kind, far: d > reach }; }
    };
    for (const it of this.items) if (!it.taken && !it.arc && Math.abs(it.x - eye.x) < SEEN && Math.abs(it.z - eye.z) < SEEN) test(it, 'item', 2.8, it.y + 0.45);
    for (const c of this.chests) if (!c.open && Math.abs(c.x - eye.x) < SEEN && Math.abs(c.z - eye.z) < SEEN) test(c, 'chest', 3.0, c.y + 0.55);
    return best;
  }

  // bots: the closest thing worth walking to
  nearestFor(bot, range, wants) {
    let best = null, bd = range * range;
    const px = bot.pos.x, py = bot.pos.y, pz = bot.pos.z;
    for (const c of this.chests) {
      if (c.open || c.noPath || (c.claimed && c.claimed !== bot && c.claimed.alive && c.claimed.lootGoal && c.claimed.lootGoal.o === c)) continue;
      const d = (c.x - px) ** 2 + (c.z - pz) ** 2 + (c.y - py) ** 2 * 6;
      if (d < bd) { bd = d; best = { o: c, kind: 'chest' }; }
    }
    for (const it of this.items) {
      if (it.taken || it.arc || (it.claimed && it.claimed !== bot && it.claimed.alive && it.claimed.lootGoal && it.claimed.lootGoal.o === it)) continue;
      if (!wants(it)) continue;
      const d = (it.x - px) ** 2 + (it.z - pz) ** 2 + (it.y - py) ** 2 * 6;
      if (d < bd) { bd = d; best = { o: it, kind: 'item' }; }
    }
    return best;
  }

  dispose() {
    this.game.scene.remove(this.root);
    this.items = []; this.chests = [];
  }
}
