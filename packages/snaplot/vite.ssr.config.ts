import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { resolve } from 'path';
export default defineConfig({
  plugins: [solid({ ssr: true, solid: { generate: 'ssr', hydratable: true } })],
  build: {
    emptyOutDir: false,
    lib: { entry: resolve(__dirname, 'src/solid.ts'), formats: ['es'], fileName: () => 'solid.server.js' },
    rollupOptions: { external: ['solid-js', 'solid-js/web', 'solid-js/store'] },
    target: 'esnext',
    sourcemap: true,
  },
});
