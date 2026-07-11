import { useMemo } from 'react'
import type { VizSpec, VizTable } from '../types'

/**
 * VizSpec whitelist renderer (P3 Task 4). Input is the server-resolved
 * `{ spec, data }`: the server already validated that every encoding binds to a
 * real column and resolved the real rows. This component ONLY maps those real
 * columns onto visual channels — it never executes anything from the spec and
 * never invents data. Empty data renders an explicit empty state rather than a
 * fabricated chart (constitution P2).
 */

const SERIES_COLORS = ['#60a5fa', '#f87171', '#34d399', '#fbbf24', '#a78bfa', '#f472b6', '#22d3ee']

const WIDTH = 640
const HEIGHT = 300
const PADDING = { top: 16, right: 16, bottom: 36, left: 48 }
const MAX_X_TICKS = 7

interface Props {
  spec: VizSpec
  data: VizTable
  showTitle?: boolean
}

function firstField(spec: VizSpec, role: 'x'): string | null {
  return spec.encodings.find((e) => e.role === role)?.field ?? null
}

function yFields(spec: VizSpec): string[] {
  return spec.encodings.filter((e) => e.role === 'y').map((e) => e.field)
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return null
}

interface PlotPoint {
  xLabel: string
  xValue: number
  values: Record<string, number>
}

function buildPoints(data: VizTable, xField: string, ys: string[]): PlotPoint[] {
  const points: PlotPoint[] = []
  for (const row of data.rows) {
    const raw = row[xField]
    const xNum = asNumber(raw)
    const values: Record<string, number> = {}
    for (const y of ys) {
      const v = asNumber(row[y])
      if (v !== null) values[y] = v
    }
    if (Object.keys(values).length === 0) continue
    points.push({
      xLabel: raw === undefined || raw === null ? '' : String(raw),
      xValue: xNum ?? points.length,
      values,
    })
  }
  return points
}

function xTickIndexes(count: number): number[] {
  if (count <= MAX_X_TICKS) return Array.from({ length: count }, (_, index) => index)
  const indexes = new Set<number>([0, count - 1])
  const step = (count - 1) / (MAX_X_TICKS - 1)
  for (let index = 1; index < MAX_X_TICKS - 1; index += 1) {
    indexes.add(Math.round(index * step))
  }
  return [...indexes].sort((a, b) => a - b)
}

function formatAxisLabel(label: string): string {
  if (label.length <= 10) return label
  return `${label.slice(0, 9)}…`
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      data-testid="results-chart-empty"
      className="flex h-full min-h-[120px] items-center justify-center px-4 text-center text-sm text-[var(--color-text-tertiary)]"
    >
      {message}
    </div>
  )
}

const SUPPORTED = new Set(['line', 'area', 'bar', 'scatter'])

