/**
 * The viewport: the axes a user or an app pinned and their ranges, live follow with its trailing
 * window, the zoom and pan math of the gestures, and the bounds a viewport is clamped to.
 */
import type { ChartCore } from './Engine';
import {
  type StreamingSpec,
  type Scale,
  type ChartSpec,
  type ScaleRange,
  DirtyFlag,
  type ZoomBoundsSpec,
} from './spec';
import { scaleSignature, autoRangeVertical, autoRangeHorizontal, columnRange } from './ranging';
import { inferPosition, isInPlotArea } from './layout';
import { seriesYColumn } from './marks/columns';
import { INTERACTION_REFINE_MS } from '../constants';
import { refreshCursor } from './cursor';
import { interactionSamplingBudget, markOf, xColumnOf } from './marks/index';

export function followWindow(engine: ChartCore): number | undefined {
  const follow = (engine.config.streaming as StreamingSpec | undefined)?.followWindow;
  if (follow === undefined) return undefined;
  // A non-positive window is meaningless; treat it as "no window" so the
  // chart follows the full extent rather than collapsing to a zero span.
  return follow > 0 ? follow : undefined;
}

/**
 * Pin every horizontal axis to `[latestX - window, latestX]` (clamped to
 * the data) and re-fit Y over that window. Returns whether any scale bound
 * moved (X or the follow-driven Y auto-range), so the caller knows if the
 * grid must repaint.
 *
 * This does not publish to zoom sync: a follow scroll is a local,
 * data-driven motion, and syncing it would fight peers that have their own
 * data or a paused viewport. Manual pan/zoom (applyViewportChange) and the
 * explicit resume actions (resetZoom/scrollToLatest) are what sync.
 */
export function applyFollowWindow(engine: ChartCore): boolean {
  const window = followWindow(engine);
  if (window === undefined || !engine.hasData()) return false;
  const before = scaleSignature(engine);
  const axisConfigs = engine.config.axes ?? {};
  const proposals: Array<{ key: string; scale: Scale; min: number; max: number }> = [];
  for (const [key, scale] of engine.scales) {
    const pos = inferPosition(key, axisConfigs[key]?.position);
    if (pos !== 'bottom' && pos !== 'top') continue;
    const extent = engine.sourceExtent(key);
    if (!extent) continue;
    // The window has its full width from the first sample (dxtrial-19).
    const lastX = extent[1];
    const min = lastX - window;
    const max = lastX;
    proposals.push({ key, scale, min, max });
  }
  for (const { key, scale, min, max } of proposals) {
    scale.min = min;
    scale.max = max;
    engine.naturalExtent.set(key, [min, max]);
  }
  if (!engine.config.zoom?.y) autoRangeVertical(engine, true);
  return scaleSignature(engine) !== before;
}

/**
 * A press on a following chart stops following and keeps the X window it shows, as a pan does,
 * so appends during the gesture do not move what is under the pointer (interact-14).
 */
export function pauseFollowing(engine: ChartCore): void {
  if (!engine.following) return;
  const axisConfigs = engine.config.axes ?? {};
  for (const key of engine.scales.keys()) {
    const pos = inferPosition(key, axisConfigs[key]?.position);
    if (pos === 'bottom' || pos === 'top') engine.userZoomedAxes.add(key);
  }
  setFollowing(engine, false);
}

/** Set follow state and emit `follow:change` only on a real transition. */
export function setFollowing(engine: ChartCore, next: boolean): void {
  if (engine.following === next) return;
  engine.following = next;
  engine.emitEvent('follow:change', next);
}

/**
 * Replaced data that does not reach a pinned horizontal range unpins that axis (plan D23,
 * dataapi-14): a viewport kept from the old data would show nothing.
 */
