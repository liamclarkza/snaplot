/**
 * Mark fixtures (owned by M11 from W5): the `#/visual` renderer fixtures, the basic fixtures of the
 * gap-overhaul-delta audit, mark edge cases, and the audit grid of six marks × {1, 3, 8} series ×
 * three sizes, rendered with no options beyond data, x and series.
 */
import type { ChartOptions } from '../../../src/index';
import { DAY, f64, gauss, lcg, mulberry, normal, range, SERIES_NAMES, utc } from './data';
import type { Fixture, FixtureLib } from './types';

// ─── `#/visual` ports (site/src/components/VisualRegressionHarness.tsx at overhaul-baseline) ───

function gapLine() {
  return {
    columns: {
      x: f64([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
      value1: f64([12, 15, 17, Number.NaN, Number.NaN, Number.NaN, 22, 20, 24, 21, 25, 23]),
    },
  };
}

function scatterCloud(n = 600) {
  const rand = lcg(7);
  const idx = new Float64Array(n);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const cat = new Float64Array(n);
  const size = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const g = Math.floor(rand() * 4);
    idx[i] = i;
    x[i] = 20 + g * 18 + normal(rand) * 7;
    y[i] = 25 + g * 14 + normal(rand) * 9;
    cat[i] = g;
    size[i] = 6 + rand() * 18;
  }
  return { columns: { x: idx, value1: x, value2: y, value3: cat, value4: size } };
}

function densityCloud(n = 14_000) {
  const rand = lcg(11);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    x[i] = t * 100;
    y[i] = 50 + Math.sin(t * Math.PI * 10) * 20 + normal(rand) * 6;
  }
  return { columns: { x, value1: y } };
}

function bandData() {
  const rand = lcg(3);
  const n = 60;
  const x = new Float64Array(n);
  const mid = new Float64Array(n);
  const up = new Float64Array(n);
  const lo = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    x[i] = i;
    const base = 52 + Math.sin(t * Math.PI * 3) * 15;
    mid[i] = base + normal(rand) * 0.8;
    up[i] = mid[i] + 8 + Math.sin(t * 5) * 2;
    lo[i] = mid[i] - 8 - Math.cos(t * 4) * 2;
  }
  return { columns: { x, value1: mid, value2: up, value3: lo } };
}

function latencySamples(seed: number, count = 4000): Float64Array {
  const rand = lcg(seed);
  const raw = new Float64Array(count);
  for (let i = 0; i < raw.length; i++) {
    raw[i] = rand() < 0.7 ? 30 + normal(rand) * 6 : 70 + normal(rand) * 12;
  }
  return raw;
}

const PORT_W = 380;
const PORT_H = 220;
const linear = { x: { type: 'linear' as const }, y: { type: 'linear' as const } };

