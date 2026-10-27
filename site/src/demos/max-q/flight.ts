/**
 * A simulated two-stage launch to low Earth orbit, for the max-q demo. No data is downloaded: the
 * page runs this model in the browser and labels every chart "Simulated".
 *
 * The vehicle is a generic kerosene two-stager sized like the published figures of a Falcon 9
 * class rocket (masses, thrust and specific impulse in `VEHICLE`). The flight is planar, over a
 * spherical, non-rotating Earth with inverse-square gravity, an exponential atmosphere and a drag
 * coefficient that peaks through the sound barrier. Guidance is a gravity turn after a short pitch
 * kick for the first stage, and a pitch program that flattens the second stage onto the horizon.
 * The first stage throttles down through the densest air (the "throttle bucket"), which is why
 * the peak dynamic pressure, Max-Q, sits where it does.
 *
 * Integration is a fixed-step RK4 at 50 Hz; `fly()` returns one telemetry row per 0.1 s and the
 * flight events. The same inputs always give the same flight.
 */

export const EARTH_RADIUS = 6_371_000;
const MU = 3.986_004_418e14;
const G0 = 9.806_65;

/** Published-figure sizing of a medium-lift kerosene two-stager (kg, N, s). */
export const VEHICLE = {
  stage1: { dry: 25_600, propellant: 395_700, thrustSl: 7_607_000, ispSl: 282, ispVac: 311 },
  /** Propellant the first stage keeps for its own landing burns; MECO comes when the rest is gone. */
  landingReserve: 30_000,
  stage2: { dry: 3_900, propellant: 92_670, thrust: 981_000, isp: 348 },
  fairing: 1_700,
  payload: 11_000,
  /** Body diameter 3.66 m. */
  area: Math.PI * 1.83 ** 2,
};

export type Stage = 'stage 1' | 'coast' | 'stage 2' | 'orbit';

/** One telemetry frame. */
export interface Frame {
  /** Seconds since liftoff. */
  t: number;
  /** Kilometres above the surface. */
  altitude: number;
  /** Speed relative to the (non-rotating) Earth, m/s. */
  velocity: number;
  /** Sensed acceleration (thrust and drag over mass), in g. */
  accel: number;
  /** Dynamic pressure ½ρv², kPa. */
  q: number;
  mach: number;
  /** Ground distance from the pad, km. */
  downrange: number;
  /** Flight-path angle above the local horizon, degrees. */
  pitch: number;
  /** Throttle of the burning engines, 0–1 (0 between burns). */
  throttle: number;
  /** Propellant left in the burning stage, 0–1. */
  propellant: number;
  stage: Stage;
}

export interface FlightEvent {
  id: 'liftoff' | 'maxq' | 'meco' | 'separation' | 'ses' | 'fairing' | 'seco';
  /** Short label for chips and reference lines. */
  label: string;
  t: number;
}

/** The first stage after separation: a ballistic arc, sampled every second. */
export interface BoosterPoint {
  t: number;
  altitude: number;
  downrange: number;
}

export interface Flight {
  frames: Frame[];
  events: FlightEvent[];
  booster: BoosterPoint[];
  /** The orbit at SECO: apoapsis and periapsis altitudes (km). */
  orbit: { apoapsis: number; periapsis: number };
}

const KICK_START = 8;
const KICK_END = 18;
const KICK_ANGLE = (4.2 * Math.PI) / 180;
/** The throttle bucket: 85% from 52 s to 76 s, ramped over 4 s either side. */
const BUCKET = { from: 52, to: 76, low: 0.85, ramp: 4 };
const SEPARATION_DELAY = 3;
const SES_DELAY = 7;
const FAIRING_ALTITUDE = 110_000;
/**
 * Second-stage steering: climb toward the target altitude at a vertical speed that shrinks as it
 * nears it (`CLIMB_TIME`), with just enough lift from the engine to hold that against gravity
 * less the "centrifugal" relief of the horizontal speed. SECO comes at circular speed.
 */
const TARGET_ALTITUDE = 210_000;
const CLIMB_TIME = 90;
/** The second stage throttles back late in its burn to hold this sensed acceleration (g). */
const STAGE2_LIMIT = 4;
const RESPONSE_TIME = 20;
const STEP = 0.02;
const FRAME = 0.1;

