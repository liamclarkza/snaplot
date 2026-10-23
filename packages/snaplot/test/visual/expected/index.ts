import { CHECKS } from '../checks';
import { FIXTURES } from '../fixtures';
import type { KnownFinding } from './known';
import m7 from './m7';
import m10 from './m10';
import m11 from './m11';
import m12a from './m12a';

export type { KnownFinding } from './known';

export const KNOWN: readonly KnownFinding[] = [...m7, ...m10, ...m11, ...m12a];

// A stale entry (renamed fixture, unknown check, duplicate) must fail loudly, never skip silently.
const seen = new Set<string>();
for (const entry of KNOWN) {
  const key = `${entry.fixture} ${entry.check}`;
  if (!FIXTURES.some((f) => f.id === entry.fixture)) {
    throw new Error(`expected/${entry.owner.toLowerCase()}.ts: unknown fixture ${entry.fixture}`);
  }
  if (!(entry.check in CHECKS)) throw new Error(`unknown geometry check ${entry.check}`);
  if (seen.has(key)) throw new Error(`two findings for ${key}`);
  seen.add(key);
}

export function knownFinding(fixture: string, check: string): KnownFinding | undefined {
  return KNOWN.find((entry) => entry.fixture === fixture && entry.check === check);
}
