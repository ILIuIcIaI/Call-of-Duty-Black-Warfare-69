import * as THREE from 'three';
import { FINISHERS, Stage, victimYaw } from './finishers.js';
import { BRMatch } from './br.js';
import { OUTFITS, Soldier } from '../characters/soldier.js';
import { GUN_TIERS } from '../weapons/defs.js';
import { buildWeapon, weaponMaterials } from '../weapons/models.js';
import { applySkin } from '../weapons/skins.js';
import { angleDiff, rand } from '../core/math.js';

// =============================================================================
// Gun Game: the stab that wins the match is played out as a finisher before anyone is dead.
// Whoever wins (you or a bot) does it to whoever it is (you or a bot), with one of the finishers done
// with a knife and on someone standing: the next one from a shuffled deck that has room where they
// stand. The knife in it is the winner's own, in the skin it got. The rest of the match stands still
// meanwhile and the camera watches from the side; only when the scene is over is he dead and the match won.
// =============================================================================

const KNIFE = FINISHERS.filter((F) => F.prop === 'knife' && !F.prone);
const UP = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3(), _w = new THREE.Vector3();

// The winner's knife in its skin, turned and sized the way the scenes hold theirs (see makeProp): the grip about the origin,
// the blade straight up to its tip 0.28 above it.
function knifeProp(g, skin) {
  const base = weaponMaterials(g.tex), w = buildWeapon('knife', 'iron', base, { lite: true });
  applySkin({ root: w.root, parts: {} }, skin, base);
  const grip = w.anchors.rhand.pos.clone(), tip = w.anchors.muzzle.clone();
  const G = new THREE.Vector3(0, -0.02, 0), T = new THREE.Vector3(0, 0.28, 0.014);
  const s = T.distanceTo(G) / tip.distanceTo(grip);
  const q = new THREE.Quaternion().setFromUnitVectors(_v.copy(tip).sub(grip).normalize(), _w.copy(T).sub(G).normalize());
  w.root.scale.setScalar(s); w.root.quaternion.copy(q);
  w.root.position.copy(G).sub(grip.multiplyScalar(s).applyQuaternion(q));
  const P = new THREE.Group();
  P.add(w.root);
  P.traverse((o) => { o.frustumCulled = false; o.layers.enable(1); });
  P.visible = false;
  return P;
}

export class GunFinale {
  constructor(game) {
    this.game = game; this.S = null; this.deck = []; this.finTilt = null; this.bodies = {};
    document.body.classList.remove('cine');
  }

  get on() { return !!this.S; }

  // The killing stab, just before it kills: true if it gets played out instead.
  // Over the network the computer that runs the victim decides (his death is its to tell): it picks the scene, plays it,
  // and tells everybody, who play the same one with the bodies they have (see onNet). His death goes out when it is over.
  take(victim, killer, info) {
    const g = this.game, M = g.match, p = g.player, net = g.net && g.net.inMatch ? g.net : null;
    if (this.S || !M || !M.gun || M.ended) return false;
    if (!killer || killer === victim || !(info && info.weapon && info.weapon.name === 'MESSER') || info.fromNet) return false;
    if ((killer.tier || 0) < GUN_TIERS.length - 1) return false;
    if (victim !== p && !(victim.isBot && !victim.remote)) return false;
    const body = (c) => (c === p ? c.alive : !!(c.soldier && c.alive));
    if (!body(killer) || !body(victim) || (killer === p && p.mantle)) return false;
    // from behind the scene stands the way he faces, from the front the way you look at him (and he gets turned into it)
    const vyaw = victim === p ? p.yaw : victim.aimYaw, dx = victim.pos.x - killer.pos.x, dz = victim.pos.z - killer.pos.z, d = Math.hypot(dx, dz);
    const behind = d > 0.01 && (dx * -Math.sin(vyaw) + dz * -Math.cos(vyaw)) / d >= 0.4;
    const yaw = behind ? vyaw : Math.atan2(-dx, -dz);
    const floor = g.col.floorBelow(victim.pos.x, victim.pos.z, 0.2, victim.pos.y + 0.6, victim.pos.y - 0.6);
    if (!isFinite(floor)) return false;
    const F = this.pick(victim.pos, floor, yaw);
    if (!F) return false;
    let t0 = 0, turn = 0;
    if (!behind) { t0 = F.front || 0; const inScene = victimYaw(F, t0); turn = inScene + angleDiff(inScene, vyaw - yaw); }
    this.start(killer, victim, info, F, floor, yaw, t0, turn, { decider: true });
    if (net) {
      const st = this.S.stage, T = this.finTilt || new THREE.Quaternion(), id = (c) => (c === p ? net.you : c.netId);
      net.send({ t: 'ev', k: 'gfin', a: id(killer), v: id(victim), f: FINISHERS.indexOf(F), o: [+st.o.x.toFixed(3), +st.o.y.toFixed(3), +st.o.z.toFixed(3)], yaw: +yaw.toFixed(4), t0, turn: +turn.toFixed(4), tilt: [T.x, T.y, T.z, T.w].map((v) => +v.toFixed(5)), skin: this.S.skin });
    }
    return true;
  }