const visualPorts: Fixture[] = [
  {
    id: 'marks/spangaps-off',
    title: '#/visual spangaps-off: a NaN run breaks the path',
    width: PORT_W,
    height: PORT_H,
    dpr2: true,
    options: () => ({
      data: gapLine(),
      x: 'x',
      axes: linear,
      series: [
        { label: 'series', y: 'value1', interpolation: 'linear', lineWidth: 2, spanGaps: false },
      ],
    }),
  },
  {
    id: 'marks/spangaps-on',
    title: '#/visual spangaps-on: a NaN run is bridged',
    width: PORT_W,
    height: PORT_H,
    options: () => ({
      data: gapLine(),
      x: 'x',
      axes: linear,
      series: [
        { label: 'series', y: 'value1', interpolation: 'linear', lineWidth: 2, spanGaps: true },
      ],
    }),
  },
  {
    id: 'marks/scatter-color-size',
    title: '#/visual scatter-color-size: colorBy category + sizeBy (sizeBy.scale dropped, §4.4)',
    width: PORT_W,
    height: PORT_H,
    options: () => ({
      data: scatterCloud(),
      x: 'x',
      axes: linear,
      series: [
        {
          label: 'runs',
          type: 'scatter',
          x: 'value1',
          y: 'value2',
          colorBy: {
            field: 'value3',
            type: 'category',
            label: 'Group',
            format: (v: number) => ['A', 'B', 'C', 'D'][Math.round(v)] ?? '?',
          },
          sizeBy: { field: 'value4', range: [3, 9], label: 'Weight' },
          opacity: 0.78,
          renderMode: 'points',
        },
      ],
    }),
  },
  {
    id: 'marks/density-heatmap',
    title: '#/visual density-heatmap without a pinned ramp (heatmap* options dropped, §4.4)',
    width: PORT_W,
    height: PORT_H,
    skip: { paints: 'density bins, not per-datum marks' },
    options: () => ({
      data: densityCloud(),
      x: 'x',
      axes: linear,
      series: [{ label: 'density', y: 'value1', type: 'scatter', renderMode: 'density' }],
    }),
  },
  {
    id: 'marks/band',
    title: '#/visual band: monotone band with a 0.18 fill',
    width: PORT_W,
    height: PORT_H,
    options: () => ({
      data: bandData(),
      x: 'x',
      axes: linear,
      series: [
        {
          label: 'band',
          y: 'value1',
          upper: 'value2',
          lower: 'value3',
          type: 'band',
          opacity: 0.18,
          interpolation: 'monotone',
          lineWidth: 1.5,
        },
      ],
    }),
  },
  {
    id: 'marks/bar-grouped',
    title: '#/visual bar: two grouped bar series on a numeric X',
    width: PORT_W,
    height: PORT_H,
    options: () => ({
      data: {
        columns: {
          x: f64([0, 1, 2, 3, 4]),
          value1: f64([120, 90, 140, 70, 110]),
          value2: f64([40, 60, 30, 50, 20]),
        },
      },
      x: 'x',
      axes: linear,
      series: [
        { label: 'ok', y: 'value1', type: 'bar' },
        { label: 'error', y: 'value2', type: 'bar' },
      ],
    }),
  },
  {
    id: 'marks/histogram',
    title: '#/visual histogram: bimodal latency, Freedman–Diaconis bins',
    width: PORT_W,
    height: PORT_H,
    options: (lib) => ({
      axes: linear,
      series: [
        {
          id: 'latency',
          label: 'latency',
          type: 'histogram',
          data: lib.histogram(latencySamples(9)),
        },
      ],
    }),
  },
];

// ─── Basic fixtures (evidence/gap-overhaul-delta/srv/fixtures.js, 640 × 320) ───

const BASIC_W = 640;
const BASIC_H = 320;
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Hol'];

function basicLine(): ChartOptions<any> {
  const n = 120;
  const x = new Float64Array(n);
  const a = new Float64Array(n);
  const b = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = i;
    a[i] = 52 + Math.sin(i / 12) * 18 + Math.sin(i / 3) * 3;
    b[i] = 38 + Math.cos(i / 17) * 11;
  }
  return {
    data: { columns: { x, v1: a, v2: b } },
    x: 'x',
    axes: linear,
    series: [
      { label: 'p50', type: 'line', y: 'v1' },
      { label: 'p95', type: 'line', y: 'v2' },
    ],
  };
}

