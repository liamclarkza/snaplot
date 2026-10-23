/**
 * The command line of `npm run test:visual` (run-args.mjs): what the runner accepts decides what
 * a visual run can prove.
 */
import { describe, expect, it } from 'vitest';
import { parseArgs } from './run-args.mjs';

describe('the visual runner command line', () => {
  it('reads the reference, the mode flags and the projects', () => {
    const opts = parseArgs(['--against', 'HEAD', '--strict', '--project', 'visual']);
    expect(opts).toMatchObject({
      against: 'HEAD',
      strict: true,
      update: false,
      projects: ['visual'],
      passthrough: [],
    });
    expect(parseArgs(['--against=overhaul']).against).toBe('overhaul');
  });

  it('passes --grep, --workers and everything after -- on to Playwright', () => {
    const opts = parseArgs(['-g', 'axes/', '-j', '2', '--', '--max-failures', '3']);
    expect(opts.passthrough).toEqual(['--grep', 'axes/', '--workers', '2', '--max-failures', '3']);
  });

  it('takes the reference SHA from --against-tree', () => {
    const opts = parseArgs(['--against-tree', '/work/ref', '--against-sha', 'abc123']);
    expect(opts).toMatchObject({ against: 'abc123', againstTree: '/work/ref' });
  });

  it('refuses --against without a ref, and --against with --update', () => {
    expect(() => parseArgs(['--against'])).toThrow('--against needs a ref');
    expect(() => parseArgs(['--against', 'HEAD', '--update'])).toThrow('exclusive');
  });

  // M3a review #3: `-u` after `--update-snapshots=none` made Playwright write the head's
  // screenshots into the reference, and the next run against it passed.
  it.fails('[repo-10] refuses the Playwright flags that write or skip the expected images', () => {
    const flags = [
      ['-u'],
      ['--update-snapshots'],
      ['--update-snapshots=all'],
      ['--update-snapshots', 'changed'],
      ['--update-source-method=overwrite'],
      ['--ignore-snapshots'],
      ['-xu'],
      ['--config', 'other.config.ts'],
      ['-c', 'other.config.ts'],
    ];
    for (const extra of flags) {
      for (const argv of [
        ['--against', 'HEAD', ...extra],
        ['--against', 'HEAD', '--', ...extra],
        ['--', ...extra],
      ]) {
        expect(() => parseArgs(argv), argv.join(' ')).toThrow(/expected images/);
      }
    }
  });

  it('keeps a --grep pattern that looks like a flag', () => {
    expect(parseArgs(['--grep', '-u']).passthrough).toEqual(['--grep', '-u']);
    expect(parseArgs(['--', '-g', '-u']).passthrough).toEqual(['-g', '-u']);
  });
});
