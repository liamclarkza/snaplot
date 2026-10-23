import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    solid({
      include: ['**/src/solid/**/*.tsx'],
      dev: false,
      hot: false,
      solid: { generate: 'dom', hydratable: true },
    }),
  ],
  resolve: {
    alias: [
      // The library's tests import the package by name from source (plan §11.2: one alias,
      // mirrored by tsconfig paths). Site, bench, conformance pages and demos use the build.
      { find: /^snaplot$/, replacement: resolve(__dirname, 'src/index.ts') },
      {
        find: /^solid-js$/,
        replacement: resolve(__dirname, '../../node_modules/solid-js/dist/solid.js'),
      },
      {
        find: /^solid-js\/web$/,
        replacement: resolve(__dirname, '../../node_modules/solid-js/web/dist/web.js'),
      },
    ],
  },
  test: {
    server: { deps: { inline: ['solid-js'] } },
    // DOM tests opt in per file with `// @vitest-environment jsdom`.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/index.ts'],
    },
  },
});
