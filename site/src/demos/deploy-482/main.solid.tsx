/** @jsxImportSource solid-js */
/**
 * "Did deploy #482 cause the p99 spike?" (plan §10.2, S2): an incident dashboard for the on-call
 * engineer paged at 03:12. Three linked panels stream the simulated service; the verdict banner
 * answers the question from answer.ts, and Roll back injects the rollback the service recovers
 * from. Everything here is simulated, and the page says so.
 */
import {
  Chart,
  type ChartHandle,
  type LegendTableColumn,
  LegendTable,
  createChartGroup,
  histogram,
} from 'snaplot/solid';
import { For, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import {
  change,
  changeRows,
  deployLines,
  distribution,
  distributionSeries,
  errorSeries,
  errors,
  latency,
  latencySeries,
  sloLine,
  traffic,
} from './charts';
import { EDGES, NAMES, createIncident } from './incident';
import { parseSeed } from './simulator';
import { Verdict } from './Verdict.solid';

const SPEEDS = [1, 10, 60];
const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
export const utc = (t: number) => clock.format(t);

/** Handles for the end-to-end spec and the thumbnail script (site/tests/examples). */
const charts: Partial<
  Record<'latency' | 'errors' | 'traffic' | 'change' | 'distribution', ChartHandle>
> = {};
Object.assign(globalThis, { snaplotDemo: { slug: 'deploy-482', charts } });

export default function Dashboard() {
  const params = new URLSearchParams(location.search);
  const seed = parseSeed(location.search);
  const { incident, history } = createIncident(seed);
  const group = createChartGroup();
  const [now, setNow] = createSignal(incident.now);
  const [deploys, setDeploys] = createSignal([...incident.deploys]);
  const [endpoint, setEndpoint] = createSignal('/search');
  const [selected, setSelected] = createSignal('#482');
  const [following, setFollowing] = createSignal(true);
  const [speed, setSpeed] = createSignal(
    SPEEDS.includes(Number(params.get('speed'))) ? Number(params.get('speed')) : 10,
  );
  const [paused, setPaused] = createSignal(params.has('paused'));
  const [latencyChart, setLatencyChart] = createSignal<ChartHandle>();
  const touch = matchMedia('(pointer: coarse)').matches;

  /** A deploy's summary; frozen summaries keep their identity, so memos settle. */
  const summary = (id: string) => {
    now();
    deploys();
    return incident.summary(id);
  };
  const chosen = createMemo(() => summary(selected()));
  const bins = createMemo(() => {
    const s = chosen();
    const name = endpoint();
    return {
      before: histogram(s?.before.get(name) ?? [], { thresholds: EDGES }),
      after: histogram(s?.after.get(name) ?? [], { thresholds: EDGES }),
    };
  });
  /** The table's last column: each percentile's median over the 5 minutes before the deploy. */
  const columns = createMemo<LegendTableColumn[]>(() => {
    const s = chosen();
    const name = endpoint();
    return [
      'swatch',
      'name',
      'value',
      {
        header: `Median 5 min before ${selected()}`,
        align: 'right',
        value: (_, series) => {
          const b = s?.baseline.get(name)?.[series.id as 'p50' | 'p95' | 'p99'];
          return b === undefined || Number.isNaN(b) ? '' : `${Math.round(b)} ms`;
        },
      },
    ];
  });

  // The replay: one simulated second per 100 ms at 10×, appended to the three panels.
  let carry = 0;
  const timer = setInterval(() => {
    if (paused() || !charts.latency || !charts.errors || !charts.traffic) return;
    carry += speed() / 10;
    const seconds = Math.floor(carry);
    if (seconds === 0) return;
    carry -= seconds;
    const rows = incident.advance(seconds);
    charts.latency.appendData(rows.latency);
    charts.errors.appendData(rows.errors);
    charts.traffic.appendData(rows.traffic);
    setNow(incident.now);
  }, 100);
  onCleanup(() => clearInterval(timer));
  onMount(() =>
    requestAnimationFrame(() => {
      document.documentElement.dataset.demoReady = 'true';
    }),
  );

  const rollBack = () => {
    if (incident.rollback()) setDeploys([...incident.deploys]);
  };
  const pick = (id: string) => {
    setSelected(id);
    const deploy = deploys().find((d) => d.id === id);
    if (deploy) group.setCursor(deploy.time);
  };

  return (
    <div class="dashboard">
      <header class="topbar">
        <h1>shop-web production</h1>
        <span class="tag">Simulated service · seed {seed}</span>
        <span class="paged">Paged 03:12 UTC</span>
        <label class="field">
          Endpoint
          <select value={endpoint()} onChange={(e) => setEndpoint(e.currentTarget.value)}>
            <For each={NAMES}>{(name) => <option value={name}>{name}</option>}</For>
          </select>
        </label>
        <label class="field">
          Replay
          <select value={String(speed())} onChange={(e) => setSpeed(Number(e.currentTarget.value))}>
            <For each={SPEEDS}>{(s) => <option value={String(s)}>{s}×</option>}</For>
          </select>
        </label>
        <button
          type="button"
          class="pause"
          aria-pressed={paused()}
          onClick={() => setPaused(!paused())}
        >
          {paused() ? 'Resume' : 'Pause'}
        </button>
        <span class="clock num" role="timer" aria-label="Simulated time">
          {utc(now() - 1000)} UTC
        </span>
        <Show
          when={!following()}
          fallback={
            <span class="live" data-following="true">
              Following
            </span>
          }
        >
          <button type="button" class="back" onClick={() => latencyChart()?.resumeFollow()}>
            Back to live
          </button>
        </Show>
      </header>

      <ol class="deploys" aria-label="Deploys">
        <For each={deploys()}>
          {(d) => (
            <li>
              <button type="button" aria-pressed={selected() === d.id} onClick={() => pick(d.id)}>
                <span class="num">{utc(d.time)}</span> <b>{d.id}</b>{' '}
                {d.label.replace(`${d.id} `, '')}
              </button>
            </li>
          )}
        </For>
      </ol>

      <Verdict
        answer={summary('#482')}
        rollback={deploys().find((d) => d.kind === 'rollback')}
        rollbackSummary={(id) => summary(id)}
        onRollBack={rollBack}
        utc={utc}
      />

      <div class="grid">
        <section class="panel area-latency" aria-labelledby="latency-title">
          <h2 id="latency-title">Latency, {endpoint()}</h2>
          <div class="plot">
            <Chart
              {...latency(history.latency, group)}
              series={latencySeries(endpoint())}
              referenceLines={deployLines(deploys())}
              ariaLabel={`p50, p95 and p99 latency of ${endpoint()} per second`}
              data-chart="latency"
              onFollowingChange={setFollowing}
              ref={(c) => {
                charts.latency = c;
                setLatencyChart(c);
              }}
            />
          </div>
        </section>
        <section class="panel area-errors" aria-labelledby="errors-title">
          <h2 id="errors-title">Errors, {endpoint()}</h2>
          <div class="plot">
            <Chart
              {...errors(history.errors, group)}
              series={errorSeries(endpoint())}
              referenceLines={[...deployLines(deploys(), false), sloLine]}
              ariaLabel={`Share of ${endpoint()} requests that failed, per second, against the 1% SLO`}
              data-chart="errors"
              ref={(c) => (charts.errors = c)}
            />
          </div>
        </section>
        <section class="panel area-traffic" aria-labelledby="traffic-title">
          <h2 id="traffic-title">Requests per second</h2>
          <div class="plot">
            <Chart
              {...traffic(history.traffic, group)}
              referenceLines={deployLines(deploys(), false)}
              ariaLabel="Requests per second by endpoint"
              data-chart="traffic"
              ref={(c) => (charts.traffic = c)}
            />
          </div>
        </section>
        <section class="panel area-change" aria-labelledby="change-title">
          <h2 id="change-title">p99 change by endpoint, {selected()}</h2>
          <div class="plot">
            <Chart
              {...change}
              data={changeRows(chosen()?.verdict.changes ?? [])}
              ariaLabel={`Change in median p99 by endpoint, 5 minutes before against 2 minutes after ${selected()}`}
              data-chart="change"
              ref={(c) => (charts.change = c)}
            />
          </div>
        </section>
        <section class="panel area-distribution" aria-labelledby="distribution-title">
          <h2 id="distribution-title">
            {endpoint()} latency around {selected()}
          </h2>
          <div class="plot">
            <Chart
              {...distribution}
              series={distributionSeries(bins().before, bins().after)}
              ariaLabel={`Latency distribution of ${endpoint()}, 2 minutes before and after ${selected()}`}
              data-chart="distribution"
              ref={(c) => (charts.distribution = c)}
            />
          </div>
        </section>
        <section class="panel area-table" aria-labelledby="table-title">
          <h2 id="table-title">At the cursor, {endpoint()}</h2>
          <LegendTable chart={latencyChart} columns={columns()} fallback="latest" class="values" />
        </section>
      </div>
      <p class="hint">
        {touch
          ? 'Touch a panel to read every panel at that second; pinch to zoom. Back to live returns to the latest data.'
          : 'Hover a panel to read every panel at that second. Drag across a stretch to zoom in, Shift-drag to look back, double-click to see it all; Back to live returns to the latest data.'}
      </p>
    </div>
  );
}
