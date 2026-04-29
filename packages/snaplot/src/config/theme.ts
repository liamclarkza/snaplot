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
 * CSS variable name mapping for theme properties.
 * Allows charts to inherit styles from the page's CSS custom properties.
 */
const CSS_VAR_MAP: Partial<Record<keyof ThemeConfig, string>> = {
  backgroundColor: '--chart-bg',
  textColor: '--chart-text',
  gridColor: '--chart-grid',
  axisLineColor: '--chart-axis',
  borderColor: '--chart-border',
  tooltipBackground: '--chart-tooltip-bg',
  tooltipTextColor: '--chart-tooltip-text',
};

function clonePalette(palette: readonly string[] | undefined): string[] | undefined {
  return palette && palette.length > 0 ? [...palette] : undefined;
}

function parseRgb(color: string): [number, number, number] | null {
  const value = color.trim();
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const raw = hex[1];
    const expanded = raw.length === 3
      ? raw.split('').map((c) => c + c).join('')
      : raw;
    return [
      parseInt(expanded.slice(0, 2), 16),
      parseInt(expanded.slice(2, 4), 16),
      parseInt(expanded.slice(4, 6), 16),
    ];
  }

  const rgb = value.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgb) return null;
  const parts = rgb[1].split(',').map((part) => Number.parseFloat(part.trim()));
  if (parts.length < 3 || parts.some((part, i) => i < 3 && !Number.isFinite(part))) {
    return null;
  }
  return [parts[0], parts[1], parts[2]];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const linear = [r, g, b].map((value) => {
    const channel = Math.max(0, Math.min(255, value)) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function isDarkColor(color: string): boolean {
  const rgb = parseRgb(color);
  if (!rgb) return false;
  return relativeLuminance(rgb) < 0.35;
}

function normalizeTheme(
  theme: ThemeConfig,
  userTheme: Partial<ThemeConfig> | undefined,
  hasCssOverrides: boolean,
): ThemeConfig {
  const dark = isDarkColor(theme.backgroundColor);
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
 */
export function resolveTheme(
  container: HTMLElement,
  userTheme?: Partial<ThemeConfig>,
): ThemeConfig {
  const cssOverrides: Partial<ThemeConfig> = {};

  if (typeof getComputedStyle !== 'undefined') {
    const styles = getComputedStyle(container);
    for (const [key, varName] of Object.entries(CSS_VAR_MAP)) {
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

  return normalizeTheme(merged, userTheme, Object.keys(cssOverrides).length > 0);
}
