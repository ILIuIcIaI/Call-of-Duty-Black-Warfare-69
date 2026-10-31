import * as THREE from 'three';
import { Soldier, OUTFITS } from '../characters/soldier.js';
import { makeCanopy, openCanopy, OPEN_PULL, OPEN_BLOOM } from '../bots/brbot.js';
import { WEAPONS, OPTICS } from '../weapons/defs.js';
import { angleDiff } from '../core/math.js';

// =============================================================================
// Somebody who runs on somebody else's computer, a player or a bot: a body that does
// what the network says, a little in the past so it never has to guess. To everything
// else in the game it looks like a bot: it can be seen, shot and finished.
// =============================================================================
export const WEAPON_IDS = Object.keys(WEAPONS), OPTIC_IDS = Object.keys(OPTICS);
export const F = { crouch: 1, slide: 2, dive: 4, prone: 8, supine: 16, air: 32, mantle: 64, tac: 128, sprint: 256, reload: 512, fall: 1024, seat: 2048, downed: 4096, reviving: 8192, chute: 16384, alive: 32768, plane: 65536, ads: 131072 };
const DELAY = 0.11, _seat = new THREE.Vector3();

export class Puppet {
  constructor(game, entry) {
    this.game = game;
    this.remote = true;
    this.id = entry.id; this.name = entry.name; this.team = entry.team;
    this.isBot = !!entry.bot;
    this.pos = new THREE.Vector3(0, -500, 0); this.vel = new THREE.Vector3();
    this.aimYaw = 0; this.aimPitch = 0;
    this.soldier = new Soldier(game, OUTFITS[entry.outfit] || OUTFITS.raven);
    this.soldier.setVisible(false);
    this.kills = 0; this.deaths = 0; this.score = 0; this.lastRadar = -99;
    this.alive = false; this.health = 100; this.maxHealth = 100; this.armor = 0;
    this.lastDamage = -99; this.lastAttacker = null;
    this.hb = []; this.hbFrame = -1;
    this.buf = [];
    this.flags = 0; this.out = false; this.sky = null; this.downed = false; this.prone = false; this.crouching = false; this.scripted = false;
    this.st = { yaw: 0, pitch: 0, speed: 0, moveAngle: 0, floorY: 0 };
    this.wid = -1; this.oid = -1;
    this.setGun(entry.weapon ? WEAPON_IDS.indexOf(entry.weapon) : WEAPON_IDS.indexOf('ar'), OPTIC_IDS.indexOf('iron'));
    this.seen = false; this.deathT = -99;
  }

  setGun(wi, oi) {
    if (wi === this.wid && oi === this.oid) return;
    const def = WEAPONS[WEAPON_IDS[wi]] || WEAPONS.ar, opt = OPTIC_IDS[oi] || 'iron';
    this.wid = wi; this.oid = oi; this.wdef = def; this.optic = def.optics.includes(opt) ? opt : def.optics[0];
    if (!this.soldier.dead) this.soldier.setWeapon(def, this.optic);
  }

