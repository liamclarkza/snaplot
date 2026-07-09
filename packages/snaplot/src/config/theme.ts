import type { ThemeConfig } from '../types';
import {
  DEFAULT_THEME,
  DARK_THEME,
  OCEAN_THEME,
  MIDNIGHT_THEME,
  REFINED_DARK_THEME,
  MARS_THEME,
  FOREST_THEME,
  SUNSET_THEME,
  VIOLET_THEME,
  FOG_THEME,
  IVORY_THEME,
  MINT_THEME,
  STUDIO_THEME,
  TOKYO_THEME,
  PALETTE_CATEGORICAL_LIGHT,
  PALETTE_CATEGORICAL_DARK,
  PALETTE_SEQUENTIAL_LIGHT,
  PALETTE_SEQUENTIAL_DARK,
  PALETTE_DIVERGING_LIGHT,
  PALETTE_DIVERGING_DARK,
} from '../constants';
import { deepMerge } from './merge';
import { isDarkColor, parseColor } from '../utils/color';

export {
  DEFAULT_THEME as lightTheme,
  DARK_THEME as darkTheme,
  OCEAN_THEME as oceanTheme,
  MIDNIGHT_THEME as midnightTheme,
  REFINED_DARK_THEME as refinedDarkTheme,
  MARS_THEME as marsTheme,
  FOREST_THEME as forestTheme,
  SUNSET_THEME as sunsetTheme,
  VIOLET_THEME as violetTheme,
  FOG_THEME as fogTheme,
  IVORY_THEME as ivoryTheme,
  MINT_THEME as mintTheme,
  STUDIO_THEME as studioTheme,
  TOKYO_THEME as tokyoTheme,
};

/**
 * CSS custom properties resolveTheme reads from the chart container's
 * computed style. Define any of these on the container (or an ancestor)
 * and the chart inherits them; combined with the automatic re-resolution
 * on `data-theme`/`prefers-color-scheme` changes, this is the zero-config
 * path for token-driven design systems. Values may be any CSS color the
 * browser can compute, including `oklch(...)` and `var()` references.
 *
 * Exported so consumers can alias their own tokens programmatically:
 * `for (const v of Object.values(CHART_CSS_VARS)) el.style.setProperty(v, ...)`.
 */
export const CHART_CSS_VARS: Partial<Record<keyof ThemeConfig, string>> = {
  backgroundColor: '--chart-bg',
  textColor: '--chart-text',
  tickColor: '--chart-tick',
  gridColor: '--chart-grid',
  axisLineColor: '--chart-axis',
  borderColor: '--chart-border',
  crosshairColor: '--chart-crosshair',
  tooltipBackground: '--chart-tooltip-bg',
  tooltipTextColor: '--chart-tooltip-text',
  tooltipBorderColor: '--chart-tooltip-border',
};

/** Theme fields that hold a single CSS color and participate in resolution. */
const COLOR_FIELDS: (keyof ThemeConfig)[] = [
  'backgroundColor',
  'textColor',
  'tickColor',
  'gridColor',
  'axisLineColor',
  'borderColor',
  'crosshairColor',
  'tooltipBackground',
  'tooltipTextColor',
  'tooltipBorderColor',
];

/** Theme fields that hold color arrays (palettes and ramps). */
const PALETTE_FIELDS: (keyof ThemeConfig)[] = [
  'palette',
  'categoricalPalette',
  'sequentialPalette',
  'divergingPalette',
  'heatmapGradient',
];

/**
 * Canvas cannot read CSS custom properties, so theme values like
 * `var(--surface)` (or colors in spaces our small parser does not speak,
 * like `oklch`) are resolved through a hidden probe element inside the
 * container: assign the value to the probe's `color`, read the computed
 * `rgb()`/`rgba()` back. The CSSOM rejects invalid values (the property
 * stays empty), so unresolvable input is returned unchanged rather than
 * silently inheriting the container's text color. Resolution happens once
 * per theme application, never per frame.
 */
