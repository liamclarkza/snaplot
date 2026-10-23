// Geometry findings owned by M10 (axes, ticks, domains, time, annotations). Format: ./known.ts.
import { fails, type KnownFinding } from './known';

const entries: KnownFinding[] = [
  fails('M10', 'axes/titles-320', 'overlap', 'visuals-21:def-01'),
  fails('M10', 'axes/titles-320', 'inside', 'visuals-21:def-01'),
  fails('M10', 'axes/titles-480', 'inside', 'visuals-21:def-01'),
  fails('M10', 'axes/long-ticks-320', 'overlap', 'render-14'),
  fails('M10', 'axes/categories-30-480', 'overlap', 'visuals-21:def-03'),
  fails('M10', 'axes/categories-30-320', 'overlap', 'render-02'),
  fails('M10', 'axes/log-under-decade', 'minLabels', 'render-06'),
  fails('M10', 'axes/time-seconds', 'repeat', 'dxtrial-10'),
  fails('M10', 'axes/format-collapse', 'repeat', 'render-19'),
  fails('M10', 'axes/histogram-tiny-range', 'repeat', 'render-08'),
  fails('M10', 'axes/min-font-24', 'overlap', 'gap-environments-07'),
  fails('M10', 'axes/min-font-24', 'inside', 'gap-environments-07'),
];

export default entries;
