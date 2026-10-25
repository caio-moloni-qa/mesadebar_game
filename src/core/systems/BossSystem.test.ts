import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../config/characters';
import { WORLD_SIZE } from '../../config/world';
import { createRng } from '../math';
import { EnemyState, PlayerState } from '../session/entities';
import { BOSS_TUNING, BossEvents, BossSystem } from './BossSystem';
import { EnemyVariantId } from './EnemySpawnScheduler';
import { ArenaMap } from '../world/ArenaMap';
import { GameSession, STEP_MS } from '../session/GameSession';

/** A boss on a bare stage: real BossSystem, a fake host that records what it asks for. */
function stage() {
  const player = new PlayerState(CHARACTERS.barbarian);
  player.x = 1400;
  player.y = 1400;
  let now = 0;
  const spawned: EnemyState[] = [];
  const hurts: number[] = [];
  const events: Array<{ name: keyof BossEvents; payload: unknown }> = [];
  let killed = false;
  const system = new BossSystem({
    player,
    rng: createRng(7),
    arenaSize: WORLD_SIZE,
    events: { emit: (name, payload) => { events.push({ name, payload }); } },
    now: () => now,
    spawnEnemy: (variantId: EnemyVariantId, x: number, y: number) => {
      const enemy = new EnemyState();
      enemy.activate(variantId, x, y, variantId === 'finalBoss' ? 10000 : 10, now);
      spawned.push(enemy);
      return enemy;
    },
    hurtPlayer: (amount) => { hurts.push(amount); },
    killPlayer: () => { killed = true; },
    clearEnemyField: () => 3
  });
  const run = (ms: number) => {
    for (let elapsed = 0; elapsed < ms; elapsed += STEP_MS) {
      now += STEP_MS;
      system.update(STEP_MS);
    }
  };
  return { system, player, spawned, hurts, events, run, wasKilled: () => killed };
}

/** Warning, then the wave: one boss parked `distance` to the right of the player. */
function withBoss(distance = 400) {
  const scene = stage();
  scene.system.warn(1);
  scene.run(BOSS_TUNING.messageMs + STEP_MS);
  const boss = scene.system.bosses[0];
  boss.enemy.x = scene.player.x + distance;
  boss.enemy.y = scene.player.y;
  return { ...scene, boss };
}

