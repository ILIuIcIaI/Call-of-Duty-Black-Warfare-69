import * as THREE from 'three';
import { BombModel } from './bomb.js';
import { buildHands } from '../weapons/models.js';
import { Shop, ECON } from './sdshop.js';

// =============================================================================
// Search and Destroy. Two teams, one bomb, no respawn within a round:
//   - the attackers carry the bomb to one of two sites and plant it there; the defenders stop them
//   - attackers win a round by killing all defenders or when the planted bomb goes off
//   - defenders win by killing all attackers before the bomb is down, by defusing it, or when the round
//     time runs out with nothing planted (a planted bomb keeps the round going even with no attacker left)
//   - ROUNDS rounds; after HALF of them the sides switch; whoever has more than half has won (4 of 6, so it can end early);
//     at 3 : 3 one more round decides, with the attackers drawn by lot
// Alone it all runs here; over the network the computer with the bots runs it and tells the others (see Net).
// =============================================================================
export const SD = {
  FREEZE: 8, ROUND: 105, BOMB: 40, PLANT: 3.2, DEFUSE: 7, POST: 5, ROUNDS: 6, HALF: 3,
  BLAST: 9, BLAST_FAR: 22, SIZES: [4, 5, 6],
};
const SITES = ['A', 'B'];
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();
const _m4 = new THREE.Matrix4(), UPY = new THREE.Vector3(0, 1, 0);
// (on a back: the case flat against it, the panel facing out)
const ON_BACK = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));

// What the player's body and gun get to see of the input while he is held still: before the round begins, and
// while he plants or defuses. Looking around stays his.
const STILL = new Set(['forward', 'back', 'left', 'right', 'jump', 'sprint', 'dive', 'crouch', 'mount', 'reload', 'swap', 'weapon1', 'weapon2', 'melee', 'inspect', 'plate']);
class HeldInput {
  down(a) { return STILL.has(a) ? false : this.inp.down(a); }
  pressed(a) { return STILL.has(a) ? false : this.inp.pressed(a); }
  released(a) { return this.inp.released(a); }
  get fire() { return false; }
  get firePressed() { return false; }
  get ads() { return false; }
  get wheel() { return 0; }
  get dx() { return this.inp.dx; }
  get dy() { return this.inp.dy; }
  get suppress() { return this.inp.suppress; }
  set suppress(v) { this.inp.suppress = v; }
}

