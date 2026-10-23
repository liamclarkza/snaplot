// S1 `find-the-clipping`: one real public-domain recording, bundled as-is (plan §10.2).
//
//   npm run demo-data -- find-the-clipping [--offline] [--fallback]
//
// Selection:
// 1. archive.org advancedsearch, in order: `collection:nasa AND mediatype:audio` (U.S.
//    government works), then `collection:librivoxaudio AND subject:poetry` (LibriVox public-domain
//    dedication), most downloaded first, items under 30 MB.
// 2. Keep items with licence evidence (a public-domain `licenseurl`, or NASA as the creator) and
//    an MP3 of 60–240 s and at most 2 MB.
// 3. Decode up to 20 candidates in Playwright's Chromium with `decodeAudioData` on an
//    OfflineAudioContext at the file's own sample rate (Node has no MP3 decoder), and bundle the
//    first with ≥ 3 clipped runs (≥ 3 consecutive samples at or above −0.1 dBFS) and ≥ 1 silence
//    longer than 2 s (50 ms windows below −50 dBFS RMS).
// 4. If none qualifies (or with `--fallback`): a generated sine sweep with injected clipping and
//    silences, as 16-bit WAV, labelled "Synthetic".
// Outputs: site/public/data/find-the-clipping/{recording.mp3 | recording.wav, recording.json,
// SOURCE.md} and the docs slice site/src/examples/data/waveform.ts.

import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  DATA,
  REPO,
  SLICES,
  biomeFormat,
  log,
  openCache,
  parseArgs,
  rel,
  renderSourceMd,
  retrievalDate,
  round,
  sha256,
  sizeOf,
  waitForBenchLock,
  writeOut,
} from './lib.mjs';

export const SLUG = 'find-the-clipping';
const QUERIES = [
  { q: 'collection:nasa AND mediatype:audio', evidence: 'NASA' },
  { q: 'collection:librivoxaudio AND subject:poetry', evidence: 'LibriVox' },
];
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_CANDIDATES = 20;
/** The detection rule, shared with answer.ts and the page. */
export const RULE = {
  clipDbfs: -0.1,
  minClipSamples: 3,
  silenceDbfs: -50,
  silenceWindowMs: 50,
  minSilenceMs: 2000,
};

const searchUrl = (q) =>
  `https://archive.org/advancedsearch.php?${new URLSearchParams([
    ['q', `${q} AND item_size:[1 TO 30000000]`],
    ['fl[]', 'identifier'],
    ['sort[]', 'downloads desc'],
    ['rows', '100'],
    ['output', 'json'],
  ])}`;
const safe = (s) => s.replace(/[^A-Za-z0-9._-]/g, '_');

/** Seconds from archive.org `length`, which is either seconds or `mm:ss` / `hh:mm:ss`. */
function seconds(length) {
  if (length === undefined) return Number.NaN;
  const parts = String(length).split(':').map(Number);
  return parts.reduce((s, p) => s * 60 + p, 0);
}

/** Sample rate and channels from the first MPEG audio frame header (after any ID3v2 tag). */
export function mp3Format(buf) {
  let p = 0;
  if (buf.toString('latin1', 0, 3) === 'ID3') {
    p = 10 + ((buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9]);
  }
  for (; p + 4 < buf.length; p++) {
    if (buf[p] !== 0xff || (buf[p + 1] & 0xe0) !== 0xe0) continue;
    const version = (buf[p + 1] >> 3) & 3; // 0: MPEG 2.5, 2: MPEG 2, 3: MPEG 1
    const rateIndex = (buf[p + 2] >> 2) & 3;
    if (version === 1 || rateIndex === 3 || ((buf[p + 1] >> 1) & 3) !== 1) continue; // layer III
    const base = [44100, 48000, 32000][rateIndex];
    const sampleRate = version === 3 ? base : version === 2 ? base / 2 : base / 4;
    const channels = buf[p + 3] >> 6 === 3 ? 1 : 2;
    return { sampleRate, channels };
  }
  throw new Error('no MPEG layer III frame header found');
}

/**
 * The reference scan, run inside Chromium on the decoded buffer. It is written separately from
 * answer.ts so it can serve as the oracle. A sample frame is clipped when any channel is at or
 * above the threshold; silence uses the loudest channel's RMS per window.
 */
