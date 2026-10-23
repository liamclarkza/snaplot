// `npm run dev -w bench`: the bench page against this checkout's built library
// (`npm run build` first). The drivers build the page with the same config per A/B side.
import { defineConfig } from 'vite';
import { benchViteConfig } from './lib/vite-config.mjs';

export default defineConfig(benchViteConfig({ logLevel: 'info' }));
