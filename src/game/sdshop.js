import * as THREE from 'three';
import { WEAPONS, PRIMARIES, SECONDARIES } from '../weapons/defs.js';
import { buildSkinned } from '../weapons/skins.js';
import { weaponMaterials } from '../weapons/models.js';

// =============================================================================
// Search and Destroy: money, the shop and the guns on the floor, as in Counter-Strike.
//   - everybody starts with START and a plain pistol; a round won pays WIN (more for the bomb or a defuse),
//     a round lost pays LOSS, STREAK more for every loss in a row before it; every kill pays by the gun it took
//   - at the start of a round, in the own side's spawn and for a few seconds after the start, guns are bought:
//     every gun of the game, only the plain one (no sight on it, no skin)
//   - who survives a round keeps his guns; who falls drops his gun, and anybody can pick it up (bots too)
//   - at the side switch it all starts over (START, pistol); the decider gives everybody enough for a full buy
// =============================================================================
export const ECON = {
  START: 800, MAX: 10000, WIN: 3000, WIN_OBJ: 3250, LOSS: 1400, STREAK: 500, LOSS_MAX: 2900,
  PLANT: 300, DEFUSE: 300, PLANT_TEAM: 600, DECIDER: 6000, BUY_TIME: 15,
};
// what each gun costs (the starting pistol is free)
export const PRICE = {
  pistol: 200, mpistol: 500, revolver: 600, handcannon: 700,
  pdw: 1100, shotgun: 1100, smg: 1250, autoshot: 2000, burst: 2300, ar: 2900, dmr: 3500, lmg: 4500, sniper: 4750, amr: 6000,
};
// what a kill pays, by the gun that made it
export function killReward(def) {
  if (!def) return 300;
  if (def.melee) return 1500;
  return { shotgun: 900, autoshot: 900, smg: 600, pdw: 600, mpistol: 600, sniper: 100, amr: 100 }[def.id] || 300;
}
// the plain gun: iron sights, where it has them (a sniper rifle keeps the scope it comes with)
export const plainOptic = (id) => (WEAPONS[id].optics.includes('iron') ? 'iron' : WEAPONS[id].optics[0]);
export const SHOP = [
  ['PISTOLEN', SECONDARIES],
  ['MP UND SCHROT', ['pdw', 'smg', 'shotgun', 'autoshot'].filter((id) => PRIMARIES.includes(id))],
  ['GEWEHRE', ['burst', 'ar', 'dmr'].filter((id) => PRIMARIES.includes(id))],
  ['SCHWER', ['lmg', 'sniper', 'amr'].filter((id) => PRIMARIES.includes(id))],
];

