import { describe, expect, it } from 'vitest';
import { AFTER_MS, BEFORE_MS, headline, verdict } from './answer';
import { type Bucket, type Deploy, START, createSimulator } from './simulator';

const MIN = 60_000;

function run(minutes: number, seed?: number) {
  const sim = createSimulator({ seed });
  const buckets: Bucket[] = [];
  for (let s = 0; s < minutes * 60; s++) buckets.push(...sim.step());
  return { sim, buckets };
}

const deploy = (sim: ReturnType<typeof createSimulator>, id: string): Deploy => {
  const d = sim.deploys.find((x) => x.id === id);
  if (!d) throw new Error(`no ${id}`);
  return d;
};

describe('[deploy-482] answer', () => {
  it('states the verdict for the default run', () => {
    const { sim, buckets } = run(21);
    const v = verdict(buckets, deploy(sim, '#482'));
    expect(v.ready).toBe(true);
    expect(v.rollBack).toBe(true);
    expect(v.moved?.endpoint).toBe('/search');
    expect(headline(v)).toMatch(
      /^p99 on \/search rose from \d+ ms to \d+ ms within 2 min of #482; other endpoints are unchanged, so roll back #482\.$/,
    );
    expect(headline(v)).toBe(
      `p99 on /search rose from ${Math.round(v.changes[0].before)} ms to ${Math.round(v.changes[0].after)} ms within 2 min of #482; other endpoints are unchanged, so roll back #482.`,
    );
  });

  it('oracle: the banner numbers equal medians recomputed from the buckets (no answer.ts)', () => {
    const { sim, buckets } = run(21);
    const t = deploy(sim, '#482').time;
    const med = (xs: number[]) => {
      const s = [...xs].sort((a, b) => a - b);
      return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    };
    const window = (e: string, from: number, to: number) =>
      med(
        buckets.filter((b) => b.endpoint === e && b.time >= from && b.time < to).map((b) => b.p99),
      );
    const v = verdict(buckets, deploy(sim, '#482'));
    for (const c of v.changes) {
      expect(c.before, c.endpoint).toBe(window(c.endpoint, t - 5 * MIN, t));
      expect(c.after, c.endpoint).toBe(window(c.endpoint, t, t + 2 * MIN));
    }
    expect(v.changes.map((c) => c.endpoint)).toEqual(['/search', '/product', '/cart', '/checkout']);
    expect(BEFORE_MS).toBe(5 * MIN);
    expect(AFTER_MS).toBe(2 * MIN);
  });

  it('waits for two minutes after the deploy', () => {
    const { sim, buckets } = run(19);
    const v = verdict(buckets, deploy(sim, '#482'));
    expect(v.ready).toBe(false);
    expect(v.rollBack).toBe(false);
    expect(headline(v)).toBe('Waiting for 2 minutes of data after #482.');
  });

  it('clears #481 and blames #482 on every seed tried', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 482]) {
      const { sim, buckets } = run(21, seed);
      const ok = verdict(buckets, deploy(sim, '#481'));
      expect(ok.rollBack, `seed ${seed}`).toBe(false);
      expect(ok.moved, `seed ${seed}`).toBeNull();
      expect(headline(ok)).toMatch(
        /^p99 is unchanged on every endpoint within 2 min of #481 \(largest change: \/\w+ [+−]\d+%\)\.$/,
      );
      expect(verdict(buckets, deploy(sim, '#482')).rollBack, `seed ${seed}`).toBe(true);
    }
  });

  it('after the rollback, /search falls back and nothing else moves', () => {
    const sim = createSimulator();
    const buckets: Bucket[] = [];
    for (let s = 0; s < 24 * 60; s++) buckets.push(...sim.step());
    const rb = sim.rollback();
    if (!rb) throw new Error('no rollback');
    for (let s = 0; s < 2 * 60; s++) buckets.push(...sim.step());
    const v = verdict(buckets, rb);
    expect(v.moved?.endpoint).toBe('/search');
    expect(v.moved?.change).toBeLessThan(-0.5);
    expect(v.rollBack).toBe(false);
    expect(headline(v)).toMatch(
      /^p99 on \/search fell from \d+ ms to \d+ ms within 2 min of #483; other endpoints are unchanged\.$/,
    );
  });

  it('asks for a shared cause when several endpoints move', () => {
    const d: Deploy = {
      id: '#9',
      time: START + 10 * MIN,
      label: '',
      kind: 'deploy',
      nPlusOne: false,
    };
    const buckets: Bucket[] = [];
    for (let s = 0; s < 13 * 60; s++) {
      const time = START + s * 1000;
      const late = time >= d.time;
      for (const [endpoint, base, factor] of [
        ['/a', 100, 3],
        ['/b', 50, 1.4],
        ['/c', 20, 1],
      ] as const) {
        const p99 = late ? base * factor : base;
        buckets.push({ time, endpoint, requests: 10, errors: 0, p50: p99 / 2, p95: p99, p99 });
      }
    }
    const v = verdict(buckets, d);
    expect(v.rollBack).toBe(false);
    expect(headline(v)).toBe(
      'p99 on /a rose from 100 ms to 300 ms within 2 min of #9, but other endpoints changed too (/b +40%), so look for a shared cause first.',
    );
  });

  it('never shows NaN or Infinity', () => {
    const { sim, buckets } = run(21);
    const early: Deploy = { ...deploy(sim, '#481'), id: '#0', time: START };
    expect(headline(verdict(buckets, early))).toBe('Not enough data around #0 yet.');
    for (const id of ['#481', '#482']) {
      for (const cut of [0, 6 * 60 * 4, 18 * 60 * 4, buckets.length]) {
        const text = headline(verdict(buckets.slice(0, cut), deploy(sim, id)));
        expect(text, `${id} at ${cut}`).not.toMatch(/NaN|Infinity|undefined/);
      }
    }
  });
});
