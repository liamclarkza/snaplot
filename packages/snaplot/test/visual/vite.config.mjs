// Vite config for the visual fixture app. It bundles the library from source
// (`../../src/index.ts`) so each ref's fixture app renders that ref's code.
// Build output goes to test/visual/dist (ignored by git through `**/dist/`).
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  base: './',
  logLevel: 'warn',
  clearScreen: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 4096,
  },
  preview: { host: '127.0.0.1', strictPort: true },
  server: { host: '127.0.0.1', strictPort: true },
});
