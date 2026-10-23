/**
 * Axis, tick, domain, time and annotation fixtures (owned by M10 from W5): the chart-lab
 * DEFAULTS_FINDINGS cases (`experiments/chart-lab/src/audit/fixtures.ts` at overhaul-baseline,
 * driven by `evidence/backlog/lab-cases.mjs`) and the axis edge cases of the render, dxtrial,
 * dataapi, gap-environments and gap-annotations-extensibility audits.
 */
import type { ChartOptions } from '../../../src/index';
import { DAY, range, utc } from './data';
import type { Fixture } from './types';

// ─── DEFAULTS_FINDINGS (DEF-01 … DEF-05) ───

interface LabRow {
  x: number;
  reading: number;
  other: number;
}

const labRows = (): LabRow[] =>
  range(12, (i) => ({ x: i, reading: 20 + 8 * Math.sin(i / 2), other: 100000 + i * 73000 }));

const labTitles = { x: 'Elapsed time (s)', y: 'Temperature (°C)' };

function labLine(
  rows: LabRow[],
  axes: { x?: object; y?: object } = {},
  titles = labTitles,
): ChartOptions<any> {
  return {
    data: rows,
    x: 'x',
    axes: { x: { title: titles.x, ...axes.x }, y: { title: titles.y, ...axes.y } },
    series: [{ id: 'reading', y: 'reading', label: 'Sensor reading' }],
  };
}

const LONG_TITLES = {
  x: 'Elapsed experiment time since the first validated baseline observation (seconds)',
  y: 'Ambient-compensated temperature at the primary measurement location (degrees Celsius)',
};

const AIRPORT_AREAS = [
  'International arrivals',
  'Domestic departures',
  'Transfer connections',
  'Remote aircraft stands',
  'Northern cargo apron',
  'Southern maintenance hangars',
];

/** 30 long category labels (DEF-03, render-02, backlog-03). */
const longCategories = () =>
  range(30, (i) => ({
    area: `${AIRPORT_AREAS[i % AIRPORT_AREAS.length]} ${Math.floor(i / AIRPORT_AREAS.length) + 1}`,
    flights: 20 + ((i * 37) % 50),
  }));

const defaults: Fixture[] = [
  {
    id: 'axes/titles-320',
    title: 'DEF-01: long axis titles at 320 × 220 are clipped (visuals-21)',
    width: 320,
    height: 220,
    options: () => labLine(labRows(), {}, LONG_TITLES),
  },
  {
    id: 'axes/titles-480',
    title: 'DEF-01: long axis titles at 480 × 220 (the Y title still clips)',
    width: 480,
    height: 220,
    options: () => labLine(labRows(), {}, LONG_TITLES),
  },
  {
    id: 'axes/long-ticks-320',
    title: 'DEF-02: long formatted ticks at 320 × 220',
    width: 320,
    height: 220,
    options: () =>
      labLine(
        labRows(),
        {
          x: { format: (v: number | string) => `Window ${Number(v).toFixed(1)} seconds` },
          y: { format: (v: number | string) => `${Number(v).toFixed(2)} milligrams per litre` },
        },
        { x: labTitles.x, y: 'Concentration' },
      ),
  },
  {
    id: 'axes/categories-30-480',
    title: 'DEF-03: 30 long category labels on bars at 480 × 220',
    width: 480,
    height: 220,
    options: () => ({
      data: longCategories(),
      x: 'area',
      axes: { x: { title: 'Terminal operations area' }, y: { title: 'Flights' } },
      series: [{ y: 'flights', type: 'bar', label: 'Flights' }],
    }),
  },
  {
    id: 'axes/categories-30-320',
    title: 'DEF-03: 30 long category labels on bars at 320 × 220',
    width: 320,
    height: 220,
    options: () => ({
      data: longCategories(),
      x: 'area',
      axes: { x: { title: 'Terminal operations area' }, y: { title: 'Flights' } },
      series: [{ y: 'flights', type: 'bar', label: 'Flights' }],
    }),
  },
  {
    id: 'axes/single-320',
    title: 'DEF-04: one observation draws no mark (render-05, backlog-04)',
    width: 320,
    height: 220,
    options: () => labLine(labRows().slice(0, 1)),
  },
  {
    id: 'axes/constant-320',
    title: 'DEF-05: constant readings get a finite centred domain',
    width: 320,
    height: 220,
    options: () => labLine(labRows().map((row) => ({ ...row, reading: 20 }))),
  },
  {
    id: 'axes/precision-320',
    title: 'Lab case: very small differences around 1',
    width: 320,
    height: 220,
    options: () => labLine(labRows().map((row) => ({ ...row, reading: 1 + row.reading / 1e7 }))),
  },
  {
    id: 'axes/large-320',
    title: 'Lab case: large values (×1e8)',
    width: 320,
    height: 220,
    options: () => labLine(labRows().map((row) => ({ ...row, reading: row.reading * 1e8 }))),
  },
];

