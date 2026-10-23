/**
 * The one place snaplot reports to the console (plan D24, P1). Invalid input
 * throws `snaplot: <what is wrong>. <how to fix it>` at the call that caused it;
 * suspicious input prints one warning per page for each (code, message). There
 * is no development build and no `NODE_ENV` check: the checks are cheap, and a
 * warning a bundler strips is a warning a user never sees (repo-06).
 */

/** An error snaplot throws for invalid input. Its message starts with `snaplot: `. */
export class SnaplotError extends Error {
  constructor(message: string) {
    super(message.startsWith('snaplot: ') ? message : `snaplot: ${message}`);
    this.name = 'SnaplotError';
  }
}

/** Throw a {@link SnaplotError}: `snaplot: <message>`. */
export function fail(message: string): never {
  throw new SnaplotError(message);
}

/** Warning texts already printed on this page, by code. */
const printed = new Map<string, Set<string>>();

/**
 * Print `snaplot: <message>` once per page for each (code, message): a
 * dashboard of 24 charts with the same problem prints one line.
 */
export function warnOnce(code: string, message: string): void {
  let messages = printed.get(code);
  if (!messages) {
    messages = new Set();
    printed.set(code, messages);
  }
  if (messages.has(message)) return;
  messages.add(message);
  console.warn(message.startsWith('snaplot: ') ? message : `snaplot: ${message}`);
}

/** The closest candidate to `name` by edit distance, when it is close enough to suggest. */
export function suggest(name: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  const lower = name.toLowerCase();
  for (const candidate of candidates) {
    const other = candidate.toLowerCase();
    // A short name for a long one (t for time) counts as one edit.
    const prefix = other.length > 0 && (lower.startsWith(other) || other.startsWith(lower));
    const distance = prefix ? Math.min(1, editDistance(lower, other)) : editDistance(lower, other);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  const limit = Math.max(1, Math.min(3, Math.floor(name.length / 3)));
  return best !== undefined && bestDistance <= limit ? best : undefined;
}

/** ` Did you mean "<closest>"?` for the end of a message, or '' when nothing is close. */
export function hint(name: string, candidates: Iterable<string>): string {
  const best = suggest(name, candidates);
  return best ? ` Did you mean "${best}"?` : '';
}

/**
 * Throw for a series id the chart does not have. Every state option and setter that names a
 * series uses it, so an unknown id is one error everywhere (dataapi-22).
 */
export function unknownSeries(where: string, id: string, ids: Iterable<string>): never {
  return fail(`${where} names "${id}", which is not a series id.${hint(id, ids)}`);
}

/** Levenshtein distance, for short option and field names. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}
