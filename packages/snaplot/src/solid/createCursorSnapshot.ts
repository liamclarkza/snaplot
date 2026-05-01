import {
  createSignal,
  createEffect,
  onCleanup,
  type Accessor,
} from 'solid-js';
import type {
  ChartInstance,
  CursorSnapshot,
  CursorSnapshotOptions,
} from '../types';

/**
 * Reactive snapshot of all visible series at the current cursor position.
 *
 * Subscribes internally to `'cursor:move'` and `'data:update'` events and
 * recomputes via `chart.getCursorSnapshotInto()`, a single buffer is
 * reused across ticks so the cursor hot path stays allocation-free. The
 * returned signal uses `equals: false` so consumers re-run on every
 * update (the snapshot object identity does not change between ticks).
 *
 * Tip: prefer `<LegendTable>` for table UIs, it does the per-cell
 * granular reactive wiring that this signal alone does not provide.
 */
export function createCursorSnapshot<TMeta = unknown>(
  chart: Accessor<ChartInstance | undefined>,
  opts?: CursorSnapshotOptions | Accessor<CursorSnapshotOptions>,
): Accessor<CursorSnapshot<TMeta> | null> {
  const [snapshot, setSnapshot] = createSignal<CursorSnapshot<TMeta> | null>(
    null,
    { equals: false },
  );

  // Single reusable buffer per primitive instance. Survives across
  // chart-instance changes, we just refill it.
  const buffer: CursorSnapshot<TMeta> = {
    dataIndex: null,
    dataX: null,
    formattedX: '',
    points: [],
    source: 'none',
    activeSeriesIndex: null,
  };

  createEffect(() => {
    const c = chart();
    if (!c) {
      setSnapshot(null);
      return;
    }

    const refresh = () => {
      // The cast is safe, meta typing is purely an external assertion.
      c.getCursorSnapshotInto(
        buffer as unknown as CursorSnapshot,
        typeof opts === 'function' ? opts() : opts,
      );
      setSnapshot(buffer);
    };

    // Initial fill
    refresh();

    const offCursor = c.on('cursor:move', refresh);
    const offData = c.on('data:update', refresh);
    const offOptions = c.on('options:update', refresh);

    onCleanup(() => {
      offCursor();
      offData();
      offOptions();
    });
  });

  return snapshot;
}
