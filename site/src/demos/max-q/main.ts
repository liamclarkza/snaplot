/**
 * "When does the rocket hit Max-Q?" (max-q), in plain TypeScript: a simulated launch replayed as
 * live telemetry, in the manner of a launch webcast's mission display.
 *
 * `flight.ts` flies the whole mission up front (about 40 ms); the replay then streams its frames
 * into four charts with `appendData` as the mission clock runs, at 1×, 10× or 50×. The three time
 * charts share a group, so a pointer on one reads all three, and the telemetry readings follow the
 * pointer, or the clock when there is none. The axes are fixed to the whole flight, so the traces
 * draw into a still frame like an instrument's. `?t=end` (and reduced motion) opens on the finished
 * flight.
 */
import {
  type ChartGroup,
  type ChartHandle,
  type ChartOptions,
  type ChartPlugin,
  createChart,
  createChartGroup,
  type ThemeTokens,
} from 'snaplot';
import { clock, format, headline, highlights, summarize } from './answer';
import { type BoosterPoint, type FlightEvent, type Frame, fly } from './flight';

export const COLOR = {
  altitude: '#4cc9f0',
  speed: '#f1f5f9',
  q: '#ff8a3d',
  accel: '#c4f25a',
  throttle: '#7c8799',
  booster: '#a78bfa',
  event: '#4b5567',
  karman: '#566079',
} as const;

const THEME: ThemeTokens = {
  mode: 'dark',
  surface: '#0b101b',
  text: '#e6ebf3',
  muted: '#7d889b',
  accent: '#e6ebf3',
  fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
  fontSize: 11,
};

const SPEEDS = [1, 10, 50] as const;
const DEFAULT_SPEED = 10;

/** `m:ss` from seconds, for the time axes. */
const minutes = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

/**
 * The live head: a glowing dot at the newest point of a trace while the replay runs, drawn
 * through the public `chart.scale()` mapping. `at()` gives that point, or null for none.
 */
function liveHead<Row>(
  id: string,
  colour: string,
  at: () => { x: number; y: number; yAxis?: string } | null,
): ChartPlugin<Row> {
  return {
    id,
    drawAbove(context, chart, plot) {
      const point = at();
      const x = chart.scale('x');
      const y = chart.scale(point?.yAxis ?? 'y');
      if (!point || !x || !y) return;
      const px = x.toPixel(point.x);
      const py = y.toPixel(point.y);
      if (px < plot.left - 1 || px > plot.left + plot.width + 1) return;
      context.save();
      context.fillStyle = colour;
      context.shadowColor = colour;
      context.shadowBlur = 12;
      context.beginPath();
      context.arc(px, py, 4, 0, Math.PI * 2);
      context.fill();
      context.restore();
    },
  };
}

function part<T extends HTMLElement = HTMLElement>(root: ParentNode, name: string): T {
  const found = root.querySelector<T>(`[data-part="${name}"]`);
  if (!found) throw new Error(`max-q: no [data-part="${name}"]`);
  return found;
}

/**
 * The time charts' shared options: the whole flight on X, no tooltip, and ticks on whole minutes
 * (every other minute on a narrow chart: explicit ticks are kept as given, never thinned).
 */
function timeChart(end: number, narrow: boolean): Partial<ChartOptions<Frame>> {
  const ticks: number[] = [];
  for (let t = 0; t <= end; t += narrow ? 120 : 60) ticks.push(t);
  return {
    data: [],
    x: 't',
    axes: { x: { min: 0, max: end, ticks, format: minutes } },
    theme: THEME,
    tooltip: false,
    legend: { position: 'top' },
  };
}

export interface Demo {
  charts: {
    ascent: ChartHandle<Frame>;
    pressure: ChartHandle<Frame>;
    accel: ChartHandle<Frame>;
    trajectory: ChartHandle<Frame | BoosterPoint>;
  };
  flight: ReturnType<typeof fly>;
  replay: {
    play(): void;
    pause(): void;
    /** Jump to the end of the flight. */
    skip(): void;
    restart(): void;
    setSpeed(speed: number): void;
    readonly time: number;
  };
}

