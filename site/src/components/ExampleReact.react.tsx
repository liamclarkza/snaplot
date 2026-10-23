import { type ComponentType, useEffect, useState } from 'react';
import { Chart, type ChartProps } from 'snaplot/react';
import { EXAMPLE_HEIGHT, type ExampleKind } from '../lib/examples';

// The React tab of an <Example>. It loads only the example it shows, after hydration, and renders
// it exactly as the tab's code does: <Chart {...options} height={280} />, or the example component.
const optionModules = import.meta.glob<{ default: ChartProps<any> }>('../examples/**/*.options.ts');
const componentModules = import.meta.glob<{ default: ComponentType }>('../examples/**/*.react.tsx');

type Loaded = { options: ChartProps<any> } | { Component: ComponentType };

export default function ExampleReact({ name, kind }: { name: string; kind: ExampleKind }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    let current = true;
    const load: Promise<Loaded> =
      kind === 'options'
        ? required(optionModules, `../examples/${name}.options.ts`).then((m) => ({
            options: m.default,
          }))
        : required(componentModules, `../examples/${name}.react.tsx`).then((m) => ({
            Component: m.default,
          }));
    void load.then((value) => {
      if (current) setLoaded(value);
    });
    return () => {
      current = false;
    };
  }, [name, kind]);
  // Always an element: Astro's server render needs one to place the island.
  return (
    <div className="example-island">
      {loaded &&
        ('options' in loaded ? (
          <Chart {...loaded.options} height={EXAMPLE_HEIGHT} />
        ) : (
          <loaded.Component />
        ))}
    </div>
  );
}

function required<T>(modules: Record<string, () => Promise<T>>, path: string): Promise<T> {
  const load = modules[path];
  if (!load) return Promise.reject(new Error(`snaplot site: no example at ${path}`));
  return load();
}
