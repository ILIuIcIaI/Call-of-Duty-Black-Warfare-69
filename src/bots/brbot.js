import * as THREE from 'three';
import { Bot, DIFFICULTY } from './bot.js';
import { WEAPONS } from '../weapons/defs.js';
import { makeWeaponDef, MAX_PLATES, PLATE_ARMOR, MAX_ARMOR, RARITY } from '../game/loot.js';
import { rand, angleDiff } from '../core/math.js';

// =============================================================================
// A bot in a Warzone match. Jumps out of the plane toward a place it picked, then
// lives by simple priorities: get out of the gas, fight what it sees, patch armor
// up, find better gear, keep moving toward the safe zone. Combat itself (aiming,
// strafing, reloads) is the normal bot.
// =============================================================================
const TIER = { ar: 5, burst: 5, smg: 4.6, pdw: 4.2, lmg: 4, dmr: 4, autoshot: 4.2, shotgun: 3.6, sniper: 3.4, amr: 3.4, handcannon: 2.2, revolver: 2.2, mpistol: 2.4, pistol: 1.2 };
const GOOD_GEAR = 6.2;
// how far they bother to fight with what they're holding
const REACH = { pistol: 28, revolver: 32, handcannon: 32, mpistol: 26, smg: 34, pdw: 30, shotgun: 22, autoshot: 24, ar: 52, burst: 52, lmg: 52, dmr: 62, sniper: 72, amr: 72 };

const _c = new THREE.Vector3();
let canopyGeo = null, canopyMat = null;

export function makeCanopy() {
  if (!canopyGeo) {
    // arched, segmented canopy: wide in x, shallow, with lines running down to the shoulders
    const g = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.42);
    g.scale(3.6, 1.5, 2.1);
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(g.attributes.position.getZ(i), g.attributes.position.getX(i));
      const stripe = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8) % 2;
      const col = stripe ? [0.86, 0.34, 0.18] : [0.92, 0.88, 0.8];
      c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2];
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    canopyGeo = g;
    canopyMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true });
  }
  const root = new THREE.Group();
  const dome = new THREE.Mesh(canopyGeo, canopyMat); dome.position.y = 5.2; root.add(dome);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x2a2a2a });
  const pts = [];
  for (const [x, z] of [[-3.2, -1.1], [-1.6, -1.8], [1.6, -1.8], [3.2, -1.1], [-3.2, 1.1], [-1.6, 1.8], [1.6, 1.8], [3.2, 1.1]]) {
    pts.push(new THREE.Vector3(Math.sign(x) * 0.26, 1.5, 0.12), new THREE.Vector3(x, 5.5, z)); // from the shoulders, just behind the eyes
  }
  root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
  root.traverse((o) => o.layers.set(2));
  return root;
}

export class BRBot extends Bot {
  constructor(game, opts) {
    super(game, { ...opts, weapon: 'pistol' });
    // calmer than in the small arenas: a match should last. With just a pistol they only care about what's close.
    const D = DIFFICULTY[opts.difficulty] || DIFFICULTY.regular;
    const reaction = [D.reaction[0] + 0.2, D.reaction[1] + 0.35];
    this.Dfull = { ...D, reaction, view: Math.min(D.view, 78), spreadMul: D.spreadMul * 1.5, err: D.err * 1.3, hear: Math.min(D.hear, 42) };
    this.Dweak = { ...this.Dfull, view: 26, fov: 95 };
    this.D = this.Dweak;
    this.armor = 0; this.plates = 0;
    this.out = false;      // eliminated for good
    this.sky = 'plane';    // plane | fall | chute | null (on the ground)
    this.alive = false;
    this.gear = TIER.pistol;
    this.soldier.setVisible(false);
    this.lootGoal = null; this.goalKind = null; this.plateT = 0; this.zoneRepath = 0; this.pending = null; this.peaceUntil = 0;
    this.animEvery = 1;
    this.hiddenBody = false;
  }

  // ------------------------------------------------------------------ gear
  gearScore(id, rarity) { return (TIER[id] || 2) + rarity * 0.9; }

