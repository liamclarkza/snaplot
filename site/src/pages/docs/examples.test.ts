/// <reference types="vite/client" />
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as snaplot from 'snaplot';
import * as fixtures from './fixtures';
import { prepareChart } from '../../../../packages/snaplot/src/api/prepare';
const sources = import.meta.glob<string>('./sections/*.tsx', { query: '?raw', import: 'default', eager: true });
const fixtureNames = Object.keys(fixtures);
const fixtureValues = Object.values(fixtures);
const cases: { title: string; code: string; data: snaplot.DataSource<Record<string, unknown>> }[] = [];
for (const [file, text] of Object.entries(sources)) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const data = new Map<string, snaplot.DataSource<Record<string, unknown>>>();
  function scan(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(source) === 'createSignal') {
      const first = node.name.elements[0];
      if (first && ts.isBindingElement(first) && node.initializer.arguments.length) {
        try {
          data.set(first.name.getText(source), new Function(...fixtureNames, `return (${node.initializer.arguments[0].getText(source)});`)(...fixtureValues));
        } catch { /* Downsampled examples have local lx/ly values; same named schema below. */ }
      }
    }
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'Demo') {
      const attrs = new Map(node.attributes.properties.filter(ts.isJsxAttribute).map(attr => [attr.name.getText(source), attr.initializer]));
      const code = attrs.get('code'); const input = attrs.get('data'); const title = attrs.get('title');
      if (code && ts.isJsxExpression(code) && code.expression && ts.isNoSubstitutionTemplateLiteral(code.expression) && input && ts.isJsxExpression(input) && input.expression) {
        const key = input.expression.getText(source).replace(/\(\)$/, '');
        const resolved = data.get(key) ?? (key === 'd_lttb' || key === 'd_m4' ? fixtures.timeSeries(20, 1) : undefined);
        if (!resolved) throw new Error(`Missing docs fixture ${file}: ${key}`);
        cases.push({ title: `${file}: ${title && ts.isStringLiteral(title) ? title.text : key}`, code: code.expression.text, data: resolved });
      }
    }
    ts.forEachChild(node, scan);
  }
  scan(source);
}
describe('public live documentation examples', () => {
  it('discovers the complete live example set', () => { expect(cases.length).toBeGreaterThan(30); });
  for (const example of cases) it(example.title, () => {
    const options = new Function('data', ...Object.keys(snaplot), `return (${example.code});`)(example.data, ...Object.values(snaplot));
    expect(() => prepareChart({ data: example.data, x: 'x', ...options })).not.toThrow();
  });
});
