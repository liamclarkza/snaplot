// dist/solid.server.js: the Solid entry compiled for server rendering (the `node`, `deno` and
// `worker` export conditions). 'snaplot' is external here as in the browser build, so the server
// graph holds one engine ([frameworks-19] in check-consumers).
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { external, target } from './vite.config';

export default defineConfig({
  plugins: [solid({ ssr: true, solid: { generate: 'ssr', hydratable: true } })],
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/solid.ts'),
      formats: ['es'],
      fileName: () => 'solid.server.js',
    },
    rollupOptions: { external, output: { sourcemapExcludeSources: true } },
    target,
    sourcemap: true,
  },
});
