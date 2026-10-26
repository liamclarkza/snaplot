/**
 * The dashboard's panels as chart options. Colours follow the incident-dashboard convention the
 * page is designed from: greys for p50 and p95, amber only for p99, red only for an SLO breach,
 * a cool blue for deploy annotations.
 */
import type {
  ChartGroup,
  ChartProps,
  HistogramBins,
  ReferenceLine,
  ThemeTokens,
} from 'snaplot/solid';
import type { EndpointChange } from './answer';
import { type Columns, NAMES, stem } from './incident';
import { type Deploy, ERROR_SLO } from './simulator';

export const COLOR = {
  p50: '#6E7178',
  p95: '#A3A6AD',
  p99: '#F2A33A',
  breach: '#F2495C',
  ok: '#5A5E66',
  deploy: '#8AB8FF',
  before: '#7B7F87',
  after: '#D9DAE0',
  endpoints: ['#B877D9', '#56C2B5', '#C8C9D0', '#7B8CA6'],
} as const;

export const THEME: ThemeTokens = {
  mode: 'dark',
  surface: '#181B1F',
  text: '#CCCCDC',
  muted: '#8E9099',
  accent: '#E0E0E6',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 11,
};

/** Ten simulated minutes in view while following; an hour kept. */
export const STREAMING = { followWindow: 10 * 60_000, maxPoints: 3600 };

const ms = { maximumFractionDigits: 0, suffix: ' ms' };
/** 24-hour UTC times with seconds: the page's timeZone applies to format options. */
const time = {
  type: 'time' as const,
  format: { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' } as const,
};

/** Deploy annotations: one dashed line per deploy, labelled with its id. */
export const deployLines = (deploys: readonly Deploy[], labels = true): ReferenceLine[] =>
  deploys.map((d) => ({
    axis: 'x',
    value: d.time,
    color: COLOR.deploy,
    dash: [3, 3],
    ...(labels ? { label: d.kind === 'rollback' ? `${d.id} rollback` : d.id } : {}),
  }));

/** Shared by the three time panels. */
const live = (data: Columns, group: ChartGroup) => ({
  data,
  x: 'time',
  streaming: STREAMING,
  timeZone: 'UTC' as const,
  theme: THEME,
  group,
});

/** The latency panel: p50, p95 and p99 per second on a log axis. */
export const latency = (data: Columns, group: ChartGroup): ChartProps => ({
  ...live(data, group),
  series: latencySeries('/search'),
  axes: { x: time, y: { type: 'log', format: ms } },
  legend: false,
});

/** The latency series of one endpoint; the ids stay p50, p95 and p99 for every endpoint. */
export const latencySeries = (endpoint: string): ChartProps['series'] => {
  const s = stem(endpoint);
  return [
    { id: 'p50', y: `${s}_p50`, label: 'p50', color: COLOR.p50, lineWidth: 1 },
    { id: 'p95', y: `${s}_p95`, label: 'p95', color: COLOR.p95, lineWidth: 1 },
    { id: 'p99', y: `${s}_p99`, label: 'p99', color: COLOR.p99, lineWidth: 1.5 },
  ];
};

/** The error panel: error % per second, on a percentage axis that starts at zero. */
export const errors = (data: Columns, group: ChartGroup): ChartProps => ({
  ...live(data, group),
  series: errorSeries('/search'),
  axes: { x: time, y: { min: 0, format: { maximumFractionDigits: 2, suffix: '%' } } },
  legend: false,
});

/** One endpoint's error %, as bars that turn red above the SLO. */
export const errorSeries = (endpoint: string): ChartProps['series'] => {
  const slo = ERROR_SLO * 100;
  return [
    {
      id: 'errors',
      type: 'bar',
      y: stem(endpoint),
      label: 'Errors',
      color: (v: number) => (v > slo ? COLOR.breach : COLOR.ok),
    },
  ];
};

/** The SLO threshold, drawn on the error panel's percentage axis. */
export const sloLine: ReferenceLine = {
  axis: 'y',
  value: ERROR_SLO * 100,
  label: `SLO ${ERROR_SLO * 100}%`,
  color: COLOR.breach,
  dash: [6, 3],
};

/** Requests per second, one line per endpoint, with the built-in legend. */
export function traffic(data: Columns, group: ChartGroup): ChartProps {
  return {
    ...live(data, group),
    series: NAMES.map((name, i) => ({
      id: stem(name),
      y: stem(name),
      label: name,
      color: COLOR.endpoints[i],
      lineWidth: 1,
    })),
    axes: { x: time, y: { min: 0, format: { maximumFractionDigits: 0, suffix: '/s' } } },
    legend: { position: 'top' },
  };
}

const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}%`;

/** p99 change by endpoint around one deploy: amber where it moved by 50% or more. */
export const change: ChartProps = {
  x: 'endpoint',
  series: [
    {
      id: 'change',
      type: 'bar',
      y: 'change',
      label: 'p99 change',
      color: (v: number) => (Math.abs(v) >= 50 ? COLOR.p99 : COLOR.ok),
    },
  ],
  axes: { y: { format: signed } },
  referenceRegions: [{ axis: 'y', from: -20, to: 20, label: 'unchanged ±20%', opacity: 0.1 }],
  interaction: 'readonly',
  legend: false,
  theme: THEME,
};

/** The change chart's rows, in percent. */
export const changeRows = (changes: readonly EndpointChange[]) =>
  changes.map((c) => ({ endpoint: c.endpoint, change: 100 * c.change }));

/** Latency distributions two minutes either side of a deploy, on shared log-spaced bins. */
export const distribution: ChartProps = {
  series: [],
  axes: {
    x: { type: 'log', format: ms },
    y: { min: 0, format: { maximumFractionDigits: 0 } },
  },
  interaction: 'readonly',
  legend: { position: 'top' },
  theme: THEME,
};

export const distributionSeries = (
  before: HistogramBins,
  after: HistogramBins,
): ChartProps['series'] => [
  { id: 'before', type: 'histogram', data: before, label: '2 min before', color: COLOR.before },
  { id: 'after', type: 'histogram', data: after, label: '2 min after', color: COLOR.after },
];
