/**
 * "Did deploy #482 cause the p99 spike?" — the computed verdict (plan §10.2, S2), from the
 * simulator's buckets (simulator.ts; the page labels the data "Simulated service").
 *
 * For a deploy at time T, per endpoint:
 * - before = the median of the per-second p99 over the 5 minutes before T;
 * - after = the median of the per-second p99 over the 2 minutes from T;
 * - an endpoint moved when after/before − 1 is at least +50% (or −50% for a fall), and is
 *   unchanged within ±20%.
 * The banner says roll back when exactly one endpoint moved up and every other is unchanged.
 */

import type { Bucket, Deploy } from './simulator';

export const BEFORE_MS = 5 * 60_000;
export const AFTER_MS = 2 * 60_000;
export const MOVED = 0.5;
export const UNCHANGED = 0.2;

export interface EndpointChange {
  endpoint: string;
  /** Median per-second p99, ms. */
  before: number;
  after: number;
  /** after / before − 1. */
  change: number;
}

export interface Verdict {
  deploy: Deploy;
  /** Whether two full minutes after the deploy have been simulated. */
  ready: boolean;
  /** One entry per endpoint, in first-seen order (the "p99 change by endpoint" bars). */
  changes: EndpointChange[];
  /** The endpoint with the largest move, when it moved at least ±50%. */
  moved: EndpointChange | null;
  othersUnchanged: boolean;
  rollBack: boolean;
}

function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const s = values.sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function verdict(buckets: readonly Bucket[], deploy: Deploy): Verdict {
  const t = deploy.time;
  const endpoints: string[] = [];
  const before = new Map<string, number[]>();
  const after = new Map<string, number[]>();
  let lastTime = Number.NEGATIVE_INFINITY;
  for (const b of buckets) {
    if (!before.has(b.endpoint)) {
      endpoints.push(b.endpoint);
      before.set(b.endpoint, []);
      after.set(b.endpoint, []);
    }
    if (b.time > lastTime) lastTime = b.time;
    if (Number.isNaN(b.p99)) continue;
    if (b.time >= t - BEFORE_MS && b.time < t) before.get(b.endpoint)?.push(b.p99);
    else if (b.time >= t && b.time < t + AFTER_MS) after.get(b.endpoint)?.push(b.p99);
  }
  const ready = lastTime >= t + AFTER_MS - 1000;
  const changes = endpoints.map((endpoint) => {
    const b = median(before.get(endpoint) ?? []);
    const a = median(after.get(endpoint) ?? []);
    return { endpoint, before: b, after: a, change: a / b - 1 };
  });
  let moved: EndpointChange | null = null;
  for (const c of changes) {
    if (Math.abs(c.change) >= MOVED && (!moved || Math.abs(c.change) > Math.abs(moved.change))) {
      moved = c;
    }
  }
  const othersUnchanged = changes.every(
    (c) => c === moved || (Number.isFinite(c.change) && Math.abs(c.change) < UNCHANGED),
  );
  return {
    deploy,
    ready,
    changes,
    moved,
    othersUnchanged,
    rollBack:
      ready && moved !== null && moved.change > 0 && othersUnchanged && deploy.kind === 'deploy',
  };
}

const ms = (v: number) => `${Math.round(v)} ms`;
const signed = (change: number) =>
  `${change >= 0 ? '+' : '−'}${Math.round(Math.abs(change) * 100)}%`;

/** The verdict banner. */
export function headline(v: Verdict): string {
  const id = v.deploy.id;
  if (!v.ready) return `Waiting for 2 minutes of data after ${id}.`;
  const { moved } = v;
  const finite = v.changes.filter((c) => Number.isFinite(c.change));
  if (finite.length === 0) return `Not enough data around ${id} yet.`;
  if (!moved) {
    const largest = finite.reduce((m, c) => (Math.abs(c.change) > Math.abs(m.change) ? c : m));
    return `p99 is unchanged on every endpoint within 2 min of ${id} (largest change: ${largest.endpoint} ${signed(largest.change)}).`;
  }
  const dir = moved.change > 0 ? 'rose' : 'fell';
  const first = `p99 on ${moved.endpoint} ${dir} from ${ms(moved.before)} to ${ms(moved.after)} within 2 min of ${id}`;
  if (v.rollBack) return `${first}; other endpoints are unchanged, so roll back ${id}.`;
  if (!v.othersUnchanged) {
    const others = v.changes
      .filter((c) => c !== moved && !(Math.abs(c.change) < UNCHANGED))
      .map((c) => `${c.endpoint} ${signed(c.change)}`)
      .join(', ');
    return `${first}, but other endpoints changed too (${others}), so look for a shared cause first.`;
  }
  return `${first}; other endpoints are unchanged.`;
}
