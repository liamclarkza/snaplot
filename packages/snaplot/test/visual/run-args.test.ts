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
});
