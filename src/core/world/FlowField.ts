import { Vec2 } from '../math';
import { ArenaMap } from './ArenaMap';

/** Grid cell size (game units). 32 = 1 m: fine enough for the temple doorways and forest gaps, coarse enough that a
 *  full rebuild over the 110 m arena stays around a millisecond. */
const CELL = 32;
/** A cell is passable when a body this big fits at its centre. Deliberately smaller than an enemy's radius (18):
 *  the gaps the generator leaves (≥ 36 + clearance) must register as open even when no cell centre sits in the
 *  middle of them; the real collision (ArenaMap.resolve) keeps bodies out of the obstacles themselves. */
const CLEARANCE = 12;
const DIAGONAL = Math.SQRT2;

/** Distance-to-target over the arena grid (Dijkstra, 8-way, no corner cutting), rebuilt a few times a second
 *  from the hero's position. Enemies follow it downhill, which routes the whole horde around walls, through
 *  doorways and between trees at the cost of one search per rebuild — not one path per enemy. */
export class FlowField {
  readonly columns: number;
  private readonly passable: Uint8Array;
  private readonly distance: Float32Array;
  private readonly heap: MinHeap;
  private targetCell = -1;

  constructor(private readonly map: ArenaMap) {
    this.columns = Math.ceil(map.size / CELL);
    const cells = this.columns * this.columns;
    this.passable = new Uint8Array(cells);
    this.distance = new Float32Array(cells).fill(Number.POSITIVE_INFINITY);
    this.heap = new MinHeap(cells);
    this.refreshPassable();
  }

  /** Re-reads which cells are open (the lake drains and refills mid-run); the next update() routes with it. */
  refreshPassable(): void {
    for (let index = 0; index < this.passable.length; index += 1) {
      const { x, y } = this.cellCenter(index);
      this.passable[index] = this.map.isWalkable(x, y, CLEARANCE) ? 1 : 0;
    }
    this.targetCell = -1;
  }

  cellOf(x: number, y: number): number {
    const cx = Math.min(this.columns - 1, Math.max(0, Math.floor(x / CELL)));
    const cy = Math.min(this.columns - 1, Math.max(0, Math.floor(y / CELL)));
    return cx + cy * this.columns;
  }

  cellCenter(index: number): Vec2 {
    return { x: ((index % this.columns) + 0.5) * CELL, y: (Math.floor(index / this.columns) + 0.5) * CELL };
  }

  isPassable(index: number): boolean {
    return this.passable[index] === 1;
  }

  distanceAt(index: number): number {
    return this.distance[index];
  }

  /** Rebuilds distances towards `target`. Skips the work when the target hasn't changed cell. */
  update(target: Vec2): void {
    let start = this.cellOf(target.x, target.y);
    if (!this.passable[start]) start = this.nearestPassable(start);
    if (start === this.targetCell) return;
    this.targetCell = start;
    this.distance.fill(Number.POSITIVE_INFINITY);
    this.distance[start] = 0;
    this.heap.clear();
    this.heap.push(start, 0);
    const columns = this.columns;
    while (this.heap.size > 0) {
      const current = this.heap.pop();
      const base = this.distance[current];
      const cx = current % columns;
      const cy = (current - cx) / columns;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= columns || ny >= columns) continue;
          const next = nx + ny * columns;
          if (!this.passable[next]) continue;
          // No cutting corners past an obstacle: a diagonal step needs both orthogonal neighbours open.
          if (dx !== 0 && dy !== 0 && (!this.passable[cx + dx + cy * columns] || !this.passable[cx + (cy + dy) * columns])) continue;
          const cost = base + (dx !== 0 && dy !== 0 ? DIAGONAL : 1);
          if (cost < this.distance[next]) {
            this.distance[next] = cost;
            this.heap.push(next, cost);
          }
        }
      }
    }
  }

  /** Unit direction to walk from (x, y) towards the target, or null when there's no route (sealed off) or the body
   *  is already in the target's neighbourhood (callers then head straight for the target). */
  direction(x: number, y: number): Vec2 | null {
    const columns = this.columns;
    let cell = this.cellOf(x, y);
    // A body pressed against a wall can sit in a cell whose centre is blocked; step from the best open neighbour.
    if (!this.passable[cell] || !Number.isFinite(this.distance[cell])) cell = this.nearestReached(cell);
    if (cell < 0 || this.distance[cell] <= DIAGONAL) return null;
    const cx = cell % columns;
    const cy = (cell - cx) / columns;
    let best = cell;
    let bestDistance = this.distance[cell];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= columns || ny >= columns) continue;
        const next = nx + ny * columns;
        if (!this.passable[next]) continue;
        if (dx !== 0 && dy !== 0 && (!this.passable[cx + dx + cy * columns] || !this.passable[cx + (cy + dy) * columns])) continue;
        if (this.distance[next] < bestDistance) {
          bestDistance = this.distance[next];
          best = next;
        }
      }
    }
    if (best === cell) return null;
    const target = this.cellCenter(best);
    const length = Math.hypot(target.x - x, target.y - y) || 1;
    return { x: (target.x - x) / length, y: (target.y - y) / length };
  }

  private nearestPassable(cell: number): number {
    return this.searchAround(cell, (index) => this.passable[index] === 1);
  }

  private nearestReached(cell: number): number {
    return this.searchAround(cell, (index) => this.passable[index] === 1 && Number.isFinite(this.distance[index]));
  }

  private searchAround(cell: number, accept: (index: number) => boolean): number {
    const columns = this.columns;
    const cx = cell % columns;
    const cy = (cell - cx) / columns;
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let ring = 1; ring <= 4; ring += 1) {
      for (let dy = -ring; dy <= ring; dy += 1) {
        for (let dx = -ring; dx <= ring; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= columns || ny >= columns) continue;
          const index = nx + ny * columns;
          if (!accept(index)) continue;
          const score = Math.hypot(dx, dy) + (Number.isFinite(this.distance[index]) ? this.distance[index] * 0.01 : 0);
          if (score < bestDistance) {
            bestDistance = score;
            best = index;
          }
        }
      }
      if (best >= 0) return best;
    }
    return best;
  }
}

/** Binary min-heap of cell indices keyed by distance (allows duplicate entries; stale ones are skipped cheaply). */
class MinHeap {
  private readonly items: Int32Array;
  private readonly keys: Float32Array;
  size = 0;

  constructor(capacity: number) {
    this.items = new Int32Array(capacity * 8);
    this.keys = new Float32Array(capacity * 8);
  }

  clear(): void {
    this.size = 0;
  }

  push(item: number, key: number): void {
    let index = this.size;
    this.size += 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.keys[parent] <= key) break;
      this.items[index] = this.items[parent];
      this.keys[index] = this.keys[parent];
      index = parent;
    }
    this.items[index] = item;
    this.keys[index] = key;
  }

  pop(): number {
    const top = this.items[0];
    this.size -= 1;
    const lastItem = this.items[this.size];
    const lastKey = this.keys[this.size];
    let index = 0;
    for (;;) {
      const left = index * 2 + 1;
      if (left >= this.size) break;
      const right = left + 1;
      const child = right < this.size && this.keys[right] < this.keys[left] ? right : left;
      if (this.keys[child] >= lastKey) break;
      this.items[index] = this.items[child];
      this.keys[index] = this.keys[child];
      index = child;
    }
    this.items[index] = lastItem;
    this.keys[index] = lastKey;
    return top;
  }
}
