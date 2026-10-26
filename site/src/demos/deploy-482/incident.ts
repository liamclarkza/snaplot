/**
 * The incident as the dashboard sees it: one simulator (simulator.ts) runs the history up to the
 * page time and then keeps stepping live, so the stream continues the history without a seam
 * (demos-18). Each simulated second becomes one row of chart columns. Per deploy, the verdict
 * (answer.ts) and the before/after latency samples are kept until two minutes after the deploy,
 * then frozen, so memory stays bounded however long the page runs.
 */
import { AFTER_MS, BEFORE_MS, type Verdict, verdict } from './answer';
import {
  type Bucket,
  type Deploy,
  ENDPOINTS,
  START,
  type Simulator,
  createSimulator,
} from './simulator';

/** 03:12:00 UTC, when the on-call engineer is paged: the history ends here. */
export const PAGE_TIME = START + 22 * 60_000;
/** The endpoints, as `/search`, and as the column-name stem `search`. */
export const NAMES = ENDPOINTS.map((e) => e.name);
export const stem = (endpoint: string) => endpoint.slice(1);
/** The histogram windows: two minutes either side of a deploy, so the counts compare. */
export const HISTOGRAM_MS = 2 * 60_000;
/** Shared latency bin edges: four per octave from 2 ms to 2,048 ms. */
export const EDGES = Float64Array.from({ length: 41 }, (_, i) => 2 * 2 ** (i / 4));

export interface Columns {
  columns: Record<string, Float64Array>;
}
/** One row per simulated second for each chart: latency percentiles, error %, requests/s. */
export interface Rows {
  latency: Columns;
  errors: Columns;
  traffic: Columns;
}

/** Chart columns for consecutive seconds (each an array of one bucket per endpoint). */
export function toRows(seconds: readonly Bucket[][]): Rows {
  const n = seconds.length;
  const column = () => new Float64Array(n);
  const latency: Record<string, Float64Array> = { time: column() };
  const errors: Record<string, Float64Array> = { time: column() };
  const traffic: Record<string, Float64Array> = { time: column() };
  for (const name of NAMES) {
    const s = stem(name);
    for (const p of ['p50', 'p95', 'p99'] as const) latency[`${s}_${p}`] = column();
    errors[s] = column();
    traffic[s] = column();
  }
  seconds.forEach((buckets, i) => {
    latency.time[i] = errors.time[i] = traffic.time[i] = buckets[0].time;
    for (const b of buckets) {
      const s = stem(b.endpoint);
      latency[`${s}_p50`][i] = b.p50;
      latency[`${s}_p95`][i] = b.p95;
      latency[`${s}_p99`][i] = b.p99;
      errors[s][i] = b.requests > 0 ? (100 * b.errors) / b.requests : Number.NaN;
      traffic[s][i] = b.requests;
    }
  });
  return {
    latency: { columns: latency },
    errors: { columns: errors },
    traffic: { columns: traffic },
  };
}

/** What the side panels show for one deploy. */
export interface DeploySummary {
  deploy: Deploy;
  verdict: Verdict;
  /** Per endpoint: latency samples 2 minutes before and after the deploy. */
  before: Map<string, Float64Array>;
  after: Map<string, Float64Array>;
  /** Per endpoint and percentile: the median per-second value over the 5 minutes before. */
  baseline: Map<string, { p50: number; p95: number; p99: number }>;
}

const median = (values: number[]) => {
  const s = values.filter((v) => !Number.isNaN(v)).sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length === 0 ? Number.NaN : s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function summarise(buckets: readonly Bucket[], deploy: Deploy): DeploySummary {
  const t = deploy.time;
  const gather = (from: number, to: number) => {
    const out = new Map<string, Float64Array>();
    for (const name of NAMES) {
      const parts = buckets.filter((b) => b.endpoint === name && b.time >= from && b.time < to);
      const all = new Float64Array(parts.reduce((n, b) => n + (b.samples?.length ?? 0), 0));
      let at = 0;
      for (const b of parts) {
        if (!b.samples) continue;
        all.set(b.samples, at);
        at += b.samples.length;
      }
      out.set(name, all);
    }
    return out;
  };
  const baseline = new Map<string, { p50: number; p95: number; p99: number }>();
  for (const name of NAMES) {
    const window = buckets.filter(
      (b) => b.endpoint === name && b.time >= t - BEFORE_MS && b.time < t,
    );
    baseline.set(name, {
      p50: median(window.map((b) => b.p50)),
      p95: median(window.map((b) => b.p95)),
      p99: median(window.map((b) => b.p99)),
    });
  }
  return {
    deploy,
    verdict: verdict(buckets, deploy),
    before: gather(t - HISTOGRAM_MS, t),
    after: gather(t, t + HISTOGRAM_MS),
    baseline,
  };
}

export interface Incident {
  readonly simulator: Simulator;
  /** Simulated time of the next second, epoch ms. */
  readonly now: number;
  readonly deploys: readonly Deploy[];
  /** Simulate `seconds` more seconds; returns their chart rows. */
  advance(seconds: number): Rows;
  /** Roll back #482 now; null when there is nothing to roll back. */
  rollback(): Deploy | null;
  /** The summary of a deploy: frozen once two minutes have passed, live before. */
  summary(id: string): DeploySummary | undefined;
  /** How many buckets are kept for deploys that are not frozen yet (bounded). */
  readonly retained: number;
}

/** A simulator run up to the page time; `history` holds its rows. */
export function createIncident(seed: number): { incident: Incident; history: Rows } {
  const simulator = createSimulator({ seed, keepSamples: true });
  /** Buckets of the last BEFORE_MS + AFTER_MS, with their samples. */
  let recent: Bucket[] = [];
  const frozen = new Map<string, DeploySummary>();
  const keepMs = BEFORE_MS + AFTER_MS;

  const step = (): Bucket[] => {
    const buckets = simulator.step();
    recent.push(...buckets);
    const now = simulator.now;
    if (recent[0].time < now - keepMs) recent = recent.filter((b) => b.time >= now - keepMs);
    for (const d of simulator.deploys) {
      if (!frozen.has(d.id) && now >= d.time + AFTER_MS) frozen.set(d.id, summarise(recent, d));
    }
    // Rows keep only the percentiles; the samples live in `recent` until frozen.
    return buckets.map(({ samples: _, ...rest }) => rest);
  };
  const advance = (seconds: number) => toRows(Array.from({ length: seconds }, step));

  const history = advance(Math.round((PAGE_TIME - START) / 1000));
  const incident: Incident = {
    simulator,
    get now() {
      return simulator.now;
    },
    get deploys() {
      return simulator.deploys;
    },
    advance,
    rollback: () => simulator.rollback(),
    summary(id) {
      const deploy = simulator.deploys.find((d) => d.id === id);
      if (!deploy) return undefined;
      return frozen.get(id) ?? summarise(recent, deploy);
    },
    get retained() {
      return recent.length;
    },
  };
  return { incident, history };
}
