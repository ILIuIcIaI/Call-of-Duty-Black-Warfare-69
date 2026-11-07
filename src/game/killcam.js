import * as THREE from 'three';
import { Soldier } from '../characters/soldier.js';
import { OUTFITS } from '../characters/soldier.js';
import { WEAPONS } from '../weapons/defs.js';

// =============================================================================
// Killcam (Free for All, Team Deathmatch, Gun Game, Search and Destroy): after you fall, a moment of the death
// cam, then the last seconds before it again through the eyes of whoever got you: his gun in the hands, his shots,
// you as he saw you. A click skips it. Everybody's last seconds are kept all the time to be able to do that.
// =============================================================================
const KEEP = 4.5, LEN = 3.2, WAIT = 0.7, HOLD = 0.6, RATE = 1 / 30;
const _p = new THREE.Vector3(), _q = new THREE.Vector3();
const MODES = new Set(['ffa', 'tdm', 'gun', 'sd']);
const lerpAng = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

export class Killcam {
  constructor(game) {
    this.game = game;
    this.hist = new Map();  // combatant -> samples, oldest first
    this.shots = [];        // { t, s: shooter, from, to }
    this.acc = 0;
    this.on = null;
    this.ghost = null;
    this.el = null;
  }

  static wanted(mode) { return MODES.has(mode); }

  // ---- keeping the last seconds
  sample(c) {
    const g = this.game;
    if (c === g.player) {
      const p = c, w = g.weapons.w;
      return { t: g.time, x: p.pos.x, y: p.pos.y, z: p.pos.z, eye: p.eyeH + (p.stepOffset || 0), yaw: p.yaw, pitch: p.pitch, w: w && w.def.id, o: w && w.optic, s: w && w.skin,
        st: { yaw: p.bodyYaw, pitch: p.pitch, speed: p.speedH, moveAngle: 0, crouch: p.stance === 'crouch' && p.mode === 'normal', slide: p.mode === 'slide', dive: p.mode === 'dive', prone: p.stance === 'prone', supine: p.supine, proneSpin: p.proneSpin, air: !p.onGround, tac: p.tac, sprint: p.sprinting, floorY: p.pos.y } };
    }
    const st = c.animState ? { ...c.animState() } : { yaw: c.aimYaw || 0, pitch: c.aimPitch || 0, speed: 0, moveAngle: 0, floorY: c.pos.y };
    return { t: g.time, x: c.pos.x, y: c.pos.y, z: c.pos.z, eye: c.eyeH || 1.6, yaw: c.aimYaw ?? st.yaw, pitch: c.aimPitch ?? st.pitch ?? 0, w: c.wdef && c.wdef.id, o: c.optic, s: c.skin, st };
  }
  record(dt) {
    const g = this.game;
    if (this.on && this.on.playing) return;
    this.acc += dt;
    if (this.acc < RATE) return;
    this.acc = 0;
    for (const c of g.combatants) {
      if (!c.alive) continue;
      let a = this.hist.get(c);
      if (!a) this.hist.set(c, a = []);
      a.push(this.sample(c));
      while (a.length && a[0].t < g.time - KEEP) a.shift();
    }
    while (this.shots.length && this.shots[0].t < g.time - KEEP) this.shots.shift();
  }
  shot(shooter, from, to) {
    if (this.on && this.on.playing) return;
    if (this.shots.length > 600) this.shots.shift();
    this.shots.push({ t: this.game.time, s: shooter, from: from.clone(), to: to.clone() });
  }

  // ---- after your death
  start(killer) {
    const g = this.game;
    this.stop();
    if (!killer || killer === g.player || !g.match || !Killcam.wanted(g.match.mode)) return false;
    const end = g.time, a = (this.hist.get(killer) || []).filter((s) => s.t >= end - LEN - 0.2);
    const me = (this.hist.get(g.player) || []).filter((s) => s.t >= end - LEN - 0.2);
    if (a.length < 10) return false;
    this.on = { killer, end, from: Math.max(a[0].t, end - LEN), a, me, shots: this.shots.filter((s) => s.s === killer && s.t >= end - LEN - 0.2), wait: WAIT, u: 0, playing: false, fired: 0 };
    return true;
  }

  // where somebody was at time T (between two samples)
  at(list, T) {
    if (!list.length) return null;
    if (T <= list[0].t) return list[0];
    for (let i = 1; i < list.length; i++) {
      const b = list[i];
      if (b.t >= T) {
        const a = list[i - 1], k = (T - a.t) / Math.max(1e-4, b.t - a.t);
        return { ...b, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, eye: a.eye + (b.eye - a.eye) * k, yaw: lerpAng(a.yaw, b.yaw, k), pitch: a.pitch + (b.pitch - a.pitch) * k, st: { ...b.st, yaw: lerpAng(a.st.yaw, b.st.yaw, k) } };
      }
    }
    return list[list.length - 1];
  }

