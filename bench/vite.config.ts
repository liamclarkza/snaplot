import { resolve } from 'path';
import { defineConfig } from 'vite';

// The bench always resolves snaplot to source so measurements reflect the
// working tree, not the last dist build.
export default defineConfig({
  resolve: {
    alias: {
      'snaplot/core': resolve(__dirname, '../packages/snaplot/src/core.ts'),
      snaplot: resolve(__dirname, '../packages/snaplot/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    // Keep names readable in DevTools profiles taken against the built bench.
    minify: false,
  },
});
