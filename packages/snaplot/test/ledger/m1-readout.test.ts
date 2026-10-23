// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChartHandle } from '../../src/index';
import {
  clientPoint,
  debug,
  type Fakes,
  hover,
  installFakes,
  pointerTarget,
  tooltipText,
} from '../fakes';

// Plan P9 / §5.2: a value readout uses maximumFractionDigits =
// clamp(stepDecimals + 2, 0, 6) with grouping; a non-zero value that would
// round to 0 keeps two significant digits. The expectations assume an
// English default locale (grouping with ",").

type Row = { t: number; y: number };

let fakes: Fakes;
beforeEach(() => {
  fakes = installFakes();
});
afterEach(() => fakes.uninstall());

function lineChart(values: number[]): ChartHandle<Row> {
  return fakes.mount<Row>({ data: values.map((y, t) => ({ t, y })), x: 't', series: [{ y: 'y' }] });
}

/** The y tick labels of the last paint; integers prove an integer tick step. */
function expectIntegerStep(chart: ChartHandle<any>): void {
  const ticks = debug(chart)
    .labelBoxes()
    .filter((box) => box.axis === 'y' && box.kind === 'tick')
    .map((box) => box.text);
  expect(ticks.length).toBeGreaterThan(1);
  for (const tick of ticks) expect(tick).toMatch(/^-?\d+$/);
}

/** Tooltip text split into tokens, so '0.46' never matches inside '0.4567'. */
function tooltipTokens(): string[] {
  return tooltipText()
    .split(/[\s ]+/)
    .filter(Boolean);
}

/** Hover the point and read both the tooltip DOM and the cursor snapshot. */
function readout(chart: ChartHandle<Row>, t: number, y: number) {
  hover(chart, t, y);
  fakes.frames.flush();
  const point = chart.getCursorSnapshot().points.find((candidate) => candidate.x === t);
  return { tokens: tooltipTokens(), snapshot: point?.formattedY };
}