function density(h: number): number {
  return h > 150_000 ? 0 : 1.225 * Math.exp(-h / 8_500);
}

function speedOfSound(h: number): number {
  // Troposphere lapse to the 11 km tropopause, then the 295 m/s of the stratosphere's base.
  return h < 11_000 ? 340.3 - (45.3 * h) / 11_000 : 295;
}

/** Drag coefficient against Mach: subsonic, a transonic peak, then a supersonic fall. */
function dragCoefficient(mach: number): number {
  if (mach < 0.8) return 0.3;
  if (mach < 1.2) return 0.3 + ((mach - 0.8) / 0.4) * 0.22;
  if (mach < 2) return 0.52 - ((mach - 1.2) / 0.8) * 0.17;
  return Math.max(0.22, 0.35 - (mach - 2) * 0.03);
}

function bucketThrottle(t: number): number {
  const { from, to, low, ramp } = BUCKET;
  if (t < from - ramp || t > to + ramp) return 1;
  if (t < from) return 1 - ((t - from + ramp) / ramp) * (1 - low);
  if (t > to) return low + ((t - to) / ramp) * (1 - low);
  return low;
}

interface State {
  x: number;
  y: number;
  vx: number;
  vy: number;
  m: number;
}

interface Burn {
  thrust: number;
  isp: number;
  /** The thrust direction, a unit vector, or null for a coast. */
  direction: (s: State) => [number, number] | null;
}

function derivative(s: State, burn: Burn | null): State {
  const r = Math.hypot(s.x, s.y);
  const h = r - EARTH_RADIUS;
  const gravity = -MU / r ** 3;
  let ax = gravity * s.x;
  let ay = gravity * s.y;
  let dm = 0;
  const v = Math.hypot(s.vx, s.vy);
  const rho = density(h);
  if (v > 0 && rho > 0) {
    const drag = (0.5 * rho * v * v * dragCoefficient(v / speedOfSound(h)) * VEHICLE.area) / s.m;
    ax -= (drag * s.vx) / v;
    ay -= (drag * s.vy) / v;
  }
  if (burn) {
    const direction = burn.direction(s);
    if (direction) {
      ax += (burn.thrust / s.m) * direction[0];
      ay += (burn.thrust / s.m) * direction[1];
      dm = -burn.thrust / (burn.isp * G0);
    }
  }
  return { x: s.vx, y: s.vy, vx: ax, vy: ay, m: dm };
}

