// =============================================================================
// Multiplayer in the local network. No dependencies, no master server:
//   - whoever looks first finds nothing and opens the room himself, everyone after that finds it (UDP)
//   - the room lives here, in the server of whoever opened it: who is in it, the votes, the chat, the score
//   - the game itself runs in the browsers: everybody moves himself, the bots run with one of the players,
//     and the room passes on what the others have to know. A hit goes to whoever owns the one that was hit.
// =============================================================================
const dgram = require('dgram');
const crypto = require('crypto');
const os = require('os');

const VERSION = 1;
const UDP_PORT = 48069, GROUP = '239.69.0.69';
const LOOK_MS = 900, BEACON_MS = 1000;
const VOTE_MS = 20000, COUNTDOWN_MS = 8000, LOAD_MS = 20000;
const MAX_TOTAL = { tdm: 10, ffa: 10, br: 20 };
const MATCH_MS = 600000;
const MAPS = ['drydock', 'citadel', 'blacksite'];
const BOT_NAMES = ['Ghost', 'Viper', 'Havoc', 'Reaper', 'Nomad', 'Saber', 'Raptor', 'Blitz', 'Wolf', 'Hunter', 'Specter', 'Cobra', 'Rook', 'Jackal', 'Falcon', 'Onyx', 'Kodiak', 'Mako', 'Talon', 'Vandal', 'Bishop', 'Echo', 'Fuchs', 'Bär', 'Krähe', 'Mamba', 'Nox', 'Orca', 'Puma', 'Quill'];
const WEAPON_WEIGHTS = { ar: 26, burst: 14, smg: 20, pdw: 14, shotgun: 10, autoshot: 8, lmg: 10, dmr: 12, sniper: 9, amr: 4 };
const FFA_OUTFITS = ['raven', 'jungle', 'urban', 'desert', 'vanguard'];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffled = (a) => { const o = [...a]; for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };
function pickWeapon() {
  const ids = Object.keys(WEAPON_WEIGHTS), total = ids.reduce((s, k) => s + WEAPON_WEIGHTS[k], 0);
  let r = Math.random() * total;
  for (const id of ids) { r -= WEAPON_WEIGHTS[id]; if (r <= 0) return id; }
  return 'ar';
}

// ---------------------------------------------------------------------------
// WebSocket, as much of it as this needs: text frames, ping, close
// ---------------------------------------------------------------------------
class Socket {
  constructor(sock) {
    this.sock = sock; this.buf = Buffer.alloc(0); this.closed = false; this.onmessage = null; this.onclose = null;
    sock.setNoDelay(true);
    sock.on('data', (d) => this.feed(d));
    sock.on('close', () => this.gone());
    sock.on('error', () => this.gone());
  }
  gone() { if (this.closed) return; this.closed = true; if (this.onclose) this.onclose(); }
  close() { try { this.frame(0x8, Buffer.alloc(0)); this.sock.end(); } catch (e) { /* already gone */ } this.gone(); }
  frame(op, data) {
    const n = data.length;
    let head;
    if (n < 126) head = Buffer.from([0x80 | op, n]);
    else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(n, 2); } else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
    this.sock.write(Buffer.concat([head, data]));
  }
  send(obj) { if (!this.closed) { try { this.frame(0x1, Buffer.from(JSON.stringify(obj))); } catch (e) { this.gone(); } } }
  sendRaw(text) { if (!this.closed) { try { this.frame(0x1, Buffer.from(text)); } catch (e) { this.gone(); } } }
  feed(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const op = b[0] & 0x0f, masked = b[1] & 0x80;
      let n = b[1] & 0x7f, at = 2;
      if (n === 126) { if (b.length < 4) return; n = b.readUInt16BE(2); at = 4; } else if (n === 127) { if (b.length < 10) return; n = Number(b.readBigUInt64BE(2)); at = 10; }
      if (n > 1 << 20) return this.close(); // nothing in here is that long
      if (b.length < at + (masked ? 4 : 0) + n) return;
      let data;
      if (masked) { const m = b.subarray(at, at + 4); at += 4; data = Buffer.from(b.subarray(at, at + n)); for (let i = 0; i < n; i++) data[i] ^= m[i & 3]; } else data = b.subarray(at, at + n);
      this.buf = b.subarray(at + n);
      if (op === 0x8) return this.close();
      if (op === 0x9) { this.frame(0xa, data); continue; }
      if (op !== 0x1) continue;
      let msg = null;
      try { msg = JSON.parse(data.toString()); } catch (e) { continue; }
      if (msg && this.onmessage) this.onmessage(msg);
    }
  }
}
// A page from this computer or this network. Any other website could otherwise talk to the room through the browser of whoever plays.
function fromHere(origin, host) {
  if (!origin) return true; // (not a browser)
  let u;
  try { u = new URL(origin); } catch (e) { return false; }
  const h = u.hostname;
  return u.host === host || !h.includes('.') || /^(127\.\d+\.\d+|10\.\d+\.\d+|192\.168\.\d+|169\.254\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+)\.\d+$/.test(h) || /\.(local|lan|home|internal)$/.test(h);
}
function acceptUpgrade(req, sock) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { sock.destroy(); return null; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  return new Socket(sock);
}

