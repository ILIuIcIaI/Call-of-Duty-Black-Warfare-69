import * as THREE from 'three';

// =============================================================================
// Wingman: one flag, a circle with a flag pole in the middle. Ten seconds in the
// circle take it, for players and bots alike; with both teams in it nothing
// moves. Once a team holds it the others have one minute to take it back, or
// the holders have won. After the eight minutes of the match whoever holds it
// wins (match.js). The flag of whoever is taking it goes up the pole, the
// holder's flag flies at the top.
// Where it stands: the map's own wingman list, or SPOTS below for the maps that
// were built before the mode existed; the first entry (from the time of the two
// points A and B a map may still list a second one).
// =============================================================================
export const CAPTURE = 10;    // seconds in the circle to take the flag
export const HOLD = 60;       // seconds the others have to take it back
const DECAY = 8;              // seconds for a half-taken flag to fall back once nobody is on it
const COLORS = { own: 0x48b8ff, enemy: 0xff4a3a, none: 0xe8e8e8 }; // (as in the HUD)

// [x, y, z, radius, top]. y: the floor. top: where the flag stands above the floor, when something stands in the
// middle (a fountain, a market stand): the flag goes on its top and the circle is the ground around it.
// The flag stands in the middle of the map, where every way meets: both teams walk the same distance, no spawn sees
// it, and there is cover in the circle and room round it, so it is fought over from all sides for the whole match.
export const SPOTS = {
  sirocco: [[0, 0, 0, 5.5]],                // the domed market hall in the middle of town, a door on every side, the flag on the rug stand
  atrium: [[0, 0, 0, 5.0]],                 // the atrium's floor round its centrepiece, the galleries above
  dynamo: [[3, 0, 0, 5.0]],                 // the turbine hall, where the way across runs between turbine and generator
  blacksite: [[0, 0, 0, 3.2]],              // the control room in the middle of the lab: a door and windows on every side
  citadel: [[0, 0, 0, 5.0]],                // the piazza round the fountain, between the arcades
  backrooms: [[0, 0, 6, 4.0]],              // the pillar hall, between two pillars
  drydock: [[0, 0, 2.5, 4.5]],              // the warehouse floor, under the bridge between its galleries
  poolday: [[-1.25, -2.44, -0.82, 3.2]],    // down in the middle of the empty pool: in the open, seen from all round
};
export function pointsOf(def) { const s = def.wingman || SPOTS[def.id]; return s ? s.slice(0, 1) : null; }

const _p = new THREE.Vector3();

export class Points {
  constructor(game, spots) {
    this.game = game;
    this.list = spots.slice(0, 1).map(([x, y, z, r = 3.5, top = 0], i) => this.eyesOf({ i, x, y, z, r, top, owner: -1, cap: -1, k: 0, n: [0, 0], contested: false }));
    this.holdLeft = 0; // (while a team holds the flag: what the others have left to take it back)
    this.build();
  }

  // Where the point looks from to see who is in its circle (a wall between counts, so nobody takes it from the next room).
  // With something solid in the middle (a cistern, a saw, a helicopter) the flag goes on top of it, and the circle is
  // seen from its four sides and from above, so the yard all round counts.
  eyesOf(P) {
    const B = this.game.col.B, n = this.game.col.n, { x, y, z } = P;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, top = -Infinity;
    for (let i = 0; i < n; i++) {
      const o = i * 6;
      if (B[o] > x + 0.1 || B[o + 3] < x - 0.1 || B[o + 2] > z + 0.1 || B[o + 5] < z - 0.1 || B[o + 1] > y + 1.8 || B[o + 4] < y + 0.15 || B[o + 4] > y + 6) continue;
      x0 = Math.min(x0, B[o]); x1 = Math.max(x1, B[o + 3]); z0 = Math.min(z0, B[o + 2]); z1 = Math.max(z1, B[o + 5]); top = Math.max(top, B[o + 4]);
    }
    if (top === -Infinity) { P.eyes = [[x, y + 1.0, z]]; return P; }
    if (!P.top) P.top = top - y;
    P.eyes = [[x, y + P.top + 0.6, z], [x0 - 0.4, y + 1.0, z], [x1 + 0.4, y + 1.0, z], [x, y + 1.0, z0 - 0.4], [x, y + 1.0, z1 + 0.4]];
    return P;
  }

