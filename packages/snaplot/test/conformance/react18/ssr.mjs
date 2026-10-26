// React 18's server render for conformance scenario #21. It lives in the fixture so that
// `react`, `react-dom/server` and `snaplot/react` resolve to the fixture's copies (React 18.3.1
// and the packed tarball). Prints `{ html, messages }` as JSON.
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Chart } from 'snaplot/react';
import { SSR_PROPS } from '../ssr-props.mjs';

const messages = [];
console.error = (...args) => messages.push(`error: ${args.map(String).join(' ')}`);
console.warn = (...args) => messages.push(`warn: ${args.map(String).join(' ')}`);
const html = renderToString(createElement(Chart, SSR_PROPS));
process.stdout.write(JSON.stringify({ html, messages }));
