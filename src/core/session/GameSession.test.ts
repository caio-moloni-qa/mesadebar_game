import { describe, expect, it } from 'vitest';
import { CharacterId, CHARACTERS } from '../../config/characters';
import { ENEMY_CONFIG, ENEMY_VARIANTS, PLAYER_CONFIG, ROTTEN_AURA_CONFIG, requiredExperience } from '../../config/balance';
import { WEAPONS, WeaponConfig } from '../../config/weapons';
import { WORLD_SIZE } from '../../config/world';
import { ArenaMap } from '../world/ArenaMap';
import { ENEMY_DYING_MS, SOUL_CONFIG } from './entities';
import { GameSession, STEP_MS } from './GameSession';

const CENTER = WORLD_SIZE / 2;

function run(session: GameSession, ms: number): void {
  const steps = Math.round(ms / STEP_MS);
  for (let index = 0; index < steps; index += 1) session.step(STEP_MS);
}

/** The first card of an open upgrade choice (starting / level-up). */
function firstUpgradeId(session: GameSession): string {
  const choice = session.pendingChoice;
  if (!choice || choice.kind === 'companion') throw new Error('no upgrade choice open');
  return choice.upgrades[0].id;
}

/** Real spawn schedule off and no starting-upgrade screen, so a test controls exactly what exists. */
function quietSession(characterId: CharacterId, seed: number, startingWeaponId?: WeaponConfig['id']): GameSession {
  const session = new GameSession({ characterId, seed, startingWeaponId, skipStartingUpgrades: true, arena: ArenaMap.open(WORLD_SIZE) });
  session.skeletonSpawnEnabled = false;
  session.variantSpawnEnabled = false;
  return session;
}

/** Stationary punching bag: never moves, never hurts, effectively unkillable unless a test says otherwise. */
function dummy(session: GameSession, x: number, y: number, health = 1_000_000) {
  const enemy = session.spawnEnemy('skeleton', x, y, health)!;
  enemy.movementSpeed = 0;
  enemy.contactDamage = 0;
  return enemy;
}

function setUpgradeCount(session: GameSession, count: number): void {
  session.weapons.weapons.forEach((weapon) => { weapon.upgradeCount = count; });
}

describe('movement', () => {
  it('moves at the character speed and clamps to the arena', () => {
    const session = quietSession('mage', 1);
    session.setMoveInput(1, 0);
    run(session, 1000);
    expect(session.player.x - CENTER).toBeCloseTo(CHARACTERS.mage.movementSpeed, 0);
    session.setMoveInput(0, -5);
    run(session, 20_000);
    expect(session.player.y).toBe(session.player.radius);
  });

  it('normalises diagonal input', () => {
    const session = quietSession('reliquia', 1);
    session.setMoveInput(1, 1);
    run(session, 1000);
    expect(Math.hypot(session.player.x - CENTER, session.player.y - CENTER)).toBeCloseTo(CHARACTERS.reliquia.movementSpeed, 0);
  });
});

describe('Cajado', () => {
  it('kills a skeleton, which dies over ENEMY_DYING_MS and drops a gem worth its reward', () => {
    const session = quietSession('mage', 2);
    const kills: string[] = [];
    session.events.on('enemy-defeated', (event) => kills.push(event.variantId));
    const enemy = dummy(session, CENTER + 300, CENTER, ENEMY_VARIANTS.skeleton.maxHealth);
    run(session, 3000);
    expect(kills).toEqual(['skeleton']);
    expect(enemy.phase === 'dying' || session.enemies.activeCount === 0).toBe(true);
    const gems: number[] = [];
    session.pickups.forEachActive((pickup) => { if (pickup.kind === 'gem') gems.push(pickup.value); });
    expect(gems).toEqual([ENEMY_VARIANTS.skeleton.reward]);
    run(session, ENEMY_DYING_MS + STEP_MS * 2);
    expect(session.enemies.activeCount).toBe(0);
  });

  it('does not fire when nothing is within range', () => {
    const session = quietSession('mage', 3);
    dummy(session, CENTER + WEAPONS.staff.range + 50, CENTER);
    let shots = 0;
    session.events.on('projectile-fired', () => { shots += 1; });
    run(session, 2000);
    expect(shots).toBe(0);
  });

  it('Benção Arcana fans extra projectiles out in ±30° steps', () => {
    const session = quietSession('mage', 4);
    session.player.projectileExtraCount = 2;
    dummy(session, CENTER + 400, CENTER);
    const fired: number[] = [];
    session.events.on('projectile-fired', () => fired.push(session.clock.now));
    run(session, STEP_MS * 2);
    expect(fired).toHaveLength(3);
  });

  it('exclusive (5 upgrades + affinity): every 4th attack executes a common enemy regardless of its health', () => {
    const session = quietSession('mage', 5);
    setUpgradeCount(session, 5);
    const target = dummy(session, CENTER + 120, CENTER, 1_000_000);
    const explosions: number[] = [];
    session.events.on('staff-explosion', (event) => explosions.push(event.index));
    run(session, 4000);
    expect(target.phase).toBe('dying');
    expect(explosions.length).toBeGreaterThan(0);
  });
});

