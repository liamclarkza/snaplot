/**
 * "Was 2024 the hottest year on record?" (hottest-year), in plain TypeScript, from the ERA5 daily
 * global mean temperature.
 *
 * Three views of the same 31,000 days:
 * - the warming stripes: a stripe per year coloured by its anomaly, drawn by a plugin through the
 *   public `chart.scale()` mapping under a line of the anomalies themselves;
 * - every year's daily temperature as one line on a shared calendar, coloured like its stripe,
 *   with the chosen year highlighted (`highlight`, so the rest dim) and the 1991–2020 mean dashed;
 * - the ten warmest years as bars.
 * A click on a stripe or a bar, or the year menu, chooses the year the lines highlight.
 */
import {
  type ChartHandle,
  type ChartPlugin,
  type ChartPoint,
  createChart,
  type ThemeTokens,
} from 'snaplot';
import {
  calendarIndex,
  days,
  detail,
  formats,
  headline,
  longDate,
  parseDaily,
  type Summary,
  summarize,
  type Year,
} from './answer';

/** The warming-stripes ramp (ColorBrewer RdBu), coolest to warmest. */
const STRIPES = [
  '#08306b',
  '#08519c',
  '#2171b5',
  '#4292c6',
  '#6baed6',
  '#9ecae1',
  '#c6dbef',
  '#deebf7',
  '#fee0d2',
  '#fcbba1',
  '#fc9272',
  '#fb6a4a',
  '#ef3b2c',
  '#cb181d',
  '#a50f15',
  '#67000d',
];
/** The anomaly at each end of the ramp, °C. */
const SPAN = 0.75;

/** A year's stripe colour, from its anomaly. */
export function stripe(anomaly: number): string {
  const share = (Math.max(-SPAN, Math.min(SPAN, anomaly)) + SPAN) / (2 * SPAN);
  return STRIPES[Math.min(STRIPES.length - 1, Math.floor(share * STRIPES.length))];
}

const THEME: ThemeTokens = {
  mode: 'light',
  surface: '#f7f3ea',
  text: '#15171c',
  muted: '#5c6170',
  accent: '#15171c',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 11,
};

const year4 = (value: number) => String(Math.round(value));

function part<T extends HTMLElement = HTMLElement>(root: ParentNode, name: string): T {
  const found = root.querySelector<T>(`[data-part="${name}"]`);
  if (!found) throw new Error(`hottest-year: no [data-part="${name}"]`);
  return found;
}

/** The stripes, a rectangle per year across the plot's height, under the anomaly line. */
function stripesPlugin(years: readonly Year[]): ChartPlugin<Year> {
  return {
    id: 'stripes',
    drawBelow(context, chart, plot) {
      const x = chart.scale('x');
      if (!x) return;
      context.save();
      for (const y of years) {
        const left = x.toPixel(y.year - 0.5);
        const right = x.toPixel(y.year + 0.5);
        context.fillStyle = stripe(y.anomaly);
        // A hair wider than the slot, so neighbouring stripes meet without a seam.
        context.fillRect(left, plot.top, right - left + 0.5, plot.height);
      }
      context.restore();
    },
  };
}

/** One row per calendar day, its x a date in 2024 (a leap year), with every year's value. */
type CalendarRow = { date: string; normal: number } & Record<string, number | string | null>;

function calendarRows(all: ReturnType<typeof days>, climatology: readonly number[]): CalendarRow[] {
  const rows: CalendarRow[] = [];
  for (let i = 0; i < 366; i++) {
    const date = new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10);
    rows.push({ date, normal: climatology[i] });
  }
  for (const d of all) rows[calendarIndex(d.date)][`y${d.date.slice(0, 4)}`] = d.temp;
  return rows;
}

/** A ranked year, labelled for its category slot. */
type RankRow = Year & { label: string };

export interface Demo {
  stripes: ChartHandle<Year>;
  lines: ChartHandle<CalendarRow>;
  warmest: ChartHandle<RankRow>;
  summary: Summary;
  choose(year: number): void;
}

