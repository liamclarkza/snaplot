// Vitest config of the throwaway consumer project that scripts/check-consumers.mjs creates.
// It is copied into that project, never run from the repository.
import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 60_000,
    projects: [
      {
        // Node-side checks: type resolution, require(esm), SSR, bundling. A file that needs a DOM
        // opts in with `// @vitest-environment jsdom`.
        test: { name: 'node', environment: 'node', include: ['*.consumer.mjs', 'ssr.mjs'] },
      },
      {
        // A Solid app's own test setup: vite-plugin-solid compiles the app's JSX and resolves
        // libraries through the `solid` export condition, as it does for real consumers.
        plugins: [solid()],
        test: { name: 'solid', environment: 'jsdom', include: ['*.consumer.jsx'] },
      },
    ],
  },
});
