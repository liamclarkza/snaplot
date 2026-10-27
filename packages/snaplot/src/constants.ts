import type { ThemeConfig } from './engine/spec';

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
 * Default categorical cycles are tuned separately for light and dark surfaces:
 * same broad hue coverage, but dark mode uses brighter/lower-glare variants.
 */
export const PALETTE_CATEGORICAL_LIGHT = [
  '#0072B2',
  '#009E73',
  '#E69F00',
  '#D55E00',
  '#CC79A7',
  '#56B4E9',
  '#7F3C8D',
  '#666666',
] as const;

/**
 * Okabe–Ito hues lightened for a dark surface, ordered so the first three stay apart under protan
 * and deutan vision and the first five under both at ΔE00 ≥ 7 (`npm run check:palettes`).
 */
export const PALETTE_CATEGORICAL_DARK = [
  '#56b4e9',
  '#e69f00',
  '#2ec79b',
  '#cc79a7',
  '#f0e442',
  '#ff7f50',
  '#8f9cff',
  '#b8beca',
] as const;

/**
 * Ordered ramps for continuous encodings. They avoid rainbow-style hue jumps:
 * sequential ramps move mostly by lightness, diverging ramps reserve the centre
 * for a neutral midpoint.
 */
export const PALETTE_SEQUENTIAL_LIGHT = [
  // The lightest stop keeps 1.5:1 against white at the scatter's 0.8 alpha, so the lowest
  // values still read.
  '#8cb8de',
  '#6aa3d4',
  '#4a8ac4',
  '#2b6fae',
  '#155394',
  '#08306b',
] as const;

export const PALETTE_SEQUENTIAL_DARK = [
  '#151821',
  '#26304c',
  '#315f88',
  '#2a9d8f',
  '#7ccf72',
  '#fde047',
] as const;

export const PALETTE_DIVERGING_LIGHT = [
  '#2166ac',
  '#92c5de',
  '#f7f7f7',
  '#f4a582',
  '#b2182b',
] as const;

export const PALETTE_DIVERGING_DARK = [
  '#60a5fa',
  '#244c85',
  '#151821',
  '#7f1d1d',
  '#fb7185',
] as const;

/**
 * Light theme, Soft-UI defaults. Grid and border share a single slate
 * hue and opacity so the frame does not compete with the data. Background is
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
  palette: [...PALETTE_CATEGORICAL_LIGHT],
  categoricalPalette: [...PALETTE_CATEGORICAL_LIGHT],
  sequentialPalette: [...PALETTE_SEQUENTIAL_LIGHT],
  divergingPalette: [...PALETTE_DIVERGING_LIGHT],
  heatmapGradient: [...PALETTE_SEQUENTIAL_LIGHT],
  axisLineColor: '#c3c6cf',
  borderColor: '#c3c6cf',
  borderOpacity: 0.5,
  tickColor: '#6b7181',
  axisLabelColor: '#6b7181',
  crosshairColor: '#3b4254',
  tooltipBackground: '#ffffff',
  tooltipTextColor: '#1a1d29',
  tooltipBorderColor: '#dadde3',
};

/**
 * Dark theme, Soft-UI slate. The old navy #1a1a2e gave way to a
 * cooler slate (#14161f) that matches the `refinedDarkTheme` aesthetic:
 * tinted neutrals, warm off-white text (#e2e2e5, not pure white),
 * and a dark-surface categorical palette. Grid and border share one hue;
 * opacity does the visual separation.
 */
export const DARK_THEME: ThemeConfig = {
  backgroundColor: '#14161f',
  textColor: '#e2e2e5',
  fontFamily: DEFAULT_THEME.fontFamily,
  fontSize: 11,
  gridColor: '#2a2d3a',
  gridOpacity: 0.55,
  palette: [...PALETTE_CATEGORICAL_DARK],
  categoricalPalette: [...PALETTE_CATEGORICAL_DARK],
  sequentialPalette: [...PALETTE_SEQUENTIAL_DARK],
  divergingPalette: [...PALETTE_DIVERGING_DARK],
  heatmapGradient: [...PALETTE_SEQUENTIAL_DARK],
  axisLineColor: '#2a2d3a',
  borderColor: '#2a2d3a',
  borderOpacity: 0.55,
  tickColor: '#8a8e9c',
  axisLabelColor: '#8a8e9c',
  crosshairColor: '#a0a5b8',
  tooltipBackground: 'rgba(20, 23, 32, 0.96)',
  tooltipTextColor: '#e8e8eb',
  tooltipBorderColor: 'rgba(255, 255, 255, 0.1)',
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

/**
 * Minimum clearance between the outermost glyph (axis title, tick label)
 * and the canvas edge (CSS pixels). Hosts routinely place the canvas flush
 * against a card border, so text drawn at the very edge reads as touching
 * the frame of the surrounding UI.
 */
export const EDGE_MARGIN = 8;

/** Default length of the short marks that connect tick labels to axis positions. */
export const AXIS_TICK_LENGTH = 4;

/** Clear space between the end of a tick mark and its label. */
export const AXIS_LABEL_GAP = 4;

/** Clear space between the tick-label strip and an axis title. */
export const AXIS_TITLE_GAP = 8;

/** Minimum clear space between labels belonging to perpendicular axes. */
export const AXIS_CORNER_GAP = 4;

/** Default tick count target */
export const DEFAULT_TICK_COUNT = 6;

/** Default tooltip offset from cursor (CSS pixels) */
export const TOOLTIP_OFFSET = 12;

/** Minimum drag distance before zoom/selection activates (CSS pixels) */
export const MIN_DRAG_DISTANCE = 10;

/** Grab zone around a brush-selection edge for resize vs move (CSS pixels) */
export const BRUSH_EDGE_GRAB_PX = 8;

/** Default zoom fraction per max wheel/pinch tick (10 % per tick). */
export const DEFAULT_WHEEL_STEP = 0.1;

/** Auto-range Y padding as fraction of range */
export const AUTO_RANGE_PADDING = 0.05;

/**
 * The pad a scatter cloud gets before nice rounding: a marker on a nice value would otherwise sit
 * half outside the plot.
 */
export const CLOUD_EDGE_PADDING = 0.02;

/** Default long-press duration (ms) before opt-in touch selection */
export const DEFAULT_LONG_PRESS_MS = 400;

/** Default tap timeout (ms), max time for a press to count as a tap */
export const TAP_TIMEOUT = 300;

/** The most scatter points drawn per frame while the viewport is changing. */
export const DEFAULT_INTERACTION_SAMPLING = 10_000;
/**
 * The gesture budget of a scatter culled by X (and of any scatter after a touch or pen) scales
 * with the plot's CSS width: max(400, 1.5 × width) in-view points (plan §3.4); settled rendering
 * stays full fidelity.
 */
export const TOUCH_INTERACTION_POINTS_PER_PIXEL = 1.5;
export const MIN_TOUCH_INTERACTION_SAMPLING = 400;

/** Quiet period (ms) after the last viewport change before the crisp repaint */
export const INTERACTION_REFINE_MS = 150;

/** Double-tap timeout (ms), max time between two taps */
export const DOUBLE_TAP_TIMEOUT = 300;

/** Mouse hit-test radius (CSS pixels) */
export const MOUSE_HIT_RADIUS = 32;

/** Touch hit-test radius (CSS pixels). WCAG 2.5.5 calls for ≥44px tap targets. */
export const TOUCH_HIT_RADIUS = 44;
