/**
 * The three metric panels: training loss (log scale, raw and smoothed), validation loss and
 * validation accuracy. One group links their cursors and their X zoom; every series brings its
 * own data, so the per-epoch validation rows and the per-20-steps training rows never share a
 * table full of gaps.
 */
import { type ReactNode, useMemo } from 'react';
import {
  Chart,
  type ChartGroup,
  type ChartHandle,
  type ChartPoint,
  type ReferenceLine,
  type SeriesOptions,
  type Viewport,
} from 'snaplot/react';
import { pct } from './answer';
import { type Logs, trainColumns } from './logs';
import type { Pin } from './url';

/** The two run colours, used by every chart, the run list and both tables (plan §10.2). */
export const RUN_COLORS: Readonly<Record<string, string>> = { A: '#1F4FB0', B: '#D2492A' };

/**
 * The page is light whatever the OS says, so the charts are pinned to light roles, on the white
 * of their panels, in the page's typeface.
 */
const THEME = {
  mode: 'light',
  surface: '#ffffff',
  fontFamily: 'Roboto, system-ui, sans-serif',
} as const;

type Key = 'train' | 'validation' | 'accuracy';

interface Props {
  logs: Logs;
  group: ChartGroup;
  smoothing: number;
  viewport: Viewport;
  onViewportChange: (viewport: Viewport) => void;
  pins: readonly Pin[];
  onPin: (pin: Pin) => void;
  hidden: readonly string[];
  refs: Record<Key, (chart: ChartHandle | null) => void>;
}

export function MetricCharts(props: Props) {
  const { logs, smoothing, pins, hidden } = props;

  // The raw curves never change; only the smoothed ones follow the slider. Memoised, so a
  // re-render for any other reason hands the chart the same arrays and costs nothing.
  const raw = useMemo(() => logs.runs.map((run) => trainColumns(logs, run.id, 0)), [logs]);
  const smoothed = useMemo(
    () => logs.runs.map((run) => trainColumns(logs, run.id, smoothing)),
    [logs, smoothing],
  );
  const trainSeries = useMemo<SeriesOptions[]>(
    () =>
      logs.runs.flatMap(({ id }, i) => [
        {
          id: `${id}-raw`,
          label: `${id} raw`,
          data: raw[i],
          y: 'loss',
          color: RUN_COLORS[id],
          opacity: 0.25,
          lineWidth: 1,
        },
        { id, label: `${id} smoothed`, data: smoothed[i], y: 'loss', color: RUN_COLORS[id] },
      ]),
    [logs, raw, smoothed],
  );
  const lossSeries = useMemo(() => validationSeries(logs, 'valLoss'), [logs]);
  const accSeries = useMemo(() => validationSeries(logs, 'valAcc'), [logs]);

  // Each pinned checkpoint is a vertical line on all three charts.
  const referenceLines = useMemo<ReferenceLine[]>(
    () =>
      pins.map((p) => ({
        axis: 'x',
        value: p.epoch,
        label: `${p.run} · ${p.epoch}`,
        color: RUN_COLORS[p.run],
        dash: [3, 3],
      })),
    [pins],
  );
  const onPointClick = (point: ChartPoint) =>
    props.onPin({ run: point.seriesId, epoch: Number(point.x) });

  const x = { min: 0, max: logs.epochs, title: 'Epoch' };
  const shared = {
    x: 'epoch',
    group: props.group,
    theme: THEME,
    legend: false,
    viewport: props.viewport,
    onViewportChange: props.onViewportChange,
    referenceLines,
  } as const;

  return (
    <>
      <Panel title="train/loss" note={`log scale · smoothed ${smoothing.toFixed(2)}, raw faint`}>
        <Chart
          {...shared}
          ref={props.refs.train}
          ariaLabel="Training loss of each run by epoch, log scale"
          series={trainSeries}
          hiddenSeries={hidden.flatMap((id) => [id, `${id}-raw`])}
          axes={{ x, y: { type: 'log', title: 'Cross-entropy' } }}
        />
      </Panel>
      <Panel title="val/loss" note="after each epoch, 1,797 images">
        <Chart
          {...shared}
          ref={props.refs.validation}
          ariaLabel="Validation loss of each run by epoch"
          series={lossSeries}
          hiddenSeries={hidden}
          axes={{ x, y: { title: 'Cross-entropy', format: { maximumFractionDigits: 4 } } }}
          onPointClick={onPointClick}
        />
      </Panel>
      <Panel title="val/accuracy" note={`best ${bestAccuracy(logs)}`}>
        <Chart
          {...shared}
          ref={props.refs.accuracy}
          ariaLabel="Validation accuracy of each run by epoch"
          series={accSeries}
          hiddenSeries={hidden}
          axes={{
            x,
            y: { format: { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 } },
          }}
          onPointClick={onPointClick}
        />
      </Panel>
    </>
  );
}

/** One series per run over its own per-epoch rows. */
function validationSeries(logs: Logs, y: 'valLoss' | 'valAcc'): SeriesOptions[] {
  return logs.runs.map(({ id }) => ({
    id,
    label: id,
    data: logs.val.get(id) ?? [],
    y,
    color: RUN_COLORS[id],
  }));
}

function Panel(props: { title: string; note: string; children: ReactNode }) {
  return (
    <figure className="r1-panel">
      <figcaption>
        <h2>{props.title}</h2>
        <span className="r1-panel-note">{props.note}</span>
      </figcaption>
      <div className="r1-chart">{props.children}</div>
    </figure>
  );
}

/** "A 96.1% · B 97.7%": each run's highest validation accuracy. */
function bestAccuracy(logs: Logs): string {
  return logs.runs
    .map((run) => {
      const rows = logs.val.get(run.id) ?? [];
      return `${run.id} ${pct(Math.max(...rows.map((r) => r.valAcc)))}`;
    })
    .join(' · ');
}
