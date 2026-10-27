// Conformance scenarios (plan §7.5) on the react18 runtime. The table is scenarios.ts; each
// runtime spec lists it with the same titles. A scenario that waits on another milestone is
// test.fail(true, '[id]') with that milestone's finding id (plan §12.0).
import { type Page, test } from '@playwright/test';
import * as scenario from './scenarios';

const run =
  (body: (opened: scenario.Opened) => Promise<void>) =>
  async ({ page }: { page: Page }) =>
    body(await scenario.open(page, 'react18'));

test('#1 mount: one live chart, host attributes passed through', run(scenario.mount));
test('#1 mount: the host is a figure named by a summary of its series', run(scenario.figure));
test('#2 a paint-only change does not ingest and draws the new title', run(scenario.paintOnly));
test(
  '#3 30 re-renders with inline handlers do not ingest; a click calls the latest once',
  run(scenario.inlineHandlers),
);
test(
  '#4 a new data array ingests once and the tooltip shows the new values',
  run(scenario.newData),
);
test('#5 a removed prop returns to its default', run(scenario.removedProp));
test(
  '#6 viewport set, echoed and reset: applied, the echo is a no-op, one {} event',
  run(scenario.viewportEcho),
);
test(
  '#7 an un-echoed inline viewport keeps a user zoom across re-renders',
  run(scenario.unechoedViewport),
);
test(
  '#8 a legend click emits hiddenSeries:change; the same prop again is a no-op',
  run(scenario.legendClick),
);
test('#9 drag select emits one selection:change with points', run(scenario.brush));
test('#10 append, zoom, resumeFollow: following goes true, false, true', run(scenario.followZoom));
test(
  '#10 append, pan back, resumeFollow: following goes true, false, true',
  run(scenario.followPan),
);
test('#11 20 cursor moves cost a highlight selector no render', run(scenario.selectorRenders));
test(
  '#12 the cursor hook and the legend table show new values after a data change',
  run(scenario.cursorFallback),
);
test('#13 a zero-height host gets 300 px and exactly one warning', async ({ page }) => {
  await run(scenario.zeroHeight)({ page });
});
test(
  '#13 height 280 in a stretched flex item is 280 px and resizes to 400',
  run(scenario.explicitHeight),
);
test(
  '#14 unmount 20 times: no canvas, listener, group membership or heap left',
  run(scenario.unmountTwenty),
);
test('#15 a group with a vanilla chart syncs cursor and X, not Y', run(scenario.mixedGroup));
test('#16 20 StrictMode cycles leave the host attributes unchanged', run(scenario.strictCycles));
test('#16 two grouped charts hidden and shown stay alive and in sync', run(scenario.hideShow));
test(
  '#17 an inline plugin with the same id installs once over 30 renders',
  run(scenario.inlinePlugin),
);
test('#18 the hover tooltip text equals vanilla', run(scenario.tooltipText));
test('#19 the legend and legend table DOM equal vanilla', run(scenario.legendDom));
test('#20 every canvas layer and the label layer equal vanilla', run(scenario.pixelEquality));
test('#21 server markup hydrates with no warning into one chart', run(scenario.hydration));
test(
  '#23 inline empty data keeps 30 appended rows across a re-render',
  run(scenario.inlineEmptyData),
);
test(
  '#24 highlight set, echoed and hovered: applied, the echo is a no-op, one event per hover',
  run(scenario.highlightEcho),
);
test(
  '[research-07] React 18.3 runs the adapter: the ref, the hooks, no warning',
  run(scenario.react18Support),
);
