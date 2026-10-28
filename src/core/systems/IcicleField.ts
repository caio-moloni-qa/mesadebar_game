import { ICE_TROLL } from '../../config/balance';
import { Vec2 } from '../math';

/** One icicle on its way down: marked on the ground at `markedAt`, it hits (x, y) at `landsAt` (sim ms). */
export interface Icicle { x: number; y: number; markedAt: number; landsAt: number; }

/** Shards left where an icicle hit, for the renderer (they're gone after SHATTER_MS). */
export interface IcicleShatter { x: number; y: number; at: number; }
export const SHATTER_MS = 450;

/** The Troll de Gelo's slam: every icicle is marked on the ground first (ICE_TROLL.warnMs of warning), then lands
 *  and hurts whoever stands inside its ICE_TROLL.icicleRadius. Kept in landing order (they're added in time order with
 *  the same warning), so landing is trimming the front. */
export class IcicleField {
  readonly icicles: Icicle[] = [];
  readonly shatters: IcicleShatter[] = [];

  mark(x: number, y: number, now: number): void {
    this.icicles.push({ x, y, markedAt: now, landsAt: now + ICE_TROLL.warnMs });
  }

  /** Lands the due icicles; returns them, each saying whether it hit `hero` (its body radius counts). */
  update(now: number, hero: Vec2 & { radius: number }): Array<Icicle & { hit: boolean }> {
    let gone = 0;
    while (gone < this.shatters.length && now - this.shatters[gone].at >= SHATTER_MS) gone += 1;
    if (gone > 0) this.shatters.splice(0, gone);
    const landed: Array<Icicle & { hit: boolean }> = [];
    const reach = ICE_TROLL.icicleRadius + hero.radius;
    while (this.icicles.length > 0 && this.icicles[0].landsAt <= now) {
      const icicle = this.icicles.shift()!;
      this.shatters.push({ x: icicle.x, y: icicle.y, at: icicle.landsAt });
      landed.push({ ...icicle, hit: (icicle.x - hero.x) ** 2 + (icicle.y - hero.y) ** 2 <= reach * reach });
    }
    return landed;
  }
}
