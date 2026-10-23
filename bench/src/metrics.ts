// The bench's measurement core. A scenario drives an operation once per animation frame (or once
// per repetition); this module records, per operation:
//
// - `sync`: the call itself, including the microtasks it queued;
// - `busy`: `sync` plus every library callback that ran before the next frame's harness tick
//   (the chart's paint, timers, observers), raised to the duration of any long animation frame
//   that overlaps the operation. This is the gated main-thread busy time (gap-perf-gate-02).
// - `frame`: the rAF-to-rAF delta, kept only as a jank signal (it is quantised to the display
//   interval and saturates at vsync on GPU raster);
// - gross heap per operation and heap retained after GC, when Chromium runs with
//   `--enable-precise-memory-info --js-flags=--expose-gc` (gap-perf-gate-07). Without those flags
//   the heap metrics are `null`, never a misleading constant zero.
//
// The driver adds `taskMsPerOp` from CDP `Performance.getMetrics` (all main-thread task time,
// including style, layout and paint) around the window a scenario marks.

import { libraryBusyMs, native } from './instrument';

export type Area = 'legacy' | 'api' | 'streaming' | 'interaction' | 'scale';
/** Which distribution the A/B ratio compares (its median). */
export type Primary = 'busy' | 'sync' | 'wall';

export interface Dist {
  n: number;
  min: number;
  median: number;
  p95: number;
  mean: number;
  max: number;
}

export interface FrameDist extends Dist {
  /** Fraction of frames over the 60 fps budget (16.7 ms). */
  over60: number;
  /** Fraction of frames over the 30 fps budget (33.4 ms). */
  over30: number;
}

export interface Fidelity {
  /** Frames sampled during the interaction. */
  samples: number;
  /** drawn / min(inView, budget), per sampled frame, capped at 1. */
  min: number;
  median: number;
  /** The sampling budget max(400, 1.5 × plot width) used for the ratio. */
  budget: number;
}

export interface HeapStats {
  ops: number;
  /** Heap growth summed over the window (ignoring drops from GC), per operation. */
  grossKBPerOp: number;
  /** Heap growth from before the window to after a forced GC at its end. */
  retainedKB: number;
}

export interface LoafSummary {
  count: number;
  totalMs: number;
  blockingMs: number;
}

export type Meta = Record<string, number | string | boolean | null>;

export interface ScenarioResult {
  name: string;
  area: Area;
  primary: Primary;
  /** API adapter that ran it: v012, v1 or v2. */
  api: string;
  valid: boolean;
  /** Set when this API cannot express the scenario; the A/B reports it as n/a. */
  unsupported?: string;
  error?: string;
  /** Operations inside the marked window (the denominator for `taskMsPerOp`). */
  ops: number;
  busy: Dist | null;
  sync: Dist | null;
  wall: Dist | null;
  frame: FrameDist | null;
  /** Sum of busy time over the window, including frames without an operation. */
  busyTotalMs: number | null;
  loaf: LoafSummary | null;
  heap: HeapStats | null;
  fidelity: Fidelity | null;
  renders: { grid: number; data: number; overlay: number } | null;
  meta: Meta;
  /** Filled by the driver: CDP TaskDuration over the marked window, per operation. */
  taskMsPerOp?: number | null;
}

const r4 = (v: number) => Math.round(v * 10_000) / 10_000;

