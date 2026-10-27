/**
 * The keys every option object accepts, and the hints an unknown key gets:
 * the 0.12 options 1.0 removed (arch-15), each with its replacement, and
 * names from other libraries. normalize() checks options against them.
 */
import type { SeriesType } from './types';

// ─── Option keys ─────────────────────────────────────────────────────

export type Keys = ReadonlySet<string>;
export const keys = (...names: string[]): Keys => new Set(names);

export const CALLBACKS = [
  'onPointClick',
  'onSelectionChange',
  'onViewportChange',
  'onHiddenSeriesChange',
  'onHighlightChange',
  'onFollowingChange',
  'onCursorChange',
] as const;
export type CallbackKey = (typeof CALLBACKS)[number];

export const TOP = keys(
  'data',
  'x',
  'rowId',
  'series',
  'axes',
  'streaming',
  'referenceLines',
  'referenceRegions',
  'plugins',
  'group',
  'ariaLabel',
  'height',
  'interaction',
  'cursor',
  'highlight',
  'tooltip',
  'theme',
  'legend',
  'locale',
  'timeZone',
  'viewport',
  'selection',
  'hiddenSeries',
  ...CALLBACKS,
);
export const SERIES = keys(
  'id',
  'label',
  'type',
  'data',
  'x',
  'y',
  'rowId',
  'xAxis',
  'yAxis',
  'color',
  'dash',
  'lineWidth',
  'opacity',
  'pointRadius',
  'interpolation',
  'spanGaps',
  'lower',
  'upper',
  'renderMode',
  'fill',
  'format',
  'colorBy',
  'sizeBy',
  'tooltipFields',
);
export const AXIS = keys(
  'type',
  'title',
  'min',
  'max',
  'position',
  'nice',
  'ticks',
  'grid',
  'format',
  'categories',
);
export const STREAMING = keys('maxPoints', 'followWindow');
export const INTERACTION = keys('zoom', 'drag', 'bounds');
export const TOOLTIP = keys('mode', 'distance', 'render');
export const THEME_TOKENS = keys(
  'mode',
  'surface',
  'text',
  'muted',
  'accent',
  'categorical',
  'sequential',
  'diverging',
  'fontFamily',
  'fontSize',
);
export const LEGEND = keys('position');
export const LINE = keys('axis', 'value', 'label', 'color', 'dash', 'lineWidth');
export const REGION = keys('axis', 'from', 'to', 'label', 'color', 'opacity');
export const COLOR_BY = keys('field', 'type', 'palette', 'domain', 'label', 'format');
export const SIZE_BY = keys('field', 'range', 'label', 'format');
export const TOOLTIP_FIELD = keys('field', 'label', 'format');
export const SELECTION = keys('x', 'y');

/**
 * Hints for keys that are not options: the 0.12 options 1.0 removed (arch-15)
 * and names from other libraries, each with what to use instead. A key is
 * looked up by its full path (`axes.y.roundBounds`), then by its path with the
 * axis key or series index generalised (`axes.*.roundBounds`, `series.*.stroke`),
 * then by its name.
 */
