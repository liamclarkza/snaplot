/**
 * The heatmap's colours: its map's stops from the theme (or the series' own), a 256-entry lookup
 * table of packed pixels, the domain the map spans, and the colour of an empty cell. A leaf module:
 * the colour-scale legend and the hit half read it too.
 */
import type { ChartCore } from '../../Engine';
import type { HeatmapSpec, ThemeConfig } from '../../spec';
import { cssColor, opaqueColorOnBackground, parseColor } from '../../theme/color';

/** The size of a colour map's lookup table. */
export const LUT_SIZE = 256;

/** A heatmap's map, ready to colour cells: packed pixels and the domain they span. */
export interface ColorMapping {
  /** `LUT_SIZE` packed pixels, low to high. */
  readonly lut: Uint32Array;
  /** The packed pixel of an empty cell (null or NaN). */
  readonly empty: number;
  /** The stops' CSS colours (the legend's gradient), and the empty cell's. */
  readonly stops: readonly string[];
  readonly emptyColor: string;
  /** The values at the two ends of the map. */
  readonly min: number;
  readonly max: number;
  /** Values past the domain wrap (a cyclic map). */
  readonly cyclic: boolean;
  /** Values past the domain take the end colours, else they are undrawn. */
  readonly clamp: boolean;
}

/** Whether the platform stores a Uint32's lowest byte first (every browser in practice). */
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

/** One ImageData pixel as a Uint32 over its bytes, opaque unless `alpha` says otherwise. */
export function packPixel(r: number, g: number, b: number, alpha = 255): number {
  return LITTLE_ENDIAN
    ? ((alpha << 24) | (b << 16) | (g << 8) | r) >>> 0
    : ((r << 24) | (g << 16) | (b << 8) | alpha) >>> 0;
}

/** The map's stops, low to high: the theme's ramp by name, or the series' own. */
export function mapStops(spec: HeatmapSpec, theme: ThemeConfig): readonly string[] {
  const colors = spec.colors;
  if (typeof colors !== 'string') return colors;
  const ramp =
    colors === 'cyclic'
      ? theme.cyclicPalette
      : colors === 'diverging'
        ? theme.divergingPalette
        : (theme.sequentialPalette ?? theme.heatmapGradient);
  return ramp && ramp.length > 0 ? ramp : ['#000000', '#ffffff'];
}

/**
 * The lookup table of `stops`: `LUT_SIZE` colours interpolated in sRGB, evenly spaced. A cyclic
 * map interpolates its last stop back into its first, so both ends of the table meet.
 */
export function buildLut(stops: readonly string[], cyclic: boolean): Uint32Array {
  const rgb = stops.map((stop) => {
    const c = parseColor(stop);
    return c ? [c.r, c.g, c.b] : [0, 0, 0];
  });
  if (rgb.length === 0) rgb.push([0, 0, 0]);
  if (cyclic) rgb.push(rgb[0]);
  const lut = new Uint32Array(LUT_SIZE);
  const segments = Math.max(1, rgb.length - 1);
  for (let i = 0; i < LUT_SIZE; i++) {
    // A cyclic table stops one step short of the full turn: its next entry would be entry 0.
    const t = cyclic ? i / LUT_SIZE : i / (LUT_SIZE - 1);
    const scaled = t * segments;
    const k = Math.min(segments - 1, Math.floor(scaled));
    const f = rgb.length === 1 ? 0 : scaled - k;
    const a = rgb[k];
    const b = rgb[Math.min(rgb.length - 1, k + 1)];
    lut[i] = packPixel(
      Math.round(a[0] + (b[0] - a[0]) * f),
      Math.round(a[1] + (b[1] - a[1]) * f),
      Math.round(a[2] + (b[2] - a[2]) * f),
    );
  }
  return lut;
}

/**
 * The extent of a heatmap's values: every bin column of its source over the rows it holds, or
 * null when it has no value. Read once per data version.
 */
