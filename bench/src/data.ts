// Seeded data for the bench. Every generator returns plain typed columns (or rows built from
// them) so the API adapters can hand them to any snaplot version in its own shape.

export type Columns = Record<string, Float64Array>;
export type Row = Record<string, number>;

/** Deterministic PRNG so every bench run sees identical data. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Time-series-shaped scatter/line data: sorted X (cumulative timestamps, 40-160 ms apart), Y a
 * noisy random walk with occasional level shifts so the cloud has structure at every zoom level.
 */
export function genTimeSeries(n: number, seed = 1): { x: Float64Array; value: Float64Array } {
  const rand = mulberry32(seed);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  let t = 1_700_000_000_000;
  let level = 50;
  let v = 0;
  for (let i = 0; i < n; i++) {
    t += 40 + rand() * 120;
    x[i] = t;
    if (rand() < 0.0008) level += (rand() - 0.5) * 40;
    v = v * 0.98 + (rand() - 0.5) * 3;
    y[i] = level + v + Math.sin(i / 500) * 8;
  }
  return { x, value: y };
}

/**
 * Calendar-scale data: `n` samples spread evenly over `days`, so a pan crosses day boundaries and
 * the time axis formats dates as well as times.
 */
export function genCalendarSeries(n: number, days: number, seed = 3): Columns {
  const rand = mulberry32(seed);
  const x = new Float64Array(n);
  const a = new Float64Array(n);
  const b = new Float64Array(n);
  const start = Date.UTC(2026, 2, 1);
  const step = (days * 86_400_000) / n;
  let va = 40;
  let vb = 60;
  for (let i = 0; i < n; i++) {
    x[i] = start + i * step;
    va += (rand() - 0.5) * 2;
    vb += (rand() - 0.5) * 2;
    a[i] = va + Math.sin(i / 2_000) * 10;
    b[i] = vb + Math.cos(i / 3_000) * 10;
  }
  return { x, a, b };
}

/**
 * Tabular scatter data: a sorted row key, two correlated metric fields (unsorted in value space),
 * a small-integer category and a positive size. Used for off-axis X, colorBy and sizeBy.
 */
export function genTabular(n: number, seed = 7): Columns {
  const rand = mulberry32(seed);
  const row = new Float64Array(n);
  const metricA = new Float64Array(n);
  const metricB = new Float64Array(n);
  const category = new Float64Array(n);
  const size = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    row[i] = i;
    const cat = Math.floor(rand() * 6);
    category[i] = cat;
    // Cluster per category so color/size encodings map to visible groups.
    const cx = (cat - 2.5) * 12;
    const cy = ((cat * 7) % 5) * 9;
    const a = cx + gauss(rand) * 6;
    metricA[i] = a;
    metricB[i] = cy + a * 0.35 + gauss(rand) * 5;
    size[i] = 1 + Math.abs(gauss(rand)) * 40;
  }
  return { row, metricA, metricB, category, size };
}

/** Box-Muller-ish gaussian from a uniform PRNG. */
function gauss(rand: () => number): number {
  let s = 0;
  for (let i = 0; i < 6; i++) s += rand();
  return (s - 3) / 1.5;
}

/** Fresh columns extending an existing time series, for append ticks. */
export function genAppendChunk(
  lastX: number,
  n: number,
  seed: number,
): { x: Float64Array; value: Float64Array } {
  const rand = mulberry32(seed);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  let t = lastX;
  for (let i = 0; i < n; i++) {
    t += 40 + rand() * 120;
    x[i] = t;
    y[i] = 50 + Math.sin(t / 60_000) * 20 + (rand() - 0.5) * 6;
  }
  return { x, value: y };
}

/**
 * Pre-generated append chunks, so the measured step only appends: generating data inside the step
 * would count the harness's own allocation and time against the library.
 */
export function appendChunks(
  lastX: number,
  count: number,
  size: number,
): { x: Float64Array; value: Float64Array }[] {
  const out: { x: Float64Array; value: Float64Array }[] = [];
  let x = lastX;
  for (let i = 0; i < count; i++) {
    const chunk = genAppendChunk(x, size, i + 1);
    x = chunk.x[chunk.x.length - 1];
    out.push(chunk);
  }
  return out;
}

/** Rows (plain objects) from equal-length columns. */
export function rowsOf(columns: Columns): Row[] {
  const keys = Object.keys(columns);
  const n = columns[keys[0]].length;
  const rows = new Array<Row>(n);
  for (let i = 0; i < n; i++) {
    const row: Row = {};
    for (const k of keys) row[k] = columns[k][i];
    rows[i] = row;
  }
  return rows;
}
