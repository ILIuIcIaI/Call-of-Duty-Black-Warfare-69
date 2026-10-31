import * as THREE from 'three';
import { WEAPONS } from './defs.js';
import { Viewmodel } from './viewmodel.js';
import { magReload, boxReload, pistolReload, revolverReload, shotgunStart, shotgunShell, shotgunEnd, pumpCycle, boltCycle, drawClip, holsterClip, inspectClip, firstRaise, plateClip, meleeClip } from './anim.js';
import { makeWeaponDef } from '../game/loot.js';
import { clamp, damp, DEG, rand, Spring, smooth } from '../core/math.js';

// =============================================================================
// Player weapon logic: firing modes, ammo, reload state machine, ADS, recoil,
// sprint-to-fire, weapon swapping. Drives the viewmodel and asks the game to
// trace bullets.
// =============================================================================
export const PLATE_TIME = 1.15;
const _dir = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3(), _v = new THREE.Vector3();

export class PlayerWeapons {
  constructor(game) {
    this.game = game;
    this.vm = new Viewmodel(game);
    this.vm.onEvent = (name, clip) => this.onAnimEvent(name, clip);
    this.slots = [null, null];
    this.cur = 0;
    this.state = 'idle';
    this.adsAmount = 0; this.wantsAds = false;
    this.nextShot = 0; this.lastShotT = -9;
    this.firingRecently = false;
    this.recoilIndex = 0;
    this.punchP = new Spring(220, 17); this.punchY = new Spring(220, 17); this.punchR = new Spring(260, 16); this.fovPunch = new Spring(300, 18);
    this.bloom = 0;
    this.raiseT = 0;
    this.pendingSlot = -1;
    this.fireBuffer = 0;
    this.shellLoop = false;
    this.needsChamber = false;
  }

  get w() { return this.slots[this.cur]; }
  get def() { return this.w.def; }
  get busy() { return this.state !== 'idle'; }

  // A new match. Its clock starts at zero, so the next shot can't wait for a time from the last one.
  startOver() {
    clearTimeout(this._boltDelay);
    this.nextShot = 0; this.lastShotT = -9; this.fireBuffer = 0; this.raiseT = 0; this.recoilIndex = 0; this.bloom = 0;
    this.state = 'idle'; this.burstLeft = 0; this.pendingSlot = -1; this.shellLoop = false; this.lunge = null;
    this.stowed = false; this.lockSlot = -1; this.adsAmount = 0; this.wantsAds = false; this.firingRecently = false;
    this.vm.stop(); this.vm.endFree();
  }

  setLoadout(lo) {
    const mk = (id, optic) => {
      const def = WEAPONS[id];
      return { def, optic: def.optics.includes(optic) ? optic : def.optics[0], mag: def.mag, reserve: def.reserve, chambered: true };
    };
    this.slots = [mk(lo.primary, lo.primaryOptic), mk(lo.secondary, lo.secondaryOptic)];
    this.cur = 0;
    this.equip(true);
  }

  // Loadout changed during a match: swap whatever differs right away and pull out the new gun
  applyLoadout(lo) {
    const slot = (id, optic) => {
      const def = WEAPONS[id];
      return { def, optic: def.optics.includes(optic) ? optic : def.optics[0], mag: def.mag, reserve: def.reserve, chambered: true };
    };
    const P = slot(lo.primary, lo.primaryOptic), S = slot(lo.secondary, lo.secondaryOptic);
    const cur = this.slots;
    const chP = !cur[0] || cur[0].def !== P.def || cur[0].optic !== P.optic, chS = !cur[1] || cur[1].def !== S.def || cur[1].optic !== S.optic;
    if (!chP && !chS) return false;
    if (chP) cur[0] = P;
    if (chS) cur[1] = S;
    this.vm.stop(); this.shellLoop = false; this.pendingSlot = -1;
    this.cur = chP ? 0 : 1;
    this.equip(false);
    return true;
  }

