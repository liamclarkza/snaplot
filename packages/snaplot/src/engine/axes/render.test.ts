import { crisp } from '../render/crisp';
import { describe, expect, it, vi } from 'vitest';
import { renderAxes } from './render';
import type { ChartSpec, Layout, Scale, ThemeConfig } from '../spec';

function linearScale(min: number, max: number, generated: number[]): Scale {
  return {
    type: 'linear',
    key: 'y',
    min,
    max,
    dataToPixel: (v: number) => v,
    pixelToData: (p: number) => p,
    ticks: vi.fn(() => generated),
    tickFormat: (v: number) => String(v),
    nice: () => {},
    setPixelRange: () => {},
  };
}

function context(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 7 }) as TextMetrics),
    setLineDash: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;
}

const theme = {
  backgroundColor: '#ffffff',
  gridColor: '#eee',
  gridOpacity: 1,
  axisLineColor: '#ccc',
  tickColor: '#777',
  borderColor: '#ccc',
  borderOpacity: 1,
  textColor: '#000',
  fontFamily: 'sans-serif',
  fontSize: 12,
} as unknown as ThemeConfig;

function layout(): Layout {
  return {
    width: 120,
    height: 100,
    plot: { left: 20, top: 0, width: 100, height: 100 },
    axes: {},
    dpr: 1,
  };
}

describe('renderAxes vertical label filtering', () => {
  it('drops left-axis tick labels outside the plot vertical extent', () => {
    const yScale: Scale = {
      type: 'linear',
      key: 'y',
      min: 0,
      max: 100,
      // ticks project 1:1 to pixels; -50 and 150 fall well outside the plot.
      dataToPixel: (v: number) => v,
      pixelToData: (p: number) => p,
      ticks: () => [-50, 50, 150],
      tickFormat: (v: number) => String(v),
      nice: () => {},
      setPixelRange: () => {},
    };
    const scales = new Map<string, Scale>([['y', yScale]]);
    const config = { series: [], axes: { y: { position: 'left' } } } as unknown as ChartSpec;

    const result = renderAxes(context(), layout(), scales, theme, config);
    const labels = result.labels.filter((l) => l.axis === 'y');

    expect(labels.map((l) => l.text)).toEqual(['50']);
  });
});

describe('label fit', () => {
  it.each([
    'log',
    'time',
  ] as const)('keeps a %s axis thinned when asking for fewer ticks returns fewer labels', (type) => {
    // 10 px apart, so every second tick fits; asked for 3, the scale offers only 2.
    const yScale: Scale = {
      ...linearScale(0, 100, []),
      type,
      ticks: vi.fn((count?: number) => (count === 3 ? [20, 60] : [10, 20, 30, 40, 50])),
    };
    const scales = new Map<string, Scale>([['y', yScale]]);
    const config = { series: [], axes: { y: { position: 'left' } } } as unknown as ChartSpec;
    const result = renderAxes(context(), layout(), scales, { ...theme, fontSize: 6 }, config);

    expect(result.labels.filter((l) => l.axis === 'y').map((l) => l.text)).toEqual([
      '10',
      '30',
      '50',
    ]);
  });

  it('keeps the same labels as a thinned time axis moves on a tick', () => {
    // Ticks 10 px apart, so every second label fits, numbered by the scale (every 10 is one).
    const labelsFrom = (first: number) => {
      const generated = [0, 1, 2, 3, 4].map((i) => (first + i) * 10);
      const yScale: Scale = {
        ...linearScale(0, 100, generated),
        type: 'time',
        tickOrdinal: (v: number) => v / 10,
      };
      const config = { series: [], axes: { y: { position: 'left' } } } as unknown as ChartSpec;
      return renderAxes(
        context(),
        layout(),
        new Map([['y', yScale]]),
        { ...theme, fontSize: 6 },
        config,
      )
        .labels.filter((l) => l.axis === 'y')
        .map((l) => l.text);
    };
    expect(labelsFrom(1)).toEqual(['20', '40']);
    expect(labelsFrom(2)).toEqual(['20', '40', '60']);
  });
});

