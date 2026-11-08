// =============================================================================
// Watching a teammate in his own eyes (Search and Destroy, while you are out of the round): the camera where his eyes
// are, looking where he looks, and in front of it his gun in his hands doing what he does. Every shot (its kick, flash,
// smoke and brass; the bolt or the pump worked after it), every reload (as long as his takes, so the gun is back up the
// moment he can fire again), a gun bought or picked up (drawn), the knife, aiming down the sights (through the scope
// too), running, sliding, crouching, jumping and landing, climbing with both hands on the edge. A bot here and a person
// on another computer alike: it all comes from the same things his body shows. His own body is not drawn while you are
// behind his eyes.
// =============================================================================
import * as THREE from 'three';
import { Viewmodel } from '../weapons/viewmodel.js';
import { magReload, boxReload, pistolReload, revolverReload, shotgunStart, shotgunShell, shotgunEnd, pumpCycle, boltCycle, drawClip, meleeClip } from '../weapons/anim.js';
import { F } from '../net/puppet.js';
import { clamp, damp, DEG, Spring, angleDiff } from '../core/math.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _hit = {};
// the sounds of the hands at work, as your own (see PlayerWeapons.onAnimEvent)
const SFX = { magOut: 0.5, magIn: 0.7, magTouch: 0.25, chargeBack: 0.55, chargeFwd: 0.6, boltUp: 0.5, boltBack: 0.6, boltFwd: 0.6, boltDown: 0.5,
  pumpBack: 0.7, pumpFwd: 0.7, shellIn: 0.5, coverOpen: 0.5, coverClose: 0.6, slideFwd: 0.6, cylOpen: 0.5, cylClose: 0.6, loaderIn: 0.6,
  hammer: 0.5, draw: 0.35, holster: 0.3, ejectAll: 0.4, magGrab: 0.2, magKnock: 0.45, pouch: 0.3 };

export class Watch {
  constructor(game) {
    this.game = game;
    this.vm = new Viewmodel(game, { lightsFrom: game.weapons.vm });
    this.vm.root.visible = false;
    this.vm.onEvent = (name, clip) => this.anim(name, clip);
    this.who = null;
    this.used = false;
    this.punchP = new Spring(220, 17); this.punchY = new Spring(220, 17); this.punchR = new Spring(260, 16); this.fovPunch = new Spring(300, 18);
    this.land = new Spring(120, 11);
    this.ads = 0; this.hidden = false; this.scoped = false;
  }
  get on() { return !!this.who; }

  // ---- what he is doing, the same questions for a bot here and a person on another computer
  remote(c) { return !!c.remote; }
  yawOf(c) { return c.aimYaw + (c.remote ? 0 : c.errYaw || 0); }
  pitchOf(c) { return clamp(c.aimPitch + (c.remote ? 0 : c.errPitch || 0), -1.45, 1.45); }
  speed(c) { return Math.hypot(c.vel.x, c.vel.z); }
  reloading(c) { return c.remote ? !!(c.flags & F.reload) : c.reloadT > 0; }
  sprinting(c) { return c.remote ? !!(c.flags & F.sprint) : !!c.sprinting && this.speed(c) > 5; }
  tac(c) { return c.remote ? !!(c.flags & F.tac) : !!c.tac && this.speed(c) > 6; }
  sliding(c) { return c.remote ? !!(c.flags & F.slide) : c.sliding > 0; }
  mantling(c) { return c.remote ? !!(c.flags & F.mantle) : !!c.mantling; }
  grounded(c) { return c.remote ? !(c.flags & (F.air | F.mantle)) : !!c.onGround && !c.mantling; }
  // aiming down the sights: a person says so; a bot does when he shoots at someone further than 12 m and stands still
  adsWant(c) {
    if (c.remote) return !!(c.flags & F.ads);
    const tg = c.target;
    if (!tg || !tg.alive || c.reloadT > 0 || c.mantling || c.sprinting || c.busy || (c.wdef && c.wdef.melee)) return false;
    if (this.game.time - (c.lastSeenT ?? -9) > 0.6) return false;
    return tg.pos.distanceTo(c.pos) > 12 && this.speed(c) < 1.2;
  }