// ---------------------------------------------------------------------------
// The room
// ---------------------------------------------------------------------------
class Room {
  constructor(service) {
    this.service = service;
    this.id = crypto.randomBytes(4).toString('hex');
    this.born = Date.now();
    this.players = new Map();
    this.nextId = 1;
    this.chat = [];
    this.resetLobby();
  }

  get phase() { return this.state; }
  connected() { return [...this.players.values()]; }

  resetLobby() {
    clearTimeout(this.timer); clearTimeout(this.loadTimer); clearInterval(this.clock); clearTimeout(this.matchTimer);
    this.state = 'lobby';
    this.stage = 'mode';
    this.votes = { mode: new Map(), map: new Map(), bots: new Map() };
    this.choice = {};
    this.endsAt = 0; this.startsAt = 0; this.waitingSolo = false;
    this.match = null;
  }

  // ---- people
  add(sock, name) {
    const id = 'p' + this.nextId++;
    const p = { id, name: this.cleanName(name), sock, loaded: false };
    this.players.set(id, p);
    sock.send({ t: 'welcome', you: id, room: this.id, ver: VERSION, chat: this.chat.slice(-40) });
    this.say(null, p.name + ' ist da');
    this.broadcastLobby();
    // the votes may have been waiting for a second person
    if (this.state === 'lobby') this.after();
    else if (this.state === 'match' && this.match.joinable) this.joinRunning(p);
    return p;
  }

  cleanName(name) {
    const base = String(name || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 16) || 'Spieler';
    let n = base, i = 2;
    const taken = new Set(this.connected().map((p) => p.name.toLowerCase()));
    while (taken.has(n.toLowerCase())) n = base.slice(0, 13) + ' ' + i++;
    return n;
  }

  remove(p) {
    if (!this.players.has(p.id)) return;
    this.players.delete(p.id);
    for (const v of Object.values(this.votes)) v.delete(p.id);
    this.say(null, p.name + ' ist gegangen');
    if (!this.players.size) { this.resetLobby(); this.broadcastLobby(); return; }
    if (this.match) {
      const m = this.match;
      this.others(null, { t: 'left', id: p.id });
      if (m.auth === p.id) { m.auth = this.connected().filter((q) => q.inMatch)[0]?.id || null; if (m.auth) this.others(null, { t: 'auth', id: m.auth }); }
      if (!this.connected().some((q) => q.inMatch)) { this.endMatch(null); return; }
      m.alive.delete(p.id);
      if (this.state === 'match') this.checkLast();
      else if (this.state === 'loading') this.checkLoaded();
    } else this.after();
    this.broadcastLobby();
  }

