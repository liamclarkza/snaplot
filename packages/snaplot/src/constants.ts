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
 * Light theme — designed around a coordinated grey scale:
 *
 *   #ffffff  background
 *   #d8dae0  grid lines (at 0.6 opacity)
 *   #c0c4cc  axis lines (soft frame)
 *   #9098a8  crosshair
 *   #8890a0  tick labels (muted blue-grey, readable but not harsh)
 *   #2a2a35  text (near-black)
 */
export const DEFAULT_THEME: ThemeConfig = {
  backgroundColor: '#ffffff',
  textColor: '#2a2a35',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: 11,
  gridColor: '#d8dae0',
  gridOpacity: 0.6,
  palette: [...PALETTE_OKABE_ITO],
  axisLineColor: '#d8dae0',
  tickColor: '#8890a0',
  crosshairColor: '#9098a8',
  tooltipBackground: '#ffffff',
  tooltipTextColor: '#2a2a35',
  tooltipBorderColor: '#d8dae0',
};

export const DARK_THEME: ThemeConfig = {
  backgroundColor: '#1a1a2e',
  textColor: '#c0c0c0',
  fontFamily: DEFAULT_THEME.fontFamily,
  fontSize: 11,
  gridColor: '#555566',
  gridOpacity: 0.5,
  palette: [...PALETTE_OKABE_ITO],
  axisLineColor: '#666677',
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
  backgroundColor: '#0a0a0a',
  textColor: '#d0d0d0',
  fontFamily: DEFAULT_THEME.fontFamily,
  fontSize: 11,
  gridColor: '#222222',
  gridOpacity: 0.7,
  palette: ['#ff6b6b', '#51cf66', '#339af0', '#fcc419', '#cc5de8', '#ff922b', '#22b8cf', '#e599f7'],
  axisLineColor: '#333333',
  tickColor: '#666666',
  crosshairColor: '#888888',
  tooltipBackground: 'rgba(0, 0, 0, 0.95)',
  tooltipTextColor: '#e0e0e0',
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
