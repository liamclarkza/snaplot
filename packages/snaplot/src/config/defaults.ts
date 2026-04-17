import type { ChartConfig } from '../types';
import { DEFAULT_THEME, DEFAULT_PADDING } from '../constants';

export { DEFAULT_THEME };

export const DEFAULT_CONFIG: ChartConfig = {
  autoResize: true,
  padding: { ...DEFAULT_PADDING },
  series: [],
  cursor: {
    show: true,
    snap: true,
    xLine: true,
    yLine: false,
  },
  zoom: {
    enabled: true,
    x: true,
    y: false,
    wheelFactor: 1.1,
  },
  pan: {
    enabled: true,
    x: true,
    y: false,
  },
  tooltip: {
    show: true,
    mode: 'index',
    offset: 12,
  },
  highlight: {
    enabled: true,
    dimOpacity: 0.2,
  },
  plugins: [],
};