const basics: Fixture[] = [
  {
    id: 'marks/basic-line',
    title: 'Basic: two lines on numeric X',
    width: BASIC_W,
    height: BASIC_H,
    dpr2: true,
    options: basicLine,
  },
  {
    id: 'marks/basic-nogrid',
    title: 'Basic: two lines with grid: false on both axes',
    width: BASIC_W,
    height: BASIC_H,
    dpr2: true,
    options: () => ({
      ...basicLine(),
      axes: { x: { type: 'linear', grid: false }, y: { type: 'linear', grid: false } },
    }),
  },
  {
    id: 'marks/basic-constant',
    title: 'Basic: a constant series (DEF-05 domain)',
    width: BASIC_W,
    height: BASIC_H,
    options: () => ({
      data: { columns: { x: f64(range(8, (i) => i)), v1: f64(range(8, () => 42)) } },
      x: 'x',
      axes: linear,
      series: [{ label: 'flat', type: 'line', y: 'v1' }],
    }),
  },
  {
    id: 'marks/basic-area',
    title: 'Basic: one area series',
    width: BASIC_W,
    height: BASIC_H,
    options: () => {
      const n = 90;
      const x = new Float64Array(n);
      const a = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        x[i] = i;
        a[i] = Math.max(0, 25 + Math.sin(i / 9) * 22 + Math.cos(i / 4) * 4);
      }
      return {
        data: { columns: { x, v1: a } },
        x: 'x',
        axes: linear,
        series: [{ label: 'queue', type: 'area', y: 'v1' }],
      };
    },
  },
  {
    id: 'marks/basic-band',
    title: 'Basic: one band series',
    width: BASIC_W,
    height: BASIC_H,
    dpr2: true,
    options: () => {
      const r = lcg(3);
      const n = 60;
      const x = new Float64Array(n);
      const m = new Float64Array(n);
      const u = new Float64Array(n);
      const l = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        x[i] = i;
        m[i] = 52 + Math.sin(t * Math.PI * 3) * 15 + normal(r) * 0.8;
        u[i] = m[i] + 8;
        l[i] = m[i] - 8;
      }
      return {
        data: { columns: { x, v1: m, v2: u, v3: l } },
        x: 'x',
        axes: linear,
        series: [{ label: 'band', type: 'band', y: 'v1', upper: 'v2', lower: 'v3' }],
      };
    },
  },
  {
    id: 'marks/basic-scatter',
    title: 'Basic: 400 scatter points coloured by category',
    width: BASIC_W,
    height: BASIC_H,
    options: () => {
      const r = lcg(7);
      const n = 400;
      const idx = new Float64Array(n);
      const x = new Float64Array(n);
      const y = new Float64Array(n);
      const g = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const k = Math.floor(r() * 3);
        idx[i] = i;
        x[i] = 10 + k * 30 + normal(r) * 8;
        y[i] = 20 + k * 20 + normal(r) * 7;
        g[i] = k;
      }
      return {
        data: { columns: { x: idx, v1: x, v2: y, v3: g } },
        x: 'x',
        axes: linear,
        series: [
          {
            label: 'runs',
            type: 'scatter',
            x: 'v1',
            y: 'v2',
            colorBy: { field: 'v3', type: 'category' },
          },
        ],
      };
    },
  },
  {
    id: 'marks/basic-density',
    title: 'Basic: 20k points in density mode',
    width: BASIC_W,
    height: BASIC_H,
    skip: { paints: 'density bins, not per-datum marks' },
    options: () => {
      const r = lcg(11);
      const n = 20000;
      const x = new Float64Array(n);
      const y = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        x[i] = t * 100;
        y[i] = 50 + Math.sin(t * Math.PI * 6) * 20 + normal(r) * 6;
      }
      return {
        data: { columns: { x, v1: y } },
        x: 'x',
        axes: linear,
        series: [{ label: 'density', type: 'scatter', y: 'v1', renderMode: 'density' }],
      };
    },
  },
  {
    id: 'marks/basic-bar',
    title: 'Basic: one bar series with a day-name X format',
    width: BASIC_W,
    height: BASIC_H,
    dpr2: true,
    options: () => ({
      data: {
        columns: { x: f64([0, 1, 2, 3, 4, 5, 6]), v1: f64([42, 55, 61, 48, 70, 23, 18]) },
      },
      x: 'x',
      axes: {
        x: { type: 'linear', format: (v: number | string) => DAYS[Math.round(Number(v))] ?? '' },
        y: { type: 'linear' },
      },
      series: [{ label: 'orders', type: 'bar', y: 'v1' }],
    }),
  },
  {
    id: 'marks/basic-grouped',
    title: 'Basic: three grouped bar series',
    width: BASIC_W,
    height: BASIC_H,
    dpr2: true,
    options: () => ({
      data: {
        columns: {
          x: f64([0, 1, 2, 3, 4, 5]),
          v1: f64([120, 90, 140, 70, 110, 95]),
          v2: f64([40, 60, 30, 50, 20, 65]),
          v3: f64([80, 30, 60, 90, 45, 30]),
        },
      },
      x: 'x',
      axes: linear,
      series: ['ok', 'warn', 'error'].map((label, i) => ({
        label,
        type: 'bar' as const,
        y: `v${i + 1}`,
      })),
    }),
  },
  {
    id: 'marks/basic-histogram',
    title: 'Basic: one histogram series',
    width: BASIC_W,
    height: BASIC_H,
    dpr2: true,
    options: (lib) => ({
      axes: linear,
      series: [
        {
          id: 'latency',
          label: 'latency',
          type: 'histogram',
          data: lib.histogram(latencySamples(9)),
        },
      ],
    }),
  },
];

// ─── Mark edge cases ───

const edges: Fixture[] = [
  {
    id: 'marks/isolated-points',
    title: 'Finite points isolated between gaps draw nothing (render-05, backlog-04)',
    width: 480,
    height: 240,
    blankData: 'points isolated between gaps paint nothing today (render-05)',
    options: () => ({
      data: [1, null, 3, null, 2, null, 4].map((v, t) => ({ t, v })),
      x: 't',
      series: [{ y: 'v', label: 'Reading' }],
    }),
  },
  {
    id: 'marks/histogram-fill',
    title: 'A histogram with an explicit color (demos-06)',
    width: 480,
    height: 240,
    options: (lib) => ({
      series: [
        {
          id: 'latency',
          label: 'Latency',
          type: 'histogram',
          color: '#d55e00',
          data: lib.histogram(latencySamples(13, 2000)),
        },
      ],
    }),
  },
  {
    id: 'marks/area-negatives',
    title: 'An area crossing zero (visuals-02: fills to the plot bottom)',
    width: 480,
    height: 240,
    options: () => ({
      data: range(61, (t) => ({ t, v: 5 + 25 * Math.sin(t / 6) })),
      x: 't',
      series: [{ y: 'v', type: 'area', label: 'Net flow' }],
    }),
  },
];

