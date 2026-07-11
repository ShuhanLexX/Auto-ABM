import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, Move, Plus, Sparkles, Trash2, ZoomIn, ZoomOut } from 'lucide-react'
import { abmClient } from '../api/abmClient'
import { useAbmStore, type TickPoint } from '../stores/abmStore'
import type { Changepoint } from '../types'
import { MiniExplainPopover, type MiniExplainAnchor, type MiniExplainTarget } from './MiniExplainPopover'
import { useAbmText } from '../i18n'

const SERIES_COLORS = [
  '#60a5fa',
  '#f87171',
  '#34d399',
  '#fbbf24',
  '#a78bfa',
  '#f472b6',
  '#22d3ee',
]

const WIDTH = 760
const HEIGHT = 260
const PADDING = { top: 18, right: 18, bottom: 28, left: 46 }

interface Series {
  key: string
  color: string
  points: Array<{ x: number; y: number }>
}

interface TickRange {
  from: number
  to: number
}

interface ChartContextMenuState {
  anchor: MiniExplainAnchor
  range: TickRange
}

interface ChartLayout {
  x: number
  y: number
  w: number
  h: number
}

type CanvasDrag =
  | { kind: 'pan'; startX: number; startY: number; originX: number; originY: number }
  | { kind: 'move'; key: string; startX: number; startY: number; origin: ChartLayout; scale: number }
  | { kind: 'resize'; key: string; startX: number; startY: number; origin: ChartLayout; scale: number }

function buildSeries(ticks: TickPoint[]): { series: Series[]; maxTick: number; maxValue: number } {
  const keys = new Set<string>()
  for (const point of ticks) {
    for (const key of Object.keys(point.metrics)) keys.add(key)
  }

  const orderedKeys = [...keys]
  let maxValue = 0
  let maxTick = 0
  for (const point of ticks) {
    maxTick = Math.max(maxTick, point.tick)
    for (const key of orderedKeys) {
      const value = point.metrics[key]
      if (typeof value === 'number' && value > maxValue) maxValue = value
    }
  }

  const series = orderedKeys.map((key, index) => ({
    key,
    color: SERIES_COLORS[index % SERIES_COLORS.length]!,
    points: ticks
      .filter((point) => typeof point.metrics[key] === 'number')
      .map((point) => ({ x: point.tick, y: point.metrics[key]! })),
  }))

  return { series, maxTick, maxValue }
}

function preferredMetricKeys(series: Series[]): string[] {
  const priority = [
    'infected',
    'burning',
    'tree',
    'rock',
    'burned',
    'burned_rate',
    'fuel',
    'empty',
    'susceptible',
    'recovered',
    'exposed',
    'opinion_variance',
    'clusters',
    'opinion_mean',
    'cooperation_rate',
    'mean_payoff',
    'unhappy',
    'aware',
    'adopted',
  ]
  const ordered = [
    ...priority.filter((key) => series.some((line) => line.key === key)),
    ...series.map((line) => line.key),
  ]
  return [...new Set(ordered)].slice(0, 3)
}