describe('log label gap', () => {
  it('keeps decades 25 px apart on a log axis, where a linear axis thins them', () => {
    const labelsOf = (type: 'log' | 'linear') => {
      const yScale: Scale = {
        // Values are pixels here, so 4–79 stands for four decades 25 px apart.
        ...linearScale(0, 100, [4, 29, 54, 79]),
        type,
        tickFormat: (v: number) => String(10 ** ((v + 21) / 25)),
      };
      const config = { series: [], axes: { y: { position: 'left' } } } as unknown as ChartSpec;
      return renderAxes(context(), layout(), new Map([['y', yScale]]), theme, config)
        .labels.filter((l) => l.axis === 'y')
        .map((l) => l.text);
    };
    expect(labelsOf('log')).toEqual(['10', '100', '1000', '10000']);
    expect(labelsOf('linear')).toEqual(['10', '1000']);
  });
});

describe('per-axis grid config', () => {
  const gridConfig = (grid: unknown) =>
    ({ series: [], axes: { y: { position: 'left', grid } } }) as unknown as ChartSpec;

  it('grid: false suppresses this axis gridlines but keeps its labels', () => {
    const scale = linearScale(0, 100, [10, 50, 90]);
    const scales = new Map<string, Scale>([['y', scale]]);
    const ctx = context();

    const result = renderAxes(ctx, layout(), scales, theme, gridConfig(false));

    // Gridlines are absent, but the short tick anchors still paint.
    expect(ctx.moveTo).toHaveBeenCalledTimes(3);
    expect(result.labels.filter((l) => l.axis === 'y').length).toBe(3);
  });

  it('can hide tick marks independently of gridlines and labels', () => {
    const scale = linearScale(0, 100, [10, 50, 90]);
    const scales = new Map<string, Scale>([['y', scale]]);
    const ctx = context();
    const config = {
      series: [],
      axes: { y: { position: 'left', grid: false, tickMarks: false } },
    } as unknown as ChartSpec;

    const result = renderAxes(ctx, layout(), scales, theme, config);

    expect(ctx.moveTo).not.toHaveBeenCalled();
    expect(result.labels.filter((l) => l.axis === 'y').length).toBe(3);
  });

  it('applies dash, color, and opacity from the grid object', () => {
    const scale = linearScale(0, 100, [50]);
    const scales = new Map<string, Scale>([['y', scale]]);
    const ctx = context();

    renderAxes(
      ctx,
      layout(),
      scales,
      theme,
      gridConfig({ dash: [4, 4], color: '#123456', opacity: 0.4 }),
    );

    expect(ctx.setLineDash).toHaveBeenCalledWith([4, 4]);
    // Dash pattern is reset after the grid stroke so the frame stays solid.
    expect(ctx.setLineDash).toHaveBeenLastCalledWith([]);
    expect(ctx.strokeStyle).toBe('rgb(204,204,204)'); // frame drew last
    expect(ctx.moveTo).toHaveBeenCalled();
  });
});

describe('axis title placement', () => {
  it('keeps title glyphs EDGE_MARGIN clear of the canvas edge on all sides', () => {
    const yScale = linearScale(0, 100, [50]);
    const xScale = { ...linearScale(0, 100, [50]), key: 'x' };
    const scales = new Map<string, Scale>([
      ['x', xScale],
      ['y', yScale],
    ]);
    const config = {
      series: [],
      axes: {
        x: { position: 'bottom', title: 'Learning rate' },
        y: { position: 'left', title: 'Validation loss' },
      },
    } as unknown as ChartSpec;
    const fullLayout: Layout = {
      width: 200,
      height: 140,
      plot: { left: 44, top: 10, width: 140, height: 90 },
      axes: {
        x: { position: 'bottom', area: { left: 44, top: 100, width: 140, height: 40 } },
        y: { position: 'left', area: { left: 0, top: 10, width: 44, height: 90 } },
      },
      dpr: 1,
    };
    const ctx = context();
    (ctx as unknown as { measureText: (t: string) => TextMetrics }).measureText = (t: string) =>
      ({ width: t.length * 7 }) as TextMetrics;

    const result = renderAxes(ctx, fullLayout, scales, theme, config);

    const yTitle = result.labels.filter((l) => l.axis === 'y').find((l) => l.kind === 'title');
    const xTitle = result.labels.filter((l) => l.axis === 'x').find((l) => l.kind === 'title');
    const fontSize = 12;
    // Rotated left title: glyph left edge = x - fontSize / 2.
    expect(yTitle).toBeDefined();
    expect((yTitle?.x ?? 0) - fontSize / 2).toBeGreaterThanOrEqual(8);
    // Bottom title: glyph bottom edge = y + fontSize / 2, inside the canvas.
    expect(xTitle).toBeDefined();
    expect(fullLayout.height - ((xTitle?.y ?? 0) + fontSize / 2)).toBeGreaterThanOrEqual(8);
  });
});

