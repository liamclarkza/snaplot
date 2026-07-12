import { render } from 'solid-js/web';
import App from './App';
import './styles/global.css';
// The docs workspace aliases `snaplot` to package source for live HMR, so its
// package-exported CSS path is unavailable here. Published consumers use
// `snaplot/legend-table.css` instead.
import '../../packages/snaplot/src/styles/legendTable.css';
import './dogfood/dogfood.css';

render(() => <App />, document.getElementById('app')!);
