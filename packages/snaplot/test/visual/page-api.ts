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

export interface FixturePageApi {
  id: string;
  status: 'loading' | 'ready' | 'error';
  error?: string;
  chart?: ChartHandle<any>;
  /** Client coordinates of a point given as fractions of the plot box. */
  plotPoint(fx: number, fy: number): { x: number; y: number };
  /** Resolves after `n` animation frames. */
  frames(n: number): Promise<void>;
}

declare global {
  interface Window {
    __snaplotFixture?: FixturePageApi;
  }
}
