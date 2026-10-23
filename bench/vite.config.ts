// `npm run dev -w bench`: the bench page for interactive DevTools profiling. run.mjs builds the
// page with the same config.
import { defineConfig } from 'vite';
import { benchViteConfig } from './lib/vite-config.mjs';

export default defineConfig(benchViteConfig({ logLevel: 'info' }));
