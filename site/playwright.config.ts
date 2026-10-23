import { defineConfig, devices } from '@playwright/test';

// The site smoke spec (plan §8.3) runs against `astro preview` of the built site, so run
// `npm run build && npm run build:site` first. PORT keeps parallel worktrees apart (M6a = 5336).
// --ignore-lock keeps the preview server in the foreground, where Playwright can manage it.
const port = Number(process.env.PORT ?? 5336);

export default defineConfig({
  testDir: 'tests',
  testMatch: '*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx astro preview --host 127.0.0.1 --port ${port} --ignore-lock`,
    url: `http://127.0.0.1:${port}/snaplot/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
