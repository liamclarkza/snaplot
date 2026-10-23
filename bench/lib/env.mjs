// Machine and tool facts recorded in every report.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { cpus, loadavg, release, totalmem, type } from 'node:os';
import { join } from 'node:path';
import { parseArgs as nodeParseArgs } from 'node:util';
import { benchDir } from './paths.mjs';

export function machine() {
  const list = cpus();
  return {
    cpu: list[0]?.model ?? 'unknown CPU',
    cores: list.length,
    memGB: Math.round(totalmem() / 1024 ** 3),
    os: `${type()} ${release()}`,
  };
}

export function playwrightVersion() {
  try {
    const require = createRequire(join(benchDir, 'package.json'));
    return JSON.parse(readFileSync(require.resolve('playwright/package.json'), 'utf8')).version;
  } catch {
    return 'unknown';
  }
}

export function load1() {
  return loadavg()[0];
}

/** `node:util` parseArgs with friendlier errors; `--flag value` and `--flag=value` both work. */
export function parseArgs(argv, options, usage) {
  try {
    return nodeParseArgs({ args: argv, options, allowPositionals: false, strict: true }).values;
  } catch (err) {
    console.error(`${err.message}\n\n${usage}`);
    process.exit(2);
  }
}

export function profilesFrom(value) {
  if (value === 'both' || value === 'all') return ['desktop', 'mobile'];
  const list = value.split(',').map((p) => p.trim());
  for (const p of list) {
    if (p !== 'desktop' && p !== 'mobile') {
      console.error(`unknown --profile ${p} (expected desktop, mobile or both)`);
      process.exit(2);
    }
  }
  return list;
}
