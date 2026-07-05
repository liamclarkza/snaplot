import { createSignal, type Accessor } from 'solid-js';
import { deepMerge } from '../config/merge';
import { SyncGroup } from '../core/EventBus';
import type { ChartConfig, ChartInstance, DeepPartial, HighlightSyncKey } from '../types';

let groupCounter = 0;

/** Options for `createChartGroup`. */
export interface ChartGroupOptions<TMeta = unknown> {
  /**
   * Config every chart in the group inherits. `apply()` deep-merges these
   * under each chart's own config (the per-chart config wins), so a dashboard
   * wall defines axes, theme, tooltip, and interaction once instead of
   * copy-pasting them into every chart and drifting out of sync.
   */
  defaults?: DeepPartial<ChartConfig<TMeta>>;
}

/** Per-chart coordination toggles for `group.link()`. */
export interface ChartGroupLinkOptions {
  /**
   * Give every linked chart the same Y domain (the union of their data
   * extents), so values are comparable across a grid of charts. Default: true.
   */
  yDomain?: boolean;
  /**
   * Align the left plot edge across linked charts by matching the widest
   * axis gutter, so stacked charts line up. Default: true.
   */
  gutters?: boolean;
}

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

  /**
   * Register a live chart instance for domain/gutter coordination. Linked
   * charts share a Y domain (union of their data extents) and align their
   * left gutter to the widest one, so a grid of charts reads as a set.
   * Returns an unlink function; call it on chart teardown. Idempotent per
   * chart. This is separate from `apply()`/`bind()` (which wire sync keys and
   * defaults into config); linking needs the constructed instance.
   */
  link(chart: ChartInstance, options?: ChartGroupLinkOptions): () => void;

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
export function createChartGroup<TMeta = unknown>(
  groupOptions?: ChartGroupOptions<TMeta>,
): ChartGroup {
  const syncKey = `__snaplot_group_${++groupCounter}`;
  const [highlightedSeries, setHighlight] = createSignal<number | null>(null);
  const [highlightedKey, setHighlightKey] = createSignal<HighlightSyncKey | null>(null);
  const [cursorDataX, setCursor] = createSignal<number | null>(null);
  const defaults = groupOptions?.defaults;

  // Linked instances for domain/gutter coordination.
  const linked = new Map<ChartInstance, { off: () => void; opts: Required<ChartGroupLinkOptions> }>();
  // Re-entrancy guard: applying setAxis/setOptions during coordination must
  // not recurse. We only listen to data:update/resize, and neither is emitted
  // by setAxis (viewport:change) or setOptions (options:update), so this guard
  // is belt-and-suspenders against a future event addition.
  let coordinating = false;

  const coordinate = (): void => {
    if (coordinating || linked.size === 0) return;
    coordinating = true;
    try {
      // Shared Y domain: union of each opted-in member's current Y extent.
      let yMin = Number.POSITIVE_INFINITY;
      let yMax = Number.NEGATIVE_INFINITY;
      for (const [chart, { opts }] of linked) {
        if (!opts.yDomain) continue;
        const y = chart.getAxis('y');
        if (y && Number.isFinite(y.min) && Number.isFinite(y.max)) {
          if (y.min < yMin) yMin = y.min;
          if (y.max > yMax) yMax = y.max;
        }
      }
      if (yMin < yMax) {
        for (const [chart, { opts }] of linked) {
          if (!opts.yDomain) continue;
          const y = chart.getAxis('y');
          if (y && (y.min !== yMin || y.max !== yMax)) chart.setAxis('y', { min: yMin, max: yMax });
        }
      }

      // Aligned gutters: pin every member's left padding to the widest plot
      // inset, so leftAxisWidth resolves to the same value for all of them.
      let maxLeft = 0;
      for (const [chart, { opts }] of linked) {
        if (!opts.gutters) continue;
        maxLeft = Math.max(maxLeft, chart.getLayout().plot.left);
      }
      if (maxLeft > 0) {
        for (const [chart, { opts }] of linked) {
          if (!opts.gutters) continue;
          const current = chart.getOptions().padding?.left;
          if (current !== maxLeft) chart.setOptions({ padding: { left: maxLeft } });
        }
      }
    } finally {
      coordinating = false;
    }
  };

  return {
    bind(options) {
      const bindings: ChartGroupBindings = {
        cursor: { syncKey },
        highlight: { syncKey },
      };
      if (options?.zoom) bindings.zoom = { syncKey };
      return bindings;
    },

    apply<TApplyMeta>(config: ChartConfig<TApplyMeta>, options?: ChartGroupBindOptions): ChartConfig<TApplyMeta> {
      // Group defaults first (chart config wins on conflict), then sync keys.
      const base = defaults
        ? (deepMerge(
            defaults as unknown as Record<string, unknown>,
            config as unknown as Record<string, unknown>,
          ) as unknown as ChartConfig<TApplyMeta>)
        : config;
      // `syncKey` first, caller's fields last, so an explicitly-set syncKey on
      // the caller's config wins instead of being clobbered.
      const merged: ChartConfig<TApplyMeta> = {
        ...base,
        cursor: { syncKey, ...(base.cursor ?? {}) },
        highlight: { syncKey, ...(base.highlight ?? {}) },
      };
      if (options?.zoom) {
        merged.zoom = { syncKey, ...(base.zoom ?? {}) };
      }
      return merged;
    },

    link(chart, options) {
      const opts = { yDomain: options?.yDomain !== false, gutters: options?.gutters !== false };
      const existing = linked.get(chart);
      if (existing) existing.off();
      const offData = chart.on('data:update', () => coordinate());
      const offResize = chart.on('resize', () => coordinate());
      const off = () => {
        offData();
        offResize();
        linked.delete(chart);
      };
      linked.set(chart, { off, opts });
      // Coordinate once now that the member joined.
      coordinate();
      return off;
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
