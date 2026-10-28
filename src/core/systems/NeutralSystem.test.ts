import { describe, expect, it } from 'vitest';
import { GREENFIELD, NeutralSpot } from '../../config/arenaLayout';
import { WORLD_SIZE } from '../../config/world';
import { GameSession, STEP_MS } from '../session/GameSession';
import { ArenaMap } from '../world/ArenaMap';
import { NEUTRAL_TUNING } from './NeutralSystem';

const CENTER = WORLD_SIZE / 2;
const advance = (run: GameSession, ms: number) => { for (let elapsed = 0; elapsed < ms; elapsed += STEP_MS) run.step(STEP_MS); };

/** A quiet open arena with one group of boars `distance` east of the hero. */
function session(count = 1, distance = 500, arena = ArenaMap.open(WORLD_SIZE), spot: Omit<NeutralSpot, 'home' | 'count'> = { variant: 'boar' }): GameSession {
  const run = new GameSession({ characterId: 'mage', seed: 3, skipStartingUpgrades: true, arena });
  run.skeletonSpawnEnabled = false;
  run.variantSpawnEnabled = false;
  run.player.x = run.player.prevX = CENTER;
  run.player.y = run.player.prevY = CENTER;
  run.neutrals.populate([{ ...spot, home: { x: CENTER + distance, y: CENTER }, count }]);
  return run;
}
const boars = (run: GameSession) => run.neutrals.creatures.map((creature) => creature.enemy!);
const hurtable = (run: GameSession) => { run.player.invincible = false; run.player.armor = 0; };
/** Takes any level-up card so the clock keeps running. */
const takeCards = (run: GameSession) => { const choice = run.pendingChoice; if (choice?.kind === 'level-up') run.chooseUpgrade(choice.upgrades[0].id); };

