import { FROST_TRAIL } from '../../config/balance';
import { Vec2 } from '../math';

/** One frost patch on the ground, laid at `bornAt` (sim ms). */
export interface FrostPatch { x: number; y: number; bornAt: number; }

/** The Espírito da Geada's trail: every spirit lays a patch every FROST_TRAIL.dropEveryMs, each melts after
 *  lifetimeMs, and the hero standing on one is slowed. Patches are kept oldest first (they're laid in time order), so
 *  expiring is trimming the front; past maxPatches the oldest go first. */
export class FrostTrail {
  readonly patches: FrostPatch[] = [];
  private readonly lastDropAt = new WeakMap<object, number>();
  /** The hero's frost slow runs until this sim time (refreshed while on a patch, never stacked). */
  private slowUntil = -Infinity;

  /** Lays a patch under `spirit` if its last one is old enough. */
  drop(spirit: Vec2, now: number): void {
    const last = this.lastDropAt.get(spirit);
    if (last !== undefined && now - last < FROST_TRAIL.dropEveryMs) return;
    this.lastDropAt.set(spirit, now);
    if (this.patches.length >= FROST_TRAIL.maxPatches) this.patches.shift();
    this.patches.push({ x: spirit.x, y: spirit.y, bornAt: now });
  }

  /** Melts the old patches. When `hero` (with its body radius) stands on frost and its slow needs (re)applying now,
   *  returns 'entered' (just stepped on) or 'stayed' — the caller applies FROST_TRAIL.slowPercent for slowMs. */
  update(now: number, hero: Vec2 & { radius: number }): 'entered' | 'stayed' | null {
    let melted = 0;
    while (melted < this.patches.length && now - this.patches[melted].bornAt >= FROST_TRAIL.lifetimeMs) melted += 1;
    if (melted > 0) this.patches.splice(0, melted);
    if (now < this.slowUntil) return null;
    const reach = FROST_TRAIL.radius + hero.radius;
    if (!this.patches.some((patch) => (patch.x - hero.x) ** 2 + (patch.y - hero.y) ** 2 <= reach * reach)) return null;
    // Back-to-back refreshes keep it one slow; a gap means the hero stepped off and back on.
    const entered = now - this.slowUntil > FROST_TRAIL.dropEveryMs;
    this.slowUntil = now + FROST_TRAIL.slowMs;
    return entered ? 'entered' : 'stayed';
  }

  clear(): void {
    this.patches.length = 0;
    this.slowUntil = -Infinity;
  }
}
