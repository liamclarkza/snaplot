// Node-only helper for check-visual-diffs.test.ts (kept in .mjs because the test tsconfig has no
// Node types). It builds the result of a synthetic `npm run test:visual` run (Playwright's JSON
// report, meta.json and the reference images) in a throwaway git repository, then runs
// scripts/overhaul/check-visual-diffs.mjs on it, exactly as a merge would.
//
// Scenarios live under test-results/diff-scenarios/ (gitignored, inside this package) and are
// removed afterwards.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXACT, TOLERANCE } from './record.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '../..');
const SCRIPT = resolve(PKG, '../../scripts/overhaul/check-visual-diffs.mjs');
const SCENARIOS = join(PKG, 'test-results/diff-scenarios');
const LEDGER = 'docs/decisions/visual-ledger';

export const ERRORS = {
  changed:
    'Error: expect(locator).toHaveScreenshot(expected) failed\n\n' +
    '  1200 pixels (ratio 0.01 of all image pixels) are different.',
  missing: "Error: A snapshot doesn't exist at /reference/marks/new.png.",
  threw: 'Error: marks/a did not render: TypeError: boom',
};

export const V0 = [
  '# V0: initial committed baselines (no default change)',
  '',
  '- **Commit:** `test(visual): initial darwin baselines`',
  '- **Milestone:** M3a',
  '- **Fixtures:** `axes/*`, `marks/*`, `theme/*`, `layout/*`, `overlay/*`',
  '',
].join('\n');

/** A row file in the format check-visual-ledger.mjs validates. */
export function row(id, milestone, fixtures) {
  return [
    `# ${id}: a deliberate default change`,
    '',
    '- **Commit:** `fix(marks): change a default`',
    `- **Milestone:** ${milestone}`,
    `- **Fixtures:** ${fixtures.map((f) => `\`${f}\``).join(', ')}`,
    '',
  ].join('\n');
}

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

function visualSuite(shot) {
  const status = shot.status ?? 'expected';
  return {
    title: shot.name,
    specs: [
      {
        title: 'matches its reference',
        tests: [
          {
            projectName: 'visual',
            status,
            annotations: [
              { type: 'screenshot', description: shot.name },
              { type: 'fixture', description: shot.name.split('@')[0] },
            ],
            results: [
              {
                status: status === 'expected' ? 'passed' : 'failed',
                ...(shot.error ? { error: { message: shot.error } } : {}),
                attachments: [],
              },
            ],
          },
        ],
      },
    ],
    suites: [],
  };
}

/**
 * The comparison a run records in meta.json: `exact` (the `--against` default), `tolerance` (the
 * committed-baseline default), or `legacy`, the shape an older run.mjs wrote (no `comparison`).
 */
const COMPARISONS = {
  exact: { exact: true, ...EXACT },
  tolerance: { exact: false, ...TOLERANCE },
};

const geometrySuite = {
  title: 'visual/geometry.spec.ts',
  specs: [
    {
      title: 'no two label boxes overlap',
      tests: [{ projectName: 'geometry', status: 'expected', annotations: [], results: [{}] }],
    },
  ],
  suites: [],
};

/**
 * Runs check-visual-diffs.mjs on a synthetic run; resolves with its exit status and output.
 * See diff-scenario.d.mts for the scenario fields.
 */
export function runScenario(scenario) {
  mkdirSync(SCENARIOS, { recursive: true });
  const dir = mkdtempSync(join(SCENARIOS, 'case-'));
  try {
    git(dir, ['init', '-q']);
    const ledger = join(dir, LEDGER);
    mkdirSync(ledger, { recursive: true });
    for (const [name, text] of Object.entries(scenario.baseRows ?? { 'V0.md': V0 })) {
      writeFileSync(join(ledger, name), text);
    }
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', 'base']);
    const base = git(dir, ['rev-parse', 'HEAD']);
    for (const [name, text] of Object.entries(scenario.rows ?? {})) {
      writeFileSync(join(ledger, name), text);
    }

    const mode = scenario.mode ?? 'against';
    const suffix = mode === 'against' ? '' : '-darwin';
    const reference = join(dir, 'reference');
    mkdirSync(reference, { recursive: true });
    for (const name of scenario.referenceFiles ?? []) {
      const file = join(reference, `${name}${suffix}.png`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, '');
    }
    const shots = scenario.referenceShots ?? scenario.referenceFiles ?? [];
    const against =
      mode !== 'against'
        ? null
        : (scenario.againstExact ?? {
            ref: 'REF',
            sha: base,
            dir: reference,
            cached: false,
            exit: 0,
            verifyExit: 0,
            complete: true,
            shots,
            declared: shots.length,
            ...scenario.against,
          });

    const results = join(dir, 'results');
    mkdirSync(results, { recursive: true });
    const report = {
      config: {},
      suites: [
        {
          title: 'visual/visual.spec.ts',
          specs: [],
          suites: (scenario.head ?? []).map(visualSuite),
        },
        geometrySuite,
      ],
      errors: [],
      stats: {},
    };
    writeFileSync(join(results, 'report.json'), JSON.stringify(report));
    const comparison = scenario.comparison ?? (mode === 'against' ? 'exact' : 'tolerance');
    const meta = {
      mode,
      head: { sha: base, dirty: false },
      against,
      expectedDir: reference,
      platform: 'darwin',
      suffix,
      projects: ['visual', 'geometry'],
      filtered: false,
      strict: comparison === 'exact',
      ...(comparison === 'legacy' ? {} : { comparison: COMPARISONS[comparison] }),
      exit: 1,
      date: new Date(0).toISOString(),
    };
    writeFileSync(join(results, 'meta.json'), JSON.stringify(meta));

    const run = spawnSync(
      process.execPath,
      [
        SCRIPT,
        '--report',
        results,
        '--base',
        base,
        '--no-copy',
        '--milestone',
        scenario.milestone ?? 'M2',
        ...(scenario.args ?? []),
      ],
      { cwd: dir, env: cleanEnv(), encoding: 'utf8' },
    );
    return { status: run.status, output: `${run.stdout}${run.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
