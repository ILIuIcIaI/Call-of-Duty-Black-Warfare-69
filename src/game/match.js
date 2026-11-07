import * as THREE from 'three';
import { Bot } from '../bots/bot.js';
import { OUTFITS } from '../characters/soldier.js';
import { PRIMARIES, GUN_TIERS, WEAPONS, SECONDARIES } from '../weapons/defs.js';
import { randomSkin } from '../weapons/skins.js';
import { Points, pointsOf } from './points.js';

// =============================================================================
// Match rules: team setup, spawn selection (safe spawns away from enemy sight
// lines), respawns, scoring, time/score limits and the end screen.
// =============================================================================
const NAMES = ['Ghost', 'Viper', 'Havoc', 'Reaper', 'Nomad', 'Saber', 'Raptor', 'Blitz', 'Wolf', 'Hunter', 'Specter', 'Cobra', 'Rook', 'Jackal', 'Falcon', 'Onyx', 'Kodiak', 'Mako', 'Talon', 'Vandal'];
const WEAPON_WEIGHTS = { ar: 26, burst: 14, smg: 20, pdw: 14, shotgun: 10, autoshot: 8, lmg: 10, dmr: 12, sniper: 9, amr: 4 };
// Gun Game: each new weapon comes with a sight picked at random from the ones it takes; handguns always have their iron sights
const gunOptic = (id) => {
  const d = WEAPONS[id];
  if (d.melee || SECONDARIES.includes(id) || !d.optics.length) return 'iron';
  return d.optics[(Math.random() * d.optics.length) | 0];
};

function pickWeapon() {
  const total = PRIMARIES.reduce((s, id) => s + (WEAPON_WEIGHTS[id] || 5), 0);
  let r = Math.random() * total;
  for (const id of PRIMARIES) { r -= WEAPON_WEIGHTS[id] || 5; if (r <= 0) return id; }
  return 'ar';
}

export class Match {
  constructor(game, cfg) {
    this.game = game;
    this.mode = cfg.mode;
    this.cfg = cfg;
    this.score = [0, 0];
    this.gun = cfg.mode === 'gun';
    // Wingman: 2 against 2 for one flag (points.js), respawns without end, always 8 minutes
    this.wing = cfg.mode === 'wing';
    this.teams = cfg.mode === 'tdm' || this.wing;
    this.limit = cfg.net ? cfg.limit : this.gun ? GUN_TIERS.length : cfg.mode === 'ffa' ? 25 : this.wing ? Infinity : 50 + cfg.bots * 5;
    this.timeLeft = cfg.net ? cfg.leftMs / 1000 : this.wing ? 480 : 600;
    this.ended = false;
    this.lastUsed = new Map();
    this.spawnPoints = this.collectSpawns();
    if (this.wing) this.points = new Points(game, pointsOf(game.mapDef) || this.fallbackPoints());
  }

  // a map without its own flag: the middle of the map
  fallbackPoints() {
    const g = this.game, b = g.mapDef.bounds, nav = g.nav;
    const x = (b.minX + b.maxX) / 2, z = (b.minZ + b.maxZ) / 2, n = nav.nearest(x, 0, z, 8);
    return [n < 0 ? [x, 0, z] : [nav.X[n], nav.Y[n], nav.Z[n]]];
  }

  collectSpawns() {
    // (Wingman: a map may keep its own list, without the spawns that would look straight at the flag)
    const g = this.game, sp = this.wing && g.mapDef.wingSpawns ? g.mapDef.wingSpawns() : g.mapDef.spawns();
    const b = g.mapDef.bounds, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const pts = [];
    for (const team of [0, 1]) for (const [x, y, z, yaw] of sp[team]) pts.push({ x, y, z, yaw, team });
    // extra dynamic points from the nav graph (used in FFA and when team spawns are compromised)
    const nav = g.nav, lowest = g.mapDef.spawnMinY ?? -Infinity;
    for (let i = 0; i < 40; i++) {
      const n = nav.randomNode((k) => nav.links[k].length >= 6 && nav.Y[k] < 0.5 && nav.Y[k] >= lowest);
      const x = nav.X[n], z = nav.Z[n];
      pts.push({ x, y: nav.Y[n], z, yaw: Math.atan2(-(cx - x), -(cz - z)), team: -1 });
    }
    return pts;
  }

  // ---- in a network match the room has decided who is who
  makeNetBot(e) {
    const b = new Bot(this.game, { name: e.name, team: e.team, difficulty: this.cfg.difficulty, outfit: OUTFITS[e.outfit], weapon: e.weapon || pickWeapon() });
    if (this.gun) { b.tier = 0; b.setWeapon(GUN_TIERS[0], randomSkin(), gunOptic(GUN_TIERS[0])); }
    return b;
  }
  adoptAt(b, was) { b.spawn(was.pos.x, was.pos.y, was.pos.z, was.aimYaw); b.health = Math.max(1, was.health); }
  adoptDead(b) { b.alive = false; b.deathT = this.game.time - 2; b.soldier.setVisible(false); }

