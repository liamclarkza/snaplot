/**
 * Typed internal pub/sub between the gesture layer and the engine: the
 * GestureManager turns pointer, wheel and key input into semantic actions.
 */

export interface EventMap {
  'action:cursor': { x: number; y: number; pointerType: string };
  'action:cursor-leave': undefined;
  'action:pan': { dx: number; dy: number; axis?: string };
  'action:zoom': { factor: number; anchorX: number; anchorY: number; axis: string };
  'action:box-start': { x: number; y: number };
  'action:box-update': { x: number; y: number };
  'action:box-end': { x1: number; y1: number; x2: number; y2: number };
  'action:reset-zoom': undefined;
  'action:tap': { x: number; y: number; pointerType: string };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private listeners = new Map<string, Set<Handler<any>>>();

  /** `around` runs each emit, so the owner can bracket one user action. */
  constructor(private readonly around?: (run: () => void) => void) {}

  on<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    if (this.around) this.around(() => this.deliver(event, set, payload));
    else this.deliver(event, set, payload);
  }

  private deliver<K extends keyof EventMap>(
    event: K,
    set: Set<Handler<any>>,
    payload: EventMap[K],
  ): void {
    // Snapshot before iterating: a handler may add or remove listeners during
    // delivery. Iterating the live Set would run a just-added handler inside
    // this same emit (a self-re-adding handler would loop forever).
    for (const handler of Array.from(set)) {
      try {
        handler(payload);
      } catch (err) {
        // One throwing handler must not abort delivery to the rest.
        console.error(`[snaplot] '${event}' handler threw:`, err);
      }
    }
  }

  destroy(): void {
    this.listeners.clear();
  }
}
