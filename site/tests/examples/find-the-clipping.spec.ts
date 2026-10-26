// S1 "Where does this recording clip?" (plan §10.1, §10.2): the editor's task, its answer against
// an independent in-page scan, the threshold's axis, playback, touch, the footer attribution, and
// the shared checks (no overflow at 390 and 1280 px, no console errors, axe). Run against the built
// site: `npm run build && npm run build:site`, then `npx playwright test examples/find-the-clipping`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const ROUTE = '/snaplot/examples/find-the-clipping/';
const DATA = fileURLToPath(new URL('../../public/data/find-the-clipping/', import.meta.url));
const recording = JSON.parse(readFileSync(`${DATA}recording.json`, 'utf8')) as {
  sampleRate: number;
  reference: { clippedRuns: number; silences: number; longestRun: { start: number } };
};
const source = readFileSync(`${DATA}SOURCE.md`, 'utf8');
const attribution = /^## Attribution\n+(.+)$/m.exec(source)?.[1]?.trim() ?? '';

/** Console errors and warnings, uncaught errors and failed requests. */
function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`);
  });
  return problems;
}

async function open(page: Page) {
  await page.goto(ROUTE);
  await page.locator('html[data-demo-ready]').waitFor({ timeout: 20_000 });
}

/** The X range the left channel shows, from its public state. */
const laneRange = (page: Page) =>
  page.evaluate(() => {
    const charts = (globalThis as any).snaplotDemo.charts;
    return charts.lane0.getState().viewport.x as [number, number];
  });

test.describe('find-the-clipping', () => {
  test('the clip list answers the question, and an independent scan agrees', async ({ page }) => {
    const problems = watch(page);
    await open(page);
    const answer = await page.locator('[data-answer]').innerText();
    expect(answer).toBe(
      '12 clipped runs (samples at or above −0.1 dBFS); the longest is 0.091 ms (4 samples) at 00:35; 5 silences longer than 2 s.',
    );
    // The oracle: decode the same file again on its own OfflineAudioContext and count runs of
    // three or more frames at or above −0.1 dBFS in any channel, with no code from the page.
    const scanned = await page.evaluate(async (rate) => {
      const bytes = await (
        await fetch('/snaplot/data/find-the-clipping/recording.mp3')
      ).arrayBuffer();
      const audio = await new OfflineAudioContext(1, 1, rate).decodeAudioData(bytes);
      const chans = Array.from({ length: audio.numberOfChannels }, (_, c) =>
        audio.getChannelData(c),
      );
      const limit = 10 ** (-0.1 / 20);
      let runs = 0;
      let length = 0;
      for (let i = 0; i <= audio.length; i++) {
        const hot = i < audio.length && chans.some((ch) => Math.abs(ch[i]) >= limit);
        if (hot) length++;
        else {
          if (length >= 3) runs++;
          length = 0;
        }
      }
      return runs;
    }, recording.sampleRate);
    expect(scanned).toBe(recording.reference.clippedRuns);
    expect(answer.startsWith(`${scanned} clipped runs`)).toBe(true);
    await expect(page.locator('tr[data-run]')).toHaveCount(scanned);
    await expect(page.locator('tr[data-silence]')).toHaveCount(recording.reference.silences);
    expect(scanned).toBeGreaterThanOrEqual(3);
    const summaries = await page.locator('.cliplist, .toolbar, .spectrum .caption').allInnerTexts();
    for (const text of summaries) expect(text).not.toMatch(/NaN|Infinity|undefined|—\s*$/);
    expect(problems).toEqual([]);
  });

  test('jumping to the longest run shows its samples in both channels', async ({ page }) => {
    await open(page);
    const start = recording.reference.longestRun.start / recording.sampleRate;
    await page.locator(`tr[data-run="${recording.reference.longestRun.start}"] button`).click();
    const [from, to] = await laneRange(page);
    expect(from).toBeLessThan(start);
    expect(to).toBeGreaterThan(start);
    expect(to - from).toBeLessThan(0.02);
    const shared = await page.evaluate(() => {
      const charts = (globalThis as any).snaplotDemo.charts;
      return {
        right: charts.lane1.getState().viewport.x,
        selection: charts.overview.getState().selection?.x,
      };
    });
    expect(shared.right).toEqual([from, to]);
    expect(shared.selection).toEqual([from, to]);
  });

  test('brushing the overview sets the stretch the channels and the spectrum show', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page);
    const plot = await page.evaluate(() => {
      const overview = (globalThis as any).snaplotDemo.charts.overview;
      const x = overview.scale('x');
      const box = overview.container.getBoundingClientRect();
      return { left: box.left + x.toPixel(60), right: box.left + x.toPixel(70), top: box.top };
    });
    await page.mouse.move(plot.left, plot.top + 30);
    await page.mouse.down();
    await page.mouse.move((plot.left + plot.right) / 2, plot.top + 30, { steps: 4 });
    await page.mouse.move(plot.right, plot.top + 30, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => (await laneRange(page))[0]).toBeGreaterThan(50);
    const [from, to] = await laneRange(page);
    expect(from).toBeCloseTo(60, 0);
    expect(to).toBeCloseTo(70, 0);
    await expect(page.locator('.spectrum .caption')).toHaveText(
      /^(00:59\.9\d\d|01:00\.0\d\d)–(01:09\.9\d\d|01:10\.0\d\d), 32 × 4096 samples$/,
    );
  });

  test('the silence threshold sits on the dB axis it is defined on', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page);
    // Where the line is drawn: the row of the left channel's canvases that carries the threshold
    // colour across most of the plot.
    const found = await page.evaluate(() => {
      const lane = (globalThis as any).snaplotDemo.charts.lane0;
      const expected = lane.scale('y2').toPixel(-50);
      const left = Math.ceil(lane.scale('x').toPixel(lane.scale('x').min));
      const right = Math.floor(lane.scale('x').toPixel(lane.scale('x').max));
      const rows: Record<number, number> = {};
      for (const canvas of lane.container.querySelectorAll('canvas')) {
        const ratio = canvas.width / canvas.getBoundingClientRect().width;
        const ctx = canvas.getContext('2d');
        if (!ctx || canvas.width === 0) continue;
        const { data, width } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let y = 0; y < canvas.height; y++) {
          for (let x = Math.round(left * ratio); x < Math.round(right * ratio); x++) {
            const i = (y * width + x) * 4;
            // #C7CCD1, the threshold colour (drawn translucent).
            if (
              Math.abs(data[i] - 0xc7) < 6 &&
              Math.abs(data[i + 1] - 0xcc) < 6 &&
              Math.abs(data[i + 2] - 0xd1) < 6 &&
              data[i + 3] > 100
            )
              rows[Math.round(y / ratio)] = (rows[Math.round(y / ratio)] ?? 0) + 1;
          }
        }
      }
      const [row, count] = Object.entries(rows).sort((a, b) => b[1] - a[1])[0] ?? ['-1', 0];
      return { expected, row: Number(row), share: count / (right - left) };
    });
    expect(found.share).toBeGreaterThan(0.25);
    expect(Math.abs(found.row - found.expected)).toBeLessThanOrEqual(1);
  });

  test('Space plays with a moving playhead and no long task over 50 ms', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page);
    const before = await page.locator('.clock').innerText();
    await page.keyboard.press('Space');
    await expect(page.locator('button.play')).toHaveAttribute('aria-pressed', 'true');
    // Count long tasks once playback runs (creating the AudioContext is the browser's own cost).
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const w = globalThis as any;
      w.longTasks = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) w.longTasks.push(entry.duration);
      }).observe({ type: 'longtask' });
    });
    await page.waitForTimeout(3_000);
    const playhead = await page.evaluate(() => {
      const charts = (globalThis as any).snaplotDemo.charts;
      return charts.lane0.getCursor().x as number;
    });
    await page.keyboard.press('Space');
    await expect(page.locator('button.play')).toHaveAttribute('aria-pressed', 'false');
    const after = await page.locator('.clock').innerText();
    expect(after).not.toBe(before);
    const seconds = (tc: string) => {
      const [m, s] = tc.split(':');
      return Number(m) * 60 + Number(s);
    };
    expect(seconds(after) - seconds(before)).toBeGreaterThan(2.5);
    expect(Math.abs(playhead - seconds(after))).toBeLessThan(0.5);
    expect(await page.evaluate(() => (globalThis as any).longTasks)).toEqual([]);
    // ← and → move the playhead by a second.
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.clock')).not.toHaveText(after);
    expect(seconds(await page.locator('.clock').innerText())).toBeCloseTo(seconds(after) - 1, 1);
  });

  test('a file you open is analysed on the page and never uploaded', async ({ page }) => {
    await open(page);
    const sent: string[] = [];
    page.on('request', (r) => {
      if (r.method() !== 'GET') sent.push(`${r.method()} ${r.url()}`);
    });
    await page.locator('.open input').setInputFiles({
      name: 'interview.wav',
      mimeType: 'audio/wav',
      buffer: testWav(),
    });
    await expect(page.locator('[data-answer]')).toHaveText(
      /^2 clipped runs \(samples at or above −0\.1 dBFS\); the longest is 0\.75 ms \(6 samples\) at 00:01; 1 silence longer than 2 s\.$/,
    );
    await expect(page.locator('h1')).toHaveText('interview.wav');
    await expect(page.locator('.format')).toContainText('8 kHz · mono');
    expect(sent).toEqual([]);
  });

  test('the overview paints within 300 ms of the decode', async ({ page }) => {
    // Lines draw every sample at rest until M11 decimates them (M4 at rest); 4.5M samples in two
    // channels take about 700 ms here. Flip this when M11 merges (docs/handoff/m16c.md).
    test.fail(true, '[gap-perf-gate-10] M11: lines are not decimated at rest');
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page);
    const ms = await page.evaluate(
      () => performance.getEntriesByName('find-the-clipping:first-paint')[0]?.duration ?? -1,
    );
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThan(300);
  });

  for (const width of [1280, 390]) {
    test(`${width}px: no overflow, no console errors, axe clean, attributed`, async ({ page }) => {
      const problems = watch(page);
      await page.setViewportSize({ width, height: 900 });
      await open(page);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0);
      await expect(page).toHaveTitle('Where does this recording clip? · snaplot examples');
      await expect(page.locator('footer [data-attribution]')).toHaveText(attribution);
      await expect(page.locator('footer')).toContainText(`Data: ${attribution}`);
      await expect(page.locator('footer a', { hasText: '← Examples' })).toHaveAttribute(
        'href',
        '/snaplot/examples/',
      );
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(
        violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
      ).toEqual([]);
      expect(problems).toEqual([]);
    });
  }
});

test.describe('find-the-clipping on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the help speaks touch, and tapping works the task', async ({ page }) => {
    await open(page);
    await expect(page.locator('.hint')).toContainText('Double-tap and drag');
    await expect(page.locator('.hint')).not.toContainText('Shift');
    // Tap a silence: both channels show it.
    const silence = page.locator('tr[data-silence] button').nth(1);
    await silence.tap();
    const [from, to] = await laneRange(page);
    expect(from).toBeCloseTo(53 - 0.25, 1);
    expect(to).toBeCloseTo(55.95 + 0.25, 1);
    await page.locator('button.play').tap();
    await expect(page.locator('button.play')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('button.play').tap();
    await expect(page.locator('button.play')).toHaveAttribute('aria-pressed', 'false');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });
});

/**
 * Four seconds of 8 kHz mono 16-bit WAV: a half-scale tone, two runs at full scale (4 and 6
 * samples) and 2.5 s of digital silence.
 */
function testWav(): Buffer {
  const rate = 8000;
  const samples = new Int16Array(rate * 4);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.round(16_000 * Math.sin((2 * Math.PI * 440 * i) / rate));
  }
  samples.fill(32_767, 4_000, 4_004);
  samples.fill(-32_768, 10_000, 10_006);
  samples.fill(0, 12_000, 32_000);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + samples.byteLength, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(samples.byteLength, 40);
  return Buffer.concat([header, Buffer.from(samples.buffer)]);
}
