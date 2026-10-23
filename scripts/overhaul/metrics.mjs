#!/usr/bin/env node
// Overhaul metrics report (plan §0 "End state", §12 M0 step 9).
//
//   node scripts/overhaul/metrics.mjs [--pkg <dir>] [--compact]
//
// Prints one JSON object to stdout. `--pkg` points at a `packages/snaplot`
// directory (default: the one next to this script), so an archived tree such
// as `git archive overhaul-baseline` can be measured too. Runtime exports are
// read from `<pkg>/dist`, so run `npm run build` first; a missing dist is
// reported as an error field, not a crash.
//
// Definitions (keep them stable; later milestones compare against them):
// - Library source: `<pkg>/src/**/*.{ts,tsx}`, excluding `*.test.*`, `*.spec.*`,
//   `*.typecheck.*`, `*.d.ts`. CSS is reported separately under `styles`.
// - Physical lines: newline-terminated lines (what `wc -l` prints for files
//   that end in a newline).
// - Code lines: physical lines that hold at least one non-comment token, found
//   with the TypeScript scanner (blank and comment-only lines do not count).
// - Runtime exports: names a JS entry of `package.json#exports` provides at
//   runtime, resolved by esbuild through `export *` (bare imports external).
// - Option leaves: a type-checker walk of the public types exported from
//   `src/index.ts`, ported from the audit's `evidence/arch/option-tree.cjs`.
//   Properties declared by TypeScript's lib files (the Intl options a format
//   object forwards) are not leaves.
//   Nested object options are expanded (intersections included); `data`,
//   `group` and `plugins` are counted as one leaf each and not entered. The
//   surfaces are ChartOptions, SeriesOptions (union members merged),
//   AxisOptions, ReferenceLine, ReferenceRegion and ChartGroupOptions. A
//   container property such as `series` or `axes` also counts as one leaf, as
//   in the audit.
// - Handle members: properties of `ChartHandle`. Events: the string-literal
//   names accepted by the first parameter of `ChartHandle#on`.
// - Legend implementations: non-test source files whose base name matches
//   /legend/i and whose text mentions "swatch", counted by directory.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const pkgDir = path.resolve(flag('--pkg') ?? path.join(here, '..', '..', 'packages', 'snaplot'));
const srcDir = path.join(pkgDir, 'src');
if (!existsSync(srcDir)) {
  console.error(`metrics: no src directory at ${srcDir}`);
  process.exit(1);
}

const require = createRequire(path.join(pkgDir, 'package.json'));
const ts = require('typescript');

// ---------------------------------------------------------------- sources

const TEST_FILE = /\.(test|spec|typecheck)\.[cm]?[jt]sx?$|\.d\.ts$/;

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

const allFiles = listFiles(srcDir);
const sourceFiles = allFiles.filter((f) => /\.tsx?$/.test(f) && !TEST_FILE.test(f));
const styleFiles = allFiles.filter((f) => f.endsWith('.css'));
const testFiles = allFiles.filter((f) => TEST_FILE.test(f) && !f.endsWith('.d.ts'));

function physicalLines(text) {
  if (text === '') return 0;
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

// Walks the parsed tree down to its tokens (JSDoc nodes skipped) and marks every
// line a token spans. A raw scanner is not enough: without the parser it cannot
// tell where a template literal resumes after `${…}`.
function codeLines(text, file) {
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const code = new Set();
  const visit = (node) => {
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode)
      return;
    const children = node.getChildren(sf);
    if (children.length > 0) {
      for (const child of children) visit(child);
      return;
    }
    if (node.kind === ts.SyntaxKind.EndOfFileToken) return;
    const start = node.getStart(sf);
    const end = Math.max(start, node.getEnd() - 1);
    const first = sf.getLineAndCharacterOfPosition(start).line;
    const last = sf.getLineAndCharacterOfPosition(end).line;
    for (let line = first; line <= last; line++) code.add(line);
  };
  visit(sf);
  return code.size;
}

const rel = (f) => path.relative(srcDir, f).split(path.sep).join('/');
const fileStats = sourceFiles.map((f) => {
  const text = readFileSync(f, 'utf8');
  return { file: rel(f), physical: physicalLines(text), code: codeLines(text, f) };
});
const byDir = {};
for (const s of fileStats) {
  const dir = s.file.includes('/') ? s.file.slice(0, s.file.lastIndexOf('/')) : '.';
  byDir[dir] ??= { files: 0, physical: 0, code: 0 };
  byDir[dir].files++;
  byDir[dir].physical += s.physical;
  byDir[dir].code += s.code;
}
const largest = [...fileStats].sort((a, b) => b.physical - a.physical);
const sum = (key) => fileStats.reduce((n, s) => n + s[key], 0);

// ---------------------------------------------------------------- runtime exports

