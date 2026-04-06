import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { resolve } from 'path';

export default defineConfig({
  plugins: [solid()],
  base: '/snaplot/',
  resolve: {
    alias: {
      // In dev, resolve snaplot to the source for HMR
      'snaplot': resolve(__dirname, '../packages/snaplot/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
  },
});
