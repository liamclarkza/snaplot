import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';
import { copyFileSync, mkdirSync } from 'fs';

export default defineConfig({
  plugins: [
    solid(),
    dts({ include: ['src/**/*'], outDir: 'dist' }),
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
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
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
