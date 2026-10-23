// One Vite config for the bench page, shared by `vite.config.ts` (the dev server) and the
// drivers (`run.mjs`, `ab.mjs`), which build the page once per side. The page consumes a *built*
// snaplot (plan §11.2, repo-16): `snaplot` resolves to that side's `dist/index.js`, and
// `snaplot/react` to its `dist/react.js`, or to a stub when the build has none (v0.12.0).

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { benchDir, repoDir } from './paths.mjs';

/** The working tree's own build, for `npm run dev -w bench` and `run.mjs`. */
export const localDist = join(repoDir, 'packages', 'snaplot', 'dist');

/**
 * @param {{ dist?: string, outDir?: string, logLevel?: 'info' | 'warn' | 'error' | 'silent' }} [options]
 */
export function benchViteConfig(options = {}) {
  const dist = options.dist ?? localDist;
  const react = join(dist, 'react.js');
  return {
    configFile: false,
    root: benchDir,
    logLevel: options.logLevel ?? 'warn',
    // Keep each build's dependency cache apart from the others.
    cacheDir: join(benchDir, 'node_modules', '.vite-bench'),
    resolve: {
      alias: [
        { find: /^snaplot$/, replacement: join(dist, 'index.js') },
        {
          find: /^snaplot\/react$/,
          replacement: existsSync(react) ? react : join(benchDir, 'src', 'api', 'missing-react.ts'),
        },
      ],
      // A side's dist/react.js imports React; it must be the bench's single copy.
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
