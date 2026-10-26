// The server renders of conformance scenario #21 for React 19 and Solid (React 18's is
// react18/ssr.mjs): each with the server conditions Node resolves (`snaplot/solid` is then
// dist/solid.server.js), recording every console message the render prints. build.mjs runs it
// with NODE_ENV=development, so React's server warnings are on. Prints JSON.
import { createElement } from 'react';
import { renderToString as reactToString } from 'react-dom/server';
import { Chart as ReactChart } from 'snaplot/react';
import { Chart as SolidChart } from 'snaplot/solid';
import { createComponent, generateHydrationScript, renderToString } from 'solid-js/web';
import { SSR_PROPS } from './ssr-props.mjs';

let messages = [];
console.error = (...args) => messages.push(`error: ${args.map(String).join(' ')}`);
console.warn = (...args) => messages.push(`warn: ${args.map(String).join(' ')}`);
const capture = (render) => {
  messages = [];
  const html = render();
  return { html, messages };
};

const react19 = capture(() => reactToString(createElement(ReactChart, SSR_PROPS)));
const solid = capture(() => renderToString(() => createComponent(SolidChart, SSR_PROPS)));
solid.script = generateHydrationScript().match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
process.stdout.write(JSON.stringify({ react19, solid }));
