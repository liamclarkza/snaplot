// Conformance scenarios (plan §7.5) on the react18 runtime. The table is scenarios.ts; each
// runtime spec lists it with the same titles. A scenario that waits on another milestone is
// test.fail(true, '[id]') with that milestone's finding id (plan §12.0).
import { type Page, test } from '@playwright/test';
import * as scenario from './scenarios';

const run =
  (body: (opened: scenario.Opened) => Promise<void>) =>
  async ({ page }: { page: Page }) =>
    body(await scenario.open(page, 'react18'));

test('#1 mount: one live chart, host attributes passed through', async ({ page }) => {
  test.fail(true, '[research-07]');
  await run(scenario.mount)({ page });
});
test('#1 mount: the host is a figure named by a summary of its series', async ({ page }) => {
  test.fail(true, '[interact-23]');
  await run(scenario.figure)({ page });
});
test('#2 a paint-only change does not ingest and draws the new title', async ({ page }) => {
  test.fail(true, '[research-07]');
  await run(scenario.paintOnly)({ page });
});
test('#3 30 re-renders with inline handlers do not ingest; a click calls the latest once', async ({
  page,
}) => {
  test.fail(true, '[research-07]');
  await run(scenario.inlineHandlers)({ page });
});
test('#4 a new data array ingests once and the tooltip shows the new values', async ({ page }) => {
  test.fail(true, '[research-07]');
  await run(scenario.newData)({ page });
});
test('#5 a removed prop returns to its default', run(scenario.removedProp));
test('#6 viewport set, echoed and reset: applied, the echo is a no-op, one {} event', async ({
  page,
}) => {
  test.fail(true, '[research-07]');
  await run(scenario.viewportEcho)({ page });
});
test('#7 an un-echoed inline viewport keeps a user zoom across re-renders', async ({ page }) => {
  test.fail(true, '[research-07]');
  await run(scenario.unechoedViewport)({ page });
});
test('#8 a legend click emits hiddenSeries:change; the same prop again is a no-op', async ({
  page,
}) => {
  test.fail(true, '[research-07]');
  await run(scenario.legendClick)({ page });
});
test('#9 drag select emits one selection:change with points', async ({ page }) => {
  test.fail(true, '[gap-annotations-extensibility-14]');
  await run(scenario.brush)({ page });
});
test('#10 append, zoom, resumeFollow: following goes true, false, true', async ({ page }) => {
  test.fail(true, '[research-07]');
  await run(scenario.followZoom)({ page });
});
test('#10 append, pan back, resumeFollow: following goes true, false, true', async ({ page }) => {
  test.fail(true, '[interact-14]');
  await run(scenario.followPan)({ page });
});
test('#11 20 cursor moves cost a highlight selector no render', async ({ page }) => {
  test.fail(true, '[research-07]');
  await run(scenario.selectorRenders)({ page });
});
test('#12 the cursor hook and the legend table show new values after a data change', async ({
  page,
}) => {
  test.fail(true, '[research-07]');
  await run(scenario.cursorFallback)({ page });
});
test('#13 a zero-height host gets 300 px and exactly one warning', async ({ page }) => {
  test.fail(true, '[frameworks-15]');
  await run(scenario.zeroHeight)({ page });
});
test('#13 height 280 in a stretched flex item is 280 px and resizes to 400', async ({ page }) => {
  test.fail(true, '[backlog-05]');
  await run(scenario.explicitHeight)({ page });
});
test('#14 unmount 20 times: no canvas, listener, group membership or heap left', async ({
  page,
}) => {
  test.fail(true, '[research-07]');
  await run(scenario.unmountTwenty)({ page });
});
test('#15 a group with a vanilla chart syncs cursor and X, not Y', async ({ page }) => {
  test.fail(true, '[research-07]');
  await run(scenario.mixedGroup)({ page });
});
test('#16 20 StrictMode cycles leave the host attributes unchanged', async ({ page }) => {
  test.fail(true, '[research-07]');
  await run(scenario.strictCycles)({ page });
});
test('#16 two grouped charts hidden and shown stay alive and in sync', async ({ page }) => {
  test.fail(true, '[research-07]');
  await run(scenario.hideShow)({ page });
});
test(
  '#17 an inline plugin with the same id installs once over 30 renders',
  run(scenario.inlinePlugin),
);
test('#18 the hover tooltip text equals vanilla', async ({ page }) => {
  test.fail(true, '[research-07]');
  await run(scenario.tooltipText)({ page });
});
test('#19 the legend and legend table DOM equal vanilla', async ({ page }) => {
  test.fail(true, '[research-07]');
  await run(scenario.legendDom)({ page });
});
test('#20 every canvas layer and the label layer equal vanilla', async ({ page }) => {
  test.fail(true, '[research-07]');
  await run(scenario.pixelEquality)({ page });
});
test('#21 server markup hydrates with no warning into one chart', async ({ page }) => {
  test.fail(true, '[research-07]');
  await run(scenario.hydration)({ page });
});
test('#23 inline empty data keeps 30 appended rows across a re-render', async ({ page }) => {
  test.fail(true, '[research-07]');
  await run(scenario.inlineEmptyData)({ page });
});
test('#24 highlight set, echoed and hovered: applied, the echo is a no-op, one event per hover', async ({
  page,
}) => {
  test.fail(true, '[research-07]');
  await run(scenario.highlightEcho)({ page });
});
test('[research-07] React 18.3 runs the adapter: the ref, the hooks, no warning', async ({
  page,
}) => {
  test.fail(true, '[research-07]');
  await run(scenario.react18Support)({ page });
});
