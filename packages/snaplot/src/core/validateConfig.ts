import type { ChartConfig, ChartType, ColumnarData, SeriesConfig } from '../types';
import {
  normalizeScatterColorBy,
  normalizeScatterSizeBy,
  normalizeScatterTooltipField,
} from '../renderers/scatterEncoding';

/**
 * Known chart types. Kept here as a runtime set because `ChartType` is a
 * type-only union with no value counterpart; this is the single source of
 * truth the validator checks `series.type` against.
 */
const KNOWN_CHART_TYPES: ReadonlySet<ChartType> = new Set<ChartType>([
  'line',
  'area',
  'band',
  'scatter',
  'bar',
  'histogram',
]);

const TOOLTIP_MODES: ReadonlySet<string> = new Set(['nearest', 'index', 'x']);

// Minimal local declaration of the bundler-injected global. This is a browser
// library that does not depend on @types/node; the literal `process.env`
// member expression below is what bundlers statically replace, so it must
// appear verbatim yet still needs a type to compile.
declare const process: { env: { NODE_ENV?: string } } | undefined;

/**
 * Whether config validation should run in the current environment.
 *
 * Bundlers statically replace `process.env.NODE_ENV`, so a production build
 * folds this to `false` and dead-code-eliminates every guarded validation
 * pass, leaving zero validation cost shipped. The `typeof process` guard
 * keeps un-bundled browsers (where `process` is undefined) from throwing a
 * ReferenceError, and an unset `NODE_ENV` validates by default so local dev
 * without an explicit environment still gets the checks.
 */
export function shouldValidateConfig(): boolean {
  return typeof process === 'undefined' || process.env.NODE_ENV !== 'production';
}

// Distinct soft-warning messages already emitted, so a per-frame or repeated
// config path does not spam the console with the same warning.
const warnedMessages = new Set<string>();

function warnOnce(message: string): void {
  if (warnedMessages.has(message)) return;
  warnedMessages.add(message);
  console.warn(message);
}

function describeSeries(series: SeriesConfig, index: number): string {
  return series.label ? `series "${series.label}"` : `series at index ${index}`;
}

/**
 * Development-only config validation with actionable, series-named errors.
 *
 * Callers wire this behind `shouldValidateConfig()` so production bundles
 * drop the call entirely (see that predicate for the DCE reasoning). The
 * pass also self-guards on the same predicate, so tests and any direct
 * caller are safe to invoke it unconditionally: it returns early in
 * production instead of throwing.
 *
 * Structural violations that would corrupt indexing or rendering throw a
 * `TypeError`: an out-of-range column index, a band series missing a bound,
 * or an unknown `series.type`. Softer issues that degrade gracefully at
 * runtime (an unknown axis key, a bad tooltip mode, a non-positive
 * highlight proximity) `console.warn` once per distinct message instead.
 *
 * Column bounds are only checked when `data` is present, since the valid
 * range derives from the column count.
 */
export function validateChartConfig(config: ChartConfig, data?: ColumnarData): void {
  if (!shouldValidateConfig()) return;

  const hasData = !!data && data.length > 0;
  // Column count includes column 0 (X); valid indices are 0..columnCount-1.
  const columnCount = hasData ? data!.length : 0;
  const maxIndex = columnCount - 1;

  const validAxisKeys = new Set<string>(['x', 'y']);
  for (const key of Object.keys(config.axes ?? {})) validAxisKeys.add(key);

  config.series.forEach((series, index) => {
    const who = describeSeries(series, index);

    // Unknown chart type: determines the whole render path, so it throws.
    if (series.type !== undefined && !KNOWN_CHART_TYPES.has(series.type)) {
      throw new TypeError(
        `snaplot: ${who} has unknown type "${series.type}". ` +
          `Valid types are ${[...KNOWN_CHART_TYPES].join(', ')}.`,
      );
    }

    // Band series render a filled region between two bounds; both are
    // required regardless of whether data is present.
    if (series.type === 'band') {
      const missing: string[] = [];
      if (series.upperDataIndex == null) missing.push('upperDataIndex');
      if (series.lowerDataIndex == null) missing.push('lowerDataIndex');
      if (missing.length > 0) {
        throw new TypeError(
          `snaplot: band ${who} must declare both upperDataIndex and lowerDataIndex ` +
            `(missing ${missing.join(' and ')}).`,
        );
      }
    }

    // Unknown axis key degrades to the implicit axis at runtime, so warn.
    if (series.xAxisKey !== undefined && !validAxisKeys.has(series.xAxisKey)) {
      warnOnce(
        `snaplot: ${who} references unknown xAxisKey "${series.xAxisKey}". ` +
          `Declare it in config.axes or use one of: ${[...validAxisKeys].join(', ')}.`,
      );
    }
    if (series.yAxisKey !== undefined && !validAxisKeys.has(series.yAxisKey)) {
      warnOnce(
        `snaplot: ${who} references unknown yAxisKey "${series.yAxisKey}". ` +
          `Declare it in config.axes or use one of: ${[...validAxisKeys].join(', ')}.`,
      );
    }

    if (!hasData) return;

    const checkIndex = (value: number | undefined, field: string): void => {
      if (value === undefined) return;
      if (value < 0 || value >= columnCount) {
        throw new TypeError(
          `snaplot: ${who} has ${field} ${value}, which is out of range. ` +
            `Valid column indices are 0 to ${maxIndex}.`,
        );
      }
    };

    checkIndex(series.dataIndex, 'dataIndex');
    checkIndex(series.yDataIndex, 'yDataIndex');
    checkIndex(series.xDataIndex, 'xDataIndex');
    checkIndex(series.upperDataIndex, 'upperDataIndex');
    checkIndex(series.lowerDataIndex, 'lowerDataIndex');

    const colorBy = normalizeScatterColorBy(series.colorBy);
    if (colorBy) checkIndex(colorBy.dataIndex, 'colorBy dataIndex');

    const sizeBy = normalizeScatterSizeBy(series.sizeBy);
    if (sizeBy) checkIndex(sizeBy.dataIndex, 'sizeBy dataIndex');

    for (const rawField of series.tooltipFields ?? []) {
      const field = normalizeScatterTooltipField(rawField);
      checkIndex(field.dataIndex, 'tooltipFields dataIndex');
    }
  });

  const tooltipMode = config.tooltip?.mode;
  if (tooltipMode !== undefined && !TOOLTIP_MODES.has(tooltipMode)) {
    warnOnce(
      `snaplot: tooltip.mode "${tooltipMode}" is not valid. ` +
        `Use one of: ${[...TOOLTIP_MODES].join(', ')}.`,
    );
  }

  const proximity = config.highlight?.proximity;
  if (proximity !== undefined && !(proximity > 0)) {
    warnOnce(`snaplot: highlight.proximity must be a positive number; got ${proximity}.`);
  }
}