  // Warzone: you land with nothing but a plain pistol
  setStartLoadout() {
    const def = WEAPONS.pistol;
    this.slots = [null, { def, optic: 'iron', mag: def.mag, reserve: def.mag * 2, chambered: true }];
    this.cur = 1; this.lockSlot = -1; this.state = 'idle'; this.adsAmount = 0; this.burstLeft = 0; this.stowed = false; this.lunge = null;
    this.vm.stop(); this.vm.endFree();
    this.vm.setWeapon(def, 'iron');
  }

  // a found weapon goes into its slot; what was there comes back to be dropped
  pickup(it) {
    const def = makeWeaponDef(it.weaponId, it.rarity);
    const i = def.slot === 'primary' ? 0 : 1, old = this.slots[i];
    this.slots[i] = { def, optic: it.optic, mag: it.mag ?? def.mag, reserve: it.reserve ?? def.mag * 3, chambered: true };
    this.vm.stop(); this.shellLoop = false; this.pendingSlot = -1;
    this.cur = i;
    this.equip(false);
    return old;
  }

  // put away for the jump: nothing in the hands until a weapon key is pressed
  stow() {
    this.prevCur = this.cur;
    this.cancelReload(); this.vm.stop(); this.shellLoop = false; this.pendingSlot = -1; this.burstLeft = 0; this.lunge = null;
    this.state = 'idle'; this.adsAmount = 0; this.wantsAds = false; this.firingRecently = false;
    this.stowed = true;
  }
  // the sidearm comes out
  unstow(slot = 1) {
    this.stowed = false;
    this.vm.endFree();
    this.cur = slot; this.equip(false);
  }

  startPlate() {
    if (this.state === 'holster' || this.state === 'draw') return false;
    this.vm.stop(); this.shellLoop = false;
    this.state = 'plate';
    this.vm.play(plateClip(PLATE_TIME));
    return true;
  }
  plateDone() { if (this.state === 'plate') this.state = 'idle'; }

  refillAll() {
    for (const s of this.slots) { s.mag = s.def.mag; s.reserve = s.def.reserve; s.chambered = true; }
  }

  equip(first) {
    const w = this.w;
    this.vm.setWeapon(w.def, w.optic);
    this.adsAmount = 0; this.burstLeft = 0;
    this.state = 'draw';
    const quick = w.def.slot === 'secondary';
    if (first && !quick) this.vm.play(firstRaise(1.0, !!this.vm.model.parts.charge && w.def.reloadStyle === 'mag'));
    else this.vm.play(drawClip(quick ? 0.32 : 0.45));
    if (w.def.reloadStyle === 'pistol' && w.mag === 0) this.vm.persist.slide = 1;
  }

