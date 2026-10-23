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
  /** Files written after the run and before the check, by path from the repository root. */
  editAfterRun?: Record<string, string>;
  /** Omit `head.inputs` from meta.json, as an older run.mjs did. */
  legacyHead?: boolean;
  /** Omit `against.hashes` (the captured images' SHA-256) from meta.json, as an older run.mjs did. */
  legacyHashes?: boolean;
  /** Reference images overwritten after the capture, as a head run with `-u` would. */
  rewriteAfterCapture?: string[];
  /** Reference images written after the capture that it never captured. */
  addAfterCapture?: string[];
  /** Reference images deleted after the capture. */
  removeAfterCapture?: string[];
  /**
   * Run on a milestone branch of this name (e.g. `ovh/m11-marks`), cut from an `overhaul` branch
   * at the base commit. Default: the repository's initial branch, and no `overhaul` branch.
   */
  branch?: string;
  /** With `branch`: add a commit on the branch, so its tip is no longer the merge base. */
  branchCommit?: boolean;
  /** With `branch`: create no `overhaul` branch (a clone without one). */
  noOverhaul?: boolean;
  /** With `branch`: leave the fixture app out of the base commit (M3a's own merge base). */
  preHarnessBase?: boolean;
  /** The reference was rendered from the branch tip (`--against HEAD`), not the base commit. */
  againstTip?: boolean;
  /**
   * `--base` for check-visual-diffs.mjs: the base commit (`base`, the default), the reference's
   * SHA (`against`), or none (`none`, so the script picks its own default).
   */
  base?: 'base' | 'against' | 'none';
  /** Extra arguments for check-visual-diffs.mjs. */
  args?: string[];
}

export const ERRORS: { changed: string; missing: string; threw: string };

/** The V0 row file as the M3a baseline commit writes it. */
export const V0: string;

/** A well-formed row file naming `fixtures`, for a commit with the subject `subject`. */
export function row(id: string, milestone: string, fixtures: string[], subject?: string): string;

/** Runs scripts/overhaul/check-visual-diffs.mjs on the synthetic run. */
export function runScenario(scenario: Scenario): { status: number | null; output: string };
