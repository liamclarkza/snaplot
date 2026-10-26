/**
 * "Which checkpoint should we ship?" (plan §10.2, R1). Two training runs of a digit classifier,
 * compared the way TensorBoard and Weights & Biases compare runs: three linked charts on the
 * left, a decision panel on the right that computes the answer from the logs.
 *
 * What it shows of snaplot/react: three <Chart>s in one group; state options kept in the URL
 * (the zoom, through `viewport` and `onViewportChange`); derived data memoised with useMemo
 * (the smoothing slider); useChartState, useCursor and <LegendTable>; and StrictMode, which
 * mounts every chart twice in development.
 */
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { type ChartHandle, createChartGroup, useChartState, type Viewport } from 'snaplot/react';
import { type Criterion, decide } from './answer';
import { DecisionPanel } from './DecisionPanel.react';
import { describeRun, type Logs, loadLogs } from './logs';
import { MetricCharts } from './MetricCharts.react';
import { type Pin, readUrl, togglePin, writeUrl } from './url';

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');
const DEFAULT_SMOOTHING = 0.9;

export default function PickACheckpoint() {
  return (
    <StrictMode>
      <Workspace />
    </StrictMode>
  );
}

function Workspace() {
  const [logs, setLogs] = useState<Logs | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadLogs(BASE).then(
      (loaded) => live && setLogs(loaded),
      (reason: unknown) => live && setError(String(reason)),
    );
    return () => {
      live = false;
    };
  }, []);
  if (error) return <p role="alert">The training logs did not load ({error}). Reload to retry.</p>;
  if (!logs) return <p className="r1-loading">Loading the training logs…</p>;
  return <Comparison logs={logs} />;
}

function Comparison({ logs }: { logs: Logs }) {
  const initial = useMemo(() => readUrl(location.search), []);
  const recommended = useMemo(() => {
    const { ship } = decide(logs.allVal);
    return [{ run: ship.run, epoch: ship.epoch }];
  }, [logs]);
  const [epochs, setEpochs] = useState(initial.epochs);
  // A pin from the URL counts only if the logs have that run and epoch.
  const [pins, setPins] = useState<readonly Pin[]>(
    () =>
      initial.pins?.filter((p) => logs.val.get(p.run)?.some((r) => r.epoch === p.epoch)) ??
      recommended,
  );
  const [smoothing, setSmoothing] = useState(initial.smoothing ?? DEFAULT_SMOOTHING);
  const [by, setBy] = useState<Criterion>(initial.by ?? 'valLoss');
  const [hidden, setHidden] = useState<readonly string[]>([]);
  const [group] = useState(() => createChartGroup());
  const [train, setTrain] = useState<ChartHandle | null>(null);
  const [validation, setValidation] = useState<ChartHandle | null>(null);
  const [accuracy, setAccuracy] = useState<ChartHandle | null>(null);
  const coarse = useCoarsePointer();

  // The URL holds what differs from the defaults, so a link or a reload shows this view.
  useEffect(() => {
    const samePins =
      pins.length === recommended.length &&
      pins.every((p, i) => p.run === recommended[i]?.run && p.epoch === recommended[i]?.epoch);
    const query = writeUrl({
      epochs,
      pins: samePins ? undefined : pins,
      smoothing: smoothing === DEFAULT_SMOOTHING ? undefined : smoothing,
      by,
    });
    history.replaceState(null, '', query || location.pathname);
  }, [epochs, pins, smoothing, by, recommended]);

  // The handles go on `window.charts`, so the console can try the API on this page; the
  // data-demo-ready flag tells screenshot tools that every chart has painted.
  useEffect(() => {
    if (!train || !validation || !accuracy) return;
    (window as unknown as { charts: object }).charts = { train, validation, accuracy };
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        document.documentElement.dataset.demoReady = '';
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [train, validation, accuracy]);

  const viewport = useMemo<Viewport>(() => (epochs ? { x: epochs } : {}), [epochs]);
  const onViewportChange = (next: Viewport) => {
    const x = next.x;
    setEpochs(x ? [Number(x[0]), Number(x[1])] : undefined);
  };
  const onPin = (pin: Pin) => setPins((current) => togglePin(current, pin));

  return (
    <div className="r1-grid">
      <section className="r1-charts" aria-label="Metrics by epoch">
        <div className="r1-toolbar">
          <RunList
            logs={logs}
            chart={validation}
            hidden={hidden}
            onToggle={(id) =>
              setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]))
            }
          />
          <label className="r1-smoothing">
            <span>Smoothing</span>
            <input
              type="range"
              min={0}
              max={0.99}
              step={0.01}
              value={smoothing}
              onChange={(event) => setSmoothing(Number(event.currentTarget.value))}
            />
            <output className="num">{smoothing.toFixed(2)}</output>
          </label>
        </div>
        <MetricCharts
          logs={logs}
          group={group}
          smoothing={smoothing}
          viewport={viewport}
          onViewportChange={onViewportChange}
          pins={pins}
          onPin={onPin}
          hidden={hidden}
          refs={{ train: setTrain, validation: setValidation, accuracy: setAccuracy }}
        />
        <p className="r1-help">
          {coarse
            ? 'Tap a validation point to pin its epoch. Pinch a chart to zoom; double-tap to reset.'
            : 'Click a validation point to pin its epoch. Drag across a chart to zoom, Shift+drag to pan, double-click to reset.'}
        </p>
      </section>
      <DecisionPanel
        logs={logs}
        by={by}
        onBy={setBy}
        pins={pins}
        onPin={onPin}
        validation={validation}
      />
    </div>
  );
}

/** The runs, with their settings; the checkbox shows or hides a run on every chart. */
function RunList(props: {
  logs: Logs;
  chart: ChartHandle | null;
  hidden: readonly string[];
  onToggle: (id: string) => void;
}) {
  // The swatches take each run's colour from the chart, never from a copy in CSS.
  const series = useChartState(props.chart, (state) => state.series);
  return (
    <ul className="r1-runs" aria-label="Runs">
      {props.logs.runs.map((run) => {
        const color = series?.find((s) => s.id === run.id)?.color;
        return (
          <li key={run.id}>
            <label>
              <input
                type="checkbox"
                checked={!props.hidden.includes(run.id)}
                onChange={() => props.onToggle(run.id)}
              />
              <svg className="r1-swatch" viewBox="0 0 10 10" aria-hidden="true">
                <rect width="10" height="10" rx="2" fill={color ?? 'transparent'} />
              </svg>
              <span className="r1-run-name">
                {run.id} <span className="r1-run-label">{run.name}</span>
              </span>
              <span className="r1-run-config">{describeRun(run)}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/** Whether the main pointer is a finger, so the help names the gestures the reader has. */
function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => matchMedia('(pointer: coarse)').matches);
  useEffect(() => {
    const query = matchMedia('(pointer: coarse)');
    const update = () => setCoarse(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return coarse;
}
