#!/usr/bin/env node
// Example thumbnails (plan §10.3).
//
//   npm run thumbs                         write site/public/examples/<slug>.jpg for every built demo,
//                                          and the site's social card, site/public/examples/social-card.jpg
//   options: --only <slug,…>  --url <origin of a running preview>
//
// Build first: `npm run build && npm run build:site`. The script serves site/dist with
// `astro preview` on 127.0.0.1:$PORT (5346 by default, M16a's port) unless --url names a running
// server, and waits for the bench lock like every Playwright run (plan §11.1).
//
// A thumbnail is the demo page at 1280 × 800 CSS pixels, rendered at half density (640 × 400) as a
// JPEG of at most 60 KB (Playwright cannot write WebP).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(repo, 'site');
const args = process.argv.slice(2);
const value = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const MAX_BYTES = 60 * 1024;
/** The social card (og:image) of the homepage, the hub and the docs: 1200 × 630, at most 150 KB. */
const CARD = { file: 'social-card.jpg', width: 1200, height: 630, maxBytes: 150 * 1024 };
const VIEWPORT = { width: 1280, height: 800 };
const BASE = '/snaplot/';

const { chromium } = createRequire(join(site, 'package.json'))('@playwright/test');

// --- which demos ----------------------------------------------------------------------------------
const listed = [
  ...readFileSync(join(site, 'src/lib/demos.ts'), 'utf8').matchAll(/slug: '([^']+)'/g),
].map((m) => m[1]);
const only = value('--only')?.split(',');
const slugs = listed
  .filter((slug) => !only || only.includes(slug))
  .filter((slug) => existsSync(join(site, 'dist/examples', slug, 'index.html')));
if (!existsSync(join(site, 'dist/index.html'))) {
  console.error('thumbs: site/dist is missing. Run `npm run build && npm run build:site` first.');
  process.exit(1);
}
if (slugs.length === 0) {
  console.error('thumbs: no demo page is built (site/dist/examples/<slug>/index.html).');
  process.exit(1);
}

// --- the preview server and the bench lock ----------------------------------------------------------
function mainCheckout() {
  const gitDir = join(repo, '.git');
  if (statSync(gitDir).isFile()) {
    const pointer = /gitdir: (.+)/.exec(readFileSync(gitDir, 'utf8'))?.[1]?.trim() ?? '';
    return join(pointer, '..', '..', '..');
  }
  return repo;
}

async function waitForBenchLock() {
  const lock = join(mainCheckout(), '.claude', 'bench.lock');
  let told = false;
  while (existsSync(lock) && Date.now() - statSync(lock).mtimeMs < 2 * 3600_000) {
    if (!told) console.error(`thumbs: waiting for the bench lock ${lock}`);
    told = true;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

async function serve() {
  const url = value('--url');
  if (url) return { origin: url.replace(/\/$/, ''), stop() {} };
  const port = Number(process.env.PORT ?? 5346);
  const server = spawn(
    'npx',
    ['astro', 'preview', '--host', '127.0.0.1', '--port', String(port), '--ignore-lock'],
    { cwd: site, stdio: 'ignore', detached: true },
  );
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${origin}${BASE}`)).ok) {
        return { origin, stop: () => process.kill(-server.pid, 'SIGTERM') };
      }
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  process.kill(-server.pid, 'SIGTERM');
  throw new Error(`thumbs: astro preview did not answer on ${origin}`);
}

// --- in-page probes ---------------------------------------------------------------------------------
/** Resolves once the demo has painted: `window.demo`, `[data-ready]` or a painted canvas. */
async function settle(page) {
  await page.waitForFunction(
    () => {
      if ('demo' in window || document.querySelector('[data-ready]')) return true;
      for (const canvas of document.querySelectorAll('main canvas')) {
        if (canvas.width === 0 || canvas.height === 0) continue;
        const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        let painted = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 0 && ++painted > 2000) return true;
      }
      return false;
    },
    undefined,
    { timeout: 30_000, polling: 250 },
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
}

// --- run --------------------------------------------------------------------------------------------
await waitForBenchLock();
const server = await serve();
const browser = await chromium.launch();
const problems = [];
const out = join(site, 'public/examples');
mkdirSync(out, { recursive: true });

try {
  for (const slug of slugs) {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 0.5,
      colorScheme: 'light',
      reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    // A demo may open external pages or stream; nothing leaves the machine.
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
    const response = await page.goto(`${server.origin}${BASE}examples/${slug}/`);
    if (!response?.ok()) problems.push(`${slug}: HTTP ${response?.status()}`);
    await settle(page);
    let quality = 80;
    let shot = await page.screenshot({ type: 'jpeg', quality });
    while (shot.length > MAX_BYTES && quality > 40) {
      quality -= 5;
      shot = await page.screenshot({ type: 'jpeg', quality });
    }
    const file = join(out, `${slug}.jpg`);
    writeFileSync(file, shot);
    console.log(`thumbs: ${slug}.jpg ${(shot.length / 1024).toFixed(1)} KB (quality ${quality})`);
    await context.close();
  }

  // The social card: the top of the homepage, with the sentence and the hero.
  {
    const file = join(out, CARD.file);
    const context = await browser.newContext({
      viewport: { width: CARD.width, height: CARD.height },
      colorScheme: 'light',
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
    await page.goto(`${server.origin}${BASE}`);
    await page.locator('[data-example] [role="tabpanel"]:not([hidden]) canvas').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    const card = await page.screenshot({ type: 'jpeg', quality: 80 });
    writeFileSync(file, card);
    console.log(`thumbs: ${CARD.file} ${(card.length / 1024).toFixed(1)} KB`);
    await context.close();
  }
} finally {
  await browser.close();
  server.stop();
}

if (problems.length > 0) {
  console.error(
    `thumbs: ${problems.length} problem(s):\n${problems.map((p) => `- ${p}`).join('\n')}`,
  );
  process.exit(1);
}
console.log(`thumbs: wrote ${slugs.length} demo(s); no problems.`);