  createBots() {
    const g = this.game, cfg = this.cfg;
    if (cfg.net) return g.net.buildCombatants((e) => this.makeNetBot(e));
    const names = [...NAMES].sort(() => Math.random() - 0.5);
    const n = cfg.bots;
    const bots = [];
    const outfitsFFA = ['raven', 'jungle', 'urban', 'desert', 'raven', 'jungle', 'urban', 'desert'];
    if (this.wing) {
      // one bot at your side, two against you
      return [0, 1, 1].map((team, i) => new Bot(g, { name: names[i], team, difficulty: cfg.difficulty, outfit: OUTFITS[team === 0 ? 'vanguard' : 'raven'], weapon: pickWeapon() }));
    }
    for (let i = 0; i < n; i++) {
      let team, outfit;
      if (this.mode === 'tdm') {
        const allies = Math.floor((n + 1) / 2) - 1;
        team = i < allies ? 0 : 1;
        outfit = OUTFITS[team === 0 ? 'vanguard' : 'raven'];
      } else { team = 2 + i; outfit = OUTFITS[outfitsFFA[i % outfitsFFA.length]]; }
      const bot = new Bot(g, { name: names[i % names.length], team, difficulty: cfg.difficulty, outfit, weapon: this.gun ? GUN_TIERS[0] : pickWeapon() });
      if (this.gun) { bot.tier = 0; bot.setWeapon(GUN_TIERS[0], randomSkin(), gunOptic(GUN_TIERS[0])); }
      bots.push(bot);
    }
    return bots;
  }

  // pick the safest spawn for an entity
  chooseSpawn(ent) {
    const g = this.game, t = g.time;
    const enemies = g.combatants.filter((c) => c !== ent && c.alive && !g.isFriendly(c, ent));
    const friends = g.combatants.filter((c) => c !== ent && c.alive && g.isFriendly(c, ent));
    let best = null, bestS = -Infinity;
    for (const p of this.spawnPoints) {
      if (this.wing && p.team !== ent.team) continue; // (Wingman: always at your own base, never next to a point)
      let s = 0;
      let minD = 60;
      for (const e of enemies) {
        const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
        minD = Math.min(minD, d);
        if (d < 55 && g.col.lineClear(e.pos.x, e.pos.y + 1.5, e.pos.z, p.x, p.y + 1.5, p.z)) s -= 70;
      }
      s += Math.min(minD, 40) * 1.5;
      if (minD < 10) s -= 80;
      if (this.teams) {
        if (p.team === ent.team) s += 25; else if (p.team >= 0) s -= 25;
        for (const f of friends) { const d = Math.hypot(f.pos.x - p.x, f.pos.z - p.z); if (d < 18) { s += 8; break; } }
      }
      const used = this.lastUsed.get(p);
      if (used !== undefined && t - used < 4) s -= 30;
      s += Math.random() * 12;
      if (s > bestS) { bestS = s; best = p; }
    }
    this.lastUsed.set(best, t);
    return best;
  }

  spawn(ent) {
    const p = this.chooseSpawn(ent);
    if (ent.isPlayer) return p;
    // (the scatter keeps two from standing in each other, it never puts one into a wall: from inside a wall he could walk through it)
    let x = p.x + (Math.random() - 0.5) * 0.6, z = p.z + (Math.random() - 0.5) * 0.6;
    if (this.game.col.overlaps(x - 0.25, p.y + 0.05, z - 0.25, x + 0.25, p.y + 1.78, z + 0.25)) { x = p.x; z = p.z; }
    ent.spawn(x, p.y, z, p.yaw);
    if (ent.pendingGun) { ent.setWeapon(ent.pendingGun[0], ent.pendingGun[1], ent.pendingGun[2]); ent.pendingGun = null; }
    return p;
  }

  // ---- Gun Game. Who has reached which weapon. Over the network the room decides this and everybody is told.
  // Each new weapon comes with a random skin, the plain one among them, and a random sight (handguns: iron sights).
  setTier(c, tier) {
    const g = this.game, t = Math.max(0, Math.min(GUN_TIERS.length - 1, tier)), was = c.tier || 0;
    if (t === was) return;
    c.tier = t;
    const id = GUN_TIERS[t], skin = randomSkin(), optic = gunOptic(id);
    if (c === g.player) {
      c.gunSkin = skin; c.gunOptic = optic;
      if (c.alive) g.weapons.setGunWeapon(id, skin, optic);
      if (t > was) { g.hud.popup('STUFE ' + (t + 1), WEAPONS[id].name, t === GUN_TIERS.length - 1); g.audio.play('chargeFwd', { vol: 0.7 }); }
      else { g.hud.popup('STUFE ' + (t + 1), 'ZURÜCKGESTUFT'); g.audio.play('magDrop', { vol: 0.7 }); }
    } else if (!c.remote) {
      if (c.alive) c.setWeapon(id, skin, optic); else c.pendingGun = [id, skin, optic];
    }
    if (t === GUN_TIERS.length - 1 && t > was && c !== g.player) g.hud.message('<span style="font-size:22px">' + c.name.replace(/[<>&]/g, '') + ' HAT DAS MESSER</span>', 2.5);
  }

