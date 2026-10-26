/**
 * Pixel snapping for 1 px strokes (plan §5.7): the W5 contract (§3.2) that every 1 px stroke of
 * the engine goes through (the grid, the plot frame, the tick marks, the crosshair, and the brush
 * and box edges). Coordinates are CSS pixels on a context scaled by `dpr`.
 *
 * A 1 px stroke covers `round(dpr)` device pixels. An odd count is crisp centred on a device-pixel
 * centre (DPR 1 and 3: k + 0.5 device px), an even count on a device-pixel boundary (DPR 2). The
 * coordinate snaps to the nearest such point (render-16).
 */

/** The line coordinate at which a 1 px stroke along `value` draws crisp at `dpr`. */
export function crisp(value: number, dpr: number): number {
  const device = Math.max(1, Math.round(dpr));
  const scaled = Math.round(value * dpr);
  return (device % 2 === 1 ? scaled + 0.5 : scaled) / dpr;
}