function createCssColorResolver(container: HTMLElement): {
  resolve: (value: string, asHex: boolean) => string;
  dispose: () => void;
} {
  let probe: HTMLElement | null = null;
  let canvasCtx: CanvasRenderingContext2D | null | undefined;

  // Modern browsers serialize computed colors in their original space
  // (an oklch token stays "oklch(...)"), which the canvas can paint but
  // our small parser cannot reason about (dark detection, gradient
  // interpolation). Painting one pixel and reading it back converts any
  // color the canvas accepts into concrete sRGB bytes.
  const toRgbBytes = (value: string): [number, number, number, number] | null => {
    if (canvasCtx === undefined) {
      canvasCtx =
        typeof document !== 'undefined'
          ? document.createElement('canvas').getContext('2d', { willReadFrequently: true })
          : null;
      if (canvasCtx) {
        canvasCtx.canvas.width = 1;
        canvasCtx.canvas.height = 1;
      }
    }
    if (!canvasCtx) return null;
    canvasCtx.fillStyle = '#010203';
    canvasCtx.fillStyle = value;
    // The canvas keeps the previous fillStyle for unparseable input; the
    // sentinel makes that case detectable (unless the value IS #010203,
    // which round-trips correctly anyway).
    canvasCtx.clearRect(0, 0, 1, 1);
    canvasCtx.fillRect(0, 0, 1, 1);
    const d = canvasCtx.getImageData(0, 0, 1, 1).data;
    if (canvasCtx.fillStyle === '#010203' && value !== '#010203') return null;
    return [d[0], d[1], d[2], d[3]];
  };

  const resolve = (value: string, asHex: boolean): string => {
    const needsDom = value.includes('var(') || parseColor(value) === null;
    if (!needsDom) return value;
    if (typeof getComputedStyle === 'undefined' || typeof document === 'undefined') return value;

    // Stage 1: resolve var() references through the container's cascade.
    let computed = value;
    if (value.includes('var(')) {
      if (!probe) {
        probe = document.createElement('span');
        probe.style.display = 'none';
        container.appendChild(probe);
      }
      probe.style.color = '';
      probe.style.color = value;
      if (probe.style.color === '') return value;
      computed = getComputedStyle(probe).color.trim() || value;
    }

    // Stage 2: normalize to parseable sRGB when the small parser cannot
    // read the result (oklch, hsl, color-mix, uncommon named colors).
    let rgb = parseColor(computed);
    let alpha = 1;
    if (rgb === null) {
      const bytes = toRgbBytes(computed);
      if (!bytes) return computed;
      rgb = [bytes[0], bytes[1], bytes[2]];
      alpha = bytes[3] / 255;
      computed =
        alpha >= 1
          ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
          : `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.round(alpha * 1000) / 1000})`;
    }
    if (!asHex) return computed;
    // Gradient ramps are interpolated by a hex-only parser, so palette
    // entries normalize all the way to #rrggbb (alpha is dropped; encode
    // translucency in the theme's opacity knobs instead).
    return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  };

  return {
    resolve,
    dispose: () => {
      probe?.remove();
      probe = null;
    },
  };
}

function resolveScalarColors(
  theme: ThemeConfig,
  resolve: (value: string, asHex: boolean) => string,
): void {
  const out = theme as unknown as Record<string, unknown>;
  for (const field of COLOR_FIELDS) {
    const value = out[field as string];
    if (typeof value === 'string') out[field as string] = resolve(value, false);
  }
}

function resolvePaletteColors(
  theme: ThemeConfig,
  resolve: (value: string, asHex: boolean) => string,
): void {
  const out = theme as unknown as Record<string, unknown>;
  for (const field of PALETTE_FIELDS) {
    const value = out[field as string];
    if (Array.isArray(value)) {
      out[field as string] = value.map((c) => (typeof c === 'string' ? resolve(c, true) : c));
    }
  }
}

function clonePalette(palette: readonly string[] | undefined): string[] | undefined {
  return palette && palette.length > 0 ? [...palette] : undefined;
}

