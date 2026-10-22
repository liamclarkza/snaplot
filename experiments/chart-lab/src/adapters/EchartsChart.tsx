import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import type { XAxisComponentOption, YAxisComponentOption } from 'echarts';
import type { ComposeOption } from 'echarts/core';
import {
  BarChart,
  LineChart,
  ScatterChart,
  type BarSeriesOption,
  type LineSeriesOption,
  type ScatterSeriesOption,
} from 'echarts/charts';
import {
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
  type GridComponentOption,
  type MarkLineComponentOption,
  type TooltipComponentOption,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

import { chartColors, type ChartAdapterProps, type Row, type TrialSeries } from '../types';

echarts.use([BarChart, LineChart, ScatterChart, GridComponent, MarkLineComponent, TooltipComponent, CanvasRenderer]);

type EchartsOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | ScatterSeriesOption
  | GridComponentOption
  | MarkLineComponentOption
  | TooltipComponentOption
  | XAxisComponentOption
  | YAxisComponentOption
>;

type Point = [number, number | null];

function formatAxisValue(value: string | number, formatter: ((value: number) => string) | undefined): string {
  if (!formatter) return String(value);
  const numericValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numericValue) ? formatter(numericValue) : String(value);
}

function formatTooltipValue(
  value: string | number | Date | null | undefined,
  formatter: ((value: number) => string) | undefined,
): string {
  if (value === null || value === undefined) return 'No value';
  if (value instanceof Date) return String(value);
  return formatAxisValue(value, formatter);
}

function toData(rows: Row[], seriesId: string): Point[] {
  return rows.map((row) => [row.x, row[seriesId] ?? null]);
}

function lineSeries(
  series: TrialSeries,
  rows: Row[],
  axisIndex: number,
): LineSeriesOption | BarSeriesOption | ScatterSeriesOption {
  const data = toData(rows, series.id);
  const common = {
    id: series.id,
    name: series.label,
    xAxisIndex: 0,
    yAxisIndex: axisIndex,
    data,
    itemStyle: { color: series.color },
    lineStyle: { color: series.color },
    emphasis: { focus: 'series' as const },
  };

  if (series.kind === 'bar') {
    return { ...common, type: 'bar', barMaxWidth: 22, barMinWidth: 1 };
  }
  if (series.kind === 'scatter') {
    return { ...common, type: 'scatter', symbolSize: 7 };
  }

  return {
    ...common,
    type: 'line',
    showSymbol: false,
    symbolSize: 6,
    connectNulls: false,
    areaStyle: series.kind === 'area' ? { color: series.color, opacity: 0.2 } : undefined,
  };
}

function referenceSeries(
  reference: ChartAdapterProps['spec']['reference'],
  color: string,
): LineSeriesOption | undefined {
  if (!reference) return undefined;
  return {
    id: '__snaplot_reference__',
    name: '__snaplot_reference__',
    type: 'line',
    xAxisIndex: 0,
    yAxisIndex: 0,
    data: [],
    showSymbol: false,
    silent: true,
    tooltip: { show: false },
    markLine: {
      symbol: ['none', 'none'],
      silent: true,
      lineStyle: { color, type: 'dashed', opacity: 0.85 },
      label: { show: true, formatter: reference.label, position: 'insideEndTop' },
      data: [{ yAxis: reference.value }],
    },
  };
}

function makeOption(props: ChartAdapterProps): EchartsOption {
  const { spec, theme, hidden } = props;
  const colors = chartColors[theme];
  const hiddenIds = new Set(hidden);
  const visibleSeries = spec.series.filter((series) => !hiddenIds.has(series.id));
  const hasRightAxis = spec.series.some((series) => series.axis === 'right') || Boolean(spec.rightLabel || spec.rightDomain);
  const hasBars = visibleSeries.some((series) => series.kind === 'bar');

  const xAxis: XAxisComponentOption = {
    type: spec.xScale === 'log' ? 'log' : 'value',
    scale: true,
    boundaryGap: hasBars ? ['4%', '4%'] : [0, 0],
    name: spec.xLabel,
    nameLocation: 'middle',
    nameGap: 28,
    axisLabel: {
      color: colors.muted,
      formatter: (value: string | number) => formatAxisValue(value, spec.xFormat),
    },
    axisLine: { lineStyle: { color: colors.grid } },
    axisTick: { lineStyle: { color: colors.grid } },
    splitLine: { lineStyle: { color: colors.grid, opacity: 0.75 } },
  };

  const leftAxis: YAxisComponentOption = {
    type: spec.yScale === 'log' ? 'log' : 'value',
    name: spec.yLabel,
    nameLocation: 'middle',
    nameGap: 44,
    min: spec.yDomain?.[0],
    max: spec.yDomain?.[1],
    axisLabel: {
      color: colors.muted,
      formatter: (value: string | number) => formatAxisValue(value, spec.yFormat),
    },
    axisLine: { lineStyle: { color: colors.grid } },
    axisTick: { lineStyle: { color: colors.grid } },
    splitLine: { lineStyle: { color: colors.grid, opacity: 0.75 } },
  };

  const rightAxis: YAxisComponentOption = {
    type: spec.yScale === 'log' ? 'log' : 'value',
    name: spec.rightLabel,
    nameLocation: 'middle',
    nameGap: 44,
    position: 'right',
    min: spec.rightDomain?.[0],
    max: spec.rightDomain?.[1],
    axisLabel: {
      color: colors.muted,
      formatter: (value: string | number) => formatAxisValue(value, spec.yFormat),
    },
    axisLine: { lineStyle: { color: colors.grid } },
    axisTick: { lineStyle: { color: colors.grid } },
    splitLine: { show: false },
  };

  const series = visibleSeries.map((item) =>
    lineSeries(item, spec.rows, item.axis === 'right' ? 1 : 0),
  );
  const reference = referenceSeries(spec.reference, colors.muted);
  if (reference) series.push(reference);

  return {
    animation: false,
    backgroundColor: colors.background,
    textStyle: { color: colors.text },
    grid: { left: 68, right: hasRightAxis ? 68 : 24, top: 18, bottom: 58, containLabel: true },
    xAxis,
    yAxis: hasRightAxis ? [leftAxis, rightAxis] : leftAxis,
    tooltip: {
      trigger: 'axis',
      confine: true,
      axisPointer: { type: 'cross' },
      valueFormatter: (value, _dataIndex) =>
        Array.isArray(value)
          ? value.map((entry) => formatTooltipValue(entry, spec.yFormat)).join(', ')
          : formatTooltipValue(value, spec.yFormat),
      backgroundColor: colors.background,
      borderColor: colors.grid,
      textStyle: { color: colors.text },
    },
    series,
  };
}

export function EchartsChart({ spec, theme, hidden }: ChartAdapterProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const existing = echarts.getInstanceByDom(container);
    existing?.dispose();
    const instance = echarts.init(container, undefined, { renderer: 'canvas' });
    chartRef.current = instance;

    const resize = () => instance.resize();
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(resize);
      observer.observe(container);
    } else {
      window.addEventListener('resize', resize);
    }
    instance.resize();

    return () => {
      observer?.disconnect();
      if (typeof ResizeObserver === 'undefined') window.removeEventListener('resize', resize);
      instance.dispose();
      if (chartRef.current === instance) chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(makeOption({ spec, theme, hidden }), { notMerge: true, lazyUpdate: false });
  }, [spec, theme, hidden]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 0 }} />;
}
