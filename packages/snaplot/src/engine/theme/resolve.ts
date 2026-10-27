import type { ThemeConfig } from '../spec';
import {
  DEFAULT_THEME,
  DARK_THEME,
  PALETTE_CATEGORICAL_LIGHT,
  PALETTE_CATEGORICAL_DARK,
  PALETTE_SEQUENTIAL_LIGHT,
  PALETTE_SEQUENTIAL_DARK,
  PALETTE_DIVERGING_LIGHT,
  PALETTE_DIVERGING_DARK,
} from '../../constants';
import { deepMerge } from '../merge';
import { cssColor, isDarkColor, parseColor, resolveColor, withAlpha } from './color';

export { DEFAULT_THEME as lightTheme, DARK_THEME as darkTheme };

/**
 * CSS custom properties resolveTheme reads from the chart container's
 * computed style. `--chart-text` also colours the axis text unless
 * `--chart-tick` or `--chart-axis-label` is set. Define any of these on the container (or an ancestor)
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
  axisLabelColor: '--chart-axis-label',
  tickColor: '--chart-tick',
  gridColor: '--chart-grid',
  axisLineColor: '--chart-axis',
  borderColor: '--chart-border',
  crosshairColor: '--chart-crosshair',
  tooltipBackground: '--chart-tooltip-bg',
  tooltipTextColor: '--chart-tooltip-text',
  tooltipBorderColor: '--chart-tooltip-border',
};

/** Semantic product tokens for the common “make the chart match my app” path. */
export interface CreateThemeTokens {
  /** Optional named/full theme to extend before semantic tokens are applied. */
  base?: Partial<ThemeConfig>;
  /** Plot surface color, or `'container'` to copy the nearest opaque ancestor. */
  surface?: string;
  /** Primary chart text color. */
  text?: string;
  /** Axis/companion text color; grid, ticks and frame use this hue at 0.18 opacity unless overridden. */
  muted?: string;
  /** Interaction accent, currently used by the crosshair. */
  accent?: string;
  /** Categorical series cycle. Also populates the legacy `palette` role. */
  categorical?: string[];
  /** Ordered magnitude ramp. */
  sequential?: string[];
  /** Signed/centered-data ramp. */
  diverging?: string[];
  /** Density/heatmap ramp; defaults through the normal role cascade. */
  heatmap?: string[];
  /** The font family of chart text. */
  fontFamily?: string;
  /** The axis text size in CSS pixels. */
  fontSize?: number;
  /** The gridline opacity. */
  gridOpacity?: number;
  /** The frame opacity. */
  borderOpacity?: number;
  /** The tooltip colours. */
  tooltip?: {
    /** The tooltip surface. */
    surface?: string;
    /** The tooltip text colour. */
    text?: string;
    /** The tooltip border colour. */
    border?: string;
  };
}

/**
 * Build a theme override from a small set of product-level tokens.
 *
 * This intentionally returns a partial theme: roles not supplied continue
 * through the normal CSS-variable and light/dark default resolution path.
 */
export function createTheme(tokens: CreateThemeTokens): Partial<ThemeConfig> {
  const theme: Partial<ThemeConfig> = { ...(tokens.base ?? {}) };
  if (tokens.surface !== undefined) theme.backgroundColor = tokens.surface;
  if (tokens.text !== undefined) theme.textColor = tokens.text;
  if (tokens.muted !== undefined) {
    theme.axisLabelColor = tokens.muted;
    theme.tickColor = tokens.muted;
    theme.gridColor = tokens.muted;
    theme.axisLineColor = tokens.muted;
    theme.borderColor = tokens.muted;
    // A text-strength muted color needs much less ink for chart furniture.
    // Explicit opacity tokens below take precedence over these defaults.
    theme.gridOpacity = 0.18;
    theme.borderOpacity = 0.18;
  }
  if (tokens.accent !== undefined) theme.crosshairColor = tokens.accent;
  if (tokens.categorical !== undefined) {
    theme.palette = [...tokens.categorical];
    theme.categoricalPalette = [...tokens.categorical];
  }
  if (tokens.sequential !== undefined) theme.sequentialPalette = [...tokens.sequential];
  if (tokens.diverging !== undefined) theme.divergingPalette = [...tokens.diverging];
  if (tokens.heatmap !== undefined) theme.heatmapGradient = [...tokens.heatmap];
  if (tokens.fontFamily !== undefined) theme.fontFamily = tokens.fontFamily;
  if (tokens.fontSize !== undefined) theme.fontSize = tokens.fontSize;
  if (tokens.gridOpacity !== undefined) theme.gridOpacity = tokens.gridOpacity;
  if (tokens.borderOpacity !== undefined) theme.borderOpacity = tokens.borderOpacity;
  if (tokens.tooltip?.surface !== undefined) theme.tooltipBackground = tokens.tooltip.surface;
  if (tokens.tooltip?.text !== undefined) theme.tooltipTextColor = tokens.tooltip.text;
  if (tokens.tooltip?.border !== undefined) theme.tooltipBorderColor = tokens.tooltip.border;
  return theme;
}

