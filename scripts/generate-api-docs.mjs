// Generates the docs-site API reference from the library's TypeScript
// declarations, so the reference cannot drift from the code.
//
//   node scripts/generate-api-docs.mjs
//
// Reads packages/snaplot/src/types.ts (and the solid entry types) with
// the TypeScript compiler API and writes site/src/pages/docs/api.gen.json:
//
//   {
//     methods:  [{ name, signature, doc }]      // ChartInstance members
//     events:   [{ name, signature, doc }]      // ChartEventMap members
//     scatter:  [{ name, type, doc, optional }] // scatter fields on SeriesConfig
//     types:    [{ name, kind, doc }]           // exported types from 'snaplot'
//     solidTypes: [{ name, kind, doc }]         // exported types from 'snaplot/solid'
//   }
//
// The JSON is checked in so `vite dev` works without a generation step;
// `npm run build:site` regenerates it first, and fails if any extraction
// comes back empty (a rename would otherwise silently blank a section).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = join(root, 'site', 'src', 'pages', 'docs', 'api.gen.json');

// Scatter-specific fields of SeriesConfig, in display order. Curated here
// (not in the site) so the generator is the single source of the section.
const SCATTER_FIELDS = [
  'xDataIndex',
  'yDataIndex',
  'renderMode',
  'pointShape',
  'colorBy',
  'sizeBy',
  'tooltipFields',
  'heatmap',
  'heatmapBinSize',
  'heatmapGradient',
];

function parse(file) {
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
}

/** JSDoc text of a node, collapsed to single-space prose. */
function docOf(node) {
  const docs = node.jsDoc;
  if (!docs || docs.length === 0) return '';
  const comment = docs[docs.length - 1].comment;
  const text = typeof comment === 'string' ? comment : (comment ?? []).map((c) => c.text ?? '').join('');
  return text.replace(/\s+/g, ' ').trim();
}

/** Source text of a member with its JSDoc stripped, collapsed to one line. */
function signatureOf(member, source) {
  const start = member.getStart(source, false); // false: skip leading JSDoc
  const text = source.text.slice(start, member.end);
  return text
    .replace(/\s+/g, ' ')
    .replace(/;$/, '')
    .trim();
}

function interfaceMembers(source, interfaceName) {
  let decl;
  ts.forEachChild(source, (node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) decl = node;
  });
  if (!decl) return null;
  return decl.members
    .filter((m) => m.name)
    .map((m) => ({
      name: ts.isStringLiteral(m.name) ? m.name.text : m.name.getText(source),
      signature: signatureOf(m, source),
      doc: docOf(m),
      optional: !!m.questionToken,
      type: m.type ? m.type.getText(source).replace(/\s+/g, ' ') : '',
    }));
}

/** Every exported interface / type alias with its one-line doc summary. */
function exportedTypes(source) {
  const out = [];
  ts.forEachChild(source, (node) => {
    const isType = ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node);
    if (!isType) return;
    const exported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) return;
    out.push({
      name: node.name.text,
      kind: ts.isInterfaceDeclaration(node) ? 'interface' : 'type',
      doc: docOf(node),
    });
  });
  return out;
}

/** Type names re-exported from an entry file (`export type { A, B } from ...`). */
function reExportedNames(entryFile) {
  const source = parse(entryFile);
  const names = new Set();
  ts.forEachChild(source, (node) => {
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const el of node.exportClause.elements) names.add(el.name.text);
    }
  });
  return names;
}

const typesSource = parse(join(root, 'packages/snaplot/src/types.ts'));

const methods = interfaceMembers(typesSource, 'ChartInstance');
const events = interfaceMembers(typesSource, 'ChartEventMap');
const seriesMembers = interfaceMembers(typesSource, 'SeriesConfig');
const allTypes = exportedTypes(typesSource);

// Only list types that actually reach consumers through the package entry.
// index.ts is `export * from './core'`, so core.ts holds the named list.
const indexNames = reExportedNames(join(root, 'packages/snaplot/src/core.ts'));
const types = allTypes.filter((t) => indexNames.has(t.name));

// Solid entry: collect exported types from the solid source files that the
// entry re-exports, keyed off the entry's named export list.
const solidNames = reExportedNames(join(root, 'packages/snaplot/src/solid.ts'));
const solidTypes = [];
for (const file of [
  'packages/snaplot/src/solid/LegendTable.tsx',
  'packages/snaplot/src/solid/createChartGroup.ts',
  'packages/snaplot/src/solid/createChart.ts',
]) {
  try {
    for (const t of exportedTypes(parse(join(root, file)))) {
      if (solidNames.has(t.name)) solidTypes.push(t);
    }
  } catch {
    // Optional file; the emptiness check below is the real guard.
  }
}

const scatter = (seriesMembers ?? []).filter((m) => SCATTER_FIELDS.includes(m.name));
scatter.sort((a, b) => SCATTER_FIELDS.indexOf(a.name) - SCATTER_FIELDS.indexOf(b.name));

const sections = { methods, events, scatter, types, solidTypes };
for (const [key, value] of Object.entries(sections)) {
  if (!value || value.length === 0) {
    console.error(`generate-api-docs: extracted 0 entries for "${key}" - did a declaration move or get renamed?`);
    process.exit(1);
  }
}

writeFileSync(outFile, `${JSON.stringify(sections, null, 2)}\n`);
console.log(
  `api.gen.json: ${methods.length} methods, ${events.length} events, ` +
    `${scatter.length} scatter fields, ${types.length} core types, ${solidTypes.length} solid types`,
);
