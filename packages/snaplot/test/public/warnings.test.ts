// @vitest-environment jsdom
// Always-on warnings (plan D24, §5.9, P1, P16): suspicious input prints one
// `console.warn('snaplot: …')`, deduplicated per page on (code, message), in
// every build. Public API and the shared fakes only. Warning texts are module
// state for the page, so every test uses its own option names or values.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ChartHandle, histogram } from '../../src/index';
import { type Fakes, installFakes } from '../fakes';

let fakes: Fakes;
let warn: { mock: { calls: unknown[][] } };
beforeEach(() => {
  fakes = installFakes();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  fakes.uninstall();
  vi.restoreAllMocks();
});

type Loose = Record<string, unknown>;
function mount(options: Loose): ChartHandle<any> {
  return fakes.mount(options as never);
}

/** The snaplot warnings printed so far. */
function warnings(): string[] {
  return warn.mock.calls
    .map((call) => call.map(String).join(' '))
    .filter((m) => /snaplot/i.test(m));
}

const rows = Array.from({ length: 12 }, (_, t) => ({ t, v: 10 + (t % 4) }));
const base = { data: rows, x: 't', series: [{ y: 'v' }] };

describe('[arch-10] unknown option keys warn', () => {
  it('[arch-10] an unknown top-level key warns once, naming the key', () => {
    mount({ ...base, colour: 'red' });
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toMatch(/^snaplot: /);
    expect(warnings()[0]).toMatch(/"colour"/);
  });

  it('[arch-10] 24 charts with the same unknown key print one warning per page', () => {
    for (let i = 0; i < 24; i++) mount({ ...base, sparkle: true });
    expect(warnings().filter((m) => /sparkle/.test(m))).toHaveLength(1);
  });

  it('[arch-10] different unknown keys print different warnings', () => {
    mount({ ...base, alpha1: 1 });
    mount({ ...base, alpha2: 2 });
    expect(warnings().filter((m) => /alpha[12]/.test(m))).toHaveLength(2);
  });

  it('[arch-10] a nested unknown key names its path', () => {
    mount({ ...base, axes: { y: { titel: 'Load' } } });
    mount({ data: rows, x: 't', series: [{ y: 'v', widht: 2 }] });
    mount({ ...base, streaming: { maxPointz: 10 } });
    const text = warnings().join('\n');
    expect(text).toMatch(/axes\.y\.titel/);
    expect(text).toMatch(/series\[0\]\.widht/);
    expect(text).toMatch(/streaming\.maxPointz/);
  });

  it('[arch-10] a misspelled key suggests the option it is closest to', () => {
    mount({ ...base, ariaLabl: 'CPU' });
    expect(warnings().join('\n')).toMatch(/did you mean "ariaLabel"/i);
  });

  it('[arch-10] a 0.12 plugin hook and a misspelled hook warn, naming the plugin key', () => {
    mount({
      ...base,
      plugins: [{ id: 'old-hooks', onDataUpdate() {}, drawAbov() {} }],
    });
    const text = warnings().join('\n');
    expect(text).toMatch(/"plugins\[0\]\.onDataUpdate" is not a plugin hook/);
    expect(text).toMatch(/"plugins\[0\]\.drawAbov" is not a plugin hook.*Did you mean "drawAbove"/);
  });

  it('[arch-10] a plugin object may hold its own data and helpers without a warning', () => {
    mount({
      ...base,
      plugins: [
        {
          id: 'stateful',
          options: { color: 'red' },
          count: 0,
          format: (value: number) => value.toFixed(1),
          drawAbove() {},
        },
      ],
    });
    expect(warnings()).toEqual([]);
  });

  it('known keys print nothing (control)', () => {
    mount({ ...base, ariaLabel: 'CPU', axes: { y: { title: 'Load' } } });
    expect(warnings()).toEqual([]);
  });
});