export function unpinMissedAxes(engine: ChartCore, config: ChartSpec): void {
  let unpinned = false;
  for (const key of [...engine.userZoomedAxes]) {
    const scale = engine.scales.get(key);
    const position = inferPosition(key, config.axes?.[key]?.position);
    if (!scale || (position !== 'bottom' && position !== 'top')) continue;
    let min = Infinity;
    let max = -Infinity;
    config.series.forEach((series, si) => {
      const store = engine.sourceStores[engine.seriesSources[si] ?? 0];
      if ((series.xAxis ?? 'x') !== key || !store?.length) return;
      const xColumn = xColumnOf(series);
      if (xColumn === 0) {
        min = Math.min(min, store.xAt(0));
        max = Math.max(max, store.xAt(store.length - 1));
        return;
      }
      // An unsorted scatter source keeps X in its own column, in row order.
      for (let i = 0; i < store.length; i++) {
        const x = store.valueAt(xColumn, i);
        if (x < min) min = x;
        if (x > max) max = x;
      }
    });
    if (min === Infinity || max < scale.min || min > scale.max) {
      engine.userZoomedAxes.delete(key);
      unpinned = true;
    }
  }
  if (unpinned && ![...engine.userZoomedAxes].some((key) => engine.isHorizontalAxis(key)))
    setFollowing(engine, true);
}

export function setAxis(engine: ChartCore, key: string, range: Partial<ScaleRange>): void {
  if (engine.destroyed) return;
  const scale = engine.scales.get(key);
  if (!scale) return;

  if (range.min !== undefined) scale.min = range.min;
  if (range.max !== undefined) scale.max = range.max;

  // A peer-applied viewport must survive the next data update the same way a
  // local zoom does. Without marking the axis user-zoomed, this receiving
  // chart's next data replacement or append would auto-range back to the full extent
  // and snap out of sync with the chart that drove the zoom.
  if (!engine.coordinatingAxis) engine.userZoomedAxes.add(key);

  // When X axis changes (e.g. from a zoom sync peer), re-fit Y axis
  // to the new visible X range, otherwise the band/data may clip.
  const ac = engine.config.axes?.[key];
  const pos = inferPosition(key, ac?.position);
  const isHoriz = pos === 'bottom' || pos === 'top';
  // A received horizontal viewport means a peer took manual control; pause
  // live-follow so this chart pins to the synced window instead of scrolling
  // its own follow window back over the driver on the next data tick.
  if (isHoriz && !engine.coordinatingAxis) setFollowing(engine, false);
  if (isHoriz && !engine.config.zoom?.y) {
    autoRangeVertical(engine, true);
  }

  // Group peers relay a gesture in flight on another chart, so they get
  // the same interaction-pass sampling the originating chart does.
  markViewportActive(engine);

  engine.scheduler.markDirty(DirtyFlag.DATA | DirtyFlag.GRID | DirtyFlag.OVERLAY);
  engine.emitEvent('viewport:change', key, { min: scale.min, max: scale.max });
}

export function getNaturalRange(engine: ChartCore, key: string): ScaleRange | undefined {
  const range = engine.naturalExtent.get(key);
  return range ? { min: range[0], max: range[1] } : undefined;
}

export function setCoordinatedAxis(engine: ChartCore, key: string, range: ScaleRange): void {
  engine.coordinatingAxis = true;
  try {
    engine.setAxis(key, range);
  } finally {
    engine.coordinatingAxis = false;
  }
}

/** The pinned axes and their ranges: the viewport state (plan D3). */
export function pinnedAxes(engine: ChartCore): Record<string, ScaleRange> {
  const pinned: Record<string, ScaleRange> = {};
  for (const key of engine.userZoomedAxes) {
    const scale = engine.scales.get(key);
    if (scale) pinned[key] = { min: scale.min, max: scale.max };
  }
  return pinned;
}

/**
 * Pin exactly the axes `viewport` names, at its ranges, and return every other axis to its
 * automatic range (plan D3: a viewport names only the axes it pins, and `{}` pins none).
 * Pinning a horizontal axis pauses following; a viewport without one follows again.
 */
