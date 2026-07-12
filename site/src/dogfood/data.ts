import { histogram, type ColumnarData, type SeriesConfig } from 'snaplot';

export const f64 = (values: Iterable<number>): Float64Array => Float64Array.from(values);

export function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PulsePoint {
  time: number;
  cpu: number;
  memory: number;
  latency: number;
  requests: number;
  errors: number;
  forecast: number;
  upper: number;
  lower: number;
}

export function pulsePoints(service = 0, count = 180): PulsePoint[] {
  const rand = mulberry32(0x51a77 + service * 97);
  const start = Date.UTC(2026, 6, 10, 8, 0, 0);
  const burstStart = Math.floor(count * 0.72);
  return Array.from({ length: count }, (_, i) => {
    const wave = Math.sin(i / 15 + service * 0.7);
    const burst = i > burstStart && i < burstStart + 20 ? Math.sin(((i - burstStart) / 20) * Math.PI) : 0;
    const latency = 116 + wave * 20 + burst * 92 + rand() * 13 + service * 9;
    const forecast = 122 + wave * 17 + service * 8;
    return {
      time: start + i * 10_000,
      cpu: 48 + wave * 17 + burst * 20 + rand() * 8 + service * 3,
      memory: 61 + Math.sin(i / 32) * 7 + rand() * 3 + service * 2,
      latency,
      requests: 1550 + wave * 280 + rand() * 130 - service * 70,
      errors: Math.max(0.05, 0.35 + burst * 2.8 + rand() * 0.32 + service * 0.08),
      forecast,
      upper: forecast + 28,
      lower: forecast - 24,
    };
  });
}

export function pulseColumns(points: PulsePoint[], partial = false): ColumnarData {
  return [
    f64(points.map((p) => p.time)),
    f64(points.map((p) => p.cpu)),
    f64(points.map((p) => p.memory)),
    f64(points.map((p, i) => partial && i % 17 === 0 ? Number.NaN : p.latency)),
    f64(points.map((p) => p.requests)),
    f64(points.map((p) => p.errors)),
    f64(points.map((p) => p.forecast)),
    f64(points.map((p) => p.upper)),
    f64(points.map((p) => p.lower)),
  ];
}

export function pulseHistogram(points: PulsePoint[]): ColumnarData {
  const bins = histogram(f64(points.map((p) => p.latency)), { binCount: 16 });
  return [bins.edges, bins.counts];
}

export const serviceComparison: ColumnarData = [
  f64([0, 1, 2, 3]),
  f64([99.98, 99.94, 99.89, 99.97]),
  f64([99.95, 99.91, 99.86, 99.95]),
];

export type ModelFamily = 'Atlas' | 'Nova' | 'Sage' | 'Ember';
export type RunStatus = 'ready' | 'training' | 'failed';

export interface ExperimentRun {
  id: number;
  name: string;
  family: ModelFamily;
  team: 'Core' | 'Vision' | 'Applied';
  status: RunStatus;
  day: number;
  accuracy: number;
  latency: number;
  cost: number;
  size: number;
}

export const families: ModelFamily[] = ['Atlas', 'Nova', 'Sage', 'Ember'];
export const comparisonMetrics = ['Accuracy', 'Speed', 'Cost'] as const;

export function experimentRuns(count = 5200): ExperimentRun[] {
  const rand = mulberry32(0xc0a047);
  const teams: ExperimentRun['team'][] = ['Core', 'Vision', 'Applied'];
  const statuses: RunStatus[] = ['ready', 'ready', 'ready', 'training', 'failed'];
  return Array.from({ length: count }, (_, id) => {
    const familyIndex = id % families.length;
    const complexity = 0.25 + rand() * 0.75;
    const latency = 20 + familyIndex * 11 + complexity * 125 + rand() * 24;
    return {
      id,
      name: `run-${String(id + 1).padStart(4, '0')}`,
      family: families[familyIndex],
      team: teams[(id * 7) % teams.length],
      status: statuses[(id * 13) % statuses.length],
      day: id % 30,
      accuracy: 0.78 + familyIndex * 0.018 + complexity * 0.115 + (rand() - 0.5) * 0.035,
      latency,
      cost: 0.05 + complexity * 1.75 + familyIndex * 0.12,
      size: 15 + complexity * 190 + familyIndex * 18,
    };
  });
}

/** Resolve stable run IDs without assuming IDs are array indexes. */
export function runsById(
  runs: readonly ExperimentRun[],
  ids: readonly number[],
  limit = 4,
): ExperimentRun[] {
  const byId = new Map(runs.map(run => [run.id, run]));
  const resolved: ExperimentRun[] = [];
  const seen = new Set<number>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    const run = byId.get(id);
    if (!run) continue;
    seen.add(id);
    resolved.push(run);
    if (resolved.length === limit) break;
  }
  return resolved;
}

/** Translate scatter-store row indexes back to stable run IDs. */
export function runIdsAtRows(
  runs: readonly ExperimentRun[],
  rowIndexes: readonly number[],
  limit = 4,
): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const rowIndex of rowIndexes) {
    const id = runs[rowIndex]?.id;
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length === limit) break;
  }
  return ids;
}

/** Return a non-mutating, accuracy-descending ranking. */
export function topRunsByAccuracy(
  runs: readonly ExperimentRun[],
  limit = 7,
): ExperimentRun[] {
  return [...runs].sort((a, b) => b.accuracy - a.accuracy).slice(0, limit);
}

export function experimentColumns(runs: ExperimentRun[]): ColumnarData {
  return [
    f64(runs.map((r) => r.id)),
    f64(runs.map((r) => r.latency)),
    f64(runs.map((r) => r.accuracy * 100)),
    f64(runs.map((r) => families.indexOf(r.family))),
    f64(runs.map((r) => r.size)),
    f64(runs.map((r) => r.cost)),
  ];
}

