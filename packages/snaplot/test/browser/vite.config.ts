// Vite server for the browser specs (plan M3b). Root is this folder; the specs
// import the library from source, so no build is needed.
import { defineConfig } from 'vite';

declare const process: { env: Record<string, string | undefined> };

const path = (relative: string) => decodeURIComponent(new URL(relative, import.meta.url).pathname);

export default defineConfig({
  root: path('.'),
  logLevel: 'warn',
  server: {
    host: '127.0.0.1',
    port: Number(process.env.PORT ?? 5363),
    strictPort: true,
    fs: { allow: [path('../..')] },
  },
});
