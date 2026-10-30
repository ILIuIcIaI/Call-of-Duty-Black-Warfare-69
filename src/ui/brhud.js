import * as THREE from 'three';
import { RARITY, MAX_PLATES, PLATE_ARMOR, MAX_ARMOR } from '../game/loot.js';
import { WEAPONS, OPTICS } from '../weapons/defs.js';
import { buildWeapon, weaponMaterials } from '../weapons/models.js';
import { clamp } from '../core/math.js';

// =============================================================================
// Warzone HUD: armor and health, plates, players left, zone timer, loot card with
// a live 3D preview of the gun, the big map and the end screen.
// =============================================================================
const el = (tag, id, parent, cls) => { const e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; parent.appendChild(e); return e; };

export class BRHud {
  constructor(game, br) {
    this.game = game; this.br = br;
    const hud = this.hudEl = document.getElementById('hud');
    hud.classList.add('br');
    this.nodes = [];
    const add = (id, parent = hud, cls) => { const e = el('div', id, parent, cls); this.nodes.push(e); return e; };
    this.status = add('br-status');
    this.status.innerHTML = '<div class="br-armor"><i></i><i></i><i></i></div><div class="br-health"><b></b></div><div class="br-plates"><span class="ic"></span><span class="n">0</span><span class="k">[G]</span></div>';
    this.armorSeg = [...this.status.querySelectorAll('.br-armor i')];
    this.healthBar = this.status.querySelector('.br-health b');
    this.plateN = this.status.querySelector('.br-plates .n');
    this.bannerEl = add('br-banner');
    this.hintEl = add('br-hint');
    this.prompt = add('br-prompt');
    this.card = add('br-card');
    this.card.innerHTML = '<div class="pv"></div><div class="tx"><div class="ra"></div><div class="na"></div><div class="op"></div><div class="pe"></div><div class="st"></div><div class="key">[F] AUFHEBEN</div></div>';
    this.cardPv = this.card.querySelector('.pv');
    this.progress = add('br-progress'); this.progress.innerHTML = '<span></span><i><b></b></i>';
    this.gas = add('br-gas'); this.gas.innerHTML = '<div>DU BIST IN DER GAS-ZONE<small>Zurück in den sicheren Bereich!</small></div>';
    this.alt = add('br-alt');
    this.veh = add('br-veh'); this.veh.innerHTML = '<div class="na"></div><div class="sp"><b>0</b> km/h</div><i><u></u></i>';
    this.pops = add('br-pops');
    this.mapWrap = el('div', 'br-map', document.getElementById('app')); this.nodes.push(this.mapWrap);
    this.mapWrap.innerHTML = '<canvas></canvas><div class="legend"><span class="lz">Sichere Zone</span><span class="ln">Nächste Zone</span><span class="lp">Du</span><span class="lv">Fahrzeug</span>  ·  [M] schließen</div>';
    this.mapC = this.mapWrap.querySelector('canvas');
    this.mapCtx = this.mapC.getContext('2d');
    this.mapWrap.classList.add('hidden');
    this.gas.classList.add('hidden'); this.card.classList.add('hidden'); this.prompt.classList.add('hidden'); this.progress.classList.add('hidden'); this.veh.classList.add('hidden'); this.alt.classList.add('hidden');
    this.hintT = 0; this.bannerT = 0; this.mapT = 0;
    this.focusObj = null; this.lastCard = '';
    // live preview of the gun on the card
    const s = new THREE.Scene();
    s.background = new THREE.Color(0x0d0f12);
    s.add(new THREE.HemisphereLight(0xdde4ee, 0x302820, 1.5));
    const k = new THREE.DirectionalLight(0xfff0e0, 3); k.position.set(2, 3, 2); s.add(k);
    const r = new THREE.DirectionalLight(0x88aaff, 2); r.position.set(-3, 1, -2); s.add(r);
    this.pvScene = s; this.pvCam = new THREE.PerspectiveCamera(26, 1.5, 0.01, 20);
    this.pvHolder = new THREE.Group(); s.add(this.pvHolder);
    this.pvOn = false; this.pvKey = ''; this.pvT = 0;
  }

