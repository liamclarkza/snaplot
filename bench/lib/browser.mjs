// Browser side of the drivers: profiles, raster modes, a static server for a built bench page, and
// running one scenario on a fresh page.

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
import { benchDir } from './paths.mjs';

/** The mobile profile approximates a mid-range phone; neither is a real device. */
export const PROFILES = {
  desktop: {
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    hasTouch: false,
    cpuThrottle: 1,
  },
  mobile: {
    viewport: { width: 390, height: 720 },
    deviceScaleFactor: 3,
    hasTouch: true,
    cpuThrottle: 4,
  },
};

// gap-perf-gate-07: without these, usedJSHeapSize is a quantised constant and gc() is missing.
// Diagnostics only: BENCH_JS_FLAGS adds V8 flags to the same --js-flags switch.
function memoryFlags() {
  const v8 = ['--expose-gc', ...(process.env.BENCH_JS_FLAGS ?? '').split(/\s+/).filter(Boolean)];
  return ['--enable-precise-memory-info', `--js-flags=${v8.join(' ')}`];
}

/**
 * Raster modes (gap-perf-gate-02). `gpu` (default) is the full Chromium build in new-headless mode
 * with GPU rasterisation: it matched headed runs within 5% in the audit. `software` is the headless
 * shell, which rasterises canvas in software (SwiftShader); it overstates raster-heavy paths and is
 * kept as a named profile for software-raster budgets and CI.
 */
export function launchOptions(raster, { headed = false } = {}) {
  const options = baseLaunchOptions(raster, headed);
  // Diagnostics only: extra Chromium switches (the report names them, lib/report.mjs).
  const extra = (process.env.BENCH_CHROMIUM_ARGS ?? '').split(/\s+/).filter(Boolean);
  return extra.length ? { ...options, args: [...options.args, ...extra] } : options;
}

function baseLaunchOptions(raster, headed) {
  if (raster === 'gpu') {
    return {
      channel: 'chromium',
      headless: !headed,
      args: [
        ...memoryFlags(),
        '--enable-gpu',
        '--enable-gpu-rasterization',
        // Pin canvas 2D to out-of-process raster. Left to Chromium, contexts alternate between
        // two canvas paths whose main-thread cost differs by about 1.5x, which made run-to-run
        // busy times bimodal (bench/README.md, "Method").
        '--canvas-oop-rasterization',
        '--ignore-gpu-blocklist',
        ...(process.platform === 'darwin' ? ['--use-angle=metal'] : []),
      ],
    };
  }
  if (raster === 'software') {
    return {
      headless: !headed,
      args: [...memoryFlags(), ...(headed ? ['--disable-gpu'] : [])],
    };
  }
  throw new Error(`unknown --raster ${raster} (expected gpu or software)`);
}

export async function loadPlaywright() {
  const require = createRequire(join(benchDir, 'package.json'));
  try {
    return require('playwright');
  } catch {
    throw new Error('playwright is not installed; run npm ci at the repository root');
  }
}

export async function launch(chromium, raster, options = {}) {
  try {
    return await chromium.launch(launchOptions(raster, options));
  } catch (err) {
    const first = String(err?.message ?? err).split('\n')[0];
    throw new Error(
      `failed to launch Chromium (${raster}): ${first}\n  npx playwright install chromium`,
    );
  }
}

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.map': 'application/json',
  '.json': 'application/json',
};

/**
 * Serves a built page on an ephemeral 127.0.0.1 port. COOP/COEP make the page cross-origin
 * isolated, which gives `performance.now()` 5 µs resolution instead of 100 µs.
 */
