import * as THREE from 'three';

// =============================================================================
// Wingman: two points, A and B, each a circle with a flag pole in the middle.
// Whoever stands in a circle alone (with a teammate: faster) takes it; with
// both teams in it nothing moves. The flag of whoever is taking it goes up the
// pole, the owner's flag flies at the top. One team holding both ends the round.
// Where the points are: the map's own wingman list, or SPOTS below for the maps
// that were built before the mode existed.
// =============================================================================
export const CAPTURE = 10;    // seconds for one player to take a point (two: a third faster), enough for the others to come back
const DECAY = 8;              // seconds for a half-taken point to fall back once nobody is on it
const COLORS = { own: 0x48b8ff, enemy: 0xff4a3a, none: 0xe8e8e8 }; // (as in the HUD)

// [x, y, z, radius, top] per point, A first. y: the floor. top: where the flag stands above the floor, when something
// stands in the middle (a cistern, a well): the flag goes on its roof and the circle is the yard around it.
// Measured so both teams walk the same distance, and no spawn sees one.
export const SPOTS = {
  sirocco: [[0, 0, -18, 4.8, 3.25], [0, 0, 16.6, 4.6, 4.1]], // the caravanserai's cistern, the well
  atrium: [[0, 0, 13], [0, 0, -12.5]],     // the server room, the main entrance
  dynamo: [[-17, 0, 0], [29.5, 0, 0]],     // by the coal heap, behind the control house in the switchyard
  blacksite: [[0, 3.15, -18, 2.4], [0, 0.35, 17.8, 4.0, 2.35]], // up on the guard tower, around the helicopter
  citadel: [[-22, 0, 0], [22, 0, 0]],      // the market street, the east street
  backrooms: [[0, 0, -14], [0, 0, 15.5]],  // the pale rooms, the office partitions
  drydock: [[0, 0, -20], [0, 0, 20]],      // north and south of the warehouse (big: long ways)
};
export function pointsOf(def) { return def.wingman || SPOTS[def.id] || null; }

const _p = new THREE.Vector3();

export class Points {
  constructor(game, spots) {
    this.game = game;
    this.list = spots.map(([x, y, z, r = 3.5, top = 0], i) => this.eyesOf({ id: 'AB'[i], i, x, y, z, r, top, owner: -1, cap: -1, k: 0, n: [0, 0], contested: false }));
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
      const ring = new THREE.Mesh(new THREE.RingGeometry(P.r - 0.16, P.r, 48).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: COLORS.none, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      ring.position.y = 0.03; ring.renderOrder = 1;
      const fill = new THREE.Mesh(new THREE.CircleGeometry(P.r - 0.16, 48).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: COLORS.none, transparent: true, opacity: 0.07, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      fill.position.y = 0.025; fill.renderOrder = 1;
      // under a low ceiling (the Backrooms) the pole ends just below it, and the flag climbs only that far
      const up = g.col.raycast(P.x, P.y + P.top + 0.3, P.z, 0, 1, 0, 3.2, {}), H = up ? Math.min(3.2, up.t + 0.22) : 3.2;
      P.flagTop = H - 0.35;
      const stand = new THREE.Mesh(poleG, pole); stand.scale.y = H / 3.2; stand.position.y = P.top + H / 2;
      const foot = new THREE.Mesh(footG, pole); foot.position.y = P.top + 0.07;
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7).translate(0.58, 0, 0), new THREE.MeshBasicMaterial({ map: flagTexture(P.id), side: THREE.DoubleSide }));
      flag.position.y = P.top + 0.6;
      root.add(ring, fill, stand, foot, flag);
      P.ring = ring; P.fill = fill; P.flag = flag;
      g.scene.add(root);
    }
  }

  dispose() { for (const P of this.list) if (P.root) this.game.scene.remove(P.root); }

  // whose colour, seen from the player's team
  colorOf(team) { return team < 0 ? COLORS.none : team === this.game.player.team ? COLORS.own : COLORS.enemy; }

  // ---- the rules (only where they are decided: alone, or on the PC that runs the bots)
  // returns the team that now holds both, or -1
  update(dt) {
    const g = this.game;
    for (const P of this.list) {
      P.n[0] = 0; P.n[1] = 0;
      for (const c of g.combatants) {
        if (!c.alive || (c.team !== 0 && c.team !== 1) || !this.inside(P, c)) continue;
        P.n[c.team]++;
      }
      const [a, b] = P.n;
      P.contested = a > 0 && b > 0;
      if (P.contested) continue; // (both teams in the circle: nothing moves)
      const T = a > 0 ? 0 : b > 0 ? 1 : -1;
      if (T < 0) {
        // nobody: a half-taken point slowly falls back
        if (P.k > 0) { P.k = Math.max(0, P.k - dt / DECAY); if (!P.k) P.cap = -1; }
        continue;
      }
      if (P.owner === T) {
        // the owners stand on it: whatever the others had started is undone quickly
        if (P.k > 0) { P.k = Math.max(0, P.k - dt / 1.5); if (!P.k) P.cap = -1; }
        continue;
      }
      if (P.cap !== T) { P.cap = T; P.k = 0; }
      P.k += dt / CAPTURE * (P.n[T] > 1 ? 1.5 : 1);
      if (P.k >= 1) { P.owner = T; P.cap = -1; P.k = 0; this.taken(P, T); }
    }
    const [A, B] = this.list;
    return A.owner >= 0 && A.owner === B.owner ? A.owner : -1;
  }

  // in the circle, near its floor, and seen from one of the point's eyes (see eyesOf)
  inside(P, c) {
    const dx = c.pos.x - P.x, dz = c.pos.z - P.z;
    if (dx * dx + dz * dz > P.r * P.r || Math.abs(c.pos.y - P.y) > 1.6) return false; // (one floor: not from the room underneath)
    const col = this.game.col;
    for (const e of P.eyes) if (col.lineClear(e[0], e[1], e[2], c.pos.x, c.pos.y + 1.0, c.pos.z)) return true;
    return false;
  }

  // a point changes hands: everybody hears it
  taken(P, T) {
    const g = this.game, own = T === g.player.team;
    if (own) { g.hud.popup('PUNKT ' + P.id, 'EINGENOMMEN', true); g.audio.play('chargeFwd', { vol: 0.8 }); }
    else { g.hud.message(`<span style="font-size:22px;color:#ff6a5a">GEGNER HABEN PUNKT ${P.id}</span>`, 2.2); g.audio.play('coverClose', { vol: 0.9, rate: 0.8 }); }
    if (this.onTaken) this.onTaken(P, T);
  }

  // ---- over the network: [owner, who is taking it, how far] per point
  pack() { return this.list.map((P) => [P.owner, P.cap, Math.round(P.k * 100), P.contested ? 1 : 0]); }
  unpack(s) {
    if (!Array.isArray(s)) return;
    this.list.forEach((P, i) => {
      const v = s[i];
      if (!v) return;
      const was = P.owner;
      P.owner = v[0]; P.cap = v[1]; P.k = v[2] / 100; P.contested = !!v[3];
      if (P.owner !== was && P.owner >= 0) this.taken(P, P.owner);
    });
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

// the cloth: white with the letter, coloured by the material
const FLAGS = {};
function flagTexture(id) {
  if (FLAGS[id]) return FLAGS[id];
  const c = document.createElement('canvas'); c.width = 128; c.height = 80;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 80);
  x.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < 128; i += 16) x.fillRect(i, 0, 8, 80);
  x.fillStyle = '#1c1c1c'; x.font = 'bold 62px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(id, 64, 43);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (FLAGS[id] = t);
}
