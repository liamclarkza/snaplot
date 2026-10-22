/** Shared challenge contract, not a proposed Snaplot API. All adapters receive identical rows. */
export type LibraryId = 'snaplot' | 'chartjs' | 'recharts' | 'echarts';
export type ScenarioId = 'uav' | 'f1' | 'ml' | 'transport' | 'biology';
export type ThemeMode = 'dark' | 'light';
export type DataState = 'ready' | 'gaps' | 'empty';
export interface Row { x: number; [key: string]: number | null }
export interface TrialSeries {
  id: string;
  label: string;
  color: string;
  kind: 'line' | 'area' | 'bar' | 'scatter';
  axis?: 'right';
}
export interface ChartSpec {
  id: string;
  title: string;
  subtitle: string;
  xLabel: string;
  yLabel: string;
  rightLabel?: string;
  xScale?: 'log';
  yScale?: 'log';
  xFormat?: (value: number) => string;
  yFormat?: (value: number) => string;
  yDomain?: [number, number];
  rightDomain?: [number, number];
  reference?: { value: number; label: string };
  series: TrialSeries[];
  rows: Row[];
}
export interface ChartAdapterProps {
  spec: ChartSpec;
  theme: ThemeMode;
  /** Stable series IDs hidden by the shared, accessible legend. */
  hidden: string[];
}
export interface Scenario {
  id: ScenarioId;
  number: string;
  name: string;
  product: string;
  eyebrow: string;
  title: string;
  description: string;
  accent: string;
  operator: string;
  metrics: { label: string; value: string; detail: string }[];
  table: { headings: string[]; rows: string[][] };
  challenges: string[];
}
export const chartColors = {
  dark: { background: '#151e22', text: '#dce5e8', muted: '#84969e', grid: '#29383e' },
  light: { background: '#ffffff', text: '#1c3039', muted: '#5a6d76', grid: '#e4eaed' },
};
