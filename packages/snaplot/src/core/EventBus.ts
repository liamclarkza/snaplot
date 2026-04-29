import type { ChartInstance, HighlightSyncPayload, ScaleRange } from '../types';

/**
 * Typed internal pub/sub for decoupling chart modules.
 * Also serves as foundation for cross-chart synchronisation.
 */

export interface EventMap {
  // Legacy pointer events (kept for backward compat / plugins)
  'pointer:move': { x: number; y: number; dataX: number | null };
  'pointer:down': { x: number; y: number };
  'pointer:up': { x: number; y: number };
  'pointer:leave': undefined;
  'viewport:change': { scaleKey: string; min: number; max: number };
  'data:update': undefined;
  'resize': { width: number; height: number };
  'cursor:sync': { dataX: number | null };

  // Semantic action events (from GestureManager)
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
    if (set) {
      for (const handler of set) {
        handler(payload);
      }
    }
  }

  off<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): void {
    this.listeners.get(event)?.delete(handler);
  }

  destroy(): void {
    this.listeners.clear();
  }
}

// ============================================================
// Cross-chart synchronisation via shared data-coordinate space
// ============================================================

/**
 * SyncGroup, global registry for cross-chart cursor + zoom sync.
 * Charts with matching keys broadcast cursor positions in data coordinates.
 * Per spec §5.3: sync happens in data space, not pixel space.
 */
export class SyncGroup {
  private static groups = new Map<string, Set<ChartInstance>>();

  static join(key: string, chart: ChartInstance): void {
    let group = this.groups.get(key);
    if (!group) {
      group = new Set();
      this.groups.set(key, group);
    }
    group.add(chart);
  }

  static leave(key: string, chart: ChartInstance): void {
    const group = this.groups.get(key);
    if (group) {
      group.delete(chart);
      if (group.size === 0) this.groups.delete(key);
    }
  }

  /** Publish cursor position from source chart to all peers */
  static publishCursor(key: string, source: ChartInstance, dataX: number | null): void {
    const group = this.groups.get(key);
    if (!group) return;
    for (const peer of group) {
      if (peer !== source) {
        peer.setCursorDataX(dataX, 'sync');
      }
    }
  }

  /** Publish a highlight change to all peers. */
  static publishHighlight(
    key: string,
    source: ChartInstance | null,
    payload: HighlightSyncPayload,
  ): void {
    const group = this.groups.get(key);
    if (!group) return;
    for (const peer of group) {
      if (peer !== source) {
        (peer as unknown as { receiveHighlightSync(payload: HighlightSyncPayload): void })
          .receiveHighlightSync(payload);
      }
    }
  }

  /** Publish scale change from source to all peers */
  static publishScale(
    key: string,
    source: ChartInstance,
    scaleKey: string,
    range: ScaleRange,
  ): void {
    const group = this.groups.get(key);
    if (!group) return;
    for (const peer of group) {
      if (peer !== source) {
        peer.setAxis(scaleKey, range);
      }
    }
  }
}