  // (re)spawning, or the match has just begun
  armPlayer() {
    const p = this.game.player, id = GUN_TIERS[p.tier || 0];
    if (!p.gunSkin) { p.gunSkin = randomSkin(); p.gunOptic = gunOptic(id); }
    this.game.weapons.setGunWeapon(id, p.gunSkin, p.gunOptic);
  }

  gunLeader() { return [...this.game.combatants].sort((a, b) => (b.tier || 0) - (a.tier || 0) || b.kills - a.kills)[0]; }

  // A kill with a gun: the next weapon. Stabbed: the victim falls back a level and the knife gains nothing, unless it is the last level.
  // Your own fault: one level back as well.
  gunKill(killer, victim, info) {
    const melee = info && info.weapon && info.weapon.name === 'MESSER', last = GUN_TIERS.length - 1;
    if (!killer || killer === victim) { this.setTier(victim, (victim.tier || 0) - 1); return; }
    if (melee) {
      if ((killer.tier || 0) >= last) { this.end(killer); return; }
      this.setTier(victim, (victim.tier || 0) - 1);
    } else if ((killer.tier || 0) < last) this.setTier(killer, (killer.tier || 0) + 1);
  }

  onKill(killer, victim, info) {
    if (this.ended || this.cfg.net) return;
    if (this.gun) { this.gunKill(killer, victim, info); return; }
    if (this.teams && killer && killer !== victim && this.score[killer.team] !== undefined) this.score[killer.team]++;
  }

  update(dt) {
    if (this.ended) return;
    const g = this.game;
    this.timeLeft -= dt;
    // bot respawns
    for (const b of g.bots) if (!b.remote && !b.alive && g.time - b.deathT > 3.2) this.spawn(b);
    // Wingman: the flag is decided alone, or by the PC that runs the bots (the others are told, see Net)
    if (this.wing) {
      const net = this.cfg.net && g.net;
      if (!net || g.net.isAuth) {
        const held = this.points.update(dt);
        if (net) g.net.sendPoints(this.points, held);
        else if (held >= 0) { this.end(held, 'hold'); return; }
      } else this.points.follow(dt);
      this.points.show();
    }
    if (this.cfg.net) return; // the room keeps the score
    // Wingman out of time: whoever holds the flag (nobody: more kills)
    if (this.wing && this.timeLeft <= 0) { const o = this.points.list[0].owner; this.end(o >= 0 ? o : null, 'time'); return; }
    // win conditions
    let winner = null;
    if (this.teams) {
      if (this.score[0] >= this.limit) winner = 0; else if (this.score[1] >= this.limit) winner = 1;
    } else if (!this.gun) {
      const top = [...g.combatants].sort((a, b) => b.kills - a.kills)[0];
      if (top && top.kills >= this.limit) winner = top;
    }
    if (winner !== null || this.timeLeft <= 0) this.end(winner);
  }

  // ---- Wingman: where a bot goes. There is one flag: the two of a team take it, hold it, or go to take it back.
  objectiveFor(b) {
    if (!this.wing || this.ended) return null;
    return this.points.list[0];
  }

  scores() {
    const g = this.game;
    if (this.teams) return { f: this.score[g.player.team], e: this.score[1 - g.player.team] };
    if (this.gun) return { f: (g.player.tier || 0) + 1, e: Math.max(0, ...g.combatants.filter((c) => c !== g.player).map((c) => (c.tier || 0) + 1)) };
    const others = g.combatants.filter((c) => c !== g.player).map((c) => c.kills);
    return { f: g.player.kills, e: others.length ? Math.max(...others) : 0 };
  }

  // how a Wingman match ended, in a line under the result
  wingNote(winner, how) {
    const g = this.game, f = this.score[g.player.team], e = this.score[1 - g.player.team];
    if (winner === null) return 'ZEIT ABGELAUFEN · NIEMAND HÄLT DIE FLAGGE · KILLS ' + f + ' : ' + e;
    const own = winner === g.player.team;
    if (how === 'hold') return own ? 'DEIN TEAM HAT DIE FLAGGE EINE MINUTE GEHALTEN' : 'DIE GEGNER HABEN DIE FLAGGE EINE MINUTE GEHALTEN';
    return 'ZEIT ABGELAUFEN · ' + (own ? 'DEIN TEAM HÄLT DIE FLAGGE' : 'DIE GEGNER HALTEN DIE FLAGGE');
  }

  end(winner, how) {
    this.ended = true;
    const g = this.game;
    let won;
    if (this.teams) {
      // (Wingman out of time with nobody on the flag: whoever has more kills)
      if (winner === null) won = this.score[g.player.team] > this.score[1 - g.player.team] ? true : this.score[g.player.team] === this.score[1 - g.player.team] ? null : false;
      else won = winner === g.player.team;
      if (this.wing) this.endNote = this.wingNote(winner, how);
    } else if (this.gun) {
      won = (winner || this.gunLeader()) === g.player;
    } else {
      const top = [...g.combatants].sort((a, b) => b.kills - a.kills)[0];
      won = top === g.player;
    }
    g.onMatchEnd(won);
  }
}

export { THREE as _THREE };
