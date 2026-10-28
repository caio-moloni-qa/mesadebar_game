import { BLIZZARD_TUNING } from '../../config/balance';
import { Vec2 } from '../math';

/** A blizzard torch: `fuelMs` of warmth left (it only burns while warming the hero); out at 0. */
export interface Torch { x: number; y: number; fuelMs: number; }

export type BlizzardPhase = 'calm' | 'storm';

/** Where the run clock sits in the fronts: the phase and how far into it. */
export function blizzardPhaseAt(elapsedMs: number): { phase: BlizzardPhase; intoMs: number } {
  const { firstFrontMs, stormMs, calmMs } = BLIZZARD_TUNING;
  if (elapsedMs < firstFrontMs) return { phase: 'calm', intoMs: elapsedMs };
  const cycle = (elapsedMs - firstFrontMs) % (stormMs + calmMs);
  return cycle < stormMs ? { phase: 'storm', intoMs: cycle } : { phase: 'calm', intoMs: cycle - stormMs };
}

/** Which storm front the run clock is in (0 = the first), or -1 before the first one blows. */
export function blizzardFrontAt(elapsedMs: number): number {
  const { firstFrontMs, stormMs, calmMs } = BLIZZARD_TUNING;
  return elapsedMs < firstFrontMs ? -1 : Math.floor((elapsedMs - firstFrontMs) / (stormMs + calmMs));
}

/** Nevasca (Campo Nevado): the cold meter, the storm fronts and the torches. The fronts follow the run clock (so the
 *  sandbox's time skip moves them too); the cold and the torches' fuel are state. Without torches there's no
 *  blizzard: `active` is false and nothing ever changes. */
export class BlizzardSystem {
  readonly torches: Torch[];
  /** 0..100. */
  cold = 0;
  /** 0..1: how hard the storm blows right now (ramps in and out) — the fog, the snow, the wind. */
  intensity = 0;
  phase: BlizzardPhase = 'calm';

  constructor(points: readonly Vec2[] | undefined) {
    this.torches = (points ?? []).map(({ x, y }) => ({ x, y, fuelMs: BLIZZARD_TUNING.torchFuelMs }));
  }

  get active(): boolean {
    return this.torches.length > 0;
  }

  /** A torch's reach now: it shrinks as the fuel burns down, and is 0 once out. */
  torchRadius(torch: Torch): number {
    if (torch.fuelMs <= 0) return 0;
    const { torchRadius, torchMinRadius, torchFuelMs } = BLIZZARD_TUNING;
    return torchRadius * (torchMinRadius + (1 - torchMinRadius) * (torch.fuelMs / torchFuelMs));
  }

  /** The lit torch warming `hero`, if any (the one with the most fuel when reaches overlap). */
  warmingTorch(hero: Vec2): Torch | null {
    let best: Torch | null = null;
    for (const torch of this.torches) {
      const radius = this.torchRadius(torch);
      if (radius <= 0 || (torch.x - hero.x) ** 2 + (torch.y - hero.y) ** 2 > radius * radius) continue;
      if (!best || torch.fuelMs > best.fuelMs) best = torch;
    }
    return best;
  }

  /** Congelamento's stacks feed the same meter. */
  addFrost(stacks: number): void {
    if (this.active) this.cold = Math.min(100, this.cold + stacks * BLIZZARD_TUNING.coldPerFrostStack);
  }

  /** Advances the fronts, the cold and the torches. `frozen` holds the meter (the hero is already an ice block).
   *  Returns true when the cold just filled: the caller freezes the hero; the meter has already dropped. */
  update(deltaMs: number, elapsedMs: number, hero: Vec2, frozen: boolean): boolean {
    if (!this.active) return false;
    const { phase, intoMs } = blizzardPhaseAt(elapsedMs);
    const { stormMs, rampMs, risePerSec, warmPerSec, calmDecayPerSec, relightFuel, torchFuelMs, afterFreeze } = BLIZZARD_TUNING;
    // Into the lull: the torches that burnt out catch again, a little.
    if (this.phase === 'storm' && phase === 'calm') {
      for (const torch of this.torches) torch.fuelMs = Math.max(torch.fuelMs, torchFuelMs * relightFuel);
    }
    this.phase = phase;
    this.intensity = phase === 'storm' ? Math.min(1, intoMs / rampMs, (stormMs - intoMs) / rampMs) : 0;
    if (frozen) return false;
    // Frost stacks can fill it between steps; the warmth mustn't melt that away unnoticed.
    if (this.cold >= 100) {
      this.cold = afterFreeze;
      return true;
    }
    const seconds = deltaMs / 1000;
    const torch = phase === 'storm' ? this.warmingTorch(hero) : null;
    if (torch) {
      torch.fuelMs = Math.max(0, torch.fuelMs - deltaMs);
      this.cold -= warmPerSec * seconds;
    } else if (phase === 'storm') {
      this.cold += risePerSec * this.intensity * seconds;
    } else {
      this.cold -= calmDecayPerSec * seconds;
    }
    this.cold = Math.max(0, this.cold);
    if (this.cold < 100) return false;
    this.cold = afterFreeze;
    return true;
  }
}
