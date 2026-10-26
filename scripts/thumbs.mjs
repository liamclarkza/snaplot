#!/usr/bin/env node
// Example thumbnails and the montage check (plan §10.3).
//
//   npm run thumbs                         write site/public/examples/<slug>.jpg for every built demo,
//                                          and the site's social card, site/public/examples/social-card.jpg
//   npm run thumbs -- --montage            also write the contact sheet, site/.generated/montage.jpg
//   npm run thumbs -- --montage --check    verify instead of writing: thumbnails, montage rules and
//                                          the banned-pattern lint; exit 1 on any problem
//   npm run thumbs -- --self-test          prove the check catches what it bans, on a page made of
//                                          the banned patterns (no server or build needed)
//   options: --only <slug,…>  --url <origin of a running preview>
//
// Build first: `npm run build && npm run build:site`. The script serves site/dist with
// `astro preview` on 127.0.0.1:$PORT (5346 by default, M16a's port) unless --url names a running
// server, and waits for the bench lock like every Playwright run (plan §11.1).
//
// A thumbnail is the demo page at 1280 × 800 CSS pixels, rendered at half density (640 × 400) as a
// JPEG of at most 60 KB (Playwright cannot write WebP). Each demo says how to take it in
// site/src/demos/<slug>/thumbnail.json: `path` and `query` to open (`?paused` holds a stream
// still), the `viewport` (1280 × 800) and `ready`, the selector that marks the first paint
// (`html[data-demo-ready]` on all six). Without that file the script opens the page and waits for
// `window.demo`, `[data-ready]` or a painted canvas. The check fails when two demos share:
// - a background colour (CIEDE2000 < 2) and the body font family;
// - a background colour and the number of chart columns at 1280 px (distinct left edges of the
//   chart canvases in the page's main region);
// - the hash of the top three levels of their DOM skeleton.
// It also fails on the banned patterns of plan §10.1 #8 found in a demo's DOM or source: an eyebrow
// over the h1, a slogan h1, a row of KPI tiles, cards with shadows, gradient or glow backgrounds,
// fake window chrome, letter logos, an app switcher, and hard-coded deltas (a change such as
// "+8.4% this hour" whose number is written in the demo's source, not computed from its data).
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(repo, 'site');
const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const value = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const CHECK = has('--check');
const MONTAGE = has('--montage');
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

