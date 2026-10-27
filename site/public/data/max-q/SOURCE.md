# Max-Q: data source

Demo `max-q`. A simulated two-stage launch to low Earth orbit; there is no external data, and the page labels the flight "Simulated".

## Source

- Simulated: `site/src/demos/max-q/flight.ts`. No data files are downloaded or bundled; the browser flies the mission (about 40 ms) and replays it.

## Licence

MIT

- The model is code in this repository, MIT like the repository; its output is generated on the page.

## Attribution

Simulated launch (snaplot max-q flight model)

## Retrieved

n/a (simulated)

## Regenerate

```sh
# No data files: the page flies the same deterministic mission on every load.
npx vitest run --dir site/src/demos/max-q   # the model checks and the golden numbers
```

## Rows

- One telemetry frame per 0.1 s from liftoff to SECO: 4,652 frames.
- Each frame: `t` (s), `altitude` (km), `velocity` (m/s), `accel` (sensed, g), `q` (dynamic pressure, kPa), `mach`, `downrange` (km), `pitch` (flight-path angle, °), `throttle` and `propellant` (0–1), `stage`.
- The first stage after separation: one point per second of its ballistic arc to the ground, 381 points.

## Files

None.

## Raw downloads (SHA-256)

None.

## Model

- Vehicle, sized like the published figures of a Falcon 9 class kerosene two-stager: first stage 25.6 t dry and 395.7 t of propellant, 7.6 MN at sea level (Isp 282 s, 311 s in vacuum), keeping 30 t for its own landing; second stage 3.9 t dry and 92.7 t of propellant, 981 kN (Isp 348 s); a 1.7 t fairing and an 11 t payload. Diameter 3.66 m.
- Physics: a planar flight over a spherical, non-rotating Earth (radius 6,371 km, inverse-square gravity), an exponential atmosphere (1.225 kg/m³ at the surface, 8.5 km scale height), a drag coefficient of 0.30 subsonic that peaks at 0.52 at Mach 1.2. Fixed-step RK4 at 50 Hz.
- Guidance: vertical for 8 s, a 4.2° pitch kick over 10 s, then a gravity turn. The first stage throttles to 85% from T+52 s to T+76 s (the throttle bucket). MECO when its ascent propellant is gone, separation 3 s later and second-stage ignition (SES-1) 7 s after that; the fairing goes at 110 km. The second stage climbs toward 210 km at a vertical speed that shrinks as it nears it, throttles back to hold 4 g, and shuts down (SECO) at circular speed.
- The default flight: **"Max-Q comes at T+00:53, 8.6 km up at Mach 1.26: 32.9 kPa, with the engines throttled to 85% to get through it."** MECO at T+02:17 (5.2 g), SECO at T+07:45 in a 201 × 220 km orbit.

## Oracle

- `flight.test.ts`: the same mission twice gives identical frames; energy and orbit checks (SECO speed equals circular speed at its altitude within 0.5%, the orbit's periapsis above 180 km); dynamic pressure recomputed from each frame's altitude and speed; the throttle bucket and the event order.
- `answer.test.ts`: Max-Q, the peak acceleration and the staging times recounted from the frames without `answer.ts`, and the golden headline.

## Design reference

A launch webcast's mission display: near-black space, a large mission clock, telemetry readouts in a monospaced face, the flight events along a timeline, and one colour per instrument (altitude cyan, speed white, dynamic pressure orange, acceleration lime).