  get eyeH() { return this.downed ? 0.42 : this.prone ? 0.3 : this.crouching ? 1.12 : 1.6; }
  eyePos(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.eyeH, this.pos.z); }

  getHitboxes(out) {
    if (this.hbFrame !== this.game.frameId) { this.soldier.hitboxes(this.hb); this.hbFrame = this.game.frameId; }
    out.length = 0; for (const h of this.hb) out.push(h);
    return out;
  }

  // nothing here decides anything
  hear() {}
  spawn() {}
  goesDown() { return false; }
  onDamaged() { this.soldier.flinchHit(0.8); }
  dropLoot() {}

  onKilled(killer, info) {
    this.alive = false;
    this.deathT = this.game.time;
    if (this.game.br) this.out = true;
    this.closeCanopy();
    const w = info && info.weapon;
    let strength = w && w.damage ? Math.min(7, 2.2 + (w.damage[0] * (w.pellets || 1)) / 40) : 3;
    if (info && info.part === 'head') strength *= 1.15;
    if (info && info.strength) strength = info.strength;
    this.soldier.die(info && info.dir ? info.dir : new THREE.Vector3(0, 0, 1), { part: info && info.part, point: info && info.point, strength, vel: this.vel.clone(), staged: info && info.staged });
  }

  // ---- what came in: [x, y, z, yaw, pitch, bodyYaw, speed, moveAngle, flags, proneSpin, weapon, optic, health, armor]
  receive(s) {
    const now = performance.now() / 1000;
    this.buf.push({ t: now, s });
    if (this.buf.length > 24) this.buf.shift();
  }

  closeCanopy() { if (this.canopy) this.canopy.visible = false; this.chuteT = undefined; }

  update(dt) {
    const g = this.game;
    if (this.soldier.dead) {
      // he is on the ground here, and the state says he is up again: a new life
      const last = this.buf[this.buf.length - 1];
      if (!g.br && last && (last.s[8] & F.alive) && g.time - this.deathT > 1) this.reborn(last.s);
      else {
        if (g.br && g.time - this.deathT > 16) { this.soldier.setVisible(false); return; }
        this.soldier.update(dt, this.st, this.pos);
        return;
      }
    }
    if (this.scripted) return;
    const b = this.buf;
    if (!b.length) return;
    const at = performance.now() / 1000 - DELAY;
    while (b.length > 2 && b[1].t <= at) b.shift();
    const A = b[0], B = b[1] || b[0], u = B.t > A.t ? Math.min(1.2, Math.max(0, (at - A.t) / (B.t - A.t))) : 1, a = A.s, c = B.s;
    const px = this.pos.x, pz = this.pos.z, py = this.pos.y;
    this.pos.set(a[0] + (c[0] - a[0]) * u, a[1] + (c[1] - a[1]) * u, a[2] + (c[2] - a[2]) * u);
    if (dt > 0 && py > -400) this.vel.set((this.pos.x - px) / dt, (this.pos.y - py) / dt, (this.pos.z - pz) / dt);
    this.aimYaw = a[3] + angleDiff(a[3], c[3]) * u;
    this.aimPitch = a[4] + (c[4] - a[4]) * u;
    const fl = c[8], yaw = a[5] + angleDiff(a[5], c[5]) * u, wasAlive = this.alive;
    this.flags = fl;
    this.setGun(c[10], c[11]);
    this.health = c[12]; this.armor = c[13];
    // Dying is said out loud, the state only says it a moment earlier or later: he stays alive until the word comes. Unless it never does.
    if (fl & F.alive) { this.alive = true; this.deadSince = 0; } else if (wasAlive) {
      this.deadSince = this.deadSince || g.time;
      if (g.time - this.deadSince > 1.5) { g.kill(this, null, { part: 'chest', fromNet: true }); return; }
    }
    if ((fl & F.downed) && !this.downed && g.br) g.br.letGo(this, 0.6); // (whoever was shooting often thinks it is done, as with anybody)
    this.downed = !!(fl & F.downed); this.prone = !!(fl & F.prone); this.crouching = !!(fl & F.crouch);
    const sky = fl & F.plane ? 'plane' : fl & F.fall ? 'fall' : fl & F.chute ? 'chute' : null;
    if (this.sky && !sky) this.safeUntil = g.time + 9; // (a moment to find a gun before anyone cares, as for anybody)
    this.sky = sky;
    const S = this.st;
    S.yaw = yaw; S.pitch = this.aimPitch; S.speed = a[6] + (c[6] - a[6]) * u; S.moveAngle = c[7];
    S.crouch = this.crouching; S.slide = !!(fl & F.slide); S.dive = !!(fl & F.dive); S.prone = this.prone; S.supine = !!(fl & F.supine); S.proneSpin = c[9] === 9 ? undefined : c[9];
    S.air = !!(fl & (F.air | F.chute)); S.mantle = !!(fl & F.mantle); S.tac = !!(fl & F.tac); S.sprint = !!(fl & F.sprint); S.reload = !!(fl & F.reload); S.fall = !!(fl & F.fall); S.seat = !!(fl & F.seat); S.downed = this.downed; S.reviving = !!(fl & F.reviving);
    S.floorY = this.sky || S.seat ? this.pos.y - 200 : this.pos.y;
    // a body in the plane isn't there yet
    const vis = !this.sky || this.sky !== 'plane';
    this.soldier.setVisible(vis && (this.alive || wasAlive));
    if (!vis) return;
    this.soldier.update(dt, S, S.seat ? _seat.copy(this.pos).setY(this.pos.y + 0.15) : this.pos);
    if (fl & F.chute) {
      if (!this.canopy) { this.canopy = makeCanopy(); g.scene.add(this.canopy); }
      // (a person goes for the handle first, a bot's has already been pulled when it says so)
      if (this.chuteT === undefined) this.chuteT = this.isBot ? OPEN_PULL : 0;
      this.chuteT += dt;
      this.canopy.visible = this.chuteT > OPEN_PULL;
      openCanopy(this.canopy, (this.chuteT - OPEN_PULL) / OPEN_BLOOM);
      this.canopy.position.set(this.pos.x, this.pos.y + 0.1, this.pos.z); this.canopy.rotation.y = yaw;
    } else this.closeCanopy();
  }

  reborn(s) {
    const so = this.soldier;
    so.resetPose();
    if (so.weaponDrop) { this.game.scene.remove(so.weaponDrop.obj); so.weaponDrop = null; }
    so.setWeapon(this.wdef, this.optic);
    so.setVisible(true);
    this.alive = true;
    this.buf = [{ t: performance.now() / 1000, s }];
    this.pos.set(s[0], s[1], s[2]);
  }

  dispose() {
    this.soldier.dispose();
    if (this.canopy) this.game.scene.remove(this.canopy);
  }
}