async function runtimeExports() {
  const pkg = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  const entries = Object.entries(pkg.exports ?? {}).filter(([key]) => key !== './package.json');
  const pick = (target) => {
    if (typeof target === 'string') return target;
    if (!target || typeof target !== 'object') return undefined;
    for (const cond of ['browser', 'import', 'default']) {
      const hit = pick(target[cond]);
      if (hit) return hit;
    }
    return undefined;
  };
  let esbuild;
  try {
    const mod = await import(pathToFileURL(require.resolve('esbuild')).href);
    esbuild = mod.build ? mod : mod.default;
  } catch (error) {
    return { error: `esbuild not resolvable: ${error.message}`, entryPoints: entries.length };
  }
  const perEntry = {};
  for (const [key, target] of entries) {
    const file = pick(target);
    if (!file || !/\.[cm]?js$/.test(file)) continue;
    const abs = path.join(pkgDir, file);
    if (!existsSync(abs)) {
      perEntry[key] = { file, error: 'missing; run npm run build first' };
      continue;
    }
    const result = await esbuild.build({
      entryPoints: [abs],
      bundle: true,
      write: false,
      metafile: true,
      format: 'esm',
      platform: 'neutral',
      packages: 'external',
      loader: { '.css': 'empty' },
      logLevel: 'silent',
      outdir: path.join(pkgDir, '.metrics-out'),
    });
    const output = Object.values(result.metafile.outputs).find((o) => o.entryPoint);
    const names = [...(output?.exports ?? [])].sort();
    perEntry[key] = { file, count: names.length, names };
  }
  return {
    entryPoints: entries.length,
    entryPointNames: entries.map(([key]) => key),
    perEntry,
  };
}

// ---------------------------------------------------------------- public types

function publicTypes() {
  const configPath = path.join(pkgDir, 'tsconfig.json');
  const cfg = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, pkgDir);
  const indexFile = path.join(srcDir, 'index.ts');
  const probe = path.join(srcDir, '__metrics_probe__.ts');
  let probeText = 'export {};\n';
  const files = [...parsed.fileNames.filter((f) => !TEST_FILE.test(f)), probe];
  const options = { ...parsed.options, noEmit: true };
  const host = {
    getScriptFileNames: () => files,
    getScriptVersion: (f) => (f === probe ? String(probeText.length) : '1'),
    getScriptSnapshot: (f) => {
      const text = f === probe ? probeText : ts.sys.readFile(f);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => pkgDir,
    getCompilationSettings: () => options,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: (f) => f === probe || ts.sys.fileExists(f),
    readFile: (f) => (f === probe ? probeText : ts.sys.readFile(f)),
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };
  const service = ts.createLanguageService(host, ts.createDocumentRegistry());

  // Pass 1: which public type names exist, and which are generic.
  let program = service.getProgram();
  let checker = program.getTypeChecker();
  const indexSymbol = checker.getSymbolAtLocation(program.getSourceFile(indexFile));
  const exported = new Map();
  for (const sym of indexSymbol ? checker.getExportsOfModule(indexSymbol) : []) {
    const target = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
    const decl = target.declarations?.[0];
    exported.set(sym.name, decl?.typeParameters?.length ?? 0);
  }
  const wanted = [
    'ChartOptions',
    'SeriesOptions',
    'AxisOptions',
    'ReferenceLine',
    'ReferenceRegion',
    'ChartGroupOptions',
    'ChartHandle',
  ];
  const present = wanted.filter((name) => exported.has(name));
  probeText = [
    `import type { ${present.join(', ')} } from './index';`,
    'type Row = { t: number; v: number };',
    ...present.map(
      (name) => `export type P_${name} = ${name}${exported.get(name) ? '<Row>' : ''};`,
    ),
  ].join('\n');

  // Pass 2: walk them.
  program = service.getProgram();
  checker = program.getTypeChecker();
  const sf = program.getSourceFile(probe);
  const mod = checker.getSymbolAtLocation(sf);
  const types = new Map();
  for (const exp of mod ? checker.getExportsOfModule(mod) : []) {
    types.set(exp.name.replace(/^P_/, ''), checker.getDeclaredTypeOfSymbol(exp));
  }

  const skipInto = new Set(['data', 'group', 'plugins']);
  // Built-in object types are values, not option groups. Matched by symbol name
  // (the audit's walker matched the printed type, which also skipped `tooltip`
  // because its `render` signature mentions HTMLElement).
  const BUILTIN = /^(Float64Array|HTMLElement|Element|Node|Date|ReadonlyArray|Array|Map|Set)$/;
  const isPlainObject = (t) =>
    (t.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection)) !== 0 &&
    !checker.isArrayType(t) &&
    !checker.isTupleType(t) &&
    t.getCallSignatures().length === 0 &&
    checker.getPropertiesOfType(t).length > 0 &&
    !BUILTIN.test((t.aliasSymbol ?? t.getSymbol())?.name ?? '');

  // Properties the platform declares (Intl.NumberFormatOptions inside a NumberFormat, …) are
  // values the option forwards, not option leaves of snaplot's own.
  const isLibDeclaration = (decl) => {
    const file = decl.getSourceFile();
    return file.hasNoDefaultLib || /[\\/]typescript[\\/]lib[\\/]lib\./.test(file.fileName);
  };
  function walk(type, prefix, out, depth) {
    for (const prop of checker.getPropertiesOfType(type)) {
      if (prop.declarations?.length && prop.declarations.every(isLibDeclaration)) continue;
      const name = prefix ? `${prefix}.${prop.name}` : prop.name;
      const decl = prop.valueDeclaration ?? prop.declarations?.[0];
      const t = checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(prop, decl ?? sf));
      const parts = t.isUnion() ? t.types : [t];
      const objects = parts.filter(isPlainObject);
      if (objects.length && depth < 4 && !skipInto.has(prop.name)) {
        out.add(`${name} {object}`);
        for (const o of objects) walk(o, name, out, depth + 1);
      } else {
        out.add(name);
      }
    }
  }
  function leaves(name) {
    const type = types.get(name);
    if (!type) return null;
    const out = new Set();
    for (const member of type.isUnion() ? type.types : [type]) walk(member, '', out, 0);
    const list = [...out].filter((x) => !x.endsWith('{object}')).sort();
    return { count: list.length, leaves: list };
  }

  const surfaces = {};
  for (const name of wanted.filter((n) => n !== 'ChartHandle')) surfaces[name] = leaves(name);
  const total = Object.values(surfaces).reduce((n, s) => n + (s?.count ?? 0), 0);

  let handle = null;
  const handleType = types.get('ChartHandle');
  if (handleType) {
    const members = checker
      .getPropertiesOfType(handleType)
      .map((p) => p.name)
      .sort();
    const events = new Set();
    const on = handleType.getProperty('on');
    if (on) {
      const onType = checker.getTypeOfSymbolAtLocation(on, sf);
      for (const sig of onType.getCallSignatures()) {
        const first = sig.getParameters()[0];
        if (!first) continue;
        let t = checker.getTypeOfSymbolAtLocation(first, sf);
        if (t.flags & ts.TypeFlags.TypeParameter) t = checker.getBaseConstraintOfType(t) ?? t;
        for (const part of t.isUnion() ? t.types : [t]) {
          if (part.isStringLiteral()) events.add(part.value);
        }
      }
    }
    handle = {
      members: members.length,
      memberNames: members,
      events: events.size,
      eventNames: [...events].sort(),
    };
  }
  return {
    optionLeaves: { total, surfaces, missing: wanted.filter((n) => !present.includes(n)) },
    handle,
  };
}

