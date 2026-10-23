import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { retriedSummary } from '../lib/report.mjs';

describe('report', () => {
  test('a scenario re-measured more than once is listed once, with its count', () => {
    assert.equal(
      retriedSummary([
        'desktop hover-sweep-50k',
        'desktop line-pan-200k',
        'desktop hover-sweep-50k',
      ]),
      'desktop hover-sweep-50k (2×), desktop line-pan-200k',
    );
    assert.equal(retriedSummary([]), '');
  });
});
