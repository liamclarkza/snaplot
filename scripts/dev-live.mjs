#!/usr/bin/env node
// `npm run dev:live`: the docs site with the library rebuilt on every change. The site reads
// packages/snaplot/dist, so this builds the library once, then watches its browser and Solid
// server builds (without emptying dist between them) and runs `astro dev` beside them.
//
//   npm run dev:live                   http://127.0.0.1:4321/snaplot/
//   npm run dev:live -- --port 4400    any other astro dev flag passes through
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const lib = fileURLToPath(new URL('../packages/snaplot/', import.meta.url));
const astroArgs = process.argv.slice(2);
if (!astroArgs.includes('--port')) astroArgs.push('--port', '4321');
if (!astroArgs.includes('--host')) astroArgs.push('--host', '127.0.0.1');

const children = new Set();
const run = (name, command, args, cwd) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(child);
    const prefix = (chunk) =>
      String(chunk)
        .split('\n')
        .filter(Boolean)
        .map((line) => `[${name}] ${line}\n`)
        .join('');
    child.stdout.on('data', (chunk) => process.stdout.write(prefix(chunk)));
    child.stderr.on('data', (chunk) => process.stderr.write(prefix(chunk)));
    child.on('exit', (code) => {
      children.delete(child);
      code === 0 ? resolve() : reject(new Error(`${name} exited with ${code}`));
    });
  });

const stop = () => {
  for (const child of children) child.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

// One full build first, so the site starts on a current dist.
await run('lib', 'npm', ['run', 'build'], lib);

// Then the watchers, through Vite's API so the browser build keeps the server build's file.
const { build } = await import(createRequire(lib + 'package.json').resolve('vite'));
for (const [name, configFile] of [
  ['lib', 'vite.config.ts'],
  ['lib:server', 'vite.ssr.config.ts'],
]) {
  await build({
    root: lib,
    configFile: lib + configFile,
    logLevel: 'warn',
    build: { watch: {}, emptyOutDir: false },
  }).then(() => console.log(`[${name}] watching packages/snaplot/src`));
}

run('site', 'npx', ['astro', 'dev', ...astroArgs], `${root}site`).catch((error) => {
  console.error(error.message);
  stop();
});
