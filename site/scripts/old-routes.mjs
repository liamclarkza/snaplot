#!/usr/bin/env node
// Generates src/lib/old-routes.json, the table behind the old-link redirect on the homepage (plan
// §8.2). The old site used hash routes, /snaplot/#/docs/<group>/<section>; its groups and
// sections come from the old nav at the overhaul baseline, and each one maps to the page (and
// heading) that now covers it. Run it again only if the mapping below changes; it fails on any
// old route without a mapping, so nothing is silently dropped.
//
//   node site/scripts/old-routes.mjs           # needs the overhaul-baseline tag
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../src/lib/old-routes.json', import.meta.url));

// Old group slug → new page; old `group/section` → new page#heading where it is not the group's.
const GROUPS = {
  'getting-started': 'first-chart/',
  'chart-types': 'guides/marks/',
  'series-options': 'guides/marks/',
  'scales-axes': 'guides/axes/',
  interactions: 'guides/zoom-pan-selection/',
  tooltips: 'guides/tooltips-legends/',
  theming: 'guides/theming/',
  data: 'guides/updating/',
  plugins: 'guides/annotations-plugins/',
  recipes: 'introduction/',
  api: 'reference/api/readme/',
};
const SECTIONS = {
  'getting-started/install': 'introduction/#install',
  'getting-started/quick-start': 'first-chart/#mount-a-chart',
  'getting-started/data-model': 'guides/data/',
  'chart-types/line': 'guides/marks/#line',
  'chart-types/area': 'guides/marks/#area',
  'chart-types/band': 'guides/marks/#band',
  'chart-types/scatter': 'guides/marks/#scatter',
  'chart-types/heatmap': 'guides/marks/#scatter',
  'chart-types/bar': 'guides/marks/#bar',
  'chart-types/histogram': 'guides/marks/#histogram',
  'series-options/interpolation': 'guides/marks/#line',
  'series-options/styling': 'guides/marks/',
  'series-options/line-dash': 'guides/marks/#line',
  'series-options/nan-gaps': 'guides/data/#gaps',
  'series-options/dual-axis': 'guides/axes/#dual-axes',
  'scales-axes/linear-scale': 'guides/axes/#axis-types',
  'scales-axes/log-scale': 'guides/axes/#axis-types',
  'scales-axes/time-scale': 'guides/axes/#axis-types',
  'scales-axes/category-scale': 'guides/axes/#axis-types',
  'scales-axes/tick-format': 'guides/axes/#formatting-values',
  'interactions/interaction-modes': 'guides/zoom-pan-selection/#interaction-presets',
  'interactions/zoom': 'guides/zoom-pan-selection/',
  'interactions/pan': 'guides/zoom-pan-selection/#mouse',
  'interactions/cursor': 'guides/tooltips-legends/',
  'interactions/touch': 'guides/zoom-pan-selection/#touch',
  'tooltips/tooltip-modes': 'guides/tooltips-legends/#tooltip-modes',
  'tooltips/tooltip-custom': 'guides/tooltips-legends/#custom-tooltip-content',
  'tooltips/tooltip-snap': 'guides/tooltips-legends/#tooltip-modes',
  'theming/themes-builtin': 'guides/theming/#tokens',
  'theming/themes-custom': 'guides/theming/#tokens',
  'theming/css-vars': 'guides/theming/#css-variables',
  'data/streaming': 'guides/updating/#streaming',
  'data/downsampling': 'guides/performance/#decimation',
  'plugins/reference-lines': 'guides/annotations-plugins/#reference-lines-and-regions',
  'plugins/legend-plugin': 'guides/tooltips-legends/#the-legend',
  'plugins/legend-table': 'guides/tooltips-legends/#legend-tables',
  'plugins/cross-chart-sync': 'guides/linked-charts/',
  'plugins/cursor-snapshot': 'guides/tooltips-legends/#a-custom-legend',
  'plugins/custom-plugins': 'guides/annotations-plugins/#the-plugin-contract',
  'recipes/recipe-streaming': 'guides/updating/#streaming',
  'recipes/recipe-linked': 'guides/linked-charts/',
  'recipes/recipe-brush': 'guides/zoom-pan-selection/',
  'recipes/recipe-scatter-encoding': 'guides/marks/#scatter',
  'recipes/recipe-custom-tooltip': 'guides/tooltips-legends/#custom-tooltip-content',
  'recipes/recipe-custom-plugin': 'guides/annotations-plugins/#the-plugin-contract',
  'recipes/recipe-theming': 'guides/theming/',
  'recipes/recipe-downsampling': 'guides/performance/#decimation',
  'recipes/recipe-gaps': 'guides/data/#gaps',
  'recipes/recipe-ticks': 'guides/axes/#explicit-ticks',
  'recipes/recipe-axis-titles': 'guides/axes/#titles',
  'api/api-methods': 'reference/api/readme/',
  'api/api-events': 'reference/api/readme/',
  'api/api-scatter-options': 'reference/api/readme/',
  'api/api-types': 'reference/api/readme/',
};
// The other old top-level hash routes (site/src/App.tsx at the baseline).
const PAGES = {
  docs: 'introduction/',
  demos: 'examples/',
  pulseops: 'examples/',
  cohortlab: 'examples/',
  gridscope: 'examples/',
  visual: '',
};

const nav = execFileSync('git', ['show', 'overhaul-baseline:site/src/pages/docs/nav.ts'], {
  encoding: 'utf8',
});
const groups = [...nav.matchAll(/slug: '([^']+)'/g)].map((m) => m[1]);
const docs = {};
const missing = [];
for (const group of groups) {
  if (!(group in GROUPS)) missing.push(group);
  docs[group] = GROUPS[group];
  const block = nav.slice(nav.indexOf(`slug: '${group}'`));
  const items = block.slice(0, block.indexOf(']'));
  for (const [, id] of items.matchAll(/id: '([^']+)'/g)) {
    const key = `${group}/${id}`;
    if (key in SECTIONS) docs[key] = SECTIONS[key];
    else missing.push(key);
  }
}
if (missing.length > 0) {
  console.error(`old-routes: no mapping for ${missing.join(', ')}`);
  process.exit(1);
}
const unused = Object.keys(SECTIONS).filter((key) => !(key in docs));
if (unused.length > 0) {
  console.error(`old-routes: mappings for routes the old nav does not have: ${unused.join(', ')}`);
  process.exit(1);
}
writeFileSync(OUT, `${JSON.stringify({ pages: PAGES, docs }, null, 2)}\n`);
console.log(
  `old-routes: ${groups.length} groups, ${Object.keys(docs).length - groups.length} sections`,
);
