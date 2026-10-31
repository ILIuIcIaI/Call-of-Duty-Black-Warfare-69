import { esc } from '../net/net.js';
import { MAP_LIST } from '../world/maps/index.js';

// =============================================================================
// Multiplayer in the menu: the name, the search for a room, and the room itself: who is there,
// what is being voted on, and the chat. Nobody runs this room, everybody votes.
// =============================================================================
const MODES = [['tdm', 'TEAM DEATHMATCH', 'Zwei Teams, die Karte wird gewählt.'], ['ffa', 'FREE FOR ALL', 'Jeder gegen jeden.'], ['br', 'WARZONE', 'Die Insel Serena. Einer bleibt übrig.']];
const STAGES = { mode: 'WELCHER MODUS?', map: 'WELCHE KARTE?', bots: 'FREIE PLÄTZE MIT BOTS FÜLLEN?' };
const MODE_NAME = { tdm: 'Team Deathmatch', ffa: 'Free for All', br: 'Warzone' };

export class Lobby {
  constructor(game) { this.game = game; this.el = document.getElementById('menu'); this.draft = ''; this.tick = null; this.open = false; this.lastBoard = null; }

  // ---- "what do they call you?"
  ask() {
    const g = this.game, S = g.settings;
    this.open = true;
    this.el.innerHTML = `<div class="menu-bg"></div><div class="menu-inner mp">
      <div class="logo">BLACK WARFARE <b>69</b><small>MULTIPLAYER IM LOKALEN NETZWERK</small></div>
      <div class="mp-name">
        <div class="section-title">WIE WILLST DU HEISSEN?</div>
        <input id="mp-name" maxlength="16" placeholder="Dein Multiplayer-Name" value="${esc(S.mpName || '')}" autocomplete="off" spellcheck="false">
        <div class="hint">Damit siehst du die anderen und sie dich. Gesucht wird ein Raum in deinem Netzwerk. Gibt es noch keinen, machst du ihn auf und alle anderen finden dich.</div>
        <div class="mp-row"><button class="btn" id="mp-go">RAUM SUCHEN</button><button class="btn ghost" id="mp-back">ZURÜCK</button></div>
        <div class="mp-err" id="mp-err">${esc(g.net.error || '')}</div>
      </div></div>`;
    const input = this.el.querySelector('#mp-name'), go = () => {
      const name = input.value.trim();
      if (!name) { input.focus(); this.el.querySelector('#mp-err').textContent = 'Ohne Namen geht es nicht.'; return; }
      S.mpName = name; g.saveSettings();
      g.audio.unlock();
      g.net.onChange = () => this.draw();
      g.net.join(name);
      this.draw();
    };
    input.focus(); input.select();
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') go(); });
    this.el.querySelector('#mp-go').addEventListener('click', () => { g.menu.sfx(); go(); });
    this.el.querySelector('#mp-back').addEventListener('click', () => { g.menu.sfx(); this.close(); g.menu.show('play'); });
  }

  close() { this.open = false; clearInterval(this.tick); this.tick = null; if (this.game.net) this.game.net.onChange = null; }

  // ---- whatever the state is right now
  draw() {
    const g = this.game, net = g.net;
    if (!this.open) return;
    if (net.status === 'off') { clearInterval(this.tick); this.tick = null; this.ask(); return; }
    if (net.status === 'match') { clearInterval(this.tick); this.tick = null; return; }
    if (g.match && g.state !== 'menu') return; // (the end screen is still up)
    if (net.status === 'search') {
      this.el.innerHTML = `<div class="menu-bg"></div><div class="menu-inner mp"><div class="logo">BLACK WARFARE <b>69</b><small>MULTIPLAYER</small></div>
        <div class="mp-search"><div class="mp-dots"></div>SUCHE RAUM IM NETZWERK</div><div class="mp-row"><button class="btn ghost" id="mp-cancel">ABBRECHEN</button></div></div>`;
      this.el.querySelector('#mp-cancel').addEventListener('click', () => { g.menu.sfx(); net.leave(); this.ask(); });
      return;
    }
    this.drawRoom();
  }

