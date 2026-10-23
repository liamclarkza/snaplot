import assert from 'node:assert/strict';
import { join } from 'node:path';
import { afterEach, describe, test } from 'node:test';
import { launchOptions } from '../lib/browser.mjs';
import { diagnosticEnv } from '../lib/env.mjs';
import { fromInvocation } from '../lib/paths.mjs';
import { machineLines } from '../lib/report.mjs';

const saved = {
  INIT_CWD: process.env.INIT_CWD,
  BENCH_JS_FLAGS: process.env.BENCH_JS_FLAGS,
  BENCH_CHROMIUM_ARGS: process.env.BENCH_CHROMIUM_ARGS,
};

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

  test('diagnostic flags are recorded in the report, so a run with them cannot pass for a plain one', () => {
    delete process.env.BENCH_JS_FLAGS;
    delete process.env.BENCH_CHROMIUM_ARGS;
    assert.deepEqual(diagnosticEnv(), {});
    process.env.BENCH_JS_FLAGS = '--no-maglev';
    process.env.BENCH_CHROMIUM_ARGS = '--disable-features=Foo';
    const diagnostics = diagnosticEnv();
    assert.deepEqual(diagnostics, {
      BENCH_JS_FLAGS: '--no-maglev',
      BENCH_CHROMIUM_ARGS: '--disable-features=Foo',
    });
    const meta = {
      date: '2026-10-23T00:00:00.000Z',
      durationMs: 1000,
      machine: { cpu: 'cpu', cores: 12, memGB: 32, os: 'Darwin' },
      node: 'v24',
      playwright: '1.61.1',
      browser: {
        userAgent: 'Chrome/149.0.0.0',
        renderer: 'r',
        crossOriginIsolated: true,
        preciseHeap: true,
      },
      raster: 'gpu',
      load: { start: 1, end: 1 },
      noisyRounds: 0,
      totalRounds: 1,
      noiseThreshold: 6,
      loadPerCore: 0.5,
    };
    assert.ok(!machineLines(meta).join('\n').includes('diagnostic'));
    const browserLine = machineLines({ ...meta, diagnostics }).find((l) =>
      l.includes('**Browser:**'),
    );
    assert.match(
      browserLine,
      /diagnostic flags: BENCH_JS_FLAGS=`--no-maglev`, BENCH_CHROMIUM_ARGS=`--disable-features=Foo`/,
    );
  });
});
