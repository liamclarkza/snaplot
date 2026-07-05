import type {
  ScatterColorEncoding,
  ScatterSizeEncoding,
  ScatterTooltipField,
  SeriesConfig,
  TooltipFieldValue,
} from '../types';

export interface IndexRange {
  startIdx: number;
  endIdx: number;
}

export interface ScatterPalettes {
  categorical: string[];
  sequential?: string[];
  diverging?: string[];
}

export interface ScatterStyleResolver {
  variableColor: boolean;
  variableRadius: boolean;
  colorAt(index: number): string;
  radiusAt(index: number): number;
  /**
   * Fast path for render loops: a small-integer color bin per point
   * (category index, or a quantized position on the continuous ramp).
   * -1 means "missing value", which maps to the null/fallback color.
   * Bins avoid the per-point string building that colorAt() implies.
   */
  colorBinAt(index: number): number;
  /** Color for a bin from colorBinAt. Cached; safe to call per point. */
  colorForBin(bin: number): string;
  /**
   * Largest radius radiusAt can return (the size range's upper bound, or the
   * fixed fallback radius). The render loop needs it to size the off-screen
   * cull margin so a large edge-straddling bubble is not dropped.
   */
  maxRadius: number;
}

/** Bin count for continuous ramps in the fast path; 64 steps are visually smooth. */
const CONTINUOUS_COLOR_BINS = 64;

/**
 * Everything derived from a scan of the encoded columns: domains, category
 * maps, palettes. Expensive to build (O(n) per encoded column), cheap to
 * consume. Charts cache one per series per data version and derive
 * resolvers over different index spaces (render uses physical indices,
 * hit-testing logical ones) from the same state.
 */
export interface ScatterEncodingState {
  colorBy: ScatterColorEncoding | null;
  sizeBy: ScatterSizeEncoding | null;
  colorState: ColorState | null;
  sizeState: SizeState | null;
  fallbackColor: string;
  fallbackRadius: number;
}

export function scatterXDataIndex(series: SeriesConfig): number {
  return series.type === 'scatter' ? (series.xDataIndex ?? 0) : 0;
}

export function seriesYDataIndex(series: SeriesConfig): number {
  return series.type === 'scatter'
    ? (series.yDataIndex ?? series.dataIndex ?? -1)
    : (series.dataIndex ?? -1);
}

export function normalizeScatterColorBy(
  colorBy: SeriesConfig['colorBy'],
): ScatterColorEncoding | null {
  if (typeof colorBy === 'number') return { dataIndex: colorBy, type: 'auto' };
  return colorBy ?? null;
}

export function normalizeScatterSizeBy(
  sizeBy: SeriesConfig['sizeBy'],
): ScatterSizeEncoding | null {
  if (typeof sizeBy === 'number') return { dataIndex: sizeBy };
  return sizeBy ?? null;
}

export function normalizeScatterTooltipField(
  field: number | ScatterTooltipField,
): ScatterTooltipField {
  return typeof field === 'number' ? { dataIndex: field } : field;
}

export function formatScatterValue(value: number): string {
  if (value !== value) return '';
  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value)) return String(value);
  const abs = Math.abs(value);
  if ((abs !== 0 && abs < 0.001) || abs >= 10_000) return value.toPrecision(4);
  return value.toFixed(4).replace(/\.?0+$/, '');
}

export function scatterTooltipFields(
  series: SeriesConfig,
  index: number,
  columnCount: number,
  valueAt: (columnIdx: number, index: number) => number,
): TooltipFieldValue[] | undefined {
  const fields: ScatterTooltipField[] = [];

  const colorBy = normalizeScatterColorBy(series.colorBy);
  if (colorBy) fields.push(colorBy);

  const sizeBy = normalizeScatterSizeBy(series.sizeBy);
  if (sizeBy) fields.push(sizeBy);

  for (const field of series.tooltipFields ?? []) {
    fields.push(normalizeScatterTooltipField(field));
  }

  if (fields.length === 0) return undefined;

  const out: TooltipFieldValue[] = [];
  const seen = new Set<number>();
  for (const field of fields) {
    if (field.dataIndex < 0 || field.dataIndex >= columnCount || seen.has(field.dataIndex)) {
      continue;
    }
    seen.add(field.dataIndex);
    const value = valueAt(field.dataIndex, index);
    out.push({
      label: field.label ?? `col ${field.dataIndex}`,
      value,
      formatted: field.format ? field.format(value) : formatScatterValue(value),
    });
  }

  return out.length > 0 ? out : undefined;
}