describe('[visuals-01][dxtrial-02] readouts keep value precision', () => {
  it('[visuals-01] 0.4567 at an integer step reads 0.46', () => {
    const chart = lineChart([0, 0.4567, 6, 0.0004567, 3]);
    expectIntegerStep(chart);
    const { tokens, snapshot } = readout(chart, 1, 0.4567);
    expect(snapshot).toBe('0.46');
    expect(tokens).toContain('0.46');
  });

  it('[visuals-01] 0.0004567 at an integer step reads 0.00046', () => {
    const chart = lineChart([0, 0.4567, 6, 0.0004567, 3]);
    expectIntegerStep(chart);
    const { tokens, snapshot } = readout(chart, 3, 0.0004567);
    expect(snapshot).toBe('0.00046');
    expect(tokens).toContain('0.00046');
  });

  it('[visuals-01] 39.27 at an integer step reads 39.27', () => {
    const chart = lineChart([0, 39.27, 100, 50]);
    expectIntegerStep(chart);
    const { tokens, snapshot } = readout(chart, 1, 39.27);
    expect(snapshot).toBe('39.27');
    expect(tokens).toContain('39.27');
  });

  it('[visuals-01] 1138371 at an integer step reads 1,138,371', () => {
    // Ticks step by 200,000 here (labels may later use compact notation, so
    // the integer-step precondition is not re-checked through them).
    const chart = lineChart([0, 1138371, 1200000, 400000]);
    const { tokens, snapshot } = readout(chart, 1, 1138371);
    expect(snapshot).toBe('1,138,371');
    expect(tokens).toContain('1,138,371');
  });

  it('[dxtrial-02] cursor snapshot keeps value precision', () => {
    // Grouped bars (the dxtrial EMEA/APAC task) on an integer-step axis.
    type Bar = { q: string; emea: number; apac: number };
    const bars = fakes.mount<Bar>({
      data: [
        { q: 'Q1', emea: -2.5, apac: 1 },
        { q: 'Q2', emea: -0.8, apac: 2.2 },
        { q: 'Q3', emea: 1.2, apac: 0.6 },
        { q: 'Q4', emea: 2.7, apac: -1.3 },
      ],
      x: 'q',
      series: [
        { type: 'bar', y: 'emea' },
        { type: 'bar', y: 'apac' },
      ],
    });
    expectIntegerStep(bars);
    bars.setCursor('Q2');
    expect(bars.getCursorSnapshot().points.map((point) => point.formattedY)).toEqual([
      '-0.8',
      '2.2',
    ]);
    bars.setCursor('Q4');
    expect(bars.getCursorSnapshot().points.map((point) => point.formattedY)).toEqual([
      '2.7',
      '-1.3',
    ]);
    hover(bars, 1, -0.8);
    fakes.frames.flush();
    expect(tooltipTokens()).toEqual(expect.arrayContaining(['-0.8', '2.2']));

    // A line value with grouping, and a second (y2) value axis.
    type Dual = { t: number; latency: number; errors: number };
    const dual = fakes.mount<Dual>({
      data: [
        { t: 0, latency: 0, errors: 0 },
        { t: 1, latency: 1234.56, errors: 4.84 },
        { t: 2, latency: 2000, errors: 10 },
      ],
      x: 't',
      series: [{ y: 'latency' }, { y: 'errors', yAxis: 'y2' }],
      axes: { y2: { position: 'right' } },
    });
    dual.setCursor(1);
    expect(dual.getCursorSnapshot().points.map((point) => point.formattedY)).toEqual([
      '1,234.56',
      '4.84',
    ]);
  });

  it.fails('[visuals-01] a time Y axis reads as a time, never as an epoch number', () => {
    // §5.2: a time axis reads at time precision. The exact string is M10's
    // (data-spacing precision); here it must be a clock time, not a number.
    const start = Date.UTC(2024, 0, 1);
    const times = fakes.mount<Row>({
      data: [0, 1, 2, 3].map((t) => ({ t, y: start + t * 3_600_000 })),
      x: 't',
      series: [{ y: 'y' }],
      axes: { y: { type: 'time' } },
    });
    times.setCursor(1);
    const [point] = times.getCursorSnapshot().points;
    expect(point.formattedY).toMatch(/\d:\d\d/);
    expect(point.formattedY).not.toMatch(/^[-\d,.\s]+$/);
    hover(times, 1, start + 3_600_000);
    fakes.frames.flush();
    expect(tooltipText()).toContain(point.formattedY);
    // No grouped epoch number such as 1,704,070,800,000.
    expect(tooltipText()).not.toMatch(/\d{1,3}(,\d{3}){3,}/);

    // A log axis still reads at value precision.
    const log = fakes.mount<Row>({
      data: [1, 10, 123456, 1e6].map((y, t) => ({ t, y })),
      x: 't',
      series: [{ y: 'y' }],
      axes: { y: { type: 'log' } },
    });
    log.setCursor(2);
    expect(log.getCursorSnapshot().points.map((p) => p.formattedY)).toEqual(['123,456']);
  });

  it.fails('[visuals-01] a clicked point reads like its tooltip', () => {
    // Quarter ticks: a 0.25 step allows 4 readout decimals, where the default
    // tick count (a 0.2 step) would allow 3.
    const chart = fakes.mount<Row>({
      data: [0, 0.123456, 1, 0.5].map((y, t) => ({ t, y })),
      x: 't',
      series: [{ y: 'y' }],
      axes: { y: { ticks: [0, 0.25, 0.5, 0.75, 1] } },
    });
    const clicks: string[] = [];
    chart.on('point:click', (point) => clicks.push(point.formattedY));
    const { snapshot } = readout(chart, 1, 0.123456);
    expect(snapshot).toBe('0.1235');

    const target = pointerTarget(chart);
    const at = { ...clientPoint(chart, 1, 0.123456), bubbles: true, pointerId: 1 };
    target.dispatchEvent(new PointerEvent('pointerdown', { ...at, pointerType: 'mouse' }));
    target.dispatchEvent(new PointerEvent('pointerup', { ...at, pointerType: 'mouse' }));
    expect(clicks).toEqual([snapshot]);
  });
});