export function valueExtent(
  engine: ChartCore,
  seriesIndex: number,
): readonly [number, number] | null {
  const series = engine.config.series[seriesIndex];
  const spec = series.heatmap!;
  const store = engine.storeForSeries(seriesIndex);
  const first = series.yColumn ?? 1;
  const bins = spec.binLo.length;
  const key = `heatmap:${engine.sourceStores.indexOf(store)}:${first}:${bins}`;
  const cached = engine.columnExtents.get(key);
  if (cached && cached.version === engine.dataVersion) return cached.range;
  let min = Infinity;
  let max = -Infinity;
  const segments = store.length > 0 ? store.getSegments(0, store.length - 1) : [];
  for (let b = 0; b < bins && first + b <= store.seriesCount; b++) {
    const column = store.getPhysicalColumn(first + b);
    for (const segment of segments) {
      for (let i = segment.physicalStart; i <= segment.physicalEnd; i++) {
        const v = column[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }
  const range: [number, number] | null = min <= max ? [min, max] : null;
  engine.columnExtents.set(key, { version: engine.dataVersion, range });
  return range;
}

/** The domain a heatmap's map spans: its own, else its values' extent (symmetric for diverging). */
export function mapDomain(engine: ChartCore, seriesIndex: number): readonly [number, number] {
  const spec = engine.config.series[seriesIndex].heatmap!;
  if (spec.domain) return spec.domain;
  const extent = valueExtent(engine, seriesIndex) ?? [0, 1];
  if (spec.colors === 'diverging') {
    const reach = Math.max(Math.abs(extent[0]), Math.abs(extent[1])) || 1;
    return [-reach, reach];
  }
  return extent[0] === extent[1] ? [extent[0] - 0.5, extent[1] + 0.5] : extent;
}

/** The colour of an empty cell: the series' own, else the muted text faintly over the surface. */
export function emptyColorOf(spec: HeatmapSpec, theme: ThemeConfig): string {
  if (spec.emptyColor) return spec.emptyColor;
  const surface = theme.surfaceColor ?? theme.backgroundColor;
  return opaqueColorOnBackground(
    theme.tickColor,
    0.14,
    surface === 'transparent' ? '#ffffff' : surface,
  );
}

/** Per-chart mappings, rebuilt only when the stops, empty colour or domain change. */
const mappings = new WeakMap<ChartCore, Map<number, { key: string; mapping: ColorMapping }>>();

/** The colour mapping of heatmap series `seriesIndex`, for the current theme and data. */
export function colorMapping(engine: ChartCore, seriesIndex: number): ColorMapping {
  const spec = engine.config.series[seriesIndex].heatmap!;
  const stops = mapStops(spec, engine.theme).map((stop) => engine.resolveColor(stop));
  const emptyColor = engine.resolveColor(emptyColorOf(spec, engine.theme));
  const [min, max] = mapDomain(engine, seriesIndex);
  const cyclic = spec.colors === 'cyclic';
  const key = `${stops.join(',')}|${emptyColor}|${min}|${max}|${cyclic}|${spec.clamp}`;
  let byChart = mappings.get(engine);
  if (!byChart) mappings.set(engine, (byChart = new Map()));
  const cached = byChart.get(seriesIndex);
  if (cached?.key === key) return cached.mapping;
  const empty = parseColor(emptyColor);
  const mapping: ColorMapping = {
    lut: buildLut(stops, cyclic),
    empty: empty ? packPixel(empty.r, empty.g, empty.b, Math.round(empty.a * 255)) : 0,
    stops,
    emptyColor,
    min,
    max,
    cyclic,
    clamp: spec.clamp,
  };
  byChart.set(seriesIndex, { key, mapping });
  return mapping;
}

/**
 * The packed pixel of `value`: the empty colour for NaN, 0 (undrawn) for a value past an
 * unclamped domain, else its place on the map; a cyclic map wraps.
 */
export function pixelOf(mapping: ColorMapping, value: number, scale: number): number {
  if (value !== value) return mapping.empty;
  let t = (value - mapping.min) * scale;
  if (mapping.cyclic) t -= Math.floor(t);
  else if (t < 0 || t > 1) {
    if (!mapping.clamp) return 0;
    t = t < 0 ? 0 : 1;
  }
  const index = mapping.cyclic ? (t * LUT_SIZE) | 0 : (t * (LUT_SIZE - 1) + 0.5) | 0;
  return mapping.lut[index >= LUT_SIZE ? index - LUT_SIZE : index];
}

/** The CSS colour of `value` on the map (the tooltip swatch), or the empty colour. */
export function colorOf(mapping: ColorMapping, value: number): string {
  const span = mapping.max - mapping.min;
  const pixel = pixelOf(mapping, value, span === 0 ? 0 : 1 / span);
  if (pixel === 0) return mapping.emptyColor;
  const bytes = new Uint8Array(new Uint32Array([pixel]).buffer);
  const [r, g, b] = LITTLE_ENDIAN ? [bytes[0], bytes[1], bytes[2]] : [bytes[3], bytes[2], bytes[1]];
  return cssColor({ r, g, b, a: 1 });
}