export function buildScatterEncodingState(params: {
  series: SeriesConfig;
  fallbackColor: string;
  fallbackRadius: number;
  palettes: ScatterPalettes;
  columnCount: number;
  ranges: IndexRange[];
  valueAt: (columnIdx: number, index: number) => number;
}): ScatterEncodingState {
  const { series, fallbackColor, fallbackRadius, palettes, columnCount, ranges, valueAt } = params;

  const colorBy = normalizeScatterColorBy(series.colorBy);
  const colorValid = !!colorBy && colorBy.dataIndex >= 0 && colorBy.dataIndex < columnCount;
  const sizeBy = normalizeScatterSizeBy(series.sizeBy);
  const sizeValid = !!sizeBy && sizeBy.dataIndex >= 0 && sizeBy.dataIndex < columnCount;

  return {
    colorBy: colorValid ? colorBy : null,
    sizeBy: sizeValid ? sizeBy : null,
    colorState: colorValid
      ? buildColorState(colorBy, ranges, valueAt, palettes, fallbackColor)
      : null,
    sizeState: sizeValid ? buildSizeState(sizeBy, ranges, valueAt) : null,
    fallbackColor,
    fallbackRadius,
  };
}

export function resolverFromEncodingState(
  state: ScatterEncodingState,
  valueAt: (columnIdx: number, index: number) => number,
): ScatterStyleResolver {
  const { colorBy, sizeBy, colorState, sizeState, fallbackColor, fallbackRadius } = state;

  // Per-bin color cache: bins are stable for the resolver's lifetime, so
  // gradient sampling and palette lookups happen once per bin, not per point.
  const binColors = new Map<number, string>();

  const colorForBin = (bin: number): string => {
    if (!colorState || !colorBy || bin < 0) return colorBy?.nullColor ?? fallbackColor;
    const cached = binColors.get(bin);
    if (cached !== undefined) return cached;

    let color: string;
    if (colorState.type === 'category') {
      color = colorState.palette[bin % colorState.palette.length] ?? fallbackColor;
    } else {
      const t = bin / (CONTINUOUS_COLOR_BINS - 1);
      color = sampleGradientRgb(colorState.rgbStops, t);
    }
    binColors.set(bin, color);
    return color;
  };

  const colorBinAt = (index: number): number => {
    if (!colorState || !colorBy) return -1;
    const value = valueAt(colorBy.dataIndex, index);
    if (!Number.isFinite(value)) return -1;
    if (colorState.type === 'category') {
      return colorState.categoryIndex.get(value) ?? -1;
    }
    const [min, max] = colorState.domain;
    const t = max === min ? 0.5 : (value - min) / (max - min);
    const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.round(clamped * (CONTINUOUS_COLOR_BINS - 1));
  };

  // radiusAt maps t in [0,1] onto [rMin, rMax], so the max marker radius is
  // the range upper bound (regardless of linear/sqrt) or the fixed fallback.
  const maxRadius = sizeState ? Math.max(sizeState.range[0], sizeState.range[1]) : fallbackRadius;

  return {
    variableColor: !!colorState,
    variableRadius: !!sizeState,
    maxRadius,
    colorBinAt,
    colorForBin,
    colorAt(index: number): string {
      if (!colorState || !colorBy) return fallbackColor;
      const value = valueAt(colorBy.dataIndex, index);
      if (!Number.isFinite(value)) return colorBy.nullColor ?? fallbackColor;

      if (colorState.type === 'category') {
        const idx = colorState.categoryIndex.get(value);
        if (idx === undefined) return colorBy.nullColor ?? fallbackColor;
        return colorState.palette[idx % colorState.palette.length] ?? fallbackColor;
      }

      const [min, max] = colorState.domain;
      const t = max === min ? 0.5 : (value - min) / (max - min);
      return sampleGradientRgb(colorState.rgbStops, Math.max(0, Math.min(1, t)));
    },
    radiusAt(index: number): number {
      if (!sizeState || !sizeBy) return fallbackRadius;
      const value = valueAt(sizeBy.dataIndex, index);
      if (!Number.isFinite(value)) return fallbackRadius;
      const [min, max] = sizeState.domain;
      const [rMin, rMax] = sizeState.range;
      let t = max === min ? 0.5 : (value - min) / (max - min);
      t = Math.max(0, Math.min(1, t));
      if (sizeState.scale === 'sqrt') t = Math.sqrt(t);
      return rMin + (rMax - rMin) * t;
    },
  };
}

export function createScatterStyleResolver(params: {
  series: SeriesConfig;
  fallbackColor: string;
  fallbackRadius: number;
  palettes: ScatterPalettes;
  columnCount: number;
  ranges: IndexRange[];
  valueAt: (columnIdx: number, index: number) => number;
}): ScatterStyleResolver {
  return resolverFromEncodingState(buildScatterEncodingState(params), params.valueAt);
}