function medianOfSorted(s: readonly number[]): number {
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function dist(values: readonly number[]): Dist | null {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (s.length === 0) return null;
  const pick = (p: number) => s[Math.min(s.length - 1, Math.round((s.length - 1) * p))];
  let sum = 0;
  for (const v of s) sum += v;
  return {
    n: s.length,
    min: r4(s[0]),
    median: r4(medianOfSorted(s)),
    p95: r4(pick(0.95)),
    mean: r4(sum / s.length),
    max: r4(s[s.length - 1]),
  };
}

export function frameDist(deltas: readonly number[]): FrameDist | null {
  const d = dist(deltas);
  if (!d) return null;
  const over = (ms: number) => r4(deltas.filter((v) => v > ms).length / deltas.length);
  return { ...d, over60: over(16.7), over30: over(33.4) };
}

// ─── Browser hooks ──────────────────────────────────────────────

/** Brackets a CDP measurement window; a no-op when the page runs outside the driver. */
export async function mark(label: 'start' | 'end'): Promise<void> {
  const fn = (window as unknown as { __benchMark?: (l: string) => Promise<void> }).__benchMark;
  if (typeof fn === 'function') await fn(label);
}

/** True when Chromium exposes `gc()`; the driver always pairs it with precise memory info. */
export function preciseHeap(): boolean {
  return typeof (window as unknown as { gc?: unknown }).gc === 'function';
}

export function gc(): void {
  const g = (window as unknown as { gc?: () => void }).gc;
  if (typeof g === 'function') {
    g();
    g();
  }
}

export function heapBytes(): number | null {
  if (!preciseHeap()) return null;
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? m.usedJSHeapSize : null;
}

export function nextFrame(): Promise<number> {
  return new Promise((resolve) => native.raf(resolve));
}

export async function settle(frames = 5): Promise<void> {
  for (let i = 0; i < frames; i++) await nextFrame();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => native.setTimeout(resolve, ms));
}

/** Resolves just after the next frame renders: a task posted from rAF runs after the update. */
export function afterPaint(): Promise<number> {
  return new Promise((resolve) => {
    native.raf(() => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => resolve(performance.now());
      channel.port2.postMessage(0);
    });
  });
}

interface LoafEntry {
  start: number;
  duration: number;
  blocking: number;
}