  others(from, msg) { const text = JSON.stringify(msg); for (const q of this.players.values()) if (q !== from && (q.inMatch || msg.t === 'left' || msg.t === 'auth')) q.sock.sendRaw(text); }
  everyone(msg) { const text = JSON.stringify(msg); for (const q of this.players.values()) q.sock.sendRaw(text); }

  say(from, text) {
    const line = { from: from ? from.name : null, text, at: Date.now() };
    this.chat.push(line);
    if (this.chat.length > 200) this.chat.shift();
    this.everyone({ t: 'chat', ...line });
  }

  // ---- lobby: what everyone sees
  lobbyState() {
    const tally = (m) => { const o = {}; for (const v of m.values()) o[v] = (o[v] || 0) + 1; return o; };
    return {
      t: 'lobby', state: this.state, stage: this.stage, choice: this.choice,
      players: this.connected().map((p) => ({ id: p.id, name: p.name, voted: this.votes[this.stage] ? this.votes[this.stage].has(p.id) : false, inMatch: !!p.inMatch })),
      tally: this.votes[this.stage] ? tally(this.votes[this.stage]) : {},
      left: this.endsAt ? Math.max(0, this.endsAt - Date.now()) : 0,
      starts: this.startsAt ? Math.max(0, this.startsAt - Date.now()) : 0,
      solo: this.waitingSolo,
      joinable: !!(this.match && this.match.joinable),
    };
  }
  broadcastLobby() { this.everyone(this.lobbyState()); }

  vote(p, stage, value) {
    if (this.state !== 'lobby' || stage !== this.stage) return;
    const valid = stage === 'mode' ? ['tdm', 'ffa', 'br'].includes(value) : stage === 'map' ? MAPS.includes(value) : stage === 'bots' ? ['yes', 'no'].includes(value) : false;
    if (!valid) return;
    this.votes[stage].set(p.id, value);
    this.after();
    this.broadcastLobby();
  }

  // the state of the votes: everybody has voted, or the first one started the clock
  after() {
    if (this.state !== 'lobby') return;
    if (this.stage === 'done') { this.armStart(); return; }
    const V = this.votes[this.stage], n = this.players.size;
    if (!V || !V.size) { clearTimeout(this.timer); this.endsAt = 0; return; }
    if (V.size >= n) { clearTimeout(this.timer); this.endsAt = 0; this.closeStage(); return; }
    if (!this.endsAt) { this.endsAt = Date.now() + VOTE_MS; this.timer = setTimeout(() => { this.endsAt = 0; this.closeStage(); this.broadcastLobby(); }, VOTE_MS); }
  }

  closeStage() {
    const stage = this.stage, V = this.votes[stage];
    const count = {};
    for (const v of V.values()) count[v] = (count[v] || 0) + 1;
    const top = Math.max(...Object.values(count)), best = Object.keys(count).filter((k) => count[k] === top);
    this.choice[stage] = pick(best); // a tie is decided by chance
    this.say(null, stage === 'mode' ? 'Modus: ' + { tdm: 'Team Deathmatch', ffa: 'Free for All', br: 'Warzone' }[this.choice.mode] : stage === 'map' ? 'Karte: ' + this.choice.map : 'Bots: ' + (this.choice.bots === 'yes' ? 'ja' : 'nein'));
    if (stage === 'mode') this.stage = this.choice.mode === 'br' ? 'bots' : 'map';
    else if (stage === 'map') this.stage = 'bots';
    else this.stage = 'done';
    this.after();
  }

  // alone you decide when, two or more get a short countdown so nobody has to be fast
  armStart() {
    if (this.players.size < 2) { clearTimeout(this.timer); this.waitingSolo = true; this.startsAt = 0; return; }
    this.waitingSolo = false;
    if (!this.startsAt) { this.startsAt = Date.now() + COUNTDOWN_MS; this.timer = setTimeout(() => this.startMatch(), COUNTDOWN_MS); }
  }

  solo(p) { if (this.state === 'lobby' && this.stage === 'done' && this.players.size === 1) { void p; this.startMatch(); } }