export const HINTS: Record<string, string> = {
  // Top level.
  width: 'Removed in 1.0: size the container with CSS; the chart follows it.',
  autoResize: 'Removed in 1.0: charts always follow their container.',
  padding: 'Removed in 1.0: the gutters are measured from the axis labels.',
  zoom: "Removed in 1.0: use interaction: { zoom: 'x' | 'xy' | 'none', bounds }.",
  'zoom.onZoom': 'Observe zoom with onViewportChange.',
  pan: "Removed in 1.0: use interaction: { drag: 'pan' }; panning follows interaction.zoom.",
  touch: "Removed in 1.0: use interaction: { drag: 'pan' | 'select' }.",
  performance: 'Removed in 1.0: sampling during gestures is automatic.',
  debug: 'Removed in 1.0.',
  onSelect: 'Removed in 1.0: use onSelectionChange.',
  // Axes.
  'axes.*.roundBounds': 'Use nice.',
  'axes.*.rangePadding': 'Removed in 1.0: set min and max for a fixed domain.',
  'axes.*.auto': 'Removed in 1.0.',
  'axes.*.tickCount': 'Removed in 1.0: use ticks for explicit values.',
  'axes.*.tickMarks': 'Removed in 1.0.',
  // Series.
  'series.*.stroke': 'Use color.',
  'series.*.lineDash': 'Use dash.',
  'series.*.fillGradient': 'Removed in 1.0.',
  'series.*.barWidthRatio': 'Removed in 1.0.',
  'series.*.pointShape': 'Removed in 1.0.',
  'series.*.heatmap': "Use renderMode: 'density'.",
  'series.*.heatmapBinSize': 'Removed in 1.0.',
  'series.*.heatmapGradient': "Removed in 1.0: density uses the theme's sequential ramp.",
  'series.*.visible': 'Use hiddenSeries.',
  'series.*.meta': 'Removed in 1.0: keep it in your own map by series id.',
  'series.*.colorBy.nullColor': 'Removed in 1.0: missing values take the series colour.',
  'series.*.sizeBy.scale': 'Removed in 1.0: point area is proportional to the value.',
  'series.*.sizeBy.domain': 'Removed in 1.0: the size domain runs from zero to the largest value.',
  // Annotations.
  'referenceRegions.*.fill': 'Use color.',
  'referenceRegions.*.edges': 'Removed in 1.0.',
  'referenceRegions.*.edgeColor': 'Removed in 1.0.',
  'referenceRegions.*.edgeDash': 'Removed in 1.0.',
  // Tooltip.
  'tooltip.show': 'Use tooltip: false.',
  'tooltip.offset': 'Removed in 1.0: the tooltip places itself.',
  'tooltip.xFormat': 'Use axes.x.format.',
  'tooltip.yFormat': 'Use the series format or axes.y.format.',
  'tooltip.rangeFormat': 'Use axes.x.format.',
  // Theme roles of 0.12, by the token that replaces them.
  'theme.backgroundColor': 'Use surface.',
  'theme.textColor': 'Use text.',
  'theme.axisLabelColor': 'Use muted.',
  'theme.palette': 'Use categorical.',
  'theme.categoricalPalette': 'Use categorical.',
  'theme.sequentialPalette': 'Use sequential.',
  'theme.divergingPalette': 'Use diverging.',
  'theme.heatmapGradient': 'Use sequential.',
  'theme.crosshairColor': 'Use accent.',
  'theme.tooltipBackground': 'Use surface.',
  'theme.tooltipTextColor': 'Use text.',
  'theme.gridColor': 'Removed in 1.0: grid lines derive from text and surface.',
  'theme.gridOpacity': 'Removed in 1.0: grid lines derive from text and surface.',
  'theme.axisLineColor': 'Removed in 1.0: axis lines derive from text and surface.',
  'theme.borderColor': 'Removed in 1.0: borders derive from text and surface.',
  'theme.borderOpacity': 'Removed in 1.0: borders derive from text and surface.',
  'theme.tickColor': 'Removed in 1.0: ticks derive from text and surface.',
  'theme.tooltipBorderColor': 'Removed in 1.0: the tooltip border derives from text and surface.',
  // Other libraries.
  maxLen: 'Use streaming.maxPoints.',
  follow: 'Use streaming.followWindow.',
  tickFormat: 'Use format.',
  label: 'Axes take title.',
  syncKey: 'Link charts with createChartGroup().',
};

/** The removed 0.12 values of object-or-value options, with what to use instead. */
export const REMOVED_VALUES: Record<string, string> = {
  cursor:
    "cursor takes true or false; its 0.12 options were removed (the Y line is automatic with interaction: { zoom: 'xy' }).",
  highlight:
    'highlight takes a series id or null; its 0.12 options were removed (legend hover dims the other series).',
  selection:
    "selection takes { x: [from, to] } or null; brush with interaction: { drag: 'select' }.",
  grid: 'grid takes true or false; grid lines are styled by the theme.',
};

export const SERIES_TYPES: readonly SeriesType[] = [
  'line',
  'area',
  'band',
  'bar',
  'scatter',
  'histogram',
];
export const AXIS_TYPES = ['linear', 'log', 'time', 'category'] as const;
export const INTERPOLATIONS = ['linear', 'monotone', 'step-before', 'step-after', 'step-middle'];
export const RENDER_MODES = ['points', 'density', 'auto'];
export const POSITIONS = ['top', 'bottom', 'left', 'right'];
export const DATE_KEYS = keys(
  'dateStyle',
  'timeStyle',
  'weekday',
  'era',
  'year',
  'month',
  'day',
  'dayPeriod',
  'hour',
  'minute',
  'second',
  'fractionalSecondDigits',
  'timeZoneName',
  'hour12',
  'hourCycle',
);
