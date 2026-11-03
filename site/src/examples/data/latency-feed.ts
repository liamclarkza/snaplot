/**
 * Live /search latency for streaming examples, such as the homepage hero (plan §9, D34).
 * Source: the seeded deploy-482 service simulator (src/demos/deploy-482/simulator.ts, the S2
 * demo's model, labelled "Simulated service"), one row per simulated second and thirty rows per real
 * second, handed over on animation frames so the chart moves on the frames the screen draws. The
 * example calls `chart.appendData(rows)` with what this hands over.
 *
 * It plays only while the chart is on screen, the tab is visible and the hero is playing. Under
 * `prefers-reduced-motion` the hero starts paused (WCAG 2.2.2). The toggle the page binds with
 * `bindHeroToggle` pauses and plays every feed on the page, and follows each chart's own state: a
 * pan or a zoom stops a chart following the stream, the toggle then reads "Back to live", and
 * going back to live (or playing) calls `chart.resumeFollow()`.
 */
import type { ChartHandle } from 'snaplot';
import { createSimulator, DEFAULT_SEED } from '../../demos/deploy-482/simulator';

/** One row of the hero's chart. */
export interface Latency {
  /** Start of the one-second bucket, epoch milliseconds. */
  time: number;
  /** Median and 99th-percentile latency of /search in that second, milliseconds. */
  p50: number;
  p99: number;
}

/** Simulated minutes skipped before the chart opens; #482 lands at minute 18. */
const SKIP_SECONDS = 15 * 60;
/** Seconds of history the chart opens with: the twelve-minute follow window, full. */
const HISTORY_SECONDS = 12 * 60;
/** Real milliseconds per streamed row (thirty rows a second). */
const ROW_MS = 1000 / 30;
/** The longest frame gap that still streams rows: after a stall the stream resumes, not bursts. */
const MAX_FRAME_MS = 100;
/** The readouts change at most this often, so their numbers stay readable. */
const READOUT_MS = 250;

/** One chart a feed streams to. */
interface Feed {
  /** Whether the chart shows the latest rows (`getState().following`). */
  following: boolean;
  /** Whether the chart is on screen. */
  visible: boolean;
  /** Starts or stops the feed's timer to match the page. */
  sync(): void;
  chart: ChartHandle<Latency>;
}

interface HeroState {
  playing: boolean;
  /** Rows streamed after the history, for the page's readouts and tests. */
  streamed: number;
  /** The newest row streamed. */
  latest?: Latency;
  /** The readouts' renderers, called on every frame that streams rows. */
  rows: Set<() => void>;
  feeds: Set<Feed>;
  /** The toggles' renderers. */
  listeners: Set<() => void>;
}

/** Page-wide state, shared by every copy of this module (islands and scripts are bundled apart). */
function hero(): HeroState {
  const scope = globalThis as unknown as Record<symbol, HeroState | undefined>;
  const key = Symbol.for('snaplot.site.hero');
  let state = scope[key];
  if (!state) {
    const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    state = {
      playing: !reduce,
      streamed: 0,
      rows: new Set(),
      feeds: new Set(),
      listeners: new Set(),
    };
    scope[key] = state;
  }
  return state;
}

function notify(): void {
  const state = hero();
  for (const feed of state.feeds) feed.sync();
  for (const listener of state.listeners) listener();
}

/** Whether every chart on screen follows the stream. */
function live(): boolean {
  return [...hero().feeds].every((feed) => !feed.visible || feed.following);
}

/** Playing also brings every chart that a pan or a zoom left behind back to the latest rows. */
function setPlaying(playing: boolean): void {
  const state = hero();
  state.playing = playing;
  if (playing) for (const feed of state.feeds) if (!feed.following) feed.chart.resumeFollow();
  notify();
}

/** Makes `button` the hero's Pause / Play / Back to live control. */
export function bindHeroToggle(button: HTMLButtonElement): void {
  const state = hero();
  const render = () => {
    const following = live();
    button.textContent = !following ? 'Back to live' : state.playing ? 'Pause' : 'Play';
    button.dataset.playing = String(state.playing);
    button.dataset.live = String(following);
  };
  button.addEventListener('click', () => setPlaying(!(hero().playing && live())));
  state.listeners.add(render);
  render();
}

