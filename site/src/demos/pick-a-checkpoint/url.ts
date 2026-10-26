/**
 * The workspace state kept in the URL, so a link or a reload shows the same view: the zoomed
 * epochs, the pinned checkpoints, the smoothing weight and the ranking criterion.
 *
 *   ?epochs=12.5-30&pins=A-11,B-30&smoothing=0.6&by=accuracy
 *
 * A missing key means "the default"; `pins=` (empty) means "no pins", which is not the same as
 * no `pins` key (the default pins the recommended checkpoint).
 */
import type { Criterion } from './answer';

export interface Pin {
  run: string;
  epoch: number;
}

export interface UrlState {
  /** The zoomed X range in epochs; undefined when every chart is automatic. */
  epochs?: readonly [number, number];
  /** Pinned checkpoints; undefined when the URL names none. */
  pins?: readonly Pin[];
  /** The training-loss smoothing weight, 0–0.99. */
  smoothing?: number;
  by?: Criterion;
}

const BY: Record<string, Criterion> = { loss: 'valLoss', accuracy: 'valAcc' };

export function readUrl(search: string): UrlState {
  const params = new URLSearchParams(search);
  const state: UrlState = {};
  const epochs = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(params.get('epochs') ?? '');
  if (epochs && Number(epochs[1]) < Number(epochs[2])) {
    state.epochs = [Number(epochs[1]), Number(epochs[2])];
  }
  const pins = params.get('pins');
  if (pins !== null) {
    state.pins = pins
      .split(',')
      .map((p) => /^([A-Z]+)-(\d+)$/.exec(p))
      .filter((m) => m !== null)
      .map((m) => ({ run: m[1], epoch: Number(m[2]) }));
  }
  const smoothing = Number(params.get('smoothing') ?? Number.NaN);
  if (smoothing >= 0 && smoothing <= 0.99) state.smoothing = smoothing;
  const by = BY[params.get('by') ?? ''];
  if (by) state.by = by;
  return state;
}

/** The query string for a state (keys in a fixed order); '' when everything is the default. */
export function writeUrl(state: UrlState): string {
  const params = new URLSearchParams();
  if (state.epochs) params.set('epochs', state.epochs.map((e) => round(e)).join('-'));
  if (state.pins) params.set('pins', state.pins.map((p) => `${p.run}-${p.epoch}`).join(','));
  if (state.smoothing !== undefined) params.set('smoothing', String(round(state.smoothing)));
  if (state.by === 'valAcc') params.set('by', 'accuracy');
  // URLSearchParams encodes the commas between pins; they need no escaping in a query.
  const query = params.toString().replaceAll('%2C', ',');
  return query ? `?${query}` : '';
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Adds the pin, or removes it when it is already pinned. */
export function togglePin(pins: readonly Pin[], pin: Pin): Pin[] {
  const rest = pins.filter((p) => p.run !== pin.run || p.epoch !== pin.epoch);
  return rest.length < pins.length ? rest : [...pins, pin].sort(byRunThenEpoch);
}

const byRunThenEpoch = (a: Pin, b: Pin) => a.run.localeCompare(b.run) || a.epoch - b.epoch;