function normalizeTheme(
  theme: ThemeConfig,
  userTheme: Partial<ThemeConfig> | undefined,
  hasCssOverrides: boolean,
): ThemeConfig {
  // Unparseable backgrounds fall back to light role palettes (the historical
  // default); a dark named/rgb/hex background now correctly selects the dark
  // sequential/diverging/heatmap ramps.
  const dark = isDarkColor(theme.backgroundColor, false);
  const defaultCategorical = dark ? PALETTE_CATEGORICAL_DARK : PALETTE_CATEGORICAL_LIGHT;
  const defaultSequential = dark ? PALETTE_SEQUENTIAL_DARK : PALETTE_SEQUENTIAL_LIGHT;
  const defaultDiverging = dark ? PALETTE_DIVERGING_DARK : PALETTE_DIVERGING_LIGHT;
  const customThemeSurface = !!userTheme || hasCssOverrides;

  const palette = clonePalette(theme.palette) ?? [...defaultCategorical];
  const categoricalPalette =
    clonePalette(userTheme?.categoricalPalette) ??
    (userTheme?.palette ? undefined : clonePalette(theme.categoricalPalette)) ??
    palette;
  const sequentialPalette =
    clonePalette(userTheme?.sequentialPalette) ??
    (customThemeSurface ? undefined : clonePalette(theme.sequentialPalette)) ??
    [...defaultSequential];
  const divergingPalette =
    clonePalette(userTheme?.divergingPalette) ??
    (customThemeSurface ? undefined : clonePalette(theme.divergingPalette)) ??
    [...defaultDiverging];
  const heatmapGradient =
    clonePalette(userTheme?.heatmapGradient) ??
    clonePalette(userTheme?.sequentialPalette) ??
    (customThemeSurface ? undefined : clonePalette(theme.heatmapGradient)) ??
    [...sequentialPalette];

  return {
    ...theme,
    palette,
    categoricalPalette,
    sequentialPalette,
    divergingPalette,
    heatmapGradient,
  };
}

/**
 * Resolve theme by reading CSS custom properties from the container
 * and merging with user-provided overrides.
 *
 * Priority: user theme -> CSS variables (from page) -> default light/dark theme.
 *
 * Any color value (a `--chart-*` custom property, a `var(--token)`
 * reference in a user theme field, or a color space like `oklch` that the
 * canvas-side helpers cannot parse) is resolved to a concrete computed
 * color against the container, so token-driven design systems work
 * without hand-copying values. Resolution reflects the container's
 * cascade at call time; the chart re-resolves automatically when the
 * document theme changes (see `refreshTheme`).
 */
export function resolveTheme(
  container: HTMLElement,
  userTheme?: Partial<ThemeConfig>,
): ThemeConfig {
  const cssOverrides: Partial<ThemeConfig> = {};

  if (typeof getComputedStyle !== 'undefined') {
    const styles = getComputedStyle(container);
    for (const [key, varName] of Object.entries(CHART_CSS_VARS)) {
      const value = styles.getPropertyValue(varName).trim();
      if (value) {
        (cssOverrides as Record<string, unknown>)[key] = value;
      }
    }
  }

  // Check prefers-color-scheme
  const baseTheme =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
      ? DARK_THEME
      : DEFAULT_THEME;

  const merged = deepMerge(
    baseTheme as unknown as Record<string, unknown>,
    cssOverrides as unknown as Record<string, unknown>,
    (userTheme ?? {}) as unknown as Record<string, unknown>,
  ) as unknown as ThemeConfig;

  const { resolve, dispose } = createCssColorResolver(container);
  try {
    // Scalars resolve before normalization so the light/dark detection that
    // picks the default role palettes sees a parseable background; palettes
    // resolve after it, because normalization chooses between the user's raw
    // arrays and the merged theme's, and the winners are what need concrete
    // values.
    resolveScalarColors(merged, resolve);
    const normalized = normalizeTheme(merged, userTheme, Object.keys(cssOverrides).length > 0);
    resolvePaletteColors(normalized, resolve);
    return normalized;
  } finally {
    dispose();
  }
}
