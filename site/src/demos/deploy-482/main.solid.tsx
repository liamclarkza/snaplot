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
  STREAMING,
  sloLine,
  traffic,
} from './charts';
import { type Columns, EDGES, NAMES, createIncident, stem } from './incident';
import { parseSeed } from './simulator';
import { Peaks, STEPS, steadyMax } from './steady';
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
  const base = {
    latency: latency(history.latency, group),
    errors: errors(history.errors, group),
    traffic: traffic(history.traffic, group),
  };

  // Steady value axes (steady.ts): each panel's peak per second, by endpoint, and the maximum
  // each axis shows, which moves only in nice steps.
  const peaks = {
    latency: new Map(NAMES.map((name) => [name, new Peaks()])),
    errors: new Map(NAMES.map((name) => [name, new Peaks()])),
    traffic: new Peaks(),
  };
  const note = (rows: { latency: Columns; errors: Columns; traffic: Columns }) => {
    const { time } = rows.latency.columns;
    for (let i = 0; i < time.length; i++) {
      let requests = 0;
      for (const name of NAMES) {
        const s = stem(name);
        peaks.latency.get(name)?.push(time[i], rows.latency.columns[`${s}_p99`][i]);
        peaks.errors.get(name)?.push(time[i], rows.errors.columns[s][i]);
        requests = Math.max(requests, rows.traffic.columns[s][i]);
      }
      peaks.traffic.push(time[i], requests);
    }
  };
  note(history);
  const [maxima, setMaxima] = createSignal<{ latency?: number; errors?: number; traffic?: number }>(
    {},
  );
  const steady = () => {
    const since = incident.now - STREAMING.followWindow;
    const current = maxima();
    const name = endpoint();
    const next = {
      latency: steadyMax(current.latency, peaks.latency.get(name)!.maxSince(since), STEPS.latency),
      errors: steadyMax(current.errors, peaks.errors.get(name)!.maxSince(since), STEPS.errors),
      traffic: steadyMax(current.traffic, peaks.traffic.maxSince(since), STEPS.traffic),
    };
    // Most seconds leave every axis where it was: no new options then.
    if (
      next.latency !== current.latency ||
      next.errors !== current.errors ||
      next.traffic !== current.traffic
    )
      setMaxima(next);
  };
  steady();
  /** A panel's value axis: its steady maximum while following, its own range once you look back. */
  const valueAxis = (panel: 'latency' | 'errors' | 'traffic') => {
    const { axes } = base[panel];
    const y = axes?.y ?? {};
    const max = following() ? maxima()[panel] : undefined;
    return { ...axes, y: { ...y, ...(panel === 'latency' ? { min: 10 } : {}), max } };
  };

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

  // The replay, on the display's frames: `speed` simulated seconds pass per real second, and
  // each frame appends the whole seconds that are due (one every sixth frame at 10×, one a frame
  // at 60×), so the panels move on an even beat instead of a timer's uneven one.
  let carry = 0;
  let last = performance.now();
  let frame = 0;
  const tick = (now: number) => {
    const dt = Math.min(250, now - last);
    last = now;
    frame = requestAnimationFrame(tick);
    if (paused() || !charts.latency || !charts.errors || !charts.traffic) return;
    carry += (speed() * dt) / 1000;
    const seconds = Math.floor(carry);
    if (seconds === 0) return;
    carry -= seconds;
    const rows = incident.advance(seconds);
    note(rows);
    steady();
    charts.latency.appendData(rows.latency);
    charts.errors.appendData(rows.errors);
    charts.traffic.appendData(rows.traffic);
    setNow(incident.now);
  };
  frame = requestAnimationFrame(tick);
  onCleanup(() => cancelAnimationFrame(frame));
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
          <select
            value={endpoint()}
            onChange={(e) => {
              setEndpoint(e.currentTarget.value);
              // Another endpoint's axes start from its own peaks.
              setMaxima({});
              steady();
            }}
          >
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
              {...base.latency}
              axes={valueAxis('latency')}
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
              {...base.errors}
              axes={valueAxis('errors')}
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
              {...base.traffic}
              axes={valueAxis('traffic')}
              referenceLines={deployLines(deploys(), false)}
              ariaLabel="Requests per second by endpoint"
              data-chart="traffic"
              ref={(c) => (charts.traffic = c)}
            />
          </div>
        </section>
        <section class="panel area-change" aria-labelledby="change-title">
          <h2 id="change-title">p99 change by endpoint, {selected()}</h2>
          <p class="panel-note">The grey band is within ±20%: unchanged.</p>
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
