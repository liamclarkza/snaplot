import type { ThemeConfig } from './types';

/**
 * Okabe-Ito palette — 8 colours optimised for colorblind accessibility.
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
 * Light theme — Soft-UI defaults. Grid and border share a single slate
 * hue and differentiate by opacity alone: the grid sits at 0.5 (quiet
 * but legible), the border at 0.9 (a clear step above). Background is
 * a barely-cool off-white (~2 % brand hue) per Soft UI guidance; text
 * is near-black with a slight slate tint rather than pure #000.
 *
 *   #fafbfc  background      (tinted off-white)
 *   #c3c6cf  grid / border   (shared hue — opacity differentiates)
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
  // Same opacity as the grid — the frame is solid, the grid is dashed,
  // so the solid line reads ~one step stronger without being harsh.
  borderOpacity: 0.5,
  tickColor: '#6b7181',
  crosshairColor: '#3b4254',
  tooltipBackground: '#ffffff',
  tooltipTextColor: '#1a1d29',
  tooltipBorderColor: '#dadde3',
};

/**
 * Dark theme — Soft-UI slate. The old navy #1a1a2e gave way to a
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

export const OCEAN_THEME: ThemeConfig = {
  backgroundColor: '#0c1929',
  textColor: '#a8c8e8',
  fontFamily: DEFAULT_THEME.fontFamily,
  fontSize: 11,
  gridColor: '#1e3a5f',
  gridOpacity: 0.6,
  palette: ['#00d4aa', '#4fc3f7', '#ff8a65', '#ba68c8', '#ffd54f', '#e57373', '#81c784', '#90a4ae'],
  axisLineColor: '#2a4a6b',
  borderColor: '#2a4a6b',
  borderOpacity: 0.7,
  tickColor: '#5a8aaa',
  crosshairColor: '#4fc3f7',
  tooltipBackground: 'rgba(8, 20, 35, 0.95)',
  tooltipTextColor: '#c8e0f0',
  tooltipBorderColor: 'rgba(79, 195, 247, 0.2)',
};

export const MIDNIGHT_THEME: ThemeConfig = {
  // Subtle blue tint instead of pure #0a0a0a — avoids the "void" look on
  // LCD panels where #000 clips to slightly blueish anyway.
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
 * Refined dark — the original Soft-UI template that `DARK_THEME` now
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

/** Default zoom wheel factor */
export const DEFAULT_WHEEL_FACTOR = 1.1;

/** Auto-range Y padding as fraction of range */
export const AUTO_RANGE_PADDING = 0.05;

/** Default long-press duration (ms) before box-zoom on touch */
export const DEFAULT_LONG_PRESS_MS = 400;

/** Default tap timeout (ms) — max time for a press to count as a tap */
export const TAP_TIMEOUT = 300;

/** Double-tap timeout (ms) — max time between two taps */
export const DOUBLE_TAP_TIMEOUT = 300;

/** Mouse hit-test radius (CSS pixels) */
export const MOUSE_HIT_RADIUS = 32;

/** Touch hit-test radius (CSS pixels). WCAG 2.5.5 calls for ≥44px tap targets. */
export const TOUCH_HIT_RADIUS = 44;
