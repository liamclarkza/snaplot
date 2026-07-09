import { createSignal, createEffect, createMemo, onCleanup } from 'solid-js';
import { lttb, m4, lightTheme, darkTheme } from 'snaplot';
import { Chart, createChartGroup } from 'snaplot/solid';
import type { ChartInstance, ColumnarData } from 'snaplot';
import CodeBlock from '../../../components/CodeBlock';
import { Section, Prose, Demo } from '../../../components/ui';
import { useTheme } from '../../../ThemeContext';
import { dailyBarData, encodedScatterData, gappedData, largeTimeSeries, timeSeries } from '../fixtures';

/**
 * Task-oriented cookbook. Where a recipe is a single config, it uses the
 * live-editable Demo. Streaming and linked charts need imperative wiring
 * (timers, a shared group handle) that does not fit the config editor, so
 * they render as dedicated components alongside their source.
 */
export default function Recipes() {
  const [d_scatter] = createSignal(encodedScatterData(1400));
  const [d_tooltip] = createSignal(timeSeries(120, 2));
  const [d_plugin] = createSignal(timeSeries(200, 1));
  const [d_theme] = createSignal(timeSeries(200, 2));
  const [d_gaps] = createSignal(gappedData());
  const [d_axis] = createSignal(timeSeries(180, 1));
  const [d_dailyBars] = createSignal(dailyBarData(30));

  // Downsample once at module scope, same pattern as the Data section.
  const orig = largeTimeSeries(25_000);
  const [lx, ly] = lttb(orig[0], orig[1], 500);
  const [mx, my] = m4(orig[0], orig[1], 600, orig[0][0], orig[0][orig[0].length - 1]);
  const [d_lttb] = createSignal<ColumnarData>([lx, ly]);
  const [d_m4] = createSignal<ColumnarData>([mx, my]);

  return (
    <>
      <Section id="recipe-streaming" title="Recipe: Streaming Dashboard">
        <Prose>
          A ring buffer plus <code>appendData</code> keeps a fixed window of
          live data without reallocating on every tick. Set
          <code>streaming.maxLen</code> to cap the retained points; the oldest
          drop off the front automatically. Use
          <code>appendData(chunk, {'{'} updateLast: true {'}'})</code> to refine
          the in-progress tail row (a forming bucket or live aggregate) in place
          instead of appending a new point every tick.
        </Prose>
        <CodeBlock code={`const chart = new ChartCore(container, {
  streaming: { maxLen: 600 },   // ring buffer, keep the last 600 points
  axes: { x: { type: 'time' } },
  series: [{ label: 'throughput', dataIndex: 1, type: 'line' }],
}, seed);

let acc = 0, samples = 0, bucketX = seed[0][seed[0].length - 1];

setInterval(() => {
  const value = readMetric();
  if (samples === 0) {
    // Open a new bucket: append a fresh point.
    bucketX += 1;
    acc = value; samples = 1;
    chart.appendData([new Float64Array([bucketX]),
                      new Float64Array([acc])]);
  } else {
    // Refine the same bucket: overwrite the tail row, no new point.
    acc += value; samples += 1;
    chart.appendData([new Float64Array([bucketX]),
                      new Float64Array([acc / samples])],
                     { updateLast: true });
    if (samples >= 5) samples = 0;  // bucket closes, next tick opens a new one
  }
}, 200);`} />
        <Prose>
          For a live monitor, add <code>streaming.follow</code> to keep a fixed
          trailing window that scrolls with the newest data. The view follows
          until the user pans or zooms X (which pauses it); a
          <code>Go live</code> button calls <code>chart.scrollToLatest()</code>
          to resume. Read <code>chart.isFollowing()</code> or listen to
          <code>follow:change</code> to drive a live/paused badge.
        </Prose>
        <CodeBlock code={`const chart = new ChartCore(container, {
  streaming: { maxLen: 5000, follow: 60_000 },  // trailing 60s window
  axes: { x: { type: 'time' } },
  series: [{ label: 'throughput', dataIndex: 1, type: 'line' }],
}, seed);

chart.on('follow:change', (live) => {
  goLiveButton.hidden = live;   // show "Go live" only while paused
});

// resume live scrolling after the user zoomed in to inspect
goLiveButton.onclick = () => chart.scrollToLatest();`} />
        <div style={{ height: '12px' }} />
        <StreamingDashboardDemo />
      </Section>

      <Section id="recipe-linked" title="Recipe: Linked Charts">
        <Prose>
          <code>createChartGroup()</code> mints one sync key and wires cursor,
          highlight, and (opt-in) zoom across every chart you spread
          <code>group.apply(config)</code> into. Hover or zoom one chart and the
          peers follow. For highlight to survive charts whose series are in a
          different order, give each series a stable identity through
          <code>highlight.getKey</code>; external controls then call
          <code>group.highlightKey(id)</code> and every chart maps the id back to
          its own local series.
        </Prose>
        <CodeBlock code={`const group = createChartGroup();

const runs = [{ id: 'run-a' }, { id: 'run-b' }, { id: 'run-c' }];

// apply(config, { zoom: true }) merges cursor + highlight + zoom sync keys
// without clobbering your own cursor/highlight settings.
const config = group.apply({
  axes: { x: { type: 'time' } },
  series: runs.map((r, i) => ({
    label: r.id, dataIndex: i + 1, type: 'line',
    meta: { runId: r.id },              // stable identity for getKey
  })),
  highlight: { getKey: (s) => s.meta?.runId },
}, { zoom: true });

// Chart B lists the same runs in reverse order; getKey keeps highlight aligned.
<Chart config={config} data={a} />
<Chart config={configReversed} data={b} />

<button onMouseEnter={() => group.highlightKey('run-b')}
        onMouseLeave={() => group.highlightKey(null)}>
  Focus run-b
</button>`} />
        <div style={{ height: '12px' }} />
        <LinkedChartsDemo />
        <Prose>
          For a wall of many charts, pass <code>defaults</code> once so every
          chart inherits the same axes, theme, and interaction instead of
          drifting, and call <code>group.link(chart)</code> on each mounted
          instance to share one Y domain (the union of their extents, so
          values compare fairly) and align their left gutters.
        </Prose>
        <CodeBlock code={`const group = createChartGroup({
  defaults: {                       // inherited by every chart in the group
    axes: { x: { type: 'time' }, y: { type: 'linear' } },
    theme: darkTheme,
    tooltip: { mode: 'nearest' },
  },
});

// createChart returns the instance accessor; link it once it exists.
const chart = createChart(() => ref, () => group.apply(config), data);
createEffect(() => {
  const c = chart();
  if (c) onCleanup(group.link(c));   // shared Y domain + aligned gutters
});`} />
      </Section>

      <Section id="recipe-brush" title="Recipe: Persistent Brush Selection">
        <Prose>
          <code>selection.mode: 'brush'</code> turns a drag into a persistent
          X-range band instead of a zoom. Drag to create it, drag inside to move
          it, drag an edge to resize it. The band is chart state in data space,
          so it stays anchored as you pan and zoom, and
          <code>getSelection()</code> returns a value you can drop straight into
          a URL and restore with <code>setSelection()</code>. Wheel still zooms
          and shift-drag still pans.
        </Prose>
        <CodeBlock code={`const chart = new ChartCore(container, {
  selection: { mode: 'brush' },
  axes: { x: { type: 'time' } },
  series: [{ label: 'value', dataIndex: 1, type: 'line' }],
}, data);

// Persist the window in the URL and mirror it to a summary panel.
chart.on('selection:change', (sel) => {
  if (!sel) { history.replaceState(null, '', location.pathname); return; }
  const q = new URLSearchParams({ from: String(sel.x.min), to: String(sel.x.max) });
  history.replaceState(null, '', '?' + q);
  summarize(sel.x.min, sel.x.max);
});

// Restore on load.
const q = new URLSearchParams(location.search);
if (q.has('from')) {
  chart.setSelection({ x: { min: +q.get('from'), max: +q.get('to') } });
}`} />
      </Section>

      <Section id="recipe-scatter-encoding" title="Recipe: Encoded Scatter">
        <Prose>
          Scatter series map extra columns onto color, radius, and tooltip
          rows. <code>colorBy</code> with <code>type: 'category'</code> cycles the
          categorical palette; <code>sizeBy</code> with <code>scale: 'sqrt'</code>
          encodes a count or volume by area (the perceptually honest choice);
          <code>tooltipFields</code> surfaces any other column on hover. Columns
          are absolute indices into the data; here the data is
          <code>[rowId, x, y, cohort, volume, score]</code>.
        </Prose>
        <Demo
          title="colorBy + sizeBy + tooltipFields"
          desc="Color by cohort (category), size by volume (sqrt area), score shown in the tooltip"
          data={d_scatter()}
          height="360px"
          code={`{
  axes: { x: { label: 'embedding x' }, y: { label: 'embedding y' } },
  series: [{
    label: 'events',
    type: 'scatter',
    xDataIndex: 1,
    yDataIndex: 2,
    colorBy: { dataIndex: 3, type: 'category', label: 'cohort' },
    sizeBy: { dataIndex: 4, range: [3, 14], scale: 'sqrt',
              label: 'volume', format: v => v.toFixed(0) },
    tooltipFields: [{ dataIndex: 5, label: 'score', format: v => v.toFixed(3) }],
  }],
  tooltip: { show: true, mode: 'nearest' },
}`}
        />
      </Section>

      <Section id="recipe-custom-tooltip" title="Recipe: Custom Tooltip">
        <Prose>
          <code>tooltip.render</code> receives the points selected by
          <code>tooltip.mode</code> and returns markup. A returned string is set
          as <code>innerHTML</code> verbatim, so escape any user-derived text (or
          return an <code>HTMLElement</code> built with <code>textContent</code>).
          The values below are numeric and pre-formatted via each axis
          <code>tickFormat</code>, so a template string is safe here.
        </Prose>
        <Demo
          title="Custom tooltip markup"
          desc="One header row for X, then a swatch + label + right-aligned value per series"
          data={d_tooltip()}
          code={`{
  axes: { x: { type: 'time' } },
  series: [
    { label: 'p50', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2 },
    { label: 'p99', dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 2 },
  ],
  tooltip: {
    show: true,
    mode: 'index',
    render: (points) => {
      const rows = points.map(p =>
        '<div style="display:flex;gap:8px;align-items:center;margin-top:3px">' +
          '<span style="width:8px;height:8px;border-radius:50%;background:' + p.color + '"></span>' +
          '<span>' + p.label + '</span>' +
          '<b style="margin-left:auto">' + p.formattedY + '</b>' +
        '</div>'
      ).join('');
      return '<div style="min-width:130px">' +
        '<div style="opacity:0.6;margin-bottom:2px">' + points[0].formattedX + '</div>' +
        rows + '</div>';
    },
  },
}`}
        />
      </Section>

      <Section id="recipe-custom-plugin" title="Recipe: Custom Plugin">
        <Prose>
          A plugin implements any subset of the <code>Plugin</code> hooks. This
          one pairs a data hook with a cursor hook: <code>onCursorMove</code>
          records the snapped index (and clears it on leave, when the args are
          <code>null</code>), and <code>afterDrawOverlay</code> paints a small
          readout on the top layer. The cursor system already repaints the
          overlay on every move, so no manual <code>redraw()</code> is needed.
          Editing the config re-runs the plugin factory live.
        </Prose>
        <Demo
          title="Cursor readout plugin"
          desc="Draws the current data index in the plot corner using onCursorMove + afterDrawOverlay"
          data={d_plugin()}
          code={`{
  axes: { x: { type: 'time' } },
  series: [{ label: 'signal', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2 }],
  cursor: { show: true, snap: true },
  plugins: [
    (() => {
      let idx = null;
      return {
        id: 'cursor-readout',
        onCursorMove: (_chart, _dataX, dataIdx) => { idx = dataIdx; },
        afterDrawOverlay: (chart, ctx) => {
          if (idx == null) return;
          const { plot } = chart.getLayout();
          const theme = chart.getTheme();
          ctx.save();
          ctx.font = '600 11px ' + theme.fontFamily;
          ctx.fillStyle = theme.crosshairColor;
          ctx.fillText('index ' + idx, plot.left + 8, plot.top + 16);
          ctx.restore();
        },
      };
    })(),
  ],
}`}
        />
      </Section>

      <Section id="recipe-theming" title="Recipe: Theming">
        <Prose>
          Three ways to theme. Pass a full <code>ThemeConfig</code> to pin
          colors regardless of the page. Reference your design tokens directly
          with <code>var(--token)</code> values in any theme field. Or set no
          theme at all and define <code>--chart-*</code> CSS variables on the
          container (or an ancestor). In every case, values may be any CSS
          color the browser understands, including <code>oklch(...)</code>.
          snaplot resolves them to concrete colors against the container, and
          re-resolves automatically when your <code>[data-theme]</code>
          attribute or the OS color scheme flips, so charts re-theme live with
          no remount. Call <code>chart.refreshTheme()</code> if tokens change
          through some other mechanism.
        </Prose>
        <CodeBlock code={`/* design-system tokens, oklch and all */
:root { --surface: oklch(0.98 0.005 260); --ink: oklch(0.25 0.01 260); }
[data-theme='dark'] { --surface: oklch(0.18 0.015 260); --ink: oklch(0.93 0.005 260); }

/* option A: reference your own tokens from the theme */
new ChartCore(el, {
  theme: {
    backgroundColor: 'var(--surface)',
    textColor: 'var(--ink)',
  },
  series: [{ label: 'v', dataIndex: 1 }],
}, data);

/* option B: alias tokens to the --chart-* names and pass no theme.
   Full list: --chart-bg, --chart-text, --chart-tick, --chart-grid,
   --chart-axis, --chart-border, --chart-crosshair, --chart-tooltip-bg,
   --chart-tooltip-text, --chart-tooltip-border (see CHART_CSS_VARS). */
.panel { --chart-bg: var(--surface); --chart-text: var(--ink); }`} />
        <Demo
          title="Full ThemeConfig"
          desc="Every color pinned; palettes are role-aware (categorical for series, sequential for density)"
          data={d_theme()}
          code={`{
  theme: {
    backgroundColor: '#12141c',
    textColor: '#d7dae5',
    gridColor: '#242838',
    gridOpacity: 0.6,
    palette: ['#7aa2f7', '#bb9af7', '#7dcfff', '#9ece6a', '#e0af68'],
    borderColor: '#242838',
    borderOpacity: 0.8,
    crosshairColor: '#565f89',
    tooltipBackground: 'rgba(20, 22, 32, 0.95)',
    tooltipTextColor: '#d7dae5',
    tooltipBorderColor: '#2a2e3f',
  },
  axes: { x: { type: 'time' } },
  series: [
    { label: 'A', dataIndex: 1, type: 'area', interpolation: 'monotone', lineWidth: 2 },
    { label: 'B', dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 2 },
  ],
  tooltip: { show: true, mode: 'index' },
}`}
        />
        <Prose>
          With no <code>theme</code> key, the same chart inherits the docs
          site's CSS variables. Toggle the site theme and it follows:
        </Prose>
        <Demo
          title="CSS-variable theming (no theme key)"
          desc="Reads --chart-bg / --chart-text / --chart-grid from the container"
          data={d_theme()}
          code={`{
  axes: { x: { type: 'time' } },
  series: [
    { label: 'A', dataIndex: 1, type: 'area', interpolation: 'monotone', lineWidth: 2 },
    { label: 'B', dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 2 },
  ],
  tooltip: { show: true, mode: 'index' },
}`}
        />
      </Section>

      <Section id="recipe-ticks" title="Recipe: Ticks and Gridlines">
        <Prose>
          <code>tickCount</code> sets the target label density (a hard cap for
          bar and histogram category ticks, which also auto-thin to the plot
          width), <code>ticks</code> pins exact values, and per-axis
          <code>grid</code> styles or removes the gridlines independently of
          the labels. A daily bar chart usually wants sparse date labels, no
          vertical grid, and dashed horizontal guides:
        </Prose>
        <Demo
          title="Daily bars: sparse labels, horizontal dashed grid only"
          desc="tickCount caps date labels, grid:false kills vertical clutter, dash restores the hairline style"
          data={d_dailyBars()}
          code={`{
  axes: {
    x: {
      type: 'time',
      tickCount: 6,          // at most 6 date labels across the range
      grid: false,           // no vertical gridlines
      tickFormat: (t) => new Date(t).toLocaleDateString(undefined,
        { month: 'short', day: 'numeric' }),
    },
    y: {
      tickCount: 4,
      grid: { dash: [4, 4], opacity: 0.5 },   // dashed horizontal guides
    },
  },
  series: [{
    label: 'active users', dataIndex: 1, type: 'bar',
    // per-datum fill: emphasize the most recent day
    fill: (v, i) => i === 29 ? '#e8590c' : '#4f8fea',
  }],
  tooltip: {
    xFormat: (t) => new Date(t).toLocaleDateString(undefined,
      { weekday: 'short', month: 'long', day: 'numeric' }),
    yFormat: (y) => \`\${Math.round(y)} users\`,
  },
}`}
        />
        <Prose>
          For full control, pass explicit values: <code>ticks: [0, 25, 50,
          75, 100]</code> renders exactly those (clamped to the visible
          domain), and gridlines follow the ticks, so both declutter together.
        </Prose>
      </Section>

      <Section id="recipe-downsampling" title="Recipe: Downsampling (LTTB vs M4)">
        <Prose>
          Both reduce a large series before it reaches the renderer; snaplot
          never downsamples for you. Reach for <b>LTTB</b> when you want the
          curve to look right at a target point count and do not know the exact
          pixel width, it keeps the most visually significant points. Reach for
          <b>M4</b> when you know the chart's pixel width and must not lose peaks
          or valleys, it keeps the min and max per pixel column, so spikes
          survive. Both emit a synthetic <code>(x, NaN)</code> separator between
          runs to preserve gaps, which the line renderer reads as a break.
        </Prose>
        <CodeBlock code={`import { lttb, m4 } from 'snaplot';

// LTTB: target a point count.
const [lx, ly] = lttb(xData, yData, 500);

// M4: pixel-aware, pass the plot width and current X domain.
const [mx, my] = m4(xData, yData, plotWidthPx, xMin, xMax);`} />
        <div style={{ height: '12px' }} />
        <Demo
          title="LTTB: 500 points from 25K"
          desc="Shape-preserving; best when you just want it to look right"
          data={d_lttb()}
          code={`{
  axes: { x: { type: 'time' } },
  series: [{ label: 'LTTB 500', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2 }],
  tooltip: { show: true },
}`}
        />
        <Demo
          title="M4: pixel-aware from 25K"
          desc="Keeps min/max per pixel column; best when peaks must survive"
          data={d_m4()}
          code={`{
  axes: { x: { type: 'time' } },
  series: [{ label: 'M4', dataIndex: 1, type: 'line', interpolation: 'linear', lineWidth: 1.5 }],
  tooltip: { show: true },
}`}
        />
      </Section>

      <Section id="recipe-gaps" title="Recipe: Gaps and spanGaps">
        <Prose>
          A <code>NaN</code> in a Y column is a gap. By default the line breaks
          there, which is what you want when the gap means "no signal". Set
          <code>spanGaps: true</code> to bridge the gap with a straight
          connecting segment instead, for when the gap means "not sampled"
          (missed scrapes, runs joined onto a shared X column). It applies to
          line and area across every interpolation mode. Edit
          <code>spanGaps</code> below to compare.
        </Prose>
        <Demo
          title="spanGaps bridges NaN gaps"
          desc="Flip spanGaps to false to see the path break at each NaN run instead"
          data={d_gaps()}
          code={`{
  series: [{
    label: 'sampled',
    dataIndex: 1,
    type: 'line',
    interpolation: 'monotone',
    lineWidth: 2,
    spanGaps: true,
  }],
  tooltip: { show: true, mode: 'index' },
}`}
        />
      </Section>

      <Section id="recipe-axis-titles" title="Recipe: Axis Titles + Tick Format">
        <Prose>
          <code>axis.label</code> renders a title outside the tick labels
          (below a bottom axis, rotated alongside a left axis) and layout
          reserves the gutter space automatically. <code>axis.tickFormat</code>
          overrides label formatting per axis; return <code>''</code> to hide a
          specific tick. Here the Y axis formats values as a percentage and the
          X axis labels only every other hour.
        </Prose>
        <Demo
          title="Titled axes with custom tick labels"
          desc="Y as a percentage, X thinned to every other tick"
          data={d_axis()}
          code={`{
  axes: {
    x: {
      type: 'time',
      label: 'time (local)',
    },
    y: {
      label: 'utilisation',
      tickFormat: v => v.toFixed(0) + '%',
    },
  },
  series: [{ label: 'gpu', dataIndex: 1, type: 'area', interpolation: 'monotone', lineWidth: 2 }],
  tooltip: { show: true, mode: 'index' },
}`}
        />
      </Section>
    </>
  );
}

