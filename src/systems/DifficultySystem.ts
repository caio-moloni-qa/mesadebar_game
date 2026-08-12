import { DIFFICULTY_STAGES } from '../config/balance';

export interface DifficultyStage { startMs: number; spawnInterval: number; count: number; healthMultiplier: number; }

export class DifficultySystem {
  private forcedStageIndex: number | null = null;
  /** Boss-wave cycle multiplier (see GameScene's continue-portal flow): cycle 1 = 1x (base curve unchanged),
   *  cycle 2 = 2x, cycle 3 = 3x, etc. — stacks on top of the normal time-based stage rather than replacing it. */
  private cycleMultiplier = 1;

  stageFor(elapsedMs: number): DifficultyStage {
    const base = this.forcedStageIndex !== null ? DIFFICULTY_STAGES[this.forcedStageIndex] : [...DIFFICULTY_STAGES].reverse().find((stage) => elapsedMs >= stage.startMs) ?? DIFFICULTY_STAGES[0];
    if (this.cycleMultiplier === 1) return base;
    return { ...base, healthMultiplier: base.healthMultiplier * this.cycleMultiplier, count: Math.round(base.count * this.cycleMultiplier) };
  }

  setForcedStage(index: number | null): void {
    this.forcedStageIndex = index;
  }

  setCycleMultiplier(multiplier: number): void {
    this.cycleMultiplier = multiplier;
  }

  resetCycle(): void {
    this.cycleMultiplier = 1;
  }
}