  // --------------------------------------------------------------- update
  update(dt, input, player) {
    const g = this.game, t = g.time;
    const w = this.w, def = w.def;
    if (!player.alive) return;

    // ---- weapon switching
    let want = -1;
    if (input.pressed('weapon1')) want = 0;
    if (input.pressed('weapon2')) want = 1;
    if (input.pressed('swap') || input.wheel !== 0) want = 1 - this.cur;
    if (want >= 0 && want !== this.cur && this.state !== 'holster' && this.state !== 'plate' && this.slots[want] && !(this.lockSlot >= 0)) {
      this.cancelReload();
      this.state = 'holster'; this.pendingSlot = want;
      this.vm.play(holsterClip(0.2));
    }

    // ---- knife
    if (input.pressed('melee') && !player.gliding && player.mode !== 'mantle' && player.mode !== 'dive' && this.state !== 'holster' && this.state !== 'plate' && this.state !== 'melee') this.startMelee(player);
    if (this.lunge) this.updateLunge(dt, player);

    // ---- sprint / movement restrictions
    const sprinting = player.sprinting;
    // can't aim or shoot with no free hands, in the middle of rolling over, or while swapping
    const lowered = player.mode === 'mantle' || player.proneRollT > 0 || this.state === 'holster';
    if (sprinting) this.raiseT = player.tac ? def.tacToFire : def.sprintToFire;
    else if (player.mode === 'slide') this.raiseT = Math.min(this.raiseT, 0.08);
    else this.raiseT = Math.max(0, this.raiseT - dt);
    if (lowered) this.raiseT = Math.max(this.raiseT, player.mantle && player.mantle.high ? 0.28 : 0.15);

    // ---- ADS
    if (this.state === 'inspect' && input.ads) { this.vm.stop(); this.state = 'idle'; }
    // aiming during a reload: wait for the magazine, then it cuts the rest of the animation short
    let reloading = this.state === 'reload' && def.reloadStyle !== 'shell';
    if (reloading && this.refilled && input.ads && !sprinting && !lowered) { this.vm.stop(); this.state = 'idle'; reloading = false; }
    this.wantsAds = (input.ads || (player.mount && player.mount.held)) && !sprinting && !lowered && !reloading && this.state !== 'inspect' && this.state !== 'plate' && this.state !== 'melee';
    const adsRate = 1 / def.ads * (this.raiseT > 0 ? 0.75 : 1);
    this.adsAmount = clamp(this.adsAmount + (this.wantsAds ? adsRate : -adsRate * 1.3) * dt, 0, 1);

    // ---- fire input
    if (input.firePressed) this.fireBuffer = 0.15; else this.fireBuffer -= dt;
    this.firingRecently = input.fire && this.state !== 'holster' && this.state !== 'draw';
    const triggerHeld = input.fire;
    const canShootState = this.state === 'idle' || (this.state === 'reload' && def.reloadStyle === 'shell' && w.mag > 0);
    // a started burst always finishes, unless the gun runs dry or gets put away
    if (this.burstLeft > 0 && (w.mag <= 0 || !canShootState || lowered)) { this.burstLeft = 0; this.nextShot = Math.max(this.nextShot, t + def.burstDelay); }
    const bursting = this.burstLeft > 0;
    if ((this.fireBuffer > 0 || bursting || (triggerHeld && def.fire === 'auto')) && canShootState && this.raiseT <= 0 && !lowered && t >= this.nextShot) {
      if (w.mag <= 0) {
        if (this.fireBuffer > 0) { g.audio.play('dryfire', { vol: 0.6 }); this.fireBuffer = 0; this.tryReload(); }
      } else if (def.fire === 'auto' || bursting || this.fireBuffer > 0) {
        if (this.state === 'reload') { this.shellLoop = false; this.vm.stop(); this.state = 'idle'; }
        if (def.fire === 'burst' && !bursting) this.burstLeft = def.burst;
        if (def.fire !== 'bolt' || w.chambered) this.shoot(player);
        if (def.fire === 'burst' && --this.burstLeft === 0) this.nextShot = t + def.burstDelay;
        this.fireBuffer = 0;
      }
    }
    if (t - this.lastShotT > 0.22) this.recoilIndex = 0;

    // ---- reload / inspect input
    if (input.pressed('reload')) this.tryReload();
    if (input.pressed('inspect') && this.state === 'idle' && this.adsAmount < 0.1) { this.state = 'inspect'; this.vm.play(inspectClip(3.0)); }
    if (this.state === 'inspect' && (triggerHeld || sprinting)) { this.vm.stop(); this.state = 'idle'; }
    // tac sprint cancels an unfinished reload
    if (this.state === 'reload' && player.tac && !this.refilled) this.cancelReload();

    // ---- spread bloom recovery
    this.bloom = Math.max(0, this.bloom - dt * 6);
    this.punchP.update(dt); this.punchY.update(dt); this.punchR.update(dt); this.fovPunch.update(dt);

    // ---- viewmodel
    const corner = this.cornerProbe(player);
    this.vm.update(dt, {
      ads: this.adsAmount, firing: this.firingRecently, mantleHigh: !!(player.mantle && player.mantle.high), ledge: player.mantle,
      sprint: sprinting, tac: player.tac, slide: player.mode === 'slide', dive: player.mode === 'dive', mantle: player.mode === 'mantle',
      crawl: player.stance === 'prone' && player.speedH > 0.3 && t - this.lastShotT > 0.5 && !this.firingRecently, crouch: player.stance === 'crouch', lower: player.proneRollT > 0,
      bobPhase: player.bobPhase, bobAmt: player.bobAmt * (player.onGround ? 1 : 0),
      lookDX: g.lookDX, lookDY: g.lookDY, vy: player.vel.y, strafe: player.moveInput.x,
      landImpulse: player._landVm || 0, corner, mantleK: player.mantle ? Math.min(1, player.mantle.t / player.mantle.dur) : 0,
      sunDirCam: g.sunDirCam, inShadow: g.playerInShadow, mount: !!player.mount, mountSide: player.mount ? player.mount.side : 0,
    });
    player._landVm = 0;
  }

