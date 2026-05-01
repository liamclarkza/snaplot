import {
  createSignal,
  createEffect,
  onCleanup,
  type Accessor,
} from 'solid-js';
import type { ChartInstance, HighlightSyncKey } from '../types';

/**
 * Two-way reactive binding to a chart's highlighted series.
 *
 * - The accessor reflects the chart's current `getHighlight()` and
 *   updates whenever a `'highlight:change'` event fires (including
 *   sync messages from peer charts in the same group).
 * - The setter calls `chart.setHighlight()`, which is itself a no-op
 *   when the value is unchanged, safe to call from `onMouseEnter`
 *   / `onMouseLeave` handlers without debouncing.
 *
 * Returns `[null, noop]` until the chart accessor resolves.
 */
export function createHighlight(
  chart: Accessor<ChartInstance | undefined>,
): [Accessor<number | null>, (idx: number | null) => void] {
  const [highlight, setHighlightSignal] = createSignal<number | null>(null);

  createEffect(() => {
    const c = chart();
    if (!c) {
      setHighlightSignal(null);
      return;
    }
    setHighlightSignal(c.getHighlight());
    const off = c.on('highlight:change', (idx) => setHighlightSignal(idx));
    onCleanup(off);
  });

  const set = (idx: number | null) => {
    chart()?.setHighlight(idx);
  };

  return [highlight, set];
}

/**
 * Key-aware highlight binding for charts configured with
 * `highlight.getKey`. Use this when peer charts can have different
 * series subsets or order.
 */
export function createHighlightKey(
  chart: Accessor<ChartInstance | undefined>,
): [Accessor<HighlightSyncKey | null>, (key: HighlightSyncKey | null) => void] {
  const [highlightKey, setHighlightKeySignal] = createSignal<HighlightSyncKey | null>(null);

  createEffect(() => {
    const c = chart();
    if (!c) {
      setHighlightKeySignal(null);
      return;
    }
    setHighlightKeySignal(c.getHighlightKey());
    const off = c.on('highlight:change', () => setHighlightKeySignal(c.getHighlightKey()));
    onCleanup(off);
  });

  const set = (key: HighlightSyncKey | null) => {
    chart()?.setHighlightKey(key);
  };

  return [highlightKey, set];
}