describe('axis corner collision handling', () => {
  it('moves a colliding first bottom label away from the left-axis label', () => {
    const xScale = { ...linearScale(20, 100, [20]), key: 'x' };
    const yScale = linearScale(0, 100, [100]);
    const scales = new Map<string, Scale>([
      ['x', xScale],
      ['y', yScale],
    ]);
    const fullLayout: Layout = {
      width: 140,
      height: 120,
      plot: { left: 20, top: 0, width: 100, height: 100 },
      axes: {
        x: { position: 'bottom', area: { left: 20, top: 100, width: 100, height: 20 } },
        y: { position: 'left', area: { left: 0, top: 0, width: 20, height: 100 } },
      },
      dpr: 1,
    };

    const result = renderAxes(context(), fullLayout, scales, theme, {
      series: [],
      axes: { x: { position: 'bottom' }, y: { position: 'left' } },
    } as ChartSpec);

    expect(result.labels.filter((l) => l.axis === 'x')[0]?.x).toBeGreaterThan(20);
  });
});

describe('plot furniture', () => {
  it.each([
    1, 2,
  ])('joins endpoint ticks to square, pixel-aligned frame corners at DPR %s', (dpr) => {
    const ctx = context();
    const box = { ...layout(), dpr, plot: { left: 20.2, top: 0.2, width: 99.4, height: 99.4 } };
    const scale = linearScale(0.2, 99.6, [0.2, 99.6]);
    renderAxes(ctx, box, new Map([['y', scale]]), theme, {
      series: [],
      axes: { y: { position: 'left', grid: false } },
    });
    // Each edge snaps on its own: 20.5, 0.5 … 120.5 at DPR 1; 20, 0 … 119.5 at DPR 2.
    const [left, top, right, bottom] = [20.2, 0.2, 119.6, 99.6].map((v) => crisp(v, dpr));
    expect(ctx.rect).toHaveBeenLastCalledWith(left, top, right - left, bottom - top);
    expect(ctx.moveTo).toHaveBeenCalledWith(left, top);
    expect(ctx.moveTo).toHaveBeenCalledWith(left, bottom);
  });

  it('uses theme opacity directly and gives tick marks the axis hue, preserving explicit overrides', () => {
    const ctx = context();
    const strokes: { color: string | CanvasGradient | CanvasPattern; alpha: number }[] = [];
    ctx.stroke = vi.fn(() => {
      strokes.push({ color: ctx.strokeStyle, alpha: ctx.globalAlpha });
    });
    const quiet = {
      ...theme,
      gridOpacity: 0.18,
      borderOpacity: 0.18,
      gridColor: '#84969e',
      axisLineColor: '#84969e',
      borderColor: '#84969e',
    };
    const scales = new Map([['y', linearScale(0, 100, [50])]]);
    renderAxes(ctx, layout(), scales, quiet, { series: [], axes: { y: {} } });
    expect(strokes).toEqual(
      Array.from({ length: 3 }, () => ({ color: 'rgb(233,236,238)', alpha: 1 })),
    );
    strokes.length = 0;
    renderAxes(ctx, layout(), scales, quiet, {
      series: [],
      axes: { y: { grid: false, tickMarks: { color: '#ff0000' } } },
    });
    expect(strokes[0]).toEqual({ color: 'rgb(255,0,0)', alpha: 1 });
    expect(ctx.globalAlpha).toBe(1);
  });
});

