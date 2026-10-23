// One Vite config for the bench page, shared by `vite.config.ts` (the dev server) and run.mjs.
// The page resolves `snaplot` to this checkout's library source.

import { join } from 'node:path';
import { benchDir, repoDir } from './paths.mjs';

const src = join(repoDir, 'packages', 'snaplot', 'src');

/**
 * @param {{ outDir?: string, logLevel?: 'info' | 'warn' | 'error' | 'silent' }} [options]
 */
export function benchViteConfig(options = {}) {
  return {
    configFile: false,
    root: benchDir,
    logLevel: options.logLevel ?? 'warn',
    cacheDir: join(benchDir, 'node_modules', '.vite-bench'),
    resolve: {
      alias: [
        { find: /^snaplot$/, replacement: join(src, 'index.ts') },
        { find: /^snaplot\/react$/, replacement: join(src, 'react.ts') },
      ],
      dedupe: ['react', 'react-dom'],
    },
    build: {
      outDir: options.outDir ?? join(benchDir, 'dist'),
      emptyOutDir: true,
      // Readable names in DevTools profiles taken against the built page.
      minify: false,
      target: 'es2022',
      reportCompressedSize: false,
    },
    server: {
      host: '127.0.0.1',
      // Plan EXECUTION rule 6: M4's port. COOP/COEP give 5 µs performance.now() resolution.
      port: Number(process.env.PORT ?? 5304),
      headers: {
        'cross-origin-opener-policy': 'same-origin',
        'cross-origin-embedder-policy': 'require-corp',
      },
    },
  };
}
