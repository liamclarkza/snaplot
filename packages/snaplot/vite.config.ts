import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';
import { copyFileSync, mkdirSync } from 'fs';

export default defineConfig({
  plugins: [
    solid(),
    dts({
      include: ['src/**/*'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
      outDir: 'dist',
    }),
    {
      // Copy stylesheets to dist so consumers can `import 'snaplot/legend-table.css'`.
      name: 'snaplot:copy-css',
      closeBundle() {
        mkdirSync(resolve(__dirname, 'dist'), { recursive: true });
        copyFileSync(
          resolve(__dirname, 'src/styles/legendTable.css'),
          resolve(__dirname, 'dist/legend-table.css'),
        );
      },
    },
  ],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        core: resolve(__dirname, 'src/core.ts'),
        solid: resolve(__dirname, 'src/solid.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: ['solid-js', 'solid-js/web', 'solid-js/store'],
    },
    target: 'esnext',
    sourcemap: true,
  },
  resolve: {
    alias: {
      '~': resolve(__dirname, 'src'),
    },
  },
});
