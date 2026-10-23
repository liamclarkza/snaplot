// Real-browser specs (plan M3b scope 1): `npm run test:browser`.
//
// Specs are named after the milestone that owns their defects
// (`m12a-touch.spec.ts`). A known defect is `test.fail(true, '[id] …')`, so an
// unexpected pass turns the run red. The JSON report feeds
// `scripts/overhaul/trace-check.mjs`.
//
// The server port honours `PORT` (EXECUTION rule 6: 5300 + 63 for M3b), so
// parallel worktrees do not collide.
import { defineConfig, devices } from '@playwright/test';

declare const process: { env: Record<string, string | undefined> };

/** An absolute path relative to this file (no Node type dependency). */
const path = (relative: string) => decodeURIComponent(new URL(relative, import.meta.url).pathname);

const port = Number(process.env.PORT ?? 5363);
const packageRoot = path('../../');

export default defineConfig({
  testDir: path('.'),
  testMatch: '*.spec.ts',
  outputDir: `${packageRoot}test-results/browser`,
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers: process.env.CI ? 2 : 4,
  timeout: 30_000,
  reporter: [['list'], ['json', { outputFile: `${packageRoot}test-results/browser.json` }]],
  use: {
    baseURL: `http://127.0.0.1:${port}/`,
    viewport: { width: 1280, height: 800 },
    contextOptions: { reducedMotion: 'reduce' },
    colorScheme: 'light',
    deviceScaleFactor: 1,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: {
    command: `npx vite --config ${path('vite.config.ts')}`,
    cwd: packageRoot,
    url: `http://127.0.0.1:${port}/`,
    // Never attach to a server another checkout left on the same port: it
    // would serve the wrong tree.
    reuseExistingServer: false,
    timeout: 60_000,
    env: { PORT: String(port) },
  },
});
