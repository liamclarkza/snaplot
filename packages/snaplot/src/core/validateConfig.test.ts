import { afterEach, describe, expect, it, vi } from 'vitest';
import { shouldValidateConfig, validateChartConfig } from './validateConfig';
import type { ChartConfig, ColumnarData, SeriesConfig } from '../types';

const f = (xs: number[]) => Float64Array.from(xs);

// Three columns: x, y1, y2. Valid column indices are 0..2.
const data: ColumnarData = [f([0, 1, 2]), f([10, 11, 12]), f([20, 21, 22])];

function config(series: SeriesConfig[], extra?: Partial<ChartConfig>): ChartConfig {
  return { series, ...extra };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('column index bounds', () => {
  it('accepts indices within the column count', () => {
    expect(() =>
      validateChartConfig(config([{ label: 'A', dataIndex: 2 }]), data),
    ).not.toThrow();
  });

  it('throws naming the series and the valid range for an out-of-range index', () => {
    expect(() =>
      validateChartConfig(config([{ label: 'Temp', dataIndex: 5 }]), data),
    ).toThrow(/series "Temp".*dataIndex 5.*0 to 2/s);
  });

  it('validates scatter encoding indices (colorBy/sizeBy/tooltipFields)', () => {
    expect(() =>
      validateChartConfig(
        config([{ label: 'S', type: 'scatter', yDataIndex: 1, colorBy: 9 }]),
        data,
      ),
    ).toThrow(/colorBy dataIndex 9/);
    expect(() =>
      validateChartConfig(
        config([{ label: 'S', type: 'scatter', yDataIndex: 1, sizeBy: { dataIndex: 7 } }]),
        data,
      ),
    ).toThrow(/sizeBy dataIndex 7/);
    expect(() =>
      validateChartConfig(
        config([{ label: 'S', type: 'scatter', yDataIndex: 1, tooltipFields: [4] }]),
        data,
      ),
    ).toThrow(/tooltipFields dataIndex 4/);
  });

  it('skips bounds checks when no data is present', () => {
    expect(() =>
      validateChartConfig(config([{ label: 'A', dataIndex: 99 }])),
    ).not.toThrow();
  });
});

describe('band bounds declaration', () => {
  it('accepts a band series that declares both bounds', () => {
    expect(() =>
      validateChartConfig(
        config([{ label: 'CI', type: 'band', dataIndex: 1, upperDataIndex: 1, lowerDataIndex: 2 }]),
        data,
      ),
    ).not.toThrow();
  });

  it('throws when a band series is missing a bound', () => {
    expect(() =>
      validateChartConfig(
        config([{ label: 'CI', type: 'band', dataIndex: 1, upperDataIndex: 1 }]),
        data,
      ),
    ).toThrow(/band series "CI".*lowerDataIndex/s);
  });
});

describe('series type', () => {
  it('accepts a known chart type', () => {
    expect(() =>
      validateChartConfig(config([{ label: 'A', type: 'scatter', yDataIndex: 1 }]), data),
    ).not.toThrow();
  });

  it('throws on an unknown chart type', () => {
    expect(() =>
      validateChartConfig(
        config([{ label: 'A', type: 'lines' as unknown as SeriesConfig['type'] }]),
        data,
      ),
    ).toThrow(/unknown type "lines"/);
  });
});

describe('axis key references', () => {
  it('accepts a series that references a declared axis', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateChartConfig(
      config([{ label: 'A', dataIndex: 1, yAxisKey: 'y2' }], {
        axes: { y2: { type: 'linear' } },
      }),
      data,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns once for an unknown axis key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cfg = config([{ label: 'A', dataIndex: 1, yAxisKey: 'nonexistent-axis' }]);
    validateChartConfig(cfg, data);
    validateChartConfig(cfg, data);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/unknown yAxisKey "nonexistent-axis"/));
  });
});

describe('tooltip mode', () => {
  it('accepts a valid tooltip mode', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateChartConfig(config([{ label: 'A', dataIndex: 1 }], { tooltip: { mode: 'index' } }), data);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns on an invalid tooltip mode', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateChartConfig(
      config([{ label: 'A', dataIndex: 1 }], {
        tooltip: { mode: 'closest' as unknown as 'nearest' },
      }),
      data,
    );
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/tooltip\.mode "closest"/));
  });
});

describe('highlight proximity', () => {
  it('accepts a positive proximity', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateChartConfig(config([{ label: 'A', dataIndex: 1 }], { highlight: { proximity: 20 } }), data);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns on a non-positive proximity', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateChartConfig(config([{ label: 'A', dataIndex: 1 }], { highlight: { proximity: -7 } }), data);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/highlight\.proximity.*-7/));
  });
});

describe('production gating', () => {
  it('disables validation when NODE_ENV is production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(shouldValidateConfig()).toBe(false);
    // An otherwise-throwing config must be a no-op in production.
    expect(() =>
      validateChartConfig(config([{ label: 'Temp', dataIndex: 5, type: 'band' }]), data),
    ).not.toThrow();
  });
});
