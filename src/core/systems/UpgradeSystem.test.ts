import { describe, expect, it } from 'vitest';
import { WEAPONS } from '../../config/weapons';
import { createRng } from '../math';
import { UpgradeSystem, UpgradeTarget } from './UpgradeSystem';

const GENERIC_IDS = ['damage', 'cooldown', 'speed'];
const PROJECTILE_IDS = ['projectile-extra-count', 'projectile-ricochet', 'projectile-wide-bolt'];
const MELEE_IDS = ['sword-life-steal', 'melee-range', 'melee-extra-attack', 'melee-whirlwind'];
const AURA_IDS = ['aura-radius', 'aura-damage', 'aura-tick-speed'];

function fakePlayer(overrides: Partial<UpgradeTarget> = {}): UpgradeTarget & { calls: string[] } {
  const calls: string[] = [];
  const record = (name: string) => () => { calls.push(name); };
  return {
    calls,
    damageMultiplier: 1,
    attackSpeedMultiplier: 1,
    movementSpeed: 180,
    whirlwindUnlocked: false,
    addLifeSteal: record('addLifeSteal'),
    addMeleeRangeBonus: record('addMeleeRangeBonus'),
    addMeleeExtraAttack: record('addMeleeExtraAttack'),
    unlockWhirlwind: record('unlockWhirlwind'),
    addProjectileExtraCount: record('addProjectileExtraCount'),
    addProjectileRicochet: record('addProjectileRicochet'),
    addProjectileSizeBonus: record('addProjectileSizeBonus'),
    addAuraRadiusPercent: record('addAuraRadiusPercent'),
    addAuraDamageBonus: record('addAuraDamageBonus'),
    addAuraTickSpeedBonus: record('addAuraTickSpeedBonus'),
    ...overrides
  };
}

describe('UpgradeSystem.choices', () => {
  it('returns the requested amount of unique upgrades from generic + the weapon family pool', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const ids = new UpgradeSystem(createRng(seed)).choices(WEAPONS.staff, fakePlayer(), 3).map((upgrade) => upgrade.id);
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(3);
      ids.forEach((id) => expect([...GENERIC_IDS, ...PROJECTILE_IDS]).toContain(id));
      expect(ids.some((id) => GENERIC_IDS.includes(id))).toBe(true);
    }
  });

  it('never offers another weapon family\'s upgrades', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const ids = new UpgradeSystem(createRng(seed)).choices(WEAPONS.amulet, fakePlayer(), 5).map((upgrade) => upgrade.id);
      ids.forEach((id) => expect([...GENERIC_IDS, ...AURA_IDS]).toContain(id));
    }
  });

  it('guarantees one generic and one secondary-weapon upgrade when a second weapon is equipped', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const ids = new UpgradeSystem(createRng(seed)).choices(WEAPONS.sword, fakePlayer(), 3, WEAPONS.staff).map((upgrade) => upgrade.id);
      expect(ids.some((id) => GENERIC_IDS.includes(id))).toBe(true);
      expect(ids.some((id) => PROJECTILE_IDS.includes(id))).toBe(true);
      ids.forEach((id) => expect([...GENERIC_IDS, ...MELEE_IDS, ...PROJECTILE_IDS]).toContain(id));
    }
  });

  it('stops offering Ataque Redemoinho once it is unlocked', () => {
    const pool = new UpgradeSystem(createRng(1)).weaponUpgradePool(WEAPONS.sword, fakePlayer({ whirlwindUnlocked: true }));
    expect(pool.map((upgrade) => upgrade.id)).not.toContain('melee-whirlwind');
    expect(new UpgradeSystem(createRng(1)).weaponUpgradePool(WEAPONS.whip, fakePlayer()).map((upgrade) => upgrade.id)).toContain('melee-whirlwind');
  });

  it('is reproducible for a given seed', () => {
    const roll = (seed: number) => new UpgradeSystem(createRng(seed)).choices(WEAPONS.boomerang, fakePlayer(), 5).map((upgrade) => upgrade.id);
    expect(roll(1234)).toEqual(roll(1234));
  });
});

describe('Upgrade.apply', () => {
  it('generic upgrades change the documented stats', () => {
    const player = fakePlayer();
    const byId = new Map(new UpgradeSystem(createRng(1)).basicUpgradePool().map((upgrade) => [upgrade.id, upgrade]));
    byId.get('damage')!.apply(player);
    byId.get('cooldown')!.apply(player);
    byId.get('speed')!.apply(player);
    expect(player.damageMultiplier).toBeCloseTo(1.25);
    expect(player.attackSpeedMultiplier).toBeCloseTo(1.2);
    expect(player.movementSpeed).toBe(205);
  });

  it('weapon upgrades delegate to the matching player method', () => {
    const player = fakePlayer();
    new UpgradeSystem(createRng(1)).weaponUpgradePool(WEAPONS.amulet, player).forEach((upgrade) => upgrade.apply(player));
    expect(player.calls.sort()).toEqual(['addAuraDamageBonus', 'addAuraRadiusPercent', 'addAuraTickSpeedBonus']);
  });
});
