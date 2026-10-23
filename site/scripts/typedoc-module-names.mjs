// A TypeDoc plugin for the API reference (plan §8.4): it names each module after the path users
// import it from, not after its entry file, so the reference shows `snaplot`, `snaplot/react` and
// `snaplot/solid` rather than `index`, `react` and `solid`. A module named `index` would also
// collide with the reference's landing page, because Starlight gives `index/index.md` the slug of
// the directory above it. Once M7 adds `@module` doc comments to the entry points, their names no
// longer match the table and this plugin does nothing.
import { Converter, ReflectionKind } from 'typedoc';

const NAMES = { index: 'snaplot', react: 'snaplot/react', solid: 'snaplot/solid' };

/** @param {import('typedoc').Application} app */
export function load(app) {
  app.converter.on(Converter.EVENT_RESOLVE_BEGIN, (context) => {
    for (const module of context.project.getReflectionsByKind(ReflectionKind.Module)) {
      const name = NAMES[module.name];
      if (name) module.name = name;
    }
  });
}
