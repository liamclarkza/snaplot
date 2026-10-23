// Statistics for the drivers: medians across runs, the floored ratio, and per-side aggregation of
// scenario results (median of the per-run values, i.e. the median of medians).

/** Median of the finite values, or `null` when there are none. */
export function median(values) {
  const s = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (s.length === 0) return null;
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function round(value, digits = 4) {
  if (value === null || value === undefined || !Number.isFinite(value)) return value ?? null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/**
 * head / base with both sides raised to `floor` first, so sub-floor noise cannot make a ratio
 * (gap-perf-gate-02: 0.25 ms for sync and busy timers, not the old 2 ms frame floor).
 */
export function flooredRatio(head, base, floor = 0) {
  if (!Number.isFinite(head) || !Number.isFinite(base)) return null;
  const b = Math.max(base, floor);
  const h = Math.max(head, floor);
  if (b === 0) return h === 0 ? 1 : null;
  return h / b;
}

/** Reads a dotted path (`busy.median`, `meta.offscreenShare`) from a result object. */
export function get(object, path) {
  let v = object;
  for (const key of path.split('.')) {
    if (v === null || v === undefined) return undefined;
    v = v[key];
  }
  return v;
}

/** Metric paths aggregated for every scenario (meta numbers are added per scenario). */
export const METRICS = [
  'busy.median',
  'busy.p95',
  'busy.mean',
  'sync.median',
  'sync.p95',
  'wall.median',
  'frame.median',
  'frame.p95',
  'frame.over30',
  'taskMsPerOp',
  'busyTotalMs',
  'heap.grossKBPerOp',
  'heap.retainedKB',
  'allocKBPerOp',
  'fidelity.median',
  'fidelity.min',
  'loaf.count',
  'loaf.totalMs',
  'ops',
];

/** Milliseconds metrics: ratios on these use the time floor. */
export function isTimeMetric(path) {
  return /^(busy|sync|wall|frame)\.(median|p95|mean)$|^taskMsPerOp$|^busyTotalMs$/.test(path);
}

/**
 * Aggregates one side's runs of one scenario. `runs` are page results (see bench/src/metrics.ts).
 * `values[path]` is the median over runs of each run's value; `primaryRuns` lists each run's
 * primary value, for the report.
 */
export function aggregate(runs) {
  const first = runs[0] ?? {};
  const measured = runs.filter((r) => !r.unsupported && !r.error);
  const unsupported = runs.find((r) => r.unsupported)?.unsupported ?? null;
  const errors = runs.filter((r) => r.error).map((r) => r.error.split('\n')[0]);
  const primary = first.primary ?? 'busy';
  const values = {};
  for (const path of METRICS) {
    const m = median(measured.map((r) => get(r, path)));
    if (m !== null) values[path] = round(m);
  }
  const metaKeys = new Set(measured.flatMap((r) => Object.keys(r.meta ?? {})));
  for (const key of metaKeys) {
    const m = median(measured.map((r) => r.meta?.[key]));
    if (m !== null) values[`meta.${key}`] = round(m);
  }
  return {
    name: first.name,
    area: first.area,
    primary,
    primaryPath: `${primary}.median`,
    api: first.api ?? null,
    runs: runs.length,
    measured: measured.length,
    valid: measured.length > 0 && measured.every((r) => r.valid),
    unsupported: measured.length === 0 ? unsupported : null,
    errors,
    primaryRuns: measured.map((r) => round(get(r, `${primary}.median`), 3)),
    values,
  };
}
