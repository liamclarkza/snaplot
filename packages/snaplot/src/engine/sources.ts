import { fail } from './errors';
/**
 * The engine's data sources: one store per source (a ring store when streaming keeps a window),
 * the source each series reads, and the transactions that replace them or append to one. The
 * public layer validated what it hands over (`trusted`), so the stores skip their X scans then.
 */
import type { ChartCore } from './Engine';
import type { AppendDataOptions, ChartSpec, ColumnarData, StreamingSpec } from './spec';
import { DirtyFlag } from './spec';
import type { DataStore } from './data/DataStore';
import { validateMaxLen } from './data/DataStore';
import { ColumnarStore } from './data/ColumnarStore';
import { RingColumnarStore } from './data/RingColumnarStore';
import { deepMerge } from './merge';
import { DEFAULT_CONFIG } from './defaults';
import { invalidateRangeCache, rangeForDataChange } from './ranging';
import { unpinMissedAxes } from './viewport';
import { reconcileSelectionForDataChange } from './selection';
import { refreshCursor } from './cursor';

/** Replace a prepared configuration and its independent sources as one transaction. */
export function replaceSources(
  engine: ChartCore,
  config: ChartSpec,
  sources: readonly ColumnarData[],
  seriesSources: readonly number[],
  trusted = false,
): void {
  if (engine.destroyed) return;
  // Resolve and validate the complete candidate before replacing any live store.
  const resolved = deepMerge(
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
    config as unknown as Record<string, unknown>,
  ) as unknown as ChartSpec;
  validateSources(resolved, sources, seriesSources, trusted);
  const maxLen = resolved.streaming?.maxPoints;
  if (maxLen !== undefined) validateMaxLen(maxLen);
  const build = () =>
    sources.map((data) =>
      maxLen === undefined
        ? new ColumnarStore(data)
        : new RingColumnarStore(data, maxLen, engine.debugCounters),
    );
  const stores = trusted ? ColumnarStore.trusted(build) : build();
  engine.sourceStores = stores;
  engine.seriesSources = seriesSources.slice();
  invalidateRangeCache(engine);
  unpinMissedAxes(engine, resolved);
  engine.dataVersion++;
  engine.debugCounters.ingestCount++;
  engine.replaceOptions(config);
  reconcileSelectionForDataChange(engine);
  refreshCursor(engine);
}

export function getSourceData(engine: ChartCore, sourceIndex: number): ColumnarData {
  const store = engine.sourceStores[sourceIndex];
  if (!store) fail(`Unknown data source ${sourceIndex}`);
  return store.getData();
}

export function validateSources(
  config: ChartSpec,
  sources: readonly ColumnarData[],
  indices: readonly number[],
  trusted: boolean,
): void {
  if (sources.length === 0) fail('At least one data source is required');
  if (indices.length !== config.series.length) fail('Each series requires a data source index');
  if (!trusted) for (const source of sources) ColumnarStore.validate(source);
  for (let si = 0; si < config.series.length; si++) {
    const sourceIndex = indices[si];
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= sources.length) {
      fail(`Invalid data source for series ${si}`);
    }
  }
}

export function sourceExtent(engine: ChartCore, axisKey?: string): [number, number] | null {
  let min = Infinity;
  let max = -Infinity;
  const stores =
    axisKey === undefined
      ? engine.sourceStores
      : new Set(
          engine.config.series.flatMap((series, si) =>
            series.visible !== false && (series.xAxis ?? 'x') === axisKey
              ? [engine.storeForSeries(si)]
              : [],
          ),
        );
  for (const store of stores) {
    if (!store.length) continue;
    min = Math.min(min, store.xAt(0));
    max = Math.max(max, store.xAt(store.length - 1));
  }
  return min === Infinity ? null : [min, max];
}

export function appendToSource(
  engine: ChartCore,
  sourceIndex: number,
  data: ColumnarData,
  opts?: AppendDataOptions,
  /** The public ingest validated the batch and its order. */
  trusted = false,
): void {
  if (engine.destroyed) return;
  if (!engine.sourceStores[sourceIndex]) fail(`Unknown data source ${sourceIndex}`);
  ensureStoreMatchesStreaming(engine);
  const store = engine.sourceStores[sourceIndex];
  if (!trusted) ColumnarStore.validate(data);
  if (data.length !== store.seriesCount + 1) fail('Appended columns must match the source schema');
  if (!trusted && data[0].length && store.length) {
    const previousIndex = opts?.updateLast ? store.length - 2 : store.length - 1;
    if (previousIndex >= 0 && data[0][0] < store.xAt(previousIndex))
      fail('Appended X values must preserve source order');
  }

  const write = () => {
    if (opts?.updateLast && store.length > 0 && data.length > 0 && data[0].length > 0) {
      store.replaceLast(Array.from(data, (col) => col[0]));
      if (data[0].length > 1) {
        store.append(data.map((col) => col.subarray(1)) as ColumnarData);
      }
      return true;
    }
    return store.append(data);
  };
  const changed = trusted ? ColumnarStore.trusted(write) : write();
  if (!changed) return;

  engine.dataVersion++;
  const gridDirty = rangeForDataChange(engine);
  reconcileSelectionForDataChange(engine);
  refreshCursor(engine);
  engine.scheduler.markDirty(gridDirty ? DirtyFlag.DATA | DirtyFlag.GRID : DirtyFlag.DATA);
}

export function createDataStore(engine: ChartCore, data: ColumnarData, trusted = false): DataStore {
  const maxLen = streamingMaxLen(engine);
  const build = () =>
    maxLen === undefined
      ? new ColumnarStore(data)
      : new RingColumnarStore(data, maxLen, engine.debugCounters);
  return trusted ? ColumnarStore.trusted(build) : build();
}

export function ensureStoreMatchesStreaming(engine: ChartCore): void {
  const maxLen = streamingMaxLen(engine);
  // The stores' data was validated when it was stored.
  engine.sourceStores = ColumnarStore.trusted(() =>
    engine.sourceStores.map((store) => {
      if (maxLen !== undefined) {
        if (store instanceof RingColumnarStore && store.maxLen === maxLen) return store;
        invalidateRangeCache(engine);
        return new RingColumnarStore(store.getData(), maxLen, engine.debugCounters);
      }
      if (!(store instanceof RingColumnarStore)) return store;
      invalidateRangeCache(engine);
      return new ColumnarStore(store.getData());
    }),
  );
}

export function streamingMaxLen(engine: ChartCore): number | undefined {
  const maxLen = (engine.config.streaming as StreamingSpec | undefined)?.maxPoints;
  if (maxLen !== undefined) validateMaxLen(maxLen);
  return maxLen;
}