  // Somebody else's computer decided on a scene: the same one here, with the bodies there are here (you, if you are in it, as
  // your own body). His death comes in from that computer afterwards.
  onNet(m) {
    const g = this.game, net = g.net, ent = (id) => (id === net.you ? g.player : net.byId.get(id));
    const killer = ent(m.a), victim = ent(m.v), F = FINISHERS[m.f];
    if (!F || !killer || !victim || killer === victim || !victim.alive || !killer.alive) return;
    if ((killer !== g.player && !killer.soldier) || (victim !== g.player && !victim.soldier)) return;
    if (this.S) this.end();
    this.start(killer, victim, null, F, m.o[1], m.yaw, m.t0, m.turn, { origin: new THREE.Vector3(m.o[0], m.o[1], m.o[2]), tilt: new THREE.Quaternion(m.tilt[0], m.tilt[1], m.tilt[2], m.tilt[3]), skin: m.skin });
  }

  // the next one from a shuffled deck that has room here (flat enough ground, space for both and for the camera)
  pick(pos, y, yaw) {
    const fits = (F) => BRMatch.prototype.sceneFits.call(this, F, pos, y, yaw);
    if (!this.deck.length) {
      this.deck = KNIFE.slice();
      for (let i = this.deck.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]]; }
    }
    for (let i = 0; i < this.deck.length; i++) if (fits(this.deck[i])) return this.deck.splice(i, 1)[0];
    return KNIFE.find(fits) || null;
  }

  // you, as a body for the scene: over the network in your own clothes (the ones the others see you in), alone never two men
  // in the same clothes in one shot
  bodyOfYou(other) {
    const g = this.game, cfg = g.match && g.match.cfg, me = g.net && g.net.inMatch && cfg && cfg.roster ? cfg.roster.find((r) => r.id === g.net.you) : null;
    const O = other && other.soldier && other.soldier.outfit, dark = O === OUTFITS.vanguard || O === OUTFITS.desert;
    const k = me && OUTFITS[me.outfit] ? me.outfit : dark ? 'raven' : 'vanguard';
    let av = this.bodies[k];
    if (!av || av.root.parent !== g.scene) { av = this.bodies[k] = new Soldier(g, OUTFITS[k]); }
    const p = g.player, W = g.weapons;
    av.resetPose(); av.setVisible(true);
    if (W.w) av.setWeapon(W.w.def, W.w.optic, W.w.skin);
    for (let i = 0; i < 8; i++) av.update(0.05, { yaw: p.yaw, pitch: 0, speed: 0, moveAngle: 0, floorY: p.pos.y, crouch: false }, p.pos);
    return av;
  }

  hold(c) {
    const g = this.game, p = g.player, W = g.weapons;
    if (c === p) {
      c.health = Math.max(c.health, 1);
      W.cancelReload(); W.vm.stop(); W.state = 'idle'; W.adsAmount = 0; W.wantsAds = false; W.lunge = null; W.firingRecently = false;
      p.sprinting = false; p.tac = false; p.mount = null; p.vel.set(0, 0, 0);
    } else if (c.remote) c.scripted = true; // (somebody else's: his computer holds him, here his body only waits for the scene)
    else {
      c.health = Math.max(c.health, 1);
      c.scripted = true; c.vel.set(0, 0, 0); c.path = null; c.mantling = null; c.crouching = false; c.sliding = 0; c.prone = false; c.target = null;
    }
  }

  start(killer, victim, info, F, y, yaw, t0, turn, opt = {}) {
    const g = this.game, p = g.player, W = g.weapons;
    const other = killer === p ? victim : victim === p ? killer : null, av = other ? this.bodyOfYou(other) : null;
    this.hold(killer); this.hold(victim);
    const A = killer === p ? av : killer.soldier, V = victim === p ? av : victim.soldier;
    const stage = new Stage(g, F, A, V, opt.origin || new THREE.Vector3(victim.pos.x, y, victim.pos.z), yaw, opt.tilt || this.finTilt, t0, turn);
    // (unless it is you doing it, the camera doesn't end up in anybody's head)
    if (killer !== p) stage.staysOut = true;
    const skin = opt.skin || (killer === p ? (W.w && W.w.def.melee ? W.w.skin : p.gunSkin) : killer.skin) || 'standard';
    const prop = knifeProp(g, skin);
    g.scene.add(prop);
    stage.prop = prop;
    stage.startFrom(killer.pos);
    stage.pose(0);
    const cam = g.engine.camera;
    this.S = { F, stage, A, V, av, killer, victim, info, prop, skin, decider: !!opt.decider, fired: 0, from: { pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov }, spurt: 0, spurtT: 0, killed: false };
    // what the skipped part of the scene had done already
    const S = this.S;
    while (S.fired < F.events.length && F.events[S.fired][0] < t0) { const E = F.events[S.fired++]; if (E[1] === 'prop' || E[1] === 'drop') this.event(E, S); }
    const ds = document.getElementById('death-screen');
    if (ds) ds.classList.add('hidden');
    this.cine(true, F.name);
    g.audio.play('pouch', { vol: 0.7 });
  }

  // the letterbox and the name of the scene (the same bars as in Warzone; while they are up the HUD is hidden)
  cine(on, name = '') {
    let el = document.getElementById('br-cine');
    if (!el && on) {
      el = document.createElement('div'); el.id = 'br-cine';
      el.innerHTML = '<div class="v"></div><div class="b t"></div><div class="b u"></div><div class="n"></div><div class="f"></div>';
      document.getElementById('app').appendChild(el);
    }
    document.body.classList.toggle('cine', !!on);
    if (on && el) el.querySelector('.n').textContent = name;
  }

  // in place of everything you'd do yourself
  update(dt) {
    const g = this.game, p = g.player, S = this.S, st = S.stage, F = S.F;
    st.t += dt;
    p.vel.set(0, 0, 0); p.onGround = true; p.speedH = 0;
    g.slowmo = st.speed();
    st.pose(dt);
    S.V.updateWeaponDrop(dt);
    // both where their bodies are (the sound, the map)
    for (const [c, s] of [[S.killer, S.A], [S.victim, S.V]]) { s.pelvis.getWorldPosition(_w); c.pos.x = _w.x; c.pos.z = _w.z; c.pos.y = st.o.y; }
    if (S.victim === p || S.killer === p) p.eyeH = 1.62;
    g.engine.film = Math.min(0.4, Math.exp(-dt / 0.012));
    while (S.fired < F.events.length && st.t >= F.events[S.fired][0]) this.event(F.events[S.fired++], S);
    if (S.spurt > 0) {
      S.spurt -= dt; S.spurtT -= dt;
      if (S.spurtT <= 0 && !S.killed) { S.spurtT = 0.07; g.fx.bloodBurst(st.point(['v.head', 0, -0.1, -0.1], _v), _w.set(rand(-0.3, 0.3), 0.15, -0.7).applyAxisAngle(UP, st.yaw), 0.35); }
    }
    if (st.over()) this.end();
  }

  // the rest of the match stands where it is: the living catch their breath, the dead keep falling
  holds(b, dt) {
    const S = this.S;
    if (!S) return false;
    if (b === S.killer || b === S.victim) return true;
    if (!b.alive || !b.soldier || b.remote) return false;
    b.vel.set(0, 0, 0);
    b.soldier.update(dt, { yaw: b.aimYaw, pitch: 0, speed: 0, moveAngle: 0, floorY: b.pos.y, crouch: false }, b.pos);
    return true;
  }

  camera(cam) { this.S.stage.camera(cam, this.S.from); }

  floorAt(at, st) { const f = this.game.col.floorBelow(at.x, at.z, 0.1, st.o.y + 0.6, st.o.y - 0.6); return isFinite(f) ? f : st.o.y; }

  event(E, S) {
    const g = this.game, st = S.stage, name = E[1];
    const place = (i) => st.point([E[i], E[i + 1], E[i + 2], E[i + 3]], _v);
    const dir = (i) => _w.set(E[i], E[i + 1], E[i + 2]).applyAxisAngle(UP, st.yaw).normalize();
    if (name === 'sfx') g.audio.play(E[2], E[3]);
    else if (name === 'hit') {
      const power = E[9], at = place(2).clone(), d = dir(6).clone();
      if (power > 0) g.fx.bloodBurst(at, d, power);
      if (E[10]) g.audio.play(E[10], { vol: 1 });
      if (power >= 1) g.audio.play('sting', { vol: 0.8 });
    } else if (name === 'slam') {
      st.bone(E[2]).getWorldPosition(_v); _v.y = this.floorAt(_v, st) + 0.05;
      g.fx.impact(_v, _w.set(0, 1, 0), 'dirt', 0.8 * E[3]);
      g.audio.play('thud', { vol: 1 });
    } else if (name === 'thud') g.audio.play('thud', { vol: 0.9 });
    else if (name === 'kill') S.killed = true; // (it counts when the scene is over: the match ends with it)
    else if (name === 'pool') { st.bone(E[2]).getWorldPosition(_v); _v.y = this.floorAt(_v, st); g.fx.pool(_v, E[3]); }
    else if (name === 'drop') { if (S.V.weapon) { S.V.dropWeapon(_w.set(0.3, 0, -0.5).applyAxisAngle(UP, st.yaw)); S.V.weapon = null; } }
    else if (name === 'prop') st.prop.visible = !!E[2];
    else if (name === 'spurt') S.spurt = E[2];
  }

  // over: the winner goes on from where the scene leaves him, the other one is dead where it left him, and the match is won
  end() {
    const g = this.game, p = g.player, W = g.weapons, S = this.S, st = S.stage;
    this.S = null;
    g.slowmo = 0; g.engine.film = 0;
    this.cine(false);
    if (S.prop.parent) S.prop.parent.remove(S.prop);
    const k = S.killer;
    if (k.remote) k.scripted = false; // (where he goes on from is his own computer's business)
    else {
      st.endGround(k.pos);
      const f = g.col.floorBelow(k.pos.x, k.pos.z, 0.2, st.o.y + 0.5, st.o.y - 1);
      if (isFinite(f)) k.pos.y = f;
    }
    if (k === p) {
      p.yaw = st.endYaw(); p.pitch = 0; p.mode = 'normal'; p.onGround = true;
      S.av.resetPose(); S.av.setVisible(false);
      W.equip(false);
    } else if (!k.remote) {
      k.aimYaw = st.endYaw(); k.scripted = false; k.onGround = true; k.path = null;
      k.soldier.resetPose(); k.soldier.setVisible(true); k.soldier.setWeapon(k.wdef, k.optic, k.skin);
    }
    const v = S.victim;
    // told by somebody else: his death comes from there (you were watching, or it was you doing it)
    if (!S.decider) {
      if (v !== p) v.scripted = false;
      const ds = document.getElementById('death-screen');
      if (ds && !p.alive) ds.classList.remove('hidden');
      return;
    }
    if (v === p) {
      // you lie where the scene left you (that body is you now), and the camera looks on from where it stood
      const cam = g.engine.camera.position;
      p.yaw = Math.atan2(cam.x - p.pos.x, cam.z - p.pos.z); p.mode = 'normal'; p.onGround = true;
    } else v.scripted = false;
    g.kill(v, k, { ...S.info, finale: true, staged: true, part: 'chest', dir: _w.set(0, -0.4, 1).applyAxisAngle(UP, st.yaw).normalize().clone() });
  }
}
