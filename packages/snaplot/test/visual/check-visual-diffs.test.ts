/**
 * scripts/overhaul/check-visual-diffs.mjs (plan §11.3 G10) on synthetic runs: what it lets
 * through decides M2/M9a/M9b's zero-change merges and every later milestone's row check, so a
 * run that compared nothing must never pass.
 */
import { describe, expect, it } from 'vitest';
import { ERRORS, row, runScenario, V0 } from './diff-scenario.mjs';

const SHOTS = ['marks/a', 'marks/b', 'marks/c'];
const unchanged = SHOTS.map((name) => ({ name }));
const missing = (name: string) => ({ name, status: 'unexpected' as const, error: ERRORS.missing });

describe('check-visual-diffs: the reference', () => {
  it('passes a complete reference that every head shot matches', () => {
    const r = runScenario({ head: unchanged, referenceFiles: SHOTS });
    expect(r.output).toContain('check-visual-diffs: OK');
    expect(r.status).toBe(0);
  });

  it('fails a changed shot under the zero-change rule', () => {
    const r = runScenario({
      head: [
        { name: 'marks/a', status: 'unexpected', error: ERRORS.changed },
        ...unchanged.slice(1),
      ],
      referenceFiles: SHOTS,
    });
    expect(r.output).toContain('zero-change rule');
    expect(r.status).toBe(1);
  });

  it('reports a shot the complete reference does not have as added', () => {
    const r = runScenario({
      head: [...unchanged, missing('marks/new')],
      referenceFiles: SHOTS,
    });
    expect(r.output).toContain('added    marks/new');
    expect(r.status).toBe(0);
  });

  it('[repo-10] fails when the reference captured no shots, even with --allow-partial', () => {
    for (const args of [[], ['--allow-partial']]) {
      const r = runScenario({
        head: SHOTS.map(missing),
        referenceFiles: [],
        against: { exit: 1, verifyExit: null, complete: false, declared: 0 },
        args,
      });
      expect(r.output).toContain('nothing was compared');
      expect(r.status).toBe(1);
    }
  });

  it('[repo-10] counts a shot an incomplete reference lacks as unverified, not added', () => {
    const r = runScenario({
      head: [{ name: 'marks/a' }, missing('marks/b'), missing('marks/c')],
      referenceFiles: ['marks/a'],
      against: { exit: 1, verifyExit: null, complete: false, declared: 3 },
    });
    expect(r.output).toContain('0 added');
    expect(r.output).toContain('2 unverified');
    expect(r.output).toContain('did not complete');
    expect(r.status).toBe(1);
  });

  it('[repo-10] judges only the produced shots of an incomplete reference with --allow-partial', () => {
    const r = runScenario({
      head: [{ name: 'marks/a' }, missing('marks/b')],
      referenceFiles: ['marks/a'],
      against: { exit: 1, verifyExit: null, complete: false, declared: 2 },
      args: ['--allow-partial'],
    });
    expect(r.output).toContain('1 unverified');
    expect(r.status).toBe(0);
  });

  it('[repo-10] does not trust a reference shot that did not reproduce itself', () => {
    // capture.json is written only when a second render of the reference matches the first;
    // marks/b differed, so its image exists but is not in the reference's shot list.
    const r = runScenario({
      head: unchanged,
      referenceFiles: SHOTS,
      referenceShots: ['marks/a', 'marks/c'],
      against: { exit: 0, verifyExit: 1, complete: false, declared: 3 },
    });
    expect(r.output).toContain('1 unverified');
    expect(r.status).toBe(1);
  });

  it('[repo-10] refuses a meta.json that does not record the reference outcome', () => {
    const r = runScenario({
      head: unchanged,
      referenceFiles: SHOTS,
      againstExact: { ref: 'REF', sha: 'HEAD', shots: '/reference' },
    });
    expect(r.output).toContain('does not record the reference outcome');
    expect(r.status).toBe(1);
  });

  it('[repo-10] calls a head shot that failed to render broken, not added', () => {
    const r = runScenario({
      head: [...unchanged, { name: 'marks/new', status: 'unexpected', error: ERRORS.threw }],
      referenceFiles: SHOTS,
      milestone: 'M10',
    });
    expect(r.output).toContain('broken   marks/new');
    expect(r.status).toBe(1);
  });
});

describe('check-visual-diffs: committed baselines', () => {
  it('passes when every shot matches its committed baseline', () => {
    const r = runScenario({ mode: 'baselines', head: unchanged, referenceFiles: SHOTS });
    expect(r.status).toBe(0);
  });

  it('reports a fixture with no committed baseline as added', () => {
    const r = runScenario({
      mode: 'baselines',
      head: [...unchanged, missing('marks/new')],
      referenceFiles: SHOTS,
    });
    expect(r.output).toContain('added    marks/new');
    expect(r.status).toBe(0);
  });

  it('[repo-10] fails when the platform has no committed baselines at all', () => {
    const r = runScenario({ mode: 'baselines', head: SHOTS.map(missing), referenceFiles: [] });
    expect(r.output).toContain('nothing was compared');
    expect(r.status).toBe(1);
  });
});

describe('check-visual-diffs: visual-ledger rows', () => {
  const changedA = [
    { name: 'marks/a', status: 'unexpected' as const, error: ERRORS.changed },
    ...unchanged.slice(1),
  ];

  it('fails a changed fixture without a row from the milestone', () => {
    const r = runScenario({ head: changedA, referenceFiles: SHOTS, milestone: 'M11' });
    expect(r.output).toContain('without a visual-ledger row');
    expect(r.status).toBe(1);
  });

  it('passes a changed fixture named by a row the milestone adds', () => {
    const r = runScenario({
      head: changedA,
      referenceFiles: SHOTS,
      milestone: 'M11',
      rows: { 'V50.md': row('V50', 'M11', ['marks/a']) },
    });
    expect(r.output).toContain('(V50.md: marks/a)');
    expect(r.status).toBe(0);
  });

  it('[repo-10] never accepts an edit to V0, the initial-baseline row', () => {
    const r = runScenario({
      head: changedA,
      referenceFiles: SHOTS,
      milestone: 'M11',
      rows: { 'V0.md': `${V0}\n- **Fixtures:** \`marks/a\`\n` },
    });
    expect(r.output).toContain('V0.md');
    expect(r.status).toBe(1);
  });

  it('[repo-10] ignores a row whose Milestone line names another milestone', () => {
    const r = runScenario({
      head: changedA,
      referenceFiles: SHOTS,
      milestone: 'M11',
      baseRows: { 'V0.md': V0, 'V30.md': row('V30', 'M10', ['marks/b']) },
      rows: { 'V30.md': row('V30', 'M10', ['marks/a', 'marks/b']) },
    });
    expect(r.output).toContain('without a visual-ledger row');
    expect(r.status).toBe(1);
  });
});
