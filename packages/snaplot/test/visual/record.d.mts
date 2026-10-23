/** `toHaveScreenshot` comparison settings. */
export interface ScreenshotSettings {
  threshold: number;
  maxDiffPixels?: number;
  maxDiffPixelRatio?: number;
}

/** What meta.json records as `comparison`. */
export interface Comparison extends ScreenshotSettings {
  exact: boolean;
}

export const STRICT_ENV: 'SNAPLOT_VISUAL_STRICT';
export const EXACT: Readonly<ScreenshotSettings>;
export const TOLERANCE: Readonly<ScreenshotSettings>;

export function screenshotSettings(
  env: Record<string, string | undefined>,
): Readonly<ScreenshotSettings>;

export function comparisonFor(run: { against: boolean; strict: boolean }): Comparison;

export function describeComparison(comparison: Comparison): string;