function sameStringArray(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function sameLayoutRecord(a: Record<string, ChartLayout>, b: Record<string, ChartLayout>): boolean {
  const aKeys = Object.keys(a).sort()
  const bKeys = Object.keys(b).sort()
  if (!sameStringArray(aKeys, bKeys)) return false
  return bKeys.every((key) => {
    const left = a[key]
    const right = b[key]
    return Boolean(left && right && left.x === right.x && left.y === right.y && left.w === right.w && left.h === right.h)
  })
}

export function MetricChart({ runId }: { runId: string | null }) {
  const t = useAbmText()
  const ticks = useAbmStore((store) => (runId ? store.runs[runId]?.ticks : undefined))
  const runState = useAbmStore((store) => (runId ? store.runs[runId]?.state : undefined))
  const playbackTick = useAbmStore((store) => (runId ? store.playbackTicks[runId] : undefined))
  const resultChartRequest = useAbmStore((store) => (runId ? store.resultCharts[runId] : undefined))
  const displayTicks = useMemo(() => {
    const allTicks = ticks ?? []
    if (playbackTick === undefined) return allTicks
    return allTicks.filter((point) => point.tick <= playbackTick)
  }, [playbackTick, ticks])
  const { series, maxTick } = useMemo(() => buildSeries(displayTicks), [displayTicks])
  const [changepoints, setChangepoints] = useState<Changepoint[]>([])

  // Detected inflection ticks (server-side, deterministic) once the run is done.
  useEffect(() => {
    if (!runId || runState !== 'completed') {
      setChangepoints([])
      return
    }
    let cancelled = false
    abmClient
      .getChangepoints(runId)
      .then((result) => {
        if (!cancelled) setChangepoints(result.changepoints)
      })
      .catch(() => {
        if (!cancelled) setChangepoints([])
      })
    return () => {
      cancelled = true
    }
  }, [runId, runState])

  const changepointsByMetric = useMemo(() => {
    const map = new Map<string, Changepoint[]>()
    for (const cp of changepoints) {
      map.set(cp.metric, [...(map.get(cp.metric) ?? []), cp])
    }
    return map
  }, [changepoints])
  const [chartKeys, setChartKeys] = useState<string[]>([])
  const [addingKey, setAddingKey] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 })
  const [layoutByKey, setLayoutByKey] = useState<Record<string, ChartLayout>>({})
  const [drag, setDrag] = useState<CanvasDrag | null>(null)
  const seriesKey = series.map((line) => line.key).join('|')
  const resultRequestKey = resultChartRequest
    ? `${resultChartRequest.nonce}:${resultChartRequest.action}:${resultChartRequest.metrics.join('|')}`
    : ''

  useEffect(() => {
    setChartKeys((current) => {
      const available = new Set(series.map((line) => line.key))
      const kept = current.filter((key) => available.has(key))
      if (kept.length > 0 || series.length === 0) return sameStringArray(current, kept) ? current : kept
      const preferred = preferredMetricKeys(series)
      return sameStringArray(current, preferred) ? current : preferred
    })
  }, [seriesKey, series])

  useEffect(() => {
    if (!resultChartRequest || series.length === 0) return
    const available = new Set(series.map((line) => line.key))
    const requested = resultChartRequest.metrics.filter((key) => available.has(key))
    if (requested.length === 0) return
    setChartKeys((current) => {
      const next = resultChartRequest.action === 'replace'
        ? requested
        : [...new Set([...current, ...requested])]
      return sameStringArray(current, next) ? current : next
    })
  }, [resultRequestKey, seriesKey, resultChartRequest, series])

  useEffect(() => {
    setLayoutByKey((current) => {
      const next: Record<string, ChartLayout> = {}
      chartKeys.forEach((key, index) => {
        next[key] = current[key] ?? defaultChartLayout(index)
      })
      return sameLayoutRecord(current, next) ? current : next
    })
  }, [chartKeys])

  useEffect(() => {
    if (!drag) return

    const handleMove = (event: globalThis.PointerEvent) => {
      if (drag.kind === 'pan') {
        setViewport((current) => ({
          ...current,
          x: drag.originX + event.clientX - drag.startX,
          y: drag.originY + event.clientY - drag.startY,
        }))
        return
      }

      const dx = (event.clientX - drag.startX) / drag.scale
      const dy = (event.clientY - drag.startY) / drag.scale
      setLayoutByKey((current) => {
        const existing = current[drag.key] ?? drag.origin
        const next = { ...current }
        if (drag.kind === 'move') {
          next[drag.key] = { ...existing, x: Math.max(0, drag.origin.x + dx), y: Math.max(0, drag.origin.y + dy) }
        } else {
          next[drag.key] = {
            ...existing,
            w: Math.max(280, drag.origin.w + dx),
            h: Math.max(210, drag.origin.h + dy),
          }
        }
        return next
      })
    }

    const handleUp = () => setDrag(null)
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [drag])

  const unusedKeys = series.map((line) => line.key).filter((key) => !chartKeys.includes(key))
  const charts = chartKeys
    .map((key) => series.find((line) => line.key === key))
    .filter((line): line is Series => Boolean(line))
  const canvasSize = useMemo(() => computeCanvasSize(chartKeys, layoutByKey), [chartKeys, layoutByKey])
  const scrollSize = useMemo(
    () => ({
      width: Math.max(canvasSize.width, Math.ceil(canvasSize.width * viewport.scale + Math.abs(viewport.x))),
      height: Math.max(canvasSize.height, Math.ceil(canvasSize.height * viewport.scale + Math.abs(viewport.y))),
    }),
    [canvasSize.height, canvasSize.width, viewport.scale, viewport.x, viewport.y],
  )

  const addChart = () => {
    const key = addingKey || unusedKeys[0]
    if (!key) return
    setChartKeys((current) => (current.includes(key) ? current : [...current, key]))
    setAddingKey('')
  }

  const zoomCanvas = (factor: number) => {
    setViewport((current) => ({ ...current, scale: clamp(current.scale * factor, 0.55, 1.8) }))
  }

  const resetCanvas = () => {
    setViewport({ x: 0, y: 0, scale: 1 })
  }

  if (!runId || !ticks || ticks.length === 0 || displayTicks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-[10px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] text-sm text-[var(--color-text-tertiary)]">
        {t('metric.empty')}
      </div>
    )
  }

  return (
    <div
      data-testid="metric-chart-module"
      className="flex h-full min-h-0 flex-col rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-[var(--color-text-primary)]">{t('metric.title')}</div>
          <div className="mt-0.5 truncate text-[11px] text-[var(--color-text-tertiary)]">
            tick {maxTick}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {unusedKeys.length > 0 ? (
            <div className="flex items-center gap-1">
              <select
                aria-label={t('metric.addVariableAria')}
                value={addingKey}
                onChange={(event) => setAddingKey(event.target.value)}
                className="h-8 max-w-[150px] rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-text-secondary)] outline-none"
              >
                <option value="">{t('metric.chooseVariable')}</option>
                {unusedKeys.map((key) => (
                  <option key={key} value={key}>{key}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={addChart}
                className="inline-flex h-8 items-center gap-1 rounded-[8px] bg-[var(--color-brand)] px-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                {t('metric.newChart')}
              </button>
            </div>
          ) : null}
          <IconButton label={t('metric.zoomOut')} onClick={() => zoomCanvas(1 / 1.15)}>
            <ZoomOut className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          </IconButton>
          <IconButton label={t('metric.zoomIn')} onClick={() => zoomCanvas(1.15)}>
            <ZoomIn className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          </IconButton>
          <IconButton label={t('metric.resetCanvas')} onClick={resetCanvas}>
            <Maximize2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          </IconButton>
          <button
            type="button"
            onClick={() => setEditMode((value) => !value)}
            data-active={editMode ? 'true' : undefined}
            className="h-8 rounded-[8px] border border-[var(--color-border)] px-2.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] data-[active=true]:border-[var(--color-brand)] data-[active=true]:text-[var(--color-brand)]"
          >
            {t('metric.edit')}
          </button>
        </div>
      </div>

      <div
        data-testid="metric-chart-canvas"
        className="relative mt-3 min-h-0 flex-1 overflow-auto rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.13) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.13) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          cursor: editMode ? (drag?.kind === 'pan' ? 'grabbing' : 'grab') : 'default',
        }}
        onPointerDown={(event) => {
          if (!editMode || event.button !== 0 || event.target !== event.currentTarget) return
          event.preventDefault()
          setDrag({ kind: 'pan', startX: event.clientX, startY: event.clientY, originX: viewport.x, originY: viewport.y })
        }}
      >
        <div
          className="pointer-events-none absolute left-3 top-3 z-10 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)]/90 px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-tertiary)] shadow-sm"
        >
          {Math.round(viewport.scale * 100)}%
        </div>
        <div className="relative" style={{ width: scrollSize.width, height: scrollSize.height }}>
          <div
            className="absolute left-0 top-0"
            style={{
              width: canvasSize.width,
              height: canvasSize.height,
              transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
              transformOrigin: '0 0',
            }}
          >
            {charts.map((line, index) => {
              const layout = layoutByKey[line.key] ?? defaultChartLayout(index)
              return (
                <div
                  key={line.key}
                  className="absolute"
                  style={{ left: layout.x, top: layout.y, width: layout.w, height: layout.h }}
                >
                  <MetricChartCard
                    runId={runId}
                    ticks={displayTicks}
                    series={line}
                    maxTick={maxTick}
                    primary={index === 0}
                    editMode={editMode}
                    changepoints={changepointsByMetric.get(line.key) ?? []}
                    onMoveStart={(event) => {
                      if (!editMode || event.button !== 0) return
                      event.preventDefault()
                      event.stopPropagation()
                      setDrag({ kind: 'move', key: line.key, startX: event.clientX, startY: event.clientY, origin: layout, scale: viewport.scale })
                    }}
                    onResizeStart={(event) => {
                      if (!editMode || event.button !== 0) return
                      event.preventDefault()
                      event.stopPropagation()
                      setDrag({ kind: 'resize', key: line.key, startX: event.clientX, startY: event.clientY, origin: layout, scale: viewport.scale })
                    }}
                    onGrow={() => setLayoutByKey((current) => resizeChart(current, line.key, 1.12, layout))}
                    onShrink={() => setLayoutByKey((current) => resizeChart(current, line.key, 1 / 1.12, layout))}
                    onRemove={() => setChartKeys((current) => current.filter((key) => key !== line.key))}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricChartCard({
  runId,
  ticks,
  series,
  maxTick,
  primary,
  editMode,
  changepoints,
  onMoveStart,
  onResizeStart,
  onGrow,
  onShrink,
  onRemove,
}: {
  runId: string
  ticks: TickPoint[]
  series: Series
  maxTick: number
  primary: boolean
  editMode: boolean
  changepoints: Changepoint[]
  onMoveStart: (event: PointerEvent<HTMLButtonElement>) => void
  onResizeStart: (event: PointerEvent<HTMLDivElement>) => void
  onGrow: () => void
  onShrink: () => void
  onRemove: () => void
}) {
  const t = useAbmText()
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [range, setRange] = useState<TickRange | null>(null)
  const [pendingStart, setPendingStart] = useState<number | null>(null)
  const [contextMenu, setContextMenu] = useState<ChartContextMenuState | null>(null)
  const [explainAnchor, setExplainAnchor] = useState<MiniExplainAnchor | null>(null)
  const setExplainFocus = useAbmStore((store) => store.setExplainFocus)
  const values = series.points.map((point) => point.y)
  const maxValue = Math.max(1, ...values)
  const minValue = Math.min(0, ...values)
  const ySpan = Math.max(1, maxValue - minValue)
  const plotWidth = WIDTH - PADDING.left - PADDING.right
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom
  const xScale = (tick: number) => PADDING.left + (maxTick > 0 ? (tick / maxTick) * plotWidth : 0)
  const yScale = (value: number) => PADDING.top + plotHeight - ((value - minValue) / ySpan) * plotHeight
  const activeRange = normalizeRange(range, maxTick)

  const openMechanismAttribution = (nextRange: TickRange) => {
    setExplainFocus({
      runId,
      metric: series.key,
      from: nextRange.from,
      to: nextRange.to,
    })
  }

  const latest = series.points.at(-1)
  const latestInRange = [...ticks]
    .filter((point) => point.tick >= activeRange.from && point.tick <= activeRange.to)
    .at(-1)
  const explainTarget: MiniExplainTarget = {
    title: t('metric.explainRange'),
    subject: `${series.key} · tick ${activeRange.from}-${activeRange.to}`,
    runId,
    tick: activeRange.to,
    range: activeRange,
    ...(latestInRange ? { metricsHint: latestInRange.metrics } : {}),
  }

  const tickFromEvent = (event: { clientX: number }): number => {
    const svg = svgRef.current
    if (!svg) return 0
    const rect = svg.getBoundingClientRect()
    const ratio = (event.clientX - rect.left) / Math.max(1, rect.width)
    const plotRatio = (ratio * WIDTH - PADDING.left) / Math.max(1, plotWidth)
    return clamp(Math.round(plotRatio * maxTick), 0, maxTick)
  }

  const handleChartClick = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button > 0) return
    const tick = tickFromEvent(event)
    setContextMenu(null)
    if (pendingStart === null) {
      setPendingStart(tick)
      setRange({ from: tick, to: tick })
      setExplainFocus(null)
      return
    }
    setRange(normalizeRange({ from: pendingStart, to: tick }, maxTick))
    setPendingStart(null)
    setExplainFocus(null)
  }

  return (
    <div className="relative flex h-full flex-col rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: series.color }} />
            <h3 className="truncate text-xs font-semibold text-[var(--color-text-primary)]">{series.key}</h3>
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-[var(--color-text-tertiary)]">
            {t('metric.latest')} {latest ? formatNumber(latest.y) : '--'} · {t('metric.interval')} tick {activeRange.from}-{activeRange.to}
            {pendingStart !== null ? ` · ${t('metric.clickAgain')}` : ''}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {range ? (
            <button
              type="button"
              aria-label={t('metric.explainAria', { metric: series.key })}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                setExplainAnchor({ x: rect.left + rect.width / 2, y: rect.bottom + 6 })
              }}
              className="inline-flex h-7 items-center gap-1 rounded-[7px] bg-[var(--color-brand)] px-2 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              {t('metric.explainRange')}
            </button>
          ) : null}
          {editMode ? (
            <>
            <IconButton label={t('metric.moveChart')} onPointerDown={onMoveStart}>
              <Move className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            </IconButton>
            <IconButton label={t('metric.shrinkChart')} onClick={onShrink}>
              <ZoomOut className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            </IconButton>
            <IconButton label={t('metric.growChart')} onClick={onGrow}>
              <ZoomIn className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            </IconButton>
            <IconButton label={t('metric.deleteChart')} onClick={onRemove}>
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            </IconButton>
            </>
          ) : null}
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="min-h-0 flex-1 cursor-crosshair rounded-[8px] bg-[var(--color-surface-container-lowest)]"
        role="img"
        aria-label={t('metric.chartAria', { metric: series.key })}
        onPointerDown={handleChartClick}
        onContextMenu={(event) => {
          event.preventDefault()
          const tick = tickFromEvent(event)
          const nextRange = normalizeRange(range ?? { from: Math.max(0, tick - 5), to: Math.min(maxTick, tick + 5) }, maxTick)
          setRange(nextRange)
          setPendingStart(null)
          setContextMenu({ anchor: { x: event.clientX, y: event.clientY }, range: nextRange })
        }}
      >
        <rect x={PADDING.left} y={PADDING.top} width={plotWidth} height={plotHeight} fill="var(--color-surface-container-lowest)" />
        <rect
          x={xScale(activeRange.from)}
          y={PADDING.top}
          width={Math.max(1, xScale(activeRange.to) - xScale(activeRange.from))}
          height={plotHeight}
          fill="var(--color-brand)"
          opacity={range ? 0.12 : 0}
        />
        {pendingStart !== null ? (
          <line
            x1={xScale(pendingStart)}
            y1={PADDING.top}
            x2={xScale(pendingStart)}
            y2={PADDING.top + plotHeight}
            stroke="var(--color-brand)"
            strokeWidth={2}
            strokeDasharray="6 5"
          />
        ) : null}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const value = minValue + ySpan * ratio
          const y = yScale(value)
          return (
            <g key={`y-${ratio}`}>
              <line x1={PADDING.left} y1={y} x2={PADDING.left + plotWidth} y2={y} stroke="var(--color-border)" strokeWidth={0.75} strokeDasharray="3 4" />
              <text x={PADDING.left - 6} y={y + 3} textAnchor="end" fontSize="10" fill="var(--color-text-tertiary)">
                {formatNumber(value)}
              </text>
            </g>
          )
        })}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const tick = Math.round(maxTick * ratio)
          const x = xScale(tick)
          return (
            <g key={`x-${ratio}`}>
              <line x1={x} y1={PADDING.top} x2={x} y2={PADDING.top + plotHeight} stroke="var(--color-border)" strokeWidth={0.5} opacity={0.7} />
              <text x={x} y={HEIGHT - 8} textAnchor="middle" fontSize="10" fill="var(--color-text-tertiary)">
                {tick}
              </text>
            </g>
          )
        })}
        <polyline
          fill="none"
          stroke={series.color}
          strokeWidth={primary ? 2.4 : 2}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={series.points.map((point) => `${xScale(point.x)},${yScale(point.y)}`).join(' ')}
        />
        {changepoints.filter((cp) => cp.tick <= maxTick).map((cp) => {
          const nearest = series.points.reduce<{ x: number; y: number } | null>(
            (best, point) =>
              best === null || Math.abs(point.x - cp.tick) < Math.abs(best.x - cp.tick) ? point : best,
            null,
          )
          if (!nearest) return null
          const x = xScale(cp.tick)
          const y = yScale(nearest.y)
          return (
            <g
              key={`cp-${cp.tick}`}
              data-testid="changepoint-marker"
              className="cursor-pointer"
              onPointerDown={(event) => {
                // Detected inflection tick: select a tight window around it so
                // Start the interval explanation flow from the salient moment.
                event.stopPropagation()
                setPendingStart(null)
                setRange(normalizeRange({ from: cp.tick - 5, to: cp.tick + 5 }, maxTick))
                setExplainFocus(null)
              }}
            >
              <title>
                {t('metric.changepointTitle', {
                  tick: cp.tick,
                  direction: directionLabel(cp.direction, t),
                  before: cp.beforeSlope.toFixed(2),
                  after: cp.afterSlope.toFixed(2),
                })}
              </title>
              <line
                x1={x}
                y1={PADDING.top}
                x2={x}
                y2={PADDING.top + plotHeight}
                stroke="var(--color-warning)"
                strokeWidth={1}
                strokeDasharray="4 4"
                opacity={0.75}
              />
              <path
                d={`M ${x} ${y - 5.5} L ${x + 5} ${y} L ${x} ${y + 5.5} L ${x - 5} ${y} Z`}
                fill="var(--color-warning)"
                stroke="var(--color-surface)"
                strokeWidth={1.2}
              />
            </g>
          )
        })}
        {latest ? (
          <circle
            cx={xScale(latest.x)}
            cy={yScale(latest.y)}
            r={3.5}
            fill={series.color}
            stroke="var(--color-surface)"
            strokeWidth={1.5}
          />
        ) : null}
      </svg>

      {editMode ? (
        <div
          className="absolute bottom-1 right-1 h-4 w-4 cursor-nwse-resize rounded-br-[8px] border-b-2 border-r-2 border-[var(--color-brand)]/70"
          title={t('metric.resizeChart')}
          onPointerDown={onResizeStart}
        />
      ) : null}

      {contextMenu
        ? createPortal(
            <ChartContextMenu
              anchor={contextMenu.anchor}
              onOpenAttribution={() => {
                openMechanismAttribution(contextMenu.range)
                setContextMenu(null)
              }}
              onExplain={() => {
                setExplainAnchor(contextMenu.anchor)
                setContextMenu(null)
              }}
              onFullRange={() => {
                setRange({ from: 0, to: maxTick })
                setExplainFocus(null)
                setContextMenu(null)
              }}
              onClose={() => setContextMenu(null)}
            />,
            document.body,
          )
        : null}

      <MiniExplainPopover
        open={Boolean(explainAnchor)}
        anchor={explainAnchor}
        target={explainTarget}
        onClose={() => setExplainAnchor(null)}
      />
    </div>
  )
}

