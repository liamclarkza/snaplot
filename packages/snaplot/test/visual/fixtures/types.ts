/**
 * The fixture contract shared by the fixture app (browser), the Playwright specs (Node) and the
 * runner. Fixture files only `import type` from the library, so the specs can read the registry
 * in Node without loading the engine; runtime helpers (today only `histogram`) arrive through
 * `FixtureLib`.
 *
 * Fixtures use only options that survive plan §4.4. When M7 or M8 renames an option, that
 * milestone updates the fixtures in the same commit; the ids stay stable so `--against`
 * compares like with like.
 */
import type { ChartHandle, ChartOptions, histogram } from '../../../src/index';

/** Runtime library pieces a fixture may call while building its options. */
export interface FixtureLib {
  histogram: typeof histogram;
}

/** The geometry checks of `geometry.spec.ts` (plan M3a scope 4). */
export type GeometryCheck = 'overlap' | 'repeat' | 'minLabels' | 'paints' | 'inside';

export interface FixtureCard {
  /** Card surface colour (the page behind the chart). */
  background: string;
  /** Card text colour, inherited by the chart host. */
  color?: string;
  /** CSS custom properties set on the card (theme variables). */
  vars?: Record<string, string>;
  /** Padding around the chart, in CSS px. Default 12. */
  padding?: number;
}

export interface Fixture {
  /** `<area>/<name>`: lowercase letters, digits and dashes. Stable across milestones. */
  id: string;
  /** One line saying what the fixture shows and which finding it reproduces. */
  title: string;
  /** Chart host size in CSS px (the card, if any, adds its padding around it). */
  width: number;
  height: number;
  options(lib: FixtureLib): ChartOptions<any>;
  /** Wrap the chart in a card with its own surface (theme fixtures). */
  card?: FixtureCard;
  /** Also capture at device pixel ratio 2 (the crispness set). */
  dpr2?: boolean;
  /** Capture under emulated OS light and dark. Only theme fixtures set this (plan §11.3 G10). */
  schemes?: boolean;
  /** Browser minimum font size in px, applied through a persistent Chromium profile. */
  minFontSize?: number;
  /** Runs after the first paint: programmatic state such as a highlighted series. */
  after?(chart: ChartHandle<any>): void;
  /** Real pointer position before capture, as fractions of the plot box (0..1). */
  hover?: { x: number; y: number };
  /** Geometry checks that do not apply to this fixture, each with its reason. */
  skip?: Partial<Record<GeometryCheck, string>>;
  /**
   * Why the data layer is blank today: no data, or a known defect (with its finding id). The app
   * reports ready only once the data layer holds ink, or for these fixtures the grid layer. The
   * fix that paints the layer drops the field.
   */
  blankData?: string;
}

export type ColorScheme = 'light' | 'dark';

/** One screenshot: a fixture under one device pixel ratio and one colour scheme. */
export interface Shot {
  fixture: Fixture;
  /** `<id>`, `<id>@2x`, or `<id>@light` / `<id>@dark` for scheme fixtures. */
  name: string;
  /** Path segments for `toHaveScreenshot`, e.g. `['axes', 'titles-320@2x.png']`. */
  path: [string, string];
  dpr: 1 | 2;
  scheme: ColorScheme;
}
