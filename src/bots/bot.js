import * as THREE from 'three';
import { moveCharacter, hullFits, probeWall } from '../player/physics.js';
import { Soldier } from '../characters/soldier.js';
import { WEAPONS } from '../weapons/defs.js';
import { clamp, damp, lerp, rand, angleDiff, wrapAngle, DEG, smooth } from '../core/math.js';

// =============================================================================
// Bot combatant: navigation, perception (FOV + line of sight + hearing),
// human-like aiming (reaction time, flick error that settles, recoil drift),
// combat movement (strafing, crouch spam, sliding in, cover when hurt),
// weapon handling (bursts, reloads) - all tuned per difficulty.
// =============================================================================

export const DIFFICULTY = {
  recruit: { reaction: [0.55, 0.85], turn: 220, err: 6.5, settle: 1.0, head: 0.06, fov: 100, hear: 35, strafe: 0.45, slide: 0.0, crouch: 0.05, think: 0.24, comp: 0.35, burst: [2, 5], spreadMul: 1.6, view: 70 },
  regular: { reaction: [0.3, 0.48], turn: 400, err: 3.6, settle: 0.52, head: 0.14, fov: 110, hear: 50, strafe: 0.75, slide: 0.12, crouch: 0.12, think: 0.18, comp: 0.55, burst: [3, 7], spreadMul: 1.25, view: 85 },
  hardened: { reaction: [0.22, 0.38], turn: 520, err: 2.8, settle: 0.42, head: 0.22, fov: 120, hear: 60, strafe: 0.92, slide: 0.28, crouch: 0.2, think: 0.13, comp: 0.75, burst: [4, 10], spreadMul: 1.05, view: 100 },
  elite: { reaction: [0.15, 0.27], turn: 700, err: 1.9, settle: 0.3, head: 0.32, fov: 130, hear: 70, strafe: 1.0, slide: 0.42, crouch: 0.3, think: 0.1, comp: 0.9, burst: [5, 14], spreadMul: 0.9, view: 120 },
};

const SPEED = { walk: 5.2, sprint: 7.5, tac: 9.0, crouch: 3.0, ads: 3.0 };
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();

export class Bot {
  constructor(game, opts) {
    this.game = game;
    this.isBot = true;
    this.name = opts.name;
    this.team = opts.team;
    this.D = DIFFICULTY[opts.difficulty] || DIFFICULTY.regular;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.aimYaw = 0; this.aimPitch = 0;
    this.errYaw = 0; this.errPitch = 0;
    this.soldier = new Soldier(game, opts.outfit);
    this.kills = 0; this.deaths = 0; this.score = 0; this.lastRadar = -99;
    this.alive = false; this.health = 150; this.maxHealth = 150;
    this.lastDamage = -99; this.lastAttacker = null;
    this.hb = []; this.hbFrame = -1;
    this.setWeapon(opts.weapon);
    this.thinkT = Math.random() * 0.2;
    this.footPhase = 0;
  }

  setWeapon(id) {
    this.wdef = WEAPONS[id];
    const optic = this.wdef.optics.includes('reflex') ? 'reflex' : this.wdef.optics[0];
    this.soldier.setWeapon(this.wdef, optic);
    this.mag = this.wdef.mag;
    // preferred engagement distances per weapon class
    this.prefDist = { smg: 8, pdw: 7, shotgun: 5, autoshot: 6, ar: 16, burst: 18, lmg: 22, dmr: 28, sniper: 38, amr: 42 }[id] || 15;
  }

