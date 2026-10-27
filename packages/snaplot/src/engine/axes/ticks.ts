/**
 * Axis ticks: the tick values of an axis (explicit or generated), the even thinning of a
 * category tick list, and the bar and histogram X ticks taken from the data.
 */
import type { AxisSpec, Scale } from '../spec';
import { DEFAULT_TICK_COUNT } from '../../constants';
import type { ChartCore } from '../Engine';
import { formatTick } from '../format';
import { markOf } from '../marks/index';

/**
 * Tick values for an axis: explicit `ac.ticks` (clamped to the visible
 * domain) beat generated ticks at the `ac.tickCount` density. Shared by
 * the renderer and layout measurement so gutters match the labels drawn.
 */
export function axisTickValues(scale: Scale, ac: AxisSpec): number[] {
  if (ac.ticks && ac.ticks.length > 0) {
    const lo = Math.min(scale.min, scale.max);
    const hi = Math.max(scale.min, scale.max);
    return ac.ticks.filter((t) => Number.isFinite(t) && t >= lo && t <= hi);
  }
  return scale.ticks(ac.tickCount ?? DEFAULT_TICK_COUNT);
}

/**
 * Evenly thin a category tick list to at most `maxCount` entries. Bar and
 * histogram charts tick every category by default, which smears into an
 * unreadable band once categories outnumber the pixels available for
 * labels (a year of daily bars). Keeps the first entry and every nth after.
 * `preserveEnds` prefers a stride that divides the list, so the last entry
 * stays too, while that keeps three entries (a prime interval count would
 * otherwise collapse to its two ends).
 */
export function thinTicks(values: number[], maxCount: number, preserveEnds = false): number[] {
  const max = Math.max(2, Math.floor(maxCount));
  if (values.length <= max) return values;
  let step = Math.ceil(values.length / max);
  if (preserveEnds) {
    const intervals = values.length - 1;
    let dividing = Math.ceil(intervals / (max - 1));
    while (intervals % dividing !== 0) dividing++;
    if (intervals / dividing >= 2) step = dividing;
  }
  return values.filter((_, i) => i % step === 0);
}

/**
 * The indices of the ticks whose labels fit along an axis: every `stride`-th tick from the first,
 * at the smallest stride where neighbouring labels keep `gap` pixels between their boxes and never
 * read the same. `extent(i)` is label i's [start, end] along the axis as it will be placed (edge
 * labels clamped into the container). With `preserveEnds`, a stride that also keeps the last tick
 * wins when it is at most twice the smallest and keeps three labels. When no stride fits, each tick
 * that clears the last one kept stays.
 */
export function fitTicks(
  count: number,
  extent: (index: number) => readonly [number, number],
  text: (index: number) => string,
  gap: number,
  preserveEnds = false,
): number[] {
  if (count <= 1) return count === 1 ? [0] : [];
  const extents = Array.from({ length: count }, (_, i) => extent(i));
  const texts = Array.from({ length: count }, (_, i) => text(i));
  const fits = (stride: number) => {
    for (let i = stride; i < count; i += stride) {
      const [a0, a1] = extents[i - stride];
      const [b0, b1] = extents[i];
      if (Math.max(a0, b0) < Math.min(a1, b1) + gap || texts[i] === texts[i - stride]) {
        return false;
      }
    }
    return true;
  };
  let stride = 1;
  while (stride < count && !fits(stride)) stride++;
  if (stride >= count) {
    // No even stride fits (irregular ticks, such as sparse bars): keep each tick that clears the
    // last one kept.
    const kept = [0];
    for (let i = 1; i < count; i++) {
      const [a0, a1] = extents[kept[kept.length - 1]];
      const [b0, b1] = extents[i];
      if (Math.max(a0, b0) >= Math.min(a1, b1) + gap && texts[i] !== texts[kept[kept.length - 1]])
        kept.push(i);
    }
    return kept;
  }
  if (preserveEnds && (count - 1) % stride !== 0) {
    for (let d = stride + 1; d <= stride * 2 && (count - 1) / d >= 2; d++) {
      if ((count - 1) % d === 0 && fits(d)) {
        stride = d;
        break;
      }
    }
  }
  const out: number[] = [];
  for (let i = 0; i < count; i += stride) out.push(i);
  return out;
}

