// The conformance suite (plan §7.5): one scenario table, one spec per runtime
// (`vanilla.spec.ts`, `react18.spec.ts`, `react19.spec.ts`, `solid.spec.ts`), in Chromium.
// Run it with `npm run test:conformance` (run.mjs builds the pages first). A scenario that waits
// on a W5 track is `test.fail(true, '[id]')` with that track's id; the JSON report feeds
// scripts/overhaul/trace-check.mjs.
import { defineConfig, devices } from '@playwright/test';

declare const process: { env: Record<string, string | undefined> };

const path = (relative: string) => decodeURIComponent(new URL(relative, import.meta.url).pathname);

const port = Number(process.env.PORT ?? 5313);
const packageRoot = path('../../');

export default defineConfig({
  testDir: path('.'),
  testMatch: '*.spec.ts',
  outputDir: `${packageRoot}test-results/conformance`,
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers: process.env.CI ? 2 : 4,
  timeout: 60_000,
  reporter: [['list'], ['json', { outputFile: `${packageRoot}test-results/conformance.json` }]],
  use: {
    baseURL: `http://127.0.0.1:${port}/`,
    contextOptions: { reducedMotion: 'reduce' },
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'UTC',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1000, height: 800 },
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: {
    command: `node ${path('serve.mjs')}`,
    url: `http://127.0.0.1:${port}/vanilla.html`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: { PORT: String(port) },
  },
});
