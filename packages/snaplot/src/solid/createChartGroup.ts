import { createSignal, type Accessor } from 'solid-js';
import { SyncGroup } from '../core/EventBus';
import type { ChartConfig, HighlightSyncKey } from '../types';

let groupCounter = 0;

/**
 * Bindings spread into each chart in the group. Sets matching
 * `cursor.syncKey`, `highlight.syncKey`, and optionally `zoom.syncKey`
 * so cross-chart sync works out of the box without the caller picking strings.
 */
export interface ChartGroupBindings {
  cursor: { syncKey: string };
  highlight: { syncKey: string };
  zoom: { syncKey: string };
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
   * Low-level: returns `{ cursor: { syncKey }, highlight: { syncKey } }`.
   * Spreading this into your config is fine when you don't have your
   * own `cursor` / `highlight` config, otherwise a naïve spread will
   * shadow your settings (including `cursor.show` and `indicators`).
   * Prefer `group.apply(config)` for the safe merge.
   */
  bind(): ChartGroupBindings;

  /**
   * Merge the group's sync keys into an existing config without
   * clobbering the caller's own `cursor` / `highlight` fields. Use this
   * in place of `{ ...config, ...group.bind() }`.
   */
  apply<TMeta>(config: ChartConfig<TMeta>): ChartConfig<TMeta>;

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

  // SyncGroup.publishHighlight/publishCursor compare peers by reference.
  // Passing `null` as the source means every member receives the broadcast,
  // which is exactly what an external coordinator wants.
  const SOURCE = null as never;

  return {
    bind() {
      return {
        cursor: { syncKey },
        highlight: { syncKey },
        zoom: { syncKey },
      };
    },

    apply<TMeta>(config: ChartConfig<TMeta>): ChartConfig<TMeta> {
      return {
        ...config,
        cursor: { ...(config.cursor ?? {}), syncKey },
        highlight: { ...(config.highlight ?? {}), syncKey },
        zoom: { ...(config.zoom ?? {}), syncKey },
      };
    },

    highlight(seriesIndex) {
      setHighlight(seriesIndex);
      setHighlightKey(null);
      SyncGroup.publishHighlight(syncKey, SOURCE, { type: 'index', seriesIndex });
    },

    highlightKey(key) {
      setHighlight(null);
      setHighlightKey(key);
      SyncGroup.publishHighlight(syncKey, SOURCE, { type: 'key', key });
    },

    cursor(dataX) {
      setCursor(dataX);
      SyncGroup.publishCursor(syncKey, SOURCE, dataX);
    },

    highlightedSeries,
    highlightedKey,
    cursorDataX,

    syncKey,
  };
}