/** CSS variables consumed by Snaplot's DOM companion components. */
export const SNAPLOT_THEME_CSS_VARS = {
  /** The text colour. */
  text: '--snaplot-theme-text',
  /** The muted text colour. */
  muted: '--snaplot-theme-muted',
  /** The border colour. */
  border: '--snaplot-theme-border',
  /** The hover background. */
  hover: '--snaplot-theme-hover',
  /** The highlight background. */
  highlight: '--snaplot-theme-highlight',
  /** The font family. */
  fontFamily: '--snaplot-theme-font-family',
  /** The interaction accent: the focus ring. */
  accent: '--snaplot-theme-accent',
} as const;

/** Apply a resolved canvas theme to a DOM companion's inheritable tokens. */
export function applyThemeToElement(element: HTMLElement, theme: ThemeConfig): void {
  const style = element.style as CSSStyleDeclaration & Record<string, string>;
  const set = (name: string, value: string) => {
    if (typeof style.setProperty === 'function') style.setProperty(name, value);
    else style[name] = value;
  };
  set(SNAPLOT_THEME_CSS_VARS.text, theme.textColor);
  set(SNAPLOT_THEME_CSS_VARS.muted, theme.tickColor);
  set(SNAPLOT_THEME_CSS_VARS.border, withAlpha(theme.borderColor, theme.borderOpacity));
  set(SNAPLOT_THEME_CSS_VARS.hover, withAlpha(theme.textColor, 0.08));
  set(SNAPLOT_THEME_CSS_VARS.highlight, withAlpha(theme.textColor, 0.14));
  set(SNAPLOT_THEME_CSS_VARS.fontFamily, theme.fontFamily);
  set(SNAPLOT_THEME_CSS_VARS.accent, theme.crosshairColor);
}

/** Remove the companion tokens `applyThemeToElement` set (a chart's destroy). */
export function clearThemeFromElement(element: HTMLElement): void {
  for (const name of Object.values(SNAPLOT_THEME_CSS_VARS)) element.style.removeProperty?.(name);
}

