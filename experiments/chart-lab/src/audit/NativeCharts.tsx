import { useEffect, useMemo, useRef } from 'react';
import { Chart as ChartJS, registerables } from 'chart.js';
import * as echarts from 'echarts/core';
import { LineChart as ECLine, BarChart as ECBar } from 'echarts/charts';
import { GridComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import type { ChartOptions } from 'snaplot';
import { Chart } from 'snaplot/react';
import type { ChartSpec, LibraryId, Row } from '../types';

ChartJS.register(...registerables);
echarts.use([ECLine, ECBar, GridComponent, CanvasRenderer]);

function NativeSnaplot({ spec }: { spec: ChartSpec }) {
  const options = useMemo<ChartOptions<Row>>(() => ({
    data: spec.rows, x: 'x',
    axes: {
      x: { title: spec.xLabel, format: spec.xFormat },
      y: { title: spec.yLabel, format: spec.yFormat },
      ...(spec.rightLabel ? { y2: { position: 'right' as const, title: spec.rightLabel } } : {}),
    },
    series: spec.series.map(s => ({ id: s.id, y: s.id, label: s.label, type: s.kind, yAxis: s.axis === 'right' ? 'y2' : 'y' })),
  }), [spec]);
  return <Chart {...options} ariaLabel={spec.title} />;
}

function NativeChartjs({ spec }: { spec: ChartSpec }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current) return;
    const chart = new ChartJS(canvas.current, {
      type: spec.series[0].kind === 'bar' ? 'bar' : 'line',
      data: { datasets: spec.series.map((s) => ({ label: s.label, data: spec.rows.map((r) => ({ x: r.x, y: r[s.id] as number })), yAxisID: s.axis === 'right' ? 'y2' : 'y' })) },
      options: {
        // Container integration; no padding, rotation or tick-density overrides.
        responsive: true, maintainAspectRatio: false, animation: false,
        scales: {
          x: { type: 'linear', title: { display: true, text: spec.xLabel }, ...(spec.xFormat ? { ticks: { callback: (v) => spec.xFormat!(Number(v)) } } : {}) },
          y: { title: { display: true, text: spec.yLabel }, ...(spec.yFormat ? { ticks: { callback: (v) => spec.yFormat!(Number(v)) } } : {}) },
          ...(spec.rightLabel ? { y2: { type: 'linear' as const, position: 'right' as const, title: { display: true, text: spec.rightLabel } } } : {}),
        },
      },
    });
    return () => chart.destroy();
  }, [spec]);
  return <div style={{ height: '100%', position: 'relative' }}><canvas ref={canvas} /></div>;
}

function NativeRecharts({ spec }: { spec: ChartSpec }) {
  return <ResponsiveContainer width="100%" height="100%"><ComposedChart data={spec.rows}>
    <CartesianGrid />
    <XAxis type="number" dataKey="x" tickFormatter={spec.xFormat} label={{ value: spec.xLabel, position: 'insideBottom' }} />
    <YAxis yAxisId="y" tickFormatter={spec.yFormat} label={{ value: spec.yLabel, angle: -90, position: 'insideLeft' }} />
    {spec.rightLabel && <YAxis yAxisId="y2" orientation="right" label={{ value: spec.rightLabel, angle: 90, position: 'insideRight' }} />}
    {spec.series.map((s) => s.kind === 'bar'
      ? <Bar key={s.id} dataKey={s.id} name={s.label} yAxisId={s.axis === 'right' ? 'y2' : 'y'} isAnimationActive={false} />
      : <Line key={s.id} dataKey={s.id} name={s.label} yAxisId={s.axis === 'right' ? 'y2' : 'y'} isAnimationActive={false} />)}
  </ComposedChart></ResponsiveContainer>;
}

function NativeEcharts({ spec }: { spec: ChartSpec }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const chart = echarts.init(host.current);
    chart.setOption({
      animation: false,
      xAxis: { type: 'value', name: spec.xLabel, ...(spec.xFormat ? { axisLabel: { formatter: spec.xFormat } } : {}) },
      yAxis: [
        { type: 'value', name: spec.yLabel, ...(spec.yFormat ? { axisLabel: { formatter: spec.yFormat } } : {}) },
        ...(spec.rightLabel ? [{ type: 'value', name: spec.rightLabel, position: 'right' }] : []),
      ],
      series: spec.series.map((s) => ({ name: s.label, type: s.kind, yAxisIndex: s.axis === 'right' ? 1 : 0, data: spec.rows.map((r) => [r.x, r[s.id]]) })),
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(host.current);
    return () => { observer.disconnect(); chart.dispose(); };
  }, [spec]);
  return <div ref={host} style={{ width: '100%', height: '100%' }} />;
}

export function NativeChart({ library, spec }: { library: LibraryId; spec: ChartSpec }) {
  if (library === 'chartjs') return <NativeChartjs spec={spec} />;
  if (library === 'recharts') return <NativeRecharts spec={spec} />;
  if (library === 'echarts') return <NativeEcharts spec={spec} />;
  return <NativeSnaplot spec={spec} />;
}