describe('BossSystem', () => {
  it('warns first, spawns the wave after the message, and only once until rearmed', () => {
    const { system, events, run } = stage();
    system.warn(2);
    expect(system.hasActiveEncounter()).toBe(true);
    expect(system.bosses).toHaveLength(0);
    run(BOSS_TUNING.messageMs + STEP_MS);
    expect(system.bosses).toHaveLength(2);
    expect(system.bosses.filter((boss) => boss.isMain)).toHaveLength(1);
    system.warn(1);
    expect(events.filter((event) => event.name === 'boss-warning')).toHaveLength(1);
    system.rearm();
    system.warn(1);
    expect(events.filter((event) => event.name === 'boss-warning')).toHaveLength(2);
  });

  it('telegraphs the sword for 2 s before the sweep, and the sweep only hurts at the blade', () => {
    const { boss, hurts, run } = withBoss(150);
    boss.meleeCooldownElapsed = BOSS_TUNING.meleeCooldownMs;
    run(STEP_MS * 2);
    expect(boss.melee?.phase).toBe('telegraph');
    run(BOSS_TUNING.meleeTelegraphMs - STEP_MS * 4);
    expect(hurts).toHaveLength(0);
    run(BOSS_TUNING.meleeSweepMs + STEP_MS * 3);
    expect(boss.melee).toBeNull();
    // At 150 the blade (orbiting at 170) passes within its 70 hit radius.
    expect(hurts).toContain(BOSS_TUNING.meleeDamage);
  });

  it('absorbs damage in the shield, returns only the overflow, and ends the channel when it breaks', () => {
    const { system, boss, run } = withBoss(1200);
    run(BOSS_TUNING.channelIntervalMs + STEP_MS * 2);
    expect(boss.channelActive).toBe(true);
    expect(system.holdsStill(boss.enemy)).toBe(true);
    const shield = boss.shield;
    expect(shield).toBeCloseTo(boss.enemy.maxHealth * BOSS_TUNING.shieldMaxHealthScaling);
    expect(system.absorbDamage(boss.enemy, 100)).toBe(0);
    expect(system.absorbDamage(boss.enemy, shield)).toBe(100);
    expect(boss.shieldActive).toBe(false);
    expect(system.absorbDamage(boss.enemy, 50)).toBeNull();
  });

  it('drops meteors where the player stood, counts down, and spares a player outside the shield explosion', () => {
    const { boss, run, hurts, events, wasKilled } = withBoss(1200);
    run(BOSS_TUNING.channelIntervalMs + BOSS_TUNING.meteorIntervalMs + BOSS_TUNING.meteorTelegraphMs + STEP_MS * 4);
    expect(hurts).toContain(BOSS_TUNING.meteorDamage);
    expect(events.some((event) => event.name === 'boss-explosion' && (event.payload as { kind: string }).kind === 'meteor')).toBe(true);
    run(BOSS_TUNING.shieldDeadlineMs);
    expect(events.some((event) => event.name === 'boss-shield-countdown')).toBe(true);
    // 1200 away is outside the 700 explosion radius.
    expect(boss.shieldActive).toBe(false);
    expect(wasKilled()).toBe(false);
  });

  it('kills a player inside the radius when the shield explodes', () => {
    const { boss, run, wasKilled, player } = withBoss(300);
    // Skip the melee (it would otherwise trigger at 300): park the boss far until the channel starts.
    boss.enemy.x = player.x + 600;
    run(BOSS_TUNING.channelIntervalMs + STEP_MS * 2);
    expect(boss.channelActive).toBe(true);
    run(BOSS_TUNING.shieldDeadlineMs + STEP_MS * 2);
    expect(wasKilled()).toBe(true);
  });

  it('locks on for 3 s, then fires staggered beams that only hurt along their drawn length', () => {
    const { system, boss, run, hurts } = withBoss(1200);
    boss.channelElapsed = -1e9; // keep the shield out of the way
    run(BOSS_TUNING.beamIntervalMs + STEP_MS * 2);
    expect(boss.beamState).toBe('lockon');
    expect(system.holdsStill(boss.enemy)).toBe(true);
    run(BOSS_TUNING.beamLockOnMs);
    expect(boss.beamState).toBe('active');
    // 1200 away at 2600/s: the beam needs ~0.46 s to reach the player.
    run(200);
    expect(hurts.filter((amount) => amount === BOSS_TUNING.beamDamage)).toHaveLength(0);
    run(600);
    expect(hurts).toContain(BOSS_TUNING.beamDamage);
    run(BOSS_TUNING.beamCountPhase1 * BOSS_TUNING.beamLaunchStaggerMs + BOSS_TUNING.beamLifetimeMs);
    expect(boss.beamState).toBe('idle');
  });

  it('consumes the arena after 30 s, feeding the boss 20 health per enemy removed', () => {
    const { boss, run, events } = withBoss(1200);
    boss.channelElapsed = -1e9;
    boss.beamElapsed = -1e9;
    const before = boss.enemy.maxHealth;
    run(BOSS_TUNING.cleanupMs + STEP_MS);
    expect(boss.enemy.maxHealth).toBe(before + 3 * BOSS_TUNING.cleanupHealthPerEnemy);
    expect(events.some((event) => event.name === 'boss-arena-consumed')).toBe(true);
  });
});

describe('boss waves in a run', () => {
  function session() {
    const run = new GameSession({ characterId: 'barbarian', seed: 5, skipStartingUpgrades: true, arena: ArenaMap.open(WORLD_SIZE) });
    run.skeletonSpawnEnabled = false;
    run.variantSpawnEnabled = false;
    run.player.invincible = true;
    return run;
  }
  const advance = (run: GameSession, ms: number) => { for (let elapsed = 0; elapsed < ms; elapsed += STEP_MS) run.step(STEP_MS); };

  it('opens the portals when the wave falls; the end portal wins the run', () => {
    const run = session();
    run.triggerBossWave();
    advance(run, BOSS_TUNING.messageMs + 100);
    const boss = run.bosses.bosses[0].enemy;
    run.damageEnemy(boss, boss.health + 10, 'sword');
    expect(run.awaitingPortalChoice).toBe(true);
    expect(run.portals).not.toBeNull();
    const elapsed = run.elapsedMs;
    advance(run, 1000);
    expect(run.elapsedMs).toBe(elapsed);
    run.player.x = run.portals!.end.x;
    run.player.y = run.portals!.end.y;
    run.interact();
    expect(run.over).toBe(true);
    expect(run.victory).toBe(true);
  });

  it('the continue portal starts the next cycle: longer phase, more bosses, harder spawns', () => {
    const run = session();
    run.triggerBossWave();
    advance(run, BOSS_TUNING.messageMs + 100);
    const boss = run.bosses.bosses[0].enemy;
    run.damageEnemy(boss, boss.health + 10, 'sword');
    run.player.x = run.portals!.continue.x;
    run.player.y = run.portals!.continue.y;
    run.interact();
    expect(run.over).toBe(false);
    expect(run.bossCycle).toBe(2);
    expect(run.phaseDurationMs()).toBe(run.phaseDurationMs(1) + 60_000);
    run.triggerBossWave();
    advance(run, BOSS_TUNING.messageMs + 100);
    expect(run.bosses.bosses).toHaveLength(2);
  });
});
