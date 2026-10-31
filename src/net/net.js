import * as THREE from 'three';
import { Puppet, F, WEAPON_IDS, OPTIC_IDS } from './puppet.js';
import { WEAPONS } from '../weapons/defs.js';

// =============================================================================
// The game's end of the room in server/mp.js: the connection, the lobby state, and everything
// a match has to tell the others or hears from them. Everybody owns his own body, one
// player owns the bots; a hit goes to the owner, and he says when somebody is dead.
// =============================================================================
const VERSION = 1, SEND_EVERY = 0.05, BOTS_EVERY = 0.1;

export class Net {
  constructor(game) {
    this.game = game;
    this.ws = null; this.you = null; this.lobby = null; this.chat = []; this.cfg = null;
    this.status = 'off'; // off | search | lobby | match
    this.onChange = null; // the lobby screen listens here
    this.byId = new Map();
    this.sendT = 0; this.botsT = 0; this.counter = 0; this.clockT = 0;
    this.name = '';
  }

  changed() { if (this.onChange) this.onChange(); }

  // ---------------------------------------------------------------- connecting
  async join(name) {
    this.name = name;
    this.status = 'search'; this.error = null; this.changed();
    let r;
    try { r = await (await fetch('/mp/find', { cache: 'no-store' })).json(); } catch (e) { return this.fail('Der Spielserver antwortet nicht. Läuft start.bat noch?'); }
    if (this.status !== 'search') return;
    if (r.error) return this.fail('Raumsuche fehlgeschlagen');
    this.address = r.own ? (r.lan ? r.lan + ':' + r.port : null) : r.ip + ':' + r.port;
    this.connect(r.own ? location.host : (r.ip + ':' + r.port));
  }

