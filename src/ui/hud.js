import * as THREE from 'three';
import { clamp } from '../core/math.js';
import { drawScope } from './scopes.js';
import { esc } from '../net/net.js';
import { GUN_TIERS, WEAPONS } from '../weapons/defs.js';
const _p = new THREE.Vector3(), _f = new THREE.Vector3();

// =============================================================================
// DOM HUD: crosshair, hitmarkers, ammo, minimap, killfeed, scores, damage
// direction indicators, popups and the scoreboard.
// =============================================================================
const $ = (id) => document.getElementById(id);
// Writes to the page only when the value changed: every write makes the browser work out styles and layout
// again, and on a weak PC that costs more per frame than a few bots.
const css = (el, k, v) => { const c = el._css || (el._css = {}); if (c[k] !== v) { c[k] = v; el.style[k] = v; } };
const txt = (el, v) => { if (el._txt !== v) { el._txt = v; el.textContent = v; } };

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
  dropTag(c) { const t = this.tags.get(c); if (t) { t.remove(); this.tags.delete(c); } }

  // friendly names over heads (CoD style, faded behind walls) + enemy name under the crosshair
  updateNameTags() {
    const g = this.game, cam = g.engine.camera, p = g.player, C = cam.position;
    const W = window.innerWidth, H = window.innerHeight;
    cam.getWorldDirection(_f);
    let aimed = null, aimedD = Infinity;
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    // who can be seen from here: a few rays per body, so only every few hundredths of a second (nobody notices that)
    const sight = (c) => {
      const s = c._sight || (c._sight = { t: -1, e: false, f: false });
      if (Math.abs(g.time - s.t) > 0.08) {
        s.t = g.time;
        s.e = g.col.lineClear(C.x, C.y, C.z, c.pos.x, c.pos.y + (c.eyeH || 1.6), c.pos.z) || g.col.lineClear(C.x, C.y, C.z, c.pos.x, c.pos.y + 1.0, c.pos.z);
        s.f = g.col.lineClear(C.x, C.y, C.z, c.pos.x, c.pos.y + 1.5, c.pos.z);
      }
      return s;
    };
    const place = (el, op) => {
      css(el, 'transform', `translate(${Math.round((_p.x * 0.5 + 0.5) * W)}px, ${Math.round((-_p.y * 0.5 + 0.5) * H)}px) translate(-50%, -100%)`);
      css(el, 'opacity', op.toFixed(2));
      css(el, 'display', '');
    };
    for (const c of g.combatants) {
      if (c === p || !c.alive || !p.alive) continue;
      const friendly = g.isFriendly(c, p);
      _p.set(c.pos.x, c.pos.y + (c.eyeH || 1.6) + 0.55, c.pos.z);
      const dx = _p.x - C.x, dy = _p.y - C.y, dz = _p.z - C.z;
      const dist = Math.hypot(dx, dy, dz);
      if (!friendly) {
        // red marker over visible enemies (never through walls)
        if (dist < 90 && sight(c).e) {
          _p.project(cam);
          if (_p.z < 1 && Math.abs(_p.x) < 1.1 && Math.abs(_p.y) < 1.1) {
            let el = this.tags.get(c);
            if (!el || el.dataset.kind !== 'e') { if (el) el.remove(); el = document.createElement('div'); el.className = 'etag'; el.dataset.kind = 'e'; el.innerHTML = '<i></i>'; this.tagRoot.appendChild(el); this.tags.set(c, el); }
            seen.add(c);
            place(el, clamp(1.3 - dist / 90, 0.45, 1));
          }
        }
        _p.set(c.pos.x, c.pos.y + (c.eyeH || 1.6) + 0.55, c.pos.z);
        // enemy under the crosshair?
        const cx = c.pos.x - C.x, cy = c.pos.y + (c.eyeH || 1.6) * 0.7 - C.y, cz = c.pos.z - C.z;
        const cd = Math.hypot(cx, cy, cz);
        const dot = (cx * _f.x + cy * _f.y + cz * _f.z) / cd;
        if (dot > Math.cos(Math.atan2(0.5, cd)) && cd < aimedD && cd < 90 && g.col.lineClear(C.x, C.y, C.z, c.pos.x, c.pos.y + 1.3, c.pos.z)) { aimed = c; aimedD = cd; }
        continue;
      }
      if (dist > 70) continue;
      _p.project(cam);
      if (_p.z > 1 || Math.abs(_p.x) > 1.1 || Math.abs(_p.y) > 1.1) continue;
      let el = this.tags.get(c);
      if (!el || el.dataset.kind !== 'f') { if (el) el.remove(); el = document.createElement('div'); el.className = 'ntag'; el.dataset.kind = 'f'; el.innerHTML = '<span></span><i></i>'; el.firstChild.textContent = c.name; this.tagRoot.appendChild(el); this.tags.set(c, el); }
      seen.add(c);
      place(el, (sight(c).f ? 1 : 0.4) * clamp(1.2 - dist / 70, 0.3, 1));
    }
    for (const [c, el] of this.tags) if (!seen.has(c)) css(el, 'display', 'none');
    this.aimed = aimed; this.aimedD = aimedD;
    const en = this.el.ename;
    if (aimed) { txt(en, aimed.name); if (en.className) en.className = ''; css(en, 'opacity', '1'); }
    else css(en, 'opacity', '0');
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
    const B = col.B, ceiling = g.mapDef.mmCeiling ?? 8;
    const items = [];
    for (let i = 0; i < col.n; i++) {
      const o = i * 6;
      const top = B[o + 4], bot = B[o + 1];
      if (top < 0.3 || bot > ceiling || B[o] > 1e5) continue;
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
    // Wingman: the two circles in the colour of whoever holds them, the letter upright
    const pts = g.match && g.match.points;
    if (pts) for (const P of pts.list) {
      const px = (P.x - this.mmOx) * this.mmS, pz = (P.z - this.mmOz) * this.mmS, own = P.owner === p.team;
      x.fillStyle = P.owner < 0 ? 'rgba(255,255,255,0.22)' : own ? 'rgba(72,184,255,0.42)' : 'rgba(255,74,58,0.42)';
      x.strokeStyle = P.owner < 0 ? '#ffffff' : own ? '#48b8ff' : '#ff4a3a'; x.lineWidth = 1.5 / zoom;
      x.beginPath(); x.arc(px, pz, P.r * this.mmS, 0, Math.PI * 2); x.fill(); x.stroke();
      x.save(); x.translate(px, pz); x.rotate(-p.yaw); x.scale(1 / zoom, 1 / zoom);
      x.fillStyle = '#fff'; x.font = 'bold 14px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(P.id, 0, 1);
      x.restore();
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
    d.innerHTML = `<span class="${cls(killer)}">${killer === victim ? '' : esc(killer.name)}</span><span class="w">[${esc(weapon)}]</span>${head ? '<span class="hs">⊕</span>' : ''}<span class="${cls(victim)}">${esc(victim.name)}</span>`;
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
    const gap = Math.round((4 + px) * 2) / 2;
    if (gap !== this.lastGap) {
      this.lastGap = gap;
      const [t, b, l, r] = this.chParts;
      t.style.transform = `translateY(${-gap - 9}px)`; b.style.transform = `translateY(${gap}px)`;
      l.style.transform = `translateX(${-gap - 9}px)`; r.style.transform = `translateX(${gap}px)`;
    }
    const hideCh = ads > 0.35 || p.sprinting || !p.alive || (wpn && (wpn.state === 'inspect' || wpn.state === 'melee' || wpn.stowed)) || (g.br && (g.br.hideViewmodel || g.br.playerState === 'downed'));
    css(this.el.cross, 'opacity', hideCh ? '0' : '1');
    // ---- docked to cover
    const mk = p.alive && p.mount ? p.mount.kind : '';
    if (mk !== this.lastMount) { this.lastMount = mk; document.getElementById('mount-mark').className = mk; }
    // ---- hitmarker
    if (this.hitT > 0) {
      this.hitT -= dt;
      this.hitScale = Math.max(1, this.hitScale - dt * 4);
      css(this.el.hit, 'opacity', clamp(this.hitT * 6, 0, 1).toFixed(2));
      css(this.el.hit, 'transform', `scale(${this.hitScale.toFixed(3)})`);
    } else css(this.el.hit, 'opacity', '0');
    // ---- ammo (hidden while dead)
    css(this.el.ammo || (this.el.ammo = $('ammo')), 'opacity', p.alive && !(g.br && g.br.playerState === 'downed') ? '1' : '0');
    this.updateGunPanel();
    if (wpn && wpn.w && wpn.w.def.melee) {
      if (this.lastAmmo !== 'knife') { this.lastAmmo = 'knife'; this.el.ammoMag.textContent = '∞'; this.el.ammoRes.textContent = ''; this.el.ammoW.textContent = wpn.w.def.name; this.el.ammoMag.classList.remove('low'); this.el.ammoBar.style.transform = 'scaleX(1)'; this.el.ammoHint.textContent = ''; }
    } else if (wpn && wpn.w) {
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
      txt(this.el.ammoHint, hint);
    }
    // ---- health vignettes
    const hp = p.health / p.maxHealth;
    this.dmgFlash = Math.max(0, this.dmgFlash - dt * 1.4);
    css(this.el.vigD, 'opacity', this.dmgFlash.toFixed(2));
    css(this.el.vigL, 'opacity', (p.alive ? clamp((0.6 - hp) / 0.45, 0, 1) * (0.75 + Math.sin(g.time * 6) * 0.25 * (hp < 0.3 ? 1 : 0)) : 0).toFixed(2));
    // ---- damage direction indicators
    for (const ind of this.indicators) {
      ind.t -= dt;
      const rel = ind.worldAngle - p.yaw;
      css(ind.el, 'transform', `rotate(${(-rel).toFixed(3)}rad)`);
      css(ind.el, 'opacity', clamp(ind.t, 0, 1).toFixed(2));
      if (ind.t <= 0) ind.el.remove();
    }
    if (this.indicators.length) this.indicators = this.indicators.filter((i) => i.t > 0);
    // ---- tac sprint bar / movement state
    const showTac = p.tac || p.tacCharge < 3.59;
    if (showTac !== this.lastTac) { this.lastTac = showTac; this.el.tac.classList.toggle('show', showTac); }
    if (showTac) css(this.el.tacFill, 'transform', `scaleX(${(p.tacCharge / 3.6).toFixed(3)})`);
    let ms = '';
    if (p.mode === 'slide') ms = 'SLIDE'; else if (p.mode === 'dive') ms = 'DIVE'; else if (p.mode === 'mantle') ms = 'MANTLE';
    else if (p.tac) ms = 'TAKTIK-SPRINT'; else if (p.supine) ms = 'RÜCKENLAGE'; else if (p.stance === 'prone') ms = 'LIEGEND';
    txt(this.el.moveSt, ms);
    // ---- center message
    if (this.centerT > 0) { this.centerT -= dt; if (this.centerT <= 0) this.el.center.innerHTML = ''; }
    this.updatePoints();
    this.updateNameTags();
    this.updateScopeRead(dt);
    // ---- minimap (throttled, more so on the weak presets)
    this._mmT = (this._mmT || 0) - dt;
    if (this._mmT <= 0) { this._mmT = 1 / (g.engine.q.hudHz || 30); this.drawMinimap(); }
  }

  // Wingman: the two points under the score, a marker over each in the world, and what the circle you stand in is doing
  updatePoints() {
    const g = this.game, pts = g.match && g.match.points;
    if (!pts) {
      if (this.ptEl) { this.ptEl.remove(); this.capEl.remove(); for (const m of this.ptMarks) m.remove(); this.ptEl = this.capEl = this.ptMarks = null; }
      return;
    }
    if (!this.ptEl) {
      this.ptEl = document.createElement('div'); this.ptEl.id = 'sb-points';
      this.ptEl.innerHTML = pts.list.map((P) => `<div class="pt"><span>${P.id}</span><i></i></div>`).join('');
      this.el.hud.appendChild(this.ptEl);
      this.ptBadges = [...this.ptEl.children];
      this.ptMarks = pts.list.map((P) => { const m = document.createElement('div'); m.className = 'ptmark'; m.innerHTML = `<b>${P.id}</b><span></span>`; this.tagRoot.appendChild(m); return m; });
      this.capEl = document.createElement('div'); this.capEl.id = 'cap-status'; this.capEl.innerHTML = '<span></span><i><b></b></i>';
      this.el.hud.appendChild(this.capEl);
    }
    const p = g.player, cam = g.engine.camera, W = window.innerWidth, H = window.innerHeight, side = (t) => (t < 0 ? '' : t === p.team ? 'own' : 'enemy');
    const here = pts.playerIn(); // (the circle you stand in: its line under the crosshair says it all, no marker)
    const o = this._ps || (this._ps = {});
    pts.list.forEach((P, i) => {
      const taking = P.cap >= 0 && P.k > 0, cls = 'pt ' + side(P.owner) + (P.contested ? ' contest' : '') + (taking ? ' taking-' + side(P.cap) : '');
      const B = this.ptBadges[i];
      if (B.className !== cls) B.className = cls;
      css(B.lastChild, 'transform', `scaleX(${taking ? P.k.toFixed(3) : 0})`);
      // the marker over it, held at the edge of the screen when it is off to the side or behind you
      const M = this.ptMarks[i];
      pts.screenOf(P, cam, o);
      let sx = o.behind ? -o.x : o.x, sy = o.behind ? -o.y : o.y;
      const edge = Math.max(Math.abs(sx) / 0.9, Math.abs(sy) / 0.8);
      if (o.behind || edge > 1) { const k = 1 / Math.max(edge, 1e-3); sx *= k; sy *= k; }
      css(M, 'transform', `translate(${Math.round((sx * 0.5 + 0.5) * W)}px, ${Math.round((-sy * 0.5 + 0.5) * H)}px) translate(-50%, -50%)`);
      const mc = 'ptmark ' + side(P.owner) + (P.contested ? ' contest' : '') + (here === P ? ' here' : '');
      if (M.className !== mc) M.className = mc;
      txt(M.lastChild, p.alive ? Math.round(Math.hypot(P.x - p.pos.x, P.z - p.pos.z)) + ' m' : '');
    });
    // the circle you are standing in
    const C = this.capEl;
    if (!here) { css(C, 'display', 'none'); return; }
    css(C, 'display', '');
    const mine = here.owner === p.team, taking = here.cap >= 0 && here.k > 0;
    const text = here.contested ? 'PUNKT ' + here.id + ' · UMKÄMPFT' : taking && here.cap === p.team ? 'PUNKT ' + here.id + ' WIRD EINGENOMMEN' : mine ? 'PUNKT ' + here.id + ' GEHÖRT EUREM TEAM' : taking ? 'GEGNER NEHMEN PUNKT ' + here.id + ' EIN' : 'PUNKT ' + here.id;
    txt(C.firstChild, text);
    const cl = here.contested ? 'contest' : taking ? side(here.cap) : side(here.owner);
    if (C.className !== cl) C.className = cl;
    css(C.lastChild.firstChild, 'transform', `scaleX(${(taking ? here.k : mine ? 1 : 0).toFixed(3)})`);
  }

  // Gun Game: your level, what comes next, and who is ahead
  updateGunPanel() {
    const g = this.game, m = g.match;
    if (!m || !m.gun) { if (this.gunEl) { this.gunEl.remove(); this.gunEl = null; this.gunKey = ''; } return; }
    if (!this.gunEl) { this.gunEl = document.createElement('div'); this.gunEl.id = 'gun-panel'; this.el.hud.appendChild(this.gunEl); this.gunKey = ''; }
    const t = g.player.tier || 0, next = GUN_TIERS[t + 1], top = m.gunLeader(), key = t + '|' + (top ? top.name + '|' + (top.tier || 0) : '');
    if (key === this.gunKey) return;
    this.gunKey = key;
    const lead = !top || top === g.player || (top.tier || 0) === t ? '' : '<em>Vorne: ' + esc(top.name) + ' · Stufe ' + ((top.tier || 0) + 1) + '</em>';
    this.gunEl.innerHTML = '<b>STUFE ' + (t + 1) + ' / ' + GUN_TIERS.length + '</b><span>' + (next ? 'Nächste: ' + esc(WEAPONS[next].name) : 'Ein Kill mit dem Messer gewinnt') + '</span>' + lead;
  }

  setScores(friendly, enemy, mode, ffaMine, ffaBest) {
    if (mode === 'ffa') { txt(this.el.sbF, String(ffaMine)); txt(this.el.sbE, String(ffaBest)); }
    else { txt(this.el.sbF, String(friendly)); txt(this.el.sbE, String(enemy)); }
  }
  setTimer(sec) {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    txt(this.el.timer, `${m}:${s.toString().padStart(2, '0')}`);
  }

  showScoreboard(show) {
    const b = this.el.board;
    if (!show) { b.classList.add('hidden'); return; }
    const g = this.game, m = g.match;
    if (!m) return;
    b.classList.remove('hidden');
    const rows = [...g.combatants].sort((a, c) => c.score - a.score || c.kills - a.kills);
    // over the network: how long a message takes there and back, for each person (bots run on somebody's computer)
    const net = g.net && g.net.inMatch ? g.net : null, cols = net ? 6 : 5;
    const ping = (c) => (!net ? '' : `<td>${c === g.player ? Math.round(net.rtt) || '–' : c.isBot ? '' : esc(net.pings[c.netId] ?? '–')}</td>`);
    const row = (c) => `<tr class="${c === g.player ? 'me' : ''}"><td class="${g.isFriendly(c, g.player) ? 'tf' : 'te'}">${esc(c.name)}</td><td>${esc(c.score)}</td><td>${esc(c.kills)}</td><td>${esc(c.deaths)}</td><td>${c.deaths ? (c.kills / c.deaths).toFixed(2) : c.kills.toFixed(2)}</td>${ping(c)}</tr>`;
    const head = '<tr><th>NAME</th><th>PUNKTE</th><th>KILLS</th><th>TODE</th><th>K/D</th>' + (net ? '<th>PING</th>' : '') + '</tr>';
    if (m.mode === 'br') {
      const alive = rows.filter((c) => (c.isPlayer ? c.alive : !c.out));
      b.innerHTML = `<h3>${g.mapDef.name} — WARZONE · ${alive.length} LEBEN NOCH</h3><table>${head}${rows.slice(0, 12).map(row).join('')}</table>`;
    } else if (m.teams) {
      const f = rows.filter((c) => c.team === g.player.team), e = rows.filter((c) => c.team !== g.player.team);
      b.innerHTML = `<h3>${g.mapDef.name} — ${m.wing ? 'WINGMAN · ' + m.points.list.map((P) => P.id + ': ' + (P.owner < 0 ? 'frei' : P.owner === g.player.team ? 'ihr' : 'Gegner')).join(' · ') : 'TEAM DEATHMATCH'}</h3><table>${head}<tr><th colspan="${cols}" class="tf">DEIN TEAM · ${m.score[g.player.team]}</th></tr>${f.map(row).join('')}<tr><th colspan="${cols}" class="te">GEGNER · ${m.score[1 - g.player.team]}</th></tr>${e.map(row).join('')}</table>`;
    } else if (m.gun) {
      const by = [...g.combatants].sort((a, c) => (c.tier || 0) - (a.tier || 0) || c.kills - a.kills);
      const line = (c) => `<tr class="${c === g.player ? 'me' : ''}"><td class="${c === g.player ? 'tf' : 'te'}">${esc(c.name)}</td><td>${(c.tier || 0) + 1}</td><td>${esc(WEAPONS[GUN_TIERS[c.tier || 0]].name)}</td><td>${esc(c.kills)}</td><td>${esc(c.deaths)}</td>${ping(c)}</tr>`;
      b.innerHTML = `<h3>${g.mapDef.name} — GUN GAME</h3><table><tr><th>NAME</th><th>STUFE</th><th>WAFFE</th><th>KILLS</th><th>TODE</th>${net ? '<th>PING</th>' : ''}</tr>${by.map(line).join('')}</table>`;
    } else {
      b.innerHTML = `<h3>${g.mapDef.name} — FREE FOR ALL</h3><table>${head}${rows.map(row).join('')}</table>`;
    }
  }
}
