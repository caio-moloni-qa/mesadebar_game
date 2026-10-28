import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../config/characters';
import { FROST_STACKS, ICE_TROLL, SNOWMAN, WOLF_PACK } from '../../config/balance';
import { WORLD_SIZE } from '../../config/world';
import { ArenaMap } from '../world/ArenaMap';
import { EnemyState, PlayerState } from '../session/entities';
import { GameSession, STEP_MS } from '../session/GameSession';
import { IcicleField } from './IcicleField';

const CENTER = WORLD_SIZE / 2;

function run(session: GameSession, ms: number): void {
  for (let index = 0; index < Math.round(ms / STEP_MS); index += 1) session.step(STEP_MS);
}

function quietSession(): GameSession {
  const session = new GameSession({ characterId: 'barbarian', seed: 7, skipStartingUpgrades: true, arena: ArenaMap.open(WORLD_SIZE) });
  session.skeletonSpawnEnabled = false;
  session.variantSpawnEnabled = false;
  return session;
}

const countLive = (session: GameSession, variantId: string) => {
  let count = 0;
  session.enemies.forEachActive((enemy) => { if (enemy.alive && enemy.variantId === variantId) count += 1; });
  return count;
};

describe('Congelamento', () => {
  it('slows the hero a little more with every stack and melts them all decayMs after the last', () => {
    const player = new PlayerState(CHARACTERS.barbarian);
    const base = player.effectiveMovementSpeed(0);
    player.addFrost(2, 0);
    expect(player.frostStacksAt(0)).toBe(2);
    expect(player.effectiveMovementSpeed(0)).toBeCloseTo(base * (1 - 2 * FROST_STACKS.slowPerStack));
    player.addFrost(1, 1000);
    expect(player.frostStacksAt(1000 + FROST_STACKS.decayMs - 1)).toBe(3);
    expect(player.frostStacksAt(1000 + FROST_STACKS.decayMs)).toBe(0);
  });

  it('freezes the hero solid on the last stack, then gives a moment of grace', () => {
    const player = new PlayerState(CHARACTERS.barbarian);
    expect(player.addFrost(FROST_STACKS.max - 1, 0)).toBe(false);
    expect(player.addFrost(1, 10)).toBe(true);
    expect(player.isFrozen(10)).toBe(true);
    expect(player.frostStacksAt(10)).toBe(0);
    expect(player.effectiveMovementSpeed(10)).toBe(0);
    const thawed = 10 + FROST_STACKS.freezeMs;
    expect(player.isFrozen(thawed)).toBe(false);
    expect(player.addFrost(FROST_STACKS.max, thawed + FROST_STACKS.immuneMs - 1)).toBe(false);
    expect(player.frostStacksAt(thawed + FROST_STACKS.immuneMs - 1)).toBe(0);
    expect(player.addFrost(1, thawed + FROST_STACKS.immuneMs)).toBe(false);
    expect(player.frostStacksAt(thawed + FROST_STACKS.immuneMs)).toBe(1);
  });

  it('keeps a frozen hero from walking', () => {
    const session = quietSession();
    session.player.addFrost(FROST_STACKS.max, session.clock.now);
    session.setMoveInput(1, 0);
    run(session, FROST_STACKS.freezeMs - 100);
    expect(session.player.x).toBe(CENTER);
    run(session, 300);
    expect(session.player.x).toBeGreaterThan(CENTER);
  });

  it('lands a stack with every hit of the Nevado horde', () => {
    const session = quietSession();
    const skeleton = session.spawnEnemy('frostSkeleton', CENTER + 10, CENTER)!;
    skeleton.movementSpeed = 0;
    session.step(STEP_MS);
    expect(session.player.frostStacksAt(session.clock.now)).toBe(1);
  });

  it('blocks new weapon attacks while frozen and resumes them after thawing', () => {
    const session = quietSession();
    session.spawnEnemy('skeleton', CENTER + 35, CENTER)!.movementSpeed = 0;
    let swings = 0;
    session.events.on('melee-swing', () => { swings += 1; });
    session.player.addFrost(FROST_STACKS.max, session.clock.now);
    run(session, FROST_STACKS.freezeMs - 100);
    expect(swings).toBe(0);
    run(session, 1500);
    expect(swings).toBeGreaterThan(0);
  });
});

