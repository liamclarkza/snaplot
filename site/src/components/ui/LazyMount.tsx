import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import type { JSX } from 'solid-js';

/**
 * Defers mounting its children until the placeholder scrolls near the
 * viewport (one-shot: once mounted, stays mounted so chart state
 * survives scrolling away). The docs pages mount every live demo
 * through this so initial load only pays for what is on screen.
 */
export default function LazyMount(props: { estHeight?: string; children: JSX.Element }) {
  const [visible, setVisible] = createSignal(false);
  let ref!: HTMLDivElement;

  onMount(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      // Generous margin: demos resolve well before the reader reaches
      // them, so the placeholder swap is invisible in practice.
      { rootMargin: '800px 0px' },
    );
    io.observe(ref);
    onCleanup(() => io.disconnect());
  });

  return (
    <div ref={ref!} style={{ 'min-height': visible() ? undefined : (props.estHeight ?? '320px') }}>
      <Show when={visible()}>{props.children}</Show>
    </div>
  );
}

/**
 * Signal tracking whether an element is on screen (with a small margin).
 * Streaming demos use it to pause their append timers while scrolled
 * out of view instead of animating an invisible chart.
 */
export function createInViewport(getEl: () => HTMLElement | undefined) {
  const [inView, setInView] = createSignal(false);

  onMount(() => {
    const el = getEl();
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setInView(e.isIntersecting);
      },
      { rootMargin: '100px 0px' },
    );
    io.observe(el);
    onCleanup(() => io.disconnect());
  });

  return inView;
}