// Planting and defusing as you see it yourself: the gun goes away, you look down at the bomb on the floor in
// front of you, the left hand steadies it and the right one types; defusing ends with the red wire torn out.
// The hands are in the world, next to the bomb everybody else sees.
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
class HandsAtWork {
  constructor(game) {
    // a gloved hand, fingers along -Z, and a forearm from the wrist that is turned toward its shoulder every frame
    const M = game.weapons.vm.mats;
    // (the typing hand points its index finger, the others curled in; the other hand lies flat on the case)
    const hand = (mirror, point) => {
      const g = new THREE.Group();
      const add = (geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; g.add(m); return m; };
      add(new THREE.BoxGeometry(0.082, 0.03, 0.088), M.glove, 0, 0, 0);
      for (const [x, L, i] of [[-0.028, 0.05, 0], [-0.0095, 0.06, 1], [0.0095, 0.058, 2], [0.028, 0.048, 3]]) {
        if (point && i > 0) add(new THREE.CapsuleGeometry(0.0098, 0.022, 4, 8), M.glove, x, -0.014, -0.05, Math.PI / 2 + 1.25);
        else add(new THREE.CapsuleGeometry(0.0095, L * (point ? 0.95 : 0.7), 4, 8), M.glove, x, -0.006, -0.044 - L * (point ? 0.55 : 0.42), Math.PI / 2 + (point ? 0.12 : 0.3));
      }
      add(new THREE.CapsuleGeometry(0.0105, 0.03, 4, 8), M.glove, 0.048 * mirror, -0.006, -0.012, Math.PI / 2).rotation.z = 0.6 * mirror;
      const arm = new THREE.Group(); arm.position.set(0, 0.004, 0.046); g.add(arm);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.045, 12), M.glove); cuff.position.y = 0.02; arm.add(cuff);
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.64, 12), M.sleeve); sleeve.position.y = 0.36; arm.add(sleeve); // (long enough to run out of the picture)
      return { g, arm };
    };
    const hl = hand(1, false), hr = hand(-1, true);
    this.left = hl.g; this.right = hr.g;
    this.arms = [{ open: hl.g, arm: hl.arm }, { open: hr.g, arm: hr.arm }];
    void buildHands;
    this.inv = new THREE.Matrix4();
    this.root = new THREE.Group();
    this.root.add(this.left, this.right);
    this.root.visible = false;
    game.scene.add(this.root);
    this.k = 0;
  }
  dispose() { if (this.root.parent) this.root.parent.remove(this.root); }
  // w: the work under way (or null), bomb: the BombModel, p: the player
  update(dt, w, bomb, p, cam) {
    const on = !!(w && w.ent === p);
    this.k = Math.max(0, Math.min(1, this.k + (on ? dt / 0.3 : -dt / 0.2)));
    this.root.visible = this.k > 0.01;
    if (!this.root.visible) { bomb.wires[0].position.set(0, 0, 0); return; }
    const R = bomb.root;
    R.updateWorldMatrix(true, false);
    // toward the player, sideways and up, from the bomb's point of view
    const yaw = R.rotation.y, toP = _a.set(Math.sin(yaw), 0, Math.cos(yaw)), side = _b.set(Math.cos(yaw), 0, -Math.sin(yaw));
    const from = _c.copy(cam.position).addScaledVector(toP, -0.15).add(_v.set(0, -0.5, 0)); // (where the hands come from and go back to)
    const ease = this.k * this.k * (3 - 2 * this.k);
    // left hand flat on the case, fingers forward and a little right
    const L = this.left;
    _w.copy(R.position).addScaledVector(side, -0.15).addScaledVector(toP, 0.02).add(_v.set(0, 0.09, 0));
    L.position.copy(from).lerp(_w, ease);
    L.rotation.set(-0.3, yaw + 0.55, 0, 'YXZ');
    // right hand: over the key being pressed, down onto it while it is lit; defusing ends with the red wire
    const Rh = this.right;
    let target;
    if (w && w.kind === 'defuse' && w.t > w.need - 1.3) {
      const u = Math.min(1, (w.t - (w.need - 1.3)) / 1.1), pull = Math.max(0, (u - 0.45) / 0.55);
      target = _w.set(-0.035, 0.08 + pull * 0.09, 0.0).applyMatrix4(R.matrixWorld).addScaledVector(toP, 0.06 + pull * 0.1);
      bomb.wires[0].position.set(0, pull * 0.08, pull * 0.1);
      bomb.wires[0].visible = pull < 0.98;
    } else {
      const key = w && bomb.lit >= 0 ? bomb.lit : w && w.key >= 0 ? w.key : 4;
      bomb.keyTop(key, _w).applyMatrix4(R.matrixWorld);
      target = _w.addScaledVector(toP, 0.07).addScaledVector(side, 0.035).add(_v.set(0, bomb.lit >= 0 ? 0.03 : 0.06, 0));
    }
    Rh.position.copy(from).lerp(target, ease);
    Rh.rotation.set(-0.55, yaw - 0.45, 0, 'YXZ');
    // the forearms: from the wrist back to a shoulder a little below and beside the eyes
    const e = cam.matrixWorld.elements;
    this.arms.forEach(({ open, arm }, i) => {
      const s = i === 0 ? -1 : 1;
      _w.set(cam.position.x + e[0] * 0.4 * s - e[4] * 0.45 + e[8] * 0.12, cam.position.y + e[1] * 0.4 * s - e[5] * 0.45 + e[9] * 0.12, cam.position.z + e[2] * 0.4 * s - e[6] * 0.45 + e[10] * 0.12);
      open.updateWorldMatrix(true, false);
      _w.applyMatrix4(this.inv.copy(open.matrixWorld).invert()).sub(arm.position).normalize();
      arm.quaternion.setFromUnitVectors(UP, _w);
    });
  }
}
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// The sites and the spawns of both sides: the map's own (`sd`), or for trying it out on a map that has none (dev)
// two spots on the defenders' half, the ones furthest apart.
export function sdOf(def) {
  if (def.sd) {
    const S = def.sd.sites;
    return { sites: SITES.map((id) => ({ id, x: S[id][0], y: S[id][1], z: S[id][2], r: S[id][3] })), attack: def.sd.attack, defend: def.sd.defend };
  }
  const sp = def.spawns(), att = sp[0], dfd = sp[1];
  const mid = (l) => l.reduce((a, s) => ({ x: a.x + s[0] / l.length, z: a.z + s[2] / l.length }), { x: 0, z: 0 });
  const A = mid(att), Dm = mid(dfd);
  // (on the ground: a spot on a roof or a container would be a site nobody can stand on from below)
  const hs = (def.hotspots || []).filter((h) => h[1] < 0.6 && Math.hypot(h[0] - Dm.x, h[2] - Dm.z) < Math.hypot(h[0] - A.x, h[2] - A.z) && Math.hypot(h[0] - Dm.x, h[2] - Dm.z) > 6);
  let best = null, bd = -1;
  for (const a of hs) for (const b of hs) { const d = Math.hypot(a[0] - b[0], a[2] - b[2]); if (d > bd) { bd = d; best = [a, b]; } }
  if (!best) best = [[Dm.x - 8, 0, Dm.z], [Dm.x + 8, 0, Dm.z]];
  return { sites: best.map((h, i) => ({ id: SITES[i], x: h[0], y: h[1], z: h[2], r: 4.5 })), attack: att, defend: dfd };
}

export class SearchDestroy {
  constructor(game, match) {
    this.game = game; this.match = match;
    const d = sdOf(game.mapDef);
    this.sites = d.sites;
    const pts = (l) => l.map(([x, y, z, yaw]) => ({ x, y, z, yaw }));
    this.spawnList = { attack: pts(d.attack), defend: pts(d.defend) };
    this.score = [0, 0];
    this.round = 0;
    this.attack = match.cfg.attack ?? 0; // (the player's team carries the bomb first)
    this.phase = 'wait'; this.left = 0;
    this.carrier = null; this.dropped = null; this.planted = null;
    this.work = null;
    this.used = new Set();
    this.final = -1;
    this.targetSite = null; this.defuser = null; this.fetcher = null;
    this.beepT = 0;
    this.bomb = new BombModel(); this.bomb.root.visible = false; game.scene.add(this.bomb.root);
    this.packed = new BombModel(); this.packed.root.visible = false; game.scene.add(this.packed.root);
    this.packed.root.scale.setScalar(0.92);
    this.spectate = null; this.specT = 0;
    this.el = null;
    this.hands = new HandsAtWork(game);
    this.shop = new Shop(this);
  }

  // while you plant or defuse: no gun in your hands, and your eyes on the bomb
  hidesGun() { return this.hands.root.visible; }
  // kneeling at it: the eyes go down closer to the bomb and onto it
  workCam(cam) {
    const k = this.hands.k, e = k * k * (3 - 2 * k), B = this.bomb.root.position;
    if (e <= 0.001) return;
    _v.set(B.x - cam.position.x, 0, B.z - cam.position.z).normalize();
    cam.position.x += _v.x * 0.16 * e; cam.position.z += _v.z * 0.16 * e; cam.position.y -= 0.3 * e;
    _m4.lookAt(cam.position, _w.set(B.x, B.y + 0.07, B.z), UPY);
    _q.setFromRotationMatrix(_m4);
    cam.quaternion.slerp(_q, e);
  }
  lookAtWork(dt) {
    const g = this.game, p = g.player, w = this.work;
    if (!w || w.ent !== p) return;
    const B = this.bomb.root.position, eye = p.pos.y + (p.eyeH ?? 1.05);
    const yaw = Math.atan2(-(B.x - p.pos.x), -(B.z - p.pos.z)), pitch = -Math.atan2(eye - B.y, Math.max(0.2, flat(p.pos, B)));
    let dy = yaw - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const k = 1 - Math.exp(-7 * dt);
    p.yaw += dy * k; p.pitch += (Math.max(-1.25, pitch + 0.3) - p.pitch) * k;
  }

