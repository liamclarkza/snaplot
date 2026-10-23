# Deploy #482: data source

Demo `deploy-482`. A seeded simulator of a small web service during an incident; there is no external data, and the page labels every chart "Simulated service".

## Source

- Simulated: `site/src/demos/deploy-482/simulator.ts` (also streamed by the homepage hero). No data files are downloaded or bundled; the browser runs the simulator.

## Licence

MIT (generated)

- The simulator is code in this repository, MIT like the repository; its output is generated on the page.

## Attribution

Simulated service (snaplot deploy-482 simulator)

## Retrieved

n/a (simulated)

## Regenerate

```sh
# No data files: the page simulates in the browser, and ?seed=<n> replays a run (default 482).
npx vitest run --dir site/src/demos/deploy-482   # the model checks, the oracle and the golden verdict
```

## Rows

- One bucket per endpoint per simulated second: 4 buckets per second, 14,400 per simulated hour, about 365 requests per simulated second in all.
- Each bucket: `time` (start, epoch ms), `endpoint`, `requests`, `errors`, `p50`, `p95`, `p99` (ms), and with `keepSamples` every latency.

## Files

None.

## Raw downloads (SHA-256)

None.

## Model

- t0 is 2025-03-14 02:50 UTC. Deploy #481 (cache headers) lands at t0 + 6 min and changes nothing. Deploy #482 (search facets) lands at t0 + 18 min (03:08) and adds an N+1 query to `/search`; the on-call engineer is paged at 03:12.
- Each endpoint is its own pool of workers with Poisson arrivals and first-come-first-served service. Service times are log-normal, so each pool is an M/G/c queue (the plan's "M/M/c" with log-normal service). Traffic swells by ±8% over a 10-minute cycle.

  | Endpoint | Requests/s | Workers | Median service | σ | Base error rate | GC pause every |
  |---|---:|---:|---:|---:|---:|---:|
  | `/search` | 120 | 18 | 38 ms | 0.45 | 0.05% | 40 s |
  | `/product` | 180 | 12 | 14 ms | 0.40 | 0.03% | 55 s |
  | `/cart` | 45 | 8 | 30 ms | 0.35 | 0.04% | 60 s |
  | `/checkout` | 20 | 8 | 110 ms | 0.30 | 0.10% | 70 s |

- GC: each pool has stop-the-world pauses, Poisson with the mean interval above and a log-normal length (median 120 ms, σ 0.5, at most 800 ms). A pause delays every request in service and every start.
- N+1: after #482 every `/search` request makes one extra database call per result item, 1 + Poisson(22) items, each call log-normal with a median of 4 ms (σ 0.3). The pool goes from about 30% to about 92% busy (99% at the top of the swell, around t0 + 22 min), so p99 doubles at once and timeouts break the 1% error SLO at the swell. `rollback()` (the page's Rollback button) removes the N+1 from the next request on; the queue drains within seconds.
- A request fails when its latency exceeds the 1 s timeout, or at the base error rate.
- Randomness: mulberry32, one stream per endpoint seeded from the run's seed and the endpoint name, so a rollback or a different deploy never perturbs another endpoint. The same seed always gives the same buckets.
- Percentiles: buckets are keyed by arrival second; p50, p95 and p99 are nearest-rank percentiles (rank ⌈p·n⌉) of that bucket's latencies, found by selection rather than sorting.

## Oracle

- `simulator.test.ts`: every bucket's p50, p95 and p99 equal a brute-force sort of its own samples (25 simulated minutes, 6,000 buckets); runs replay exactly from a seed; keeping samples does not change any number.
- `answer.test.ts`: the banner's before and after values equal medians recomputed from the buckets without `answer.ts`; #481 is cleared and #482 blamed on 11 seeds.
- Default seed (482) verdict: **"p99 on /search rose from 103 ms to 234 ms within 2 min of #482; other endpoints are unchanged, so roll back #482."** (median per-second p99, 5 minutes before against 2 minutes after: `/search` 102.6 → 233.9 ms, `/product` 35.4 → 35.2 ms, `/cart` 64.2 → 63.0 ms, `/checkout` 189.9 → 190.9 ms). #481: "p99 is unchanged on every endpoint within 2 min of #481 (largest change: /checkout −5%)."

## Design reference

A Grafana incident dashboard: dark `#111217` panels in a dense three-column grid, greys for p50 and p95, amber `#F2A33A` only for p99, red only for SLO breaches, an annotation strip for deploys across the top, Inter.
