/**
 * "How fast did the Ridgecrest aftershocks die down?" (plan §10.2, V1), in plain TypeScript.
 *
 * Three charts, each one `createChart` call:
 * - the daily-count strip: M≥2.5 events per UTC day on a log axis. Dragging across it selects a
 *   window (`interaction: { drag: 'select' }`), and `onSelectionChange` passes the window on;
 * - the magnitude scatter: every catalogued event, coloured by depth band. The selected window
 *   becomes its viewport, and clicking a point opens that event's USGS page;
 * - the decay plot: the daily rate against days since the M7.1, both axes logarithmic, as
 *   seismologists draw aftershock decay. It shades the selected window. Its X is not time, so it
 *   stays out of the group the strip and the scatter share (cursor and plot edges).
 *
 * The readout under the strip states the answer for the whole extract or the selected window,
 * from `decay()` in answer.ts, which answer.test.ts checks against an independent recount.
 */
import {
  type ChartHandle,
  createChart,
  createChartGroup,
  type ReferenceLine,
  type SelectionChange,
} from 'snaplot';
import {
  DAY,
  END,
  M64,
  M71,
  START,
  dailyCounts,
  decay,
  decaySeries,
  eventPage,
  headline,
  parseEvents,
  type Quake,
} from './answer';

/** Depth-band colours, in the order the bands first appear in the catalogue (shallowest first). */
const DEPTH_COLOURS = ['#de4968', '#8c2981', '#3b0f70'];
const INK = '#1a1a1a';

const mainshocks: ReferenceLine[] = [
  { axis: 'x', value: M64.time, label: 'M6.4', color: INK },
  { axis: 'x', value: M71.time, label: 'M7.1', color: INK },
];

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
});

export interface Ridgecrest {
  strip: ChartHandle<{ day: number; count: number | null }>;
  scatter: ChartHandle<Quake>;
  decay: ChartHandle<{ daysSince: number; rate: number }>;
}

function part(root: ParentNode, name: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(`[data-part="${name}"]`);
  if (!found) throw new Error(`ridgecrest: no [data-part="${name}"]`);
  return found;
}

export async function mount(root: HTMLElement): Promise<Ridgecrest> {
  const url = `${import.meta.env.BASE_URL}data/ridgecrest-aftershocks/events.csv`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`ridgecrest: events.csv answered ${response.status}`);
  const events = parseEvents(await response.text());

  // One bar per UTC day, centred on its day. A day without an M≥2.5 event is a gap, since a log
  // axis has no zero.
  const days = dailyCounts(events).map((d) => ({
    day: d.day + DAY / 2,
    count: d.count > 0 ? d.count : null,
  }));
  const group = createChartGroup({ viewport: false });

  const strip = createChart(part(root, 'strip'), {
    data: days,
    x: 'day',
    series: [{ type: 'bar', y: 'count', label: 'M≥2.5 events', color: INK }],
    axes: {
      x: { type: 'time', min: START, max: END },
      y: { type: 'log', title: 'Per day' },
    },
    referenceLines: mainshocks,
    interaction: { drag: 'select', zoom: 'none' },
    onSelectionChange: (selection) => show(selection),
    timeZone: 'UTC',
    group,
    ariaLabel: 'Earthquakes of magnitude 2.5 or more per day, July to September 2019',
  });

  const scatter = createChart(part(root, 'scatter'), {
    data: events,
    x: 'time',
    rowId: 'id',
    series: [
      {
        type: 'scatter',
        id: 'events',
        y: 'mag',
        label: 'Magnitude',
        colorBy: { field: 'depthBand', type: 'category', palette: DEPTH_COLOURS, label: 'Depth' },
        tooltipFields: [
          { field: 'depth', label: 'Depth (km)', format: (km) => km.toFixed(1) },
          { field: 'id', label: 'Event' },
        ],
        renderMode: 'auto',
      },
    ],
    axes: {
      x: { type: 'time', min: START, max: END },
      y: { title: 'Magnitude' },
    },
    referenceLines: mainshocks,
    onPointClick: (point) => {
      if (point.row) window.open(eventPage(point.row.id), '_blank', 'noopener');
    },
    timeZone: 'UTC',
    group,
    ariaLabel: 'Magnitude of every catalogued event against time, coloured by depth',
  });

  const decayChart = createChart(part(root, 'decay'), {
    data: decaySeries(events),
    x: 'daysSince',
    series: [{ type: 'scatter', y: 'rate', label: 'M≥2.5 events per day', color: INK }],
    axes: {
      x: { type: 'log', title: 'Days since the M7.1' },
      y: { type: 'log', title: 'Per day' },
    },
    interaction: 'readonly',
    ariaLabel: 'Daily count of M2.5 or larger events against days since the M7.1, log–log',
  });

  const answer = part(root, 'answer');
  const span = part(root, 'window');
  const whole = part(root, 'whole');
  whole.addEventListener('click', () => {
    strip.update({ selection: null });
    show(null);
  });

  /** Applies a window, or the whole extract, to the scatter, the decay plot and the readout. */
  function show(selection: SelectionChange | null): void {
    performance.mark('ridgecrest:brush');
    const from = selection ? Math.max(START, Number(selection.x[0])) : START;
    const to = selection ? Math.min(END, Number(selection.x[1])) : END;
    scatter.update({ viewport: selection ? { x: [from, to] } : {} });
    // Days since the M7.1, for the decay plot's shading (its axis starts half a day in).
    const since = (t: number) => Math.max((t - M71.time) / DAY, 0.5);
    decayChart.update({
      referenceRegions:
        selection && to > M71.time
          ? [{ axis: 'x', from: since(from), to: since(to), color: INK, opacity: 0.1 }]
          : [],
    });
    answer.textContent = headline(decay(events, from, to));
    answer.dataset.from = String(from);
    answer.dataset.to = String(to);
    span.textContent = selection
      ? `${dayFormat.format(from)} to ${dayFormat.format(to - 1)} 2019`
      : 'the whole extract, 1 July to 29 September 2019';
    whole.hidden = !selection;
    // The charts paint in the next animation frame; this callback runs after theirs.
    requestAnimationFrame(() => performance.measure('ridgecrest:brush', 'ridgecrest:brush'));
  }

  show(null);
  root.dataset.ready = '';
  return { strip, scatter, decay: decayChart };
}