  show() { this.hudEl.classList.add('br'); }

  dispose() {
    this.hudEl.classList.remove('br');
    for (const n of this.nodes) n.remove();
    if (this.resultEl) this.resultEl.remove();
    this.pvOn = false;
  }

  banner(text, color = '#fff') { this.bannerEl.textContent = text; this.bannerEl.style.color = color; this.bannerEl.style.opacity = 1; this.bannerT = 3.2; }
  hint(text, t = 8) { this.hintEl.textContent = text; this.hintEl.style.opacity = 1; this.hintT = t; }
  pop(text, color = '#fff') {
    const d = document.createElement('div'); d.textContent = text; d.style.color = color;
    this.pops.prepend(d);
    while (this.pops.children.length > 4) this.pops.lastChild.remove();
    setTimeout(() => d.remove(), 1900);
  }
  setGas(on) { this.gas.classList.toggle('hidden', !on); }
  setAltitude(a) {
    this.alt.classList.toggle('hidden', a === null);
    if (a !== null) this.alt.textContent = Math.max(0, Math.round(a)) + ' m';
  }
  setProgress(k, label) {
    this.progress.classList.toggle('hidden', !k);
    if (k) { this.progress.firstChild.textContent = label; this.progress.querySelector('b').style.width = (k * 100).toFixed(0) + '%'; }
  }
  // black bars and a graded picture while a finisher plays
  setCine(on, name = '') {
    if (!this.cine) {
      this.cine = document.createElement('div'); this.cine.id = 'br-cine';
      this.cine.innerHTML = '<div class="v"></div><div class="b t"></div><div class="b u"></div><div class="n"></div><div class="f"></div>';
      document.getElementById('app').appendChild(this.cine); this.nodes.push(this.cine);
    }
    document.body.classList.toggle('cine', !!on);
    if (on) this.cine.querySelector('.n').textContent = name;
  }
  cineFlash() {
    const f = this.cine && this.cine.querySelector('.f');
    if (!f) return;
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  }
  // a hint in the prompt spot, unless a vehicle or chest already speaks there
  setPromptText(text) {
    if (this.promptText === text) return;
    this.promptText = text;
    if (this.focusObj) return;
    this.prompt.classList.toggle('hidden', !text);
    if (text) this.prompt.textContent = text;
  }
  // on the ground: null ends it, otherwise { hp, revive, holding } (0..1)
  setDowned(d) {
    if (!this.down) {
      const app = this.hudEl;
      this.down = document.createElement('div'); this.down.id = 'br-down'; this.down.className = 'hidden';
      this.down.innerHTML = '<div class="t">AM BODEN</div><div class="bl"><b></b></div><div class="key"></div><div class="rv"><b></b></div>';
      app.appendChild(this.down); this.nodes.push(this.down);
      this.downBleed = this.down.querySelector('.bl b'); this.downRev = this.down.querySelector('.rv b'); this.downKey = this.down.querySelector('.key');
      this.downRevWrap = this.down.querySelector('.rv');
    }
    this.down.classList.toggle('hidden', !d);
    if (!d) return;
    this.downBleed.style.transform = 'scaleX(' + d.hp.toFixed(3) + ')';
    this.downRev.style.transform = 'scaleX(' + Math.min(1, d.revive).toFixed(3) + ')';
    this.downRevWrap.style.opacity = d.revive > 0 ? 1 : 0;
    const txt = d.holding ? 'SELBST-REVIVE LÄUFT · NICHT LOSLASSEN' : '[F] HALTEN: SELBST WIEDERBELEBEN';
    if (this.downKey.textContent !== txt) this.downKey.textContent = txt;
  }
  setVehiclePrompt(v) {
    if (this.focusObj) return;
    this.prompt.classList.toggle('hidden', !v && !this.promptText);
    if (v) this.prompt.textContent = '[F] Einsteigen · ' + v.def.name;
    else if (this.promptText) this.prompt.textContent = this.promptText;
  }
  setVehicle(v) {
    this.veh.classList.toggle('hidden', !v);
    if (!v) return;
    this.veh.querySelector('.na').textContent = v.def.name;
    this.veh.querySelector('b').textContent = Math.round(v.speed * 3.6);
    this.veh.querySelector('u').style.width = clamp(v.hp / v.def.hp * 100, 0, 100) + '%';
  }

