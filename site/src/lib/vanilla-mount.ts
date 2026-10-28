/**
 * `<snaplot-vanilla-mount data-name="…" data-kind="options|files">`: mounts an example from
 * src/examples/ with the vanilla API on first sight, the way the islands do with client:visible.
 * Example.astro uses it for its Vanilla tab and ChartTypeCards.astro for its pictures; each script
 * imports this module, which defines the element once. `data-still` mounts an options example as a
 * picture: readonly, without a tooltip, crosshair or legend.
 */
import type { ChartHandle, ChartOptions } from 'snaplot';

const optionModules = import.meta.glob<{ default: ChartOptions<any> }>(
  '../examples/**/*.options.ts',
);
const vanillaModules = import.meta.glob<{ default: (el: HTMLElement) => ChartHandle<any> }>([
  '../examples/**/*.ts',
  '!../examples/**/*.options.ts',
  '!../examples/data/**',
]);

/** What a still picture of an options example turns off. */
const STILL = { interaction: 'readonly', tooltip: false, cursor: false, legend: false } as const;

/** An options example as a still picture: no interaction, tooltip, legend or axis titles. */
function still(options: ChartOptions<any>): ChartOptions<any> {
  const axes = Object.fromEntries(
    Object.entries(options.axes ?? {}).map(([key, axis]) => [key, { ...axis, title: undefined }]),
  );
  return { ...options, ...STILL, axes };
}

class SnaplotVanillaMount extends HTMLElement {
  #chart: ChartHandle<any> | undefined;
  #observer: IntersectionObserver | undefined;
  #disconnected = false;

  connectedCallback(): void {
    this.#disconnected = false;
    this.#observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      this.#observer?.disconnect();
      void this.#mount();
    });
    this.#observer.observe(this);
  }

  disconnectedCallback(): void {
    this.#disconnected = true;
    this.#observer?.disconnect();
    this.#chart?.destroy();
    this.#chart = undefined;
  }

  async #mount(): Promise<void> {
    const { name, kind } = this.dataset;
    if (kind === 'options') {
      const load = optionModules[`../examples/${name}.options.ts`];
      if (!load) throw new Error(`snaplot site: no options example "${name}"`);
      const [{ createChart }, { default: options }] = await Promise.all([
        import('snaplot'),
        load(),
      ]);
      const picture = this.hasAttribute('data-still');
      if (!this.#disconnected) this.#chart = createChart(this, picture ? still(options) : options);
    } else {
      const load = vanillaModules[`../examples/${name}.ts`];
      if (!load) throw new Error(`snaplot site: no vanilla example "${name}"`);
      const { default: mount } = await load();
      if (!this.#disconnected) this.#chart = mount(this);
    }
  }
}

/** Defines `<snaplot-vanilla-mount>` unless a script already has. */
export function defineVanillaMount(): void {
  if (!customElements.get('snaplot-vanilla-mount')) {
    customElements.define('snaplot-vanilla-mount', SnaplotVanillaMount);
  }
}
