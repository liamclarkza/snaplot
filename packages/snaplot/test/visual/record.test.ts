/**
 * The comparison a visual run uses (record.mjs). M3a review #2: at the plan's tolerance a
 * theme-wide grid colour change reported 0 changed shots, so a run against a ref compares exactly.
 */
import { describe, expect, it } from 'vitest';
import {
  comparisonFor,
  describeComparison,
  EXACT,
  screenshotSettings,
  TOLERANCE,
} from './record.mjs';

describe('the visual comparison', () => {
  it('[repo-10] compares a run against a ref exactly, with or without --strict', () => {
    for (const strict of [false, true]) {
      expect(comparisonFor({ against: true, strict })).toEqual({
        exact: true,
        threshold: 0,
        maxDiffPixels: 0,
      });
    }
  });

  it('compares committed baselines at the plan ratio with no per-pixel colour tolerance', () => {
    expect(comparisonFor({ against: false, strict: false })).toEqual({
      exact: false,
      threshold: 0,
      maxDiffPixelRatio: 0.002,
    });
    expect(comparisonFor({ against: false, strict: true }).exact).toBe(true);
  });

  it('selects the Playwright settings through SNAPLOT_VISUAL_STRICT', () => {
    expect(screenshotSettings({ SNAPLOT_VISUAL_STRICT: '1' })).toBe(EXACT);
    expect(screenshotSettings({ SNAPLOT_VISUAL_STRICT: '' })).toBe(TOLERANCE);
    expect(screenshotSettings({})).toBe(TOLERANCE);
  });

  it('describes the comparison it recorded', () => {
    expect(describeComparison(comparisonFor({ against: true, strict: false }))).toBe(
      'exact (threshold 0, maxDiffPixels 0)',
    );
    expect(describeComparison(comparisonFor({ against: false, strict: false }))).toBe(
      'tolerance (threshold 0, maxDiffPixelRatio 0.002)',
    );
  });
});