/**
 * Makes `root` the hero's readouts: the elements in it marked `data-readout="p50"`, `"p99"` and
 * `"streamed"` show the newest row and the rows streamed since the page opened, and `root` carries
 * `data-live`, true while the hero plays and follows the stream.
 */
export function bindHeroReadouts(root: HTMLElement): void {
  const state = hero();
  const field = (name: string) => root.querySelector<HTMLElement>(`[data-readout="${name}"]`);
  const [p50, p99, streamed, status] = ['p50', 'p99', 'streamed', 'status'].map(field);
  const ms = (value: number) => `${Math.round(value)}`;
  let shown = Number.NEGATIVE_INFINITY;
  let pending = false;
  const show = () => {
    shown = performance.now();
    pending = false;
    if (state.latest && p50 && p99) {
      p50.textContent = ms(state.latest.p50);
      p99.textContent = ms(state.latest.p99);
    }
    if (streamed) streamed.textContent = state.streamed.toLocaleString('en-US');
  };
  // At most every READOUT_MS, and once more after the last row, so a pause shows the final values.
  const renderRows = () => {
    const wait = shown + READOUT_MS - performance.now();
    if (wait <= 0) show();
    else if (!pending) {
      pending = true;
      setTimeout(show, wait);
    }
  };
  const renderState = () => {
    const on = state.playing && live();
    root.dataset.live = String(on);
    if (status) status.textContent = on ? 'Live' : state.playing ? 'Zoomed' : 'Paused';
  };
  state.rows.add(renderRows);
  state.listeners.add(renderState);
  renderRows();
  renderState();
}

/**
 * Streams /search latency to `onRows` while `chart` is on screen; returns the function that stops
 * it. The chart opens with twelve minutes of history, three minutes before deploy #482.
 */
export function searchLatency(
  chart: ChartHandle<Latency>,
  onRows: (rows: Latency[]) => void,
): () => void {
  const element = chart.container;
  const simulator = createSimulator({ seed: DEFAULT_SEED });
  const next = (): Latency => {
    const [search] = simulator.step();
    return { time: search.time, p50: search.p50, p99: search.p99 };
  };
  const state = hero();
  let stopped = false;
  let frame: number | undefined;
  /** The previous frame's time, and the real time owed to rows not yet streamed. */
  let last: number | undefined;
  let owed = 0;
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    if (!element.isConnected) return stop();
    owed += last === undefined ? 0 : Math.min(now - last, MAX_FRAME_MS);
    last = now;
    const rows: Latency[] = [];
    for (; owed >= ROW_MS; owed -= ROW_MS) rows.push(next());
    const row = rows.at(-1);
    if (!row) return;
    onRows(rows);
    state.streamed += rows.length;
    state.latest = row;
    for (const render of state.rows) render();
  };

  const feed: Feed = {
    chart,
    following: chart.getState().following,
    visible: false,
    sync() {
      const run = !stopped && feed.visible && !document.hidden && state.playing;
      if (run && frame === undefined) {
        last = undefined;
        frame = requestAnimationFrame(tick);
      } else if (!run && frame !== undefined) {
        cancelAnimationFrame(frame);
        frame = undefined;
      }
    },
  };
  const offFollowing = chart.on('following:change', (following) => {
    feed.following = following;
    notify();
  });
  const observer = new IntersectionObserver((entries) => {
    feed.visible = entries.some((entry) => entry.isIntersecting);
    notify();
  });
  const sync = () => feed.sync();
  function stop(): void {
    stopped = true;
    feed.sync();
    observer.disconnect();
    offFollowing();
    document.removeEventListener('visibilitychange', sync);
    state.feeds.delete(feed);
    notify();
  }

  // The skipped minutes run in slices, so opening the page never blocks for long.
  let skipped = 0;
  const history: Latency[] = [];
  const warm = () => {
    if (stopped) return;
    for (const end = Math.min(skipped + 120, SKIP_SECONDS); skipped < end; skipped++) {
      const row = next();
      if (skipped >= SKIP_SECONDS - HISTORY_SECONDS) history.push(row);
    }
    if (skipped < SKIP_SECONDS) return void setTimeout(warm);
    onRows(history);
    state.latest ??= history.at(-1);
    for (const render of state.rows) render();
    state.feeds.add(feed);
    observer.observe(element);
    document.addEventListener('visibilitychange', sync);
  };
  warm();
  return stop;
}