export function serve(dir) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
      const file = normalize(join(dir, urlPath === '/' ? 'index.html' : urlPath));
      if (!file.startsWith(dir)) {
        res.writeHead(403);
        res.end();
        return;
      }
      try {
        const body = readFileSync(file);
        res.writeHead(200, {
          'content-type': MIME[extname(file)] ?? 'application/octet-stream',
          'cache-control': 'no-store',
          'cross-origin-opener-policy': 'same-origin',
          'cross-origin-embedder-policy': 'require-corp',
        });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}/`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

function withTimeout(promise, ms, what) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms / 1000}s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Sum of a sampling heap profile's allocations (unbiased estimate of bytes allocated). */
function sampledBytes(node) {
  let total = node.selfSize ?? 0;
  for (const child of node.children ?? []) total += sampledBytes(child);
  return total;
}

async function openPage(browser, url, profileName, api, { heapProfile = false } = {}) {
  const profile = PROFILES[profileName];
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    hasTouch: profile.hasTouch,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  if (profile.cpuThrottle > 1) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuThrottle });
  }
  const marks = {};
  await page.exposeFunction('__benchMark', async (label) => {
    // Task time is read before stopping the profiler, whose serialisation runs on the page.
    const { metrics } = await cdp.send('Performance.getMetrics');
    marks[label] = metrics.find((m) => m.name === 'TaskDuration')?.value ?? null;
    if (heapProfile && label === 'end') {
      const { profile: sampled } = await cdp.send('HeapProfiler.stopSampling');
      marks.allocBytes = sampledBytes(sampled.head);
    }
    if (heapProfile && label === 'start') {
      // Counts every allocation in the window, including objects scavenges already collected.
      await cdp.send('HeapProfiler.enable');
      await cdp.send('HeapProfiler.startSampling', {
        samplingInterval: 16_384,
        includeObjectsCollectedByMajorGC: true,
        includeObjectsCollectedByMinorGC: true,
      });
    }
  });
  await page.goto(api ? `${url}?api=${api}` : url);
  await page.waitForFunction(() => window.__snaplotBench?.ready === true, null, {
    timeout: 60_000,
  });
  return { context, page, errors, marks };
}

/** Reads the page's API, renderer and scenario list. */
export async function pageInfo(browser, url, profileName, api) {
  const { context, page } = await openPage(browser, url, profileName, api);
  try {
    return await page.evaluate(() => window.__snaplotBench.info());
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * Runs one scenario on a fresh context, so one scenario's leftovers (rAFs, observers, heap) cannot
 * skew the next. Adds `taskMsPerOp` from CDP TaskDuration over the window the scenario marked,
 * and with `heapProfile` also `allocKBPerOp` from CDP's sampling heap profiler over that window.
 * The page's `heap.grossKBPerOp` (usedJSHeapSize increments) is a lower bound once a frame
 * allocates enough to trigger a scavenge between samples; the sampled figure is not, but the
 * profiler adds overhead, so it is opt-in (`--heap-profile`).
 */
export async function runScenario(
  browser,
  { url, profile, name, api, heapProfile = false, timeoutMs = 240_000 },
) {
  let opened;
  try {
    opened = await openPage(browser, url, profile, api, { heapProfile });
    const result = await withTimeout(
      opened.page.evaluate((n) => window.__snaplotBench.run(n), name),
      timeoutMs,
      name,
    );
    const { start, end } = opened.marks;
    result.taskMsPerOp =
      typeof start === 'number' && typeof end === 'number' && result.ops > 0
        ? Math.round(((end - start) * 1000 * 10_000) / result.ops) / 10_000
        : null;
    if (typeof opened.marks.allocBytes === 'number' && result.ops > 0) {
      result.allocKBPerOp = Math.round((opened.marks.allocBytes / 1024 / result.ops) * 100) / 100;
    }
    if (opened.errors.length) result.pageErrors = opened.errors.slice(0, 3);
    return result;
  } catch (err) {
    return {
      name,
      valid: false,
      error: String(err?.message ?? err).split('\n')[0],
      pageErrors: opened?.errors.slice(0, 3) ?? [],
    };
  } finally {
    await opened?.context.close().catch(() => {});
  }
}