  // cosmetic corner slicing: tilt toward the open side when hugging a wall corner
  cornerProbe(player) {
    if (this.adsAmount > 0.5 || player.sprinting) return 0;
    this._cornerT = (this._cornerT || 0) - 1;
    if (this._cornerT > 0) return this._corner || 0;
    this._cornerT = 6;
    const col = this.game.col, e = this.game.engine.camera.position;
    const f = player.forwardVec(_v), r = player.rightVec(new THREE.Vector3());
    const L = 1.2;
    const hitL = !col.lineClear(e.x, e.y, e.z, e.x + (f.x - r.x) * L, e.y, e.z + (f.z - r.z) * L);
    const hitR = !col.lineClear(e.x, e.y, e.z, e.x + (f.x + r.x) * L, e.y, e.z + (f.z + r.z) * L);
    this._corner = hitL && !hitR ? -1 : hitR && !hitL ? 1 : 0;
    return this._corner;
  }

  currentSpread(player) {
    const def = this.def;
    const moveF = clamp(player.speedH / 7, 0, 1);
    let hip = def.hip + def.moveSpread * moveF + this.bloom;
    if (!player.onGround && player.mode !== 'dive' && !player.gliding) hip += 3.5;
    if (player.mode === 'slide' || player.mode === 'dive') hip += 1.5;
    if (player.stance === 'crouch') hip *= 0.85; else if (player.stance === 'prone') hip *= 0.7;
    const adsS = def.adsSpread + (player.onGround || player.gliding ? 0 : 1.5) + moveF * 0.15;
    const a = Math.pow(this.adsAmount, 1.5);
    return hip + (adsS - hip) * a;
  }

