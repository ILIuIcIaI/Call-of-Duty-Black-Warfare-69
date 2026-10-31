import * as THREE from 'three';
import { RARITY, PLATE_ARMOR, MAX_PLATES, MAX_ARMOR } from '../game/loot.js';
import { WEAPONS, OPTICS } from '../weapons/defs.js';
import { clamp } from '../core/math.js';

// =============================================================================
// Warzone HUD: armor and health, plates, players left, zone timer, a loot card with
// a picture of the thing, the big map and the end screen.
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
    this.card.innerHTML = '<div class="pan"><div class="na"></div><div class="cl"></div><i class="dm"></i><canvas class="ic"></canvas><div class="op"></div></div><div class="key"><b>F</b><span></span></div>';
    this.cardIc = this.card.querySelector('.ic'); this.cardKey = this.card.querySelector('.key span');
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
    this.focusObj = null; this.lookedAt = null; this.lookedKind = ''; this.lastCard = ''; this.promptOn = null; this.promptPlaced = false;
    // what is on the card gets its picture once, from its real model
    const s = new THREE.Scene();
    s.add(new THREE.HemisphereLight(0xeef2f8, 0x585048, 2.3));
    const k = new THREE.DirectionalLight(0xfff4e6, 3.2); k.position.set(1, 3, 4); s.add(k);
    const r = new THREE.DirectionalLight(0xa8c4ff, 1.4); r.position.set(-3, 1, 2); s.add(r);
    this.icScene = s; this.icCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 30);
    this.icHolder = new THREE.Group(); s.add(this.icHolder);
    this.icons = new Map();
  }

  show() { this.hudEl.classList.add('br'); }

  dispose() {
    this.hudEl.classList.remove('br');
    for (const n of this.nodes) n.remove();
    if (this.resultEl) this.resultEl.remove();
    if (this.icRT) this.icRT.dispose();
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
    this.promptOn = v && !this.focusObj ? v : null;
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

  // what the player is looking at: a card in the air over the thing itself, gone as soon as the look moves away
  setFocus(f, W) {
    const o = f && f.o;
    this.focusObj = o && !f.far ? o : null;
    this.lookedAt = o || null; this.lookedKind = f ? f.kind : '';
    if (!f) {
      if (this.lastCard !== 'none') { this.card.classList.add('hidden'); this.lastCard = 'none'; if (!this.promptText && !this.promptOn) this.prompt.classList.add('hidden'); }
      return;
    }
    const key = f.kind + '|' + (f.far ? 'far' : 'near') + '|' + (o.weaponId || o.kind) + '|' + (o.optic || '') + '|' + (o.rarity ?? '') + '|' + (o.count || 0);
    if (this.lastCard === key) return;
    if (this.lastCard === 'none' || this.lastCard === '') { this.card.style.animation = 'none'; void this.card.offsetWidth; this.card.style.animation = ''; }
    this.lastCard = key;
    this.prompt.classList.add('hidden');
    this.card.classList.remove('hidden');
    this.card.classList.toggle('far', !!f.far);
    const na = this.card.querySelector('.na'), cl = this.card.querySelector('.cl'), op = this.card.querySelector('.op');
    if (f.kind === 'chest') {
      this.card.style.setProperty('--rar', '#b8913a');
      na.textContent = 'AUSRÜSTUNGSKISTE'; cl.textContent = 'Waffen, Platten, Munition'; op.textContent = '';
      this.cardKey.textContent = 'ÖFFNEN';
    } else if (o.kind === 'weapon') {
      const d = WEAPONS[o.weaponId], R = RARITY[o.rarity], O = OPTICS[o.optic];
      this.card.style.setProperty('--rar', R.color);
      na.textContent = d.name; cl.textContent = d.cls + ' · ' + R.name.charAt(0) + R.name.slice(1).toLowerCase();
      op.textContent = o.optic === 'iron' ? '' : O.name + (O.power === '1x' ? '' : ' ' + O.power);
      this.cardKey.textContent = W.slots[d.slot === 'primary' ? 0 : 1] ? 'TAUSCHEN' : 'AUFHEBEN';
    } else {
      const plate = o.kind === 'plate';
      this.card.style.setProperty('--rar', plate ? '#3aa8c0' : '#c8b060');
      na.textContent = plate ? 'PANZERPLATTE' + ((o.count || 1) > 1 ? ' ×' + o.count : '') : 'MUNITION';
      cl.textContent = plate ? 'Rüstung · fängt ' + PLATE_ARMOR + ' Schaden ab' : 'Zwei Magazine für beide Waffen';
      op.textContent = '';
      this.cardKey.textContent = 'AUFHEBEN';
    }
    this.drawIcon(o, f.kind);
  }

  // the picture on the card: rendered once per kind of thing, side on, in nothing but its own light
  drawIcon(o, kind) {
    const key = kind === 'chest' ? 'chest' : o.kind === 'weapon' ? o.weaponId + '|' + o.optic : o.kind;
    const c = this.cardIc, W = 520, H = 200;
    if (c.width !== W) { c.width = W; c.height = H; }
    let img = this.icons.get(key);
    if (!img) {
      const r = this.game.engine.renderer, rt = this.icRT || (this.icRT = new THREE.WebGLRenderTarget(W, H)), h = this.icHolder, cam = this.icCam;
      h.clear(); h.rotation.set(0, 0, 0);
      const m = this.br.loot.model(o, kind);
      h.add(m);
      if (kind === 'chest') h.rotation.set(0.42, -0.6, 0); else if (o.kind === 'weapon') h.rotation.y = Math.PI / 2; else if (o.kind === 'plate') h.rotation.set(0.1, -0.5, 0.12); else h.rotation.set(0.42, -0.6, 0);
      h.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(h), size = box.getSize(_p), mid = box.getCenter(new THREE.Vector3());
      const k = Math.max(size.x / (W / H), size.y) * 0.54;
      cam.left = -k * W / H; cam.right = k * W / H; cam.top = k; cam.bottom = -k; cam.position.set(mid.x, mid.y, mid.z + 10); cam.lookAt(mid); cam.updateProjectionMatrix();
      const was = r.getRenderTarget(), bg = r.getClearColor(new THREE.Color()), al = r.getClearAlpha();
      r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(); r.render(this.icScene, cam);
      const px = new Uint8Array(W * H * 4); r.readRenderTargetPixels(rt, 0, 0, W, H, px);
      r.setRenderTarget(was); r.setClearColor(bg, al);
      h.clear();
      // (the target holds linear light, upside down)
      img = new ImageData(W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const a = (y * W + x) * 4, b = ((H - 1 - y) * W + x) * 4;
        for (let i = 0; i < 3; i++) img.data[b + i] = 255 * Math.pow(px[a + i] / 255, 1 / 2.2);
        img.data[b + 3] = px[a + 3];
      }
      this.icons.set(key, img);
    }
    c.getContext('2d').putImageData(img, 0, 0);
  }

  // where a point in the world is on the screen; false when it's behind the camera
  toScreen(x, y, z, el, out) {
    _p.set(x, y, z).project(this.game.engine.camera);
    if (_p.z > 1) return false;
    const W = window.innerWidth, H = window.innerHeight, w = el.offsetWidth, h = el.offsetHeight;
    out[0] = clamp((_p.x * 0.5 + 0.5) * W, w / 2 + 10, W - w / 2 - 10);
    out[1] = clamp((0.5 - _p.y * 0.5) * H, h + 10, H - 10);
    return true;
  }
  placeLabels() {
    const o = this.lookedAt;
    if (o && !this.card.classList.contains('hidden')) {
      const lift = this.lookedKind === 'chest' ? 0.92 : 0.74;
      if (this.toScreen(o.x, o.y + lift, o.z, this.card, _xy)) { this.card.style.transform = 'translate(' + _xy[0].toFixed(1) + 'px,' + _xy[1].toFixed(1) + 'px) translate(-50%,-100%)'; this.card.style.visibility = ''; } else this.card.style.visibility = 'hidden';
    }
    const v = this.promptOn;
    if (v && !this.prompt.classList.contains('hidden') && this.toScreen(v.pos.x, v.pos.y + 1.9, v.pos.z, this.prompt, _xy)) {
      this.prompt.style.cssText = 'left:0;top:0;transform:translate(' + _xy[0].toFixed(1) + 'px,' + _xy[1].toFixed(1) + 'px) translate(-50%,-100%)';
      this.promptPlaced = true;
    } else if (this.promptPlaced && !v) { this.prompt.style.cssText = ''; this.promptPlaced = false; }
  }

  // after the world is drawn: the labels stay on what they belong to
  renderPreview() { this.placeLabels(); }

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

const _p = new THREE.Vector3(), _xy = [0, 0];
export { MAX_ARMOR };