describe('neutral creatures', () => {
  it('a calm boar never chases nor hurts the hero', () => {
    const run = session(1, 60);
    run.player.invincible = false;
    const [boar] = boars(run);
    const startHealth = run.player.health;
    advance(run, 3000);
    expect(boar.mood === 'angry').toBe(false);
    expect(run.player.health).toBe(startHealth);
  });

  it('notices the hero up close: hops ("!"), then runs away', () => {
    const run = session(1, NEUTRAL_TUNING.noticeRadius + 100);
    const [boar] = boars(run);
    const startled: unknown[] = [];
    run.events.on('neutral-startled', (event) => startled.push(event));
    run.player.x = run.player.prevX = boar.x - NEUTRAL_TUNING.noticeRadius + 40;
    advance(run, 100);
    expect(boar.mood).toBe('startled');
    expect(startled).toHaveLength(1);
    const before = Math.hypot(boar.x - run.player.x, boar.y - run.player.y);
    advance(run, NEUTRAL_TUNING.startleMs + 800);
    expect(boar.mood).toBe('fleeing');
    expect(Math.hypot(boar.x - run.player.x, boar.y - run.player.y)).toBeGreaterThan(before);
  });

  it('aimed weapons look past a calm neutral, then target it once angry', () => {
    const run = session(1, 150);
    const [boar] = boars(run);
    advance(run, STEP_MS);
    expect(run.nearestEnemy(run.player, 400)).toBeNull();
    expect(run.nearestVisibleEnemy(run.player, 400)).toBeNull();
    // Area damage (an aura, an explosion) still lands, and picks the fight.
    expect(run.enemiesWithin(run.player, 400)).toContain(boar);
    run.damageEnemy(boar, 1, 'staff');
    expect(boar.mood).toBe('angry');
    expect(run.nearestEnemy(run.player, 400)).toBe(boar);
  });

  it('hurting one wakes the whole group', () => {
    const run = session(3, 500);
    const provoked: unknown[] = [];
    run.events.on('neutral-provoked', (event) => provoked.push(event));
    run.damageEnemy(boars(run)[0], 1, 'staff');
    expect(boars(run).every((boar) => boar.mood === 'angry')).toBe(true);
    expect(provoked).toHaveLength(3);
  });

  it('an angry boar digs in, charges and hits the hero', () => {
    const run = session(1, 250);
    run.player.invincible = false;
    run.player.armor = 0;
    const [boar] = boars(run);
    const windups: unknown[] = [];
    run.events.on('neutral-windup', (event) => windups.push(event));
    run.damageEnemy(boar, 1, 'staff');
    const startHealth = run.player.health;
    advance(run, NEUTRAL_TUNING.boarWindupMs + NEUTRAL_TUNING.boarChargeMs + 100);
    expect(windups.length).toBeGreaterThanOrEqual(1);
    expect(run.player.health).toBeLessThan(startHealth);
  });

  it('charging into a wall leaves it dazed', () => {
    const wall = ArenaMap.withObstacles(WORLD_SIZE, [{ kind: 'wall', shape: 'box', x: CENTER + 120, y: CENTER, halfWidth: 20, halfHeight: 200, rotation: 0, tall: true, variant: 0, bound: 202 }]);
    const run = session(1, 300, wall);
    run.player.invincible = true;
    const [boar] = boars(run);
    const dazed: unknown[] = [];
    run.events.on('neutral-dazed', (event) => dazed.push(event));
    run.damageEnemy(boar, 1, 'staff');
    advance(run, NEUTRAL_TUNING.boarWindupMs + NEUTRAL_TUNING.boarChargeMs);
    expect(dazed).toHaveLength(1);
  });

  it('calms down when the hero stays away, walks home and heals', () => {
    const run = session(1, 500);
    run.player.invincible = true;
    const [boar] = boars(run);
    run.damageEnemy(boar, 100, 'staff');
    run.player.x = run.player.prevX = 100;
    run.player.y = run.player.prevY = 100;
    advance(run, NEUTRAL_TUNING.calmAfterMs + 500);
    expect(['returning', 'calm']).toContain(boar.mood);
    advance(run, 15_000);
    expect(boar.mood).toBe('calm');
    expect(boar.health).toBe(boar.maxHealth);
  });

  it("stays out of the horde's cap and a boss's sweep", () => {
    const run = session(2, 500);
    expect(run.enemies.activeCount).toBe(2);
    expect(run.neutrals.liveCount).toBe(2);
    (run as unknown as { clearEnemyField(keep: () => boolean): number }).clearEnemyField(() => false);
    expect(boars(run).every((boar) => boar.alive)).toBe(true);
  });

  it('pays coins and experience, and comes back later', () => {
    const run = session(1, 500);
    const [boar] = boars(run);
    run.damageEnemy(boar, 1_000_000, 'staff');
    expect(run.kills).toBe(1);
    expect(run.pickups.activeCount).toBeGreaterThanOrEqual(3);
    // Its experience is a level: take the card so the clock runs on.
    const choice = run.pendingChoice;
    if (choice?.kind === 'level-up') run.chooseUpgrade(choice.upgrades[0].id);
    advance(run, 1000);
    expect(run.neutrals.liveCount).toBe(0);
    run.player.x = run.player.prevX = 100;
    advance(run, NEUTRAL_TUNING.respawnMs);
    expect(run.neutrals.liveCount).toBe(1);
  });

  it('Greenfield places its boars at the start of a run', () => {
    const run = new GameSession({ characterId: 'mage', seed: 3, skipStartingUpgrades: true });
    const expected = (GREENFIELD.neutrals ?? []).reduce((total, spot) => total + spot.count, 0);
    expect(run.neutrals.liveCount).toBe(expected);
  });

  describe('Cervo', () => {
    it('the stag leads the herd and charges; hurt does only run', () => {
      const run = session(3, 260, undefined, { variant: 'doe', leader: 'stag' });
      hurtable(run);
      const [stag, ...does] = boars(run);
      expect(stag.variantId).toBe('stag');
      expect(does.every((doe) => doe.variantId === 'doe')).toBe(true);
      const startHealth = run.player.health;
      run.damageEnemy(does[0], 1, 'staff');
      expect(stag.mood).toBe('angry');
      expect(does.every((doe) => doe.mood === 'fleeing' && doe.contactDamage === 0)).toBe(true);
      advance(run, NEUTRAL_TUNING.stagWindupMs + NEUTRAL_TUNING.stagChargeMs + 100);
      expect(run.player.health).toBeLessThan(startHealth);
    });

    it('drops a potion', () => {
      const run = session(1, 500, undefined, { variant: 'doe' });
      run.damageEnemy(boars(run)[0], 1_000_000, 'staff');
      let potions = 0;
      run.pickups.forEachActive((pickup) => { if (pickup.kind === 'potion') potions += 1; });
      expect(potions).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Colmeia', () => {
    it("ignores the hero until hurt, never moves, and sends a swarm that stings", () => {
      const run = session(1, 120, undefined, { variant: 'hive' });
      hurtable(run);
      const [hive] = boars(run);
      const home = { x: hive.x, y: hive.y };
      advance(run, 2000);
      expect(hive.mood).toBe('calm');
      expect(run.neutrals.swarms).toHaveLength(0);
      run.damageEnemy(hive, 1, 'staff');
      advance(run, STEP_MS);
      expect(run.neutrals.swarms).toHaveLength(1);
      const startHealth = run.player.health;
      advance(run, 2000);
      expect(run.player.health).toBeLessThan(startHealth);
      expect({ x: hive.x, y: hive.y }).toEqual(home);
    });

    it('the swarm gives up after a while, and its honey heals and quickens', () => {
      const run = session(1, 900, undefined, { variant: 'hive' });
      const [hive] = boars(run);
      run.damageEnemy(hive, 1, 'staff');
      advance(run, STEP_MS);
      run.player.invincible = true;
      advance(run, NEUTRAL_TUNING.swarmMs + 100);
      expect(run.neutrals.swarms.filter((swarm) => swarm.endsAt <= run.clock.now)).toHaveLength(0);
      // Kill it and walk over the honey.
      run.damageEnemy(hive, 1_000_000, 'staff');
      takeCards(run);
      const speed = run.player.effectiveMovementSpeed(run.clock.now);
      let honey: { x: number; y: number } | null = null;
      run.pickups.forEachActive((pickup) => { if (pickup.kind === 'honey') honey = pickup; });
      expect(honey).not.toBeNull();
      run.player.x = run.player.prevX = honey!.x;
      run.player.y = run.player.prevY = honey!.y;
      advance(run, 100);
      expect(run.player.effectiveMovementSpeed(run.clock.now)).toBeCloseTo(speed * (1 + NEUTRAL_TUNING.honeyHastePercent));
    });
  });

  describe('Mímico', () => {
    it('passes for a chest: aimed shots skip it, it shivers up close and springs on a touch', () => {
      const run = session(1, NEUTRAL_TUNING.mimicTrembleRadius - 20, undefined, { variant: 'mimic' });
      const [mimic] = boars(run);
      advance(run, 100);
      expect(run.nearestEnemy(run.player, 400)).toBeNull();
      expect(mimic.trembleUntil).toBeGreaterThan(run.clock.now);
      expect(mimic.mood).toBe('calm');
      run.player.x = run.player.prevX = mimic.x - NEUTRAL_TUNING.mimicSpringRadius + 10;
      advance(run, STEP_MS * 2);
      expect(mimic.mood).toBe('angry');
    });

    it('hops after the hero and bites', () => {
      const run = session(1, 180, undefined, { variant: 'mimic' });
      hurtable(run);
      const [mimic] = boars(run);
      const bites: Array<{ hit: boolean }> = [];
      run.events.on('neutral-bite', (event) => bites.push(event));
      run.damageEnemy(mimic, 1, 'staff');
      const startHealth = run.player.health;
      advance(run, 4000);
      expect(bites.some((bite) => bite.hit)).toBe(true);
      expect(run.player.health).toBeLessThan(startHealth);
    });

    it('beaten, it leaves a real chest', () => {
      const run = session(1, 500, undefined, { variant: 'mimic' });
      run.damageEnemy(boars(run)[0], 1_000_000, 'staff');
      let chests = 0;
      run.pickups.forEachActive((pickup) => { if (pickup.kind === 'chest') chests += 1; });
      expect(chests).toBe(1);
    });
  });
});
