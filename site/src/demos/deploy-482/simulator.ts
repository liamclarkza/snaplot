/**
 * A seeded simulator of a small web service, for "Did deploy #482 cause the p99 spike?" (plan
 * §10.2, S2) and the homepage hero. Every page that shows it labels it "Simulated service".
 *
 * Model (also in site/public/data/deploy-482/SOURCE.md):
 * - each endpoint is its own pool of `servers` workers fed by Poisson arrivals (`rate` requests/s,
 *   with a slow ±8% swell) in first-come-first-served order;
 * - service times are log-normal (`medianMs`, `sigma`), so each pool is an M/G/c queue;
 * - each pool has stop-the-world GC pauses: Poisson, one every `gcEverySeconds` on average,
 *   log-normal length; a pause delays every request in service and every start;
 * - a request fails when its latency exceeds the 1 s timeout, or at the endpoint's base error rate;
 * - deploy #481 at t0 + 6 min changes nothing; deploy #482 at t0 + 18 min adds an N+1 query to
 *   `/search`: one extra database call (log-normal, median 4 ms) per result item, 1 + Poisson(22)
 *   items per request. That takes the pool to about 92% busy (99% at the top of the traffic
 *   swell, around t0 + 22 min, when timeouts break the 1% error SLO). `rollback()` removes the
 *   N+1 from the next request on;
 * - each endpoint draws from its own random stream (mulberry32, seeded from `seed` and the
 *   endpoint), so a change to one endpoint never perturbs another.
 * Buckets are one simulated second per endpoint, keyed by arrival time; p50, p95 and p99 are true
 * nearest-rank percentiles of that bucket's latencies.
 */

export interface EndpointSpec {
  name: string;
  /** Mean arrivals per second. */
  rate: number;
  servers: number;
  /** Log-normal service time: median (ms) and shape. */
  medianMs: number;
  sigma: number;
  /** Fraction of requests that fail regardless of latency. */
  baseErrorRate: number;
  gcEverySeconds: number;
}

export const ENDPOINTS: readonly EndpointSpec[] = [
  {
    name: '/search',
    rate: 120,
    servers: 18,
    medianMs: 38,
    sigma: 0.45,
    baseErrorRate: 0.0005,
    gcEverySeconds: 40,
  },
  {
    name: '/product',
    rate: 180,
    servers: 12,
    medianMs: 14,
    sigma: 0.4,
    baseErrorRate: 0.0003,
    gcEverySeconds: 55,
  },
  {
    name: '/cart',
    rate: 45,
    servers: 8,
    medianMs: 30,
    sigma: 0.35,
    baseErrorRate: 0.0004,
    gcEverySeconds: 60,
  },
  {
    name: '/checkout',
    rate: 20,
    servers: 8,
    medianMs: 110,
    sigma: 0.3,
    baseErrorRate: 0.001,
    gcEverySeconds: 70,
  },
];

export const TIMEOUT_MS = 1000;
/** The error-rate SLO the error chart draws (1%). */
export const ERROR_SLO = 0.01;
export const DEFAULT_SEED = 482;
/** t0: 02:50 UTC; #482 lands at 03:08 and the on-call engineer is paged at 03:12. */
export const START = Date.UTC(2025, 2, 14, 2, 50, 0);

export interface Deploy {
  id: string;
  /** Epoch ms. */
  time: number;
  label: string;
  kind: 'deploy' | 'rollback';
  /** Whether requests to /search after this deploy run the N+1 query. */
  nPlusOne: boolean;
}

/** The scheduled deploys of a run that starts at `start`. */
export function scheduledDeploys(start = START): Deploy[] {
  return [
    {
      id: '#481',
      time: start + 6 * 60_000,
      label: '#481 cache headers',
      kind: 'deploy',
      nPlusOne: false,
    },
    {
      id: '#482',
      time: start + 18 * 60_000,
      label: '#482 search facets',
      kind: 'deploy',
      nPlusOne: true,
    },
  ];
}

