// Node-only helper for check-visual-ledger.test.ts (kept in .mjs because the test tsconfig has no
// Node types). It makes a throwaway git repository with the given commits on top of a base
// commit, then runs scripts/overhaul/check-visual-ledger.mjs over them, as a merge would.
//
// Scenarios live under test-results/ledger-scenarios/ (gitignored, inside this package) and are
// removed afterwards.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { V0 } from './diff-scenario.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '../..');
const SCRIPT = resolve(PKG, '../../scripts/overhaul/check-visual-ledger.mjs');
const SCENARIOS = join(PKG, 'test-results/ledger-scenarios');

/** Git without the caller's GIT_* variables (a hook or `git rebase -x` may set them). */
function cleanEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  return env;
}

function git(cwd, args) {
  const result = spawnSync(
    'git',
    ['-c', 'user.name=scenario', '-c', 'user.email=scenario@localhost', ...args],
    { cwd, env: cleanEnv(), encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

/**
 * Runs check-visual-ledger.mjs over `commits` made on top of a base commit that holds V0.md;
 * resolves with its exit status and output. See ledger-scenario.d.mts for the fields.
 */
export function runLedgerScenario(scenario) {
  mkdirSync(SCENARIOS, { recursive: true });
  const dir = mkdtempSync(join(SCENARIOS, 'case-'));
  try {
    git(dir, ['init', '-q']);
    const write = (path, text) => {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    };
    write('docs/decisions/visual-ledger/V0.md', V0);
    write('docs/decisions/visual-ledger/baseline-commits.txt', '');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', 'base']);
    const base = git(dir, ['rev-parse', 'HEAD']);
    for (const commit of scenario.commits) {
      for (const [path, text] of Object.entries(commit.files)) write(path, text);
      git(dir, ['add', '-A']);
      const message = commit.body ? `${commit.subject}\n\n${commit.body}` : commit.subject;
      git(dir, ['commit', '-qm', message]);
    }
    const run = spawnSync(process.execPath, [SCRIPT, '--base', base], {
      cwd: dir,
      env: cleanEnv(),
      encoding: 'utf8',
    });
    return { status: run.status, output: `${run.stdout}${run.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
