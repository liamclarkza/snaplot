/**
 * Live /search latency for streaming examples, such as the homepage hero (plan §9, D34).
 * Source: the seeded deploy-482 service simulator (src/demos/deploy-482/simulator.ts, the S2
 * demo's model, labelled "Simulated service"), one row per simulated second and ten rows per real
 * second. The example calls `chart.appendData(rows)` with what this hands over.
 *
 * It plays only while the chart is on screen, the tab is visible and the hero is playing. Under
 * `prefers-reduced-motion` the hero starts paused (WCAG 2.2.2), and the Pause button the page
 * binds with `bindHeroToggle` pauses and resumes every feed on the page.
 */
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

interface HeroState {
  playing: boolean;
  /** Rows streamed after the history, for the page's tests. */
  streamed: number;
  listeners: Set<() => void>;
}

/** Page-wide state, shared by every copy of this module (islands and scripts are bundled apart). */
function hero(): HeroState {
  const scope = globalThis as unknown as Record<symbol, HeroState | undefined>;
  const key = Symbol.for('snaplot.site.hero');
  let state = scope[key];
  if (!state) {
    const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    state = { playing: !reduce, streamed: 0, listeners: new Set() };
    scope[key] = state;
  }
  return state;
}

function setPlaying(playing: boolean): void {
  const state = hero();
  state.playing = playing;
  for (const listener of state.listeners) listener();
}

/** Makes `button` the hero's Pause/Play control. */
export function bindHeroToggle(button: HTMLButtonElement): void {
  const state = hero();
  const render = () => {
    button.textContent = state.playing ? 'Pause' : 'Play';
    button.dataset.playing = String(state.playing);
  };
  button.addEventListener('click', () => setPlaying(!hero().playing));
  state.listeners.add(render);
  render();
}

/**
 * Streams /search latency to `onRows` while `element` is on screen; returns the function that
 * stops it. The chart opens with four minutes of history, three minutes before deploy #482.
 */
export function searchLatency(element: HTMLElement, onRows: (rows: Latency[]) => void): () => void {
  const simulator = createSimulator({ seed: DEFAULT_SEED });
  const next = (): Latency => {
    const [search] = simulator.step();
    return { time: search.time, p50: search.p50, p99: search.p99 };
  };
  const state = hero();
  let stopped = false;
  let visible = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  const sync = () => {
    const run = !stopped && visible && !document.hidden && state.playing;
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
  };
  const observer = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    sync();
  });
  function stop(): void {
    stopped = true;
    sync();
    observer.disconnect();
    document.removeEventListener('visibilitychange', sync);
    state.listeners.delete(sync);
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
    observer.observe(element);
    document.addEventListener('visibilitychange', sync);
    state.listeners.add(sync);
  };
  warm();
  return stop;
}