  // once per frame while you are dead; true while it shows (it then has the camera)
  camera(cam, dt) {
    const g = this.game, K = this.on;
    if (!K) return false;
    if (K.wait > 0) { K.wait -= dt; if (K.wait > 0) return false; this.begin(); }
    K.u += dt;
    const T = K.from + K.u;
    if (T > K.end + HOLD || (g.input.firePressed && K.u > 0.35)) { this.stop(true); return false; }
    // his eyes
    const s = this.at(K.a, Math.min(T, K.end));
    cam.position.set(s.x, s.y + s.eye, s.z);
    cam.rotation.set(s.pitch, s.yaw, 0, 'YXZ');
    // his gun: each of his shots kicks it, with the tracer and the flash it had
    const W = g.weapons.vm;
    while (K.fired < K.shots.length && K.shots[K.fired].t <= T) {
      const sh = K.shots[K.fired++];
      if (K.def) W.onShot(K.def, false);
      g.fx.tracer(sh.from, sh.to, 420, 0.026);
      g.fx.muzzleWorld(_p.copy(sh.from), 0.4, 1);
    }
    W.update(dt, this.vmState());
    // you, as he saw you, until the moment you fell
    const me = T < K.end ? this.at(K.me, T) : null;
    if (me && this.ghost) { this.ghost.setVisible(true); this.ghost.update(dt, me.st, _q.set(me.x, me.y, me.z)); if (g.playerCorpse) g.playerCorpse.setVisible(false); }
    else { if (this.ghost) this.ghost.setVisible(false); if (g.playerCorpse) g.playerCorpse.setVisible(true); }
    return true;
  }

  vmState() {
    const g = this.game;
    return this._vs || (this._vs = { ads: 0, firing: true, mantleHigh: false, ledge: null, sprint: false, tac: false, slide: false, dive: false, mantle: false, crawl: false, crouch: false, lower: false,
      bobPhase: 0, bobAmt: 0, lookDX: 0, lookDY: 0, vy: 0, strafe: 0, landImpulse: 0, corner: 0, mantleK: 0, sunDirCam: g.sunDirCam, inShadow: false, mount: false, mountSide: 0 });
  }

  // the replay starts: his gun in the hands, his own body out of the way, you there again, the banner
  begin() {
    const g = this.game, K = this.on, first = K.a[K.a.length - 1];
    K.playing = true;
    K.def = first.w && WEAPONS[first.w];
    if (K.def) { g.weapons.vm.stop(); g.weapons.vm.setWeapon(K.def, first.o || K.def.optics[0], first.s || 'standard'); }
    if (K.killer.soldier) K.killer.soldier.setVisible(false);
    if (!this.ghost) { this.ghost = new Soldier(g, OUTFITS.vanguard); }
    const mine = K.me[K.me.length - 1];
    if (mine && mine.w) this.ghost.setWeapon(WEAPONS[mine.w], mine.o || 'iron', mine.s || 'standard');
    this.ghost.resetPose();
    if (!this.el) {
      this.el = document.createElement('div'); this.el.id = 'killcam';
      this.el.innerHTML = '<div class="kc-bar top"></div><div class="kc-bar bottom"></div><div class="kc-tag"><b>KILLCAM</b><span></span></div>';
      document.getElementById('hud').appendChild(this.el);
    }
    const name = String(K.killer.name || '').replace(/[<>&]/g, '');
    this.el.querySelector('span').textContent = name.toUpperCase() + (K.def ? ' · ' + K.def.name : '');
    this.el.style.display = '';
    document.getElementById('death-screen').classList.add('kc');
    document.getElementById('hud').classList.add('kc-on'); // (score, map, ammo and the rest of your own HUD step aside)
  }

  // over (or skipped): everything back the way it was
  stop(done = false) {
    const g = this.game, K = this.on;
    if (!K) return;
    this.on = null;
    if (K.playing) {
      if (K.killer.soldier && K.killer.alive) K.killer.soldier.setVisible(true);
      if (this.ghost) this.ghost.setVisible(false);
      if (g.playerCorpse) g.playerCorpse.setVisible(true);
      const w = g.weapons.w;
      if (w) { g.weapons.vm.stop(); g.weapons.vm.setWeapon(w.def, w.optic, w.skin); }
      if (this.el) this.el.style.display = 'none';
      document.getElementById('death-screen').classList.remove('kc');
      document.getElementById('hud').classList.remove('kc-on');
      if (done) g.deathCamT = 3; // (S&D goes straight on to watching a teammate)
    }
  }

  dispose() {
    this.stop();
    if (this.ghost) { this.ghost.dispose(); this.ghost = null; }
    if (this.el) { this.el.remove(); this.el = null; }
    this.hist.clear(); this.shots = [];
  }
}
