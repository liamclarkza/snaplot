// The command line of `npm run test:visual` (run.mjs), parsed without side effects so that
// run-args.test.ts can lock what the runner accepts.

/** Playwright options that take a value: that value is never read as a flag. */
const VALUE_OPTIONS = new Set([
  '--grep',
  '-g',
  '--grep-invert',
  '-G',
  '--workers',
  '-j',
  '--max-failures',
  '--repeat-each',
  '--retries',
  '--shard',
  '--timeout',
  '--global-timeout',
  '--reporter',
  '--output',
  '--trace',
  '--tsconfig',
  '--project',
  '--last-failed-file',
  '--test-list',
  '--test-list-invert',
  '--ui-host',
  '--ui-port',
  '--run-agents',
]);

/** Long Playwright options that write, skip or relocate the expected images. */
const EXPECTED_IMAGE_OPTIONS =
  /^--(update-snapshots|update-source-method|ignore-snapshots|config)(=|$)/;

/**
 * The flag in a Playwright argument that would write, skip or relocate the expected images, or
 * null. A short cluster is read like Playwright's parser: `-xu` holds `-u`, while in `-gcu` the
 * `cu` is the value of `-g`.
 */
function expectedImageFlag(arg) {
  if (EXPECTED_IMAGE_OPTIONS.test(arg)) return arg.split('=')[0];
  if (!/^-[A-Za-z]/.test(arg)) return null;
  for (const ch of arg.slice(1)) {
    if (ch === 'u' || ch === 'c') return `-${ch}`;
    if ('gGj'.includes(ch)) return null;
  }
  return null;
}

/**
 * Refuses the Playwright arguments that would let the head write into, skip or relocate the
 * expected images. run.mjs owns them: the head always compares with `--update-snapshots=none`.
 * M3a review #3: `--against <ref> -u` wrote the head's screenshots into the shared reference
 * cache, and the next run against it passed with 0 changed shots.
 */
function refuseExpectedImageFlags(passthrough) {
  for (let i = 0; i < passthrough.length; i++) {
    const arg = passthrough[i];
    if (VALUE_OPTIONS.has(arg)) {
      i++;
      continue;
    }
    const flag = expectedImageFlag(arg);
    if (flag) {
      throw new Error(
        `${flag} would let Playwright write, skip or relocate the expected images, which run.mjs ` +
          'owns: the head always compares with --update-snapshots=none, and a reference from ' +
          '--against is never updated. To rewrite the committed baselines (M3a and M14 only), ' +
          'use --update',
      );
    }
  }
}

/**
 * Parses run.mjs's arguments. Throws on an invalid combination; run.mjs exits 2 with the message.
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  const opts = {
    projects: [],
    passthrough: [],
    against: null,
    againstTree: null,
    againstSha: null,
    update: false,
    serve: false,
    strict: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      opts.passthrough.push(...argv.slice(i + 1));
      break;
    }
    if (a === '--against') opts.against = argv[++i];
    else if (a.startsWith('--against=')) opts.against = a.slice(10);
    else if (a === '--against-tree') opts.againstTree = argv[++i];
    else if (a === '--against-sha') opts.againstSha = argv[++i];
    else if (a === '--update') opts.update = true;
    else if (a === '--serve') opts.serve = true;
    else if (a === '--strict') opts.strict = true;
    else if (a === '--project') opts.projects.push(argv[++i]);
    else if (a === '--grep' || a === '-g') opts.passthrough.push('--grep', argv[++i]);
    else if (a === '--workers' || a === '-j') opts.passthrough.push('--workers', argv[++i]);
    else opts.passthrough.push(a);
  }
  if (opts.against === undefined || opts.against === '') throw new Error('--against needs a ref');
  if (opts.againstTree && !opts.against) opts.against = opts.againstSha ?? 'tree';
  if (opts.against && opts.update) throw new Error('--against and --update are exclusive');
  refuseExpectedImageFlags(opts.passthrough);
  return opts;
}
