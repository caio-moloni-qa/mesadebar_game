import { afterEach, describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../config/characters';
import { WORLD_SIZE } from '../../config/world';
import { createRng } from '../math';
import { EnemyState, PlayerState } from '../session/entities';
import { BOSS_TUNING, BOSS_TUNING_DEFAULTS, BossEvents, BossSystem } from './BossSystem';
import { EnemyVariantId } from './EnemySpawnScheduler';
import { ArenaMap } from '../world/ArenaMap';
import { GameSession, STEP_MS } from '../session/GameSession';

afterEach(() => { Object.assign(BOSS_TUNING, BOSS_TUNING_DEFAULTS); });

/** A boss on a bare stage: real BossSystem, a fake host that records what it asks for. */
function stage({ lineOfSight = true } = {}) {
  const player = new PlayerState(CHARACTERS.barbarian);
  player.x = 1400;
  player.y = 1400;
  const spawned: EnemyState[] = [];
  const hurts: Array<{ amount: number; unavoidable: boolean }> = [];
  const pushes: Array<{ dx: number; dy: number }> = [];
  const events: Array<{ name: keyof BossEvents; payload: unknown }> = [];
  let killed = false;
  let cleared = 0;
  const system = new BossSystem({
    player,
    rng: createRng(7),
    arenaSize: WORLD_SIZE,
    events: { emit: (name, payload) => { events.push({ name, payload }); } },
    spawnEnemy: (variantId: EnemyVariantId, x: number, y: number) => {
      const enemy = new EnemyState();
      enemy.activate(variantId, x, y, variantId === 'finalBoss' ? 10000 : 10, 0);
      spawned.push(enemy);
      return enemy;
    },
    hurtPlayer: (amount, unavoidable = false) => { hurts.push({ amount, unavoidable }); },
    killPlayer: () => { killed = true; },
    pushPlayer: (dx, dy) => { pushes.push({ dx, dy }); },
    clearEnemyField: () => { cleared += 1; return 3; },
    hasLineOfSight: () => lineOfSight
  });
  const run = (ms: number) => {
    for (let elapsed = 0; elapsed < ms; elapsed += STEP_MS) system.update(STEP_MS);
  };
  const named = (name: keyof BossEvents) => events.filter((event) => event.name === name);
  const damage = (amount: number) => hurts.filter((hurt) => hurt.amount === amount);
  return { system, player, spawned, hurts, pushes, events, run, named, damage, wasKilled: () => killed, clearCount: () => cleared };
}

/** Warning, then the wave: one boss parked `distance` to the right of the player, every ability timer parked. */
function withBoss(distance = 400, options?: { lineOfSight?: boolean }) {
  const scene = stage(options);
  scene.system.warn(1);
  scene.run(BOSS_TUNING.messageMs + STEP_MS);
  const boss = scene.system.bosses[0];
  boss.enemy.x = scene.player.x + distance;
  boss.enemy.y = scene.player.y;
  boss.channelElapsed = -1e9;
  boss.beamElapsed = -1e9;
  boss.summonElapsed = -1e9;
  boss.lungeCooldownElapsed = -1e9;
  boss.meleeCooldownElapsed = -1e9;
  boss.cleanupElapsed = -1e9;
  return { ...scene, boss };
}

describe('BossSystem', () => {
  it('warns first, spawns the wave after the message, and only once until rearmed', () => {
    const { system, named, run } = stage();
    system.warn(2);
    expect(system.hasActiveEncounter()).toBe(true);
    expect(system.bosses).toHaveLength(0);
    run(BOSS_TUNING.messageMs + STEP_MS);
    expect(system.bosses).toHaveLength(2);
    expect(system.bosses.filter((boss) => boss.isMain)).toHaveLength(1);
    system.warn(1);
    expect(named('boss-warning')).toHaveLength(1);
    system.rearm();
    system.warn(1);
    expect(named('boss-warning')).toHaveLength(2);
  });

  it('summons a modest ring of apparitions on its interval (not 30 every 5 s)', () => {
    const { boss, run, spawned } = withBoss(1200);
    boss.summonElapsed = BOSS_TUNING.summonIntervalMs;
    run(STEP_MS * 2);
    expect(spawned.filter((enemy) => enemy.variantId === 'apparitionWraith')).toHaveLength(BOSS_TUNING.apparitionCount);
  });

  it('telegraphs the sword for 2 s before the sweep, and the sweep only hurts at the blade', () => {
    const { boss, run, damage } = withBoss(150);
    boss.meleeCooldownElapsed = BOSS_TUNING.meleeCooldownMs;
    run(STEP_MS * 2);
    expect(boss.melee?.phase).toBe('telegraph');
    run(BOSS_TUNING.meleeTelegraphMs - STEP_MS * 4);
    expect(damage(BOSS_TUNING.meleeDamage)).toHaveLength(0);
    run(BOSS_TUNING.meleeSweepMs + STEP_MS * 3);
    expect(boss.melee).toBeNull();
    expect(damage(BOSS_TUNING.meleeDamage).length).toBeGreaterThan(0);
  });

  it('in phase 2 the sweep comes back and a blast covers the blind spot at its feet', () => {
    const { boss, run, damage, named } = withBoss(40); // hugging the boss: the old blind spot
    boss.phaseTwo = true;
    boss.meleeCooldownElapsed = BOSS_TUNING.meleeCooldownMs;
    run(BOSS_TUNING.meleeTelegraphMs + STEP_MS * 3);
    expect(damage(BOSS_TUNING.meleeCenterDamage).length).toBeGreaterThan(0);
    expect(named('boss-explosion').some((event) => (event.payload as { kind: string }).kind === 'center')).toBe(true);
    run(BOSS_TUNING.meleeSweepMs + STEP_MS * 2);
    expect(boss.melee?.phase).toBe('sweepBack');
    run(BOSS_TUNING.meleeSweepMs + STEP_MS * 2);
    expect(boss.melee).toBeNull();
  });

  it('breaking the shield staggers the boss: it kneels and takes extra damage', () => {
    const { system, boss, run, named } = withBoss(1200);
    boss.channelElapsed = BOSS_TUNING.channelIntervalMs;
    run(STEP_MS * 2);
    expect(boss.channelActive).toBe(true);
    const shield = boss.shield;
    expect(system.absorbDamage(boss.enemy, 100)).toBe(0);
    expect(system.absorbDamage(boss.enemy, shield)).toBe(100);
    expect(boss.shieldActive).toBe(false);
    expect(named('boss-shield-broken')).toHaveLength(1);
    expect(boss.staggerMs).toBe(BOSS_TUNING.staggerMs);
    expect(system.holdsStill(boss.enemy)).toBe(true);
    expect(system.damageTakenMultiplier(boss.enemy)).toBe(BOSS_TUNING.staggerDamageMultiplier);
    run(BOSS_TUNING.staggerMs + STEP_MS);
    expect(system.damageTakenMultiplier(boss.enemy)).toBe(1);
  });

  it('the unbroken shield explodes for heavy, unavoidable damage — lethal only at ratio 1', () => {
    const { boss, run, hurts, wasKilled, player } = withBoss(300);
    boss.channelElapsed = BOSS_TUNING.channelIntervalMs;
    run(BOSS_TUNING.shieldDeadlineMs + STEP_MS * 3);
    const blast = hurts.find((hurt) => hurt.unavoidable);
    expect(blast?.amount).toBeCloseTo(player.maxHealth * BOSS_TUNING.explosionDamageRatio);
    expect(wasKilled()).toBe(false);

    const lethal = withBoss(300);
    BOSS_TUNING.explosionDamageRatio = 1;
    lethal.boss.channelElapsed = BOSS_TUNING.channelIntervalMs;
    lethal.run(BOSS_TUNING.shieldDeadlineMs + STEP_MS * 3);
    expect(lethal.wasKilled()).toBe(true);
  });

  it('cover blocks the shield explosion', () => {
    const { boss, run, hurts, named } = withBoss(300, { lineOfSight: false });
    boss.channelElapsed = BOSS_TUNING.channelIntervalMs;
    run(BOSS_TUNING.shieldDeadlineMs + STEP_MS * 3);
    expect(hurts.some((hurt) => hurt.unavoidable)).toBe(false);
    expect(named('boss-explosion').some((event) => (event.payload as { kind: string; blocked?: boolean }).kind === 'shield' && (event.payload as { blocked?: boolean }).blocked)).toBe(true);
  });

  it('drops meteors where the player stood and counts the shield down', () => {
    const { boss, run, damage, named } = withBoss(1200);
    boss.channelElapsed = BOSS_TUNING.channelIntervalMs;
    run(BOSS_TUNING.meteorIntervalMs + BOSS_TUNING.meteorTelegraphMs + STEP_MS * 4);
    expect(damage(BOSS_TUNING.meteorDamage).length).toBeGreaterThan(0);
    run(BOSS_TUNING.shieldDeadlineMs);
    expect(named('boss-shield-countdown').length).toBeGreaterThan(0);
  });

  it('locks on for 3 s, then fires staggered beams; the undead squad cracks the ground before climbing out', () => {
    const { system, boss, run, damage, spawned } = withBoss(1200);
    boss.beamElapsed = BOSS_TUNING.beamIntervalMs;
    run(STEP_MS * 2);
    expect(boss.beamState).toBe('lockon');
    run(BOSS_TUNING.beamLockOnMs);
    expect(boss.beamState).toBe('active');
    expect(system.risings).toHaveLength(BOSS_TUNING.undeadSquadSize);
    expect(spawned.filter((enemy) => enemy.variantId === 'skeleton')).toHaveLength(0);
    run(200);
    expect(damage(BOSS_TUNING.beamDamage)).toHaveLength(0);
    run(BOSS_TUNING.undeadRiseMs);
    expect(spawned.filter((enemy) => enemy.variantId === 'skeleton')).toHaveLength(BOSS_TUNING.undeadSquadSize);
    expect(damage(BOSS_TUNING.beamDamage).length).toBeGreaterThan(0);
    run(BOSS_TUNING.beamCountPhase1 * BOSS_TUNING.beamLaunchStaggerMs + BOSS_TUNING.beamLifetimeMs);
    expect(boss.beamState).toBe('idle');
  });

  it('roars into phase 2: invulnerable, then a shockwave that clears the summons and shoves the player', () => {
    const { system, boss, run, named, pushes, clearCount } = withBoss(150);
    boss.enemy.health = boss.enemy.maxHealth * 0.45;
    run(STEP_MS * 2);
    expect(boss.phaseTwo).toBe(true);
    expect(named('boss-phase-two')).toHaveLength(1);
    expect(system.damageTakenMultiplier(boss.enemy)).toBe(0);
    run(BOSS_TUNING.roarShockwaveAt);
    expect(named('boss-shockwave')).toHaveLength(1);
    expect(clearCount()).toBe(1);
    expect(pushes).toHaveLength(1);
    expect(Math.hypot(pushes[0].dx, pushes[0].dy)).toBeCloseTo(BOSS_TUNING.roarShockwavePush);
    run(BOSS_TUNING.phaseTransitionMs);
    expect(system.damageTakenMultiplier(boss.enemy)).toBe(1);
  });

  it('lunges at a player kiting far away', () => {
    const { boss, run, player } = withBoss(1000);
    boss.lungeCooldownElapsed = BOSS_TUNING.lungeCooldownMs;
    const before = Math.hypot(boss.enemy.x - player.x, boss.enemy.y - player.y);
    run(STEP_MS * 2);
    expect(boss.dash.kind).toBe('lunge');
    run(BOSS_TUNING.lungeTelegraphMs + BOSS_TUNING.lungeTravelMs + STEP_MS * 3);
    expect(boss.dash.phase).toBe('idle');
    expect(before - Math.hypot(boss.enemy.x - player.x, boss.enemy.y - player.y)).toBeCloseTo(BOSS_TUNING.lungeDistance, 0);
  });

  it('enrages when the main boss’s countdown runs out: field cleared, faster, small visible health gain', () => {
    const { boss, run, named } = withBoss(1200);
    boss.cleanupElapsed = BOSS_TUNING.cleanupMs;
    const speed = boss.enemy.movementSpeed;
    const health = boss.enemy.maxHealth;
    run(STEP_MS * 2);
    expect(boss.enraged).toBe(true);
    expect(boss.enemy.movementSpeed).toBeCloseTo(speed * BOSS_TUNING.enrageSpeedMultiplier);
    expect(boss.enemy.maxHealth).toBe(health + 3 * BOSS_TUNING.cleanupHealthPerEnemy);
    expect(named('boss-enraged')).toHaveLength(1);
  });

  it('two bosses never channel or beam at the same time', () => {
    const scene = stage();
    scene.system.warn(2);
    scene.run(BOSS_TUNING.messageMs + STEP_MS);
    const [first, second] = scene.system.bosses;
    [first, second].forEach((boss) => {
      boss.enemy.x = scene.player.x + 1200;
      boss.summonElapsed = -1e9;
      boss.lungeCooldownElapsed = -1e9;
      boss.meleeCooldownElapsed = -1e9;
      boss.beamElapsed = -1e9;
      boss.channelElapsed = BOSS_TUNING.channelIntervalMs;
    });
    scene.run(STEP_MS * 3);
    expect([first, second].filter((boss) => boss.shieldActive)).toHaveLength(1);
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

  it('a staggered boss takes the stagger multiplier on real hits, a roaring one none', () => {
    const run = session();
    run.triggerBossWave();
    advance(run, BOSS_TUNING.messageMs + 100);
    const state = run.bosses.bosses[0];
    state.staggerMs = 1000;
    const before = state.enemy.health;
    run.damageEnemy(state.enemy, 100, 'sword');
    expect(before - state.enemy.health).toBeCloseTo(100 * BOSS_TUNING.staggerDamageMultiplier);
    state.staggerMs = 0;
    state.transitionMs = 500;
    const roaring = state.enemy.health;
    run.damageEnemy(state.enemy, 100, 'sword');
    expect(state.enemy.health).toBe(roaring);
  });
});
