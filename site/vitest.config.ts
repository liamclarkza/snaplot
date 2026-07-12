import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    // Site tests run before the library build in clean CI checkouts. Resolve
    // workspace imports to source so tests do not accidentally depend on a
    // stale or locally-present packages/snaplot/dist directory.
    alias: {
      snaplot: resolve(__dirname, '../packages/snaplot/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