  // ---- the match
  startMatch() {
    clearTimeout(this.timer);
    const c = this.choice, mode = c.mode, players = this.connected();
    if (!players.length) return;
    const total = MAX_TOTAL[mode], bots = c.bots === 'yes' ? Math.max(0, total - players.length) : 0;
    const roster = [], names = shuffled(BOT_NAMES);
    const seed = crypto.randomBytes(4).readUInt32LE(0);
    let tA = 0, tB = 0;
    const teamFor = () => (tA <= tB ? (tA++, 0) : (tB++, 1));
    players.forEach((p, i) => {
      const team = mode === 'tdm' ? teamFor() : 2 + i;
      p.team = team; p.inMatch = true; p.loaded = false;
      roster.push({ id: p.id, name: p.name, team, bot: false, outfit: mode === 'tdm' ? (team === 0 ? 'vanguard' : 'raven') : FFA_OUTFITS[i % FFA_OUTFITS.length] });
    });
    for (let i = 0; i < bots; i++) {
      const team = mode === 'tdm' ? teamFor() : 2 + players.length + i;
      roster.push({ id: 'b' + (i + 1), name: names[i % names.length], team, bot: true, outfit: mode === 'tdm' ? (team === 0 ? 'vanguard' : 'raven') : FFA_OUTFITS[(players.length + i) % FFA_OUTFITS.length], weapon: pickWeapon() });
    }
    const limit = mode === 'ffa' ? 25 : mode === 'tdm' ? 50 + (roster.length - 1) * 5 : 0;
    this.match = {
      mode, map: mode === 'br' ? 'island' : c.map, seed, roster, limit, auth: players[0].id,
      score: new Map(roster.map((r) => [r.id, { kills: 0, deaths: 0, points: 0, team: r.team }])), team: [0, 0],
      alive: new Set(roster.map((r) => r.id)), joinable: mode !== 'br', taken: new Set(),
    };
    this.state = 'loading'; this.startsAt = 0;
    this.everyone({ t: 'start', cfg: this.startCfg(), you: null });
    this.broadcastLobby();
    this.loadTimer = setTimeout(() => this.go(), LOAD_MS);
  }

  startCfg() {
    const m = this.match;
    return { mode: m.mode, map: m.map, seed: m.seed, roster: m.roster, limit: m.limit, auth: m.auth, difficulty: 'regular', leftMs: m.endsAt ? Math.max(0, m.endsAt - Date.now()) : MATCH_MS, board: [...m.score].map(([id, s]) => ({ id, kills: s.kills, deaths: s.deaths, points: s.points })), team: m.team };
  }

  checkLoaded() { if (this.state === 'loading' && this.connected().filter((p) => p.inMatch).every((p) => p.loaded)) this.go(); }

  go() {
    clearTimeout(this.loadTimer);
    if (this.state !== 'loading') return;
    const m = this.match;
    this.state = 'match';
    m.startedAt = Date.now();
    m.endsAt = m.mode === 'br' ? 0 : m.startedAt + MATCH_MS;
    this.everyone({ t: 'go', auth: m.auth });
    this.broadcastLobby();
    if (m.endsAt) this.matchTimer = setTimeout(() => this.endMatch(this.leader()), MATCH_MS);
    this.clock = setInterval(() => this.others(null, { t: 'clock', ms: Date.now() - m.startedAt, left: m.endsAt ? m.endsAt - Date.now() : 0 }), 3000);
  }

  // time is up: whoever is ahead, if anybody is
  leader() {
    const M = this.match;
    if (M.mode === 'tdm') return M.team[0] === M.team[1] ? null : M.team[0] > M.team[1] ? 0 : 1;
    const rows = [...M.score].sort((a, b) => b[1].kills - a[1].kills);
    return rows.length && (rows.length < 2 || rows[0][1].kills > rows[1][1].kills) ? rows[0][0] : null;
  }

