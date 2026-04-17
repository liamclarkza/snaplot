import type { ThemeConfig } from './types';

/**
 * Okabe-Ito palette, 8 colours optimised for colorblind accessibility.
 * Recommended by Nature for scientific publishing.
 */
export const PALETTE_OKABE_ITO = [
  '#E69F00', // orange
  '#56B4E9', // sky blue
  '#009E73', // bluish green
  '#F0E442', // yellow
  '#0072B2', // blue
  '#D55E00', // vermillion
  '#CC79A7', // reddish purple
  '#000000', // black
] as const;

/**
 * Light theme, Soft-UI defaults. Grid and border share a single slate
 * hue and differentiate by opacity alone: the grid sits at 0.5 (quiet
 * but legible), the border at 0.9 (a clear step above). Background is
 * a barely-cool off-white (~2 % brand hue) per Soft UI guidance; text
 * is near-black with a slight slate tint rather than pure #000.
 *
 *   #fafbfc  background      (tinted off-white)
 *   #c3c6cf  grid / border   (shared hue, opacity differentiates)
 *   #6b7181  tick labels     (legible mid-contrast)
 *   #3b4254  crosshair
 *   #1a1d29  text            (near-black with cool tint)
 */
export const DEFAULT_THEME: ThemeConfig = {
  backgroundColor: '#fafbfc',
  textColor: '#1a1d29',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: 11,
  gridColor: '#c3c6cf',
  gridOpacity: 0.5,
  palette: [...PALETTE_OKABE_ITO],
  axisLineColor: '#c3c6cf',
  borderColor: '#c3c6cf',
  // Same opacity as the grid, the frame is solid, the grid is dashed,
  // so the solid line reads ~one step stronger without being harsh.
  borderOpacity: 0.5,
  tickColor: '#6b7181',
  crosshairColor: '#3b4254',
  tooltipBackground: '#ffffff',
  tooltipTextColor: '#1a1d29',
  tooltipBorderColor: '#dadde3',
};

/**
 * Dark theme, Soft-UI slate. The old navy #1a1a2e gave way to a
 * cooler slate (#14161f) that matches the `refinedDarkTheme` aesthetic:
 * tinted neutrals, warm off-white text (#e2e2e5, not pure white),
 * Okabe–Ito palette. Grid and border share one hue; opacity does the
 * visual separation.
 */
export const DARK_THEME: ThemeConfig = {
  backgroundColor: '#14161f',
  textColor: '#e2e2e5',
  fontFamily: DEFAULT_THEME.fontFamily,
  fontSize: 11,
  gridColor: '#2a2d3a',
  gridOpacity: 0.55,
  palette: [...PALETTE_OKABE_ITO],
  axisLineColor: '#2a2d3a',
  borderColor: '#2a2d3a',
  borderOpacity: 0.65,
  tickColor: '#8a8e9c',
  crosshairColor: '#a0a5b8',
  tooltipBackground: 'rgba(20, 23, 32, 0.96)',
  tooltipTextColor: '#e8e8eb',
  tooltipBorderColor: 'rgba(255, 255, 255, 0.1)',
};

/**
 * Ocean, deep navy hero with a harmonised blue-to-warm cycle. Sky
 * blue leads (so the first series always reads as "primary"); cyan
 * and teal provide cool contrast; coral and amber are the single
 * warm accents. The palette stays on an ocean-sun axis rather than
 * fanning out into unrelated hues.
 */
export const OCEAN_THEME: ThemeConfig = {
  backgroundColor: '#0b1a2b',
  textColor: '#d6e4f2',
  fontFamily: DEFAULT_THEME.fontFamily,
  fontSize: 11,
  gridColor: '#1a3352',
  gridOpacity: 0.45,
  palette: [
    '#60a5fa', // sky
    '#22d3ee', // cyan
    '#f59e0b', // amber (warm accent)
    '#2dd4bf', // teal
    '#fb7185', // coral
    '#818cf8', // periwinkle
    '#0ea5e9', // deep sky
    '#f472b6', // reef pink
  ],
  axisLineColor: '#1a3352',
  borderColor: '#1a3352',
  borderOpacity: 0.55,
  tickColor: '#6d8eae',
  crosshairColor: '#88c0f0',
  tooltipBackground: 'rgba(10, 20, 34, 0.96)',
  tooltipTextColor: '#d6e4f2',
  tooltipBorderColor: 'rgba(120, 170, 220, 0.18)',
};

