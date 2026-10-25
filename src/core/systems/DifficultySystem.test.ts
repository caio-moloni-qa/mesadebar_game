import { describe, expect, it } from 'vitest';
import { DIFFICULTY_STAGES } from '../../config/balance';
import { DifficultySystem } from './DifficultySystem';

describe('DifficultySystem', () => {
  it('picks the latest stage whose start time has passed', () => {
    const difficulty = new DifficultySystem();
    expect(difficulty.stageFor(0)).toEqual(DIFFICULTY_STAGES[0]);
    expect(difficulty.stageFor(59_999)).toEqual(DIFFICULTY_STAGES[0]);
    expect(difficulty.stageFor(60_000)).toEqual(DIFFICULTY_STAGES[1]);
    expect(difficulty.stageFor(500_000)).toEqual(DIFFICULTY_STAGES[2]);
  });

  it('honours a forced stage (sandbox) until cleared', () => {
    const difficulty = new DifficultySystem();
    difficulty.setForcedStage(2);
    expect(difficulty.stageFor(0)).toEqual(DIFFICULTY_STAGES[2]);
    difficulty.setForcedStage(null);
    expect(difficulty.stageFor(0)).toEqual(DIFFICULTY_STAGES[0]);
  });

  it('scales health and rounds spawn count by the boss-cycle multiplier', () => {
    const difficulty = new DifficultySystem();
    difficulty.setCycleMultiplier(3);
    const stage = difficulty.stageFor(60_000);
    expect(stage.healthMultiplier).toBeCloseTo(DIFFICULTY_STAGES[1].healthMultiplier * 3);
    expect(stage.count).toBe(Math.round(DIFFICULTY_STAGES[1].count * 3));
    expect(stage.spawnInterval).toBe(DIFFICULTY_STAGES[1].spawnInterval);
    difficulty.resetCycle();
    expect(difficulty.stageFor(60_000)).toEqual(DIFFICULTY_STAGES[1]);
  });
});
