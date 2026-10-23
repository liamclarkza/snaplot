// Markdown reports for run.mjs and ab.mjs.

const n = (v, digits) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  const d = digits ?? (Math.abs(v) < 1 ? 3 : Math.abs(v) < 100 ? 2 : 1);
  return v.toFixed(d);
};

const pair = (b, h, digits) =>
  b === undefined && h === undefined ? '–' : `${n(b, digits)} → ${n(h, digits)}`;

/** Heap per operation: usedJSHeapSize increments, plus the sampled allocation with --heap-profile. */
function heapPair(b, h) {
  const gross = pair(b?.values['heap.grossKBPerOp'], h?.values['heap.grossKBPerOp'], 1);
  const sampled = b?.values.allocKBPerOp ?? h?.values.allocKBPerOp;
  return sampled === undefined
    ? gross
    : `${gross} (sampled ${pair(b?.values.allocKBPerOp, h?.values.allocKBPerOp, 1)})`;
}

function heapOne(a) {
  const gross = n(a.values['heap.grossKBPerOp'], 1);
  return a.values.allocKBPerOp === undefined
    ? gross
    : `${gross} (sampled ${n(a.values.allocKBPerOp, 1)})`;
}

function verdictCell(row) {
  const v = row.blocking ? `**${row.verdict.toUpperCase()}**` : row.verdict;
  return row.noisy ? `${v} (noisy: ${row.noise})` : v;
}

function diagnosticsNote(meta) {
  const entries = Object.entries(meta.diagnostics ?? {});
  if (entries.length === 0) return '';
  return ` · **diagnostic flags: ${entries.map(([k, v]) => `${k}=\`${v}\``).join(', ')}**`;
}

export function machineLines(meta) {
  return [
    `- **Date:** ${meta.date} · **duration:** ${Math.round(meta.durationMs / 1000)} s`,
    `- **Machine:** ${meta.machine.cpu}, ${meta.machine.cores} cores, ${meta.machine.memGB} GB, ${meta.machine.os} · Node ${meta.node} · Playwright ${meta.playwright}`,
    `- **Browser:** ${meta.browser.userAgent.match(/Chrome\/[\d.]+/)?.[0] ?? meta.browser.userAgent} · raster **${meta.raster}** (WebGL: ${meta.browser.renderer}) · cross-origin isolated: ${meta.browser.crossOriginIsolated} · precise heap: ${meta.browser.preciseHeap}${diagnosticsNote(meta)}`,
    `- **Load (1 min):** ${meta.load.start.toFixed(2)} at start, ${meta.load.end.toFixed(2)} at end; noisy rounds ${meta.noisyRounds}/${meta.totalRounds} (load > ${meta.noiseThreshold} = cores × ${meta.loadPerCore})`,
  ];
}

/** `profile scenario` entries, one per re-measurement, as a list with counts. */
export function retriedSummary(retried) {
  const counts = new Map();
  for (const entry of retried) counts.set(entry, (counts.get(entry) ?? 0) + 1);
  return [...counts]
    .map(([entry, count]) => (count > 1 ? `${entry} (${count}×)` : entry))
    .join(', ');
}

export function abReport({ meta, evaluation }) {
  const lines = [];
  lines.push(`# bench:ab ${meta.base.ref} → ${meta.head.ref}`, '');
  lines.push('| | base | head |', '| :-- | :-- | :-- |');
  lines.push(
    `| ref | \`${meta.base.ref}\` (${meta.base.short}) | \`${meta.head.ref}\` (${meta.head.short}) |`,
  );
  lines.push(`| API adapter | ${meta.base.api} | ${meta.head.api} |`, '');
  lines.push(...machineLines(meta));
  lines.push(
    `- **Command:** \`npm run bench:ab -- ${meta.argv.join(' ')}\``,
    `- **Set:** ${meta.set} (ratio ≤ ${meta.setRatio}, floor ${meta.floorMs} ms) · **filter:** ${meta.filter || 'none'} · **runs:** ${meta.runs} interleaved pairs per profile · **profiles:** ${meta.profiles.join(', ')}${meta.selfTest ? ` · **self-test** (same commit: every required ratio must be 1 ± ${meta.tolerance})` : ''}`,
    `- **Lock:** waited ${Math.round(meta.lock.waitedMs / 1000)} s at ${meta.lock.path}`,
    '',
  );
  lines.push(
    "Values are medians over runs of each run's median (ms unless noted); `ratio` (head/base, floored) is what the gate checks. `metric` is the gated one: `busy` = sync + library callbacks until the next frame (main-thread busy time), `sync` = the call alone, `wall` = call to first painted frame. `best` is the ratio of each side's fastest run, a diagnostic for noisy rows only. Frame time is a jank signal only.",
    '',
  );
  for (const [profile, rows] of Object.entries(evaluation.profiles)) {
    lines.push(`## ${profile}`, '');
    lines.push(
      '| scenario | metric | base | head | ratio | limit | verdict | best | base runs | head runs | p95 | task ms/op | heap KB/op | fidelity | notes |',
      '| :-- | :-- | --: | --: | --: | --: | :-- | --: | :-- | :-- | :-- | :-- | :-- | :-- | :-- |',
    );
    for (const row of rows) {
      const b = evaluation.aggregates[profile].base[row.name];
      const h = evaluation.aggregates[profile].head[row.name];
      const kind = row.primary.split('.')[0];
      const extra = row.checks
        .slice(1)
        .filter((c) => c.metric !== 'heap.grossKBPerOp')
        .map((c) => `${c.metric} ${n(c.ratio)}/${c.max} ${c.verdict}`);
      const notes = [...extra, ...row.notes].join('; ');
      lines.push(
        `| ${row.name}${row.required ? '' : ' ⁽ⁱ⁾'} | ${row.primary} | ${n(row.base)} | ${n(row.head)} | ${n(row.ratio, 2)} | ${row.limit ?? '–'} | ${verdictCell(row)} | ${n(row.bestRatio, 2)} | ${(b?.primaryRuns ?? []).map((v) => n(v)).join(', ')} | ${(h?.primaryRuns ?? []).map((v) => n(v)).join(', ')} | ${pair(b?.values[`${kind}.p95`], h?.values[`${kind}.p95`])} | ${pair(b?.values.taskMsPerOp, h?.values.taskMsPerOp)} | ${heapPair(b, h)} | ${n(h?.values['fidelity.median'], 2)} | ${notes} |`,
      );
    }
    lines.push('', '⁽ⁱ⁾ not in the required set: reported, never blocking.', '');
  }
  if (evaluation.budgets.length) {
    lines.push('## Budgets (head, absolute)', '');
    lines.push(
      '| budget | profile | metric | value | limit | status | blocks here | was |',
      '| :-- | :-- | :-- | --: | :-- | :-- | :-- | :-- |',
    );
    for (const b of evaluation.budgets) {
      lines.push(
        `| ${b.id} | ${b.profile} | ${b.metric} | ${n(b.value)} | ${b.limit} | ${b.status === 'missed' && b.blocking ? '**MISSED**' : b.status} | ${b.blocking ? 'yes' : 'no'} | ${b.was ?? ''} |`,
      );
    }
    lines.push('');
  }
  lines.push('## Result', '');
  if (evaluation.failures.length === 0)
    lines.push(`**PASS**: no blocking failure.${evaluation.noisyFailures ? '' : ''}`);
  else {
    lines.push(`**FAIL**: ${evaluation.failures.length} blocking failure(s):`, '');
    for (const f of evaluation.failures) lines.push(`- ${f}`);
  }
  if (meta.selfTest) {
    lines.push(
      '',
      `Self-test: ${evaluation.selfTest.within}/${evaluation.selfTest.total} required ratios within 1 ± ${meta.tolerance}.`,
    );
    if (evaluation.selfTest.outside.length)
      lines.push(`Outside: ${evaluation.selfTest.outside.join(', ')}.`);
  }
  if (evaluation.retried.length)
    lines.push('', `Re-measured after a noisy failure: ${retriedSummary(evaluation.retried)}.`);
  lines.push('');
  return lines.join('\n');
}