async function decodeAndScan({ base64, sampleRate, rule }) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const ctx = new OfflineAudioContext(1, 1, sampleRate);
  const audio = await ctx.decodeAudioData(bytes.buffer);
  const chans = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
  const n = audio.length;
  const clip = 10 ** (rule.clipDbfs / 20);
  const runs = [];
  let start = -1;
  let peak = 0;
  for (let i = 0; i <= n; i++) {
    let a = 0;
    if (i < n) for (const ch of chans) a = Math.max(a, Math.abs(ch[i]));
    if (a > peak) peak = a;
    if (i < n && a >= clip) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      if (i - start >= rule.minClipSamples) runs.push([start, i - start]);
      start = -1;
    }
  }
  const win = Math.round((audio.sampleRate * rule.silenceWindowMs) / 1000);
  const quiet = 10 ** (rule.silenceDbfs / 20);
  const silences = [];
  let s0 = -1;
  for (let w = 0; w * win < n; w++) {
    const from = w * win;
    const to = Math.min(n, from + win);
    let loud = 0;
    for (const ch of chans) {
      let sum = 0;
      for (let i = from; i < to; i++) sum += ch[i] * ch[i];
      loud = Math.max(loud, Math.sqrt(sum / (to - from)));
    }
    if (loud < quiet) {
      if (s0 < 0) s0 = from;
    } else if (s0 >= 0) {
      if (((from - s0) * 1000) / audio.sampleRate > rule.minSilenceMs)
        silences.push([s0, from - s0]);
      s0 = -1;
    }
  }
  if (s0 >= 0 && ((n - s0) * 1000) / audio.sampleRate > rule.minSilenceMs)
    silences.push([s0, n - s0]);
  const longest = runs.reduce((m, r) => (r[1] > m[1] ? r : m), [0, 0]);
  const excerptStart = Math.max(0, longest[0] + Math.floor(longest[1] / 2) - 512);
  return {
    sampleRate: audio.sampleRate,
    channels: audio.numberOfChannels,
    samples: n,
    peak,
    runs,
    silences,
    excerptStart,
    excerpt: Array.from(chans[0].subarray(excerptStart, excerptStart + 1024)),
    // The page's own module (answer.ts, bundled by esbuild) on the same decode, when present.
    answer: globalThis.clipAnswer
      ? (({ clippedRuns, silences, peak }) => ({
          runs: clippedRuns.map((r) => [r.start, r.length]),
          silences: silences.map((r) => [r.start, r.length]),
          peak,
        }))(globalThis.clipAnswer.scan(chans, audio.sampleRate))
      : null,
  };
}

const ANSWER = join(REPO, 'site/src/demos/find-the-clipping/answer.ts');

/** answer.ts as a browser script that defines `globalThis.clipAnswer`, or null without it. */
async function answerScript() {
  if (!existsSync(ANSWER)) return null;
  const { buildSync } = await import('esbuild');
  const out = buildSync({
    entryPoints: [ANSWER],
    bundle: true,
    format: 'iife',
    globalName: 'clipAnswer',
    target: 'es2022',
    write: false,
  });
  return out.outputFiles[0].text;
}

/** Throws unless answer.ts found exactly the reference scan's runs, silences and peak. */
function crossCheck(s) {
  if (!s.answer) return false;
  const same =
    JSON.stringify(s.answer.runs) === JSON.stringify(s.runs) &&
    JSON.stringify(s.answer.silences) === JSON.stringify(s.silences) &&
    s.answer.peak === s.peak;
  if (!same) {
    throw new Error(
      `answer.ts disagrees with the reference scan: ${s.answer.runs.length}/${s.runs.length} runs, ${s.answer.silences.length}/${s.silences.length} silences`,
    );
  }
  return true;
}

async function openBrowser() {
  await waitForBenchLock();
  let pw;
  try {
    pw = await import('playwright');
  } catch {
    pw = await import('@playwright/test');
  }
  const browser = await pw.chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<!doctype html><title>decode</title>');
  const script = await answerScript();
  if (script) await page.addScriptTag({ content: script });
  return { browser, page };
}