/**
 * Forest, deep pine base with a leaf-to-moss cycle. Emerald leads
 * and every step stays in the green/teal/olive family so the theme
 * reads as one cohesive forest rather than a random green palette;
 * a single amber slot provides warm contrast for bar/histogram legends.
 */
export const FOREST_THEME: ThemeConfig = {
  backgroundColor: '#0c1613',
  textColor: '#d7ead9',
  fontFamily: DEFAULT_THEME.fontFamily,
  fontSize: 11,
  gridColor: '#1a2a24',
  gridOpacity: 0.45,
  palette: [
    '#34d399', // emerald
    '#6ee7b7', // mint leaf
    '#059669', // pine
    '#a7d06a', // spring olive
    '#14b8a6', // teal
    '#fbbf24', // amber (warm accent)
    '#84cc16', // lime
    '#0d9488', // deep teal
  ],
  axisLineColor: '#1a2a24',
  borderColor: '#1a2a24',
  borderOpacity: 0.55,
  tickColor: '#7ea088',
  crosshairColor: '#a2c6ad',
  tooltipBackground: 'rgba(12, 22, 19, 0.96)',
  tooltipTextColor: '#d7ead9',
  tooltipBorderColor: 'rgba(180, 220, 180, 0.14)',
};

/**
 * Sunset, dusk gold / orange / violet. Gold leads (not pink) so
 * single-series charts land on a warm, grown-up accent; pink and
 * fuchsia stay as later slots for contrast. Deep aubergine bg keeps
 * the warm series popping without burning the eye.
 */
export const SUNSET_THEME: ThemeConfig = {
  backgroundColor: '#1a1220',
  textColor: '#f2e2d8',
  fontFamily: DEFAULT_THEME.fontFamily,
  fontSize: 11,
  gridColor: '#2e2133',
  gridOpacity: 0.55,
  palette: [
    '#f59e0b', // amber (warm hero)
    '#8b5cf6', // violet
    '#fb923c', // orange
    '#ec4899', // pink
    '#fde047', // gold
    '#c084fc', // lilac
    '#e11d48', // sunset red
    '#facc15', // honey
  ],
  axisLineColor: '#2e2133',
  borderColor: '#2e2133',
  borderOpacity: 0.7,
  tickColor: '#a590a8',
  crosshairColor: '#e4c0a0',
  tooltipBackground: 'rgba(26, 18, 32, 0.96)',
  tooltipTextColor: '#f2e2d8',
  tooltipBorderColor: 'rgba(230, 190, 150, 0.18)',
};

/**
 * Violet, premium dark in the Linear / Vercel aesthetic. Rich
 * aubergine-black with a cohesive lavender-to-indigo cycle; a single
 * amber slot breaks the cool palette for legend legibility. No
 * saturated magentas or fuchsias, restraint is the whole point.
 */
export const VIOLET_THEME: ThemeConfig = {
  backgroundColor: '#100d1f',
  textColor: '#e4e0f0',
  fontFamily: DEFAULT_THEME.fontFamily,
  fontSize: 11,
  gridColor: '#242042',
  gridOpacity: 0.45,
  palette: [
    '#a78bfa', // lavender
    '#818cf8', // periwinkle
    '#6366f1', // indigo
    '#c4b5fd', // pale violet
    '#f59e0b', // amber (single warm contrast)
    '#7c3aed', // deep violet
    '#60a5fa', // blue
    '#e0d9ff', // lilac haze
  ],
  axisLineColor: '#242042',
  borderColor: '#242042',
  borderOpacity: 0.55,
  tickColor: '#8a85a8',
  crosshairColor: '#b8b0d4',
  tooltipBackground: 'rgba(18, 15, 32, 0.96)',
  tooltipTextColor: '#e4e0f0',
  tooltipBorderColor: 'rgba(180, 160, 230, 0.16)',
};