export function applyViewport(
  engine: ChartCore,
  viewport: Readonly<Record<string, ScaleRange>>,
): void {
  if (engine.destroyed) return;
  const previous = new Map(
    [...engine.scales].map(([key, scale]) => [key, [scale.min, scale.max] as const]),
  );
  const keys = Object.keys(viewport).filter((key) => engine.scales.has(key));
  // A horizontal axis this viewport no longer pins returns to its automatic range.
  const released = [...engine.userZoomedAxes].some(
    (key) => !keys.includes(key) && engine.isHorizontalAxis(key),
  );
  engine.userZoomedAxes = new Set(keys);
  for (const key of keys) {
    const scale = engine.scales.get(key)!;
    scale.min = viewport[key].min;
    scale.max = viewport[key].max;
  }
  const horizontal = keys.some((key) => engine.isHorizontalAxis(key));
  setFollowing(engine, !horizontal);
  // A pan (the same horizontal axes pinned at a new range) changes no natural extent, so it
  // skips the horizontal auto-range and its pass over every X, as a gesture does.
  if (released || !horizontal) autoRangeHorizontal(engine);
  if (!horizontal) applyFollowWindow(engine);
  autoRangeVertical(engine, horizontal);
  // A pinned axis that moved is a view in motion as far as drawing goes: an app that drives the
  // viewport from a slider or another chart gets the gesture pass, refined once it settles, as
  // a pan or a group sync does.
  const moved = keys.some((key) => {
    const before = previous.get(key);
    const scale = engine.scales.get(key)!;
    return !before || before[0] !== scale.min || before[1] !== scale.max;
  });
  if (moved) markViewportActive(engine);
  refreshCursor(engine);
  engine.scheduler.markDirty(DirtyFlag.ALL);
  publishResetViewport(engine, previous);
}

/** Reset zoom to full data extent (double-click handler) */
export function resetZoom(engine: ChartCore): void {
  if (engine.destroyed) return;
  const previous = new Map(
    [...engine.scales].map(([key, scale]) => [key, [scale.min, scale.max] as const]),
  );
  engine.userZoomedAxes.clear();
  setFollowing(engine, true);
  autoRangeHorizontal(engine);
  // Follow window (if configured) takes precedence over full-extent X.
  applyFollowWindow(engine);
  autoRangeVertical(engine);
  engine.scheduler.markDirty(DirtyFlag.ALL);

  publishResetViewport(engine, previous);
}

export function scrollToLatest(engine: ChartCore): void {
  if (engine.destroyed) return;
  const previous = new Map(
    [...engine.scales].map(([key, scale]) => [key, [scale.min, scale.max] as const]),
  );
  engine.userZoomedAxes.clear();
  setFollowing(engine, true);
  if (followWindow(engine) !== undefined && engine.hasData()) {
    applyFollowWindow(engine);
  } else {
    autoRangeHorizontal(engine);
    autoRangeVertical(engine);
  }
  refreshCursor(engine);
  engine.scheduler.markDirty(DirtyFlag.ALL);
  publishResetViewport(engine, previous);
}

/** Report every scale a reset action moved. */
export function publishResetViewport(
  engine: ChartCore,
  previous: ReadonlyMap<string, readonly [number, number]>,
): void {
  for (const [scaleKey, scale] of engine.scales) {
    const before = previous.get(scaleKey);
    if (!before || before[0] !== scale.min || before[1] !== scale.max) {
      engine.emitEvent('viewport:change', scaleKey, { min: scale.min, max: scale.max });
    }
  }
}

export function markViewportActive(engine: ChartCore): void {
  if (interactionSamplingBudget(engine) === null) return;
  engine.viewportActiveUntil = performance.now() + INTERACTION_REFINE_MS;
  if (engine.refineTimer !== null) clearTimeout(engine.refineTimer);
  engine.refineTimer = setTimeout(() => {
    engine.refineTimer = null;
    if (engine.destroyed) return;
    // Only repaint if the last data pass actually dropped points.
    if (engine.sampledLastDataRender) engine.scheduler.markDirty(DirtyFlag.DATA);
  }, INTERACTION_REFINE_MS);
}

export function zoomedScaleRange(scale: Scale, anchorPx: number, factor: number): [number, number] {
  const anchor = scale.pixelToData(anchorPx);
  if (scale.type !== 'log') {
    return [anchor - (anchor - scale.min) * factor, anchor + (scale.max - anchor) * factor];
  }

  const logMin = Math.log10(Math.max(scale.min, 1e-10));
  const logMax = Math.log10(Math.max(scale.max, 1e-10));
  const logAnchor = Math.log10(Math.max(anchor, 1e-10));
  return [
    10 ** (logAnchor - (logAnchor - logMin) * factor),
    10 ** (logAnchor + (logMax - logAnchor) * factor),
  ];
}

