/**
 * scripts/overhaul/check-visual-ledger.mjs (plan P13) on synthetic histories: every commit that
 * changes screenshots, or says `visual:`, adds or edits its row file, and every new row carries
 * the fields P13 lists.
 */
import { describe, expect, it } from 'vitest';
import { row } from './diff-scenario.mjs';
import { runLedgerScenario } from './ledger-scenario.mjs';

const SHOT = 'packages/snaplot/test/visual/__screenshots__/marks/basic-line-darwin.png';
const SUBJECT = 'fix(marks): thicker default lines';
const FULL_ROW = row('V50', 'M11', ['marks/*'], SUBJECT);

/** FULL_ROW without the lines that start with `- **<field>:**`. */
function without(...fields: string[]): string {
  return FULL_ROW.split('\n')
    .filter((line) => !fields.some((f) => line.startsWith(`- **${f}:**`)))
    .join('\n');
}

describe('check-visual-ledger', () => {
  it('passes a screenshot change that adds a complete row', () => {
    const r = runLedgerScenario({
      commits: [
        {
          subject: SUBJECT,
          body: 'visual: V50',
          files: { [SHOT]: 'png', 'docs/decisions/visual-ledger/V50.md': FULL_ROW },
        },
      ],
    });
    expect(r.output).toContain('check-visual-ledger: OK');
    expect(r.status).toBe(0);
  });

  it('fails a screenshot change without a row', () => {
    const r = runLedgerScenario({ commits: [{ subject: SUBJECT, files: { [SHOT]: 'png' } }] });
    expect(r.output).toContain('touches 1 screenshot file(s)');
    expect(r.status).toBe(1);
  });

  it('fails a visual: paragraph whose row the commit does not add', () => {
    const r = runLedgerScenario({
      commits: [{ subject: SUBJECT, body: 'visual: V51', files: { 'src.ts': '1' } }],
    });
    expect(r.output).toContain('has a visual: paragraph');
    expect(r.status).toBe(1);
  });

  it('fails a row whose Commit line does not quote the subject', () => {
    const r = runLedgerScenario({
      commits: [
        {
          subject: 'fix(marks): another subject',
          files: { [SHOT]: 'png', 'docs/decisions/visual-ledger/V50.md': FULL_ROW },
        },
      ],
    });
    expect(r.output).toContain('does not quote the subject');
    expect(r.status).toBe(1);
  });

  // M3a review #3 note 5: P13 also asks for the before → after, the finding and the revert.
  it('[repo-10] fails a new row without Before → after, Finding or Revert', () => {
    for (const field of ['Before → after', 'Finding', 'Revert']) {
      const r = runLedgerScenario({
        commits: [
          {
            subject: SUBJECT,
            files: { [SHOT]: 'png', 'docs/decisions/visual-ledger/V50.md': without(field) },
          },
        ],
      });
      expect(r.output).toContain(`**${field}:** missing`);
      expect(r.status).toBe(1);
    }
  });

  it('[repo-10] fails a field left empty above the next one', () => {
    const empty = FULL_ROW.replace(/- \*\*Finding:\*\*.*/, '- **Finding:**');
    const r = runLedgerScenario({
      commits: [
        {
          subject: SUBJECT,
          files: { [SHOT]: 'png', 'docs/decisions/visual-ledger/V50.md': empty },
        },
      ],
    });
    expect(r.output).toContain('**Finding:** missing');
    expect(r.status).toBe(1);
  });

  it('accepts a field whose value is a nested list (V0.md)', () => {
    const nested = FULL_ROW.replace(
      /- \*\*Before → after:\*\*.*/,
      '- **Before → after:**\n  - Before: 1.5 px lines.\n  - After: 2 px lines.',
    );
    const r = runLedgerScenario({
      commits: [
        {
          subject: SUBJECT,
          files: { [SHOT]: 'png', 'docs/decisions/visual-ledger/V50.md': nested },
        },
      ],
    });
    expect(r.output).toContain('check-visual-ledger: OK');
    expect(r.status).toBe(0);
  });
});