const _v = new THREE.Vector3();
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Shop {
  constructor(sd) {
    this.sd = sd; this.game = sd.game;
    this.items = [];      // guns on the floor: { id, obj, soldier (whose dropped gun it is), own (made here) }
    this.pendingPlayer = null;
    this.protos = new Map();
    this.streak = [0, 0]; // losses in a row, per team
    this.open = false; this.el = null;
    this.buyLeft = 0;
  }

  dispose() {
    this.clearItems();
    this.close();
    if (this.moneyEl) { this.moneyEl.remove(); this.moneyEl = null; }
  }

  // ---- money
  money(c) { return c.money ?? (c.money = ECON.START); }
  pay(c, n, why) {
    if (!c || c.remote) return;
    c.money = Math.max(0, Math.min(ECON.MAX, this.money(c) + n));
    if (c === this.game.player && n > 0 && why) this.game.hud.popup('+$' + n, why);
  }

  // a round begins: the side switch and the decider reset the money, the dead get a plain pistol
  startRound(round, half, decider) {
    const g = this.game;
    this.clearItems(); this.pendingPlayer = null; this.close();
    // (your own gun from the last round, if nobody took it: the bots clear theirs when they spawn)
    const corpse = g.playerCorpse;
    if (corpse && corpse.weaponDrop) { g.scene.remove(corpse.weaponDrop.obj); corpse.weaponDrop = null; }
    if (round === 1 || half) {
      this.streak = [0, 0];
      for (const c of g.combatants) { c.money = ECON.START; c.sdKeep = false; }
    }
    if (decider) for (const c of g.combatants) c.money = Math.max(this.money(c), ECON.DECIDER);
    this.buyLeft = ECON.BUY_TIME;
  }

  // the end of a round: winners, losers (more the longer they have been losing), the plant bonus
  endRound(win, how, planted) {
    const g = this.game, lose = 1 - win;
    const winPay = how === 'boom' || how === 'defused' ? ECON.WIN_OBJ : ECON.WIN;
    const losePay = Math.min(ECON.LOSS_MAX, ECON.LOSS + ECON.STREAK * this.streak[lose]);
    this.streak[lose]++; this.streak[win] = 0;
    for (const c of g.combatants) {
      if (c.team === win) this.pay(c, winPay, 'RUNDE GEWONNEN');
      else if (c.team === lose) this.pay(c, losePay + (planted && lose === this.sd.attack ? ECON.PLANT_TEAM : 0), 'RUNDE VERLOREN');
      c.sdKeep = c.alive; // (who lives keeps his guns into the next round)
    }
  }

  onKill(killer, victim, info) {
    if (killer && killer !== victim && killer.team !== victim.team) {
      const def = info && info.weapon && WEAPONS[info.weapon.id] ? WEAPONS[info.weapon.id] : killer.isBot ? killer.wdef : killer === this.game.player ? this.game.weapons.w && this.game.weapons.w.def : null;
      this.pay(killer, killReward(def), 'KILL');
    }
    this.dropFrom(victim);
  }

  // ---- the guns everybody has at the start of a round
  armPlayer() {
    const g = this.game, W = g.weapons, p = g.player;
    if (p.sdKeep && W.slots[1]) {
      for (const s of W.slots) if (s) { s.mag = s.def.mag; s.reserve = s.def.reserve; }
      W.cur = W.slots[0] ? 0 : 1; W.equip(true);
    } else {
      W.setStartLoadout();
      W.slots[1].reserve = W.slots[1].def.reserve;
    }
    p.sdKeep = false;
  }
  armBot(b) {
    if (!b.sdKeep || !b.wdef) b.setWeapon('pistol', 'standard', 'iron');
    b.sdKeep = false;
  }

  // ---- buying
  zone(team) {
    const list = this.sd.spawnList[this.sd.role(team)];
    const c = list.reduce((a, s) => a.set(a.x + s.x / list.length, 0, a.z + s.z / list.length), new THREE.Vector3());
    const r = Math.max(...list.map((s) => Math.hypot(s.x - c.x, s.z - c.z))) + 5;
    return { x: c.x, z: c.z, r };
  }
  canBuy(c) {
    const sd = this.sd;
    if (!c.alive || !(sd.phase === 'freeze' || (sd.phase === 'live' && this.buyLeft > 0))) return false;
    const z = this.zone(c.team);
    return Math.hypot(c.pos.x - z.x, c.pos.z - z.z) < z.r;
  }
  owns(id) {
    const W = this.game.weapons;
    return W.slots.some((s) => s && s.def.id === id);
  }
  buy(id) {
    const g = this.game, p = g.player, price = PRICE[id] ?? 1000;
    if (!this.canBuy(p) || this.money(p) < price || this.owns(id)) { g.audio.play('denied', { vol: 0.6 }); return false; }
    p.money -= price;
    const def = WEAPONS[id];
    const old = g.weapons.pickup({ weaponId: id, rarity: 0, optic: plainOptic(id), skin: 'standard', mag: def.mag, reserve: def.reserve });
    if (old) this.dropItem(old.def.id, p.pos, p.yaw);
    g.audio.play('pouch', { vol: 0.8 });
    this.render();
    return true;
  }
  // a bot spends its money at the start of a round: a rifle when it can, a cheap gun now and then, otherwise it saves
  botBuy(b) {
    if (b.remote || !b.alive || (b.wdef && b.wdef.slot === 'primary')) return;
    const m = this.money(b), pick = (ids) => ids.filter((id) => PRICE[id] <= m)[(Math.random() * ids.filter((id) => PRICE[id] <= m).length) | 0];
    let id = null;
    if (m >= 4750 && Math.random() < 0.18) id = pick(['sniper', 'lmg']);
    if (!id && m >= 2900) id = pick(['ar', 'ar', 'burst', 'dmr', 'autoshot']);
    if (!id && m >= 1100 && Math.random() < 0.6) id = pick(['smg', 'pdw', 'shotgun']);
    if (!id && m >= 700 && Math.random() < 0.35) id = pick(['handcannon', 'revolver', 'mpistol']);
    if (!id) return;
    b.money -= PRICE[id];
    b.setWeapon(id, 'standard', plainOptic(id));
  }

  // ---- guns on the floor
  proto(id) {
    let p = this.protos.get(id);
    if (!p) {
      const w = buildSkinned(WEAPONS[id].model, plainOptic(id), weaponMaterials(this.game.tex), 'standard');
      w.root.traverse((o) => { if (o.material && o.material.isMeshBasicMaterial && !o.material.map) o.visible = false; });
      p = w.root; this.protos.set(id, p);
    }
    return p;
  }
  // a gun put down at a spot (bought over, swapped): lying on its side on the floor
  dropItem(id, pos, yaw = 0, nid = null, exact = false) {
    const g = this.game, x = exact ? pos.x : pos.x - Math.sin(yaw) * 0.6, z = exact ? pos.z : pos.z - Math.cos(yaw) * 0.6, y = g.col.floorBelow(x, z, 0.1, pos.y + 1, pos.y - 20);
    const obj = this.proto(id).clone(true);
    obj.position.set(x, (Number.isFinite(y) ? y : pos.y) + 0.04, z);
    obj.rotation.set(0, yaw + Math.PI / 2, Math.PI / 2);
    g.scene.add(obj);
    const it = { id, obj, own: true, nid: nid || this.nidFor(), yaw };
    this.items.push(it);
    if (!nid) this.announce(it);
  }
  nidFor() { this.nidN = (this.nidN || 0) + 1; return 'w' + this.sd.round + '.' + (this.sd.idOf(this.game.player) || 'me') + '.' + this.nidN; }
  announce(it) {
    if (!this.sd.net) return;
    const P = it.at || it.obj.position;
    this.sd.send('wdrop', { n: it.nid, id: it.id, p: [+P.x.toFixed(2), +P.y.toFixed(2), +P.z.toFixed(2)], y: +(it.yaw || 0).toFixed(2) });
  }
  // another PC put one down / somebody took one
  netDrop(m) { if (!this.items.some((i) => i.nid === m.n)) this.dropItem(m.id, new THREE.Vector3(m.p[0], m.p[1] + 0.3, m.p[2]), m.y || 0, m.n, true); }
  netTake(nid) { const it = this.items.find((i) => i.nid === nid); if (it) this.takeItem(it, true); }
  // somebody fell: the gun out of his hands is the one to pick up (a player drops his primary if he has one)
  dropFrom(c) {
    const g = this.game;
    if (c.remote) return;
    // (your own body is made right after this: its gun is taken up in update)
    if (c === g.player) { const w = g.weapons.slots[0] || g.weapons.slots[1]; this.pendingPlayer = w && !w.def.melee ? w.def.id : null; return; }
    const id = c.wdef && c.wdef.id, s = c.soldier && c.soldier.weaponDrop;
    if (!id || WEAPONS[id].melee) return;
    if (s && s.obj) { const it = { id, obj: s.obj, soldier: c.soldier, nid: this.nidFor(), at: c.pos.clone() }; this.items.push(it); this.announce(it); }
    else this.dropItem(id, c.pos, c.aimYaw || 0);
  }
  takeItem(it, fromNet = false) {
    if (!fromNet && this.sd.net && it.nid) this.sd.net.send({ t: 'take', nid: it.nid });
    const i = this.items.indexOf(it);
    if (i >= 0) this.items.splice(i, 1);
    if (it.obj && it.obj.parent) it.obj.parent.remove(it.obj);
    if (it.soldier && it.soldier.weaponDrop && it.soldier.weaponDrop.obj === it.obj) it.soldier.weaponDrop = null;
  }
  clearItems() {
    for (const it of [...this.items]) if (it.own) this.takeItem(it); else { const i = this.items.indexOf(it); if (i >= 0) this.items.splice(i, 1); }
    this.items = [];
  }
  nearest(c, range) {
    let best = null, bd = range;
    for (const it of this.items) {
      const d = flat(c.pos, it.obj.position);
      if (d < bd && Math.abs(it.obj.position.y - c.pos.y) < 1.4) { bd = d; best = it; }
    }
    return best;
  }

  // ---- once per frame
  update(dt) {
    const g = this.game, sd = this.sd, p = g.player;
    if (sd.phase === 'live') this.buyLeft = Math.max(0, this.buyLeft - dt);
    const corpse = g.playerCorpse;
    if (this.pendingPlayer && corpse && corpse.weaponDrop && corpse.weaponDrop.obj) { const it = { id: this.pendingPlayer, obj: corpse.weaponDrop.obj, soldier: corpse, nid: this.nidFor(), at: p.pos.clone() }; this.items.push(it); this.announce(it); this.pendingPlayer = null; }
    // you: over a gun whose slot is empty takes it, F swaps for the one in your hands
    if (p.alive) {
      const it = this.nearest(p, 1.3);
      this.focus = it;
      if (it) {
        const slot = WEAPONS[it.id].slot === 'primary' ? 0 : 1, W = g.weapons;
        if (!W.slots[slot] || (g.input.pressed('interact') && !(sd.work && sd.work.ent === p))) {
          this.takeItem(it);
          const def = WEAPONS[it.id];
          const old = W.pickup({ weaponId: it.id, rarity: 0, optic: plainOptic(it.id), skin: 'standard', mag: def.mag, reserve: def.reserve });
          if (old) this.dropItem(old.def.id, p.pos, p.yaw);
          g.audio.play('pouch', { vol: 0.8 });
          this.focus = null;
        }
      }
    } else this.focus = null;
    // bots: one with nothing but a pistol takes the first rifle it walks over (see SearchDestroy.objectiveFor)
    for (const b of g.bots) {
      if (!b.alive || b.remote || (b.wdef && b.wdef.slot === 'primary')) continue;
      const it = this.nearest(b, 0.9);
      if (it && WEAPONS[it.id].slot === 'primary') { this.takeItem(it); b.setWeapon(it.id, 'standard', plainOptic(it.id)); }
    }
    if (this.open && !this.canBuy(p)) this.close();
    if (g.input.pressed('buy')) { if (this.open) this.close(); else if (this.canBuy(p)) this.show(); }
    this.hud();
  }

  // a primary on the floor close enough for a bot with only a pistol to fetch
  wantFor(b) {
    if (b.wdef && b.wdef.slot === 'primary') return null;
    let best = null, bd = 14;
    for (const it of this.items) {
      if (WEAPONS[it.id].slot !== 'primary') continue;
      const d = b.pos.distanceTo(it.obj.position);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  // ---- what you see: your money, the buy hint, the menu
  hud() {
    const g = this.game, p = g.player;
    if (!this.moneyEl) { this.moneyEl = document.createElement('div'); this.moneyEl.id = 'sd-money'; document.getElementById('hud').appendChild(this.moneyEl); }
    const can = this.canBuy(p), t = '$ ' + this.money(p) + (can && !this.open ? '  ·  [B] KAUFEN' + (this.sd.phase === 'live' ? ' · ' + Math.ceil(this.buyLeft) + ' S' : '') : '') + (this.focus ? '  ·  ' + (g.weapons.slots[WEAPONS[this.focus.id].slot === 'primary' ? 0 : 1] ? '[F] ' : '') + 'AUFHEBEN: ' + WEAPONS[this.focus.id].name : '');
    if (this.moneyEl.textContent !== t) this.moneyEl.textContent = t;
  }

  show() {
    const g = this.game;
    this.open = true;
    g.input.unlock();
    if (!this.el) {
      this.el = document.createElement('div'); this.el.id = 'sd-buy';
      document.getElementById('hud').appendChild(this.el);
      this.el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-buy]');
        if (b) { this.buy(b.dataset.buy); return; }
        if (e.target.closest('[data-close]')) { this.close(); g.input.lock(); }
      });
    }
    this.el.style.display = '';
    this.render();
  }
  render() {
    if (!this.el || !this.open) return;
    const p = this.game.player, m = this.money(p);
    this.el.innerHTML = '<div class="sdb-head"><b>KAUFEN</b><span>$ ' + m + '</span><button data-close>SCHLIESSEN [B]</button></div><div class="sdb-cols">' +
      SHOP.map(([title, ids]) => '<div class="sdb-col"><h4>' + title + '</h4>' + ids.map((id) => {
        const own = this.owns(id), cant = PRICE[id] > m;
        return '<button data-buy="' + id + '" class="' + (own ? 'own' : cant ? 'cant' : '') + '"><b>' + WEAPONS[id].name + '</b><span>' + (own ? 'HAST DU' : '$ ' + PRICE[id]) + '</span></button>';
      }).join('') + '</div>').join('') + '</div><div class="sdb-hint">Nur die Grundausführung: ohne Visier, ohne Skin. Eine neue Waffe ersetzt die alte im selben Platz, die alte bleibt liegen.</div>';
  }
  close() {
    if (!this.open) return;
    this.open = false;
    if (this.el) this.el.style.display = 'none';
  }
}