function rk4(s: State, burn: Burn | null, dt: number): State {
  const add = (a: State, b: State, k: number): State => ({
    x: a.x + b.x * k,
    y: a.y + b.y * k,
    vx: a.vx + b.vx * k,
    vy: a.vy + b.vy * k,
    m: a.m + b.m * k,
  });
  const k1 = derivative(s, burn);
  const k2 = derivative(add(s, k1, dt / 2), burn);
  const k3 = derivative(add(s, k2, dt / 2), burn);
  const k4 = derivative(add(s, k3, dt), burn);
  return {
    x: s.x + (dt / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
    y: s.y + (dt / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
    vx: s.vx + (dt / 6) * (k1.vx + 2 * k2.vx + 2 * k3.vx + k4.vx),
    vy: s.vy + (dt / 6) * (k1.vy + 2 * k2.vy + 2 * k3.vy + k4.vy),
    m: s.m + (dt / 6) * (k1.m + 2 * k2.m + 2 * k3.m + k4.m),
  };
}

/** Local up and east (downrange) unit vectors at a position. */
function frame(s: State): { up: [number, number]; east: [number, number] } {
  const r = Math.hypot(s.x, s.y);
  const up: [number, number] = [s.x / r, s.y / r];
  return { up, east: [up[1], -up[0]] };
}

/** Flight-path angle above the local horizon, radians. */
function pathAngle(s: State): number {
  const { up, east } = frame(s);
  return Math.atan2(s.vx * up[0] + s.vy * up[1], s.vx * east[0] + s.vy * east[1]);
}

/** A direction at `angle` above the local horizon. */
function atAngle(s: State, angle: number): [number, number] {
  const { up, east } = frame(s);
  return [
    Math.cos(angle) * east[0] + Math.sin(angle) * up[0],
    Math.cos(angle) * east[1] + Math.sin(angle) * up[1],
  ];
}

const groundAngle = (s: State) => Math.atan2(s.x, s.y);
const altitude = (s: State) => Math.hypot(s.x, s.y) - EARTH_RADIUS;

/** Apoapsis and periapsis altitudes (m) of the orbit through a state, from its energy. */
function orbitOf(s: State): { apoapsis: number; periapsis: number } {
  const r = Math.hypot(s.x, s.y);
  const v2 = s.vx ** 2 + s.vy ** 2;
  const a = 1 / (2 / r - v2 / MU);
  const h = s.x * s.vy - s.y * s.vx;
  const e = Math.sqrt(Math.max(0, 1 - (h * h) / (MU * a)));
  return { apoapsis: a * (1 + e) - EARTH_RADIUS, periapsis: a * (1 - e) - EARTH_RADIUS };
}

/** Fly the mission: telemetry every 0.1 s from liftoff to SECO, and the flight's events. */
export function fly(): Flight {
  const { stage1, stage2, fairing, payload } = VEHICLE;
  const upper = stage2.dry + stage2.propellant + fairing + payload;
  let s: State = { x: 0, y: EARTH_RADIUS, vx: 0, vy: 0, m: stage1.dry + stage1.propellant + upper };
  const frames: Frame[] = [];
  const events: FlightEvent[] = [{ id: 'liftoff', label: 'Liftoff', t: 0 }];
  let t = 0;
  let stage: Stage = 'stage 1';
  let mecoAt = Number.NaN;
  let sesAt = Number.NaN;
  let fairingOn = true;
  let propellant = stage1.propellant - VEHICLE.landingReserve;
  let maxQ = { q: 0, t: 0 };
  let booster: State | null = null;
  const boosterPath: BoosterPoint[] = [];
  let nextFrame = 0;
  let nextBooster = 0;

  const stage1Burn = (throttle: number): Burn => {
    const p = Math.exp(-altitude(s) / 8_500);
    return {
      thrust:
        throttle *
        (stage1.thrustSl + (1 - p) * (stage1.thrustSl * (stage1.ispVac / stage1.ispSl - 1))),
      isp: stage1.ispSl * p + stage1.ispVac * (1 - p),
      direction: (state) => {
        if (t < KICK_START) return frame(state).up;
        if (t < KICK_END)
          return atAngle(
            state,
            Math.PI / 2 - (KICK_ANGLE * (t - KICK_START)) / (KICK_END - KICK_START),
          );
        // The gravity turn: thrust along the velocity.
        const v = Math.hypot(state.vx, state.vy);
        return [state.vx / v, state.vy / v];
      },
    };
  };
  const stage2Burn = (): Burn => ({
    thrust: Math.min(stage2.thrust, STAGE2_LIMIT * G0 * s.m),
    isp: stage2.isp,
    direction: (state) => {
      const { up, east } = frame(state);
      const r = Math.hypot(state.x, state.y);
      const vUp = state.vx * up[0] + state.vy * up[1];
      const vEast = state.vx * east[0] + state.vy * east[1];
      const wanted = (TARGET_ALTITUDE - altitude(state)) / CLIMB_TIME;
      const needed = (wanted - vUp) / RESPONSE_TIME + MU / r ** 2 - vEast ** 2 / r;
      const ratio = Math.max(-0.5, Math.min(0.9, needed / (stage2.thrust / state.m)));
      return atAngle(state, Math.asin(ratio));
    },
  });

  const record = (throttle: number, accel: number) => {
    const h = altitude(s);
    const v = Math.hypot(s.vx, s.vy);
    const q = 0.5 * density(h) * v * v;
    frames.push({
      t: Math.round(t * 10) / 10,
      altitude: h / 1000,
      velocity: v,
      accel: accel / G0,
      q: q / 1000,
      mach: v / speedOfSound(h),
      downrange: (groundAngle(s) * EARTH_RADIUS) / 1000,
      pitch: (pathAngle(s) * 180) / Math.PI,
      throttle,
      propellant:
        stage === 'stage 2'
          ? propellant / stage2.propellant
          : stage === 'stage 1'
            ? (propellant + VEHICLE.landingReserve) / stage1.propellant
            : 0,
      stage,
    });
  };

  while (t < 900) {
    let burn: Burn | null = null;
    let throttle = 0;
    if (stage === 'stage 1') {
      throttle = bucketThrottle(t);
      burn = stage1Burn(throttle);
    } else if (stage === 'stage 2') {
      burn = stage2Burn();
      throttle = burn.thrust / stage2.thrust;
    }
    // Sensed acceleration: everything but gravity.
    const d = derivative(s, burn);
    const r = Math.hypot(s.x, s.y);
    const sensed = Math.hypot(d.vx + (MU / r ** 3) * s.x, d.vy + (MU / r ** 3) * s.y);
    if (t + 1e-9 >= nextFrame) {
      record(throttle, sensed);
      nextFrame += FRAME;
    }
    const q = 0.5 * density(altitude(s)) * (s.vx ** 2 + s.vy ** 2);
    if (q > maxQ.q) maxQ = { q, t };

    const before = s.m;
    s = rk4(s, burn, STEP);
    if (burn) propellant -= before - s.m;
    if (booster) {
      booster = rk4(booster, null, STEP);
      if (t >= nextBooster && altitude(booster) > 0) {
        boosterPath.push({
          t: Math.round(t),
          altitude: altitude(booster) / 1000,
          downrange: (groundAngle(booster) * EARTH_RADIUS) / 1000,
        });
        nextBooster += 1;
      }
    }
    t += STEP;

    if (stage === 'stage 1' && propellant <= 0) {
      stage = 'coast';
      mecoAt = t;
      events.push({ id: 'meco', label: 'MECO', t });
      propellant = stage2.propellant;
    } else if (stage === 'coast' && t >= mecoAt + SEPARATION_DELAY && !booster) {
      booster = { ...s, m: stage1.dry + VEHICLE.landingReserve };
      nextBooster = Math.ceil(t);
      s = { ...s, m: upper };
      events.push({ id: 'separation', label: 'Stage sep', t });
    } else if (stage === 'coast' && t >= mecoAt + SEPARATION_DELAY + SES_DELAY) {
      stage = 'stage 2';
      sesAt = t;
      events.push({ id: 'ses', label: 'SES-1', t });
    } else if (stage === 'stage 2') {
      if (fairingOn && altitude(s) >= FAIRING_ALTITUDE) {
        fairingOn = false;
        s = { ...s, m: s.m - fairing };
        events.push({ id: 'fairing', label: 'Fairing sep', t });
      }
      const r = Math.hypot(s.x, s.y);
      if (propellant <= 0 || (t > sesAt + 30 && Math.hypot(s.vx, s.vy) >= Math.sqrt(MU / r))) {
        stage = 'orbit';
        events.push({ id: 'seco', label: 'SECO', t });
        // The shutdown frame replaces a frame already taken at this tenth of a second.
        if (frames.at(-1)?.t === Math.round(t * 10) / 10) frames.pop();
        record(0, 0);
        break;
      }
    }
  }
  // The first stage's arc runs on after SECO, down to the ground.
  while (booster && altitude(booster) > 0) {
    booster = rk4(booster, null, STEP);
    t += STEP;
    if (t >= nextBooster) {
      boosterPath.push({
        t: Math.round(t),
        altitude: Math.max(0, altitude(booster)) / 1000,
        downrange: (groundAngle(booster) * EARTH_RADIUS) / 1000,
      });
      nextBooster += 1;
    }
  }
  events.splice(1, 0, { id: 'maxq', label: 'Max-Q', t: maxQ.t });
  events.sort((a, b) => a.t - b.t);
  const orbit = orbitOf(s);
  return {
    frames,
    events: events.map((e) => ({ ...e, t: Math.round(e.t * 10) / 10 })),
    booster: boosterPath,
    orbit: { apoapsis: orbit.apoapsis / 1000, periapsis: orbit.periapsis / 1000 },
  };
}
