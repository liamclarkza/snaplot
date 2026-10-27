/**
 * describeOptions(normalized, data) → the engine spec (plan §3.2, D16, D18, D23): the axes, each
 * series as the engine draws it, the tooltip, and the annotations in engine terms, over data that
 * ingest has read. A presentation change runs only this.
 */
import { fail, warnOnce } from '../engine/errors';
import type { AxisSpec, ChartSpec, SeriesSpec } from '../engine/spec';
import { column, type IngestedData, xColumnIndex } from './ingest';
import type { AccessorLike, NormalizedOptions, NormalizedSeries } from './normalize';
import {
  type CategoryAxis,
  describe,
  type Ingested,
  type IngestContext,
  parseIso,
  type SourceState,
  type XKind,
} from './sources';
/**
 * Describe options over data that is already ingested (plan D16): the engine spec, the series
 * ids and the annotations. A presentation change runs only this, so it never reads the data
 * again; the field lookups it makes find the columns ingest built.
 */
export function describeOptions<Row>(
  n: NormalizedOptions<Row>,
  data: IngestedData<Row>,
  previousTypes?: IngestContext<Row>['previousTypes'],
): Pick<Ingested<Row>, 'spec' | 'seriesIds' | 'referenceLines' | 'referenceRegions'> {
  const { sources, seriesSources, categories, encodings, kinds } = data;
  const axisSpecs = baseAxes(n);
  // Axis types: inferred kinds, category geometry, kept types for empty inferred axes.
  for (const [key, kind] of kinds) {
    const axis = axisSpecs[key] ?? {};
    if (kind === 'date') axisSpecs[key] = { ...axis, type: axis.type ?? 'time' };
    if (kind === 'category') axisSpecs[key] = categoryAxisSpec(axis, categories.get(key)!, n, key);
  }
  for (const [key, type] of previousTypes ?? []) {
    const own = sources.filter((source) => source.axis === key);
    if (
      n.axes[key]?.type === undefined &&
      !categories.has(key) &&
      own.length > 0 &&
      own.every((source) => source.columns[0].length === 0)
    )
      axisSpecs[key] = { ...axisSpecs[key], type };
  }

  const seriesIds = n.series.map((s) => s.id);
  const seriesSpecs = n.series.map((s) =>
    seriesSpec(s, sources[seriesSources[s.index]], encodings, n),
  );
  const spec: Omit<ChartSpec, 'plugins'> = {
    ...n.engine,
    axes: axisSpecs,
    series: seriesSpecs,
    tooltip: tooltipSpec(n, seriesSpecs),
  };
  return {
    spec,
    seriesIds,
    referenceLines: n.referenceLines.map((line, i) => ({
      ...line,
      axis: orientation(axisSpecs, line.axis),
      axisKey: line.axis,
      value: annotationValue(
        line.axis,
        line.value,
        `referenceLines[${i}].value`,
        axisSpecs,
        kinds,
        categories,
        n,
      ),
    })),
    referenceRegions: n.referenceRegions.map((region, i) => {
      const from = annotationValue(
        region.axis,
        region.from,
        `referenceRegions[${i}].from`,
        axisSpecs,
        kinds,
        categories,
        n,
        true,
      );
      const to = annotationValue(
        region.axis,
        region.to,
        `referenceRegions[${i}].to`,
        axisSpecs,
        kinds,
        categories,
        n,
        true,
      );
      // On a category axis a region names whole categories: it spans their slots, edge to edge.
      const slots = categories.has(region.axis);
      return {
        ...region,
        axis: orientation(axisSpecs, region.axis),
        axisKey: region.axis,
        from: slots ? Math.min(from, to) - 0.5 : from,
        to: slots ? Math.max(from, to) + 0.5 : to,
      };
    }),
  };
}

