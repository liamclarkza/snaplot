import { histogram } from 'snaplot/solid';
import { describe, expect, it } from 'vitest';
import { verdict } from './answer';
import { EDGES, HISTOGRAM_MS, NAMES, PAGE_TIME, createIncident, toRows } from './incident';
import { type Bucket, DEFAULT_SEED, START, createSimulator } from './simulator';

/** A plain run of the simulator, sharing no code with incident.ts. */
function plainRun(seconds: number, keepSamples = false) {
  const sim = createSimulator({ seed: DEFAULT_SEED, keepSamples });
  const out: Bucket[] = [];
  for (let s = 0; s < seconds; s++) out.push(...sim.step());
  return { sim, out };
}

describe('[deploy-482] incident stream', () => {
  it('builds one row per second for each chart', () => {
    const { out } = plainRun(3);
    const rows = toRows([out.slice(0, 4), out.slice(4, 8), out.slice(8, 12)]);
    expect([...rows.latency.columns.time]).toEqual([START, START + 1000, START + 2000]);
    expect(rows.latency.columns.search_p99[1]).toBe(out[4].p99);
    expect(rows.traffic.columns.cart[2]).toBe(out[10].requests);
    expect(rows.errors.columns.product[0]).toBeCloseTo((100 * out[1].errors) / out[1].requests, 12);
    expect(Object.keys(rows.latency.columns)).toHaveLength(1 + 3 * NAMES.length);
  });

  it('[demos-18] the live stream continues the history without a seam', () => {
    const { incident, history } = createIncident(DEFAULT_SEED);
    expect(history.latency.columns.time).toHaveLength(22 * 60);
    expect(history.latency.columns.time[0]).toBe(START);
    expect(incident.now).toBe(PAGE_TIME);
    const live = incident.advance(5);
    const { out } = plainRun(22 * 60 + 5);
    const expected = toRows(
      Array.from({ length: 5 }, (_, i) => out.slice((22 * 60 + i) * 4, (22 * 60 + i + 1) * 4)),
    );
    expect(live).toEqual(expected);
    expect(live.latency.columns.time[0]).toBe(PAGE_TIME);
  });

  it('freezes each deploy two minutes after it, with the verdict a full run gives', () => {
    const { incident } = createIncident(DEFAULT_SEED);
    const { sim, out } = plainRun(22 * 60);
    for (const id of ['#481', '#482']) {
      const deploy = sim.deploys.find((d) => d.id === id);
      if (!deploy) throw new Error(id);
      expect(incident.summary(id)?.verdict).toEqual(verdict(out, deploy));
    }
    expect(incident.summary('#482')?.verdict.rollBack).toBe(true);
    expect(incident.summary('#999')).toBeUndefined();
    // Only the last seven minutes of buckets are kept.
    expect(incident.retained).toBe(7 * 60 * NAMES.length);
    incident.advance(600);
    expect(incident.retained).toBe(7 * 60 * NAMES.length);
  });

  it('keeps the before and after samples of a deploy, binned on shared edges', () => {
    const { incident } = createIncident(DEFAULT_SEED);
    const summary = incident.summary('#482');
    if (!summary) throw new Error('no #482');
    const { out } = plainRun(22 * 60, true);
    const t = summary.deploy.time;
    const count = (from: number, to: number) =>
      out
        .filter((b) => b.endpoint === '/search' && b.time >= from && b.time < to)
        .reduce((n, b) => n + (b.samples?.length ?? 0), 0);
    expect(summary.before.get('/search')).toHaveLength(count(t - HISTOGRAM_MS, t));
    expect(summary.after.get('/search')).toHaveLength(count(t, t + HISTOGRAM_MS));
    const before = histogram(summary.before.get('/search') ?? [], { thresholds: EDGES });
    const after = histogram(summary.after.get('/search') ?? [], { thresholds: EDGES });
    expect([...before.edges]).toEqual([...after.edges]);
    const median = (bins: { counts: Float64Array }) => {
      const total = bins.counts.reduce((a, b) => a + b, 0);
      let seen = 0;
      return bins.counts.findIndex((c) => (seen += c) >= total / 2);
    };
    expect(median(after)).toBeGreaterThan(median(before));
    expect(summary.baseline.get('/search')?.p99).toBe(summary.verdict.changes[0].before);
  });

  it('a rollback is summarised live until its two minutes have passed', () => {
    const { incident } = createIncident(DEFAULT_SEED);
    incident.advance(30);
    const rollback = incident.rollback();
    expect(rollback?.time).toBe(PAGE_TIME + 30_000);
    expect(incident.summary(rollback?.id ?? '')?.verdict.ready).toBe(false);
    incident.advance(120);
    const done = incident.summary(rollback?.id ?? '');
    expect(done?.verdict.ready).toBe(true);
    expect(done?.verdict.moved?.endpoint).toBe('/search');
    expect(done?.verdict.moved?.change).toBeLessThan(-0.5);
    expect(incident.rollback()).toBeNull();
  });
});