  // ---- whom: start (snapped to his eyes, his gun already in his hands), switch, or stop (null)
  follow(c) {
    this.used = true;
    if (c === this.who) return;
    const was = this.who;
    if (was && was.soldier) was.soldier.setVisible(true);
    this.who = c;
    this.vm.stop(); this.vm.persist.slide = 0; this.ledge = null; this.ledgeSrc = null; this.boltAt = 0; this.shellN = 0;
    if (!c) { this.vm.root.visible = false; this.hidden = false; this.scoped = false; return; }
    this.yaw = this.yawOf(c); this.pitch = this.pitchOf(c); this.eyeH = c.eyeH;
    this.def = null; this.syncGun(c, false);
    this.wasReload = this.reloading(c); this.wasMelee = (c.meleeT || 0) > 0; this.wasMantle = this.mantling(c);
    this.wasGround = this.grounded(c); this.vyPrev = c.vel.y;
    this.ads = this.adsWant(c) ? 1 : 0;
    this.bobPhase = 0; this.bobAmt = 0; this.lookDX = 0; this.lookDY = 0; this.lastShotT = -9; this.landVm = 0;
    for (const s of [this.punchP, this.punchY, this.punchR, this.fovPunch, this.land]) { s.x = 0; s.v = 0; }
  }
  // nobody watched this frame (you are back in, or there is nobody left): his body back, the hands away
  endFrame() { if (!this.used && this.who) this.follow(null); this.used = false; }

  // the gun in his hands: a new one (bought, picked up) is drawn; a reload under way starts over with it
  syncGun(c, draw) {
    const def = c.wdef, optic = c.optic || def.optics[0], skin = c.skin || 'standard';
    if (def === this.def && optic === this.optic && skin === this.skin) return;
    const first = !this.def;
    this.def = def; this.optic = optic; this.skin = skin;
    this.vm.stop(); this.vm.setWeapon(def, optic, skin); this.vm.persist.slide = 0; this.shellN = 0; this.boltAt = 0;
    if (draw && !first) this.vm.play(drawClip(def.slot === 'secondary' ? 0.32 : 0.45));
    this.wasReload = this.reloading(c);
  }

  // ---- a shot of his (called where it is fired): the kick, the flash, the brass, the punch of the view
  shot(c) {
    if (c !== this.who) return;
    const g = this.game, vm = this.vm;
    this.syncGun(c, false);
    const def = this.def, ads = this.ads > 0.5;
    // (a shot breaks off whatever the hands were doing: the shell reload, a bolt still closing; never the draw)
    if (vm.clip && vm.clip.name !== 'draw') { vm.stop(); this.shellN = 0; }
    vm.onShot(def, ads);
    const rc = def.recoil, k = ads ? 0.75 : 1;
    this.punchP.impulse(rc.up * DEG * 26 * k * 0.8);
    this.punchY.impulse((Math.random() - 0.5) * rc.side * DEG * 18 * k);
    this.punchR.impulse((Math.random() * 2 - 1) * rc.kick * DEG * 30);
    this.fovPunch.impulse(rc.kick * 9 * (ads ? 0.5 : 1));
    g.shake.add(rc.kick * (ads ? 0.05 : 0.08));
    if (def.fire !== 'bolt' && def.fire !== 'pump' && !(vm.model && vm.model.revolver)) {
      vm.ejectCasing();
      if (Math.random() < 0.5) g.audio.play('casing', { vol: 0.25, delay: 0.25 + Math.random() * 0.15 });
    }
    if (def.fire === 'bolt') this.boltAt = g.time + 0.14;
    if (def.fire === 'pump') vm.play(pumpCycle(def.pumpTime));
    if (def.reloadStyle === 'pistol' && c.mag === 0) vm.persist.slide = 1;
    this.lastShotT = g.time;
    if (g.muzzleLight) {
      const cam = g.engine.camera;
      cam.getWorldDirection(_d);
      g.muzzleLight.position.copy(cam.position).addScaledVector(_d, 0.9);
      g.muzzleLight.intensity = def.heavy || def.id === 'shotgun' || def.id === 'sniper' ? 26 : 16;
    }
  }
  // where the muzzle of the gun in his hands is in the world (the tracer comes out of it)
  muzzle(out) {
    const vm = this.vm, cam = this.game.engine.camera;
    if (!vm.model) return null;
    out.copy(vm.model.anchors.muzzle);
    vm.model.root.localToWorld(out);
    return out.applyMatrix4(cam.matrixWorld);
  }