  // someone comes in while it is running: he gets the same world, a body and the score so far, and goes once he has loaded
  joinRunning(p) {
    const m = this.match;
    let entry = m.roster.find((r) => r.id === p.id); // (he has been here before and went to the lobby for a moment)
    if (!entry) {
      const n = m.roster.filter((r) => !r.bot).length + 1;
      const team = m.mode === 'tdm' ? (this.teamSize(0) <= this.teamSize(1) ? 0 : 1) : 2 + 100 + n;
      entry = { id: p.id, name: p.name, team, bot: false, outfit: m.mode === 'tdm' ? (team === 0 ? 'vanguard' : 'raven') : FFA_OUTFITS[n % FFA_OUTFITS.length] };
      m.roster.push(entry);
      m.score.set(p.id, { kills: 0, deaths: 0, points: 0, team });
    }
    m.alive.add(p.id);
    p.team = entry.team; p.inMatch = true; p.loaded = false;
    this.others(p, { t: 'joined', entry, score: m.score.get(p.id) });
    p.sock.send({ t: 'start', cfg: this.startCfg() });
    this.broadcastLobby();
  }
  teamSize(t) { return this.match.roster.filter((r) => r.team === t && (r.bot || (this.players.get(r.id) && this.players.get(r.id).inMatch))).length; }

  // what somebody says about his body
  died(from, m) {
    const M = this.match;
    if (!M || this.state !== 'match') return;
    if (M.mode === 'br' && !M.alive.has(m.id)) return; // (two got him at the same moment: the first one did)
    const v = M.score.get(m.id), k = m.by && M.score.get(m.by);
    if (v) v.deaths++;
    if (k && m.by !== m.id) {
      k.kills++;
      k.points += 100 + (m.part === 'head' ? 25 : 0);
      if (M.mode === 'tdm' && (k.team === 0 || k.team === 1)) M.team[k.team]++;
    }
    this.others(from, { ...m, t: 'died', from: from.id });
    this.others(null, { t: 'sc', id: m.id, d: v ? v.deaths : 0, by: m.by || null, k: k ? k.kills : undefined, p: k ? k.points : undefined, team: M.team });
    if (M.mode === 'br') {
      M.alive.delete(m.id);
      this.checkLast(m.rest);
    } else if (M.mode === 'tdm') {
      if (M.team[0] >= M.limit || M.team[1] >= M.limit) this.endMatch(M.team[0] >= M.limit ? 0 : 1);
    } else if (k && k.kills >= M.limit) this.endMatch(m.by);
  }

  checkLast(rest = 0) {
    const M = this.match;
    if (M.mode !== 'br' || this.ending) return;
    // one left, or nobody left who is a person: nobody has to wait for the bots to finish it among themselves
    const people = [...M.alive].filter((id) => { const p = this.players.get(id); return p && p.inMatch; });
    if (M.alive.size > 1 && people.length) return;
    // (so the last shot gets seen, and a finisher finishes)
    this.ending = true;
    setTimeout(() => { this.ending = false; if (this.match === M) this.endMatch(M.alive.size === 1 ? [...M.alive][0] : null); }, 2500 + Math.min(10, +rest || 0) * 2000);
  }

  endMatch(winner) {
    const M = this.match;
    if (!M || this.state === 'lobby') return;
    const board = M.roster.map((r) => { const s = M.score.get(r.id) || { kills: 0, deaths: 0 }; return { id: r.id, name: r.name, bot: r.bot, team: r.team, kills: s.kills, deaths: s.deaths }; }).sort((a, b) => b.kills - a.kills);
    this.everyone({ t: 'end', winner, board, team: M.team, mode: M.mode });
    for (const p of this.connected()) { p.inMatch = false; p.loaded = false; }
    this.resetLobby();
    this.broadcastLobby();
  }