  connect(host) {
    this.status = 'search'; this.changed();
    const ws = this.ws = new WebSocket('ws://' + host + '/mp');
    this.moved = false;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name: this.name, ver: VERSION }));
    ws.onmessage = (e) => { if (ws === this.ws) { try { this.receive(JSON.parse(e.data)); } catch (err) { console.error(err); } } };
    ws.onclose = () => { if (ws === this.ws && !this.moved) this.lost(); };
    ws.onerror = () => {};
  }

  fail(text) { this.status = 'off'; this.error = text; this.ws = null; this.changed(); }

  // the room is gone: whoever is still here looks for the next one
  lost() {
    const g = this.game;
    this.ws = null;
    if (this.status === 'off') return;
    const wasMatch = this.status === 'match';
    this.teardownMatch();
    this.chat.push({ from: null, text: 'Verbindung zum Raum verloren, suche neu' });
    this.status = 'search'; this.changed();
    if (wasMatch) g.leaveNetMatch();
    setTimeout(() => { if (this.status === 'search' && !this.ws) this.join(this.name); }, 600);
  }

  leave() {
    this.status = 'off'; this.cfg = null;
    const ws = this.ws; this.ws = null;
    if (ws) { try { ws.send(JSON.stringify({ t: 'bye' })); ws.close(); } catch (e) { /* gone anyway */ } }
    this.teardownMatch();
    this.lobby = null; this.chat = [];
  }

  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  vote(stage, v) { this.send({ t: 'vote', stage, v }); }
  say(text) { this.send({ t: 'chat', text }); }
  solo() { this.send({ t: 'solo' }); }
  rejoin() { this.send({ t: 'rejoin' }); }
  get isAuth() { return !!this.cfg && this.cfg.auth === this.you; }
  get inMatch() { return this.status === 'match'; }
  newId() { return this.you + ':' + (++this.counter); }

  // ---------------------------------------------------------------- everything that comes in
  receive(m) {
    const g = this.game;
    switch (m.t) {
      case 'welcome': this.you = m.you; this.chat = m.chat || []; this.status = 'lobby'; g.player.netId = m.you; this.changed(); break;
      case 'refused': this.fail(m.why); break;
      case 'lobby': this.lobby = m; this.lobbyAt = performance.now(); if (this.status === 'search') this.status = 'lobby'; this.changed(); break;
      case 'chat': this.chat.push(m); if (this.chat.length > 200) this.chat.shift(); this.changed(); if (m.from && this.status === 'lobby') g.audio.play('uiClick', { vol: 0.25 }); break;
      case 'move': this.moved = true; try { this.ws.close(); } catch (e) { /* gone */ } this.connect((m.sameHost && location.hostname === 'localhost' ? 'localhost' : m.ip) + ':' + m.port); break;
      case 'start': this.startMatch(m.cfg); break;
      case 'go':
        if (m.auth) this.setAuth(m.auth);
        g.netWait = false; g.showNetWait(false);
        // (the browser only hands over the mouse on a click)
        if (!g.input.locked && !g.input.hoverLook && !g.dev && g.hud) g.hud.message('<span style="font-size:22px">Ins Bild klicken, um die Maus zu fangen</span>', 5);
        break;
      case 'clock': this.clock(m); break;
      case 'st': { const p = this.byId.get(m.from); if (p && p.receive) p.receive(m.s); break; }
      case 'bots': if (!this.isAuth) for (const k of Object.keys(m.s)) { const p = this.byId.get(k); if (p && p.receive) p.receive(m.s[k]); } break;
      case 'shot': this.onShot(m); break;
      case 'hit': this.onHit(m); break;
      case 'died': this.onDied(m); break;
      case 'sc': this.onScore(m); break;
      case 'take': if (g.br) g.br.loot.netTake(m.nid); break;
      case 'lost': if (g.br) g.br.onItemLost(m.nid); break;
      case 'ev': if (g.br) g.br.onNetEvent(m); break;
      case 'joined': { this.addEntry(m.entry); const c = this.byId.get(m.entry.id); if (c && m.score) { c.kills = m.score.kills; c.deaths = m.score.deaths; c.score = m.score.points; } this.note(m.entry.name + ' ist dazugekommen'); break; }
      case 'left': this.onLeft(m); break;
      case 'auth': this.setAuth(m.id); break;
      case 'end': this.onEnd(m); break;
      default: break;
    }
  }

  note(text) { if (this.game.hud) this.game.hud.message('<span style="font-size:20px">' + esc(text) + '</span>', 2.5); }

  // ---------------------------------------------------------------- a match starts
  startMatch(cfg) {
    const g = this.game;
    this.cfg = cfg;
    this.status = 'match';
    this.changed();
    this.keepRunning();
    g.paused = false;
    const L = document.getElementById('loading');
    document.getElementById('load-msg').textContent = cfg.mode === 'br' ? 'Die Insel wird vorbereitet' : 'Die Karte wird vorbereitet';
    document.getElementById('load-fill').style.width = '100%';
    L.classList.remove('hidden');
    g.menu.hide();
    g.netWait = true;
    setTimeout(() => {
      if (this.status !== 'match') return;
      g.startMatch({ ...cfg, net: true, bots: cfg.roster.filter((r) => r.bot).length });
      L.classList.add('hidden');
      for (const r of cfg.board || []) { const c = r.id === this.you ? g.player : this.byId.get(r.id); if (c) { c.kills = r.kills; c.deaths = r.deaths; c.score = r.points; } }
      if (cfg.team && g.match.mode === 'tdm') g.match.score = [cfg.team[0], cfg.team[1]];
      g.showNetWait(g.netWait);
      this.send({ t: 'loaded' });
    }, 60);
  }

  // A tab in the background gets no frames, and the others still need this one: its body, and the bots if it runs them.
  // (the browser slows down the timers in there as well, but not the ones of a worker)
  keepRunning() {
    if (this.ticker) return;
    const g = this.game;
    this.ticker = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 33)'], { type: 'text/javascript' })));
    this.ticker.onmessage = () => {
      if (!this.inMatch || performance.now() - g.drawnAt < 250) return;
      g.engine.noDraw = true;
      g.frame(performance.now(), true);
      g.engine.noDraw = false;
    };
  }

  // who's who: bots are made real by whoever runs them. make(entry) builds a real bot.
  buildCombatants(make) {
    const g = this.game, list = [];
    this.byId.clear();
    for (const e of this.cfg.roster) {
      if (e.id === this.you) { g.player.team = e.team; g.player.name = e.name; this.byId.set(e.id, g.player); continue; }
      const real = e.bot && this.isAuth;
      const c = real ? make(e) : new Puppet(g, e);
      c.netId = e.id;
      this.byId.set(e.id, c);
      list.push(c);
    }
    return list;
  }

  addEntry(e) {
    const g = this.game;
    if (this.byId.has(e.id) || e.id === this.you) return;
    if (!this.cfg.roster.some((r) => r.id === e.id)) this.cfg.roster.push(e);
    const c = new Puppet(g, e);
    c.netId = e.id;
    this.byId.set(e.id, c);
    g.bots.push(c); g.combatants.push(c);
  }

  // ---------------------------------------------------------------- who runs the bots now
  setAuth(id) {
    const old = this.cfg && this.cfg.auth;
    if (this.cfg) this.cfg.auth = id;
    if (id === this.you && old !== id) this.adoptBots();
  }

  // whoever ran them is gone: they carry on here from where they were last seen
  adoptBots() {
    const g = this.game;
    for (const e of this.cfg.roster) {
      if (!e.bot) continue;
      const pu = this.byId.get(e.id);
      if (!pu || !pu.remote) continue;
      const i = g.bots.indexOf(pu), j = g.combatants.indexOf(pu);
      const b = g.match.makeNetBot(e);
      b.netId = e.id; b.kills = pu.kills; b.deaths = pu.deaths; b.score = pu.score;
      // (one still in the plane isn't alive yet, but not out of it either)
      if (g.br ? pu.out : !pu.alive) g.match.adoptDead(b, pu);
      else g.match.adoptAt(b, pu);
      pu.dispose();
      if (i >= 0) g.bots[i] = b;
      if (j >= 0) g.combatants[j] = b;
      this.byId.set(e.id, b);
    }
  }

  onLeft(m) {
    const g = this.game, c = this.byId.get(m.id);
    if (!c || c === g.player) return;
    this.note(c.name + ' hat das Match verlassen');
    this.byId.delete(m.id);
    // (whoever had him in his sights lets go)
    c.alive = false; c.out = true;
    if (c.remote) {
      const i = g.bots.indexOf(c), j = g.combatants.indexOf(c);
      if (i >= 0) g.bots.splice(i, 1);
      if (j >= 0) g.combatants.splice(j, 1);
      g.hud.dropTag(c);
      c.dispose();
    }
  }

  clock(m) {
    const g = this.game, br = g.br;
    if (g.netWait || !g.match) return;
    if (!br) { if (m.left) g.match.timeLeft = m.left / 1000; return; }
    // the zone and the plane run on the same time everywhere
    const here = br.netTime, diff = m.ms / 1000 - here;
    if (Math.abs(diff) > 0.4) br.netCatchUp(diff);
  }

  // ---------------------------------------------------------------- once per frame: what goes out
  tick(dt) {
    const g = this.game;
    if (!this.inMatch || g.netWait) return;
    this.sendT -= dt;
    if (this.sendT <= 0) { this.sendT = SEND_EVERY; this.send({ t: 'st', s: this.playerState() }); }
    if (this.isAuth) {
      this.botsT -= dt;
      if (this.botsT <= 0) {
        this.botsT = BOTS_EVERY;
        const s = {};
        for (const b of g.bots) if (!b.remote && b.netId) s[b.netId] = this.botState(b);
        if (Object.keys(s).length) this.send({ t: 'bots', s });
      }
    }
  }

  playerState() {
    const g = this.game, p = g.player, W = g.weapons, br = g.br, m = p.mode, st = br ? br.playerState : '';
    let f = 0;
    if (p.alive) f |= F.alive;
    if (p.stance === 'crouch' && m === 'normal') f |= F.crouch;
    if (m === 'slide') f |= F.slide;
    if (m === 'dive') f |= F.dive;
    if (p.stance === 'prone' && m === 'normal') f |= F.prone;
    if (p.supine) f |= F.supine;
    if (!p.onGround && m === 'normal') f |= F.air;
    if (m === 'mantle') f |= F.mantle;
    if (p.tac) f |= F.tac;
    if (p.sprinting) f |= F.sprint;
    if (W.state === 'reload') f |= F.reload;
    if (W.adsAmount > 0.5) f |= F.ads;
    if (st === 'plane') f |= F.plane;
    if (st === 'fall') f |= F.fall;
    if (st === 'chute') f |= F.chute;
    if (st === 'vehicle') f |= F.seat;
    if (st === 'downed') { f |= F.downed; f &= ~F.prone; if (g.input.down('interact')) f |= F.reviving; }
    const w = W.w, fwd = p.moveInput ? p.moveInput.y : 0, side = p.moveInput ? p.moveInput.x : 0;
    return [+p.pos.x.toFixed(3), +p.pos.y.toFixed(3), +p.pos.z.toFixed(3), +p.yaw.toFixed(3), +p.pitch.toFixed(3), +(p.bodyYaw ?? p.yaw).toFixed(3), +(p.speedH || 0).toFixed(2), +Math.atan2(side, fwd || (side ? 0 : 1)).toFixed(2), f, p.proneSpin !== undefined ? +p.proneSpin.toFixed(2) : 9, w ? WEAPON_IDS.indexOf(w.def.id) : 0, w ? OPTIC_IDS.indexOf(w.optic) : 0, Math.round(p.health), Math.round(p.armor || 0)];
  }

  botState(b) {
    const a = b.animState();
    let f = 0;
    if (b.alive) f |= F.alive;
    if (a.crouch) f |= F.crouch;
    if (a.slide) f |= F.slide;
    if (a.prone) f |= F.prone;
    if (a.air) f |= F.air;
    if (a.tac) f |= F.tac;
    if (a.sprint) f |= F.sprint;
    if (a.reload || (a.reloadK > 0)) f |= F.reload;
    if (b.sky === 'plane') f |= F.plane;
    if (b.sky === 'fall') f |= F.fall;
    if (b.sky === 'chute') f |= F.chute;
    if (b.downed) f |= F.downed;
    const oi = OPTIC_IDS.indexOf(b.optic || 'iron');
    return [+b.pos.x.toFixed(2), +b.pos.y.toFixed(2), +b.pos.z.toFixed(2), +a.yaw.toFixed(3), +a.pitch.toFixed(3), +a.yaw.toFixed(3), +a.speed.toFixed(2), +a.moveAngle.toFixed(2), f, 9, WEAPON_IDS.indexOf(b.wdef.id), oi < 0 ? 0 : oi, Math.round(b.health), Math.round(b.armor || 0)];
  }

  // ---------------------------------------------------------------- shots
  sendShot(shooter, origin, dir, def) {
    this.send({ t: 'shot', b: shooter.netId && shooter !== this.game.player ? shooter.netId : undefined, o: [+origin.x.toFixed(2), +origin.y.toFixed(2), +origin.z.toFixed(2)], d: [+dir.x.toFixed(3), +dir.y.toFixed(3), +dir.z.toFixed(3)], w: def.id });
  }

  onShot(m) {
    const g = this.game, c = this.byId.get(m.b || m.from), def = WEAPONS[m.w];
    if (!c || !c.remote || !def || g.netWait) return;
    const muzzle = c.soldier.muzzleWorld(new THREE.Vector3()), o = new THREE.Vector3(m.o[0], m.o[1], m.o[2]), d = new THREE.Vector3(m.d[0], m.d[1], m.d[2]);
    g.fireBullet(o, d, def, c, muzzle, true, true);
    g.audio.gunshot(def.sound, { pos: c.pos.clone().setY(c.pos.y + 1.4) });
    g.fx.muzzleWorld(muzzle, def.heavy || def.id === 'shotgun' || def.id === 'sniper' ? 0.8 : 0.5);
    c.lastRadar = g.time;
    g.recentAction = { pos: c.pos.clone(), t: g.time };
    for (const b of g.bots) if (!b.remote && b !== c) b.hear(c.pos, c);
  }

  // ---------------------------------------------------------------- hits: to the owner, who decides
  sendHit(victim, dmg, attacker, info) {
    const by = attacker === this.game.player ? this.you : attacker && attacker.netId;
    this.send({ t: 'hit', to: victim.netId, by, dmg: +dmg.toFixed(1), part: info && info.part, dir: info && info.dir ? [+info.dir.x.toFixed(3), +info.dir.y.toFixed(3), +info.dir.z.toFixed(3)] : null, p: info && info.point ? [+info.point.x.toFixed(2), +info.point.y.toFixed(2), +info.point.z.toFixed(2)] : null, w: info && info.weapon ? (info.weapon.id || info.weapon.name) : null });
  }

  infoFrom(m) {
    const w = m.w && WEAPONS[m.w] ? WEAPONS[m.w] : { name: m.w || '', damage: [30, 30] };
    return { part: m.part, dir: m.dir ? new THREE.Vector3(m.dir[0], m.dir[1], m.dir[2]) : new THREE.Vector3(0, 0, 1), point: m.p ? new THREE.Vector3(m.p[0], m.p[1], m.p[2]) : null, weapon: w };
  }

  onHit(m) {
    const g = this.game, v = m.to === this.you ? g.player : this.byId.get(m.to);
    if (!v || v.remote || !v.alive || g.netWait) return;
    g.applyDamage(v, m.dmg, this.byId.get(m.by) || null, this.infoFrom(m));
  }

  // ---------------------------------------------------------------- deaths: said by the owner, or whoever ended him in a scene
  sendDied(victim, killer, info) {
    const by = killer === this.game.player ? this.you : killer && killer.netId;
    const id = victim === this.game.player ? this.you : victim.netId;
    this.send({ t: 'died', id, by: by || null, part: info && info.part, dir: info && info.dir ? [+info.dir.x.toFixed(3), +info.dir.y.toFixed(3), +info.dir.z.toFixed(3)] : null, p: info && info.point ? [+info.point.x.toFixed(2), +info.point.y.toFixed(2), +info.point.z.toFixed(2)] : null, w: info && info.weapon ? (info.weapon.id || info.weapon.name) : null, staged: info && info.staged ? 1 : 0, strength: info && info.strength, rest: info && info.rest });
  }

  onDied(m) {
    const g = this.game, v = m.id === this.you ? g.player : this.byId.get(m.id), k = m.by === this.you ? g.player : this.byId.get(m.by);
    if (!v || !v.alive) return;
    const info = this.infoFrom(m);
    info.fromNet = true;
    if (m.staged) info.staged = true;
    if (m.strength) info.strength = m.strength;
    if (g.br && v === g.player && g.br.finisher && g.br.finisher.victimView) { g.br.finisher.killPending = { k, info }; return; }
    if (v === g.player) info.staged = false; // (the scene was over here before the word came: no body is lying there)
    g.kill(v, k || null, info);
    if (k === g.player && v !== g.player) { g.hud.hitmarker('kill'); g.audio.play('kill', { vol: 0.7 }); if (g.br) g.br.stats.kills++; }
  }

  // the room's count is the count, whatever got lost on the way
  onScore(m) {
    const g = this.game, get = (id) => (id === this.you ? g.player : this.byId.get(id));
    const v = get(m.id), k = m.by ? get(m.by) : null;
    if (v) v.deaths = m.d;
    if (k && m.k !== undefined) { k.kills = m.k; k.score = m.p; }
    if (g.match && g.match.mode === 'tdm' && m.team) g.match.score = [m.team[0], m.team[1]];
  }

  // ---------------------------------------------------------------- the end
  onEnd(m) {
    const g = this.game;
    this.status = 'lobby';
    this.lastEnd = m;
    g.lobby.lastBoard = lastBoard(m);
    g.netWait = false;
    g.showNetWait(false);
    if (!g.match) { this.changed(); return; }
    let won;
    if (m.mode === 'tdm') won = m.winner === null ? null : m.winner === g.player.team;
    else won = m.winner === null ? null : m.winner === this.you;
    if (g.br) g.br.netFinish(won, m);
    else { const sc = g.match; sc.ended = true; g.onMatchEnd(won); }
    this.cfgEnded = true;
  }

  // what is left when a match is over: nobody here any more
  teardownMatch() {
    this.byId.clear();
    this.cfg = null;
  }
}

// what stays up in the lobby after a match
function lastBoard(m) {
  const name = { tdm: 'Team Deathmatch', ffa: 'Free for All', br: 'Warzone' }[m.mode];
  const won = m.mode === 'tdm' ? null : (m.board.find((r) => r.id === m.winner) || {}).name;
  return { title: 'Letztes Match: ' + name + (m.mode === 'tdm' ? ' ' + m.team[0] + ' : ' + m.team[1] : won ? ', gewonnen von ' + won : ''), rows: m.board };
}

export function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