describe('[arch-15] removed options name their replacement', () => {
  /** A test body: mounting with `extra` warns, naming `name` and matching `hint`. */
  const removed = (name: string, extra: Loose, hint: RegExp) => () => {
    mount({ ...base, ...extra });
    const text = warnings().join('\n');
    expect(text).toMatch(new RegExp(`"${name}`));
    expect(text).toMatch(hint);
  };

  it(
    '[arch-15] padding warns with its replacement',
    removed('padding', { padding: { left: 60 } }, /padding/),
  );
  it('[arch-15] width warns with its replacement', removed('width', { width: 640 }, /width/));
  it(
    '[arch-15] autoResize warns with its replacement',
    removed('autoResize', { autoResize: false }, /autoResize/),
  );
  it(
    '[arch-15] zoom warns with its replacement',
    removed('zoom', { zoom: { wheelStep: 0.2 } }, /interaction/),
  );
  it(
    '[arch-15] pan warns with its replacement',
    removed('pan', { pan: { y: true } }, /interaction/),
  );
  it(
    '[arch-15] touch warns with its replacement',
    removed('touch', { touch: { drag: 'pan' } }, /interaction/),
  );
  it(
    '[arch-15] performance warns with its replacement',
    removed('performance', { performance: { interactionSampling: false } }, /performance/),
  );
  it(
    '[arch-15] debug warns with its replacement',
    removed('debug', { debug: { stats: true } }, /debug/),
  );
  it(
    '[arch-15] onSelect warns with its replacement',
    removed('onSelect', { onSelect: () => {} }, /onSelectionChange/),
  );

  it('[arch-15] removed axis, series and region keys name their 1.0 names', () => {
    mount({
      data: rows,
      x: 't',
      series: [{ y: 'v', stroke: '#d55e00', lineDash: [2, 2] }],
      axes: { y: { roundBounds: false, tickCount: 4 } },
      referenceRegions: [{ axis: 'x', from: 1, to: 2, fill: '#eee' }],
      theme: { backgroundColor: '#fff' },
      tooltip: { xFormat: String },
      cursor: { color: '#d55e00' },
      highlight: { dimOpacity: 0.5 },
    });
    const text = warnings().join('\n');
    expect(text).toMatch(/stroke.*color/);
    expect(text).toMatch(/lineDash.*dash/);
    expect(text).toMatch(/roundBounds.*nice/);
    expect(text).toMatch(/tickCount/);
    expect(text).toMatch(/fill.*color/);
    expect(text).toMatch(/backgroundColor.*surface/);
    expect(text).toMatch(/xFormat.*format/);
    expect(text).toMatch(/cursor\.color.*accent/);
    expect(text).toMatch(/highlight/);
  });

  // fill is the area and band fill. Bars, points and histogram bars take color (0.12 bars
  // took fill), so fill there warns and is ignored, and the legend shows what the marks draw.
  it('[arch-15] fill on a bar, scatter or histogram series warns and is ignored', () => {
    const bar = mount({ data: rows, x: 't', series: [{ type: 'bar', y: 'v', fill: '#ff0001' }] });
    mount({ data: rows, x: 't', series: [{ type: 'scatter', y: 'v', fill: '#ff0002' }] });
    const bins = mount({
      series: [{ id: 'h', type: 'histogram', data: histogram([1, 2, 2, 3]), fill: '#ff0003' }],
    });
    const text = warnings().join('\n');
    for (const type of ['bar', 'scatter', 'histogram'])
      expect(text).toMatch(
        new RegExp(
          `"series\\[0\\]\\.fill" is not an option of ${type} series and is ignored\\. Use color\\.`,
        ),
      );
    expect(JSON.stringify(bar.getState().series)).not.toMatch(/#ff0001/);
    expect(JSON.stringify(bins.getState().series)).not.toMatch(/#ff0003/);
  });

  it('fill on line, area and band series prints nothing (control)', () => {
    mount({ ...base, series: [{ y: 'v', fill: '#ff0004' }] });
    mount({ ...base, series: [{ type: 'area', y: 'v', fill: null }] });
    mount({ ...base, series: [{ type: 'band', y: 'v', lower: 'v', upper: 'v', fill: '#ff0005' }] });
    expect(warnings()).toEqual([]);
  });
});

describe('[dataapi-13][dxtrial-08] epoch-like numbers on an inferred linear X', () => {
  const at = (t: number) => Date.UTC(2026, 0, 1) + t * 60_000;

  it('[dataapi-13][dxtrial-08] epoch milliseconds on an inferred X warn once', () => {
    const data = rows.map((row) => ({ ...row, t: at(row.t) }));
    mount({ ...base, data });
    mount({ ...base, data });
    const epoch = warnings().filter((m) => /type: 'time'/.test(m));
    expect(epoch).toHaveLength(1);
    expect(epoch[0]).toMatch(/^snaplot: /);
  });

  it("an explicit axes.x.type 'time' or 'linear' prints nothing (control)", () => {
    const data = rows.map((row) => ({ ...row, t: at(row.t) }));
    mount({ ...base, data, axes: { x: { type: 'time' } } });
    mount({ ...base, data, axes: { x: { type: 'linear' } } });
    expect(warnings()).toEqual([]);
  });

  it('small numbers and epoch-like Y values print nothing (control)', () => {
    mount({ data: rows.map((row) => ({ t: row.t, v: at(row.t) })), x: 't', series: [{ y: 'v' }] });
    expect(warnings()).toEqual([]);
  });
});

describe('[dataapi-02] accessor churn on large sources (≥ 10,000 rows)', () => {
  const big = Array.from({ length: 10_000 }, (_, t) => ({ t, v: t % 17 }));

  it('[dataapi-02] three consecutive identity-only accessor changes warn once', () => {
    const chart = mount({ data: big, x: 't', series: [{ id: 'v', y: (row: Loose) => row.v }] });
    for (let i = 0; i < 4; i++)
      chart.update({ series: [{ id: 'v', y: (row: Loose) => row.v }] } as never);
    const churn = warnings().filter((m) => /memoi[sz]e|field name/i.test(m));
    expect(churn).toHaveLength(1);
    expect(churn[0]).toMatch(/^snaplot: /);
  });

  it('a 9,999-row source never warns (control)', () => {
    const small = big.slice(1);
    const chart = mount({ data: small, x: 't', series: [{ id: 'v', y: (row: Loose) => row.v }] });
    for (let i = 0; i < 6; i++)
      chart.update({ series: [{ id: 'v', y: (row: Loose) => row.v }] } as never);
    expect(warnings()).toEqual([]);
  });

  it('a field-name series never warns (control)', () => {
    const chart = mount({ data: big, x: 't', series: [{ y: 'v' }] });
    for (let i = 0; i < 6; i++) chart.update({ series: [{ y: 'v', label: `V${i}` }] } as never);
    expect(warnings()).toEqual([]);
  });
});

describe('[dataapi-20][arch-11] messages use the public vocabulary (P16)', () => {
  /** Engine words that must never reach a user (P16), and the banned phrase. */
  const ENGINE =
    /\b(dataIndex|xDataIndex|yDataIndex|maxLen|tickFormat|syncKey|gutter|setDataCount|setData|xAxisKey|yAxisKey|ChartCore|ColumnarData)\b|live window/i;

  function messages(run: () => unknown): string[] {
    const out: string[] = [];
    try {
      run();
    } catch (error) {
      out.push((error as Error).message);
    }
    return [...out, ...warnings()];
  }

  /** A test body: every message `run` throws or warns is public and uses no engine word. */
  const publicNames = (run: () => unknown) => () => {
    const found = messages(run);
    expect(found.length).toBeGreaterThan(0);
    for (const message of found) {
      expect(message).toMatch(/^snaplot: /);
      expect(message).not.toMatch(ENGINE);
    }
  };

  it(
    '[dataapi-20][arch-11] negative maxPoints reads in public names',
    publicNames(() => mount({ ...base, streaming: { maxPoints: -1 } })),
  );
  it(
    '[dataapi-20][arch-11] an unsorted append reads in public names',
    publicNames(() => mount(base).appendData([{ t: -5, v: 1 }])),
  );
  it(
    '[dataapi-20][arch-11] a column append with the wrong columns reads in public names',
    publicNames(() =>
      mount({
        data: { columns: { t: Float64Array.of(0, 1), v: Float64Array.of(1, 2) } },
        x: 't',
        series: [{ y: 'v' }],
      }).appendData({ columns: { t: Float64Array.of(2) } }),
    ),
  );
  it(
    '[dataapi-20][arch-11] a band without bounds reads in public names',
    publicNames(() => mount({ data: rows, x: 't', series: [{ type: 'band', y: 'v' }] })),
  );
  it(
    '[dataapi-20][arch-11] a histogram given rows reads in public names',
    publicNames(() => mount({ ...base, series: [{ id: 'h', type: 'histogram' }] })),
  );
  it(
    '[dataapi-20][arch-11] an unknown series in appendData reads in public names',
    publicNames(() => mount(base).appendData(rows, { seriesId: 'nope' })),
  );
  it(
    '[dataapi-20][arch-11] array rows read in public names',
    publicNames(() => mount({ data: [[0, 1]], x: 't', series: [{ y: 'v' }] })),
  );
});

describe('[gap-annotations-extensibility-13] annotation values and styles', () => {
  it('[gap-annotations-extensibility-13] a string on a numeric axis names the axis kind', () => {
    const message = (() => {
      try {
        mount({ ...base, referenceLines: [{ axis: 'x', value: '5' }] });
      } catch (error) {
        return (error as Error).message;
      }
      return '';
    })();
    expect(message).toMatch(/^snaplot: referenceLines\[0\]\.value is "5", but axis "x" is numeric/);
    expect(message).not.toMatch(/categor/);
  });

  it('[gap-annotations-extensibility-13] a Date on a linear axis warns that it is read as epoch ms', () => {
    mount({ ...base, referenceLines: [{ axis: 'x', value: new Date(5) }] });
    expect(warnings().join('\n')).toMatch(
      /referenceLines\[0\]\.value is a Date, but axis "x" is not a time axis.*axes\.x\.type: 'time'/,
    );
  });

  it('[gap-annotations-extensibility-13] a number beyond every category warns', () => {
    mount({
      data: [
        { q: 'A', v: 1 },
        { q: 'B', v: 2 },
        { q: 'C', v: 3 },
      ],
      x: 'q',
      series: [{ type: 'bar', y: 'v' }],
      referenceLines: [{ axis: 'x', value: 40 }],
    });
    expect(warnings().join('\n')).toMatch(
      /referenceLines\[0\]\.value is 40, which is beyond the 3 categories of axis "x"; give a category label/,
    );
  });

  it('[gap-annotations-extensibility-13] invalid style values warn and are ignored', () => {
    mount({
      ...base,
      referenceLines: [{ axis: 'y', value: 11, lineWidth: Number.NaN }],
      referenceRegions: [{ axis: 'x', from: 2, to: 4, opacity: -0.5 }],
    });
    const text = warnings().join('\n');
    expect(text).toMatch(/referenceLines\[0\]\.lineWidth NaN is not valid and is ignored/);
    expect(text).toMatch(/referenceRegions\[0\]\.opacity -0\.5 is not valid and is ignored/);
  });

  it('[gap-annotations-extensibility-13] a colour that is not a string warns and is ignored', () => {
    mount({
      ...base,
      referenceLines: [{ axis: 'y', value: 11, color: 42 }],
      referenceRegions: [{ axis: 'x', from: 2, to: 4, color: { r: 255 } }],
    });
    const text = warnings().join('\n');
    expect(text).toMatch(
      /referenceLines\[0\]\.color 42 is not valid and is ignored; it must be a CSS colour string/,
    );
    expect(text).toMatch(/referenceRegions\[0\]\.color an object is not valid and is ignored/);
  });

  it('a category label and an in-range slot do not warn (control)', () => {
    mount({
      data: [
        { q: 'A', v: 1 },
        { q: 'B', v: 2 },
      ],
      x: 'q',
      series: [{ type: 'bar', y: 'v' }],
      referenceRegions: [{ axis: 'x', from: 'A', to: 1.5 }],
    });
    expect(warnings()).toEqual([]);
  });
});