type ColorState =
  | {
      type: 'category';
      palette: string[];
      categoryIndex: Map<number, number>;
      domain: [number, number];
    }
  | {
      type: 'continuous' | 'diverging';
      palette: string[];
      domain: [number, number];
      rgbStops: [number, number, number][];
    };

interface SizeState {
  domain: [number, number];
  range: [number, number];
  scale: 'linear' | 'sqrt';
}

function buildColorState(
  colorBy: ScatterColorEncoding,
  ranges: IndexRange[],
  valueAt: (columnIdx: number, index: number) => number,
  palettes: ScatterPalettes,
  fallbackColor: string,
): ColorState {
  const stats = scanColumn(colorBy.dataIndex, ranges, valueAt);
  const requestedType = colorBy.type ?? 'auto';
  const type = requestedType === 'auto'
    ? (stats.categoryValues.length > 0 && stats.categoryValues.length <= 12 && stats.allIntegers
        ? 'category'
        : 'continuous')
    : requestedType;

  if (type === 'category') {
    const rawPalette = colorBy.palette ?? palettes.categorical;
    const palette = rawPalette.length > 0 ? rawPalette : [fallbackColor];
    const categoryIndex = new Map<number, number>();
    const values = stats.categoryValues.length > 0 ? stats.categoryValues : [0];
    values.sort((a, b) => a - b);
    values.forEach((value, idx) => {
      categoryIndex.set(value, idx);
    });
    return {
      type: 'category',
      palette,
      categoryIndex,
      domain: [stats.min, stats.max],
    };
  }

  const rawPalette = colorBy.palette ??
    (type === 'diverging' ? palettes.diverging : palettes.sequential) ??
    palettes.categorical;
  const palette = rawPalette.length > 0 ? rawPalette : [fallbackColor];
  let domain = colorBy.domain ?? [stats.min, stats.max] as [number, number];
  if (type === 'diverging' && !colorBy.domain) {
    const maxAbs = Math.max(Math.abs(stats.min), Math.abs(stats.max), 1);
    domain = [-maxAbs, maxAbs];
  }
  if (!Number.isFinite(domain[0]) || !Number.isFinite(domain[1])) domain = [0, 1];
  return {
    type,
    palette,
    domain,
    rgbStops: palette.map(parseHex),
  };
}

function buildSizeState(
  sizeBy: ScatterSizeEncoding,
  ranges: IndexRange[],
  valueAt: (columnIdx: number, index: number) => number,
): SizeState {
  const stats = scanColumn(sizeBy.dataIndex, ranges, valueAt);
  let domain = sizeBy.domain ?? [stats.min, stats.max] as [number, number];
  if (!Number.isFinite(domain[0]) || !Number.isFinite(domain[1])) domain = [0, 1];
  return {
    domain,
    range: sizeBy.range ?? [2, 7],
    scale: sizeBy.scale ?? 'linear',
  };
}

function scanColumn(
  columnIdx: number,
  ranges: IndexRange[],
  valueAt: (columnIdx: number, index: number) => number,
): {
  min: number;
  max: number;
  allIntegers: boolean;
  categoryValues: number[];
} {
  let min = Infinity;
  let max = -Infinity;
  let allIntegers = true;
  const seen = new Set<number>();
  let categoryOverflow = false;

  for (const range of ranges) {
    for (let i = range.startIdx; i <= range.endIdx; i++) {
      const value = valueAt(columnIdx, i);
      if (!Number.isFinite(value)) continue;
      if (value < min) min = value;
      if (value > max) max = value;
      if (!Number.isInteger(value)) allIntegers = false;
      if (!categoryOverflow && seen.size <= 12) {
        seen.add(value);
        if (seen.size > 12) categoryOverflow = true;
      }
    }
  }

  return {
    min,
    max,
    allIntegers,
    categoryValues: categoryOverflow ? [] : Array.from(seen),
  };
}

/** Parse a #rrggbb or #rgb hex string into [r, g, b] 0-255. */
export function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0,
  ];
}

/**
 * Sample a multi-stop gradient at t in [0, 1]. Stops are spaced evenly;
 * interpolation is linear in sRGB.
 */
export function sampleGradient(stops: string[], t: number): string {
  if (stops.length === 0) return '#000000';
  if (stops.length === 1) return stops[0];
  return sampleGradientRgb(stops.map(parseHex), t);
}

/** sampleGradient over pre-parsed stops, for callers that sample repeatedly. */
function sampleGradientRgb(rgbStops: [number, number, number][], t: number): string {
  if (rgbStops.length === 0) return '#000000';
  if (rgbStops.length === 1) return rgbToHex(rgbStops[0]);
  const scaled = t * (rgbStops.length - 1);
  const i = Math.min(rgbStops.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const a = rgbStops[i];
  const b = rgbStops[i + 1];
  return rgbToHex([
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ]);
}

function rgbToHex(rgb: [number, number, number]): string {
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
