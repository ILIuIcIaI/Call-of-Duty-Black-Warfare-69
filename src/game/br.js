import * as THREE from 'three';
import { PLATE_TIME } from '../weapons/playerWeapons.js';
import { BRBot, makeCanopy, openCanopy, OPEN_PULL, OPEN_BLOOM } from '../bots/brbot.js';
import { OUTFITS, Soldier } from '../characters/soldier.js';
import { Loot, makeWeaponDef, MAX_PLATES, PLATE_ARMOR, MAX_ARMOR, RARITY } from './loot.js';
import { Vehicle, VEHICLE_TYPES } from '../vehicles/vehicle.js';
import { buildPlane } from '../vehicles/plane.js';
import { moveCharacter, hullFits } from '../player/physics.js';
import { HULL } from '../player/player.js';
import { FINISHERS, Stage, makeProp, bakeFinishers, clearance, roomOf, victimYaw, startYaw } from './finishers.js';
import { WEAPONS, OPTICS } from '../weapons/defs.js';
import { damp, clamp, lerp, smoother, DEG, angleDiff, rand } from '../core/math.js';
import { WORLD_R } from '../world/maps/island.js';
import { BRHud } from '../ui/brhud.js';

// =============================================================================
// Warzone: 20 people, one plane, one island, a shrinking safe zone. Everything
// that only exists in this mode lives here: the flight, free fall and parachute,
// the gas, loot pickup, armor plates, vehicles and the end of the match.
// =============================================================================
const NAMES = ['Ghost', 'Viper', 'Havoc', 'Reaper', 'Nomad', 'Saber', 'Raptor', 'Blitz', 'Wolf', 'Hunter', 'Specter', 'Cobra', 'Rook', 'Jackal', 'Falcon', 'Onyx', 'Kodiak', 'Mako', 'Talon', 'Vandal', 'Bishop', 'Echo', 'Fuchs', 'Bär', 'Krähe', 'Mamba', 'Nox', 'Orca', 'Puma', 'Quill', 'Ronin', 'Sturm', 'Titan', 'Ulme', 'Wespe'];
const OUTFIT_KEYS = ['raven', 'jungle', 'urban', 'desert', 'vanguard'];
const PLANE_Y = 330, PLANE_SPEED = 40;
const FALL_DEPLOY = 95;    // automatic opening above the ground
const OPEN_END = 2;        // by then the opening is over, the view is back where you were looking
const FALL_DEPLOY_MAX = 240; // highest you can open it by hand
const CHUTE_MIN_DROP = 9;    // on foot: a drop has to be at least this deep for the canopy to open
const CAM_INTO_FALL = 1.6;   // seconds the camera takes from the plane into your head
// lying on the ground: how many hit points are left down there, how long until you bleed out and how long the
// self revive takes (first, second, third time down in a match and every time after that)
const DOWN_HP = 100, BLEED_OUT = [40, 30, 24, 18], REVIVE_TIME = [6.5, 8, 9.5, 11];
const FINISH_HP = 100;       // health and armor left for a melee from behind to become a finisher
const FRONT_HP = 60;         // from the front a bot has to be closer to the end. A person only ever gets it from behind.
const TAKEN_HP = 70;         // the same for a bot's melee on a person: he goes down from anything more
const BACK_OF = 1.9, SIDE_OF = 1.8; // where a bot goes to get behind someone lying there: his legs are in the way any closer
const ANY_WAY = [0, Math.PI / 2, -Math.PI / 2, Math.PI], NEARBY = [[0, 0]];
for (const r of [0.8, 1.6, 2.4]) for (let i = 0; i < 8; i++) NEARBY.push([Math.sin(i * Math.PI / 4) * r, Math.cos(i * Math.PI / 4) * r]);
const SEEN_DMG = 0.7;        // how hard bots hit each other where the player can see it: fights there are the real thing

// wait before it moves, how long it moves, the radius it ends at, damage per second outside. For the bots:
// how likely they notice each other far away per look, how hard they hit each other; toward the player: how likely
// they notice you, how many may hunt you at once, how hard they hit.
const PHASES = [
  { wait: 100, shrink: 40, r: 215, dps: 6, aggro: 0.12, botDmg: 0.14, notice: 0.2, hunters: 2, toPlayer: 0.6 },
  { wait: 50, shrink: 35, r: 135, dps: 10, aggro: 0.14, botDmg: 0.14, notice: 0.25, hunters: 2, toPlayer: 0.65 },
  { wait: 42, shrink: 30, r: 80, dps: 16, aggro: 0.18, botDmg: 0.18, notice: 0.3, hunters: 3, toPlayer: 0.75 },
  { wait: 34, shrink: 26, r: 42, dps: 24, aggro: 0.25, botDmg: 0.3, notice: 0.4, hunters: 3, toPlayer: 0.85 },
  { wait: 26, shrink: 22, r: 16, dps: 34, aggro: 0.35, botDmg: 0.65, notice: 0.6, hunters: 4, toPlayer: 1 },
  { wait: 18, shrink: 20, r: 0, dps: 50, aggro: 0.5, botDmg: 1, notice: 1, hunters: 6, toPlayer: 1 },
];

const PLAN = [[0, 19], [60, 18], [120, 15], [180, 12], [240, 9], [300, 6], [360, 4], [420, 2], [470, 0]];

