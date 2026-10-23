// Architecture rules (plan §2): P2 "one implementation per concept" and P3 "adapters use only the
// public API", checked over the TypeScript syntax tree of packages/snaplot/src (tests excluded),
// so comments and type positions never count.
//
//   node scripts/check-architecture.mjs [--strict] [--verbose] [--json]
//
// Each rule group has a mode. `warn` prints violations and exits 0; `error` exits 1 on any.
// M13 switches P3 to error, M14 switches everything (plan §11.3 G3). --strict treats every rule
// as an error, for a local preview.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const MODES = { P2: 'warn', P3: 'warn' };

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(repo, 'packages/snaplot/src');
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const verbose = args.includes('--verbose');
const asJson = args.includes('--json');

const MARK_TYPES = new Set(['line', 'area', 'band', 'scatter', 'bar', 'histogram', 'heatmap']);
const DOM_OBSERVERS = new Set([
  'matchMedia',
  'ResizeObserver',
  'IntersectionObserver',
  'requestAnimationFrame',
]);
const ERROR_TYPES = new Set(['Error', 'TypeError', 'RangeError']);
const COLOR_PATTERN = /rgba?|hsla?|\[(?:0-9a-f|a-f0-9|\\da-f|a-f\\d|0-9a-fA-F|0-9A-Fa-f|0-9A-F)/i;
const FRAMEWORKS = /^(react|react-dom|solid-js)(\/|$)/;

/** P2 rules: what is detected, and the only files allowed to do it (relative to src/). */
const P2 = {
  format: {
    what: 'number and date formatting (toFixed, toLocale*, new Intl.*)',
    allowed: (file) => file === 'engine/format.ts',
  },
  color: {
    what: 'hex, rgb() or hsl() colour parsing',
    allowed: (file) => file === 'engine/theme/color.ts',
  },
  observers: {
    what: 'matchMedia, ResizeObserver, IntersectionObserver, requestAnimationFrame',
    allowed: (file) => file === 'engine/render/surface.ts' || file === 'engine/render/scheduler.ts',
  },
  errors: {
    what: 'throw new Error',
    allowed: (file) => file.startsWith('public/') || file === 'engine/errors.ts',
  },
  marks: {
    what: 'branches on a series type',
    allowed: (file) => file === 'engine/marks/index.ts',
  },
};

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry.name) || /\.(test|spec|typecheck)\.tsx?$/.test(entry.name)) return [];
    return [path];
  });
}

const inTypePosition = (node) => {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isTypeNode(n) || ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n))
      return true;
    if (ts.isExpression(n) || ts.isStatement(n)) return false;
  }
  return false;
};

const isMarkLiteral = (node) => ts.isStringLiteralLike(node) && MARK_TYPES.has(node.text);
const isTypeAccess = (node) => ts.isPropertyAccessExpression(node) && node.name.text === 'type';

