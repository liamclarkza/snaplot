import type { ChartSpec } from './spec';
import { DEFAULT_THEME } from '../constants';

export { DEFAULT_THEME };

export const DEFAULT_CONFIG: ChartSpec = {
  autoResize: true,
  series: [],
  cursor: {
    show: true,
    snap: true,
    yLine: false,
  },
  zoom: {
    enabled: true,
    x: true,
    y: false,
    wheelStep: 0.1,
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
};