  // what the player is looking at: the Warzone-style card
  setFocus(f, W) {
    const o = f && f.o;
    this.focusObj = o || null;
    if (!f) {
      if (this.lastCard !== 'none') { this.card.classList.add('hidden'); this.prompt.classList.add('hidden'); this.pvOn = false; this.lastCard = 'none'; }
      return;
    }
    if (f.kind === 'chest') {
      if (this.lastCard !== 'chest') { this.card.classList.add('hidden'); this.pvOn = false; this.prompt.classList.remove('hidden'); this.prompt.textContent = '[F] Kiste öffnen'; this.lastCard = 'chest'; }
      return;
    }
    const key = f.kind + '|' + (o.weaponId || o.kind) + '|' + (o.optic || '') + '|' + (o.rarity ?? '') + '|' + (o.count || 0);
    if (this.lastCard === key) return;
    this.lastCard = key;
    this.prompt.classList.add('hidden');
    this.card.classList.remove('hidden');
    const ra = this.card.querySelector('.ra'), na = this.card.querySelector('.na'), op = this.card.querySelector('.op'), pe = this.card.querySelector('.pe'), st = this.card.querySelector('.st');
    if (o.kind === 'weapon') {
      const d = WEAPONS[o.weaponId], R = RARITY[o.rarity], O = OPTICS[o.optic];
      this.card.style.setProperty('--rar', R.color);
      this.card.classList.remove('small');
      ra.textContent = R.name + ' · ' + d.cls.toUpperCase(); na.textContent = d.name;
      op.textContent = 'Visier: ' + O.name + (O.power === '1x' ? '' : ' (' + O.power + ')');
      pe.textContent = R.perk;
      const slot = d.slot === 'primary' ? 0 : 1, cur = W.slots[slot];
      st.textContent = cur ? 'Ersetzt: ' + cur.def.name : (slot ? 'Sekundärwaffe' : 'Primärwaffe · Platz ist frei');
      this.setPreview(o);
    } else {
      this.pvOn = false;
      this.card.classList.add('small');
      const plate = o.kind === 'plate';
      this.card.style.setProperty('--rar', plate ? '#46c8e0' : '#e8d890');
      ra.textContent = plate ? 'RÜSTUNG' : 'MUNITION';
      na.textContent = plate ? 'PANZERPLATTE' + ((o.count || 1) > 1 ? ' x' + o.count : '') : 'MUNITIONSKISTE';
      op.textContent = plate ? 'Fängt ' + PLATE_ARMOR + ' Schaden ab. Bis zu ' + MAX_PLATES + ' tragbar.' : 'Zwei Magazine für beide Waffen.';
      pe.textContent = ''; st.textContent = '';
    }
  }

  setPreview(o) {
    const key = o.weaponId + '|' + o.optic;
    if (this.pvKey !== key) {
      this.pvKey = key;
      const h = this.pvHolder; h.clear();
      const w = buildWeapon(WEAPONS[o.weaponId].model, o.optic, weaponMaterials(this.game.tex));
      w.root.traverse((m) => { if (m.material && m.material.isMeshBasicMaterial && !m.material.map) m.visible = false; });
      h.add(w.root);
      const box = new THREE.Box3().setFromObject(w.root), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      w.root.position.set(-c.x, -c.y, -c.z);
      h.scale.setScalar(clamp(1.0 / size.z, 0.5, 2.6));
    }
    this.pvOn = true;
  }

