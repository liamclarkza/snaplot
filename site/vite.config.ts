import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { resolve } from 'path';

export default defineConfig(({ command }) => ({
  plugins: [solid()],
  base: '/snaplot/',
  resolve: {
    alias: command === 'serve'
      ? {
          // In dev, resolve snaplot to source for HMR. Production builds use
          // package exports so docs catch published-boundary regressions.
          'snaplot/solid': resolve(__dirname, '../packages/snaplot/src/solid.ts'),
          'snaplot/core': resolve(__dirname, '../packages/snaplot/src/core.ts'),
          'snaplot': resolve(__dirname, '../packages/snaplot/src/index.ts'),
        }
      : {},
  },
  build: {
    outDir: 'dist',
  },
}));
