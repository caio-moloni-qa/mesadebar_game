import { describe, expect, it } from 'vitest';
import { SimClock } from './SimClock';

describe('SimClock', () => {
  it('fires a delayed call once, at its own due time', () => {
    const clock = new SimClock();
    const firedAt: number[] = [];
    clock.delayedCall(1500, () => firedAt.push(clock.now));
    clock.advance(1000);
    expect(firedAt).toEqual([]);
    clock.advance(1000);
    expect(firedAt).toEqual([1500]);
    expect(clock.now).toBe(2000);
    clock.advance(5000);
    expect(firedAt).toEqual([1500]);
  });

  it('does not move time or fire timers while paused', () => {
    const clock = new SimClock();
    let fired = false;
    clock.delayedCall(100, () => { fired = true; });
    clock.paused = true;
    clock.advance(10_000);
    expect(clock.now).toBe(0);
    expect(fired).toBe(false);
    clock.paused = false;
    clock.advance(100);
    expect(fired).toBe(true);
  });

  it('fires repeating timers every interval, even several times in one big step', () => {
    const clock = new SimClock();
    const firedAt: number[] = [];
    clock.every(500, () => firedAt.push(clock.now));
    clock.advance(1600);
    expect(firedAt).toEqual([500, 1000, 1500]);
  });

  it('fires timers in due order across one step', () => {
    const clock = new SimClock();
    const order: string[] = [];
    clock.delayedCall(300, () => order.push('late'));
    clock.delayedCall(100, () => order.push('early'));
    clock.advance(1000);
    expect(order).toEqual(['early', 'late']);
  });

  it('lets a timer schedule another timer that falls inside the same step', () => {
    const clock = new SimClock();
    const firedAt: number[] = [];
    clock.delayedCall(100, () => clock.delayedCall(100, () => firedAt.push(clock.now)));
    clock.advance(1000);
    expect(firedAt).toEqual([200]);
  });

  it('cancels timers via their handle and on reset', () => {
    const clock = new SimClock();
    let count = 0;
    const handle = clock.every(100, () => { count += 1; });
    clock.advance(250);
    handle.cancel();
    expect(handle.active).toBe(false);
    clock.advance(1000);
    expect(count).toBe(2);
    clock.delayedCall(50, () => { count += 100; });
    clock.reset();
    clock.advance(1000);
    expect(count).toBe(2);
    expect(clock.now).toBe(1000);
  });
});
