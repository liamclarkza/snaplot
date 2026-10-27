/**
 * Steady value axes for the streaming panels. Left to auto-range, a panel rescales every time a
 * spike enters or leaves its ten-minute window, and the whole chart jumps. Here each panel's
 * maximum is a nice step that grows as soon as the data passes it and shrinks only once the
 * window's peak has fallen well below it, so the axis moves rarely and on purpose.
 */

/** The peaks of one series per simulated second, for the max over a trailing window. */
export class Peaks {
  private times: number[] = [];
  private values: number[] = [];

  push(time: number, value: number): void {
    if (!Number.isFinite(value)) return;
    this.times.push(time);
    this.values.push(value);
  }

  /** The largest value at or after `since` (NaN when there is none). */
  maxSince(since: number): number {
    let max = Number.NaN;
    for (let i = this.times.length - 1; i >= 0 && this.times[i] >= since; i--) {
      if (!(this.values[i] <= max)) max = this.values[i];
    }
    return max;
  }
}

/** Shrink only when the peak is under this share of the axis. */
const SHRINK_BELOW = 0.4;

/**
 * The next maximum for an axis showing `peak`: the first step at or above `peak × headroom` when
 * the peak has grown past `current / headroom` or fallen under 40% of it, else `current` unchanged.
 * Headroom over 1 keeps the top of the plot clear (for labels there).
 */
export function steadyMax(
  current: number | undefined,
  peak: number,
  steps: readonly number[],
  headroom = 1,
) {
  if (!Number.isFinite(peak)) return current;
  const need = peak * headroom;
  const fit = steps.find((step) => step >= need) ?? steps[steps.length - 1];
  if (current === undefined || need > current || peak < current * SHRINK_BELOW) return fit;
  return current;
}

/** The latency axis's headroom: the deploy labels' row at its top stays clear of the trace. */
export const LATENCY_HEADROOM = 1.6;

/** Latency in ms on a log axis, error %, and requests per second. */
export const STEPS = {
  latency: [200, 500, 1_000, 2_000, 5_000],
  errors: [2, 5, 10, 20, 50, 100],
  traffic: [100, 150, 200, 250, 300, 400, 500],
} as const;
