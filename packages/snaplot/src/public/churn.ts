/**
 * The re-ingest warnings (plan D16): an accessor that keeps changing identity, a large source read
 * again more than ten times a second, and streamed rows discarded by a data replacement.
 */
import { warnOnce } from '../engine/errors';
import { formatValue } from '../engine/format';
import { sameData, type Work } from './classify';
import type { NormalizedOptions } from './normalize';
import type { Ingested } from './sources';

/** Sources this large warn about accessor churn and re-ingests. */
const CHURN_ROWS = 10_000;

/** Identity-only accessor changes in a row, and the times of changes and ingests. */
export interface Churn {
  streak: number;
  times: number[];
  ingests: number[];
}

export function noteChurn<Row>(
  churn: Churn,
  ingested: Ingested<Row>,
  next: NormalizedOptions<Row>,
  work: Work,
): void {
  const now = Date.now();
  const rows = (si: number) => {
    const source = si < 0 ? undefined : ingested.sources[ingested.seriesSources[si]];
    return source?.columns[0].length ?? 0;
  };
  if (work.accessor && !work.data) {
    const change = work.accessor;
    const count = rows(ingested.seriesIds.indexOf(change.id));
    if (count < CHURN_ROWS) return;
    churn.streak++;
    churn.times = [...churn.times.filter((time) => now - time < 1000), now];
    if (churn.streak >= 3 || churn.times.length > 10)
      warnOnce(
        'accessor-churn',
        `series "${change.id}" keeps getting a new ${change.field} function, and each one re-reads its ${formatValue(count)} rows. Memoise the function, or use a field name.`,
      );
    return;
  }
  churn.streak = 0;
  const largest = next.series.reduce(
    (best, s) => {
      const count = rows(ingested.seriesIds.indexOf(s.id));
      return count > best.count ? { id: s.id, count } : best;
    },
    { id: '', count: 0 },
  );
  if (largest.count < CHURN_ROWS) return;
  churn.ingests = [...churn.ingests.filter((time) => now - time < 1000), now];
  if (churn.ingests.length > 10)
    warnOnce(
      'reingest-churn',
      `series "${largest.id}" re-read its ${formatValue(largest.count)} rows more than 10 times in a second. Use appendData() for new rows, or memoise data so it keeps its identity.`,
    );
}

/** Warn once when new data replaces a source that appendData() extended (plan D16). */
export function noteReplacedStreams<Row>(previous: Ingested<Row>, next: Ingested<Row>): void {
  let discarded = 0;
  for (const source of previous.sources) {
    if (!source.streamed || !source.appended) continue;
    const kept = next.sources.some(
      (other) => other.streamed && sameData(other.declared, source.declared),
    );
    if (!kept) discarded += source.appended;
  }
  if (discarded > 0)
    warnOnce(
      'streamed-replaced',
      `data replaced on a streamed source; ${formatValue(discarded)} appended rows were discarded. Pass data once (useState/createSignal) or omit it.`,
    );
}
