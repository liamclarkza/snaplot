// The page's sweep loop (src/metrics.ts), bundled with esbuild and run against a minimal fake
// window: animation frames are timers, and the "library" is a callback that paints in the next
// frame through the instrumented requestAnimationFrame, as a chart does.

import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
let metrics;

before(async () => {
  globalThis.window = globalThis;
  globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(performance.now()), 1);
  const out = await build({
    entryPoints: [join(srcDir, 'metrics.ts')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    logLevel: 'silent',
  });
  const code = Buffer.from(out.outputFiles[0].contents).toString('base64');
  metrics = await import(`data:text/javascript;base64,${code}`);
});

describe('sweep', () => {
  test('onWindowStart runs once, after the warm-up paints, so counters cover only measured operations', async () => {
    let paints = 0;
    let stepsRun = 0;
    let atWindowStart = null;
    const sw = await metrics.sweep({
      steps: 6,
      warmup: 4,
      markWindow: false,
      step: () => {
        stepsRun++;
        // The library paints in the next frame, as a chart's rAF render does.
        window.requestAnimationFrame(() => {
          paints++;
        });
      },
      onWindowStart: () => {
        assert.equal(atWindowStart, null, 'onWindowStart runs once');
        atWindowStart = { paints, stepsRun };
      },
    });
    assert.equal(sw.ops, 6);
    // Every warm-up operation has run and painted before the window opens.
    assert.deepEqual(atWindowStart, { paints: 4, stepsRun: 4 });
    // Paints since the window opened: exactly one per measured operation (not (warmup+steps)/steps).
    assert.equal(paints - atWindowStart.paints, sw.ops);
  });

  test('a rate-limited sweep warms up on operations, not frames', async () => {
    let frame = 0;
    let ops = 0;
    let opsAtStart = null;
    const sw = await metrics.sweep({
      steps: 8,
      warmup: 3,
      markWindow: false,
      step: () => {
        frame++;
        if (frame % 2 === 0) return false;
        ops++;
        return true;
      },
      onWindowStart: () => {
        opsAtStart = ops;
      },
    });
    // A stream appending every other frame runs all 3 warm-up appends (frames 1, 3 and 5), not
    // the 2 that fall in the first 3 frames: cold JIT code stays out of the window.
    assert.equal(opsAtStart, 3);
    assert.equal(ops - opsAtStart, sw.ops);
    // The window still spans `steps` frames: 4 of its 8 do an operation.
    assert.equal(sw.ops, 4);
  });

  test('counts read at onWindowStart and onWindowEnd cover the measured operations at any paint latency', async () => {
    for (const latency of [1, 2, 3]) {
      let paints = 0;
      let start = null;
      let end = null;
      let ends = 0;
      // A library that paints `latency` frames after the operation (a theme resolve, then a render).
      const later = (frames, fn) =>
        frames === 0 ? fn() : window.requestAnimationFrame(() => later(frames - 1, fn));
      const sw = await metrics.sweep({
        steps: 7,
        warmup: 3,
        markWindow: false,
        step: () => {
          later(latency, () => {
            paints++;
          });
        },
        onWindowStart: () => {
          start = paints;
        },
        onWindowEnd: () => {
          ends++;
          end = paints;
        },
      });
      assert.equal(ends, 1, `latency ${latency}: onWindowEnd runs once`);
      assert.equal(end - start, sw.ops, `latency ${latency}`);
    }
  });
});
