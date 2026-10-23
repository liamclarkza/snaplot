// Static module graph of the installed package: which files a runtime loads for an entry point
// under a set of export conditions. Bare specifiers other than `snaplot` itself are leaves.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import ts from 'typescript';
import { manifest, packageDir } from './consumer.mjs';

/** Follows the exports map like Node and bundlers do: first key in object order that matches. */
export function resolveExport(specifier, conditions) {
  const subpath = specifier === 'snaplot' ? '.' : `./${specifier.slice('snaplot/'.length)}`;
  let target = manifest.exports[subpath];
  while (target && typeof target === 'object') {
    const key = Object.keys(target).find((k) => k === 'default' || conditions.includes(k));
    target = key === undefined ? undefined : target[key];
  }
  if (typeof target !== 'string')
    throw new Error(`${specifier} does not resolve for ${conditions}`);
  return join(packageDir, target);
}

export function importsOf(file) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.JS,
  );
  const found = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      found.push(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      found.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/**
 * Every package file loaded from these entry points, plus the bare specifiers they import.
 * `snaplot` self-imports are followed through the exports map with the same conditions.
 */
export function moduleGraph(entries, conditions) {
  const files = new Set();
  const external = new Set();
  const walk = (file) => {
    if (files.has(file)) return;
    files.add(file);
    for (const specifier of importsOf(file)) {
      if (specifier.startsWith('.')) walk(resolve(dirname(file), specifier));
      else if (specifier === 'snaplot' || specifier.startsWith('snaplot/'))
        walk(resolveExport(specifier, conditions));
      else external.add(specifier);
    }
  };
  for (const entry of entries) walk(resolveExport(entry, conditions));
  return { files: [...files].map((file) => file.slice(packageDir.length + 1)), external };
}

/**
 * Files that carry a copy of the chart engine. The debug-counter symbol (plan D31) is created in
 * exactly one engine module, so each copy of the engine contains its key once.
 */
export function engineCopies(graph) {
  return graph.files.filter((file) =>
    readFileSync(join(packageDir, file), 'utf8').includes('snaplot.debug'),
  );
}
