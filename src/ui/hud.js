import * as THREE from 'three';
import { clamp } from '../core/math.js';
import { drawScope } from './scopes.js';
const _p = new THREE.Vector3(), _f = new THREE.Vector3();

// =============================================================================
// DOM HUD: crosshair, hitmarkers, ammo, minimap, killfeed, scores, damage
// direction indicators, popups and the scoreboard.
// =============================================================================
const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = {
      hud: $('hud'), cross: $('crosshair'), hit: $('hitmarker'), ammoMag: $('ammo-mag'), ammoRes: $('ammo-res'), ammoW: $('ammo-weapon'),
      ammoBar: $('ammo-bar'), ammoHint: $('ammo-hint'), vigD: $('vignette-dmg'), vigL: $('vignette-low'), kf: $('killfeed'),
      sbF: $('sb-friendly'), sbE: $('sb-enemy'), timer: $('sb-timer'), mode: $('sb-mode'), center: $('center-msg'), pops: $('score-popups'),
      ename: $('enemy-name'), dmg: $('dmg-indicators'), board: $('scoreboard'), tac: $('tac-bar'), tacFill: $('tac-fill'), moveSt: $('move-state'),
      scope: $('scope-overlay'), scopeC: $('scope-canvas'), scopeR: $('scope-read'), death: $('death-screen'), deathBy: $('death-by'), deathT: $('death-timer'), mm: $('minimap'),
    };
    this.ctx = this.el.mm.getContext('2d');
    this.hitT = 0; this.dmgFlash = 0;
    this.indicators = [];
    this.centerT = 0;
    this.chParts = [...this.el.cross.querySelectorAll('.ch')];
    this.lastAmmo = '';
    this.tags = new Map();
    this.tagRoot = document.createElement('div');
    this.tagRoot.id = 'nametags';
    this.el.hud.appendChild(this.tagRoot);
  }

  // full-screen scope picture (null = none); redrawn when the type or the window size changes
  setScope(kind) {
    const key = kind ? kind + '|' + window.innerWidth + '|' + window.innerHeight : null;
    if (key === this.scopeKey) return;
    this.scopeKey = key; this.scopeKind = kind;
    this.el.scope.classList.toggle('hidden', !kind);
    this.el.scopeR.textContent = '';
    if (kind) drawScope(this.el.scopeC, kind);
  }

  // digital scope: laser range to whatever is under the reticle
  updateScopeRead(dt) {
    if (this.scopeKind !== 'digital') return;
    this._rangeT = (this._rangeT || 0) - dt;
    if (this._rangeT > 0) return;
    this._rangeT = 0.1;
    const g = this.game, cam = g.engine.camera;
    cam.getWorldDirection(_f);
    const hit = g.col.raycast(cam.position.x, cam.position.y, cam.position.z, _f.x, _f.y, _f.z, 400, this._rh || (this._rh = {}));
    const lock = this.aimed && (!hit || this.aimedD < hit.t + 1);
    const d = lock ? this.aimedD : hit ? hit.t : null;
    this.el.scopeR.textContent = (lock ? 'ZIEL  ' : 'ENTF  ') + (d === null ? '---' : Math.round(d) + ' m');
    this.el.scopeR.classList.toggle('lock', !!lock);
  }

  clearTags() { for (const t of this.tags.values()) t.remove(); this.tags.clear(); }

  // friendly names over heads (CoD style, faded behind walls) + enemy name under the crosshair
  updateNameTags() {
    const g = this.game, cam = g.engine.camera, p = g.player;
    const W = window.innerWidth, H = window.innerHeight;
    cam.getWorldDirection(_f);
    let aimed = null, aimedD = Infinity;
    const seen = new Set();
    for (const c of g.combatants) {
      if (c === p || !c.alive || !p.alive) continue;
      const friendly = g.isFriendly(c, p);
      _p.set(c.pos.x, c.pos.y + (c.eyeH || 1.6) + 0.55, c.pos.z);
      const dx = _p.x - cam.position.x, dy = _p.y - cam.position.y, dz = _p.z - cam.position.z;
      const dist = Math.hypot(dx, dy, dz);
      if (!friendly) {
        // red marker over visible enemies (never through walls)
        if (dist < 90) {
          const losE = g.col.lineClear(cam.position.x, cam.position.y, cam.position.z, c.pos.x, c.pos.y + (c.eyeH || 1.6), c.pos.z) || g.col.lineClear(cam.position.x, cam.position.y, cam.position.z, c.pos.x, c.pos.y + 1.0, c.pos.z);
          if (losE) {
            _p.project(cam);
            if (_p.z < 1 && Math.abs(_p.x) < 1.1 && Math.abs(_p.y) < 1.1) {
              let el = this.tags.get(c);
              if (!el || el.dataset.kind !== 'e') { if (el) el.remove(); el = document.createElement('div'); el.className = 'etag'; el.dataset.kind = 'e'; el.innerHTML = '<i></i>'; this.tagRoot.appendChild(el); this.tags.set(c, el); }
              seen.add(c);
              el.style.transform = `translate(${(_p.x * 0.5 + 0.5) * W}px, ${(-_p.y * 0.5 + 0.5) * H}px) translate(-50%, -100%)`;
              el.style.opacity = clamp(1.3 - dist / 90, 0.45, 1);
              el.style.display = '';
            }
          }
        }
        _p.set(c.pos.x, c.pos.y + (c.eyeH || 1.6) + 0.55, c.pos.z);
        // enemy under the crosshair?
        const cx = c.pos.x - cam.position.x, cy = c.pos.y + (c.eyeH || 1.6) * 0.7 - cam.position.y, cz = c.pos.z - cam.position.z;
        const cd = Math.hypot(cx, cy, cz);
        const dot = (cx * _f.x + cy * _f.y + cz * _f.z) / cd;
        if (dot > Math.cos(Math.atan2(0.5, cd)) && cd < aimedD && cd < 90 && g.col.lineClear(cam.position.x, cam.position.y, cam.position.z, c.pos.x, c.pos.y + 1.3, c.pos.z)) { aimed = c; aimedD = cd; }
        continue;
      }
      if (dist > 70) continue;
      _p.project(cam);
      if (_p.z > 1 || Math.abs(_p.x) > 1.1 || Math.abs(_p.y) > 1.1) continue;
      let el = this.tags.get(c);
      if (!el || el.dataset.kind !== 'f') { if (el) el.remove(); el = document.createElement('div'); el.className = 'ntag'; el.dataset.kind = 'f'; el.innerHTML = '<span></span><i></i>'; el.firstChild.textContent = c.name; this.tagRoot.appendChild(el); this.tags.set(c, el); }
      seen.add(c);
      const vis = g.col.lineClear(cam.position.x, cam.position.y, cam.position.z, c.pos.x, c.pos.y + 1.5, c.pos.z);
      el.style.transform = `translate(${(_p.x * 0.5 + 0.5) * W}px, ${(-_p.y * 0.5 + 0.5) * H}px) translate(-50%, -100%)`;
      el.style.opacity = (vis ? 1 : 0.4) * clamp(1.2 - dist / 70, 0.3, 1);
      el.style.display = '';
    }
    for (const [c, el] of this.tags) if (!seen.has(c)) el.style.display = 'none';
    this.aimed = aimed; this.aimedD = aimedD;
    const en = this.el.ename;
    if (aimed) { en.textContent = aimed.name; en.className = ''; en.style.opacity = 1; }
    else en.style.opacity = 0;
  }

  buildMinimap() {
    const g = this.game, col = g.col, b = g.mapDef.bounds;
    if (g.mapDef.large) { this.buildLargeMinimap(); return; }
    this.mmZoom = 1.25;
    const S = 4; // px per meter
    const w = Math.ceil((b.maxX - b.minX + 8) * S), h = Math.ceil((b.maxZ - b.minZ + 8) * S);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(40,46,44,0.9)'; x.fillRect(0, 0, w, h);
    const B = col.B;
    const items = [];
    for (let i = 0; i < col.n; i++) {
      const o = i * 6;
      const top = B[o + 4], bot = B[o + 1];
      if (top < 0.3 || bot > 8 || B[o] > 1e5) continue;
      if (B[o + 3] - B[o] > 60 && B[o + 5] - B[o + 2] > 40) continue;
      items.push([B[o], B[o + 2], B[o + 3], B[o + 5], top]);
    }
    items.sort((p, q) => p[4] - q[4]);
    for (const [x0, z0, x1, z1, top] of items) {
      const l = clamp(70 + top * 18, 70, 190);
      x.fillStyle = `rgb(${l},${l + 4},${l})`;
      x.fillRect((x0 - b.minX + 4) * S, (z0 - b.minZ + 4) * S, Math.max(1, (x1 - x0) * S), Math.max(1, (z1 - z0) * S));
    }
    this.mmImg = c; this.mmS = S; this.mmOx = b.minX - 4; this.mmOz = b.minZ - 4;
  }

  // island: the painted ground with roofs on top, one image for the minimap and the big map
  buildLargeMinimap() {
    const g = this.game, def = g.mapDef, src = def.groundCanvas, S = src.width / def.terrain.size;
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    const ox = def.terrain.ox, oz = def.terrain.oz;
    for (const [x0, z0, x1, z1, floors] of def.layout.footprints) {
      const l = 96 + Math.min(floors, 6) * 12;
      x.fillStyle = `rgb(${l},${l},${l + 2})`;
      x.fillRect((x0 - ox) * S, (z0 - oz) * S, (x1 - x0) * S, (z1 - z0) * S);
      x.strokeStyle = 'rgba(0,0,0,0.55)'; x.lineWidth = 1;
      x.strokeRect((x0 - ox) * S, (z0 - oz) * S, (x1 - x0) * S, (z1 - z0) * S);
    }
    this.mmImg = c; this.mmS = S; this.mmOx = ox; this.mmOz = oz; this.mmZoom = 0.95;
    this.mmPlans = new Map(); this.mmIn = 0; this.mmHouse = null; this.mmLevels = new Map();
  }

  // ---- floor plans: what the walls really are, cut through at chest height
  // the floors of a building, from where the bots can walk: heights where a lot of ground lies at the same level
  houseLevels(f) {
    let L = this.mmLevels.get(f);
    if (L) return L;
    const nav = this.game.nav, n = nav.fineN ?? nav.n, hist = new Map();
    for (let i = 0; i < n; i++) if (nav.links[i].length && nav.X[i] > f[0] && nav.X[i] < f[2] && nav.Z[i] > f[1] && nav.Z[i] < f[3]) { const k = Math.round((nav.Y[i] - f[5]) * 4); hist.set(k, (hist.get(k) || 0) + 1); }
    L = [];
    for (const [k, c] of [...hist.entries()].sort((a, b) => a[0] - b[0])) {
      if (c < 6) continue;
      const y = f[5] + k / 4, last = L[L.length - 1];
      if (last && y - last.y < 1.6) { if (c > last.c) { last.y = y; last.c = c; } } else L.push({ y, c });
    }
    if (!L.length) L.push({ y: f[5], c: 1 });
    this.mmLevels.set(f, L);
    return L;
  }

  // one floor of one building as a picture: floor, what stands on it, the walls and the windows
  housePlan(f, y) {
    const key = f + '|' + y.toFixed(1);
    let P = this.mmPlans.get(key);
    if (P) return P;
    const PX = 12, m = 0.6, x0 = f[0] - m, z0 = f[1] - m, w = f[2] - f[0] + m * 2, d = f[3] - f[1] + m * 2;
    const c = document.createElement('canvas'); c.width = Math.ceil(w * PX); c.height = Math.ceil(d * PX);
    const x = c.getContext('2d'), col = this.game.col, B = col.B;
    x.fillStyle = 'rgba(30,34,36,0.97)'; x.fillRect(0, 0, c.width, c.height);
    const cut = y + 1.25, walls = [], low = [], glass = [], solid = []; // (solid: nobody goes there, the inside of a roof, a pillar)
    const n = col.gather(x0, y + 0.12, z0, x0 + w, y + 2.2, z0 + d);
    for (let k = 0; k < n; k++) {
      const i = col.cand[k], o = i * 6, bot = B[o + 1], top = B[o + 4];
      const r = [(B[o] - x0) * PX, (B[o + 2] - z0) * PX, (B[o + 3] - B[o]) * PX, (B[o + 5] - B[o + 2]) * PX];
      if (bot <= cut && top >= cut) { if (col.surface[i] === 'glass') glass.push(r); else if (Math.min(r[2], r[3]) > 1.3 * PX) solid.push(r); else walls.push(r); }
      else if (top < cut && top > y + 0.12) low.push([...r, (top - y) / 1.25]);
    }
    // what stands around, higher is lighter: steps on a flight of stairs read as steps
    low.sort((a, b) => a[4] - b[4]);
    for (const [a, b, e, g, h] of low) {
      const l = Math.round(70 + h * 62);
      x.fillStyle = 'rgb(' + l + ',' + (l + 2) + ',' + l + ')'; x.fillRect(a, b, Math.max(1.5, e), Math.max(1.5, g));
      x.strokeStyle = 'rgba(16,18,20,0.75)'; x.lineWidth = 1; x.strokeRect(a, b, Math.max(1.5, e), Math.max(1.5, g));
    }
    x.fillStyle = '#4d5252';
    for (const [a, b, e, g] of solid) x.fillRect(a, b, e, g);
    x.fillStyle = '#7cc8ea';
    for (const [a, b, e, g] of glass) x.fillRect(a, b, Math.max(2, e), Math.max(2, g));
    x.fillStyle = '#e6e9e2';
    for (const [a, b, e, g] of walls) x.fillRect(a, b, Math.max(2.5, e), Math.max(2.5, g));
    P = { c, x0, z0, w, d };
    this.mmPlans.set(key, P);
    return P;
  }

  // the building you are in, on which floor: null out in the open and on the roofs
  whereInside() {
    const g = this.game, p = g.player, D = g.mapDef;
    if (!D.large || !p.alive) return null;
    const px = p.pos.x, pz = p.pos.z, py = p.pos.y;
    for (const f of D.layout.footprints) {
      if (px < f[0] || px > f[2] || pz < f[1] || pz > f[3]) continue;
      if (g.col.lineClear(px, py + 1.7, pz, px, py + 40, pz)) continue; // nothing overhead: a yard or a roof
      const L = this.houseLevels(f);
      let i = 0;
      // on the stairs the next floor counts from halfway up
      while (i + 1 < L.length && py > (L[i].y + L[i + 1].y) / 2) i++;
      // the floor at the height of the street is the ground floor
      let g0 = 0, best = Infinity;
      L.forEach((l, k) => { const e = Math.abs(l.y - f[5]); if (e < best) { best = e; g0 = k; } });
      return { f, y: L[i].y, floor: i - g0 };
    }
    return null;
  }

  drawMinimap() {
    const g = this.game, p = g.player, x = this.ctx, W = 220, H = 220;
    if (!this.mmImg) return;
    // inside a building: the block opens up, and the map comes closer so that the rooms can be read
    const inside = this.mmPlans ? this.whereInside() : null;
    if (inside) { if (!this.mmHouse || this.mmHouse.f !== inside.f || this.mmHouse.y !== inside.y) this.mmFade = this.mmHouse && this.mmHouse.f === inside.f ? 0.35 : 0; this.mmHouse = inside; }
    this.mmIn = (this.mmIn || 0) + ((inside ? 1 : 0) - (this.mmIn || 0)) * 0.14;
    this.mmFade = Math.min(1, (this.mmFade ?? 1) + 1 / 12);
    if (this.mmIn < 0.01) this.mmHouse = null;
    x.clearRect(0, 0, W, H);
    x.save();
    x.translate(W / 2, H / 2);
    const zoom = this.mmZoom * (1 + 1.7 * (this.mmIn || 0)); // minimap px per image px
    x.rotate(p.yaw);
    x.scale(zoom, zoom);
    x.translate(-(p.pos.x - this.mmOx) * this.mmS, -(p.pos.z - this.mmOz) * this.mmS);
    x.globalAlpha = 0.95;
    x.drawImage(this.mmImg, 0, 0);
    x.globalAlpha = 1;
    if (this.mmHouse) {
      const H0 = this.mmHouse, P = this.housePlan(H0.f, H0.y), S = this.mmS;
      x.globalAlpha = (this.mmIn || 0) * this.mmFade;
      x.drawImage(P.c, (P.x0 - this.mmOx) * S, (P.z0 - this.mmOz) * S, P.w * S, P.d * S);
      x.globalAlpha = 1;
    }
    // combatants
    for (const c of g.combatants) {
      if (c === p || !c.alive) continue;
      const friendly = g.isFriendly(c, p);
      if (!friendly && !(g.time - c.lastRadar < 1.6)) continue;
      const px = (c.pos.x - this.mmOx) * this.mmS, pz = (c.pos.z - this.mmOz) * this.mmS;
      x.fillStyle = friendly ? '#48b8ff' : '#ff3a2a';
      x.beginPath(); x.arc(px, pz, 3.6 / zoom, 0, Math.PI * 2); x.fill();
      x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 1 / zoom; x.stroke();
    }
    x.restore();
    // player arrow
    x.fillStyle = '#ffd04a';
    x.beginPath(); x.moveTo(W / 2, H / 2 - 8); x.lineTo(W / 2 + 6, H / 2 + 6); x.lineTo(W / 2, H / 2 + 2); x.lineTo(W / 2 - 6, H / 2 + 6); x.closePath(); x.fill();
    // view cone
    const grd = x.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 70);
    grd.addColorStop(0, 'rgba(255,255,255,0.12)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = grd;
    x.beginPath(); x.moveTo(W / 2, H / 2); x.arc(W / 2, H / 2, 70, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6); x.closePath(); x.fill();
    // which floor
    if (this.mmHouse && (this.mmIn || 0) > 0.3) {
      const n = this.mmHouse.floor, label = n === 0 ? 'EG' : n > 0 ? n + '. OG' : (-n) + '. UG';
      x.font = 'bold 13px sans-serif'; x.textAlign = 'right'; x.textBaseline = 'top';
      const tw = x.measureText(label).width;
      x.globalAlpha = this.mmIn; x.fillStyle = 'rgba(0,0,0,0.62)'; x.fillRect(W - tw - 14, 6, tw + 10, 19);
      x.fillStyle = '#fff'; x.fillText(label, W - 9, 9); x.globalAlpha = 1; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    }
  }

  hitmarker(kind) {
    const h = this.el.hit;
    h.className = kind === 'kill' ? 'kill' : kind === 'head' ? 'head' : kind === 'armor' ? 'armor' : '';
    this.hitT = kind === 'kill' ? 0.35 : 0.2;
    this.hitScale = kind === 'kill' ? 1.6 : 1.25;
  }

  damageFrom(angle, amount) {
    this.dmgFlash = Math.min(1, this.dmgFlash + amount / 60);
    const d = document.createElement('div');
    d.className = 'dmg-ind';
    this.el.dmg.appendChild(d);
    this.indicators.push({ el: d, worldAngle: angle, t: 1.6 });
  }

  killfeed(killer, victim, weapon, head) {
    const g = this.game, p = g.player;
    const cls = (c) => (c === p ? 'me' : g.isFriendly(c, p) ? 'f' : 'e');
    const d = document.createElement('div'); d.className = 'kf';
    d.innerHTML = `<span class="${cls(killer)}">${killer === victim ? '' : killer.name}</span><span class="w">[${weapon}]</span>${head ? '<span class="hs">⊕</span>' : ''}<span class="${cls(victim)}">${victim.name}</span>`;
    this.el.kf.prepend(d);
    while (this.el.kf.children.length > 5) this.el.kf.lastChild.remove();
    setTimeout(() => d.remove(), 6000);
  }

  popup(text, sub, big) {
    const d = document.createElement('div'); d.className = 'pop' + (big ? ' big' : '');
    d.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
    this.el.pops.prepend(d);
    while (this.el.pops.children.length > 3) this.el.pops.lastChild.remove();
    setTimeout(() => d.remove(), 1400);
  }

  message(text, t = 2) { this.el.center.innerHTML = text; this.centerT = t; }

  update(dt) {
    const g = this.game, p = g.player, wpn = g.weapons;
    // ---- crosshair
    const ads = wpn ? wpn.adsAmount : 0;
    const spread = wpn ? wpn.currentSpread(p) : 2;
    const vfov = g.engine.camera.fov * Math.PI / 180;
    const px = Math.tan(spread * Math.PI / 180 * 0.5) * (window.innerHeight / 2) / Math.tan(vfov / 2);
    const gap = 4 + px;
    const [t, b, l, r] = this.chParts;
    t.style.transform = `translateY(${-gap - 9}px)`; b.style.transform = `translateY(${gap}px)`;
    l.style.transform = `translateX(${-gap - 9}px)`; r.style.transform = `translateX(${gap}px)`;
    const hideCh = ads > 0.35 || p.sprinting || !p.alive || (wpn && (wpn.state === 'inspect' || wpn.state === 'melee' || wpn.stowed)) || (g.br && (g.br.hideViewmodel || g.br.playerState === 'downed'));
    this.el.cross.style.opacity = hideCh ? 0 : 1;
    // ---- docked to cover
    const mk = p.alive && p.mount ? p.mount.kind : '';
    if (mk !== this.lastMount) { this.lastMount = mk; document.getElementById('mount-mark').className = mk; }
    // ---- hitmarker
    if (this.hitT > 0) {
      this.hitT -= dt;
      this.hitScale = Math.max(1, this.hitScale - dt * 4);
      this.el.hit.style.opacity = clamp(this.hitT * 6, 0, 1);
      this.el.hit.style.transform = `scale(${this.hitScale})`;
    } else this.el.hit.style.opacity = 0;
    // ---- ammo (hidden while dead)
    document.getElementById('ammo').style.opacity = p.alive && !(g.br && g.br.playerState === 'downed') ? 1 : 0;
    if (wpn && wpn.w) {
      const w = wpn.w;
      const s = w.mag + '|' + w.reserve + '|' + w.def.name;
      if (s !== this.lastAmmo) {
        this.lastAmmo = s;
        this.el.ammoMag.textContent = w.mag; this.el.ammoRes.textContent = '/ ' + w.reserve; this.el.ammoW.textContent = w.def.name;
        this.el.ammoMag.classList.toggle('low', w.mag <= Math.ceil(w.def.mag * 0.25));
        this.el.ammoBar.style.transform = `scaleX(${w.mag / w.def.mag})`;
      }
      let hint = '';
      if (w.mag === 0 && w.reserve === 0) hint = 'KEINE MUNITION';
      else if (wpn.state === 'reload') hint = 'NACHLADEN...';
      else if (w.mag <= Math.ceil(w.def.mag * 0.25)) hint = '[R] NACHLADEN';
      this.el.ammoHint.textContent = hint;
    }
    // ---- health vignettes
    const hp = p.health / p.maxHealth;
    this.dmgFlash = Math.max(0, this.dmgFlash - dt * 1.4);
    this.el.vigD.style.opacity = this.dmgFlash;
    this.el.vigL.style.opacity = p.alive ? clamp((0.6 - hp) / 0.45, 0, 1) * (0.75 + Math.sin(g.time * 6) * 0.25 * (hp < 0.3 ? 1 : 0)) : 0;
    // ---- damage direction indicators
    for (const ind of this.indicators) {
      ind.t -= dt;
      const rel = ind.worldAngle - p.yaw;
      ind.el.style.transform = `rotate(${-rel}rad)`;
      ind.el.style.opacity = clamp(ind.t, 0, 1);
      if (ind.t <= 0) ind.el.remove();
    }
    this.indicators = this.indicators.filter((i) => i.t > 0);
    // ---- tac sprint bar / movement state
    const showTac = p.tac || p.tacCharge < 3.59;
    this.el.tac.classList.toggle('show', showTac);
    this.el.tacFill.style.width = (p.tacCharge / 3.6 * 100) + '%';
    let ms = '';
    if (p.mode === 'slide') ms = 'SLIDE'; else if (p.mode === 'dive') ms = 'DIVE'; else if (p.mode === 'mantle') ms = 'MANTLE';
    else if (p.tac) ms = 'TAKTIK-SPRINT'; else if (p.supine) ms = 'RÜCKENLAGE'; else if (p.stance === 'prone') ms = 'LIEGEND';
    this.el.moveSt.textContent = ms;
    // ---- center message
    if (this.centerT > 0) { this.centerT -= dt; if (this.centerT <= 0) this.el.center.innerHTML = ''; }
    this.updateNameTags();
    this.updateScopeRead(dt);
    // ---- minimap (throttled)
    this._mmT = (this._mmT || 0) - dt;
    if (this._mmT <= 0) { this._mmT = 1 / 30; this.drawMinimap(); }
  }

  setScores(friendly, enemy, mode, ffaMine, ffaBest) {
    if (mode === 'ffa') { this.el.sbF.textContent = ffaMine; this.el.sbE.textContent = ffaBest; }
    else { this.el.sbF.textContent = friendly; this.el.sbE.textContent = enemy; }
  }
  setTimer(sec) {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    this.el.timer.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }

  showScoreboard(show) {
    const b = this.el.board;
    if (!show) { b.classList.add('hidden'); return; }
    const g = this.game, m = g.match;
    if (!m) return;
    b.classList.remove('hidden');
    const rows = [...g.combatants].sort((a, c) => c.score - a.score || c.kills - a.kills);
    const row = (c) => `<tr class="${c === g.player ? 'me' : ''}"><td class="${g.isFriendly(c, g.player) ? 'tf' : 'te'}">${c.name}</td><td>${c.score}</td><td>${c.kills}</td><td>${c.deaths}</td><td>${c.deaths ? (c.kills / c.deaths).toFixed(2) : c.kills.toFixed(2)}</td></tr>`;
    const head = '<tr><th>NAME</th><th>PUNKTE</th><th>KILLS</th><th>TODE</th><th>K/D</th></tr>';
    if (m.mode === 'br') {
      const alive = rows.filter((c) => (c.isPlayer ? c.alive : !c.out));
      b.innerHTML = `<h3>${g.mapDef.name} — WARZONE · ${alive.length} LEBEN NOCH</h3><table>${head}${rows.slice(0, 12).map(row).join('')}</table>`;
    } else if (m.mode === 'tdm') {
      const f = rows.filter((c) => c.team === g.player.team), e = rows.filter((c) => c.team !== g.player.team);
      b.innerHTML = `<h3>${g.mapDef.name} — TEAM DEATHMATCH</h3><table>${head}<tr><th colspan="5" class="tf">DEIN TEAM · ${m.score[g.player.team]}</th></tr>${f.map(row).join('')}<tr><th colspan="5" class="te">GEGNER · ${m.score[1 - g.player.team]}</th></tr>${e.map(row).join('')}</table>`;
    } else {
      b.innerHTML = `<h3>${g.mapDef.name} — FREE FOR ALL</h3><table>${head}${rows.map(row).join('')}</table>`;
    }
  }
}
