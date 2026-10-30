#!/usr/bin/env node
// `npm run dev:live`: the docs site with the library rebuilt on every change. The site reads
// packages/snaplot/dist, so this builds the library once, then watches its browser and Solid
// server builds (without emptying dist between them) and runs `astro dev` beside them, each
// child's output prefixed with its name.
//
//   npm run dev:live                   http://127.0.0.1:4321/snaplot/
//   npm run dev:live -- --port 4400    any other astro dev flag passes through
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const lib = fileURLToPath(new URL('../packages/snaplot/', import.meta.url));

// `--watch <config>`: one library watcher, run as a child of the main script below so all of its
// output (Vite's warnings and the declaration plugin's) is prefixed with its name.
const watchIndex = process.argv.indexOf('--watch');
if (watchIndex !== -1) {
  const { build } = await import(createRequire(lib + 'package.json').resolve('vite'));
  const watcher = await build({
    root: lib,
    configFile: lib + process.argv[watchIndex + 1],
    logLevel: 'warn',
    // Without emptying dist, each build keeps the other's files.
    build: { watch: {}, emptyOutDir: false },
  });
  let start = 0;
  watcher.on('event', (event) => {
    if (event.code === 'START') start = Date.now();
    if (event.code === 'END') console.log(`built in ${Date.now() - start} ms`);
    if (event.code === 'ERROR') console.error(event.error.message);
  });
  console.log('watching packages/snaplot/src');
} else {
  const astroArgs = process.argv.slice(2);
  if (!astroArgs.includes('--port')) astroArgs.push('--port', '4321');
  if (!astroArgs.includes('--host')) astroArgs.push('--host', '127.0.0.1');
  // In the foreground, where stopping this script stops it: run by an agent, astro dev would
  // otherwise start a background server that outlives this script.
  if (!astroArgs.includes('--ignore-lock')) astroArgs.push('--ignore-lock');

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
  const exitOnError = (error) => {
    console.error(error.message);
    stop();
  };

  // One full build first, so the site starts on a current dist.
  await run('lib', 'npm', ['run', 'build'], lib);

  // Then the watchers of the browser and Solid server builds, and the site.
  const script = fileURLToPath(import.meta.url);
  for (const [name, config] of [
    ['lib', 'vite.config.ts'],
    ['lib:server', 'vite.ssr.config.ts'],
  ])
    run(name, process.execPath, [script, '--watch', config], root).catch(exitOnError);
  run('site', 'npx', ['astro', 'dev', ...astroArgs], `${root}site`).catch(exitOnError);
}
