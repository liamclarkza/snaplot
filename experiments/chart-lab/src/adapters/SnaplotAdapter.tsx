import { createTheme, darkTheme, lightTheme } from 'snaplot';
import { Chart } from 'snaplot/react';
import { chartColors, type ChartAdapterProps } from '../types';

export function SnaplotAdapter({ spec, theme, hidden }: ChartAdapterProps) {
  const colors = chartColors[theme];
  return <Chart
    data={spec.rows}
    x="x"
    ariaLabel={spec.title}
    interaction="readonly"
    hiddenSeries={hidden}
    axes={{
      x: { type: spec.xScale ?? 'linear', title: spec.xLabel, format: spec.xFormat },
      y: { type: spec.yScale ?? 'linear', title: spec.yLabel, min: spec.yDomain?.[0], max: spec.yDomain?.[1], format: spec.yFormat },
      ...(spec.rightLabel ? { y2: { position: 'right' as const, title: spec.rightLabel, min: spec.rightDomain?.[0], max: spec.rightDomain?.[1], grid: false } } : {}),
    }}
    series={spec.series.map(series => ({
      id: series.id, y: series.id, label: series.label, type: series.kind,
      yAxis: series.axis === 'right' ? 'y2' : 'y', stroke: series.color,
      fill: series.kind === 'area' ? `${series.color}28` : series.color,
      lineWidth: 2, pointRadius: 3,
    }))}
    theme={createTheme({ base: theme === 'dark' ? darkTheme : lightTheme, surface: colors.background, text: colors.text, muted: colors.muted, accent: '#18b6b1' })}
    referenceLines={spec.reference ? [{ axis: 'y', value: spec.reference.value, label: spec.reference.label, color: colors.muted, dash: [4, 4] }] : []}
  />;
}
