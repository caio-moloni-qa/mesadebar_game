import { describe, expect, it } from 'vitest';
import { ENEMY_CONFIG, ENEMY_VARIANTS, PLAYER_CONFIG } from '../../config/balance';
import { CHARACTERS } from '../../config/characters';
import { WEAPONS } from '../../config/weapons';
import { WORLD_SIZE } from '../../config/world';
import { ENEMY_DYING_MS } from './entities';
import { GameSession, STEP_MS } from './GameSession';

const CENTER = WORLD_SIZE / 2;

function run(session: GameSession, ms: number): void {
  const steps = Math.round(ms / STEP_MS);
  for (let index = 0; index < steps; index += 1) session.step(STEP_MS);
}

/** A session with the real spawn schedule switched off, so a test controls exactly which enemies exist. */
function quietSession(characterId: 'mage' | 'barbarian', seed: number): GameSession {
  const session = new GameSession({ characterId, seed });
  session.skeletonSpawnEnabled = false;
  session.variantSpawnEnabled = false;
  return session;
}

describe('GameSession movement', () => {
  it('moves the player at the character speed and clamps to the arena', () => {
    const session = new GameSession({ characterId: 'mage', seed: 1 });
    session.setMoveInput(1, 0);
    run(session, 1000);
    expect(session.player.x - CENTER).toBeCloseTo(CHARACTERS.mage.movementSpeed, 0);
    session.setMoveInput(0, -5);
    run(session, 20_000);
    expect(session.player.y).toBe(session.player.radius);
  });

  it('normalises diagonal input', () => {
    const session = new GameSession({ characterId: 'barbarian', seed: 1 });
    session.setMoveInput(1, 1);
    run(session, 1000);
    expect(Math.hypot(session.player.x - CENTER, session.player.y - CENTER)).toBeCloseTo(CHARACTERS.barbarian.movementSpeed, 0);
  });
});

describe('GameSession combat', () => {
  it('the Cajado kills a nearby skeleton, which then dies over ENEMY_DYING_MS and drops a gem', () => {
    const session = quietSession('mage', 2);
    const kills: string[] = [];
    session.events.on('enemy-defeated', (event) => kills.push(event.variantId));
    const enemy = session.spawnEnemy('skeleton', CENTER + 300, CENTER)!;
    enemy.movementSpeed = 0;
    // 40 HP / 15 damage = 3 bolts; bolts need ~0.6s to fly 300 units, cooldown 700ms / 1.15 attack speed.
    run(session, 3000);
    expect(kills).toEqual(['skeleton']);
    expect(session.kills).toBe(1);
    expect(session.experience + (session.level > 1 ? 1 : 0)).toBeGreaterThan(0);
    expect(session.gems.activeCount).toBe(1);
    run(session, ENEMY_DYING_MS + STEP_MS * 2);
    expect(session.enemies.activeCount).toBe(0);
  });

  it('does not fire when nothing is within the weapon range', () => {
    const session = quietSession('mage', 3);
    session.spawnEnemy('necromancerWraith', CENTER + WEAPONS.staff.range + 50, CENTER);
    let shots = 0;
    session.events.on('projectile-fired', () => { shots += 1; });
    run(session, 2000);
    expect(shots).toBe(0);
  });

  it('applies contact damage once per invulnerability window, reduced by armor', () => {
    const session = quietSession('barbarian', 4);
    const hits: number[] = [];
    session.events.on('player-damaged', (event) => hits.push(event.amount));
    const enemy = session.spawnEnemy('skeleton', CENTER, CENTER, 1_000_000)!;
    enemy.movementSpeed = 0;
    run(session, PLAYER_CONFIG.invulnerabilityMs * 2 + 100);
    expect(hits).toHaveLength(3);
    hits.forEach((amount) => expect(amount).toBe(ENEMY_VARIANTS.skeleton.contactDamage - CHARACTERS.barbarian.armor));
  });

  it('ends the run when the player dies and stops simulating', () => {
    const session = quietSession('mage', 5);
    let died = 0;
    session.events.on('player-died', () => { died += 1; });
    session.player.health = 1;
    session.spawnEnemy('skeleton', CENTER, CENTER, 1_000_000);
    run(session, 500);
    expect(session.over).toBe(true);
    expect(died).toBe(1);
    const elapsed = session.elapsedMs;
    run(session, 500);
    expect(session.elapsedMs).toBe(elapsed);
  });
});

describe('GameSession pickups', () => {
  it('attracts gems inside pickupRange and adds their value to currency', () => {
    const session = quietSession('mage', 6);
    const gem = session.gems.acquire()!;
    gem.x = CENTER + CHARACTERS.mage.pickupRange - 10;
    gem.y = CENTER;
    gem.value = 3;
    run(session, 1000);
    expect(session.currency).toBe(3);
    expect(session.gems.activeCount).toBe(0);
  });

  it('leaves gems outside pickupRange alone', () => {
    const session = quietSession('mage', 6);
    const gem = session.gems.acquire()!;
    gem.x = CENTER + CHARACTERS.mage.pickupRange + 50;
    gem.y = CENTER;
    run(session, 1000);
    expect(gem.x).toBe(CENTER + CHARACTERS.mage.pickupRange + 50);
  });
});

describe('GameSession spawning and pooling', () => {
  it('runs the real spawn schedule and never exceeds ENEMY_CONFIG.maxActive', () => {
    const session = new GameSession({ characterId: 'mage', seed: 7, stressEnemyCount: 1000 });
    session.player.invincible = true;
    run(session, 2000);
    expect(session.enemies.activeCount).toBe(ENEMY_CONFIG.maxActive);
  });

  it('pauses completely', () => {
    const session = new GameSession({ characterId: 'mage', seed: 8 });
    session.paused = true;
    run(session, 5000);
    expect(session.elapsedMs).toBe(0);
    expect(session.enemies.activeCount).toBe(0);
  });

  it('is deterministic for the same seed and inputs', () => {
    const snapshot = (seed: number) => {
      const session = new GameSession({ characterId: 'reliquia', seed });
      session.player.invincible = true;
      session.setMoveInput(1, 0.5);
      run(session, 20_000);
      return { kills: session.kills, currency: session.currency, enemies: session.enemies.activeCount, x: session.player.x };
    };
    expect(snapshot(99)).toEqual(snapshot(99));
  });
});
