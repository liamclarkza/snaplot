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

/**
 * Resolve theme by reading CSS custom properties from the container
 * and merging with user-provided overrides.
 *
 * Priority: CSS variables (from page) → user theme → default theme
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

  return deepMerge(
    baseTheme as unknown as Record<string, unknown>,
    cssOverrides as unknown as Record<string, unknown>,
    (userTheme ?? {}) as unknown as Record<string, unknown>,
  ) as unknown as ThemeConfig;
}
