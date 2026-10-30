import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { projectUV } from '../world/textures.js';
import { clamp, damp, angleDiff } from '../core/math.js';

// =============================================================================
// Drivable vehicles: three cars and two off-roaders. Arcade handling (it should
// feel good, not realistic): engine, brakes, grip that lets go under the handbrake,
// suspension from four ground samples, body roll and dive, spinning and steering
// wheels, opening doors, brake lights, exhaust and dust.
// Vehicle space: -Z = front, +Y up, +X right. Origin on the ground between the axles.
// =============================================================================
const G = 19.5;

export const VEHICLE_TYPES = {
  hatch: { name: 'KLEINWAGEN', len: 3.7, wid: 1.68, h: 1.46, wb: 2.4, track: 1.42, wheelR: 0.3, ride: 0.0, top: 34, accel: 9.5, brake: 20, rev: 11, steer: 0.62, grip: 6.6, hp: 280, seat: [-0.36, 0.34, 0.1], eye: 1.14, paint: [0xb03a2c, 0x2e6e8a, 0xd8b440] },
  sedan: { name: 'LIMOUSINE', len: 4.5, wid: 1.8, h: 1.42, wb: 2.75, track: 1.52, wheelR: 0.32, ride: 0.0, top: 42, accel: 10.5, brake: 21, rev: 12, steer: 0.54, grip: 6.2, hp: 320, seat: [-0.4, 0.34, 0.2], eye: 1.1, paint: [0x25406e, 0xd8d8d2, 0x2c2e32] },
  pickup: { name: 'PICKUP', len: 5.0, wid: 1.9, h: 1.76, wb: 3.1, track: 1.6, wheelR: 0.38, ride: 0.1, top: 36, accel: 9, brake: 18, rev: 11, steer: 0.5, grip: 5.2, hp: 400, seat: [-0.42, 0.56, -0.2], eye: 1.42, paint: [0xc8c4b8, 0x8a4a2a, 0x3a5a44] },
  jeep: { name: 'JEEP', len: 3.8, wid: 1.72, h: 1.7, wb: 2.4, track: 1.46, wheelR: 0.4, ride: 0.14, top: 33, accel: 11, brake: 20, rev: 12, steer: 0.62, grip: 5.8, hp: 340, open: true, seat: [-0.38, 0.6, 0.15], eye: 1.46, paint: [0x4e5a3a, 0x6a6448, 0x3e4a44] },
  offroad: { name: 'GELÄNDEWAGEN', len: 4.6, wid: 1.95, h: 1.92, wb: 2.8, track: 1.62, wheelR: 0.42, ride: 0.16, top: 37, accel: 10, brake: 19, rev: 11, steer: 0.52, grip: 5.4, hp: 460, seat: [-0.44, 0.66, 0.05], eye: 1.56, paint: [0x2a2c2e, 0xb8a888, 0x5a2a24] },
};

// ---------------------------------------------------------------- shared materials
let MAT = null;
function materials(tex) {
  if (MAT) return MAT;
  const paint = tex.generate('paint').map, gm = tex.generate('gunmetal').map;
  const lam = (o) => new THREE.MeshLambertMaterial(o);
  MAT = {
    paintMap: paint,
    dark: lam({ color: 0x18191b }),
    trim: lam({ color: 0x3a3c40, map: gm }),
    chrome: lam({ color: 0xb8bcc0, map: gm }),
    tire: lam({ color: 0x151517 }),
    hub: lam({ color: 0x8c9096, map: gm }),
    glass: lam({ color: 0x24323c, transparent: true, opacity: 0.55 }),
    seat: lam({ color: 0x34302c }),
    head: new THREE.MeshBasicMaterial({ color: 0xfff4d0 }),
    tail: new THREE.MeshBasicMaterial({ color: 0x701010 }),
    tailOn: new THREE.MeshBasicMaterial({ color: 0xff2a18 }),
    canvas: lam({ color: 0x5a5a44 }),
    wheel: lam({ vertexColors: true }),
  };
  return MAT;
}
function paintMat(tex, color) {
  const m = materials(tex);
  return new THREE.MeshLambertMaterial({ color, map: m.paintMap });
}

// ---------------------------------------------------------------- tiny modelling kit
function box(list, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) g.rotateZ(rz).rotateX(rx).rotateY(ry);
  g.translate(x, y, z);
  list.push(g.toNonIndexed());
}
// side profile [z, y] extruded along X, centered
function prof(list, pts, w, x = 0) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  g.translate(0, 0, -w / 2);
  g.rotateY(-Math.PI / 2);
  g.translate(x, 0, 0);
  list.push(g.index ? g.toNonIndexed() : g);
}
function bake(list, mat, parent) {
  if (!list.length) return null;
  for (const g of list) { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); }
  const g = mergeGeometries(list, false);
  if (mat.map) projectUV(g, 1.4);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = false; m.receiveShadow = false;
  parent.add(m);
  return m;
}