  get eyeH() { return this.downed ? 0.42 : this.prone ? 0.3 : this.crouching ? 1.12 : 1.6; }
  eyePos(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.eyeH, this.pos.z); }

  spawn(x, y, z, yaw) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0);
    this.aimYaw = yaw; this.aimPitch = 0;
    this.alive = true; this.health = this.maxHealth;
    this.mag = this.wdef.mag; this.reloadT = 0;
    this.target = null; this.lastSeen = null; this.lastSeenT = -99; this.reactT = 0;
    this.state = 'roam'; this.path = null; this.wp = 0; this.goal = -1; this.repathT = 0;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1; this.strafeT = 0;
    this.crouching = false; this.crouchT = 0; this.sliding = 0; this.mantling = null;
    this.burst = 0; this.burstPause = 0; this.nextShot = 0;
    this.stuckT = 0; this.lastProgress = this.pos.clone();
    this.onGround = true; this.sprinting = false; this.tac = false;
    this.heard = null; this.heardT = -99;
    this.soldier.resetPose(); this.soldier.root.position.copy(this.pos);
    this.soldier.setVisible(true);
    if (this.soldier.weaponDrop) { this.game.scene.remove(this.soldier.weaponDrop.obj); this.soldier.weaponDrop = null; this.soldier.setWeapon(this.wdef, this.wdef.optics.includes('reflex') ? 'reflex' : this.wdef.optics[0]); }
  }

  getHitboxes(out) {
    if (this.hbFrame !== this.game.frameId) { this.soldier.hitboxes(this.hb); this.hbFrame = this.game.frameId; }
    out.length = 0; for (const h of this.hb) out.push(h);
    return out;
  }

  onDamaged(dmg, attacker) {
    this.soldier.flinchHit(Math.min(1.5, dmg / 40));
    // getting shot ruins your aim a bit
    this.errYaw += rand(-1.2, 1.2) * DEG; this.errPitch += rand(-1, 1) * DEG;
    if (attacker && attacker !== this && (!this.target || !this.targetVisible)) {
      this.heard = attacker.pos.clone(); this.heardT = this.game.time;
      // instinctively turn toward the attacker
      this.alertYaw = Math.atan2(-(attacker.pos.x - this.pos.x), -(attacker.pos.z - this.pos.z));
    }
  }

  onKilled(killer, info) {
    this.alive = false;
    this.deathT = this.game.time;
    const w = info && info.weapon;
    let strength = w ? Math.min(7, 2.2 + (w.damage[0] * (w.pellets || 1)) / 40) : 3;
    if (info && info.part === 'head') strength *= 1.15;
    if (info && info.strength) strength = info.strength;
    this.soldier.die(info && info.dir ? info.dir : new THREE.Vector3(0, 0, 1), { part: info && info.part, point: info && info.point, strength, vel: this.vel.clone(), staged: info && info.staged });
  }

  // called by the game when someone fires (hearing)
  hear(pos, shooter) {
    if (!this.alive || shooter === this || this.game.isFriendly(shooter, this)) return;
    const d = pos.distanceTo(this.pos);
    if (d > this.D.hear) return;
    if (!this.target || !this.targetVisible) { this.heard = pos.clone(); this.heardT = this.game.time; }
  }

  // ------------------------------------------------------------------ perception
  perceive() {
    const g = this.game, D = this.D;
    const eye = this.eyePos(_v);
    let best = null, bestScore = -Infinity;
    for (const c of g.combatants) {
      if (c === this || !c.alive || g.isFriendly(c, this)) continue;
      const dx = c.pos.x - this.pos.x, dz = c.pos.z - this.pos.z, dy = c.pos.y - this.pos.y;
      const dist = Math.hypot(dx, dy, dz);
      const shotBy = c === this.lastAttacker && g.time - this.lastDamage < 5;
      if (dist > (shotBy ? Math.max(D.view, 110) : D.view) || (this.ignores && this.ignores(c, dist))) continue;
      const yawTo = Math.atan2(-dx, -dz);
      const off = Math.abs(angleDiff(this.aimYaw, yawTo));
      const recentAttacker = c === this.lastAttacker && g.time - this.lastDamage < 2.5;
      const known = c === this.target && g.time - this.lastSeenT < 1.2;
      if (!(off < D.fov * 0.5 * DEG || dist < 4 || recentAttacker || known)) continue;
      // line of sight to head or chest
      const ch = c.isPlayer ? c.eyeH : c.eyeH;
      const px = c.peek ? c.peek.x : 0, pz = c.peek ? c.peek.z : 0;
      const vis = g.col.lineClear(eye.x, eye.y, eye.z, c.pos.x + px, c.pos.y + ch, c.pos.z + pz) || g.col.lineClear(eye.x, eye.y, eye.z, c.pos.x, c.pos.y + ch * 0.6, c.pos.z);
      if (!vis) continue;
      // a crouched / prone target far away is harder to notice on first glance
      if (!known && !recentAttacker) {
        const low = c.isPlayer && (c.stance === 'prone' || c.supine) ? 0.35 : c.isPlayer && c.stance === 'crouch' ? 0.7 : 1;
        const noticeChance = clamp((1.4 - dist / D.view) * low * (off < 20 * DEG ? 1.3 : 0.8), 0.15, 1);
        if (Math.random() > noticeChance) continue;
      }
      const score = -dist - off * 6 + (known ? 25 : 0) + (recentAttacker ? 18 : 0) + (this.targetBias ? this.targetBias(c, dist) : 0);
      if (score > bestScore) { bestScore = score; best = c; }
    }
    const t = g.time;
    if (best) {
      if (best !== this.target || t - this.lastSeenT > 1.5) {
        // new contact: reaction time + initial aim error proportional to the flick
        const dist = best.pos.distanceTo(this.pos);
        this.reactT = rand(D.reaction[0], D.reaction[1]) * (dist > 35 ? 1.25 : 1) * (best === this.lastAttacker ? 0.75 : 1);
        const yawTo = Math.atan2(-(best.pos.x - this.pos.x), -(best.pos.z - this.pos.z));
        const flick = Math.abs(angleDiff(this.aimYaw, yawTo));
        const e = (D.err + flick / DEG * 0.08) * DEG;
        const a = Math.random() * Math.PI * 2;
        this.errYaw = Math.cos(a) * e; this.errPitch = Math.sin(a) * e * 0.6;
        this.aimHead = Math.random() < D.head;
        if (this.state !== 'engage' && this.sprinting && dist < 16 && Math.random() < D.slide) this.startSlide();
      }
      this.target = best; this.targetVisible = true;
      this.lastSeen = best.pos.clone(); this.lastSeenT = t;
    } else {
      this.targetVisible = false;
      if (this.target && (!this.target.alive || t - this.lastSeenT > 6)) this.target = null;
    }
  }

  // ------------------------------------------------------------------ decisions
  think() {
    const g = this.game, t = g.time;
    this.perceive();
    const hurt = this.health < this.maxHealth * 0.45;
    if (this.target && this.targetVisible) {
      if (hurt && this.state !== 'cover' && Math.random() < 0.5 && this.findCover()) this.state = 'cover';
      else if (this.state !== 'cover') this.state = 'engage';
    } else if (this.state === 'cover') {
      if (this.health > this.maxHealth * 0.85 || t - this.coverT > 7) this.state = 'roam';
    } else if (this.target && this.lastSeen) {
      if (this.state !== 'chase') { this.state = 'chase'; this.pathTo(this.lastSeen); }
    } else if (this.heard && t - this.heardT < 8) {
      if (this.state !== 'investigate' || this.repathT <= 0) { this.state = 'investigate'; this.pathTo(this.heard); this.repathT = 3; }
    } else if (this.state !== 'roam') { this.state = 'roam'; this.path = null; }

    if (this.state === 'roam' && (!this.path || this.wp >= this.path.length)) this.pickRoamGoal();
    if (this.state === 'engage') {
      // reposition when the enemy is out of our weapon's comfort zone
      const d = this.target.pos.distanceTo(this.pos);
      this.wantClose = d > this.prefDist * 1.6;
      this.wantBack = d < this.prefDist * 0.4 && (this.wdef.id === 'sniper' || this.wdef.id === 'amr' || this.wdef.id === 'lmg' || this.wdef.id === 'dmr');
      if (this.wantClose && (this.repathT <= 0 || !this.path)) { this.pathTo(this.target.pos); this.repathT = 1.5; }
    }
    if (this.state === 'chase' && this.path && this.wp >= this.path.length) {
      // arrived where we last saw them: look around, then go back to roaming
      this.target = null; this.state = 'roam'; this.path = null;
      this.aimYaw += rand(-1.5, 1.5);
    }
  }

  pickRoamGoal() {
    const g = this.game, nav = g.nav;
    let goalPos = null;
    // prefer hotspots, biased toward the enemy side / recent action
    const hs = g.mapDef.hotspots;
    if (g.recentAction && g.time - g.recentAction.t < 10 && Math.random() < 0.55) goalPos = g.recentAction.pos;
    else if (hs && Math.random() < 0.75) { const h = hs[(Math.random() * hs.length) | 0]; goalPos = new THREE.Vector3(h[0] + rand(-3, 3), h[1], h[2] + rand(-3, 3)); }
    else { const n = nav.randomNode(); goalPos = new THREE.Vector3(nav.X[n], nav.Y[n], nav.Z[n]); }
    this.pathTo(goalPos);
  }

  pathTo(p) {
    const nav = this.game.nav;
    const s = nav.nearest(this.pos.x, this.pos.y, this.pos.z);
    const e = nav.nearest(p.x, p.y, p.z, 6);
    const path = nav.findPath(s, e);
    this.path = path ? nav.toWaypoints(path) : null;
    this.wp = this.path && this.path.length > 1 ? 1 : 0;
    this.repathT = 3 + Math.random() * 2;
  }

  // nearest nav node within ~12m that the current enemy can't see
  findCover() {
    const g = this.game, nav = g.nav, tgt = this.target;
    if (!tgt) return false;
    const ex = tgt.pos.x, ey = tgt.pos.y + 1.5, ez = tgt.pos.z;
    let best = -1, bd = Infinity;
    for (let k = 0; k < 26; k++) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 10;
      const n = nav.nearest(this.pos.x + Math.cos(a) * r, this.pos.y, this.pos.z + Math.sin(a) * r, 3);
      if (n < 0) continue;
      const x = nav.X[n], y = nav.Y[n] + 1.0, z = nav.Z[n];
      if (g.col.lineClear(ex, ey, ez, x, y, z)) continue;
      const d = Math.hypot(x - this.pos.x, z - this.pos.z) - Math.hypot(x - ex, z - ez) * 0.3;
      if (d < bd) { bd = d; best = n; }
    }
    if (best < 0) return false;
    this.pathTo(new THREE.Vector3(nav.X[best], nav.Y[best], nav.Z[best]));
    this.coverT = g.time;
    return true;
  }

  startSlide() {
    if (this.sliding > 0 || !this.onGround) return;
    this.sliding = 0.7;
    const f = _d.set(-Math.sin(this.moveYaw || this.aimYaw), 0, -Math.cos(this.moveYaw || this.aimYaw));
    this.vel.x = f.x * 10.5; this.vel.z = f.z * 10.5;
    this.game.events.emit('slide', { entity: this });
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    const g = this.game;
    if (!this.alive) { this.soldier.update(dt, this.animState(), this.pos); return; }
    const D = this.D, t = g.time;
    this.thinkT -= dt;
    this.repathT -= dt;
    if (this.thinkT <= 0) { this.thinkT = D.think * rand(0.8, 1.2); this.think(); }

    // ---- desired movement
    let wish = _u.set(0, 0, 0), speed = 0;
    this.sprinting = false; this.tac = false;
    const engaging = this.state === 'engage' && this.target && this.targetVisible;
    if (engaging) {
      // strafe around the target, optionally closing/opening distance along a path
      this.strafeT -= dt;
      if (this.strafeT <= 0) {
        this.strafeDir = Math.random() < 0.5 ? -1 : 1;
        this.strafeT = rand(0.35, 1.1);
        this.strafing = Math.random() < D.strafe;
        if (Math.random() < D.crouch) { this.crouchT = rand(0.25, 0.8); }
      }
      const toT = _d.set(this.target.pos.x - this.pos.x, 0, this.target.pos.z - this.pos.z).normalize();
      _r.set(-toT.z, 0, toT.x);
      if (this.strafing) wish.addScaledVector(_r, this.strafeDir);
      if (this.wantClose && this.path && this.wp < this.path.length) wish.add(this.followPath(dt).multiplyScalar(1.3));
      else if (this.wantBack) wish.addScaledVector(toT, -0.8);
      speed = this.reloadT > 0 ? SPEED.walk : (this.wdef.id === 'smg' || this.wdef.id === 'pdw' || this.wdef.pellets ? SPEED.walk : SPEED.ads + 0.6);
      if (this.crouchT > 0) { this.crouchT -= dt; speed = SPEED.crouch * 0.6; }
    } else if (this.path && this.wp < this.path.length) {
      wish.copy(this.followPath(dt));
      this.sprinting = true;
      this.tac = this.sprinting && this.state === 'roam' && ((t * 0.3 + this.name.length) % 7) < 2.5;
      speed = this.tac ? SPEED.tac : SPEED.sprint;
      if (this.state === 'investigate' || this.state === 'chase') speed = SPEED.sprint;
    } else if (this.state === 'cover') {
      this.crouchT = 0.3; speed = 0;
    }
    if (this.prone) { wish.set(0, 0, 0); speed = 0; this.sprinting = false; this.tac = false; }
    if (wish.lengthSq() > 1e-4) {
      wish.normalize();
      this.moveYaw = Math.atan2(-wish.x, -wish.z);
      // edge safety: don't strafe off ledges / into the void
      if (engaging && !this.groundAhead(wish)) { wish.set(0, 0, 0); this.strafeDir *= -1; }
    }
    this.crouching = this.crouchT > 0 || this.state === 'cover';

    // ---- physics
    if (this.mantling) this.updateMantle(dt);
    else {
      if (this.sliding > 0) {
        this.sliding -= dt;
        const sp = Math.hypot(this.vel.x, this.vel.z);
        const ns = Math.max(0, sp - (this.sliding < 0.45 ? 9 : 1) * dt);
        if (sp > 0.01) { this.vel.x *= ns / sp; this.vel.z *= ns / sp; }
      } else if (this.onGround) {
        const tx = wish.x * speed, tz = wish.z * speed;
        const a = 40 * dt;
        let dx = tx - this.vel.x, dz = tz - this.vel.z;
        const dl = Math.hypot(dx, dz);
        if (dl > a) { dx *= a / dl; dz *= a / dl; }
        this.vel.x += dx; this.vel.z += dz;
      }
      this.vel.y -= 19.5 * dt;
      const wasGround = this.onGround;
      const res = moveCharacter(g.col, this.pos, this.vel, dt, 0.25, this.prone ? 0.7 : this.crouching || this.sliding > 0 ? 1.2 : 1.8, wasGround);
      this.onGround = res.ground;
      if (res.hitWall && this.path && !engaging) this.handleBlocked(wish);
      g.separate(this);
      if (this.pos.y < -15) { this.health = 0; g.kill(this, null, {}); return; }
    }

    // ---- stuck detection
    this.stuckT += dt;
    if (this.stuckT > 1.2) {
      const moved = this.pos.distanceTo(this.lastProgress);
      if (moved < 0.6 && wish.lengthSq() > 0 && !engaging) {
        if (this.onGround) { this.vel.y = 6.2; this.vel.x += rand(-2, 2); this.vel.z += rand(-2, 2); }
        if (moved < 0.2) { this.path = null; this.pickRoamGoal(); }
      }
      this.stuckT = 0; this.lastProgress.copy(this.pos);
    }

    // ---- aim
    this.updateAim(dt, engaging);
    // ---- weapon
    this.updateWeapon(dt, engaging);
    if (this.meleeT > 0) this.meleeT -= dt;
    // ---- health regen
    if (this.health < this.maxHealth && t - this.lastDamage > 4.5) this.health = Math.min(this.maxHealth, this.health + 70 * dt);
    // ---- footsteps
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && sp > 2.2 && this.sliding <= 0) {
      this.footPhase += sp * dt / 1.6;
      if (this.footPhase > 1) { this.footPhase -= 1; g.events.emit('footstep', { entity: this, sprint: sp > 6 }); }
    }
    // ---- animation (far away bots update less often)
    this._animC = (this._animC || 0) + 1;
    if (this._animC >= (this.animEvery || 1)) { this.soldier.update(dt * this._animC, this.animState(), this.pos); this._animC = 0; }
    else this.soldier.root.position.copy(this.pos);
  }

  groundAhead(dir) {
    const col = this.game.col;
    const x = this.pos.x + dir.x * 0.9, z = this.pos.z + dir.z * 0.9;
    const f = col.floorBelow(x, z, 0.15, this.pos.y + 0.5, this.pos.y - 1.2);
    return isFinite(f);
  }

  followPath(dt) {
    const p = this.path[this.wp];
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    // jump / mantle links
    if (p.type === 2 && d < 1.3 && p.y - this.pos.y > 0.45 && this.onGround) this.startMantle(p);
    if (d < 0.55 && Math.abs(p.y - this.pos.y) < 1.4) { this.wp++; this.stuckT = 0; this.lastProgress.copy(this.pos); }
    void dt;
    return _v.set(dx, 0, dz).normalize();
  }

  handleBlocked() {
    const p = this.path && this.path[this.wp];
    if (p && p.y - this.pos.y > 0.45 && p.y - this.pos.y < 1.4 && this.onGround) this.startMantle(p);
  }

  startMantle(p) {
    const tx = this.pos.x + (p.x - this.pos.x) * 0.6, tz = this.pos.z + (p.z - this.pos.z) * 0.6;
    const top = this.game.col.floorBelow(tx, tz, 0.15, p.y + 0.3, this.pos.y);
    if (!isFinite(top) || top - this.pos.y < 0.3) return;
    if (!hullFits(this.game.col, tx, top, tz, 0.3, 1.2)) return;
    this.mantling = { t: 0, dur: 0.3 + (top - this.pos.y) * 0.15, sx: this.pos.x, sy: this.pos.y, sz: this.pos.z, tx, ty: top + 0.01, tz };
    this.vel.set(0, 0, 0);
  }
  updateMantle(dt) {
    const m = this.mantling;
    m.t += dt;
    const k = Math.min(1, m.t / m.dur);
    this.pos.x = lerp(m.sx, m.tx, smooth(Math.max(0, (k - 0.35) / 0.65)));
    this.pos.z = lerp(m.sz, m.tz, smooth(Math.max(0, (k - 0.35) / 0.65)));
    this.pos.y = lerp(m.sy, m.ty, smooth(Math.min(1, k / 0.65)));
    if (k >= 1) { this.mantling = null; this.onGround = true; }
  }

  updateAim(dt, engaging) {
    const D = this.D;
    let ty = this.aimYaw, tp = 0;
    if (engaging) {
      const tg = this.target;
      const hy = tg.isPlayer ? tg.eyeH : tg.eyeH;
      const aimY = tg.pos.y + (this.aimHead ? hy + 0.02 : hy * 0.68);
      const dx = tg.pos.x + (tg.peek ? tg.peek.x : 0) - this.pos.x, dz = tg.pos.z + (tg.peek ? tg.peek.z : 0) - this.pos.z, dy = aimY - (this.pos.y + this.eyeH);
      ty = Math.atan2(-dx, -dz);
      tp = Math.atan2(dy, Math.hypot(dx, dz));
    } else if (this.alertYaw !== undefined && this.game.time - this.lastDamage < 1.5) {
      ty = this.alertYaw;
    } else if (this.target && this.lastSeen && this.game.time - this.lastSeenT < 3) {
      ty = Math.atan2(-(this.lastSeen.x - this.pos.x), -(this.lastSeen.z - this.pos.z));
    } else if (this.moveYaw !== undefined && Math.hypot(this.vel.x, this.vel.z) > 1) {
      ty = this.moveYaw;
    }
    // turn with a speed limit and a little easing
    const dyaw = angleDiff(this.aimYaw, ty);
    const maxT = D.turn * DEG * dt * (engaging ? 1 : 0.7);
    this.aimYaw = wrapAngle(this.aimYaw + clamp(dyaw * Math.min(1, dt * 14), -maxT, maxT));
    this.aimPitch += clamp((tp - this.aimPitch) * Math.min(1, dt * 12), -maxT, maxT);
    // aim error settles over time (tracking), target movement adds error
    const settle = Math.exp(-dt / D.settle);
    this.errYaw *= settle; this.errPitch *= settle;
    if (engaging) {
      const tv = this.target.vel ? Math.hypot(this.target.vel.x, this.target.vel.z) : 0;
      const dist = Math.max(3, this.target.pos.distanceTo(this.pos));
      const jitter = (D.err * 0.12 + tv * 0.25 / dist * 8) * DEG;
      this.errYaw += (Math.random() - 0.5) * jitter * dt * 12;
      this.errPitch += (Math.random() - 0.5) * jitter * dt * 8;
    }
  }

  updateWeapon(dt, engaging) {
    const g = this.game, def = this.wdef, D = this.D;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.mag = def.mag;
      return;
    }
    if (this.mag <= 0) { this.reloadT = this.reloadTotal = def.reload * 1.1 + (def.reloadStyle === 'shell' ? def.mag * def.reload : 0); g.events.emit('reload', { entity: this }); return; }
    if (!engaging) {
      if (this.mag < def.mag * 0.4 && this.game.time - this.lastSeenT > 2.5) { this.reloadT = this.reloadTotal = def.reload * 1.1 + (def.reloadStyle === 'shell' ? (def.mag - this.mag) * def.reload : 0); }
      return;
    }
    this.reactT -= dt;
    const t = g.time;
    if (this.meleeHitAt && t >= this.meleeHitAt) {
      this.meleeHitAt = 0;
      const tg = this.target;
      if (tg && tg.alive && tg.pos.distanceTo(this.pos) < 2.4) {
        g.audio.play('stab', { pos: tg.pos, vol: 0.9, maxDist: 25 });
        g.applyDamage(tg, 75, this, { part: 'chest', dir: _d.set(tg.pos.x - this.pos.x, 0.1, tg.pos.z - this.pos.z).normalize().clone(), weapon: { name: 'MESSER', damage: [75, 75] }, point: tg.pos.clone().setY(tg.pos.y + 1.2) });
      }
    }
    if (this.reactT > 0 || this.mantling) return;
    if (t >= (this.meleeCd || 0) && this.target && this.target.pos.distanceTo(this.pos) < 1.75 && this.onGround) {
      this.meleeCd = t + 1.15; this.meleeT = 0.5; this.meleeHitAt = t + 0.17; this.nextShot = Math.max(this.nextShot, t + 0.48);
      g.audio.play('swing', { pos: this.pos, vol: 0.7, maxDist: 25 });
      return;
    }
    if (this.burstPause > 0) { this.burstPause -= dt; return; }
    if (t < this.nextShot) return;
    // only shoot when the crosshair is roughly on target
    const tg = this.target;
    const dist = tg.pos.distanceTo(this.pos);
    const yawTo = Math.atan2(-(tg.pos.x - this.pos.x), -(tg.pos.z - this.pos.z));
    const off = Math.abs(angleDiff(this.aimYaw, yawTo));
    if (off > Math.atan2(0.9, dist) + 4 * DEG) return;
    if (def.pellets && dist > 22) return;
    this.fire(dist);
    this.nextShot = t + 60 / def.rpm * (def.fire === 'semi' ? rand(1.3, 2.0) : 1) + (def.fire === 'bolt' ? def.boltTime : def.fire === 'pump' ? def.pumpTime : 0);
    if (def.fire === 'auto' || def.fire === 'burst') {
      if (this.burst <= 0) this.burst = def.fire === 'burst' ? def.burst : Math.round(rand(D.burst[0], D.burst[1]) * (dist > 30 ? 0.5 : 1));
      this.burst--;
      if (this.burst <= 0) this.burstPause = (def.fire === 'burst' ? def.burstDelay : 0) + rand(0.12, 0.35) * (dist > 25 ? 1.6 : 1);
    }
  }

  fire(dist) {
    const g = this.game, def = this.wdef, D = this.D;
    this.mag--;
    this.lastRadar = g.time;
    const eye = this.eyePos(new THREE.Vector3());
    const moving = Math.hypot(this.vel.x, this.vel.z) > 1;
    const ads = dist > 12 && !moving;
    const spreadDeg = (ads ? def.adsSpread + 0.35 : def.hip * 0.55 + (moving ? def.moveSpread * 0.4 : 0)) * D.spreadMul;
    const pellets = def.pellets || 1;
    const muzzle = this.soldier.muzzleWorld(new THREE.Vector3());
    for (let i = 0; i < pellets; i++) {
      const yaw = this.aimYaw + this.errYaw, pitch = this.aimPitch + this.errPitch;
      const dir = _d.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      const r = Math.sqrt(Math.random()) * (pellets > 1 ? def.pelletSpread : spreadDeg) * 0.5 * DEG;
      const a = Math.random() * Math.PI * 2;
      _r.set(Math.cos(yaw), 0, -Math.sin(yaw));
      _u.crossVectors(_r, dir);
      dir.addScaledVector(_r, Math.cos(a) * Math.tan(r)).addScaledVector(_u, Math.sin(a) * Math.tan(r)).normalize();
      g.fireBullet(eye, dir.clone(), def, this, muzzle, i === 0);
    }
    // recoil pushes their aim; better bots compensate more
    this.errPitch += def.recoil.up * DEG * (1 - D.comp) * 0.9;
    this.errYaw += (Math.random() - 0.5) * def.recoil.side * DEG * (1 - D.comp);
    g.audio.gunshot(def.sound, { pos: this.pos.clone().setY(this.pos.y + 1.4) });
    g.fx.muzzleWorld(muzzle, def.heavy || def.id === 'shotgun' || def.id === 'sniper' ? 0.8 : 0.5);
    g.onBotShot(this);
  }

  animState() {
    const sp = Math.hypot(this.vel.x, this.vel.z);
    let moveAngle = 0;
    if (sp > 0.3) moveAngle = angleDiff(this.aimYaw, Math.atan2(-this.vel.x, -this.vel.z));
    return {
      yaw: this.aimYaw, pitch: this.aimPitch, speed: sp, moveAngle: -moveAngle,
      crouch: this.crouching && this.sliding <= 0, slide: this.sliding > 0, dive: false, prone: !!this.prone, supine: false,
      air: !this.onGround && !this.mantling, tac: this.tac && sp > 6, sprint: this.sprinting && sp > 5, melee: this.meleeT > 0 ? 1 - this.meleeT / 0.5 : 0, reloadK: this.reloadT > 0 ? 1 - this.reloadT / (this.reloadTotal || 1) : 0, reload: this.reloadT > 0, mantle: !!this.mantling, floorY: this.pos.y,
    };
  }

  dispose() { this.soldier.dispose(); }
}