  // his reload, as long as his takes (a person's: as long as the gun's)
  startReload(c) {
    const def = this.def, style = def.reloadStyle, empty = !c.remote && c.mag === 0;
    const dur = !c.remote && c.reloadTotal ? c.reloadTotal : empty ? def.reloadEmpty || def.reload : def.reload;
    this.reloadEmpty = empty;
    const vm = this.vm;
    if (style === 'shell') {
      // (the shells one by one: as many as he puts in)
      const per = def.reload, n = c.remote ? def.mag - 1 : Math.round((dur - per * 1.1) / per);
      this.shellN = clamp(n, 1, def.mag);
      vm.play(shotgunStart(0.36));
      return;
    }
    if (style === 'mag' || style === 'bolt') vm.play(magReload(dur, empty && style === 'mag', def.reloadTail || (def.id === 'smg' || def.id === 'dmr' ? 'charge' : 'bolt')));
    else if (style === 'box') vm.play(boxReload(dur));
    else if (style === 'pistol') vm.play(pistolReload(dur, empty));
    else if (style === 'revolver') vm.play(revolverReload(dur));
  }
  isReload(clip) { return !!clip && (clip.name === 'reload' || clip.name === 'rstart' || clip.name === 'rshell' || clip.name === 'rend'); }

  // the hands' own events: their sounds and jolts, as for your own (nothing else: his ammo is his)
  anim(name, clip) {
    const g = this.game, J = this.vm, def = this.def;
    if (!def) return;
    if (SFX[name] !== undefined) g.audio.play(name === 'magGrab' ? 'magTouch' : name, { vol: SFX[name] });
    if (name === 'magOut') { J.jolt(0, -0.22, 0.05, -1.4, 0.3, 0.8); g.shake.add(0.015); }
    else if (name === 'magIn') { J.jolt(0.02, 0.36, 0.14, 3.0, -0.35, 1.0); g.shake.add(0.03); }
    else if (name === 'magKnock') J.jolt(0.02, 0.06, 0, 0.6, 0, -0.4);
    else if (name === 'magTug') { J.jolt(0, -0.14, 0, -0.9, 0, 0.25); g.audio.play('magTouch', { vol: 0.3, rate: 0.85 }); }
    else if (name === 'toss') { J.jolt(-0.03, 0.04, 0, 0.3, 0.2, -0.3); g.audio.play('magDrop', { vol: 0.4, delay: 0.42 }); }
    else if (name === 'chargeBack') J.jolt(0, -0.05, 0.15, -0.7, 0.1, 0.4);
    else if (name === 'chargeFwd') J.jolt(0, 0.12, -0.2, 1.5, -0.2, -0.8);
    else if (name === 'magTap') { J.jolt(0, 0.26, 0.05, 1.9, 0, 0.5); g.audio.play('magIn', { vol: 0.4, rate: 1.15 }); g.shake.add(0.015); }
    else if (name === 'boltRelease') { J.jolt(0.06, 0.24, -0.28, 2.6, -0.35, -1.3); g.audio.play('chargeFwd', { vol: 0.75, rate: 1.05 }); g.shake.add(0.05); }
    else if (name === 'boltBack') J.jolt(0, 0, 0.12, -0.5, 0, 0.5);
    else if (name === 'boltFwd') J.jolt(0, 0.05, -0.15, 0.7, 0, -0.5);
    else if (name === 'pumpBack') J.jolt(0, -0.04, 0.22, -0.8, 0, 0.3);
    else if (name === 'pumpFwd') J.jolt(0, 0.06, -0.22, 0.9, 0, -0.3);
    else if (name === 'shellIn') J.jolt(0, 0.1, -0.06, 0.8, 0, 0.3);
    else if (name === 'slideFwd') J.jolt(0, 0.16, -0.1, 1.8, 0, -0.6);
    else if (name === 'coverClose') J.jolt(0, -0.22, 0.02, -1.6, 0, 0.3);
    else if (name === 'coverOpen') J.jolt(0, 0.08, 0, 0.6, 0, -0.2);
    else if (name === 'cylOpen') J.jolt(-0.05, 0.05, 0, 0.6, 0, 1.4);
    else if (name === 'cylClose') J.jolt(0.06, 0.08, 0, 0.8, 0, -2.2);
    else if (name === 'loaderIn') J.jolt(0, -0.1, 0.06, -0.8, 0, 0.2);
    if (name === 'swing') { g.audio.play('swing', { vol: 0.8 }); J.jolt(0, -0.02, 0, -0.3, 0.3, 0); }
    if (name === 'refill' && def.reloadStyle === 'pistol') J.persist.slide = this.reloadEmpty ? 1 : 0;
    if (name === 'slideFwd') J.persist.slide = 0;
    if (name === 'eject') { J.ejectCasing(); g.audio.play(def.fire === 'pump' ? 'casingShotgun' : 'casing', { vol: 0.25, delay: 0.3 }); }
    if (name === 'ejectAll') for (let i = 0; i < 6; i++) J.ejectCasing();
    if (name !== 'end') return;
    const c = clip.name;
    if (c === 'rstart') { J.play(shotgunShell(def.reload)); return; }
    if (c === 'rshell') { if (--this.shellN > 0) J.play(shotgunShell(def.reload)); else J.play(shotgunEnd(0.34)); return; }
    if (c === 'rend' && this.reloadEmpty && def.fire === 'pump') J.play(pumpCycle(def.pumpTime));
  }