export function mount(root: HTMLElement): Demo {
  const flight = fly();
  const summary = summarize(flight);
  const { frames, events, booster } = flight;
  const end = Math.ceil(summary.seco / 10) * 10 + 10;
  const narrow = part(root, 'ascent').clientWidth < 520;
  const timeOptions = timeChart(end, narrow);
  /** The newest frame on the charts while the replay runs (null when it is over). */
  let head: Frame | null = null;

  // The charts and their group, built once at mount and again for each replay: a replay starts
  // from empty charts, and a new chart is how a streamed source starts empty again (a destroyed
  // chart leaves its group, so the old group goes with them).
  let group: ChartGroup;
  let ascent: ChartHandle<Frame>;
  let pressure: ChartHandle<Frame>;
  let accel: ChartHandle<Frame>;
  let trajectory: ChartHandle<Frame | BoosterPoint>;

  function build() {
    group = createChartGroup({ cursor: true, viewport: true });
    ascent = createChart<Frame>(part(root, 'ascent'), {
      ...timeOptions,
      group,
      series: [
        {
          id: 'altitude',
          y: 'altitude',
          label: 'Altitude',
          color: COLOR.altitude,
          lineWidth: 2,
          format: { maximumFractionDigits: 1, suffix: ' km' },
        },
        {
          id: 'speed',
          y: (f) => f.velocity * 3.6,
          label: 'Speed',
          yAxis: 'speed',
          color: COLOR.speed,
          lineWidth: 1.5,
          format: { maximumFractionDigits: 0, suffix: ' km/h' },
        },
      ],
      axes: {
        ...timeOptions.axes,
        y: { min: 0, max: 250, format: { suffix: ' km' } },
        speed: { min: 0, max: 30_000, position: 'right', format: { notation: 'compact' } },
      },
      referenceLines: [{ axis: 'y', value: 100, label: 'Kármán line', color: COLOR.karman }],
      plugins: [liveHead('head', COLOR.altitude, () => head && { x: head.t, y: head.altitude })],
      ariaLabel: 'Altitude and speed against mission time, simulated.',
    });

    pressure = createChart<Frame>(part(root, 'pressure'), {
      ...timeOptions,
      group,
      series: [
        {
          id: 'q',
          type: 'area',
          y: 'q',
          label: 'Dynamic pressure',
          color: COLOR.q,
          lineWidth: 2,
          format: { maximumFractionDigits: 1, suffix: ' kPa' },
        },
      ],
      axes: { ...timeOptions.axes, y: { min: 0, max: 40, format: { suffix: ' kPa' } } },
      legend: false,
      plugins: [liveHead('head', COLOR.q, () => head && { x: head.t, y: head.q })],
      ariaLabel: `Dynamic pressure against mission time, simulated. ${headline(summary)}`,
    });

    accel = createChart<Frame>(part(root, 'accel'), {
      ...timeOptions,
      group,
      series: [
        {
          id: 'accel',
          y: 'accel',
          label: 'Acceleration',
          color: COLOR.accel,
          lineWidth: 2,
          format: { maximumFractionDigits: 2, suffix: ' g' },
        },
        {
          id: 'throttle',
          y: (f) => f.throttle * 100,
          label: 'Throttle',
          yAxis: 'throttle',
          color: COLOR.throttle,
          dash: [4, 3],
          lineWidth: 1,
          format: { maximumFractionDigits: 0, suffix: '%' },
        },
      ],
      axes: {
        ...timeOptions.axes,
        y: { min: 0, max: 6, format: { suffix: ' g' } },
        throttle: {
          min: 0,
          max: 120,
          position: 'right',
          ticks: [0, 50, 100],
          format: { suffix: '%' },
        },
      },
      plugins: [liveHead('head', COLOR.accel, () => head && { x: head.t, y: head.accel })],
      ariaLabel: 'Sensed acceleration and throttle against mission time, simulated.',
    });

    /** The trajectory's series, the booster's with its own (empty) data. */
    const trajectorySeries = (): ChartOptions<Frame | BoosterPoint>['series'] => [
      {
        id: 'upper',
        y: 'altitude',
        label: 'Rocket',
        color: COLOR.altitude,
        lineWidth: 2,
        format: { maximumFractionDigits: 1, suffix: ' km' },
      },
      {
        id: 'booster',
        data: [],
        x: 'downrange',
        y: 'altitude',
        label: 'First stage after separation',
        color: COLOR.booster,
        dash: [5, 4],
        lineWidth: 1.5,
        format: { maximumFractionDigits: 1, suffix: ' km' },
      },
    ];
    trajectory = createChart<Frame | BoosterPoint>(part(root, 'trajectory'), {
      data: [],
      x: 'downrange',
      series: trajectorySeries(),
      axes: {
        x: { min: 0, max: 1_400, format: { suffix: ' km' } },
        y: { min: 0, max: 250, format: { suffix: ' km' } },
      },
      referenceLines: [{ axis: 'y', value: 100, label: 'Kármán line', color: COLOR.karman }],
      theme: THEME,
      tooltip: false,
      legend: { position: 'top' },
      interaction: 'readonly',
      plugins: [
        liveHead('head', COLOR.altitude, () => head && { x: head.downrange, y: head.altitude }),
      ],
      ariaLabel:
        'Altitude against distance downrange, for the rocket and the first stage, simulated.',
    });

    for (const chart of [ascent, pressure, accel]) {
      chart.on('cursor:change', (cursor) => {
        const x = cursor?.points[0]?.x;
        pointer = typeof x === 'number' && x <= time ? x : null;
        showReadout(pointer ?? time);
      });
    }
  }

  // ─── Readout ────────────────────────────────────────────────────────
  const tiles = {
    speed: part(root, 'tile-speed'),
    altitude: part(root, 'tile-altitude'),
    accel: part(root, 'tile-accel'),
    q: part(root, 'tile-q'),
    mach: part(root, 'tile-mach'),
    downrange: part(root, 'tile-downrange'),
  };
  const stageLabel = part(root, 'stage');
  const clockLabel = part(root, 'clock');
  const progress = part(root, 'progress');
  const chips = [...root.querySelectorAll<HTMLButtonElement>('[data-event]')];
  const dots = [...root.querySelectorAll<HTMLElement>('.track-dot')];
  // Each event's dot sits at its share of the flight along the track.
  for (const dot of dots)
    dot.style.setProperty('--at', String(Number(dot.dataset.t) / summary.seco));
  const readoutNote = part(root, 'readout-note');

  /** The frame at or just before a time. */
  const frameAt = (t: number): Frame => {
    let lo = 0;
    let hi = frames.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (frames[mid].t <= t) lo = mid;
      else hi = mid - 1;
    }
    return frames[lo];
  };

  let pointer: number | null = null;
  const STAGES: Record<Frame['stage'], string> = {
    'stage 1': 'Stage 1 burn',
    coast: 'Staging',
    'stage 2': 'Stage 2 burn',
    orbit: 'In orbit',
  };
  function showReadout(t: number) {
    const f = frameAt(t);
    tiles.speed.textContent = format.whole.format(f.velocity * 3.6);
    tiles.altitude.textContent = format.one.format(f.altitude);
    tiles.accel.textContent = format.twoPlaces.format(f.accel);
    tiles.q.textContent = format.one.format(f.q);
    tiles.mach.textContent = format.twoPlaces.format(f.mach);
    tiles.downrange.textContent = format.whole.format(f.downrange);
    stageLabel.textContent = STAGES[f.stage];
    readoutNote.textContent = pointer === null ? 'Live' : `At ${clock(f.t)}`;
    root.dataset.readout = pointer === null ? 'live' : 'cursor';
  }

  // ─── Replay ─────────────────────────────────────────────────────────
  let time = 0;
  let next = 0;
  let nextBooster = 0;
  let speed = DEFAULT_SPEED;
  let playing = false;
  let last = 0;
  let frameRequest = 0;
  const playButton = part<HTMLButtonElement>(root, 'play');
  const speedButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-speed]')];

  function passEvents() {
    for (const chip of chips) {
      const t = Number(chip.dataset.t);
      chip.dataset.state = t <= time ? 'passed' : 'upcoming';
    }
    for (const dot of dots)
      dot.dataset.state = Number(dot.dataset.t) <= time ? 'passed' : 'upcoming';
    const done = events.filter((e) => e.t <= time);
    const lines = (ids: FlightEvent['id'][]) =>
      done
        .filter((e) => ids.includes(e.id))
        .map((e) => ({ axis: 'x', value: e.t, label: e.label, color: COLOR.event, dash: [3, 3] }));
    pressure.update({
      referenceLines: lines(['maxq']),
      referenceRegions:
        time >= summary.bucket.from
          ? [
              {
                axis: 'x',
                from: summary.bucket.from,
                to: Math.min(time, summary.bucket.to),
                label: 'Throttle bucket',
                opacity: 0.12,
              },
            ]
          : [],
    });
    accel.update({ referenceLines: lines(['meco', 'seco']) });
  }

  let eventsPassed = -1;
  function advance(to: number) {
    time = Math.min(to, summary.seco);
    const start = next;
    while (next < frames.length && frames[next].t <= time) next++;
    if (next > start) {
      const batch = frames.slice(start, next);
      ascent.appendData(batch);
      pressure.appendData(batch);
      accel.appendData(batch);
      trajectory.appendData(batch);
    }
    const startBooster = nextBooster;
    // At SECO the replay stops; the first stage's arc runs on to the ground, so all of it shows.
    const until = time >= summary.seco ? Number.POSITIVE_INFINITY : time;
    while (nextBooster < booster.length && booster[nextBooster].t <= until) nextBooster++;
    if (nextBooster > startBooster) {
      trajectory.appendData(booster.slice(startBooster, nextBooster), { seriesId: 'booster' });
    }
    const passed = events.filter((e) => e.t <= time).length;
    if (passed !== eventsPassed) {
      eventsPassed = passed;
      passEvents();
    }
    head = time < summary.seco && next > 0 ? frames[next - 1] : null;
    clockLabel.textContent = clock(time);
    progress.style.setProperty('--progress', String(time / summary.seco));
    if (pointer === null) showReadout(time);
    if (time >= summary.seco) finish();
  }

  function tick(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    advance(time + dt * speed);
    if (playing) frameRequest = requestAnimationFrame(tick);
  }

  function setPlaying(on: boolean) {
    playing = on;
    root.dataset.state = time >= summary.seco ? 'done' : on ? 'playing' : 'paused';
    playButton.textContent = time >= summary.seco ? 'Replay' : on ? 'Pause' : 'Play';
    playButton.setAttribute('aria-pressed', String(on));
    cancelAnimationFrame(frameRequest);
    if (on) {
      last = performance.now();
      frameRequest = requestAnimationFrame(tick);
    }
  }

  function finish() {
    if (root.dataset.state === 'done') return;
    playing = false;
    cancelAnimationFrame(frameRequest);
    root.dataset.state = 'done';
    playButton.textContent = 'Replay';
    playButton.setAttribute('aria-pressed', 'false');
    for (const chip of chips) chip.disabled = false;
    // The live heads go out with the engines.
    head = null;
    for (const chart of [ascent, pressure, accel, trajectory]) chart.redraw('data');
  }

  function restart() {
    cancelAnimationFrame(frameRequest);
    time = 0;
    next = 0;
    nextBooster = 0;
    eventsPassed = -1;
    pointer = null;
    for (const chart of [ascent, pressure, accel, trajectory]) chart.destroy();
    build();
    for (const chip of chips) chip.disabled = true;
    root.dataset.state = 'paused';
    advance(0);
  }

  playButton.addEventListener('click', () => {
    if (time >= summary.seco) {
      restart();
      setPlaying(true);
    } else setPlaying(!playing);
  });
  for (const button of speedButtons) {
    button.addEventListener('click', () => {
      speed = Number(button.dataset.speed);
      for (const other of speedButtons)
        other.setAttribute('aria-pressed', String(other === button));
    });
  }
  part(root, 'skip').addEventListener('click', () => {
    advance(summary.seco);
    finish();
  });
  // After the flight, an event chip zooms the time charts to the minute around it.
  for (const chip of chips) {
    chip.addEventListener('click', () => {
      const t = Number(chip.dataset.t);
      ascent.update({ viewport: { x: [Math.max(0, t - 30), Math.min(end, t + 30)] } });
    });
  }
  part(root, 'whole').addEventListener('click', () => ascent.update({ viewport: {} }));

  part(root, 'answer').textContent = headline(summary);
  part(root, 'highlights').textContent = highlights(summary);

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const startAtEnd = new URLSearchParams(location.search).get('t') === 'end' || reduced;
  build();
  for (const chip of chips) chip.disabled = true;
  advance(0);
  if (startAtEnd) {
    advance(summary.seco);
    finish();
  } else setPlaying(true);
  root.dataset.ready = '';
  // The thumbnail hook (thumbnail.json): the charts have painted two frames later.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => document.documentElement.setAttribute('data-demo-ready', '')),
  );

  return {
    get charts() {
      return { ascent, pressure, accel, trajectory };
    },
    flight,
    replay: {
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      skip: () => {
        advance(summary.seco);
        finish();
      },
      restart,
      setSpeed: (value: number) => {
        speed = SPEEDS.includes(value as (typeof SPEEDS)[number]) ? value : DEFAULT_SPEED;
      },
      get time() {
        return time;
      },
    },
  };
}