  drawRoom() {
    const g = this.game, net = g.net, L = net.lobby;
    if (!L) return;
    // the chat line someone is typing survives the screen being drawn again
    const old = this.el.querySelector('#mp-chat');
    if (old) { this.draft = old.value; this.hadFocus = document.activeElement === old; }
    const you = L.players.find((p) => p.id === net.you), notes = this.notes(L);
    const names = L.players.map((p) => `<div class="mp-p ${p.id === net.you ? 'me' : ''}"><span class="d ${p.voted ? 'on' : ''}"></span>${esc(p.name)}${p.inMatch ? '<i>im Match</i>' : ''}</div>`).join('');
    this.el.innerHTML = `<div class="menu-bg"></div><div class="menu-inner mp room">
      <div class="logo">BLACK WARFARE <b>69</b><small>MULTIPLAYER-LOBBY · ${L.players.length} ${L.players.length === 1 ? 'SPIELER' : 'SPIELER'}</small></div>
      ${this.lastBoardHtml()}
      <div class="mp-grid">
        <div class="mp-col"><div class="section-title">IM RAUM</div><div class="mp-list">${names}</div>
          <div class="hint">${L.players.length < 2 ? 'Noch bist du allein. Wer im selben Netzwerk auf MULTIPLAYER drückt, landet automatisch hier.' : 'Alle stimmen ab, niemand hat das Sagen.'}</div>
          ${notes}
          ${(L.addr || []).length ? `<div class="hint">Findet dich jemand nicht? Im Browser geht auch ${L.addr.map((a) => `<b>http://${esc(a)}</b>`).join(' oder ')}${L.players.length < 2 && !notes ? '. Klappt auch das nicht, trennt das WLAN die Geräte voneinander, wie oft im Gast-WLAN. Dann hilft ein anderes WLAN, ein Handy-Hotspot oder ein Kabel.' : ''}</div>` : ''}
          <div class="mp-row"><button class="btn ghost" id="mp-leave">RAUM VERLASSEN</button></div></div>
        <div class="mp-col wide" id="mp-vote">${this.votePanel(L, you)}</div>
        <div class="mp-col"><div class="section-title">CHAT</div><div class="mp-chatlog" id="mp-log">${net.chat.slice(-60).map((m) => (m.from ? `<div><b>${esc(m.from)}</b> ${esc(m.text)}</div>` : `<div class="sys">${esc(m.text)}</div>`)).join('')}</div>
          <input id="mp-chat" maxlength="160" placeholder="Nachricht, Enter schickt ab" autocomplete="off" spellcheck="false"></div>
      </div></div>`;
    const log = this.el.querySelector('#mp-log'); log.scrollTop = log.scrollHeight;
    const chat = this.el.querySelector('#mp-chat');
    chat.value = this.draft || '';
    if (this.hadFocus) { chat.focus(); chat.setSelectionRange(chat.value.length, chat.value.length); }
    chat.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && chat.value.trim()) { net.say(chat.value); chat.value = ''; this.draft = ''; } });
    chat.addEventListener('input', () => { this.draft = chat.value; });
    this.el.querySelector('#mp-leave').addEventListener('click', () => { g.menu.sfx(); net.leave(); this.lastBoard = null; this.close(); g.menu.show('play'); });
    this.el.querySelectorAll('[data-vote]').forEach((b) => b.addEventListener('click', () => { g.menu.sfx(); net.vote(L.stage, b.dataset.vote); this.myVote = { stage: L.stage, v: b.dataset.vote }; this.drawRoom(); }));
    const rejoin = this.el.querySelector('#mp-rejoin');
    if (rejoin) rejoin.addEventListener('click', () => { g.menu.sfx(); net.rejoin(); });
    const solo = this.el.querySelector('#mp-solo');
    if (solo) solo.addEventListener('click', () => { g.menu.sfx(); net.solo(); });
    const fw = this.el.querySelector('#mp-fw');
    if (fw) fw.addEventListener('click', () => { g.menu.sfx(); this.openFirewall(); });
    if (!this.tick) this.tick = setInterval(() => this.ticks(), 200);
    this.ticks();
  }

  // ---- what stands between the others and this room
  notes(L) {
    const net = this.game.net;
    let out = '';
    // (the firewall of the computer the room is on, and only whoever sits there can do something about it)
    if (L.fw === 'blocked' && net.own && net.onThisPc) {
      out += this.fwState === 'busy' ? '<div class="mp-warn">Windows fragt gerade nach. Bitte dort bestätigen.</div>'
        : this.fwState === 'failed' ? '<div class="mp-warn">Das hat nicht geklappt. Von Hand: Windows-Sicherheit, Firewall- &amp; Netzwerkschutz, Zugriff von Apps durch die Firewall zulassen, dort Node.js für Privat und Öffentlich ankreuzen.<button class="btn" id="mp-fw">NOCHMAL</button></div>'
          : '<div class="mp-warn">Andere PCs kommen vermutlich nicht in diesen Raum: Die Windows-Firewall lässt das Spiel nicht durch.<button class="btn" id="mp-fw">FREIGEBEN</button><small>Gilt nur für Geräte in deinem Netzwerk. Windows fragt einmal nach.</small></div>';
    }
    for (const ip of L.blocked || []) out += `<div class="mp-warn">Auf <b>${esc(ip)}</b> läuft auch ein Raum, aber dieser PC lässt niemanden hinein. Klickt dort auf FREIGEBEN, dann seid ihr automatisch zusammen.</div>`;
    for (const ip of L.foreign || []) out += `<div class="mp-warn">Auf <b>${esc(ip)}</b> läuft eine andere Spielversion. Alle brauchen dieselbe Version.</div>`;
    return out;
  }

  async openFirewall() {
    this.fwState = 'busy'; this.draw();
    let r = null;
    try { r = await (await fetch('/mp/firewall', { method: 'POST' })).json(); } catch (e) { /* the same as a no */ }
    this.fwState = r && r.fw === 'ok' ? null : 'failed';
    this.draw();
  }

  // ---- the clocks run without the screen being drawn again
  ticks() {
    const net = this.game.net, L = net.lobby;
    if (!L) return;
    const gone = performance.now() - (net.lobbyAt || 0), el = this.el.querySelector('#mp-clock');
    if (!el) return;
    if (L.starts > 0) el.textContent = 'START IN ' + Math.max(0, Math.ceil((L.starts - gone) / 1000));
    else if (L.left > 0) el.textContent = 'NOCH ' + Math.max(0, Math.ceil((L.left - gone) / 1000)) + ' SEKUNDEN';
    else el.textContent = '';
  }

  votePanel(L, you) {
    const mine = this.myVote && this.myVote.stage === L.stage && you && you.voted ? this.myVote.v : null;
    const clock = '<div class="mp-clock" id="mp-clock"></div>';
    const summary = () => {
      const c = L.choice, parts = [];
      if (c.mode) parts.push(MODE_NAME[c.mode]);
      if (c.map) parts.push((MAP_LIST.find((m) => m.id === c.map) || { name: c.map }).name);
      if (c.bots) parts.push(c.bots === 'yes' ? 'mit Bots' : 'ohne Bots');
      return parts.length ? `<div class="mp-sum">${parts.map(esc).join(' · ')}</div>` : '';
    };
    if (L.state !== 'lobby') return `<div class="section-title">MATCH LÄUFT</div>${summary()}<div class="hint">${you && you.inMatch ? '' : 'Die anderen spielen gerade. Sobald das Match vorbei ist, geht es hier weiter.'}</div>${L.state === 'match' && L.joinable && you && !you.inMatch ? '<div class="mp-row"><button class="btn" id="mp-rejoin">EINSTEIGEN</button></div>' : ''}`;
    if (L.stage === 'done') {
      return `<div class="section-title">ALLES ENTSCHIEDEN</div>${summary()}${clock}${L.solo ? '<div class="hint">Du bist noch allein. Warte auf andere oder fang schon an.</div><div class="mp-row"><button class="btn" id="mp-solo">ALLEINE STARTEN</button></div>' : ''}`;
    }
    const count = (k) => L.tally[k] || 0, total = L.players.length;
    const bar = (k) => `<span class="n">${esc(count(k))}</span><span class="b" style="width:${total ? Math.min(100, (+count(k) / total) * 100) || 0 : 0}%"></span>`;
    let opts = '';
    if (L.stage === 'mode') opts = MODES.map(([k, n, d]) => `<button class="mp-opt ${mine === k ? 'on' : ''}" data-vote="${k}"><h4>${n}</h4><p>${d}</p>${bar(k)}</button>`).join('');
    else if (L.stage === 'map') opts = MAP_LIST.filter((m) => !m.large).map((m) => `<button class="mp-opt ${mine === m.id ? 'on' : ''}" data-vote="${m.id}"><h4>${esc(m.name)}</h4><p>${esc(m.desc)}</p>${bar(m.id)}</button>`).join('');
    else opts = `<button class="mp-opt ${mine === 'yes' ? 'on' : ''}" data-vote="yes"><h4>MIT BOTS</h4><p>Die freien Plätze füllen Bots auf.</p>${bar('yes')}</button><button class="mp-opt ${mine === 'no' ? 'on' : ''}" data-vote="no"><h4>OHNE BOTS</h4><p>Nur ihr.</p>${bar('no')}</button>`;
    return `<div class="section-title">${STAGES[L.stage]}</div>${summary()}<div class="mp-opts">${opts}</div>${clock}`;
  }

  // the last match stays up here until the next one
  lastBoardHtml() {
    const b = this.lastBoard;
    if (!b) return '';
    return `<div class="mp-last"><b>${esc(b.title)}</b> ${b.rows.slice(0, 4).map((r) => esc(r.name) + ' ' + esc(r.kills)).join(' · ')}</div>`;
  }
}
