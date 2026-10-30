import * as THREE from 'three';

// =============================================================================
// Dev autopilot (?autopilot=1): drives the player through virtual inputs so a
// match can be playtested hands-free. Navigates with the bot nav graph, aims at
// visible enemies with a human-ish turn rate, strafes, sprints, slides.
// =============================================================================
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

export class Autopilot {
  constructor(game) {
    this.g = game;
    this.path = null; this.wp = 0; this.repath = 0;
    this.strafeT = 0; this.strafe = 1; this.reactT = 0; this.lastTarget = null;
  }

  tick(dt) {
    const g = this.g, p = g.player, inp = g.input, cam = g.engine.camera;
    inp.virtual = {};
    if (!p.alive) { if (g.respawnT < -0.8) inp.virtualPressed.add('jump'); return; }
    let best = null, bd = 1e9;
    for (const b of g.bots) {
      if (!b.alive || g.isFriendly(b, p)) continue;
      const d = b.pos.distanceTo(p.pos);
      if (d < bd && d < 60 && g.col.lineClear(cam.position.x, cam.position.y, cam.position.z, b.pos.x, b.pos.y + 1.3, b.pos.z)) { bd = d; best = b; }
    }
    if (best !== this.lastTarget) { this.reactT = 0.25; this.lastTarget = best; }
    if (best) {
      this.reactT -= dt;
      const tx = best.pos.x - cam.position.x, ty = best.pos.y + 1.25 - cam.position.y, tz = best.pos.z - cam.position.z;
      const wy = Math.atan2(-tx, -tz), wp = Math.atan2(ty, Math.hypot(tx, tz));
      const dy = angDiff(p.yaw, wy), dpz = wp - p.pitch;
      p.yaw += Math.sign(dy) * Math.min(Math.abs(dy), 5 * dt + Math.abs(dy) * 0.12);
      p.pitch += dpz * 0.15;
      inp.virtual.ads = bd > 9;
      if (this.reactT <= 0 && Math.abs(dy) < 0.06 && Math.abs(dpz) < 0.06) {
        inp.virtual.fire = true;
        if (g.weapons.def.fire !== 'auto' && Math.random() < 0.25) inp.virtualPressed.add('fire');
      }
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeT = 0.4 + Math.random() * 0.7; this.strafe = Math.random() < 0.5 ? -1 : 1; }
      inp.virtual[this.strafe > 0 ? 'right' : 'left'] = true;
      if (g.weapons.w.mag === 0) inp.virtualPressed.add('reload');
      return;
    }
    if (g.weapons.w.mag < g.weapons.def.mag * 0.35 && g.weapons.state === 'idle') inp.virtualPressed.add('reload');
    this.repath -= dt;
    if (!this.path || this.wp >= this.path.length || this.repath <= 0) {
      const enemies = g.bots.filter((b) => b.alive && !g.isFriendly(b, p));
      const t = enemies.length ? enemies.reduce((a, b) => (a.pos.distanceTo(p.pos) < b.pos.distanceTo(p.pos) ? a : b)) : null;
      const goal = t ? t.pos : new THREE.Vector3();
      const s = g.nav.nearest(p.pos.x, p.pos.y, p.pos.z), e = g.nav.nearest(goal.x, goal.y, goal.z, 6);
      const path = g.nav.findPath(s, e);
      this.path = path ? g.nav.toWaypoints(path) : null; this.wp = 1; this.repath = 2.5;
    }
    if (this.path && this.wp < this.path.length) {
      const w = this.path[this.wp];
      const dx = w.x - p.pos.x, dz = w.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.7) this.wp++;
      const dy = angDiff(p.yaw, Math.atan2(-dx, -dz));
      p.yaw += dy * 0.15; p.pitch += (-0.05 - p.pitch) * 0.1;
      inp.virtual.forward = Math.abs(dy) < 1.2;
      if (!p.sprinting && Math.random() < 0.05) inp.virtualPressed.add('sprint');
      if (p.sprinting && !p.tac && Math.random() < 0.02) inp.virtualPressed.add('sprint');
      if (p.sprinting && Math.random() < 0.006) inp.virtualPressed.add('crouch');
      if (p.mode === 'slide' && Math.random() < 0.04) inp.virtualPressed.add('jump');
      if (w.y - p.pos.y > 0.5 && d < 1.5) inp.virtualPressed.add('jump');
    }
  }
}
