import * as THREE from 'three';
import { Bot, DIFFICULTY } from './bot.js';
import { WEAPONS } from '../weapons/defs.js';
import { makeWeaponDef, MAX_PLATES, PLATE_ARMOR, MAX_ARMOR, RARITY } from '../game/loot.js';
import { rand, angleDiff, clamp } from '../core/math.js';
import { moveCharacter } from '../player/physics.js';

// =============================================================================
// A bot in a Warzone match. Jumps out of the plane toward a place it picked, then
// lives by simple priorities: get out of the gas, fight what it sees, patch armor
// up, find better gear, keep moving toward the safe zone. Combat itself (aiming,
// strafing, reloads) is the normal bot.
// =============================================================================
const TIER = { ar: 5, burst: 5, smg: 4.6, pdw: 4.2, lmg: 4, dmr: 4, autoshot: 4.2, shotgun: 3.6, sniper: 3.4, amr: 3.4, handcannon: 2.2, revolver: 2.2, mpistol: 2.4, pistol: 1.2 };
const GOOD_GEAR = 6.2;
// how far they bother to fight with what they're holding
const DOWN_CHANCE = [1, 0.6, 0.3], DOWN_HP = 100, REVIVE = 6.5, SEEN = 110;
const REACH = { pistol: 28, revolver: 32, handcannon: 32, mpistol: 26, smg: 34, pdw: 30, shotgun: 22, autoshot: 24, ar: 52, burst: 52, lmg: 52, dmr: 62, sniper: 72, amr: 72 };

const _c = new THREE.Vector3();
let canopyGeo = null, canopyMat = null, lineGeo = null;
export const OPEN_PULL = 0.32, OPEN_BLOOM = 0.85; // the hand goes for the handle, then how long a canopy takes from the pack to full
const SHOULDER = 1.5, CELLS = 9, SPAN = 7.2, CHORD = 2.7;

// A ram-air wing: cells side by side, arched, open at the front. Everything hangs from the shoulders.
function canopyShape() {
  const pos = [], col = [], S = [0, 0.08, 0.2, 0.4, 0.65, 1];
  const ribX = (i) => -SPAN / 2 + (i * SPAN) / CELLS, ribY = (x) => 5.5 - SHOULDER - 1.05 * (x / (SPAN / 2)) ** 2;
  const top = (s, y) => y + 0.16 * (1 - s) + 0.28 * Math.sin(Math.PI * s ** 0.6), under = (s, y) => y - 0.02 * (1 - s), Z = (s) => -CHORD / 2 + s * CHORD;
  const quad = (a, b, c, d, k) => { for (const p of [a, b, c, a, c, d]) { pos.push(p[0], p[1], p[2]); col.push(k[0], k[1], k[2]); } };
  const ORANGE = [0.86, 0.34, 0.18], CREAM = [0.92, 0.88, 0.8], SHADE = [0.24, 0.1, 0.07];
  for (let c = 0; c < CELLS; c++) {
    const x0 = ribX(c), x1 = ribX(c + 1), y0 = ribY(x0), y1 = ribY(x1), k = c % 2 ? CREAM : ORANGE, u = [k[0] * 0.72, k[1] * 0.72, k[2] * 0.72];
    for (let i = 0; i < S.length - 1; i++) {
      const a = S[i], b = S[i + 1];
      quad([x0, top(a, y0), Z(a)], [x1, top(a, y1), Z(a)], [x1, top(b, y1), Z(b)], [x0, top(b, y0), Z(b)], k);
      quad([x0, under(a, y0), Z(a)], [x1, under(a, y1), Z(a)], [x1, under(b, y1), Z(b)], [x0, under(b, y0), Z(b)], u);
    }
    quad([x0, top(0, y0), Z(0)], [x1, top(0, y1), Z(0)], [x1, under(0, y1), Z(0)], [x0, under(0, y0), Z(0)], SHADE); // the mouth
  }
  for (const i of [0, CELLS]) { // the closed ends
    const x = ribX(i), y = ribY(x);
    for (let n = 0; n < S.length - 1; n++) quad([x, top(S[n], y), Z(S[n])], [x, top(S[n + 1], y), Z(S[n + 1])], [x, under(S[n + 1], y), Z(S[n + 1])], [x, under(S[n], y), Z(S[n])], CREAM);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // the lines fan out from each shoulder over the underside
  const pts = [];
  for (const i of [0, 2, 3, 4, 5, 6, 7, 9]) for (const s of [0.12, 0.5, 0.9]) {
    const x = ribX(i + (i < 5 ? 0 : 0));
    pts.push(new THREE.Vector3(Math.sign(x || 1) * 0.26, 0, 0.12), new THREE.Vector3(x, under(s, ribY(x)), Z(s)));
  }
  lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
  return g;
}

export function makeCanopy() {
  if (!canopyGeo) {
    canopyGeo = canopyShape();
    canopyMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true, emissive: 0x2c2825 });
  }
  const root = new THREE.Group(), pivot = new THREE.Group();
  pivot.position.y = SHOULDER; root.add(pivot);
  pivot.add(new THREE.Mesh(canopyGeo, canopyMat));
  pivot.add(new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0x2a2a2a })));
  root.userData.pivot = pivot;
  root.traverse((o) => o.layers.set(2));
  return root;
}

