import type { ChartInstance, ChartStats } from 'snaplot/core';

export interface FrameStats {
  frames: number;
  meanMs: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  /** Fraction of frames over the 60fps budget (16.7ms). */
  over60: number;
  /** Fraction of frames over the 30fps budget (33.4ms). */
  over30: number;
}

export interface LayerStats {
  grid: { renders: number; meanMs: number };
  data: { renders: number; meanMs: number };
  overlay: { renders: number; meanMs: number };
}

export interface ScenarioResult {
  name: string;
  valid: boolean;
  frame: FrameStats;
  layers: LayerStats;
  heapDeltaMB: number | null;
  meta: Record<string, string | number>;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.round((sorted.length - 1) * p));
  return sorted[idx];
}

export function summarizeFrames(deltas: number[]): FrameStats {
  const sorted = [...deltas].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    frames: sorted.length,
    meanMs: round2(sum / Math.max(1, sorted.length)),
    medianMs: round2(percentile(sorted, 0.5)),
    p95Ms: round2(percentile(sorted, 0.95)),
    maxMs: round2(percentile(sorted, 1)),
    over60: round2(sorted.filter((v) => v > 16.7).length / Math.max(1, sorted.length)),
    over30: round2(sorted.filter((v) => v > 33.4).length / Math.max(1, sorted.length)),
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

interface PerfWithMemory extends Performance {
  memory?: { usedJSHeapSize: number };
}

export function heapMB(): number | null {
  const perf = performance as PerfWithMemory;
  return perf.memory ? perf.memory.usedJSHeapSize / (1024 * 1024) : null;
}

/**
 * Accumulates per-layer render durations by diffing ChartStats between
 * frames. Requires the chart to run with `debug: { stats: true }` so
 * `lastRenderMs` carries real timings.
 */
export class LayerTracker {
  private prev: ChartStats;
  private totals = { grid: 0, data: 0, overlay: 0 };
  private counts = { grid: 0, data: 0, overlay: 0 };

  constructor(private chart: ChartInstance) {
    this.prev = chart.getStats();
  }

  sample(): void {
    const cur = this.chart.getStats();
    for (const layer of ['grid', 'data', 'overlay'] as const) {
      const delta = cur.renderCount[layer] - this.prev.renderCount[layer];
      if (delta > 0) {
        this.counts[layer] += delta;
        this.totals[layer] += cur.lastRenderMs[layer] * delta;
      }
    }
    this.prev = cur;
  }

  result(): LayerStats {
    const mean = (layer: 'grid' | 'data' | 'overlay') =>
      this.counts[layer] > 0 ? round2(this.totals[layer] / this.counts[layer]) : 0;
    return {
      grid: { renders: this.counts.grid, meanMs: mean('grid') },
      data: { renders: this.counts.data, meanMs: mean('data') },
      overlay: { renders: this.counts.overlay, meanMs: mean('overlay') },
    };
  }
}

/**
 * Drive `step` once per animation frame and record frame-to-frame deltas.
 * The first `warmup` frames run but are not recorded, so stamp caches,
 * JIT warmup, and initial layout do not skew the distribution.
 */
export function measureFrames(
  steps: number,
  warmup: number,
  step: (i: number) => void,
  onFrame?: () => void,
): Promise<number[]> {
  return new Promise((resolvePromise) => {
    const deltas: number[] = [];
    let last = 0;
    let i = 0;
    const tick = (now: number) => {
      if (i > 0 && i > warmup) deltas.push(now - last);
      last = now;
      if (i >= steps + warmup) {
        resolvePromise(deltas);
        return;
      }
      step(i);
      onFrame?.();
      i++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