/** The axes the options name, with the positions series axes imply. */
function baseAxes(n: NormalizedOptions<any>): Record<string, AxisSpec> {
  const axisSpecs: Record<string, AxisSpec> = {};
  for (const [key, axis] of Object.entries(n.axes)) axisSpecs[key] = { ...axis.spec };
  // The first value axis the series use goes on the left; a second one defaults to the right
  // (backlog-10, plan D38). An explicit position always wins.
  const primary = n.series.some((s) => s.yAxis === 'y') ? 'y' : n.series[0]?.yAxis;
  for (const s of n.series) {
    if (s.xAxis !== 'x') axisSpecs[s.xAxis] = { position: 'bottom', ...axisSpecs[s.xAxis] };
    if (s.yAxis !== 'y') {
      const side = s.yAxis === primary ? 'left' : 'right';
      axisSpecs[s.yAxis] = { position: side, ...axisSpecs[s.yAxis] };
    }
  }
  return axisSpecs;
}

/** Read every source of normalized options: sources, categories, encodings and X kinds. */
function seriesSpec<Row>(
  s: NormalizedSeries,
  source: SourceState<Row>,
  encodings: Map<string, string[]>,
  n: NormalizedOptions<any>,
): SeriesSpec {
  const spec: SeriesSpec = { ...s.spec, label: s.label, type: s.type };
  if (s.format) spec.format = s.format;
  if (s.xAxis !== 'x') spec.xAxis = s.xAxis;
  if (s.yAxis !== 'y') spec.yAxis = s.yAxis;
  if (s.type === 'histogram') {
    spec.yColumn = 1;
    return spec;
  }
  spec.yColumn = column(source, s.y!, s, null);
  if (s.type === 'band') {
    spec.lowerColumn = column(source, s.lower!, s, null);
    spec.upperColumn = column(source, s.upper!, s, null);
  }
  if (s.type === 'scatter') {
    spec.xColumn = source.sortedX ? 0 : xColumnIndex(source);
    // A point's tooltip names its values by axis title, else by the field read.
    const fieldName = (accessor: AccessorLike | undefined) =>
      typeof accessor === 'string' ? accessor : undefined;
    spec.xName = n.axes[s.xAxis]?.spec.title ?? fieldName(source.x);
    spec.yName = n.axes[s.yAxis]?.spec.title ?? fieldName(s.y);
    const encode = (
      value: { field: AccessorLike; options: Record<string, unknown> },
      role: string,
      text: boolean,
    ) => {
      const index = column(source, value.field, s, { role, encodings, text });
      const field = source.fields[index];
      const label = typeof value.field === 'string' ? { label: value.field } : {};
      if (field.kind === 'encoding') {
        const { key } = field;
        const labels = encodings.get(key) ?? [];
        return {
          type: 'category' as const,
          ...label,
          // Read when called: an append's commit adds labels to `encodings`.
          format: (code: number) => encodings.get(key)?.[code] ?? '',
          ...(role === 'color' ? { categoryValues: labels.map((_, i) => i) } : {}),
          ...value.options,
          column: index,
        };
      }
      return { ...label, ...value.options, column: index };
    };
    if (s.colorBy) spec.colorBy = encode(s.colorBy, 'color', true) as SeriesSpec['colorBy'];
    if (s.sizeBy) spec.sizeBy = encode(s.sizeBy, 'size', false) as SeriesSpec['sizeBy'];
    if (s.tooltipFields)
      spec.tooltipFields = s.tooltipFields.map((field, i) =>
        encode(field, `tooltip:${i}`, true),
      ) as SeriesSpec['tooltipFields'];
  }
  return spec;
}

/**
 * List every label of each string colorBy in its series spec's categoryValues, after an append
 * committed new labels: the engine colours a code by its place there, and a code it does not
 * list draws in the fallback colour.
 */
export function refreshColorCodes<Row>(ingested: Ingested<Row>): void {
  ingested.spec.series = ingested.spec.series.map((spec, si) => {
    const colorBy = spec.colorBy;
    if (typeof colorBy !== 'object' || !colorBy.categoryValues) return spec;
    const field = ingested.sources[ingested.seriesSources[si]].fields[colorBy.column];
    if (field?.kind !== 'encoding') return spec;
    const count = ingested.encodings.get(field.key)?.length ?? 0;
    if (colorBy.categoryValues.length === count) return spec;
    return {
      ...spec,
      colorBy: { ...colorBy, categoryValues: Array.from({ length: count }, (_, i) => i) },
    };
  });
}