export type CustomXTicks = {
  values: number[];
  gridValues?: number[];
  format?: (value: number) => string;
};

/** The X values of the visible slot (bar) or bin (histogram) series on the X axis, sorted. */
export function axisMarkCoordinates(engine: ChartCore, x: 'slot' | 'bin'): number[] {
  const stores = new Set(
    engine.config.series.flatMap((series, si) =>
      series.visible !== false && markOf(series).draw.x === x && (series.xAxis ?? 'x') === 'x'
        ? [engine.storeForSeries(si)]
        : [],
    ),
  );
  if (stores.size === 1) return Array.from([...stores][0].x);
  return [...new Set([...stores].flatMap((store) => Array.from(store.x)))].sort((a, b) => a - b);
}

export function computeCustomXTicks(engine: ChartCore): CustomXTicks | undefined {
  const visibleSeries = engine.config.series.filter((s) => s.visible !== false);

  // The X axis' format wins over the default slot label (engine/format.ts) for bar and
  // histogram ticks.
  const xAxisCfg = engine.config.axes?.x;
  const format = (v: number) => formatTick(engine, 'x', v, 'slot');

  // Category ticks are capped to what the plot width can label legibly
  // (and to an explicit axes.x.tickCount when set): a year of daily bars
  // used to tick every day, smearing labels and gridlines into a band.
  const maxCategoryTicks = Math.min(
    Math.max(2, Math.floor(engine.layout.plot.width / 65)),
    xAxisCfg?.tickCount ?? Number.POSITIVE_INFINITY,
  );

  // Histogram: X data = bin edges, use them as tick values
  const histSeries = visibleSeries.find((s) => markOf(s).draw.x === 'bin');
  if (histSeries && engine.hasData()) {
    // X column contains bin edges directly (pre-computed by user)
    const edgeValues = thinTicks(axisMarkCoordinates(engine, 'bin'), maxCategoryTicks);
    return { values: edgeValues, format };
  }

  const xScale = engine.scales.get('x');
  const barPlan = xScale ? engine.barXAxisPlans.get('x') : undefined;
  const hasVisibleBar = visibleSeries.some((series) => markOf(series).draw.x === 'slot');
  if (
    barPlan &&
    hasVisibleBar &&
    xScale?.type === 'linear' &&
    Math.abs(xScale.min - barPlan.domainMin) <=
      Math.abs(barPlan.domainMax - barPlan.domainMin) * 1e-12 &&
    Math.abs(xScale.max - barPlan.domainMax) <=
      Math.abs(barPlan.domainMax - barPlan.domainMin) * 1e-12 &&
    xAxisCfg?.nice !== false &&
    (!xAxisCfg?.ticks || xAxisCfg.ticks.length === 0) &&
    xAxisCfg?.min === undefined &&
    xAxisCfg?.max === undefined
  ) {
    return {
      values: barPlan.values,
      gridValues: barPlan.gridValues,
      format,
    };
  }

  // Bar chart: tick at each category X value. On a time axis with more bars than labels fit,
  // the calendar ticks read better than every nth bar (sparse, irregular bars land anywhere).
  const barSeries = visibleSeries.find((s) => markOf(s).draw.x === 'slot');
  if (barSeries && engine.hasData()) {
    const coordinates = axisMarkCoordinates(engine, 'slot');
    if (xScale?.type === 'time' && coordinates.length > maxCategoryTicks) return undefined;
    const values = thinTicks(coordinates, maxCategoryTicks);
    return { values, format };
  }

  return undefined;
}
