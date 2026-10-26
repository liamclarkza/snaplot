// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { adoptStyles, styleRootOf } from './styles';

const ours = (root: ParentNode) => [...root.querySelectorAll('style[data-snaplot-styles]')];

afterEach(() => {
  for (const style of document.querySelectorAll('style')) style.remove();
  document.body.replaceChildren();
});

describe('adoptStyles (dom/styles.ts, the W5 contract)', () => {
  it('keeps one style element per document, each block once, in adoption order', () => {
    adoptStyles(document, 'a', '.a{color:red}');
    adoptStyles(document, 'b', '.b{color:blue}');
    adoptStyles(document, 'a', '.a{color:green}');
    const styles = ours(document.head);
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toBe('.a{color:red}\n.b{color:blue}');
  });

  it('recreates a removed element with every block', () => {
    // The blocks of the first test are still adopted for this document.
    adoptStyles(document, 'c', '.c{}');
    for (const style of ours(document)) style.remove();
    adoptStyles(document, 'c', '.c{}');
    expect(ours(document).map((style) => style.textContent)).toEqual([
      '.a{color:red}\n.b{color:blue}\n.c{}',
    ]);
  });

  it('styles a shadow root inside it, and finds the root of a node', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const inner = document.createElement('span');
    shadow.append(inner);
    expect(styleRootOf(inner)).toBe(shadow);
    expect(styleRootOf(host)).toBe(document);
    expect(styleRootOf(document.createElement('p'))).toBe(document);
    adoptStyles(styleRootOf(inner), 'a', '.a{}');
    expect(ours(shadow)).toHaveLength(1);
    expect(ours(document.head)).toHaveLength(0);
  });
});
