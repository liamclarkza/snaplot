// @ts-check
// A TypeDoc plugin for the API reference: in a page's "Extended by" list, a link to a React or
// Solid declaration names its module, so ChartOptions does not list two identical `ChartProps`.
import { MarkdownPageEvent } from 'typedoc-plugin-markdown';

const SECTION = /^## Extended by\n\n((?:- .*\n)+)/m;
const ADAPTER_LINK = /^- \[`([^`]+)`\]\(([^)]*\/snaplot\/(react|solid)\/[^)]*)\)$/gm;

/** @param {import('typedoc').Application} app */
export function load(app) {
  app.renderer.on(MarkdownPageEvent.END, (page) => {
    if (!page.contents) return;
    page.contents = page.contents.replace(SECTION, (section) =>
      section.replace(ADAPTER_LINK, '- [`$1`]($2) (`snaplot/$3`)'),
    );
  });
}
