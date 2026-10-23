/**
 * The contract between the fixture app (browser) and the specs (Node). The app publishes
 * `window.__snaplotFixture`; the specs read it through `page.evaluate`. Keep this file free of
 * runtime imports so both sides can use it.
 */
import type { ChartHandle } from '../../src/index';

/** The font every fixture renders with (bundled from `@fontsource/ibm-plex-sans`). */
export const FONT_FAMILY = '"IBM Plex Sans", sans-serif';

/** Font weights the app loads before the first chart is created. */
export const FONT_WEIGHTS = [400, 500, 600] as const;

export interface PageRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface PageLabel {
  text: string;
  /** Client rect of the label element (`getBoundingClientRect`). */
  rect: PageRect;
  /** Axis key, or null when the label could not be attributed. */
  axis: string | null;
  kind: 'tick' | 'title' | null;
}

export interface PageAxis {
  key: string;
  position: 'left' | 'right' | 'top' | 'bottom';
  /** True for an axis that runs along X (top or bottom). */
  horizontal: boolean;
  /** Plot length along the axis direction, in CSS px. */
  extent: number;
}

export interface PageProbe {
  series: string;
  /** Datum in data units (category X as its index). */
  x: number;
  y: number;
  /** Probe point in CSS px relative to the chart host. */
  px: number;
  py: number;
  /** Horizontal and vertical search radius in CSS px. */
  rx: number;
  ry: number;
  inked: boolean;
}

export interface GeometryReport {
  id: string;
  /** Chart host box (client coordinates). */
  host: PageRect;
  /** Plot box (client coordinates). */
  plot: PageRect;
  axes: PageAxis[];
  labels: PageLabel[];
  /** How the labels were attributed to axes: the debug label list, or geometry alone. */
  attribution: 'debug' | 'geometry';
  probes: PageProbe[];
  /** Series that were not probed, with the reason. */
  unprobed: string[];
}

export interface FixturePageApi {
  id: string;
  status: 'loading' | 'ready' | 'error';
  error?: string;
  chart?: ChartHandle<any>;
  /** Client coordinates of a point given as fractions of the plot box. */
  plotPoint(fx: number, fy: number): { x: number; y: number };
  geometry(): GeometryReport;
  /** Resolves after `n` animation frames. */
  frames(n: number): Promise<void>;
}

declare global {
  interface Window {
    __snaplotFixture?: FixturePageApi;
  }
}
