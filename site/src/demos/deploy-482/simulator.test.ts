import { describe, expect, it } from 'vitest';
import {
  type Bucket,
  DEFAULT_SEED,
  ENDPOINTS,
  ERROR_SLO,
  START,
  createSimulator,
  parseSeed,
} from './simulator';

const MIN = 60_000;

function run(minutes: number, options: Parameters<typeof createSimulator>[0] = {}) {
  const sim = createSimulator(options);
  const buckets: Bucket[] = [];
  for (let s = 0; s < minutes * 60; s++) buckets.push(...sim.step());
  return { sim, buckets };
}

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const p99s = (buckets: Bucket[], endpoint: string, from: number, to: number) =>
  buckets.filter((b) => b.endpoint === endpoint && b.time >= from && b.time < to).map((b) => b.p99);

describe('[deploy-482] simulator', () => {
  it('oracle: every bucket percentile equals a brute-force sort of its samples', () => {
    const { buckets } = run(25, { keepSamples: true });
    expect(buckets).toHaveLength(25 * 60 * ENDPOINTS.length);
    let checked = 0;
    for (const b of buckets) {
      const sorted = Array.from(b.samples ?? []).sort((x, y) => x - y);
      expect(sorted.length).toBe(b.requests);
      if (sorted.length === 0) {
        expect(b.p99).toBeNaN();
        continue;
      }
      const at = (p: number) => sorted[Math.ceil(p * sorted.length) - 1];
      if (b.p99 !== at(0.99) || b.p95 !== at(0.95) || b.p50 !== at(0.5)) {
        throw new Error(`${b.endpoint} at ${b.time}: ${b.p50}/${b.p95}/${b.p99}`);
      }
      expect(b.errors).toBeLessThanOrEqual(b.requests);
      checked++;
    }
    expect(checked).toBeGreaterThan(5000);
  });

  it('replays a run exactly from its seed', () => {
    const a = run(4, { seed: 17 }).buckets;
    const b = run(4, { seed: 17 }).buckets;
    const c = run(4, { seed: 18 }).buckets;
    expect(b).toEqual(a);
    expect(c.map((x) => x.p99)).not.toEqual(a.map((x) => x.p99));
  });

  it('keeping samples does not change the numbers', () => {
    const plain = run(3).buckets;
    const kept = run(3, { keepSamples: true }).buckets;
    expect(plain[0].samples).toBeUndefined();
    expect(kept.map(({ samples: _, ...rest }) => rest)).toEqual(plain);
  });

  it('reads ?seed= from the URL', () => {
    expect(parseSeed('?seed=17')).toBe(17);
    expect(parseSeed('?x=1&seed=4000000000')).toBe(4_000_000_000);
    expect(parseSeed('')).toBe(DEFAULT_SEED);
    expect(parseSeed('?seed=abc')).toBe(DEFAULT_SEED);
    expect(parseSeed('?seed=-1')).toBe(4_294_967_295);
  });

  it('one bucket per endpoint per second, and deploys when their second is simulated', () => {
    const sim = createSimulator();
    expect(sim.now).toBe(START);
    let first: Bucket[] = [];
    for (let s = 0; s < 6 * 60; s++) first = sim.step();
    expect(first.map((b) => b.endpoint)).toEqual(ENDPOINTS.map((e) => e.name));
    expect(first[0].time).toBe(START + (6 * 60 - 1) * 1000);
    expect(sim.deploys).toEqual([]);
    sim.step();
    expect(sim.deploys.map((d) => d.id)).toEqual(['#481']);
    for (let s = 0; s < 12 * 60; s++) sim.step();
    expect(sim.deploys.map((d) => [d.id, d.time - START])).toEqual([
      ['#481', 6 * MIN],
      ['#482', 18 * MIN],
    ]);
  });

  it('#482 multiplies /search p99 and leaves the other endpoints alone; #481 changes nothing', () => {
    for (const seed of [DEFAULT_SEED, 1, 2, 3, 99]) {
      const { buckets } = run(21, { seed });
      const p99Before = (e: string) => median(p99s(buckets, e, START + 13 * MIN, START + 18 * MIN));
      const p99After = (e: string) => median(p99s(buckets, e, START + 18 * MIN, START + 20 * MIN));
      expect(p99After('/search') / p99Before('/search'), `seed ${seed}`).toBeGreaterThan(2);
      for (const e of ['/product', '/cart', '/checkout']) {
        expect(Math.abs(p99After(e) / p99Before(e) - 1), `seed ${seed} ${e}`).toBeLessThan(0.2);
      }
      for (const e of ENDPOINTS.map((x) => x.name)) {
        const b = median(p99s(buckets, e, START + MIN, START + 6 * MIN));
        const a = median(p99s(buckets, e, START + 6 * MIN, START + 8 * MIN));
        expect(Math.abs(a / b - 1), `seed ${seed} ${e} around #481`).toBeLessThan(0.2);
      }
    }
  });

  it('the overload after #482 breaks the 1% error SLO; nothing does before it', () => {
    const { buckets } = run(30);
    const minuteErrorRate = (m: number) => {
      const w = buckets.filter(
        (b) =>
          b.endpoint === '/search' && b.time >= START + m * MIN && b.time < START + (m + 1) * MIN,
      );
      return w.reduce((s, b) => s + b.errors, 0) / w.reduce((s, b) => s + b.requests, 0);
    };
    const before = Array.from({ length: 18 }, (_, m) => minuteErrorRate(m));
    const after = Array.from({ length: 12 }, (_, m) => minuteErrorRate(18 + m));
    expect(Math.max(...before)).toBeLessThan(ERROR_SLO);
    expect(Math.max(...after)).toBeGreaterThan(ERROR_SLO);
  });

  it('rolling back #482 recovers /search within two minutes', () => {
    const sim = createSimulator();
    const buckets: Bucket[] = [];
    for (let s = 0; s < 23 * 60; s++) buckets.push(...sim.step());
    const rb = sim.rollback();
    expect(rb).toMatchObject({ id: '#483', kind: 'rollback', time: START + 23 * MIN });
    expect(sim.rollback()).toBeNull();
    for (let s = 0; s < 6 * 60; s++) buckets.push(...sim.step());
    const before = median(p99s(buckets, '/search', START + 13 * MIN, START + 18 * MIN));
    const recovered = median(p99s(buckets, '/search', START + 25 * MIN, START + 29 * MIN));
    expect(Math.abs(recovered / before - 1)).toBeLessThan(0.2);
    expect(createSimulator().rollback()).toBeNull();
  });

  it('simulates an hour quickly with flat state', () => {
    const sim = createSimulator();
    const t0 = performance.now();
    let requests = 0;
    for (let s = 0; s < 3600; s++) for (const b of sim.step()) requests += b.requests;
    expect(performance.now() - t0).toBeLessThan(15_000);
    expect(requests).toBeGreaterThan(3600 * 300);
  });
});
