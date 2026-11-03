import * as THREE from 'three';
import { WEAPONS, PRIMARIES, SECONDARIES, OPTICS, opticFits } from '../weapons/defs.js';
import { MAP_LIST } from '../world/maps/index.js';
import { QUALITY } from '../core/engine.js';
import { weaponMaterials } from '../weapons/models.js';
import { SKINS, SKIN_IDS, skinOf, buildSkinned } from '../weapons/skins.js';
import { esc } from '../net/net.js';
import { pointsOf } from '../game/points.js';

// =============================================================================
// Main menu, loadout editor (with live 3D weapon preview), settings, pause menu
// and end-of-match screen. Plain DOM.
// =============================================================================
const DIFFS = [['recruit', 'Rekrut'], ['regular', 'Regulär'], ['hardened', 'Veteran'], ['elite', 'Elite']];

export class Menu {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('menu');
    this.tab = 'play';
    this.preview = null;
    this.focus = 'primary'; // which loadout slot the preview and the stats panel show
  }

  sfx(n = 'uiClick') { this.game.audio.play(n, { vol: 0.35 }); }

  show(tab = this.tab, mode = 'main') {
    this.tab = tab; this.mode = mode;
    const g = this.game, S = g.settings;
    const tabs = mode === 'pause'
      ? (g.br || (g.match && g.match.gun) ? [['resume', 'FORTSETZEN'], ['settings', 'EINSTELLUNGEN'], ['controls', 'STEUERUNG'], ['quit', 'MATCH VERLASSEN']] : [['resume', 'FORTSETZEN'], ['loadout', 'LOADOUT'], ['settings', 'EINSTELLUNGEN'], ['controls', 'STEUERUNG'], ['quit', 'MATCH VERLASSEN']])
      : [['play', 'SPIELEN'], ['warzone', 'WARZONE'], ['multi', 'MULTIPLAYER'], ['loadout', 'LOADOUT'], ['settings', 'EINSTELLUNGEN'], ['controls', 'STEUERUNG'], ...(window.desktop ? [['exit', 'BEENDEN']] : [])];
    let body = '';
    if (tab === 'play') body = this.playTab();
    else if (tab === 'warzone') body = this.warzoneTab();
    else if (tab === 'loadout') body = this.loadoutTab();
    else if (tab === 'settings') body = this.settingsTab();
    else if (tab === 'controls') body = this.controlsTab();
    this.el.innerHTML = `<div class="menu-bg"></div><div class="menu-inner">
      <div class="logo">BLACK WARFARE <b>69</b><small>${mode === 'pause' ? 'PAUSIERT' : 'MULTIPLAYER · BOTS'}</small></div>
      <div class="tabs">${tabs.map(([k, n]) => `<button class="tab ${k === tab ? 'active' : ''}" data-tab="${k}">${n}</button>`).join('')}</div>
      <div class="tab-body ${tab}">${body}</div></div>`;
    this.el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      const t = b.dataset.tab;
      this.sfx();
      if (t === 'resume') return g.resume();
      if (t === 'quit') return g.quitToMenu();
      if (t === 'multi') return g.lobby.ask();
      if (t === 'exit') return window.desktop.quit(); // (the Windows app: a program has a way out)
      this.show(t, this.mode);
    }));
    this.bind();
    this.setPreview(tab === 'loadout');
    S.match = S.match; g.saveSettings();
  }

  hide() { this.el.innerHTML = ''; this.setPreview(false); }

  // ------------------------------------------------------------------ tabs
  playTab() {
    const m = this.game.settings.match, wing = m.mode === 'wing';
    // Wingman only where the map has its two points
    const list = wing ? MAP_LIST.filter((d) => pointsOf(d)) : MAP_LIST;
    if (!list.some((d) => d.id === m.map)) { m.map = list[0].id; this.game.loadMenuMap(m.map); }
    const maps = list.map((d) => `<div class="card map-card ${m.map === d.id ? 'sel' : ''}" data-map="${d.id}">
      <canvas data-mapprev="${d.id}" width="260" height="130"></canvas><h4>${d.name}</h4><span class="tag">${d.size}</span><p>${d.desc}</p></div>`).join('');
    return `<div class="section-title">KARTE</div><div class="row">${maps}</div>
      <div class="section-title">MODUS</div>
      <div class="seg" data-seg="mode"><button data-v="tdm" class="${m.mode === 'tdm' ? 'on' : ''}">TEAM DEATHMATCH</button><button data-v="ffa" class="${m.mode === 'ffa' ? 'on' : ''}">FREE FOR ALL</button><button data-v="gun" class="${m.mode === 'gun' ? 'on' : ''}">GUN GAME</button><button data-v="wing" class="${wing ? 'on' : ''}">WINGMAN</button></div>
      <div class="hint">${m.mode === 'tdm' ? 'Bots werden auf dein Team und das Gegnerteam verteilt (Gegner bekommen bei ungerader Zahl einen mehr).' : m.mode === 'gun' ? 'Wettrüsten: Jeder gegen jeden, jeder Kill bringt die nächste Waffe. 14 Waffen, zuletzt das Messer: Wer damit einen Kill macht, gewinnt. Wer im Nahkampf stirbt, fällt eine Stufe zurück. Jede Waffe kommt mit einem zufälligen Skin.' : wing ? '2 gegen 2: ein Bot an deiner Seite, zwei Gegner. Auf der Karte stehen die Punkte A und B: Stell dich in den Kreis, um ihn einzunehmen. Wer beide Punkte hält, gewinnt sofort. Nach 7 Minuten gewinnt das Team mit mehr Kills. Respawns ohne Ende.' : 'Jeder gegen jeden — alle Bots sind deine Gegner.'}</div>
      <div class="section-title">BOTS</div>
      ${wing ? '' : `<div class="opt"><label>Anzahl Bots</label><input type="range" min="1" max="8" step="1" value="${m.bots}" data-range="bots"><span class="val" id="v-bots">${m.bots}</span></div>`}
      <div class="opt"><label>Schwierigkeit</label><div class="seg" data-seg="difficulty">${DIFFS.map(([k, n]) => `<button data-v="${k}" class="${m.difficulty === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>
      <div style="margin-top:22px"><button class="btn" id="start-btn">MATCH STARTEN</button></div>`;
  }

  warzoneTab() {
    const m = this.game.settings.match;
    const li = (a, b) => `<li><b>${a}</b>${b}</li>`;
    return `<div class="wz">
      <h2>BATTLE ROYALE AUF DER INSEL SERENA</h2>
      <p>20 Spieler springen aus einem Flugzeug über der Insel ab. Du landest nur mit einer einfachen Pistole. Suche Waffen und Platten, weiche der Zone aus und bleib als Letzter übrig.</p>
      <ul>
        ${li('Absprung', 'Gleiter steuern und mit der Sekundärwaffe schießen, während du hängst')}
        ${li('Beute', 'Kisten und Bodenfunde: jede Waffe mit jedem Visier und jedem Skin, in fünf Seltenheitsstufen')}
        ${li('Rüstung', 'Bis zu 5 Platten tragen, 3 gleichzeitig einsetzen')}
        ${li('Fahrzeuge', 'Kleinwagen, Limousine, Pickup, Jeep und Geländewagen')}
        ${li('Zone', 'Sie schrumpft in Etappen, außerhalb verlierst du Leben')}
      </ul>
      <div class="opt"><label>Schwierigkeit der Bots</label><div class="seg" data-seg="difficulty">${DIFFS.map(([k, n]) => `<button data-v="${k}" class="${m.difficulty === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>
      <div style="margin-top:18px"><button class="btn" id="wz-start">WARZONE STARTEN</button></div>
      </div>`;
  }

  loadoutTab() {
    const lo = this.game.settings.loadout;
    const card = (id, sel, attr) => {
      const d = WEAPONS[id];
      return `<div class="card wcard ${sel ? 'sel' : ''}" data-${attr}="${id}"><span class="tag">${d.cls.toUpperCase()}</span><h4>${d.name}</h4></div>`;
    };
    // the optics this gun takes, and what the chosen one does and fits on
    const optics = (id, cur, seg) => {
      const def = WEAPONS[id], o = OPTICS[cur] || OPTICS[def.optics[0]];
      const btns = def.optics.map((k) => `<button data-v="${k}" class="${cur === k ? 'on' : ''}">${OPTICS[k].name}${OPTICS[k].power === '1x' ? '' : ' ' + OPTICS[k].power}</button>`).join('');
      return `<div class="seg wrap" data-seg="${seg}">${btns}</div>
        <div class="hint optic-hint">${o.desc}${cur === 'iron' ? '' : ` <b>Passt auf:</b> ${opticFits(cur).join(', ')}`}</div>`;
    };
    // the skin of this gun: stays with the gun, also when another one is chosen for a while
    const skins = (id, seg) => {
      const cur = skinOf(this.game.settings.skins[id]);
      return `<div class="seg wrap skins" data-seg="${seg}">${SKIN_IDS.map((k) => `<button data-v="${k}" class="${cur === k ? 'on' : ''}"><i style="background:${SKINS[k].swatch}"></i>${SKINS[k].name}</button>`).join('')}</div>`;
    };
    const f = this.focus === 'secondary' ? [lo.secondary, lo.secondaryOptic] : [lo.primary, lo.primaryOptic];
    const d = WEAPONS[f[0]], fo = OPTICS[f[1]] || OPTICS[d.optics[0]], fs = SKINS[skinOf(this.game.settings.skins[f[0]])];
    const stat = (n, v) => `<div class="stat"><span>${n}</span><i><b style="width:${v}%"></b></i></div>`;
    return `<div class="section-title">PRIMÄRWAFFE</div><div class="wgrid">${PRIMARIES.map((id) => card(id, lo.primary === id, 'prim')).join('')}</div>
      <div class="section-title">VISIER</div>${optics(lo.primary, lo.primaryOptic, 'optic')}
      <div class="section-title">SKIN</div>${skins(lo.primary, 'skin')}
      <div class="section-title">SEKUNDÄRWAFFE</div><div class="wgrid">${SECONDARIES.map((id) => card(id, lo.secondary === id, 'sec')).join('')}</div>
      <div class="section-title">VISIER</div>${optics(lo.secondary, lo.secondaryOptic, 'optic2')}
      <div class="section-title">SKIN</div>${skins(lo.secondary, 'skin2')}
      ${this.mode === 'pause' ? '<div style="margin-top:18px"><button class="btn" id="resume-btn">WEITERSPIELEN</button></div><div class="hint">Die Waffen werden sofort getauscht, wenn du weiterspielst ([L] oder [Esc]). Tot: beim Respawn.</div>' : ''}
      <div class="wstats"><span class="tag">${d.cls.toUpperCase()}</span><h4>${d.name}</h4>
        <div class="wstats-optic">${fo.name} · ${fo.power} · ${fs.name}</div>
        ${stat('SCHADEN', d.stats.dmg)}${stat('FEUERRATE', d.stats.rof)}${stat('REICHWEITE', d.stats.rng)}${stat('PRÄZISION', d.stats.acc)}${stat('MOBILITÄT', d.stats.mob)}${stat('HANDLING', d.stats.hnd)}</div>`;
  }

  settingsTab() {
    const S = this.game.settings, E = this.game.engine;
    const q = [['auto', 'Auto'], ...Object.entries(QUALITY).map(([k, v]) => [k, v.label])].map(([k, n]) => `<button data-v="${k}" class="${(S.quality || 'auto') === k ? 'on' : ''}">${n}</button>`).join('');
    // what the picture is made with right now, and whether a change waits for a restart
    const now = (S.quality || 'auto') === 'auto' ? (E.auto ? E.qid : null) : S.quality;
    const pending = now !== E.qid || ((S.quality || 'auto') === 'auto') !== E.auto;
    // "ANGLE (NVIDIA, NVIDIA GeForce ... (0x2C05) Direct3D11 vs_5_0 ps_5_0, D3D11)" -> the chip's name
    const chip = (s) => (!/^ANGLE \(/.test(s) ? s : s.replace(/^ANGLE \([^,]+, /, '').replace(/ \(0x[0-9a-f]+\).*$/i, '').replace(/ (Direct3D|OpenGL|Vulkan|vs_\d).*$/i, '').replace(/(, [^,]*)?\)$/, ''));
    const gpu = !E.gpu ? '' : /swiftshader|llvmpipe|basic render/i.test(E.gpu) ? 'kein Grafikchip, der Prozessor zeichnet' : esc(chip(E.gpu));
    const autoHint = E.auto && (S.quality || 'auto') === 'auto' ? `Automatisch gewählt: <b>${QUALITY[E.qid].label}</b>${gpu ? ' · ' + gpu : ''}.` : '';
    const canReload = this.mode !== 'pause' && (!this.game.net || this.game.net.status === 'off');
    const restart = pending ? `<div class="hint">Die neue Grafikstufe gilt ab dem nächsten Start.${canReload ? ' <button class="btn small" id="gfx-reload">JETZT ÜBERNEHMEN</button>' : ''}</div>` : '';
    const tog = (key, label) => `<div class="opt"><label>${label}</label><div class="seg" data-toggle="${key}"><button data-v="1" class="${S[key] ? 'on' : ''}">AN</button><button data-v="0" class="${!S[key] ? 'on' : ''}">AUS</button></div></div>`;
    return `<div class="section-title">MAUS</div>
      <div class="opt"><label>Empfindlichkeit</label><input type="range" min="0.5" max="12" step="0.1" value="${S.sensitivity}" data-range="sensitivity"><span class="val" id="v-sensitivity">${S.sensitivity}</span></div>
      <div class="opt"><label>ADS-Multiplikator</label><input type="range" min="0.3" max="1.5" step="0.05" value="${S.adsSens}" data-range="adsSens"><span class="val" id="v-adsSens">${S.adsSens}</span></div>
      ${tog('invertY', 'Y-Achse invertieren')}
      <div class="section-title">BILD</div>
      <div class="opt"><label>Sichtfeld (FOV)</label><input type="range" min="80" max="120" step="1" value="${S.fov}" data-range="fov"><span class="val" id="v-fov">${S.fov}</span></div>
      <div class="opt"><label>Grafikqualität</label><div class="seg" data-seg="quality">${q}</div></div>
      ${autoHint ? `<div class="hint">${autoHint}</div>` : ''}${restart}
      ${tog('dynamicRes', 'Dynamische Auflösung')}
      ${tog('showFps', 'FPS anzeigen')}
      <div class="hint">Toaster ist für sehr schwache PCs: kleinere Auflösung, einfache Figuren auf Distanz, keine Schatten. Dynamische Auflösung senkt automatisch die Renderauflösung, wenn die FPS einbrechen.</div>
      <div class="section-title">SPIEL</div>
      ${tog('autoSprint', 'Auto-Sprint')}
      <div class="opt"><label>Lautstärke</label><input type="range" min="0" max="1" step="0.05" value="${S.volume}" data-range="volume"><span class="val" id="v-volume">${S.volume}</span></div>`;
  }

  controlsTab() {
    const rows = [
      ['W A S D', 'Bewegen'], ['Maus', 'Umsehen'], ['Linke Maustaste', 'Schießen'], ['Rechte Maustaste', 'Zielen (ADS)'],
      ['Shift', 'Sprinten · nochmal drücken = Taktik-Sprint'], ['Leertaste', 'Springen · Mantle · Wall-Jump (in der Luft an Wand)'],
      ['C / Strg', 'Ducken · halten = Hinlegen · beim Sprint: tippen = Slide, halten = Slide + Hechtsprung · in der Luft = in die Luft legen, landet liegend'],
      ['Z / X', 'Hinlegen · beim Sprint = Dive (rückwärts = Rückenlage)'],
      ['Shift (liegend)', 'Sofort aufstehen und losrennen'], ['Umsehen (liegend)', '360° · hinter dich schauen = auf den Rücken rollen'],
      ['Springen im Slide', 'Slide-Cancel (behält Schwung, lädt Taktik-Sprint auf)'], ['R', 'Nachladen'], ['1 / 2 / Q / Mausrad', 'Waffe wechseln'], ['V / E', 'Nahkampf'],
      ['Zielen + W gegen Kante', 'Andocken: Waffe auflegen, weniger Rückstoß, an Ecken lehnst du dich heraus'], ['T', 'Andocken von Hand an / aus'],
      ['I', 'Waffe inspizieren'], ['Tab', 'Punktetafel'], ['L', 'Loadout ändern (auch mitten in der Runde)'], ['Esc', 'Pause'],
      ['F', 'Warzone: aufheben, Kiste öffnen, ein- und aussteigen'], ['G', 'Warzone: Platte einsetzen'], ['M', 'Warzone: große Karte'], ['V', 'Warzone, im Fahrzeug: Kamera wechseln'],
    ];
    return `<div class="section-title">STEUERUNG</div><div class="controls">${rows.map(([k, v]) => `<b>${k}</b><span>${v}</span>`).join('')}</div>`;
  }

  // ------------------------------------------------------------------ bindings
  bind() {
    const g = this.game, S = g.settings, el = this.el;
    el.querySelectorAll('[data-map]').forEach((c) => c.addEventListener('click', () => { S.match.map = c.dataset.map; this.sfx(); g.saveSettings(); g.loadMenuMap(S.match.map); this.show('play'); }));
    el.querySelectorAll('[data-seg]').forEach((seg) => seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const k = seg.dataset.seg, v = b.dataset.v;
      this.sfx();
      if (k === 'mode' || k === 'difficulty') S.match[k] = v;
      else if (k === 'optic') { S.loadout.primaryOptic = v; this.focus = 'primary'; }
      else if (k === 'optic2') { S.loadout.secondaryOptic = v; this.focus = 'secondary'; }
      else if (k === 'skin') { S.skins[S.loadout.primary] = v; this.focus = 'primary'; }
      else if (k === 'skin2') { S.skins[S.loadout.secondary] = v; this.focus = 'secondary'; }
      else if (k === 'quality') { S.quality = v; S.qualityPicked = true; S.autoDown = null; }
      g.saveSettings();
      this.show(this.tab, this.mode);
    })));
    el.querySelectorAll('[data-toggle]').forEach((seg) => seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      S[seg.dataset.toggle] = b.dataset.v === '1'; this.sfx(); g.saveSettings(); this.show(this.tab, this.mode);
    })));
    el.querySelectorAll('[data-range]').forEach((r) => r.addEventListener('input', () => {
      const k = r.dataset.range, v = parseFloat(r.value);
      if (k === 'bots') S.match.bots = v; else S[k] = v;
      const out = document.getElementById('v-' + k); if (out) out.textContent = v;
      if (k === 'volume') g.audio.setVolume(v);
      g.saveSettings();
    }));
    el.querySelectorAll('[data-prim]').forEach((c) => c.addEventListener('click', () => {
      S.loadout.primary = c.dataset.prim;
      const d = WEAPONS[S.loadout.primary];
      if (!d.optics.includes(S.loadout.primaryOptic)) S.loadout.primaryOptic = d.optics.includes('reflex') ? 'reflex' : d.optics[0];
      this.focus = 'primary';
      this.sfx(); g.saveSettings(); this.show('loadout', this.mode);
    }));
    el.querySelectorAll('[data-sec]').forEach((c) => c.addEventListener('click', () => {
      S.loadout.secondary = c.dataset.sec;
      if (!WEAPONS[c.dataset.sec].optics.includes(S.loadout.secondaryOptic)) S.loadout.secondaryOptic = 'iron';
      this.focus = 'secondary';
      this.sfx(); g.saveSettings(); this.show('loadout', this.mode);
    }));
    el.querySelectorAll('.card, .btn, .seg button, .tab').forEach((c) => c.addEventListener('mouseenter', () => this.sfx('uiHover')));
    const res = el.querySelector('#resume-btn');
    if (res) res.addEventListener('click', () => { this.sfx(); g.resume(); });
    const gfx = el.querySelector('#gfx-reload');
    if (gfx) gfx.addEventListener('click', () => { g.saveSettings(); location.reload(); });
    const start = el.querySelector('#start-btn');
    if (start) start.addEventListener('click', () => { this.sfx(); g.beginMatch(); });
    const wz = el.querySelector('#wz-start');
    if (wz) wz.addEventListener('click', () => { this.sfx(); g.beginWarzone(); });
    el.querySelectorAll('[data-mapprev]').forEach((c) => this.drawMapPreview(c, c.dataset.mapprev));
  }

  drawMapPreview(canvas, id) {
    const d = MAP_LIST.find((m) => m.id === id);
    const x = canvas.getContext('2d');
    const grd = x.createLinearGradient(0, 0, 0, 130);
    const env = d.env;
    grd.addColorStop(0, '#' + new THREE.Color(env.skyTop).getHexString()); grd.addColorStop(1, '#' + new THREE.Color(env.skyHorizon).getHexString());
    x.fillStyle = grd; x.fillRect(0, 0, 260, 130);
    // top-down silhouette from a throwaway build of the collision boxes
    if (!this._mapShapes) this._mapShapes = {};
    if (!this._mapShapes[id]) {
      const boxes = [];
      const fake = { box: (x0, y0, z0, x1, y1, z1, mat, o = {}) => { if (o.collide !== false && y1 > 0.4 && y0 < 8) boxes.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), y1]); },
        boxC(cx, cz, w, dd, y, h, m, o) { this.box(cx - w / 2, y, cz - dd / 2, cx + w / 2, y + h, cz + dd / 2, m, o); }, geom() {}, glassPane() {}, pointLight() {} };
      fake.mirrored = () => ({ box: (x0, y0, z0, x1, y1, z1, m, o) => fake.box(-x1, y0, z0, -x0, y1, z1, m, o), boxC: (cx, cz, w, dd, y, h, m, o) => fake.boxC(-cx, cz, w, dd, y, h, m, o), geom() {}, glassPane() {}, pointLight() {}, mirrored: () => fake });
      fake.mirroredZ = () => ({ box: (x0, y0, z0, x1, y1, z1, m, o) => fake.box(x0, y0, -z1, x1, y1, -z0, m, o), boxC: (cx, cz, w, dd, y, h, m, o) => fake.boxC(cx, -cz, w, dd, y, h, m, o), geom() {}, glassPane() {}, pointLight() {}, mirroredZ: () => fake });
      if (d.previewBoxes) boxes.push(...d.previewBoxes());
      else try { d.build(fake); } catch (e) { /* ignore */ }
      this._mapShapes[id] = boxes;
    }
    const b = d.bounds, sx = 240 / (b.maxX - b.minX), sz = 110 / (b.maxZ - b.minZ), s = Math.min(sx, sz);
    const ox = 130 - (b.minX + b.maxX) / 2 * s, oz = 65 - (b.minZ + b.maxZ) / 2 * s;
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, 0, 260, 130);
    for (const [x0, z0, x1, z1, top] of this._mapShapes[id].sort((a, c) => a[4] - c[4])) {
      const l = Math.min(230, 90 + top * 16);
      x.fillStyle = `rgb(${l},${l},${l - 6})`;
      x.fillRect(ox + x0 * s, oz + z0 * s, Math.max(1, (x1 - x0) * s), Math.max(1, (z1 - z0) * s));
    }
  }

  // ------------------------------------------------------------------ 3D weapon preview
  setPreview(on) {
    const g = this.game;
    if (!on) { g.menuPreview = null; return; }
    if (!this.preview) {
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xdde4ee, 0x302820, 1.4));
      const key = new THREE.DirectionalLight(0xfff0e0, 3); key.position.set(2, 3, 2); scene.add(key);
      const rim = new THREE.DirectionalLight(0x88aaff, 2); rim.position.set(-3, 1, -2); scene.add(rim);
      const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
      const holder = new THREE.Group(); scene.add(holder);
      this.preview = { scene, cam, holder, key: '' };
    }
    const lo = g.settings.loadout;
    const [id, optic] = this.focus === 'secondary' ? [lo.secondary, lo.secondaryOptic] : [lo.primary, lo.primaryOptic];
    const skin = skinOf(g.settings.skins[id]), key = id + '|' + optic + '|' + skin;
    if (this.preview.key !== key) {
      const h = this.preview.holder;
      h.clear();
      const w = buildSkinned(WEAPONS[id].model, optic, weaponMaterials(g.tex), skin, { cracks: true });
      w.root.traverse((o) => { if (o.material && o.material.isMeshBasicMaterial && !o.material.map) o.visible = false; });
      h.add(w.root);
      // centered, and scaled so a pistol and a 1.5 m rifle both fill the preview
      const box = new THREE.Box3().setFromObject(w.root), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      w.root.position.set(-c.x, -c.y, -c.z);
      h.scale.setScalar(THREE.MathUtils.clamp(1.1 / size.z, 0.6, 2.4));
      this.preview.key = key;
    }
    if (g.scene.environment) this.preview.scene.environment = g.scene.environment;
    g.menuPreview = this.preview;
  }
}
