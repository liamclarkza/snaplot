// Geometry findings owned by M10 (axes, ticks, domains, time, annotations). Format: ./known.ts.
import { fixed, type KnownFinding } from './known';

const entries: KnownFinding[] = [
  fixed('M10', 'axes/titles-320', 'overlap', 'visuals-21:def-01'),
  fixed('M10', 'axes/titles-320', 'inside', 'visuals-21:def-01'),
  fixed('M10', 'axes/titles-480', 'inside', 'visuals-21:def-01'),
  fixed('M10', 'axes/long-ticks-320', 'overlap', 'render-14'),
  fixed('M10', 'axes/categories-30-480', 'overlap', 'visuals-21:def-03'),
  fixed('M10', 'axes/categories-30-320', 'overlap', 'render-02'),
  fixed('M10', 'axes/format-collapse', 'repeat', 'render-19'),
  fixed('M10', 'axes/histogram-tiny-range', 'repeat', 'render-08'),
  fixed('M10', 'axes/min-font-24', 'overlap', 'gap-environments-07'),
  fixed('M10', 'axes/min-font-24', 'inside', 'gap-environments-07'),
];

export default entries;
