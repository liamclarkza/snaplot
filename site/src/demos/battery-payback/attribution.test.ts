// The page's footer credits the data with SOURCE.md's attribution line and licence (plan §10.1
// #4, #9); the Playwright spec checks the rendered footer too.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import source from '../../../public/data/battery-payback/SOURCE.md?raw';

const read = () =>
  readFileSync(new URL('../../pages/examples/battery-payback.astro', import.meta.url), 'utf8');
const section = (heading: string) =>
  (source.split(`## ${heading}\n\n`)[1] ?? '').split('\n')[0]?.trim() ?? '';

describe('[battery-payback] attribution', () => {
  // Tests first: the page lands with the demo (M16b).
  it.fails('the footer carries the SOURCE.md attribution line and licence', () => {
    const page = read();
    const line = section('Attribution');
    const licence = section('Licence').replace(/[()]/g, '');
    expect(line.length).toBeGreaterThan(20);
    expect(page).toContain(`Data: ${line} (${licence})`);
    expect(page).toContain('/site/src/demos/battery-payback');
  });
});