export function metricHistogram(runs: ExperimentRun[], metric: 'accuracy' | 'latency'): ColumnarData {
  const values = runs.map((r) => metric === 'accuracy' ? r.accuracy * 100 : r.latency);
  const bins = histogram(f64(values), { binCount: 18 });
  return [bins.edges, bins.counts];
}

export function progressColumns(runs: ExperimentRun[]): ColumnarData {
  const steps = Array.from({ length: 80 }, (_, i) => i);
  return [
    f64(steps),
    ...runs.map((run) => f64(steps.map((step) => progressValue(run, step)))),
  ];
}

export function progressValue(run: ExperimentRun, step: number): number {
  const ceiling = run.accuracy * 100;
  return 54 + (ceiling - 54) * (1 - Math.exp(-step / (17 + run.id % 8))) + Math.sin(step / 5 + run.id) * 0.35;
}

/** Series order and data indexes shared by trajectories and the scorecard. */
export function comparisonSeries(
  runs: readonly ExperimentRun[],
): SeriesConfig<{ runId: number }>[] {
  return runs.map((run, index) => ({
    label: run.name,
    dataIndex: index + 1,
    type: 'line',
    lineWidth: 2,
    interpolation: 'monotone',
    meta: { runId: run.id },
  }));
}

export function comparisonColumns(runs: ExperimentRun[]): ColumnarData {
  return [
    f64(comparisonMetrics.map((_, index) => index)),
    ...runs.map((run) => f64(comparisonScores(run))),
  ];
}

/** Scorecard values in `comparisonMetrics` order; every metric is higher-is-better. */
export function comparisonScores(run: ExperimentRun): [number, number, number] {
  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  return [
    clamp(run.accuracy * 100),
    clamp(100 - run.latency / 2.2),
    clamp(100 - run.cost * 22),
  ];
}

export interface EnergyPoint {
  time: number;
  consumption: number;
  solar: number;
  forecast: number;
  upper: number;
  lower: number;
  battery: number;
  price: number;
  temperature: number;
}

export function energyDay(dayOffset = 0, solarScale = 1, batteryCapacity = 13.5): EnergyPoint[] {
  const rand = mulberry32(0xe11e9 + dayOffset * 31);
  // Snaplot time axes format in the viewer's local timezone. The scenario is
  // explicitly Cape Town (UTC+2), so anchor the dataset at local midnight.
  const start = Date.UTC(2026, 6, 10 + dayOffset, 0, 0, 0) - 2 * 3_600_000;
  let battery = batteryCapacity * 0.42;
  return Array.from({ length: 288 }, (_, i) => {
    const hour = i / 12;
    const daylight = Math.max(0, Math.sin(((hour - 6.1) / 13.2) * Math.PI));
    const breakfast = Math.exp(-((hour - 7.5) ** 2) / 1.1);
    const dinner = Math.exp(-((hour - 19.1) ** 2) / 2.4);
    const consumption = 0.42 + breakfast * 1.55 + dinner * 2.2 + rand() * 0.22;
    const solar = daylight ** 1.7 * 5.9 * solarScale * (0.9 + rand() * 0.12);
    const forecast = daylight ** 1.65 * 5.7 * solarScale;
    battery = Math.max(0, Math.min(batteryCapacity, battery + (solar - consumption) / 12));
    const temperature = 13 + daylight * 15 + Math.sin(hour / 24 * Math.PI * 2) * 2;
    return {
      time: start + i * 300_000,
      consumption,
      solar,
      forecast,
      upper: forecast * 1.16 + 0.1,
      lower: Math.max(0, forecast * 0.82 - 0.1),
      battery: battery / batteryCapacity * 100,
      price: hour >= 17 && hour < 21 ? 4.12 : hour >= 6 && hour < 9 ? 3.14 : 1.86,
      temperature,
    };
  });
}

export function energyColumns(points: EnergyPoint[], missing = false, noForecast = false): ColumnarData {
  return [
    f64(points.map((p) => p.time)),
    f64(points.map((p, i) => missing && i > 118 && i < 142 ? Number.NaN : p.consumption)),
    f64(points.map((p) => p.solar)),
    f64(points.map((p) => noForecast ? Number.NaN : p.forecast)),
    f64(points.map((p) => noForecast ? Number.NaN : p.upper)),
    f64(points.map((p) => noForecast ? Number.NaN : p.lower)),
    f64(points.map((p) => p.battery)),
    f64(points.map((p) => p.price)),
    f64(points.map((p) => p.temperature)),
  ];
}

export function energyHistogram(points: EnergyPoint[]): ColumnarData {
  const bins = histogram(f64(points.map((p) => p.consumption)), { binCount: 14 });
  return [bins.edges, bins.counts];
}

export function energyScatter(days = 45): ColumnarData {
  const rand = mulberry32(0x50a4);
  const rows = Array.from({ length: days * 24 }, (_, id) => {
    const temperature = 8 + rand() * 27;
    const demand = 0.6 + Math.abs(20 - temperature) * 0.09 + rand() * 0.75;
    return { id, temperature, demand };
  });
  return [f64(rows.map((r) => r.id)), f64(rows.map((r) => r.temperature)), f64(rows.map((r) => r.demand))];
}

export function energyComparison(): ColumnarData {
  const days = Array.from({ length: 14 }, (_, i) => i);
  return [
    f64(days),
    f64(days.map((i) => 16 + Math.sin(i / 2) * 3 + (i % 3))),
    f64(days.map((i) => 21 + Math.cos(i / 3) * 5 + (i % 2))),
  ];
}
