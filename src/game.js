import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { Events } from './core/events.js';
import { Audio } from './core/audio.js';
import { loadSettings, saveSettings } from './core/settings.js';
import { TextureLib } from './world/textures.js';
import { MapBuilder } from './world/mapBuilder.js';
import { createEnvironment } from './world/environment.js';
import { Player } from './player/player.js';
import { Shake, DEG, clamp, damp, lerp, rand } from './core/math.js';
import { MAPS } from './world/maps/index.js';
import { Effects } from './fx/effects.js';
import { HUD } from './ui/hud.js';
import { PlayerWeapons } from './weapons/playerWeapons.js';
import { damageAt } from './weapons/defs.js';
import { Soldier, OUTFITS } from './characters/soldier.js';
import { Menu } from './ui/menu.js';
import { NavGraph } from './bots/nav.js';
import { IslandNav } from './bots/islandNav.js';
import { Match } from './game/match.js';
import { BRMatch } from './game/br.js';
import { Autopilot } from './dev/autopilot.js';
import { Net } from './net/net.js';
import { Lobby } from './ui/lobby.js';

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _n = new THREE.Vector3(), _t = new THREE.Vector3();

// everybody in a network match builds the same world: for as long as this is on, chance is the same everywhere
function seededRandom(seed) {
  const real = Math.random;
  let s = seed >>> 0;
  Math.random = () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return () => { Math.random = real; };
}

// ray vs sphere / capsule (returns distance or -1)
function raySphere(ro, rd, c, r) {
  const ox = ro.x - c.x, oy = ro.y - c.y, oz = ro.z - c.z;
  const b = ox * rd.x + oy * rd.y + oz * rd.z, cc = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - cc;
  if (h < 0) return -1;
  const t = -b - Math.sqrt(h);
  return t >= 0 ? t : -1;
}
function rayCapsule(ro, rd, pa, pb, r) {
  const bax = pb.x - pa.x, bay = pb.y - pa.y, baz = pb.z - pa.z;
  const oax = ro.x - pa.x, oay = ro.y - pa.y, oaz = ro.z - pa.z;
  const baba = bax * bax + bay * bay + baz * baz;
  const bard = bax * rd.x + bay * rd.y + baz * rd.z;
  const baoa = bax * oax + bay * oay + baz * oaz;
  const rdoa = rd.x * oax + rd.y * oay + rd.z * oaz;
  const oaoa = oax * oax + oay * oay + oaz * oaz;
  const a = baba - bard * bard;
  let b = baba * rdoa - baoa * bard;
  let c = baba * oaoa - baoa * baoa - r * r * baba;
  let h = b * b - a * c;
  if (h >= 0 && Math.abs(a) > 1e-9) {
    const t = (-b - Math.sqrt(h)) / a;
    const y = baoa + t * bard;
    if (y > 0 && y < baba) return t >= 0 ? t : -1;
    const ocx = y <= 0 ? oax : ro.x - pb.x, ocy = y <= 0 ? oay : ro.y - pb.y, ocz = y <= 0 ? oaz : ro.z - pb.z;
    b = rd.x * ocx + rd.y * ocy + rd.z * ocz; c = ocx * ocx + ocy * ocy + ocz * ocz - r * r;
    h = b * b - c;
    if (h > 0) { const t2 = -b - Math.sqrt(h); return t2 >= 0 ? t2 : -1; }
  }
  return -1;
}

export class Game {
  constructor() {
    this.settings = loadSettings();
    this.params = new URLSearchParams(location.search);
    this.dev = this.params.has('dev');
    this.events = new Events();
    this.engine = new Engine(document.getElementById('canvas-wrap'), this.settings);
    this.input = new Input(this.engine.renderer.domElement);
    this.input.hoverLook = this.dev;
    this.audio = new Audio(this.settings);
    this.scene = new THREE.Scene();
    this.vmScene = new THREE.Scene();
    this.time = 0;
    this.state = 'loading';
    this.shake = new Shake();
    this.combatants = [];
    this.bots = [];
    this.player = new Player(this);
    this.player.kills = 0; this.player.deaths = 0; this.player.score = 0; this.player.lastRadar = -99;
    this.lookDX = 0; this.lookDY = 0;
    this.sunDirCam = new THREE.Vector3(0, 1, 0);
    this.playerInShadow = false;
    this.hboxes = [];
    window.__game = this;
    this.bindEvents();
  }

  saveSettings() { saveSettings(this.settings); }

  get br() { return this.match && this.match.mode === 'br' ? this.match : null; }

