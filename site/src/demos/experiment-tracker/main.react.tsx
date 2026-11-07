/**
 * An ML experiment tracker: five simulated pretraining runs of one project, a run list on the left
 * (an eye per run shows or hides it, hovering highlights it everywhere) and a chart per metric on
 * the right, two to a row, in one group, so the cursor and an X zoom move every chart together.
 *
 * What it shows of snaplot/react: a <Chart> per metric in one group; `highlight` driven from the
 * run list; a <LegendTable> per chart with columns of its own and the latest values when the
 * cursor is elsewhere; `useCursor` for each card's step; band series for each bucket's min and
 * max, and a reference line where a run first logged NaN.
 */
import { StrictMode, useCallback, useMemo, useState } from 'react';
import { type ChartHandle, createChartGroup } from 'snaplot/react';
import { ChartCard } from './ChartCard.react';
import { METRICS, type MetricName, RUNS, simulate } from './runs';

const EYE = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 5.5C7 5.5 3.3 8.8 1.8 12c1.5 3.2 5.2 6.5 10.2 6.5s8.7-3.3 10.2-6.5C20.7 8.8 17 5.5 12 5.5z" />
    <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
  </svg>
);
const EYE_OFF = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M2.5 9C5 12.4 8.3 14.1 12 14.1S19 12.4 21.5 9M12 14.1V18M7.6 13.4 6.3 17M16.4 13.4l1.3 3.6M4.2 11 2 13.9M19.8 11l2.2 2.9" />
  </svg>
);
/** Handles for the end-to-end spec and the thumbnail script (site/tests/examples). */
const exposed: Record<string, ChartHandle> = {};
Object.assign(globalThis, { snaplotDemo: { slug: 'experiment-tracker', charts: exposed } });

export default function ExperimentTracker() {
  return (
    <StrictMode>
      <Tracker />
    </StrictMode>
  );
}

function Tracker() {
  const values = useMemo(
    () => new Map(RUNS.map((run, i) => [run.id, simulate(run, i)] as const)),
    [],
  );
  // One metric's values by run, for its card: the same map while the runs' values hold.
  const byMetric = useMemo(
    () =>
      new Map(
        METRICS.map((metric) => [
          metric,
          new Map(RUNS.map((run) => [run.id, values.get(run.id)![metric]] as const)),
        ]),
      ),
    [values],
  );
  const [group] = useState(() =>
    createChartGroup({ cursor: true, viewport: true, highlight: true }),
  );
  const [hidden, setHidden] = useState<readonly string[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);

  const shown = RUNS.filter((run) => !hidden.includes(run.id)).map((run) => run.id);
  const toggle = (id: string) =>
    setHidden(hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id]);
  const allHidden = hidden.length === RUNS.length;

  // The page is ready for its tests and thumbnail once every chart has mounted.
  const ready = useCallback((metric: MetricName, chart: ChartHandle | null) => {
    if (chart) exposed[metric] = chart;
    else delete exposed[metric];
    if (METRICS.every((m) => exposed[m]))
      requestAnimationFrame(() => {
        document.documentElement.dataset.demoReady = 'true';
      });
  }, []);
  const readyBy = useMemo(
    () =>
      Object.fromEntries(
        METRICS.map((m) => [m, (chart: ChartHandle | null) => ready(m, chart)]),
      ) as Record<MetricName, (chart: ChartHandle | null) => void>,
    [ready],
  );

  return (
    <div className="xt">
      <header className="xt-top">
        <a className="back" href={`${import.meta.env.BASE_URL.replace(/\/?$/, '/')}examples/`}>
          ← Examples
        </a>
        <span className="sep">/</span>
        <h1>llm-pretrain</h1>
        <span className="grow" />
        <span className="note">Simulated runs</span>
      </header>
      <div className="xt-project">
        <aside className="xt-side" aria-label="Runs">
          <div className="xt-run-head">
            <button
              type="button"
              className="xt-eye"
              title={hidden.length ? 'Show all runs' : 'Hide all runs'}
              aria-label={hidden.length ? 'Show all runs' : 'Hide all runs'}
              onClick={() => setHidden(hidden.length ? [] : RUNS.map((run) => run.id))}
            >
              {allHidden ? EYE_OFF : EYE}
            </button>
            <span>Run</span>
            <span title="Time since the run started">Age</span>
          </div>
          <ul className="xt-runs" onMouseLeave={() => setHovered(null)}>
            {RUNS.map((run, index) => {
              const off = hidden.includes(run.id);
              return (
                <li key={run.id}>
                  <button
                    type="button"
                    className={`xt-run run-${index}${off ? ' off' : ''}`}
                    aria-pressed={!off}
                    title={`${off ? 'Show' : 'Hide'} ${run.id}`}
                    onClick={() => toggle(run.id)}
                    onMouseEnter={() => setHovered(run.id)}
                    onFocus={() => setHovered(run.id)}
                    onBlur={() => setHovered(null)}
                  >
                    <span className={`xt-eye${off ? ' off' : ''}`}>{off ? EYE_OFF : EYE}</span>
                    <span className="name">{run.id}</span>
                    {run.state === 'failed' ? (
                      <span className="xt-pill">failed</span>
                    ) : (
                      <span className="when num">{run.age}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
        <section className="xt-grid" aria-label="Metrics">
          {METRICS.map((metric) => (
            <ChartCard
              key={metric}
              metric={metric}
              values={byMetric.get(metric)!}
              runs={shown}
              group={group}
              highlight={hovered}
              onReady={readyBy[metric]}
            />
          ))}
        </section>
      </div>
    </div>
  );
}
