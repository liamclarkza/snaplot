import type { AxisConfig, ChartConfig, ColumnarData, SeriesConfig, ScaleType } from '../types';
import type { ReferenceLine } from '../plugins/builtins/referenceLinesPlugin';
import type { ReferenceRegion } from '../plugins/builtins/referenceRegionsPlugin';
import type { ChartOptions, DataSource } from '../public/types';

type Accessor = string | ((row: any, index: number) => unknown);
type Input =
  | readonly unknown[]
  | { columns: Record<string, Float64Array> }
  | {
      edges: Float64Array;
      counts: Float64Array;
      maxCount?: number;
    };
type CategoryRegistry = ReadonlyMap<string, readonly string[]>;

/** Identity arrays align with each series' own prepared source, never a joined X grid. */
export interface SeriesIdentity<Row = unknown> {
  sourceIndices: number[];
  rows?: readonly Row[];
  rowIds?: Array<string | number>;
}

export interface PreparedChart<Row = unknown> {
  config: ChartConfig;
  sources: ColumnarData[];
  sourceInputs: DataSource<Row>[];
  /** Ordered schema descriptors, including null for a synthetic storage-X column. */
  sourceFields: Array<Array<Accessor | null>>;
  seriesSources: number[];
  identities: SeriesIdentity<Row>[];
  categories: Map<string, string[]>;
  encodingCategories: Map<string, string[]>;
  seriesIds: string[];
  referenceLines: ReferenceLine[];
  referenceRegions: ReferenceRegion[];
}

interface SourcePlan {
  input: Input;
  x: Accessor | undefined;
  axis: string;
  series: number[];
  ordered: boolean;
}

function fail(message: string): never {
  throw new Error(`Snaplot: ${message}`);
}

function fieldName(field: Accessor): string {
  return typeof field === 'string' ? `field "${field}"` : 'accessor';
}

function read(field: Accessor, row: unknown, index: number): unknown {
  if (typeof field === 'function') return field(row, index);
  if (row === null || typeof row !== 'object')
    fail(`row ${index} must be an object when reading ${fieldName(field)}.`);
  return (row as Record<string, unknown>)[field];
}

function numeric(value: unknown, context: string): number {
  if (value == null || (typeof value === 'number' && Number.isNaN(value))) return Number.NaN;
  if (typeof value !== 'number' || !Number.isFinite(value))
    fail(`${context} must be a finite number or a missing value (null, undefined or NaN).`);
  return value;
}

function isRows(input: Input): input is readonly unknown[] {
  return Array.isArray(input);
}

function isBins(input: Input): input is { edges: Float64Array; counts: Float64Array } {
  return !isRows(input) && 'edges' in input && 'counts' in input;
}

function validateAccessor(value: unknown, context: string): asserts value is Accessor {
  if (typeof value !== 'string' && typeof value !== 'function')
    fail(`${context} requires a field name or accessor.`);
}

/**
 * Pure ingestion transaction. No input buffers, rows or prior category registry
 * are mutated. Rendering consumes only the returned per-source numeric columns.
 */
