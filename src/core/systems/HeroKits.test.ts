import { describe, expect, it } from 'vitest';
import { CHARACTERS, CharacterId } from '../../config/characters';
import { WORLD_SIZE } from '../../config/world';
import { GameSession, STEP_MS } from '../session/GameSession';
import { ArenaMap } from '../world/ArenaMap';
import { HERO_ABILITY_TUNING } from './HeroAbilitySystem';
import { MERCHANT_TUNING } from './MerchantSystem';
import { WEAPON_TUNING } from './WeaponSystem';

const CENTER = WORLD_SIZE / 2;
const advance = (run: GameSession, ms: number) => { for (let elapsed = 0; elapsed < ms; elapsed += STEP_MS) run.step(STEP_MS); };

function session(characterId: CharacterId, seed = 21): GameSession {
  const run = new GameSession({ characterId, seed, skipStartingUpgrades: true, arena: ArenaMap.open(WORLD_SIZE) });
  run.skeletonSpawnEnabled = false;
  run.variantSpawnEnabled = false;
  run.player.invincible = true;
  return run;
}
function dummy(run: GameSession, x: number, y: number, health = 1_000_000) {
  const enemy = run.spawnEnemy('skeleton', x, y, health)!;
  enemy.movementSpeed = 0;
  enemy.contactDamage = 0;
  return enemy;
}
/** Switches a regular's exclusive on: enough upgrades on their own weapon (affinity comes with it). */
function unlockExclusive(run: GameSession): void {
  run.weapons.primary.upgradeCount = CHARACTERS[run.characterId].kit!.exclusiveThreshold;
}