  shoot(player) {
    const g = this.game, w = this.w, def = w.def;
    w.mag--;
    this.lastShotT = g.time;
    this.nextShot = g.time + 60 / def.rpm;
    const cam = g.engine.camera;
    cam.getWorldDirection(_dir);
    _right.setFromMatrixColumn(cam.matrixWorld, 0);
    _up.setFromMatrixColumn(cam.matrixWorld, 1);
    const spread = this.currentSpread(player) * DEG;
    const pellets = def.pellets || 1;
    // muzzle position in world (approximate from viewmodel camera space)
    const vm = this.vm;
    const muzzle = _v.copy(vm.model.anchors.muzzle);
    vm.model.root.localToWorld(muzzle); // camera space
    muzzle.applyMatrix4(cam.matrixWorld);
    const muzzleW = muzzle.clone();
    const scoped = vm.model.optic && vm.model.optic.overlay && this.adsAmount > 0.9;
    for (let i = 0; i < pellets; i++) {
      // uniform disc sample in the spread cone
      const r = Math.sqrt(Math.random()) * (pellets > 1 ? def.pelletSpread * DEG * (1 - this.adsAmount * 0.25) : spread) * 0.5;
      const a = Math.random() * Math.PI * 2;
      const d = _dir.clone().addScaledVector(_right, Math.cos(a) * Math.tan(r)).addScaledVector(_up, Math.sin(a) * Math.tan(r)).normalize();
      g.fireBullet(cam.position, d, def, player, scoped ? null : muzzleW, i === 0);
    }
    // ---- recoil: mostly permanent camera climb (pull down to compensate) + a returning punch
    const rc = def.recoil, k = this.recoilIndex;
    const ramp = k === 0 ? 0.75 : Math.min(1.15, 0.85 + k * 0.06);
    const adsM = this.adsAmount > 0.5 ? 1 : 1.2;
    const stanceM = (player.stance === 'crouch' ? 0.85 : player.stance === 'prone' ? 0.65 : 1) * (player.mount ? 0.55 : 1);
    const up = rc.up * ramp * adsM * stanceM;
    const side = (Math.sin(k * 1.9 + this.cur * 3) * 0.55 + (Math.random() * 2 - 1) * 0.45) * rc.side * adsM + rc.bias * 0.3;
    player.pitch = clamp(player.pitch + up * 0.72 * DEG, -88 * DEG, 88 * DEG);
    player.yaw -= side * 0.72 * DEG;
    // camera punch (returns by itself): pitch, yaw, roll and a quick FOV kick
    const adsP = this.adsAmount > 0.5 ? 0.75 : 1;
    this.punchP.impulse(up * DEG * 26 * adsP);
    this.punchY.impulse(-side * DEG * 18 * adsP);
    this.punchR.impulse((Math.random() * 2 - 1) * rc.kick * DEG * 30);
    this.fovPunch.impulse(rc.kick * 9 * (this.adsAmount > 0.5 ? 0.5 : 1));
    this.recoilIndex++;
    this.bloom = Math.min(def.hip * 0.8, this.bloom + def.hip * 0.12);
    vm.onShot(def, this.adsAmount > 0.5);
    g.shake.add(rc.kick * (this.adsAmount > 0.5 ? 0.05 : 0.08));
    g.audio.gunshot(def.sound);
    g.onPlayerShot(def);
    if (def.fire !== 'bolt' && def.fire !== 'pump' && !this.vm.model.revolver) {
      vm.ejectCasing();
      if (Math.random() < 0.5) g.audio.play('casing', { vol: 0.25, delay: 0.25 + Math.random() * 0.15 });
    }
    if (def.reloadStyle === 'pistol' && w.mag === 0) vm.persist.slide = 1;
    // follow-up actions
    if (def.fire === 'bolt') { w.chambered = false; this.state = 'bolt'; this._boltDelay = setTimeout(() => { if (this.state === 'bolt' && this.w === w) this.vm.play(boltCycle(def.boltTime)); }, 140); }
    if (def.fire === 'pump') { this.state = 'pump'; this.vm.play(pumpCycle(def.pumpTime)); }
    if (w.mag === 0 && w.reserve > 0 && def.fire !== 'pump' && def.fire !== 'bolt') setTimeout(() => { if (this.w === w && this.state === 'idle' && w.mag === 0) this.tryReload(); }, 180);
  }

  tryReload() {
    const w = this.w, def = w.def;
    if (this.state !== 'idle' || w.mag >= def.mag || w.reserve <= 0) return;
    const empty = w.mag === 0;
    this.state = 'reload'; this.refilled = false;
    this.reloadEmpty = empty;
    const style = def.reloadStyle;
    if (style === 'mag' || style === 'bolt') this.vm.play(magReload(empty ? def.reloadEmpty : def.reload, empty && style === 'mag', def.reloadTail || (def.id === 'smg' || def.id === 'dmr' ? 'charge' : 'bolt')));
    else if (style === 'box') this.vm.play(boxReload(def.reload));
    else if (style === 'pistol') this.vm.play(pistolReload(empty ? def.reloadEmpty : def.reload, empty));
    else if (style === 'revolver') this.vm.play(revolverReload(def.reload));
    else if (style === 'shell') { this.shellLoop = true; this.vm.play(shotgunStart(0.36)); }
    this.game.events.emit('reload', { entity: this.game.player });
  }

