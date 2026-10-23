/** What `npm run test:visual` (run.mjs) was asked to do. */
export interface RunOptions {
  /** `--project` values, in order (empty: run.mjs picks its defaults). */
  projects: string[];
  /** Arguments passed on to Playwright (`--grep`, `--workers` and anything after `--`). */
  passthrough: string[];
  /** `--against <ref>` (or the SHA of `--against-tree`), else null. */
  against: string | null;
  /** `--against-tree <dir>`, as given (run.mjs resolves it). */
  againstTree: string | null;
  againstSha: string | null;
  update: boolean;
  serve: boolean;
  strict: boolean;
}

/** Parses run.mjs's arguments; throws on an invalid combination. */
export function parseArgs(argv: string[]): RunOptions;
