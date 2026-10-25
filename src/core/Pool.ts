/** Fixed-capacity object pool — the engine-agnostic replacement for Arcade Group's getFirstDead/isFull pattern
 *  (see EnemySpawnSystem.spawnEnemyVariant). Objects are created lazily up to `capacity` and recycled afterwards. */
export class Pool<T> {
  private readonly free: T[] = [];
  private readonly inUse = new Set<T>();

  constructor(private readonly create: () => T, readonly capacity: number) {}

  /** A recycled or freshly created object, or null when every slot is already in use. */
  acquire(): T | null {
    const item = this.free.pop() ?? (this.size < this.capacity ? this.create() : null);
    if (item !== null) this.inUse.add(item);
    return item;
  }

  release(item: T): void {
    if (!this.inUse.delete(item)) return;
    this.free.push(item);
  }

  forEachActive(callback: (item: T) => void): void {
    this.inUse.forEach(callback);
  }

  get activeCount(): number {
    return this.inUse.size;
  }

  /** Objects created so far (active + free). */
  get size(): number {
    return this.inUse.size + this.free.length;
  }

  get isFull(): boolean {
    return this.free.length === 0 && this.size >= this.capacity;
  }
}
