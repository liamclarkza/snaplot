import type { Scale } from '../types';

/**
 * Resolve a scale's dataToPixel to `px = value * k + b` when the mapping
 * is affine. Render loops otherwise pay a polymorphic interface call per
 * point; hoisting the transform into two locals turns that into inline
 * arithmetic the JIT can vectorize. Only the public contract is probed,
 * so log scales and custom non-linear scales return null and keep the
 * method-call path.
 */
export function affineParams(scale: Scale): [k: number, b: number] | null {
  const d0 = scale.min;
  const d1 = scale.max;
  if (!Number.isFinite(d0) || !Number.isFinite(d1) || d0 === d1) return null;

  const p0 = scale.dataToPixel(d0);
  const p1 = scale.dataToPixel(d1);
  if (!Number.isFinite(p0) || !Number.isFinite(p1)) return null;

  const k = (p1 - p0) / (d1 - d0);
  if (!Number.isFinite(k)) return null;
  const b = p0 - d0 * k;
  if (!Number.isFinite(b)) return null;

  // Affinity check at the midpoint; tolerance is in pixels, far below
  // anything visible but wide enough for float noise on huge domains
  // (epoch-millisecond time values).
  const mid = d0 + (d1 - d0) / 2;
  const actual = scale.dataToPixel(mid);
  if (!Number.isFinite(actual) || Math.abs(actual - (mid * k + b)) > 0.01) return null;

  return [k, b];
}
