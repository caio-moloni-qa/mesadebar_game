import { DIFFICULTY_STAGES } from '../config/balance';

export class DifficultySystem {
  private forcedStageIndex: number | null = null;

  stageFor(elapsedMs: number) {
    if (this.forcedStageIndex !== null) return DIFFICULTY_STAGES[this.forcedStageIndex];
    return [...DIFFICULTY_STAGES].reverse().find((stage) => elapsedMs >= stage.startMs) ?? DIFFICULTY_STAGES[0];
  }

  setForcedStage(index: number | null): void {
    this.forcedStageIndex = index;
  }
}
