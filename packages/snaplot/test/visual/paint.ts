/**
 * When the fixture app reports a fixture ready (app.ts): both canvas layers rendered, and the
 * layer the fixture expects to hold ink holds some. Kept apart from app.ts so paint.test.ts can
 * lock it without a browser.
 */
import type { Fixture } from './fixtures';

/** What app.ts reads from the chart's debug view on each frame. */
export interface PaintState {
  /** `debug(chart).renderCount`, or null before the chart exposes it. */
  renderCount: { grid: number; data: number } | null;
  /** Pixels with any alpha on the grid and data layers. */
  gridInk: number;
  dataInk: number;
}

/** The layer that must hold ink before the fixture counts as painted, or null for none. */
export function inkLayer(
  fixture: Pick<Fixture, 'blankData' | 'blankGrid'>,
): 'data' | 'grid' | null {
  if (!fixture.blankData) return 'data';
  return fixture.blankGrid ? null : 'grid';
}

/** Whether the fixture has painted: both layers rendered at least once, with the expected ink. */
export function paintReady(
  fixture: Pick<Fixture, 'blankData' | 'blankGrid'>,
  state: PaintState,
): boolean {
  const rendered = (state.renderCount?.grid ?? 0) >= 1 && (state.renderCount?.data ?? 0) >= 1;
  if (!rendered) return false;
  const layer = inkLayer(fixture);
  if (layer === 'data') return state.dataInk > 0;
  if (layer === 'grid') return state.gridInk > 0;
  return true;
}
