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

  const rawStep = (max - min) / (count - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const fraction = rawStep / magnitude;

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
  const range = max - min;
  const intMin = Math.ceil(min);
  const intMax = Math.floor(max);
  const intCount = intMax - intMin + 1;
  if (range <= 20 && intCount > 0 && intCount <= 15) {
    // Check if integer ticks would cover the range well
    const allInts = Number.isInteger(intMin) && Number.isInteger(intMax);
    if (allInts) {
      const ticks: number[] = [];
      for (let i = intMin; i <= intMax; i++) ticks.push(i);
      return ticks;
    }
  }

  const step = niceStep(min, max, count);
  if (step === 0 || !isFinite(step)) return [min];

  const nMin = Math.ceil(min / step) * step;
  const nMax = Math.floor(max / step) * step;

  // Compute tick count using integer arithmetic
  const n = Math.round((nMax - nMin) / step) + 1;
  const ticks: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    ticks[i] = nMin + i * step;
  }

  return ticks;
}