export function runReport({ meta, aggregates }) {
  const lines = [`# bench run: ${meta.side.ref} (${meta.side.short}), API ${meta.side.api}`, ''];
  lines.push(...machineLines(meta), `- **Runs:** ${meta.runs} per scenario`, '');
  for (const [profile, scenarios] of Object.entries(aggregates)) {
    lines.push(`## ${profile}`, '');
    lines.push(
      '| scenario | area | metric | value | runs | p95 | frame p50 | task ms/op | heap KB/op | fidelity | valid |',
      '| :-- | :-- | :-- | --: | :-- | --: | --: | --: | --: | --: | :-- |',
    );
    for (const a of Object.values(scenarios)) {
      if (a.unsupported) {
        lines.push(`| ${a.name} | ${a.area} | – | n/a | | | | | | | ${a.unsupported} |`);
        continue;
      }
      const kind = a.primary;
      lines.push(
        `| ${a.name} | ${a.area} | ${a.primaryPath} | ${n(a.values[a.primaryPath])} | ${a.primaryRuns.map((v) => n(v)).join(', ')} | ${n(a.values[`${kind}.p95`])} | ${n(a.values['frame.median'])} | ${n(a.values.taskMsPerOp)} | ${heapOne(a)} | ${n(a.values['fidelity.median'], 2)} | ${a.valid ? 'yes' : a.errors[0] ? `error: ${a.errors[0].slice(0, 80)}` : 'NO'} |`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}