  equipLoot(it) {
    const score = this.gearScore(it.weaponId, it.rarity);
    this.wdef = makeWeaponDef(it.weaponId, it.rarity);
    this.wdefBase = WEAPONS[it.weaponId];
    this.optic = it.optic;
    this.soldier.setWeapon(this.wdef, it.optic === 'iron' ? this.wdef.optics[0] : it.optic);
    this.mag = this.wdef.mag; this.reloadT = 0;
    this.rarity = it.rarity;
    this.gear = score;
    this.D = score > 3 ? { ...this.Dfull, view: REACH[it.weaponId] || 60 } : this.Dweak;
    this.prefDist = { smg: 8, pdw: 7, shotgun: 5, autoshot: 6, ar: 16, burst: 18, lmg: 22, dmr: 28, sniper: 38, amr: 42 }[it.weaponId] || 12;
  }

  wants(it) {
    if (it.kind === 'plate') return this.plates < MAX_PLATES;
    if (it.kind === 'weapon') return this.gearScore(it.weaponId, it.rarity) > this.gear + 0.5;
    return false;
  }

  takeItem(it) {
    const L = this.game.match.loot;
    if (it.kind === 'plate') this.plates = Math.min(MAX_PLATES, this.plates + (it.count || 1));
    else if (it.kind === 'weapon') {
      // the old gun stays on the floor if it was worth something
      if (this.rarity !== undefined && this.gear > 3) L.drop({ kind: 'weapon', weaponId: this.wdef.id, optic: this.optic, rarity: this.rarity }, this.pos.x, this.pos.y, this.pos.z);
      this.equipLoot(it);
    }
    L.removeItem(it);
  }

  // ------------------------------------------------------------------ the drop
  planJump(target, jumpT) { this.target3 = target; this.jumpT = jumpT; }

  startFall(p) {
    this.sky = 'fall';
    this.alive = true; this.health = this.maxHealth;
    this.pos.copy(p); this.vel.set(0, -8, 0);
    this.soldier.resetPose();
    this.soldier.setVisible(true);
    this.target = null; this.state = 'roam'; this.path = null; this.wp = 0;
    this.mag = this.wdef.mag; this.reloadT = 0; this.lastProgress = this.pos.clone(); this.stuckT = 0; this.repathT = 0; this.reactT = 0; this.burst = 0; this.burstPause = 0; this.nextShot = 0;
    this.strafeDir = 1; this.strafeT = 0; this.crouching = false; this.crouchT = 0; this.sliding = 0; this.mantling = null; this.onGround = false; this.sprinting = false; this.tac = false; this.heard = null; this.heardT = -99; this.lastSeen = null; this.lastSeenT = -99;
    this.aimYaw = Math.atan2(-(this.target3.x - p.x), -(this.target3.z - p.z)); this.aimPitch = 0;
  }