  dispose() {
    this.bomb.dispose(); this.packed.dispose(); this.hands.dispose(); this.shop.dispose();
    document.getElementById('sb-timer').classList.remove('bomb');
    document.getElementById('hud').classList.remove('sd-working');
    document.getElementById('death-screen').classList.remove('watching');
    if (this.el) { this.el.remove(); this.el = null; }
    if (this.marks) for (const m of this.marks) m.remove();
    this.marks = null;
  }

  role(team) { return team === this.attack ? 'attack' : 'defend'; }

  // ---- over the network the PC with the bots decides the rounds and tells the others (snapshot); they follow it,
  // and what their own player does to the bomb they say as an event (plant, defuse, pick, work)
  get net() { const n = this.game.net; return n && n.inMatch ? n : null; }
  get auth() { const n = this.net; return !n || n.isAuth; }
  idOf(c) { const g = this.game; return !c ? null : c === g.player ? (this.net ? this.net.you : 'me') : c.netId || null; }
  byId(id) { const g = this.game, n = this.net; return !id || !n ? null : id === n.you ? g.player : n.byId.get(id) || null; }
  changed() { this.dirty = true; }
  send(a, extra = {}) { if (this.net) this.net.send({ t: 'ev', k: 'sd', a, ...extra }); }
  snapshot() {
    const P = this.planted, W = this.work || this.remoteWork, r2 = (v) => +v.toFixed(2);
    return { r: this.round, ph: this.phase, l: +this.left.toFixed(1), sc: [this.score[0], this.score[1]], a: this.attack, c: this.idOf(this.carrier),
      d: this.dropped ? [r2(this.dropped.x), r2(this.dropped.y), r2(this.dropped.z)] : null,
      p: P ? { s: P.site.id, x: r2(P.pos.x), y: r2(P.pos.y), z: r2(P.pos.z), w: r2(P.yaw), l: +P.left.toFixed(1), ok: !!P.done, by: this.idOf(P.by) } : null,
      w: W && W.ent ? { i: this.idOf(W.ent), k: W.kind, t: +(W.t || 0).toFixed(1) } : null,
      res: this.result || null, f: this.final };
  }
  // (sent when something changes, and once a second for the clocks; the end with the winner)
  sync(dt) {
    const n = this.net;
    if (!n || !n.isAuth) return;
    this.syncT = (this.syncT || 0) - dt;
    if (!this.dirty && this.syncT > 0) return;
    this.dirty = false; this.syncT = 1;
    const s = this.snapshot();
    n.send(this.phase === 'over' && this.final >= 0 ? { t: 'obj', s, win: this.final } : { t: 'obj', s });
  }
  // a PC that doesn't run the bots: the round as the one that does sees it
  apply(s) {
    if (!s || this.auth) return;
    const g = this.game;
    if (s.r > this.round || (this.phase === 'wait' && s.r >= 1)) this.followRound(s);
    this.attack = s.a; this.score = [s.sc[0], s.sc[1]]; this.final = s.f;
    const car = s.c ? this.byId(s.c) : null;
    if (car !== this.carrier) { this.carrier = car; if (car === g.player && s.ph !== 'post') g.hud.popup('', 'DU HAST DIE BOMBE'); }
    this.dropped = s.d ? new THREE.Vector3(s.d[0], s.d[1], s.d[2]) : null;
    if (s.p && !this.planted) {
      const site = this.sites.find((x) => x.id === s.p.s) || this.sites[0], by = this.byId(s.p.by);
      if (this.work && this.work.ent === g.player) this.stopWork();
      this.showPlant({ site, pos: new THREE.Vector3(s.p.x, s.p.y, s.p.z), yaw: s.p.w }, by);
      if (by === g.player) this.shop.pay(g.player, ECON.PLANT, 'BOMBE GELEGT');
    }
    if (this.planted && s.p) { this.planted.left = s.p.l; this.planted.done = s.p.ok; }
    const w = s.w ? this.byId(s.w.i) : null;
    this.remoteWork = w && w !== g.player ? { ent: w, kind: s.w.k, t: s.w.t } : null;
    if (s.ph === 'live' && this.phase === 'freeze') g.audio.play('spawn', { vol: 0.6 });
    if (s.ph === 'post' && s.res && this.resultRound !== s.r) { this.resultRound = s.r; this.roundOver(s.res.team, s.res.how, this.byId(s.res.by)); }
    this.phase = s.ph; this.left = s.l;
  }
  // what the others say their player did; only the PC with the bots decides on it (the rest is to see)
  onNet(m) {
    const g = this.game, e = this.byId(m.from);
    if (m.a === 'wdrop') { this.shop.netDrop(m); return; }
    if (m.a === 'work') { this.remoteWork = m.on && e ? { ent: e, kind: m.kind, t: 0 } : null; if (this.auth) this.changed(); return; }
    if (!this.auth || !e) return;
    if (m.a === 'plant' && this.phase === 'live' && e === this.carrier && m.p) {
      const site = this.sites.find((x) => x.id === m.s) || this.inSite(e) || this.sites[0];
      this.plantAt(e, { site, pos: new THREE.Vector3(m.p[0], m.p[1], m.p[2]), yaw: +m.y || 0 });
    } else if (m.a === 'defuse' && this.phase === 'planted' && !this.planted.done && e.team !== this.attack && flat(e.pos, this.planted.pos) < 2.5) {
      this.remoteWork = null;
      this.defuse(e);
    } else if (m.a === 'pick' && this.phase === 'live' && this.dropped && e.team === this.attack && !this.carrier) {
      this.carrier = e; this.dropped = null; this.fetcher = null; this.changed();
      g.audio.play('pouch', { pos: e.pos, vol: 0.9 });
    }
  }
  holdsPlayer() { return this.phase === 'freeze' || (!!this.work && this.work.ent === this.game.player); }
  heldInput(inp) { const H = this.held || (this.held = new HeldInput()); H.inp = inp; return H; }
  aliveOf(team) { let n = 0; for (const c of this.game.combatants) if (c.alive && c.team === team) n++; return n; }
  inSite(e) {
    for (const s of this.sites) if (flat(e.pos, s) < s.r && Math.abs(e.pos.y - s.y) < 1.1) return s;
    return null;
  }