/**
 * Live streaming demo. Opens a bucket, refines it in place for five ticks
 * with `updateLast`, then opens the next one. The ring buffer caps the
 * window at 120 points; the readout shows the append/version counters.
 */
function StreamingDashboardDemo() {
  const [chart, setChart] = createSignal<ChartInstance>();
  const [label, setLabel] = createSignal('waiting for chart');
  const seed = seedSeries(80);

  createEffect(() => {
    const c = chart();
    if (!c) return;

    let bucketX = seed[0][seed[0].length - 1];
    let acc = 0;
    let samples = 0;

    const timer = window.setInterval(() => {
      const value = 50 + Math.sin(bucketX / 9) * 16 + (Math.random() - 0.5) * 10;
      if (samples === 0) {
        bucketX += 1;
        acc = value;
        samples = 1;
        c.appendData([new Float64Array([bucketX]), new Float64Array([acc])]);
      } else {
        acc += value;
        samples += 1;
        c.appendData([new Float64Array([bucketX]), new Float64Array([acc / samples])], {
          updateLast: true,
        });
        if (samples >= 5) samples = 0;
      }
      const stats = c.getStats();
      setLabel(
        `appends ${stats.appendDataCount} · version ${stats.dataVersion} · ` +
          `bucket step ${samples || 5}/5`,
      );
    }, 200);

    onCleanup(() => window.clearInterval(timer));
  });

  return (
    <div style={{ border: '1px solid var(--border)', 'border-radius': 'var(--radius-lg)', overflow: 'hidden', background: 'var(--bg-surface)' }}>
      <div style={{ height: '240px' }}>
        <Chart
          data={seed}
          onReady={setChart}
          config={{
            debug: { stats: true },
            streaming: { maxLen: 120 },
            axes: { x: { type: 'linear' } },
            series: [{ label: 'throughput', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2 }],
            tooltip: { show: true, mode: 'index' },
          }}
        />
      </div>
      <div style={{ padding: '8px 12px', 'border-top': '1px solid var(--border)', 'font-size': '12px', color: 'var(--text-secondary)', 'font-variant-numeric': 'tabular-nums' }}>
        {label()}
      </div>
    </div>
  );
}

