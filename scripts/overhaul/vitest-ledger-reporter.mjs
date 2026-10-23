// A vitest reporter for trace-check (plan §12 M3b scope 5). vitest's own JSON
// reporter reports an `it.fails` that failed as "passed", so it cannot tell an
// expected failure from a passing lock. This one records `options.fails`.
//
//   SNAPLOT_LEDGER_REPORT=<file> vitest run --reporter=default --reporter=<this file>
//
// Output: { tool: 'vitest', tests: [{ file, title, fullName, state, fails }] }.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export default class LedgerReporter {
  onTestRunEnd(testModules) {
    const output = process.env.SNAPLOT_LEDGER_REPORT;
    if (!output) return;
    const tests = [];
    for (const module of testModules) {
      for (const test of module.children.allTests()) {
        tests.push({
          file: module.moduleId,
          title: test.name,
          fullName: test.fullName,
          state: test.result().state,
          fails: Boolean(test.options.fails),
          mode: test.options.mode,
        });
      }
    }
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify({ tool: 'vitest', tests }, null, 2)}\n`);
  }
}
