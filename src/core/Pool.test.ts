import { describe, expect, it } from 'vitest';
import { Pool } from './Pool';

describe('Pool', () => {
  it('creates lazily up to capacity, then refuses', () => {
    let created = 0;
    const pool = new Pool(() => ({ id: created++ }), 2);
    expect(pool.acquire()).not.toBeNull();
    expect(pool.acquire()).not.toBeNull();
    expect(pool.isFull).toBe(true);
    expect(pool.acquire()).toBeNull();
    expect(created).toBe(2);
  });

  it('recycles released objects instead of creating new ones', () => {
    let created = 0;
    const pool = new Pool(() => ({ id: created++ }), 2);
    const first = pool.acquire()!;
    pool.release(first);
    expect(pool.acquire()).toBe(first);
    expect(created).toBe(1);
    expect(pool.activeCount).toBe(1);
  });

  it('ignores releasing an object twice', () => {
    const pool = new Pool(() => ({}), 1);
    const item = pool.acquire()!;
    pool.release(item);
    pool.release(item);
    expect(pool.size).toBe(1);
    expect(pool.acquire()).toBe(item);
    expect(pool.acquire()).toBeNull();
  });
});