export function ResultsChart({ spec, data, showTitle = true }: Props) {
  const xField = firstField(spec, 'x')
  const ys = useMemo(() => yFields(spec), [spec])
  const points = useMemo(
    () => (xField && ys.length ? buildPoints(data, xField, ys) : []),
    [data, xField, ys],
  )

  if (!xField || ys.length === 0) {
    return <EmptyState message="This chart needs an x and a y encoding." />
  }
  if (!SUPPORTED.has(spec.chart)) {
    return <EmptyState message={`Chart type "${spec.chart}" is not supported yet.`} />
  }
  if (points.length === 0) {
    return <EmptyState message="No data for this chart yet." />
  }

  const plotWidth = WIDTH - PADDING.left - PADDING.right
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom

  let maxValue = 0
  let minValue = 0
  for (const point of points) {
    for (const v of Object.values(point.values)) {
      if (v > maxValue) maxValue = v
      if (v < minValue) minValue = v
    }
  }
  const valueRange = maxValue - minValue || 1

  const sorted = [...points].sort((a, b) => a.xValue - b.xValue)
  const xs = sorted.map((p) => p.xValue)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const xRange = maxX - minX || 1

  const xScalePoint = (value: number) => PADDING.left + ((value - minX) / xRange) * plotWidth
  const yScale = (value: number) =>
    PADDING.top + plotHeight - ((value - minValue) / valueRange) * plotHeight

  const isBar = spec.chart === 'bar'
  const barSlot = plotWidth / sorted.length
  const barWidth = Math.max(2, (barSlot / Math.max(1, ys.length)) * 0.8)
  const tickIndexes = xTickIndexes(sorted.length)

  // Optional vertical marker (e.g. an intervention tick) so the effect point is
  // explicit on time-series charts. Ignored for bar charts / out-of-range values.
  const referenceXRaw = spec.options?.referenceX
  const referenceX =
    !isBar && typeof referenceXRaw === 'number' && referenceXRaw >= minX && referenceXRaw <= maxX
      ? referenceXRaw
      : null
  const referenceLabel =
    typeof spec.options?.referenceLabel === 'string' ? spec.options.referenceLabel : null

  return (
    <div data-testid="results-chart" className="flex h-full flex-col gap-2">
      {showTitle && spec.title ? (
        <div className="px-1 text-xs font-semibold text-[var(--color-text-primary)]">{spec.title}</div>
      ) : null}
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full flex-1"
        role="img"
        aria-label={spec.title || `${spec.chart} chart`}
      >
        <line
          x1={PADDING.left}
          y1={PADDING.top}
          x2={PADDING.left}
          y2={PADDING.top + plotHeight}
          stroke="var(--color-border)"
          strokeWidth={1}
        />
        <line
          x1={PADDING.left}
          y1={yScale(Math.max(0, minValue))}
          x2={PADDING.left + plotWidth}
          y2={yScale(Math.max(0, minValue))}
          stroke="var(--color-border)"
          strokeWidth={1}
        />
        <text x={PADDING.left - 6} y={PADDING.top + 4} textAnchor="end" fontSize="10" fill="var(--color-text-tertiary)">
          {maxValue.toFixed(2)}
        </text>
        <text
          x={PADDING.left - 6}
          y={PADDING.top + plotHeight}
          textAnchor="end"
          fontSize="10"
          fill="var(--color-text-tertiary)"
        >
          {minValue.toFixed(2)}
        </text>

        {ys.map((y, yi) => {
          const color = SERIES_COLORS[yi % SERIES_COLORS.length]!
          if (isBar) {
            return (
              <g key={y} data-testid={`results-series-${y}`}>
                {sorted.map((point, index) => {
                  const value = point.values[y]
                  if (value === undefined) return null
                  const x = PADDING.left + index * barSlot + barSlot / 2 - barWidth * (ys.length / 2) + yi * barWidth
                  const yTop = yScale(value)
                  const base = yScale(Math.max(0, minValue))
                  return (
                    <rect
                      key={`${y}-${index}`}
                      data-testid="results-bar"
                      x={x}
                      y={Math.min(yTop, base)}
                      width={barWidth}
                      height={Math.abs(base - yTop)}
                      fill={color}
                    />
                  )
                })}
              </g>
            )
          }

          const linePoints = sorted
            .filter((point) => point.values[y] !== undefined)
            .map((point) => `${xScalePoint(point.xValue)},${yScale(point.values[y]!)}`)
            .join(' ')

          if (spec.chart === 'scatter') {
            return (
              <g key={y} data-testid={`results-series-${y}`}>
                {sorted.map((point, index) =>
                  point.values[y] === undefined ? null : (
                    <circle
                      key={`${y}-${index}`}
                      data-testid="results-point"
                      cx={xScalePoint(point.xValue)}
                      cy={yScale(point.values[y]!)}
                      r={3}
                      fill={color}
                    />
                  ),
                )}
              </g>
            )
          }

          return (
            <polyline
              key={y}
              data-testid={`results-series-${y}`}
              fill="none"
              stroke={color}
              strokeWidth={1.75}
              points={linePoints}
            />
          )
        })}

        {referenceX !== null ? (
          <g data-testid="results-reference-x">
            <line
              x1={xScalePoint(referenceX)}
              y1={PADDING.top}
              x2={xScalePoint(referenceX)}
              y2={PADDING.top + plotHeight}
              stroke="var(--color-warning)"
              strokeWidth={1.25}
              strokeDasharray="4 3"
            />
            <text
              x={xScalePoint(referenceX) + 3}
              y={PADDING.top + 10}
              fontSize="9"
              fill="var(--color-warning)"
            >
              {referenceLabel ?? `t=${referenceX}`}
            </text>
          </g>
        ) : null}

        {tickIndexes.map((index) => {
          const point = sorted[index]
          if (!point) return null
          return (
            <text
              key={`xl-${index}`}
              data-testid="results-x-tick"
              x={isBar ? PADDING.left + index * barSlot + barSlot / 2 : xScalePoint(point.xValue)}
              y={HEIGHT - 18}
              textAnchor="middle"
              fontSize="9"
              fill="var(--color-text-tertiary)"
            >
              {formatAxisLabel(point.xLabel)}
            </text>
          )
        })}
        <text
          x={PADDING.left + plotWidth / 2}
          y={HEIGHT - 4}
          textAnchor="middle"
          fontSize="10"
          fill="var(--color-text-secondary)"
        >
          {xField}
        </text>
      </svg>

      <div className="flex flex-wrap gap-x-4 gap-y-1 px-1">
        {ys.map((y, yi) => (
          <span key={y} className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: SERIES_COLORS[yi % SERIES_COLORS.length] }}
            />
            {y}
          </span>
        ))}
      </div>

      {spec.caption ? (
        <div className="px-1 text-[11px] text-[var(--color-text-tertiary)]">{spec.caption}</div>
      ) : null}
    </div>
  )
}
