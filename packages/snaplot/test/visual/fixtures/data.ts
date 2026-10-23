/**
 * Seeded data helpers. Every fixture builds its data from these, so a fixture renders the same
 * pixels on every run. `lcg` and `normal` are the generators of the site's `#/visual` harness and
 * of `evidence/gap-overhaul-delta/srv/fixtures.js`; `mulberry` is the one behind the audit grid
 * (`evidence/play/visuals-grid.html`). Keep each fixture on the generator its source used.
 */

/** Linear congruential generator (`#/visual`, gap-overhaul-delta fixtures). */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Mulberry32 (the visuals audit grid). */
export function mulberry(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller normal sample from a uniform source (one sample per call, as the sources did). */
export function normal(rand: () => number): number {
  const u1 = Math.max(rand(), 1e-9);
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Box–Muller with rejection of exact zeros (the audit grid's `gauss`). */
export function gauss(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (!u) u = rand();
  while (!v) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const f64 = (values: readonly number[]): Float64Array => Float64Array.from(values);

export function range<T>(n: number, fn: (i: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => fn(i));
}

/** Midnight UTC on the given date; fixtures run with `timezoneId: 'UTC'`. */
export const utc = (y: number, m: number, d = 1, h = 0, min = 0, s = 0): number =>
  Date.UTC(y, m, d, h, min, s);

export const DAY = 864e5;

export const SERIES_NAMES = [
  'Revenue',
  'Costs',
  'Margin',
  'Users',
  'Sessions',
  'Errors',
  'Latency',
  'Signups',
];
