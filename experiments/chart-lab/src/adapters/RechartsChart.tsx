import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Label,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartAdapterProps, Row, TrialSeries } from '../types';
import { chartColors } from '../types';

type Palette = (typeof chartColors)[ChartAdapterProps['theme']];
type ScatterPoint = { x: number; y: number | null };
type AxisValue = number | string;
type AxisDomain = [AxisValue, AxisValue];

const autoDomain: AxisDomain = ['auto', 'auto'];

function valueFormatter(formatter: ((value: number) => string) | undefined) {
  return (value: AxisValue): string => (formatter ? formatter(Number(value)) : String(value));
}

function toAxisValue(value: unknown): AxisValue {
  return typeof value === 'number' || typeof value === 'string' ? value : String(value ?? '');
}

function scatterPoints(rows: Row[], series: TrialSeries): ScatterPoint[] {
  return rows.map((row) => ({ x: row.x, y: row[series.id] }));
}

function logTicks(values: number[]): number[] | undefined {
  const positive = values.filter((value) => value > 0 && Number.isFinite(value));
  if (positive.length === 0) return undefined;

  const min = Math.min(...positive);
  const max = Math.max(...positive);
  if (min === max) return [min];

  const firstExponent = Math.ceil(Math.log10(min));
  const lastExponent = Math.floor(Math.log10(max));
  const ticks = Array.from(
    { length: Math.max(0, lastExponent - firstExponent + 1) },
    (_, index) => 10 ** (firstExponent + index),
  );
  return ticks.length > 0 ? ticks : [min, max];
}

function seriesValues(rows: Row[], series: TrialSeries[]): number[] {
  return rows.flatMap((row) =>
    series.flatMap((item) => {
      const value = row[item.id];
      return typeof value === 'number' ? [value] : [];
    }),
  );
}

function SeriesMarks({
  series,
  rows,
}: {
  series: TrialSeries[];
  rows: Row[];
}) {
  return series.map((item) => {
    const axis = item.axis === 'right' ? 'right' : 'left';

    if (item.kind === 'area') {
      return (
        <Area
          key={item.id}
          type="linear"
          dataKey={item.id}
          name={item.label}
          yAxisId={axis}
          stroke={item.color}
          fill={item.color}
          fillOpacity={0.18}
          connectNulls={false}
          isAnimationActive={false}
          dot={false}
        />
      );
    }

    if (item.kind === 'bar') {
      return (
        <Bar
          key={item.id}
          dataKey={item.id}
          name={item.label}
          yAxisId={axis}
          fill={item.color}
          maxBarSize={34}
          isAnimationActive={false}
        />
      );
    }

    if (item.kind === 'scatter') {
      return (
        <Scatter
          key={item.id}
          data={scatterPoints(rows, item)}
          dataKey="y"
          name={item.label}
          yAxisId={axis}
          fill={item.color}
          isAnimationActive={false}
        />
      );
    }

    return (
      <Line
        key={item.id}
        type="linear"
        dataKey={item.id}
        name={item.label}
        yAxisId={axis}
        stroke={item.color}
        strokeWidth={2}
        connectNulls={false}
        isAnimationActive={false}
        dot={false}
        activeDot={{ r: 3 }}
      />
    );
  });
}

