import assert from 'node:assert/strict';
import { join } from 'node:path';
import { afterEach, describe, test } from 'node:test';
import { launchOptions } from '../lib/browser.mjs';
import { fromInvocation } from '../lib/paths.mjs';

const saved = { INIT_CWD: process.env.INIT_CWD, BENCH_JS_FLAGS: process.env.BENCH_JS_FLAGS };

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('driver paths and flags', () => {
  test('--out is resolved from where npm was invoked, not from the bench workspace', () => {
    // `npm run bench:ab` at the root runs the script in bench/, but sets INIT_CWD to the root.
    process.env.INIT_CWD = '/repo';
    assert.equal(fromInvocation('bench/results/x.md'), join('/repo', 'bench/results/x.md'));
    assert.equal(fromInvocation('/abs/x.md'), '/abs/x.md');
    delete process.env.INIT_CWD;
    assert.equal(fromInvocation('x.md'), join(process.cwd(), 'x.md'));
  });

  test('BENCH_JS_FLAGS joins the one --js-flags switch, which keeps --expose-gc', () => {
    process.env.BENCH_JS_FLAGS = '--no-maglev  --single-threaded-gc';
    for (const raster of ['gpu', 'software']) {
      const flags = launchOptions(raster).args.filter((a) => a.startsWith('--js-flags='));
      assert.deepEqual(flags, ['--js-flags=--expose-gc --no-maglev --single-threaded-gc'], raster);
    }
  });
});
