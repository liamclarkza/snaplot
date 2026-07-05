import { createSignal, type Accessor } from 'solid-js';
import { SyncGroup } from '../core/EventBus';
import type { ChartConfig, ChartInstance, HighlightSyncKey } from '../types';

let groupCounter = 0;

/**
 * Bindings spread into each chart in the group. Always sets matching
 * `cursor.syncKey` and `highlight.syncKey`; `zoom.syncKey` is only included
 * when zoom sync is opted into (`bind({ zoom: true })`), so grouping does not
 * silently link every chart's zoom.
 */
export interface ChartGroupBindings {
  cursor: { syncKey: string };
  highlight: { syncKey: string };
  zoom?: { syncKey: string };
}

/** Options controlling which channels a group binding links. */
export interface ChartGroupBindOptions {
  /** Also sync zoom/pan across the group. Defaults to `false`. */
  zoom?: boolean;
}

/**
 * A handle to a coordinated set of charts that share cursor + highlight
 * state. Spread `group.bind()` into each chart's config, that is the
 * entire wiring step.
 *
 * ```tsx
 * const group = createChartGroup();
 *
 * <Chart config={{ ...group.bind(), series, axes }} data={a} />
 * <Chart config={{ ...group.bind(), series, axes }} data={b} />
 *
 * <button onMouseEnter={() => group.highlight(2)}>Run #2</button>
 * ```
 *
 * `group.highlight()` and `group.cursor()` push state to every chart
 * via the existing SyncGroup registry. Reads (`group.highlightedSeries`)
 * reflect the last broadcast originating from the group itself, * peer-originated changes still flow through each chart's own
 * `'highlight:change'` event (use `createHighlight` to track those).
 */
export interface ChartGroup {
  /**
   * Low-level: returns `{ cursor: { syncKey }, highlight: { syncKey } }`
   * (and `zoom: { syncKey }` only with `bind({ zoom: true })`). Spreading
   * this into your config is fine when you don't have your own `cursor` /
   * `highlight` config, otherwise a naïve spread will shadow your settings
   * (including `cursor.show` and `indicators`). Prefer `group.apply(config)`
   * for the safe merge.
   */
  bind(options?: ChartGroupBindOptions): ChartGroupBindings;

  /**
   * Merge the group's sync keys into an existing config without clobbering
   * the caller's own `cursor` / `highlight` / `zoom` fields (including a
   * `syncKey` the caller set explicitly). Zoom sync is opt-in via
   * `apply(config, { zoom: true })`. Use this in place of
   * `{ ...config, ...group.bind() }`.
   */
  apply<TMeta>(config: ChartConfig<TMeta>, options?: ChartGroupBindOptions): ChartConfig<TMeta>;

  /** Push a highlight to all charts in the group (or `null` to clear). */
  highlight(seriesIndex: number | null): void;

  /** Push a stable-key highlight to all charts in the group. */
  highlightKey(key: HighlightSyncKey | null): void;

  /** Push a cursor X (data-space) to all charts in the group (or `null`). */
  cursor(dataX: number | null): void;

  /** Reactively track the most recent highlight broadcast from this handle. */
  highlightedSeries: Accessor<number | null>;

  /** Reactively track the most recent stable-key highlight broadcast. */
  highlightedKey: Accessor<HighlightSyncKey | null>;

  /** Reactively track the most recent cursor broadcast from this handle. */
  cursorDataX: Accessor<number | null>;

  /** The opaque sync key used by the group. Useful for debugging. */
  readonly syncKey: string;
}

/**
 * Creates a new chart group. Each call mints a fresh sync key.
 */
export function createChartGroup(): ChartGroup {
  const syncKey = `__snaplot_group_${++groupCounter}`;
  const [highlightedSeries, setHighlight] = createSignal<number | null>(null);
  const [highlightedKey, setHighlightKey] = createSignal<HighlightSyncKey | null>(null);
  const [cursorDataX, setCursor] = createSignal<number | null>(null);

  return {
    bind(options) {
      const bindings: ChartGroupBindings = {
        cursor: { syncKey },
        highlight: { syncKey },
      };
      if (options?.zoom) bindings.zoom = { syncKey };
      return bindings;
    },

    apply<TMeta>(config: ChartConfig<TMeta>, options?: ChartGroupBindOptions): ChartConfig<TMeta> {
      // `syncKey` first, caller's fields last, so an explicitly-set syncKey on
      // the caller's config wins instead of being clobbered.
      const merged: ChartConfig<TMeta> = {
        ...config,
        cursor: { syncKey, ...(config.cursor ?? {}) },
        highlight: { syncKey, ...(config.highlight ?? {}) },
      };
      if (options?.zoom) {
        merged.zoom = { syncKey, ...(config.zoom ?? {}) };
      }
      return merged;
    },

    highlight(seriesIndex) {
      setHighlight(seriesIndex);
      setHighlightKey(null);
      // A null source broadcasts to every member, which is what an external
      // coordinator wants; publishHighlight's source is already nullable.
      SyncGroup.publishHighlight(syncKey, null, { type: 'index', seriesIndex });
    },

    highlightKey(key) {
      setHighlight(null);
      setHighlightKey(key);
      SyncGroup.publishHighlight(syncKey, null, { type: 'key', key });
    },

    cursor(dataX) {
      setCursor(dataX);
      // publishCursor's `source` is not yet nullable in EventBus (owned by the
      // interaction layer); a null source is safe at runtime (every peer !==
      // null receives it). Cast until that signature is widened to accept null.
      SyncGroup.publishCursor(syncKey, null as unknown as ChartInstance, dataX);
    },

    highlightedSeries,
    highlightedKey,
    cursorDataX,

    syncKey,
  };
}
