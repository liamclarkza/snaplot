/**
 * The max-q page's numbers, from the simulated flight: the moment of Max-Q, the hardest push, the
 * staging times and the orbit, and the headline that answers the page's question. Pure functions
 * of a `Flight`, so `answer.test.ts` can check them against a recount of the raw frames.
 */
import type { FlightEvent, Flight, Frame } from './flight';

export interface Summary {
  maxQ: Frame;
  /** The frame with the highest sensed acceleration. */
  peakG: Frame;
  meco: number;
  seco: number;
  /** The throttle bucket: the first and last frame of stage 1 below full throttle. */
  bucket: { from: number; to: number; low: number };
  orbit: Flight['orbit'];
  /** The last frame, at SECO. */
  final: Frame;
}

const eventTime = (events: readonly FlightEvent[], id: FlightEvent['id']) =>
  events.find((e) => e.id === id)?.t ?? Number.NaN;

export function summarize(flight: Flight): Summary {
  const { frames, events } = flight;
  let maxQ = frames[0];
  let peakG = frames[0];
  for (const frame of frames) {
    if (frame.q > maxQ.q) maxQ = frame;
    if (frame.accel > peakG.accel) peakG = frame;
  }
  const throttled = frames.filter((f) => f.stage === 'stage 1' && f.throttle < 0.999);
  return {
    maxQ,
    peakG,
    meco: eventTime(events, 'meco'),
    seco: eventTime(events, 'seco'),
    bucket: {
      from: throttled[0]?.t ?? Number.NaN,
      to: throttled.at(-1)?.t ?? Number.NaN,
      low: Math.min(...throttled.map((f) => f.throttle)),
    },
    orbit: flight.orbit,
    final: frames.at(-1) ?? frames[0],
  };
}

/** Mission elapsed time: `T+01:23` (minutes and seconds). */
export function clock(seconds: number, tenths = false): string {
  const sign = seconds < 0 ? '−' : '+';
  const whole = Math.abs(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole - minutes * 60;
  const secs = tenths
    ? rest.toFixed(1).padStart(4, '0')
    : String(Math.floor(rest)).padStart(2, '0');
  return `T${sign}${String(minutes).padStart(2, '0')}:${secs}`;
}

const one = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const whole = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const twoPlaces = new Intl.NumberFormat('en-GB', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

/** The answer to "When does the rocket hit Max-Q?". */
export function headline(s: Summary): string {
  return (
    `Max-Q comes at ${clock(s.maxQ.t)}, ${one.format(s.maxQ.altitude)} km up at ` +
    `Mach ${twoPlaces.format(s.maxQ.mach)}: ${one.format(s.maxQ.q)} kPa, with the engines ` +
    `throttled to ${whole.format(s.bucket.low * 100)}% to get through it.`
  );
}

/** The flight's other highlights, one line. */
export function highlights(s: Summary): string {
  return (
    `The hardest push, ${one.format(s.peakG.accel)} g, comes just before MECO at ` +
    `${clock(s.meco)}; the second stage shuts down at ${clock(s.seco)} in a ` +
    `${whole.format(s.orbit.periapsis)} × ${whole.format(s.orbit.apoapsis)} km orbit.`
  );
}

export const format = { one, whole, twoPlaces };
