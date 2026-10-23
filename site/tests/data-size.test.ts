// Data caps (plan §8.3, §10.1 #6). The docs data slices in src/examples/data/ are small real
// extracts: at most 20 KB each, with a provenance comment. Each demo's data in
// public/data/<slug>/ is at most 1 MB gzipped, except compressed audio, which may take up to 2 MB
// (S1). M6b owns the data; these caps hold whatever it adds.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const site = fileURLToPath(new URL('..', import.meta.url));
const slices = join(site, 'src/examples/data');
const demos = join(site, 'public/data');

const KB = 1024;
const MB = 1024 * KB;
const CAPS = {
  slice: 20 * KB,
  demoGzip: 1 * MB,
  audio: 2 * MB,
} as const;
const AUDIO = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.opus', '.webm']);

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

describe('docs data slices (src/examples/data)', () => {
  const found = files(slices).filter((file) => file.endsWith('.ts'));

  it(`are at most ${CAPS.slice / KB} KB each`, () => {
    const over = found
      .map((file) => ({ file, bytes: statSync(file).size }))
      .filter(({ bytes }) => bytes > CAPS.slice)
      .map(({ file, bytes }) => `${file}: ${(bytes / KB).toFixed(1)} KB`);
    expect(over).toEqual([]);
  });

  it('each say where their data comes from', () => {
    const missing = found.filter(
      (file) => !/\bsource\b/i.test(readFileSync(file, 'utf8').split('\n').slice(0, 12).join('\n')),
    );
    expect(missing).toEqual([]);
  });
});

describe('demo data (public/data/<slug>)', () => {
  const slugs = existsSync(demos)
    ? readdirSync(demos, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];

  it(`is at most ${CAPS.demoGzip / MB} MB gzipped per demo, audio at most ${CAPS.audio / MB} MB`, () => {
    const over: string[] = [];
    for (const slug of slugs) {
      let gzipped = 0;
      let audio = 0;
      for (const file of files(join(demos, slug))) {
        if (AUDIO.has(extname(file).toLowerCase())) audio += statSync(file).size;
        else gzipped += gzipSync(readFileSync(file), { level: 9 }).length;
      }
      if (gzipped > CAPS.demoGzip) over.push(`${slug}: ${(gzipped / MB).toFixed(2)} MB gzipped`);
      if (audio > CAPS.audio) over.push(`${slug}: ${(audio / MB).toFixed(2)} MB of audio`);
    }
    expect(over).toEqual([]);
  });

  it('has a SOURCE.md for every demo', () => {
    const missing = slugs.filter((slug) => !existsSync(join(demos, slug, 'SOURCE.md')));
    expect(missing).toEqual([]);
  });
});
