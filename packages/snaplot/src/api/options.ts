function plain(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Configuration comparison deliberately preserves function and buffer identity. */
export function equivalent(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => equivalent(value, b[index]));
  }
  if (!plain(a) || !plain(b)) return false;
  const keys = Object.keys(a).filter(key => a[key] !== undefined);
  const other = Object.keys(b).filter(key => b[key] !== undefined);
  return keys.length === other.length && keys.every(key => {
    if (!(key in b)) return false;
    // Data and group objects are ownership boundaries, not configuration trees.
    return key === 'data' || key === 'group'
      ? a[key] === b[key]
      : equivalent(a[key], b[key]);
  });
}

/** Only options merge. Dataset records, plugin instances and arrays are atomic. */
export function patchOptions<T>(current: T, patch: unknown): T {
  const merge = (base: unknown, next: unknown): unknown => {
    if (!plain(next)) return next;
    const result: Record<string, unknown> = plain(base) ? { ...base } : {};
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) delete result[key];
      else if (key === 'data' || key === 'group' || key === 'plugins') result[key] = value;
      else result[key] = plain(value) ? merge(result[key], value) : value;
    }
    return result;
  };
  return merge(current, patch) as T;
}
