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
import { isDarkColor } from '../utils/color';

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