  // ---- everything that arrives
  receive(p, m) {
    switch (m.t) {
      case 'chat': { const text = String(m.text || '').trim().slice(0, 160); if (text) this.say(p, text); break; }
      case 'vote': this.vote(p, m.stage, m.v); break;
      case 'solo': this.solo(p); break;
      case 'rejoin': if (this.state === 'match' && this.match.joinable && !p.inMatch) this.joinRunning(p); break;
      case 'loaded':
        p.loaded = true;
        if (this.state === 'match' && p.inMatch) p.sock.send({ t: 'go', auth: this.match.auth, running: true });
        else this.checkLoaded();
        break;
      case 'died': this.died(p, m); break;
      case 'hit': {
        if (!this.match || !p.inMatch) break;
        // to whoever owns the one that was hit: his own client decides what it does to him
        const owner = m.to[0] === 'b' ? this.players.get(this.match.auth) : this.players.get(m.to);
        if (owner && owner !== p) owner.sock.send({ ...m, from: p.id });
        break;
      }
      case 'take': {
        // two grabbing the same thing: the first one has it
        if (!this.match || !p.inMatch) break;
        if (this.match.taken.has(m.nid)) { p.sock.send({ t: 'lost', nid: m.nid }); break; }
        this.match.taken.add(m.nid);
        this.others(p, { ...m, from: p.id });
        break;
      }
      case 'st': case 'bots': case 'shot': case 'ev':
        if (this.match && p.inMatch) this.others(p, { ...m, from: p.id });
        break;
      case 'bye': this.remove(p); p.sock.close(); break;
      case 'tolobby':
        // he has seen enough: back in the lobby while the others go on
        if (this.match && p.inMatch && this.state === 'match') {
          p.inMatch = false; this.match.alive.delete(p.id); this.others(p, { t: 'left', id: p.id, stays: true });
          if (this.match.auth === p.id) { this.match.auth = this.connected().filter((q) => q.inMatch)[0]?.id || null; if (this.match.auth) this.others(null, { t: 'auth', id: this.match.auth }); }
          if (!this.connected().some((q) => q.inMatch)) this.endMatch(null); else { this.checkLast(); this.broadcastLobby(); }
        }
        break;
      default: break;
    }
  }
}

// ---------------------------------------------------------------------------
// One per server: finds rooms, keeps its own, answers the others
// ---------------------------------------------------------------------------
class Service {
  constructor(port) {
    this.port = port; this.room = null; this.udp = null; this.seen = new Map(); this.onLan = null;
    this.me = crypto.randomBytes(4).toString('hex');
  }