const RUN_IDS = ['run-a', 'run-b', 'run-c'];

/**
 * Two synced charts whose series are in opposite order, plus external hover
 * controls. Highlight rides on `getKey` (the run id), so hovering a button
 * dims all-but-one in both charts even though their series order differs.
 * Zoom sync is opted in, so box-zooming either chart moves both.
 */
function LinkedChartsDemo() {
  const { theme: siteTheme } = useTheme();
  const group = createChartGroup();
  const data = timeSeries(200, 3);

  const baseSeries = RUN_IDS.map((id, i) => ({
    label: id,
    dataIndex: i + 1,
    type: 'line' as const,
    interpolation: 'monotone' as const,
    lineWidth: 2,
    meta: { runId: id },
  }));

  const configA = createMemo(() =>
    group.apply(
      {
        theme: siteTheme() === 'light' ? lightTheme : darkTheme,
        axes: { x: { type: 'time' } },
        series: baseSeries,
        highlight: { getKey: (s) => (s.meta as { runId: string } | undefined)?.runId },
        tooltip: { show: true, mode: 'index' },
      },
      { zoom: true },
    ),
  );

  const configB = createMemo(() =>
    group.apply(
      {
        theme: siteTheme() === 'light' ? lightTheme : darkTheme,
        axes: { x: { type: 'time' } },
        // Reverse order: dataIndex 3,2,1 but the same run ids in meta.
        series: [...baseSeries].reverse().map((s, i) => ({ ...s, dataIndex: 3 - i })),
        highlight: { getKey: (s) => (s.meta as { runId: string } | undefined)?.runId },
        tooltip: { show: true, mode: 'index' },
      },
      { zoom: true },
    ),
  );

  return (
    <div style={{ border: '1px solid var(--border)', 'border-radius': 'var(--radius-lg)', overflow: 'hidden', background: 'var(--bg-surface)' }}>
      <div style={{ height: '170px' }}>
        <Chart config={configA()} data={data} />
      </div>
      <div style={{ height: '170px', 'border-top': '1px solid var(--border)' }}>
        <Chart config={configB()} data={data} />
      </div>
      <div style={{ display: 'flex', gap: '8px', padding: '10px 12px', 'border-top': '1px solid var(--border)', 'flex-wrap': 'wrap' }}>
        {RUN_IDS.map((id) => (
          <button
            type="button"
            onMouseEnter={() => group.highlightKey(id)}
            onMouseLeave={() => group.highlightKey(null)}
            onFocus={() => group.highlightKey(id)}
            onBlur={() => group.highlightKey(null)}
            style={{
              padding: '4px 12px',
              'border-radius': 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              font: 'inherit',
              'font-size': '13px',
            }}
          >
            Focus {id}
          </button>
        ))}
      </div>
    </div>
  );
}

function seedSeries(points: number): ColumnarData {
  const x = new Float64Array(points);
  const y = new Float64Array(points);
  for (let i = 0; i < points; i++) {
    x[i] = i;
    y[i] = 50 + Math.sin(i / 9) * 16 + (Math.random() - 0.5) * 6;
  }
  return [x, y];
}