/**
 * Fog, Linear / Notion dashboard light. Cool off-white bg with a
 * restrained productivity palette: blue leads, emerald + violet for
 * contrast, amber as the warm accent. Muted enough for a writing-app
 * surface, saturated enough for >4 series to stay distinguishable.
 */
export const FOG_THEME: ThemeConfig = {
  backgroundColor: '#f5f7fb',
  textColor: '#1a2030',
  fontFamily: DEFAULT_THEME.fontFamily,
  fontSize: 11,
  gridColor: '#c8cfdc',
  gridOpacity: 0.42,
  palette: [
    '#2563eb', // blue
    '#059669', // emerald
    '#7c3aed', // violet
    '#d97706', // amber
    '#0891b2', // cyan
    '#db2777', // pink
    '#4f46e5', // indigo
    '#0d9488', // teal
  ],
  axisLineColor: '#c8cfdc',
  borderColor: '#c8cfdc',
  borderOpacity: 0.42,
  tickColor: '#6a7386',
  crosshairColor: '#384050',
  tooltipBackground: '#ffffff',
  tooltipTextColor: '#1a2030',
  tooltipBorderColor: '#d6dbe6',
};

/**
 * Ivory, warm cream light theme for documents-that-happen-to-have-charts
 * (Notion, Bear, writing apps). Earth-tone palette leads with burnt
 * orange so charts feel printed, not screen-blasted.
 */
export const IVORY_THEME: ThemeConfig = {
  backgroundColor: '#faf8f3',
  textColor: '#2a2418',
  fontFamily: DEFAULT_THEME.fontFamily,
  fontSize: 11,
  gridColor: '#d9d3c3',
  gridOpacity: 0.5,
  palette: [
    '#c2410c', // burnt orange
    '#0369a1', // deep sky
    '#16a34a', // green
    '#9333ea', // purple
    '#ca8a04', // amber
    '#dc2626', // red
    '#0f766e', // teal
    '#7c2d12', // mahogany
  ],
  axisLineColor: '#d9d3c3',
  borderColor: '#d9d3c3',
  borderOpacity: 0.5,
  tickColor: '#7d7458',
  crosshairColor: '#3f3826',
  tooltipBackground: '#ffffff',
  tooltipTextColor: '#2a2418',
  tooltipBorderColor: '#e6dfcb',
};

/**
 * Mint, fresh, cool light theme for wellness / health / environment
 * dashboards. Barely-green bg with emerald lead; secondary accents
 * stay saturated enough to distinguish >4 series.
 */
export const MINT_THEME: ThemeConfig = {
  backgroundColor: '#f3faf7',
  textColor: '#0f2a20',
  fontFamily: DEFAULT_THEME.fontFamily,
  fontSize: 11,
  gridColor: '#c5d9cf',
  gridOpacity: 0.5,
  palette: [
    '#059669', // emerald
    '#0891b2', // cyan
    '#a16207', // yellow-brown
    '#be185d', // pink-brown
    '#7c3aed', // violet
    '#2563eb', // blue
    '#0d9488', // teal
    '#ca8a04', // amber
  ],
  axisLineColor: '#c5d9cf',
  borderColor: '#c5d9cf',
  borderOpacity: 0.5,
  tickColor: '#507066',
  crosshairColor: '#1d4437',
  tooltipBackground: '#ffffff',
  tooltipTextColor: '#0f2a20',
  tooltipBorderColor: '#d3e4db',
};

/**
 * Midnight, the previous near-black theme. Kept as a named export
 * for back-compat but no longer featured in the site's theme chip
 * row. Prefer `darkTheme` (slate) for new work.
 */
export const MIDNIGHT_THEME: ThemeConfig = {
  backgroundColor: '#0c0d12',
  textColor: '#d0d0d0',
  fontFamily: DEFAULT_THEME.fontFamily,
  fontSize: 11,
  gridColor: '#1f2028',
  gridOpacity: 0.55,
  palette: ['#ff6b6b', '#51cf66', '#339af0', '#fcc419', '#cc5de8', '#ff922b', '#22b8cf', '#e599f7'],
  axisLineColor: '#2a2b36',
  borderColor: '#2a2b36',
  borderOpacity: 0.7,
  tickColor: '#666677',
  crosshairColor: '#888899',
  tooltipBackground: 'rgba(10, 10, 15, 0.95)',
  tooltipTextColor: '#e0e0e0',
  tooltipBorderColor: 'rgba(255, 255, 255, 0.08)',
};

