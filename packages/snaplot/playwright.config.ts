/**
 * Playwright config for the library's real-browser suites (plan §11.3 G9, G10).
 *
 * Projects:
 * - `visual`: one screenshot per fixture shot (test/visual/visual.spec.ts).
 * - `geometry`: platform-independent label and ink checks (test/visual/geometry.spec.ts).
 *
 * Run through `npm run test:visual` (test/visual/run.mjs), which sets the environment below.
 * Environment (the contract every ref from M3a on honours, so `--against <ref>` can drive it):
 * - `PORT`: the fixture app's preview port (default 5333, plan EXECUTION rule 6).
 * - `SNAPLOT_VISUAL_EXPECTED_DIR`: read and write screenshots there instead of the committed
 *   `test/visual/__screenshots__/<name>-<platform>.png` set (the `--against` reference cache).
 * - `SNAPLOT_VISUAL_OUTPUT_DIR`: artifacts and the JSON report (default `test-results/visual`).
 * - `SNAPLOT_VISUAL_WORKERS`: worker count (default 4).
 * - `SNAPLOT_VISUAL_STRICT=1`: compare exactly (`threshold: 0`, `maxDiffPixels: 0`; pixelmatch
 *   still skips pixels it classifies as anti-aliasing). run.mjs sets it for every `--against` run
 *   and for `--strict`. Otherwise (committed baselines, CI) the plan's `maxDiffPixelRatio: 0.002`
 *   applies, with `threshold: 0` so that every pixel whose colour differs counts
 *   (test/visual/record.mjs has the measurements behind both).
 */
import { defineConfig } from '@playwright/test';
import { screenshotSettings } from './test/visual/record.mjs';

const PORT = Number(process.env.PORT || 5333);
const expectedDir = process.env.SNAPLOT_VISUAL_EXPECTED_DIR;
const outputRoot = process.env.SNAPLOT_VISUAL_OUTPUT_DIR || 'test-results/visual';
const appConfig = 'test/visual/vite.config.mjs';
const tolerance = screenshotSettings(process.env);

export default defineConfig({
  testDir: 'test',
  outputDir: `${outputRoot}/out`,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: Number(process.env.SNAPLOT_VISUAL_WORKERS || 4),
  timeout: 60_000,
  reporter: [['list'], ['json', { outputFile: `${outputRoot}/report.json` }]],
  snapshotPathTemplate: expectedDir
    ? `${expectedDir}/{arg}{ext}`
    : 'test/visual/__screenshots__/{arg}-{platform}{ext}',
  expect: {
    toHaveScreenshot: {
      ...tolerance,
      animations: 'disabled',
      caret: 'hide',
      scale: 'device',
      timeout: 15_000,
    },
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: 'chromium',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    // Playwright has no top-level `reducedMotion` use option; it is a context option.
    contextOptions: { reducedMotion: 'reduce' },
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'off',
  },
  projects: [
    { name: 'visual', testMatch: 'visual/visual.spec.ts' },
    { name: 'geometry', testMatch: 'visual/geometry.spec.ts' },
  ],
  webServer: {
    command:
      `npx vite build --config ${appConfig} && ` +
      `npx vite preview --config ${appConfig} --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    // Never attach to a server another worktree started on the same port.
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