// u 0..1: the lines run out first with the bundle tight on their end, up from behind the back, then it fills from the middle out and overshoots a little
export function openCanopy(root, u) {
  const P = root.userData.pivot, k = clamp(u, 0, 1), run = 1 - (1 - Math.min(1, k / 0.4)) ** 3, f = clamp((k - 0.28) / 0.72, 0, 1), fill = 1 + 2.4 * (f - 1) ** 3 + 1.4 * (f - 1) ** 2;
  P.scale.set(0.045 + 0.955 * fill, 0.1 + 0.9 * run, 0.16 + 0.84 * fill);
  P.rotation.x = (1 - run) * 0.8 - 0.28; // (it flies a little ahead of whoever hangs under it)
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
    this.downed = false; this.downs = 0; this.prone = false; this.seen = false;
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
        this.canopy = makeCanopy(); this.canopyT = 0; openCanopy(this.canopy, 0); g.scene.add(this.canopy);
      }
    } else { hs = 14; vs = 7.5; }
    const k = d > 0.5 ? Math.min(hs, d / Math.max(dt, 0.01)) / d : 0;
    this.vel.x += (dx * k - this.vel.x) * Math.min(1, dt * 2.2);
    this.vel.z += (dz * k - this.vel.z) * Math.min(1, dt * 2.2);
    this.vel.y += (-vs - this.vel.y) * Math.min(1, dt * 3);
    this.pos.addScaledVector(this.vel, dt);
    if (d > 2) this.aimYaw = Math.atan2(-this.vel.x, -this.vel.z);
    if (this.canopy) {
      this.canopyT += dt; openCanopy(this.canopy, this.canopyT / OPEN_BLOOM);
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
  // Somebody in sight is an enemy. Only out of the player's sight the plan decides how much of that happens.
  ignores(c, dist) {
    if (c.sky === 'fall' || c.scripted) return true;
    if (!c.isBot) return this.ignoresPlayer(c, dist);
    if (c.downed && c !== this.target) return dist > 24 || Math.random() > 0.5; // crawling away: only worth it close by
    if (c === this.target || c === this.lastAttacker) return false;
    if (this.seen || c.seen) return false;
    if (this.game.time < this.peaceUntil && dist > 8) return true;
    const z = this.game.match.zone;
    return Math.random() > (dist < 12 ? 0.5 : dist < 30 ? z.aggro : z.aggro * 0.5);
  }

  // the closest enemy is the one that matters, the player gets no special attention
  targetBias(c) { return c.isBot ? 8 : 0; }

  // gunfire draws only some of them over, otherwise the whole island would gather around every shot
  hear(pos, shooter) {
    if (Math.random() > (shooter.isBot ? 0.35 : 0.15)) return;
    super.hear(pos, shooter);
  }

  // the player is a fair target, not everybody's: whoever is shot at answers, otherwise only a few hunt at a time
  ignoresPlayer(p, dist) {
    const g = this.game, br = g.match, st = br.playerState;
    if (st === 'plane' || st === 'fall') return true;
    if (br.finisher && br.finisher.victimView) return true; // (somebody is already seeing to that)
    // someone crawling: only worth it when it is close by, and not when someone else is already on the way
    if (st === 'downed') return (br.finishing && br.finishing !== this) || dist > 15 || Math.random() > 0.3;
    if (p === this.target || (p === this.lastAttacker && g.time - this.lastDamage < 6)) return false;
    if (st === 'chute') return dist > 18 || Math.random() > 0.05;
    if (g.time < br.safeUntil) return dist > 6;
    if (br.hunters >= br.zone.now.hunters && dist > 8) return true;
    return Math.random() > (dist < 14 ? 0.4 : br.zone.now.notice);
  }

  think() {
    const g = this.game, t = g.time, br = g.match, z = br.zone;
    const cam = g.engine.camera.position;
    this.seen = Math.hypot(this.pos.x - cam.x, this.pos.z - cam.z) < SEEN;
    this.perceive();
    const inGas = z.outside(this.pos, 0);
    const pressed = z.urgent(this.pos);
    if (this.goFinish(inGas)) return;
    // running from the gas goes first; out of the player's sight no duel goes on forever
    if (this.target && this.target.isBot && this.targetVisible) {
      if (this.target !== this.duelWith) { this.duelWith = this.target; this.duelT = t; }
      if (inGas || (!this.seen && ((pressed && z.distToNext(this.pos) > 25) || t - this.duelT > 22))) {
        this.peaceUntil = t + rand(3, 6);
        this.target = null; this.targetVisible = false; this.lastSeen = null; this.duelWith = null;
        if (this.state === 'engage') { this.state = 'roam'; this.path = null; }
      }
    }
    this.updateProne(t);
    // shot at from somewhere they can't see: into cover or after them, not on with the shopping
    const by = this.lastAttacker;
    if (!(this.target && this.targetVisible) && by && by.alive && by !== this && t - this.lastDamage < 4 && this.state !== 'cover' && !inGas) {
      if (this.gear > 3 && Math.random() < 0.6) { this.target = by; this.lastSeen = by.pos.clone(); this.lastSeenT = t; }
      else if (this.findCover()) this.state = 'cover';
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
    } else if (this.heard && t - this.heardT < 8 && this.gear > 3 && !pressed && this.heard.distanceTo(this.pos) < 70) {
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

  // Someone lying there within reach: no more shooting, over there and end it by hand. One at a time.
  goFinish(inGas) {
    const g = this.game, t = g.time, br = g.match, P = g.player, mine = br.finishing === this;
    const quit = () => { if (mine) br.finishing = null; if (this.state === 'finish') { this.state = 'roam'; this.path = null; } return false; };
    if (inGas || br.playerState !== 'downed' || !P.alive) return quit();
    if (br.finishing && !mine && br.finishing.alive && !br.finishing.out) return false;
    const d = P.pos.distanceTo(this.pos);
    if (!mine) {
      if (t < (this.finishCd || 0) || this.target !== P || d > 30 || !g.col.lineClear(this.pos.x, this.pos.y + 1.4, this.pos.z, P.pos.x, P.pos.y + 0.5, P.pos.z)) return false;
      br.finishing = this; this.finishT = t;
      // the others leave that to him: nobody shoots you out from under his hands
      for (const b of g.bots) if (b !== this && b.target === P) { b.target = null; b.targetVisible = false; b.lastSeen = null; if (b.state === 'engage' || b.state === 'chase') { b.state = 'roam'; b.path = null; } }
    } else if (t - this.finishT > 9) { this.finishCd = t + 12; return quit(); }
    this.state = 'finish'; this.target = P; this.lastSeen = P.pos.clone(); this.lastSeenT = t; this.prone = false; this.lootGoal = null;
    if (d < 12 && g.col.lineClear(this.pos.x, this.pos.y + 0.5, this.pos.z, P.pos.x, P.pos.y + 0.5, P.pos.z)) { this.path = [{ x: P.pos.x, y: P.pos.y, z: P.pos.z, type: 0 }]; this.wp = 0; }
    else if (this.repathT <= 0 || !this.path) { this.pathTo(P.pos); this.repathT = 0.7; }
    return true;
  }

  // standing right next to someone who can't take much more
  execute() { return this.target === this.game.player && this.game.match.botFinisher(this, 2.4, true); }

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
      if (g.time < (this.holdUntil || 0)) { this.path = null; if (Math.random() < (this.prone ? 0.02 : 0.06)) this.aimYaw += rand(-1.3, 1.3); return; }
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

  // Long guns like to lie down wherever they are holding a place or shooting far, some others do too.
  updateProne(t) {
    const long = this.prefDist >= 22, tg = this.target, close = tg && this.targetVisible && tg.pos.distanceTo(this.pos) < 16;
    if (this.prone) {
      if (close || t - this.lastDamage < 1 || (this.path && this.wp < this.path.length && this.state !== 'engage') || !this.onGround) this.prone = false;
      return;
    }
    if (!this.onGround || this.mantling || close || t - this.lastDamage < 3 || (t < (this.proneCd || 0))) return;
    this.proneCd = t + rand(3, 7);
    const holding = t < (this.holdUntil || 0) && !this.path, sniping = this.state === 'engage' && long && tg && this.targetVisible && !this.wantClose;
    if ((holding && Math.random() < (long ? 0.75 : 0.2)) || (sniping && Math.random() < 0.55)) { this.prone = true; this.vel.x = 0; this.vel.z = 0; }
  }

  // ------------------------------------------------------------------ on the ground
  // What would have killed them puts most of them down first: crawling, bleeding, and with some luck back on their feet by
  // themselves. Whoever comes close can finish it. Gas and what has already gone that far kill for good.
  goesDown(attacker, info) {
    if (this.downed || this.sky || this.out || this.scripted || (info && (info.zone || info.staged))) return false;
    if (Math.random() > DOWN_CHANCE[Math.min(this.downs, DOWN_CHANCE.length - 1)]) return false;
    const g = this.game;
    this.downs++;
    this.downed = true; this.prone = false;
    this.health = DOWN_HP; this.armor = 0; this.plateT = 0; this.downT = 0; this.reviveK = 0;
    this.bleedRate = DOWN_HP / rand(24, 38);
    this.reviveAt = Math.random() < 0.62 ? rand(6, 12) : Infinity;
    this.state = 'downed'; this.path = null; this.target = null; this.targetVisible = false; this.lootGoal = null; this.goalKind = null;
    this.crouching = false; this.crouchT = 0; this.sliding = 0; this.mantling = null; this.reloadT = 0; this.burst = 0; this.sprinting = false; this.tac = false;
    this.vel.x *= 0.3; this.vel.z *= 0.3;
    this.crawlYaw = attacker && attacker !== this ? Math.atan2(-(this.pos.x - attacker.pos.x), -(this.pos.z - attacker.pos.z)) : this.aimYaw;
    // whoever shot often thinks it is done: that is the chance to crawl away
    for (const b of g.bots) if (b.target === this && Math.random() < 0.4) { b.target = null; b.targetVisible = false; b.lastSeen = null; if (b.state === 'engage' || b.state === 'chase') { b.state = 'roam'; b.path = null; } }
    g.audio.play('hurt', { pos: this.pos, vol: 0.7, rate: 0.75, maxDist: 40 });
    return true;
  }

  updateDowned(dt) {
    const g = this.game, col = g.col, alone = g.time - this.lastDamage > 2.2;
    this.downT += dt;
    const reviving = alone && this.downT > this.reviveAt;
    let sp = 0;
    if (reviving) {
      if (this.reviveK === 0) g.audio.play('stim', { pos: this.pos, vol: 0.5, maxDist: 25 });
      this.reviveK += dt / REVIVE;
    } else {
      this.reviveK = Math.max(0, this.reviveK - dt * 0.1);
      sp = 1.05;
      // a wall or a ledge ahead: around it
      const fx = -Math.sin(this.crawlYaw), fz = -Math.cos(this.crawlYaw);
      if (Math.random() < dt * 4 && (!col.lineClear(this.pos.x, this.pos.y + 0.4, this.pos.z, this.pos.x + fx, this.pos.y + 0.4, this.pos.z + fz) || !this.groundAhead(_c.set(fx, 0, fz)))) this.crawlYaw += rand(0.9, 2.2) * (Math.random() < 0.5 ? -1 : 1);
    }
    const dy = angleDiff(this.aimYaw, this.crawlYaw);
    this.aimYaw += dy * Math.min(1, dt * 2.5);
    const k = Math.min(1, dt * 7), tx = -Math.sin(this.aimYaw) * sp, tz = -Math.cos(this.aimYaw) * sp;
    this.vel.x += (tx - this.vel.x) * k; this.vel.z += (tz - this.vel.z) * k;
    this.vel.y -= 19.5 * dt;
    const res = moveCharacter(col, this.pos, this.vel, dt, 0.25, 0.62, this.onGround);
    this.onGround = res.ground;
    g.separate(this);
    this.aimPitch += (0 - this.aimPitch) * Math.min(1, dt * 6);
    // bleeding: slower while patching up
    this.health -= this.bleedRate * dt * (reviving ? 0.5 : 1);
    if (this.reviveK >= 1) { this.getUp(); return; }
    if (this.health <= 0) { g.kill(this, this.lastAttacker && this.lastAttacker !== this ? this.lastAttacker : null, { part: 'chest', weapon: { name: 'VERBLUTET', damage: [20, 20] }, zone: true, dir: new THREE.Vector3(0, -0.4, 1).normalize() }); return; }
    this.soldier.update(dt, { yaw: this.aimYaw, pitch: 0, speed: Math.hypot(this.vel.x, this.vel.z), moveAngle: 0, downed: true, reviving, floorY: this.pos.y }, this.pos);
  }

  getUp() {
    const g = this.game;
    this.downed = false; this.health = 75; this.armor = 0; this.lastDamage = g.time;
    this.state = 'roam'; this.path = null; this.crouchT = 1.2; this.lastProgress.copy(this.pos); this.stuckT = 0; this.peaceUntil = g.time + 2;
    g.audio.play('stim', { pos: this.pos, vol: 0.5, rate: 0.8, maxDist: 25 });
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
    if (this.downed) { this.updateDowned(dt); return; }
    if (this.plateT > 0) {
      this.plateT -= dt;
      if (this.plateT <= 0 && this.plates > 0) { this.plates--; this.armor = Math.min(MAX_ARMOR, this.armor + PLATE_ARMOR); }
    }
    if (this.state === 'finish' && this.onGround && g.player.pos.distanceTo(this.pos) < 2) {
      if (g.match.botFinisher(this)) return;
      this.finishT = -99; this.state = 'roam'; this.path = null; // no room for it here: then the normal way
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