describe('one grid per direction', () => {
  it('draws the horizontal gridlines of the first Y axis only, whichever side the second is on', () => {
    const left = linearScale(0, 100, [10, 50, 90]);
    const right = { ...linearScale(0, 100, [20, 40, 60, 80]), key: 'y2' };
    const scales = new Map<string, Scale>([
      ['y', left],
      ['y2', right],
    ]);
    const ctx = context();
    const spec = {
      series: [],
      axes: { y: { position: 'left' }, y2: { position: 'right' } },
    } as unknown as ChartSpec;
    renderAxes(ctx, layout(), scales, theme, spec);
    // A gridline crosses the plot: from its left edge to its right.
    const lines = vi
      .mocked(ctx.moveTo)
      .mock.calls.filter(([x], i) => x === 20 && vi.mocked(ctx.lineTo).mock.calls[i]?.[0] === 120);
    expect(lines.map(([, y]) => y)).toEqual([10, 50, 90].map((v) => crisp(v, 1)));
  });
});

describe('bar slot grids', () => {
  it('keeps evenly spaced slot boundaries when center labels are thinned', () => {
    const ctx = context();
    const scale = { ...linearScale(0, 6, []), key: 'x', dataToPixel: (v: number) => v * 10 };
    const box: Layout = {
      width: 80,
      height: 140,
      plot: { left: 0, top: 0, width: 60, height: 100 },
      axes: { x: { position: 'bottom', area: { left: 0, top: 100, width: 60, height: 40 } } },
      dpr: 1,
    };
    const result = renderAxes(
      ctx,
      box,
      new Map([['x', scale]]),
      theme,
      { series: [], axes: { x: {} } },
      {
        values: [1, 3, 5],
        gridValues: [0, 2, 4, 6],
        format: (v) => `Category ${v}`,
      },
    );
    expect(result.labels.filter((l) => l.axis === 'x').length).toBeLessThan(3);
    // Every boundary remains, including both ends; no shortened edge cell.
    for (const x of [0.5, 20.5, 40.5, 60.5]) expect(ctx.moveTo).toHaveBeenCalledWith(x, 100.5);
    expect(ctx.moveTo).toHaveBeenCalledWith(20.5, 0);
    expect(ctx.moveTo).toHaveBeenCalledWith(40.5, 0);
  });
});

describe('the LabelBox[] layout (W5 contract, axes/labels.ts)', () => {
  it('lays labels out in paint order, axis by axis, ticks before the title', () => {
    const scales = new Map<string, Scale>([
      ['x', { ...linearScale(0, 100, [0, 50, 100]), key: 'x' }],
      ['y', linearScale(0, 100, [0, 100])],
    ]);
    const config = {
      series: [],
      axes: { x: { position: 'bottom', title: 'Time' }, y: { position: 'left', title: 'Load' } },
    } as unknown as ChartSpec;
    const boxes: Layout = {
      width: 200,
      height: 140,
      plot: { left: 0, top: 0, width: 100, height: 100 },
      axes: {
        x: { position: 'bottom', area: { left: 0, top: 100, width: 100, height: 40 } },
        y: { position: 'left', area: { left: 0, top: 0, width: 0, height: 100 } },
      },
      dpr: 1,
    };
    const { labels } = renderAxes(context(), boxes, scales, theme, config);
    expect(labels.map((l) => `${l.axis} ${l.kind} ${l.text} ${l.anchor}`)).toEqual([
      'x tick 0 middle',
      'x tick 50 middle',
      'x tick 100 middle',
      'x title Time middle',
      'y tick 0 end',
      'y tick 100 end',
      'y title Load middle',
    ]);
    for (const label of labels)
      expect(Object.keys(label)).toEqual(['axis', 'kind', 'text', 'x', 'y', 'anchor']);
  });
});
