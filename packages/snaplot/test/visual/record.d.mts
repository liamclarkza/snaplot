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

/** The paths whose content a head run renders from. */
export const INPUT_PATHS: readonly string[];

/** A fingerprint of the render inputs in the working tree at `repoRoot`. */
export function headInputs(repoRoot: string, env?: Record<string, string | undefined>): string;

/** The `.png` files under `dir`, as `/`-separated relative paths, sorted. */
export function listPngs(dir: string): string[];

/** The SHA-256 of some bytes, in hex. */
export function sha256(bytes: string | Uint8Array): string;

/** The SHA-256 of each shot's image `<dir>/<shot><suffix>.png`; shots without an image are left out. */
export function shotHashes(dir: string, shots: string[], suffix?: string): Record<string, string>;

/** How the images in `dir` differ from the recorded capture. */
export interface ShotDifferences {
  /** Recorded shots whose image has another hash (or none was recorded). */
  changed: string[];
  /** Recorded shots whose image is gone. */
  missing: string[];
  /** Images the capture did not record. */
  extra: string[];
}

export function compareShots(
  dir: string,
  shots: string[],
  hashes: Record<string, string> | undefined,
  suffix?: string,
): ShotDifferences;