export interface Bucket {
  /** Start of the one-second bucket, epoch ms. */
  time: number;
  endpoint: string;
  requests: number;
  errors: number;
  /** Nearest-rank percentiles of this bucket's latencies, ms (NaN without requests). */
  p50: number;
  p95: number;
  p99: number;
  /** The bucket's latencies in arrival order, when the simulator keeps samples. */
  samples?: Float64Array;
}

export interface SimulatorOptions {
  seed?: number;
  start?: number;
  /** Keep every bucket's latencies (for histograms and the oracle). Off by default. */
  keepSamples?: boolean;
}

export interface Simulator {
  readonly seed: number;
  readonly start: number;
  /** Start of the next bucket, epoch ms. */
  readonly now: number;
  /** Deploys that have happened, scheduled ones and rollbacks, in time order. */
  readonly deploys: readonly Deploy[];
  /** Simulate one second; returns one bucket per endpoint, in ENDPOINTS order. */
  step(): Bucket[];
  /** Roll back #482 at the current time (a no-op when /search has no N+1). */
  rollback(): Deploy | null;
}

/** mulberry32: a small, fast, seeded PRNG with floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed from `?seed=<n>` (any integer), or DEFAULT_SEED. */
export function parseSeed(search: string): number {
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null || !/^-?\d+$/.test(raw.trim())) return DEFAULT_SEED;
  return Number(raw) >>> 0;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The k-th smallest value (0-based) of a[0..n), by Hoare selection; reorders `a`. The test checks
 * it against a full sort.
 */
function select(a: Float64Array, n: number, k: number): number {
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const pivot = a[(lo + hi) >>> 1];
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (a[i] < pivot) i++;
      while (a[j] > pivot) j--;
      if (i <= j) {
        const t = a[i];
        a[i] = a[j];
        a[j] = t;
        i++;
        j--;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else return a[k];
  }
  return a[k];
}

/** Nearest-rank percentile: the value at rank ⌈p·n⌉. */
const rank = (p: number, n: number) => Math.max(0, Math.ceil(p * n) - 1);

class Pool {
  readonly spec: EndpointSpec;
  private readonly rnd: () => number;
  private readonly free: Float64Array;
  private nextArrival: number;
  private nextGc: number;
  /** Pauses that may still delay work: [start, end) pairs in ms since t0. */
  private pauses: number[] = [];
  private buf = new Float64Array(512);
  private scratch = new Float64Array(512);

  constructor(spec: EndpointSpec, seed: number) {
    this.spec = spec;
    this.rnd = mulberry32(seed ^ hash(spec.name));
    this.free = new Float64Array(spec.servers);
    this.nextArrival = this.exp(1000 / spec.rate);
    this.nextGc = this.exp(spec.gcEverySeconds * 1000);
  }

  private exp(mean: number): number {
    return -Math.log(1 - this.rnd()) * mean;
  }

