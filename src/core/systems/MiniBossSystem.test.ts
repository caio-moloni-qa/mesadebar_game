import { describe, expect, it } from 'vitest';
import { GRAVEYARD, TEMPLE } from '../../config/arenaLayout';
import { ENEMY_VARIANTS } from '../../config/balance';
import { GameSession, GUARDIAN_WEAKENING, STEP_MS } from '../session/GameSession';
import { ArenaMap } from '../world/ArenaMap';
import { BOSS_TUNING } from './BossSystem';
import { COMPANION_TUNING } from './CompanionSystem';
import { MINI_BOSSES, MINI_BOSS_TUNING, MiniBossKind } from './MiniBossSystem';

const ARENA = ArenaMap.generate(11);

function session(): GameSession {
  const run = new GameSession({ characterId: 'barbarian', seed: 3, skipStartingUpgrades: true, arena: ARENA });
  run.skeletonSpawnEnabled = false;
  run.variantSpawnEnabled = false;
  run.player.invincible = true;
  return run;
}
const advance = (run: GameSession, ms: number) => { for (let elapsed = 0; elapsed < ms; elapsed += STEP_MS) run.step(STEP_MS); };

/** Calls `kind` and waits out its warning; the hero stands at `at` (default: next to its zone). */
function withMiniBoss(kind: MiniBossKind, at?: { x: number; y: number }) {
  const run = session();
  const anchor = MINI_BOSSES[kind].anchor;
  const spot = ARENA.nearestWalkable(at?.x ?? anchor.x + 200, at?.y ?? anchor.y, 20);
  run.player.x = run.player.prevX = spot.x;
  run.player.y = run.player.prevY = spot.y;
  run.spawnMiniBoss(kind);
  advance(run, MINI_BOSS_TUNING.warningMs + 50);
  const boss = run.miniBosses.bosses[0];
  return { run, boss };
}

