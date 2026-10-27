#!/usr/bin/env node
// Plan §8.5: the migration guide names every public name 0.12 had that 1.0 does not
// (docs/decisions/removed-since-0.12.txt). An `entry` or `export` passes when the guide has the
// name in backticks; a `from <entry> <name>` line when it has the name; a `member Type.member`
// line when the guide names the type and, for a type that 1.0 still exports, the member too.
//
//   node scripts/overhaul/check-migration.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '../..');
const list = readFileSync(join(repo, 'docs/decisions/removed-since-0.12.txt'), 'utf8');
const guide = readFileSync(join(repo, 'site/src/content/docs/migrate-0-12.mdx'), 'utf8');

const rows = list
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => line.split(/\s+/));
const removed = new Set(rows.filter(([kind]) => kind === 'export').map(([, name]) => name));
const named = (name) => guide.includes(`\`${name}\``);

const missing = [];
for (const row of rows) {
  const [kind] = row;
  if (kind === 'entry' || kind === 'export') {
    if (!named(row[1])) missing.push(row.join(' '));
  } else if (kind === 'from') {
    if (!guide.includes(row[2])) missing.push(row.join(' '));
  } else if (kind === 'member') {
    const [type, member] = row[1].split('.');
    if (!named(type) || (!removed.has(type) && !named(member))) missing.push(row.join(' '));
  }
}

if (missing.length) {
  console.error(`check-migration: the guide does not mention ${missing.length} removed name(s):`);
  for (const line of missing) console.error(`  ${line}`);
  process.exit(1);
}
console.log(`check-migration: OK (${rows.length} removed names, all in the migration guide)`);