  private normal(): number {
    const u = 1 - this.rnd();
    const v = this.rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  private logNormal(median: number, sigma: number): number {
    return median * Math.exp(sigma * this.normal());
  }

  private poisson(mean: number): number {
    const limit = Math.exp(-mean);
    let k = 0;
    let p = this.rnd();
    while (p > limit) {
      k++;
      p *= this.rnd();
    }
    return k;
  }

  /** Simulate arrivals in [from, from + 1000) ms since t0. */
  bucket(
    from: number,
    nPlusOne: (t: number) => boolean,
    keep: boolean,
  ): Omit<Bucket, 'time' | 'endpoint'> {
    const to = from + 1000;
    const spec = this.spec;
    while (this.nextGc < to + 2 * TIMEOUT_MS) {
      const length = Math.min(800, this.logNormal(120, 0.5));
      this.pauses.push(this.nextGc, this.nextGc + length);
      this.nextGc += this.exp(spec.gcEverySeconds * 1000);
    }
    let n = 0;
    let errors = 0;
    while (this.nextArrival < to) {
      const arrival = this.nextArrival;
      const swell = 1 + 0.08 * Math.sin((2 * Math.PI * arrival) / 600_000);
      this.nextArrival += this.exp(1000 / (spec.rate * swell));
      let service = this.logNormal(spec.medianMs, spec.sigma);
      if (nPlusOne(arrival)) {
        const items = 1 + this.poisson(22);
        for (let i = 0; i < items; i++) service += this.logNormal(4, 0.3);
      }
      // The earliest-free worker takes the request (FCFS).
      let w = 0;
      for (let i = 1; i < this.free.length; i++) if (this.free[i] < this.free[w]) w = i;
      let start = Math.max(arrival, this.free[w]);
      let end = start + service;
      for (let p = 0; p < this.pauses.length; p += 2) {
        const [ps, pe] = [this.pauses[p], this.pauses[p + 1]];
        if (start >= ps && start < pe) {
          end += pe - start;
          start = pe;
        } else if (ps > start && ps < end) end += pe - ps;
      }
      this.free[w] = end;
      const latency = end - arrival;
      if (latency > TIMEOUT_MS || this.rnd() < spec.baseErrorRate) errors++;
      if (n === this.buf.length) {
        const grown = new Float64Array(n * 2);
        grown.set(this.buf);
        this.buf = grown;
        this.scratch = new Float64Array(n * 2);
      }
      this.buf[n++] = latency;
    }
    // Later requests arrive (and so start) at or after `to`: pauses over by then cannot matter.
    let keepFrom = 0;
    while (keepFrom < this.pauses.length && this.pauses[keepFrom + 1] <= to) keepFrom += 2;
    if (keepFrom > 0) this.pauses = this.pauses.slice(keepFrom);

    const s = this.scratch;
    s.set(this.buf.subarray(0, n));
    const pick = (p: number) => (n === 0 ? Number.NaN : select(s, n, rank(p, n)));
    const p99 = pick(0.99);
    const p95 = pick(0.95);
    const p50 = pick(0.5);
    return {
      requests: n,
      errors,
      p50,
      p95,
      p99,
      ...(keep ? { samples: this.buf.slice(0, n) } : {}),
    };
  }
}

export function createSimulator(options: SimulatorOptions = {}): Simulator {
  const seed = (options.seed ?? DEFAULT_SEED) >>> 0;
  const start = options.start ?? START;
  const keep = options.keepSamples ?? false;
  const pools = ENDPOINTS.map((e) => new Pool(e, seed));
  const scheduled = scheduledDeploys(start);
  const deploys: Deploy[] = [];
  let pending = 0;
  let elapsed = 0;
  /** Times (ms since t0) at which /search switches the N+1 on or off. */
  const switches: { at: number; on: boolean }[] = [];
  const nPlusOne = (t: number) => {
    let on = false;
    for (const s of switches) if (t >= s.at) on = s.on;
    return on;
  };
  const searchHasN1 = () => switches.length > 0 && switches[switches.length - 1].on;

  return {
    seed,
    start,
    get now() {
      return start + elapsed;
    },
    get deploys() {
      return deploys;
    },
    step() {
      const from = elapsed;
      while (pending < scheduled.length && scheduled[pending].time < start + from + 1000) {
        const d = scheduled[pending++];
        deploys.push(d);
        if (d.nPlusOne) switches.push({ at: d.time - start, on: true });
      }
      const out = pools.map((pool) => ({
        time: start + from,
        endpoint: pool.spec.name,
        ...pool.bucket(from, pool.spec.name === '/search' ? nPlusOne : () => false, keep),
      }));
      elapsed += 1000;
      return out;
    },
    rollback() {
      if (!searchHasN1()) return null;
      const d: Deploy = {
        id: `#${483 + deploys.filter((x) => x.kind === 'rollback').length}`,
        time: start + elapsed,
        label: 'Rollback of #482',
        kind: 'rollback',
        nPlusOne: false,
      };
      deploys.push(d);
      switches.push({ at: elapsed, on: false });
      return d;
    },
  };
}
