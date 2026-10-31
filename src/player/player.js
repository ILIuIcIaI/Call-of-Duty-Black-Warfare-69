import * as THREE from 'three';
import { moveCharacter, hullFits, probeWall, STEP_HEIGHT } from './physics.js';
import { clamp, damp, lerp, Spring, DEG, smooth, angleDiff } from '../core/math.js';

// ---------------------------------------------------------------------------
// Movement tuning: MW3 (2023) speed + slide cancel, BO6 omnimovement + dive,
// BO7 wall jumps. All values in meters / seconds.
// ---------------------------------------------------------------------------
export const MOVE = {
  gravity: 19.5,
  jumpVel: 6.3,
  walk: 5.5,
  sprint: 7.7,
  tac: 9.5,
  crouch: 3.1,
  prone: 1.0,
  groundAccel: 105,
  groundDecel: 85,
  airAccel: 24,
  slideBoost: 1.22,
  slideMax: 12.2,
  slideHold: 0.22,      // seconds of full slide speed before friction
  slideFriction: 10.5,
  slideMinTime: 0.35,
  slideMaxTime: 1.05,
  diveSpeed: 8.6,
  diveUp: 3.9,
  tacDuration: 3.6,
  tacRechargeDelay: 1.4,
  tacRechargeRate: 1.2,
  wallJumpMax: 3,
  wallJumpOut: 4.6,
  wallJumpUp: 6.4,
  coyote: 0.1,
  radius: 0.32,
  climbReach: 2.75,     // standing: highest ledge the hands can get to with a hop
  climbReachAir: 2.5,   // in the air, above the feet
  vaultReach: 1.3,      // sprinting straight into cover: automatic vault up to this height
  vaultOverMax: 1.5,    // thin obstacles up to this height are vaulted to the far side
  airDiveBoost: 2.6,
  proneRollOn: 105 * DEG,  // look this far off the head direction and the body rolls onto its back...
  proneRollOff: 75 * DEG,  // ...and back onto the belly (hysteresis)
};
const H = { stand: 1.8, crouch: 1.25, prone: 0.62, slide: 1.0, dive: 0.95 };
const EYE = { stand: 1.62, crouch: 1.12, prone: 0.4, slide: 0.86, dive: 0.72, supine: 0.55 };

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.team = 0;
    this.name = 'Du';
    this.isPlayer = true;
    this.reset();
    // camera effect springs
    this.landSpring = new Spring(160, 13);
    this.rollSpring = new Spring(90, 11);
    this.pitchKick = new Spring(150, 14);
  }

  reset() {
    this.vel.set(0, 0, 0);
    this.onGround = true; this.airTime = 0; this.groundTime = 0;
    this.stance = 'stand';
    this.mode = 'normal'; // normal | slide | dive | mantle
    this.supine = false;
    this.sprinting = false; this.tac = false;
    this.tacCharge = MOVE.tacDuration; this.tacIdle = 99;
    this.slideT = 0; this.slideDir = new THREE.Vector3();
    this.diveT = 0; this.diveBackward = false; this.diveYaw = 0;
    this.crouchHeldT = -1; this.crouchHoldT = -1; this.standOnRelease = false;
    this.proneYaw = 0; this.proneSpin = 0; this.proneRollT = 0; this.proneRollDir = 1; this.proneW = 0;
    this.getUpT = 0; this.sprintBufferT = -9; this.mantleTick = 0; this.mantleP = 0; this.mantleR = 0;
    this.wallJumps = 0; this.wallJumpCd = 0;
    this.mantle = null;
    this.eyeH = EYE.stand; this.stepOffset = 0;
    this.bobPhase = 0; this.bobAmt = 0;
    this.health = 150; this.maxHealth = 150; this.lastDamage = -99;
    this.alive = true;
    this.jumpBuffered = 0;
    this.lastStepPhase = 0;
    this.moveInput = new THREE.Vector2();
    this.speedH = 0;
    this.sprintBlockT = 0;
    this.slideCancelT = -1;
    this.mount = null; this.lean = 0; this.leanRoll = 0; this.peekUp = 0; this.mountProbeT = 0; this.downed = false;
    this.peek = new THREE.Vector3(); // where the head is relative to the hull while leaning out
  }

  get height() { return this.mode === 'slide' ? H.slide : this.mode === 'dive' ? H.dive : H[this.stance]; }
  // Where the body points: follows the view, but stays put while lying down (the view turns freely)
  get bodyYaw() { return this.yaw + angleDiff(this.yaw, this.proneYaw) * this.proneW; }
  get eyePos() { return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeH + this.stepOffset, this.pos.z); }

  forwardVec(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  rightVec(out = new THREE.Vector3()) { return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }

  // ---------------------------------------------------------------- update
  update(dt, input, weapon) {
    const col = this.game.col;
    const t = this.game.time;
    if (!this.alive) return;

    // ---- read input
    let fx = 0, fz = 0;
    if (input.down('forward')) fz += 1;
    if (input.down('back')) fz -= 1;
    if (input.down('right')) fx += 1;
    if (input.down('left')) fx -= 1;
    this.updateMount(dt, input, weapon);
    if (this.mount && fz > 0) fz = 0; // pressed against the cover, no need to push on
    this.moveInput.set(fx, fz);
    const hasMove = fx !== 0 || fz !== 0;
    const fwd = this.forwardVec(_v1), right = this.rightVec(_v2);
    const wish = _v3.set(0, 0, 0).addScaledVector(fwd, fz).addScaledVector(right, fx);
    if (wish.lengthSq() > 0) wish.normalize();
    const moveAngle = hasMove ? Math.atan2(fx, fz) : 0; // 0 = forward
    const forwardish = hasMove && Math.abs(moveAngle) < 50 * DEG;

    const ads = weapon ? weapon.adsAmount > 0.3 || weapon.wantsAds : false;
    const firing = weapon ? weapon.firingRecently : false;
    this.wallJumpCd -= dt;
    this.sprintBlockT -= dt;
    if (input.pressed('jump')) this.jumpBuffered = 0.12; else this.jumpBuffered -= dt;

    // ---- sprint / tactical sprint (press sprint while sprinting => tac sprint, like CoD)
    if (input.pressed('sprint') && this.mode === 'dive') this.sprintBufferT = t; // get straight up when landing
    if (input.pressed('sprint') && !ads && this.mode === 'normal' && this.stance === 'prone') this.getUp();
    const sprintAllowed = hasMove && !ads && this.stance !== 'prone' && this.mode !== 'dive' && this.mode !== 'mantle' && this.sprintBlockT <= 0;
    if (input.pressed('sprint') && sprintAllowed) {
      if (this.mode === 'slide') this.cancelSlide('sprint');
      if (!this.sprinting) {
        this.sprinting = true;
        if (this.stance === 'crouch' && this.canStand('stand')) this.stance = 'stand';
        // double tap sprint => tac sprint immediately
        if (t - (this._lastSprintPress || -9) < 0.3 && forwardish && this.tacCharge > 0.3) this.tac = true;
      } else if (!this.tac && forwardish && this.tacCharge > 0.3) {
        this.tac = true;
      }
      this._lastSprintPress = t;
    }
    if (this.game.settings.autoSprint && sprintAllowed && forwardish && this.mode === 'normal' && this.onGround && !this.sprinting && this.groundTime > 0.15) this.sprinting = true;
    // the aim button ends a sprint, whichever way you are running (the weapon doesn't aim while sprinting, so it can't be the one to end it)
    if (this.sprinting && (!hasMove || ads || input.ads || firing || this.stance === 'prone')) { this.sprinting = false; this.tac = false; }
    if (this.tac && (!forwardish || this.tacCharge <= 0)) this.tac = false;
    // tac sprint fuel
    if (this.tac && this.onGround) { this.tacCharge -= dt; this.tacIdle = 0; }
    else {
      this.tacIdle += dt;
      if (this.tacIdle > MOVE.tacRechargeDelay) this.tacCharge = Math.min(MOVE.tacDuration, this.tacCharge + MOVE.tacRechargeRate * dt);
    }

    // ---- crouch / slide / dive
    if (input.pressed('crouch')) {
      if (this.mode === 'slide') this.cancelSlide('crouch');
      else if (this.mode === 'normal' && !this.onGround && this.airTime > 0.04) this.startAirDive(wish, fwd);
      else if (this.mode === 'normal' && this.sprinting && this.onGround && this.speedH > MOVE.walk * 0.65) { this.startSlide(wish.lengthSq() ? wish : fwd); this.crouchHeldT = 0; }
      else if (this.mode === 'normal' && this.stance === 'prone') { if (this.canStand('crouch')) { this.stance = 'crouch'; this.supine = false; } }
      else if (this.mode === 'normal') {
        // tap: toggle crouch (standing up waits for the release), hold: lie down
        this.crouchHoldT = 0;
        if (this.stance === 'crouch') this.standOnRelease = true;
        else this.stance = 'crouch';
      }
    }
    if (this.crouchHoldT >= 0) {
      if (input.down('crouch')) {
        this.crouchHoldT += dt;
        if (this.crouchHoldT > 0.26) {
          if (this.mode === 'normal' && this.onGround) this.goProne(this.yaw);
          this.crouchHoldT = -1; this.standOnRelease = false;
        }
      } else {
        if (this.standOnRelease && this.stance === 'crouch' && this.canStand('stand')) this.stance = 'stand';
        this.crouchHoldT = -1; this.standOnRelease = false;
      }
    }
    // hold crouch at the start of a slide => dive (BO6 style)
    if (this.crouchHeldT >= 0) {
      if (input.down('crouch')) {
        this.crouchHeldT += dt;
        if (this.crouchHeldT > 0.17 && this.mode === 'slide' && this.slideT < 0.3) { this.startDive(this.slideDir); this.crouchHeldT = -1; }
      } else this.crouchHeldT = -1;
    }
    if (input.pressed('dive')) {
      if (this.mode === 'normal' && !this.onGround && this.airTime > 0.04) this.startAirDive(wish, fwd);
      else if ((this.sprinting || this.mode === 'slide') && this.mode !== 'dive' && this.mode !== 'mantle') {
        this.startDive(wish.lengthSq() ? wish : fwd);
      } else if (this.mode === 'normal' && this.onGround) {
        if (this.stance === 'prone') { if (this.canStand('stand')) { this.stance = 'stand'; this.supine = false; } }
        else this.goProne(this.yaw);
      }
    }

    // ---- jump / slide cancel / wall jump / mantle
    if (this.jumpBuffered > 0) {
      if (this.mode === 'mantle') { /* ignore */ }
      else if (this.stance === 'prone' && this.mode === 'normal' && this.onGround) {
        if (this.canStand('stand')) { this.stance = 'stand'; this.supine = false; }
        this.jumpBuffered = 0;
      } else if ((this.onGround || this.airTime < MOVE.coyote) && (this.mode === 'normal' || this.mode === 'slide')) {
        if (!this.tryMantle(wish, fwd, true)) this.doJump();
        this.jumpBuffered = 0;
      } else if (!this.onGround && this.mode === 'normal') {
        if (this.tryMantle(wish, fwd, true)) this.jumpBuffered = 0;
        else if (this.tryWallJump(wish)) this.jumpBuffered = 0;
      }
    }

    // ---- auto mantle (airborne into a ledge, or sprinting into a low obstacle)
    if (--this.mantleTick <= 0) {
      this.mantleTick = 3;
      if (this.mode === 'normal' && hasMove && !this.onGround && this.vel.y < 2.5) this.tryMantle(wish, fwd, false);
      else if (this.mode === 'normal' && this.sprinting && this.onGround && forwardish) this.tryMantle(wish, fwd, false, true);
    }

    // ---- mode specific velocity
    let target = 0;
    if (this.mode === 'mantle') {
      this.updateMantle(dt);
    } else if (this.mode === 'slide') {
      this.slideT += dt;
      const sp = Math.hypot(this.vel.x, this.vel.z);
      let nsp = sp;
      if (this.slideT > MOVE.slideHold) nsp = Math.max(0, sp - MOVE.slideFriction * dt);
      // gentle steering
      if (hasMove) {
        this.slideDir.lerp(wish, 1 - Math.exp(-1.6 * dt)).normalize();
      }
      this.vel.x = this.slideDir.x * nsp; this.vel.z = this.slideDir.z * nsp;
      if (this.onGround) this.vel.y = Math.min(this.vel.y, 0);
      if ((this.slideT > MOVE.slideMinTime && nsp < MOVE.crouch + 0.6) || this.slideT > MOVE.slideMaxTime) this.endSlide();
      if (!this.onGround && this.airTime > 0.25) { this.mode = 'normal'; this.stance = this.canStand('stand') ? 'stand' : 'crouch'; }
    } else if (this.mode === 'dive') {
      this.diveT += dt;
      // in-air: keep momentum, slight control
      if (this.onGround && this.diveT > 0.12) {
        // landed: belly / back slide into prone
        this.mode = 'normal';
        this.goProne(this.diveYaw, this.diveBackward);
        this.landSpring.impulse(-1.6);
        this.game.events.emit('land', { strength: 1, surface: this.groundSurface });
        this.vel.x *= 0.55; this.vel.z *= 0.55;
        this._proneSlide = 0.35;
        if (t - this.sprintBufferT < 0.35 && !ads) { this.getUp(); this.sprinting = hasMove; }
      }
    } else {
      // normal ground / air movement
      this.updateProne(dt, fz, hasMove);
      if (this.stance === 'prone') target = this.supine ? MOVE.prone * 0.75 : MOVE.prone;
      else if (this.stance === 'crouch') target = MOVE.crouch;
      else if (this.sprinting) {
        // omnimovement: sprint in any direction, slower sideways/backwards
        const a = Math.abs(moveAngle);
        const dirMul = a < 50 * DEG ? 1 : a < 120 * DEG ? 0.9 : 0.82;
        target = (this.tac ? MOVE.tac : MOVE.sprint) * dirMul;
      } else target = MOVE.walk;
      if (weapon) target *= weapon.def.mobility * (ads ? weapon.def.adsMoveMul : 1);
      if (this.mount) target *= 0.6;
      if (!hasMove) target = 0;
      if (this.getUpT > 0) { this.getUpT -= dt; target *= 0.65; } // the first steps out of prone

      if (this._proneSlide > 0) { this._proneSlide -= dt; }
      const hv = _v4.set(this.vel.x, 0, this.vel.z);
      if (this.onGround && !(this._proneSlide > 0)) {
        const desired = _v5.copy(wish).multiplyScalar(target);
        const diff = desired.sub(hv);
        const accel = (hasMove ? MOVE.groundAccel : MOVE.groundDecel) * (this.stance === 'prone' ? 0.5 : 1);
        const maxDv = accel * dt;
        const dl = diff.length();
        if (dl > maxDv) diff.multiplyScalar(maxDv / dl);
        // keep momentum briefly above target speed (after slide cancel), decays smoothly
        const cur = hv.length();
        if (cur > target + 0.1 && hasMove && wish.dot(hv) > 0.7 * cur) {
          const ns = Math.max(target, cur - 7.5 * dt);
          hv.copy(wish).multiplyScalar(ns).lerp(hv.normalize().multiplyScalar(ns), 0.6);
        } else hv.add(diff);
        this.vel.x = hv.x; this.vel.z = hv.z;
      } else if (!this.onGround && hasMove) {
        const cur = hv.length();
        const cap = Math.max(cur, MOVE.walk * 0.9);
        hv.addScaledVector(wish, MOVE.airAccel * dt);
        const nl = hv.length();
        if (nl > cap) hv.multiplyScalar(cap / nl);
        this.vel.x = hv.x; this.vel.z = hv.z;
      }
    }

    // ---- gravity + integrate
    if (this.mode !== 'mantle') {
      const g = this.mode === 'dive' ? MOVE.gravity * 0.92 : MOVE.gravity;
      this.vel.y -= g * dt;
      const wasGround = this.onGround;
      const fallSpeed = -this.vel.y;
      const res = moveCharacter(col, this.pos, this.vel, dt, MOVE.radius, this.height, wasGround && this.vel.y <= 0.01 + g * dt);
      this.groundSurface = 'concrete';
      if (res.stepUp) this.stepOffset -= res.stepUp;
      if (res.ground) {
        if (!wasGround) this.onLand(fallSpeed);
        this.onGround = true; this.airTime = 0; this.groundTime += dt; this.wallJumps = 0;
      } else {
        if (wasGround) this.groundTime = 0;
        this.onGround = false; this.airTime += dt;
      }
      if (res.hitWall && this.mode === 'slide' && this.speedH < 2) this.endSlide();
    }

    // ---- separation from other combatants
    this.game.separate(this);

    // keep inside world
    if (this.pos.y < -20) this.game.match && this.game.match.killPlayerFall && this.game.match.killPlayerFall(this);

    this.speedH = Math.hypot(this.vel.x, this.vel.z);

    // ---- camera/eye
    let eyeT = this.mode === 'slide' ? EYE.slide : this.mode === 'dive' ? EYE.dive : (this.supine ? EYE.supine : EYE[this.stance]);
    if (this.mode === 'mantle') eyeT = EYE.crouch + 0.2;
    if (!(this.mode === 'mantle' && this.mantle && this.mantle.high)) this.eyeH = damp(this.eyeH, eyeT, this.mode === 'slide' ? 22 : this.mode === 'dive' ? 14 : 17, dt);
    this.stepOffset = damp(this.stepOffset, 0, 14, dt);
    this.landSpring.update(dt);
    this.proneW = damp(this.proneW, this.stance === 'prone' && this.mode === 'normal' ? 1 : 0, 10, dt);
    if (this.proneRollT > 0) this.proneRollT -= dt;
    this.proneSpin = damp(this.proneSpin, this.stance === 'prone' && this.supine ? this.proneRollDir * Math.PI : 0, 11, dt);
    // roll: slide lean + strafe lean
    let rollT = 0;
    if (this.mode === 'slide') rollT = this.moveInput.x !== 0 ? -this.moveInput.x * 5 : 4;
    else if (this.onGround && this.mode === 'normal') rollT = -this.moveInput.x * 0.9;
    this.rollSpring.target = rollT;
    this.rollSpring.update(dt);
    this.pitchKick.update(dt);

    // head bob & footsteps
    if (this.onGround && this.mode === 'normal' && this.speedH > 0.5) {
      const rate = this.speedH * (this.sprinting ? 1.05 : 1.2) * (this.stance === 'crouch' ? 1.2 : 1);
      this.bobPhase += rate * dt * 1.15;
      this.bobAmt = damp(this.bobAmt, clamp(this.speedH / MOVE.tac, 0, 1), 8, dt);
      const step = Math.floor(this.bobPhase / Math.PI);
      if (step !== this.lastStepPhase) {
        this.lastStepPhase = step;
        if (this.stance !== 'prone') this.game.events.emit('footstep', { entity: this, sprint: this.sprinting, surface: this.groundSurface });
      }
    } else this.bobAmt = damp(this.bobAmt, 0, 6, dt);

    // regen health
    if (this.health < this.maxHealth && t - this.lastDamage > 4.0) this.health = Math.min(this.maxHealth, this.health + 75 * dt);
  }

  canStand(st) { return hullFits(this.game.col, this.pos.x, this.pos.y, this.pos.z, MOVE.radius, H[st]); }

  // ---------------------------------------------------------------- weapon mount ("Andocken")
  // What is right in front of us? A ledge to rest the gun on, or a corner to lean out of. side: preferred side (-1, 0, 1).
  probeMount(side = 0) {
    const col = this.game.col, f = this.forwardVec(_v1), r = this.rightVec(_v2), x = this.pos.x, z = this.pos.z;
    const eye = this.pos.y + this.eyeH, reach = 0.85, h = _mh;
    const ahead = (ox, oz, y) => col.raycast(ox, y, oz, f.x, 0, f.z, reach, h);
    const chest = ahead(x, z, eye - 0.32) || ahead(x, z, eye - 0.72), atEye = ahead(x, z, eye + 0.04);
    if (chest && !atEye) {
      // something to rest the gun on: find its top
      const top = col.floorBelow(x + f.x * (chest.t + 0.12), z + f.z * (chest.t + 0.12), 0.05, eye + 0.04, eye - 0.9);
      return isFinite(top) ? { kind: 'top', side: 0, top } : null;
    }
    if (!atEye) return null;
    // a wall right in front: only a corner with free space beside it is worth anything
    const order = side ? [side, -side] : [1, -1];
    for (const s of order) {
      const sx = x + r.x * s * 0.62, sz = z + r.z * s * 0.62;
      if (col.raycast(x, eye, z, r.x * s, 0, r.z * s, 0.62, h)) continue;
      if (!ahead(sx, sz, eye)) return { kind: s < 0 ? 'left' : 'right', side: s };
    }
    return null;
  }

  updateMount(dt, input, weapon) {
    const aimHeld = input.ads, aiming = weapon && weapon.adsAmount > 0.3, toggle = input.pressed('mount');
    const free = this.mode === 'normal' && this.onGround && !this.sprinting && this.stance !== 'prone' && !this.gliding;
    const sideWish = input.down('left') ? -1 : input.down('right') ? 1 : 0;
    let m = this.mount;
    if (m) {
      m.t += dt;
      let off = (!aimHeld && !m.held) || !free || input.down('back') || input.pressed('sprint') || input.pressed('jump') || Math.abs(angleDiff(this.yaw, m.yaw)) > 1.35 || (toggle && m.t > 0.15);
      if (!off && (this.mountProbeT -= dt) <= 0) {
        this.mountProbeT = 0.08;
        const k = this.probeMount(m.side || sideWish);
        if (!k) { if ((m.lost = (m.lost || 0) + 0.08) > 0.16) off = true; }
        else { m.lost = 0; m.kind = k.kind; m.side = k.side; m.top = k.top; }
      }
      if (off) { this.mount = m = null; this.game.audio.play('magTouch', { vol: 0.25, rate: 0.8 }); }
    } else if (free && (toggle || (aiming && aimHeld && input.down('forward')))) {
      const k = this.probeMount(sideWish);
      if (k) {
        this.mount = m = { ...k, t: 0, yaw: this.yaw, held: toggle };
        this.mountProbeT = 0.08;
        this.game.audio.play('magKnock', { vol: 0.45, rate: 0.75 });
        if (weapon) weapon.vm.jolt(0, -0.05, 0.05, -0.5, 0, 0.1 * (k.side || 0));
      }
    }
    // ---- lean out, limited by what is beside us
    let leanT = 0, upT = 0;
    if (m && m.side) {
      const r = this.rightVec(_v2), hit = this.game.col.raycast(this.pos.x, this.pos.y + this.eyeH, this.pos.z, r.x * m.side, 0, r.z * m.side, 0.62, _mh);
      leanT = m.side * Math.min(0.46, hit ? Math.max(0, hit.t - 0.16) : 0.46);
    }
    if (m && m.kind === 'top') upT = clamp(m.top + 0.24 - (this.pos.y + this.eyeH), 0, 0.42);
    this.lean = damp(this.lean, leanT, 13, dt);
    this.peekUp = damp(this.peekUp, upT, 13, dt);
    this.leanRoll = damp(this.leanRoll, m && m.side ? -m.side * 0.13 : 0, 11, dt);
    const r = this.rightVec(_v2);
    this.peek.set(r.x * this.lean, this.peekUp, r.z * this.lean);
  }

  doJump() {
    if (this.mode === 'slide') {
      // slide cancel: keep momentum, refresh tac sprint (MW3 style)
      this.mode = 'normal';
      this.stance = 'stand';
      this.slideCancelT = this.game.time;
      this.tacCharge = Math.min(MOVE.tacDuration, this.tacCharge + 1.2);
      this.sprinting = true;
    }
    if (this.stance === 'crouch') { if (this.canStand('stand')) this.stance = 'stand'; else return; }
    this.vel.y = MOVE.jumpVel;
    this.onGround = false; this.airTime = MOVE.coyote + 0.01;
    this.game.events.emit('jump', { entity: this });
  }

  startSlide(dir) {
    this.mode = 'slide'; this.slideT = 0;
    this.slideDir.set(dir.x, 0, dir.z).normalize();
    const sp = Math.max(this.speedH, MOVE.sprint) * MOVE.slideBoost;
    const s = Math.min(sp, MOVE.slideMax);
    this.vel.x = this.slideDir.x * s; this.vel.z = this.slideDir.z * s;
    this.sprinting = false; this.tac = false;
    this.landSpring.impulse(-0.8);
    this.game.events.emit('slide', { entity: this });
  }
  endSlide() {
    this.mode = 'normal';
    this.stance = 'crouch';
    this.sprintBlockT = 0.05;
  }
  cancelSlide(how) {
    this.mode = 'normal';
    if (how === 'sprint' && this.canStand('stand')) { this.stance = 'stand'; this.sprinting = true; }
    else if (this.canStand('stand')) { this.stance = 'stand'; if (this.moveInput.lengthSq() > 0) this.sprinting = true; }
    else this.stance = 'crouch';
  }

  startDive(dir) {
    const d = _v6.set(dir.x, 0, dir.z);
    if (d.lengthSq() < 1e-4) this.forwardVec(d);
    d.normalize();
    // backwards dive => land supine (on your back, 360° aim)
    const fwd = this.forwardVec(_v7);
    this.diveBackward = d.dot(fwd) < -0.35;
    const sp = Math.max(MOVE.diveSpeed, Math.min(this.speedH, MOVE.slideMax) * 0.95);
    this.vel.x = d.x * sp; this.vel.z = d.z * sp; this.vel.y = MOVE.diveUp;
    this.mode = 'dive'; this.diveT = 0; this.onGround = false; this.airTime = MOVE.coyote + 0.01;
    this.sprinting = false; this.tac = false;
    // head first in the direction of travel (a backwards dive lands on the back, head leading)
    this.diveYaw = Math.atan2(-d.x, -d.z);
    this.game.events.emit('dive', { entity: this });
  }

  // Jump + crouch: the body goes flat in the air and lands already lying down. Keeps the jump's arc,
  // adds a little push if a direction is held.
  startAirDive(wish, fwd) {
    if (wish.lengthSq() > 0) {
      const sp = Math.hypot(this.vel.x, this.vel.z);
      const nsp = Math.min(MOVE.diveSpeed, sp + MOVE.airDiveBoost);
      const vx = this.vel.x / (sp || 1), vz = this.vel.z / (sp || 1);
      _v6.set(sp > 0.5 ? vx * 0.5 + wish.x * 0.5 : wish.x, 0, sp > 0.5 ? vz * 0.5 + wish.z * 0.5 : wish.z).normalize();
      this.vel.x = _v6.x * nsp; this.vel.z = _v6.z * nsp;
    }
    const sp2 = Math.hypot(this.vel.x, this.vel.z);
    const dx = sp2 > 1.5 ? this.vel.x / sp2 : fwd.x, dz = sp2 > 1.5 ? this.vel.z / sp2 : fwd.z;
    this.diveBackward = dx * fwd.x + dz * fwd.z < -0.35;
    this.diveYaw = Math.atan2(-dx, -dz);
    // the hull shrinks from below: lift the feet instead of dropping the head
    const lift = Math.min(0.5, this.eyeH - EYE.dive);
    if (lift > 0 && hullFits(this.game.col, this.pos.x, this.pos.y + lift, this.pos.z, MOVE.radius, H.dive)) { this.pos.y += lift; this.eyeH -= lift; }
    this.mode = 'dive'; this.diveT = 0.12; this.onGround = false;
    this.sprinting = false; this.tac = false; this.stance = 'stand';
    this.crouchHoldT = -1; this.standOnRelease = false;
    this.game.events.emit('dive', { entity: this });
  }

  // ---------------------------------------------------------------- lying down
  // headYaw: direction from the feet to the head. The body stays there while the view turns freely.
  goProne(headYaw, onBack = false) {
    this.stance = 'prone';
    this.proneYaw = headYaw;
    this.supine = onBack;
    this.proneRollDir = 1; this.proneSpin = onBack ? Math.PI : 0;
    this.sprinting = false; this.tac = false;
    this.crouchHoldT = -1; this.standOnRelease = false;
  }

  // Out of prone in one go (sprint pressed): up on your feet, or at least into a crouch under a low ceiling
  getUp() {
    if (this.canStand('stand')) { this.stance = 'stand'; this.getUpT = 0.14; }
    else if (this.canStand('crouch')) this.stance = 'crouch';
    else return;
    this.supine = false; this._proneSlide = 0;
  }

  updateProne(dt, fz, hasMove) {
    if (this.stance !== 'prone' || this.proneRollT > 0) return;
    // crawling turns the whole body with you
    if (hasMove && fz !== 0) {
      const want = this.supine ? this.yaw + Math.PI : this.yaw;
      this.proneYaw += clamp(angleDiff(this.proneYaw, want), -2.2 * dt, 2.2 * dt);
    }
    // look past the shoulder: roll over onto the back (legs in view); turn back: roll onto the belly
    const rel = angleDiff(this.proneYaw, this.yaw), a = Math.abs(rel);
    if (!this.supine && a > MOVE.proneRollOn) { this.proneRollDir = rel >= 0 ? 1 : -1; this.startProneRoll(true); }
    else if (this.supine && a < MOVE.proneRollOff) this.startProneRoll(false);
  }

  startProneRoll(onBack) {
    this.supine = onBack;
    this.proneRollT = 0.3;
    this.rollSpring.impulse((onBack ? 1 : -1) * this.proneRollDir * 55);
    this.landSpring.impulse(-0.5);
    this.game.events.emit('proneRoll', { entity: this });
  }

  tryWallJump(wish) {
    if (this.wallJumps >= MOVE.wallJumpMax || this.wallJumpCd > 0 || this.airTime < 0.06) return false;
    const w = probeWall(this.game.col, this.pos, MOVE.radius, this.height, 0.55, _wall);
    if (!w) return false;
    const decay = [1, 0.82, 0.64][this.wallJumps];
    // keep tangential momentum, push away from the wall, kick upward
    const vn = this.vel.x * w.nx + this.vel.z * w.nz;
    this.vel.x -= w.nx * vn; this.vel.z -= w.nz * vn;
    this.vel.x += w.nx * MOVE.wallJumpOut * decay + wish.x * 1.5;
    this.vel.z += w.nz * MOVE.wallJumpOut * decay + wish.z * 1.5;
    this.vel.y = MOVE.wallJumpUp * decay;
    this.wallJumps++; this.wallJumpCd = 0.22;
    // roll the camera away from the wall
    const right = this.rightVec(_v7);
    const side = right.x * w.nx + right.z * w.nz;
    this.rollSpring.impulse(side * 70);
    this.game.events.emit('walljump', { entity: this });
    return true;
  }

  // Mantle: climb anything with a free top within reach. manual = jump pressed. vault = sprinting into low cover.
  // The obstacle is searched along the move / look direction with horizontal rays at several heights and across
  // the width of the body, so corners, narrow crates and ledges overhead all count; then the solid stack at the
  // hit point gives the top of the ledge.
  tryMantle(wish, fwd, manual, vault = false) {
    if (this.stance === 'prone' || (this.mode !== 'normal' && this.mode !== 'slide')) return false;
    const reach = vault ? MOVE.vaultReach : this.onGround ? MOVE.climbReach : MOVE.climbReachAir;
    const low = this.onGround ? STEP_HEIGHT + 0.04 : 0.08;
    const probe = manual ? 0.55 : 0.34;
    const hasWish = wish.lengthSq() > 0;
    for (let i = 0; i < 2; i++) {
      if (i === 1 && (!manual || !hasWish)) break; // the look direction is a second chance for a pressed jump
      const dir = i === 0 && hasWish ? wish : fwd;
      const L = this.findLedge(dir, low, reach, probe, fwd, manual, vault);
      if (L) { this.startMantle(L, vault); return true; }
    }
    return false;
  }

  findLedge(dir, low, reach, probe, fwd, manual, vault) {
    const col = this.game.col, r = MOVE.radius, py = this.pos.y;
    const sx = -dir.z, sz = dir.x; // across the body
    const len = (r + probe) / 0.6;
    for (let o = 0; o < MANTLE_OFFS.length; o++) {
      const ox = this.pos.x + sx * MANTLE_OFFS[o], oz = this.pos.z + sz * MANTLE_OFFS[o];
      // test heights come from the boxes along the ray, so thin rails and slabs can't slip between samples
      const nh = col.heightsAlong(ox, oz, dir.x, dir.z, len, py + low, py + reach, _ledgeH);
      let minY = -Infinity;
      for (let i = 0; i < nh; i++) {
        const y = _ledgeH[i];
        if (y < minY) continue;
        const hit = col.raycast(ox, y, oz, dir.x, 0, dir.z, len, _ledgeHit);
        if (!hit) continue;
        const nx = hit.nx, nz = hit.nz, hx = hit.x, hz = hit.z;
        // really moving / looking at this face, and close enough to it?
        const into = -(dir.x * nx + dir.z * nz), look = -(fwd.x * nx + fwd.z * nz);
        const gap = (hx - this.pos.x) * -nx + (hz - this.pos.z) * -nz - r;
        if (into < 0.45 || look < (manual ? -0.25 : 0.15) || gap > probe) continue;
        const top = col.columnTop(hx - nx * 0.05, hz - nz * 0.05, y, py + reach + 0.02);
        if (top === Infinity) break; // this wall rises out of reach
        const L = this.ledgeAt(hx, hz, nx, nz, dir, top, vault);
        if (L) return L;
        minY = top + 0.02; // e.g. a low sill with no room above it: keep looking higher up
      }
    }
    return null;
  }

  // Can we get onto the top of the obstacle whose face was hit at (hx, hz)?
  ledgeAt(hx, hz, nx, nz, dir, top, vault) {
    const col = this.game.col, r = MOVE.radius, px = this.pos.x, py = this.pos.y, pz = this.pos.z;
    const hgt = top - py;
    // the way up has to be free: a ceiling between here and there means this is the floor above, not a ledge
    const rr = r * 0.85, head = py + this.height - 0.02, up = Math.max(py, top) + H.slide;
    if (up > head && col.overlaps(px - rr, head, pz - rr, px + rr, up, pz + rr)) return null;
    // the floor right in front of the face: just a stair step or curb is not a ledge
    const fy = col.floorBelow(hx + nx * 0.06, hz + nz * 0.06, 0.04, top - 0.02, py - 4);
    if (top - fy < STEP_HEIGHT + 0.03) return null;
    // room to come up beside the wall?
    if (!hullFits(col, px, Math.max(py, top), pz, r * 0.85, H.slide)) return null;
    // climb straight over the edge, with a little of the run-up direction
    let ax = -nx * 0.75 + dir.x * 0.25, az = -nz * 0.75 + dir.z * 0.25;
    const al = Math.hypot(ax, az); ax /= al; az /= al;
    // keep inside the playable area
    const bd = this.game.mapDef && this.game.mapDef.bounds;
    const out = bd ? (x, z) => x < bd.minX || x > bd.maxX || z < bd.minZ || z > bd.maxZ : () => false;
    const base = { ex: hx, ez: hz, ax, az, sx: -az, sz: ax, top, hgt };

    // ---- thin and low: vault to the far side
    if (hgt <= MOVE.vaultOverMax) {
      let depth = -1;
      for (let d = 0.1; d < 0.95; d += 0.08) {
        if (col.columnTop(hx + ax * d, hz + az * d, top - 0.03, top + 0.02) < top - 0.02) { depth = d; break; }
      }
      if (depth > 0 && hullFits(col, hx + ax * depth * 0.5, top + 0.02, hz + az * depth * 0.5, r * 0.8, H.slide)) {
        const lx = hx + ax * (depth + r + 0.12), lz = hz + az * (depth + r + 0.12);
        const ly = col.floorBelow(lx, lz, r * 0.7, top + 0.1, top - 3);
        if (isFinite(ly) && top - ly <= 2.6 && !out(lx, lz) && hullFits(col, lx, ly, lz, r, H.crouch)) {
          return { ...base, tx: lx, ty: ly, tz: lz, over: true, standOk: hullFits(col, lx, ly, lz, r, H.stand) };
        }
      }
    }
    if (vault && hgt > MOVE.vaultReach) return null;

    // ---- climb on top: first spot past the edge with room and something to stand on
    for (let i = 0; i < MANTLE_LAND.length; i++) {
      const t = r + MANTLE_LAND[i];
      const tx = hx + ax * t, tz = hz + az * t;
      if (out(tx, tz)) continue;
      if (!hullFits(col, tx, top, tz, r, H.crouch)) continue;
      if (col.floorBelow(tx, tz, r * 0.95, top + 0.02, top - 0.05) < top - 0.03) continue;
      if (!hullFits(col, (px + tx) / 2, Math.max(py, top), (pz + tz) / 2, r * 0.85, H.slide)) continue;
      return { ...base, tx, ty: top, tz, over: false, standOk: hullFits(col, tx, top, tz, r, H.stand) };
    }
    return null;
  }

  startMantle(L, vault) {
    const hgt = L.hgt;
    // the edge is at eye level or above: no way to do that one-handed
    const high = !L.over && L.top > this.pos.y + this.eyeH - 0.1;
    const dur = L.over ? 0.3 + Math.max(0, hgt) * 0.14 : high ? 0.62 + hgt * 0.09 : 0.22 + Math.max(0, hgt) * 0.13;
    this.mantle = {
      ...L, t: 0, k: 0, dur, high, sx0: this.pos.x, sy0: this.pos.y, sz0: this.pos.z, e0: this.pos.y + this.eyeH,
      lookUp: high ? clamp((L.top - (this.pos.y + this.eyeH)) * 0.42, 0, 0.42) : 0,
      keepSprint: this.sprinting || vault, keepTac: this.tac, grabbed: false, pushed: false,
    };
    this.mode = 'mantle';
    this.vel.set(0, 0, 0);
    this.sprinting = false; this.tac = false;
    this.crouchHoldT = -1; this.standOnRelease = false;
    this.game.events.emit('mantle', { entity: this, height: hgt });
  }

  updateMantle(dt) {
    const m = this.mantle;
    m.t += dt;
    const k = m.k = Math.min(1, m.t / m.dur);
    if (m.over) {
      // arc over the obstacle and land running on the far side
      const fw = k * k * (3 - 2 * k) * 0.35 + k * 0.65;
      this.pos.x = lerp(m.sx0, m.tx, fw);
      this.pos.z = lerp(m.sz0, m.tz, fw);
      const peak = m.top + 0.02;
      this.pos.y = k < 0.5 ? lerp(m.sy0, peak, smooth(k / 0.5)) : lerp(peak, m.ty, Math.pow((k - 0.5) / 0.5, 2));
    } else if (m.high) {
      // both hands on the edge: a hop to reach it, pull the chest up to the edge, then over it and up.
      // The eye follows its own curve (world height), the feet just have to end up on the ledge.
      const pull = smooth(clamp((k - 0.12) / 0.58, 0, 1));
      const e1 = m.top + 0.36, e2 = m.top + 1.2;
      let eye = k < 0.7 ? lerp(m.e0, e1, pull) : lerp(e1, e2, smooth((k - 0.7) / 0.3));
      eye -= Math.sin(clamp(k / 0.12, 0, 1) * Math.PI) * 0.05;
      this.pos.y = lerp(m.sy0, m.ty, smooth(clamp((k - 0.1) / 0.62, 0, 1)));
      const fw = smooth(clamp((k - 0.6) / 0.4, 0, 1));
      this.pos.x = lerp(m.sx0, m.tx, fw);
      this.pos.z = lerp(m.sz0, m.tz, fw);
      this.eyeH = eye - this.pos.y;
      // look up at the edge, heave, dip over it
      this.mantleP = m.lookUp * Math.sin(clamp(k / 0.5, 0, 1) * Math.PI) - 0.3 * Math.sin(clamp((k - 0.5) / 0.5, 0, 1) * Math.PI);
      this.mantleR = 0.04 * Math.sin(clamp((k - 0.18) / 0.62, 0, 1) * Math.PI * 2);
      if (!m.grabbed && k > 0.26) { m.grabbed = true; this.landSpring.impulse(-0.5); this.game.events.emit('mantleGrab', { entity: this, strength: 1 }); }
      if (!m.pushed && k > 0.72) { m.pushed = true; this.game.events.emit('mantleGrab', { entity: this, strength: 0.6 }); }
    } else {
      const up = smooth(Math.min(1, k / 0.65));
      const fw = smooth(Math.max(0, (k - 0.35) / 0.65));
      this.pos.x = lerp(m.sx0, m.tx, fw);
      this.pos.z = lerp(m.sz0, m.tz, fw);
      this.pos.y = lerp(m.sy0, m.ty, up);
    }
    if (k >= 1) {
      this.mode = 'normal';
      this.stance = m.standOk ? 'stand' : 'crouch';
      this.pos.set(m.tx, m.ty + 0.005, m.tz);
      this.onGround = true; this.airTime = 0;
      const f = this.forwardVec(_v7);
      const sp = m.keepSprint ? MOVE.sprint : MOVE.walk * 0.8;
      this.vel.set(f.x * sp, 0, f.z * sp);
      if (m.keepSprint) { this.sprinting = true; this.tac = m.keepTac; }
      this.landSpring.impulse(-0.6);
      this.mantleP = 0; this.mantleR = 0;
      this.mantle = null;
    }
  }

  onLand(fallSpeed) {
    const s = clamp((fallSpeed - 2) / 10, 0, 1);
    this.landSpring.impulse(-0.4 - s * 2.4);
    if (fallSpeed > 3) this.game.events.emit('land', { strength: s, surface: this.groundSurface, entity: this });
    // fall damage only for big drops
    if (fallSpeed > 14) this.game.damagePlayerFall && this.game.damagePlayerFall(this, (fallSpeed - 14) * 18);
  }

  // simplified hitboxes for bots shooting at the player
  getHitboxes(out) {
    out.length = 0;
    const x = this.pos.x, y = this.pos.y, z = this.pos.z;
    const hb = this._hb || (this._hb = { h: { type: 'sphere', part: 'head', c: new THREE.Vector3(), r: 0.14 },
      c: { type: 'capsule', part: 'chest', a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.21 },
      s: { type: 'capsule', part: 'stomach', a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.2 },
      l: { type: 'capsule', part: 'limb', a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.17 } });
    if (this.stance === 'prone' && this.mode === 'normal') {
      // lying along the body axis, neck at the hull center
      const b = this.proneYaw, fx = -Math.sin(b), fz = -Math.cos(b), yy = y + 0.2;
      hb.h.c.set(x + fx * 0.1, yy + 0.05, z + fz * 0.1);
      hb.c.a.set(x - fx * 0.32, yy, z - fz * 0.32); hb.c.b.set(x, yy, z);
      hb.s.a.set(x - fx * 0.62, yy, z - fz * 0.62); hb.s.b.set(x - fx * 0.32, yy, z - fz * 0.32);
      hb.l.a.set(x - fx * 1.55, yy - 0.05, z - fz * 1.55); hb.l.b.set(x - fx * 0.62, yy - 0.05, z - fz * 0.62);
    } else if (this.mode === 'dive') {
      const f = this.forwardVec(_v7);
      const yy = y + 0.6;
      hb.h.c.set(x + f.x * 0.75, yy + 0.05, z + f.z * 0.75);
      hb.c.a.set(x + f.x * 0.1, yy, z + f.z * 0.1); hb.c.b.set(x + f.x * 0.55, yy, z + f.z * 0.55);
      hb.s.a.set(x - f.x * 0.3, yy, z - f.z * 0.3); hb.s.b.set(x + f.x * 0.1, yy, z + f.z * 0.1);
      hb.l.a.set(x - f.x * 1.1, yy - 0.05, z - f.z * 1.1); hb.l.b.set(x - f.x * 0.3, yy - 0.05, z - f.z * 0.3);
    } else {
      const e = this.eyeH;
      const px = this.peek.x, pz = this.peek.z, pu = this.peekUp;
      hb.h.c.set(x + px, y + e + 0.04 + pu, z + pz);
      hb.c.a.set(x + px * 0.4, y + e * 0.66, z + pz * 0.4); hb.c.b.set(x + px * 0.9, y + e - 0.2 + pu, z + pz * 0.9);
      hb.s.a.set(x, y + e * 0.48, z); hb.s.b.set(x, y + e * 0.66, z);
      hb.l.a.set(x, y + 0.12, z); hb.l.b.set(x, y + e * 0.48, z);
    }
    out.push(hb.h, hb.c, hb.s, hb.l);
    return out;
  }

  // look input in radians
  look(dYaw, dPitch) {
    this.yaw -= dYaw;
    const lim = this.supine ? 80 * DEG : 88 * DEG;
    this.pitch = clamp(this.pitch - dPitch, -lim, lim);
  }

  // ---------------------------------------------------------------- camera
  applyCamera(cam, recoil, shake) {
    const eye = this.pos.y + this.eyeH + this.stepOffset + this.landSpring.x * 0.3;
    let bobY = 0, bobX = 0;
    if (this.bobAmt > 0.01) {
      bobY = Math.abs(Math.sin(this.bobPhase)) * 0.028 * this.bobAmt;
      bobX = Math.sin(this.bobPhase) * 0.014 * this.bobAmt;
    }
    const r = this.rightVec(_v7);
    cam.position.set(this.pos.x + r.x * bobX + this.peek.x, eye + bobY + this.peekUp, this.pos.z + r.z * bobX + this.peek.z);
    const pitch = this.pitch + this.mantleP + (recoil ? recoil.pitch : 0) + this.pitchKick.x + this.landSpring.x * 0.012 + (shake ? shake.sample(1) * 0.025 : 0);
    const yaw = this.yaw + (recoil ? recoil.yaw : 0) + (shake ? shake.sample(2) * 0.025 : 0);
    const roll = this.rollSpring.x * DEG + this.mantleR + this.leanRoll + (shake ? shake.sample(3) * 0.03 : 0);
    cam.rotation.set(pitch, yaw, roll, 'YXZ');
  }
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3(), _v7 = new THREE.Vector3();
const _wall = {}, _ledgeHit = {}, _ledgeH = [], _mh = {};
const MANTLE_OFFS = [0, 0.2, -0.2];            // across the body
const MANTLE_LAND = [0.1, 0.02, -0.08, -0.18]; // how far the hull ends up past the edge
export { H as HULL, EYE };
export { angleDiff, STEP_HEIGHT };
