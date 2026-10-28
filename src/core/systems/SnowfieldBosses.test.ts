import { describe, expect, it } from 'vitest';
import { SNOWFIELD } from '../../config/arenaLayout';
import { GameSession, STEP_MS } from '../session/GameSession';
import { ArenaMap } from '../world/ArenaMap';
import { guardianRotation, MiniBossKind } from './MiniBossSystem';
import { BOSS_TUNING } from './BossSystem';
import { SnowfieldAttacks } from './SnowfieldAttacks';

function session() {
  const s = new GameSession({ characterId: 'barbarian', seed: 19, skipStartingUpgrades: true, arena: ArenaMap.generate(19, SNOWFIELD) });
  s.skeletonSpawnEnabled = s.variantSpawnEnabled = false;
  s.player.invincible = true;
  return s;
}
const tick = (fn: (delta: number) => void, ms: number) => { for (let t = 0; t < ms; t += STEP_MS) fn(STEP_MS); };

describe('Nevado: chef e encontros próprios', () => {
  it('serves four different meals; effects survive leaving and repeat purchase cannot charge twice', () => {
    const s = session();
    s.merchant.enterShelter(s.player);
    s.currency = 100000;
    const max = s.player.maxHealth, damage = s.player.damageMultiplier, speed = s.player.movementSpeed;
    expect(s.merchant.offers.map(o => o.id)).toEqual(['polar-stew', 'glacier-fish', 'tundra-roast', 'berry-tea']);
    expect(s.buyMerchantItem(0)).toBe(true);
    const coins = s.currency;
    expect(s.buyMerchantItem(0)).toBe(false);
    expect(s.currency).toBe(coins);
    expect(s.merchant.offers[1].cost).toBe(65 * 3);
    for (const i of [1, 2, 3]) expect(s.buyMerchantItem(i)).toBe(true);
    s.merchant.leave();
    expect(s.player.maxHealth).toBe(max + 20);
    expect(s.player.damageMultiplier).toBeCloseTo(damage + 0.15);
    expect(s.player.movementSpeed).toBe(speed + 15);
    s.player.health = 10;
    tick(dt => s.step(dt), 1100);
    expect(s.player.health).toBeGreaterThanOrEqual(12);
    const fresh = session();
    expect(fresh.player.maxHealth).toBe(max);
    expect(fresh.player.damageMultiplier).toBe(damage);
  });

  it('rotates all four local guardians', () => {
    expect(guardianRotation(SNOWFIELD)).toEqual(['frostKnight', 'iceSerpent', 'bellringer', 'ancientYeti']);
  });

  for (const kind of ['iceSerpent', 'bellringer', 'ancientYeti'] as MiniBossKind[]) {
    it(`${kind}: all four skill slots produce hazards, enrage, and clear on defeat`, () => {
      const s = session();
      s.spawnMiniBoss(kind);
      s.miniBosses.update(2300);
      const b = s.miniBosses.bosses[0];
      s.player.x = b.enemy.x + 150; s.player.y = b.enemy.y;
      for (const key of ['slam', 'burrow', 'charge', 'raise'] as const) {
        b.attack = null; b.stunnedMs = 0;
        for (const k of Object.keys(b.cooldowns) as Array<keyof typeof b.cooldowns>) b.cooldowns[k] = 0;
        b.cooldowns[key] = 20000;
        s.miniBosses.snow.clear();
        s.miniBosses.update(STEP_MS);
        expect(b).toHaveProperty('attack.phase', 'telegraph');
        expect(s.miniBosses.snow.hazards.length).toBeGreaterThan(0);
      }
      b.enemy.health = b.enemy.maxHealth * 0.4;
      s.miniBosses.update(STEP_MS);
      expect(b.enraged).toBe(true);
      s.miniBosses.defeat(b.enemy);
      expect(s.miniBosses.snow.hazards).toHaveLength(0);
    });
  }

  it('warnings deal no damage; moving away avoids eruption, while contact applies frost', () => {
    const s = session();
    const owner = s.spawnEnemy('ancientYeti', s.player.x + 200, s.player.y)!;
    let damage = 0, frost = 0;
    const attacks = new SnowfieldAttacks({ player: s.player, hurtPlayer: n => { damage += n; }, frostPlayer: n => { frost += n; }, pushPlayer: () => {}, slowPlayer: () => {} });
    attacks.add(owner, 'lance', s.player.x, s.player.y, 70, 20, 1000, 500);
    attacks.update(900);
    expect(damage).toBe(0);
    attacks.update(110);
    expect(damage).toBe(20); expect(frost).toBe(1);
    attacks.clear();
    attacks.add(owner, 'eruption', s.player.x, s.player.y, 100, 22, 1000, 6000);
    s.player.x += 300;
    attacks.update(1100);
    expect(damage).toBe(20);
    owner.phase = 'dying';
    attacks.update(STEP_MS);
    expect(attacks.hazards).toHaveLength(0);
  });

  it('constriction has an escape gap that matches the visible opening', () => {
    const s = session();
    const owner = s.spawnEnemy('iceSerpent', s.player.x, s.player.y)!;
    let damage = 0;
    const attacks = new SnowfieldAttacks({ player: s.player, hurtPlayer: n => { damage += n; }, pushPlayer: () => {}, slowPlayer: () => {} });
    const x = s.player.x, y = s.player.y;
    attacks.add(owner, 'constrict', x, y, 200, 30, 0, 2500, 0);
    s.player.x = x + 195;
    attacks.update(16);
    expect(damage).toBe(0);
    s.player.x = x - 195;
    attacks.update(16);
    expect(damage).toBe(30);
  });

  it('winter king summons local units, casts lances, and ends shield at 15 seconds with warm zones', () => {
    const s = session();
    s.bosses.spawnExtraBoss();
    const b = s.bosses.bosses[0];
    expect(b.winter).toBe(true);
    b.winterLanceElapsed = 8900;
    s.bosses.update(120);
    expect(s.bosses.snow.hazards.some(h => h.kind === 'lance')).toBe(true);
    b.summonElapsed = BOSS_TUNING.summonIntervalMs;
    b.channelElapsed = BOSS_TUNING.channelIntervalMs;
    s.bosses.update(STEP_MS);
    let wolves = 0; s.enemies.forEachActive(e => { if (e.alive && e.variantId === 'iceWolf') wolves++; });
    expect(wolves).toBeGreaterThan(0);
    expect(b.shieldActive).toBe(true);
    expect(s.bosses.braziers).toHaveLength(3);
    const warm = s.bosses.braziers[0];
    s.player.x = warm.x; s.player.y = warm.y;
    s.player.clearSlows();
    b.channelRuntimeElapsed = 14900;
    s.bosses.update(110);
    expect(b.shieldActive).toBe(false);
    expect(s.bosses.braziers).toHaveLength(0);
    expect(s.player.frozenUntil).toBeLessThan(s.clock.now);
  });

  it('breaking the winter shield removes warm zones and staggers; an unbroken shield freezes exposed players', () => {
    const s = session(); s.bosses.spawnExtraBoss();
    const b = s.bosses.bosses[0];
    b.channelElapsed = BOSS_TUNING.channelIntervalMs;
    s.bosses.update(STEP_MS);
    s.bosses.absorbDamage(b.enemy, b.shield + 10);
    expect(b.staggerMs).toBe(3000);
    expect(s.bosses.braziers).toHaveLength(0);
    b.staggerMs = 0; b.channelElapsed = BOSS_TUNING.channelIntervalMs;
    s.bosses.update(STEP_MS);
    s.player.x = b.enemy.x; s.player.y = b.enemy.y;
    b.channelRuntimeElapsed = 14900;
    s.bosses.update(110);
    expect(s.player.frozenUntil).toBeGreaterThan(s.clock.now);
  });
});
