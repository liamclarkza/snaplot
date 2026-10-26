/**
 * The fixture registry. Areas follow the W5 ownership split (plan §12): `axes` (M10), `marks`,
 * `theme` and `layout` (M11), `overlay` (M12a), `legend` (M8's interim legend, then M12b).
 */
import { fixtures as axes } from './axes';
import { fixtures as layout } from './layout';
import { fixtures as legend } from './legend';
import { fixtures as marks } from './marks';
import { fixtures as overlay } from './overlay';
import { fixtures as theme } from './theme';
import type { Fixture, Shot } from './types';

export type { ColorScheme, Fixture, FixtureLib, GeometryCheck, Shot } from './types';

const ID = /^[a-z0-9]+\/[a-z0-9-]+$/;

function validate(list: readonly Fixture[]): Fixture[] {
  const seen = new Set<string>();
  for (const fixture of list) {
    if (!ID.test(fixture.id)) throw new Error(`fixture id "${fixture.id}" must match ${ID}`);
    if (seen.has(fixture.id)) throw new Error(`duplicate fixture id "${fixture.id}"`);
    if (fixture.schemes && !fixture.id.startsWith('theme/')) {
      throw new Error(`${fixture.id}: only theme fixtures render under both colour schemes`);
    }
    seen.add(fixture.id);
  }
  return [...list];
}

export const FIXTURES: readonly Fixture[] = validate([
  ...axes,
  ...marks,
  ...theme,
  ...layout,
  ...overlay,
  ...legend,
]);

export function findFixture(id: string): Fixture | undefined {
  return FIXTURES.find((fixture) => fixture.id === id);
}

function shot(fixture: Fixture, suffix: string, dpr: 1 | 2, scheme: Shot['scheme']): Shot {
  const name = `${fixture.id}${suffix}`;
  const [area, rest] = name.split('/') as [string, string];
  return { fixture, name, path: [area, `${rest}.png`], dpr, scheme };
}

/** Every screenshot the visual project takes: one per fixture, scheme and device pixel ratio. */
export const SHOTS: readonly Shot[] = FIXTURES.flatMap((fixture) => {
  const shots = fixture.schemes
    ? [shot(fixture, '@light', 1, 'light'), shot(fixture, '@dark', 1, 'dark')]
    : [shot(fixture, '', 1, 'light')];
  if (fixture.dpr2) shots.push(shot(fixture, '@2x', 2, 'light'));
  return shots;
});