  // after the world is drawn: the gun on the card
  renderPreview(dt) {
    if (!this.pvOn || this.card.classList.contains('hidden')) return;
    const r = this.game.engine.renderer, b = this.cardPv.getBoundingClientRect(), H = window.innerHeight;
    if (b.width < 4) return;
    this.pvT += dt;
    const cam = this.pvCam;
    cam.aspect = b.width / b.height; cam.updateProjectionMatrix();
    cam.position.set(0, 0.1, 1.9); cam.lookAt(0, 0, 0);
    this.pvHolder.rotation.y = Math.PI / 2 + Math.sin(this.pvT * 0.8) * 0.5;
    r.clearDepth();
    r.setScissorTest(true);
    r.setViewport(b.left, H - b.bottom, b.width, b.height); r.setScissor(b.left, H - b.bottom, b.width, b.height);
    r.render(this.pvScene, cam);
    r.setScissorTest(false);
    r.setViewport(0, 0, window.innerWidth, H);
  }

  update(dt) {
    const g = this.game, p = g.player, br = this.br, z = br.zone;
    // ---- armor + health
    for (let i = 0; i < 3; i++) {
      const k = clamp(((p.armor || 0) - i * PLATE_ARMOR) / PLATE_ARMOR, 0, 1);
      this.armorSeg[i].style.setProperty('--k', k.toFixed(3));
    }
    this.healthBar.style.width = clamp(p.health / p.maxHealth * 100, 0, 100) + '%';
    this.healthBar.classList.toggle('low', p.health < p.maxHealth * 0.35);
    this.plateN.textContent = p.plates || 0;
    // ---- zone timer
    const sb = document.getElementById('sb-mode');
    const txt = z.phase >= 6 ? 'LETZTE ZONE' : z.mode === 'wait' ? 'ZONE SCHRUMPFT IN' : 'ZONE SCHRUMPFT';
    if (sb.textContent !== txt) sb.textContent = txt;
    document.getElementById('sb-timer').classList.toggle('urgent', z.mode === 'shrink');
    // ---- fading messages
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT < 0.6) this.bannerEl.style.opacity = Math.max(0, this.bannerT / 0.6); }
    if (this.hintT > 0) { this.hintT -= dt; if (this.hintT < 0.6) this.hintEl.style.opacity = Math.max(0, this.hintT / 0.6); }
    // ---- weapon rarity on the ammo counter
    const W = g.weapons, rw = W.w && W.w.def.rarity;
    const ammoName = document.getElementById('ammo-weapon');
    const col = rw ? RARITY[rw].color : '';
    if (ammoName.style.color !== col) ammoName.style.color = col;
    // ---- map
    const open = br.mapOpen;
    this.mapWrap.classList.toggle('hidden', !open);
    if (open) { this.mapT -= dt; if (this.mapT <= 0) { this.mapT = 0.1; this.drawMap(); } }
  }

  drawMap() {
    const g = this.game, p = g.player, br = this.br, z = br.zone, hud = g.hud;
    const c = this.mapC, S = Math.round(Math.min(window.innerHeight * 0.88, window.innerWidth * 0.8));
    if (c.width !== S) { c.width = S; c.height = S; c.style.width = S + 'px'; c.style.height = S + 'px'; }
    const x = this.mapCtx, size = g.mapDef.terrain.size, ox = g.mapDef.terrain.ox, oz = g.mapDef.terrain.oz;
    const view = 1120, q = S / view, off = (size - view) / 2;
    const sx = (v) => (v - ox - off) * q, sz = (v) => (v - oz - off) * q;
    const img = hud.mmImg, k = img.width / size;
    x.drawImage(img, off * k, off * k, view * k, view * k, 0, 0, S, S);
    // gas: everything outside the current circle turns red
    x.save();
    x.fillStyle = 'rgba(190,50,20,0.42)';
    x.beginPath(); x.rect(0, 0, S, S); x.arc(sx(z.cur.x), sz(z.cur.z), Math.max(0, z.cur.r) * q, 0, Math.PI * 2, true); x.fill();
    x.restore();
    x.lineWidth = 2.5; x.strokeStyle = '#ff6a2a';
    x.beginPath(); x.arc(sx(z.cur.x), sz(z.cur.z), Math.max(0.1, z.cur.r) * q, 0, Math.PI * 2); x.stroke();
    if (z.phase < 6) {
      x.lineWidth = 2; x.strokeStyle = '#fff'; x.setLineDash([]);
      x.beginPath(); x.arc(sx(z.next.x), sz(z.next.z), Math.max(0.1, z.next.r) * q, 0, Math.PI * 2); x.stroke();
    }
    // flight path while it matters
    if (br.playerState === 'plane' || br.playerState === 'fall') {
      const F = br.flight;
      x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 2; x.setLineDash([10, 8]);
      x.beginPath(); x.moveTo(sx(F.a.x), sz(F.a.z)); x.lineTo(sx(F.a.x + F.dir.x * F.len), sz(F.a.z + F.dir.z * F.len)); x.stroke();
      x.setLineDash([]);
    }
    // place names
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `700 ${Math.max(11, Math.round(S * 0.0165))}px Rajdhani, sans-serif`;
    for (const P of Object.values(g.mapDef.places)) {
      x.strokeStyle = 'rgba(0,0,0,0.8)'; x.lineWidth = 3.5;
      x.strokeText(P.name, sx(P.x), sz(P.z));
      x.fillStyle = P.big ? '#ffe9b8' : '#fff';
      x.fillText(P.name, sx(P.x), sz(P.z));
    }
    // vehicles
    for (const v of br.vehicles.list) {
      if (v.dead) continue;
      x.fillStyle = '#7fd4ff'; x.strokeStyle = 'rgba(0,0,0,0.7)'; x.lineWidth = 1.5;
      x.beginPath(); x.rect(sx(v.pos.x) - 3.5, sz(v.pos.z) - 2.5, 7, 5); x.fill(); x.stroke();
    }
    // you
    const px = sx(p.pos.x), pz = sz(p.pos.z);
    x.save(); x.translate(px, pz); x.rotate(-p.yaw);
    x.fillStyle = '#ffd04a'; x.strokeStyle = '#000'; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(0, -11); x.lineTo(8, 8); x.lineTo(0, 4); x.lineTo(-8, 8); x.closePath(); x.fill(); x.stroke();
    x.restore();
  }

  result(won, place, kills) {
    const app = document.getElementById('menu');
    const g = this.game;
    app.innerHTML = '<div class="menu-bg"></div>';
    const d = this.resultEl = document.createElement('div');
    d.id = 'br-result';
    d.innerHTML = `<div class="logo" style="color:${won ? 'var(--accent)' : '#fff'}">${won ? 'SIEG' : 'PLATZ ' + place}<small>${won ? 'LETZTER ÜBERLEBENDER VON 20' : 'VON 20 SPIELERN'}</small></div>
      <div class="rs"><div><b>${kills}</b><span>KILLS</span></div><div><b>${place}</b><span>PLATZ</span></div><div><b>${Math.floor(g.time / 60)}:${String(Math.floor(g.time % 60)).padStart(2, '0')}</b><span>ÜBERLEBT</span></div></div>
      <div class="bt"><button class="btn" id="br-again">NOCHMAL</button><button class="btn ghost" id="br-home">HAUPTMENÜ</button></div>`;
    app.appendChild(d);
    d.querySelector('#br-again').addEventListener('click', () => { g.audio.play('uiClick', { vol: 0.4 }); g.restartWarzone(); });
    d.querySelector('#br-home').addEventListener('click', () => { g.audio.play('uiClick', { vol: 0.4 }); g.quitToMenu(); });
  }
}

export { MAX_ARMOR };
