/**
 * Canvas charts for live data: one options object, the same in vanilla JavaScript, React and
 * Solid. Start with {@link createChart}.
 *
 * @example
 * ```ts
 * import { createChart } from 'snaplot';
 *
 * const chart = createChart(document.getElementById('cpu')!, {
 *   data: rows,
 *   x: 'time',
 *   series: [{ y: 'cpu', label: 'CPU' }, { y: 'mem', label: 'Memory' }],
 *   ariaLabel: 'CPU and memory',
 * });
 * ```
 *
 * @module snaplot
 */
export * from './core';
