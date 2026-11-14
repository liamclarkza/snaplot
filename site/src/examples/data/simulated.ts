/**
 * Source: seeded simulations, not measurements (each model is below), for the heatmap examples.
 * Every page that shows them labels them "Simulated".
 *
 * - `windDays`: hourly wind direction at a coastal station over two weeks: a land breeze from
 *   about 70° at night and a sea breeze from about 250° in the afternoon, veering through south
 *   in the morning and through north in the evening, with a westerly front on days 6 to 8. The
 *   vane froze from 02:00 to 08:00 on day 10, so those hours are `null`.
 * - `requests`: 20,000 requests to a service: response size log-normal around 40 KB, duration
 *   12 ms plus 0.35 ms per KB plus log-normal noise, and 6% cache misses that take 60 ms more.
 * - `latencyMinutes`: three hours of a service's request latency, one histogram a minute in
 *   10 ms bins: log-normal around a median that creeps from 105 to 140 ms, 450 to 950 requests a
 *   minute. From 10:10 to 10:55 a slow dependency gives up to 45% of requests a second mode near
 *   390 ms, and after 11:20 the spread widens.
 */

/** mulberry32, seeded: the same data on every load. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rand: () => number): () => number {
  return () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

/** One day at the station: the wind's direction in each hour, degrees from north. */
export interface WindDay {
  /** The day, `YYYY-MM-DD`. */
  day: string;
  /** Direction per hour, 0 ≤ d < 360; `null` while the vane was frozen. */
  direction: (number | null)[];
}

/** The breeze's direction at `hour`: 70° at night, 250° in the afternoon, turning clockwise. */
function breeze(hour: number): number {
  if (hour < 9) return 70;
  if (hour < 13) return 70 + ((hour - 9) / 4) * 180;
  if (hour < 19) return 250;
  if (hour < 23) return 250 + ((hour - 19) / 4) * 180;
  return 430;
}

export const windDays: WindDay[] = (() => {
  const gauss = normal(random(11));
  return Array.from({ length: 14 }, (_, d) => ({
    day: new Date(Date.UTC(2026, 2, 2 + d)).toISOString().slice(0, 10),
    direction: Array.from({ length: 24 }, (_, h) => {
      if (d === 9 && h >= 2 && h < 8) return null;
      const front = d >= 5 && d <= 7 ? 270 + (d - 5) * 25 + h : breeze(h);
      return (((front + 12 * gauss()) % 360) + 360) % 360;
    }),
  }));
})();

/** 20,000 requests: response size (KB) and duration (ms), in parallel arrays. */
export const requests: { size: number[]; duration: number[] } = (() => {
  const rand = random(23);
  const gauss = normal(rand);
  const size: number[] = [];
  const duration: number[] = [];
  for (let i = 0; i < 20_000; i++) {
    const kb = Math.min(300, 40 * Math.exp(0.7 * gauss()));
    const miss = rand() < 0.06 ? 60 : 0;
    size.push(kb);
    duration.push(12 + 0.35 * kb + 8 * Math.exp(0.5 * gauss()) + miss);
  }
  return { size, duration };
})();

/** One minute of the service: how many requests took each latency. */
export interface LatencyMinute {
  /** The minute, ISO-8601 UTC. */
  minute: string;
  /** Requests per latency bin, in the order of `LATENCY_BINS`. */
  counts: number[];
}

/** The latency bins: 60 bins of 10 ms from 0 to 600 ms, by their centres. */
export const LATENCY_BINS = { start: 5, step: 10, count: 60 };

export const latencyMinutes: LatencyMinute[] = (() => {
  const rand = random(7);
  const gauss = normal(rand);
  const start = Date.UTC(2026, 10, 13, 9, 0);
  return Array.from({ length: 180 }, (_, i) => {
    const counts = new Array<number>(LATENCY_BINS.count).fill(0);
    const requests = Math.round(700 + 250 * Math.sin(i / 28));
    const slow = i > 70 && i < 115 ? 0.45 * Math.sin(((i - 70) / 45) * Math.PI) : 0;
    const spread = 0.26 + (i > 140 ? 0.005 * (i - 140) : 0);
    const median = 105 + 0.2 * i;
    for (let k = 0; k < requests; k++) {
      const ms =
        rand() < slow ? 390 * Math.exp(0.13 * gauss()) : median * Math.exp(spread * gauss());
      counts[Math.min(LATENCY_BINS.count - 1, Math.floor(ms / LATENCY_BINS.step))]++;
    }
    return { minute: new Date(start + i * 60_000).toISOString(), counts };
  });
})();