  updateSky(dt) {
    const g = this.game, t3 = this.target3;
    if (!this.alive) { this.closeCanopy(); return; }
    const dx = t3.x - this.pos.x, dz = t3.z - this.pos.z, d = Math.hypot(dx, dz);
    const gy = g.col.floorBelow(this.pos.x, this.pos.z, 0.3, this.pos.y + 0.1, -5);
    const agl = this.pos.y - (isFinite(gy) ? gy : 0);
    let hs, vs;
    if (this.sky === 'fall') {
      hs = 34; vs = 42;
      if (agl < 90) {
        this.sky = 'chute';
        this.canopy = makeCanopy(); this.canopy.scale.setScalar(0.5); g.scene.add(this.canopy);
      }
    } else { hs = 14; vs = 7.5; }
    const k = d > 0.5 ? Math.min(hs, d / Math.max(dt, 0.01)) / d : 0;
    this.vel.x += (dx * k - this.vel.x) * Math.min(1, dt * 2.2);
    this.vel.z += (dz * k - this.vel.z) * Math.min(1, dt * 2.2);
    this.vel.y += (-vs - this.vel.y) * Math.min(1, dt * 3);
    this.pos.addScaledVector(this.vel, dt);
    if (d > 2) this.aimYaw = Math.atan2(-this.vel.x, -this.vel.z);
    if (this.canopy) {
      const s = Math.min(1, this.canopy.scale.x + dt * 2);
      this.canopy.scale.setScalar(s);
      this.canopy.position.copy(this.pos); this.canopy.rotation.y = this.aimYaw;
    }
    if ((agl <= 0.05 || this.pos.y <= gy) && g.nav.nearest(this.pos.x, gy, this.pos.z, 1.2) < 0 && gy > g.mapDef.terrain.heightAt(this.pos.x, this.pos.z) + 0.5) {
      this.pos.y = gy - 0.3;
    } else if (agl <= 0.05 || this.pos.y <= gy) {
      this.pos.y = isFinite(gy) ? gy : 0;
      this.vel.set(0, 0, 0); this.onGround = true;
      this.closeCanopy();
      this.sky = null;
      this.thinkT = rand(0.05, 0.4);
    }
    this.lastSeen = null;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.soldier.update(dt, { yaw: this.aimYaw, pitch: 0, speed: sp, moveAngle: 0, fall: this.sky === 'fall', air: this.sky === 'chute', floorY: this.pos.y - 200 }, this.pos);
  }

  closeCanopy() {
    if (!this.canopy) return;
    this.game.scene.remove(this.canopy);
    this.canopy = null;
  }

  // ------------------------------------------------------------------ decisions
  // among themselves they are busy with loot and the zone: real fights happen up close, or once the circle gets small
  ignores(c, dist) {
    if (c.sky === 'fall' || c.scripted) return true;
    if (!c.isBot) return this.ignoresPlayer(c, dist);
    if (this.game.time < this.peaceUntil && dist > 8) return true;
    if (c === this.target || c === this.lastAttacker) return false;
    // somebody in sight is an enemy. Far away they take a moment to notice, up close never long
    const z = this.game.match.zone;
    return Math.random() > (dist < 12 ? 0.5 : dist < 30 ? z.aggro : z.aggro * 0.5);
  }

  // the closest enemy is the one that matters, the player gets no special attention
  targetBias(c) { return c.isBot ? 8 : 0; }

  // gunfire draws only some of them over, otherwise the whole island would gather around every shot
  hear(pos, shooter) {
    if (Math.random() > 0.15) return;
    super.hear(pos, shooter);
  }

  // the player is a fair target, not everybody's: whoever is shot at answers, otherwise only a few hunt at a time
  ignoresPlayer(p, dist) {
    const g = this.game, br = g.match, st = br.playerState;
    if (st === 'plane' || st === 'fall') return true;
    // someone crawling: only worth it when it is close by
    if (st === 'downed') return dist > 15 || Math.random() > 0.3;
    if (p === this.target || (p === this.lastAttacker && g.time - this.lastDamage < 6)) return false;
    if (st === 'chute') return dist > 18 || Math.random() > 0.05;
    if (g.time < br.safeUntil) return dist > 6;
    if (br.hunters >= br.zone.now.hunters && dist > 8) return true;
    return Math.random() > (dist < 14 ? 0.4 : br.zone.now.notice);
  }