describe('Espada / Chicote', () => {
  it('the cone hits enemies in front and spares the ones behind', () => {
    const session = quietSession('barbarian', 6);
    const front = dummy(session, CENTER + 80, CENTER);
    const behind = dummy(session, CENTER - 100, CENTER);
    run(session, STEP_MS * 2);
    expect(front.health).toBeLessThan(front.maxHealth);
    expect(behind.health).toBe(behind.maxHealth);
  });

  it('Roubo de Vida heals from melee damage', () => {
    const session = quietSession('barbarian', 7);
    session.player.health = 100;
    session.player.lifeStealPercent = 0.5;
    dummy(session, CENTER + 80, CENTER);
    run(session, STEP_MS * 2);
    expect(session.player.health).toBeCloseTo(100 + WEAPONS.sword.baseDamage * CHARACTERS.barbarian.damageMultiplier * 0.5);
  });

  it('the whip chains to nearby enemies, up to 4 struck per swing', () => {
    const session = quietSession('barbarian', 8, 'whip');
    const line = [100, 200, 300, 400, 500].map((offset) => dummy(session, CENTER + offset, CENTER));
    run(session, STEP_MS * 2);
    const struck = line.filter((enemy) => enemy.health < enemy.maxHealth);
    expect(struck).toHaveLength(4);
    expect(line[4].health).toBe(line[4].maxHealth);
  });

  it('exclusive: a 12-sword volley flies out once the Espada has 5 upgrades and melee affinity', () => {
    const session = quietSession('barbarian', 9);
    dummy(session, CENTER + 900, CENTER);
    run(session, STEP_MS * 3);
    let swords = 0;
    session.projectiles.forEachActive((projectile) => { if (projectile.kind === 'thrownSword') swords += 1; });
    expect(swords).toBe(0);
    setUpgradeCount(session, 5);
    run(session, STEP_MS * 3);
    session.projectiles.forEachActive((projectile) => { if (projectile.kind === 'thrownSword') swords += 1; });
    expect(swords).toBe(12);
  });

  it('Ataque Redemoinho swings in all four directions', () => {
    const session = quietSession('barbarian', 10);
    session.player.whirlwindUnlocked = true;
    const swings: Array<[number, number]> = [];
    session.events.on('melee-swing', (event) => swings.push([Math.round(event.dirX), Math.round(event.dirY)]));
    dummy(session, CENTER + 80, CENTER);
    run(session, 400);
    expect(swings).toEqual(expect.arrayContaining([[1, 0], [0, 1], [-1, 0], [0, -1]]));
  });
});

