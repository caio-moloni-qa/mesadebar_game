import { describe, expect, it } from 'vitest';
import { SNOWFIELD } from '../../config/arenaLayout';
import { GameSession, STEP_MS } from '../session/GameSession';
import { ArenaMap } from '../world/ArenaMap';
import { COMPANION_TUNING, MAX_COMPANIONS, SNOW_COMPANION_TUNING } from './CompanionSystem';
import { MINI_BOSSES, MINI_BOSS_TUNING, SnowCompanionKind } from './MiniBossSystem';

const kinds: SnowCompanionKind[] = ['frostKnight', 'iceSerpent', 'bellringer', 'ancientYeti'];
const arena = ArenaMap.generate(5, SNOWFIELD);
function session() {
  const run = new GameSession({ characterId: 'barbarian', seed: 4, skipStartingUpgrades: true, arena });
  run.skeletonSpawnEnabled = run.variantSpawnEnabled = false;
  run.player.invincible = true;
  run.weapons.weapons.forEach(weapon => { weapon.lastAttackAt = 1e8; });
  return run;
}
function advance(run: GameSession, ms: number) {
  for (let time = 0; time < ms; time += STEP_MS) run.step(STEP_MS);
}

describe('snow guardian companions', () => {
  it.each(kinds)('%s joins after defeat, then strengthens on another defeat', kind => {
    const run = session();
    const anchor = MINI_BOSSES[kind].anchor(arena.layout);
    const spot = arena.nearestWalkable(anchor.x, anchor.y + 150, 20);
    run.player.x = run.player.prevX = spot.x;
    run.player.y = run.player.prevY = spot.y;
    for (const level of [1, 2]) {
      run.spawnMiniBoss(kind);
      advance(run, MINI_BOSS_TUNING.warningMs + 100);
      const boss = run.miniBosses.bosses[0];
      boss.stunnedMs = 0;
      run.damageEnemy(boss.enemy, boss.enemy.maxHealth * 100, 'sword');
      const choice = run.pendingChoice;
      expect(choice?.kind).toBe('companion');
      if (choice?.kind !== 'companion') throw new Error('Missing companion offer');
      expect(choice.offers[0]).toEqual({ companion: kind, level });
      run.chooseCompanion(0);
      expect(run.companions.has(kind)?.level).toBe(level);
      const upgrade = run.pendingChoice;
      if (upgrade?.kind === 'level-up') run.chooseUpgrade(upgrade.upgrades[0].id);
    }
  });

  it.each(kinds)('%s follows, attacks enemies, falls and reforms', kind => {
    const run = session();
    run.addCompanion(kind);
    const ally = run.companions.has(kind)!;
    const spot = arena.nearestWalkable(run.player.x + 100, run.player.y, 20);
    ally.x = ally.prevX = spot.x;
    ally.y = ally.prevY = spot.y;
    const start = Math.hypot(ally.x - run.player.x, ally.y - run.player.y);
    advance(run, 500);
    expect(Math.hypot(ally.x - run.player.x, ally.y - run.player.y)).toBeLessThan(start);
    const enemy = run.spawnEnemy('skeleton', ally.x + 10, ally.y, 10000)!;
    enemy.movementSpeed = 0;
    advance(run, STEP_MS);
    ally.cooldownMs = SNOW_COMPANION_TUNING[kind].cooldownMs;
    run.companions.update(STEP_MS);
    expect(enemy.health).toBeLessThan(enemy.maxHealth);
    expect(ally.attackedAt).toBe(run.clock.now);
    ally.health = 1;
    enemy.x = ally.x; enemy.y = ally.y;
    run.companions.update(COMPANION_TUNING.hurtTickMs);
    expect(ally.downUntil).toBeGreaterThan(0);
    enemy.health = 0;
    advance(run, COMPANION_TUNING.respawnMs + 100);
    expect(ally.downUntil).toBe(0);
    expect(ally.health).toBe(ally.maxHealth);
  });

  it('keeps the existing three-companion limit', () => {
    const run = session();
    kinds.slice(0, MAX_COMPANIONS).forEach(kind => expect(run.addCompanion(kind)).toBe(true));
    expect(run.addCompanion('ancientYeti')).toBe(false);
    expect(run.addCompanion('frostKnight')).toBe(true);
    expect(run.companions.has('frostKnight')?.level).toBe(2);
  });
});
