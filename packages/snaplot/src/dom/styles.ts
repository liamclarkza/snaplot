/**
 * Injected styles (plan D8): the W5 contract `adoptStyles(root, id, css)` (§3.2). Every stylesheet
 * snaplot needs (the tooltip's, the interim legend's, later the focus ring) goes through it.
 *
 * M9b implements it over the interim legend's mechanism: one `<style data-snaplot-styles>`
 * element per root, in the document's `<head>` or at the end of a shadow root, holding each `id`'s
 * block once, in adoption order. A block adopted again with the same `id` is not added twice; an
 * element the page removed is recreated, with every block, on the next call. A `<style>` element
 * is blocked by a strict CSP (`style-src` without `'unsafe-inline'`): M12b reimplements this with
 * adopted stylesheets and `:where()` selectors behind the same signature.
 */

/** A root that holds stylesheets: a document, or a shadow root. */
export type StyleRoot = Document | ShadowRoot;

interface RootSheet {
  style: HTMLStyleElement | null;
  /** Each adopted block by id, in adoption order. */
  blocks: Map<string, string>;
}

const sheets = new WeakMap<StyleRoot, RootSheet>();

const isShadowRoot = (root: Node): root is ShadowRoot =>
  typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot;

/** The root whose stylesheet styles `node`: its shadow root, else its document. */
export function styleRootOf(node: Node): StyleRoot {
  const root = node.getRootNode();
  return isShadowRoot(root) ? root : (node.ownerDocument ?? (node as Document));
}

/** Add `css` to `root`'s snaplot stylesheet under `id`, once (see the module comment). */
export function adoptStyles(root: StyleRoot, id: string, css: string): void {
  let sheet = sheets.get(root);
  if (!sheet) {
    sheet = { style: null, blocks: new Map() };
    sheets.set(root, sheet);
  }
  const known = sheet.blocks.has(id);
  if (!known) sheet.blocks.set(id, css);
  if (known && sheet.style?.isConnected) return;

  if (!sheet.style?.isConnected) {
    const doc = isShadowRoot(root) ? root.ownerDocument : root;
    const parent = isShadowRoot(root) ? root : doc.head;
    if (!parent) return;
    const style = doc.createElement('style');
    style.dataset.snaplotStyles = '';
    style.textContent = [...sheet.blocks.values()].join('\n');
    parent.append(style);
    sheet.style = style;
    return;
  }
  sheet.style.textContent = [...sheet.blocks.values()].join('\n');
}
