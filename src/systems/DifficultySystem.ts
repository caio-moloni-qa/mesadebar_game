import { DIFFICULTY_STAGES } from '../config/balance';

export class DifficultySystem {
  stageFor(elapsedMs: number) {
    return [...DIFFICULTY_STAGES].reverse().find((stage) => elapsedMs >= stage.startMs) ?? DIFFICULTY_STAGES[0];
  }
}
