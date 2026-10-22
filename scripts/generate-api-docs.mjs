// Generates the docs-site API reference from the library's TypeScript
// declarations, so the reference cannot drift from the code.
//
//   node scripts/generate-api-docs.mjs
//
// Reads packages/snaplot/src/api/types.ts (and the solid entry types) with
// the TypeScript compiler API and writes site/src/pages/docs/api.gen.json:
//
//   {
//     methods:  [{ name, signature, doc }]      // ChartHandle members
//     events:   [{ name, signature, doc }]      // ChartEvents members
//     scatter:  [{ name, type, doc, optional }] // scatter fields on SeriesOptions
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
  'x',
  'y',
  'renderMode',
  'pointShape',
  'colorBy',
  'sizeBy',
  'tooltipFields',
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

const apiPath = join(root, 'packages/snaplot/src/api/types.ts');
const typesSource = parse(apiPath);
const engineSource = parse(join(root, 'packages/snaplot/src/types.ts'));
const methods = interfaceMembers(typesSource, 'ChartHandle');
const events = interfaceMembers(typesSource, 'ChartEvents');
const allTypes = [...exportedTypes(typesSource), ...exportedTypes(engineSource)];
const indexNames = reExportedNames(join(root, 'packages/snaplot/src/core.ts'));
const types = [...new Map(allTypes.filter(t => indexNames.has(t.name)).reverse().map(t => [t.name, t])).values()];
function frameworkTypes(framework) {
  const names = reExportedNames(join(root, `packages/snaplot/src/${framework}.ts`));
  const files = framework === 'react'
    ? ['react/Chart.ts', 'react/legends.ts', 'react/shared.ts', 'api/types.ts']
    : ['solid/Chart.tsx', 'solid/LegendTable.tsx', 'solid/SeriesLegend.tsx', 'react/shared.ts', 'api/types.ts'];
  return files.flatMap(file => exportedTypes(parse(join(root, 'packages/snaplot/src', file)))).filter(type => names.has(type.name));
}
const solidTypes = frameworkTypes('solid');
const reactTypes = frameworkTypes('react');
// Resolve inherited and discriminated series fields through TypeScript itself.
const program = ts.createProgram([apiPath], { target: ts.ScriptTarget.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext, skipLibCheck: true });
const checker = program.getTypeChecker();
const source = program.getSourceFile(apiPath);
const declaration = source.statements.find(node => ts.isTypeAliasDeclaration(node) && node.name.text === 'SeriesOptions');
const union = checker.getTypeAtLocation(declaration);
const scatterType = union.types.find(type => {
  const prop = type.getProperty('type');
  return prop && checker.typeToString(checker.getTypeOfSymbolAtLocation(prop, declaration)) === '"scatter"';
});
const scatter = SCATTER_FIELDS.flatMap(name => {
  const prop = scatterType?.getProperty(name);
  if (!prop) return [];
  return [{ name, type: checker.typeToString(checker.getTypeOfSymbolAtLocation(prop, declaration), undefined, ts.TypeFormatFlags.NoTruncation), doc: ts.displayPartsToString(prop.getDocumentationComment(checker)), optional: !!(prop.flags & ts.SymbolFlags.Optional) }];
});

const sections = { methods, events, scatter, types, solidTypes, reactTypes };
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
