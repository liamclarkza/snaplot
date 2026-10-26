/**
 * Pixel snapping for 1 px strokes (plan §5.7): the W5 contract (§3.2) that every 1 px stroke of
 * the engine goes through (the grid, the plot frame, the tick marks, the crosshair, and the brush
 * and box edges). Coordinates are CSS pixels on a context scaled by `dpr`.
 *
 * Today's rule, kept by M9b: round to the CSS pixel grid, plus half a pixel at DPR 1, where a 1 px
 * line on a pixel boundary would light two device pixels at half strength. At DPR 2 the rounded
 * line covers two whole device pixels. M11 owns this module and snaps to device-pixel centres at
 * every DPR (1.25, 1.5, 3; render-16) behind the same signature.
 */

/** The line coordinate at which a 1 px stroke along `value` draws crisp at `dpr`. */
export function crisp(value: number, dpr: number): number {
  return Math.round(value) + (dpr === 1 ? 0.5 : 0);
}
