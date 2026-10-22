import type { ChartSpec, DataState, Row, Scenario, ScenarioId, TrialSeries } from './types';

const cyan = '#18b6b1';
const orange = '#ee9960';
const violet = '#a28bef';
const blue = '#559ae8';
const series = (id: string, label: string, color: string, kind: TrialSeries['kind'] = 'line', axis?: 'right'): TrialSeries => ({ id, label, color, kind, axis });
const integer = (n: number) => Math.round(n).toLocaleString('en-US');
const decimal = (n: number) => n.toFixed(1);
const clock = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
const hour = (n: number) => `${String(Math.floor(n)).padStart(2, '0')}:00`;

export const scenarios: Scenario[] = [
  {
    id: 'uav', number: '01', name: 'UAV ground station', product: 'AERIS / GROUND CONTROL',
    eyebrow: 'MISSION 024 / COASTAL SURVEY', title: 'Eyes on the flight.',
    description: 'Track a survey aircraft through a climb, a radio dropout, and a battery warning. Keep mixed units readable in a compact ground station.',
    accent: cyan, operator: 'Flight systems',
    metrics: [{ label: 'Altitude', value: '142 m', detail: 'AGL · target 150 m' }, { label: 'Ground speed', value: '18.4 m/s', detail: 'Cruise envelope' }, { label: 'Battery', value: '62%', detail: 'Return reserve 30%' }, { label: 'Link quality', value: '−68 dBm', detail: '2.4 GHz downlink' }],
    table: { headings: ['Asset', 'Mode', 'Health'], rows: [['Aeris 07', 'Survey leg 04', 'Nominal'], ['Aeris 12', 'Standby', 'Ready'], ['Ground relay', 'Tracking', 'Online']] },
    challenges: ['Two units and two Y axes in one narrow card', 'Telemetry gaps must stay disconnected', 'Threshold labels must fit after a sidebar resize'],
  },
  {
    id: 'f1', number: '02', name: 'Formula 1 telemetry', product: 'APEX / PIT WALL',
    eyebrow: 'SIMULATED SESSION / LAP 32', title: 'Find the tenth.',
    description: 'Compare two laps by track distance. Read braking points, throttle application, and cumulative time loss without confusing their scales.',
    accent: orange, operator: 'Race engineering',
    metrics: [{ label: 'Lap time', value: '1:28.421', detail: 'Car 07 · lap 32' }, { label: 'Reference delta', value: '+0.184 s', detail: 'Against lap 29' }, { label: 'Top speed', value: '318 km/h', detail: 'Main straight' }, { label: 'Tyre age', value: '12 laps', detail: 'Medium compound' }],
    table: { headings: ['Sector', 'Time', 'Delta'], rows: [['Sector 1', '28.014', '+0.062'], ['Sector 2', '33.278', '−0.041'], ['Sector 3', '27.129', '+0.163']] },
    challenges: ['Distance-aligned traces with different Y-label widths', 'Signed lap delta around a zero reference', 'Rapid deterministic replay without chart remounts'],
  },
  {
    id: 'ml', number: '03', name: 'ML experiment tracker', product: 'ORBIT / EXPERIMENTS',
    eyebrow: 'VISION / RESNET SWEEP 018', title: 'Follow the signal.',
    description: 'Compare training runs over several orders of magnitude, find validation divergence, and inspect the quality–latency tradeoff.',
    accent: violet, operator: 'Model research',
    metrics: [{ label: 'Active runs', value: '3', detail: 'Shared training budget' }, { label: 'Best accuracy', value: '94.2%', detail: 'Run violet / epoch 120' }, { label: 'Lowest loss', value: '0.014', detail: 'Logarithmic scale' }, { label: 'GPU budget', value: '18.6 h', detail: 'Synthetic experiment' }],
    table: { headings: ['Run', 'Learning rate', 'Status'], rows: [['Baseline', '1e−3', 'Completed'], ['Augmented', '3e−4', 'Training'], ['Regularized', '1e−4', 'Training']] },
    challenges: ['Positive log loss across three decades', 'Stable run IDs when series visibility changes', 'Scatter points and long metric titles in dense cards'],
  },
  {
    id: 'transport', number: '04', name: 'Airport operations', product: 'CONCOURSE / OPERATIONS',
    eyebrow: 'TERMINAL 02 / PLANNING DESK', title: 'Keep the day moving.',
    description: 'Spot the evening arrival surge, compare gate demand with capacity, and connect service delays to queue pressure.',
    accent: blue, operator: 'Terminal operations',
    metrics: [{ label: 'Movements', value: '284', detail: 'Planning snapshot' }, { label: 'On time', value: '87.3%', detail: 'Departures within 15 min' }, { label: 'Peak gate use', value: '92%', detail: '18:00 local' }, { label: 'Median queue', value: '8 min', detail: 'Security checkpoint' }],
    table: { headings: ['Flight', 'Gate', 'State'], rows: [['SL 204 · Cape Town', 'B12', 'Boarding'], ['SL 618 · Nairobi', 'B08', 'On time'], ['SL 332 · Durban', 'B04', '+18 min']] },
    challenges: ['Grouped bars on a numeric hourly axis', 'Capacity line in a compact chart', 'Long labels and wide tables without page overflow'],
  },
  {
    id: 'biology', number: '05', name: 'Biological experiment', product: 'CULTURE / LAB NOTEBOOK',
    eyebrow: 'ASSAY B-204 / COMPOUND SCREEN', title: 'Separate effect from noise.',
    description: 'Inspect replicate growth curves, compare treatment endpoints, and read a dose response across five orders of concentration.',
    accent: cyan, operator: 'Assay development',
    metrics: [{ label: 'Plate', value: 'B-204', detail: 'Three treatment arms' }, { label: 'Duration', value: '48 h', detail: 'Incubator at 37 °C' }, { label: 'Peak OD600', value: '1.82', detail: 'Vehicle control' }, { label: 'Replicates', value: '3 / arm', detail: 'Synthetic study' }],
    table: { headings: ['Treatment', 'Dose', 'Replicates'], rows: [['Vehicle', '0 µM', '3 valid'], ['Compound A', '0.3 µM', '3 valid'], ['Compound B', '3.0 µM', '3 valid']] },
    challenges: ['Log concentration X axis with irregular spacing', 'Replicate curves must remain distinguishable', 'Small decimal ticks and missing assay readings'],
  },
];