// ─── Axis edge cases ───

const wave = () =>
  range(30, (t) => ({ t, v: Math.sin(t / 4) * 40 + 50, w: Math.cos(t / 4) * 0.4 + 0.5 }));

const edges: Fixture[] = [
  {
    id: 'axes/empty',
    title: 'Empty data draws fake 0–1 axes (visuals-23)',
    width: 480,
    height: 240,
    skip: {
      minLabels: 'the empty state shows no ticks by design (plan §5.1 "Empty data")',
      paints: 'no data',
    },
    options: () => ({ data: [], x: 't', series: [{ y: 'v', label: 'Reading' }] }),
  },
  {
    id: 'axes/bars-all-negative',
    title: 'All-negative bars get positive headroom (render-22)',
    width: 480,
    height: 240,
    options: () => ({
      data: range(6, (i) => ({ c: `Q${i + 1}`, v: -10 - i * 7 })),
      x: 'c',
      series: [{ y: 'v', type: 'bar', label: 'Change' }],
    }),
  },
  {
    id: 'axes/log-under-decade',
    title: 'A log Y axis over 11–19 (less than a decade) gets no labels (render-06)',
    width: 480,
    height: 240,
    options: () => ({
      data: range(40, (t) => ({ t, v: 11 + 8 * (0.5 + 0.5 * Math.sin(t / 6)) })),
      x: 't',
      axes: { y: { type: 'log' } },
      series: [{ y: 'v', label: 'Latency' }],
    }),
  },
  {
    id: 'axes/time-seconds',
    title: 'A time axis spanning 4 s of 100 ms samples at 820 px (dxtrial-10: repeated labels)',
    width: 820,
    height: 220,
    dpr2: true,
    options: () => {
      const t0 = utc(2026, 0, 1, 12);
      return {
        data: range(41, (i) => ({ time: new Date(t0 + i * 100), v: Math.sin(i / 8) })),
        x: 'time',
        series: [{ y: 'v', label: 'Signal' }],
      };
    },
  },
  {
    id: 'axes/time-minutes-480',
    title: 'A 5-minute time axis at 480 px: clamped end labels (render-14)',
    width: 480,
    height: 220,
    options: () => {
      const t0 = utc(2026, 4, 4, 10);
      return {
        data: range(61, (i) => ({ time: new Date(t0 + i * 5e3), v: 20 + 6 * Math.sin(i / 5) })),
        x: 'time',
        series: [{ y: 'v', label: 'Queue depth' }],
      };
    },
  },
  {
    id: 'axes/format-collapse',
    title: 'A percent format that collapses neighbouring ticks to one text (render-19)',
    width: 480,
    height: 240,
    options: () => ({
      data: range(30, (t) => ({ t, v: 0.999 + t * 0.00003 })),
      x: 't',
      axes: { y: { format: (v: number | string) => `${(Number(v) * 100).toFixed(1)}%` } },
      series: [{ y: 'v', label: 'Availability' }],
    }),
  },
  {
    id: 'axes/histogram-tiny-range',
    title: 'Histogram bins over 0–0.003 label their edges with toFixed(1) (render-08)',
    width: 480,
    height: 240,
    options: (lib) => ({
      series: [
        {
          id: 'h',
          type: 'histogram',
          label: 'Error',
          data: lib.histogram(
            Float64Array.from(
              range(500, (i) => ((((Math.sin(i * 7.1) * 1e4) % 1) + 1) % 1) * 0.003),
            ),
            { binCount: 12 },
          ),
        },
      ],
    }),
  },
  {
    id: 'axes/time-epoch-bars',
    title: 'Monthly bars on a Date X label ticks with epoch ms (render-01)',
    width: 520,
    height: 240,
    options: () => ({
      data: range(12, (i) => ({ t: new Date(utc(2026, i, 1)), v: 10 + ((i * 5) % 7) })),
      x: 't',
      axes: { x: { type: 'time' } },
      series: [{ y: 'v', type: 'bar', label: 'Orders' }],
    }),
  },
  {
    id: 'axes/iso-strings',
    title: 'ISO date strings infer a category axis that draws every label (dataapi-07)',
    width: 640,
    height: 240,
    options: () => ({
      data: range(60, (i) => ({
        date: new Date(utc(2026, 2, 1) + i * DAY).toISOString().slice(0, 10),
        v: 40 + 12 * Math.sin(i / 7) + (i % 5),
      })),
      x: 'date',
      series: [{ y: 'v', label: 'Visits' }],
    }),
  },
  {
    id: 'axes/annotations-390',
    title: 'Reference lines and regions at 390 px (gap-annotations-extensibility-02)',
    width: 390,
    height: 200,
    dpr2: true,
    options: () => {
      const t0 = utc(2026, 9, 22, 3);
      const rows = range(120, (i) => ({
        t: new Date(t0 + i * 5e3),
        p99: 140 + 20 * Math.sin(i / 9),
      }));
      return {
        data: rows,
        x: 't',
        series: [{ y: 'p99', label: 'p99' }],
        referenceLines: [
          { axis: 'y', value: 150, label: 'SLO 150 ms', color: '#d62728' },
          { axis: 'y', value: 152, label: 'Page 152 ms', color: '#ff7f0e' },
          { axis: 'x', value: rows[60].t, label: 'Deploy #481' },
          { axis: 'x', value: rows[119].t, label: 'Deploy #482 (newest)' },
        ],
        referenceRegions: [
          { axis: 'x', from: rows[20].t, to: rows[30].t, label: 'GC pause', opacity: 0.15 },
        ],
      };
    },
  },
  {
    id: 'axes/y2-dual',
    title: 'Dual Y axes with titles and a percent format on y2',
    width: 640,
    height: 280,
    dpr2: true,
    options: () => ({
      data: wave(),
      x: 't',
      axes: {
        y: { title: 'Requests' },
        y2: {
          position: 'right',
          title: 'Error rate',
          format: (v: number | string) => `${Math.round(Number(v) * 100)}%`,
        },
      },
      series: [
        { y: 'v', label: 'Requests' },
        { y: 'w', label: 'Error rate', yAxis: 'y2' },
      ],
    }),
  },
  {
    id: 'axes/min-font-24',
    title: 'A 24 px browser minimum font size clips large Y labels (gap-environments-07)',
    width: 640,
    height: 280,
    minFontSize: 24,
    options: () => ({
      data: range(60, (i) => ({
        month: new Date(utc(2021, i, 1)),
        users: 1_300_000 + 400_000 * Math.sin(i / 9) + i * 9_000,
      })),
      x: 'month',
      series: [{ y: 'users', label: 'Users' }],
    }),
  },
  {
    id: 'axes/explicit-ticks',
    title: 'Explicit ticks on both axes',
    width: 640,
    height: 280,
    dpr2: true,
    options: () => ({
      data: wave(),
      x: 't',
      axes: { x: { ticks: [0, 10, 20, 29] }, y: { ticks: [0, 25, 50, 75, 100] } },
      series: [{ y: 'v', label: 'Load' }],
    }),
  },
];

export const fixtures: Fixture[] = [...defaults, ...edges];
