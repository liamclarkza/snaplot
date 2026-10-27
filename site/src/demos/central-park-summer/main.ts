/**
 * "Was summer 2025 unusually hot in Central Park?" (plan §10.2, V2), in plain TypeScript.
 *
 * One long chart in the manner of the newspaper weather chart: the record range and the normal
 * range of daily highs as two band series, each day of 2025 as a bar from its low to its high, and
 * the days that set a record as red or blue dots. The bars are not a built-in mark: a 25-line
 * plugin draws them through the public `chart.scale()` mapping. The chart is read-only, and its
 * tooltip reads like a weather table.
 */
import { type ChartHandle, type ChartPlugin, type ChartPoint, createChart } from 'snaplot';
import { headline, parseSummer, recordsLine, rows, type SummerRow, summarize } from './answer';

const BAR = '#1c1b19';
const RED = '#c0392b';
const BLUE = '#2e6db4';

/** Each day's range as a bar from its low to its high, drawn under the bands' translucent fill. */
function dailyRange(days: readonly SummerRow[]): ChartPlugin<SummerRow> {
  return {
    id: 'daily-range',
    drawBelow(context, chart, plot) {
      const x = chart.scale('x');
      const y = chart.scale('y');
      if (!x || !y || days.length < 2) return;
      const step = Math.abs(x.toPixel(days[1].date) - x.toPixel(days[0].date));
      const width = Math.max(1, Math.min(6, step * 0.45));
      context.save();
      context.beginPath();
      context.rect(plot.left, plot.top, plot.width, plot.height);
      context.clip();
      context.fillStyle = BAR;
      for (const day of days) {
        const top = y.toPixel(day.high);
        context.fillRect(x.toPixel(day.date) - width / 2, top, width, y.toPixel(day.low) - top);
      }
      context.restore();
    },
  };
}

const dayFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'short',
  month: 'long',
  day: 'numeric',
});

/** The tooltip: one day as a weather table prints it, built with textContent. */
function weatherTable(points: readonly ChartPoint<SummerRow>[]): Node {
  const day = points.find((p) => p.row)?.row;
  const box = document.createElement('div');
  box.className = 'weather-tip';
  const line = (text: string) => {
    const p = document.createElement('p');
    p.textContent = text;
    box.append(p);
  };
  if (!day) return box;
  line(dayFormat.format(Date.parse(`${day.date}T00:00:00Z`)));
  line(`High ${day.high} °F, low ${day.low} °F`);
  line(`Normal high ${day.normalLow}–${day.normalHigh} °F, median ${day.normalMedian} °F`);
  line(`Record high ${day.recordHigh} °F (${day.recordHighYear})`);
  line(`Record low ${day.recordLow} °F (${day.recordLowYear})`);
  if (day.record) line(day.tie ? `Tied the record ${day.record}` : `A new record ${day.record}`);
  return box;
}

function part(root: ParentNode, name: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(`[data-part="${name}"]`);
  if (!found) throw new Error(`central-park: no [data-part="${name}"]`);
  return found;
}

/** Half a day before (-1) or after (1) a `YYYY-MM-DD` date, in epoch milliseconds (UTC). */
function dayEdge(date: string | undefined, side: -1 | 1): number | undefined {
  return date === undefined ? undefined : Date.parse(`${date}T00:00:00Z`) + side * 12 * 3_600_000;
}

export async function mount(root: HTMLElement): Promise<ChartHandle<SummerRow>> {
  const url = `${import.meta.env.BASE_URL}data/central-park-summer/summer.json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`central-park: summer.json answered ${response.status}`);
  const data = parseSummer(await response.text());
  const summer = rows(data);
  const answer = summarize(data);

  const chart = createChart(part(root, 'chart'), {
    data: summer,
    x: 'date',
    series: [
      {
        type: 'band',
        id: 'record',
        label: `Record range, ${data.recordYears.join('–')}`,
        y: 'normalMedian',
        lower: 'recordLow',
        upper: 'recordHigh',
        color: '#a19d95',
        opacity: 0.3,
        lineWidth: 0,
      },
      {
        type: 'band',
        id: 'normal',
        label: `Normal range of highs, ${data.normalYears.join('–')}`,
        y: 'normalMedian',
        lower: 'normalLow',
        upper: 'normalHigh',
        color: '#6f6b64',
        opacity: 0.35,
        lineWidth: 0,
      },
      {
        type: 'scatter',
        id: 'record-high',
        label: 'Record high',
        y: (day) => (day.record === 'high' ? day.high : null),
        color: RED,
        pointRadius: 4,
      },
      {
        type: 'scatter',
        id: 'record-low',
        label: 'Record low',
        y: (day) => (day.record === 'low' ? day.low : null),
        color: BLUE,
        pointRadius: 4,
      },
    ],
    axes: {
      // Half a day either side, so the first and last days' bars are whole.
      x: { min: dayEdge(summer[0]?.date, -1), max: dayEdge(summer.at(-1)?.date, 1) },
      y: { format: { suffix: ' °F' } },
    },
    plugins: [dailyRange(summer)],
    legend: false,
    interaction: 'readonly',
    tooltip: { render: weatherTable },
    timeZone: 'UTC',
    ariaLabel: `Daily highs and lows in Central Park, June to August 2025, against the normal and record ranges. ${headline(answer)}`,
  });

  part(root, 'answer').textContent = headline(answer);
  part(root, 'records').textContent = recordsLine(answer) || 'No day set a record high or low.';
  const dots = { 'record-high': answer.recordHighs.length, 'record-low': answer.recordLows.length };
  readingKey(part(root, 'key'), chart, (id) => dots[id as keyof typeof dots] ?? 1);
  root.dataset.ready = '';
  // The thumbnail hook (thumbnail.json): the charts have painted two frames later.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => document.documentElement.setAttribute('data-demo-ready', '')),
  );
  return chart;
}

/**
 * The one-line reading key, in the colours the chart reports; a series with no mark this summer
 * (no record lows, say) is left out.
 */
function readingKey(
  element: HTMLElement,
  chart: ChartHandle<SummerRow>,
  marks: (id: string) => number,
): void {
  const item = (colour: string, kind: string, text: string, opacity = 1) => {
    const swatch = document.createElement('span');
    swatch.className = 'key-swatch';
    swatch.style.setProperty('--swatch', colour);
    swatch.style.setProperty('--swatch-opacity', String(opacity));
    const span = document.createElement('span');
    span.className = `key-item key-${kind}`;
    span.append(swatch, text);
    element.append(span);
  };
  item(BAR, 'bar', '2025, low to high');
  for (const series of chart.getState().series) {
    if (marks(series.id) === 0) continue;
    const band = series.type === 'band';
    item(
      series.fill ?? series.color,
      band ? 'band' : 'dot',
      series.label,
      band ? series.opacity : 1,
    );
    element.lastElementChild?.setAttribute('data-series', series.id);
  }
}