/** The synthetic fallback: a 60 s, 16 kHz mono sweep with 4 clipped bursts and 2 silences. */
function synthetic() {
  const rate = 16_000;
  const n = rate * 60;
  const pcm = new Int16Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const f = 60 * (4000 / 60) ** (t / 60); // exponential sweep 60 Hz → 4 kHz
    phase += (2 * Math.PI * f) / rate;
    const silent = (t >= 20 && t < 23) || (t >= 41 && t < 44.5);
    const burst = [8, 17, 31, 52].some((b) => t >= b && t < b + 0.25);
    let x = silent ? 0 : 0.5 * Math.sin(phase);
    if (burst) x = Math.max(-1, Math.min(1, 3 * Math.sin(phase))); // driven into the rails
    pcm[i] = Math.round(x * 32767);
  }
  const data = Buffer.from(pcm.buffer);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return { buf: Buffer.concat([header, data]), sampleRate: rate };
}

/**
 * Candidates in search order, lazily: each item's metadata is fetched only when the previous
 * candidate did not qualify, so the cache holds exactly what the selection needed.
 */
async function* candidates(cache, searches) {
  for (const { q, evidence } of QUERIES) {
    const name = `search-${safe(q)}.json`;
    const res = JSON.parse((await cache.get(name, searchUrl(q))).toString('utf8'));
    searches.push({ q, url: searchUrl(q), numFound: res.response.numFound });
    for (const { identifier } of res.response.docs) {
      const meta = JSON.parse(
        (
          await cache.get(
            `meta-${safe(identifier)}.json`,
            `https://archive.org/metadata/${encodeURIComponent(identifier)}`,
          )
        ).toString('utf8'),
      );
      const m = meta.metadata ?? {};
      const creator = [m.creator].flat().filter(Boolean).join('; ');
      const licence = m.licenseurl ?? '';
      const publicDomain = /publicdomain/i.test(licence);
      const nasa = evidence === 'NASA' && /nasa/i.test(creator);
      if (!publicDomain && !nasa) continue;
      const file = (meta.files ?? []).find((f) => {
        const len = seconds(f.length);
        return (
          /MP3/i.test(f.format ?? '') && len >= 60 && len <= 240 && Number(f.size) <= MAX_BYTES
        );
      });
      if (!file) continue;
      yield {
        identifier,
        source: evidence,
        title: [m.title].flat()[0] ?? identifier,
        creator,
        licence,
        evidence: publicDomain
          ? `item licenseurl ${licence}`
          : `creator "${creator}" in the NASA collection (a U.S. government work)`,
        file: file.name,
        format: file.format,
        length: seconds(file.length),
        size: Number(file.size),
        url: `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(file.name)}`,
        page: `https://archive.org/details/${encodeURIComponent(identifier)}`,
      };
    }
  }
}

