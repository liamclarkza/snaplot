/**
 * The public points a chart reports (plan §4.4): a series row as a `ChartPoint`, with its row, id,
 * category label and readouts, and the cursor snapshot built from them.
 */
import type { ChartCore } from '../engine/Engine';
import { formatX } from '../engine/format';
import { pointsInSelection } from '../engine/selection';
import type { TooltipPoint } from '../engine/spec';
import type { NormalizedOptions } from './normalize';
import type { Ingested } from './sources';
import type {
  ChartPoint,
  CursorOptions,
  CursorSnapshot,
  Selection,
  SelectionChange,
} from './types';

/** What a point reads of its chart. */
export interface PointView<Row> {
  readonly engine: ChartCore;
  readonly ingested: Ingested<Row>;
  readonly normalized: NormalizedOptions<Row>;
}

export function chartPoint<Row>(
  view: PointView<Row>,
  si: number,
  index: number,
  values?: Partial<
    Pick<
      TooltipPoint,
      | 'x'
      | 'y'
      | 'formattedX'
      | 'formattedY'
      | 'color'
      | 'xRange'
      | 'yRange'
      | 'radius'
      | 'fields'
      | 'value'
      | 'formattedValue'
      | 'bin'
    >
  >,
): ChartPoint<Row> {
  const sourceIndex = view.ingested.seriesSources[si];
  const source = view.ingested.sources[sourceIndex];
  const series = view.ingested.spec.series[si];
  const at = source.head + index;
  const x = values?.x ?? view.engine.getSourceValue(sourceIndex, series.xColumn ?? 0, index);
  const y = values?.y ?? view.engine.getSourceValue(sourceIndex, series.yColumn ?? 1, index);
  const axis = series.xAxis ?? 'x';
  const actualX = view.ingested.categories.get(axis)?.labels.get(Math.round(x)) ?? x;
  const fieldColumns = values?.fields
    ? [
        ...new Set(
          [series.colorBy, series.sizeBy, ...(series.tooltipFields ?? [])]
            .filter((field) => field !== undefined)
            .map((field) => (typeof field === 'number' ? field : field!.column)),
        ),
      ].filter((column) => column >= 0 && column < source.fields.length)
    : [];
  const fields = values?.fields?.map((field, i) => {
    const descriptor = source.fields[fieldColumns[i]];
    const labels =
      descriptor?.kind === 'encoding' ? view.ingested.encodings.get(descriptor.key) : undefined;
    return { ...field, value: labels?.[field.value] ?? field.value };
  });
  const point: ChartPoint<Row> = {
    seriesId: view.ingested.seriesIds[si],
    label: series.label,
    row: source.rows?.[at],
    rowIndex: source.index ? (source.index[at] ?? index) : source.evicted + index,
    rowId: source.rowIds?.[at],
    x: actualX,
    y,
    formattedX: values?.formattedX ?? format(view, axis, x),
    formattedY: values?.formattedY ?? readout(view, series.yAxis ?? 'y', y),
    color: values?.color ?? view.engine.getLegendItems()[si]?.color ?? '',
    ...(values?.xRange ? { xRange: { ...values.xRange } } : {}),
    ...(values?.yRange ? { yRange: { ...values.yRange } } : {}),
    ...(values?.radius !== undefined ? { radius: values.radius } : {}),
    ...(fields ? { fields } : {}),
  };
  // A heatmap cell: its value is the third coordinate, which the series format writes.
  if (values?.value !== undefined) {
    point.value = values.value;
    point.formattedValue = values.formattedValue ?? '';
    if (values.bin !== undefined) point.bin = values.bin;
  }
  const formatter = view.normalized.series[si]?.format;
  if (formatter && point.value !== undefined) point.formattedValue = formatter(point.value, point);
  else if (formatter) point.formattedY = formatter(y, point);
  return point;
}
/** A value readout at value precision (plan P9); the axis format still wins here. */
function readout<Row>(view: PointView<Row>, axis: string, value: number): string {
  if (!Number.isFinite(value)) return '';
  const formatter = view.ingested.spec.axes?.[axis]?.format;
  return formatter ? formatter(value) : view.engine.formatReadout(axis, value);
}
/** An X readout through the one formatter: the axis format, else a time or value-precision readout. */
function format<Row>(view: PointView<Row>, axis: string, value: number): string {
  if (!Number.isFinite(value)) return '';
  return formatX(view.engine, value, axis);
}
/** The values under the cursor, or at a fallback position, computed when asked. */
export function cursorSnapshot<Row>(
  view: PointView<Row>,
  options?: CursorOptions,
): CursorSnapshot<Row> {
  const snapshot = view.engine.getCursorSnapshot(options);
  return Object.freeze({
    x:
      snapshot.dataX === null
        ? null
        : (view.ingested.categories.get('x')?.labels.get(Math.round(snapshot.dataX)) ??
          snapshot.dataX),
    formattedX: snapshot.formattedX,
    source: snapshot.source,
    points: Object.freeze(
      snapshot.points.map((point) =>
        Object.freeze(
          chartPoint(
            view,
            point.seriesIndex,
            point.dataIndex,
            point.cell
              ? {
                  x: point.dataX,
                  y: point.cell.y,
                  xRange: point.cell.xRange,
                  yRange: point.cell.yRange,
                  value: point.value,
                  formattedX: point.cell.formattedX,
                  formattedY: point.cell.formattedY,
                  formattedValue: point.formattedValue,
                  bin: point.cell.bin,
                  color: point.color,
                }
              : {
                  x: point.dataX,
                  y: point.value,
                  formattedY: point.formattedValue,
                  color: point.color,
                },
          ),
        ),
      ),
    ),
    activeSeriesId:
      snapshot.activeSeriesIndex === null
        ? null
        : view.ingested.seriesIds[snapshot.activeSeriesIndex],
  });
}

/**
 * A `selection:change` value: the selection and the points it covers (plan §4.4). `points` is a
 * getter, so a brush over a long stream costs nothing unless a listener reads it.
 */
export function selectionWithPoints<Row>(
  view: PointView<Row>,
  selection: Selection,
): SelectionChange<Row> {
  const range = view.engine.getSelection();
  let points: readonly ChartPoint<Row>[] | undefined;
  const value = { ...selection } as SelectionChange<Row>;
  Object.defineProperty(value, 'points', {
    enumerable: true,
    get: () =>
      (points ??= Object.freeze(
        range
          ? pointsInSelection(view.engine, range.x, range.y).map((point) =>
              chartPoint(view, point.seriesIndex, point.dataIndex, point),
            )
          : [],
      )),
  });
  return Object.freeze(value);
}

/**
 * The static legend items of a series coloured by category (plan §5.6): each category and its
 * colour, for the first visible series that has them.
 */
export function categoryItems<Row>(view: PointView<Row>): { label: string; color: string }[] {
  const series = view.ingested.spec.series;
  for (const spec of series) {
    const colorBy = spec.colorBy;
    if (spec.visible === false || typeof colorBy !== 'object') continue;
    if (colorBy.type !== 'category' || !colorBy.categoryValues || !colorBy.format) continue;
    const palette = (colorBy.palette ?? view.engine.categoricalPalette()).map((color) =>
      view.engine.resolveColor(color),
    );
    const format = colorBy.format;
    return colorBy.categoryValues.map((code, i) => ({
      label: format(code),
      color: palette[i % palette.length],
    }));
  }
  return [];
}
