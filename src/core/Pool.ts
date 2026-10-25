/** Fixed-capacity object pool — the engine-agnostic replacement for Arcade Group's getFirstDead/isFull pattern
 *  (see EnemySpawnSystem.spawnEnemyVariant). Objects are created lazily up to `capacity` and recycled afterwards. */
export class Pool<T> {
  private readonly free: T[] = [];
  private readonly inUse = new Set<T>();

  /** Mutable so the sandbox can change the spawn limit mid-run (lowering it never evicts active objects). */
  constructor(private readonly create: () => T, public capacity: number) {}

  /** A recycled or freshly created object, or null when every slot is already in use. */
  acquire(): T | null {
    // The cap counts objects in use, so lowering it also limits recycled ones.
    if (this.inUse.size >= this.capacity) return null;
    const item = this.free.pop() ?? this.create();
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
