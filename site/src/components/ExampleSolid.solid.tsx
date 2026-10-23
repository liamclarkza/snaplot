/** @jsxImportSource solid-js */
import type { ChartOptions } from 'snaplot';
import { Chart } from 'snaplot/solid';
import { type Component, Match, Switch, createSignal, onMount } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { EXAMPLE_HEIGHT, type ExampleKind } from '../lib/examples';

// The Solid tab of an <Example>. It loads only the example it shows, after hydration, and renders
// it exactly as the tab's code does: <Chart {...options} height={280} />, or the example component.
const optionModules = import.meta.glob<{ default: ChartOptions<any> }>(
  '../examples/**/*.options.ts',
);
const componentModules = import.meta.glob<{ default: Component }>('../examples/**/*.solid.tsx');

export default function ExampleSolid(props: { name: string; kind: ExampleKind }) {
  const [options, setOptions] = createSignal<ChartOptions<any>>();
  const [component, setComponent] = createSignal<Component>();
  onMount(() => {
    if (props.kind === 'options') {
      void required(optionModules, `../examples/${props.name}.options.ts`).then((m) =>
        setOptions(() => m.default),
      );
    } else {
      void required(componentModules, `../examples/${props.name}.solid.tsx`).then((m) =>
        setComponent(() => m.default),
      );
    }
  });
  // Always an element: Astro's server render needs one to place the island.
  return (
    <div class="example-island">
      <Switch>
        <Match when={options()}>
          {(loaded) => <Chart {...loaded()} height={EXAMPLE_HEIGHT} />}
        </Match>
        <Match when={component()}>{(loaded) => <Dynamic component={loaded()} />}</Match>
      </Switch>
    </div>
  );
}

function required<T>(modules: Record<string, () => Promise<T>>, path: string): Promise<T> {
  const load = modules[path];
  if (!load) return Promise.reject(new Error(`snaplot site: no example at ${path}`));
  return load();
}