function p2Violations(file, source) {
  const found = [];
  const add = (rule, node, text) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    found.push({ group: 'P2', rule, file, line: line + 1, text });
  };
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isPropertyAccessExpression(callee)) {
        const name = callee.name.text;
        if (name === 'toFixed' || name.startsWith('toLocale')) add('format', node, `.${name}()`);
      }
      if (
        ts.isIdentifier(callee) &&
        callee.text === 'parseInt' &&
        node.arguments[1] &&
        ts.isNumericLiteral(node.arguments[1]) &&
        node.arguments[1].text === '16'
      )
        add('color', node, 'parseInt(…, 16)');
    }
    if (ts.isNewExpression(node)) {
      const callee = node.expression;
      if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === 'Intl'
      )
        add('format', node, `new Intl.${callee.name.text}`);
      if (
        ts.isIdentifier(callee) &&
        callee.text === 'RegExp' &&
        node.arguments?.[0] &&
        ts.isStringLiteralLike(node.arguments[0]) &&
        COLOR_PATTERN.test(node.arguments[0].text)
      )
        add('color', node, `new RegExp(${JSON.stringify(node.arguments[0].text)})`);
    }
    if (ts.isRegularExpressionLiteral(node) && COLOR_PATTERN.test(node.text))
      add('color', node, node.text);
    if (ts.isIdentifier(node) && DOM_OBSERVERS.has(node.text) && !inTypePosition(node))
      add('observers', node, node.text);
    if (
      ts.isThrowStatement(node) &&
      node.expression &&
      ts.isNewExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      ERROR_TYPES.has(node.expression.expression.text)
    )
      add('errors', node, `throw new ${node.expression.expression.text}`);
    if (
      ts.isBinaryExpression(node) &&
      [
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsToken,
      ].includes(node.operatorToken.kind) &&
      ((isTypeAccess(node.left) && isMarkLiteral(node.right)) ||
        (isTypeAccess(node.right) && isMarkLiteral(node.left)))
    )
      add('marks', node, node.getText(source));
    if (
      ts.isSwitchStatement(node) &&
      isTypeAccess(node.expression) &&
      node.caseBlock.clauses.some((c) => ts.isCaseClause(c) && isMarkLiteral(c.expression))
    )
      add('marks', node, `switch (${node.expression.getText(source)})`);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found.filter((v) => !P2[v.rule].allowed(file));
}

/** P3: the adapters import runtime code only from 'snaplot', their peers and ../adapters/bind. */
function p3Violations(file, source) {
  const area = file.split('/')[0];
  if (!['react', 'solid', 'adapters'].includes(area) || !file.includes('/')) return [];
  const found = [];
  const check = (node, specifier, typeOnly) => {
    if (specifier === 'snaplot' || FRAMEWORKS.test(specifier)) return;
    if (specifier.startsWith('.')) {
      const target = relative(src, resolve(join(src, dirname(file)), specifier));
      if (target.split('/')[0] === area || target === 'adapters/bind') return;
    }
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    const kind = typeOnly ? ' (type-only)' : '';
    found.push({ group: 'P3', rule: 'imports', file, line: line + 1, text: `${specifier}${kind}` });
  };
  for (const statement of source.statements) {
    if (
      (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const typeOnly = ts.isImportDeclaration(statement)
        ? Boolean(statement.importClause?.isTypeOnly)
        : statement.isTypeOnly;
      check(statement, statement.moduleSpecifier.text, typeOnly);
    }
  }
  return found;
}

const violations = [];
for (const path of sourceFiles(src)) {
  const file = relative(src, path);
  const text = readFileSync(path, 'utf8');
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  violations.push(...p2Violations(file, source), ...p3Violations(file, source));
}

const modeOf = (group) => (strict ? 'error' : MODES[group]);
if (asJson) {
  console.log(JSON.stringify({ modes: MODES, strict, violations }, null, 2));
} else {
  const rules = [
    ...Object.entries(P2).map(([rule, { what }]) => ['P2', rule, what]),
    ['P3', 'imports', "adapter imports other than 'snaplot', peers and ../adapters/bind"],
  ];
  for (const [group, rule, what] of rules) {
    const hits = violations.filter((v) => v.group === group && v.rule === rule);
    console.log(`${group} ${rule} [${modeOf(group)}]: ${hits.length} — ${what}`);
    const byFile = new Map();
    for (const hit of hits) byFile.set(hit.file, [...(byFile.get(hit.file) ?? []), hit]);
    for (const [file, list] of byFile) {
      if (verbose) for (const hit of list) console.log(`  src/${file}:${hit.line}  ${hit.text}`);
      else
        console.log(`  src/${file} (${list.length}): line ${list.map((h) => h.line).join(', ')}`);
    }
  }
}

const errors = violations.filter((v) => modeOf(v.group) === 'error');
if (errors.length > 0) {
  console.error(`check-architecture: ${errors.length} violation(s) of rules in error mode.`);
  process.exit(1);
}
if (!asJson)
  console.log(
    `check-architecture: ${violations.length} violation(s), all in warn mode (P2 errors from M14, P3 from M13).`,
  );
