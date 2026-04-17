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
 * Light theme — coordinated grey-blue scale. The background carries a
 * whisper of brand-hue cool (≈2 %) instead of pure white per the Soft UI
 * guide ("your 'white' should carry 1–2 % of your brand hue").
 *
 *   #fcfcfd  background      (barely cool off-white)
 *   #d8dae0  grid lines      (at 0.45 opacity — softer than before)
 *   #d8dae0  axis lines
 *   #9098a8  crosshair
 *   #8890a0  tick labels     (muted blue-grey, readable but not harsh)
 *   #2a2a35  text            (near-black, not pure)
 */
export const DEFAULT_THEME: ThemeConfig = {
  backgroundColor: '#fcfcfd',
  textColor: '#2a2a35',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: 11,
  gridColor: '#d8dae0',
  gridOpacity: 0.45,
  palette: [...PALETTE_OKABE_ITO],
  axisLineColor: '#d8dae0',
  tickColor: '#8890a0',
  crosshairColor: '#9098a8',
  tooltipBackground: '#fcfcfd',
  tooltipTextColor: '#2a2a35',
  tooltipBorderColor: '#d8dae0',
};

export const DARK_THEME: ThemeConfig = {
  backgroundColor: '#1a1a2e',
  textColor: '#c0c0c0',
  fontFamily: DEFAULT_THEME.fontFamily,
  fontSize: 11,
  gridColor: '#3a3a4f',
  gridOpacity: 0.45,
  palette: [...PALETTE_OKABE_ITO],
  axisLineColor: '#4a4a62',
  tickColor: '#888899',
  crosshairColor: '#aaaacc',
  tooltipBackground: 'rgba(20, 20, 40, 0.95)',
  tooltipTextColor: '#e0e0e0',
  tooltipBorderColor: 'rgba(255, 255, 255, 0.12)',
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
  tickColor: '#666677',
  crosshairColor: '#888899',
  tooltipBackground: 'rgba(10, 10, 15, 0.95)',
  tooltipTextColor: '#e0e0e0',
  tooltipBorderColor: 'rgba(255, 255, 255, 0.08)',
};

/**
 * Refined dark — a modern slate-based alternative to DARK_THEME for
 * app dashboards that want the Soft-UI look: tinted neutrals, softer
 * grid, blue accent as the hero. Keeps the Okabe–Ito palette so
 * colorblind-safety isn't traded away.
 *
 *   #14161f  background      (slate, not navy)
 *   #232634  grid            (at 0.4 opacity — quiet but legible)
 *   #2e3244  axis            (a step above grid)
 *   #8a8e9c  tick labels
 *   #a0a5b8  crosshair
 *   #e2e2e5  text            (warm off-white, avoids cold #fff)
 */
export const REFINED_DARK_THEME: ThemeConfig = {
  backgroundColor: '#14161f',
  textColor: '#e2e2e5',
  fontFamily: DEFAULT_THEME.fontFamily,
  fontSize: 11,
  gridColor: '#232634',
  gridOpacity: 0.4,
  palette: [...PALETTE_OKABE_ITO],
  axisLineColor: '#2e3244',
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

/** Touch hit-test radius (CSS pixels) */
export const TOUCH_HIT_RADIUS = 24;