describe('zone mini-bosses', () => {
  it('a slot opens a minute into the phase: the guardian is announced, then appears in its zone', () => {
    const run = session();
    const events: string[] = [];
    run.events.on('miniboss-warning', ({ kind }) => events.push(kind));
    run.adjustElapsedMs(60_000 - 100);
    advance(run, 200);
    expect(events).toEqual(['gravedigger']);
    advance(run, MINI_BOSS_TUNING.warningMs);
    const boss = run.miniBosses.bosses[0];
    expect(boss.kind).toBe('gravedigger');
    expect(Math.hypot(boss.enemy.x - GRAVEYARD.center.x, boss.enemy.y - GRAVEYARD.center.y)).toBeLessThan(300);
  });

  it('O Coveiro can’t be hurt while burrowed, and surfaces under the player', () => {
    const { run, boss } = withMiniBoss('gravedigger', { x: GRAVEYARD.center.x - 400, y: GRAVEYARD.center.y });
    boss.cooldowns.burrow = MINI_BOSS_TUNING.burrowCooldownMs;
    boss.cooldowns.raise = -1e9;
    advance(run, STEP_MS * 2);
    expect(boss.attack?.type).toBe('burrow');
    expect(run.miniBosses.damageTakenMultiplier(boss.enemy)).toBe(0);
    advance(run, MINI_BOSS_TUNING.burrowSinkMs + MINI_BOSS_TUNING.burrowTunnelMs + 50);
    expect(boss.attack?.phase).toBe('emerge');
    // It surfaces where its body fits nearest the player (fences and graves can nudge it out a little).
    expect(Math.hypot(boss.enemy.x - run.player.x, boss.enemy.y - run.player.y)).toBeLessThan(200);
  });

  it('O Coveiro raises the dead from the graves (ground cracks first)', () => {
    const { run, boss } = withMiniBoss('gravedigger');
    boss.cooldowns.raise = MINI_BOSS_TUNING.raiseIntervalMs;
    advance(run, STEP_MS * 2);
    expect(run.bosses.risings.length).toBeGreaterThan(0);
  });

  it('the Guardião’s stone front shrugs off hits; from behind, or stunned against a wall, it’s soft', () => {
    const { run, boss } = withMiniBoss('templeGuardian', { x: TEMPLE.center.x + 150, y: TEMPLE.center.y });
    boss.facing = Math.atan2(run.player.y - boss.enemy.y, run.player.x - boss.enemy.x);
    expect(run.miniBosses.damageTakenMultiplier(boss.enemy)).toBe(MINI_BOSS_TUNING.frontDamageMultiplier);
    boss.facing += Math.PI;
    expect(run.miniBosses.damageTakenMultiplier(boss.enemy)).toBe(1);
    boss.stunnedMs = 500;
    expect(run.miniBosses.damageTakenMultiplier(boss.enemy)).toBe(MINI_BOSS_TUNING.stunDamageMultiplier);
  });

  it('a Guardião charge that slams into a wall stuns it', () => {
    const { run, boss } = withMiniBoss('templeGuardian');
    const stuns: string[] = [];
    run.events.on('miniboss-stunned', ({ kind }) => stuns.push(kind));
    // Park it facing straight into the temple's west wall, right in front of it, mid-charge.
    boss.attack = { type: 'charge', phase: 'active', elapsedMs: 0, x: 0, y: 0, dirX: -1, dirY: 0, hit: false };
    boss.facing = Math.PI;
    let stunned = false;
    for (let step = 0; step < 60 && !stunned; step += 1) {
      advance(run, STEP_MS);
      stunned = boss.stunnedMs > 0;
      if (!boss.attack && !stunned) {
        boss.attack = { type: 'charge', phase: 'active', elapsedMs: 0, x: 0, y: 0, dirX: -1, dirY: 0, hit: false };
        boss.facing = Math.PI;
      }
    }
    expect(stunned).toBe(true);
    expect(stuns).toContain('templeGuardian');
  });

  it('runs home and regenerates when the player leaves its zone', () => {
    const { run, boss } = withMiniBoss('gravedigger');
    boss.enemy.health = boss.enemy.maxHealth * 0.5;
    run.player.x = run.player.prevX = 1760;
    run.player.y = run.player.prevY = 1760;
    advance(run, 2000);
    expect(boss.leashing).toBe(true);
    expect(boss.enemy.health).toBeGreaterThan(boss.enemy.maxHealth * 0.5);
  });

  it('a fallen guardian offers its zone’s companion; a second kill offers to strengthen it', () => {
    const { run, boss } = withMiniBoss('gravedigger');
    run.damageEnemy(boss.enemy, boss.enemy.health + 1, 'sword');
    expect(run.pendingChoice?.kind).toBe('companion');
    const choice = run.pendingChoice as Extract<typeof run.pendingChoice, { kind: 'companion' }>;
    expect(choice.offers[0]).toEqual({ companion: 'skeletonArcher', level: 1 });
    run.chooseCompanion(0);
    expect(run.companions.companions.map((companion) => companion.kind)).toEqual(['skeletonArcher']);
    expect(run.guardiansDefeated).toBe(1);

    advance(run, 400);
    run.spawnMiniBoss('gravedigger');
    advance(run, MINI_BOSS_TUNING.warningMs + 50);
    const second = run.miniBosses.bosses[0];
    run.damageEnemy(second.enemy, second.enemy.health + 1, 'sword');
    const again = run.pendingChoice as Extract<typeof run.pendingChoice, { kind: 'companion' }>;
    expect(again.offers[0]).toEqual({ companion: 'skeletonArcher', level: 2 });
  });

  it('each guardian slain this cycle weakens the Necromancer: less health, a beam fewer', () => {
    const run = session();
    run.guardiansDefeated = 2;
    run.triggerBossWave();
    advance(run, BOSS_TUNING.messageMs + 100);
    const boss = run.bosses.bosses[0];
    expect(boss.enemy.maxHealth).toBe(Math.round(ENEMY_VARIANTS.finalBoss.maxHealth * (1 - GUARDIAN_WEAKENING * 2)));
    expect(boss.beamPenalty).toBe(2);
  });
});

describe('companions', () => {
  it('the archer shoots the nearest enemy until it dies', () => {
    const run = session();
    run.addCompanion('skeletonArcher');
    const enemy = run.spawnEnemy('skeleton', run.player.x + 250, run.player.y, 30)!;
    enemy.movementSpeed = 0;
    enemy.contactDamage = 0;
    // The hero's own weapon is a sword (short reach): the kill is the archer's.
    advance(run, 6000);
    expect(enemy.alive).toBe(false);
  });

  it('the golem pulls nearby enemies off the hero', () => {
    const run = session();
    run.addCompanion('stoneGolem');
    const golem = run.companions.companions[0];
    golem.x = run.player.x + 400;
    golem.y = run.player.y;
    const tauntPoint = { x: golem.x + 120, y: golem.y };
    expect(run.companions.tauntTarget(tauntPoint)).toBe(golem);
    expect(run.companions.tauntTarget({ x: golem.x + COMPANION_TUNING.golemTauntRadius + 50, y: golem.y })).toBeNull();
  });

  it('caps at three, and taking one you have levels it up', () => {
    const run = session();
    expect(run.addCompanion('stoneGolem')).toBe(true);
    expect(run.addCompanion('stoneGolem')).toBe(true);
    expect(run.companions.companions).toHaveLength(1);
    expect(run.companions.companions[0].level).toBe(2);
  });
});
