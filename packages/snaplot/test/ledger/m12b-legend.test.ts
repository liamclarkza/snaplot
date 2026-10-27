// @vitest-environment jsdom
// Known M12b defects (plan §5.6, RC12): one built-in legend and one legend
// table in core, styled without any CSS import. The final names are used
// (`legend` option, `createLegendTable`), read through a namespace import
// because they do not exist yet. Public API, fakes and debug() only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as snaplot from '../../src/index';
import type { ChartHandle } from '../../src/index';
import { type Fakes, installFakes } from '../fakes';

let fakes: Fakes;
beforeEach(() => {
  fakes = installFakes();
});
afterEach(() => {
  fakes.uninstall();
  vi.restoreAllMocks();
});

type Row = { t: number; cpu: number; mem: number };
const rows: Row[] = Array.from({ length: 30 }, (_, t) => ({ t, cpu: 40 + (t % 7), mem: 60 }));

function mountTwo(extra: Record<string, unknown> = {}): ChartHandle<Row> {
  return fakes.mount<Row>(
    {
      data: rows,
      x: 't',
      series: [
        { y: 'cpu', label: 'CPU' },
        { y: 'mem', label: 'Memory' },
      ],
      ...extra,
    } as never,
    { width: 390, height: 240 },
  );
}

const legendButtons = (chart: ChartHandle<Row>) => [
  ...chart.container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'),
];

/** Every stylesheet text the document (or an adopted sheet) carries. */
function styleText(): string {
  const inline = [...document.querySelectorAll('style')].map((style) => style.textContent ?? '');
  const adopted = (document.adoptedStyleSheets ?? []).flatMap((sheet) =>
    [...sheet.cssRules].map((rule) => rule.cssText),
  );
  return [...inline, ...adopted].join('\n');
}

type LegendTableFactory = (
  element: HTMLElement,
  options: { chart: ChartHandle<Row>; columns?: unknown[] },
) => { destroy(): void };
const createLegendTable = (snaplot as unknown as { createLegendTable?: LegendTableFactory })
  .createLegendTable;

describe('[dxtrial-06][demos-13] an automatic, styled legend', () => {
  it('[dxtrial-06][demos-13] two series show a legend with one button per series', () => {
    const chart = mountTwo();
    expect(legendButtons(chart).map((button) => button.textContent?.trim())).toEqual([
      'CPU',
      'Memory',
    ]);
  });

  it('[dxtrial-06] the legend is styled without importing any CSS file', () => {
    const buttons = legendButtons(mountTwo());
    expect(buttons).toHaveLength(2);
    // Computed styles (plan RC12): padded buttons and a 12 px swatch, from the
    // injected styles alone. The muted text colour is checked in a real browser
    // (test/browser/m12b-legend.spec.ts), where var() resolves.
    for (const button of buttons) {
      const style = getComputedStyle(button);
      expect(parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)).toBeGreaterThan(0);
      const swatch = [...button.querySelectorAll<HTMLElement>('*')].find(
        (node) => getComputedStyle(node).width === '12px',
      );
      expect(swatch, 'a 12 px swatch').toBeDefined();
    }
  });

  it('[gap-environments-05:swatches] legend swatches keep their colour in forced colours', () => {
    mountTwo();
    expect(styleText()).toMatch(/forced-color-adjust:\s*none/);
  });
});

describe('[interact-21][gap-overhaul-delta-02] legend behaviour', () => {
  it('[interact-21] a legend button keeps its name and toggles aria-pressed', () => {
    const chart = mountTwo();
    const [cpu] = legendButtons(chart);
    expect(cpu?.getAttribute('aria-pressed')).toBe('true');
    const name = cpu?.getAttribute('aria-label') ?? cpu?.textContent;
    cpu?.click();
    fakes.frames.flush();
    const [after] = legendButtons(chart);
    expect(after?.getAttribute('aria-pressed')).toBe('false');
    expect(after?.getAttribute('aria-label') ?? after?.textContent).toBe(name);
  });

  it('[gap-overhaul-delta-02] update({ theme }) recolours the legend swatches', () => {
    const chart = mountTwo();
    const swatchColours = () =>
      [...chart.container.querySelectorAll<HTMLElement>('button[aria-pressed] *')]
        .map((node) => node.style.backgroundColor || node.style.color || node.style.borderColor)
        .filter(Boolean)
        .join(' ');
    const before = swatchColours();
    expect(before).not.toBe('');
    chart.update({ theme: { categorical: ['#ff0000', '#00ff00'] } });
    fakes.frames.flush();
    expect(swatchColours()).not.toBe(before);
  });
});

describe('[frameworks-01][frameworks-08][frameworks-20] the core legend table', () => {
  it('[frameworks-01] the latest value refreshes after a data change in a fixed viewport', () => {
    const chart = mountTwo({ legend: false });
    const host = document.createElement('div');
    document.body.append(host);
    createLegendTable?.(host, { chart, columns: ['name', 'value'] });
    fakes.frames.flush();
    chart.update({
      data: rows.map((row, i) => (i === rows.length - 1 ? { ...row, cpu: 44 } : row)),
    });
    fakes.frames.flush();
    expect(host.textContent).toContain('44');
  });

  it('[frameworks-08] a cursor move keeps focus inside an interactive cell', () => {
    const chart = mountTwo({ legend: false });
    const host = document.createElement('div');
    document.body.append(host);
    createLegendTable?.(host, {
      chart,
      columns: [
        'name',
        {
          header: 'Pin',
          value: () => {
            const button = document.createElement('button');
            button.className = 'pin';
            button.textContent = 'Pin';
            return button;
          },
        },
      ],
    });
    fakes.frames.flush();
    const button = host.querySelector<HTMLButtonElement>('button.pin');
    button?.focus();
    for (let x = 5; x < 15; x++) chart.setCursor(x);
    fakes.frames.flush();
    expect(button).not.toBeNull();
    expect(document.activeElement).toBe(button);
    expect(host.contains(button)).toBe(true);
  });

  it('[frameworks-20] the table header is the X axis title and value, never "Step:"', () => {
    const chart = mountTwo({ legend: false, axes: { x: { title: 'Time (s)' } } });
    const host = document.createElement('div');
    document.body.append(host);
    createLegendTable?.(host, { chart });
    chart.setCursor(12);
    fakes.frames.flush();
    expect(host.textContent).toContain('Time (s)');
    expect(host.textContent).not.toContain('Step:');
  });
});