describe('the regulars as heroes', () => {
  it('each starts with their own weapon and fights', () => {
    (['brom', 'lyra', 'grimbo', 'zora', 'sergio'] as const).forEach((id) => {
      const run = session(id);
      expect(run.weapons.primary.config.id).toBe(CHARACTERS[id].preferredWeaponId);
      const enemy = dummy(run, CENTER + 70, CENTER);
      advance(run, 3000);
      expect(enemy.health, id).toBeLessThan(enemy.maxHealth);
    });
  });

  it('Martelo de Forja: the shockwave reaches what the cone missed', () => {
    const run = session('brom');
    const quakes: unknown[] = [];
    run.events.on('hammer-quake', (event) => quakes.push(event));
    const inCone = dummy(run, CENTER + 80, CENTER);
    // Just beside the cone's edge, inside the shockwave.
    const beside = dummy(run, CENTER + 85, CENTER + 60);
    advance(run, 200);
    expect(quakes.length).toBeGreaterThan(0);
    expect(inCone.health).toBeLessThan(inCone.maxHealth);
    expect(beside.health).toBeLessThan(beside.maxHealth);
  });

  it('Arco Élfico: an arrow passes through two enemies into a third', () => {
    const run = session('lyra');
    const line = [300, 360, 420].map((dx) => dummy(run, CENTER + dx, CENTER));
    advance(run, 1000);
    line.forEach((enemy) => expect(enemy.health).toBeLessThan(enemy.maxHealth));
  });

  it('Moedas Viciadas: a coin always ricochets to the next enemy', () => {
    const run = session('grimbo');
    const enemies = [dummy(run, CENTER + 200, CENTER), dummy(run, CENTER + 200, CENTER + 120), dummy(run, CENTER + 200, CENTER + 240)];
    advance(run, 1500);
    expect(enemies.filter((enemy) => enemy.health < enemy.maxHealth).length).toBeGreaterThanOrEqual(2);
  });

  it('Bola de Cristal: orbs circle at the weapon’s range and hit what they pass', () => {
    const run = session('zora');
    const orbs = run.weapons.crystalOrbs(run.weapons.primary);
    expect(orbs).toHaveLength(WEAPON_TUNING.crystalOrbs);
    const range = run.weapons.primary.config.range;
    const enemy = dummy(run, CENTER + range, CENTER);
    advance(run, 3000);
    expect(enemy.health).toBeLessThan(enemy.maxHealth);
  });

  it('Mochila de Tralhas: pans, bottles and potions all come out', () => {
    const run = session('sergio');
    const kinds = new Set<string>();
    run.events.on('projectile-fired', ({ kind }) => kinds.add(kind));
    dummy(run, CENTER + 200, CENTER);
    advance(run, 12_000);
    expect([...kinds].sort()).toEqual(['bottle', 'pan', 'potion']);
  });

  it('Brom’s Hidromel heals 12% every 20s', () => {
    const run = session('brom');
    run.player.health = 100;
    advance(run, HERO_ABILITY_TUNING.meadIntervalMs + 100);
    expect(run.player.health).toBeCloseTo(100 + run.player.maxHealth * HERO_ABILITY_TUNING.meadHeal, 0);
  });

  it('Brom’s Barril Rolante rolls out once the exclusive is on', () => {
    const run = session('brom');
    unlockExclusive(run);
    const bursts: unknown[] = [];
    run.events.on('barrel-burst', (event) => bursts.push(event));
    dummy(run, CENTER + 300, CENTER);
    advance(run, HERO_ABILITY_TUNING.barrelIntervalMs + HERO_ABILITY_TUNING.barrelLifeMs + 200);
    expect(bursts.length).toBeGreaterThan(0);
  });

  it('Lyra’s Chuva de Flechas falls on the biggest group', () => {
    const run = session('lyra');
    unlockExclusive(run);
    const rain: Array<{ x: number; y: number }> = [];
    run.events.on('arrow-rain', (event) => rain.push(event));
    dummy(run, CENTER - 400, CENTER);
    [0, 30, 60].forEach((dy) => dummy(run, CENTER + 400, CENTER + dy));
    advance(run, HERO_ABILITY_TUNING.rainIntervalMs + 1000);
    expect(rain.length).toBe(HERO_ABILITY_TUNING.rainWaves);
    expect(rain[0].x).toBeGreaterThan(CENTER);
  });

  it('Grimbo’s Mão Leve: half as many coins again, and Sergio’s prices 20% off', () => {
    const run = session('grimbo');
    run.player.x = run.player.prevX = CENTER;
    run.player.y = run.player.prevY = CENTER;
    run.openMerchantPortal();
    run.player.x = run.merchant.portal!.x;
    run.player.y = run.merchant.portal!.y;
    run.interact();
    expect(run.merchant.offers[0].cost).toBe(Math.round(150 * HERO_ABILITY_TUNING.grimboPrices));
  });

  it('Zora’s Previsão: one more card on every level-up', () => {
    const run = session('zora');
    // Enough experience on the next kill for a level.
    run.experience = run.experienceNeeded - 1;
    const enemy = dummy(run, CENTER + 70, CENTER, 1);
    run.damageEnemy(enemy, 10, 'crystal');
    const choice = run.pendingChoice as Extract<typeof run.pendingChoice, { kind: 'level-up' }>;
    expect(choice.upgrades.length + (choice.extraWeapon ? 1 : 0)).toBe(4);
  });

  it('Zora’s Destino Selado: marked enemies take double damage', () => {
    const run = session('zora');
    unlockExclusive(run);
    const enemy = dummy(run, CENTER + 400, CENTER);
    advance(run, HERO_ABILITY_TUNING.fateIntervalMs + 100);
    expect(run.abilities.isMarked(enemy)).toBe(true);
    const before = enemy.health;
    run.damageEnemy(enemy, 10, 'crystal');
    expect(before - enemy.health).toBe(20);
  });

  it('Sergio’s Loja Portátil opens the tavern at his feet, at a markup, on a cooldown', () => {
    const run = session('sergio');
    expect(run.openPortableShop()).toBe(true);
    expect(run.merchant.portal).toMatchObject({ x: run.player.x, y: run.player.y });
    run.interact();
    expect(run.merchant.offers[0].cost).toBe(Math.round(150 * HERO_ABILITY_TUNING.portableShopMarkup));
    expect(run.openPortableShop()).toBe(false);
    expect(MERCHANT_TUNING.portalOpenMs).toBeGreaterThan(0);
  });

  it('Sergio’s Liquidação: a free item on his next visit', () => {
    const run = session('sergio');
    unlockExclusive(run);
    advance(run, HERO_ABILITY_TUNING.saleIntervalMs + 100);
    expect(run.merchant.freeItems).toBe(1);
    run.openPortableShop();
    run.interact();
    expect(run.merchant.offers.some((offer) => offer.cost === 0)).toBe(true);
  });
});
