import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: [
      { find: 'snaplot/react', replacement: new URL('../../packages/snaplot/src/react.ts', import.meta.url).pathname },
      { find: /^snaplot$/, replacement: new URL('../../packages/snaplot/src/index.ts', import.meta.url).pathname },
    ],
  },
  build: { outDir: 'dist' },
});
