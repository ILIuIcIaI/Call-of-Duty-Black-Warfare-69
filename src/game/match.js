import * as THREE from 'three';
import { Bot } from '../bots/bot.js';
import { OUTFITS } from '../characters/soldier.js';
import { PRIMARIES } from '../weapons/defs.js';

// =============================================================================
// Match rules: team setup, spawn selection (safe spawns away from enemy sight
// lines), respawns, scoring, time/score limits and the end screen.
// =============================================================================
const NAMES = ['Ghost', 'Viper', 'Havoc', 'Reaper', 'Nomad', 'Saber', 'Raptor', 'Blitz', 'Wolf', 'Hunter', 'Specter', 'Cobra', 'Rook', 'Jackal', 'Falcon', 'Onyx', 'Kodiak', 'Mako', 'Talon', 'Vandal'];
const WEAPON_WEIGHTS = { ar: 30, smg: 26, shotgun: 12, lmg: 10, dmr: 12, sniper: 10 };

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
    this.limit = cfg.mode === 'ffa' ? 25 : 50 + cfg.bots * 5;
    this.timeLeft = 600;
    this.ended = false;
    this.lastUsed = new Map();
    this.spawnPoints = this.collectSpawns();
  }

  collectSpawns() {
    const g = this.game, sp = g.mapDef.spawns();
    const b = g.mapDef.bounds, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const pts = [];
    for (const team of [0, 1]) for (const [x, y, z, yaw] of sp[team]) pts.push({ x, y, z, yaw, team });
    // extra dynamic points from the nav graph (used in FFA and when team spawns are compromised)
    const nav = g.nav;
    for (let i = 0; i < 40; i++) {
      const n = nav.randomNode((k) => nav.links[k].length >= 6 && nav.Y[k] < 0.5);
      const x = nav.X[n], z = nav.Z[n];
      pts.push({ x, y: nav.Y[n], z, yaw: Math.atan2(-(cx - x), -(cz - z)), team: -1 });
    }
    return pts;
  }

  createBots() {
    const g = this.game, cfg = this.cfg;
    const names = [...NAMES].sort(() => Math.random() - 0.5);
    const n = cfg.bots;
    const bots = [];
    const outfitsFFA = ['raven', 'jungle', 'urban', 'desert', 'raven', 'jungle', 'urban', 'desert'];
    for (let i = 0; i < n; i++) {
      let team, outfit;
      if (this.mode === 'tdm') {
        const allies = Math.floor((n + 1) / 2) - 1;
        team = i < allies ? 0 : 1;
        outfit = OUTFITS[team === 0 ? 'vanguard' : 'raven'];
      } else { team = 2 + i; outfit = OUTFITS[outfitsFFA[i % outfitsFFA.length]]; }
      const bot = new Bot(g, { name: names[i % names.length], team, difficulty: cfg.difficulty, outfit, weapon: pickWeapon() });
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
      let s = 0;
      let minD = 60;
      for (const e of enemies) {
        const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
        minD = Math.min(minD, d);
        if (d < 55 && g.col.lineClear(e.pos.x, e.pos.y + 1.5, e.pos.z, p.x, p.y + 1.5, p.z)) s -= 70;
      }
      s += Math.min(minD, 40) * 1.5;
      if (minD < 10) s -= 80;
      if (this.mode === 'tdm') {
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
    ent.spawn(p.x + (Math.random() - 0.5) * 0.6, p.y, p.z + (Math.random() - 0.5) * 0.6, p.yaw);
    return p;
  }

  onKill(killer, victim) {
    if (this.ended) return;
    if (this.mode === 'tdm' && killer && killer !== victim) this.score[killer.team]++;
  }

  update(dt) {
    if (this.ended) return;
    const g = this.game;
    this.timeLeft -= dt;
    // bot respawns
    for (const b of g.bots) if (!b.alive && g.time - b.deathT > 3.2) this.spawn(b);
    // win conditions
    let winner = null;
    if (this.mode === 'tdm') {
      if (this.score[0] >= this.limit) winner = 0; else if (this.score[1] >= this.limit) winner = 1;
    } else {
      const top = [...g.combatants].sort((a, b) => b.kills - a.kills)[0];
      if (top && top.kills >= this.limit) winner = top;
    }
    if (winner !== null || this.timeLeft <= 0) this.end(winner);
  }

  scores() {
    const g = this.game;
    if (this.mode === 'tdm') return { f: this.score[g.player.team], e: this.score[1 - g.player.team] };
    const others = g.combatants.filter((c) => c !== g.player).map((c) => c.kills);
    return { f: g.player.kills, e: others.length ? Math.max(...others) : 0 };
  }

  end(winner) {
    this.ended = true;
    const g = this.game;
    let won;
    if (this.mode === 'tdm') {
      if (winner === null) won = this.score[g.player.team] > this.score[1 - g.player.team] ? true : this.score[g.player.team] === this.score[1 - g.player.team] ? null : false;
      else won = winner === g.player.team;
    } else {
      const top = [...g.combatants].sort((a, b) => b.kills - a.kills)[0];
      won = top === g.player;
    }
    g.onMatchEnd(won);
  }
}

export { THREE as _THREE };