export function canZoomFromAnchor(
  engine: ChartCore,
  axis: string,
  anchorX: number,
  anchorY: number,
  axisControlsEnabled: boolean,
  axisConfigs: NonNullable<ChartSpec['axes']>,
): boolean {
  if (axisControlsEnabled) return true;
  const { plot } = engine.layout;
  if (axis === 'xy') return isInPlotArea(engine, anchorX, anchorY);

  const ac = axisConfigs[axis];
  const pos = inferPosition(axis, ac?.position);
  if (pos === 'bottom' || pos === 'top') {
    return anchorY > plot.top && anchorY < plot.top + plot.height;
  }
  return anchorX > plot.left && anchorX < plot.left + plot.width;
}

export function applyUniformZoom(
  engine: ChartCore,
  factor: number,
  anchorX: number,
  anchorY: number,
): void {
  const zoom = engine.config.zoom ?? { enabled: true, x: true };
  const axisConfigs = engine.config.axes ?? {};
  const targets: Array<{
    key: string;
    scale: Scale;
    pos: 'top' | 'bottom' | 'left' | 'right';
    anchorPx: number;
  }> = [];

  for (const [key, scale] of engine.scales) {
    const pos = inferPosition(key, axisConfigs[key]?.position);
    const isHoriz = pos === 'bottom' || pos === 'top';
    if (isHoriz ? zoom.x !== false : zoom.y) {
      targets.push({ key, scale, pos, anchorPx: isHoriz ? anchorX : anchorY });
    }
  }
  if (targets.length === 0) return;

  let effectiveFactor = factor;
  for (const target of targets) {
    const span = scaleDomainSpan(target.scale, target.scale.min, target.scale.max);
    if (span <= 0 || !Number.isFinite(span)) continue;

    const proposed = zoomedScaleRange(target.scale, target.anchorPx, effectiveFactor);
    const proposedSpan = scaleDomainSpan(target.scale, proposed[0], proposed[1]);

    // minRange/maxRange are measured in the scale's own span metric so the
    // factor correction matches how zoomedScaleRange applies it (linear span
    // on linear/time axes, log10-decade span on log axes). Applies to every
    // zoomed axis, including vertical, not just horizontal.
    if (zoom.minRange && proposedSpan < zoom.minRange) {
      effectiveFactor = Math.max(effectiveFactor, zoom.minRange / span);
    }
    if (zoom.maxRange && proposedSpan > zoom.maxRange) {
      effectiveFactor = Math.min(effectiveFactor, zoom.maxRange / span);
    }

    const bounds = resolveBounds(engine, target.key, target.pos);
    if (bounds?.min !== undefined && bounds.max !== undefined && proposedSpan > 0) {
      const boundsSpan = scaleDomainSpan(target.scale, bounds.min, bounds.max);
      if (Number.isFinite(boundsSpan) && boundsSpan > 0 && proposedSpan > boundsSpan) {
        effectiveFactor = Math.min(effectiveFactor, boundsSpan / span);
      }
    }
  }

  for (const target of targets) {
    const [newMin, newMax] = zoomedScaleRange(target.scale, target.anchorPx, effectiveFactor);
    applyViewportChange(engine, target.key, newMin, newMax);
  }
}

export function scaleDomainSpan(scale: Scale, min: number, max: number): number {
  if (scale.type !== 'log') return max - min;
  const safeMin = Math.max(min, 1e-10);
  const safeMax = Math.max(max, safeMin);
  return Math.log10(safeMax) - Math.log10(safeMin);
}

export function pannedScaleRange(scale: Scale, deltaPx: number): [number, number] {
  if (scale.type !== 'log') {
    const dataD = scale.pixelToData(0) - scale.pixelToData(deltaPx);
    return [scale.min + dataD, scale.max + dataD];
  }

  const logDelta =
    Math.log10(Math.max(scale.pixelToData(0), 1e-10)) -
    Math.log10(Math.max(scale.pixelToData(deltaPx), 1e-10));
  return [
    10 ** (Math.log10(Math.max(scale.min, 1e-10)) + logDelta),
    10 ** (Math.log10(Math.max(scale.max, 1e-10)) + logDelta),
  ];
}

