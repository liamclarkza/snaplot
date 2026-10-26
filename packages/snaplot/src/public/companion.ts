/**
 * What the built-in legend and the legend table need from a chart beyond its handle: a click
 * toggles a series and a hover highlights one, both reported as the user's own actions
 * (`hiddenSeries:change`, `highlight:change`), unlike the state options, which change silently
 * (plan D3); and the X axis title for the table header. Only core views use it.
 */
import type { CursorSnapshot, SeriesState } from './types';

export interface Companion {
  /** Show a hidden series, or hide a shown one, as a legend click does. */
  toggle(id: string): void;
  /** Highlight a series, or clear the highlight with `null`, as a legend hover does. */
  highlight(id: string | null): void;
  /** The highlighted series id, or `null`. */
  highlighted(): string | null;
  /** Every series with its colour, mark and visibility. */
  series(): readonly SeriesState[];
  /** The values under the cursor, or at the fallback position. */
  cursor(fallback: 'latest' | 'first' | 'hide'): CursorSnapshot<any>;
  /** The X axis title, for the legend table's header. */
  xTitle(): string | undefined;
  /** Follow every data, option and state commit as it happens; returns the unsubscribe. */
  observe(listener: () => void): () => void;
}

/** The companion of each live chart handle. */
export const companions = new WeakMap<object, Companion>();
