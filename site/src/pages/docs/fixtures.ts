import { histogram } from 'snaplot';
import type { ColumnarData } from 'snaplot';

/**
 * Data generators used by the docs demos. Each returns a ColumnarData
 * (`[xValues, ...ySeries]`, all Float64Array) ready to pass into a chart.
 *
 * Generators are deterministic in shape but randomised in values so each
 * page load produces slightly different curves, keeps the docs feeling
 * alive without committing a large static fixture set.
 */

export function timeSeries(points: number, seriesCount: number): ColumnarData {
  const now = Date.now(), x = new Float64Array(points);
  const series: Float64Array[] = [];
  for (let s = 0; s < seriesCount; s++) series.push(new Float64Array(points));
  for (let i = 0; i < points; i++) {
    x[i] = now - (points - i) * 60_000;
    for (let s = 0; s < seriesCount; s++) {
      const t = i / points;
      series[s][i] = 50 + 30 * Math.sin(t * Math.PI * 4 + s * 1.5) + 10 * Math.sin(t * Math.PI * 12 + s) + (Math.random() - 0.5) * 8;
    }
  }
  return [x, ...series] as ColumnarData;
}

export function scatterData(n: number): ColumnarData {
  const x = new Float64Array(n), y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const c = Math.floor(Math.random() * 3);
    x[i] = [30, 60, 80][c] + (Math.random() - 0.5) * 25;
    y[i] = [70, 40, 75][c] + (Math.random() - 0.5) * 30;
  }
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => x[a] - x[b]);
  return [Float64Array.from(idx.map(i => x[i])), Float64Array.from(idx.map(i => y[i]))];
}

export function barData(): ColumnarData {
  const n = 8, x = new Float64Array(n), y1 = new Float64Array(n), y2 = new Float64Array(n);
  for (let i = 0; i < n; i++) { x[i] = i; y1[i] = 20 + Math.random() * 60; y2[i] = 15 + Math.random() * 45; }
  return [x, y1, y2];
}

export function histData(): ColumnarData {
  // Generate raw bimodal data, then compute bins
  const n = 5000;
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    raw[i] = Math.random() < 0.6 ? 50 + (Math.random() + Math.random() + Math.random() - 1.5) * 20 : 80 + (Math.random() + Math.random() - 1) * 15;
  }
  const bins = histogram(raw);
  return [bins.edges, bins.counts];
}

export function bandData(): ColumnarData {
  const n = 200, x = new Float64Array(n);
  const mean = new Float64Array(n), upper = new Float64Array(n), lower = new Float64Array(n);
  const now = Date.now();
  for (let i = 0; i < n; i++) {
    x[i] = now - (n - i) * 60_000;
    const t = i / n;
    const m = 60 + 20 * Math.sin(t * Math.PI * 3) + (Math.random() - 0.5) * 4;
    const spread = 8 + 6 * Math.abs(Math.sin(t * Math.PI * 5));
    mean[i] = m;
    upper[i] = m + spread;
    lower[i] = m - spread;
  }
  return [x, mean, upper, lower];
}

export function interpData(): ColumnarData {
  const n = 15, x = new Float64Array(n), y = new Float64Array(n);
  for (let i = 0; i < n; i++) { x[i] = i; y[i] = 30 + 25 * Math.sin(i * 0.6) + (Math.random() - 0.5) * 10; }
  return [x, y];
}

export function logData(): ColumnarData {
  const n = 50, x = new Float64Array(n), y = new Float64Array(n);
  for (let i = 0; i < n; i++) { x[i] = i; y[i] = Math.pow(10, 0.5 + i * 0.08) + (Math.random() - 0.5) * Math.pow(10, i * 0.06); }
  return [x, y];
}

export function gappedData(): ColumnarData {
  const n = 60, x = new Float64Array(n), y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = i;
    y[i] = (i >= 12 && i <= 16) || (i >= 30 && i <= 33) || (i >= 48 && i <= 50) ? NaN : 40 + 20 * Math.sin(i * 0.3) + (Math.random() - 0.5) * 6;
  }
  return [x, y];
}

export function dualAxisData(): ColumnarData {
  const n = 200, now = Date.now();
  const x = new Float64Array(n), y1 = new Float64Array(n), y2 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = now - (n - i) * 300_000; const t = i / n;
    y1[i] = 18 + 8 * Math.sin(t * Math.PI * 2) + (Math.random() - 0.5) * 2;
    y2[i] = 55 + 20 * Math.cos(t * Math.PI * 2 + 1) + (Math.random() - 0.5) * 5;
  }
  return [x, y1, y2];
}

export function heatmapData(n: number): ColumnarData {
  const x = new Float64Array(n), y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const u1 = Math.random(), u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
    const c = Math.floor(Math.random() * 4);
    x[i] = [25, 75, 30, 70][c] + z0 * [12, 10, 15, 8][c];
    y[i] = [25, 75, 70, 30][c] + z1 * [12, 10, 15, 8][c];
  }
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => x[a] - x[b]);
  return [Float64Array.from(idx.map(i => x[i])), Float64Array.from(idx.map(i => y[i]))];
}

export function largeTimeSeries(n: number): ColumnarData {
  const now = Date.now(), x = new Float64Array(n), y = new Float64Array(n);
  let val = 50;
  for (let i = 0; i < n; i++) { x[i] = now - (n - i) * 1000; val += (Math.random() - 0.5) * 2; y[i] = val; }
  return [x, y];
}

export function linearData(): ColumnarData {
  const n = 80, x = new Float64Array(n), y = new Float64Array(n);
  for (let i = 0; i < n; i++) { x[i] = i; y[i] = 10 + 0.8 * i + (Math.random() - 0.5) * 12; }
  return [x, y];
}

export function timeScaleData(): ColumnarData {
  const n = 300, now = Date.now();
  const x = new Float64Array(n), y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = now - (n - i) * 3_600_000;
    y[i] = 50 + 30 * Math.sin(i * 0.05) + (Math.random() - 0.5) * 10;
  }
  return [x, y];
}

export function stylingData(): ColumnarData {
  const n = 60, x = new Float64Array(n), y1 = new Float64Array(n), y2 = new Float64Array(n), y3 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = i;
    y1[i] = 50 + 25 * Math.sin(i * 0.15);
    y2[i] = 40 + 20 * Math.cos(i * 0.12 + 1);
    y3[i] = 55 + 15 * Math.sin(i * 0.1 + 2);
  }
  return [x, y1, y2, y3];
}

export function legendData(): ColumnarData {
  const n = 100, x = new Float64Array(n);
  const y1 = new Float64Array(n), y2 = new Float64Array(n), y3 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = i;
    y1[i] = 50 + 20 * Math.sin(i * 0.1);
    y2[i] = 40 + 15 * Math.cos(i * 0.08 + 1);
    y3[i] = 60 + 10 * Math.sin(i * 0.12 + 2);
  }
  return [x, y1, y2, y3];
}