// ─── Audit grid (evidence/play/visuals-grid.html): defaults only ───

type GridMark = 'line' | 'area' | 'band' | 'bar' | 'scatter' | 'histogram';

const GRID_MARKS: GridMark[] = ['line', 'area', 'band', 'bar', 'scatter', 'histogram'];
const GRID_COUNTS = [1, 3, 8];
const GRID_SIZES: Array<[number, number]> = [
  [320, 200],
  [640, 320],
  [1200, 480],
];

function gridOptions(mark: GridMark, n: number, lib: FixtureLib): ChartOptions<any> {
  const r = mulberry(42);
  if (mark === 'line' || mark === 'area') {
    const start = utc(2026, 0, 1);
    const levels = range(n, (i) => 40 + i * 6);
    const rows = range(120, (d) => {
      const row: Record<string, unknown> = { t: new Date(start + d * DAY) };
      for (let i = 0; i < n; i++) {
        levels[i] += gauss(r) * 1.5;
        row[`s${i}`] = Math.round(levels[i] * 100) / 100;
      }
      return row;
    });
    return {
      data: rows,
      x: 't',
      series: range(n, (i) => ({ y: `s${i}`, label: SERIES_NAMES[i], type: mark })),
    };
  }
  if (mark === 'band') {
    const rows = range(61, (k) => {
      const row: Record<string, number> = { step: k };
      for (let i = 0; i < n; i++) {
        const c = 50 + 15 * Math.sin(k / 9 + i) + i * 4;
        const w = 4 + 3 * Math.abs(Math.sin(k / 7));
        row[`m${i}`] = c;
        row[`lo${i}`] = c - w;
        row[`hi${i}`] = c + w;
      }
      return row;
    });
    return {
      data: rows,
      x: 'step',
      series: range(n, (i) => ({
        type: 'band' as const,
        y: `m${i}`,
        lower: `lo${i}`,
        upper: `hi${i}`,
        label: `Run ${i + 1}`,
        id: `run${i}`,
      })),
    };
  }
  if (mark === 'scatter') {
    return {
      series: range(n, (i) => {
        const cx = 20 + i * 9;
        const cy = 30 + (i % 3) * 15;
        const rows = range(150, (k) => ({
          x: cx + gauss(r) * 8,
          y: cy + gauss(r) * 6 + 0.3 * (k % 7),
        }));
        return {
          type: 'scatter' as const,
          data: rows,
          x: 'x',
          y: 'y',
          id: `g${i}`,
          label: `Group ${String.fromCharCode(65 + i)}`,
        };
      }),
    };
  }
  if (mark === 'bar') {
    const rows = range(24, (h) => {
      const row: Record<string, number> = { hour: h };
      for (let i = 0; i < n; i++)
        row[`b${i}`] = Math.round(20 + 60 * Math.abs(Math.sin(h / 4 + i)) + r() * 10);
      return row;
    });
    return {
      data: rows,
      x: 'hour',
      series: range(n, (i) => ({ type: 'bar' as const, y: `b${i}`, label: SERIES_NAMES[i] })),
    };
  }
  return {
    series: range(n, (i) => ({
      type: 'histogram' as const,
      id: `h${i}`,
      label: `Cohort ${i + 1}`,
      data: lib.histogram(range(2000, () => 100 + i * 12 + gauss(r) * 18)),
    })),
  };
}

/** The 3-series 640 × 320 cell of every mark is part of the DPR 2 crispness set. */
const grid: Fixture[] = GRID_MARKS.flatMap((mark) =>
  GRID_COUNTS.flatMap((n) =>
    GRID_SIZES.map(
      ([width, height]): Fixture => ({
        id: `marks/grid-${mark}-${n}-${width}x${height}`,
        title: `Audit grid: ${mark}, ${n} series, ${width} × ${height}, defaults only`,
        width,
        height,
        dpr2: n === 3 && width === 640,
        options: (lib) => gridOptions(mark, n, lib),
      }),
    ),
  ),
);

export const fixtures: Fixture[] = [...visualPorts, ...basics, ...edges, ...grid];
