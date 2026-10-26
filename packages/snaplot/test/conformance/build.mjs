#!/usr/bin/env node
// Builds the four conformance runtimes (plan §7.5) into test/conformance/dist/:
// - vanilla.html, react19.html and solid.html, from the workspace's built package;
// - react18/index.html, from the React 18 fixture, whose snaplot is the packed tarball
//   (`npm run conformance:install`); `resolve.dedupe` keeps one React, one react-dom and one
//   snaplot, and react18/meta.json lists every react-dom package the bundle holds;
// - ssr/<runtime>.json: each runtime's server markup for scenario #21, rendered on Node with the
//   server conditions, and every console message the server render printed.
//
// Pages are development builds, so React's StrictMode double mount and its hydration warnings
// run as they do in an application under development.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'dist');
const fixture = path.join(here, 'react18');

/** Lists the react-dom packages a bundle holds (plan D2: exactly one). */
function reactDomCopies(file) {
  return {
    name: 'conformance:react-dom-copies',
    generateBundle(_, bundle) {
      const roots = new Set();
      for (const chunk of Object.values(bundle))
        for (const id of Object.keys(chunk.modules ?? {})) {
          const file = id.replace(/^\0+/, '').split('?')[0];
          const match = file.match(/^(.*\/node_modules\/react-dom)\//);
          if (match) roots.add(path.relative(here, match[1]));
        }
      writeFileSync(file, `${JSON.stringify({ reactDom: [...roots].sort() }, null, 2)}\n`);
    },
  };
}

/** Rollup's note that it drops the 'use client' banner of dist/react.js when bundling. */
const onwarn = (warning, warn) => {
  if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning);
};

const common = {
  configFile: false,
  logLevel: 'warn',
  mode: 'development',
  base: './',
  define: { 'process.env.NODE_ENV': '"development"' },
};

mkdirSync(path.join(out, 'ssr'), { recursive: true });
mkdirSync(path.join(out, 'react18'), { recursive: true });

await build({
  ...common,
  root: path.join(here, 'pages'),
  build: {
    outDir: out,
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      onwarn,
      input: Object.fromEntries(
        ['vanilla', 'react19', 'solid'].map((name) => [
          name,
          path.join(here, `pages/${name}.html`),
        ]),
      ),
    },
  },
});

await build({
  ...common,
  root: fixture,
  resolve: { dedupe: ['react', 'react-dom', 'snaplot'] },
  plugins: [reactDomCopies(path.join(out, 'react18/meta.json'))],
  build: {
    outDir: path.join(out, 'react18'),
    emptyOutDir: false,
    minify: false,
    rollupOptions: { onwarn },
  },
});

// Server markup, rendered in child processes with NODE_ENV=development (Vite's build sets
// NODE_ENV for this process): React 19 and Solid from here, React 18 inside its fixture.
const server = (file) =>
  JSON.parse(
    execFileSync('node', [file], {
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'development' },
    }),
  );
const { react19, solid } = server(path.join(here, 'ssr.mjs'));
writeFileSync(path.join(out, 'ssr/react19.json'), JSON.stringify(react19));
writeFileSync(path.join(out, 'ssr/solid.json'), JSON.stringify(solid));
writeFileSync(
  path.join(out, 'ssr/react18.json'),
  JSON.stringify(server(path.join(fixture, 'ssr.mjs'))),
);

// A vanilla page has no server renderer: its server markup is the host element it mounts into.
writeFileSync(
  path.join(out, 'ssr/vanilla.json'),
  JSON.stringify({ html: '<div style="width:100%;height:100%"></div>', messages: [] }),
);
console.log(`conformance: built the four runtimes into ${path.relative(process.cwd(), out)}/`);