export function categoryAxisSpec(
  axis: AxisSpec,
  registry: CategoryAxis,
  n: NormalizedOptions<any>,
  key: string,
): AxisSpec {
  if (n.axes[key]?.spec.format)
    fail(
      `axes.${key}.format is not accepted on a category axis: category labels are shown as they are.`,
    );
  const codes = [...registry.labels.keys()];
  const first = codes.length ? codes[0] : 0;
  const last = codes.length ? codes[codes.length - 1] : 0;
  const isBar = n.series.some((s) => s.xAxis === key && s.type === 'bar');
  const slots = isBar || codes.length < 2;
  return {
    ...axis,
    type: 'linear',
    nice: false,
    padding: 0,
    min: axis.min ?? (slots ? first - 0.5 : first),
    max: axis.max ?? (slots ? Math.max(first + 0.5, last + 0.5) : last),
    ticks: axis.ticks ?? codes,
    thinTicks: axis.ticks === undefined,
    format: (code) => registry.labels.get(code) ?? '',
  };
}

function tooltipSpec<Row>(n: NormalizedOptions<Row>, _series: SeriesSpec[]): ChartSpec['tooltip'] {
  // Series formats live on each SeriesSpec (engine/format.ts applies series > axis > automatic).
  return { ...n.engine.tooltip };
}

function orientation(axes: Record<string, AxisSpec>, key: string): 'x' | 'y' {
  const position = axes[key]?.position;
  return position
    ? position === 'top' || position === 'bottom'
      ? 'x'
      : 'y'
    : key.startsWith('x')
      ? 'x'
      : 'y';
}

function annotationValue(
  axis: string,
  value: unknown,
  path: string,
  axes: Record<string, AxisSpec>,
  kinds: Map<string, XKind>,
  categories: Map<string, CategoryAxis>,
  n: NormalizedOptions<any>,
  openEnded = false,
): number {
  if (axis !== 'x' && axis !== 'y' && !axes[axis])
    fail(`${path}: the chart has no axis "${axis}".`);
  if (openEnded && (value === Number.POSITIVE_INFINITY || value === Number.NEGATIVE_INFINITY))
    return value as number;
  const kind = kinds.get(axis);
  if (typeof value === 'string') {
    const registry = categories.get(axis);
    if (registry) {
      const code = registry.codes.get(value);
      if (code === undefined)
        fail(`${path} is "${value}", which is not a category of axis "${axis}".`);
      return code;
    }
    if (kind === 'date' || axes[axis]?.type === 'time') {
      const ms = parseIso(value, n.engine.timeZone);
      if (Number.isFinite(ms)) return ms;
      fail(`${path} is "${value}", which is not an ISO-8601 date for time axis "${axis}".`);
    }
    fail(`${path} is "${value}", but axis "${axis}" is numeric: give a number.`);
  }
  const ms = value instanceof Date ? value.getTime() : value;
  if (typeof ms !== 'number' || !Number.isFinite(ms))
    fail(
      `${path} is ${describe(value)}; give a finite number, a Date, an ISO-8601 string or a category label.`,
    );
  const time = kind === 'date' || axes[axis]?.type === 'time';
  if (value instanceof Date && !time)
    warnOnce(
      'annotation-date',
      `${path} is a Date, but axis "${axis}" is not a time axis, so it is read as ${ms} (epoch milliseconds). Set axes.${axis}.type: 'time'.`,
    );
  // A number on a category axis is a slot position; one beyond every slot draws nothing.
  const registry = categories.get(axis);
  if (registry && ![...registry.labels.keys()].some((code) => Math.abs(code - ms) <= 0.5))
    warnOnce(
      'annotation-category',
      `${path} is ${ms}, which is beyond the ${registry.labels.size} categories of axis "${axis}"; give a category label.`,
    );
  return ms;
}
