/**
 * Source: a simulation, not a recording (the model is below).
 *
 * A simulated spectrum analyser for the heatmap examples: ten sweeps a second of a 10 MHz band
 * from 400 to 410 MHz, 100 bins of 100 kHz, in dBm. Every page that shows it labels it
 * "Simulated".
 *
 * Model: a noise floor at −100 dBm with seeded noise, a steady carrier at 402.5 MHz, a carrier
 * drifting around 406 MHz every 20 s, and a transmitter that hops between eight channels from
 * 400.5 to 409.2 MHz, on for 0.6 s of every 1.5 s, each a Gaussian peak summed in power.
 */
import type { ChartHandle } from 'snaplot';

/** One sweep of the band. */
export interface Sweep {
  /** When it ran, epoch milliseconds. */
  time: number;
  /** Power per bin, dBm, from 400 MHz up. */
  power: number[];
}

/** The bins: 100 of them, 0.1 MHz apart, from 400 MHz. */
export const BAND = { start: 400, step: 0.1, count: 100 };
/** Sweeps a second, and the history the chart opens with. */
const RATE = 10;
const HISTORY = 300;
const HOPS = [400.5, 408.1, 403.7, 409.2, 401.4, 405.0, 407.3, 404.6];

/** mulberry32, seeded: the same sweeps on every load. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A spectrum analyser: `next(time)` sweeps the band at `time`. */
export function createAnalyser(seed = 7): { next(time: number): Sweep } {
  const noise = random(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - noise())) * Math.cos(2 * Math.PI * noise());
  const mw = (dbm: number) => 10 ** (dbm / 10);
  return {
    next(time) {
      const t = time / 1000;
      const peaks = [
        { mhz: 402.5, dbm: -58, width: 0.12 },
        { mhz: 406 + 0.8 * Math.sin((2 * Math.PI * t) / 20), dbm: -66, width: 0.08 },
      ];
      const slot = Math.floor(t / 1.5);
      if (t - slot * 1.5 < 0.6)
        peaks.push({
          mhz: HOPS[((slot % HOPS.length) + HOPS.length) % HOPS.length],
          dbm: -72,
          width: 0.05,
        });
      const power: number[] = [];
      for (let k = 0; k < BAND.count; k++) {
        const mhz = BAND.start + k * BAND.step;
        let sum = mw(-100 + 2.5 * gauss());
        for (const peak of peaks)
          sum += mw(peak.dbm) * Math.exp(-(((mhz - peak.mhz) / peak.width) ** 2) / 2);
        power.push(10 * Math.log10(sum));
      }
      return { time, power };
    },
  };
}

/**
 * Streams sweeps to `onRows` ten times a second while `chart` is on the page and the tab is
 * visible, after thirty seconds of history; returns the function that stops it. Under
 * `prefers-reduced-motion` it sends the history only.
 */
export function spectrumFeed(
  chart: ChartHandle<Sweep>,
  onRows: (rows: Sweep[]) => void,
): () => void {
  const analyser = createAnalyser();
  const now = Date.now();
  const step = 1000 / RATE;
  onRows(Array.from({ length: HISTORY }, (_, i) => analyser.next(now - (HISTORY - i) * step)));
  if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};
  const timer = setInterval(() => {
    if (!chart.container.isConnected) return clearInterval(timer);
    if (!document.hidden) onRows([analyser.next(Date.now())]);
  }, step);
  return () => clearInterval(timer);
}
