import { useEffect, useRef } from 'react';
import { Chart as ChartJS, registerables } from 'chart.js';
import type {
  ChartConfigurationCustomTypesPerDataset,
  ChartData,
  ChartOptions,
  ChartType,
  Plugin,
  TooltipItem,
} from 'chart.js';
import { chartColors } from '../types';
import type { ChartAdapterProps, Row, TrialSeries } from '../types';

ChartJS.register(...registerables);

type Point = { x: number; y: number | null };
type DatasetType = 'line' | 'bar' | 'scatter';

const toRgba = (color: string, alpha: number): string => {
  const match = color.replace('#', '');
  if (match.length === 3 || match.length === 6) {
    const expanded = match.length === 3 ? match.split('').map((part) => part + part).join('') : match;
    const red = Number.parseInt(expanded.slice(0, 2), 16);
    const green = Number.parseInt(expanded.slice(2, 4), 16);
    const blue = Number.parseInt(expanded.slice(4, 6), 16);
    if ([red, green, blue].every(Number.isFinite)) return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }
  return color;
};

const formatTick = (formatter: ((value: number) => string) | undefined, value: string | number): string | number => {
  if (!formatter) return value;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? formatter(numeric) : value;
};

const pointsFor = (rows: Row[], series: TrialSeries): Point[] =>
  rows.map((row) => ({ x: row.x, y: row[series.id] ?? null }));

const makeDatasets = (spec: ChartAdapterProps['spec'], hidden: string[]) =>
  spec.series.map((series) => {
    const isArea = series.kind === 'area';
    const datasetType: DatasetType = series.kind === 'scatter' ? 'scatter' : series.kind === 'bar' ? 'bar' : 'line';
    return {
      type: datasetType,
      label: series.label,
      data: pointsFor(spec.rows, series),
      borderColor: series.color,
      backgroundColor: isArea ? toRgba(series.color, 0.2) : series.kind === 'bar' ? toRgba(series.color, 0.75) : series.color,
      borderWidth: series.kind === 'bar' ? 1 : 2,
      borderRadius: series.kind === 'bar' ? 2 : undefined,
      fill: isArea,
      spanGaps: false,
      pointRadius: series.kind === 'scatter' ? 3 : 0,
      pointHoverRadius: series.kind === 'scatter' ? 5 : 3,
      showLine: series.kind !== 'scatter',
      yAxisID: series.axis === 'right' ? 'yRight' : 'y',
      hidden: hidden.includes(series.id),
      normalized: true,
      parsing: false,
    };
  });

const makeOptions = (spec: ChartAdapterProps['spec'], theme: ChartAdapterProps['theme']): ChartOptions<ChartType> => {
  const palette = chartColors[theme];
  const hasRightAxis = spec.series.some((series) => series.axis === 'right');
  const xType = spec.xScale === 'log' ? 'logarithmic' : 'linear';
  const yType = spec.yScale === 'log' ? 'logarithmic' : 'linear';

  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    color: palette.text,
    normalized: true,
    interaction: { mode: 'nearest', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: TooltipItem<ChartType>): string => {
            const value = context.parsed.y;
            const text = value === null ? 'No value' : formatTick(spec.yFormat, value);
            return `${context.dataset.label ?? ''}: ${text}`;
          },
        },
        backgroundColor: palette.background,
        borderColor: palette.grid,
        borderWidth: 1,
        titleColor: palette.text,
        bodyColor: palette.text,
      },
    },
    scales: {
      x: {
        type: xType,
        title: { display: Boolean(spec.xLabel), text: spec.xLabel, color: palette.muted },
        ticks: {
          color: palette.muted,
          callback: (value: string | number) => formatTick(spec.xFormat, value),
        },
        grid: { color: palette.grid },
      },
      y: {
        type: yType,
        min: spec.yDomain?.[0],
        max: spec.yDomain?.[1],
        title: { display: Boolean(spec.yLabel), text: spec.yLabel, color: palette.muted },
        ticks: {
          color: palette.muted,
          callback: (value: string | number) => formatTick(spec.yFormat, value),
        },
        grid: { color: palette.grid },
      },
      ...(hasRightAxis
        ? {
            yRight: {
              type: yType,
              position: 'right' as const,
              min: spec.rightDomain?.[0],
              max: spec.rightDomain?.[1],
              title: { display: Boolean(spec.rightLabel), text: spec.rightLabel, color: palette.muted },
              ticks: {
                color: palette.muted,
                callback: (value: string | number) => formatTick(spec.yFormat, value),
              },
              grid: { drawOnChartArea: false, color: palette.grid },
            },
          }
        : {}),
    },
  };
};

export function ChartjsChart({ spec, theme, hidden }: ChartAdapterProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<ChartJS | null>(null);
  const specRef = useRef(spec);
  const themeRef = useRef(theme);


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const referencePlugin: Plugin<ChartType> = {
      id: 'snaplot-reference-line',
      afterDraw: (chart) => {
        const reference = specRef.current.reference;
        const yScale = chart.scales.y;
        if (!reference || !yScale) return;

        const y = yScale.getPixelForValue(reference.value);
        const { chartArea, ctx } = chart;
        if (!chartArea || !Number.isFinite(y)) return;
        ctx.save();
        ctx.strokeStyle = chartColors[themeRef.current].muted;
        ctx.fillStyle = chartColors[themeRef.current].muted;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(chartArea.left, y);
        ctx.lineTo(chartArea.right, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(reference.label, chartArea.right - 4, y - 4);
        ctx.restore();
      },
    };

    const config = {
      data: { datasets: makeDatasets(specRef.current, []) },
      options: makeOptions(specRef.current, themeRef.current),
      plugins: [referencePlugin],
    } as ChartConfigurationCustomTypesPerDataset;

    chartRef.current = new ChartJS(canvas, config);
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    specRef.current = spec;
    themeRef.current = theme;

    const config = {
      data: { datasets: makeDatasets(spec, hidden) },
      options: makeOptions(spec, theme),
    } as ChartConfigurationCustomTypesPerDataset;

    chart.data = config.data as unknown as ChartData<ChartType>;
    chart.options = config.options as ChartOptions<ChartType>;
    chart.update('none');
  }, [spec, theme, hidden]);

  useEffect(() => {
    const container = canvasRef.current?.parentElement;
    const chart = chartRef.current;
    if (!container || !chart || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container);
    chart.resize();
    return () => observer.disconnect();
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 0, position: 'relative' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}