  think() {
    const g = this.game, t = g.time, br = g.match, z = br.zone;
    this.perceive();
    const inGas = z.outside(this.pos, 0);
    const pressed = z.urgent(this.pos);
    // no endless duels among bots, and running from the gas goes first
    if (this.target && this.target.isBot && this.targetVisible) {
      if (this.target !== this.duelWith) { this.duelWith = this.target; this.duelT = t; }
      // long-range stalemates end as well: both have somewhere to be
      if (inGas || (pressed && z.distToNext(this.pos) > 25) || t - this.duelT > 22) {
        this.peaceUntil = t + rand(3, 6);
        this.target = null; this.targetVisible = false; this.lastSeen = null; this.duelWith = null;
        if (this.state === 'engage') { this.state = 'roam'; this.path = null; }
      }
    }
    if (this.state === 'cover' && (inGas || pressed)) { this.state = 'roam'; this.path = null; }
    const fight = this.target && this.targetVisible;
    const hurt = this.health + this.armor < this.maxHealth * 0.6;
    if (fight) {
      const d = this.target.pos.distanceTo(this.pos);
      if (inGas && d > 20) { this.state = 'roam'; }
      else if (hurt && this.state !== 'cover' && Math.random() < 0.5 && this.findCover()) this.state = 'cover';
      else if (this.state !== 'cover') this.state = 'engage';
    } else if (this.state === 'cover') {
      if (this.health > this.maxHealth * 0.85 || t - this.coverT > 7) { this.state = 'roam'; this.path = null; }
    } else if (this.target && this.lastSeen && this.gear > 3 && !pressed) {
      if (this.state !== 'chase') { this.state = 'chase'; this.pathTo(this.lastSeen); }
    } else if (this.heard && t - this.heardT < 8 && this.gear >= GOOD_GEAR && !pressed && this.heard.distanceTo(this.pos) < 70) {
      if (this.state !== 'investigate' || this.repathT <= 0) { this.state = 'investigate'; this.pathTo(this.heard); this.repathT = 3; }
    } else if (this.state !== 'roam') { this.state = 'roam'; this.path = null; }

    if (this.state === 'engage') {
      const d = this.target.pos.distanceTo(this.pos);
      this.wantClose = d > this.prefDist * 1.6;
      this.wantBack = d < this.prefDist * 0.4 && (this.wdef.id === 'sniper' || this.wdef.id === 'amr' || this.wdef.id === 'lmg' || this.wdef.id === 'dmr');
      if (this.wantClose && (this.repathT <= 0 || !this.path)) { this.pathTo(this.target.pos); this.repathT = 1.5; }
    }
    if (this.state === 'chase' && this.path && this.wp >= this.path.length) { this.target = null; this.state = 'roam'; this.path = null; this.aimYaw += rand(-1.5, 1.5); }
    if (this.state === 'roam') this.roamBrain(inGas, pressed);
  }

  roamBrain(inGas, pressed) {
    const g = this.game, br = g.match, L = br.loot, z = br.zone;
    // ---- reached what we came for
    const goal = this.lootGoal;
    if (goal) {
      const o = goal.o;
      const gone = goal.kind === 'chest' ? o.open : o.taken;
      const atEnd = this.path && this.wp >= this.path.length;
      if (gone) { this.lootGoal = null; this.path = null; }
      else if (Math.hypot(o.x - this.pos.x, o.z - this.pos.z) < (atEnd ? 3.2 : 2.0) && Math.abs(o.y - this.pos.y) < 1.9) {
        if (goal.kind === 'chest') L.openChest(o, this); else this.takeItem(o);
        this.lootGoal = null; this.path = null;
      } else if (atEnd) { o.noPath = true; o.claimed = null; this.lootGoal = null; this.path = null; } // this is as close as the paths get
    }
    // ---- gas first
    this.zoneRepath -= 0.2;
    if (inGas || pressed) {
      if (this.goalKind !== 'zone' || !this.path || this.wp >= this.path.length || this.zoneRepath <= 0) {
        this.goalKind = 'zone'; this.lootGoal = null; this.zoneRepath = 5;
        this.pathTo(z.pointInside(this.pos));
      }
      return;
    }
    if (this.goalKind === 'zone') { this.goalKind = null; this.path = null; }
    // ---- armor up when nothing's going on
    if (this.plates > 0 && this.armor <= MAX_ARMOR - PLATE_ARMOR && this.plateT <= 0 && g.time - this.lastDamage > 2) { this.plateT = 1.0; }
    // ---- loot, as long as it's worth it
    if (!this.path || this.wp >= this.path.length) {
      // arrived somewhere with nothing to do: hold the place for a while and watch, nobody runs around all match
      if (this.goalKind === 'wander' && this.path) this.holdUntil = g.time + rand(8, 22) * (z.phase < 3 ? 1 : 0.5);
      if (g.time < (this.holdUntil || 0)) { this.path = null; if (Math.random() < 0.06) this.aimYaw += rand(-1.3, 1.3); return; }
      this.path = null; this.lootGoal = null;
      const range = this.gear < GOOD_GEAR ? 130 : 26;
      const found = L.nearestFor(this, range, (it) => this.wants(it) && !it.noPath);
      if (found && (found.kind !== 'chest' || this.gear < GOOD_GEAR + 2 || this.plates < 2)) {
        this.lootGoal = found; found.o.claimed = this; this.goalKind = 'loot';
        if (!this.pathTo(_c.set(found.o.x, found.o.y, found.o.z))) { found.o.noPath = true; found.o.claimed = null; this.lootGoal = null; this.path = null; }
      }
      // ---- otherwise wander inside the safe area, houses first
      if (!this.lootGoal) { this.goalKind = 'wander'; this.pathTo(z.pointInside(this.pos, true)); }
    }
  }