// Stateless, seeded noise: replay tick N always reconstructs the same fixture.
function noise(i: number, seed = 1): number {
  const v = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return v - Math.floor(v);
}
function rows(count: number, fn: (t: number, i: number) => Row): Row[] {
  return Array.from({ length: count }, (_, i) => fn(i / Math.max(1, count - 1), i));
}
function spec(base: Omit<ChartSpec, 'rows'>, data: Row[]): ChartSpec { return { ...base, rows: data }; }

export function buildCharts(id: ScenarioId, count = 180, tick = 0, state: DataState = 'ready', focused = false): ChartSpec[] {
  const phase = tick * 0.13;
  let charts: ChartSpec[];
  if (id === 'uav') {
    charts = [
      spec({ id: 'flight', title: 'Flight envelope', subtitle: 'Altitude and ground speed · shared mission time', xLabel: 'Mission time', yLabel: 'Altitude (m)', rightLabel: 'Speed (m/s)', xFormat: clock, yDomain: [0, 200], rightDomain: [0, 30], reference: { value: 150, label: 'Target 150 m' }, series: [series('alt', 'Altitude', cyan), series('speed', 'Ground speed', orange, 'line', 'right')] }, rows(count, (t) => ({ x: t * 180 + tick, alt: 60 + 85 * (1 - Math.exp(-t * 6)) + 7 * Math.sin(t * 22 + phase), speed: 14 + 5 * Math.sin(t * 13 + phase) }))),
      spec({ id: 'power', title: 'Energy reserve', subtitle: 'Return-to-home threshold · 30%', xLabel: 'Mission time', yLabel: 'Battery (%)', xFormat: clock, yDomain: [0, 100], reference: { value: 30, label: 'Return reserve' }, series: [series('battery', 'Battery', cyan, 'area')] }, rows(count, (t) => ({ x: t * 180 + tick, battery: 94 - t * 32 - Math.sin(phase) * 2 }))),
      spec({ id: 'radio', title: 'Downlink integrity', subtitle: 'Received signal and interference', xLabel: 'Mission time', yLabel: 'Signal (dBm)', xFormat: clock, yDomain: [-100, -40], reference: { value: -85, label: 'Link warning' }, series: [series('signal', 'RSSI', blue), series('noise', 'Noise floor', violet)] }, rows(count, (t, i) => ({ x: t * 180 + tick, signal: -62 - 8 * Math.sin(t * 14 + phase) - 15 * Math.exp(-(((t - 0.6) / 0.05) ** 2)), noise: -90 + noise(i + tick, 3) * 4 }))),
    ];
  } else if (id === 'f1') {
    charts = [
      spec({ id: 'speed', title: 'Speed trace', subtitle: 'Car 07 versus reference · distance aligned', xLabel: 'Lap distance (m)', yLabel: 'Speed (km/h)', xFormat: integer, yDomain: [0, 350], series: [series('current', 'Lap 32', orange), series('reference', 'Lap 29', cyan)] }, rows(count, (t) => ({ x: t * 5200, current: 110 + 205 * Math.abs(Math.sin(t * 13 + phase * 0.02)), reference: 113 + 201 * Math.abs(Math.sin(t * 13 + 0.09)) }))),
      spec({ id: 'inputs', title: 'Driver inputs', subtitle: 'Throttle application and brake pressure', xLabel: 'Lap distance (m)', yLabel: 'Application (%)', xFormat: integer, yDomain: [0, 100], series: [series('throttle', 'Throttle', cyan, 'area'), series('brake', 'Brake', orange)] }, rows(count, (t) => ({ x: t * 5200, throttle: Math.max(0, 100 * Math.sin(t * 26 + phase * 0.02)), brake: Math.max(0, -85 * Math.sin(t * 26 + 0.3)) }))),
      spec({ id: 'delta', title: 'Time gained / lost', subtitle: 'Positive delta is slower than reference', xLabel: 'Lap distance (m)', yLabel: 'Delta (s)', xFormat: integer, yFormat: decimal, yDomain: [-0.4, 0.6], reference: { value: 0, label: 'Reference lap' }, series: [series('delta', 'Cumulative delta', violet)] }, rows(count, (t) => ({ x: t * 5200, delta: 0.184 * t + 0.15 * Math.sin(t * 18 + phase * 0.1) * Math.sin(t * Math.PI) }))),
    ];
  } else if (id === 'ml') {
    charts = [
      spec({ id: 'loss', title: 'Training / cross-entropy loss', subtitle: 'Three runs · logarithmic Y axis', xLabel: 'Epoch', yLabel: 'Cross-entropy loss', yScale: 'log', yDomain: [0.001, 10], yFormat: (v) => v < 1 ? String(Number(v.toPrecision(2))) : integer(v), series: [series('baseline', 'Baseline', cyan), series('augmented', 'Augmented', orange), series('regularized', 'Regularized', violet)] }, rows(count, (t) => ({ x: t * 120, baseline: 3 * Math.exp(-t * 5) + 0.04, augmented: 4 * Math.exp(-t * 7) + 0.016 + Math.sin(t * 30 + phase) ** 2 * 0.01, regularized: 2 * Math.exp(-t * 6) + 0.009 }))),
      spec({ id: 'accuracy', title: 'Validation accuracy', subtitle: 'Generalization under a fixed training budget', xLabel: 'Epoch', yLabel: 'Accuracy (%)', yDomain: [50, 100], reference: { value: 90, label: 'Release gate' }, series: [series('baseline', 'Baseline', cyan), series('augmented', 'Augmented', orange), series('regularized', 'Regularized', violet)] }, rows(count, (t) => ({ x: t * 120, baseline: 55 + 36 * (1 - Math.exp(-t * 5)), augmented: 54 + 40 * (1 - Math.exp(-t * 5)), regularized: 58 + 38 * (1 - Math.exp(-t * 3)) }))),
      spec({ id: 'tradeoff', title: 'Quality versus inference latency', subtitle: 'Candidate checkpoints · one point per evaluation', xLabel: 'Latency (ms)', yLabel: 'Accuracy (%)', yDomain: [70, 100], series: [series('candidate', 'Checkpoints', violet, 'scatter')] }, rows(count, (t, i) => ({ x: 8 + t * 80, candidate: 76 + 18 * (1 - Math.exp(-t * 4)) + (noise(i, 9) - 0.5) * 5 }))),
    ];
  } else if (id === 'transport') {
    charts = [
      spec({ id: 'movements', title: 'Arrival and departure bank', subtitle: 'Hourly movements · local terminal time', xLabel: 'Local time', yLabel: 'Flights / hour', xFormat: hour, yDomain: [0, 40], series: [series('arrivals', 'Arrivals', blue, 'bar'), series('departures', 'Departures', cyan, 'bar')] }, rows(12, (_, i) => ({ x: 7 + i, arrivals: Math.round(13 + 14 * Math.sin(i * 0.6) ** 2), departures: Math.round(10 + 17 * Math.cos(i * 0.5) ** 2) }))),
      spec({ id: 'gates', title: 'Gate occupancy', subtitle: 'Forecast versus available stands', xLabel: 'Local time', yLabel: 'Occupied gates', xFormat: hour, yDomain: [0, 30], reference: { value: 24, label: 'Capacity 24' }, series: [series('gates', 'Forecast', blue, 'area')] }, rows(count, (t) => ({ x: 7 + t * 12, gates: 10 + 13 * Math.sin(t * 5 + phase * 0.04) ** 2 }))),
      spec({ id: 'queues', title: 'Security queue pressure', subtitle: 'Wait time and passenger demand', xLabel: 'Local time', yLabel: 'Wait (min)', rightLabel: 'Passengers / h', xFormat: hour, yDomain: [0, 30], rightDomain: [0, 2000], series: [series('wait', 'Wait time', orange), series('passengers', 'Passengers', violet, 'line', 'right')] }, rows(count, (t) => ({ x: 7 + t * 12, wait: 4 + 19 * Math.sin(t * 7) ** 4, passengers: 300 + 1300 * Math.sin(t * 7 + 0.25) ** 4 }))),
    ];
  } else {
    charts = [
      spec({ id: 'growth', title: 'Growth kinetics / biological replicates', subtitle: 'Vehicle arm · optical density at 600 nm', xLabel: 'Incubation (h)', yLabel: 'OD600 (AU)', yFormat: decimal, yDomain: [0, 2.2], series: [series('r1', 'Replicate 1', cyan), series('r2', 'Replicate 2', orange), series('r3', 'Replicate 3', violet)] }, rows(count, (t) => ({ x: t * 48, r1: (1.8 + Math.sin(phase) * 0.015) / (1 + Math.exp(-12 * (t - 0.46))), r2: (1.9 + Math.sin(phase) * 0.01) / (1 + Math.exp(-11 * (t - 0.49))), r3: 1.75 / (1 + Math.exp(-13 * (t - 0.43))) }))),
      spec({ id: 'dose', title: 'Dose–response curve', subtitle: 'Compound A · logarithmic concentration', xLabel: 'Concentration (µM)', yLabel: 'Viability (%)', xScale: 'log', xFormat: (v) => String(Number(v.toPrecision(2))), yDomain: [0, 110], reference: { value: 50, label: 'Half response' }, series: [series('viability', 'Viability', cyan, 'scatter')] }, rows(Math.min(count, 60), (t, i) => ({ x: 10 ** (-3 + t * 5), viability: Math.max(1, 100 / (1 + (10 ** (-3 + t * 5) / 0.3) ** 1.1) + (noise(i, 4) - 0.5) * 5) }))),
      spec({ id: 'endpoint', title: 'Endpoint treatment comparison', subtitle: 'Mean viability at 48 h · three replicates', xLabel: 'Treatment', yLabel: 'Viability (%)', xFormat: (v) => Number.isInteger(v) ? ['Vehicle', 'Compound A', 'Compound B'][v] ?? '' : '', yDomain: [0, 110], series: [series('viability', 'Mean viability', violet, 'bar')] }, [{ x: 0, viability: 98 }, { x: 1, viability: 53 }, { x: 2, viability: 18 }]),
    ];
  }
  return charts.map((chart) => ({
    ...chart,
    rows: state === 'empty' ? [] : chart.rows
      .map((row, i) => state === 'gaps' && chart.rows.length > 20 && i > chart.rows.length * 0.4 && i < chart.rows.length * 0.5
        ? Object.fromEntries(Object.entries(row).map(([key, value]) => [key, key === 'x' ? value : null])) as Row : row)
      .filter((_, i) => !focused || i >= Math.floor(chart.rows.length * 2 / 3)),
  }));
}