function seededChance(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------------------
// The safe zone
// ---------------------------------------------------------------------------
class Zone {
  constructor(game, terrain) {
    this.game = game; this.t = terrain;
    this.cur = { x: 0, z: 0, r: 470 };
    this.from = { ...this.cur };
    this.phase = 0; this.mode = 'wait'; this.time = 0; this.elapsed = 0;
    // (the circles have to come out the same for everyone in a network match, whenever they are drawn)
    this.chance = game.cfg && game.cfg.net ? seededChance(game.cfg.seed + 2) : Math.random;
    this.dps = PHASES[0].dps;
    this.next = this.pickNext(this.cur, PHASES[0].r);
    // wall of light where the gas begins
    const geo = new THREE.CylinderGeometry(1, 1, 1, 96, 1, true);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      uniforms: { t: { value: 0 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float t; varying vec2 vUv; varying vec3 vW;
        void main(){ float d = distance(vW, cameraPosition);
          float streak = 0.5 + 0.5 * sin(vUv.x * 380.0 + t * 0.25) * sin(vUv.x * 97.0 - t * 0.18);
          float a = (0.15 + 0.06 * streak) * mix(1.7, 0.45, smoothstep(30.0, 450.0, d));
          a *= smoothstep(1.0, 0.7, vUv.y);
          gl_FragColor = vec4(1.0, 0.36, 0.12, a); }`,
    });
    this.wall = new THREE.Mesh(geo, mat);
    this.wall.frustumCulled = false; this.wall.renderOrder = 8; this.wall.layers.set(2);
    game.scene.add(this.wall);
    this.applyWall();
  }

  pickNext(c, r) {
    for (let i = 0; i < 40; i++) {
      const a = this.chance() * Math.PI * 2, q = Math.sqrt(this.chance()) * Math.max(0, c.r - r) * 0.92;
      const x = c.x + Math.cos(a) * q, z = c.z + Math.sin(a) * q;
      if (Math.hypot(x, z) + r * 0.45 > 275) continue;
      if (this.t.heightAt(x, z) < 2 || this.t.slopeAt(x, z) > 0.6) continue;
      return { x, z, r };
    }
    return { x: c.x * 0.8, z: c.z * 0.8, r };
  }

  applyWall() {
    this.wall.position.set(this.cur.x, 150, this.cur.z);
    this.wall.scale.set(Math.max(this.cur.r, 0.5), 700, Math.max(this.cur.r, 0.5));
    this.wall.visible = this.cur.r < WORLD_R + 40; // still out at sea at the start
  }

  update(dt) {
    this.wall.material.uniforms.t.value += dt;
    this.time += dt; this.elapsed += dt;
    const ph = PHASES[this.phase];
    if (!ph) return;
    if (this.mode === 'wait' && this.time >= ph.wait) { this.mode = 'shrink'; this.time = 0; this.from = { ...this.cur }; this.game.audio.play('hammer', { vol: 0.5, rate: 0.6 }); this.onEvent && this.onEvent('shrink'); }
    else if (this.mode === 'shrink') {
      const k = Math.min(1, this.time / ph.shrink);
      this.cur.x = lerp(this.from.x, this.next.x, k); this.cur.z = lerp(this.from.z, this.next.z, k); this.cur.r = lerp(this.from.r, this.next.r, k);
      this.applyWall();
      if (k >= 1) {
        this.phase++; this.mode = 'wait'; this.time = 0;
        const n = PHASES[this.phase];
        if (n) { this.dps = n.dps; this.next = this.pickNext(this.cur, n.r); this.onEvent && this.onEvent('next'); }
      }
    }
  }

  get now() { return PHASES[this.phase] || PHASES[PHASES.length - 1]; }
  get aggro() { return this.now.aggro; }
  get botDmg() { return this.now.botDmg; }
  get countdown() { const ph = PHASES[this.phase]; if (!ph) return 0; return Math.max(0, (this.mode === 'wait' ? ph.wait : ph.shrink) - this.time); }
  outside(p, margin = 0) { return Math.hypot(p.x - this.cur.x, p.z - this.cur.z) > this.cur.r - margin; }
  outsideNext(p, margin = 0) { return Math.hypot(p.x - this.next.x, p.z - this.next.z) > this.next.r - margin; }
  distToNext(p) { return Math.hypot(p.x - this.next.x, p.z - this.next.z) - this.next.r; }

  // time to start moving: the next circle is close in time, and we're not in it
  urgent(p) {
    if (!this.outsideNext(p, 6)) return false;
    const d = Math.hypot(p.x - this.next.x, p.z - this.next.z) - this.next.r;
    const runtime = d / 6.5 + 20;
    return this.mode === 'shrink' || this.countdown < runtime;
  }

  // a place to go that will still be safe for a while
  pointInside(p, wander = false) {
    const n = this.next, nav = this.game.nav;
    const spread = wander ? 0.8 : 0.55;
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * n.r * spread;
      const x = n.x + Math.cos(a) * r, z = n.z + Math.sin(a) * r, y = this.t.heightAt(x, z);
      if (y < 1.5) continue;
      const s = nav.nearest(x, y, z, 8);
      if (s >= 0) return _v.set(nav.X[s], nav.Y[s], nav.Z[s]);
    }
    return _v.set(n.x, this.t.heightAt(n.x, n.z), n.z);
  }

  dispose() { this.game.scene.remove(this.wall); }
}

// ---------------------------------------------------------------------------
export class BRMatch {
  constructor(game, cfg) {
    this.game = game; this.cfg = cfg;
    this.mode = 'br';
    this.score = [0, 0]; this.limit = 0; this.timeLeft = 0; this.ended = false;
    this.lastUsed = new Map();
    const def = game.mapDef;
    this.def = def; this.t = def.terrain;
    this.zone = new Zone(game, def.terrain);
    this.zone.onEvent = (e) => {
      if (e === 'shrink') this.hud.banner('DIE ZONE SCHRUMPFT', '#ff8a4a');
      else this.hud.banner('NEUE ZONE AUF DER KARTE', '#ffd27a');
    };
    this.loot = new Loot(game, def);
    this.vehicles = { list: def.layout.vehicles.map((v) => new Vehicle(game, v.type, v.x, v.z, v.yaw)) };
    this.hud = new BRHud(game, this);
    // ---- flight path: straight across the island, a little off center
    const a = Math.random() * Math.PI * 2, off = rand(-90, 90);
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    this.flight = { dir, a: side.clone().multiplyScalar(off).addScaledVector(dir, -450), len: 900 };
    this.flight.a.y = PLANE_Y;
    this.planeT = 0;
    this.plane = buildPlane();
    this.plane.rotation.y = Math.atan2(-dir.x, -dir.z);
    game.scene.add(this.plane);
    this.planeLife = true;
    this.placeOverride = 0;
    this.playerState = 'plane'; // plane | fall | chute | ground | vehicle
    this.vehicle = null;
    this.stats = { kills: 0, placed: 0 };
    this.outOrder = 0;
    this.gasTick = 0; this.interactCd = 0; this.plateT = 0; this.mapOpen = false; this.botsFighting = 0; this.botDamage = 0.3; this.hunters = 0; this.safeUntil = 0;
    this.vehCam = 0; this.vehFirst = false; this.enterT = 0; this.lastLook = 0;
    this.camFrom = new THREE.Vector3();
    this.camBlend = 0; this.fallFov = 70;
    this.downs = 0; this.bleedRate = 0; this.reviveK = 0; this.reviveTime = 0; this.crawlT = 0; this.reviveLock = 0;
    this.finisher = null;
    this.finishing = new Map(); // who is lying there: the bot on its way to end it
    bakeFinishers();
    this.audioL = {};
  }

  // ---- the interface the rest of the game expects from a match
  // ---- in a network match the room has decided who is who
  makeNetBot(e) { return new BRBot(this.game, { name: e.name, team: e.team, difficulty: this.cfg.difficulty, outfit: OUTFITS[e.outfit] }); }
  adoptAt(b, was) {
    if (was.sky === 'plane' || was.pos.y < -400) { b.alive = false; this.planBotDrops([b]); return; }
    // on the way down: just on down from where it is
    if (was.sky) { b.planJump(new THREE.Vector3(was.pos.x, 0, was.pos.z), 0); b.startFall(was.pos); b.health = Math.max(1, was.health); return; }
    b.sky = null; b.alive = true; b.onGround = true; b.pos.copy(was.pos); b.aimYaw = was.aimYaw; b.aimPitch = 0; b.health = Math.max(1, was.health); b.armor = was.armor;
    b.vel.set(0, 0, 0); b.state = 'roam'; b.path = null; b.wp = 0; b.repathT = 0; b.lastProgress = b.pos.clone(); b.stuckT = 0; b.crouching = false; b.crouchT = 0; b.sliding = 0; b.burst = 0; b.burstPause = 0; b.nextShot = 0; b.strafeDir = 1; b.strafeT = 0; b.heardT = -99; b.lastSeenT = -99; b.reactT = 0;
    b.soldier.setVisible(true); b.soldier.root.position.copy(b.pos);
    if (was.wdef && was.wdef.id !== 'pistol') b.equipLoot({ weaponId: was.wdef.id, optic: was.optic, rarity: 1 });
  }
  adoptDead(b) { b.alive = false; b.out = true; b.sky = null; b.deathT = this.game.time - 20; b.hiddenBody = true; b.soldier.setVisible(false); }

  createBots() {
    if (this.cfg.net) {
      const list = this.game.net.buildCombatants((e) => this.makeNetBot(e)), real = list.filter((b) => !b.remote);
      if (real.length) this.planBotDrops(real);
      return list;
    }
    const n = this.cfg.bots ?? 19, bots = [];
    const names = [...NAMES].sort(() => Math.random() - 0.5);
    for (let i = 0; i < n; i++) {
      const b = new BRBot(this.game, { name: names[i % names.length], team: 2 + i, difficulty: this.cfg.difficulty, outfit: OUTFITS[OUTFIT_KEYS[i % OUTFIT_KEYS.length]] });
      bots.push(b);
    }
    this.planBotDrops(bots);
    return bots;
  }

  planBotDrops(bots) {
    const F = this.flight, nav = this.game.nav, col = this.game.col;
    const spots = this.def.layout.spots, places = Object.values(this.def.places);
    // every place gets its share of people, the town the biggest one: nobody should be alone on the map or in a crowd
    const near = places.map(() => []);
    for (const s of spots) {
      let best = 0, bd = Infinity;
      places.forEach((p, i) => { const d = Math.hypot(s.x - p.x, s.z - p.z); if (d < bd) { bd = d; best = i; } });
      near[best].push(s);
    }
    const inReach = (p) => {
      const rel = _v.set(p.x, 0, p.z).sub(F.a); rel.y = 0;
      const along = rel.dot(F.dir), lat = Math.abs(rel.dot(_w.set(-F.dir.z, 0, F.dir.x)));
      return along > 40 && along < F.len - 30 && lat < 260;
    };
    const deck = [];
    places.forEach((p, i) => { if (inReach(p) && near[i].length) for (let n = 0, k = p.big ? 5 : Math.ceil(Math.sqrt(p.w * p.d) / 60); n < k; n++) deck.push(i); });
    deck.sort(() => Math.random() - 0.5);
    let dealt = 0;
    for (const b of bots) {
      // somewhere with loot, in reach of the flight line, and with open sky above it
      let target = null, jump = 8;
      const home = deck.length ? near[deck[dealt++ % deck.length]] : spots;
      for (let tries = 0; tries < 30 && !target; tries++) {
        const s = home[(Math.random() * home.length) | 0];
        const rel = _v.set(s.x, 0, s.z).sub(F.a); rel.y = 0;
        const along = rel.dot(F.dir), lat = Math.abs(rel.dot(_w.set(-F.dir.z, 0, F.dir.x)));
        if (along < 40 || along > F.len - 30 || lat > 260) continue;
        const a = Math.random() * 6.28, x = s.x + Math.cos(a) * rand(3, 18), z = s.z + Math.sin(a) * rand(3, 18);
        const y = this.t.heightAt(x, z);
        if (y < 1.2) continue;
        const roof = col.floorBelow(x, z, 0.4, 300, -5);
        if (roof > y + 1.2) continue;
        if (nav.nearest(x, y, z, 3) < 0) continue;
        target = new THREE.Vector3(x, y, z);
        jump = Math.max(3, (along - lat * 0.25) / PLANE_SPEED + rand(-2.5, 1));
      }
      if (!target) target = this.fallbackLanding();
      b.planJump(target, jump);
    }
  }

  fallbackLanding() { return new THREE.Vector3(rand(-14, 14), this.t.heightAt(0, 30), 30 + rand(-3, 3)); }

  spawn() {}
  chooseSpawn() { return { x: 0, y: PLANE_Y, z: 0, yaw: 0 }; }

  startPlayer() {
    const g = this.game, p = g.player, W = g.weapons;
    p.reset(); p.alive = true; p.armor = 0; p.plates = 0;
    p.pos.copy(this.flight.a); p.vel.set(0, 0, 0);
    p.yaw = Math.atan2(-this.flight.dir.x, -this.flight.dir.z); p.pitch = -0.25;
    W.setStartLoadout();
    g.hud.setScope(null);
    W.vm.root.visible = false;
    const mine = this.cfg.net ? OUTFITS[this.cfg.roster.find((r) => r.id === g.net.you).outfit] : null;
    this.avatar = new Soldier(g, mine || OUTFITS.vanguard);
    this.avatar.root.rotation.order = 'YXZ'; // leans with the car
    this.avatar.setWeapon(WEAPONS.pistol, 'iron');
    this.avatar.setVisible(false);
    // in a finisher: never two men in the same clothes in one shot
    this.avatarDark = new Soldier(g, mine || OUTFITS.raven);
    this.avatarDark.setWeapon(WEAPONS.pistol, 'iron');
    this.avatarDark.setVisible(false);
    this.canopy = makeCanopy(); this.canopy.visible = false; g.scene.add(this.canopy);
    this.loops();
    this.hud.show();
    this.hud.banner('WARZONE · 20 SPIELER', '#fff');
    this.hud.hint('[Leertaste] Absprung   ·   [M] Karte');
  }

  loops() {
    const a = this.game.audio;
    this.audioL.plane = a.loop('plane', 0.0);
    this.audioL.wind = a.loop('wind', 0.0);
    this.audioL.engine = a.loop('engine', 0.0);
  }

  get alive() { let n = this.game.player.alive ? 1 : 0; for (const b of this.game.bots) if (!b.out) n++; return n; }
  scores() { return { f: this.alive, e: this.game.player.kills }; }

  onKill() {}

  // ---------------------------------------------------------------- main update
  update(dt) {
    if (this.ended) return;
    const g = this.game, p = g.player;
    this.zone.update(dt);
    this.updatePlane(dt);
    this.loot.update(dt);
    this.updateNetStages(dt);
    // sea moves a little
    if (this.def.sea) { const m = this.def.sea.material.map; m.offset.x += dt * 0.004; m.offset.y += dt * 0.002; }
    // ---- empty vehicles keep rolling
    for (const v of this.vehicles.list) if (v !== this.vehicle) { if (v.netOwner) v.netUpdate(dt); else v.update(dt, null); }
    this.runOver(dt);
    // ---- gas
    this.gasTick -= dt;
    if (this.gasTick <= 0) {
      this.gasTick = 0.5;
      const dmg = this.zone.dps * 0.5;
      if (p.alive && this.playerState !== 'plane' && this.zone.outside(p.pos)) this.gasDamage(p, dmg);
      for (const b of g.bots) if (!b.remote && b.alive && !b.sky && this.zone.outside(b.pos)) this.gasDamage(b, dmg);
      let fighting = 0, hunters = 0;
      for (const b of g.bots) {
        if (!b.alive || !b.target) continue;
        if (b.target.isBot) { if (b.state === 'engage') fighting++; } else hunters++;
      }
      this.botsFighting = fighting; this.hunters = hunters;
      // they fight whenever they meet, but the island shouldn't empty itself before you get to play: ahead of the plan
      // their bullets hardly hurt each other, behind it they hurt a bit more
      const ahead = this.ahead = (this.alive - (g.player.alive ? 1 : 0)) - this.planned(this.zone.elapsed);
      this.botDamage = this.zone.botDmg * (ahead >= 0 ? 1 + Math.min(ahead, 3) * 0.2 : Math.max(0.12, 1 + ahead * 0.45));
    }
    const gas = p.alive && this.playerState !== 'plane' && this.zone.outside(p.pos);
    this.hud.setGas(gas);
    // ---- map
    if (g.input.pressed('map')) this.mapOpen = !this.mapOpen;
    this.hud.update(dt);
    // ---- on foot: pick things up, plates
    if (p.alive && this.playerState === 'ground') this.updateOnFoot(dt);
    if (p.alive && (this.playerState === 'ground' || this.playerState === 'vehicle')) this.updateVehicleUse(dt);
    if (this.watchOn) this.updateWatching(dt);
    // ---- the end
    this.checkEnd();
    this.timeLeft = this.zone.countdown;
  }

  // how many bots should still be around after t seconds
  planned(t) {
    for (let i = 1; i < PLAN.length; i++) if (t < PLAN[i][0]) { const [a, n] = PLAN[i - 1], [e, m] = PLAN[i]; return n + (m - n) * (t - a) / (e - a); }
    return 0;
  }

  // far away from the player the plan paces the match, wherever you could be watching, a hit is a hit
  botDamageOn(v) { return v.seen ? Math.max(this.botDamage, SEEN_DMG * (this.ahead < -5 ? 0.35 : this.ahead < -3 ? 0.6 : 1)) : this.botDamage; }

  gasDamage(c, dmg) {
    const g = this.game;
    if (this.untouchable(c)) return;
    c.health -= dmg; c.lastDamage = g.time;
    if (c === g.player) { g.audio.play('hurt', { vol: 0.32, rate: 0.85 }); g.hud.dmgFlash = Math.min(0.55, g.hud.dmgFlash + 0.14); }
    if (c.health <= 0 && !(c === g.player && this.playerGoesDown(null, null))) g.kill(c, null, { part: 'chest', weapon: { name: 'GAS', damage: [20, 20] }, zone: true, dir: new THREE.Vector3(0, -0.4, 1).normalize() });
  }

  checkEnd() {
    const g = this.game, p = g.player;
    if (this.cfg.net) {
      // the room says when it is over, for you it is now: watch the others, or back to the lobby
      if (!p.alive && !this.netDead && g.time > this.deadAt + 3.6) this.showNetDead();
      return;
    }
    if (!p.alive) {
      if (g.time > this.deadAt + 3.6 && !this.ended) this.finish(false);
      return;
    }
    let others = 0; for (const b of g.bots) if (!b.out) others++;
    if (others === 0 && !this.finisher) this.finish(true);
  }

  onBotOut(b) {
    this.outOrder++;
    // whoever won that fight catches its breath and looks through the pockets first
    const k = b.lastAttacker;
    if (k && k.isBot && !k.out) { k.peaceUntil = this.game.time + (k.seen ? rand(1, 2) : rand(7, 13)); k.target = null; k.targetVisible = false; k.lastSeen = null; if (k.state === 'engage' || k.state === 'chase') { k.state = 'roam'; k.path = null; } }
  }

  onPlayerDown(killer) {
    const p = this.game.player;
    this.stats.placed = this.alive + 1;
    this.deadAt = this.game.time;
    if (this.vehicle) this.leaveVehicle(true);
    this.closeChute();
    if (this.finisher) this.endFinisher();
    this.finishing.delete(p);
    p.downed = false;
    this.hud.setDowned(null);
    this.playerState = 'dead';
    document.getElementById('death-timer').textContent = 'PLATZ ' + this.stats.placed + ' VON ' + (this.cfg.net ? this.cfg.roster.length : 20);
    // what you had is there for whoever finds it
    if (this.cfg.net) {
      const W = this.game.weapons, L = this.loot;
      for (const s of W.slots) if (s && s.def.id !== 'pistol') L.drop({ kind: 'weapon', weaponId: s.def.id, optic: s.optic, rarity: s.def.rarity || 0, mag: s.mag, reserve: s.reserve }, p.pos.x, p.pos.y, p.pos.z);
      if (p.plates > 0) L.drop({ kind: 'plate', count: p.plates }, p.pos.x, p.pos.y, p.pos.z);
    }
    void killer;
  }

  finish(won) {
    if (this.ended) return;
    this.ended = true;
    const g = this.game;
    this.stopLoops();
    this.hud.setGas(false);
    g.state = 'ended';
    g.input.unlock();
    document.getElementById('death-screen').classList.add('hidden');
    this.hud.result(won, won ? 1 : this.stats.placed, g.player.kills);
  }

  // ---- out of it in a network match, and the others go on
  showNetDead() {
    const g = this.game;
    this.netDead = true;
    g.input.unlock();
    document.getElementById('death-screen').classList.add('hidden');
    this.hud.result(false, this.stats.placed, g.player.kills, () => this.startWatching());
  }

  startWatching() {
    document.getElementById('menu').innerHTML = '';
    this.watchOn = true;
    this.nextWatched();
    this.game.input.lock();
  }

  // the people first, then whoever else is still around
  nextWatched() {
    const all = this.game.bots.filter((b) => b.alive && !b.out && b.sky !== 'plane' && b.pos.y > -400);
    const list = [...all.filter((b) => !b.isBot), ...all.filter((b) => b.isBot)];
    this.watching = list.length ? list[(list.indexOf(this.watching) + 1) % list.length] : null;
    this.watchWait = 1.6; this.watchCut = true;
    this.hud.setWatching(this.watching ? this.watching.name : '');
  }

  updateWatching(dt) {
    const c = this.watching;
    if (this.game.input.firePressed) { this.nextWatched(); return; }
    if (c && c.alive && !c.out && this.game.bots.includes(c)) return;
    this.watchWait -= dt;
    if (this.watchWait <= 0) this.nextWatched();
  }

  watchCam(cam, dt) {
    const c = this.watching;
    if (!c) return;
    // over the shoulder, and never through a wall
    const tx = c.pos.x, ty = c.pos.y + 1.5, tz = c.pos.z, yaw = c.aimYaw || 0;
    const dx = Math.sin(yaw) * 3.1, dy = 0.55, dz = Math.cos(yaw) * 3.1, L = Math.hypot(dx, dy, dz);
    const hit = this.game.col.raycast(tx, ty, tz, dx / L, dy / L, dz / L, L, this.watchHit || (this.watchHit = {}));
    const k = hit ? Math.max(0.12, (hit.t - 0.25) / L) : 1;
    _w.set(tx + dx * k, ty + dy * k, tz + dz * k);
    if (this.watchCut) { cam.position.copy(_w); this.watchCut = false; } else cam.position.lerp(_w, 1 - Math.exp(-dt * 9));
    cam.lookAt(tx, ty, tz);
  }

  // ---- the room says it is over
  netFinish(won, m) {
    if (this.ended) return;
    if (this.finisher) this.endFinisher();
    if (this.watchOn) this.hud.setWatching(null);
    this.ended = true;
    const g = this.game;
    this.stopLoops();
    this.hud.setGas(false);
    g.state = 'ended';
    g.input.unlock();
    document.getElementById('death-screen').classList.add('hidden');
    const place = won ? 1 : this.stats.placed || 2;
    g.lobby.lastBoard = { title: won ? 'Letztes Match: gewonnen' : 'Letztes Match: Platz ' + place, rows: m.board };
    this.hud.result(!!won, place, g.player.kills);
  }

  // ---- everything the network has to say in a Warzone match
  get netTime() { return this.zone.elapsed; }
  netCatchUp(diff) {
    if (diff > 0) { this.zone.update(diff); this.planeT += diff; } else { this.zone.time = Math.max(0, this.zone.time + diff); this.zone.elapsed += diff; }
  }
  onItemLost() { this.hud.hint('Das war schon weg', 1.2); }

  onNetEvent(m) {
    const g = this.game, L = this.loot, V = this.vehicles.list;
    switch (m.k) {
      case 'chest': L.netChest(m.i, m.items); break;
      case 'item': L.netItem(m); break;
      case 'veh': { const v = V[m.i]; if (v && v !== this.vehicle) v.netState(m.s, g.net.byId.get(m.from)); break; }
      case 'vout': { const v = V[m.i]; if (v && v !== this.vehicle) v.netOut(); break; }
      case 'vdmg': { const v = V[m.i]; if (v && !v.dead) v.damage(m.a, null); break; }
      case 'fin': this.netFinisher(m); break;
      default: break;
    }
  }

  // Someone started a scene. Everybody plays it with the bodies he has: the one in it from the inside, everyone else from wherever he stands.
  netFinisher(m) {
    const g = this.game, net = g.net, F = FINISHERS[m.f], atk = net.byId.get(m.by || m.from), mine = m.v === net.you, v = mine ? g.player : net.byId.get(m.v);
    if (!F || !atk || !atk.soldier || !v) return;
    if (!mine && v.remote === undefined && !v.soldier) return;
    // (someone else got there first, the message crossed his)
    if (!v.alive || v.out || (mine ? this.finisher && this.finisher.victimView : v.scripted)) return;
    const origin = new THREE.Vector3(m.o[0], m.o[1], m.o[2]), tilt = new THREE.Quaternion(m.tilt[0], m.tilt[1], m.tilt[2], m.tilt[3]);
    // (the gun the scene asks for, unless it is his own)
    if (F.gun && F.gun !== 'own') atk.soldier.setWeapon(WEAPONS[F.gun], 'iron');
    if (mine) {
      const p = g.player, W = g.weapons, av = atk.outfit === OUTFITS.vanguard ? this.avatarDark : this.avatar;
      if (this.finisher) this.endFinisher(); // (one of your own is cut short)
      if (this.vehicle) this.leaveVehicle(true);
      W.cancelReload(); W.vm.stop(); W.state = 'idle'; W.adsAmount = 0; W.wantsAds = false; W.lunge = null;
      p.sprinting = false; p.tac = false; p.mount = null; p.vel.set(0, 0, 0);
      this.poseAvatar(av);
      this.plateT = 0; this.hud.setProgress(0); this.hud.setDowned(null);
      const stage = new Stage(g, F, atk.soldier, av, origin, m.yaw, tilt, m.t0, m.turn);
      stage.staysOut = true;
      if (m.by) stage.startFrom(atk.pos);
      this.addProp(stage, F);
      atk.scripted = true;
      const cam = g.engine.camera;
      stage.pose(0);
      this.finisher = { F, b: { soldier: av, alive: true }, av: atk.soldier, atk, stage, fired: 0, from: { pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov }, spurt: 0, spurtT: 0, killed: false, victimView: true };
      const S = this.finisher;
      while (S.fired < F.events.length && F.events[S.fired][0] < m.t0) { const E = F.events[S.fired++]; if (E[1] === 'prop') this.finisherEvent(E, S); }
      this.playerState = 'finisher';
      this.hud.setFocus(null, W); this.hud.setVehiclePrompt(null); this.hud.setPromptText('');
      this.hud.setCine(true, F.name);
      this.loot.root.visible = false;
      g.audio.play('pouch', { vol: 0.7 });
      return;
    }
    // ---- from the outside. The one who runs a bot stops it as well: in the scene or doing it, and then it is up to him to say when it is over.
    if (atk.soldier === v.soldier) return;
    const byBot = atk.isBot && !atk.remote;
    v.scripted = true; atk.scripted = true;
    if (!v.remote) { v.vel.set(0, 0, 0); v.path = null; v.target = null; v.crouching = false; v.mantling = null; v.sliding = 0; v.prone = false; }
    if (byBot) this.holdBot(atk);
    const stage = new Stage(g, F, atk.soldier, v.soldier, origin, m.yaw, tilt, m.t0, m.turn);
    stage.camera = () => {};
    // (a bot walks into it from wherever it stands)
    if (m.by) { stage.staysOut = true; stage.startFrom(atk.pos); }
    this.addProp(stage, F);
    const S = { F, b: v, av: atk.soldier, atk, stage, fired: 0, spurt: 0, spurtT: 0, spect: true, killed: false, byBot };
    while (S.fired < F.events.length && F.events[S.fired][0] < m.t0) { const E = F.events[S.fired++]; if (E[1] === 'prop') this.finisherEvent(E, S); }
    (this.netStages || (this.netStages = [])).push(S);
  }

  addProp(stage, F) {
    if (!F.prop) return;
    const g = this.game, P = makeProp(F.prop);
    g.scene.add(P);
    P.visible = false;
    stage.prop = P; stage.ownProp = true;
  }

  updateNetStages(dt) {
    const list = this.netStages;
    if (!list || !list.length) return;
    for (let i = list.length - 1; i >= 0; i--) {
      const S = list[i], st = S.stage, F = S.F;
      st.t += dt;
      // (he is gone, or someone else got there first: the scene closes from here)
      if (S.byBot && !S.b.alive && !S.killed) { S.killed = true; st.interrupt(); }
      st.pose(dt);
      if (!S.b.soldier.dead) S.b.soldier.updateWeaponDrop(dt);
      if (S.byBot) { S.av.pelvis.getWorldPosition(_w); S.atk.pos.set(_w.x, st.o.y, _w.z); }
      while (S.fired < F.events.length && st.t >= F.events[S.fired][0]) this.finisherEvent(F.events[S.fired++], S);
      if (st.t < st.exit + 0.6) continue;
      // back to being themselves
      list.splice(i, 1);
      if (st.prop && st.prop.parent) st.prop.parent.remove(st.prop);
      if (!S.atk.alive) S.atk.scripted = false; // (he died while it ran: just a body)
      else if (S.byBot) this.releaseBot(st, S.atk);
      else { S.atk.scripted = false; S.atk.soldier.resetPose(); S.atk.soldier.setWeapon(S.atk.wdef, S.atk.optic); }
      if (S.b.alive && !S.b.out) { S.b.scripted = false; S.b.soldier.resetPose(); if (!S.b.soldier.weapon) S.b.soldier.setWeapon(S.b.wdef, S.b.optic === 'iron' ? S.b.wdef.optics[0] : S.b.optic); S.b.soldier.weaponDrop = null; } else S.b.scripted = false;
    }
  }

  stopLoops() { for (const k of Object.keys(this.audioL)) { if (this.audioL[k]) this.audioL[k].stop(); this.audioL[k] = null; } }

  dispose() {
    this.stopLoops();
    const g = this.game;
    g.slowmo = 0;
    this.hud.setCine(false);
    if (this.props) for (const k of Object.keys(this.props)) if (this.props[k].parent) this.props[k].parent.remove(this.props[k]);
    this.zone.dispose(); this.loot.dispose();
    for (const v of this.vehicles.list) v.dispose();
    if (this.plane) g.scene.remove(this.plane);
    if (this.canopy) g.scene.remove(this.canopy);
    if (this.avatar) this.avatar.dispose();
    if (this.avatarDark) this.avatarDark.dispose();
    this.hud.dispose();
  }

  // ---------------------------------------------------------------- plane
  updatePlane(dt) {
    const g = this.game, F = this.flight;
    if (!this.planeLife) return;
    this.planeT += dt;
    const s = this.planeT * PLANE_SPEED;
    this.plane.position.copy(F.a).addScaledVector(F.dir, s);
    this.plane.tick(dt);
    if (this.audioL.plane) {
      const d = this.plane.position.distanceTo(g.engine.camera.position);
      this.audioL.plane.set(this.playerState === 'plane' ? 0.5 : clamp(1 - d / 900, 0, 1) * 0.3, 1);
    }
    // bots leave one by one
    for (const b of g.bots) if (!b.remote && b.sky === 'plane' && this.planeT >= b.jumpT) { b.startFall(this.rampEdge()); b.vel.addScaledVector(F.dir, PLANE_SPEED * 0.85); }
    // out of island: everyone still inside has to go
    if (s > F.len - 40 && this.playerState === 'plane') this.jump();
    if (s > F.len + 900) { g.scene.remove(this.plane); this.planeLife = false; }
  }

  // where you leave it: the far end of the ramp
  rampEdge() { return this.plane.localToWorld(_rampAt.copy(this.plane.ramp)); }

  // ---------------------------------------------------------------- who has the controls
  get controlsPlayer() { const s = this.playerState; return s === 'plane' || s === 'fall' || s === 'chute' || s === 'vehicle' || s === 'downed' || s === 'finisher'; }
  get cameraOverride() { const s = this.playerState; return s === 'plane' || s === 'fall' || s === 'vehicle' || s === 'finisher' || this.enterT > 0 || this.camBlend > 0; }
  get hideViewmodel() { const s = this.playerState; return s === 'plane' || s === 'vehicle' || s === 'finisher' || this.enterT > 0 || this.camBlend > CAM_INTO_FALL * 0.5; }
  get hideBody() { const s = this.playerState; return s === 'plane' || s === 'fall' || s === 'chute' || s === 'vehicle' || s === 'downed' || s === 'finisher' || this.enterT > 0; }

  updatePlayer(dt, inp) {
    const s = this.playerState;
    if (s === 'plane') { if (inp.pressed('jump')) this.jump(); else this.game.player.pos.copy(this.plane.position).y -= 2; }
    else if (s === 'fall') this.updateFall(dt, inp);
    else if (s === 'chute') this.updateChute(dt, inp);
    else if (s === 'vehicle') this.updateDriving(dt, inp);
    else if (s === 'downed') this.updateDowned(dt, inp);
    else if (s === 'finisher') this.updateFinisher(dt);
  }

  jump() {
    const g = this.game, p = g.player;
    this.playerState = 'fall';
    // over the edge of the ramp, at first still as fast as the plane: the air is what slows you down
    p.pos.copy(this.rampEdge());
    p.vel.copy(this.flight.dir).multiplyScalar(PLANE_SPEED); p.vel.y = -1;
    this.camBlend = CAM_INTO_FALL; this.fallFov = g.engine.camera.fov;
    this.avatar.resetPose(); this.avatar.setVisible(true);
    g.weapons.stow();
    p.onGround = false;
    g.audio.play('dive', { vol: 0.6, rate: 0.8 });
    this.hud.hint('[W] Sturzflug   ·   [Leertaste] Gleiter öffnen');
  }

  groundBelow(p) {
    const y = this.game.col.floorBelow(p.pos.x, p.pos.z, 0.3, p.pos.y + 0.2, -6);
    return isFinite(y) ? y : 0;
  }

  clampWorld(p) {
    const R = Math.hypot(p.pos.x, p.pos.z);
    if (R > WORLD_R) {
      const k = WORLD_R / R; p.pos.x *= k; p.pos.z *= k;
      const nx = p.pos.x / WORLD_R, nz = p.pos.z / WORLD_R, vn = p.vel.x * nx + p.vel.z * nz;
      if (vn > 0) { p.vel.x -= nx * vn; p.vel.z -= nz * vn; }
    }
  }

  readMove(inp, out) {
    let fx = 0, fz = 0;
    if (inp.down('forward')) fz += 1; if (inp.down('back')) fz -= 1;
    if (inp.down('right')) fx += 1; if (inp.down('left')) fx -= 1;
    out.x = fx; out.y = fz;
    return out;
  }

  updateFall(dt, inp) {
    const g = this.game, p = g.player, m = this.readMove(inp, p.moveInput);
    p.eyeH = 1.6;
    if (this.camBlend > 0) this.camBlend = Math.max(0, this.camBlend - dt);
    // (the arms come up into the picture once the camera is nearly there)
    g.weapons.vm.updateFree(dt, 'fall', g.time, clamp(-p.vel.y / 40, 0.3, 1.6), smoother(clamp(1.9 - (this.camBlend / CAM_INTO_FALL) * 3.8, 0, 1)));
    const agl = p.pos.y - this.groundBelow(p);
    // W dives along the view; looking down makes it fast, S brakes
    const fwd = p.forwardVec(_v), right = p.rightVec(_w);
    const pitchDown = clamp(-p.pitch / 1.2, 0, 1);
    const hs = m.y > 0 ? lerp(34, 22, pitchDown) : m.y < 0 ? 6 : 12;
    const vs = m.y > 0 ? lerp(42, 66, pitchDown) : m.y < 0 ? 32 : 40;
    const tx = fwd.x * hs + right.x * m.x * 12, tz = fwd.z * hs + right.z * m.x * 12;
    const k = Math.min(1, dt * 1.6);
    p.vel.x += (tx - p.vel.x) * k; p.vel.z += (tz - p.vel.z) * k;
    p.vel.y += (-vs - p.vel.y) * Math.min(1, dt * 2.2);
    p.pos.addScaledVector(p.vel, dt);
    this.clampWorld(p);
    p.speedH = Math.hypot(p.vel.x, p.vel.z);
    this.windGain = clamp(-p.vel.y / 60, 0, 1) * 0.9;
    // from outside you still see yourself go, until the camera has caught up with you
    const seen = this.camBlend > 0 && g.engine.camera.position.distanceTo(p.pos) > 6;
    this.avatar.setVisible(seen);
    if (seen) this.avatar.update(dt, { yaw: Math.atan2(-p.vel.x, -p.vel.z), pitch: 0, speed: p.speedH, moveAngle: 0, fall: true, floorY: p.pos.y - 200 }, p.pos);
    if (agl <= FALL_DEPLOY + Math.max(0, -p.vel.y - 40) * 1.4) this.deploy(true);
    else if (inp.pressed('jump') && this.camBlend <= 0) { if (agl <= FALL_DEPLOY_MAX) this.deploy(false); else this.hud.hint('Zu hoch: Gleiter öffnet erst unter ' + FALL_DEPLOY_MAX + ' m', 1.6); }
    this.hud.setAltitude(agl);
    if (this.audioL.wind) this.audioL.wind.set(this.windGain, 0.9 + clamp(-p.vel.y / 80, 0, 0.5));
  }

  deploy(auto) {
    const g = this.game, p = g.player, W = g.weapons;
    this.playerState = 'chute';
    this.camBlend = 0; this.avatar.setVisible(false);
    if (!W.stowed) W.stow();
    // close to the ground there is no time to look for the handle
    this.canopyT = OPEN_PULL - clamp((p.pos.y - this.groundBelow(p)) / 150, 0.08, OPEN_PULL); this.openStep = 0;
    this.canopy.visible = false; openCanopy(this.canopy, 0);
    g.fovKick = this.openFov = g.engine.camera.fov - g.engine.hfovToV(g.settings.fov);
    this.openLook = clamp(0.62 - p.pitch, 0, 1.25);
    p.eyeH = 1.62; p.stance = 'stand'; p.mode = 'normal'; p.onGround = false; p.gliding = true; p.sprinting = false; p.tac = false; p.mount = null;
    // only one weapon works under the canopy: the sidearm, once you pull it
    W.lockSlot = 1;
    this.hud.hint('[Q] oder [2] Pistole ziehen   ·   [Strg] Gleiter kappen', 4);
    void auto;
  }

  updateChute(dt, inp) {
    const g = this.game, p = g.player, W = g.weapons, m = this.readMove(inp, p.moveInput);
    const fwd = p.forwardVec(_v), right = p.rightVec(_w);
    if (this.camBlend > 0) this.camBlend = Math.max(0, this.camBlend - dt);
    // ---- the opening: the hand goes for the handle, the pack lets go, the lines run out, it fills, and only then does it carry you
    const T = (this.canopyT += dt), o = smoother(clamp((T - OPEN_PULL) / OPEN_BLOOM, 0, 1));
    this.canopy.visible = T > OPEN_PULL;
    openCanopy(this.canopy, (T - OPEN_PULL) / OPEN_BLOOM);
    if (this.openStep === 0 && T > OPEN_PULL - 0.16) { this.openStep = 1; g.audio.play('pouch', { vol: 0.7 }); }
    if (this.openStep === 1 && T > OPEN_PULL) { this.openStep = 2; g.audio.play('slide', { vol: 0.7, rate: 0.7 }); }
    if (this.openStep === 2 && T > OPEN_PULL + OPEN_BLOOM * 0.5) { this.openStep = 3; g.audio.play('dive', { vol: 0.55, rate: 0.6 }); p.landSpring.impulse(-1.5); g.shake.add(0.08); } // it catches the air
    if (T < OPEN_END) {
      // a look down at the hand, then the body swings upright under it and the view with it, up at the canopy and back
      const ease = (x) => smoother(clamp(x, 0, 1));
      p.pitchKick.target = -0.07 * ease(T / OPEN_PULL) * (1 - ease((T - OPEN_PULL) / 0.3)) + this.openLook * ease((T - OPEN_PULL) / 0.5) * (1 - ease((T - OPEN_PULL - 0.85) / 0.75));
      g.fovKick = this.openFov * (1 - o);
    } else p.pitchKick.target = 0;
    // gentle glide: W pulls ahead and sinks a bit faster, S flares, nothing keeps drifting
    const hs = m.y > 0 ? 17 : m.y < 0 ? 4 : 7.5;
    const vs = m.y > 0 ? 10 : m.y < 0 ? 5.2 : 7;
    const tx = fwd.x * hs + right.x * m.x * 9, tz = fwd.z * hs + right.z * m.x * 9;
    const k = Math.min(1, dt * 1.7 * o);
    p.vel.x += (tx - p.vel.x) * k; p.vel.z += (tz - p.vel.z) * k;
    p.vel.y += (-vs - p.vel.y) * Math.min(1, dt * 3.2 * o);
    const steps = 2;
    let land = false;
    for (let i = 0; i < steps; i++) {
      const res = moveCharacter(g.col, p.pos, p.vel, dt / steps, 0.32, 1.8, false);
      if (res.ground) { land = true; break; }
    }
    this.clampWorld(p);
    p.speedH = Math.hypot(p.vel.x, p.vel.z);
    // hang and swing: lean into turns, the canopy trails behind the movement
    p.rollSpring.target = -m.x * 7;
    p.rollSpring.update(dt); p.landSpring.update(dt); p.pitchKick.update(dt);
    p.stepOffset = damp(p.stepOffset, 0, 14, dt);
    this.canopy.position.set(p.pos.x, p.pos.y + 0.1, p.pos.z);
    this.canopy.rotation.y = p.yaw;
    const wing = this.canopy.userData.pivot;
    wing.rotation.z = -m.x * 0.14;
    wing.rotation.x -= clamp(p.speedH / 40, 0, 0.3) * 0.5;
    if (this.audioL.wind) this.audioL.wind.set(lerp(this.windGain || 0, 0.28 + p.speedH * 0.01, o), lerp(1.1, 0.75, o));
    this.hud.setAltitude(p.pos.y - this.groundBelow(p));
    // the gun works up here like everywhere else, once it is out
    if (W.stowed) {
      if (T < 1.2) W.vm.updateFree(dt, 'deploy', g.time, T); else W.vm.updateFree(dt, 'chute', g.time);
      if (T >= 1.2 && (inp.pressed('weapon1') || inp.pressed('weapon2') || inp.pressed('swap') || inp.wheel !== 0)) { W.unstow(1); this.hud.hint('[Linke Maustaste] Schießen   ·   [Strg] Gleiter kappen', 3); }
    } else W.update(dt, inp, p);
    if (inp.pressed('crouch') && p.pos.y - this.groundBelow(p) > 30) { this.cutChute(); return; }
    if (land) this.landChute();
  }

  cutChute() {
    const g = this.game, p = g.player, W = g.weapons;
    this.closeChute();
    this.playerState = 'fall';
    this.camBlend = 0; this.fallFov = g.engine.camera.fov; p.pitchKick.target = 0;
    W.lockSlot = -1;
    p.gliding = false;
    if (!W.stowed) W.stow();
    g.audio.play('slide', { vol: 0.5, rate: 1.2 });
    this.hud.hint('[Leertaste] Gleiter öffnen');
  }

  closeChute() {
    if (this.canopy) this.canopy.visible = false;
    if (this.audioL.wind) this.audioL.wind.set(0, 1);
    this.game.player.gliding = false; this.game.player.pitchKick.target = 0;
  }

  landChute() {
    const g = this.game, p = g.player, W = g.weapons;
    this.closeChute();
    this.camBlend = 0; this.avatar.setVisible(false); p.pitchKick.target = 0;
    this.playerState = 'ground';
    W.lockSlot = -1;
    // back on your feet: whatever you carried comes back into the hands
    if (W.stowed) W.unstow(W.prevCur !== undefined && W.slots[W.prevCur] ? (W.prevCur === 1 && W.slots[0] ? 0 : W.prevCur) : 1);
    p.onGround = true; p.airTime = 0; p.groundTime = 0;
    p.vel.y = 0; p.vel.x *= 0.4; p.vel.z *= 0.4;
    p.onLand(9);
    this.safeUntil = g.time + 9; // a moment to find a gun before anyone cares
    g.events.emit('land', { strength: 0.5, entity: p });
    this.hud.setAltitude(null);
    this.hud.hint('Waffen suchen! [F] Aufheben / Kiste öffnen   ·   [G] Platte einsetzen', 5);
  }

  // ---------------------------------------------------------------- on the ground
  updateOnFoot(dt) {
    const g = this.game, p = g.player, inp = g.input, W = g.weapons;
    // falling from high enough: the canopy can open
    if (!p.onGround && p.mode === 'normal' && p.vel.y < -1.5) {
      const drop = p.pos.y - this.groundBelow(p);
      if (drop >= CHUTE_MIN_DROP) {
        if (inp.pressed('jump')) { this.deploy(false); this.hud.setPromptText(''); return; }
        this.hud.setPromptText('[Leertaste] Gleiter öffnen');
      } else this.hud.setPromptText('');
    } else {
      // whoever can be finished right now
      if ((this.finScan = (this.finScan || 0) - dt) <= 0) {
        this.finScan = 0.12;
        const S = p.onGround && this.finisherSetup(p);
        this.finNear = !!S && FINISHERS.some((f) => !!f.prone === !!S.low && this.sceneFits(f, S.best.pos, S.floor, S.yaw));
      }
      this.hud.setPromptText(this.finNear ? '[V] FINISHER' : '');
    }
    // ---- what's in front of us
    const cam = g.engine.camera;
    cam.getWorldDirection(_v);
    const f = this.loot.focus(cam.position, _v, this.hud.lookedAt);
    this.hud.setFocus(f, W);
    this.loot.highlight(f && f.o, f && f.kind);
    if (f && !f.far && inp.pressed('interact') && this.plateT <= 0) {
      if (f.kind === 'chest') this.loot.openChest(f.o, p);
      else this.pickUp(f.o);
    }
    // ---- armor plate
    if (this.plateT > 0) {
      this.plateT -= dt;
      this.hud.setProgress(1 - this.plateT / this.plateDur, 'PLATTE EINSETZEN');
      if (this.plateT <= 0) { W.plateDone(); this.hud.setProgress(0); }
    } else if (inp.pressed('plate')) {
      if (p.plates <= 0) this.hud.hint('Keine Platten', 1.2);
      else if (p.armor >= MAX_ARMOR) this.hud.hint('Rüstung ist voll', 1.2);
      else if (W.startPlate()) this.plateDur = this.plateT = PLATE_TIME;
    }
  }

  // the moment in the animation when the plate goes home
  plateIn() {
    const g = this.game, p = g.player;
    if (p.plates <= 0) return;
    p.plates--; p.armor = Math.min(MAX_ARMOR, p.armor + PLATE_ARMOR);
    g.audio.play('magIn', { vol: 0.9, rate: 0.7 }); g.audio.play('thud', { vol: 0.4, rate: 1.4 });
    g.shake.add(0.1);
    p.landSpring.impulse(-0.7);
  }

  pickUp(it) {
    const g = this.game, p = g.player, W = g.weapons;
    if (it.kind === 'plate') {
      if (p.plates >= MAX_PLATES) { this.hud.hint('Mehr als ' + MAX_PLATES + ' Platten passen nicht', 1.4); return; }
      p.plates = Math.min(MAX_PLATES, p.plates + (it.count || 1));
      g.audio.play('pouch', { vol: 0.6 }); g.audio.play('magTouch', { vol: 0.4 });
      this.hud.pop('+ PLATTE');
      this.loot.removeItem(it);
      return;
    }
    if (it.kind === 'ammo') {
      for (const s of W.slots) if (s) s.reserve += s.def.mag * 2;
      g.audio.play('pouch', { vol: 0.6 }); g.audio.play('magTouch', { vol: 0.5 });
      this.hud.pop('+ MUNITION');
      this.loot.removeItem(it);
      return;
    }
    const old = W.pickup(it);
    if (old) {
      const d = this.loot.drop({ kind: 'weapon', weaponId: old.def.id, optic: old.optic, rarity: old.def.rarity || 0, mag: old.mag, reserve: old.reserve }, p.pos.x, p.pos.y, p.pos.z, p.yaw);
      d.claimed = p;
    }
    g.audio.play('chargeBack', { vol: 0.5 }); g.audio.play('magTouch', { vol: 0.4 });
    this.hud.pop(RARITY[it.rarity].name + ' · ' + WEAPONS[it.weaponId].name, RARITY[it.rarity].color);
    this.loot.removeItem(it);
  }

  // ---------------------------------------------------------------- down, not out
  // Lethal damage on foot puts you on the ground instead; there the same damage counts from a small pool of hit points.
  playerGoesDown(attacker, info) {
    const g = this.game, p = g.player, W = g.weapons, s = this.playerState;
    if (s !== 'ground' && s !== 'vehicle' && s !== 'finisher') return false;
    if (this.vehicle) this.leaveVehicle(true);
    if (this.finisher) this.endFinisher();
    const n = Math.min(this.downs, BLEED_OUT.length - 1);
    this.downs++;
    this.playerState = 'downed';
    this.bleedRate = DOWN_HP / BLEED_OUT[n]; this.reviveTime = REVIVE_TIME[n]; this.reviveK = 0; this.crawlT = 0; this.reviveLock = 0;
    p.downed = true; p.health = DOWN_HP; p.armor = 0; p.lastDamage = g.time;
    p.stance = 'prone'; p.mode = 'normal'; p.supine = false; p.proneYaw = p.yaw; p.proneW = 1; p.sprinting = false; p.tac = false; p.mount = null; p.mantle = null;
    p.vel.x *= 0.3; p.vel.z *= 0.3;
    W.cancelReload(); W.vm.stop(); W.state = 'idle'; W.adsAmount = 0; W.wantsAds = false; W.firingRecently = false; W.lunge = null;
    this.plateT = 0; this.hud.setProgress(0);
    // whoever was shooting often thinks it is done: that is your chance to crawl away, unless one of them comes over to finish it
    this.letGo(p, 0.6);
    g.audio.play('hurt', { vol: 0.9, rate: 0.7 });
    g.shake.add(0.5);
    p.landSpring.impulse(-3);
    this.hud.setFocus(null, W); this.hud.setVehiclePrompt(null); this.hud.setPromptText('');
    this.hud.setDowned({ hp: 1, revive: 0, holding: false });
    void attacker; void info;
    return true;
  }

  updateDowned(dt, inp) {
    const g = this.game, p = g.player, W = g.weapons, m = this.readMove(inp, p.moveInput);
    const reviving = inp.down('interact') && p.onGround;
    // ---- crawl
    const fwd = p.forwardVec(_v), right = p.rightVec(_w);
    const sp = reviving ? 0 : (m.y > 0 ? 1.25 : m.y < 0 ? 0.7 : 0), side = reviving ? 0 : m.x * 0.7;
    const tx = fwd.x * sp + right.x * side, tz = fwd.z * sp + right.z * side, k = Math.min(1, dt * 8);
    p.vel.x += (tx - p.vel.x) * k; p.vel.z += (tz - p.vel.z) * k;
    p.vel.y -= 19.5 * dt;
    const res = moveCharacter(g.col, p.pos, p.vel, dt, 0.32, HULL.prone, p.onGround);
    p.onGround = res.ground; if (res.ground) p.vel.y = 0;
    p.speedH = Math.hypot(p.vel.x, p.vel.z);
    p.proneYaw = p.yaw; p.proneW = 1;
    g.separate(p);
    this.clampWorld(p);
    // ---- low, swaying view
    p.eyeH = damp(p.eyeH, 0.42, 7, dt);
    this.crawlT += p.speedH * dt * 3.4;
    p.rollSpring.target = Math.sin(this.crawlT) * (p.speedH > 0.2 ? 4 : 0) + 3;
    p.rollSpring.update(dt); p.landSpring.update(dt); p.pitchKick.update(dt);
    p.stepOffset = damp(p.stepOffset, Math.abs(Math.sin(this.crawlT)) * 0.03, 10, dt);
    if (p.speedH > 0.3 && Math.floor(this.crawlT / Math.PI) !== this.crawlStep) { this.crawlStep = Math.floor(this.crawlT / Math.PI); g.audio.play('pouch', { vol: 0.28, rate: 0.7 }); }
    W.vm.updateFree(dt, reviving ? 'revive' : 'crawl', reviving ? g.time : this.crawlT, Math.min(1, p.speedH));
    // ---- bleeding out, the self revive
    p.health -= this.bleedRate * dt * (reviving ? 0.5 : 1);
    if (this.reviveLock > 0) this.reviveLock -= dt;
    if (reviving && this.reviveLock <= 0) {
      if (this.reviveK === 0) g.audio.play('stim', { vol: 0.8 });
      this.reviveK += dt / this.reviveTime;
    } else if (!reviving) this.reviveK = Math.max(0, this.reviveK - dt * 0.08);
    this.hud.setDowned({ hp: clamp(p.health / DOWN_HP, 0, 1), revive: this.reviveK, holding: reviving });
    if (this.reviveK >= 1) { this.selfRevive(); return; }
    if (p.health <= 0) g.kill(p, null, { part: 'chest', weapon: { name: 'VERBLUTET', damage: [20, 20] }, zone: true, dir: new THREE.Vector3(0, -0.4, 1).normalize() });
  }

  selfRevive() {
    const g = this.game, p = g.player, W = g.weapons;
    this.playerState = 'ground';
    p.downed = false; p.health = 75; p.armor = 0; p.lastDamage = g.time;
    p.stance = p.canStand('crouch') ? 'crouch' : 'prone'; p.proneW = 0; p.supine = false;
    p.rollSpring.target = 0;
    this.hud.setDowned(null);
    g.audio.play('stim', { vol: 0.9, rate: 0.8 });
    W.vm.endFree();
    W.equip(false);
    this.hud.hint('Wieder auf den Beinen', 2);
  }

  // ---------------------------------------------------------------- finishers
  // Who a melee would finish right now. Behind someone hurt, in front of someone almost dead, and on someone lying down:
  // down from a wound from any side, lying in cover once he is hurt as well. That is a bot. A person only ever from behind.
  finisherTarget(p) {
    const g = this.game, col = g.col, f = p.forwardVec(_v);
    let best = null, bd = Infinity;
    for (const b of g.bots) {
      if (!b.alive || b.out || b.sky || b.scripted) continue;
      const dx = b.pos.x - p.pos.x, dz = b.pos.z - p.pos.z, d = Math.hypot(dx, dz), low = b.downed || b.prone;
      if (d > (low ? 3.1 : 2.7) || d < 0.05 || Math.abs(b.pos.y - p.pos.y) > 0.8) continue;
      if ((dx * f.x + dz * f.z) / d < 0.5) continue;
      const hp = b.health + (b.armor || 0), behind = this.atBack(p, b);
      if (!b.isBot && !behind) continue;
      if (!b.downed && hp > (low || behind ? FINISH_HP : FRONT_HP)) continue;
      if (!col.lineClear(p.pos.x, p.pos.y + 1.2, p.pos.z, b.pos.x, b.pos.y + (low ? 0.5 : 1.2), b.pos.z)) continue;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // who a scene would be on, on what ground and looking which way
  finisherSetup(p) {
    const col = this.game.col, best = this.finisherTarget(p);
    if (!best) return null;
    const floor = col.floorBelow(best.pos.x, best.pos.z, 0.2, best.pos.y + 0.6, best.pos.y - 0.6);
    if (!isFinite(floor)) return null;
    const low = best.downed || best.prone, dx = best.pos.x - p.pos.x, dz = best.pos.z - p.pos.z, behind = this.atBack(p, best);
    // from the front the scene is set up looking from me to him, and he comes into it from where he stands
    return { best, floor, low, behind, yaw: low || behind ? best.aimYaw : Math.atan2(-dx, -dz) };
  }

  tryFinisher(p) {
    if (this.playerState !== 'ground' || this.finisher) return false;
    const S = this.finisherSetup(p);
    if (!S) return false;
    const { best, floor, low, behind, yaw } = S;
    const F = this.pickFinisher(best.pos, floor, yaw, low);
    if (!F) return false;
    let t0 = 0, turn = 0;
    if (!low && !behind) {
      t0 = F.front || 0;
      const inScene = victimYaw(F, t0);
      turn = inScene + angleDiff(inScene, best.aimYaw - yaw);
    }
    this.startFinisher(best, F, floor, yaw, t0, turn);
    return true;
  }

  // the next one from a shuffled deck that has room to play here (yaw: which way round, or what asks for itself whether a scene fits)
  pickFinisher(pos, y, yaw, low = false) {
    const name = low ? 'proneDeck' : 'finDeck', fits = typeof yaw === 'function' ? yaw : (F) => this.sceneFits(F, pos, y, yaw);
    if (!this[name] || !this[name].length) this[name] = FINISHERS.filter((f) => !!f.prone === low).sort(() => Math.random() - 0.5);
    const deck = this[name];
    for (let i = 0; i < deck.length; i++) if (fits(deck[i])) return deck.splice(i, 1)[0];
    // nothing left in the deck fits here, maybe one that has been played already
    return FINISHERS.find((f) => !!f.prone === low && fits(f)) || null;
  }

  // Room for the bodies on ground that is more or less one plane, and somewhere for the camera to stand.
  // this.finTilt: the slope of that plane, the scene gets played on it.
  sceneFits(F, pos, y, yaw) {
    const col = this.game.col, [x0, z0, x1, z1] = roomOf(F), c = Math.cos(yaw), s = Math.sin(yaw);
    let n = 0, sx = 0, sz = 0, sf = 0, sxx = 0, szz = 0, sxz = 0, sxf = 0, szf = 0;
    const pts = [];
    for (let x = x0; x <= x1 + 0.01; x += 0.55) for (let z = z0; z <= z1 + 0.01; z += 0.55) {
      const wx = pos.x + x * c + z * s, wz = pos.z - x * s + z * c, f = col.floorBelow(wx, wz, 0.1, y + 0.6, y - 0.6);
      if (!isFinite(f) || Math.abs(f - y) > 0.4) return false;
      if (col.overlaps(wx - 0.12, f + 0.42, wz - 0.12, wx + 0.12, f + 1.85, wz + 0.12)) return false;
      const dx = wx - pos.x, dz = wz - pos.z, df = f - y;
      pts.push(dx, dz, df);
      n++; sx += dx; sz += dz; sf += df; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; sxf += dx * df; szf += dz * df;
    }
    // the plane through what was found: y = ax + bz + d
    const A = sxx - (sx * sx) / n, B = sxz - (sx * sz) / n, C = szz - (sz * sz) / n, D = sxf - (sx * sf) / n, E = szf - (sz * sf) / n, det = A * C - B * B;
    const ax = det > 1e-6 ? (D * C - E * B) / det : 0, bz = det > 1e-6 ? (A * E - B * D) / det : 0, d = (sf - ax * sx - bz * sz) / n;
    if (Math.hypot(ax, bz) > 0.14) return false;
    for (let i = 0; i < pts.length; i += 3) if (Math.abs(pts[i + 2] - ax * pts[i] - bz * pts[i + 1] - d) > 0.12) return false; // stairs, a curb, a ledge
    const tilt = this.finTilt || (this.finTilt = new THREE.Quaternion());
    tilt.setFromUnitVectors(UP3, _v.set(-ax, 1, -bz).normalize());
    const q = _qt.setFromAxisAngle(UP3, yaw).premultiply(tilt), at = _w.set(pos.x, y, pos.z);
    return Math.max(clearance(F, at, q, col, 1), clearance(F, at, q, col, -1)) > 0.5;
  }

  startFinisher(b, F, y, yaw, t0 = 0, turn = 0) {
    const g = this.game, p = g.player, W = g.weapons, O = b.soldier.outfit, av = O === OUTFITS.vanguard || O === OUTFITS.desert ? this.avatarDark : this.avatar;
    W.cancelReload(); W.vm.stop(); W.state = 'idle'; W.adsAmount = 0; W.wantsAds = false; W.lunge = null;
    p.sprinting = false; p.tac = false; p.mount = null; p.stance = 'stand'; p.vel.set(0, 0, 0);
    b.scripted = true; b.vel.set(0, 0, 0); b.path = null; b.target = null; b.crouching = false; b.mantling = null; b.sliding = 0; b.prone = false;
    const origin = new THREE.Vector3(b.pos.x, y, b.pos.z);
    av.resetPose();
    if (F.gun === 'own') av.setWeapon(W.w.def, W.w.optic); else if (F.gun) av.setWeapon(WEAPONS[F.gun], 'iron');
    const stage = new Stage(g, F, av, b.soldier, origin, yaw, this.finTilt, t0, turn);
    if (F.prop) {
      this.props = this.props || {};
      const P = this.props[F.prop] || (this.props[F.prop] = makeProp(F.prop));
      if (P.parent !== g.scene) g.scene.add(P);
      P.visible = false; P.quaternion.identity(); stage.prop = P;
    }
    // both of them where the scene has them before the next frame is drawn
    stage.startFrom(p.pos);
    stage.pose(0);
    if (g.net && g.net.inMatch) g.net.send({ t: 'ev', k: 'fin', v: b.netId, f: FINISHERS.indexOf(F), o: [origin.x, origin.y, origin.z], yaw, t0, turn, tilt: this.finTilt ? [this.finTilt.x, this.finTilt.y, this.finTilt.z, this.finTilt.w] : [0, 0, 0, 1] });
    const cam = g.engine.camera;
    this.finisher = { F, b, av, stage, fired: 0, from: { pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov }, spurt: 0, spurtT: 0, killed: false };
    // what the skipped part of the scene had done already
    const S = this.finisher;
    while (S.fired < F.events.length && F.events[S.fired][0] < t0) { const E = F.events[S.fired++]; if (E[1] === 'prop' || E[1] === 'drop') this.finisherEvent(E, S); }
    this.playerState = 'finisher';
    this.hud.setFocus(null, W); this.hud.setVehiclePrompt(null); this.hud.setPromptText('');
    this.hud.setCine(true, F.name);
    this.loot.root.visible = false;
    g.audio.play('pouch', { vol: 0.7 });
  }

  updateFinisher(dt) {
    const g = this.game, p = g.player, S = this.finisher;
    if (!S) { this.playerState = 'ground'; return; }
    const F = S.F, b = S.b, st = S.stage;
    st.t += dt;
    p.vel.set(0, 0, 0); p.onGround = true; p.speedH = 0;
    p.landSpring.update(dt); p.rollSpring.update(dt); p.pitchKick.update(dt);
    g.slowmo = st.speed();
    // someone else got him first: the scene ends here, he is just a body
    if (!S.victimView && !b.alive && !S.killed) { S.killed = true; st.interrupt(); }
    st.pose(dt);
    if (S.victimView) b.soldier.updateWeaponDrop(dt);
    if (S.byBot) { S.av.pelvis.getWorldPosition(_w); S.atk.pos.x = _w.x; S.atk.pos.z = _w.z; S.atk.pos.y = st.o.y; }
    else if (!S.killed && !S.victimView) { b.soldier.updateWeaponDrop(dt); b.soldier.pelvis.getWorldPosition(_w); b.pos.x = _w.x; b.pos.z = _w.z; b.pos.y = st.o.y; }
    (S.victimView ? b.soldier : S.av).pelvis.getWorldPosition(_w); p.pos.x = _w.x; p.pos.z = _w.z; p.pos.y = st.o.y; p.eyeH = 1.62;
    g.engine.film = Math.min(0.4, Math.exp(-dt / 0.012));
    // ---- what happens when
    while (S.fired < F.events.length && st.t >= F.events[S.fired][0]) this.finisherEvent(F.events[S.fired++], S);
    if (S.spurt > 0) {
      S.spurt -= dt; S.spurtT -= dt;
      if (S.spurtT <= 0 && !S.killed) { S.spurtT = 0.07; g.fx.bloodBurst(st.point(['v.head', 0, -0.1, -0.1], _v), _w.set(rand(-0.3, 0.3), 0.15, -0.7).applyAxisAngle(UP3, st.yaw), 0.35); }
    }
    if (st.over()) this.endFinisher();
  }

  finFloor(at, st) { const f = this.game.col.floorBelow(at.x, at.z, 0.1, st.o.y + 0.6, st.o.y - 0.6); return isFinite(f) ? f : st.o.y; }

  finisherEvent(E, S) {
    const g = this.game, p = g.player, st = S.stage, b = S.b, name = E[1];
    const place = (i) => st.point([E[i], E[i + 1], E[i + 2], E[i + 3]], _v);
    const dir = (i) => _w.set(E[i], E[i + 1], E[i + 2]).applyAxisAngle(UP3, st.yaw).normalize();
    // (from the outside it happens over there, and the film music is for the people in it)
    const sound = (id, o) => { if (!S.spect) g.audio.play(id, o); else if (id !== 'sting') g.audio.play(id, { ...o, pos: st.o, maxDist: 60 }); };
    if (S.spect && (name === 'sfx' || name === 'spurt' || name === 'pin' || (name === 'kill' && !S.byBot))) return; // (that one is up to the people in it, the kill to whoever runs the one who does it)
    if (S.victimView && name === 'kill') {
      // That was you. It only counts here once the scene is over, the others hear it now: they play the same scene.
      if (!S.byBot || S.killed) return;
      S.killed = true;
      b.soldier.head.getWorldPosition(_v);
      S.killInfo = { part: E[4], dir: _w.set(E[2][0], E[2][1], E[2][2]).applyAxisAngle(UP3, st.yaw).normalize().clone(), strength: E[3], weapon: { name: 'FINISHER', damage: [50, 50] }, point: _v.clone(), staged: true };
      if (g.net && g.net.inMatch) { g.net.sendDied(p, S.atk, S.killInfo); S.killInfo.fromNet = true; }
      return;
    }
    if (name === 'sfx') g.audio.play(E[2], E[3]);
    else if (name === 'hit') {
      const power = E[9], at = place(2).clone(), d = dir(6).clone();
      if (power > 0) g.fx.bloodBurst(at, d, power);
      if (E[10]) sound(E[10], { vol: 1 });
      if (power >= 1) sound('sting', { vol: 0.8 });
    } else if (name === 'slam') {
      st.bone(E[2]).getWorldPosition(_v); _v.y = this.finFloor(_v, st) + 0.05;
      g.fx.impact(_v, _w.set(0, 1, 0), 'dirt', 0.8 * E[3]);
      sound('thud', { vol: 1 });
    } else if (name === 'thud') sound('thud', { vol: 0.9 });
    else if (name === 'shot') {
      const av = S.av, m = av.muzzleWorld(new THREE.Vector3()), at = place(2).clone(), power = E[9];
      g.fx.muzzleWorld(m, E[10] || 1.3, E[10] ? 1 : 2);
      g.fx.tracer(m, at);
      g.audio.gunshot(av.weapon.def.id, S.spect ? { pos: st.o } : undefined);
      g.fx.bloodBurst(at, dir(6).clone(), power);
      if (E[2][0] === 'v') b.soldier.addWound(st.bone(E[2]), E[3], E[4], E[5]);
      // what the gun lets out: smoke at the muzzle, the brass to the right
      if (!E[10]) g.fx.dust.spawn(m.x, m.y, m.z, rand(-0.2, 0.2), rand(0.15, 0.5), rand(-0.2, 0.2), 1.1, 0.16, 0.72, 0.72, 0.72, 0.16, -0.25, 1.1, 2.2);
      av.arms[1].hand.getWorldPosition(_v);
      _w.set(1, 0, 0).applyAxisAngle(UP3, st.yaw);
      g.fx.dust.spawn(_v.x, _v.y + 0.1, _v.z, _w.x * rand(1.4, 2.2), rand(1.6, 2.6), _w.z * rand(1.4, 2.2), 0.7, 0.024, 0.82, 0.62, 0.24, 1, 9.8, 0.2, 0);
      sound('imp_flesh', { vol: 1 });
      if (power >= 2) sound('sting', { vol: 0.9 });
    } else if (name === 'kill' && !S.killed && b.alive) {
      // the body keeps playing to the end of the scene: it only stops being anybody
      S.killed = true; b.scripted = false; b.holdDrop = true;
      b.soldier.head.getWorldPosition(_v);
      g.kill(b, S.atk || p, { part: E[4], dir: _w.set(E[2][0], E[2][1], E[2][2]).applyAxisAngle(UP3, st.yaw).normalize().clone(), strength: E[3], weapon: { name: 'FINISHER', damage: [50, 50] }, point: _v.clone(), staged: true, rest: Math.max(0, st.exit - st.t) });
    } else if (name === 'pool') {
      st.bone(E[2]).getWorldPosition(_v); _v.y = this.finFloor(_v, st);
      g.fx.pool(_v, E[3]);
    } else if (name === 'drop') {
      if (b.soldier.weapon) { b.soldier.dropWeapon(_w.set(0.3, 0, -0.5).applyAxisAngle(UP3, st.yaw)); b.soldier.weapon = null; }
    } else if (name === 'prop') { if (st.prop) st.prop.visible = !!E[2]; }
    else if (name === 'pin') {
      g.audio.play('pinpull', { vol: 1 });
      if (st.prop) { st.prop.getWorldPosition(_v); for (let i = 0; i < 6; i++) g.fx.sparks.spawn(_v.x, _v.y + 0.12, _v.z, rand(-1, 1), rand(0.5, 2), rand(-1, 1), rand(0.2, 0.4), 0.02, 1, 0.85, 0.5, 1, 9.8, 0.5, 0); }
    } else if (name === 'explode') {
      st.bone(E[2]).getWorldPosition(_v);
      const at = _v.clone();
      g.fx.explosion(at); g.fx.bloodBurst(at, _w.set(0, 0.6, 0), 2.4);
      if (st.prop) st.prop.visible = false;
      sound('boom', { vol: 1 }); sound('sting', { vol: 1 });
      if (!S.spect) { this.hud.cineFlash(); st.bump = 1; }
      // whoever stands too close gets it as well, the one walking away doesn't (from the outside that is up to whoever runs him)
      if (!S.spect || S.byBot) for (const c of g.combatants) if (c !== b && c !== S.atk && (S.spect || c !== p) && c.alive && !c.out && !c.sky) {
        const d = c.pos.distanceTo(at);
        if (d < 7) g.applyDamage(c, 200 * (1 - d / 7), S.atk || p, { part: 'chest', dir: _w.subVectors(c.pos, at).setY(0.5).normalize().clone(), weapon: { name: 'FINISHER', damage: [50, 50] }, point: c.pos.clone() });
      }
    } else if (name === 'spurt') S.spurt = E[2];
  }

  // the scene with me in it is over, the way the one who started it said
  endVictimView(S) {
    const g = this.game, p = g.player, st = S.stage, av = S.b.soldier;
    g.slowmo = 0;
    this.hud.setCine(false);
    g.engine.film = 0;
    this.loot.root.visible = true;
    if (st.prop && st.prop.parent) st.prop.parent.remove(st.prop);
    S.atk.scripted = false; S.atk.soldier.resetPose(); S.atk.soldier.setWeapon(S.atk.wdef, S.atk.optic);
    // (if that was the end of you, you stay where it left you)
    if (!(S.killPending && S.killPending.info.staged)) { av.resetPose(); av.setVisible(false); }
    this.playerState = 'ground';
    p.mode = 'normal'; p.onGround = true;
    if (S.killPending && p.alive) {
      // the death camera takes it from the side the scene's camera stands on
      const cam = g.engine.camera.position;
      p.yaw = Math.atan2(cam.x - p.pos.x, cam.z - p.pos.z);
      g.kill(p, S.killPending.k, S.killPending.info);
    } else if (p.alive) { g.weapons.vm.endFree(); g.weapons.equip(false); }
  }

  endFinisher() {
    const g = this.game, p = g.player, W = g.weapons, S = this.finisher;
    if (!S) return;
    this.finisher = null;
    if (S.byBot) return this.endBotFinisher(S);
    if (S.victimView) return this.endVictimView(S);
    g.slowmo = 0;
    this.hud.setCine(false);
    this.loot.root.visible = true;
    const st = S.stage, av = S.av, b = S.b;
    g.engine.film = 0;
    if (st.prop) { if (st.prop.parent) st.prop.parent.remove(st.prop); st.prop.visible = false; }
    // cut short while he still lives: he is himself again, and picks his gun back up
    if (b.holdDrop) { b.holdDrop = false; b.soldier.pelvis.getWorldPosition(_v); b.pos.x = _v.x; b.pos.z = _v.z; b.dropLoot(); }
    if (S.killed && b.out) { g.hud.popup('+150', 'FINISHER', true); g.audio.play('kill', { vol: 0.8 }); }
    if (b.alive && !S.killed) { b.scripted = false; b.soldier.resetPose(); if (!b.soldier.weapon) b.soldier.setWeapon(b.wdef, b.optic === 'iron' ? b.wdef.optics[0] : b.optic); b.soldier.weaponDrop = null; }
    if (S.F.gun) av.setWeapon(WEAPONS.pistol, 'iron');
    av.resetPose(); av.setVisible(false);
    if (this.playerState === 'finisher') {
      this.playerState = 'ground';
      st.endGround(p.pos);
      const f = g.col.floorBelow(p.pos.x, p.pos.z, 0.2, st.o.y + 0.5, st.o.y - 1);
      if (isFinite(f)) p.pos.y = f;
      p.yaw = st.endYaw(); p.pitch = 0;
      W.equip(false);
      if (this.alive === 1) this.checkEnd();
    }
    p.mode = 'normal'; p.onGround = true;
  }

  // who is lying there and can be finished by a bot: you, or a person on another computer
  lyingThere(c) { return c === this.game.player ? this.playerState === 'downed' && c.alive : !!c && c.remote && !c.isBot && c.downed && c.alive && !c.out && !c.scripted; }
  // the bot on its way to end it for someone lying there
  onTheWay(c) { const b = this.finishing.get(c); return b && b.alive && !b.out ? b : null; }

  // which way his body points: someone lying there can look somewhere else
  bodyYawOf(c) { return c.isPlayer ? c.bodyYaw : c.remote ? c.st.yaw : c.aimYaw; }

  // is he at his back
  atBack(from, c, how = 0.4) {
    const dx = c.pos.x - from.pos.x, dz = c.pos.z - from.pos.z, d = Math.hypot(dx, dz), yaw = this.bodyYawOf(c);
    return d > 0.01 && (dx * -Math.sin(yaw) + dz * -Math.cos(yaw)) / d >= how;
  }

  // How a bot gets behind someone lying there: past his side if it comes from the front. Nothing free back there: null.
  wayToBack(bot, c) {
    const yaw = this.bodyYawOf(c), fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = bot.pos.x - c.pos.x, rz = bot.pos.z - c.pos.z, y = c.pos.y;
    const back = { x: c.pos.x - fx * BACK_OF, y, z: c.pos.z - fz * BACK_OF, type: 0 };
    if (!this.game.col.lineClear(c.pos.x, y + 0.5, c.pos.z, back.x, y + 0.5, back.z)) return null;
    if (rx * fx + rz * fz < 0.5) return [back];
    const s = rx * fz - rz * fx >= 0 ? SIDE_OF : -SIDE_OF;
    return [{ x: c.pos.x + fz * s, y, z: c.pos.z - fx * s, type: 0 }, back];
  }

  // whoever has him in their sights lets go, or some of them
  letGo(c, chance = 1) {
    for (const b of this.game.bots) if (!b.remote && b.target === c && Math.random() < chance) { b.target = null; b.targetVisible = false; b.lastSeen = null; if (b.state === 'engage' || b.state === 'chase') { b.state = 'roam'; b.path = null; } b.peaceUntil = 0; }
  }

  // in a scene with you as the victim nothing else can happen to either of you any more, nor to a bot of mine that has someone on another computer
  untouchable(c) {
    const S = this.finisher;
    if (S && S.victimView && (c === this.game.player || c === S.atk)) return true;
    return !!this.netStages && this.netStages.some((s) => s.byBot && s.atk === c);
  }

  // Can this bot start a scene on him, and where would it play. Only ever from behind. low: he is lying down, standing: he is on his feet and not down.
  botScene(bot, v, low, standing, reach, weakOnly) {
    const d = Math.hypot(v.pos.x - bot.pos.x, v.pos.z - bot.pos.z);
    if (d > reach || d < 0.01 || Math.abs(v.pos.y - bot.pos.y) > 0.9 || !this.atBack(bot, v)) return null;
    if (weakOnly && standing && v.health + (v.armor || 0) > TAKEN_HP) return null;
    const col = this.game.col, floor = col.floorBelow(v.pos.x, v.pos.z, 0.2, v.pos.y + 0.6, v.pos.y - 0.6);
    if (!isFinite(floor)) return null;
    // You never saw how you stood yourself: the scene turns until he starts from where he is.
    // No room that way, then any other way round, and if there is none right here it moves over a little.
    let yaw = 0, F = null;
    const origin = new THREE.Vector3(), fits = (S) => {
      const y0 = startYaw(S, bot.pos.x - origin.x, bot.pos.z - origin.z);
      for (const q of ANY_WAY) if (this.sceneFits(S, origin, origin.y, y0 + q)) { yaw = y0 + q; return true; }
      return false;
    };
    for (let i = 0; i < NEARBY.length && !F; i++) {
      const x = v.pos.x + NEARBY[i][0], z = v.pos.z + NEARBY[i][1], f = i ? col.floorBelow(x, z, 0.2, floor + 0.5, floor - 0.5) : floor;
      if (!isFinite(f) || (i && !col.lineClear(v.pos.x, floor + 0.6, v.pos.z, x, f + 0.6, z))) continue;
      origin.set(x, f, z);
      F = this.pickFinisher(origin, f, fits, low);
    }
    return F && { F, origin, yaw };
  }

  holdBot(bot) { bot.scripted = true; bot.vel.set(0, 0, 0); bot.path = null; bot.mantling = null; bot.crouching = false; bot.sliding = 0; bot.prone = false; bot.state = 'roam'; bot.target = null; }

  // you as you are right now: the scene takes over from there
  poseAvatar(av) {
    const p = this.game.player, W = this.game.weapons, s = this.playerState;
    av.resetPose(); av.setVisible(true); av.setWeapon(W.w.def, W.w.optic);
    for (let i = 0; i < 8; i++) av.update(0.05, { yaw: p.yaw, pitch: 0, speed: 0, moveAngle: 0, downed: s === 'downed', prone: p.stance === 'prone' && s !== 'downed', crouch: p.stance === 'crouch', floorY: p.pos.y }, p.pos);
  }

  // A bot has someone who runs on another computer. The scene is looked for here, around where he is, then he gets told and plays it
  // from the inside, the same way a scene of his own would come in. Here it plays from the outside like for everybody else.
  botFinisherOn(bot, v, reach = 2.4, weakOnly = false) {
    const g = this.game;
    if (v === g.player) return this.botFinisher(bot, reach, weakOnly);
    if (!v.remote || v.isBot || !v.alive || v.out || v.sky || v.scripted || v.st.seat || v.st.mantle || !bot.alive || bot.out || bot.remote || bot.scripted || !bot.soldier) return false;
    const S = this.botScene(bot, v, v.downed || v.prone, !v.downed, reach, weakOnly);
    if (!S) return false;
    this.finishing.delete(v); bot.finishOn = null;
    this.letGo(v);
    // (he lies however he lay: on the way into the scene he gets yanked around)
    const T = this.finTilt, inScene = victimYaw(S.F, 0), m = { t: 'ev', k: 'fin', by: bot.netId, v: v.netId, f: FINISHERS.indexOf(S.F), o: [S.origin.x, S.origin.y, S.origin.z], yaw: S.yaw, t0: 0, turn: inScene + angleDiff(inScene, v.soldier.root.rotation.y - S.yaw), tilt: [T.x, T.y, T.z, T.w] };
    g.net.send(m);
    this.netFinisher(m);
    return true;
  }

  // A bot has you. The same scenes you play on them, from the outside, with you as the one it happens to.
  // reach: how far off it may start. weakOnly: on your feet only if you can't take much more anyway.
  botFinisher(bot, reach = 2.4, weakOnly = false) {
    const g = this.game, p = g.player, W = g.weapons, s = this.playerState;
    if ((s !== 'downed' && s !== 'ground') || this.finisher || !p.alive || !bot.alive || bot.out || bot.remote || bot.scripted || !bot.soldier || p.mantle) return false;
    const scene = this.botScene(bot, p, s === 'downed' || p.stance === 'prone', s === 'ground', reach, weakOnly);
    if (!scene) return false;
    const { F, origin, yaw } = scene;
    W.cancelReload(); W.vm.stop(); W.state = 'idle'; W.adsAmount = 0; W.wantsAds = false; W.lunge = null; W.firingRecently = false;
    p.sprinting = false; p.tac = false; p.mount = null; p.vel.set(0, 0, 0); p.health = Math.max(p.health, 1);
    this.plateT = 0; this.hud.setProgress(0); this.hud.setDowned(null);
    this.holdBot(bot);
    this.letGo(p);
    const O = bot.soldier.outfit, av = O === OUTFITS.vanguard || O === OUTFITS.desert ? this.avatarDark : this.avatar;
    this.poseAvatar(av);
    if (F.gun && F.gun !== 'own') bot.soldier.setWeapon(WEAPONS[F.gun], 'iron');
    const stage = new Stage(g, F, bot.soldier, av, origin, yaw, this.finTilt);
    stage.staysOut = true;
    if (F.prop) {
      this.props = this.props || {};
      const P = this.props[F.prop] || (this.props[F.prop] = makeProp(F.prop));
      if (P.parent !== g.scene) g.scene.add(P);
      P.visible = false; P.quaternion.identity(); stage.prop = P;
    }
    stage.startFrom(bot.pos);
    stage.pose(0);
    if (g.net && g.net.inMatch) g.net.send({ t: 'ev', k: 'fin', by: bot.netId, v: g.net.you, f: FINISHERS.indexOf(F), o: [origin.x, origin.y, origin.z], yaw, t0: 0, turn: 0, tilt: this.finTilt ? [this.finTilt.x, this.finTilt.y, this.finTilt.z, this.finTilt.w] : [0, 0, 0, 1] });
    const cam = g.engine.camera;
    this.finisher = { F, b: { soldier: av, alive: true }, av: bot.soldier, atk: bot, stage, fired: 0, from: { pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov }, spurt: 0, spurtT: 0, killed: false, victimView: true, byBot: true };
    this.finishing.delete(p); bot.finishOn = null;
    this.playerState = 'finisher';
    this.hud.setFocus(null, W); this.hud.setVehiclePrompt(null); this.hud.setPromptText('');
    this.hud.setCine(true, F.name);
    this.loot.root.visible = false;
    g.audio.play('pouch', { vol: 0.7 });
    return true;
  }

  // whoever did it goes on from where the scene leaves him
  releaseBot(st, bot) {
    const g = this.game;
    st.endGround(bot.pos);
    const f = g.col.floorBelow(bot.pos.x, bot.pos.z, 0.2, st.o.y + 0.5, st.o.y - 1);
    if (isFinite(f)) bot.pos.y = f;
    bot.aimYaw = st.endYaw(); bot.scripted = false; bot.onGround = true; bot.path = null; bot.lastProgress.copy(bot.pos); bot.stuckT = 0; bot.peaceUntil = g.time + rand(2, 5);
    bot.soldier.resetPose(); bot.soldier.setVisible(true); bot.soldier.setWeapon(bot.wdef, bot.optic === 'iron' ? bot.wdef.optics[0] : bot.optic);
  }

  // over, and you stay where it left you
  endBotFinisher(S) {
    const g = this.game, p = g.player, st = S.stage, bot = S.atk;
    g.slowmo = 0; g.engine.film = 0;
    this.hud.setCine(false);
    this.loot.root.visible = true;
    if (st.prop) { if (st.prop.parent) st.prop.parent.remove(st.prop); st.prop.visible = false; }
    this.releaseBot(st, bot);
    this.playerState = 'ground';
    p.mode = 'normal'; p.onGround = true;
    // the death camera takes it from the side the scene's camera stands on
    const cam = g.engine.camera.position;
    p.yaw = Math.atan2(cam.x - p.pos.x, cam.z - p.pos.z);
    g.kill(p, bot, S.killInfo || { part: 'chest', dir: new THREE.Vector3(0, -0.4, 1).normalize(), weapon: { name: 'FINISHER', damage: [50, 50] }, staged: true });
  }

  finisherCamera(cam) {
    const S = this.finisher;
    S.stage.camera(cam, S.from);
  }

  // ---------------------------------------------------------------- vehicles
  nearestVehicle(p) {
    let best = null, bd = 3.6;
    for (const v of this.vehicles.list) {
      if (v.dead || v.netOwner) continue;
      const d = Math.hypot(p.pos.x - v.pos.x, p.pos.z - v.pos.z) - v.def.len * 0.36;
      if (d < bd && Math.abs(p.pos.y - v.pos.y) < 2.4) { bd = d; best = v; }
    }
    return best;
  }

  updateVehicleUse(dt) {
    const g = this.game, p = g.player, inp = g.input;
    if (this.enterT > 0) this.enterT = Math.max(0, this.enterT - dt);
    if (this.playerState === 'vehicle') { if (inp.pressed('interact') && this.enterT <= 0) this.leaveVehicle(false); return; }
    const hasFocus = this.hud.focusObj;
    const v = this.nearestVehicle(p);
    this.hud.setVehiclePrompt(!hasFocus && v ? v : null);
    if (v && !hasFocus && inp.pressed('interact')) this.enterVehicle(v);
  }

  enterVehicle(v) {
    const g = this.game, p = g.player, W = g.weapons;
    this.vehicle = v; v.driver = p; v.doorOpenT = 0.42;
    this.playerState = 'vehicle';
    this.enterT = 0.55; this.camFrom.copy(g.engine.camera.position);
    this.camYawOff = 0;
    W.cancelReload(); W.adsAmount = 0;
    p.sprinting = false; p.tac = false; p.mode = 'normal'; p.stance = 'stand'; p.vel.set(0, 0, 0);
    this.avatar.setVisible(true);
    this.avatar.resetPose();
    g.audio.play('coverOpen', { pos: v.pos, vol: 0.8, rate: 1.1 });
    g.audio.play('coverClose', { pos: v.pos, vol: 0.8, delay: 0.42 });
    p.yaw = v.yaw; p.pitch = -0.12;
    if (this.audioL.engine) this.audioL.engine.set(0.1, 0.5);
    this.hud.setVehiclePrompt(null);
    this.hud.setFocus(null, W);
    this.hud.hint('[W/S] Gas/Bremse  ·  [A/D] Lenken  ·  [Leertaste] Handbremse  ·  [V] Kamera  ·  [F] Aussteigen', 4);
  }

  leaveVehicle(forced) {
    const g = this.game, p = g.player, W = g.weapons, v = this.vehicle;
    if (!v) return;
    v.driver = null; v.doorOpenT = 0.5;
    this.vehicle = null;
    if (g.net && g.net.inMatch) g.net.send({ t: 'ev', k: 'vout', i: this.vehicles.list.indexOf(v) });
    this.playerState = p.alive ? 'ground' : 'dead';
    this.avatar.setVisible(false);
    if (this.audioL.engine) this.audioL.engine.set(0, 0.5);
    g.audio.play('coverOpen', { pos: v.pos, vol: 0.7 });
    this.hud.setVehicle(null);
    if (!p.alive || forced) { if (p.alive) { v.exitPoint(p.pos); } return; }
    v.exitPoint(p.pos);
    p.vel.set(v.vel.x * 0.35, 0, v.vel.z * 0.35);
    p.onGround = true; p.eyeH = 1.62;
    p.yaw = v.yaw;
    this.enterT = 0.0;
    W.equip(false);
  }

  updateDriving(dt, inp) {
    const g = this.game, p = g.player, v = this.vehicle;
    if (!v) return;
    const m = this.readMove(inp, p.moveInput);
    const th = m.y, st = m.x;
    v.update(dt, { throttle: th, steer: st, handbrake: inp.down('jump') });
    if (g.net && g.net.inMatch && (this.vehSendT = (this.vehSendT || 0) - dt) <= 0) { this.vehSendT = 0.066; g.net.send({ t: 'ev', k: 'veh', i: this.vehicles.list.indexOf(v), s: v.netPack() }); }
    // passenger physics: you are where the seat is
    const seat = v.seatWorld(_v);
    p.pos.copy(seat); p.pos.y = seat.y - 0.2;
    p.vel.copy(v.vel);
    p.onGround = true; p.eyeH = v.def.eye - v.def.seat[1] + 0.2;
    p.speedH = 0;
    // the driver you see from outside
    const yaw = v.yaw;
    this.avatar.update(dt, { yaw, pitch: 0, speed: 0, moveAngle: 0, seat: true, floorY: v.pos.y - 200 }, _w.set(seat.x, seat.y - 0.05, seat.z));
    this.avatar.root.rotation.x = v.pitch; this.avatar.root.rotation.z = v.roll;
    // sound follows the revs
    const sp = v.speed, rev = 0.45 + (sp / v.def.top) * 1.0 + Math.abs(th) * 0.12;
    if (this.audioL.engine) this.audioL.engine.set(0.25 + Math.abs(th) * 0.25, rev);
    this.hud.setVehicle(v);
    if (inp.pressed('camera')) this.vehFirst = !this.vehFirst;
    this.avatar.setVisible(!this.vehFirst);
    // no input on the mouse for a while: the chase camera settles behind the car
    if (Math.abs(inp.dx) + Math.abs(inp.dy) > 0.5) this.lastLook = g.time;
    if (g.time - this.lastLook > 1.1 && sp > 2) {
      p.yaw += angleDiff(p.yaw, v.yaw) * Math.min(1, dt * 3.2);
      p.pitch = damp(p.pitch, -0.1, 2, dt);
    }
    if (v.dead) this.leaveVehicle(true);
  }

  // vehicles run people over, and everything leans out of the way of a parked car
  runOver() {
    const g = this.game;
    for (const v of this.vehicles.list) {
      if (v.dead || v.speed < 4 || v.netOwner) continue;
      for (const c of g.combatants) {
        if (!c.alive || c === v.driver || c.sky) continue;
        if (Math.abs(c.pos.y - v.pos.y) > 2.2) continue;
        const dx = c.pos.x - v.pos.x, dz = c.pos.z - v.pos.z;
        if (dx * dx + dz * dz > 25) continue;
        const s = Math.sin(v.yaw), co = Math.cos(v.yaw), lx = dx * co - dz * s, lz = dx * s + dz * co;
        if (Math.abs(lx) < v.def.wid / 2 + 0.25 && Math.abs(lz) < v.def.len / 2 + 0.25) {
          if (g.time - (c._hitByCar || -9) < 0.6) continue;
          c._hitByCar = g.time;
          const dmg = v.speed * 9;
          g.audio.play('imp_flesh', { pos: c.pos, vol: 1.2, maxDist: 60 });
          g.applyDamage(c, dmg, v.driver || c, { part: 'chest', dir: _v.copy(v.vel).normalize().clone(), weapon: { name: 'FAHRZEUG', damage: [dmg, dmg] }, point: c.pos.clone() });
          v.vel.multiplyScalar(0.92);
        }
      }
    }
  }

  pushOutOfVehicles(ent) {
    if (ent.sky) return;
    for (const v of this.vehicles.list) if (v.driver !== ent) v.pushOut(ent);
  }

  // ---------------------------------------------------------------- cameras
  // looking at the plane from behind, turning around it with the mouse
  planeCamera(at, q, dir) {
    const c = this.plane.position, d = 42;
    at.set(c.x - dir.x * d, c.y - dir.y * d + 6, c.z - dir.z * d);
    q.setFromRotationMatrix(_qm.lookAt(at, _qc.set(c.x + dir.x * 30, c.y + dir.y * 30, c.z + dir.z * 30), UP3));
  }

  applyCamera(cam, dt) {
    const g = this.game, p = g.player, s = this.playerState;
    const dir = _v.set(-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch));
    if (s === 'plane') {
      this.planeCamera(cam.position, cam.quaternion, dir);
      cam.fov = 70; cam.updateProjectionMatrix();
    } else if (s === 'fall') {
      // in your own head, the wind shakes the view the faster you fall
      const e = this.camBlend / CAM_INTO_FALL, k = e * e * e * (e * (e * 6 - 15) + 10), q = clamp(-p.vel.y / 60, 0, 1), w = q * (1 - k);
      cam.position.set(p.pos.x, p.pos.y + 1.6, p.pos.z);
      cam.rotation.set(p.pitch + Math.sin(g.time * 31) * 0.0024 * w, p.yaw + Math.sin(g.time * 27) * 0.0024 * w, Math.sin(g.time * 22) * 0.004 * w, 'YXZ');
      this.fallFov = damp(this.fallFov, 76 + q * 14, 3, dt);
      cam.fov = this.fallFov;
      // on the way out: the view behind the plane flies on, the one in your head falls, and the camera goes over from one to the other. Nothing ever jumps.
      if (k > 0) {
        this.planeCamera(_camAt, _camQ, dir);
        cam.position.lerp(_camAt, k); cam.quaternion.slerp(_camQ, k);
        cam.fov = lerp(this.fallFov, 70, k);
      }
      cam.updateProjectionMatrix();
    } else if (s === 'finisher' && this.finisher) {
      this.finisherCamera(cam);
    } else if (s === 'vehicle' && this.vehicle) {
      const v = this.vehicle;
      if (this.vehFirst) {
        const seat = v.seatWorld(_w);
        cam.position.set(seat.x, seat.y - v.def.seat[1] + v.def.eye, seat.z);
        cam.rotation.set(p.pitch + v.pitch * 0.6, p.yaw, v.roll * 0.6, 'YXZ');
        cam.fov = 78; cam.updateProjectionMatrix();
      } else {
        const d = 4.4 + v.def.len * 0.7, up = 1.4 + v.def.h * 0.55;
        const tx = v.pos.x, ty = v.pos.y + v.def.h * 0.75, tz = v.pos.z;
        const L = Math.hypot(d, up), rx = -dir.x * d, ry = up - dir.y * d, rz = -dir.z * d, RL = Math.hypot(rx, ry, rz);
        const hit = g.col.raycast(tx, ty, tz, rx / RL, ry / RL, rz / RL, RL, this._ch || (this._ch = {}));
        const q = hit ? Math.max(1.4, hit.t - 0.35) : RL;
        const wx = tx + rx / RL * q, wy = ty + ry / RL * q, wz = tz + rz / RL * q;
        if (this.enterT > 0) {
          const e = 1 - this.enterT / 0.55, k = e * e * (3 - 2 * e);
          cam.position.lerpVectors(this.camFrom, _w.set(wx, wy, wz), k);
        } else cam.position.set(wx, wy, wz);
        cam.lookAt(tx + dir.x * 8, ty + dir.y * 8, tz + dir.z * 8);
        cam.fov = 72 + clamp(v.speed / v.def.top, 0, 1) * 12; cam.updateProjectionMatrix();
        void L;
      }
    }
    void dt;
  }
}

const _rampAt = new THREE.Vector3(), _camAt = new THREE.Vector3(), _camQ = new THREE.Quaternion();
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _qc = new THREE.Vector3(), _qm = new THREE.Matrix4(), _qt = new THREE.Quaternion(), _qr = new THREE.Quaternion(), _eu = new THREE.Euler(), UP3 = new THREE.Vector3(0, 1, 0);
export { VEHICLE_TYPES, OPTICS, makeWeaponDef, DEG };