  // ---------------------------------------------------------------- knife
  // the closest enemy in front of us within reach
  meleeTarget(player, reach, cone = 0.72) {
    const g = this.game, f = player.forwardVec(_v), eye = player.eyePos;
    let best = null, bd = Infinity;
    for (const c of g.combatants) {
      if (c === player || !c.alive || c.sky || g.isFriendly(c, player)) continue;
      const dx = c.pos.x - player.pos.x, dz = c.pos.z - player.pos.z, d = Math.hypot(dx, dz);
      if (d > reach || Math.abs(c.pos.y - player.pos.y) > 1.7) continue;
      if (d > 0.7 && (dx * f.x + dz * f.z) / d < Math.cos(cone)) continue;
      if (!g.col.lineClear(eye.x, eye.y, eye.z, c.pos.x, c.pos.y + 1.1, c.pos.z)) continue;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  startMelee(player) {
    const g = this.game;
    this.vm.stop(); this.shellLoop = false; this.pendingSlot = -1; this.burstLeft = 0;
    player.sprinting = false; player.tac = false;
    // Warzone: from behind, on someone already hurt, it turns into a finisher
    if (g.br && g.br.tryFinisher(player)) return;
    this.state = 'melee';
    this.vm.play(meleeClip(0.62));
    // a short lunge toward whoever is close enough
    const c = this.meleeTarget(player, 3.6);
    this.lunge = c ? { c, t: 0.17 } : null;
  }

  updateLunge(dt, player) {
    const L = this.lunge;
    L.t -= dt;
    if (L.t <= 0 || !L.c.alive || player.mode !== 'normal') { this.lunge = null; return; }
    const dx = L.c.pos.x - player.pos.x, dz = L.c.pos.z - player.pos.z, d = Math.hypot(dx, dz);
    if (d < 1.25) { this.lunge = null; return; }
    player.vel.x = dx / d * 10.5; player.vel.z = dz / d * 10.5;
  }

  meleeStrike(player) {
    const g = this.game, c = this.meleeTarget(player, 2.45, 0.95), cam = g.engine.camera;
    cam.getWorldDirection(_dir);
    if (c) {
      const dx = c.pos.x - player.pos.x, dz = c.pos.z - player.pos.z, d = Math.hypot(dx, dz) || 1;
      // its own facing against the direction we are coming from: from behind, the knife kills outright
      const yaw = c.isBot ? c.aimYaw : c.yaw, back = (-Math.sin(yaw) * dx + -Math.cos(yaw) * dz) / d > 0.35;
      const dmg = back && !g.br ? 400 : 105; // Warzone has the finisher for this
      const dir = new THREE.Vector3(dx / d, 0.1, dz / d);
      const point = new THREE.Vector3(c.pos.x - dx / d * 0.25, c.pos.y + 1.15, c.pos.z - dz / d * 0.25);
      g.fx.impact(point, _v.copy(dir).negate(), 'flesh', 1.4);
      g.audio.play('stab', { vol: 1 });
      g.shake.add(0.16);
      this.vm.jolt(0, 0, 0.05, 0.5, -0.5, -0.4);
      g.applyDamage(c, dmg, player, { part: 'chest', dir, weapon: { name: 'MESSER', damage: [dmg, dmg] }, point });
      return;
    }
    // a wall? you hear it
    const eye = cam.position, h = g.col.raycast(eye.x, eye.y, eye.z, _dir.x, _dir.y, _dir.z, 1.7, this._mh || (this._mh = {}));
    if (h) {
      const p = new THREE.Vector3(h.x, h.y, h.z), n = new THREE.Vector3(h.nx, h.ny, h.nz);
      g.fx.impact(p, n, h.surface, 0.8);
      g.audio.play('imp_' + (h.surface === 'glass' || h.surface === 'water' ? 'metal' : h.surface), { pos: p, vol: 0.8, maxDist: 30, occlude: false });
      g.shake.add(0.08);
      this.vm.jolt(0, 0, 0.07, 0.8, -0.8, -0.5);
    }
  }

  cancelReload() {
    if (this.state === 'reload' || this.state === 'inspect') {
      this.vm.stop();
      this.state = 'idle';
      this.shellLoop = false;
    }
  }

  onAnimEvent(name, clip) {
    const g = this.game, w = this.w, def = w.def;
    const sfx = { magOut: 0.5, magIn: 0.7, magTouch: 0.25, chargeBack: 0.55, chargeFwd: 0.6, boltUp: 0.5, boltBack: 0.6, boltFwd: 0.6, boltDown: 0.5,
      pumpBack: 0.7, pumpFwd: 0.7, shellIn: 0.5, coverOpen: 0.5, coverClose: 0.6, slideFwd: 0.6, cylOpen: 0.5, cylClose: 0.6, loaderIn: 0.6,
      hammer: 0.5, draw: 0.35, holster: 0.3, inspect1: 0.3, inspect2: 0.35, ejectAll: 0.4, magGrab: 0.2, magKnock: 0.45, pouch: 0.3 };
    if (sfx[name] !== undefined) g.audio.play(name === 'magGrab' ? 'magTouch' : name, { vol: sfx[name] });
    // physical jolts that sell the weight of each mechanical action
    const J = this.vm;
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
    if (name === 'meleeHit') this.meleeStrike(g.player);
    if (name === 'plateIn') { J.jolt(0.02, -0.3, 0.06, -1.6, 0.2, 0.6); if (g.br) g.br.plateIn(); }
    if (name === 'platePat') { J.jolt(0, -0.1, 0, -0.5, 0, 0.2); g.audio.play('magTouch', { vol: 0.5, rate: 0.8 }); }
    if (name === 'plateOut') g.audio.play('magTouch', { vol: 0.4 });
    if (name === 'refill') {
      const n = Math.min(def.mag - w.mag, w.reserve);
      w.mag += n; w.reserve -= n; this.refilled = true;
      if (def.reloadStyle === 'pistol') this.vm.persist.slide = this.reloadEmpty ? 1 : 0;
    }
    if (name === 'slideFwd') this.vm.persist.slide = 0;
    if (name === 'eject') {
      this.vm.ejectCasing();
      g.audio.play(def.fire === 'pump' ? 'casingShotgun' : 'casing', { vol: 0.25, delay: 0.3 });
    }
    if (name === 'ejectAll') for (let i = 0; i < 6; i++) this.vm.ejectCasing();
    if (name === 'shellIn') { w.mag++; w.reserve--; }
    if (name !== 'end') return;
    // ---- clip finished: advance state machines
    const c = clip.name;
    if (c === 'holster') {
      this.cur = this.pendingSlot; this.pendingSlot = -1;
      this.equip(false);
      return;
    }
    if (c === 'draw' || c === 'raise') { this.state = 'idle'; return; }
    if (c === 'inspect' || c === 'plate' || c === 'melee') { this.state = 'idle'; return; }
    if (c === 'pump') { this.state = 'idle'; if (w.mag === 0 && w.reserve > 0) this.tryReload(); return; }
    if (c === 'bolt') { w.chambered = true; this.state = 'idle'; if (w.mag === 0 && w.reserve > 0) this.tryReload(); return; }
    if (c === 'rstart') { this.vm.play(shotgunShell(def.reload)); return; }
    if (c === 'rshell') {
      if (this.shellLoop && w.mag < def.mag && w.reserve > 0) this.vm.play(shotgunShell(def.reload));
      else this.vm.play(shotgunEnd(0.34));
      return;
    }
    if (c === 'rend') {
      this.state = 'idle';
      if (this.reloadEmpty) { this.state = 'pump'; this.vm.play(pumpCycle(def.pumpTime)); }
      return;
    }
    if (c === 'reload') {
      this.state = 'idle';
      if (def.fire === 'bolt' && !w.chambered) { this.state = 'bolt'; this.vm.play(boltCycle(def.boltTime)); }
    }
  }

  // extra camera rotation from the recoil punch (+ the little camera ride of reloads)
  get punch() { const c = this.vm.cam; return { pitch: this.punchP.x + c.x, yaw: this.punchY.x + c.y, roll: this.punchR.x + c.z }; }
}

export { smooth, damp };
