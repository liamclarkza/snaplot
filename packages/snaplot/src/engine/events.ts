/**
 * The engine's outward events (`ChartEventMap`): what it tells its owner, the public layer, which
 * turns them into public notifications (public/state.ts). One bad handler never stops the others
 * or the render loop.
 */
import type { ChartEventMap } from './spec';

export class EngineEvents {
  // Handlers have per-event signatures (see ChartEventMap); the storage is a
  // contravariant-friendly callable so every event's handler shape assigns in
  // without a cast (Function is banned by lint).
  private listeners = new Map<string, Set<(...args: never[]) => unknown>>();

  on<K extends keyof ChartEventMap>(event: K, handler: ChartEventMap[K]): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  emit(event: string, ...args: any[]): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        // The per-event handler signature lives in ChartEventMap and is
        // enforced at `.on()` registration time; the dispatch side is
        // variadic by design.
        (handler as (...a: unknown[]) => unknown)(...args);
      } catch (err) {
        // One bad handler must not stop the render loop or other subscribers.
        console.error(`[snaplot] '${event}' handler threw:`, err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