// ---------------------------------------------------------------- legends

function legendImplementations() {
  const hits = sourceFiles.filter(
    (f) => /legend/i.test(path.basename(f)) && /swatch/i.test(readFileSync(f, 'utf8')),
  );
  const dirs = [...new Set(hits.map((f) => path.dirname(rel(f))))].sort();
  return { count: dirs.length, directories: dirs, files: hits.map(rel) };
}

// ---------------------------------------------------------------- report

// The commit the measured tree belongs to; null when the tree is not tracked
// (for example a `git archive` export measured with --pkg).
function gitRef() {
  const git = (...gitArgs) =>
    execFileSync('git', ['-C', pkgDir, ...gitArgs], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  try {
    git('ls-files', '--error-unmatch', 'package.json');
    return git('rev-parse', '--short', 'HEAD');
  } catch {
    return null;
  }
}

const types = publicTypes();
const report = {
  generatedAt: new Date().toISOString(),
  pkg: path.relative(process.cwd(), pkgDir) || '.',
  gitHead: gitRef(),
  source: {
    files: fileStats.length,
    physicalLines: sum('physical'),
    codeLines: sum('code'),
    largestFile: largest[0] ? { file: largest[0].file, physicalLines: largest[0].physical } : null,
    top5: largest.slice(0, 5).map((s) => ({ file: s.file, physicalLines: s.physical })),
    byDir,
  },
  styles: {
    files: styleFiles.length,
    physicalLines: styleFiles.reduce((n, f) => n + physicalLines(readFileSync(f, 'utf8')), 0),
  },
  testFiles: testFiles.length,
  runtimeExports: await runtimeExports(),
  optionLeaves: types.optionLeaves,
  handle: types.handle,
  legendImplementations: legendImplementations(),
};
process.stdout.write(`${JSON.stringify(report, null, args.includes('--compact') ? 0 : 2)}\n`);