  addresses() {
    const out = [];
    for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a);
    return out;
  }
  broadcasts() {
    return this.addresses().map((a) => {
      const ip = a.address.split('.').map(Number), mask = a.netmask.split('.').map(Number);
      return ip.map((b, i) => (b & mask[i]) | (~mask[i] & 255)).join('.');
    });
  }

  listenUdp() {
    if (this.udp) return this.udpReady;
    const s = this.udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.udpReady = new Promise((resolve) => {
      s.on('error', () => resolve(false));
      s.bind(UDP_PORT, () => {
        try { s.setBroadcast(true); s.setMulticastLoopback(true); s.setMulticastTTL(1); s.addMembership(GROUP); for (const a of this.addresses()) { try { s.addMembership(GROUP, a.address); } catch (e) { /* this one doesn't do multicast */ } } } catch (e) { /* the plain broadcast still works */ }
        resolve(true);
      });
    });
    s.on('message', (buf, from) => this.onPacket(buf, from));
    return this.udpReady;
  }

  sendUdp(obj) {
    if (!this.udp) return;
    const b = Buffer.from(JSON.stringify({ g: 'bw69', v: VERSION, from: this.me, ...obj }));
    const to = [GROUP, '255.255.255.255', ...this.broadcasts()];
    for (const addr of to) { try { this.udp.send(b, UDP_PORT, addr); } catch (e) { /* no route there */ } }
  }

  onPacket(buf, from) {
    let m;
    try { m = JSON.parse(buf.toString()); } catch (e) { return; }
    if (!m || m.g !== 'bw69' || m.v !== VERSION || m.from === this.me) return;
    if (m.t === 'who') { if (this.room) this.beacon(); return; }
    if (m.t !== 'room') return;
    // what a room on this same computer can be reached by
    const entry = { id: m.id, born: m.born, ip: this.isLocal(from.address) ? '127.0.0.1' : from.address, lan: from.address, port: m.port, players: m.players, state: m.state, at: Date.now() };
    this.seen.set(m.id, entry);
    // two people looked at the same moment: the younger room gives way to the older one
    if (this.room && this.room.id !== m.id && this.room.state === 'lobby' && (m.born < this.room.born || (m.born === this.room.born && m.id < this.room.id))) this.moveTo(entry);
  }

  isLocal(ip) { return this.addresses().some((a) => a.address === ip) || ip === '127.0.0.1'; }

  beacon() {
    const r = this.room;
    if (r) this.sendUdp({ t: 'room', id: r.id, born: r.born, port: this.port, players: r.players.size, state: r.state });
  }

  moveTo(entry) {
    const r = this.room;
    if (!r) return;
    for (const p of r.connected()) p.sock.send({ t: 'move', ip: entry.lan, port: entry.port, sameHost: this.isLocal(entry.lan) });
    this.closeRoom();
  }

  closeRoom() {
    clearInterval(this.beaconTimer);
    const r = this.room;
    this.room = null;
    if (r) { r.resetLobby(); for (const p of r.connected()) p.sock.close(); }
  }

  openRoom() {
    if (this.room) return this.room;
    this.room = new Room(this);
    this.beaconTimer = setInterval(() => this.beacon(), BEACON_MS);
    this.beacon();
    return this.room;
  }

  // the address others on the network can reach this computer by (virtual adapters tend to end in .1)
  lanAddress() {
    const list = this.addresses().map((a) => a.address), ok = (ip) => !ip.endsWith('.1');
    return list.find((ip) => ip.startsWith('192.168.') && ok(ip)) || list.find(ok) || list[0] || null;
  }

  // ---- "where do I go?"
  async find(preferLocalOnly) {
    if (this.onLan) this.onLan();
    await this.listenUdp();
    if (this.room) return { own: true, room: this.room.id, port: this.port, lan: this.lanAddress() };
    if (!preferLocalOnly) {
      this.sendUdp({ t: 'who' });
      await new Promise((r) => setTimeout(r, LOOK_MS / 2));
      this.sendUdp({ t: 'who' });
      await new Promise((r) => setTimeout(r, LOOK_MS / 2));
    }
    if (this.room) return { own: true, room: this.room.id, port: this.port, lan: this.lanAddress() };
    const now = Date.now(), rooms = [...this.seen.values()].filter((e) => now - e.at < 4000).sort((a, b) => a.born - b.born);
    if (rooms[0]) return { own: false, room: rooms[0].id, ip: rooms[0].lan, port: rooms[0].port, sameHost: this.isLocal(rooms[0].lan) };
    this.openRoom();
    return { own: true, room: this.room.id, port: this.port, lan: this.lanAddress() };
  }

  // ---- a browser connects
  accept(req, sock) {
    if (!fromHere(req.headers.origin, req.headers.host)) { sock.destroy(); return; }
    const ws = acceptUpgrade(req, sock);
    if (!ws) return;
    let p = null;
    const room = () => this.room;
    ws.onclose = () => { if (p && room()) room().remove(p); };
    ws.onmessage = (m) => {
      if (!p) {
        if (m.t !== 'hello') return;
        if (m.ver !== VERSION) { ws.send({ t: 'refused', why: 'Andere Spielversion' }); ws.close(); return; }
        const r = this.openRoom(); // (a room may have just gone away and someone gets here late: he opens the next one)
        p = r.add(ws, m.name);
        return;
      }
      try { if (room()) room().receive(p, m); } catch (e) { console.error('mp: ' + e.message); }
    };
  }
}

module.exports = { Service, VERSION };
