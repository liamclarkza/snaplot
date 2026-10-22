import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createElement } from 'react';
import { renderToString as reactSSR } from 'react-dom/server';
import { createComponent } from 'solid-js';
import { renderToString as solidSSR } from 'solid-js/web';
import { Chart as ReactChart } from 'snaplot/react';
import { Chart as SolidChart } from 'snaplot/solid';
const options = { data: [{ x: 1, y: 2 }], x: 'x', series: [{ y: 'y' }], ariaLabel: 'Consumer chart' };
assert.match(reactSSR(createElement(ReactChart, options)), /aria-label="Consumer chart"/);
assert.match(solidSSR(() => createComponent(SolidChart, options)), /aria-label="Consumer chart"/);
const packageRoot = fileURLToPath(new URL('../', import.meta.url));
// Traverse emitted static imports/re-exports and literal dynamic imports. Importing
// the core must never resolve either optional framework peer.
const visited = new Set();
function inspectCore(file) {
  if (visited.has(file)) return;
  visited.add(file);
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  function check(specifier) {
    assert.ok(!/^(react|react-dom|solid-js)(\/|$)/.test(specifier), `Core loads optional framework: ${specifier}`);
    if (specifier.startsWith('.')) inspectCore(resolve(dirname(file), specifier));
  }
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) check(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) check(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(source);
}
inspectCore(join(packageRoot, 'dist/index.js'));
inspectCore(join(packageRoot, 'dist/core.js'));
const fixture = mkdtempSync(join(tmpdir(), 'snaplot-consumers-'));
try {
  const reactPath = JSON.stringify(join(packageRoot, 'dist/react.js'));
  const solidPath = JSON.stringify(join(packageRoot, 'dist/solid.js'));
  writeFileSync(join(fixture, 'consumer.ts'), `
import type { ChartProps as ReactProps } from ${reactPath};
import type { ChartProps as SolidProps } from ${solidPath};
type Row = { time: number; cpu: number; label: string };
const react: ReactProps<Row> = { data: [{ time: 1, cpu: 2, label: 'a' }], x: 'time', series: [{ y: 'cpu' }], viewport: { x: { min: 0, max: 2 } } };
const solid: SolidProps<Row> = { data: react.data, x: 'time', series: [{ y: 'cpu' }], ref: chart => { chart?.setHighlight('cpu'); } };
const invalid: ReactProps<Row> = { series: [
  // @ts-expect-error misspelled fields are rejected
  { y: 'cpus' }
] };
const invalidSolid: SolidProps<Row> = { series: [
  // @ts-expect-error string metric fields are rejected
  { y: 'label' }
] };
void [react, solid, invalid, invalidSolid];
`);
  execFileSync(process.execPath, [resolve(packageRoot, '../../node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--target', 'ESNext', '--module', 'ESNext', '--moduleResolution', 'bundler', join(fixture, 'consumer.ts')], { stdio: 'inherit' });
} finally { rmSync(fixture, { recursive: true, force: true }); }
console.log('Built core isolation, React and Solid declarations, and server rendering passed.');
