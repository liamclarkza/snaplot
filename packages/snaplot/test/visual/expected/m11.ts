// Geometry findings owned by M11 (marks, theme, surface, sizing). Format: ./known.ts.
import { fails, type KnownFinding } from './known';

const entries: KnownFinding[] = [
  fails('M11', 'axes/single-320', 'paints', 'visuals-21:def-04'),
  fails('M11', 'marks/isolated-points', 'paints', 'render-05'),
];

export default entries;