describe('Xamã da Nevasca', () => {
  it('raises snowmen beside it, at most SNOWMAN.perShaman alive', () => {
    const session = quietSession();
    session.spawnEnemy('snowShaman', CENTER + 1500, CENTER + 1500);
    session.player.invincible = true;
    run(session, 3200 * (SNOWMAN.perShaman + 2) + 100);
    expect(countLive(session, 'snowman')).toBe(SNOWMAN.perShaman);
  });

  it('bursts a snowman that reaches the hero: damage, a stack, and no kill', () => {
    const session = quietSession();
    session.spawnEnemy('snowman', CENTER + 40, CENTER);
    const health = session.player.health;
    run(session, 1000);
    expect(countLive(session, 'snowman')).toBe(0);
    expect(session.kills).toBe(0);
    expect(session.player.health).toBeLessThan(health);
    expect(session.player.frostStacksAt(session.clock.now)).toBe(SNOWMAN.frostStacks);
  });
});

describe('Troll de Gelo', () => {
  it('marks icicles on the hero, holds still through the warning, and they land warnMs later', () => {
    const session = quietSession();
    const troll = session.spawnEnemy('iceTroll', CENTER + 200, CENTER)!;
    troll.contactDamage = 0;
    troll.nextCastAt = 0;
    session.step(STEP_MS);
    expect(session.icicles.icicles).toHaveLength(ICE_TROLL.icicles);
    expect(session.icicles.icicles[0]).toMatchObject({ x: CENTER, y: CENTER });
    const x = troll.x;
    run(session, ICE_TROLL.warnMs - 100);
    expect(troll.x).toBe(x);
    const health = session.player.health;
    run(session, 200);
    expect(session.icicles.icicles).toHaveLength(0);
    expect(session.player.health).toBe(health - (ICE_TROLL.icicleDamage - session.player.armor));
    expect(session.player.frostStacksAt(session.clock.now)).toBeGreaterThanOrEqual(ICE_TROLL.icicleFrost);
  });

  it('chills the hero standing in its aura once per auraTickMs', () => {
    const session = quietSession();
    const troll = session.spawnEnemy('iceTroll', CENTER + ICE_TROLL.auraRadius, CENTER)!;
    troll.contactDamage = 0;
    troll.movementSpeed = 0;
    troll.nextCastAt = Infinity;
    run(session, ICE_TROLL.auraTickMs * 2 + 50);
    expect(session.player.frostStacksAt(session.clock.now)).toBe(3);
  });

  it('lets a hero who steps out from under an icicle walk away clean', () => {
    const field = new IcicleField();
    field.mark(100, 100, 0);
    expect(field.update(ICE_TROLL.warnMs - 1, { x: 100, y: 100, radius: 18 })).toHaveLength(0);
    const [landed] = field.update(ICE_TROLL.warnMs, { x: 300, y: 100, radius: 18 });
    expect(landed.hit).toBe(false);
    expect(field.shatters).toHaveLength(1);
  });
});

describe('Lobo do Gelo', () => {
  it('fans a pack out round the hero so it closes in from several sides', () => {
    const session = quietSession();
    session.player.invincible = true;
    session.spawnWolfPack(5, { x: CENTER + 600, y: CENTER });
    const wolves: EnemyState[] = [];
    session.enemies.forEachActive((enemy) => { if (enemy.variantId === 'iceWolf') wolves.push(enemy); });
    expect(wolves).toHaveLength(5);
    // Where each wolf is (angle round the hero) the moment it first comes within striking range.
    const arrival = new Map<EnemyState, number>();
    for (let step = 0; step < 900 && arrival.size < wolves.length; step += 1) {
      session.step(STEP_MS);
      for (const wolf of wolves) {
        if (arrival.has(wolf) || Math.hypot(wolf.x - session.player.x, wolf.y - session.player.y) > WOLF_PACK.flankRadius + 30) continue;
        arrival.set(wolf, Math.atan2(wolf.y - session.player.y, wolf.x - session.player.x));
      }
    }
    expect(arrival.size).toBe(5);
    const angles = [...arrival.values()];
    const apart = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    const widest = Math.max(...angles.flatMap((a) => angles.map((b) => apart(a, b))));
    // Straight-line chasers would all arrive from the east (0 rad); the pack wraps well past both flanks.
    expect(widest).toBeGreaterThan(Math.PI * 0.75);
    expect(angles.filter((angle) => Math.abs(angle) > Math.PI / 2).length).toBeGreaterThanOrEqual(1);
  });

  it('gives up circling and bites after flankMs', () => {
    const session = quietSession();
    session.player.invincible = true;
    session.spawnWolfPack(3, { x: CENTER + 600, y: CENTER });
    run(session, WOLF_PACK.flankMs + 100);
    session.enemies.forEachActive((enemy) => { if (enemy.variantId === 'iceWolf' && enemy.alive) expect(Number.isNaN(enemy.flankAngle)).toBe(true); });
  });
});