function ChartContextMenu({
  anchor,
  onOpenAttribution,
  onExplain,
  onFullRange,
  onClose,
}: {
  anchor: MiniExplainAnchor
  onOpenAttribution: () => void
  onExplain: () => void
  onFullRange: () => void
  onClose: () => void
}) {
  const t = useAbmText()
  return (
    <div
      role="menu"
      className="fixed z-[60] w-[172px] overflow-hidden rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-1 text-xs shadow-[var(--shadow-dropdown)]"
      style={anchoredStyle(anchor, 172, 148)}
    >
      <ContextItem onClick={onOpenAttribution}>
        <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        {t('metric.contextAttribution')}
      </ContextItem>
      <ContextItem onClick={onExplain}>
        <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        {t('metric.contextExplain')}
      </ContextItem>
      <ContextItem onClick={onFullRange}>{t('metric.contextFullRange')}</ContextItem>
      <ContextItem onClick={onClose}>{t('metric.contextClose')}</ContextItem>
    </div>
  )
}

function ContextItem({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex h-8 w-full items-center gap-2 rounded-[7px] px-2 text-left font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
    >
      {children}
    </button>
  )
}

function IconButton({
  label,
  children,
  onClick,
  onPointerDown,
}: {
  label: string
  children: ReactNode
  onClick?: () => void
  onPointerDown?: (event: PointerEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      onPointerDown={onPointerDown}
      className="grid h-7 w-7 place-items-center rounded-[7px] border border-[var(--color-border)] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-default disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function defaultChartLayout(index: number): ChartLayout {
  if (index === 0) return { x: 20, y: 20, w: 560, h: 300 }
  return {
    x: 20 + ((index - 1) % 2) * 300,
    y: 346 + Math.floor((index - 1) / 2) * 236,
    w: 280,
    h: 210,
  }
}

function computeCanvasSize(keys: string[], layouts: Record<string, ChartLayout>): { width: number; height: number } {
  let width = 760
  let height = 600
  keys.forEach((key, index) => {
    const layout = layouts[key] ?? defaultChartLayout(index)
    width = Math.max(width, layout.x + layout.w + 80)
    height = Math.max(height, layout.y + layout.h + 80)
  })
  return { width, height }
}

function resizeChart(
  current: Record<string, ChartLayout>,
  key: string,
  factor: number,
  fallback: ChartLayout,
): Record<string, ChartLayout> {
  const layout = current[key] ?? fallback
  return {
    ...current,
    [key]: {
      ...layout,
      w: Math.max(280, layout.w * factor),
      h: Math.max(210, layout.h * factor),
    },
  }
}

function normalizeRange(range: TickRange | null, maxTick: number): TickRange {
  if (!range) return { from: 0, to: maxTick }
  const from = clamp(Math.min(range.from, range.to), 0, maxTick)
  const to = clamp(Math.max(range.from, range.to), 0, maxTick)
  return { from, to }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value)
  if (Math.abs(value) >= 100) return value.toFixed(1)
  if (Math.abs(value) >= 1) return value.toFixed(2)
  return value.toFixed(3)
}

function directionLabel(direction: Changepoint['direction'], t: ReturnType<typeof useAbmText>): string {
  switch (direction) {
    case 'accelerate':
      return t('explain.direction.accelerate')
    case 'decelerate':
      return t('explain.direction.decelerate')
    case 'reversal':
      return t('explain.direction.reversal')
  }
}

function anchoredStyle(anchor: MiniExplainAnchor, width: number, height: number) {
  if (typeof window === 'undefined') return { left: 12, top: 12 }
  return {
    left: Math.max(12, Math.min(anchor.x + 10, window.innerWidth - width - 12)),
    top: Math.max(12, Math.min(anchor.y + 10, window.innerHeight - height - 12)),
  }
}