  // a ledge for the hands: a bot knows where he climbs to; for a person it is found from where he looks
  ledgeOf(c) {
    const g = this.game;
    if (!c.remote) {
      const m = c.mantling;
      if (!m) return null;
      if (this.ledgeSrc !== m) {
        this.ledgeSrc = m;
        let ax = m.tx - m.sx, az = m.tz - m.sz;
        const L = Math.hypot(ax, az) || 1; ax /= L; az /= L;
        const top = m.ty - 0.01, h = g.col.raycast(m.sx, top - 0.12, m.sz, ax, 0, az, L + 0.6, _hit);
        this.ledge = { ex: h ? h.x : m.sx + ax * L * 0.5, ez: h ? h.z : m.sz + az * L * 0.5, ax, az, sx: -az, sz: ax, top, high: top > m.sy + 1.5, over: false };
      }
      return { L: this.ledge, k: Math.min(1, m.t / m.dur) };
    }
    if (!this.mantling(c)) { this.ledgeSrc = null; return null; }
    if (!this.ledgeSrc) {
      const ax = -Math.sin(c.aimYaw), az = -Math.cos(c.aimYaw), y0 = c.pos.y;
      const h = g.col.raycast(c.pos.x, y0 + 0.9, c.pos.z, ax, 0, az, 1.4, _hit);
      const ex = h ? h.x : c.pos.x + ax * 0.5, ez = h ? h.z : c.pos.z + az * 0.5;
      const top = g.col.floorBelow(ex + ax * 0.25, ez + az * 0.25, 0.1, y0 + 2.6, y0);
      const tp = Number.isFinite(top) ? top : y0 + 1;
      const high = tp > y0 + 1.5;
      this.ledgeSrc = { t0: g.time, dur: high ? 0.62 + (tp - y0) * 0.09 : 0.22 + Math.max(0, tp - y0) * 0.13 };
      this.ledge = { ex, ez, ax, az, sx: -az, sz: ax, top: tp, high, over: false };
    }
    return { L: this.ledge, k: Math.min(1, (g.time - this.ledgeSrc.t0) / this.ledgeSrc.dur) };
  }

  // the crosshair's spread for the gun in his hands (as for yours, roughly)
  spread() {
    const c = this.who, def = this.def;
    if (!c || !def) return 2;
    const hip = def.hip + def.moveSpread * clamp(this.speed(c) / 7, 0, 1);
    return hip + (def.adsSpread - hip) * Math.pow(this.ads, 1.5);
  }