  pathTo(p) {
    const g = this.game;
    // a handful of long searches per frame at most
    if (g._navFrame !== g.frameId) { g._navFrame = g.frameId; g._navCount = 0; }
    if (g._navCount >= 2) { this.path = null; this.thinkT = 0.05; return true; }
    g._navCount++;
    const nav = g.nav;
    const s = nav.nearest(this.pos.x, this.pos.y, this.pos.z, 3);
    const e = nav.nearest(p.x, p.y, p.z, 6);
    const path = s >= 0 && e >= 0 ? nav.findPath(s, e) : null;
    this.path = path ? nav.toWaypoints(path) : [{ x: p.x, y: p.y, z: p.z, type: 0 }];
    this.wp = this.path.length > 1 ? 1 : 0;
    this.repathT = 3 + Math.random() * 2;
    return !!path;
  }

  // called when it runs into something for good
  pickRoamGoal() {
    this.path = null;
    const goal = this.lootGoal;
    if (goal && (goal.o.blocked = (goal.o.blocked || 0) + 1) > 1) { goal.o.noPath = true; goal.o.claimed = null; this.lootGoal = null; }
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    const g = this.game;
    if (this.out) {
      if (!this.hiddenBody) {
        if (g.time - this.deathT > 16) { this.hiddenBody = true; this.soldier.setVisible(false); this.closeCanopy(); }
        else this.soldier.update(dt, this.animState(), this.pos);
      }
      return;
    }
    if (this.sky === 'plane' || this.scripted) return;
    // far away: animate less often, very far: not drawn at all
    const cam = g.engine.camera.position;
    const d2 = (this.pos.x - cam.x) ** 2 + (this.pos.z - cam.z) ** 2;
    this.soldier.setVisible(d2 < 420 * 420);
    this.animEvery = d2 < 70 * 70 ? 1 : d2 < 170 * 170 ? 3 : 8;
    if (this.sky) { this.updateSky(dt); return; }
    if (this.plateT > 0) {
      this.plateT -= dt;
      if (this.plateT <= 0 && this.plates > 0) { this.plates--; this.armor = Math.min(MAX_ARMOR, this.armor + PLATE_ARMOR); }
    }
    super.update(dt);
  }

  onKilled(killer, info) {
    super.onKilled(killer, info);
    this.out = true;
    this.closeCanopy();
    if (!this.holdDrop) this.dropLoot();
    if (this.lootGoal) this.lootGoal = null;
    this.game.match.onBotOut(this);
  }

  // whatever it found can be taken from it
  dropLoot() {
    const L = this.game.match.loot, x = this.pos.x, y = this.pos.y, z = this.pos.z;
    if (this.rarity !== undefined) L.drop({ kind: 'weapon', weaponId: this.wdef.id, optic: this.optic, rarity: this.rarity }, x, y, z);
    if (this.plates > 0) L.drop({ kind: 'plate', count: this.plates }, x, y, z);
    L.drop({ kind: 'ammo' }, x, y, z);
  }

  animState() {
    const st = super.animState();
    if (this.plateT > 0) st.crouch = true;
    return st;
  }
}

export { RARITY, angleDiff };
