#!/usr/bin/env node
// Screenshot every fixture on the hidden #/visual regression harness at DPR 2.
//
// Usage: node site/scripts/screenshots.mjs [--filter <slug-substring>]
//
// Starts the Vite dev server (no build step), opens #/visual, and writes one
// PNG per `[data-fixture]` panel into site/screenshots/ (gitignored).
// Playwright is hoisted from the bench workspace, so run this from anywhere in
// the repo. Install the browser once with `npx playwright install chromium`.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const siteDir = resolve(scriptDir, '..');
const repoDir = resolve(siteDir, '..');
const outDir = join(siteDir, 'screenshots');

const args = process.argv.slice(2);
const filterIdx = args.indexOf('--filter');
const filter = filterIdx >= 0 ? args[filterIdx + 1] ?? '' : '';

const PORT = 4317;
const URL = `http://127.0.0.1:${PORT}/snaplot/#/visual`;

function viteBin() {
  for (const dir of [repoDir, siteDir]) {
    const bin = join(dir, 'node_modules', '.bin', 'vite');
    if (existsSync(bin)) return bin;
  }
  return null;
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`dev server did not respond at ${url} within ${timeoutMs}ms`);
}

async function main() {
  const bin = viteBin();
  if (!bin) {
    console.error('vite binary not found; run `npm install` first');
    process.exit(2);
  }

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('playwright not installed; run `npm install`');
    process.exit(2);
  }

  // Bind IPv4 explicitly: the default `localhost` bind can resolve to ::1,
  // which the 127.0.0.1 poll and page URL below would never reach.
  const server = spawn(bin, ['--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: siteDir,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const stop = () => {
    if (!server.killed) server.kill();
  };
  process.on('exit', stop);

  try {
    // The dev server serves under the `/snaplot/` base; poll that, not `/`.
    await waitForServer(`http://127.0.0.1:${PORT}/snaplot/`, 30_000);

    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    page.on('pageerror', (err) => console.error('  page error:', err.message));

    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-fixture]');
    // Let the one-shot rAF cursor/highlight side effects and any density
    // bitmap paint settle before capturing.
    await page.waitForTimeout(700);

    const slugs = (
      await page.$$eval('[data-fixture]', (els) =>
        els.map((el) => el.getAttribute('data-fixture')),
      )
    ).filter((slug) => slug && (!filter || slug.includes(filter)));

    mkdirSync(outDir, { recursive: true });
    for (const slug of slugs) {
      const el = await page.$(`[data-fixture="${slug}"]`);
      if (!el) continue;
      const file = join(outDir, `${slug}.png`);
      if (slug === 'tooltip-open') {
        // The tooltip is a position:fixed node on <body>, invisible to an
        // element screenshot. Hover the chart with a real pointer and clip
        // the viewport to this fixture's box so the overlay is captured.
        await el.scrollIntoViewIfNeeded();
        const box = await el.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.55);
          await page.waitForTimeout(150);
          await page.screenshot({ path: file, clip: box });
          await page.mouse.move(0, 0);
        }
      } else {
        await el.screenshot({ path: file });
      }
      console.log(`  wrote ${file}`);
    }

    await browser.close();
    console.log(`\n${slugs.length} fixture screenshot(s) in ${outDir}`);
  } finally {
    stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
