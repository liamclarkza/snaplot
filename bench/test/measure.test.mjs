import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { isNoisy, matchesFilter } from '../lib/measure.mjs';

describe('scenario selection and noise', () => {
  test('a filter matches an area exactly or a name substring', () => {
    assert.equal(matchesFilter('legacy', 'line-pan-200k', 'legacy'), true);
    assert.equal(matchesFilter('legacy', 'hover-sync-line-200k', 'interaction'), false);
    assert.equal(matchesFilter('hover', 'hover-sync-line-200k', 'interaction'), true);
    assert.equal(matchesFilter('api,scale', 'mount-24-charts', 'scale'), true);
    assert.equal(matchesFilter('', 'anything', 'api'), true);
  });

  test('a round is noisy when the 1-minute load exceeds half the cores', () => {
    assert.equal(isNoisy(6.1, 12, 0.5), true);
    assert.equal(isNoisy(6, 12, 0.5), false);
  });
});