  // ---- what stands on the map
  build() {
    const g = this.game, pole = new THREE.MeshLambertMaterial({ color: 0x8a8e92 });
    const poleG = new THREE.CylinderGeometry(0.045, 0.06, 3.2, 8), footG = new THREE.CylinderGeometry(0.32, 0.4, 0.14, 12);
    for (const P of this.list) {
      const root = P.root = new THREE.Group();
      root.position.set(P.x, P.y, P.z);
      const ring = new THREE.Mesh(this.floorShape(P, P.r - 0.16, P.r, 1, 96),
        new THREE.MeshBasicMaterial({ color: COLORS.none, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      ring.position.y = 0.03; ring.renderOrder = 1;
      const fill = new THREE.Mesh(this.floorShape(P, 0, P.r - 0.16, 7, 56),
        new THREE.MeshBasicMaterial({ color: COLORS.none, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      fill.position.y = 0.025; fill.renderOrder = 1;
      // under a low ceiling (the Backrooms) the pole ends just below it, and the flag climbs only that far
      const up = g.col.raycast(P.x, P.y + P.top + 0.3, P.z, 0, 1, 0, 3.2, {}), H = up ? Math.min(3.2, up.t + 0.22) : 3.2;
      P.flagTop = H - 0.35;
      const stand = new THREE.Mesh(poleG, pole); stand.scale.y = H / 3.2; stand.position.y = P.top + H / 2;
      const foot = new THREE.Mesh(footG, pole); foot.position.y = P.top + 0.07;
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7).translate(0.58, 0, 0), new THREE.MeshBasicMaterial({ map: flagTexture(), side: THREE.DoubleSide }));
      flag.position.y = P.top + 0.6;
      root.add(ring, fill, stand, foot, flag);
      P.ring = ring; P.fill = fill; P.flag = flag;
      g.scene.add(root);
    }
  }

  // The ring and its fill, made of pieces of floor: a piece only where whoever stands there counts for the point (see
  // inside(): a floor within its height, room to stand, seen from one of its eyes), each at the height of the floor
  // under it. So no ring through walls or through what stands in the circle, none in the air over a drop, and on
  // steps it follows them.
  floorShape(P, r0, r1, bands, n) {
    const pos = [];
    for (let j = 0; j < bands; j++) {
      const ra = r0 + (r1 - r0) * j / bands, rb = r0 + (r1 - r0) * (j + 1) / bands, m = Math.max(8, Math.round(n * rb / r1));
      for (let k = 0; k < m; k++) {
        const a = k / m * Math.PI * 2, b = (k + 1) / m * Math.PI * 2, c = (a + b) / 2, rc = (ra + rb) / 2;
        const h = this.floorAt(P, P.x + Math.cos(c) * rc, P.z + Math.sin(c) * rc);
        if (h === null) continue;
        const at = (r, t) => [Math.cos(t) * r, h, Math.sin(t) * r];
        pos.push(...at(ra, a), ...at(rb, a), ...at(rb, b), ...at(ra, a), ...at(rb, b), ...at(ra, b));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }

  // the floor at (x, z) relative to the point's floor, or null where nobody standing there would count
  floorAt(P, x, z) {
    const col = this.game.col, y = col.floorBelow(x, z, 0.05, P.y + 1.6, P.y - 1.6);
    if (y < P.y - 1.6 || col.overlaps(x - 0.05, y + 0.05, z - 0.05, x + 0.05, y + 1.0, z + 0.05)) return null;
    for (const e of P.eyes) if (col.lineClear(e[0], e[1], e[2], x, y + 1.0, z)) return y - P.y;
    return null;
  }

  dispose() { for (const P of this.list) if (P.root) this.game.scene.remove(P.root); }

  // whose colour, seen from the player's team
  colorOf(team) { return team < 0 ? COLORS.none : team === this.game.player.team ? COLORS.own : COLORS.enemy; }

  // ---- the rules (only where they are decided: alone, or on the PC that runs the bots)
  // returns the team that has held the flag for the whole minute the others had, or -1
  update(dt) {
    const g = this.game, P = this.list[0];
    P.n[0] = 0; P.n[1] = 0;
    for (const c of g.combatants) {
      if (!c.alive || (c.team !== 0 && c.team !== 1) || !this.inside(P, c)) continue;
      P.n[c.team]++;
    }
    const [a, b] = P.n, T = a > 0 ? 0 : b > 0 ? 1 : -1;
    P.contested = a > 0 && b > 0;
    if (P.contested) {
      // both teams in the circle: nothing moves
    } else if (T < 0) {
      // nobody: a half-taken flag slowly falls back
      if (P.k > 0) { P.k = Math.max(0, P.k - dt / DECAY); if (!P.k) P.cap = -1; }
    } else if (P.owner === T) {
      // the holders stand on it: whatever the others had started is undone quickly
      if (P.k > 0) { P.k = Math.max(0, P.k - dt / 1.5); if (!P.k) P.cap = -1; }
    } else {
      // ten seconds, however many of a team stand in it
      if (P.cap !== T) { P.cap = T; P.k = 0; }
      P.k += dt / CAPTURE;
      if (P.k >= 1) { P.owner = T; P.cap = -1; P.k = 0; this.holdLeft = HOLD; this.taken(P, T); }
    }
    // the others' minute runs whatever happens in the circle; it never touches the clock of the match
    if (P.owner < 0) return -1;
    this.holdLeft = Math.max(0, this.holdLeft - dt);
    return this.holdLeft > 0 ? -1 : P.owner;
  }

  // where somebody else decides (see update): the minute runs on here between their messages
  follow(dt) { if (this.list[0].owner >= 0) this.holdLeft = Math.max(0, this.holdLeft - dt); }

  // in the circle, near its floor, and seen from one of the point's eyes (see eyesOf)
  inside(P, c) {
    const dx = c.pos.x - P.x, dz = c.pos.z - P.z;
    if (dx * dx + dz * dz > P.r * P.r || Math.abs(c.pos.y - P.y) > 1.6) return false; // (one floor: not from the room underneath)
    const col = this.game.col;
    for (const e of P.eyes) if (col.lineClear(e[0], e[1], e[2], c.pos.x, c.pos.y + 1.0, c.pos.z)) return true;
    return false;
  }

  // the flag changes hands: everybody hears it, and the others are told how long they have
  taken(P, T) {
    const g = this.game, own = T === g.player.team;
    if (own) { g.hud.popup('FLAGGE EINGENOMMEN', 'JETZT EINE MINUTE HALTEN', true); g.audio.play('chargeFwd', { vol: 0.8 }); }
    else { g.hud.message('<span style="font-size:22px;color:#ff6a5a">DIE GEGNER HABEN DIE FLAGGE · EINE MINUTE ZUM ZURÜCKEROBERN</span>', 2.6); g.audio.play('coverClose', { vol: 0.9, rate: 0.8 }); }
    if (this.onTaken) this.onTaken(P, T);
  }

  // ---- over the network: [holder, who is taking it, how far, contested, seconds the others have left]
  pack() { const P = this.list[0]; return [[P.owner, P.cap, Math.round(P.k * 100), P.contested ? 1 : 0, Math.ceil(this.holdLeft)]]; }
  unpack(s) {
    const P = this.list[0], v = Array.isArray(s) && s[0];
    if (!v) return;
    const was = P.owner;
    P.owner = v[0]; P.cap = v[1]; P.k = v[2] / 100; P.contested = !!v[3];
    if (P.owner !== was && P.owner >= 0) { this.holdLeft = v[4] ?? HOLD; this.taken(P, P.owner); }
    // (whole seconds come over: the minute runs on smoothly here and is only put right when it is clearly off)
    else if (v[4] !== undefined && Math.abs(this.holdLeft - v[4]) > 1.5) this.holdLeft = v[4];
  }

  // ---- every frame, everywhere: flags, rings
  show() {
    const t = this.game.time;
    for (const P of this.list) {
      const taking = P.cap >= 0 && P.k > 0, team = taking ? P.cap : P.owner;
      const col = this.colorOf(team);
      P.flag.material.color.setHex(col);
      P.flag.position.y = P.top + (taking ? 0.5 + (P.flagTop - 0.5) * P.k : P.owner >= 0 ? P.flagTop : 0.6);
      P.flag.rotation.y = Math.sin(t * 0.7 + P.i * 2) * 0.35;
      P.ring.material.color.setHex(this.colorOf(P.owner));
      P.ring.material.opacity = P.contested ? 0.45 + 0.4 * Math.abs(Math.sin(t * 6)) : 0.8;
      P.fill.material.color.setHex(this.colorOf(P.owner));
    }
  }

  // the point the player stands in, if any
  playerIn() {
    const p = this.game.player;
    if (!p.alive) return null;
    for (const P of this.list) if (this.inside(P, p)) return P;
    return null;
  }

  // where a point's marker goes on screen (null: not in front)
  screenOf(P, cam, out) {
    _p.set(P.x, P.y + P.top + 3.4, P.z).project(cam);
    out.x = _p.x; out.y = _p.y; out.behind = _p.z > 1;
    return out;
  }
}

// the cloth: white with a star, coloured by the material
let FLAG = null;
function flagTexture() {
  if (FLAG) return FLAG;
  const c = document.createElement('canvas'); c.width = 128; c.height = 80;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 80);
  x.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < 128; i += 16) x.fillRect(i, 0, 8, 80);
  x.fillStyle = '#1c1c1c'; x.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 11 : 27; x.lineTo(64 + Math.cos(a) * r, 42 + Math.sin(a) * r); }
  x.closePath(); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (FLAG = t);
}
