import { describe, expect, it } from 'vitest';
import { deepMerge } from './merge';

// Tests exercise runtime behaviour, so cast both sides as loose records
// to avoid TypeScript inferring strict target types from the first argument.
type Bag = Record<string, unknown>;
const obj = <T extends Bag>(x: T): Bag => x;

describe('deepMerge', () => {
  it('returns a new object (does not mutate the target)', () => {
    const target = obj({ a: 1 });
    const result = deepMerge(target, obj({ b: 2 }));
    expect(target).toEqual({ a: 1 });
    expect(result).toEqual({ a: 1, b: 2 });
    expect(result).not.toBe(target);
  });

  it('overwrites primitives', () => {
    expect(deepMerge(obj({ a: 1 }), obj({ a: 2 }))).toEqual({ a: 2 });
  });

  it('recursively merges nested plain objects', () => {
    const result = deepMerge(
      obj({ a: { b: 1, c: 2 }, d: 3 }),
      obj({ a: { c: 20, e: 30 } }),
    );
    expect(result).toEqual({ a: { b: 1, c: 20, e: 30 }, d: 3 });
  });

  it('skips source values that are explicitly undefined', () => {
    const result = deepMerge(obj({ a: 1, b: 2 }), obj({ a: undefined }));
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('replaces arrays by reference for non-series keys', () => {
    const result = deepMerge(obj({ tags: [1, 2] }), obj({ tags: [3, 4] }));
    expect(result.tags).toEqual([3, 4]);
  });

  it('merges series arrays by index, overwriting primitives within each entry', () => {
    const result = deepMerge(
      obj({ series: [{ label: 'a', visible: true }, { label: 'b', visible: true }] }),
      obj({ series: [{ visible: false }] }),
    );
    expect(result.series).toEqual([
      { label: 'a', visible: false },
      { label: 'b', visible: true },
    ]);
  });

  it('series merging extends if the source has more entries', () => {
    const result = deepMerge(
      obj({ series: [{ label: 'a' }] }),
      obj({ series: [{ label: 'a', stroke: '#fff' }, { label: 'b' }] }),
    );
    expect(result.series).toEqual([
      { label: 'a', stroke: '#fff' },
      { label: 'b' },
    ]);
  });

  it('does not descend into Float64Array (treats it as opaque)', () => {
    const a = new Float64Array([1, 2, 3]);
    const b = new Float64Array([4, 5, 6]);
    const result = deepMerge(obj({ data: a }), obj({ data: b }));
    expect(result.data).toBe(b);
  });

  it('handles multiple source arguments in order', () => {
    const result = deepMerge(obj({ a: 1 }), obj({ b: 2 }), obj({ c: 3 }));
    expect(result).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('later sources override earlier ones', () => {
    const result = deepMerge(obj({ a: 1 }), obj({ a: 2 }), obj({ a: 3 }));
    expect(result.a).toBe(3);
  });

  it('ignores null or undefined source objects', () => {
    // Variadic sources tolerate nullish entries (runtime safety net).
    const result = deepMerge(obj({ a: 1 }), undefined as unknown as Bag);
    expect(result).toEqual({ a: 1 });
  });
});