  // ---- spawns: each one once per round, the order mixed
  spawnFor(ent) {
    const list = this.spawnList[this.role(ent.team)];
    if (this.net) {
      const side = this.game.combatants.filter((c) => c.team === ent.team).map((c) => [c.isBot || (c.remote && this.net.cfg && (this.net.cfg.roster.find((r) => r.id === c.netId) || {}).bot) ? 1 : 0, this.idOf(c) || '']).sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1)).map((x) => x[1]);
      const p = list[Math.max(0, side.indexOf(this.idOf(ent))) % list.length];
      return { x: p.x, y: p.y, z: p.z, yaw: p.yaw, team: ent.team };
    }
    const free = list.filter((p) => !this.used.has(p));
    const p = (free.length ? free : list)[(Math.random() * (free.length || list.length)) | 0];
    this.used.add(p);
    return { x: p.x, y: p.y, z: p.z, yaw: p.yaw, team: ent.team };
  }

  // ---- rounds
  startRound() {
    const g = this.game;
    this.round++;
    if (this.round === SD.HALF + 1) this.attack = 1 - this.attack;
    if (this.round === SD.ROUNDS + 1) this.attack = Math.random() < 0.5 ? 0 : 1; // (3 : 3: the decider, sides by lot)
    this.resetRound();
    const att = g.combatants.filter((c) => c.team === this.attack), up = att.filter((c) => c.alive), from = up.length ? up : att;
    this.carrier = from.length ? from[(Math.random() * from.length) | 0] : null;
    this.targetSite = this.sites[(Math.random() * this.sites.length) | 0];
    this.changed();
    this.announceRound();
    if (this.carrier === g.player) g.hud.popup('', 'DU HAST DIE BOMBE');
  }
  followRound(s) {
    this.round = s.r; this.attack = s.a;
    this.resetRound();
    this.carrier = null;
    this.announceRound();
  }
  resetRound() {
    const g = this.game, m = this.match;
    this.phase = 'freeze'; this.left = SD.FREEZE;
    this.result = null; this.remoteWork = null; this.pending = null;
    this.used.clear();
    this.shop.startRound(this.round, this.round === SD.HALF + 1, this.round === SD.ROUNDS + 1);
    this.botsBought = false;
    this.planted = null; this.dropped = null; this.work = null; this.defuser = null; this.fetcher = null;
    this.bomb.root.visible = false; this.bomb.setLed(false); this.bomb.setCode('');
    this.bomb.wires[0].visible = true; this.bomb.wires[0].position.set(0, 0, 0);
    this.spectate = null;
    document.getElementById('death-screen').classList.remove('watching');
    if (g.playerCorpse) g.playerCorpse.setVisible(false);
    // everybody up again, at his side's spawns
    for (const c of g.combatants) {
      if (c.remote) continue;
      if (c === g.player) { g.spawnPlayer(); g.weapons.vm.root.visible = true; } else { m.spawn(c); this.shop.armBot(c); c.hold = true; c.busy = false; }
    }
  }
  announceRound() {
    const g = this.game, mine = this.role(g.player.team) === 'attack';
    const half = this.round === SD.HALF + 1 ? '<div style="font-size:15px;letter-spacing:4px;opacity:.85">SEITENWECHSEL</div>' : '';
    const title = this.round > SD.ROUNDS ? 'ENTSCHEIDUNGSRUNDE' : 'RUNDE ' + this.round + ' / ' + SD.ROUNDS;
    g.hud.message(half + '<span style="font-size:26px;letter-spacing:5px">' + title + '</span><div style="font-size:15px;letter-spacing:3px;margin-top:4px">' + (mine ? 'ANGRIFF · LEGT DIE BOMBE AUF A ODER B' : 'VERTEIDIGUNG · HALTET A UND B') + '</div>', SD.FREEZE - 0.5);
  }

  endRound(team, how, by = null) {
    this.score[team]++;
    this.result = { team, how, by: this.idOf(by) };
    this.resultRound = this.round;
    if (this.score[team] > SD.ROUNDS / 2 || this.round > SD.ROUNDS) this.final = team;
    this.changed();
    this.roundOver(team, how, by);
  }
  roundOver(team, how, by) {
    const g = this.game;
    if (!this.auth && how === 'boom' && this.planted) this.explode();
    if (!this.auth && how === 'defused' && this.planted) { this.bomb.setLed('green'); this.bomb.setCode('-- --', '#7dff6a'); this.planted.done = true; if (by === g.player) this.shop.pay(g.player, ECON.DEFUSE, 'ENTSCHÄRFT'); }
    this.phase = 'post'; this.left = SD.POST;
    this.shop.endRound(team, how, !!this.planted);
    this.stopWork();
    const mine = team === g.player.team, att = team === this.attack;
    const why = how === 'boom' ? 'DIE BOMBE IST EXPLODIERT' : how === 'defused' ? 'DIE BOMBE WURDE ENTSCHÄRFT' : how === 'time' ? 'DIE ZEIT IST UM' : att ? 'ALLE VERTEIDIGER AUSGESCHALTET' : 'ALLE ANGREIFER AUSGESCHALTET';
    g.hud.message('<span style="font-size:30px;letter-spacing:5px;color:' + (mine ? 'var(--accent)' : 'var(--enemy)') + '">' + (mine ? 'RUNDE GEWONNEN' : 'RUNDE VERLOREN') + '</span><div style="font-size:15px;letter-spacing:3px;margin-top:4px">' + why + ' · ' + this.score[g.player.team] + ' : ' + this.score[1 - g.player.team] + '</div>', SD.POST - 0.3);
    g.audio.play(mine ? 'chargeFwd' : 'magDrop', { vol: 0.8 });
  }

  // ---- the bomb
  dropAt(pos) {
    const g = this.game;
    const y = g.col.floorBelow(pos.x, pos.z, 0.15, pos.y + 1.2, pos.y - 30);
    this.dropped = new THREE.Vector3(pos.x, Number.isFinite(y) ? y : pos.y, pos.z);
    this.fetcher = null;
    this.changed();
  }

  plantedAt(ent) {
    const g = this.game, site = this.inSite(ent) || this.sites[0];
    // in front of his feet, on the floor
    const yaw = ent.isPlayer ? ent.yaw : ent.aimYaw;
    const x = ent.pos.x - Math.sin(yaw) * 0.52, z = ent.pos.z - Math.cos(yaw) * 0.52;
    const fy = g.col.floorBelow(x, z, 0.12, ent.pos.y + 0.6, ent.pos.y - 2);
    const ok = Number.isFinite(fy) && Math.abs(fy - ent.pos.y) < 0.6 && g.col.lineClear(ent.pos.x, ent.pos.y + 0.3, ent.pos.z, x, fy + 0.1, z);
    return { site, pos: ok ? new THREE.Vector3(x, fy, z) : new THREE.Vector3(ent.pos.x, ent.pos.y, ent.pos.z), yaw };
  }

  plant(ent) { this.plantAt(ent, this.plantedAt(ent)); }
  plantAt(ent, at) {
    this.showPlant(at, ent);
    this.shop.pay(ent, ECON.PLANT, 'BOMBE GELEGT');
    this.changed();
  }
  showPlant(at, ent) {
    const g = this.game;
    this.planted = { site: at.site, pos: at.pos, yaw: at.yaw, left: SD.BOMB, by: ent };
    this.carrier = null; this.dropped = null; this.pending = null;
    this.phase = 'planted';
    this.beepT = 0;
    this.bomb.root.position.copy(at.pos); this.bomb.root.rotation.set(0, at.yaw, 0);
    this.bomb.root.visible = true; this.bomb.setLed(true); this.bomb.setCode('ARMED', '#ff5a4a');
    this.defuser = null;
    g.audio.play('chargeFwd', { pos: at.pos, vol: 1.2, rate: 0.7 });
    const mine = (ent ? ent.team : this.attack) === g.player.team;
    g.hud.message('<span style="font-size:24px;letter-spacing:4px;color:' + (mine ? 'var(--accent)' : 'var(--enemy)') + '">BOMBE GELEGT · ' + at.site.id + '</span>', 2.6);
  }

  defuse(by) {
    const g = this.game;
    this.shop.pay(by, ECON.DEFUSE, 'ENTSCHÄRFT');
    this.bomb.setLed('green'); this.bomb.setCode('-- --', '#7dff6a');
    g.audio.play('coverOpen', { pos: this.planted.pos, vol: 1.4 });
    this.planted.done = true;
    this.endRound(1 - this.attack, 'defused', by);
  }

  explode() {
    const g = this.game, P = this.planted.pos;
    this.bomb.root.visible = false;
    const at = _v.set(P.x, P.y + 0.4, P.z);
    for (let i = 0; i < 4; i++) g.fx.explosion(_w.set(at.x + (Math.random() - 0.5) * 3, at.y + Math.random() * 1.5, at.z + (Math.random() - 0.5) * 3));
    g.audio.play('boom', { pos: P, vol: 2.4, maxDist: 400, occlude: false });
    g.audio.play('gun_amr', { pos: P, vol: 1.8, rate: 0.45, maxDist: 400, occlude: false });
    g.shake.add(Math.max(0.15, 1.4 - g.player.pos.distanceTo(P) * 0.03));
    for (const c of g.combatants) {
      if (!c.alive || c.remote) continue;
      const d = c.pos.distanceTo(P);
      if (d > SD.BLAST_FAR) continue;
      const dmg = d < SD.BLAST ? 999 : 999 * (1 - (d - SD.BLAST) / (SD.BLAST_FAR - SD.BLAST)) ** 1.5;
      g.applyDamage(c, dmg, null, { part: 'chest', dir: _w.copy(c.pos).sub(P).setY(0.4).normalize().clone(), point: c.pos.clone(), weapon: { name: 'BOMBE', damage: [999, 999] } });
    }
  }

  // ---- planting and defusing: the player holding F, or a bot (see botWork)
  canWork(e) {
    if (!e.alive) return null;
    if (this.phase === 'live' && e === this.carrier && this.inSite(e) && (e.isBot || e.onGround)) return 'plant';
    if (this.phase === 'planted' && !this.planted.done && e.team !== this.attack && flat(e.pos, this.planted.pos) < 1.5 && Math.abs(e.pos.y - this.planted.pos.y) < 1.3) {
      if (this.work && this.work.kind === 'defuse' && this.work.ent !== e) return null; // (one at a time)
      return 'defuse';
    }
    return null;
  }

  startWork(e, kind) {
    const g = this.game;
    this.work = { ent: e, kind, t: 0, need: kind === 'plant' ? SD.PLANT : SD.DEFUSE, keyT: 0, key: -1 };
    if (e.isBot) e.busy = true;
    if (e === g.player) {
      this.work.stance = e.stance;
      if (e.stance === 'stand') e.stance = 'crouch';
      if (kind === 'plant') { this.bomb.setCode(''); this.bomb.setLed(false); }
    }
    if (kind === 'plant') { this.bomb.root.position.copy(this.plantedAt(e).pos); this.bomb.root.rotation.set(0, e.isPlayer ? e.yaw : e.aimYaw, 0); this.bomb.setCode(''); }
    g.audio.play('pouch', { pos: e.pos, vol: 0.9 });
    if (kind === 'defuse') this.defuser = e;
    if (e === g.player) this.send('work', { on: 1, kind }); else this.changed();
  }

  stopWork() {
    const w = this.work;
    if (!w) return;
    this.work = null;
    if (w.ent.isBot) w.ent.busy = false;
    if (w.ent === this.game.player) this.send('work', { on: 0 }); else this.changed();
    if (w.ent === this.game.player && w.stance === 'stand' && w.ent.canStand && w.ent.canStand('stand')) w.ent.stance = 'stand';
    this.bomb.press(-1);
    if (w.kind === 'plant' && this.phase !== 'planted' && !this.pending) { this.bomb.root.visible = false; this.bomb.setCode(''); }
  }

  updateWork(dt) {
    const g = this.game, p = g.player, w = this.work;
    if (w) {
      const e = w.ent;
      const holding = e === p ? g.input.down('interact') && !g.paused : !(e.target && e.targetVisible && e.target.alive);
      if (!holding || this.canWork(e) !== w.kind) { this.stopWork(); return; }
      w.t += dt;
      // the keys: one every so often, a beep each (planting types the code in, defusing types it back out)
      w.keyT -= dt;
      if (w.keyT <= 0) {
        w.key = (Math.random() * 12) | 0; w.keyT = w.kind === 'plant' ? 0.32 : 0.45;
        this.bomb.press(w.key);
        if (w.kind === 'plant') this.bomb.setCode(('*'.repeat(Math.min(7, Math.floor(w.t / SD.PLANT * 8)))).padEnd(7, '_'));
        g.audio.play('uiClick', { pos: this.bomb.root.position, vol: 0.7, rate: 1.6 + Math.random() * 0.4 });
      } else if (w.keyT < (w.kind === 'plant' ? 0.18 : 0.25)) this.bomb.press(-1);
      if (w.kind === 'plant') this.bomb.root.visible = true;
      if (w.t >= w.need) {
        const kind = w.kind;
        if (!this.auth) {
          // (said, and shown as done until the word comes back)
          const at = kind === 'plant' ? this.plantedAt(e) : null;
          this.pending = kind;
          this.stopWork();
          if (at) { this.send('plant', { s: at.site.id, p: [+at.pos.x.toFixed(2), +at.pos.y.toFixed(2), +at.pos.z.toFixed(2)], y: +at.yaw.toFixed(2) }); this.bomb.root.visible = true; this.bomb.setLed(true); }
          else this.send('defuse');
          return;
        }
        this.stopWork();
        if (kind === 'plant') this.plant(e); else this.defuse(e);
      }
      return;
    }
    // you: hold F
    if (p.alive && g.input.down('interact') && !g.paused && !this.shop.focus && !this.pending) { // (F on a gun on the floor picks it up instead)
      const k = this.canWork(p);
      if (k) this.startWork(p, k);
    }
  }

  // ---- once per frame
  update(dt) {
    const g = this.game, auth = this.auth;
    if (this.phase === 'wait') { if (auth) this.startRound(); this.sync(dt); return; }
    this.left -= dt;
    if (this.phase === 'freeze' && !this.botsBought && this.left < SD.FREEZE - 1.5) { this.botsBought = true; for (const b of g.bots) this.shop.botBuy(b); }
    if (this.phase !== 'post' && this.phase !== 'over') this.shop.update(dt);
    if (this.phase === 'freeze') {
      if (this.left <= 0 && auth) { this.changed(); this.phase = 'live'; this.left = SD.ROUND; for (const b of g.bots) b.hold = false; g.audio.play('spawn', { vol: 0.6 }); }
    } else if (this.phase === 'live' || this.phase === 'planted') {
      // a carrier who falls drops it, the first attacker to step on it picks it up
      if (this.carrier && !this.carrier.alive && auth) { this.dropAt(this.carrier.pos); this.carrier = null; }
      if (this.dropped && this.phase === 'live') {
        for (const c of g.combatants) {
          if (!c.alive || c.team !== this.attack || c.remote || flat(c.pos, this.dropped) > 0.9 || Math.abs(c.pos.y - this.dropped.y) > 1.6) continue;
          if (!auth) { if (c === g.player && g.time > (this.pickT || 0)) { this.pickT = g.time + 0.6; this.send('pick'); } break; }
          this.carrier = c; this.dropped = null; this.fetcher = null; this.changed();
          g.audio.play('pouch', { pos: c.pos, vol: 0.9 });
          if (c === g.player) g.hud.popup('', 'DU HAST DIE BOMBE');
          break;
        }
      }
      if (auth) this.botWork();
      this.updateWork(dt);
      if (this.phase === 'planted') {
        const P = this.planted;
        P.left -= dt;
        // the lamp and the beep, faster and faster
        const k = Math.max(0, P.left / SD.BOMB), every = 0.12 + 0.9 * k * k;
        this.beepT -= dt;
        if (this.beepT <= 0) { this.beepT = every; g.audio.play('dryfire', { pos: P.pos, vol: 1.4, rate: 1.9, maxDist: 60 }); this.bomb.setLed(true); }
        else if (this.beepT < every - 0.06) this.bomb.setLed(false);
        if (this.phase === 'planted' && P.left <= 0 && auth) { this.stopWork(); this.explode(); this.endRound(this.attack, 'boom', P.by); this.sync(dt); return; }
      }
      if (this.phase === 'post' || !auth) { this.sync(dt); this.showCarried(); this.lookAtWork(dt); this.hands.update(dt, this.work, this.bomb, g.player, g.engine.camera); return; }
      if (this.aliveOf(1 - this.attack) === 0) { this.endRound(this.attack, 'elim'); return; }
      if (this.phase === 'live' && this.aliveOf(this.attack) === 0) { this.endRound(1 - this.attack, 'elim'); return; }
      if (this.phase === 'live' && this.left <= 0) { this.endRound(1 - this.attack, 'time'); return; }
    } else if (this.phase === 'post') {
      if (this.left <= 0 && auth) {
        if (this.final >= 0) { this.phase = 'over'; this.changed(); if (this.net) this.sync(dt); else this.match.end(this.final, 'rounds'); return; }
        this.startRound();
      }
    }
    this.sync(dt);
    this.showCarried();
    this.lookAtWork(dt);
    this.hands.update(dt, this.work, this.bomb, g.player, g.engine.camera);
  }

  // the bomb on the carrier's back, or on the floor where he fell; somebody on another computer planting: in front of him
  showCarried() {
    const R = this.packed.root, c = this.carrier, rw = this.remoteWork;
    if (rw && rw.kind === 'plant' && rw.ent && rw.ent.alive && this.phase === 'live' && !this.work) {
      const at = this.plantedAt(rw.ent);
      this.bomb.root.position.copy(at.pos); this.bomb.root.rotation.set(0, at.yaw, 0); this.bomb.root.visible = true;
      R.visible = false;
      return;
    }
    if (this.phase === 'live' && !this.work && !this.pending && !this.planted) this.bomb.root.visible = false;
    if (c && c.alive && !(this.work && this.work.kind === 'plant')) {
      if (c === this.game.player) { R.visible = false; return; }
      const ch = c.soldier && c.soldier.chest;
      if (ch) {
        ch.updateWorldMatrix(true, false);
        R.position.set(0, 0.04, 0.16).applyMatrix4(ch.matrixWorld);
        ch.getWorldQuaternion(_q); R.quaternion.copy(_q).multiply(ON_BACK);
      } else { R.position.set(c.pos.x, c.pos.y + 1.1, c.pos.z); }
      R.visible = true;
    } else if (this.dropped) {
      R.position.copy(this.dropped); R.rotation.set(0, 0.6, 0); R.visible = true;
    } else R.visible = false;
  }

  // ---- bots: where to go (Match.objectiveFor) and when to get down to work
  objectiveFor(b) {
    if (this.phase === 'freeze' || this.phase === 'post' || this.phase === 'over' || this.phase === 'wait') return null;
    const att = b.team === this.attack;
    if (this.phase === 'planted') {
      const P = this.planted.pos;
      if (att) return { x: P.x, y: P.y, z: P.z, r: 7 };
      // the one closest to it defuses, the others come and cover him
      if (!this.defuser || !this.defuser.alive || this.defuser.team === this.attack) this.defuser = this.closest(1 - this.attack, P);
      return b === this.defuser ? { x: P.x, y: P.y, z: P.z, r: 1.2 } : { x: P.x, y: P.y, z: P.z, r: 6 };
    }
    const gun = b !== this.carrier ? this.shop.wantFor(b) : null;
    if (gun) return { x: gun.obj.position.x, y: gun.obj.position.y, z: gun.obj.position.z, r: 0.7 };
    if (att) {
      if (this.dropped) {
        if (!this.fetcher || !this.fetcher.alive) this.fetcher = this.closest(this.attack, this.dropped);
        if (b === this.fetcher) return { x: this.dropped.x, y: this.dropped.y, z: this.dropped.z, r: 0.9 };
      }
      const s = this.targetSite;
      return b === this.carrier ? { x: s.x, y: s.y, z: s.z, r: Math.max(1.4, s.r * 0.5) } : { x: s.x, y: s.y, z: s.z, r: s.r + 3 };
    }
    // defenders: half on each site (by where they stand in the list), all to the bomb once it is down
    const list = this.game.combatants.filter((c) => c.team === b.team);
    const s = this.sites[list.indexOf(b) % this.sites.length];
    return { x: s.x, y: s.y, z: s.z, r: s.r };
  }

  closest(team, P) {
    let best = null, bd = Infinity;
    for (const c of this.game.combatants) { if (!c.alive || c.team !== team || c.remote) continue; const d = c.pos.distanceTo(P); if (d < bd) { bd = d; best = c; } }
    return best;
  }

  botWork() {
    if (this.work) return;
    for (const b of this.game.bots) {
      if (!b.alive || b.remote || (b.target && b.targetVisible && b.target.alive)) continue;
      const k = this.canWork(b);
      if (k === 'plant' || (k === 'defuse' && b === this.defuser)) { this.startWork(b, k); return; }
    }
  }

  // ---- what the round looks like on screen: the panel under the score and the markers in the world
  hud(dt) {
    const g = this.game, p = g.player;
    if (!this.el) {
      this.el = document.createElement('div'); this.el.id = 'sd-panel';
      this.el.innerHTML = '<div class="sd-role"></div><div class="sd-alive"><span class="f"></span><b></b><span class="e"></span></div><div class="sd-work"><span></span><i><b></b></i></div>';
      document.getElementById('hud').appendChild(this.el);
      this.marks = ['A', 'B', 'bomb'].map((t) => { const m = document.createElement('div'); m.className = 'sdmark'; m.innerHTML = '<b>' + (t === 'bomb' ? '&#x2620;' : t) + '</b><span></span>'; g.hud.tagRoot.appendChild(m); return m; });
      this.roleEl = this.el.children[0]; this.aliveEl = this.el.children[1]; this.workEl = this.el.children[2];
    }
    const mine = this.role(p.team);
    const working = this.hidesGun();
    if (this.workingCss !== working) { this.workingCss = working; document.getElementById('hud').classList.toggle('sd-working', working); } // (no crosshair over the bomb)
    const live = this.phase === 'planted' && !this.planted.done;
    if (this.timerLive !== live) { this.timerLive = live; document.getElementById('sb-timer').classList.toggle('bomb', live); }
    const role = (mine === 'attack' ? 'ANGRIFF' : 'VERTEIDIGUNG') + ' · ' + (this.round > SD.ROUNDS ? 'ENTSCHEIDUNG' : 'RUNDE ' + Math.max(1, this.round) + '/' + SD.ROUNDS) + (this.carrier === p ? ' · DU HAST DIE BOMBE' : '');
    if (this.roleEl.textContent !== role) this.roleEl.textContent = role;
    const dots = (n) => '&#9679;'.repeat(n);
    const af = this.aliveOf(p.team), ae = this.aliveOf(1 - p.team), ak = af + '|' + ae;
    if (this.aliveKey !== ak) { this.aliveKey = ak; this.aliveEl.children[0].innerHTML = dots(af); this.aliveEl.children[2].innerHTML = dots(ae); this.aliveEl.children[1].textContent = af + ' : ' + ae; }
    // F to plant / defuse, and how far it has got
    const w = this.work, k = !w && p.alive ? this.canWork(p) : null;
    let text = '', fill = 0;
    if (w && w.ent === p) { text = w.kind === 'plant' ? 'BOMBE WIRD GELEGT' : 'BOMBE WIRD ENTSCHÄRFT'; fill = w.t / w.need; }
    else if (k) text = k === 'plant' ? '[F] HALTEN · BOMBE LEGEN' : '[F] HALTEN · BOMBE ENTSCHÄRFEN';
    else if (w && w.kind === 'defuse' && w.ent.team === p.team) { text = w.ent.name.toUpperCase() + ' ENTSCHÄRFT'; fill = w.t / w.need; }
    else if (this.carrier === p && this.phase === 'live') text = 'BRING DIE BOMBE ZU A ODER B';
    this.workEl.style.display = text ? '' : 'none';
    if (text) { if (this.workEl.firstChild.textContent !== text) this.workEl.firstChild.textContent = text; this.workEl.lastChild.firstChild.style.transform = 'scaleX(' + Math.min(1, fill).toFixed(3) + ')'; this.workEl.classList.toggle('bar', fill > 0); }
    // markers: the two sites always; the bomb once it is down, and for the attackers where it was dropped
    const cam = g.engine.camera, Wd = window.innerWidth, Hd = window.innerHeight;
    const put = (M, P, label, cls) => {
      _v.set(P.x, P.y + 1.4, P.z).project(cam);
      const behind = _v.z > 1;
      let sx = behind ? -_v.x : _v.x, sy = behind ? -_v.y : _v.y;
      const edge = Math.max(Math.abs(sx) / 0.9, Math.abs(sy) / 0.8);
      if (behind || edge > 1) { const q = 1 / Math.max(edge, 1e-3); sx *= q; sy *= q; }
      M.style.transform = `translate(${Math.round((sx * 0.5 + 0.5) * Wd)}px, ${Math.round((-sy * 0.5 + 0.5) * Hd)}px) translate(-50%, -50%)`;
      M.lastChild.textContent = label;
      if (M.className !== cls) M.className = cls;
      M.style.display = '';
    };
    const view = p.alive ? p.pos : (this.spectate && this.spectate.pos) || p.pos;
    const show = this.phase !== 'over' && this.phase !== 'wait';
    this.sites.forEach((s, i) => {
      const hot = this.planted && this.planted.site === s;
      if (show && !hot) put(this.marks[i], s, Math.round(flat(view, s)) + ' m', 'sdmark site ' + (mine === 'attack' ? 'att' : 'def'));
      else this.marks[i].style.display = 'none';
    });
    const B = this.planted ? this.planted.pos : this.dropped && mine === 'attack' ? this.dropped : null;
    if (show && B) put(this.marks[2], B, this.planted ? (this.planted.done ? 'ENTSCHÄRFT' : 'BOMBE ' + this.planted.site.id) : 'BOMBE', 'sdmark bomb' + (this.planted && !this.planted.done ? ' live' : ''));
    else this.marks[2].style.display = 'none';
    void dt;
  }

  // the clock under the score: the freeze, the round, then the bomb
  clock() {
    if (this.phase === 'freeze') return Math.max(0, this.left);
    if (this.phase === 'planted') return Math.max(0, this.planted.left);
    if (this.phase === 'live') return Math.max(0, this.left);
    return 0;
  }

  // ---- dead until the next round: watch a teammate who is still in it (click: the next one)
  watch(cam, dt) {
    const g = this.game, p = g.player;
    this.specT += dt;
    const mates = g.combatants.filter((c) => c !== p && c.alive && c.team === p.team);
    if (!mates.length) return false;
    if (!this.spectate || !this.spectate.alive || this.spectate.team !== p.team || (g.input.firePressed && this.specT > 0.3)) {
      const i = this.spectate ? (mates.indexOf(this.spectate) + 1) % mates.length : 0;
      this.spectate = mates[Math.max(0, i)]; this.specT = 0;
    }
    const c = this.spectate, yaw = c.isPlayer ? c.yaw : c.aimYaw;
    const hx = c.pos.x, hy = c.pos.y + 1.65, hz = c.pos.z;
    let bx = hx + Math.sin(yaw) * 2.6, by = hy + 0.55, bz = hz + Math.cos(yaw) * 2.6;
    const hit = g.col.raycast(hx, hy, hz, bx - hx, by - hy, bz - hz, 1, this._ray || (this._ray = {}));
    if (hit && hit.t < 1) { const k = Math.max(0.15, hit.t - 0.08); bx = hx + (bx - hx) * k; by = hy + (by - hy) * k; bz = hz + (bz - hz) * k; }
    cam.position.set(bx, by, bz);
    cam.lookAt(hx - Math.sin(yaw) * 6, hy - 0.4, hz - Math.cos(yaw) * 6);
    const box = document.getElementById('death-timer');
    document.getElementById('death-screen').classList.add('watching'); // (the big GETÖTET goes, the line under it stays)
    const t = 'DU SIEHST ' + c.name.toUpperCase() + ' · KLICKEN: NÄCHSTER';
    if (box && box.textContent !== t) box.textContent = t;
    return true;
  }
}
