import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { acquireLock, waitWhileLocked } from '../lib/lock.mjs';

const made = [];
const scratch = () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'bench-lock-'));
  made.push(dir);
  return dir;
};
// Each test's own temporary directory.
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

describe('bench lock', () => {
  test('acquire creates the directory with an owner record; release removes it', async () => {
    const root = scratch();
    const dir = join(root, 'bench.lock');
    const lock = await acquireLock(dir, { pollMs: 5 });
    assert.ok(existsSync(join(dir, 'owner.json')));
    lock.release();
    assert.equal(existsSync(dir), false);
  });

  test('a second acquire waits for the first release', async () => {
    const dir = join(scratch(), 'bench.lock');
    const first = await acquireLock(dir, { pollMs: 5 });
    let second = null;
    const pending = acquireLock(dir, { pollMs: 5 }).then((l) => {
      second = l;
    });
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(second, null);
    first.release();
    await pending;
    assert.ok(second);
    second.release();
  });

  test('waitWhileLocked returns once the lock is gone', async () => {
    const dir = join(scratch(), 'bench.lock');
    mkdirSync(dir);
    setTimeout(() => {
      // Simulates another session releasing its lock.
      import('node:fs').then(({ rmdirSync }) => rmdirSync(dir));
    }, 30);
    const waited = await waitWhileLocked(dir, { pollMs: 5 });
    assert.ok(waited >= 20);
  });

  test('a stale lock is moved aside, never deleted', async () => {
    const root = scratch();
    const dir = join(root, 'bench.lock');
    mkdirSync(dir);
    writeFileSync(join(dir, 'owner.json'), '{"pid":1}');
    const old = new Date(Date.now() - 3 * 60 * 60 * 1000);
    utimesSync(dir, old, old);
    const lock = await acquireLock(dir, { pollMs: 5 });
    const aside = readdirSync(root).filter((n) => n.startsWith('bench.lock.stale-'));
    assert.equal(aside.length, 1);
    assert.ok(existsSync(join(root, aside[0], 'owner.json')));
    lock.release();
  });

  test('release does not remove a lock another process now owns', async () => {
    const dir = join(scratch(), 'bench.lock');
    const lock = await acquireLock(dir, { pollMs: 5 });
    writeFileSync(join(dir, 'owner.json'), '{"pid":-1}');
    lock.release();
    assert.ok(existsSync(dir));
  });
});
