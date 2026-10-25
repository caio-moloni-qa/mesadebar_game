/** Typed pub/sub for core → renderer/UI notifications (effects, floating text, future audio), so the simulation never
 *  needs a reference to whoever draws it. `Events` maps each event name to its payload type. */
export class EventBus<Events extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof Events, Set<(payload: never) => void>>();

  on<K extends keyof Events>(event: K, listener: (payload: Events[K]) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as (payload: never) => void);
    return () => this.off(event, listener);
  }

  off<K extends keyof Events>(event: K, listener: (payload: Events[K]) => void): void {
    this.listeners.get(event)?.delete(listener as (payload: never) => void);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    // Copy first so a listener unsubscribing itself mid-emit doesn't skip its neighbours.
    [...set].forEach((listener) => (listener as (payload: Events[K]) => void)(payload));
  }

  clear(): void {
    this.listeners.clear();
  }
}
