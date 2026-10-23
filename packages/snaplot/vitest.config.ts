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
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/index.ts'],
    },
  },
});
