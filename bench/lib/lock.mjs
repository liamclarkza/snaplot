// The bench lock (plan §11.1): `mkdir <main>/.claude/bench.lock`, shared by every worktree. A lock
// older than two hours counts as stale; it is moved aside (never deleted), so its owner record
// survives for inspection. Sessions about to run Playwright, Docker or `npm ci` wait while it
// exists; `bench:ab` holds it while it measures.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { hostname, loadavg } from 'node:os';
import { join } from 'node:path';

export const STALE_MS = 2 * 60 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function ownerOf(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'owner.json'), 'utf8'));
  } catch {
    return null;
  }
}

function ageMs(dir) {
  try {
    return Date.now() - statSync(dir).mtimeMs;
  } catch {
    return 0;
  }
}

/** Moves a stale lock aside; returns true when it did. */
function clearIfStale(dir, staleMs, log) {
  if (!existsSync(dir) || ageMs(dir) < staleMs) return false;
  const aside = `${dir}.stale-${Date.now()}`;
  try {
    renameSync(dir, aside);
    log?.(`bench lock was older than ${Math.round(staleMs / 60000)} min; moved it to ${aside}`);
    return true;
  } catch {
    return false;
  }
}

function describe(dir) {
  const owner = ownerOf(dir);
  const mins = Math.round(ageMs(dir) / 60000);
  return owner
    ? `held by pid ${owner.pid} (${owner.cwd ?? '?'}) for ${mins} min`
    : `held for ${mins} min`;
}

/** Waits until no lock exists (for steps that must not overlap a measurement, like `npm ci`). */
export async function waitWhileLocked(dir, { staleMs = STALE_MS, pollMs = 15_000, log } = {}) {
  const started = Date.now();
  let announced = false;
  while (existsSync(dir)) {
    if (clearIfStale(dir, staleMs, log)) break;
    if (!announced) {
      log?.(`waiting for the bench lock at ${dir}: ${describe(dir)}`);
      announced = true;
    }
    await sleep(pollMs);
  }
  return Date.now() - started;
}

/**
 * Takes the lock, waiting while another session holds it. Returns `{ waitedMs, release }`;
 * `release()` removes the lock only if this process still owns it.
 */
export async function acquireLock(
  dir,
  { staleMs = STALE_MS, pollMs = 15_000, log, info = {} } = {},
) {
  const started = Date.now();
  let announced = false;
  for (;;) {
    try {
      mkdirSync(dir);
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (clearIfStale(dir, staleMs, log)) continue;
      if (!announced) {
        log?.(`waiting for the bench lock at ${dir}: ${describe(dir)}`);
        announced = true;
      }
      await sleep(pollMs);
    }
  }
  const owner = {
    pid: process.pid,
    host: hostname(),
    cwd: process.cwd(),
    started: new Date().toISOString(),
    loadavg: loadavg(),
    ...info,
  };
  writeFileSync(join(dir, 'owner.json'), `${JSON.stringify(owner, null, 2)}\n`);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    if (ownerOf(dir)?.pid !== process.pid) return;
    rmSync(join(dir, 'owner.json'), { force: true });
    try {
      rmdirSync(dir);
    } catch {
      // Another file appeared inside the lock; leave it for a human.
    }
  };
  return { waitedMs: Date.now() - started, release };
}