/** Starts a long-animation-frame recorder; `null` when the browser lacks the entry type. */
function recordLoaf(): (() => LoafEntry[]) | null {
  const entries: LoafEntry[] = [];
  const take = (list: PerformanceEntryList) => {
    for (const e of list) {
      entries.push({
        start: e.startTime,
        duration: e.duration,
        blocking: (e as PerformanceEntry & { blockingDuration?: number }).blockingDuration ?? 0,
      });
    }
  };
  if (!PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')) return null;
  const observer = new PerformanceObserver((list) => take(list.getEntries()));
  observer.observe({ type: 'long-animation-frame', buffered: false });
  return () => {
    take(observer.takeRecords());
    observer.disconnect();
    return entries;
  };
}

function summarizeLoaf(entries: readonly LoafEntry[]): LoafSummary {
  let totalMs = 0;
  let blockingMs = 0;
  for (const e of entries) {
    totalMs += e.duration;
    blockingMs += e.blocking;
  }
  return { count: entries.length, totalMs: r4(totalMs), blockingMs: r4(blockingMs) };
}

// ─── Frame-driven sweeps ────────────────────────────────────────

export interface SweepSpec {
  steps: number;
  warmup: number;
  /**
   * Runs once per animation frame. Return `false` when the frame did no operation (a
   * rate-limited stream), so it is not sampled.
   */
  step(i: number): boolean | undefined | void;
  /** Runs in the next frame, after the operation's paint and before the next step. */
  afterFlush?(i: number): void;
  /** Track gross and retained heap (needs precise memory info). */
  heap?: boolean;
  /** Bracket the window for the driver's CDP task time. Default true. */
  markWindow?: boolean;
}

export interface SweepOut {
  sync: number[];
  busy: number[];
  frames: number[];
  ops: number;
  busyTotalMs: number;
  heap: HeapStats | null;
  loaf: LoafSummary | null;
}

interface OpenOp {
  t0: number;
  async0: number;
  sync: number;
  measured: boolean;
}

/**
 * Drives `step` once per frame for `warmup + steps` frames and measures each operation. Warm-up
 * operations run but are not recorded, so caches, JIT warm-up and the first layout do not skew the
 * distributions.
 */
export async function sweep(spec: SweepSpec): Promise<SweepOut> {
  const markWindow = spec.markWindow ?? true;
  const heapOn = spec.heap === true && preciseHeap();
  if (heapOn) gc();
  const heap0 = heapOn ? heapBytes() : null;
  if (markWindow) await mark('start');
  const stopLoaf = recordLoaf();

  const sync: number[] = [];
  const busy: number[] = [];
  const windows: [number, number][] = [];
  const frames: number[] = [];
  let ops = 0;
  let asyncAtWindow = Number.NaN;
  let syncInWindow = 0;
  let heapPrev = heap0 ?? 0;
  let gross = 0;

  await new Promise<void>((resolve) => {
    let i = 0;
    let lastTs = -1;
    let open: OpenOp | null = null;
    const tick = (ts: number) => {
      const tTick = performance.now();
      if (open) {
        // The previous operation's flush: everything the library ran since it.
        if (open.measured) {
          const flush = libraryBusyMs() - open.async0;
          sync.push(open.sync);
          busy.push(open.sync + flush);
          windows.push([open.t0, tTick]);
          syncInWindow += open.sync;
        }
        open = null;
      }
      const inWindow = i > spec.warmup;
      if (inWindow && lastTs >= 0) frames.push(ts - lastTs);
      if (inWindow && heapOn) {
        const h = heapBytes() ?? heapPrev;
        if (h > heapPrev) gross += h - heapPrev;
        heapPrev = h;
      }
      if (i > spec.warmup) spec.afterFlush?.(i - 1);
      lastTs = ts;
      if (i >= spec.steps + spec.warmup) {
        resolve();
        return;
      }
      const measured = i >= spec.warmup;
      if (measured && Number.isNaN(asyncAtWindow)) {
        asyncAtWindow = libraryBusyMs();
        if (heapOn) heapPrev = heapBytes() ?? heapPrev;
      }
      const t0 = performance.now();
      const async0 = libraryBusyMs();
      const did = spec.step(i) !== false;
      if (did) {
        const op: OpenOp = { t0, async0, sync: 0, measured };
        open = op;
        // Runs after the microtasks the operation queued.
        queueMicrotask(() => {
          op.sync = performance.now() - t0;
        });
        if (measured) ops++;
      }
      i++;
      native.raf(tick);
    };
    native.raf(tick);
  });

  const busyTotalMs = syncInWindow + (libraryBusyMs() - asyncAtWindow);
  await settle(2);
  const loafEntries = stopLoaf?.() ?? [];
  // A long animation frame is the real cost of that frame; raise the overlapping samples to it.
  for (const e of loafEntries) {
    for (let k = 0; k < windows.length; k++) {
      const [a, b] = windows[k];
      if (e.start < b && e.start + e.duration > a && e.duration > busy[k]) busy[k] = e.duration;
    }
  }
  let heap: HeapStats | null = null;
  if (heapOn && heap0 !== null && ops > 0) {
    gc();
    const after = heapBytes() ?? heap0;
    heap = {
      ops,
      grossKBPerOp: r4(gross / ops / 1024),
      retainedKB: r4((after - heap0) / 1024),
    };
  }
  if (markWindow) await mark('end');
  return {
    sync,
    busy,
    frames,
    ops,
    busyTotalMs: r4(busyTotalMs),
    heap,
    loaf: stopLoaf ? summarizeLoaf(loafEntries) : null,
  };
}

// ─── One-shot operations ────────────────────────────────────────

export interface OnceOut {
  /** The call, including its microtasks. */
  sync: number;
  /** `sync` plus library callbacks up to the end of the first painted frame. */
  busy: number;
  /** Wall time from the call to just after the next frame rendered (first paint). */
  wall: number;
}

/** Times a one-shot operation (a mount, an ingest) through its first painted frame. */
export async function once(op: () => void): Promise<OnceOut> {
  const async0 = libraryBusyMs();
  const t0 = performance.now();
  op();
  const sync = await new Promise<number>((resolve) =>
    queueMicrotask(() => resolve(performance.now() - t0)),
  );
  const painted = await afterPaint();
  return { sync, busy: sync + (libraryBusyMs() - async0), wall: painted - t0 };
}
