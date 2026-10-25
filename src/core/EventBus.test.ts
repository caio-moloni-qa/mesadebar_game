import { describe, expect, it } from 'vitest';
import { EventBus } from './EventBus';

interface TestEvents extends Record<string, unknown> {
  'enemy-defeated': { x: number; y: number };
  'level-up': number;
}

describe('EventBus', () => {
  it('delivers typed payloads to every listener of that event only', () => {
    const bus = new EventBus<TestEvents>();
    const defeats: Array<{ x: number; y: number }> = [];
    const levels: number[] = [];
    bus.on('enemy-defeated', (payload) => defeats.push(payload));
    bus.on('level-up', (level) => levels.push(level));
    bus.emit('enemy-defeated', { x: 1, y: 2 });
    bus.emit('level-up', 3);
    expect(defeats).toEqual([{ x: 1, y: 2 }]);
    expect(levels).toEqual([3]);
  });

  it('unsubscribes via the returned function, even mid-emit', () => {
    const bus = new EventBus<TestEvents>();
    const calls: string[] = [];
    const offFirst = bus.on('level-up', () => { calls.push('first'); offFirst(); });
    bus.on('level-up', () => calls.push('second'));
    bus.emit('level-up', 1);
    bus.emit('level-up', 2);
    expect(calls).toEqual(['first', 'second', 'second']);
  });
});
