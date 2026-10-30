// =============================================================================
// Weapon definitions. Health is 150 (like modern CoD), so the numbers below
// produce ~250-350ms time-to-kill for automatics at close range.
// damage: [near, far] linear falloff between range[0] and range[1] (meters)
// recoil: up/side in degrees per shot; pattern makes the first shots predictable
// =============================================================================
export const WEAPONS = {
  ar: {
    id: 'ar', name: 'AR-77 VALKYR', cls: 'Sturmgewehr', slot: 'primary', model: 'ar', fire: 'auto',
    rpm: 760, damage: [34, 26], range: [30, 58], head: 1.4, limb: 0.9, mag: 30, reserve: 150,
    reload: 2.5, reloadEmpty: 1.65, ads: 0.12, sprintToFire: 0.17, tacToFire: 0.3, mobility: 1.0, adsMoveMul: 0.62,
    hip: 4.2, adsSpread: 0.08, moveSpread: 2.5, recoil: { up: 0.62, side: 0.28, bias: 0.12, recover: 7, kick: 1.0, vis: 1.0 },
    optics: ['iron', 'reflex', 'holo', 'acog'], sound: 'ar', reloadStyle: 'mag', pen: 1.0,
    stats: { dmg: 62, rof: 70, rng: 70, acc: 68, mob: 64, hnd: 62 },
  },
  smg: {
    id: 'smg', name: 'VEKTOR-9', cls: 'Maschinenpistole', slot: 'primary', model: 'smg', fire: 'auto',
    rpm: 920, damage: [28, 18], range: [12, 32], head: 1.3, limb: 0.95, mag: 32, reserve: 160,
    reload: 2.2, reloadEmpty: 1.9, ads: 0.085, sprintToFire: 0.11, tacToFire: 0.22, mobility: 1.06, adsMoveMul: 0.78,
    hip: 3.0, adsSpread: 0.12, moveSpread: 1.4, recoil: { up: 0.45, side: 0.36, bias: -0.05, recover: 9, kick: 0.75, vis: 0.8 },
    optics: ['iron', 'reflex', 'holo'], sound: 'smg', reloadStyle: 'mag', pen: 0.6,
    stats: { dmg: 50, rof: 90, rng: 38, acc: 60, mob: 88, hnd: 86 },
  },
  lmg: {
    id: 'lmg', name: 'HMG-90 BULWARK', cls: 'LMG', slot: 'primary', model: 'lmg', fire: 'auto',
    rpm: 680, damage: [38, 30], range: [38, 72], head: 1.35, limb: 0.9, mag: 75, reserve: 150,
    reload: 4.4, reloadEmpty: 4.4, ads: 0.19, sprintToFire: 0.3, tacToFire: 0.45, mobility: 0.9, adsMoveMul: 0.5,
    hip: 6.0, adsSpread: 0.1, moveSpread: 3.5, recoil: { up: 0.5, side: 0.24, bias: 0.15, recover: 6, kick: 1.15, vis: 1.15 },
    optics: ['iron', 'reflex', 'holo', 'acog'], sound: 'lmg', reloadStyle: 'box', pen: 1.4,
    stats: { dmg: 72, rof: 62, rng: 80, acc: 72, mob: 36, hnd: 28 },
  },
  dmr: {
    id: 'dmr', name: 'MK-14 WARDEN', cls: 'Marksman', slot: 'primary', model: 'dmr', fire: 'semi',
    rpm: 340, damage: [58, 48], range: [45, 90], head: 1.55, limb: 0.9, mag: 15, reserve: 75,
    reload: 2.5, reloadEmpty: 2.0, ads: 0.15, sprintToFire: 0.22, tacToFire: 0.35, mobility: 0.96, adsMoveMul: 0.58,
    hip: 6.5, adsSpread: 0.02, moveSpread: 4, recoil: { up: 1.45, side: 0.35, bias: 0.1, recover: 10, kick: 1.6, vis: 1.4 },
    optics: ['iron', 'reflex', 'acog'], sound: 'dmr', reloadStyle: 'mag', pen: 1.6,
    stats: { dmg: 84, rof: 34, rng: 88, acc: 80, mob: 56, hnd: 50 },
  },
  sniper: {
    id: 'sniper', name: 'LONGBOW .338', cls: 'Scharfschützengewehr', slot: 'primary', model: 'sniper', fire: 'bolt',
    rpm: 50, damage: [160, 130], range: [70, 140], head: 2.0, limb: 0.8, chest: 1.1, mag: 5, reserve: 25,
    reload: 3.1, reloadEmpty: 3.1, ads: 0.21, sprintToFire: 0.32, tacToFire: 0.45, mobility: 0.93, adsMoveMul: 0.42,
    hip: 9, adsSpread: 0.0, moveSpread: 6, recoil: { up: 3.2, side: 0.5, bias: 0, recover: 6, kick: 2.6, vis: 2.2 },
    optics: ['sniper'], sound: 'sniper', reloadStyle: 'bolt', pen: 2.5, boltTime: 1.05, scopeSway: true,
    stats: { dmg: 98, rof: 10, rng: 98, acc: 92, mob: 40, hnd: 24 },
  },
  shotgun: {
    id: 'shotgun', name: 'BREACHER-12', cls: 'Schrotflinte', slot: 'primary', model: 'shotgun', fire: 'pump',
    rpm: 75, pellets: 9, pelletSpread: 3.6, damage: [24, 6], range: [7, 20], head: 1.15, limb: 1.0, mag: 7, reserve: 28,
    reload: 0.52, reloadEmpty: 0.52, ads: 0.11, sprintToFire: 0.15, tacToFire: 0.25, mobility: 1.0, adsMoveMul: 0.68,
    hip: 3.2, adsSpread: 0.0, moveSpread: 0.8, recoil: { up: 4.0, side: 0.8, bias: 0, recover: 7, kick: 2.5, vis: 2.0 },
    optics: ['iron', 'reflex', 'holo'], sound: 'shotgun', reloadStyle: 'shell', pen: 0.4, pumpTime: 0.62,
    stats: { dmg: 95, rof: 14, rng: 18, acc: 40, mob: 74, hnd: 70 },
  },
  pistol: {
    id: 'pistol', name: 'P-11 SIDEARM', cls: 'Pistole', slot: 'secondary', model: 'pistol', fire: 'semi',
    rpm: 420, damage: [32, 21], range: [12, 26], head: 1.35, limb: 0.95, mag: 15, reserve: 60,
    reload: 1.45, reloadEmpty: 1.7, ads: 0.07, sprintToFire: 0.09, tacToFire: 0.18, mobility: 1.08, adsMoveMul: 0.85,
    hip: 2.4, adsSpread: 0.15, moveSpread: 1.0, recoil: { up: 1.15, side: 0.3, bias: 0, recover: 12, kick: 1.1, vis: 1.3 },
    optics: ['iron'], sound: 'pistol', reloadStyle: 'pistol', pen: 0.5,
    stats: { dmg: 46, rof: 46, rng: 30, acc: 56, mob: 96, hnd: 96 },
  },
  revolver: {
    id: 'revolver', name: '.44 JUDGE', cls: 'Revolver', slot: 'secondary', model: 'revolver', fire: 'semi',
    rpm: 165, damage: [78, 56], range: [14, 30], head: 1.5, limb: 0.9, mag: 6, reserve: 30,
    reload: 2.55, reloadEmpty: 2.55, ads: 0.09, sprintToFire: 0.12, tacToFire: 0.22, mobility: 1.05, adsMoveMul: 0.8,
    hip: 3.0, adsSpread: 0.05, moveSpread: 1.5, recoil: { up: 3.6, side: 0.6, bias: 0, recover: 7, kick: 2.6, vis: 2.4 },
    optics: ['iron'], sound: 'revolver', reloadStyle: 'revolver', pen: 0.9,
    stats: { dmg: 88, rof: 18, rng: 42, acc: 70, mob: 90, hnd: 70 },
  },
  mpistol: {
    id: 'mpistol', name: 'SK-18 WASP', cls: 'Maschinenpistole (Sek.)', slot: 'secondary', model: 'mpistol', fire: 'auto',
    rpm: 1050, damage: [24, 15], range: [8, 20], head: 1.25, limb: 1.0, mag: 22, reserve: 88,
    reload: 1.6, reloadEmpty: 1.85, ads: 0.07, sprintToFire: 0.09, tacToFire: 0.18, mobility: 1.08, adsMoveMul: 0.85,
    hip: 3.0, adsSpread: 0.3, moveSpread: 0.8, recoil: { up: 0.5, side: 0.5, bias: 0, recover: 10, kick: 0.7, vis: 0.9 },
    optics: ['iron'], sound: 'mpistol', reloadStyle: 'pistol', pen: 0.4,
    stats: { dmg: 38, rof: 98, rng: 20, acc: 42, mob: 96, hnd: 94 },
  },
};

export const PRIMARIES = ['ar', 'smg', 'lmg', 'dmr', 'sniper', 'shotgun'];
export const SECONDARIES = ['pistol', 'revolver', 'mpistol'];
export const OPTIC_NAMES = { iron: 'Kimme & Korn', reflex: 'Reflexvisier', holo: 'Holo-Visier', acog: 'TAC-3 Zielfernrohr (3x)', sniper: '8x Zielfernrohr' };

export function damageAt(def, dist) {
  const [n, f] = def.damage, [r0, r1] = def.range;
  if (dist <= r0) return n;
  if (dist >= r1) return f;
  return n + (f - n) * ((dist - r0) / (r1 - r0));
}
