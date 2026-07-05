/**
 * Heckbert's Nice Numbers algorithm (Graphics Gems, 1990)
 * with D3's integer-arithmetic tick generation to avoid IEEE 754 drift.
 *
 * Thresholds: sqrt(2) ≈ 1.41, sqrt(10) ≈ 3.16, sqrt(50) ≈ 7.07
 * These are geometric means between consecutive nice numbers (1, 2, 5, 10).
 */

const SQRT_2 = Math.sqrt(2);   // ~1.414
const SQRT_10 = Math.sqrt(10); // ~3.162
const SQRT_50 = Math.sqrt(50); // ~7.071

/**
 * Compute a nice step size for the given range and target tick count.
 */
export function niceStep(min: number, max: number, count: number): number {
  if (count <= 1) return max - min;

  // Derive magnitude/fraction from the absolute raw step: a reversed domain
  // (max < min) gives a negative rawStep whose Math.log10 is NaN, which would
  // otherwise poison every downstream tick. The step is a positive spacing;
  // callers that pass a reversed domain still get a finite, deterministic step.
  const rawStep = (max - min) / (count - 1);
  const absRawStep = Math.abs(rawStep);
  const magnitude = Math.pow(10, Math.floor(Math.log10(absRawStep)));
  const fraction = absRawStep / magnitude;

  let niceF: number;
  if (fraction <= SQRT_2) niceF = 1;
  else if (fraction <= SQRT_10) niceF = 2;
  else if (fraction <= SQRT_50) niceF = 5;
  else niceF = 10;

  return niceF * magnitude;
}

/**
 * Expand [min, max] to nice boundaries aligned to the nice step.
 */
export function niceRange(
  min: number,
  max: number,
  count: number,
): [number, number] {
  if (min === max) {
    if (min === 0) return [-1, 1];
    const offset = Math.abs(min) * 0.1;
    return [min - offset, max + offset];
  }

  const step = niceStep(min, max, count);
  const nMin = Math.floor(min / step) * step;
  const nMax = Math.ceil(max / step) * step;
  return [nMin, nMax];
}

/**
 * Generate nice tick positions using integer arithmetic to avoid
 * floating-point accumulation errors.
 *
 * Key insight from D3: compute ticks as niceMin + i * niceStep
 * using integer i, never as tick += niceStep. This prevents drift
 * (e.g. 0.1 + 0.1 + 0.1 ≠ 0.3).
 */
export function niceTicks(
  min: number,
  max: number,
  count: number,
): number[] {
  if (count <= 0) return [];
  if (min === max) return [min];

  // For small integer ranges (e.g. bar chart categories 0-7),
  // generate a tick at every integer rather than skipping with nice steps.
  // Require at least 3 integer ticks: when the zoomed domain contains only
  // 1-2 integers, integer-only ticks leave the axis looking empty — fall
  // through to the nice-step path, which subdivides at finer granularity.
  const range = max - min;
  const intMin = Math.ceil(min);
  const intMax = Math.floor(max);
  const intCount = intMax - intMin + 1;
  if (range <= 20 && intCount >= 3 && intCount <= 15) {
    // Check if integer ticks would cover the range well
    const allInts = Number.isInteger(intMin) && Number.isInteger(intMax);
    if (allInts) {
      const ticks: number[] = [];
      for (let i = intMin; i <= intMax; i++) ticks.push(i);
      return ticks;
    }
  }

  const step = niceStep(min, max, count);
  if (step === 0 || !Number.isFinite(step)) return [min];

  const nMin = Math.ceil(min / step) * step;
  const nMax = Math.floor(max / step) * step;

  // Compute tick count using integer arithmetic
  const n = Math.round((nMax - nMin) / step) + 1;

  // A nice step wider than the domain can leave 0 or 1 aligned ticks
  // (e.g. a narrow zoomed domain with a small requested count), or a
  // reversed domain can drive n negative. Subdivide evenly instead so the
  // axis always carries at least a start/end reference. The sequence keeps
  // the sign of (max - min), so reversed domains stay reversed.
  if (n < 2) {
    const steps = count - 1;
    const fallback: number[] = new Array(steps + 1);
    for (let i = 0; i <= steps; i++) {
      fallback[i] = min + ((max - min) * i) / steps;
    }
    return fallback;
  }

  const ticks: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    ticks[i] = nMin + i * step;
  }

  return ticks;
}
