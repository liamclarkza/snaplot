/**
 * Compile-only contract of the public types (plan §12 M7, dataapi-08, dxtrial-05,
 * gap-annotations-extensibility-12): the documented typed-row patterns compile,
 * and the mistakes they should catch are type errors. Never executed.
 */
import {
  type AxisOptions,
  type ChartHandle,
  type ChartOptions,
  type ChartPlugin,
  type CursorSnapshot,
  createChart,
  createChartGroup,
  histogram,
  type SelectionChange,
  type Viewport,
} from '../index';

interface Sample {
  time: Date;
  cpu: number;
  mem: number;
  low: number;
  high: number;
  phase: string;
  id: string;
}
interface Loss {
  step: number;
  loss: number;
}
interface Accuracy {
  step: number;
  acc: number;
}

export function contract(el: HTMLElement, samples: Sample[], losses: Loss[], accs: Accuracy[]) {
  // Typed rows: fields are checked, accessors see the row.
  const chart = createChart(el, {
    data: samples,
    x: 'time',
    rowId: 'id',
    group: createChartGroup(),
    series: [
      { y: 'cpu', label: 'CPU', color: '#0072b2', dash: [4, 2] },
      { id: 'spread', type: 'band', y: 'cpu', lower: 'low', upper: 'high' },
      { id: 'scaled', y: (row) => row.mem / 1e9, format: { suffix: ' GB' } },
    ],
    axes: { y: { title: 'CPU', format: (value) => `${value.toFixed(1)}%` } },
    onPointClick: (point) => {
      point.row?.cpu.toFixed();
      point.rowId?.toString();
    },
  });
  chart.on('point:click', (point) => point.row?.phase.toUpperCase());

  // A separately declared options object.
  const options = {
    data: samples,
    x: 'time',
    series: [{ y: 'cpu', type: 'area' }],
  } satisfies ChartOptions<Sample>;
  createChart(el, options);

  // Series built with .map(), each with its own rows.
  const runs = [{ id: 'a', name: 'Run A', samples: losses }];
  const series = runs.map((run) => ({ id: run.id, label: run.name, data: run.samples, y: 'loss' }));
  createChart(el, { x: 'step', series });

  // Per-series data of different row shapes.
  createChart(el, {
    x: 'step',
    series: [
      { id: 'loss', data: losses, y: 'loss' },
      { id: 'acc', data: accs, y: (row) => row.acc },
    ],
  });

  // Plugins are row-agnostic: a plain plugin and a generic factory keep Row inferred from data.
  const plugin: ChartPlugin = { id: 'readout' };
  function note<Row>(at: number): ChartPlugin<Row> {
    return { id: `note-${at}` };
  }
  createChart(el, { data: samples, x: 'time', series: [{ y: 'cpu' }], plugins: [plugin, note(1)] });

  // A typed handle is a ChartHandle.
  const handle: ChartHandle = createChart<Loss>(el, {
    data: losses,
    x: 'step',
    series: [{ y: 'loss' }],
  });

  // Formats: functions receive numbers on value axes; Intl options and affixes.
  createChart(el, {
    data: samples,
    x: 'time',
    series: [{ y: 'cpu' }],
    axes: {
      x: { type: 'time', format: { month: 'short', day: 'numeric' } },
      y: { format: { suffix: '%' } },
      y2: { type: 'log', format: { style: 'unit', unit: 'millisecond' }, position: 'right' },
    },
  });

  // Ticks, bounds and the viewport accept Dates.
  const viewport: Viewport = { x: [new Date(2026, 0, 1), Date.UTC(2026, 0, 2)] };
  createChart(el, {
    data: samples,
    x: 'time',
    series: [{ y: 'cpu' }],
    axes: { x: { ticks: [new Date(2026, 0, 1), 1767312000000], min: new Date(2026, 0, 1) } },
    viewport,
  });

  // State callbacks type their payloads.
  createChart(el, {
    data: samples,
    x: 'time',
    series: [{ y: 'cpu' }, { y: 'mem' }],
    highlight: 'cpu',
    hiddenSeries: ['mem'],
    selection: { x: [0, 1] },
    interaction: { zoom: 'xy', drag: 'select', bounds: 'none' },
    onHighlightChange: (id) => {
      const value: string | null = id;
      void value;
    },
    onHiddenSeriesChange: (ids) => {
      const value: readonly string[] = ids;
      void value;
    },
    onFollowingChange: (following) => {
      const value: boolean = following;
      void value;
    },
    onViewportChange: (next) => {
      const value: Viewport = next;
      void value;
    },
    onSelectionChange: (selection) => {
      const value: SelectionChange<Sample> | null = selection;
      void value?.x[0];
    },
    onCursorChange: (cursor) => {
      const value: CursorSnapshot<Sample> = cursor;
      void value.points[0]?.row?.cpu;
    },
  });

  // Typed columns and histogram bins.
  createChart(el, {
    data: { columns: { time: new Float64Array([0, 1]), value: new Float64Array([2, 3]) } },
    x: 'time',
    series: [{ y: 'value' }],
  });
  createChart(el, {
    series: [{ id: 'counts', type: 'histogram', data: histogram(new Float64Array([1, 2, 3])) }],
  });

  // Mistakes are type errors.
  const invalid: ChartOptions<Sample> = {
    data: samples,
    series: [
      // @ts-expect-error a string field is not a value
      { y: 'phase' },
      // @ts-expect-error misspelled field
      { y: 'cpus' },
      // @ts-expect-error band bounds are required
      { type: 'band', y: 'cpu' },
      // @ts-expect-error column indices are not public
      { y: 'cpu', dataIndex: 1 },
      // @ts-expect-error stroke was removed in 1.0: color
      { y: 'cpu', stroke: '#000' },
    ],
  };
  const removed: ChartOptions<Sample> = {
    series: [{ y: 'cpu' }],
    // @ts-expect-error padding was removed in 1.0: gutters are measured
    padding: { left: 60 },
  };
  // @ts-expect-error a category axis takes no format
  const categoryFormat: AxisOptions = {
    type: 'category',
    format: (value: number) => String(value),
  };
  // @ts-expect-error the axis type is a union, not a string
  if (chart.getAxis('x')?.type === 'categroy') void chart;

  void handle;
  void invalid;
  void removed;
  void categoryFormat;
}
