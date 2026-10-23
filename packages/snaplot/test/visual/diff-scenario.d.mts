/** One head screenshot test in the synthetic Playwright report. */
export interface HeadShot {
  /** Shot name, e.g. `marks/a` or `marks/a@2x`. */
  name: string;
  /** Playwright test status. Default `expected` (the shot matched its reference). */
  status?: 'expected' | 'unexpected';
  /** The failure message, for an unexpected test (see `ERRORS`). */
  error?: string;
}

export interface Scenario {
  /** `against` (a reference rendered from a ref, the default) or committed `baselines`. */
  mode?: 'against' | 'baselines';
  /** The head run's screenshot tests. */
  head?: HeadShot[];
  /** Shots that have an image in the reference directory. */
  referenceFiles?: string[];
  /** The reference's recorded shot list (`meta.against.shots`). Default: `referenceFiles`. */
  referenceShots?: string[];
  /** Fields merged over the default (complete, exit 0) reference outcome in meta.json. */
  against?: Record<string, unknown>;
  /** Replaces `meta.against` entirely (e.g. the shape an older run.mjs wrote). */
  againstExact?: Record<string, unknown>;
  /**
   * The comparison meta.json records. Default: `exact` for `against`, `tolerance` for `baselines`
   * (run.mjs's defaults). `legacy` omits it, as an older run.mjs did.
   */
  comparison?: 'exact' | 'tolerance' | 'legacy';
  /** `--milestone` (default `M2`, which applies the zero-change rule). */
  milestone?: string;
  /** Row files in the base commit, by file name. Default: `V0.md`. */
  baseRows?: Record<string, string>;
  /** Row files written after the base commit (added or edited, uncommitted). */
  rows?: Record<string, string>;
  /** Extra arguments for check-visual-diffs.mjs. */
  args?: string[];
}

export const ERRORS: { changed: string; missing: string; threw: string };

/** The V0 row file as the M3a baseline commit writes it. */
export const V0: string;

/** A well-formed row file naming `fixtures`. */
export function row(id: string, milestone: string, fixtures: string[]): string;

/** Runs scripts/overhaul/check-visual-diffs.mjs on the synthetic run. */
export function runScenario(scenario: Scenario): { status: number | null; output: string };
