import { Vec2 } from './math';

/** Uniform-grid broad phase for the gameplay plane: rebuilt every step (clear + insert), queried for nearest-enemy
 *  targeting and overlap candidates. Replaces the linear scans + Arcade overlap broad phase. Items are bucketed by
 *  their center only, so queryRadius pads its search by `maxItemRadius` to still catch big bodies (bosses). */
export class SpatialHash<T extends Vec2> {
  private readonly cells = new Map<number, T[]>();
  private maxItemRadius = 0;

  constructor(private readonly cellSize: number) {
    if (cellSize <= 0) throw new Error(`SpatialHash: cellSize must be > 0, got ${cellSize}`);
  }

  clear(): void {
    this.cells.clear();
    this.maxItemRadius = 0;
  }

  insert(item: T, radius = 0): void {
    const key = this.key(this.cell(item.x), this.cell(item.y));
    const bucket = this.cells.get(key);
    if (bucket) bucket.push(item);
    else this.cells.set(key, [item]);
    this.maxItemRadius = Math.max(this.maxItemRadius, radius);
  }

  /** Every item whose center lies within `radius + maxItemRadius` of `center` — a superset; callers do the exact test. */
  queryRadius(center: Vec2, radius: number, out: T[] = []): T[] {
    const reach = radius + this.maxItemRadius;
    const minX = this.cell(center.x - reach);
    const maxX = this.cell(center.x + reach);
    const minY = this.cell(center.y - reach);
    const maxY = this.cell(center.y + reach);
    for (let cx = minX; cx <= maxX; cx += 1) {
      for (let cy = minY; cy <= maxY; cy += 1) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (bucket) out.push(...bucket);
      }
    }
    return out;
  }

  /** Closest item to `center` by squared distance, skipping anything `accept` rejects (dead/inactive enemies),
   *  optionally limited to `maxRange`. Searches outward ring by ring so the common case touches few cells. */
  nearest(center: Vec2, maxRange = Number.POSITIVE_INFINITY, accept: (item: T) => boolean = () => true): T | null {
    if (this.cells.size === 0) return null;
    const originX = this.cell(center.x);
    const originY = this.cell(center.y);
    const maxRing = Number.isFinite(maxRange) ? Math.ceil(maxRange / this.cellSize) + 1 : this.maxOccupiedRing(originX, originY);
    const maxRangeSq = maxRange * maxRange;
    let best: T | null = null;
    let bestSq = maxRangeSq;
    for (let ring = 0; ring <= maxRing; ring += 1) {
      // Anything in ring r is at least (r - 1) * cellSize away; stop once that can't beat the current best.
      const ringMinDistance = Math.max(0, ring - 1) * this.cellSize;
      if (best && ringMinDistance * ringMinDistance > bestSq) break;
      this.forEachInRing(originX, originY, ring, (item) => {
        if (!accept(item)) return;
        const dx = item.x - center.x;
        const dy = item.y - center.y;
        const sq = dx * dx + dy * dy;
        if (sq <= bestSq && (best === null || sq < bestSq)) {
          best = item;
          bestSq = sq;
        }
      });
    }
    return best;
  }

  private forEachInRing(originX: number, originY: number, ring: number, visit: (item: T) => void): void {
    for (let cx = originX - ring; cx <= originX + ring; cx += 1) {
      for (let cy = originY - ring; cy <= originY + ring; cy += 1) {
        if (Math.max(Math.abs(cx - originX), Math.abs(cy - originY)) !== ring) continue;
        this.cells.get(this.key(cx, cy))?.forEach(visit);
      }
    }
  }

  private maxOccupiedRing(originX: number, originY: number): number {
    let ring = 0;
    this.cells.forEach((_bucket, key) => {
      const { cx, cy } = this.unkey(key);
      ring = Math.max(ring, Math.abs(cx - originX), Math.abs(cy - originY));
    });
    return ring;
  }

  private cell(value: number): number {
    return Math.floor(value / this.cellSize);
  }

  // Cells are packed into one number; the offset keeps negative coordinates (the merchant realm lives far outside
  // 0..WORLD_SIZE, and spawns can land slightly out of bounds) distinct.
  private static readonly OFFSET = 1 << 15;
  private static readonly SPAN = 1 << 16;

  private key(cx: number, cy: number): number {
    return (cx + SpatialHash.OFFSET) * SpatialHash.SPAN + (cy + SpatialHash.OFFSET);
  }

  private unkey(key: number): { cx: number; cy: number } {
    return { cx: Math.floor(key / SpatialHash.SPAN) - SpatialHash.OFFSET, cy: (key % SpatialHash.SPAN) - SpatialHash.OFFSET };
  }
}
