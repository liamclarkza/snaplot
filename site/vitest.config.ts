import { defineConfig } from 'vitest/config';

// Unit tests and lints for the site (plan §8.3): the example pipeline, the style and copy lints,
// the data caps, and the demos' answers (site/src/demos/**). A plain Vite config on purpose:
// Astro's would run the whole site integration, TypeDoc included, on every test run. The
// Playwright smoke spec (tests/*.spec.ts) runs separately, against the built site.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
  },
});