const wheelGeos = new Map();
function wheel(mat, r, w) {
  const key = r + '|' + w;
  if (!wheelGeos.has(key)) {
    const col = new THREE.Color();
    const tint = (geo, hex) => {
      const g = geo.index ? geo.toNonIndexed() : geo, n = g.attributes.position.count, c = new Float32Array(n * 3);
      col.set(hex);
      for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      return g;
    };
    const parts = [tint(new THREE.CylinderGeometry(r, r, w, 16).rotateZ(Math.PI / 2), 0x151517), tint(new THREE.CylinderGeometry(r * 0.58, r * 0.58, w + 0.02, 10).rotateZ(Math.PI / 2), 0x8c9096)];
    // spokes make the spinning visible
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      parts.push(tint(new THREE.BoxGeometry(w + 0.03, r * 0.16, r * 0.42).rotateX(-a).translate(0, Math.cos(a) * r * 0.32, Math.sin(a) * r * 0.32), 0x18191b));
    }
    wheelGeos.set(key, mergeGeometries(parts));
  }
  return new THREE.Mesh(wheelGeos.get(key), mat.wheel);
}

// ---------------------------------------------------------------- bodies
function buildBody(type, def, paint, m, root) {
  const P = [], D = [], C = [], GL = [], S = [];
  const L = def.len / 2, W = def.wid, B = 0.3 + def.ride; // B = floor height
  const doorParts = [];
  if (type === 'hatch') {
    prof(P, [[-L, B + 0.1], [-L, B + 0.5], [-L + 0.3, B + 0.62], [-L + 1.0, B + 0.7], [L - 0.18, B + 0.76], [L, B + 0.62], [L, B + 0.08], [-L, B + 0.08]], W);
    prof(P, [[-L + 1.0, B + 0.7], [-L + 1.55, B + 1.14], [L - 0.5, B + 1.16], [L - 0.14, B + 0.76]], W - 0.14);
    prof(GL, [[-L + 1.06, B + 0.72], [-L + 1.57, B + 1.1], [-0.05, B + 1.11], [-0.05, B + 0.72]], W - 0.1);
    prof(GL, [[0.05, B + 0.72], [0.05, B + 1.11], [L - 0.52, B + 1.11], [L - 0.2, B + 0.74]], W - 0.1);
  } else if (type === 'sedan') {
    prof(P, [[-L, B + 0.08], [-L, B + 0.46], [-L + 0.4, B + 0.58], [-L + 1.25, B + 0.66], [L - 0.9, B + 0.68], [L - 0.2, B + 0.66], [L, B + 0.5], [L, B + 0.08]], W);
    prof(P, [[-L + 1.25, B + 0.66], [-L + 1.95, B + 1.08], [L - 1.5, B + 1.08], [L - 0.85, B + 0.68]], W - 0.14);
    prof(GL, [[-L + 1.32, B + 0.68], [-L + 1.97, B + 1.04], [-0.02, B + 1.04], [-0.02, B + 0.68]], W - 0.1);
    prof(GL, [[0.06, B + 0.68], [0.06, B + 1.04], [L - 1.52, B + 1.04], [L - 0.92, B + 0.7]], W - 0.1);
  } else if (type === 'pickup') {
    prof(P, [[-L, B + 0.08], [-L, B + 0.6], [-L + 0.3, B + 0.72], [-L + 1.15, B + 0.78], [0.55, B + 0.78], [0.55, B + 0.08]], W);
    prof(P, [[-L + 1.15, B + 0.78], [-L + 1.7, B + 1.26], [0.3, B + 1.26], [0.5, B + 0.78]], W - 0.12);
    prof(GL, [[-L + 1.22, B + 0.8], [-L + 1.72, B + 1.22], [0.26, B + 1.22], [0.44, B + 0.8]], W - 0.08);
    // open bed
    box(P, W, 0.12, L - 0.55, 0, B + 0.2, (L + 0.55) / 2);
    box(P, 0.1, 0.56, L - 0.55, W / 2 - 0.05, B + 0.5, (L + 0.55) / 2);
    box(P, 0.1, 0.56, L - 0.55, -W / 2 + 0.05, B + 0.5, (L + 0.55) / 2);
    box(P, W, 0.56, 0.1, 0, B + 0.5, L - 0.05);
    box(D, W - 0.24, 0.5, L - 0.65, 0, B + 0.3, (L + 0.55) / 2);
  } else if (type === 'jeep') {
    // open tub, flat hood, roll bar, spare wheel, windscreen frame
    prof(P, [[-L, B + 0.1], [-L, B + 0.68], [-L + 1.15, B + 0.72], [-L + 1.2, B + 0.62], [L, B + 0.62], [L, B + 0.1]], W);
    box(D, W - 0.22, 0.45, 1.95, 0, B + 0.5, 0.75);
    box(C, W, 0.06, 0.05, 0, B + 1.2, -L + 1.2);
    for (const s of [-1, 1]) box(C, 0.05, 0.56, 0.05, s * (W / 2 - 0.03), B + 0.94, -L + 1.2);
    box(GL, W - 0.08, 0.5, 0.02, 0, B + 0.94, -L + 1.2);
    for (const s of [-1, 1]) { box(C, 0.07, 0.78, 0.07, s * (W / 2 - 0.08), B + 1.0, 0.85); box(C, 0.06, 0.06, 1.0, s * (W / 2 - 0.08), B + 1.38, 0.35); }
    box(C, W - 0.12, 0.07, 0.07, 0, B + 1.38, 0.85);
    // grille slots
    for (let i = 0; i < 7; i++) box(D, 0.06, 0.34, 0.02, -0.36 + i * 0.12, B + 0.42, -L - 0.005);
    // spare wheel on the back
    const sp = wheel(m, def.wheelR * 0.95, 0.24); sp.rotation.y = Math.PI / 2; sp.position.set(0, B + 0.56, L + 0.14); root.add(sp);
  } else {
    // big closed off-roader: boxy, with roof rack and bull bar
    prof(P, [[-L, B + 0.1], [-L, B + 0.72], [-L + 0.15, B + 0.78], [-L + 1.15, B + 0.84], [L, B + 0.86], [L, B + 0.1]], W);
    prof(P, [[-L + 1.15, B + 0.84], [-L + 1.5, B + 1.36], [L - 0.06, B + 1.38], [L - 0.02, B + 0.86]], W - 0.1);
    prof(GL, [[-L + 1.22, B + 0.86], [-L + 1.52, B + 1.32], [-0.02, B + 1.33], [-0.02, B + 0.86]], W - 0.06);
    prof(GL, [[0.06, B + 0.86], [0.06, B + 1.33], [1.2, B + 1.33], [1.2, B + 0.86]], W - 0.06);
    prof(GL, [[1.28, B + 0.86], [1.28, B + 1.33], [L - 0.12, B + 1.33], [L - 0.12, B + 0.86]], W - 0.06);
    box(C, W - 0.3, 0.05, 2.2, 0, B + 1.48, 0.4);
    for (const s of [-1, 1]) for (const z of [-0.5, 1.3]) box(C, 0.05, 0.1, 0.05, s * (W / 2 - 0.2), B + 1.42, z);
    box(C, W - 0.2, 0.08, 0.08, 0, B + 0.34, -L - 0.2);
    box(C, W - 0.2, 0.08, 0.08, 0, B + 0.74, -L - 0.2);
    for (const s of [-1, 1]) box(C, 0.08, 0.44, 0.08, s * (W / 2 - 0.2), B + 0.54, -L - 0.2);
  }
  // underbody, wheel arches, bumpers, lights, mirrors
  box(D, W - 0.1, 0.1, def.len - 0.3, 0, B + 0.06, 0);
  box(C, W + 0.02, 0.14, 0.12, 0, B + 0.2, -L + 0.02);
  box(C, W + 0.02, 0.14, 0.12, 0, B + 0.2, L - 0.02);
  for (const sx of [-1, 1]) for (const z of [-def.wb / 2, def.wb / 2]) box(D, 0.03, def.wheelR * 1.2, def.wheelR * 2.3, sx * (W / 2 + 0.005), def.wheelR + def.ride * 0.5, z);
  const hy = B + (type === 'jeep' ? 0.5 : type === 'sedan' ? 0.42 : 0.46);
  const lamps = [];
  for (const s of [-1, 1]) box(lamps, 0.3, 0.14, 0.03, s * (W / 2 - 0.26), hy, -L - 0.01);
  bake(lamps, m.head, root);
  const tails = [];
  for (const s of [-1, 1]) box(tails, 0.3, 0.13, 0.03, s * (W / 2 - 0.22), B + 0.46, L + 0.012);
  const tail = bake(tails, m.tail, root);
  for (const s of [-1, 1]) box(C, 0.14, 0.09, 0.05, s * (W / 2 + 0.07), B + (type === 'jeep' ? 0.9 : 0.84), -L + (type === 'hatch' ? 1.2 : 1.35));
  // seats and dash
  const seatZ = def.seat[2];
  for (const s of [-1, 1]) {
    box(S, 0.48, 0.14, 0.5, s * Math.abs(def.seat[0]), B + (type === 'jeep' || type === 'offroad' || type === 'pickup' ? 0.28 : 0.1), seatZ + 0.08);
    box(S, 0.46, 0.62, 0.12, s * Math.abs(def.seat[0]), B + (type === 'jeep' || type === 'offroad' || type === 'pickup' ? 0.6 : 0.42), seatZ + 0.34);
  }
  box(D, W - 0.2, 0.28, 0.42, 0, B + (type === 'jeep' ? 0.62 : 0.58), -L + (type === 'pickup' ? 1.32 : type === 'hatch' ? 1.2 : 1.35));
  bake(P, paint, root); bake(D, m.dark, root); bake(C, m.chrome, root); bake(S, m.seat, root);
  bake(GL, m.glass, root);
  // driver's door, on its own hinge
  const door = new THREE.Group();
  const hingeZ = def.seat[2] - 0.62, dLen = 1.0;
  door.position.set(-W / 2 - 0.012, 0, hingeZ); root.add(door);
  const DP = [];
  box(DP, 0.04, (type === 'jeep' ? 0.36 : 0.52), dLen, 0, B + (type === 'jeep' ? 0.42 : 0.42), dLen / 2);
  bake(DP, paint, door);
  void doorParts;
  // steering wheel
  const sw = new THREE.Group();
  const swY = B + (type === 'jeep' || type === 'offroad' || type === 'pickup' ? 0.82 : 0.62);
  sw.position.set(def.seat[0], swY, def.seat[2] - 0.42); sw.rotation.x = 0.5; root.add(sw);
  const ring = new THREE.TorusGeometry(0.17, 0.018, 6, 18);
  sw.add(new THREE.Mesh(ring, m.dark));
  const sb = new THREE.BoxGeometry(0.3, 0.02, 0.02); sw.add(new THREE.Mesh(sb, m.dark));
  return { door, sw, tail };
}