/** Theme fields that hold a single CSS color and participate in resolution. */
const COLOR_FIELDS: (keyof ThemeConfig)[] = [
  'axisLabelColor',
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
 * Canvas cannot read CSS custom properties, so theme values like `var(--surface)` resolve through
 * the container's cascade to concrete sRGB, once per theme application, never per frame.
 * Unresolvable input is returned unchanged. Palette entries normalize to `#rrggbb` (alpha dropped: translucency belongs in the
 * theme's opacity knobs), since ramps interpolate channels.
 */
function cssColorResolver(container: HTMLElement): (value: string, asHex: boolean) => string {
  return (value, asHex) => {
    if (!asHex && !value.includes('var(')) return value;
    const rgba = resolveColor(value, container);
    if (!rgba) return value;
    if (!asHex) return cssColor(rgba);
    return `#${[rgba.r, rgba.g, rgba.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
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
  const dark = theme.mode
    ? theme.mode === 'dark'
    : isDarkColor(theme.surfaceColor ?? theme.backgroundColor, false);
  const defaultCategorical = dark ? PALETTE_CATEGORICAL_DARK : PALETTE_CATEGORICAL_LIGHT;
  const defaultSequential = dark ? PALETTE_SEQUENTIAL_DARK : PALETTE_SEQUENTIAL_LIGHT;
  const defaultDiverging = dark ? PALETTE_DIVERGING_DARK : PALETTE_DIVERGING_LIGHT;
  const customThemeSurface = !!userTheme || hasCssOverrides;

  const palette = clonePalette(theme.palette) ?? [...defaultCategorical];
  const categoricalPalette =
    clonePalette(userTheme?.categoricalPalette) ??
    (userTheme?.palette ? undefined : clonePalette(theme.categoricalPalette)) ??
    palette;
  const sequentialPalette = clonePalette(userTheme?.sequentialPalette) ??
    (customThemeSurface ? undefined : clonePalette(theme.sequentialPalette)) ?? [
      ...defaultSequential,
    ];
  const divergingPalette = clonePalette(userTheme?.divergingPalette) ??
    (customThemeSurface ? undefined : clonePalette(theme.divergingPalette)) ?? [
      ...defaultDiverging,
    ];
  const heatmapGradient = clonePalette(userTheme?.heatmapGradient) ??
    clonePalette(userTheme?.sequentialPalette) ??
    (customThemeSurface ? undefined : clonePalette(theme.heatmapGradient)) ?? [
      ...sequentialPalette,
    ];

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
    // --chart-text is the chart's text, axis text included, unless the axis has its own.
    if (cssOverrides.textColor) {
      cssOverrides.tickColor ??= cssOverrides.textColor;
      cssOverrides.axisLabelColor ??= cssOverrides.textColor;
    }
  }

  // The theme follows the page, not the OS (plan D4): an explicit surface (tokens or the
  // --chart-bg variable) wins, then the first opaque ancestor background, then the luminance of
  // the page's text colour, then white. Only an explicit surface is painted (plan D5).
  const resolve = cssColorResolver(container);
  const explicit = userTheme?.backgroundColor ?? cssOverrides.backgroundColor;
  const page =
    explicit === undefined || explicit === 'container' || explicit === 'transparent'
      ? findPageSurface(container)
      : undefined;
  const surface =
    explicit === undefined || explicit === 'container' || explicit === 'transparent'
      ? page!
      : resolve(explicit, false);
  const mode = userTheme?.mode ?? (isDarkColor(surface, false) ? 'dark' : 'light');
  const baseTheme = mode === 'dark' ? DARK_THEME : DEFAULT_THEME;

  const merged = deepMerge(
    baseTheme as unknown as Record<string, unknown>,
    cssOverrides as unknown as Record<string, unknown>,
    (userTheme ?? {}) as unknown as Record<string, unknown>,
  ) as unknown as ThemeConfig;
  merged.mode = mode;
  merged.surfaceColor = surface;
  merged.backgroundColor =
    explicit === undefined || explicit === 'transparent'
      ? 'transparent'
      : explicit === 'container'
        ? surface
        : explicit;

  // Scalars resolve before normalization so the light/dark detection that
  // picks the default role palettes sees a parseable surface; palettes
  // resolve after it, because normalization chooses between the user's raw
  // arrays and the merged theme's, and the winners are what need concrete
  // values.
  resolveScalarColors(merged, resolve);
  const normalized = normalizeTheme(merged, userTheme, Object.keys(cssOverrides).length > 0);
  resolvePaletteColors(normalized, resolve);
  normalized.fontSize = renderedFontSize(container, normalized.fontSize);
  return normalized;
}

/**
 * The size chart text renders at in `container`: page CSS (a forced minimum, a reader's
 * `!important` rule) can override the theme's, and labels are measured at the rendered size so
 * gutters and thinning fit what the reader sees.
 */
function renderedFontSize(container: HTMLElement, fontSize: number): number {
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') return fontSize;
  const probe = document.createElement('span');
  probe.style.cssText = `position:absolute;visibility:hidden;font-size:${fontSize}px`;
  container.appendChild(probe);
  const rendered = Number.parseFloat(getComputedStyle(probe).fontSize);
  probe.remove();
  return Number.isFinite(rendered) && rendered > 0 ? rendered : fontSize;
}

/** The page surface behind `container`: an opaque ancestor background, else from the text colour. */
function findPageSurface(container: HTMLElement): string {
  const found = findContainerSurface(container, '');
  if (found) return found;
  if (typeof getComputedStyle === 'undefined') return '#ffffff';
  // No opaque ancestor (a transparent page over the canvas default): light text means a dark page.
  const text = getComputedStyle(container).color?.trim() ?? '';
  return text && !isDarkColor(text, true) ? '#111113' : '#ffffff';
}

function findContainerSurface(container: HTMLElement, fallback: string): string {
  if (typeof getComputedStyle === 'undefined') return fallback;
  let current: HTMLElement | null = container;
  while (current) {
    const color = getComputedStyle(current).backgroundColor?.trim();
    if (color && isOpaqueColor(color)) return color;
    current = current.parentElement;
  }
  return fallback;
}

function isOpaqueColor(color: string): boolean {
  if (!color.trim()) return false;
  // A colour the parser cannot read (no DOM) counts as opaque, as an author-set surface would.
  const rgba = parseColor(color);
  return rgba ? rgba.a >= 1 : true;
}
