// The shared bench lock (plan §11.1): before npm ci or Playwright, wait while another session's
// benchmark holds it. A lock older than two hours is stale.
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** The main checkout: the parent of the git common directory (worktrees share it). */
function mainCheckout() {
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    encoding: 'utf8',
  }).trim();
  return path.dirname(common);
}

export function waitForBenchLock(who) {
  let lock;
  try {
    lock = path.join(mainCheckout(), '.claude', 'bench.lock');
  } catch {
    return;
  }
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  let told = false;
  while (existsSync(lock)) {
    let age = 0;
    try {
      age = Date.now() - statSync(lock).mtimeMs;
    } catch {
      break;
    }
    if (age > 2 * 3600_000) break;
    if (!told) console.error(`${who}: waiting for the bench lock ${lock}`);
    told = true;
    Atomics.wait(sleeper, 0, 0, 5000);
  }
}