/** Apply a viewport change, shared by pan, zoom and box-end */
export function applyViewportChange(
  engine: ChartCore,
  scaleKey: string,
  min: number,
  max: number,
): void {
  const scale = engine.scales.get(scaleKey);
  if (!scale) return;

  const ac = engine.config.axes?.[scaleKey];
  const pos = inferPosition(scaleKey, ac?.position);
  const isHoriz = pos === 'bottom' || pos === 'top';

  // The one zoom constraint (plan D29): a viewport spans at least two adjacent data points on X,
  // and never less than 1e-9 of the data extent.
  if (scale.type !== 'log') {
    const span = minimumSpan(engine, scaleKey, isHoriz, (min + max) / 2);
    if (max - min < span) {
      const centre = (min + max) / 2;
      min = centre - span / 2;
      max = centre + span / 2;
    }
  }

  // Clamp to configured bounds (defaults to data extent). Keeps pan at
  // the edge when you push past it, and stops zoom-out at the full extent.
  const clamped = clampViewportToBounds(engine, scaleKey, pos, min, max);
  min = clamped[0];
  max = clamped[1];

  // Fully clamped no-op (panning at the data edge, zooming out at full
  // extent): nothing changes, so skip the repaint, events, and sync
  // publish. Without this, dragging against the edge repaints all three
  // layers at gesture rate for zero visual change.
  if (scale.min === min && scale.max === max) return;

  markViewportActive(engine);
  engine.userZoomedAxes.add(scaleKey);
  // A horizontal pan/zoom pauses live-follow (the user took control of the
  // X window); a Y-only change leaves follow untouched.
  if (isHoriz) setFollowing(engine, false);

  scale.min = min;
  scale.max = max;

  if (isHoriz && !engine.config.zoom?.y) {
    autoRangeVertical(engine, true);
  }

  refreshCursor(engine);
  engine.scheduler.markDirty(DirtyFlag.DATA | DirtyFlag.GRID | DirtyFlag.OVERLAY);
  engine.emitEvent('viewport:change', scaleKey, { min, max });
}

/** The narrowest span a gesture may zoom `scaleKey` to around `centre` (plan D29). */
function minimumSpan(
  engine: ChartCore,
  scaleKey: string,
  isHoriz: boolean,
  centre: number,
): number {
  const natural = engine.naturalExtent.get(scaleKey);
  let span = natural ? Math.abs(natural[1] - natural[0]) * 1e-9 : 0;
  const store = engine.sourceStores[0];
  if (isHoriz && store && store.length >= 2) {
    const i = Math.min(store.length - 1, Math.max(0, store.nearestXIndex(centre)));
    const left = i > 0 ? store.xAt(i) - store.xAt(i - 1) : Infinity;
    const right = i < store.length - 1 ? store.xAt(i + 1) - store.xAt(i) : Infinity;
    const gap = Math.min(left > 0 ? left : Infinity, right > 0 ? right : Infinity);
    if (Number.isFinite(gap)) span = Math.max(span, gap);
  }
  return span;
}

/**
 * Every visible series bound to this Y axis is a scatter. Used to
 * default `zoom.bounds.y` to `'data'` on scatter-only charts where
 * there is no viewport-driven Y auto-range to take up the slack.
 */
export function isScatterOnlyAxis(engine: ChartCore, scaleKey: string): boolean {
  const bound = engine.config.series.filter(
    (s) => (s.yAxis ?? 'y') === scaleKey && s.visible !== false,
  );
  return bound.length > 0 && bound.every((s) => markOf(s).draw.cloud);
}

/**
 * Resolve the `zoom.bounds` config for a specific axis.
 *
 * Returns `null` when no clamping should happen, or `{ min, max }` with
 * either bound potentially `undefined` (half-open). The `'data'` literal
 * is resolved here from the source extents / Y-range over the visible X window.
 */
