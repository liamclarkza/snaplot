import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild';
import ts from 'typescript';
import { defineConfig, type Plugin } from 'vite';
import dts from 'vite-plugin-dts';
import solid from 'vite-plugin-solid';

const root = __dirname;
const solidDir = resolve(root, 'src/solid');
const solidEntry = resolve(root, 'src/solid.ts');

/**
 * Peers and the core itself. The adapters import 'snaplot' once M13 switches them to the public
 * API (plan §11.2), so every entry shares the one published core.
 */
export const external = ['snaplot', /^solid-js(\/|$)/, /^react(\/|$)/, /^react-dom(\/|$)/];

/** The build target for the D25 browser floor (Chrome 111, Firefox 115, Safari 16.4). */
export const target = 'es2022';

const isSolidModule = (file: string) => file === solidEntry || file.startsWith(`${solidDir}/`);

function solidModules(dir = solidDir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return solidModules(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function resolveSource(from: string, specifier: string): string {
  const base = resolve(dirname(from), specifier);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')])
    if (existsSync(candidate)) return candidate;
  throw new Error(`cannot resolve ${specifier} from ${from}`);
}

/**
 * Runtime names the Solid adapter imports or re-exports from modules outside src/solid
 * (module → names). Type-only imports and exports are skipped; they are erased from the output.
 */
function solidCoreImports(): Map<string, Set<string>> {
  const imports = new Map<string, Set<string>>();
  for (const file of [solidEntry, ...solidModules()]) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
    for (const statement of source.statements) {
      const isImport = ts.isImportDeclaration(statement);
      if (!isImport && !ts.isExportDeclaration(statement)) continue;
      const specifier = statement.moduleSpecifier;
      if (!specifier || !ts.isStringLiteral(specifier) || !specifier.text.startsWith('.')) continue;
      const target = resolveSource(file, specifier.text);
      if (isSolidModule(target)) continue;
      const unsupported = () => {
        throw new Error(`${file}: use named imports and exports of ${specifier.text}`);
      };
      const names = imports.get(target) ?? new Set<string>();
      if (isImport) {
        const clause = statement.importClause;
        if (!clause || clause.isTypeOnly) continue;
        if (clause.name) names.add('default');
        const bindings = clause.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) unsupported();
        if (bindings && ts.isNamedImports(bindings))
          for (const element of bindings.elements)
            if (!element.isTypeOnly) names.add((element.propertyName ?? element.name).text);
      } else {
        if (statement.isTypeOnly) continue;
        const clause = statement.exportClause;
        if (!clause || !ts.isNamedExports(clause)) unsupported();
        else
          for (const element of clause.elements)
            if (!element.isTypeOnly) names.add((element.propertyName ?? element.name).text);
      }
      if (names.size) imports.set(target, names);
    }
  }
  return imports;
}

const ADAPTER_CORE = '\0snaplot:adapter-core';

/**
 * Emits dist/adapter-core.js: the core modules the Solid adapter needs, under their own names, in
 * the browser build's module graph. dist/solid.jsx (the `solid` export condition) imports them
 * from there, so a Solid app that compiles the JSX source still loads the one engine.
 */
function adapterCore(): Plugin {
  return {
    name: 'snaplot:adapter-core',
    buildStart() {
      this.emitFile({ type: 'chunk', id: ADAPTER_CORE, fileName: 'adapter-core.js' });
    },
    resolveId: (id) => (id === ADAPTER_CORE ? id : undefined),
    load(id) {
      if (id !== ADAPTER_CORE) return;
      return [...solidCoreImports()]
        .map(([file, names]) => `export { ${[...names].join(', ')} } from ${JSON.stringify(file)};`)
        .join('\n');
    },
  };
}

/** Marks the Solid adapter's imports of core modules external, pointing at ./adapter-core.js. */
const adapterCoreExternal: EsbuildPlugin = {
  name: 'snaplot:adapter-core-external',
  setup(build) {
    build.onResolve({ filter: /^\./ }, (args) => {
      if (!isSolidModule(args.importer)) return;
      const target = resolveSource(args.importer, args.path);
      return isSolidModule(target) ? undefined : { path: './adapter-core.js', external: true };
    });
  },
};

/** dist/solid.jsx: the Solid entry with JSX preserved, for the consumer's own Solid compiler. */
function solidSource(): Plugin {
  return {
    name: 'snaplot:solid-source',
    apply: 'build',
    async closeBundle() {
      await esbuild({
        entryPoints: [solidEntry],
        outfile: resolve(root, 'dist/solid.jsx'),
        bundle: true,
        format: 'esm',
        platform: 'neutral',
        target,
        jsx: 'preserve',
        external: ['snaplot', 'solid-js', 'solid-js/*'],
        plugins: [adapterCoreExternal],
        logLevel: 'warning',
      });
    },
  };
}

export default defineConfig({
  plugins: [
    solid({ solid: { hydratable: true } }),
    dts({
      include: ['src/**/*'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/*.spec.ts',
        'src/**/*.typecheck.ts',
      ],
      outDir: 'dist',
      // One declaration file per entry (repo-01): no extensionless relative imports for node16
      // and nodenext consumers to trip over, and no declaration maps pointing at unshipped src.
      rollupTypes: true,
      compilerOptions: { declarationMap: false },
    }),
    adapterCore(),
    solidSource(),
  ],
  build: {
    lib: {
      // The core's declarations roll up last: the adapters' declarations import it ('snaplot' is
      // src/index.ts there), so they must read it before its own rollup replaces it.
      entry: {
        solid: solidEntry,
        react: resolve(root, 'src/react.ts'),
        index: resolve(root, 'src/index.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external,
      output: {
        // Next.js App Router: snaplot/react is a client module (repo-08, research-06). Rollup drops
        // directives written in source, so the entry chunk gets it as a banner.
        banner: (chunk) => (chunk.isEntry && chunk.name === 'react' ? "'use client';" : ''),
        sourcemapExcludeSources: true,
        // histogram() and createLegendTable() are imports of their own (scripts/size-budgets.json):
        // in their own chunks, a bundler that skips unused files (`sideEffects: false`) leaves out
        // the chart chunk and the top-level constants it cannot tree-shake.
        manualChunks: (id) => {
          if (id.endsWith('/src/public/histogram.ts')) return 'histogram';
          if (/\/src\/(public\/(legend|companion)\.ts|engine\/errors\.ts|styles\/)/.test(id))
            return 'legend';
          return undefined;
        },
      },
    },
    target,
    sourcemap: true,
  },
});