/**
 * Mars, warm rust/terracotta on burnt umber. Kept as a back-compat
 * export; retired from the featured chip row in favour of `sunsetTheme`
 * (gold-led warm) + `ivoryTheme` (cream light).
 */
export const MARS_THEME: ThemeConfig = {
  backgroundColor: '#1c100c',
  textColor: '#f2d7c0',
  fontFamily: DEFAULT_THEME.fontFamily,
  fontSize: 11,
  gridColor: '#3a1f17',
  gridOpacity: 0.55,
  palette: [
    '#ff8a3d', '#e2504b', '#f4c27c', '#c06548',
    '#8e3a1e', '#e8a272', '#b04a2f', '#f2d7c0',
  ],
  axisLineColor: '#3a1f17',
  borderColor: '#3a1f17',
  borderOpacity: 0.7,
  tickColor: '#a57a66',
  crosshairColor: '#e2a074',
  tooltipBackground: 'rgba(28, 16, 12, 0.96)',
  tooltipTextColor: '#f5dcc4',
  tooltipBorderColor: 'rgba(255, 170, 120, 0.18)',
};

/**
 * Refined dark, the original Soft-UI template that `DARK_THEME` now
 * also follows. Kept as a named export for back-compat; the palette is
 * effectively identical to `darkTheme` since 0.4.x.
 */
export const REFINED_DARK_THEME: ThemeConfig = {
  backgroundColor: '#14161f',
  textColor: '#e2e2e5',
  fontFamily: DEFAULT_THEME.fontFamily,
  fontSize: 11,
  gridColor: '#232634',
  gridOpacity: 0.5,
  palette: [...PALETTE_OKABE_ITO],
  axisLineColor: '#2e3244',
  borderColor: '#2e3244',
  borderOpacity: 0.7,
  tickColor: '#8a8e9c',
  crosshairColor: '#a0a5b8',
  tooltipBackground: 'rgba(20, 23, 32, 0.96)',
  tooltipTextColor: '#e8e8eb',
  tooltipBorderColor: 'rgba(255, 255, 255, 0.08)',
};

/**
 * Default padding around the plot area (CSS pixels).
 * Based on 8px grid: top/right get 24px breathing room,
 * bottom gets 44px for x-axis labels + tick marks,
 * left gets 56px for y-axis labels (measured dynamically but this is the minimum).
 */
export const DEFAULT_PADDING = {
  top: 24,
  right: 24,
  bottom: 44,
  left: 56,
} as const;

/** Minimum gap between axis labels (CSS pixels) */
export const LABEL_MIN_GAP = 12;

/** Default tick count target */
export const DEFAULT_TICK_COUNT = 6;

/** Default tooltip offset from cursor (CSS pixels) */
export const TOOLTIP_OFFSET = 12;

/** Minimum drag distance before zoom/selection activates (CSS pixels) */
export const MIN_DRAG_DISTANCE = 10;

/** Default zoom fraction per max wheel/pinch tick (10 % per tick). */
export const DEFAULT_WHEEL_STEP = 0.1;

/** Auto-range Y padding as fraction of range */
export const AUTO_RANGE_PADDING = 0.05;

/** Default long-press duration (ms) before box-zoom on touch */
export const DEFAULT_LONG_PRESS_MS = 400;

/** Default tap timeout (ms), max time for a press to count as a tap */
export const TAP_TIMEOUT = 300;

/** Double-tap timeout (ms), max time between two taps */
export const DOUBLE_TAP_TIMEOUT = 300;

/** Mouse hit-test radius (CSS pixels) */
export const MOUSE_HIT_RADIUS = 32;

/** Touch hit-test radius (CSS pixels). WCAG 2.5.5 calls for ≥44px tap targets. */
export const TOUCH_HIT_RADIUS = 44;