export function prepareChart<Row>(
  options: ChartOptions<Row>,
  previousCategories: CategoryRegistry = new Map(),
  preparation: {
    sortRows?: boolean;
    previousAxisTypes?: ReadonlyMap<string, ScaleType>;
    previousEncodingCategories?: ReadonlyMap<string, readonly string[]>;
  } = {},
): PreparedChart<Row> {
  // Runtime shape checks intentionally also cover JavaScript consumers.
  const opts = options as unknown as Record<string, any>;
  if (!Array.isArray(opts.series)) fail('series must be an array.');
  const categories = new Map(
    Array.from(previousCategories, ([axis, labels]) => [axis, [...labels]]),
  );
  const categoryIndices = new Map<string, Map<string, number>>();
  const encodingCategories = new Map(
    Array.from(preparation.previousEncodingCategories ?? [], ([key, labels]) => [key, [...labels]]),
  );
  const axes: Record<string, AxisConfig> = {};
  const axisKinds = new Map<string, 'number' | 'date' | 'category'>();
  const explicitCategories = new Set<string>();
  for (const [key, value] of Object.entries(opts.axes ?? {}) as Array<
    [string, Record<string, any>]
  >) {
    if (value == null) continue;
    if (typeof value !== 'object' || Array.isArray(value))
      fail(`axis "${key}" options must be an object.`);
    const { title, roundBounds, rangePadding, format, categories: labels, type, ...rest } = value;
    if (type !== undefined && !['linear', 'log', 'time', 'category'].includes(type))
      fail(`axis "${key}" has unsupported type "${type}".`);
    for (const bound of ['min', 'max'] as const) {
      if (
        value[bound] !== undefined &&
        (typeof value[bound] !== 'number' || !Number.isFinite(value[bound]))
      )
        fail(`axis "${key}" ${bound} must be a finite number.`);
      if (type === 'log' && value[bound] !== undefined && value[bound] <= 0)
        fail(`log axis "${key}" ${bound} must be positive.`);
    }
    if (value.min !== undefined && value.max !== undefined && value.min >= value.max)
      fail(`axis "${key}" requires min < max.`);
    if (
      rangePadding !== undefined &&
      (typeof rangePadding !== 'number' || !Number.isFinite(rangePadding) || rangePadding < 0)
    )
      fail(`axis "${key}" rangePadding must be finite and nonnegative.`);
    if (format !== undefined && typeof format !== 'function')
      fail(`axis "${key}" format must be a function.`);
    if (labels !== undefined && type !== undefined && type !== 'category')
      fail(`axis "${key}" categories require type: 'category' or an inferred type.`);
    if (type !== undefined && type !== 'category' && labels === undefined) categories.delete(key);
    axes[key] = {
      ...rest,
      ...(type === undefined ? {} : { type: type === 'category' ? 'linear' : type }),
      ...(title === undefined ? {} : { label: title }),
      ...(roundBounds === undefined ? {} : { nice: roundBounds }),
      ...(rangePadding === undefined ? {} : { padding: rangePadding }),
      ...(format === undefined ? {} : { tickFormat: format }),
    };
    if (type === 'category' || labels !== undefined) {
      axisKinds.set(key, 'category');
      if (labels !== undefined) {
        if (!Array.isArray(labels) || labels.some((label: unknown) => typeof label !== 'string'))
          fail(`axis "${key}" categories must be an array of strings.`);
        if (new Set(labels).size !== labels.length)
          fail(`axis "${key}" categories must be unique.`);
        categories.set(key, [...labels]);
        explicitCategories.add(key);
      } else if (!categories.has(key)) categories.set(key, []);
    }
  }
  const seriesIds: string[] = opts.series.map((series: Record<string, any>, index: number) => {
    const id = series.id ?? (typeof series.y === 'string' ? series.y : undefined);
    if (typeof id !== 'string' || id.length === 0)
      fail(`series ${index} needs an explicit non-empty id when y is an accessor or absent.`);
    return id;
  });
  if (new Set(seriesIds).size !== seriesIds.length)
    fail('series IDs must be unique; specify explicit id values for series sharing a Y field.');
  const plans: SourcePlan[] = [];
  const emptyRows: readonly unknown[] = [];
  const seriesSources: number[] = [];
  for (let si = 0; si < opts.series.length; si++) {
    const series: Record<string, any> = opts.series[si];
    if (
      series.type !== undefined &&
      !['line', 'area', 'bar', 'band', 'scatter', 'histogram'].includes(series.type)
    )
      fail(`unknown chart type "${series.type}" in series "${seriesIds[si]}".`);
    const input = series.data ?? opts.data ?? emptyRows;
    if (
      !Array.isArray(input) &&
      (input === null ||
        typeof input !== 'object' ||
        !('columns' in input || ('edges' in input && 'counts' in input)))
    ) {
      fail(
        `data for series "${seriesIds[si]}" must be object rows, named Float64Array columns, or histogram bins.`,
      );
    }
    const x = series.x ?? opts.x;
    if (!isBins(input)) validateAccessor(x, `X for series "${seriesIds[si]}"`);
    if (isBins(input) && series.type !== 'histogram')
      fail(`histogram bins require type: 'histogram' for series "${seriesIds[si]}".`);
    const axis = series.xAxis ?? 'x';
    if (axis !== 'x') axes[axis] = { position: 'bottom', ...axes[axis] };
    const yAxis = series.yAxis ?? 'y';
    if (yAxis !== 'y') axes[yAxis] = { position: 'left', ...axes[yAxis] };
    let pi = plans.findIndex((plan) => plan.input === input && plan.x === x && plan.axis === axis);
    if (pi < 0) {
      pi = plans.length;
      plans.push({ input, x, axis, series: [], ordered: false });
    }
    plans[pi].series.push(si);
    plans[pi].ordered ||= series.type !== 'scatter';
    seriesSources[si] = pi;
  }
  const sources: ColumnarData[] = [];
  const sourceFields: Array<Array<Accessor | null>> = [];
  const identities: SeriesIdentity<Row>[] = [];
  const seriesConfig: SeriesConfig[] = [];

  for (const plan of plans) {
    const source: ColumnarData = [new Float64Array(0)];
    const fields: Array<Accessor | null> = [plan.x ?? null];
    const context = `series "${seriesIds[plan.series[0]]}"`;
    const rows = isRows(plan.input) ? plan.input : undefined;
    const bins = isBins(plan.input) ? plan.input : undefined;
    const named =
      !rows && !bins
        ? (plan.input as { columns: Record<string, Float64Array> }).columns
        : undefined;
    let sourceIndices: number[];
    let actualX: Float64Array;
    let count = 0;
    if (rows) {
      count = rows.length;
      actualX = new Float64Array(count);
      for (let i = 0; i < count; i++) {
        const raw = read(plan.x!, rows[i], i);
        const kind =
          raw instanceof Date ||
          (typeof raw === 'number' && opts.axes?.[plan.axis]?.type === 'time')
            ? 'date'
            : typeof raw === 'string'
              ? 'category'
              : 'number';
        const priorKind = axisKinds.get(plan.axis);
        if (priorKind && priorKind !== kind)
          fail(
            `X ${fieldName(plan.x!)} in ${context}, row ${i}, mixes ${priorKind} and ${kind} values on axis "${plan.axis}".`,
          );
        axisKinds.set(plan.axis, kind);
        if (kind === 'category') {
          const configured = opts.axes?.[plan.axis]?.type;
          if (configured && configured !== 'category')
            fail(`string X values in ${context} require a category axis, not "${configured}".`);
          let labels = categories.get(plan.axis);
          if (!labels) {
            labels = [];
            categories.set(plan.axis, labels);
          }
          let indices = categoryIndices.get(plan.axis);
          if (!indices) {
            indices = new Map(labels.map((label, i) => [label, i]));
            categoryIndices.set(plan.axis, indices);
          }
          let index = indices.get(raw as string);
          if (index === undefined) {
            if (explicitCategories.has(plan.axis))
              fail(`unknown category "${raw}" in ${context}, row ${i}, on axis "${plan.axis}".`);
            index = labels.length;
            labels.push(raw as string);
            indices.set(raw as string, index);
          }
          actualX[i] = index;
        } else {
          const value = raw instanceof Date ? raw.getTime() : raw;
          if (typeof value !== 'number' || !Number.isFinite(value))
            fail(
              `X ${fieldName(plan.x!)} in ${context}, row ${i}, must be a finite number, valid Date or category string.`,
            );
          actualX[i] = value;
        }
      }
      sourceIndices = Array.from({ length: count }, (_, index) => index);
      if (
        plan.ordered &&
        preparation.sortRows !== false &&
        actualX.some((value, i) => i > 0 && value < actualX[i - 1])
      )
        sourceIndices.sort((a, b) => actualX[a] - actualX[b] || a - b);
      actualX = Float64Array.from(sourceIndices, (index) => actualX[index]);
      source[0] = plan.ordered ? actualX : Float64Array.from({ length: count }, (_, i) => i);
      if (!plan.ordered) fields[0] = null;
    } else if (bins) {
      if (!(bins.edges instanceof Float64Array) || !(bins.counts instanceof Float64Array))
        fail(`histogram edges and counts in ${context} must be Float64Arrays.`);
      count = bins.edges.length;
      if (bins.counts.length !== Math.max(0, count - 1))
        fail(
          `histogram counts in ${context} must have one value per bin (${Math.max(0, count - 1)} counts for ${count} edges). Do not pad counts.`,
        );
      source[0] = actualX = bins.edges;
      sourceIndices = Array.from({ length: count }, (_, i) => i);
    } else {
      if (!named || typeof named !== 'object')
        fail(`named columns in ${context} must be an object of Float64Arrays.`);
      if (typeof plan.x !== 'string')
        fail(`named columns in ${context} require an X field name, not an accessor.`);
      const x = named[plan.x];
      if (!(x instanceof Float64Array))
        fail(`X field "${plan.x}" in ${context} must name a Float64Array column.`);
      count = x.length;
      for (const [key, column] of Object.entries(named)) {
        if (!(column instanceof Float64Array))
          fail(`column "${key}" in ${context} must be a Float64Array.`);
        if (column.length !== count)
          fail(
            `column "${key}" in ${context} has ${column.length} values; X has ${count}. All columns must have equal lengths.`,
          );
      }
      actualX = x;
      // Scatter coordinates are not the ordered storage domain. Preserve the
      // physical buffers and use a synthetic row index for store navigation.
      source[0] = plan.ordered ? actualX : Float64Array.from({ length: count }, (_, i) => i);
      if (!plan.ordered) fields[0] = null;
      for (let i = 0; i < count; i++)
        if (!Number.isFinite(actualX[i])) fail(`X in ${context}, row ${i}, must be finite.`);
      sourceIndices = Array.from({ length: count }, (_, i) => i);
      if (axisKinds.get(plan.axis) === 'category')
        fail(`numeric columns in ${context} cannot be used as category labels; use object rows.`);
      if (axisKinds.get(plan.axis) === 'date' && opts.axes?.[plan.axis]?.type !== 'time')
        fail(
          `numeric columns in ${context} cannot share axis "${plan.axis}" with Date rows without an explicit time axis.`,
        );
      axisKinds.set(plan.axis, opts.axes?.[plan.axis]?.type === 'time' ? 'date' : 'number');
    }
    // Only row ingestion sorts. Typed columns must already satisfy store ordering.
    for (let i = 0; i < source[0].length; i++) {
      if (!Number.isFinite(source[0][i])) fail(`X in ${context}, row ${i}, must be finite.`);
      if (i > 0 && source[0][i] < source[0][i - 1])
        fail(
          `X in ${context}, row ${i}, must be sorted in ascending order for streaming batches, named columns and histogram bins.`,
        );
      if (bins && i > 0 && source[0][i] === source[0][i - 1])
        fail(`histogram edges in ${context} must be strictly increasing.`);
    }
    const fieldColumns = new Map<Accessor, number>();
    const textColumns = new Map<string, { index: number; labels: string[] }>();
    if (plan.x !== undefined && source[0] === actualX) fieldColumns.set(plan.x, 0);
    // Retain unselected named columns too: a later series update may select
    // them after streaming has replaced the original caller-owned buffers.
    if (named) {
      for (const field of Object.keys(named).sort()) {
        const values = named[field];
        if (fieldColumns.has(field)) continue;
        for (let i = 0; i < values.length; i++)
          numeric(values[i], `field "${field}" in ${context}, row ${i}`);
        fieldColumns.set(field, source.length);
        source.push(values);
        fields.push(field);
      }
    }
    function column(field: Accessor, si: number): number {
      validateAccessor(field, `value in series "${seriesIds[si]}"`);
      const previous = fieldColumns.get(field);
      if (previous !== undefined) return previous;
      let values: Float64Array;
      if (rows) {
        values = Float64Array.from(sourceIndices, (originalIndex) =>
          numeric(
            read(field, rows[originalIndex], originalIndex),
            `${fieldName(field)} in series "${seriesIds[si]}", row ${originalIndex}`,
          ),
        );
      } else {
        if (typeof field !== 'string')
          fail(`named columns in series "${seriesIds[si]}" require field names, not accessors.`);
        const value = named?.[field];
        if (!(value instanceof Float64Array))
          fail(
            `field "${field}" in series "${seriesIds[si]}" does not name a Float64Array column.`,
          );
        values = value;
        for (let i = 0; i < values.length; i++)
          numeric(values[i], `field "${field}" in series "${seriesIds[si]}", row ${i}`);
      }
      const index = source.length;
      source.push(values);
      fields.push(field);
      fieldColumns.set(field, index);
      return index;
    }
    for (const si of plan.series) {
      const spec = opts.series[si];
      const {
        id: _id,
        data: _data,
        x: _x,
        y,
        lower,
        upper,
        rowId,
        xAxis,
        yAxis,
        format: _format,
        colorBy,
        sizeBy,
        tooltipFields,
        ...style
      } = spec;
      const config: SeriesConfig = {
        ...style,
        label: spec.label ?? (typeof y === 'string' ? y : seriesIds[si]),
        ...(xAxis === undefined ? {} : { xAxisKey: xAxis }),
        ...(yAxis === undefined ? {} : { yAxisKey: yAxis }),
      };
      if (bins) {
        const counts =
          bins.counts.length === count
            ? bins.counts
            : Float64Array.from({ length: count }, (_, i) => bins.counts[i] ?? 0);
        for (let i = 0; i < counts.length; i++) {
          if (!Number.isFinite(counts[i]) || counts[i] < 0)
            fail(
              `histogram counts in series "${seriesIds[si]}", bin ${i}, must be finite and nonnegative.`,
            );
        }
        config.dataIndex = source.length;
        source.push(counts);
        fields.push(null);
      } else {
        config.dataIndex = column(y, si);
        if (spec.type === 'band') {
          config.lowerDataIndex = column(lower, si);
          config.upperDataIndex = column(upper, si);
        }
        if (spec.type === 'scatter') {
          config.yDataIndex = config.dataIndex;
          if (source[0] === actualX) config.xDataIndex = 0;
          else {
            let xi = fieldColumns.get(plan.x!);
            if (xi === undefined) {
              xi = source.length;
              source.push(actualX);
              fields.push(plan.x!);
              fieldColumns.set(plan.x!, xi);
            }
            config.xDataIndex = xi;
          }
          const encoding = (value: any, acceptsText: boolean, role: string): any => {
            const simple = typeof value === 'string' || typeof value === 'function';
            if (!simple && (!value || typeof value !== 'object'))
              fail(
                `encoding in series "${seriesIds[si]}" requires a field or { field, ...options }.`,
              );
            const { field, ...rest } = simple ? { field: value } : value;
            validateAccessor(field, `encoding in series "${seriesIds[si]}"`);
            if (acceptsText && rows) {
              const registryKey =
                typeof field === 'string' ? `field:${field}` : `series:${seriesIds[si]}:${role}`;
              let textColumn = textColumns.get(registryKey);
              if (!textColumn) {
                const values = sourceIndices.map((originalIndex) =>
                  read(field, rows[originalIndex], originalIndex),
                );
                if (
                  encodingCategories.has(registryKey) ||
                  values.some((item) => typeof item === 'string')
                ) {
                  const labels = encodingCategories.get(registryKey) ?? [];
                  encodingCategories.set(registryKey, labels);
                  const indices = new Map(labels.map((label, index) => [label, index]));
                  const valuesColumn = Float64Array.from(values, (item, i) => {
                    if (item == null || (typeof item === 'number' && Number.isNaN(item)))
                      return Number.NaN;
                    if (typeof item !== 'string')
                      fail(
                        `${fieldName(field)} in series "${seriesIds[si]}", row ${sourceIndices[i]}, cannot mix category labels and numeric encoding values.`,
                      );
                    let index = indices.get(item);
                    if (index === undefined) {
                      index = labels.length;
                      labels.push(item);
                      indices.set(item, index);
                    }
                    return index;
                  });
                  textColumn = { index: source.length, labels };
                  textColumns.set(registryKey, textColumn);
                  source.push(valuesColumn);
                  fields.push(`encoding:${registryKey}`);
                }
              }
              if (textColumn) {
                const labels = textColumn.labels;
                return {
                  type: 'category',
                  label: typeof field === 'string' ? field : undefined,
                  format: (encoded: number) => labels[encoded] ?? '',
                  ...(role === 'color' ? { categoryValues: labels.map((_, index) => index) } : {}),
                  ...rest,
                  dataIndex: textColumn.index,
                };
              }
            }
            const dataIndex = column(field, si);
            return { ...(typeof field === 'string' ? { label: field } : {}), ...rest, dataIndex };
          };
          if (colorBy !== undefined) config.colorBy = encoding(colorBy, true, 'color');
          if (sizeBy !== undefined) config.sizeBy = encoding(sizeBy, false, 'size');
          if (tooltipFields !== undefined)
            config.tooltipFields = tooltipFields.map((value: unknown, index: number) =>
              encoding(value, true, `tooltip:${index}`),
            );
        }
      }
      if (
        spec.type === 'bar' &&
        axisKinds.get(plan.axis) === 'category' &&
        new Set(actualX).size !== actualX.length
      ) {
        fail(
          `bar series "${seriesIds[si]}" has duplicate categories. Aggregate rows first or use scatter points.`,
        );
      }
      const identityField = rowId ?? opts.rowId;
      const suppliedRowIds =
        !rows && !bins
          ? (plan.input as { rowIds?: readonly (string | number)[] }).rowIds
          : undefined;
      if (suppliedRowIds && suppliedRowIds.length !== count)
        fail(`rowIds in series "${seriesIds[si]}" must have the same length as columns.`);
      const rowIds =
        identityField !== undefined || suppliedRowIds
          ? sourceIndices.map((originalIndex) => {
              if (identityField === undefined) return suppliedRowIds![originalIndex];
              let value: unknown;
              if (rows) {
                validateAccessor(identityField, 'rowId');
                value = read(identityField, rows[originalIndex], originalIndex);
              } else {
                if (typeof identityField !== 'string')
                  fail(`column rowId in series "${seriesIds[si]}" must be a field name.`);
                value = named?.[identityField]?.[originalIndex];
              }
              if (
                (typeof value !== 'string' && typeof value !== 'number') ||
                (typeof value === 'number' && !Number.isFinite(value))
              )
                fail(
                  `rowId in series "${seriesIds[si]}", row ${originalIndex}, must be a string or finite number.`,
                );
              return value;
            })
          : undefined;
      if (
        rowIds?.some(
          (value) =>
            (typeof value !== 'string' && typeof value !== 'number') ||
            (typeof value === 'number' && !Number.isFinite(value)),
        )
      )
        fail(`rowIds in series "${seriesIds[si]}" must contain strings or finite numbers.`);
      if (rowIds && new Set(rowIds).size !== rowIds.length)
        fail(`rowId values in series "${seriesIds[si]}" must be unique.`);
      identities[si] = {
        sourceIndices,
        ...(rows ? { rows: sourceIndices.map((i) => rows[i] as Row) } : {}),
        ...(rowIds ? { rowIds } : {}),
      };
      // Existing per-datum callbacks receive original source indices after sorting.
      if (typeof spec.fill === 'function')
        config.fill = (value, index) =>
          spec.fill(value, sourceIndices[index], rows?.[sourceIndices[index]]);
      seriesConfig[si] = config;
    }
    sources.push(source);
    sourceFields.push(fields);
  }
  // An empty snapshot must not turn an established category axis into numbers.
  for (const plan of plans) {
    if (
      !axisKinds.has(plan.axis) &&
      categories.has(plan.axis) &&
      (!opts.axes?.[plan.axis]?.type || opts.axes[plan.axis].type === 'category')
    )
      axisKinds.set(plan.axis, 'category');
  }
  for (const [key, kind] of axisKinds) {
    const axis = axes[key] ?? {};
    if (kind !== 'category') categories.delete(key);
    if (kind === 'date') axes[key] = { ...axis, type: opts.axes?.[key]?.type ?? 'time' };
    if (kind === 'category') {
      const labels = categories.get(key) ?? [];
      const isBar = opts.series.some(
        (series: Record<string, any>) => (series.xAxis ?? 'x') === key && series.type === 'bar',
      );
      const format = opts.axes?.[key]?.format;
      axes[key] = {
        ...axis,
        type: 'linear',
        nice: false,
        padding: 0,
        min: axis.min ?? (isBar || labels.length < 2 ? -0.5 : 0),
        max:
          axis.max ??
          (isBar || labels.length < 2 ? Math.max(0.5, labels.length - 0.5) : labels.length - 1),
        ticks: axis.ticks ?? labels.map((_, index) => index),
        tickFormat: (index) =>
          labels[index] === undefined ? '' : format ? format(labels[index]) : labels[index],
      };
    }
  }
  for (const [axis, type] of preparation.previousAxisTypes ?? []) {
    const indices = plans.flatMap((plan, index) => (plan.axis === axis ? [index] : []));
    if (
      opts.axes?.[axis]?.type === undefined &&
      !categories.has(axis) &&
      indices.length > 0 &&
      indices.every((index) => sources[index][0].length === 0)
    ) {
      axes[axis] = { ...axes[axis], type };
    }
  }
  const {
    data: _data,
    x: _x,
    rowId: _rowId,
    series: _series,
    axes: _axes,
    referenceLines,
    referenceRegions,
    streaming,
    group: _group,
    viewport: _viewport,
    defaultViewport: _defaultViewport,
    hiddenSeries: _hiddenSeries,
    defaultHiddenSeries: _defaultHiddenSeries,
    onViewportChange: _onViewportChange,
    onHiddenSeriesChange: _onHiddenSeriesChange,
    onSelectionChange: _onSelectionChange,
    defaultSelection: _defaultSelection,
    plugins: _plugins,
    ariaLabel: _ariaLabel,
    onPointClick: _onPointClick,
    onSelect: _onSelect,
    ...rest
  } = opts;
  const config: ChartConfig = { ...rest, axes, series: seriesConfig };
  if (opts.tooltip) {
    // The public controller supplies row-aware points to custom renderers.
    const { render: _render, ...tooltip } = opts.tooltip;
    config.tooltip = tooltip;
  }
  if (opts.tooltip?.yFormat || opts.tooltip?.rangeFormat) {
    config.tooltip = {
      ...config.tooltip,
      ...(opts.tooltip.yFormat
        ? {
            yFormat: (value: number, index: number) =>
              opts.tooltip.yFormat(value, seriesIds[index]),
          }
        : {}),
      ...(opts.tooltip.rangeFormat
        ? {
            rangeFormat: (min: number, max: number, index: number) =>
              opts.tooltip.rangeFormat(min, max, seriesIds[index]),
          }
        : {}),
    };
  }
  if (streaming) {
    const { maxPoints, followWindow, ...other } = streaming;
    config.streaming = {
      ...other,
      ...(maxPoints === undefined ? {} : { maxLen: maxPoints }),
      ...(followWindow === undefined ? {} : { follow: followWindow }),
    };
  }
  if (
    opts.series.some((series: Record<string, any>) => typeof series.format === 'function') &&
    !config.tooltip?.yFormat
  ) {
    config.tooltip = {
      ...config.tooltip,
      yFormat: (value, index) => {
        const series: Record<string, any> = opts.series[index];
        return (
          series?.format?.(value) ??
          axes[series?.yAxis ?? 'y']?.tickFormat?.(value) ??
          String(value)
        );
      },
    };
  }
  function annotationValue(axis: string, value: unknown): number {
    if (axis !== 'x' && axis !== 'y' && !axes[axis])
      fail(`annotation names unknown axis "${axis}".`);
    if (typeof value === 'string') {
      const index = categories.get(axis)?.indexOf(value) ?? -1;
      if (index < 0) fail(`annotation names unknown category "${value}" on axis "${axis}".`);
      return index;
    }
    const n = value instanceof Date ? value.getTime() : value;
    if (typeof n !== 'number' || !Number.isFinite(n))
      fail(`annotation on axis "${axis}" requires a finite value, valid Date or known category.`);
    return n;
  }
  function orientation(key: string): 'x' | 'y' {
    const position = axes[key]?.position;
    return position
      ? position === 'top' || position === 'bottom'
        ? 'x'
        : 'y'
      : key.startsWith('x')
        ? 'x'
        : 'y';
  }
  if (sources.length === 0) {
    sources.push([new Float64Array(0)]);
    sourceFields.push([null]);
  }
  return {
    config,
    sources,
    sourceInputs: plans.length ? plans.map((plan) => plan.input as DataSource<Row>) : [[]],
    sourceFields,
    seriesSources,
    identities,
    categories,
    encodingCategories,
    seriesIds,
    referenceLines: (referenceLines ?? []).map((line: any) => ({
      ...line,
      axis: orientation(line.axis),
      axisKey: line.axis,
      value: annotationValue(line.axis, line.value),
    })),
    referenceRegions: (referenceRegions ?? []).map((region: any) => ({
      ...region,
      axis: orientation(region.axis),
      axisKey: region.axis,
      from: annotationValue(region.axis, region.from),
      to: annotationValue(region.axis, region.to),
    })),
  };
}
