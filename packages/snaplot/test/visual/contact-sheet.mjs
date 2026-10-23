// Writes an HTML contact sheet for a visual run: every shot with its reference, and for a changed
// shot the actual and diff images Playwright attached. Open it from disk to review baselines
// (plan §11.1 "regenerate and review the contact sheet") or a diff.
//   node test/visual/contact-sheet.mjs [test-results/visual]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );

/** Every visual test in a Playwright JSON report: shot name, status, attachments. */
export function visualResults(report) {
  const out = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const shot = (t.annotations ?? []).find((a) => a.type === 'screenshot')?.description;
        if (!shot) continue;
        const result = t.results?.[t.results.length - 1] ?? {};
        out.push({
          shot,
          fixture: (t.annotations ?? []).find((a) => a.type === 'fixture')?.description ?? shot,
          status: t.status === 'expected' ? 'passed' : t.status,
          error: result.error?.message ?? '',
          attachments: result.attachments ?? [],
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  return out;
}

export function writeContactSheet({ report, meta, outFile }) {
  const base = dirname(outFile);
  const rel = (p) => relative(base, p).split('\\').join('/');
  const rows = visualResults(report).map((r) => {
    const expected = join(meta.expectedDir, `${r.shot}${meta.suffix ?? ''}.png`);
    const cells = [];
    if (existsSync(expected)) cells.push(['reference', rel(expected)]);
    for (const a of r.attachments) {
      if (a.path && /-(actual|diff)\.png$/.test(a.path)) {
        cells.push([
          a.name
            .replace(/\.png$/, '')
            .split('-')
            .pop(),
          rel(a.path),
        ]);
      }
    }
    const figures = cells
      .map(
        ([label, src]) =>
          `<figure><img loading="lazy" src="${esc(src)}" alt="${esc(`${r.shot} ${label}`)}"><figcaption>${esc(label)}</figcaption></figure>`,
      )
      .join('');
    return `<section class="${esc(r.status)}"><h2>${esc(r.shot)} <small>${esc(r.status)}</small></h2>${figures}</section>`;
  });
  const title = meta.against
    ? `against ${meta.against.ref} (${String(meta.against.sha).slice(0, 10)})`
    : `${meta.mode} (${meta.platform})`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Visual run: ${esc(title)}</title>
<style>body{font:13px system-ui,sans-serif;margin:16px;background:#fafafa;color:#222}
section{display:inline-block;vertical-align:top;margin:0 12px 16px 0;padding:8px;background:#fff;border:1px solid #ddd}
section.unexpected{border-color:#d33}h2{font-size:12px;margin:0 0 6px}small{color:#888;font-weight:400}
figure{display:inline-block;margin:0 6px 0 0}figcaption{font-size:11px;color:#666}img{display:block;max-width:640px;border:1px solid #eee}</style>
</head><body><h1>Visual run: ${esc(title)}</h1><p>${rows.length} shots · head ${esc(String(meta.head?.sha).slice(0, 10))}${meta.head?.dirty ? ' (dirty)' : ''}</p>
${rows.join('\n')}</body></html>`;
  writeFileSync(outFile, html);
  return outFile;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = resolve(process.argv[2] ?? 'test-results/visual');
  const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'));
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  meta.expectedDir = resolve(pkg, meta.expectedDir);
  console.log(writeContactSheet({ report, meta, outFile: join(dir, 'contact-sheet.html') }));
}