  // ---- every frame he is watched: the eyes, the hands (called once the frame's own camera is to be set)
  update(dt, cam) {
    const g = this.game, c = this.who;
    if (!c || dt <= 0) return;
    this.syncGun(c, true);
    const def = this.def, vm = this.vm;
    // a reload of his starting (or, from someone else's computer, broken off before the hands are done)
    const rl = this.reloading(c);
    if (rl && !this.wasReload) this.startReload(c);
    else if (!rl && this.wasReload && c.remote && this.isReload(vm.clip)) { vm.stop(); this.shellN = 0; }
    this.wasReload = rl;
    // the knife
    const ml = (c.meleeT || 0) > 0;
    if (ml && !this.wasMelee) { vm.stop(); vm.play(meleeClip(0.55)); }
    this.wasMelee = ml;
    // the bolt after a shot
    if (this.boltAt && g.time >= this.boltAt) { this.boltAt = 0; if (!vm.clip) vm.play(boltCycle(def.boltTime)); }
    // aiming down the sights, as quick as the gun aims
    const want = this.adsWant(c) && !this.isReload(vm.clip), rate = 1 / Math.max(0.12, def.ads || 0.25);
    this.ads = clamp(this.ads + (want ? rate : -rate * 1.3) * dt, 0, 1);
    vm.adsOverride = this.ads;
    // where he looks (a bot's aim with its error: the kick climbs and settles), followed closely
    const ty = this.yawOf(c), tp = this.pitchOf(c), kL = 1 - Math.exp(-dt / 0.035);
    const dy = angleDiff(this.yaw, ty) * kL, dp = (tp - this.pitch) * kL;
    this.yaw += dy; this.pitch += dp;
    const sens = Math.max(1e-6, (g.settings.sensitivity || 3) * 0.022 * DEG);
    this.lookDX = damp(this.lookDX, -dy / sens, 20, dt); this.lookDY = damp(this.lookDY, -dp / sens, 20, dt);
    // the eyes: crouching, sliding and climbing take them down and up, eased as yours are
    this.eyeH = damp(this.eyeH, c.eyeH, this.sliding(c) ? 22 : 17, dt);
    // walking: the bob; a landing: the dip
    const sp = this.speed(c), ground = this.grounded(c), crouch = !!c.crouching && !this.sliding(c);
    if (ground && sp > 0.5 && !this.sliding(c)) {
      this.bobPhase += sp * (this.sprinting(c) ? 1.05 : 1.2) * (crouch ? 1.2 : 1) * dt * 1.15;
      this.bobAmt = damp(this.bobAmt, clamp(sp / 9, 0, 1), 8, dt);
    } else this.bobAmt = damp(this.bobAmt, 0, 6, dt);
    if (ground && !this.wasGround && this.vyPrev < -2) { const v = Math.min(9, -this.vyPrev); this.land.impulse(-v * 0.32); this.landVm = Math.min(1, v / 8); }
    this.wasGround = ground; this.vyPrev = c.vel.y;
    for (const s of [this.punchP, this.punchY, this.punchR, this.fovPunch, this.land]) s.update(dt);
    // climbing: the hands on the edge, the eyes up at it and down over it
    const lg = this.ledgeOf(c);
    let mP = 0;
    if (lg && lg.L.high) { const k = lg.k, up = clamp((lg.L.top - (c.pos.y + this.eyeH)) * 0.42, 0, 0.42); mP = up * Math.sin(clamp(k / 0.5, 0, 1) * Math.PI) - 0.3 * Math.sin(clamp((k - 0.5) / 0.5, 0, 1) * Math.PI); }
    // the camera
    const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.028 * this.bobAmt, bobX = Math.sin(this.bobPhase) * 0.014 * this.bobAmt;
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    cam.position.set(c.pos.x + rx * bobX, c.pos.y + this.eyeH + bobY + this.land.x * 0.3, c.pos.z + rz * bobX);
    const roll = (this.sliding(c) ? -0.05 : 0) + this.punchR.x + vm.cam.z;
    cam.rotation.set(this.pitch + mP + this.punchP.x + vm.cam.x + this.land.x * 0.012, this.yaw + this.punchY.x + vm.cam.y, roll, 'YXZ');
    // the hands
    const strafe = clamp((c.vel.x * rx + c.vel.z * rz) / 5, -1, 1);
    vm.update(dt, {
      ads: this.ads, firing: g.time - this.lastShotT < 0.25, mantleHigh: !!(lg && lg.L.high), ledge: lg ? lg.L : null,
      sprint: this.sprinting(c), tac: this.tac(c), slide: this.sliding(c), dive: false, mantle: !!lg,
      crawl: !!c.prone && sp > 0.3, crouch, lower: false,
      bobPhase: this.bobPhase, bobAmt: this.bobAmt * (ground ? 1 : 0),
      lookDX: this.lookDX, lookDY: this.lookDY, vy: c.vel.y, strafe,
      landImpulse: this.landVm, corner: 0, mantleK: lg ? lg.k : 0,
      sunDirCam: g.sunDirCam, inShadow: g.playerInShadow, mount: false, mountSide: 0,
    });
    this.landVm = 0;
    // his body is not drawn in front of his own eyes
    if (c.soldier) c.soldier.setVisible(false);
  }
}
