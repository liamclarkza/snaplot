#!/usr/bin/env node
// Playwright driver for the snaplot benchmark suite.
//
// Usage:
//   node bench/run.mjs                         # all scenarios, desktop + mobile
//   node bench/run.mjs --profile mobile        # one profile
//   node bench/run.mjs --filter scatter-pan    # scenario name substring
//   node bench/run.mjs --out bench/results/pr.json
//   node bench/run.mjs --save-baseline         # also write bench/baselines/baseline.json
//
// The mobile profile approximates a mid-range phone: 4x CPU throttling,
// DPR 3, a 390px touch viewport. Numbers are only comparable across runs
// on the same machine; treat cross-machine deltas as noise.

import { execSync, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const benchDir = dirname(fileURLToPath(import.meta.url));
const repoDir = resolve(benchDir, '..');

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const profileArg = argValue('--profile', 'all');
const filter = argValue('--filter', '');
const outPath = argValue('--out', join(benchDir, 'results', 'latest.json'));
const saveBaseline = args.includes('--save-baseline');
const skipBuild = args.includes('--skip-build');
// Headless shell rasterizes canvas in software, which overstates blit-heavy
// paths (drawImage stamps) relative to real devices. --headed uses the GPU.
const headed = args.includes('--headed');

const PROFILES = {
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

const profileNames =
  profileArg === 'all' ? Object.keys(PROFILES) : profileArg.split(',');
for (const p of profileNames) {
  if (!PROFILES[p]) {
    console.error(`unknown profile "${p}" (expected: desktop, mobile, all)`);
    process.exit(2);
  }
}

if (!skipBuild) {
  console.log('building bench bundle...');
  execSync('npx vite build', { cwd: benchDir, stdio: 'inherit' });
}

const distDir = join(benchDir, 'dist');
if (!existsSync(join(distDir, 'index.html'))) {
  console.error('bench/dist/index.html missing; build failed?');
  process.exit(2);
}

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.map': 'application/json',
  '.json': 'application/json',
};

function startServer() {
  return new Promise((resolvePromise) => {
    const server = createServer((req, res) => {
      const urlPath = (req.url ?? '/').split('?')[0];
      const filePath = join(distDir, urlPath === '/' ? 'index.html' : urlPath);
      try {
        const body = readFileSync(filePath);
        res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => {
      resolvePromise({ server, port: server.address().port });
    });
  });
}

function gitSha() {
  const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoDir, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : 'unknown';
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('playwright is not installed; run: npm install');
    process.exit(2);
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: !headed });
  } catch (err) {
    console.error('failed to launch Chromium. Install it with:');
    console.error('  npx playwright install chromium');
    console.error(String(err?.message ?? err).split('\n')[0]);
    process.exit(2);
  }

  const { server, port } = await startServer();
  const url = `http://127.0.0.1:${port}/`;
  const output = {
    meta: {
      sha: gitSha(),
      date: new Date().toISOString(),
      node: process.version,
      filter: filter || null,
    },
    profiles: {},
  };

  async function openPage(profile) {
    if (!browser.isConnected()) {
      console.log('  (relaunching crashed browser)');
      browser = await chromium.launch({ headless: !headed });
    }
    const context = await browser.newContext({
      viewport: profile.viewport,
      deviceScaleFactor: profile.deviceScaleFactor,
      hasTouch: profile.hasTouch,
    });
    const page = await context.newPage();
    page.on('pageerror', (err) => console.error('  page error:', err.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuThrottle });
    await page.goto(url);
    await page.waitForFunction(() => typeof window.__snaplotBench !== 'undefined');
    return { context, page };
  }

  for (const profileName of profileNames) {
    const profile = PROFILES[profileName];
    console.log(`\n=== profile: ${profileName} (throttle ${profile.cpuThrottle}x, dpr ${profile.deviceScaleFactor}) ===`);
    let { context, page } = await openPage(profile);

    const names = (await page.evaluate(() => window.__snaplotBench.list())).filter(
      (n) => !filter || n.includes(filter),
    );

    const results = [];
    for (const name of names) {
      process.stdout.write(`  ${name} ... `);
      try {
        // Fresh page per scenario so one scenario's leftovers (leaked
        // rAFs, observers, heap growth) cannot skew the next one.
        await page.reload();
        await page.waitForFunction(() => typeof window.__snaplotBench !== 'undefined');
        const r = await page.evaluate(
          (scenarioName) => window.__snaplotBench.run(scenarioName),
          name,
        );
        results.push(r);
        const flag = r.valid ? '' : '  INVALID';
        console.log(`median ${r.frame.medianMs}ms  p95 ${r.frame.p95Ms}ms${flag}`);
      } catch (err) {
        console.log('FAILED');
        console.error('   ', String(err?.message ?? err).split('\n')[0]);
        results.push({ name, valid: false, error: String(err?.message ?? err) });
        // A renderer crash (heavy software-raster scenarios can OOM the
        // headless shell) takes the page down; rebuild and continue.
        try {
          await context.close();
        } catch {}
        ({ context, page } = await openPage(profile));
      }
    }
    output.profiles[profileName] = {
      cpuThrottle: profile.cpuThrottle,
      deviceScaleFactor: profile.deviceScaleFactor,
      viewport: profile.viewport,
      results,
    };
    // Persist after every profile so a crash cannot lose completed work.
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
    await context.close();
  }

  await browser.close();
  server.close();
  console.log(`\nwrote ${outPath}`);
  if (saveBaseline) {
    const baselinePath = join(benchDir, 'baselines', 'baseline.json');
    mkdirSync(dirname(baselinePath), { recursive: true });
    writeFileSync(baselinePath, JSON.stringify(output, null, 2) + '\n');
    console.log(`wrote ${baselinePath}`);
  }

  printTable(output);
}

function printTable(output) {
  for (const [profileName, profile] of Object.entries(output.profiles)) {
    console.log(`\n#### ${profileName}\n`);
    console.log('| scenario | median ms | p95 ms | >16.7ms | data ms | grid ms | heap MB |');
    console.log('| :-- | --: | --: | --: | --: | --: | --: |');
    for (const r of profile.results) {
      if (!r.frame) {
        console.log(`| ${r.name} | FAILED | | | | | |`);
        continue;
      }
      const invalid = r.valid ? '' : ' (!)';
      console.log(
        `| ${r.name}${invalid} | ${r.frame.medianMs} | ${r.frame.p95Ms} | ` +
          `${Math.round(r.frame.over60 * 100)}% | ${r.layers.data.meanMs} | ` +
          `${r.layers.grid.meanMs} | ${r.heapDeltaMB ?? ''} |`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