export function RechartsChart({ spec, theme, hidden }: ChartAdapterProps) {
  const palette: Palette = chartColors[theme];
  const visibleSeries = spec.series.filter((series) => !hidden.includes(series.id));
  const hasBars = spec.series.some((series) => series.kind === 'bar');
  // Keep the axis slot mounted while a right-axis series is toggled off so the
  // plot does not jump horizontally between legend states.
  const hasRightAxis = spec.series.some((series) => series.axis === 'right') || Boolean(spec.rightLabel || spec.rightDomain);
  const scatterOnly = visibleSeries.length > 0 && visibleSeries.every((series) => series.kind === 'scatter');
  const xTickFormatter = valueFormatter(spec.xFormat);
  const yTickFormatter = valueFormatter(spec.yFormat);
  const leftDomain: AxisDomain = spec.yDomain ?? autoDomain;
  const rightDomain: AxisDomain = spec.rightDomain ?? autoDomain;
  const xTicks = spec.xScale === 'log' ? logTicks(spec.rows.map((row) => row.x)) : undefined;
  const leftTicks = spec.yScale === 'log' ? logTicks(spec.yDomain ?? seriesValues(spec.rows, visibleSeries.filter((series) => series.axis !== 'right'))) : undefined;
  const rightTicks = spec.yScale === 'log' ? logTicks(spec.rightDomain ?? seriesValues(spec.rows, visibleSeries.filter((series) => series.axis === 'right'))) : undefined;
  const margin = {
    top: 12,
    right: hasRightAxis ? 34 : 14,
    bottom: 32,
    left: 30,
  };

  const axes = (
    <>
      <CartesianGrid stroke={palette.grid} strokeDasharray="2 4" vertical={false} />
      <XAxis
        dataKey="x"
        type="number"
        scale={spec.xScale === 'log' ? 'log' : 'linear'}
        domain={autoDomain}
        padding={hasBars ? 'gap' : undefined}
        ticks={xTicks}
        tickFormatter={xTickFormatter}
        tick={{ fill: palette.muted, fontSize: 11 }}
        tickLine={false}
        axisLine={{ stroke: palette.grid }}
        height={32}
      >
        <Label
          value={spec.xLabel}
          position="insideBottom"
          offset={-8}
          fill={palette.muted}
          fontSize={11}
        />
      </XAxis>
      <YAxis
        yAxisId="left"
        type="number"
        scale={spec.yScale === 'log' ? 'log' : 'linear'}
        domain={leftDomain}
        ticks={leftTicks}
        tickFormatter={yTickFormatter}
        tick={{ fill: palette.muted, fontSize: 11 }}
        tickLine={false}
        axisLine={false}
        width={40}
      >
        <Label
          value={spec.yLabel}
          angle={-90}
          position="center"
          dx={-38}
          fill={palette.muted}
          fontSize={11}
          style={{ textAnchor: 'middle' }}
        />
      </YAxis>
      {hasRightAxis ? (
        <YAxis
          yAxisId="right"
          orientation="right"
          type="number"
          scale={spec.yScale === 'log' ? 'log' : 'linear'}
          domain={rightDomain}
          ticks={rightTicks}
          tickFormatter={yTickFormatter}
          tick={{ fill: palette.muted, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={46}
        >
          <Label
            value={spec.rightLabel}
            angle={90}
            position="center"
            dx={-8}
            fill={palette.muted}
            fontSize={11}
            style={{ textAnchor: 'middle' }}
          />
        </YAxis>
      ) : null}
      {spec.reference ? (
        <ReferenceLine
          y={spec.reference.value}
          yAxisId="left"
          stroke={palette.muted}
          strokeDasharray="5 4"
          label={{
            value: spec.reference.label,
            position: 'insideTopRight',
            fill: palette.muted,
            fontSize: 11,
          }}
        />
      ) : null}
      <Tooltip
        cursor={{ stroke: palette.grid, strokeDasharray: '3 3' }}
        isAnimationActive={false}
        labelFormatter={(value) => `${spec.xLabel}: ${xTickFormatter(toAxisValue(value))}`}
        formatter={(value, name) => [yTickFormatter(toAxisValue(value)), String(name)]}
        contentStyle={{
          background: palette.background,
          border: `1px solid ${palette.grid}`,
          borderRadius: 4,
          color: palette.text,
        }}
        labelStyle={{ color: palette.muted }}
        itemStyle={{ color: palette.text }}
      />
    </>
  );

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        {scatterOnly ? (
          <ScatterChart margin={margin} accessibilityLayer>
            {axes}
            <SeriesMarks series={visibleSeries} rows={spec.rows} />
          </ScatterChart>
        ) : (
          <ComposedChart
            data={spec.rows}
            margin={margin}
            barCategoryGap={hasBars ? '10%' : undefined}
            accessibilityLayer
          >
            {axes}
            <SeriesMarks series={visibleSeries} rows={spec.rows} />
          </ComposedChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
