import type { JSX } from 'solid-js';
import { docsHash } from './nav';

/**
 * Cross-reference between docs pages: renders a route link to
 * `#/docs/<slug>/<id>`; the Docs shell swaps the page and scrolls to the
 * anchor. Use for every "see also" so links survive page splits.
 */
export default function DocsLink(props: { slug: string; id?: string; children: JSX.Element }) {
  return (
    <a
      href={docsHash(props.slug, props.id)}
      style={{ color: 'var(--accent)', 'text-decoration': 'none' }}
    >
      {props.children}
    </a>
  );
}