async function main() {
  const args = parseArgs();
  const cache = openCache(SLUG, args);
  const useFallback = args.fallback || (args.offline && cache.extra.chosen === null);
  log(`${SLUG}${args.offline ? ' (offline)' : ''}${useFallback ? ' (fallback)' : ''}`);
  const outDir = join(DATA, SLUG);
  rmSync(join(outDir, 'recording.mp3'), { force: true });
  rmSync(join(outDir, 'recording.wav'), { force: true });

  let chosen = null;
  let scan;
  let audio;
  let tried = [];
  const searches = [];
  const { browser, page } = await openBrowser();
  try {
    if (!useFallback) {
      for await (const c of candidates(cache, searches)) {
        if (tried.length >= MAX_CANDIDATES) break;
        const buf = await cache.get(`audio-${safe(c.identifier)}.mp3`, c.url);
        const { sampleRate } = mp3Format(buf);
        const s = await page.evaluate(decodeAndScan, {
          base64: buf.toString('base64'),
          sampleRate,
          rule: RULE,
        });
        const ok = s.runs.length >= 3 && s.silences.length >= 1;
        tried.push({
          ...c,
          sha256: sha256(buf),
          runs: s.runs.length,
          silences: s.silences.length,
          ok,
        });
        log(`  ${c.identifier}: ${s.runs.length} clipped runs, ${s.silences.length} silences`);
        if (ok) {
          crossCheck(s);
          chosen = c;
          scan = s;
          audio = buf;
          break;
        }
      }
    }
    if (!chosen) {
      const synth = synthetic();
      audio = synth.buf;
      scan = await page.evaluate(decodeAndScan, {
        base64: audio.toString('base64'),
        sampleRate: synth.sampleRate,
        rule: RULE,
      });
      crossCheck(scan);
    }
  } finally {
    await browser.close();
  }
  if (!args.offline) cache.extra.chosen = chosen?.identifier ?? null;
  cache.save();
  tried = tried.map(({ ok, ...t }) => ({ ...t, qualifies: ok }));

  const file = chosen ? 'recording.mp3' : 'recording.wav';
  const audioPath = writeOut(join(outDir, file), audio);
  const ms = (samples) => round((samples * 1000) / scan.sampleRate, 1);
  const longest = scan.runs.reduce((m, r) => (r[1] > m[1] ? r : m), [0, 0]);
  const recording = {
    file,
    kind: chosen ? 'recording' : 'synthetic',
    identifier: chosen?.identifier ?? null,
    title: chosen?.title ?? 'Synthetic sine sweep with injected clipping',
    sampleRate: scan.sampleRate,
    channels: scan.channels,
    samples: scan.samples,
    durationSeconds: round(scan.samples / scan.sampleRate, 3),
    sha256: sha256(audio),
    rule: RULE,
    reference: {
      clippedRuns: scan.runs.length,
      longestRun: { start: longest[0], samples: longest[1], ms: ms(longest[1]) },
      silences: scan.silences.length,
      peak: round(scan.peak, 6),
      runs: scan.runs,
      silenceSpans: scan.silences,
    },
  };
  const metaPath = writeOut(join(outDir, 'recording.json'), `${JSON.stringify(recording)}\n`);

  const slicePath = join(SLICES, 'waveform.ts');
  writeOut(
    slicePath,
    [
      `// Generated by \`npm run demo-data -- ${SLUG}\`; do not edit.`,
      chosen
        ? `// Source: "${chosen.title}" (${chosen.page}), ${chosen.evidence.startsWith('item') ? 'public domain' : 'a U.S. government work'};`
        : '// Source: a synthetic sine sweep generated by scripts/demo-data/find-the-clipping.mjs (MIT);',
      `// first channel, decoded by Chromium at ${scan.sampleRate} Hz. Full file and SOURCE.md: site/public/data/${SLUG}/.`,
      '',
      `/** 1,024 consecutive samples around the longest clipped run, ${scan.sampleRate} samples per second. */`,
      'export const clipExcerpt = {',
      `  sampleRate: ${scan.sampleRate},`,
      '  /** Index of the first sample in the whole recording. */',
      `  start: ${scan.excerptStart},`,
      `  samples: ${JSON.stringify(scan.excerpt.map((v) => round(v, 4)))},`,
      '};',
      '',
    ].join('\n'),
  );
  biomeFormat([metaPath, slicePath]);

  const raw = Object.entries(cache.files).map(([name, f]) => ({ name, ...f }));
  const md = renderSourceMd({
    title: 'Find the clipping: data source',
    slug: SLUG,
    summary: chosen
      ? `One public-domain recording from the Internet Archive, bundled byte-for-byte as \`${file}\` and decoded in the browser.`
      : 'A synthetic test signal (no qualifying public-domain recording was found); the page labels it "Synthetic".',
    urls: chosen
      ? [
          `Recording: ${chosen.url}`,
          `Item page: ${chosen.page}`,
          ...searches.map((s) => `Search (${s.numFound} items): ${s.url}`),
        ]
      : [
          'Generated by scripts/demo-data/find-the-clipping.mjs',
          ...searches.map((s) => `Search: ${s.url}`),
        ],
    licence: chosen
      ? chosen.evidence.startsWith('item')
        ? 'Public domain (CC0)'
        : 'U.S. Government work (public domain)'
      : 'MIT (generated)',
    licenceEvidence: chosen
      ? [
          `Internet Archive item \`${chosen.identifier}\`: ${chosen.evidence}.`,
          `Creator field: ${chosen.creator || '(none)'}; collection query \`${QUERIES.find((q) => q.evidence === 'NASA').q}\` or \`${QUERIES[1].q}\` (works of NASA employees are not subject to U.S. copyright, 17 U.S.C. §105; LibriVox recordings carry a public-domain dedication).`,
        ]
      : ['Generated in this repository, MIT like the repository.'],
    attribution: chosen
      ? `${chosen.title === chosen.identifier ? '' : `${chosen.title}, `}${chosen.source} via the Internet Archive, item ${chosen.identifier}`
      : 'Synthetic signal generated by snaplot',
    retrieved: retrievalDate(cache.files) ?? 'n/a',
    regenerate: [
      `npm run demo-data -- ${SLUG}            # search, download and decode into scripts/demo-data/.cache/${SLUG}/`,
      `npm run demo-data -- ${SLUG} --offline  # re-decode from that cache (needs Playwright's Chromium)`,
    ],
    rows: [
      `\`${file}\`: ${recording.durationSeconds} s, ${scan.sampleRate} Hz, ${scan.channels} channel(s), ${scan.samples} samples per channel, ${audio.length} bytes.`,
      `Candidates decoded: ${tried.length} (${tried.map((t) => `\`${t.identifier}\` ${t.runs} runs / ${t.silences} silences`).join('; ') || 'none'}).`,
    ],
    files: sizeOf([audioPath, metaPath]),
    raw,
    processing: [
      chosen
        ? 'The MP3 is the archive.org file itself, unchanged (no re-encoding); its SHA-256 equals the raw download above.'
        : 'A 60 s, 16 kHz, 16-bit mono WAV: an exponential sine sweep from 60 Hz to 4 kHz at −6 dBFS, driven into the rails for 0.25 s at 8, 17, 31 and 52 s, and silent from 20–23 s and 41–44.5 s.',
      `Decoding: Chromium \`decodeAudioData\` on an \`OfflineAudioContext\` at the file's own sample rate (${scan.sampleRate} Hz, read from the first frame header), so no resampling changes the samples. Decode at that rate in the page too.`,
      `Clipped run: ≥ ${RULE.minClipSamples} consecutive sample frames with |x| ≥ 10^(${RULE.clipDbfs}/20) = ${round(10 ** (RULE.clipDbfs / 20), 5)} in any channel (decoded MP3 samples may exceed 1).`,
      `Silence: consecutive ${RULE.silenceWindowMs} ms windows whose RMS (loudest channel) is below ${RULE.silenceDbfs} dBFS, lasting more than ${RULE.minSilenceMs / 1000} s.`,
    ],
    oracle: [
      `Reference scan in Chromium (written separately from \`answer.ts\`): **${scan.runs.length} clipped runs**, the longest ${longest[1]} samples (${ms(longest[1])} ms) at sample ${longest[0]}; **${scan.silences.length} silences** longer than 2 s; peak |x| ${round(scan.peak, 4)}.`,
      scan.answer
        ? 'The generator also runs `answer.ts` (bundled with esbuild) on the same decode and stops unless it finds exactly these runs, silences and peak.'
        : 'answer.ts was not present when this file was generated, so the generator could not cross-check it.',
      'Values with every run and silence span are in `recording.json`. `answer.test.ts` requires `clippedRuns >= 3` and at least one silence for the bundled file, and checks `answer.ts` on generated signals against a brute-force count; the page re-runs the reference scan on an `OfflineAudioContext` decode (M16c).',
    ],
    reference:
      'An Audacity / iZotope RX waveform editor: dark graphite `#1B1D1F`, a green waveform, amber clip marks, a compact toolbar with keycap hints, the system UI stack and system monospace timecodes.',
    notes: chosen
      ? []
      : [
          `NOTE: no candidate qualified${args.fallback ? ' (forced with --fallback)' : ''}, so the bundled file is synthetic and the page must label it "Synthetic". Regenerate with \`npm run demo-data -- ${SLUG}\`.`,
        ],
  });
  writeOut(join(outDir, 'SOURCE.md'), md);
  log(`  wrote ${rel(audioPath)} (${chosen ? chosen.identifier : 'synthetic'}), ${rel(slicePath)}`);
}

await main();
