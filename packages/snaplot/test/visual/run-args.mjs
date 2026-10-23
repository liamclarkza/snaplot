// The command line of `npm run test:visual` (run.mjs), parsed without side effects so that
// run-args.test.ts can lock what the runner accepts.

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
  return opts;
}
