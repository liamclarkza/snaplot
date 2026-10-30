/**
 * Call `onResize` whenever `element`'s size changes (the built-in legend as it wraps). Returns the
 * stop function; without ResizeObserver (jsdom, SSR) it never calls.
 */
export function observeSize(element: Element, onResize: () => void): () => void {
  if (typeof ResizeObserver === 'undefined') return () => {};
  const observer = new ResizeObserver(() => onResize());
  observer.observe(element);
  return () => observer.disconnect();
}