describe('Bumerangue', () => {
  it('hits on the way out and again on the way back', () => {
    const session = quietSession('fabri', 11);
    const target = dummy(session, CENTER + 150, CENTER);
    const hits: number[] = [];
    session.events.on('enemy-hit', (event) => { if (event.enemy === target) hits.push(session.clock.now); });
    run(session, 1200);
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  it("Fabri's transform turns it into bananas that stack a slow on each hit", () => {
    const session = quietSession('fabri', 12);
    setUpgradeCount(session, CHARACTERS.fabri.boomerangBananaTransform!.upgradeThreshold);
    const target = dummy(session, CENTER + 150, CENTER);
    const kinds = new Set<string>();
    session.events.on('projectile-fired', (event) => kinds.add(event.kind));
    run(session, 1200);
    expect([...kinds]).toEqual(['banana']);
    expect(target.slowStackPercent).toBeGreaterThan(0);
  });

  it('the transform needs ranged affinity, not just upgrades', () => {
    const session = quietSession('fabri', 13, 'boomerang');
    session.affinities.clear();
    setUpgradeCount(session, 10);
    dummy(session, CENTER + 150, CENTER);
    const kinds = new Set<string>();
    session.events.on('projectile-fired', (event) => kinds.add(event.kind));
    run(session, 300);
    expect([...kinds]).toEqual(['boomerang']);
  });
});

describe('Relíquia Divina', () => {
  it("ticks every enemy inside the radius with Relíquia's overridden damage", () => {
    const session = quietSession('reliquia', 14);
    const inside = dummy(session, CENTER + 70, CENTER);
    const outside = dummy(session, CENTER + 200, CENTER);
    run(session, STEP_MS * 2);
    const overrides = CHARACTERS.reliquia.auraWeaponOverrides!;
    expect(inside.maxHealth - inside.health).toBeCloseTo(overrides.baseDamage * CHARACTERS.reliquia.damageMultiplier);
    expect(outside.health).toBe(outside.maxHealth);
  });

  it('banks a capped bonus onto the next hit the player takes', () => {
    const session = quietSession('reliquia', 15);
    dummy(session, CENTER + 50, CENTER);
    run(session, 60_000);
    expect(session.player.auraDamageTakenBonus).toBeGreaterThan(0);
    expect(session.player.auraDamageTakenBonus).toBeLessThanOrEqual(15);
  });
});

describe('enemies', () => {
  it('contact damage lands once per invulnerability window, reduced by armor', () => {
    const session = quietSession('barbarian', 16);
    const hits: number[] = [];
    session.events.on('player-damaged', (event) => hits.push(event.amount));
    const enemy = session.spawnEnemy('skeleton', CENTER, CENTER, 1_000_000)!;
    enemy.movementSpeed = 0;
    run(session, PLAYER_CONFIG.invulnerabilityMs * 2 + 100);
    expect(hits).toHaveLength(3);
    hits.forEach((amount) => expect(amount).toBe(ENEMY_VARIANTS.skeleton.contactDamage - CHARACTERS.barbarian.armor));
  });

  it('the Necromante fires slowing souls at the player', () => {
    const session = quietSession('mage', 17);
    session.spawnEnemy('necromancerWraith', CENTER + 1200, CENTER, 1_000_000);
    const statuses: string[] = [];
    session.events.on('player-status', (event) => statuses.push(event.text));
    run(session, ENEMY_VARIANTS.necromancerWraith.soulCooldownMs + 6000);
    expect(statuses).toContain(`LENTO +${SOUL_CONFIG.slowPercent * 100}%`);
    expect(session.player.health).toBeLessThan(session.player.maxHealth);
  });

  it('the Aura Podre cuts healing and ticks damage through i-frames', () => {
    const session = quietSession('mage', 18);
    session.player.passiveHealAmount = 0;
    const brute = session.spawnEnemy('superSkeleton', CENTER + 20, CENTER, 1_000_000)!;
    brute.movementSpeed = 0;
    brute.contactDamage = 0;
    run(session, ROTTEN_AURA_CONFIG.tickMs * 3 + 50);
    expect(session.player.maxHealth - session.player.health).toBe(ROTTEN_AURA_CONFIG.dps * 3);
    const before = session.player.health;
    expect(session.player.heal(10, session.clock.now)).toBeCloseTo(10 * ROTTEN_AURA_CONFIG.healReduction);
    expect(session.player.health).toBeCloseTo(before + 10 * (1 - ROTTEN_AURA_CONFIG.healReduction));
  });

  it('overlapping enemies push apart', () => {
    const session = quietSession('mage', 19);
    session.player.invincible = true;
    const a = dummy(session, CENTER + 500, CENTER);
    const b = dummy(session, CENTER + 500, CENTER);
    run(session, 1000);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.radius);
  });
});

describe('level-ups and choices', () => {
  it('freezes the run on level-up until an upgrade is chosen, which counts toward every weapon', () => {
    const session = quietSession('mage', 20);
    session.experience = requiredExperience(1) - 1;
    dummy(session, CENTER + 100, CENTER, 1);
    run(session, 500);
    const choice = session.pendingChoice!;
    expect(choice.kind).toBe('level-up');
    expect(session.level).toBe(2);
    const frozenAt = session.elapsedMs;
    run(session, 1000);
    expect(session.elapsedMs).toBe(frozenAt);
    session.chooseUpgrade(firstUpgradeId(session));
    expect(session.pendingChoice).toBeNull();
    expect(session.weapons.primary.upgradeCount).toBe(1);
    run(session, 100);
    expect(session.elapsedMs).toBeGreaterThan(frozenAt);
  });

  it('every 5th level offers 5 cards, one of them an extra weapon', () => {
    const session = quietSession('mage', 21);
    session.level = 4;
    session.experienceNeeded = 1;
    session.experience = 0;
    dummy(session, CENTER + 100, CENTER, 1);
    run(session, 500);
    const choice = session.pendingChoice!;
    expect(choice.kind).toBe('level-up');
    if (choice.kind !== 'level-up') return;
    expect(choice.upgrades).toHaveLength(4);
    expect(choice.extraWeapon).not.toBeNull();
    expect(choice.extraWeapon!.id).not.toBe('staff');
    session.chooseExtraWeapon();
    expect(session.weapons.weapons.map((weapon) => weapon.config.id)).toEqual(['staff', choice.extraWeapon!.id]);
  });

  it('opens the starting-upgrade screen for the preferred weapon and resumes after all picks', () => {
    const session = new GameSession({ characterId: 'barbarian', seed: 22, arena: ArenaMap.open(WORLD_SIZE) });
    const choice = session.pendingChoice!;
    expect(choice.kind).toBe('starting');
    if (choice.kind !== 'starting') return;
    expect(choice.upgrades).toHaveLength(CHARACTERS.barbarian.startingWeaponUpgradeChoices!);
    for (let pick = 0; pick < choice.picksTotal; pick += 1) session.chooseUpgrade(choice.upgrades[0].id);
    expect(session.pendingChoice).toBeNull();
    expect(session.weapons.primary.upgradeCount).toBe(3);
  });

  it('collecting a chest applies a random upgrade on the spot', () => {
    const session = quietSession('mage', 23);
    const opened: string[] = [];
    session.events.on('chest-opened', (event) => opened.push(event.upgrade.id));
    const chest = session.pickups.acquire()!;
    chest.kind = 'chest';
    chest.x = CENTER + 10;
    chest.y = CENTER;
    chest.radius = 21;
    run(session, 200);
    expect(opened).toHaveLength(1);
    expect(session.weapons.primary.upgradeCount).toBe(1);
  });
});

describe('pickups, pooling and determinism', () => {
  it('attracts gems inside pickupRange and leaves the rest alone', () => {
    const session = quietSession('mage', 24);
    const near = session.pickups.acquire()!;
    Object.assign(near, { kind: 'gem', x: CENTER + CHARACTERS.mage.pickupRange - 10, y: CENTER, value: 3, radius: 8 });
    const far = session.pickups.acquire()!;
    Object.assign(far, { kind: 'gem', x: CENTER + CHARACTERS.mage.pickupRange + 50, y: CENTER, value: 3, radius: 8 });
    run(session, 1000);
    expect(session.currency).toBe(3);
    expect(far.x).toBe(CENTER + CHARACTERS.mage.pickupRange + 50);
  });

  it('runs the real schedule and never exceeds ENEMY_CONFIG.maxActive', () => {
    const session = new GameSession({ characterId: 'mage', seed: 25, stressEnemyCount: 1000, skipStartingUpgrades: true, arena: ArenaMap.open(WORLD_SIZE) });
    session.player.invincible = true;
    run(session, 2000);
    expect(session.enemies.activeCount).toBe(ENEMY_CONFIG.maxActive);
  });

  it('pauses completely', () => {
    const session = quietSession('mage', 26);
    session.paused = true;
    run(session, 5000);
    expect(session.elapsedMs).toBe(0);
  });

  it('ends the run on death and stops simulating', () => {
    const session = quietSession('mage', 27);
    let died = 0;
    session.events.on('player-died', () => { died += 1; });
    session.player.health = 1;
    session.spawnEnemy('skeleton', CENTER, CENTER, 1_000_000);
    run(session, 500);
    expect(session.over).toBe(true);
    expect(died).toBe(1);
  });

  it('is deterministic for the same seed, inputs and choices', () => {
    const snapshot = (seed: number) => {
      const session = new GameSession({ characterId: 'barbarian', seed, arena: ArenaMap.open(WORLD_SIZE) });
      session.player.invincible = true;
      session.setMoveInput(1, 0.5);
      for (let step = 0; step < 1800; step += 1) {
        if (session.pendingChoice) session.chooseUpgrade(firstUpgradeId(session));
        session.step(STEP_MS);
      }
      return { kills: session.kills, level: session.level, currency: session.currency, enemies: session.enemies.activeCount, x: session.player.x };
    };
    expect(snapshot(99)).toEqual(snapshot(99));
  });
});

describe('reveal hold', () => {
  it('freezes the simulation without counting as the pause menu, and releases it', () => {
    const session = quietSession('mage', 3);
    session.setMoveInput(1, 0);
    session.revealing = true;
    expect(session.frozen).toBe(true);
    expect(session.paused).toBe(false);
    const x = session.player.x;
    const elapsed = session.elapsedMs;
    run(session, 30);
    expect(session.player.x).toBe(x);
    expect(session.elapsedMs).toBe(elapsed);
    session.revealing = false;
    run(session, 30);
    expect(session.player.x).toBeGreaterThan(x);
  });
});

describe('sandbox controls', () => {
  it('the damage buffer soaks hits before health', () => {
    const session = quietSession('barbarian', 4);
    session.player.damageBuffer = 30;
    const health = session.player.health;
    session.player.damage(20, session.clock.now);
    expect(session.player.health).toBe(health);
    expect(session.player.damageBuffer).toBeLessThan(30);
  });

  it('kills every enemy with credit, spawns near the player, and caps the field', () => {
    const session = quietSession('mage', 4);
    session.spawnNearPlayer('skeleton', 6);
    expect(session.enemies.activeCount).toBe(6);
    session.enemies.forEachActive((enemy) => {
      expect(Math.hypot(enemy.x - session.player.x, enemy.y - session.player.y)).toBeLessThan(300);
    });
    session.killAllEnemies();
    expect(session.kills).toBe(6);
    expect(session.experience).toBeGreaterThan(0);
    // The XP opened a level-up (which pauses the run): pick, then let the dying ones return to the pool.
    while (session.pendingChoice) session.chooseUpgrade(firstUpgradeId(session));
    run(session, 400);
    expect(session.enemies.activeCount).toBe(0);
    session.setEnemySpawnCap(3);
    session.spawnNearPlayer('skeleton', 10);
    expect(session.enemies.activeCount).toBe(3);
  });

  it('moves the clock (never below zero) and grants weapon or attribute upgrades', () => {
    const session = quietSession('barbarian', 4, 'sword');
    session.adjustElapsedMs(30_000);
    expect(session.elapsedMs).toBeGreaterThanOrEqual(30_000);
    session.adjustElapsedMs(-90_000);
    expect(session.elapsedMs).toBe(0);
    const upgrade = session.grantSandboxUpgrade('weapon');
    expect(upgrade).not.toBeNull();
    expect(session.selectedUpgradeCounts.get(upgrade!.id)).toBe(1);
    expect(session.grantSandboxUpgrade('attribute')).not.toBeNull();
  });
});