// --- colour: CIEDE2000 (the formula of scripts/check-palettes.mjs) ---------------------------------
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function toLab([r8, g8, b8]) {
  const [r, g, b] = [r8, g8, b8].map((c) => lin(c / 255));
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
function deltaE2000([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180;
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const [a1p, a2p] = [(1 + G) * a1, (1 + G) * a2];
  const [C1p, C2p] = [Math.hypot(a1p, b1), Math.hypot(a2p, b2)];
  const hue = (b, a) => (((Math.atan2(b, a) / rad) % 360) + 360) % 360;
  const [h1p, h2p] = [hue(b1, a1p), hue(b2, a2p)];
  let dh = h2p - h1p;
  if (C1p * C2p === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dL = L2 - L1;
  const dC = C2p - C1p;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh / 2) * rad);
  const Lb = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hb = h1p + h2p;
  if (C1p * C2p !== 0) hb = Math.abs(h1p - h2p) > 180 ? (hb + (hb < 360 ? 360 : -360)) / 2 : hb / 2;
  const T =
    1 -
    0.17 * Math.cos((hb - 30) * rad) +
    0.24 * Math.cos(2 * hb * rad) +
    0.32 * Math.cos((3 * hb + 6) * rad) -
    0.2 * Math.cos((4 * hb - 63) * rad);
  const dT = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const SC = 1 + 0.045 * Cbp;
  const SH = 1 + 0.015 * Cbp * T;
  const RT = -Math.sin(2 * dT * rad) * RC;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

// --- in-page probes ---------------------------------------------------------------------------------
/**
 * How to take a demo's thumbnail: its site/src/demos/<slug>/thumbnail.json (M16b and M16c wrote
 * the format), over the defaults.
 */
function hook(slug) {
  const defaults = { slug, path: `examples/${slug}/`, query: '', viewport: VIEWPORT, ready: '' };
  const file = join(site, 'src/demos', slug, 'thumbnail.json');
  if (!existsSync(file)) return { ...defaults, problems: [] };
  const found = { ...defaults, ...JSON.parse(readFileSync(file, 'utf8')) };
  const problems = [];
  if (found.slug !== slug) problems.push(`${slug}: thumbnail.json names the slug ${found.slug}`);
  if (found.viewport.width !== VIEWPORT.width || found.viewport.height !== VIEWPORT.height) {
    problems.push(
      `${slug}: thumbnail.json asks for ${found.viewport.width} × ${found.viewport.height}, not 1280 × 800`,
    );
  }
  if (found.query && !found.query.startsWith('?'))
    problems.push(`${slug}: query must start with ?`);
  return { ...found, problems };
}

/**
 * Resolves once the demo has painted: its `ready` selector, or else `window.demo`, `[data-ready]`
 * or a painted canvas.
 */
async function settle(page, ready) {
  if (ready) await page.waitForSelector(ready, { state: 'attached', timeout: 30_000 });
  else
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

/** The montage facts and banned patterns of the page, from computed styles. */
function probe() {
  const rgb = (css) =>
    css
      .match(/[\d.]+/g)
      ?.slice(0, 4)
      .map(Number) ?? [0, 0, 0, 0];
  const opaque = (css) => (rgb(css)[3] ?? 1) > 0 && css !== 'transparent';
  const background =
    [document.body, document.documentElement]
      .map((el) => getComputedStyle(el).backgroundColor)
      .find(opaque) ?? 'rgb(255, 255, 255)';
  const font = getComputedStyle(document.body).fontFamily.split(',')[0].trim().replace(/["']/g, '');
  const main = document.querySelector('main') ?? document.body;
  const lefts = [];
  for (const canvas of main.querySelectorAll('canvas')) {
    const box = canvas.getBoundingClientRect();
    if (box.width < 40 || box.height < 40) continue;
    if (!lefts.some((left) => Math.abs(left - box.left) < 8)) lefts.push(box.left);
  }
  const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'TEMPLATE', 'NOSCRIPT']);
  const skeleton = (el, depth) => {
    const kids = [...el.children].filter((child) => !SKIP.has(child.tagName));
    return depth === 0 || kids.length === 0
      ? el.tagName
      : `${el.tagName}(${kids.map((child) => skeleton(child, depth - 1)).join(',')})`;
  };

  const banned = [];
  const text = (el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  const h1 = document.querySelector('h1');
  if (h1) {
    const before = h1.previousElementSibling;
    if (before) {
      const style = getComputedStyle(before);
      const spacing = Number.parseFloat(style.letterSpacing) / Number.parseFloat(style.fontSize);
      const shouting =
        style.textTransform === 'uppercase' || /^[^a-z]*[A-Z]{3}[^a-z]*$/.test(text(before));
      if (shouting && spacing > 0.05) banned.push(`an eyebrow over the h1: "${text(before)}"`);
    }
    if (/[.!]$/.test(text(h1))) banned.push(`a slogan h1: "${text(h1)}"`);
  }
  const numeric = /^[-+−]?[$€£]?[\d.,]+\s?[%a-zA-Z°]{0,4}$/;
  for (const el of [
    document.documentElement,
    document.body,
    ...document.querySelectorAll('body *'),
  ]) {
    const style = getComputedStyle(el);
    if (/gradient\(/.test(style.backgroundImage))
      banned.push(`a gradient background on <${el.tagName.toLowerCase()} class="${el.className}">`);
    const kids = [...el.children];
    if (kids.length >= 3) {
      const tiles = kids.filter((kid) =>
        [kid, ...kid.querySelectorAll('*')].some(
          (node) =>
            Number.parseFloat(getComputedStyle(node).fontSize) >= 22 &&
            node.children.length === 0 &&
            numeric.test(text(node)),
        ),
      );
      if (tiles.length >= 3)
        banned.push(
          `a row of ${tiles.length} KPI tiles in <${el.tagName.toLowerCase()} class="${el.className}">`,
        );
    }
    const box = el.getBoundingClientRect();
    if (
      /^[A-Z]$/.test(text(el)) &&
      box.width >= 20 &&
      box.width <= 64 &&
      Math.abs(box.width - box.height) < 6 &&
      Number.parseFloat(style.borderRadius) > 0 &&
      opaque(style.backgroundColor)
    ) {
      banned.push(`a letter logo "${text(el)}"`);
    }
  }
  // Shown elements only: the library's tooltips wait in the body, hidden, with their own shadow.
  const shown = (el) => {
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return (
      style.visibility !== 'hidden' && Number(style.opacity) > 0 && box.width > 0 && box.height > 0
    );
  };
  const shadows = [...document.querySelectorAll('body *')].filter(
    (el) => getComputedStyle(el).boxShadow !== 'none' && shown(el),
  );
  if (shadows.length >= 3) banned.push(`${shadows.length} elements with shadows (a card grid)`);
  const body = text(document.body);
  if (/●\s*●\s*●/.test(body)) banned.push('fake window chrome (● ● ●)');
  // A delta is banned when it is typed into the page, not computed: see hardCoded().
  const deltas = [...body.matchAll(/[+−-]\d+(?:\.\d+)?\s?%\s+(?:vs|this|from|since)\b/gi)].map(
    (match) => match[0],
  );
  const demoLinks = new Set(
    [...document.querySelectorAll('a[href*="/examples/"]')]
      .map((a) => /\/examples\/([^/#?]+)\/?(?:[#?].*)?$/.exec(a.getAttribute('href') ?? '')?.[1])
      .filter(Boolean),
  );
  if (demoLinks.size >= 2) banned.push(`an app switcher (links to ${[...demoLinks].join(', ')})`);

  return {
    background: rgb(background).slice(0, 3),
    font,
    columns: lefts.length,
    skeleton: skeleton(document.body, 3),
    banned,
    deltas,
  };
}

/**
 * The deltas a page shows whose number is written in its source ("+8.4% this hour" in the markup)
 * rather than computed from its data (R1's "+37.1% from its minimum" comes from `pct(rise)`).
 */
function hardCoded(deltas, sources) {
  return deltas.filter((delta) => {
    const number = /\d+(?:\.\d+)?/.exec(delta)?.[0] ?? '';
    const literal = new RegExp(`(?<![\\d.])${number.replace('.', '\\.')}\\s?%`);
    return sources.some((source) => literal.test(source));
  });
}

/** Banned patterns in a demo's own source: its page, its CSS and its modules. */
/** A demo's page and its modules and styles (not its tests or data), comments removed. */
function demoSources(slug) {
  const files = [join(site, 'src/pages/examples', `${slug}.astro`)];
  const dir = join(site, 'src/demos', slug);
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) {
      if (/\.(css|ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) files.push(join(dir, name));
    }
  }
  return files
    .filter((file) => existsSync(file))
    .map((file) => ({ file, source: readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') }));
}

function sourceLint(slug) {
  const found = [];
  for (const { file, source } of demoSources(slug)) {
    for (const pattern of [
      /box-shadow\s*:/,
      /(?:linear|radial|conic)-gradient\(/,
      /backdrop-filter\s*:/,
    ]) {
      if (pattern.test(source)) found.push(`${file.slice(repo.length + 1)}: ${pattern.source}`);
    }
  }
  return found;
}

// --- self-test: a page made of the banned patterns -------------------------------------------------
const TEMPLATE_PAGE = `<!doctype html><html><head><style>
  body { margin: 0; font-family: Inter, sans-serif; background: #0f1117;
    background-image: radial-gradient(circle, #4f8fea33, transparent); }
  .eyebrow { text-transform: uppercase; letter-spacing: 0.14em; font-size: 11px; }
  .logo { display: inline-block; width: 32px; height: 32px; border-radius: 8px; background: #4f8fea; }
  .kpis { display: flex; gap: 16px; } .kpi { box-shadow: 0 4px 12px #0003; padding: 16px; }
  .kpi b { font-size: 28px; }
</style></head><body><header><span class="logo">P</span><span>● ● ● PULSEOPS</span>
  <nav><a href="/snaplot/examples/a/">A</a><a href="/snaplot/examples/b/">B</a></nav></header>
  <main><p class="eyebrow">PRODUCTION OVERVIEW</p><h1>Systems are healthy.</h1>
  <div class="kpis"><div class="kpi"><b>99.98%</b> Availability</div><div class="kpi"><b>182</b> p95 ms</div>
  <div class="kpi"><b>0.41%</b> Budget</div><div class="kpi"><b>+8.4%</b> this hour</div></div>
  <p>Traffic is +8.4% vs last week.</p></main></body></html>`;

/** R1's answer, as its page writes it from the data: a delta, but not a hard-coded one. */
const COMPUTED_PAGE = `<!doctype html><html><body><main><h1>Which checkpoint?</h1><p id="a"></p>
  <script>const rise = 0.3714; document.getElementById('a').textContent =
  'Run B overfits after epoch 12 (+' + (rise * 100).toFixed(1) + '% from its minimum).';</script>
  </main></body></html>`;

if (has('--self-test')) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.setContent(COMPUTED_PAGE);
  const computed = await page.evaluate(probe);
  await page.setContent(TEMPLATE_PAGE);
  const fact = await page.evaluate(probe);
  await browser.close();
  for (const delta of hardCoded(fact.deltas, [TEMPLATE_PAGE])) {
    fact.banned.push(`a hard-coded delta: "${delta}"`);
  }
  const passed =
    computed.deltas.length > 0 && hardCoded(computed.deltas, [COMPUTED_PAGE]).length === 0;
  const expected = [
    /eyebrow/,
    /slogan h1/,
    /KPI tiles/,
    /shadows/,
    /gradient/,
    /window chrome/,
    /letter logo/,
    /app switcher/,
    /hard-coded delta/,
  ];
  const missed = expected.filter((pattern) => !fact.banned.some((found) => pattern.test(found)));
  const white = toLab([255, 255, 255]);
  const colours = [
    deltaE2000(white, toLab([254, 254, 254])) < 2,
    deltaE2000(white, toLab([251, 248, 241])) >= 2,
  ];
  console.log(fact.banned.map((found) => `- found ${found}`).join('\n'));
  if (!passed) console.error('thumbs: the self-test flagged a delta its page computes');
  if (missed.length > 0 || colours.includes(false) || !passed) {
    console.error(`thumbs: the self-test missed ${missed.join(', ')} ${colours}`);
    process.exit(1);
  }
  console.log(
    'thumbs: the self-test found every banned pattern and passed a computed delta; ΔE00 tells white from cream.',
  );
  process.exit(0);
}

// --- run --------------------------------------------------------------------------------------------
await waitForBenchLock();
const server = await serve();
const browser = await chromium.launch();
const problems = [];
const shots = new Map();
const facts = new Map();
const out = join(site, 'public/examples');
mkdirSync(out, { recursive: true });

try {
  for (const slug of slugs) {
    const how = hook(slug);
    problems.push(...how.problems);
    const context = await browser.newContext({
      viewport: how.viewport,
      deviceScaleFactor: 0.5,
      colorScheme: 'light',
      reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    // A demo may open external pages or stream; nothing leaves the machine.
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
    const response = await page.goto(`${server.origin}${BASE}${how.path}${how.query}`);
    if (!response?.ok()) problems.push(`${slug}: HTTP ${response?.status()}`);
    await settle(page, how.ready);
    let quality = 80;
    let shot = await page.screenshot({ type: 'jpeg', quality });
    while (shot.length > MAX_BYTES && quality > 40) {
      quality -= 5;
      shot = await page.screenshot({ type: 'jpeg', quality });
    }
    shots.set(slug, shot);
    facts.set(slug, await page.evaluate(probe));
    const file = join(out, `${slug}.jpg`);
    if (CHECK) {
      if (!existsSync(file))
        problems.push(`${slug}: no thumbnail at site/public/examples/${slug}.jpg`);
      else if (statSync(file).size > MAX_BYTES) {
        problems.push(
          `${slug}: the thumbnail is ${(statSync(file).size / 1024).toFixed(1)} KB (max 60)`,
        );
      }
    } else {
      writeFileSync(file, shot);
      console.log(`thumbs: ${slug}.jpg ${(shot.length / 1024).toFixed(1)} KB (quality ${quality})`);
    }
    await context.close();
  }

  // The social card: the top of the homepage, with the sentence and the hero.
  {
    const file = join(out, CARD.file);
    if (CHECK) {
      if (!existsSync(file)) problems.push(`no social card at site/public/examples/${CARD.file}`);
      else if (statSync(file).size > CARD.maxBytes) problems.push(`the social card is over 150 KB`);
    } else {
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
  }

  if (MONTAGE) {
    const tiles = [...shots]
      .map(
        ([slug, shot]) =>
          `<figure><img src="data:image/jpeg;base64,${shot.toString('base64')}"><figcaption>${slug}</figcaption></figure>`,
      )
      .join('');
    const page = await browser.newPage({ viewport: { width: 3 * 640 + 4 * 16, height: 900 } });
    await page.setContent(
      `<style>body{margin:0;padding:16px;background:#777;font:14px system-ui;color:#fff;display:grid;grid-template-columns:repeat(3,640px);gap:16px}figure{margin:0}img{display:block;width:640px;height:400px}</style>${tiles}`,
    );
    const dir = join(site, '.generated');
    mkdirSync(dir, { recursive: true });
    await page.screenshot({
      path: join(dir, 'montage.jpg'),
      type: 'jpeg',
      quality: 80,
      fullPage: true,
    });
    console.log('thumbs: montage at site/.generated/montage.jpg');
  }

  // The montage rules, pair by pair, and the banned patterns, page by page.
  const rows = [];
  for (const [slug, fact] of facts) {
    const hash = createHash('sha1').update(fact.skeleton).digest('hex').slice(0, 10);
    fact.hash = hash;
    rows.push(
      `| ${slug} | rgb(${fact.background.join(', ')}) | ${fact.font} | ${fact.columns} | ${hash} |`,
    );
    for (const pattern of fact.banned) problems.push(`${slug}: ${pattern}`);
    const sources = demoSources(slug).map(({ source }) => source);
    for (const delta of hardCoded(fact.deltas, sources)) {
      problems.push(`${slug}: a hard-coded delta: "${delta}"`);
    }
    for (const found of sourceLint(slug)) problems.push(`${slug}: ${found}`);
  }
  const entries = [...facts];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [a, fa] = entries[i];
      const [b, fb] = entries[j];
      const dE = deltaE2000(toLab(fa.background), toLab(fb.background));
      const pair = `${a} and ${b}`;
      if (dE < 2 && fa.font === fb.font) {
        problems.push(`${pair} share a background (ΔE00 ${dE.toFixed(2)}) and the font ${fa.font}`);
      }
      if (dE < 2 && fa.columns === fb.columns) {
        problems.push(
          `${pair} share a background (ΔE00 ${dE.toFixed(2)}) and ${fa.columns} chart columns`,
        );
      }
      if (fa.hash === fb.hash) problems.push(`${pair} share a DOM skeleton (${fa.hash})`);
    }
  }
  console.log(
    [
      '| demo | background | body font | chart columns | skeleton |',
      '|---|---|---|---:|---|',
      ...rows,
    ].join('\n'),
  );
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
console.log(`thumbs: ${CHECK ? 'checked' : 'wrote'} ${slugs.length} demo(s); no problems.`);
