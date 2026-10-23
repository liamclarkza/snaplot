// Synthetic page results for the driver tests.

export function result(name, overrides = {}) {
  const primary = overrides.primary ?? 'busy';
  const value = overrides.value ?? 1;
  const dist = (median) => ({
    n: 100,
    min: median,
    median,
    p95: median,
    mean: median,
    max: median,
  });
  return {
    name,
    area: overrides.area ?? 'legacy',
    primary,
    api: overrides.api ?? 'v1',
    valid: overrides.valid ?? true,
    ops: 100,
    busy: dist(primary === 'busy' ? value : 1),
    sync: dist(primary === 'sync' ? value : 0.5),
    wall: primary === 'wall' ? dist(value) : null,
    frame: { ...dist(8.33), over60: 0, over30: 0 },
    busyTotalMs: 100,
    loaf: { count: 0, totalMs: 0, blockingMs: 0 },
    heap:
      overrides.heapKB === undefined
        ? null
        : { ops: 100, grossKBPerOp: overrides.heapKB, retainedKB: 1 },
    fidelity:
      overrides.fidelity === undefined
        ? null
        : { samples: 30, min: overrides.fidelity, median: overrides.fidelity, budget: 1300 },
    renders: { grid: 1, data: 100, overlay: 0 },
    meta: overrides.meta ?? {},
    ...(overrides.unsupported ? { unsupported: overrides.unsupported } : {}),
    ...(overrides.error ? { error: overrides.error } : {}),
  };
}

/** Three runs of one scenario with the given primary values. */
export function runs(name, values, overrides = {}) {
  return values.map((value) => result(name, { ...overrides, value }));
}
