/** Simulation clock for a game session: owns `now` and every gameplay timer, so pausing the session pauses all of
 *  them at once (replaces the per-scene trackTimer/prunePausables bookkeeping that GameScene and BossSystem each
 *  duplicate today). Time only moves when `advance()` is called — there is no wall-clock reading in here. */

export interface TimerHandle { cancel(): void; readonly active: boolean; }

interface ScheduledTimer {
  dueAt: number;
  intervalMs: number | null;
  callback: () => void;
  active: boolean;
}

export class SimClock {
  private currentMs = 0;
  private timers: ScheduledTimer[] = [];
  paused = false;

  get now(): number {
    return this.currentMs;
  }

  /** Fires `callback` once, `delayMs` of unpaused simulation time from now. */
  delayedCall(delayMs: number, callback: () => void): TimerHandle {
    return this.schedule(delayMs, null, callback);
  }

  /** Fires `callback` every `intervalMs` of unpaused simulation time, first call one interval from now. */
  every(intervalMs: number, callback: () => void): TimerHandle {
    if (intervalMs <= 0) throw new Error(`SimClock.every: intervalMs must be > 0, got ${intervalMs}`);
    return this.schedule(intervalMs, intervalMs, callback);
  }

  /** Advances time by `deltaMs` (no-op while paused) and fires due timers in due-time order. A timer whose due time
   *  falls inside this step sees `now` equal to its own due time, not the end of the step. */
  advance(deltaMs: number): void {
    if (this.paused || deltaMs <= 0) return;
    const target = this.currentMs + deltaMs;
    for (;;) {
      const next = this.nextDueTimer(target);
      if (!next) break;
      this.currentMs = next.dueAt;
      if (next.intervalMs === null) next.active = false;
      else next.dueAt += next.intervalMs;
      next.callback();
    }
    this.currentMs = target;
    this.timers = this.timers.filter((timer) => timer.active);
  }

  /** Cancels every timer and rewinds to 0 — call when a session restarts. */
  reset(): void {
    this.timers.forEach((timer) => { timer.active = false; });
    this.timers = [];
    this.currentMs = 0;
    this.paused = false;
  }

  private schedule(delayMs: number, intervalMs: number | null, callback: () => void): TimerHandle {
    const timer: ScheduledTimer = { dueAt: this.currentMs + Math.max(0, delayMs), intervalMs, callback, active: true };
    this.timers.push(timer);
    return {
      cancel: () => { timer.active = false; },
      get active() { return timer.active; }
    };
  }

  private nextDueTimer(limit: number): ScheduledTimer | undefined {
    let next: ScheduledTimer | undefined;
    for (const timer of this.timers) {
      if (!timer.active || timer.dueAt > limit) continue;
      if (!next || timer.dueAt < next.dueAt) next = timer;
    }
    return next;
  }
}
