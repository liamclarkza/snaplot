#!/usr/bin/env node
// TypeDoc validation for the API reference (plan §8.4, uisite-17). starlight-typedoc renders the
// reference but never runs TypeDoc's validation pass, so this script runs it over the same entry
// points before `astro build`.
//
// Undocumented public declarations fail the build (STRICT, from M7, which documented every public
// declaration). `--list` prints every warning (the default prints the count and the first few).
import { Application, LogLevel, Logger } from 'typedoc';
import { fileURLToPath } from 'node:url';

const STRICT = true;

const library = (path) => fileURLToPath(new URL(`../../packages/snaplot/${path}`, import.meta.url));
export const ENTRY_POINTS = ['src/index.ts', 'src/react.ts', 'src/solid.ts'].map(library);
export const TSCONFIG = library('tsconfig.json');

class CollectingLogger extends Logger {
  messages = [];
  log(message, level) {
    super.log(message, level);
    if (level >= LogLevel.Warn) this.messages.push({ message, level });
  }
}

const list = process.argv.includes('--list');
const logger = new CollectingLogger();
const app = await Application.bootstrap({
  entryPoints: ENTRY_POINTS,
  tsconfig: TSCONFIG,
  excludeInternal: true,
  excludePrivate: true,
  excludeProtected: true,
  validation: { notExported: false, invalidLink: true, notDocumented: true },
  requiredToBeDocumented: [
    'Function',
    'Class',
    'Interface',
    'TypeAlias',
    'Variable',
    'Property',
    'Method',
  ],
  logLevel: 'Warn',
});
app.logger = logger;
const project = await app.convert();
if (!project) {
  console.error('typedoc-validate: TypeDoc could not convert the entry points.');
  process.exit(1);
}
app.validate(project);

const errors = logger.messages.filter((m) => m.level === LogLevel.Error);
const undocumented = logger.messages.filter(
  (m) => m.level === LogLevel.Warn && /does not have any documentation/.test(m.message),
);
const otherWarnings = logger.messages.filter(
  (m) => m.level === LogLevel.Warn && !undocumented.includes(m),
);
const shown = list ? undocumented : undocumented.slice(0, 5);
for (const { message } of [...errors, ...otherWarnings, ...shown]) console.warn(`  ${message}`);
if (undocumented.length > shown.length) {
  console.warn(`  … and ${undocumented.length - shown.length} more (run with --list)`);
}
const mode = STRICT ? 'error' : 'warning';
console.log(
  `typedoc-validate: ${undocumented.length} undocumented public declarations (${mode}), ` +
    `${otherWarnings.length} other warnings, ${errors.length} errors.`,
);
if (errors.length > 0 || (STRICT && (undocumented.length > 0 || otherWarnings.length > 0))) {
  process.exit(1);
}
