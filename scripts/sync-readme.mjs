#!/usr/bin/env node
// Keeps the README's code in step with what the docs run (plan §8.3, docs-09). Each block between
// `<!-- sync-readme:<name> -->` and `<!-- /sync-readme:<name> -->` is generated: the install string
// and the no-build CDN URL from packages/snaplot/package.json, and the three quick starts from
// site/src/examples/start/first-chart.*, which the "Your first chart" page executes.
//
//   node scripts/sync-readme.mjs          rewrite the blocks in README.md
//   node scripts/sync-readme.mjs --check  exit 1 if README.md differs from what it would write
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const readmePath = join(repo, 'README.md');
const { version } = JSON.parse(readFileSync(join(repo, 'packages/snaplot/package.json'), 'utf8'));
const example = (suffix) =>
  readFileSync(join(repo, `site/src/examples/start/first-chart${suffix}`), 'utf8').trimEnd();

const noBuild = `<div id="chart"></div>
<script type="module">
  import { createChart } from 'https://cdn.jsdelivr.net/npm/snaplot@${version}/+esm';

  const temps = [16.57, 16.52, 16.48, 16.47, 16.51, 16.49, 16.5, 16.55, 16.61, 16.63, 16.68];
  createChart(document.getElementById('chart'), {
    data: temps.map((temp, i) => ({ day: i + 1, temp })),
    x: 'day',
    series: [{ y: 'temp' }],
    height: 280,
    ariaLabel: 'Daily global mean temperature, June 2024',
  });
</script>`;

const BLOCKS = {
  install: ['sh', version.includes('-') ? 'npm i snaplot@next' : 'npm i snaplot'],
  vanilla: ['ts', example('.ts')],
  react: ['tsx', example('.react.tsx')],
  solid: ['tsx', example('.solid.tsx')],
  'no-build': ['html', noBuild],
};

const current = readFileSync(readmePath, 'utf8');
let next = current;
for (const [name, [lang, code]] of Object.entries(BLOCKS)) {
  const pattern = new RegExp(
    `(<!-- sync-readme:${name} -->\\n)[\\s\\S]*?(\\n<!-- /sync-readme:${name} -->)`,
  );
  if (!pattern.test(next)) {
    console.error(`sync-readme: README.md has no <!-- sync-readme:${name} --> block`);
    process.exit(1);
  }
  next = next.replace(pattern, (_, open, close) => `${open}\`\`\`${lang}\n${code}\n\`\`\`${close}`);
}

if (process.argv.includes('--check')) {
  if (next === current) {
    console.log('sync-readme: README.md is up to date');
  } else {
    console.error('sync-readme: README.md is out of date; run `node scripts/sync-readme.mjs`');
    process.exit(1);
  }
} else if (next !== current) {
  writeFileSync(readmePath, next);
  console.log('sync-readme: README.md updated');
} else {
  console.log('sync-readme: README.md is up to date');
}
