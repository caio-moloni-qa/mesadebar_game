import { describe, expect, it } from 'vitest';
import { WORLD_SIZE } from '../../config/world';
import { GameSession } from '../session/GameSession';
import { ArenaMap } from '../world/ArenaMap';
import { CONSUMABLES, buyConsumable, emptySave, metaBonuses, parseSave, runBonuses, serializeSave } from './Progress';

describe("Sergio's consumables", () => {
  it('go into the pack once each, for Fichas', () => {
    let save = { ...emptySave(), fichas: 200 };
    save = buyConsumable(save, 'tomo')!;
    expect(save.pack).toEqual(['tomo']);
    expect(save.fichas).toBe(200 - CONSUMABLES.find((item) => item.id === 'tomo')!.price);
    expect(buyConsumable(save, 'tomo')).toBeNull();
    expect(buyConsumable({ ...save, fichas: 10 }, 'fenix')).toBeNull();
  });

  it('add to the permanent bonuses for the next run only', () => {
    const save = { ...emptySave(), upgrades: { vitalidade: 2 }, pack: ['elixir', 'fenix', 'tomo'] as const };
    const bonuses = runBonuses({ ...save, pack: [...save.pack] });
    expect(bonuses.maxHealth).toBe(metaBonuses(save as never).maxHealth + 40);
    expect(bonuses.revives).toBe(1);
    expect(bonuses.experience).toBe(0.25);
    expect(runBonuses(emptySave())).toEqual(metaBonuses(emptySave()));
  });

  it('survive a save round trip, unknown or repeated ones dropped', () => {
    const save = { ...emptySave(), pack: ['saco' as const] };
    expect(parseSave(serializeSave(save))?.pack).toEqual(['saco']);
    const raw = JSON.parse(serializeSave(save));
    raw.pack = ['saco', 'saco', 'ouro'];
    expect(parseSave(JSON.stringify(raw))?.pack).toEqual(['saco']);
  });

  it('the Tomo do Sábio: more experience per kill', () => {
    const make = (experience: number) => {
      const run = new GameSession({ characterId: 'mage', seed: 2, skipStartingUpgrades: true, arena: ArenaMap.open(WORLD_SIZE), meta: { ...metaBonuses(emptySave()), experience } });
      run.skeletonSpawnEnabled = run.variantSpawnEnabled = false;
      const enemy = run.spawnEnemy('skeleton', WORLD_SIZE / 2 + 400, WORLD_SIZE / 2, 1)!;
      run.damageEnemy(enemy, 10, 'staff');
      return run.experience;
    };
    expect(make(0.25)).toBeCloseTo(make(0) * 1.25);
  });
});
