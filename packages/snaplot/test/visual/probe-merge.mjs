#!/usr/bin/env node
// Write the probe snapshot (probe.spec.ts) from the records of a probe run:
//
//   node test/visual/probe-merge.mjs [<records dir>] [<snapshot>]
//
// Defaults: test-results/probe and test/visual/__probe__/m9a.json. One line per fixture, sorted
// by id, so a diff of the snapshot names the fixtures that changed.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const dir = resolve(process.argv[2] ?? join(HERE, '../../test-results/probe'));
const out = resolve(process.argv[3] ?? join(HERE, '__probe__/m9a.json'));

const records = readdirSync(dir)
  .filter((name) => name.endsWith('.json'))
  .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')))
  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
if (records.length === 0) {
  console.error(`probe-merge: no records in ${dir}`);
  process.exit(1);
}
const lines = records.map((record) => `  ${JSON.stringify(record.id)}: ${JSON.stringify(record)}`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `{\n${lines.join(',\n')}\n}\n`);
console.log(`probe-merge: ${records.length} fixtures → ${out}`);