export async function mount(root: HTMLElement): Promise<Demo> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/hottest-year/daily.json`);
  if (!response.ok) throw new Error(`hottest-year: daily.json answered ${response.status}`);
  const file = parseDaily(await response.text());
  const all = days(file);
  const summary = summarize(all);
  const { years, ranked, recordsHeld } = summary;
  const first = years[0].year;
  const lastYear = years[years.length - 1].year;
  const current = summary.current;

  const yearTip = (y: Year) => {
    const lines = [
      `${y.year}${y.partial ? ' so far' : ''}`,
      `${formats.two.format(y.mean)} °C, ${formats.signed.format(y.anomaly)} °C against 1991–2020`,
    ];
    const held = recordsHeld.get(y.year);
    if (held) lines.push(`Warmest on record for ${held} date${held === 1 ? '' : 's'}`);
    return lines;
  };
  const tip = (lines: readonly string[]) => {
    const box = document.createElement('div');
    box.className = 'tip';
    for (const [i, text] of lines.entries()) {
      const p = document.createElement('p');
      if (i === 0) p.className = 'tip-head';
      p.textContent = text;
      box.append(p);
    }
    return box;
  };

  // ─── The stripes ────────────────────────────────────────────────────
  const stripes = createChart<Year>(part(root, 'stripes'), {
    data: years,
    x: 'year',
    series: [
      {
        id: 'anomaly',
        y: 'anomaly',
        label: 'Anomaly',
        color: '#ffffff',
        lineWidth: 1.5,
      },
    ],
    axes: {
      x: {
        min: first - 0.5,
        max: lastYear + 0.5,
        ticks: [1940, 1960, 1980, 2000, 2020],
        format: year4,
        grid: false,
      },
      y: {
        min: -1,
        max: 1,
        // Three labels fit a wide banner; a phone's shorter one keeps the two either side of 0.
        ticks: part(root, 'stripes').clientWidth < 520 ? [-0.5, 0.5] : [-0.5, 0, 0.5],
        grid: false,
        format: (v) =>
          `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1).replace(/\.0$/, '')} °C`,
      },
    },
    plugins: [stripesPlugin(years)],
    legend: false,
    theme: THEME,
    interaction: { zoom: 'none' },
    tooltip: {
      mode: 'nearest',
      render: (points) => tip(points[0]?.row ? yearTip(points[0].row) : []),
    },
    ariaLabel: `Warming stripes: each year from ${first} to ${lastYear} coloured by its global mean temperature against 1991–2020, with the anomalies as a line.`,
  });

  // ─── Every year on one calendar ─────────────────────────────────────
  const rows = calendarRows(all, file.climatology);
  const yearSeries = years.map((y) => ({
    id: `y${y.year}`,
    y: (row: CalendarRow) => {
      const value = row[`y${y.year}`];
      return typeof value === 'number' ? value : null;
    },
    label: y.partial ? `${y.year} so far` : String(y.year),
    color: stripe(y.anomaly),
    lineWidth: y.year === 2024 || y.partial ? 2 : 1,
    spanGaps: true,
  }));
  const pointTip = (points: readonly ChartPoint<CalendarRow>[]) => {
    const row = points.find((p) => p.row)?.row;
    if (!row) return tip([]);
    const md = new Date(`${row.date}T00:00:00Z`).toLocaleDateString('en-GB', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'long',
    });
    const value = (y: number) => {
      const v = row[`y${y}`];
      return typeof v === 'number' ? `${formats.two.format(v)} °C` : 'no data yet';
    };
    const lines = [md, `${chosen}: ${value(chosen)}`];
    if (chosen !== 2024) lines.push(`2024: ${value(2024)}`);
    if (current && chosen !== current.year) lines.push(`${current.year}: ${value(current.year)}`);
    lines.push(`1991–2020 mean: ${formats.two.format(row.normal)} °C`);
    return tip(lines);
  };
  const lines = createChart<CalendarRow>(part(root, 'lines'), {
    data: rows,
    x: 'date',
    series: [
      ...yearSeries,
      {
        id: 'normal',
        y: 'normal',
        label: '1991–2020 mean',
        color: '#15171c',
        dash: [4, 3],
        lineWidth: 1.25,
      },
    ],
    axes: {
      x: { type: 'time', format: { month: 'short' } },
      y: { format: { maximumFractionDigits: 1, suffix: ' °C' } },
    },
    timeZone: 'UTC',
    legend: false,
    theme: THEME,
    highlight: 'y2024',
    tooltip: { render: pointTip },
    ariaLabel: `The daily global mean temperature of every year from ${first} to ${lastYear} on one calendar, coloured by how warm the year was. ${headline(summary)}`,
  });

  // ─── The warmest ten ────────────────────────────────────────────────
  const top = ranked.slice(0, 10);
  // A phone's ten slots are too narrow for four digits: '24, '23, … so every bar keeps its year.
  const short = part(root, 'warmest').clientWidth < 520;
  const warmest = createChart<RankRow>(part(root, 'warmest'), {
    data: top.map((y) => ({ ...y, label: short ? `’${String(y.year).slice(2)}` : String(y.year) })),
    x: 'label',
    series: [
      {
        id: 'anomaly',
        type: 'bar',
        y: 'anomaly',
        label: 'Against 1991–2020',
        // The record year in the darkest stripe red, the other nine in one muted red.
        color: (_, row) => (row?.year === summary.warmest.year ? '#a50f15' : '#e8a598'),
        format: { maximumFractionDigits: 2, signDisplay: 'exceptZero', suffix: ' °C' },
      },
    ],
    axes: {
      x: { type: 'category' },
      y: { format: { maximumFractionDigits: 1, signDisplay: 'exceptZero', suffix: ' °C' } },
    },
    legend: false,
    theme: THEME,
    interaction: 'readonly',
    tooltip: { render: (points) => tip(points[0]?.row ? yearTip(points[0].row) : []) },
    ariaLabel: `The ten warmest complete years against the 1991–2020 average: ${top
      .map((y) => `${y.year} ${formats.signed.format(y.anomaly)} °C`)
      .join(', ')}.`,
  });

  // ─── Choosing a year ────────────────────────────────────────────────
  let chosen = 2024;
  const menu = part<HTMLSelectElement>(root, 'year');
  for (const y of [...years].reverse()) {
    const option = document.createElement('option');
    option.value = String(y.year);
    option.textContent = y.partial ? `${y.year} (so far)` : String(y.year);
    menu.append(option);
  }
  const chosenNote = part(root, 'chosen');
  function choose(year: number) {
    const y = years.find((candidate) => candidate.year === year);
    if (!y) return;
    chosen = year;
    menu.value = String(year);
    lines.update({ highlight: `y${year}` });
    chosenNote.textContent = yearTip(y).slice(1).join('. ');
    chosenNote.style.setProperty('--swatch', stripe(y.anomaly));
    root.dataset.chosen = String(year);
  }
  menu.addEventListener('change', () => choose(Number(menu.value)));
  stripes.on('point:click', (point) => choose(Math.round(Number(point.x))));
  warmest.on('point:click', (point) => {
    if (point.row) choose(point.row.year);
  });

  // ─── Words and numbers ──────────────────────────────────────────────
  part(root, 'answer').textContent = headline(summary);
  part(root, 'detail').textContent = detail(summary);
  part(root, 'stat-mean').textContent = formats.two.format(summary.warmest.mean);
  part(root, 'stat-anomaly').textContent = formats.signed.format(summary.warmest.anomaly);
  part(root, 'stat-day').textContent = formats.two.format(summary.warmestDay.temp);
  part(root, 'stat-day-date').textContent = longDate(summary.warmestDay.date);
  part(root, 'stat-records').textContent = String(recordsHeld.get(summary.warmest.year) ?? 0);
  part(root, 'through').textContent = longDate(summary.last.date);
  if (file.firstPreliminary) {
    part(root, 'preliminary').textContent =
      `Values from ${longDate(file.firstPreliminary)} are preliminary.`;
  }
  // The key's ramp: every other step of the stripes' colours.
  for (const colour of STRIPES.filter((_, i) => i % 2 === 1)) {
    const step = document.createElement('span');
    step.className = 'key-step';
    step.style.setProperty('--step', colour);
    part(root, 'ramp').append(step);
  }
  choose(2024);

  root.dataset.ready = '';
  // The thumbnail hook (thumbnail.json): the charts have painted two frames later.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => document.documentElement.setAttribute('data-demo-ready', '')),
  );
  return { stripes, lines, warmest, summary, choose };
}
