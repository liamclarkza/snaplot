/**
 * One metric's card: its name, the chart of every shown run (each bucket's mean as a line, its
 * min and max as a band), and the values at the cursor under it (each run's latest when the
 * cursor is elsewhere). Expanding opens the card as a modal.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Chart,
  type ChartGroup,
  type ChartHandle,
  type LegendTableColumn,
  LegendTable,
  type ReferenceLine,
  type SeriesOptions,
  useChartState,
  useCursor,
} from 'snaplot/react';
import { bucketed, COLORS, fmt, type MetricName, STEPS, stepsOf } from './runs';

/** The charts take the page's tokens: its surface, text and muted greys and its accent. */
const THEME = {
  mode: 'dark',
  surface: '#1f1f1f',
  text: '#cccccc',
  muted: '#9d9d9d',
  accent: '#ff8552',
  fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontSize: 11,
} as const;
const WARN = '#ff5c7a';
/** Buckets a training metric is drawn in: about one per two pixels of a wide card. */
const BUCKETS = 300;

const EXPAND = 'M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7';
const COLLAPSE = 'M20 10h-6V4M4 14h6v6M14 10l7-7M10 14l-7 7';

const lineCell = (_: unknown, series: { color: string }) => {
  const line = document.createElement('span');
  line.className = 'xt-line';
  line.style.background = series.color;
  return line;
};
const COLUMNS: readonly LegendTableColumn[] = [
  { header: 'Line', value: lineCell },
  { header: 'Run', value: (_, series) => series.label },
  { header: 'Value', value: (point) => fmt(point?.y) },
];

interface Props {
  metric: MetricName;
  values: ReadonlyMap<string, Float64Array>;
  runs: readonly string[];
  group: ChartGroup;
  highlight: string | null;
  onReady: (chart: ChartHandle | null) => void;
}

export function ChartCard({ metric, values, runs, group, highlight, onReady }: Props) {
  const chart = useRef<ChartHandle>(null);
  const [full, setFull] = useState(false);
  const cursor = useCursor(chart, { fallback: 'latest' });
  // The handle, once the chart has mounted, for the page's ready mark and its tests.
  const mounted = useChartState(chart, () => true);
  useEffect(() => {
    if (mounted) onReady(chart.current);
    return () => onReady(null);
  }, [mounted, onReady]);

  const { rows, nonFinite } = useMemo(
    () => bucketed(values, metric, stepsOf(metric) > 1 ? STEPS / stepsOf(metric) : BUCKETS),
    [values, metric],
  );
  const series = useMemo<SeriesOptions[]>(
    () =>
      runs.map((run) => ({
        type: 'band',
        id: run,
        label: run,
        y: run,
        lower: `${run}·min`,
        upper: `${run}·max`,
        color: COLORS[run],
        lineWidth: 1.5,
        opacity: 0.12,
      })),
    [runs],
  );
  // The step at which a shown run first logged a non-finite value, marked on the chart.
  const referenceLines = useMemo<ReferenceLine[]>(
    () =>
      [...nonFinite]
        .filter(([run]) => runs.includes(run))
        .map(([run, step]) => ({ axis: 'x', value: step, label: `${run}: NaN`, color: WARN })),
    [nonFinite, runs],
  );

  useEffect(() => {
    if (!full) return;
    const close = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false);
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [full]);

  return (
    <>
      {full && (
        <button
          type="button"
          className="xt-scrim"
          aria-label="Close"
          onClick={() => setFull(false)}
        />
      )}
      <article className={full ? 'xt-chart full' : 'xt-chart'} data-metric={metric}>
        <header className="xt-chart-head">
          <h2>{metric}</h2>
          <button
            type="button"
            className="xt-icon"
            title={full ? 'Close' : 'Expand'}
            aria-label={full ? 'Close' : 'Expand'}
            onClick={() => setFull(!full)}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={full ? COLLAPSE : EXPAND} />
            </svg>
          </button>
        </header>
        <div className="xt-plot">
          <Chart
            ref={chart}
            data={rows}
            x="x"
            series={series}
            axes={{
              x: { format: { maximumFractionDigits: 0 }, min: 0, max: STEPS },
            }}
            referenceLines={referenceLines}
            group={group}
            theme={THEME}
            legend={false}
            tooltip={false}
            highlight={highlight !== null && runs.includes(highlight) ? highlight : null}
            interaction={{ zoom: 'x', drag: 'zoom', bounds: 'data' }}
            ariaLabel={`${metric} by step for ${runs.length} runs`}
          />
        </div>
        <div className="xt-readout">
          <div className="xt-step num">Step: {cursor?.points.length ? cursor.formattedX : ''}</div>
          <LegendTable className="xt-legend" chart={chart} columns={COLUMNS} fallback="latest" />
        </div>
      </article>
    </>
  );
}