  bindEvents() {
    const unlockAudio = () => { this.audio.unlock(); };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    this.engine.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked && !this.dev) this.input.lock();
    });
    this.input.onLockFail = () => {
      if (this._lockHinted) return; this._lockHinted = true;
      this.hud.message('<span style="font-size:19px">Maus-Fang hier nicht möglich – die Kamera folgt einfach der Maus,<br>am Fensterrand dreht sie weiter. Perfekt: http://localhost:8069 in Chrome/Edge</span>', 6);
    };
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing' && !this.dev && this.onPause) this.onPause();
    };
    // Escape pauses even without pointer lock (embedded views); Escape / L close the pause menu again
    window.addEventListener('keydown', (e) => {
      if (e.repeat || this.state !== 'playing') return;
      if (this.paused) { if (e.code === 'Escape' || e.code === 'KeyL') this.resume(); return; }
      if (e.code === 'Escape' && !this.input.locked && !this.dev) this.onPause();
    });
    // Ctrl is a game key now and browsers refuse to let a page block Ctrl+W: at least ask before leaving a match
    window.addEventListener('beforeunload', (e) => {
      if (this.state === 'playing' && !this.dev) { e.preventDefault(); e.returnValue = ''; }
    });
    // gameplay sound events
    const E = this.events;
    E.on('footstep', (e) => {
      const ent = e.entity, own = ent === this.player;
      const surf = this.surfaceUnder(ent);
      this.audio.play('step_' + surf, own ? { vol: e.sprint ? 0.32 : 0.22 } : { pos: ent.pos, vol: e.sprint ? 1.0 : 0.6, ref: 3, rolloff: 1.4, maxDist: 45 });
    });
    E.on('jump', (e) => { if (e.entity === this.player) { this.audio.play('jump', { vol: 0.35 }); this.player._landVm = -0.9; } });
    E.on('land', (e) => {
      if (e.entity === this.player || !e.entity) { this.audio.play('land', { vol: 0.25 + e.strength * 0.5 }); this.player._landVm = -1.2 - e.strength * 3; this.shake.add(e.strength * 0.15); }
    });
    E.on('slide', (e) => { if (e.entity === this.player) this.audio.play('slide', { vol: 0.55 }); else this.audio.play('slide', { pos: e.entity.pos, vol: 0.8, maxDist: 35 }); });
    E.on('dive', (e) => { if (e.entity === this.player) this.audio.play('dive', { vol: 0.5 }); });
    E.on('mantle', (e) => { if (e.entity === this.player) this.audio.play('mantle', { vol: 0.5 }); });
    E.on('mantleGrab', (e) => { if (e.entity === this.player) { this.audio.play('land', { vol: 0.28 * e.strength, rate: 1.5 }); this.audio.play('mantle', { vol: 0.3 * e.strength, rate: 1.15 }); this.shake.add(0.05 * e.strength); } });
    E.on('proneRoll', (e) => { if (e.entity === this.player) this.audio.play('dive', { vol: 0.28, rate: 1.25 }); });
    E.on('walljump', (e) => { if (e.entity === this.player) { this.audio.play('jump', { vol: 0.5, rate: 1.2 }); this.audio.play('step_concrete', { vol: 0.5 }); } });
  }

  surfaceUnder(ent) {
    const h = this.col.raycast(ent.pos.x, ent.pos.y + 0.2, ent.pos.z, 0, -1, 0, 0.6, this._sh || (this._sh = {}));
    const s = h ? h.surface : 'concrete';
    return s === 'metal' ? 'metal' : s === 'dirt' || s === 'wood' ? 'dirt' : 'concrete';
  }

  async init() {
    const msg = document.getElementById('load-msg'), fill = document.getElementById('load-fill');
    this.tex = new TextureLib(this.engine);
    await this.tex.generateAll((p, name) => { fill.style.width = (p * 100).toFixed(0) + '%'; msg.textContent = 'Generiere Texturen: ' + name; });
    this.hud = new HUD(this);
    this.weapons = new PlayerWeapons(this);
    this.menu = new Menu(this);
    this.net = new Net(this);
    this.lobby = new Lobby(this);
    document.getElementById('loading').classList.add('hidden');
    this.lastT = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    // Fallback ticker: some embedded/hidden views pause requestAnimationFrame entirely.
    // (dev only, so hidden player tabs never burn GPU in the background)
    if (this.dev) setInterval(() => { if (performance.now() - this.lastT > 250) this.frame(performance.now(), true); }, 100);
    if (this.dev && this.params.has('manual')) this.debugManual = true; // dev tooling drives the frames from the start
    if (this.dev && this.params.has('mp')) { this.loadMenuMap(this.settings.match.map); this.menu.show('play'); }
    else if (this.dev && this.params.has('br')) this.startMatch({ mode: 'br', map: 'island', bots: +(this.params.get('bots') ?? 19), difficulty: this.settings.match.difficulty });
    else if (this.dev) this.startMatch({ ...this.settings.match, map: this.params.get('map') || this.settings.match.map, bots: +(this.params.get('bots') ?? this.settings.match.bots) });
    else { this.loadMenuMap(this.settings.match.map); this.menu.show('play'); }
  }

  loadMenuMap(id) {
    this.loadMap(id);
    this.state = 'menu';
    document.getElementById('hud').classList.add('hidden');
  }

  beginMatch() {
    this.audio.unlock();
    this.menu.hide();
    this.startMatch({ ...this.settings.match });
    this.input.lock();
  }

  // Warzone: the island takes a moment to build, so the screen says so first
  beginWarzone() {
    this.audio.unlock();
    this.input.lock(); // has to happen right on the click
    this.menu.hide();
    const L = document.getElementById('loading');
    document.getElementById('load-msg').textContent = 'Die Insel wird vorbereitet';
    document.getElementById('load-fill').style.width = '100%';
    L.classList.remove('hidden');
    setTimeout(() => {
      this.startMatch({ mode: 'br', map: 'island', bots: 19, difficulty: this.settings.match.difficulty });
      L.classList.add('hidden');
    }, 60);
  }

  restartWarzone() {
    if (this.br) this.br.dispose();
    this.clearBots();
    this.match = null;
    document.getElementById('death-screen').classList.add('hidden');
    document.getElementById('menu').innerHTML = '';
    this.state = 'menu';
    this.beginWarzone();
  }

  onPause() {
    if (this.state !== 'playing' || this.paused) return;
    if (this.br && this.br.netDead && !this.br.watchOn) return; // (the result is up, it has its own way out)
    this.paused = true;
    this.menu.show('controls', 'pause');
  }

  resume() {
    this.menu.hide();
    this.paused = false;
    if (!this.br) this.weapons.applyLoadout(this.settings.loadout);
    this.input.pressedKeys.clear();
    this.input.lock();
  }

  // ---- multiplayer: from a match back into the room
  leaveNetMatch(tell = false) {
    const net = this.net;
    if (tell) net.send({ t: 'tolobby' });
    this.paused = false; this.netWait = false; this.showNetWait(false);
    if (this.br) this.br.dispose();
    this.clearBots();
    this.match = null;
    document.getElementById('death-screen').classList.add('hidden');
    this.menu.hide();
    this.loadMenuMap(this.settings.match.map);
    net.teardownMatch();
    if (net.status === 'match') net.status = net.ws ? 'lobby' : 'search';
    this.lobby.open = true;
    net.onChange = () => this.lobby.draw();
    this.lobby.draw();
    this.input.unlock();
  }

  showNetWait(on) {
    let el = document.getElementById('net-wait');
    if (on && !el) { el = document.createElement('div'); el.id = 'net-wait'; el.textContent = 'WARTE AUF DIE ANDEREN SPIELER'; document.getElementById('app').appendChild(el); }
    if (el) el.style.display = on ? '' : 'none';
  }

  quitToMenu() {
    if (this.net && this.net.status !== 'off') return this.leaveNetMatch(this.net.status === 'match');
    this.paused = false;
    if (this.br) this.br.dispose();
    if (this.clearBots) this.clearBots();
    this.match = null;
    document.getElementById('death-screen').classList.add('hidden');
    this.loadMenuMap(this.settings.match.map);
    this.menu.show('play');
  }

  isFriendly(a, b) {
    if (a === b) return true;
    if (!this.match || this.match.mode !== 'tdm') return false;
    return a.team === b.team;
  }

  loadMap(id) {
    const def = MAPS[id] || MAPS.drydock;
    this.scene.clear();
    this.playerCorpse = null; // its meshes went away with the old scene
    this.mapDef = def;
    const b = new MapBuilder(this.engine, this.tex);
    def.build(b);
    this.col = b.finalize(this.scene);
    this.mapRoot = b.root;
    this.glassMeshes = b.glassMeshes;
    this.glassByIdx = new Map(this.glassMeshes.map((m) => [m.userData.glassIdx, m]));
    this.envObjs = createEnvironment(this.engine, this.scene, def.env, def.bounds);
    this.engine.renderer.shadowMap.needsUpdate = true;
    // world effects live on layer 2: visible to every camera except the thermal picture
    const preFx = new Set(this.scene.children);
    this.fx = new Effects(this);
    for (const o of this.scene.children) if (!preFx.has(o)) o.traverse((c) => c.layers.set(2));
    this.engine.camera.layers.enable(2);
    // big outdoor maps see much further than the small arenas
    this.engine.camera.far = def.large ? 2400 : this.engine.q.viewDist + 100;
    this.engine.camera.updateProjectionMatrix();
    this.muzzleLight = null;
    if (this.engine.q.standard) { this.muzzleLight = new THREE.PointLight(0xffaa55, 0, 9, 2); this.scene.add(this.muzzleLight); }
    if (this.playerBody) this.playerBody.dispose();
    this.playerBody = new Soldier(this, OUTFITS.vanguard, { firstPerson: true });
    this.audio.occlusionTest = (p) => {
      const c = this.engine.camera.position;
      return this.col.lineClear(c.x, c.y, c.z, p.x, p.y + 0.2, p.z);
    };
    const t0 = performance.now();
    this.nav = def.large ? new IslandNav(this.col, def.bounds, def.layout.navRects, def.terrain, def.navHub).build() : new NavGraph(this.col, def.bounds).build();
    console.log('nav graph: ' + this.nav.n + ' nodes in ' + (performance.now() - t0).toFixed(0) + 'ms');
    this.hud.buildMinimap();
    // PIP render target for magnified optics
    if (!this.pipRT) {
      const r = this.engine.q.pipRes;
      this.pipRT = new THREE.WebGLRenderTarget(r, r, { samples: 0 });
      this.pipRT.texture.colorSpace = THREE.SRGBColorSpace;
      this.pipCam = new THREE.PerspectiveCamera(20, 1, 0.05, 1600);
      this.pipCam.layers.enable(2);
    }
  }

  startMatch(cfg) {
    this.cfg = cfg;
    if (this.match && this.br) this.br.dispose();
    this.match = null;
    const undoMap = cfg.net ? seededRandom(cfg.seed) : null;
    this.loadMap(cfg.map);
    if (undoMap) undoMap();
    this.clearBots();
    // (from a clean start again: how much the map drew may depend on the graphics settings here)
    const undoMatch = cfg.net ? seededRandom(cfg.seed + 1) : null;
    this.match = cfg.mode === 'br' ? new BRMatch(this, cfg) : new Match(this, cfg);
    if (undoMatch) undoMatch();
    this.player.team = cfg.mode === 'ffa' ? 1 : 0;
    this.player.kills = 0; this.player.deaths = 0; this.player.score = 0;
    this.combatants = [this.player];
    this.bots = this.match.createBots();
    for (const b of this.bots) { this.combatants.push(b); this.match.spawn(b); }
    this.time = 0;
    // (the clock starts over: nothing may keep waiting for a moment on the old one)
    this.recentAction = null; this.player.lastRadar = -99;
    this.weapons.startOver();
    if (cfg.mode === 'br') this.match.startPlayer();
    else { this.weapons.setLoadout(this.settings.loadout); this.spawnPlayer(); }
    this.state = 'playing';
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('sb-mode').textContent = cfg.mode === 'br' ? 'WARZONE' : cfg.mode === 'ffa' ? 'FREE FOR ALL' : 'TEAM DEATHMATCH';
    document.querySelector('#death-screen .death-hint').style.display = cfg.mode === 'br' ? 'none' : '';
    if (this.onMatchStart) this.onMatchStart(cfg);
  }

  clearBots() {
    if (this.hud) this.hud.clearTags();
    for (const b of this.bots) b.dispose();
    this.bots = [];
    this.combatants = [this.player];
  }

  spawnPlayer() {
    const p = this.player;
    p.alive = false;
    if (this.params.has('autopilot') && !this.autopilot) this.autopilot = new Autopilot(this);
    const sp = this.match.chooseSpawn(p);
    p.reset();
    p.pos.set(sp.x, sp.y, sp.z);
    p.yaw = sp.yaw; p.pitch = 0;
    p.alive = true;
    this.weapons.applyLoadout(this.settings.loadout);
    this.weapons.refillAll();
    this.weapons.cur = 0;
    this.weapons.equip(true);
    document.getElementById('death-screen').classList.add('hidden');
  }

  // --------------------------------------------------------------- combat
  // Fires one hitscan bullet. Returns hit info.
  // visual: someone else's shot, seen here. What it hit is his business.
  fireBullet(origin, dir, def, shooter, tracerFrom, first = true, visual = false) {
    const col = this.col;
    if (first && !visual && this.net && this.net.inMatch && !shooter.remote) this.net.sendShot(shooter, origin, dir, def);
    let ox = origin.x, oy = origin.y, oz = origin.z;
    let remaining = 300, dmgMul = 1, travelled = 0;
    const isPlayer = shooter === this.player;
    let endPoint = null;
    for (let pen = 0; pen < 3; pen++) {
      const hit = col.raycast(ox, oy, oz, dir.x, dir.y, dir.z, remaining, this._bh || (this._bh = {}), true);
      const worldT = hit ? hit.t : remaining;
      // ---- combatants
      let best = null, bestT = worldT;
      _o.set(ox, oy, oz);
      for (const c of this.combatants) {
        if (visual) break;
        if (c === shooter || !c.alive) continue;
        if (this.match && this.match.mode === 'tdm' && c.team === shooter.team) continue;
        // broad phase: distance from ray to body center
        _t.set(c.pos.x - ox, c.pos.y + 0.9 - oy, c.pos.z - oz);
        const along = _t.dot(dir);
        if (along < -1 || along > bestT + 1) continue;
        const perp = _t.lengthSq() - along * along;
        if (perp > 2.0) continue;
        const boxes = c.getHitboxes(this.hboxes);
        for (const h of boxes) {
          const t = h.type === 'sphere' ? raySphere(_o, dir, h.c, h.r) : rayCapsule(_o, dir, h.a, h.b, h.r);
          if (t >= 0 && t < bestT) { bestT = t; best = { c, part: h.part }; }
        }
      }
      // vehicles stop bullets below the window line, people inside stay exposed above it
      if (this.br) {
        let car = null;
        for (const v of this.br.vehicles.list) {
          if (v.dead) continue;
          const tv = v.rayHit(ox, oy, oz, dir.x, dir.y, dir.z, bestT);
          if (tv >= 0 && tv < bestT) { bestT = tv; car = v; best = null; }
        }
        if (car) {
          _p.set(ox + dir.x * bestT, oy + dir.y * bestT, oz + dir.z * bestT);
          this.fx.impact(_p, _n.copy(dir).negate(), 'metal', isPlayer ? 1 : 0.6);
          if (Math.random() < 0.5) this.audio.play('imp_metal', { pos: _p, vol: 0.55, maxDist: 50, occlude: false });
          if (!visual) {
            const hurt = damageAt(def, travelled + bestT) * dmgMul * (def.pellets ? 0.5 : 0.7);
            car.damage(hurt, shooter);
            if (this.net && this.net.inMatch) this.net.send({ t: 'ev', k: 'vdmg', i: this.br.vehicles.list.indexOf(car), a: +hurt.toFixed(1) });
          }
          endPoint = _p.clone();
          break;
        }
      }
      if (best) {
        const dist = travelled + bestT;
        let dmg = damageAt(def, dist) * dmgMul;
        const part = best.part;
        if (part === 'head') dmg *= def.head; else if (part === 'limb') dmg *= def.limb; else if (part === 'chest') dmg *= def.chest || 1;
        _p.set(ox + dir.x * bestT, oy + dir.y * bestT, oz + dir.z * bestT);
        this.fx.impact(_p, _n.copy(dir).negate(), 'flesh');
        if (!best.c.isPlayer) this.audio.play('imp_flesh', { pos: _p, vol: 0.7, maxDist: 40 });
        this.applyDamage(best.c, dmg, shooter, { part, dir: dir.clone(), weapon: def, point: _p.clone() });
        endPoint = _p.clone();
        break;
      }
      if (!hit) { endPoint = new THREE.Vector3(ox + dir.x * remaining, oy + dir.y * remaining, oz + dir.z * remaining); break; }
      // ---- world impact
      _p.set(hit.x, hit.y, hit.z); _n.set(hit.nx, hit.ny, hit.nz);
      if (hit.surface === 'glass' && this.glassByIdx.has(hit.index)) {
        this.shatterGlass(hit.index);
        ox = hit.x + dir.x * 0.05; oy = hit.y + dir.y * 0.05; oz = hit.z + dir.z * 0.05;
        travelled += hit.t; remaining -= hit.t; continue;
      }
      const near = _p.distanceToSquared(this.engine.camera.position) < 60 * 60;
      if (first || near) {
        this.fx.impact(_p, _n, hit.surface, isPlayer ? 1 : 0.6);
        if (hit.surface !== 'water') this.fx.decal(_p, _n, hit.surface === 'metal' ? 0.07 : 0.1);
        if (Math.random() < (isPlayer ? 0.55 : 0.35)) this.audio.play('imp_' + (hit.surface === 'glass' ? 'metal' : hit.surface === 'water' ? 'dirt' : hit.surface), { pos: _p, vol: 0.55, maxDist: 50, occlude: false });
      }
      endPoint = _p.clone();
      // ---- penetration through thin cover
      const thick = col.exitDistance(hit.index, hit.x + dir.x * 0.01, hit.y + dir.y * 0.01, hit.z + dir.z * 0.01, dir.x, dir.y, dir.z);
      const power = def.pen * (hit.pen || 0) * 0.6;
      if (power > 0 && thick < power) {
        dmgMul *= 0.55 * (1 - thick / power * 0.5);
        const ex = hit.x + dir.x * (thick + 0.02), ey = hit.y + dir.y * (thick + 0.02), ez = hit.z + dir.z * (thick + 0.02);
        this.fx.impact(_p.set(ex, ey, ez), _n.copy(dir), hit.surface, 0.5);
        travelled += hit.t + thick; remaining -= hit.t + thick;
        ox = ex; oy = ey; oz = ez;
        continue;
      }
      break;
    }
    // tracer (not every bullet for automatics)
    if (tracerFrom && endPoint) {
      const tr = isPlayer ? (def.fire !== 'auto' || Math.random() < 0.6) : Math.random() < 0.8;
      if (tr) this.fx.tracer(tracerFrom, endPoint, 380 + Math.random() * 120, isPlayer ? 0.018 : 0.03);
    }
    // bullet whiz past the player's head
    if (!isPlayer && this.player.alive && endPoint) {
      const e = this.engine.camera.position;
      _t.copy(e).sub(origin);
      const along = _t.dot(dir);
      const len = endPoint.distanceTo(origin);
      if (along > 2 && along < len) {
        const perp = Math.sqrt(Math.max(0, _t.lengthSq() - along * along));
        if (perp < 1.6 && perp > 0.25) this.audio.play('whiz', { pos: _p.copy(origin).addScaledVector(dir, along), vol: 0.9, occlude: false });
      }
    }
    return endPoint;
  }

  shatterGlass(idx) {
    const m = this.glassByIdx.get(idx);
    if (!m || !m.visible) return;
    m.visible = false;
    this.col.disable(idx);
    this.fx.glassShatter(m);
    this.audio.play('glass', { pos: m.position, vol: 0.9 });
  }

  applyDamage(victim, dmg, attacker, info) {
    if (!victim.alive) return;
    // someone who runs somewhere else: he gets told, and says what it did to him
    if (victim.remote) {
      if (this.net && this.net.inMatch && attacker && !attacker.remote) this.net.sendHit(victim, dmg, attacker, info);
      if (attacker === this.player) {
        victim.soldier.flinchHit(Math.min(1.5, dmg / 40));
        this.hud.hitmarker(victim.armor > 0 ? 'armor' : info.part === 'head' ? 'head' : 'hit');
        this.audio.play(info.part === 'head' ? 'hitHead' : 'hit', { vol: 0.5, rate: victim.armor > 0 ? 1.35 : 1 });
      }
      return;
    }
    if (this.br && this.br.untouchable(victim)) return;
    if (this.br && attacker && attacker.isBot) dmg = victim.isBot ? dmg * this.match.botDamageOn(victim) : Math.min(dmg * this.match.zone.now.toPlayer, 60); // no bot one-shots you
    // armor plates take the hit first
    let armorHit = false, armorBroke = false;
    if (victim.armor > 0) {
      const a = Math.min(victim.armor, dmg);
      victim.armor -= a; dmg -= a; armorHit = true;
      armorBroke = victim.armor <= 0;
    }
    victim.health -= dmg;
    victim.lastDamage = this.time;
    victim.lastAttacker = attacker;
    if (victim.onDamaged) victim.onDamaged(dmg, attacker, info);
    const killed = victim.health <= 0, felled = killed && victim.isBot && this.br && victim.goesDown(attacker, info);
    if (felled && attacker === this.player) this.hud.popup('+50', 'GEGNER AM BODEN');
    if (attacker === this.player) {
      this.hud.hitmarker(killed ? 'kill' : armorHit ? 'armor' : info.part === 'head' ? 'head' : 'hit');
      this.audio.play(killed ? 'kill' : info.part === 'head' ? 'hitHead' : 'hit', { vol: killed ? 0.7 : 0.5, rate: armorHit && !killed ? 1.35 : 1 });
      if (armorBroke && !killed) { this.audio.play('magDrop', { vol: 0.8, rate: 1.5 }); this.hud.popup('', 'RÜSTUNG ZERSTÖRT'); }
    }
    if (victim === this.player) {
      this.onPlayerDamaged(dmg, attacker, info);
      if (armorBroke) this.audio.play('magDrop', { vol: 0.9, rate: 0.8 });
    }
    if (killed && victim === this.player && this.br && this.br.playerGoesDown(attacker, info)) return;
    // the last shot from close by: the one who fired it comes over and does it by hand
    if (killed && victim === this.player && this.br && attacker && attacker.isBot && !attacker.remote && this.br.botFinisher(attacker)) return;
    if (killed && !felled) this.kill(victim, attacker, info);
  }

  onPlayerDamaged(dmg, attacker, info) {
    const p = this.player;
    p.lastDamage = this.time;
    if (attacker && attacker !== p) {
      const ang = Math.atan2(-(attacker.pos.x - p.pos.x), -(attacker.pos.z - p.pos.z));
      this.hud.damageFrom(ang, dmg);
    }
    this.shake.add(0.18);
    p.pitchKick.impulse(0.6 + Math.random() * 0.4);
    this.audio.play('hurt', { vol: 0.5 });
    void info;
  }

  kill(victim, killer, info) {
    const net = this.net && this.net.inMatch;
    if (net && !(info && info.fromNet) && (!victim.remote || (info && info.staged))) this.net.sendDied(victim, killer, info);
    victim.alive = false;
    victim.health = 0;
    // (in a network match the room does the counting and tells everyone)
    if (!net) victim.deaths = (victim.deaths || 0) + 1;
    const head = info && info.part === 'head';
    if (killer && killer !== victim && !net) {
      killer.kills = (killer.kills || 0) + 1;
      killer.score = (killer.score || 0) + 100 + (head ? 25 : 0);
    }
    this.hud.killfeed(killer || victim, victim, info && info.weapon ? info.weapon.name : '', head);
    if (killer === this.player) {
      this.hud.popup('+' + (100 + (head ? 25 : 0)), head ? 'KOPFSCHUSS' : 'GEGNER GETÖTET', head);
    }
    if (victim.onKilled) victim.onKilled(killer, info);
    if (this.match && this.match.onKill) this.match.onKill(killer, victim);
    if (victim === this.player) this.onPlayerKilled(killer, info);
  }

  spawnPlayerCorpse(info) {
    const p = this.player;
    if (!this.playerCorpse) this.playerCorpse = new Soldier(this, OUTFITS.vanguard);
    const c = this.playerCorpse;
    c.resetPose();
    c.setVisible(true);
    if (c.weaponDrop) { this.scene.remove(c.weaponDrop.obj); c.weaponDrop = null; }
    const w = this.weapons.w;
    c.setWeapon(w.def, w.optic);
    // pose it like the player was standing / crouching / sliding right now
    const st = {
      yaw: p.bodyYaw, pitch: p.pitch, speed: p.speedH, moveAngle: 0, crouch: p.stance === 'crouch' && p.mode === 'normal', slide: p.mode === 'slide',
      dive: p.mode === 'dive', prone: p.stance === 'prone', supine: p.supine, proneSpin: p.proneSpin, air: !p.onGround, tac: p.tac, sprint: p.sprinting, floorY: p.pos.y,
    };
    // lying down the hull center sits at the neck
    const by = p.bodyYaw, cp = p.pos.clone().add(new THREE.Vector3(Math.sin(by) * 0.58 * p.proneW, 0, Math.cos(by) * 0.58 * p.proneW));
    for (let i = 0; i < 6; i++) c.update(0.05, st, cp);
    const dir = info && info.dir ? info.dir.clone() : new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    const wdef = info && info.weapon;
    let strength = wdef ? Math.min(7, 2.2 + (wdef.damage[0] * (wdef.pellets || 1)) / 40) : 3;
    if (info && info.part === 'head') strength *= 1.15;
    c.die(dir, { part: info && info.part, point: info && info.point, strength, vel: p.vel.clone() });
  }

  onPlayerKilled(killer, info) {
    if (!(info && info.staged)) this.spawnPlayerCorpse(info); // (after a scene the body is already lying where it left it)
    this.lastKiller = killer && killer !== this.player ? killer : null;
    this.deathCamT = 0;
    const ds = document.getElementById('death-screen');
    ds.classList.remove('hidden');
    document.getElementById('death-by').textContent = killer && killer !== this.player ? 'von ' + killer.name : '';
    this.respawnT = 3.5;
    this.weapons.vm.root.visible = false;
    if (this.br) this.br.onPlayerDown(killer);
    this.audio.setMuffle(0);
  }

  onBotShot(bot) {
    this.recentAction = { pos: bot.pos.clone(), t: this.time };
    for (const b of this.bots) if (b !== bot) b.hear(bot.pos, bot);
  }

  onMatchEnd(won) {
    this.state = 'ended';
    this.input.unlock();
    const res = won === true ? 'SIEG' : won === false ? 'NIEDERLAGE' : 'UNENTSCHIEDEN';
    const el = document.getElementById('menu');
    this.hud.showScoreboard(true);
    const board = document.getElementById('scoreboard').innerHTML;
    this.hud.showScoreboard(false);
    const col = won ? 'var(--accent)' : won === false ? 'var(--enemy)' : '#fff';
    el.innerHTML = '<div class="menu-bg"></div><div class="menu-inner" style="align-items:center;justify-content:center">' +
      '<div class="logo" style="text-align:center;color:' + col + '">' + res + '</div>' +
      '<div id="end-board" style="margin:20px 0;min-width:640px;background:rgba(8,10,10,.86);padding:18px 22px">' + board + '</div>' +
      '<button class="btn" id="end-btn">WEITER</button></div>';
    el.querySelector('#end-btn').addEventListener('click', () => { this.audio.play('uiClick', { vol: 0.4 }); this.quitToMenu(); });
  }

  onPlayerShot(def) {
    this.recentAction = { pos: this.player.pos.clone(), t: this.time };
    for (const b of this.bots) b.hear(this.player.pos, this.player);
    if (this.muzzleLight) {
      const c = this.engine.camera;
      c.getWorldDirection(_d);
      this.muzzleLight.position.copy(c.position).addScaledVector(_d, 0.9);
      this.muzzleLight.intensity = def.heavy || def.id === 'shotgun' || def.id === 'sniper' ? 26 : 16;
    }
    this.player.lastRadar = this.time;
    this.events.emit('shot', { shooter: this.player, def, pos: this.player.pos });
  }

  // push overlapping combatants apart (XZ circles)
  separate(ent) {
    if (this.br) this.br.pushOutOfVehicles(ent);
    for (const c of this.combatants) {
      if (c === ent || !c.alive) continue;
      const dx = ent.pos.x - c.pos.x, dz = ent.pos.z - c.pos.z;
      if (Math.abs(ent.pos.y - c.pos.y) > 1.6) continue;
      const d2 = dx * dx + dz * dz, R = 0.62;
      if (d2 < R * R && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (R - d) * 0.5;
        const nx = dx / d, nz = dz / d;
        ent.pos.x += nx * push; ent.pos.z += nz * push;
      }
    }
  }

  // --------------------------------------------------------------- loop
  frame(now, fallback) {
    if (!fallback) { requestAnimationFrame((t) => this.frame(t)); this.drawnAt = performance.now(); }
    if (this.debugManual) { this.lastT = now; return; } // dev tooling drives frames by hand
    let dt = (now - this.lastT) / 1000;
    this.lastT = now;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) return;
    if (!fallback) this.engine.trackFrame(dt);
    try { this.update(dt); } catch (e) { console.error(e); }
    this.input.endFrame();
  }

  update(dt) {
    this.input.capture = this.state === 'playing' && !this.paused;
    if (this.state === 'playing' || this.state === 'ended') this.updatePlaying(dt);
    else this.renderMenuBackdrop(dt);
  }

  updatePlaying(dt) {
    this.engine.filmShot = 0;
    if (this.state === 'ended') { this.engine.render(this.scene, this.vmScene); return; } // freeze the world on the end screen
    const inp = this.input, p = this.player, W = this.weapons;
    // loaded, and waiting for everyone else to be
    if (this.netWait) {
      const cam = this.engine.camera;
      if (this.br && this.br.cameraOverride) this.br.applyCamera(cam, 0); else p.applyCamera(cam, W.punch, this.shake);
      cam.updateMatrixWorld();
      this.engine.render(this.scene, this.vmScene);
      return;
    }
    if (this.slowmo) dt *= this.slowmo;
    this.time += dt;
    this.frameId = (this.frameId || 0) + 1;
    if (this.autopilot && !this.paused) this.autopilot.tick(dt);
    // (in a network match the world doesn't stop for one person looking at the menu)
    const paused = this.paused && !(this.net && this.net.inMatch);
    // ---- look
    const zoom = this.currentZoom || 1;
    const adsK = W.adsAmount > 0.5 ? this.settings.adsSens / zoom : 1;
    const sens = this.settings.sensitivity * 0.022 * DEG * (paused ? 0 : 1);
    if (p.alive) p.look(inp.dx * sens * adsK, inp.dy * sens * adsK * (this.settings.invertY ? -1 : 1));
    // hover-look fallback: keep turning while the cursor rests at a window edge
    const edge = inp.edgeTurn(this._edge || (this._edge = {}));
    if (p.alive && !paused && (edge.x || edge.y)) {
      const rate = 2.6 * (this.settings.sensitivity / 3) * adsK;
      p.look(edge.x * Math.abs(edge.x) * rate * dt, edge.y * Math.abs(edge.y) * rate * dt * (this.settings.invertY ? -1 : 1));
    }
    document.body.classList.toggle('hoverlook', inp.hoverLook && !inp.locked && !paused && this.state === 'playing');
    this.lookDX = damp(this.lookDX, inp.dx * adsK, 20, dt); this.lookDY = damp(this.lookDY, inp.dy * adsK, 20, dt);

    // ---- simulate
    if (paused) { this.engine.render(this.scene, this.vmScene); this.renderLoadoutPreview(); return; }
    const br = this.br;
    if (p.alive && br && br.controlsPlayer) {
      br.updatePlayer(dt, inp);
    } else if (p.alive) {
      const steps = Math.ceil(dt / (1 / 120));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        p.update(h, inp, W);
        inp.suppress = true; // edge-triggered inputs only count once per frame
      }
      inp.suppress = false;
      W.update(dt, inp, p);
    } else if (!br) {
      this.respawnT -= dt;
      document.getElementById('death-timer').textContent = this.respawnT > 0 ? `Respawn in ${this.respawnT.toFixed(1)}s` : 'Klicken zum Respawnen';
      if (this.respawnT <= 0 && (inp.firePressed || this.respawnT < -2 || inp.pressed('jump'))) { this.spawnPlayer(); this.weapons.vm.root.visible = true; }
    }
    for (const b of this.bots) b.update(dt);
    if (this.playerCorpse && this.playerCorpse.dead) this.playerCorpse.update(dt, null, null);
    if (inp.pressed('loadout') && !br) { this.paused = true; this.menu.show('loadout', 'pause'); this.input.unlock(); }
    if (this.net) this.net.tick(dt);
    if (this.match) {
      this.match.update(dt);
      const sc = this.match.scores();
      this.hud.setScores(sc.f, sc.e, this.match.mode, sc.f, sc.e);
      this.hud.setTimer(Math.max(0, this.match.timeLeft));
    }

    // ---- camera
    this.shake.update(dt);
    const cam = this.engine.camera;
    const optic = W.vm.model && W.vm.model.optic;
    const adsE = W.adsAmount * W.adsAmount * (3 - 2 * W.adsAmount);
    const wz = W.vm.model ? W.vm.model.zoom : 1.2;
    const targetZoom = 1 + (wz - 1) * adsE;
    this.currentZoom = targetZoom;
    let baseV = this.engine.hfovToV(this.settings.fov);
    // FOV kick when tac sprinting / sliding
    this.fovKick = damp(this.fovKick || 0, (p.tac ? 6 : p.sprinting ? 2 : 0) + (p.mode === 'slide' ? 4 : 0), 6, dt);
    baseV += this.fovKick * (1 - adsE);
    cam.fov = 2 * Math.atan(Math.tan(baseV * DEG / 2) / targetZoom) / DEG + W.fovPunch.x;
    cam.updateProjectionMatrix();
    const punch = W.punch;
    if (p.alive && br && br.cameraOverride) br.applyCamera(cam, dt);
    else if (p.alive) { p.applyCamera(cam, punch, this.shake); cam.rotation.z += punch.roll; }
    else if (br && br.watchOn) br.watchCam(cam, dt);
    else this.deathCam(dt);
    // sniper scope sway + overlay
    const scoped = optic && optic.overlay && W.adsAmount > 0.92 && p.alive;
    this.hud.setScope(scoped ? optic.overlay : null);
    W.vm.root.visible = p.alive && !scoped && !(br && br.hideViewmodel);
    W.vm.smoke.points.visible = W.vm.root.visible;
    if (!W.vm.root.visible) W.vm.smoke.update(dt); // (the smoke of the last shots goes on without the gun, out of sight)
    if (scoped) {
      const t = this.time, k = (optic.sway ?? 1) * (p.mount ? 0.3 : 1);
      cam.rotation.x += (Math.sin(t * 0.9) * 0.0018 + Math.sin(t * 2.3) * 0.0006) * k;
      cam.rotation.y += Math.cos(t * 0.7) * 0.0018 * k;
    }
    cam.updateMatrixWorld();
    // viewmodel camera FOV (narrower when aiming for a bigger sight picture)
    const vmc = this.engine.vmCamera;
    vmc.fov = lerp(58, 48, adsE); vmc.updateProjectionMatrix();
    if (p.alive) W.vm.updateLedgeHands(cam);

    // ---- sun direction in camera space, shadow check for the viewmodel light
    const sd = this.envObjs.sunDir;
    this.sunDirCam.copy(sd).applyQuaternion(_q.copy(cam.quaternion).invert());
    this._shT = (this._shT || 0) - dt;
    if (this._shT <= 0) {
      this._shT = 0.12;
      const e = cam.position;
      this.playerInShadow = !!this.col.raycast(e.x, e.y, e.z, sd.x, sd.y, sd.z, 80, this._sh2 || (this._sh2 = {}));
    }

    // ---- first person body
    if (this.playerBody) {
      const fb = this.playerBody;
      fb.setVisible(p.alive && !(br && br.hideBody));
      const pw = p.proneW * (0.58 - 0.13 * fb.anim.supine), by = p.bodyYaw; // (on the back: chest just under the view)
      const back = p.mode === 'slide' ? 0.05 : 0.16 * (1 - p.proneW);
      // slide / on the back: body slightly left so the legs show beside the gun
      const sideOff = p.mode === 'slide' ? -0.12 : -0.15 * fb.anim.supine;
      // lying down the neck is under the camera, the body stretches away along its own axis
      // (pulling up on a ledge the eye sits low over the hull: the legs hang below it, not around the camera)
      const fy = p.mode === 'mantle' ? Math.min(p.pos.y, p.pos.y + p.eyeH - 1.3) : p.pos.y;
      _t.set(p.pos.x + Math.sin(p.yaw) * back + Math.cos(p.yaw) * sideOff + Math.sin(by) * pw, fy, p.pos.z + Math.cos(p.yaw) * back - Math.sin(p.yaw) * sideOff + Math.cos(by) * pw);
      const fwd = p.moveInput.y, side = p.moveInput.x;
      fb.update(dt, {
        yaw: by, pitch: 0, speed: p.speedH, moveAngle: Math.atan2(side, fwd || (side ? 0 : 1)),
        crouch: p.stance === 'crouch' && p.mode === 'normal', slide: p.mode === 'slide', dive: p.mode === 'dive',
        prone: p.stance === 'prone' && p.mode === 'normal', supine: p.supine, proneSpin: p.proneSpin, air: !p.onGround && p.mode === 'normal', mantle: p.mode === 'mantle',
        tac: p.tac, sprint: p.sprinting, floorY: p.pos.y,
      }, _t);
    }

    // ---- effects, audio listener, hud
    this.fx.setPixelScale(window.innerHeight * this.engine.renderer.getPixelRatio() / (window.devicePixelRatio || 1), cam.fov);
    this.fx.update(dt, cam);
    if (this.muzzleLight && this.muzzleLight.intensity > 0) this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 400);
    cam.getWorldDirection(_d);
    this.audio.setListener(cam.position, _d, _t.set(0, 1, 0));
    const lowHp = p.alive ? clamp((0.45 - p.health / p.maxHealth) / 0.35, 0, 1) : 0;
    this.audio.setMuffle(lowHp * 0.7);
    this.hud.update(dt);
    this.hud.showScoreboard(inp.down('scoreboard'));

    // ---- render (PIP scope first)
    if (optic && optic.lens) {
      // the lens only shows a live picture while aiming, otherwise it's dark glass
      const live = W.adsAmount > 0.02 && p.alive;
      if (live !== optic._live) {
        optic._live = live;
        optic.pipMat.map = live ? this.pipRT.texture : null;
        optic.pipMat.color.setHex(live ? 0xffffff : 0x0c1116);
        optic.pipMat.needsUpdate = true;
      }
      if (live) {
        const pc = this.pipCam;
        pc.position.copy(cam.position); pc.quaternion.copy(cam.quaternion);
        pc.fov = 2 * Math.atan(Math.tan(baseV * DEG / 2) / (optic.pipZoom || 3)) / DEG;
        pc.updateProjectionMatrix();
        const r = this.engine.renderer;
        W.vm.root.visible = false;
        r.setRenderTarget(this.pipRT);
        if (optic.thermal) this.renderThermal(pc); else { r.clear(); r.render(this.scene, pc); }
        r.setRenderTarget(null);
        W.vm.root.visible = true;
      }
    }
    if (scoped && optic.thermal) { this.engine.renderer.info.reset(); this.renderThermal(cam); }
    else this.engine.render(this.scene, this.vmScene);
    if (br) br.hud.renderPreview(dt);
    this.updateDebug(dt);
  }

  // Thermal picture into the current render target: a cold, flat world, then the bodies on top of it
  // (their depth from the first pass keeps them behind walls; glass counts as a wall, as with real thermal sights).
  renderThermal(camera) {
    const r = this.engine.renderer, s = this.scene, mask = camera.layers.mask, bg = s.background;
    if (!this.thermalMats) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, '#fffdf0'); g.addColorStop(0.55, '#ffe9a8'); g.addColorStop(0.82, '#ff9a3c'); g.addColorStop(1, '#c23a1c');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
      const matcap = new THREE.CanvasTexture(c); matcap.colorSpace = THREE.SRGBColorSpace;
      this.thermalMats = {
        cold: new THREE.MeshLambertMaterial({ color: 0x47566e, fog: false }),
        hot: new THREE.MeshMatcapMaterial({ matcap, fog: false }),
      };
    }
    s.background = null; // a color background would clear the first pass again
    r.setClearColor(0x0b0f18, 1); r.clear();
    camera.layers.set(0); s.overrideMaterial = this.thermalMats.cold;
    r.render(s, camera);
    camera.layers.set(1); s.overrideMaterial = this.thermalMats.hot;
    r.render(s, camera);
    s.overrideMaterial = null; camera.layers.mask = mask; s.background = bg;
  }

  deathCam(dt) {
    // fly out of your head into a third-person view of your own ragdoll,
    // slowly orbiting it; then turn toward whoever killed you
    const cam = this.engine.camera, p = this.player;
    this.deathCamT = (this.deathCamT || 0) + dt;
    const t = this.deathCamT;
    const corpse = this.playerCorpse && this.playerCorpse.ragdoll;
    const target = _p.copy(corpse ? corpse.center : p.pos);
    target.y += 0.35;
    const k = this.lastKiller;
    let yaw = p.yaw + Math.PI + t * 0.18;
    if (k && t > 2.2) {
      const toK = Math.atan2(-(k.pos.x - target.x), -(k.pos.z - target.z));
      yaw = toK + Math.PI + 0.35;
    }
    // prefer an orbit direction with free space around the body (walls nearby)
    const dist = 4.4, height = 2.7;
    const freeAt = (yw) => {
      const ddx = -Math.sin(yw) * dist, ddz = -Math.cos(yw) * dist, L0 = Math.hypot(ddx, height, ddz);
      const h0 = this.col.raycast(target.x, target.y, target.z, ddx / L0, height / L0, ddz / L0, L0, this._dch2 || (this._dch2 = {}));
      return h0 ? h0.t / L0 : 1;
    };
    if (freeAt(yaw) < 0.75) {
      let bestY = yaw, bestF = -1;
      for (let i = 1; i <= 8; i++) for (const sgn of [1, -1]) {
        const yw = yaw + sgn * i * 0.39, fr = freeAt(yw);
        if (fr > bestF + 0.05) { bestF = fr; bestY = yw; }
        if (fr >= 0.95) break;
      }
      yaw = bestY;
    }
    this._dcYaw = this._dcYaw === undefined || t < dt * 1.5 ? p.yaw + Math.PI : this._dcYaw + ((((yaw - this._dcYaw) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 2.2);
    const want = _o.set(target.x - Math.sin(this._dcYaw) * dist, target.y + height, target.z - Math.cos(this._dcYaw) * dist);
    // keep the camera out of walls
    const dx = want.x - target.x, dy = want.y - target.y, dz = want.z - target.z, L = Math.hypot(dx, dy, dz);
    const hit = this.col.raycast(target.x, target.y, target.z, dx / L, dy / L, dz / L, L, this._dch || (this._dch = {}));
    if (hit) want.set(target.x + dx / L * Math.max(0.6, hit.t - 0.3), target.y + dy / L * Math.max(0.6, hit.t - 0.3), target.z + dz / L * Math.max(0.6, hit.t - 0.3));
    // blend from the eye position over the first half second
    const f = Math.min(1, t / 0.5), e = f * f * (3 - 2 * f);
    if (!this._dcStart || t < dt * 1.5) this._dcStart = cam.position.clone();
    cam.position.lerpVectors(this._dcStart, want, e);
    cam.lookAt(target);
    if (k) document.getElementById('death-by').textContent = 'von ' + k.name + (k.wdef ? '  [' + k.wdef.name + ']' : '');
  }

  renderMenuBackdrop(dt) {
    if (!this.mapRoot) return;
    this.time += dt;
    const cam = this.engine.camera;
    const a = this.time * 0.04;
    const b = this.mapDef.bounds;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, R = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.55;
    cam.position.set(cx + Math.cos(a) * R, 26, cz + Math.sin(a) * R * 0.8);
    cam.fov = 60; cam.updateProjectionMatrix();
    cam.lookAt(cx, 0, cz);
    this.engine.render(this.scene, null);
    this.renderLoadoutPreview();
  }

  // loadout: rotating 3D weapon preview on the right side (main menu and pause menu)
  renderLoadoutPreview() {
    const pv = this.menuPreview;
    if (pv) {
      const r = this.engine.renderer, W = window.innerWidth, H = window.innerHeight;
      const vw = Math.floor(W * 0.4), vh = Math.floor(H * 0.5);
      pv.cam.aspect = vw / vh; pv.cam.updateProjectionMatrix();
      pv.cam.position.set(0, 0.12, 1.75); pv.cam.lookAt(0, 0.0, 0);
      pv.holder.rotation.y = Math.PI / 2 + Math.sin(this.time * 0.4) * 0.6;
      pv.holder.rotation.x = Math.sin(this.time * 0.3) * 0.08;
      r.clearDepth();
      r.setScissorTest(true);
      r.setViewport(W - vw - W * 0.01, H * 0.3, vw, vh); r.setScissor(W - vw - W * 0.01, H * 0.3, vw, vh);
      r.render(pv.scene, pv.cam);
      r.setScissorTest(false);
      r.setViewport(0, 0, W, H);
    }
  }

  updateDebug(dt) {
    if (!this.settings.showFps) { document.getElementById('fps').textContent = ''; return; }
    this._fpsAcc = (this._fpsAcc || 0) + dt; this._fpsN = (this._fpsN || 0) + 1;
    if (this._fpsAcc > 0.5) {
      const info = this.engine.renderer.info.render;
      document.getElementById('fps').textContent = `${Math.round(this._fpsN / this._fpsAcc)} FPS · ${info.calls} DC · ${(this.engine.scale * 100).toFixed(0)}%`;
      this._fpsAcc = 0; this._fpsN = 0;
    }
  }
}
const _q = new THREE.Quaternion();
export { rand };