export function resolveBounds(
  engine: ChartCore,
  scaleKey: string,
  pos: 'top' | 'bottom' | 'left' | 'right',
): { min?: number; max?: number } | null {
  const raw = engine.config.zoom?.bounds;
  if (raw === false || raw === 'unbounded') return null;

  const isHoriz = pos === 'top' || pos === 'bottom';
  let spec: ZoomBoundsSpec | undefined;

  // Default for Y: line/area/bar charts auto-range Y from the visible
  // X window, so leaving Y unbounded lets the user stretch the viewport
  // while the data still fills it. Scatter-only axes have no such
  // driver, a point cloud lives in both dimensions independently,    // so we default those to 'data' to match the X-axis behaviour.
  const scatterDefault = !isHoriz && isScatterOnlyAxis(engine, scaleKey);
  const yDefault: ZoomBoundsSpec = scatterDefault ? 'data' : 'unbounded';

  if (raw === undefined || raw === true) {
    spec = isHoriz ? 'data' : yDefault;
  } else if (
    typeof raw === 'string' ||
    (typeof raw === 'object' && ('min' in raw || 'max' in raw))
  ) {
    // Top-level scalar spec applies to every axis.
    spec = raw as ZoomBoundsSpec;
  } else {
    const perAxis = raw as { x?: ZoomBoundsSpec; y?: ZoomBoundsSpec };
    spec = (isHoriz ? perAxis.x : perAxis.y) ?? (isHoriz ? 'data' : yDefault);
  }

  if (spec === 'unbounded' || spec === undefined) return null;

  if (typeof spec === 'object') return { ...spec };

  // spec === 'data', use the cached natural extent (output of autoRange,
  // which already honors axis pins and any explicit `nice: true` expansion).
  // Falls back to the raw data range if autoRange hasn't run yet for this axis.
  const natural = engine.naturalExtent.get(scaleKey);
  // A followed axis' natural extent is its window: the bounds are every retained sample, so a
  // pan can go back in time (interact-14).
  const retained =
    isHoriz && followWindow(engine) !== undefined ? engine.sourceExtent(scaleKey) : null;
  if (natural && retained) {
    return { min: Math.min(natural[0], retained[0]), max: Math.max(natural[1], retained[1]) };
  }
  if (natural) return { min: natural[0], max: natural[1] };

  if (!engine.hasData()) return null;
  if (isHoriz) {
    const extent = engine.sourceExtent();
    return extent ? { min: extent[0], max: extent[1] } : null;
  }
  let min = Infinity;
  let max = -Infinity;
  engine.config.series.forEach((series, si) => {
    if ((series.yAxis ?? 'y') !== scaleKey || series.visible === false) return;
    const store = engine.storeForSeries(si);
    const range = columnRange(
      engine,
      seriesYColumn(series) - 1,
      0,
      store.length - 1,
      'linear',
      false,
      store,
    );
    if (range) {
      min = Math.min(min, range[0]);
      max = Math.max(max, range[1]);
    }
  });
  return min === Infinity ? null : { min, max };
}

/**
 * Apply bounds clamping to a proposed [min, max] viewport. Preserves the
 * viewport's span when shifting away from an edge (pan-into-wall stops
 * at the wall); collapses to the full bounded extent when the proposed
 * span exceeds the allowed one (zoom-out stops at data extent).
 */
export function clampViewportToBounds(
  engine: ChartCore,
  scaleKey: string,
  pos: 'top' | 'bottom' | 'left' | 'right',
  min: number,
  max: number,
): [number, number] {
  const b = resolveBounds(engine, scaleKey, pos);
  if (!b) return [min, max];

  const bMin = b.min;
  const bMax = b.max;
  const scale = engine.scales.get(scaleKey);
  const span = scale ? scaleDomainSpan(scale, min, max) : max - min;

  if (bMin !== undefined && bMax !== undefined) {
    const boundedSpan = scale ? scaleDomainSpan(scale, bMin, bMax) : bMax - bMin;
    if (span >= boundedSpan) {
      // User is trying to see more than the full range, clamp to it.
      return [bMin, bMax];
    }
  }
  if (bMin !== undefined && min < bMin) {
    [min, max] = rangeFromMin(scale, bMin, span);
  }
  if (bMax !== undefined && max > bMax) {
    [min, max] = rangeFromMax(scale, bMax, span);
  }
  // After shifting, the opposite edge may have crossed its bound.
  if (bMin !== undefined && min < bMin) min = bMin;
  if (bMax !== undefined && max > bMax) max = bMax;
  return [min, max];
}

export function rangeFromMin(
  scale: Scale | undefined,
  min: number,
  span: number,
): [number, number] {
  if (scale?.type === 'log') {
    const safeMin = Math.max(min, 1e-10);
    return [min, 10 ** (Math.log10(safeMin) + span)];
  }
  return [min, min + span];
}

export function rangeFromMax(
  scale: Scale | undefined,
  max: number,
  span: number,
): [number, number] {
  if (scale?.type === 'log') {
    const safeMax = Math.max(max, 1e-10);
    return [10 ** (Math.log10(safeMax) - span), max];
  }
  return [max - span, max];
}
