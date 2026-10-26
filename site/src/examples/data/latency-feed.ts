/**
 * Live /search latency for streaming examples, such as the homepage hero (plan §9, D34).
 * Source: the seeded deploy-482 service simulator (src/demos/deploy-482/simulator.ts, the S2
 * demo's model, labelled "Simulated service"), one row per simulated second and ten rows per real
 * second. The example calls `chart.appendData(rows)` with what this hands over.
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
/** Seconds of history the chart opens with. */
const HISTORY_SECONDS = 4 * 60;
const TICK_MS = 100;

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
  /** Rows streamed after the history, for the page's tests. */
  streamed: number;
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
    state = { playing: !reduce, streamed: 0, feeds: new Set(), listeners: new Set() };
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
 * Streams /search latency to `onRows` while `chart` is on screen; returns the function that stops
 * it. The chart opens with four minutes of history, three minutes before deploy #482.
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
  let timer: ReturnType<typeof setInterval> | undefined;

  const feed: Feed = {
    chart,
    following: chart.getState().following,
    visible: false,
    sync() {
      const run = !stopped && feed.visible && !document.hidden && state.playing;
      if (run && timer === undefined) {
        timer = setInterval(() => {
          if (!element.isConnected) return stop();
          onRows([next()]);
          state.streamed++;
        }, TICK_MS);
      } else if (!run && timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
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
    state.feeds.add(feed);
    observer.observe(element);
    document.addEventListener('visibilitychange', sync);
  };
  warm();
  return stop;
}
