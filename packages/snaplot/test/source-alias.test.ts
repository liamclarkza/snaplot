import { describe, expect, it } from 'vitest';
import * as bySpecifier from 'snaplot';
import * as source from '../src/index';

// One mechanism maps 'snaplot' to the source for the library's own tests and type-check
// (plan §11.2, repo-16): the same module instance, never a stale dist/ build.
describe("the 'snaplot' specifier", () => {
  it('[repo-16] resolves to src/index.ts', () => {
    expect(bySpecifier.createChart).toBe(source.createChart);
    expect(Object.keys(bySpecifier).sort()).toEqual(Object.keys(source).sort());
  });
});