// ---------------------------------------------------------------- one vehicle
export class Vehicle {
  constructor(game, type, x, z, yaw) {
    this.game = game; this.type = type;
    const d = this.def = VEHICLE_TYPES[type];
    this.pos = new THREE.Vector3(x, 0, z);
    this.vel = new THREE.Vector3();
    this.yaw = yaw; this.steer = 0; this.pitch = 0; this.roll = 0; this.vy = 0;
    this.pitchV = 0; this.rollV = 0;
    this.hp = d.hp; this.dead = false; this.grounded = true;
    this.driver = null; this.doorT = 0; this.doorWant = 0; this.doorOpenT = 0;
    this.throttle = 0; this.braking = false; this.handbrake = false; this.spin = 0; this.speed = 0; this.smokeT = 0;
    this.lastHitT = -9;
    const m = materials(game.tex);
    this.paint = paintMat(game.tex, d.paint[(Math.random() * d.paint.length) | 0]);
    const root = this.root = new THREE.Group();
    this.tilt = new THREE.Group(); root.add(this.tilt);
    const parts = buildBody(type, d, this.paint, m, this.tilt);
    Object.assign(this, parts);
    this.wheels = [];
    const w = 0.24 + (type === 'jeep' || type === 'offroad' ? 0.06 : 0);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * d.track / 2, d.wheelR, sz * d.wb / 2);
      const wh = wheel(m, d.wheelR, w);
      pivot.add(wh); root.add(pivot);
      this.wheels.push({ pivot, wh, sx, sz, gy: 0, comp: 0 });
    }
    // blob shadow, baked world shadows can't follow a moving car
    const blob = this.blob = new THREE.Mesh(new THREE.PlaneGeometry(d.wid * 1.5, d.len * 1.35), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.42, depthWrite: false, map: blobTex() }));
    blob.rotation.x = -Math.PI / 2; blob.renderOrder = 2; blob.layers.set(2);
    game.scene.add(blob);
    root.traverse((o) => { if (o.isMesh) o.frustumCulled = true; });
    game.scene.add(root);
    this.placeOnGround();
  }

  // the hill is always there, whatever else is under the wheels
  ground(x, z, y) {
    const h = this.game.mapDef.terrain.heightAt(x, z), f = this.game.col.floorBelow(x, z, 0.05, y + 0.75, y - 8);
    return isFinite(f) ? Math.max(f, h) : h;
  }

  placeOnGround() {
    const t = this.game.mapDef.terrain;
    const h = t.heightAt(this.pos.x, this.pos.z);
    this.pos.y = h;
    const f = this.game.col.floorBelow(this.pos.x, this.pos.z, 0.3, h + 0.5, h - 2);
    if (isFinite(f)) this.pos.y = f;
    this.sampleWheels(1);
    this.syncVisual(0);
  }

  sampleWheels() {
    const d = this.def, s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    let sum = 0;
    for (const w of this.wheels) {
      // local (x, z) -> world, forward is -z at yaw 0
      const lx = w.sx * d.track / 2, lz = w.sz * d.wb / 2;
      const wx = this.pos.x + lx * c + lz * s, wz = this.pos.z - lx * s + lz * c;
      w.gy = this.ground(wx, wz, this.pos.y);
      sum += w.gy;
    }
    this.gyAvg = sum / 4;
    // bumpers: how high the ground is under the very front and the very back of the car
    const reach = d.len / 2 + 0.15;
    this.noseGy = this.ground(this.pos.x - s * reach, this.pos.z - c * reach, this.pos.y);
    this.tailGy = this.ground(this.pos.x + s * reach, this.pos.z + c * reach, this.pos.y);
  }

  // where the wheels want the body: nose up when the front is higher. A rising hill in front of the bumper already lifts it.
  groundPitch() {
    const d = this.def, wheelF = (this.wheels[0].gy + this.wheels[1].gy) / 2, wheelR = (this.wheels[2].gy + this.wheels[3].gy) / 2;
    let p = Math.atan2(wheelF - wheelR, d.wb);
    const reach = d.len / 2 + 0.15, clearance = 0.3 + d.ride;
    const noseNeed = Math.atan2(this.noseGy - clearance - (wheelF + wheelR) / 2, reach), tailNeed = Math.atan2((wheelF + wheelR) / 2 - (this.tailGy - clearance), reach);
    if (noseNeed > p) p = noseNeed;
    if (tailNeed < p && this.tailGy - clearance > (wheelF + wheelR) / 2) p = tailNeed;
    return p;
  }

  get frontVec() { return _f.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  get rightVec() { return _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }

  // input: { throttle: -1..1, steer: -1..1, handbrake }
  update(dt, input) {
    const d = this.def, game = this.game;
    if (this.doorOpenT > 0) { this.doorOpenT -= dt; this.doorWant = 1; } else this.doorWant = 0;
    this.doorT = damp(this.doorT, this.doorWant, 9, dt);
    if (this.door) this.door.rotation.y = -this.doorT * 1.05;
    const cam = game.engine.camera.position;
    this.root.visible = (this.pos.x - cam.x) ** 2 + (this.pos.z - cam.z) ** 2 < 430 * 430;
    const moving = this.speed > 0.05 || input || !this.grounded || this.vel.lengthSq() > 0.01;
    if (!moving) { this.syncVisual(dt); return; }
    const sub = 2, h = dt / sub;
    for (let i = 0; i < sub; i++) this.step(h, input);
    this.syncVisual(dt);
    void game;
  }

  step(dt, input) {
    const d = this.def, f = this.frontVec, r = this.rightVec;
    let vf = this.vel.dot(f), vl = this.vel.dot(r);
    const thr = input ? input.throttle : 0, st = input ? input.steer : 0, hb = input ? input.handbrake : false;
    this.handbrake = hb;
    // ---- steering: the faster you go, the less the wheels turn
    const k = 1 / (1 + Math.abs(vf) * 0.16);
    const steerGoal = st * d.steer * k;
    this.steer += (steerGoal - this.steer) * Math.min(1, dt * (st ? 7 : 9));
    this.braking = false;
    if (this.grounded) {
      // ---- engine and brakes
      if (thr > 0) {
        if (vf < -0.5) { vf += d.brake * dt; this.braking = true; }
        else vf += d.accel * thr * (1 - Math.max(0, vf) / d.top) * dt;
      } else if (thr < 0) {
        if (vf > 0.5) { vf -= d.brake * dt; this.braking = true; }
        else vf -= d.accel * 0.8 * -thr * (1 - Math.max(0, -vf) / d.rev) * dt;
      } else vf -= Math.sign(vf) * Math.min(Math.abs(vf), (1.2 + Math.abs(vf) * 0.05) * dt);
      if (hb) { vf -= Math.sign(vf) * Math.min(Math.abs(vf), 5.5 * dt); this.braking = true; }
      if (!input && Math.abs(vf) > 0) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 6 * dt); // nobody at the wheel: rolls to a stop
      // ---- hills pull
      const fy = (this.wheels[0].gy + this.wheels[1].gy) / 2, ry = (this.wheels[2].gy + this.wheels[3].gy) / 2;
      const sl = clamp((fy - ry) / d.wb, -1, 1);
      vf -= G * sl * 0.7 * dt;
      // ---- turning with the front wheels; the handbrake kicks the tail out
      const yr = (vf / d.wb) * Math.tan(this.steer) * (hb ? 1.25 : 1);
      this.yaw -= yr * dt;
      // ---- sideways grip
      const grip = hb ? 1.5 : d.grip;
      vl *= Math.exp(-grip * dt);
      const slip = Math.abs(vl);
      if (slip > 3.5 && Math.abs(vf) > 3 && (this.smokeT -= dt) <= 0) { this.smokeT = 0.05; this.tireSmoke(); }
    }
    const f2 = this.frontVec, r2 = this.rightVec;
    this.vel.x = f2.x * vf + r2.x * vl; this.vel.z = f2.z * vf + r2.z * vl;
    // a rock face stops you like a wall
    if (Math.abs(vf) > 0.5) {
      const dir = Math.sign(vf), t = this.game.mapDef.terrain, reach = d.len * 0.5 + 0.6;
      const slope = (t.heightAt(this.pos.x + f2.x * dir * reach, this.pos.z + f2.z * dir * reach) - t.heightAt(this.pos.x, this.pos.z)) / reach;
      if (slope > 1.2) {
        if (Math.abs(vf) > 6 && this.game.time - this.lastHitT > 0.25) { this.lastHitT = this.game.time; this.game.audio.play('imp_metal', { pos: this.pos, vol: 0.8, rate: 0.7, maxDist: 70 }); this.bump(Math.abs(vf) * 0.01); }
        vf = -vf * 0.15; this.vel.x = f2.x * vf + r2.x * vl; this.vel.z = f2.z * vf + r2.z * vl;
      }
    }
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    // ---- anything solid in the way
    this.collide(dt);
    // ---- suspension
    this.sampleWheels();
    const target = this.gyAvg;
    if (this.pos.y > target + 0.08) {
      this.grounded = false;
      this.vy -= G * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= target) {
        if (this.vy < -7) { this.bump(-this.vy * 0.018); this.game.audio.play('land', { pos: this.pos, vol: 0.9, rate: 0.7, maxDist: 60 }); }
        this.pos.y = target; this.vy = 0; this.grounded = true;
      }
    } else {
      this.grounded = true;
      const was = this.pos.y;
      this.pos.y = target;
      // going over a crest keeps the upward speed, that's how jumps happen
      this.vy = clamp((this.pos.y - was) / Math.max(dt, 1e-3), -40, 12);
      this.vy *= 0.75;
    }
    // ---- world border
    const R = Math.hypot(this.pos.x, this.pos.z);
    if (R > 362) { this.pos.x *= 362 / R; this.pos.z *= 362 / R; this.vel.multiplyScalar(0.5); }
  }

  collide(dt) {
    const d = this.def, game = this.game, col = game.col, y0 = this.pos.y + 0.55, y1 = this.pos.y + d.h;
    const f = this.frontVec, rad = d.wid * 0.48, off = d.len / 2 - rad;
    let hit = false, nx = 0, nz = 0;
    for (const s of [-1, 0, 1]) {
      const p = { x: this.pos.x + f.x * off * s, z: this.pos.z + f.z * off * s };
      const ox = p.x, oz = p.z;
      if (col.pushOutCircle(p, rad, y0, y1)) {
        const dx = p.x - ox, dz = p.z - oz;
        this.pos.x += dx; this.pos.z += dz;
        hit = true; nx += dx; nz += dz;
      }
    }
    // other vehicles
    for (const o of game.match.vehicles.list) {
      if (o === this || o.dead) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, q = Math.hypot(dx, dz), m = (d.len + o.def.len) * 0.42;
      if (q < m && q > 1e-3 && Math.abs(this.pos.y - o.pos.y) < 2.5) {
        const push = (m - q) / q;
        this.pos.x += dx * push * 0.7; this.pos.z += dz * push * 0.7;
        o.pos.x -= dx * push * 0.3; o.pos.z -= dz * push * 0.3;
        o.vel.addScaledVector(this.vel, 0.15);
        o.sampleWheels(); o.syncVisual(0);
        hit = true; nx += dx * push; nz += dz * push;
      }
    }
    if (hit) {
      const L = Math.hypot(nx, nz) || 1; nx /= L; nz /= L;
      const vn = this.vel.x * nx + this.vel.z * nz;
      if (vn < 0) {
        this.vel.x -= nx * vn * 1.25; this.vel.z -= nz * vn * 1.25;
        const impact = -vn;
        if (impact > 3 && game.time - this.lastHitT > 0.25) {
          this.lastHitT = game.time;
          game.audio.play('imp_metal', { pos: this.pos, vol: Math.min(1.2, impact / 10), rate: 0.7, maxDist: 70 });
          this.bump(impact * 0.012);
          if (this.driver === game.player) game.shake.add(Math.min(0.5, impact * 0.04));
          if (impact > 9) this.damage((impact - 9) * 9, null);
        }
      }
      this.speed = Math.hypot(this.vel.x, this.vel.z);
    }
    void dt;
  }

  bump(a) { this.pitchV += a * (Math.random() < 0.5 ? -3 : 3); this.rollV += a * (Math.random() - 0.5) * 3; }

  tireSmoke() {
    const fx = this.game.fx, d = this.def, s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    for (const w of [this.wheels[2], this.wheels[3]]) {
      const lx = w.sx * d.track / 2, lz = w.sz * d.wb / 2;
      fx.impact(_v.set(this.pos.x + lx * c + lz * s, w.gy + 0.08, this.pos.z - lx * s + lz * c), _u.set(0, 1, 0), 'dirt', 0.35);
    }
  }

  syncVisual(dt) {
    const d = this.def;
    // body follows the ground plane; springs add dive and roll
    const ly = (this.wheels[0].gy + this.wheels[2].gy) / 2, ty = (this.wheels[1].gy + this.wheels[3].gy) / 2;
    let goalP = this.grounded ? this.groundPitch() : this.pitch, goalR = this.grounded ? Math.atan2(ty - ly, d.track) : this.roll;
    if (dt > 0) {
      const f = this.vel.dot(this.frontVec), l = this.vel.dot(this.rightVec);
      const acc = (f - (this._lastF ?? f)) / dt; this._lastF = f;
      const dive = clamp(-acc * 0.004, -0.06, 0.08), lean = clamp(-(f / d.wb) * Math.tan(this.steer) * Math.abs(f) * 0.0045 + l * 0.004, -0.09, 0.09);
      this.pitchV += ((goalP - this.pitch) * 160 - this.pitchV * 18) * dt;
      this.rollV += ((goalR - this.roll) * 120 - this.rollV * 16) * dt;
      this.pitch += this.pitchV * dt; this.roll += this.rollV * dt;
      // the spring may swing, but never so far that the body sinks into the slope
      if (this.grounded) {
        if (this.pitch < goalP - 0.07) { this.pitch = goalP - 0.07; this.pitchV = Math.max(this.pitchV, 0); }
        if (this.pitch > goalP + 0.07) { this.pitch = goalP + 0.07; this.pitchV = Math.min(this.pitchV, 0); }
        if (this.roll < goalR - 0.07) { this.roll = goalR - 0.07; this.rollV = Math.max(this.rollV, 0); }
        if (this.roll > goalR + 0.07) { this.roll = goalR + 0.07; this.rollV = Math.min(this.rollV, 0); }
      }
      this.tilt.rotation.set(dive * 0.9, 0, lean, 'YXZ');
      this.spin += f / d.wheelR * dt;
    } else { this.pitch = goalP; this.roll = goalR; }
    const root = this.root;
    root.position.copy(this.pos);
    root.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    // wheels stay on the ground, the body moves over them
    for (const w of this.wheels) {
      const front = w.sz < 0;
      w.pivot.rotation.y = front ? this.steer : 0;
      w.wh.rotation.x = -this.spin;
      const off = clamp(w.gy - (this.pos.y + (w.sz < 0 ? this.pitch : -this.pitch) * d.wb * 0 ), -0.18, 0.22);
      w.pivot.position.y = d.wheelR + off * 0.65;
    }
    if (this.sw) this.sw.rotation.z = this.steer * 2.4;
    if (this.tail) this.tail.material = this.braking ? materials(this.game.tex).tailOn : materials(this.game.tex).tail;
    this.blob.position.set(this.pos.x, this.gyAvg + 0.04, this.pos.z);
    this.blob.rotation.z = this.yaw;
    this.blob.visible = !this.dead;
  }

  damage(dmg, attacker) {
    if (this.dead) return;
    this.hp -= dmg;
    if (this.hp <= 0) this.explode(attacker);
  }

  explode(attacker) {
    this.dead = true;
    const g = this.game;
    g.audio.play('gun_amr', { pos: this.pos, vol: 1.6, rate: 0.55, maxDist: 300, occlude: false });
    for (let i = 0; i < 26; i++) g.fx.impact(_v.set(this.pos.x + (Math.random() - 0.5) * 2.4, this.pos.y + 0.4 + Math.random() * 1.3, this.pos.z + (Math.random() - 0.5) * 2.4), _u.set(Math.random() - 0.5, 1, Math.random() - 0.5).normalize(), 'metal', 1.2);
    this.paint.color.setHex(0x161616);
    this.vel.multiplyScalar(0.2);
    g.shake.add(Math.max(0, 0.9 - this.pos.distanceTo(g.player.pos) * 0.03));
    // everyone close by gets hurt, the driver worst of all
    for (const c of g.combatants) {
      if (!c.alive) continue;
      const q = c.pos.distanceTo(this.pos);
      if (q < 7) g.applyDamage(c, (1 - q / 7) * 180 + (c === this.driver ? 200 : 0), attacker || c, { part: 'chest', dir: _v2.copy(c.pos).sub(this.pos).normalize().clone(), weapon: { name: 'FAHRZEUG', damage: [40, 40] }, point: c.pos.clone() });
    }
    if (this.driver === g.player && g.match.leaveVehicle) g.match.leaveVehicle(true);
  }

  // who stands where the car wants to be
  pushOut(ent) {
    const dx = ent.pos.x - this.pos.x, dz = ent.pos.z - this.pos.z;
    const d = this.def;
    if (dx * dx + dz * dz > (d.len * 0.7 + 1) ** 2) return false;
    if (ent.pos.y > this.pos.y + d.h + 0.2 || ent.pos.y + 1.7 < this.pos.y) return false;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const lx = dx * c - dz * s, lz = dx * s + dz * c, hx = d.wid / 2 + 0.34, hz = d.len / 2 + 0.34;
    if (Math.abs(lx) >= hx || Math.abs(lz) >= hz) return false;
    // out through the closest side
    const px = hx - Math.abs(lx), pz = hz - Math.abs(lz);
    let nx = 0, nz = 0;
    if (px < pz) nx = Math.sign(lx) * px; else nz = Math.sign(lz) * pz;
    ent.pos.x += nx * c + nz * s; ent.pos.z += -nx * s + nz * c;
    return true;
  }

  // distance along a ray to the body (below the window line, so people inside stay exposed)
  rayHit(ox, oy, oz, dx, dy, dz, maxT) {
    const d = this.def;
    if ((ox - this.pos.x) ** 2 + (oz - this.pos.z) ** 2 > (maxT + d.len) ** 2) return -1;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const rx = ox - this.pos.x, rz = oz - this.pos.z;
    const lox = rx * c - rz * s, loz = rx * s + rz * c, lox2 = dx * c - dz * s, loz2 = dx * s + dz * c;
    const by = oy - this.pos.y;
    let t0 = 0, t1 = maxT;
    const slab = (o, v, a, b) => {
      if (Math.abs(v) < 1e-7) return o >= a && o <= b;
      let p = (a - o) / v, q = (b - o) / v;
      if (p > q) { const k = p; p = q; q = k; }
      if (p > t0) t0 = p; if (q < t1) t1 = q;
      return t0 <= t1;
    };
    if (!slab(lox, lox2, -d.wid / 2, d.wid / 2)) return -1;
    if (!slab(loz, loz2, -d.len / 2, d.len / 2)) return -1;
    if (!slab(by, dy, 0.25, d.h * 0.62)) return -1;
    return t0;
  }

  seatWorld(out) {
    const d = this.def, s = Math.sin(this.yaw), c = Math.cos(this.yaw), lx = d.seat[0], lz = d.seat[2];
    return out.set(this.pos.x + lx * c + lz * s, this.pos.y + d.seat[1] + this.seatTilt(lx, lz), this.pos.z - lx * s + lz * c);
  }

  // how much the tilt of the body lifts a point of the car (local x, z)
  seatTilt(lx, lz) { return -lz * Math.sin(this.pitch) + lx * Math.sin(this.roll); }

  // where you stand after getting out (driver's side first)
  exitPoint(out) {
    const col = this.game.col, d = this.def, s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    for (const [lx, lz] of [[-d.wid / 2 - 0.7, d.seat[2]], [d.wid / 2 + 0.7, d.seat[2]], [0, d.len / 2 + 0.8], [0, -d.len / 2 - 0.8]]) {
      const x = this.pos.x + lx * c + lz * s, z = this.pos.z - lx * s + lz * c;
      const y = col.floorBelow(x, z, 0.2, this.pos.y + 1.2, this.pos.y - 6);
      if (isFinite(y) && !col.overlaps(x - 0.32, y + 0.05, z - 0.32, x + 0.32, y + 1.8, z + 0.32)) return out.set(x, y, z);
    }
    return out.set(this.pos.x, this.pos.y + d.h + 0.1, this.pos.z);
  }

  dispose() { this.game.scene.remove(this.root); this.game.scene.remove(this.blob); }
}

let BLOB = null;
function blobTex() {
  if (BLOB) return BLOB;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 8, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.6, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  BLOB = new THREE.CanvasTexture(c);
  return BLOB;
}
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _v = new THREE.Vector3(), _u = new THREE.Vector3(), _v2 = new THREE.Vector3();
export { angleDiff };
