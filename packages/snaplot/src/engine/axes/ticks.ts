/**
 * Axis ticks: the tick values of an axis (explicit or generated), the even thinning of a
 * category tick list, and the bar and histogram X ticks taken from the data.
 */
import type { AxisSpec, Scale } from '../spec';
import { DEFAULT_TICK_COUNT } from '../../constants';
import type { ChartCore } from '../Engine';
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
 */
export function thinTicks(values: number[], maxCount: number, preserveEnds = false): number[] {
  const max = Math.max(2, Math.floor(maxCount));
  if (values.length <= max) return values;
  let step = Math.ceil(values.length / max);
  if (preserveEnds) {
    // Select a stride that divides the full sequence: appending the last tick
    // afterwards would create a shorter, misleading interval at the edge.
    const intervals = values.length - 1;
    step = Math.ceil(intervals / (max - 1));
    while (intervals % step !== 0) step++;
  }
  return values.filter((_, i) => i % step === 0);
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

  // User-provided formatter on the X axis wins over the default numeric
  // one for categorical bar / histogram charts.
  const xAxisCfg = engine.config.axes?.x;
  const userFormat = xAxisCfg?.format;
  const defaultFormat = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

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
    return { values: edgeValues, format: userFormat ?? defaultFormat };
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
      format: userFormat ?? defaultFormat,
    };
  }

  // Bar chart: tick at each category X value
  const barSeries = visibleSeries.find((s) => markOf(s).draw.x === 'slot');
  if (barSeries && engine.hasData()) {
    const values = thinTicks(axisMarkCoordinates(engine, 'slot'), maxCategoryTicks);
    return { values, format: userFormat ?? defaultFormat };
  }

  return undefined;
}
