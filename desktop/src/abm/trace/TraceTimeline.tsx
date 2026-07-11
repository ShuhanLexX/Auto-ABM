import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Plus, Radio, Sparkles } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { useTabStore } from '../../stores/tabStore'
import { useUIStore } from '../../stores/uiStore'
import { useAbmStore } from '../stores/abmStore'
import { useSelectionStore } from '../stores/selectionStore'
import { traceClient, type TraceRecord } from './traceClient'
import { snapshotToState, type SpaceSnapshot } from './snapshotState'
import { MiniExplainPopover, type MiniExplainAnchor } from '../components/MiniExplainPopover'

interface TraceTimelineProps {
  runId: string | null
}

export function TraceTimeline({ runId }: TraceTimelineProps) {
  const run = useAbmStore((store) => (runId ? store.runs[runId] : undefined))
  const meta = run?.meta
  const replay = useSelectionStore((store) => store.replay)
  const setReplay = useSelectionStore((store) => store.setReplay)
  const evidenceFocus = useSelectionStore((store) => store.evidenceFocus)
  const activeTabId = useTabStore((store) => store.activeTabId)
  const queueComposerPrefill = useChatStore((store) => store.queueComposerPrefill)
  const addToast = useUIStore((store) => store.addToast)

  const [scrubTick, setScrubTick] = useState<number | null>(null)
  const [markers, setMarkers] = useState<TraceRecord[]>([])
  const [explainAnchor, setExplainAnchor] = useState<MiniExplainAnchor | null>(null)
  const seekTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const maxTick = useMemo(() => {
    const lastTick = run?.ticks.at(-1)?.tick
    return lastTick ?? run?.totalSteps ?? 0
  }, [run?.ticks, run?.totalSteps])

  const isCompleted = run?.state === 'completed'

  // Pull event / mechanism markers once the run has finished (trace flushed).
  useEffect(() => {
    if (!runId || !isCompleted) return
    let cancelled = false
    void traceClient
      .fetchRange(runId, { from: 0, to: maxTick, kinds: ['event', 'mechanism_fired'] })
      .then((response) => {
        if (!cancelled) setMarkers(response.records)
      })
      .catch(() => {
        if (!cancelled) setMarkers([])
      })
    return () => {
      cancelled = true
    }
  }, [runId, isCompleted, maxTick])

  // Reset scrub/replay whenever the run changes.
  useEffect(() => {
    setScrubTick(null)
    setReplay(null)
    return () => setReplay(null)
  }, [runId, setReplay])

  const seek = useCallback(
    (tick: number) => {
      if (!runId || !meta) return
      void traceClient
        .fetchNearestSnapshot(runId, tick)
        .then((response) => {
          const record = response.records[0]
          if (!record || !record.snapshot) return
          const state = snapshotToState(record.snapshot as SpaceSnapshot, meta)
          setReplay({ tick: typeof record.tick === 'number' ? record.tick : tick, state })
        })
        .catch(() => {
          /* leave the current frame in place on a failed seek */
        })
    },
    [runId, meta, setReplay],
  )

  // Evidence chip clicked in an ExplanationCard: seek the timeline to that tick
  // so the canvas replays the moment the explanation cites (conversation-ux.md §4).
  useEffect(() => {
    if (!evidenceFocus || evidenceFocus.runId !== runId) return
    setScrubTick(evidenceFocus.tick)
    seek(evidenceFocus.tick)
  }, [evidenceFocus, runId, seek])

  const handleScrub = (tick: number) => {
    setScrubTick(tick)
    if (seekTimer.current) clearTimeout(seekTimer.current)
    seekTimer.current = setTimeout(() => seek(tick), 120)
  }

  const goLive = () => {
    setScrubTick(null)
    setReplay(null)
  }

  const sliderValue = scrubTick ?? replay?.tick ?? maxTick
  const disabled = !runId || maxTick <= 0
  const replaying = replay !== null
  const selectedTick = scrubTick ?? replay?.tick ?? maxTick
  const selectedMetrics = nearestMetrics(run?.ticks ?? [], selectedTick)
  const metricHint = selectedMetrics ? `\n已观察数值：${formatMetricLine(selectedMetrics.tick, selectedMetrics.metrics)}` : ''
  const tracePrompt = runId
    ? `@Run ${runId}\n请基于真实 Trace 解释 tick ${selectedTick} 附近发生了什么，说明指标变化、机制触发和智能体状态如何连接。请列出证据；没有证据的判断请标注为推测。${metricHint}`
    : ''
  const insertTracePrompt = (prefix = '') => {
    if (!activeTabId || !tracePrompt) return
    queueComposerPrefill(activeTabId, { text: `${prefix}${tracePrompt}`, mode: 'append' })
    addToast({ type: 'success', message: '已加入对话输入框，确认后发送。' })
  }
  const openTraceExplain = (event: MouseEvent<HTMLButtonElement>) => {
    setExplainAnchor({ x: event.clientX, y: event.clientY })
  }

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-[var(--color-text-secondary)]">证据时间线</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-[var(--color-text-tertiary)]">
            {replaying ? `tick ${replay.tick}` : '实时'} / {maxTick}
          </span>
          <button
            type="button"
            onClick={goLive}
            disabled={!replaying}
            className="inline-flex h-6 items-center gap-1 rounded-[6px] border border-[var(--color-border)] px-2 text-[11px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:cursor-default disabled:opacity-40"
          >
            <Radio className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
            回到实时
          </button>
        </div>
      </div>

      <div className="relative">
        <input
          type="range"
          min={0}
          max={Math.max(1, maxTick)}
          step={1}
          value={sliderValue}
          disabled={disabled}
          onChange={(event) => handleScrub(Number(event.target.value))}
          aria-label="拖动证据时间线"
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--color-surface-container)] accent-[var(--color-brand)] disabled:cursor-default disabled:opacity-50"
        />
        {maxTick > 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2">
            {markers.map((marker, i) => (
              <span
                key={`${marker.kind}-${marker.tick}-${i}`}
                title={`${marker.kind} @ ${marker.tick}${marker.name ? ` · ${String(marker.name)}` : ''}`}
                className="absolute h-2 w-2 -translate-x-1/2 rounded-full"
                style={{
                  left: `${((marker.tick ?? 0) / maxTick) * 100}%`,
                  backgroundColor:
                    marker.kind === 'event' ? 'var(--color-warning, #fbbf24)' : 'var(--color-brand)',
                }}
              />
            ))}
          </div>
        )}
      </div>

      {runId && maxTick > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => insertTracePrompt()}
            className="inline-flex h-7 items-center gap-1 rounded-[7px] border border-[var(--color-border)] px-2 text-[11px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            加入对话
          </button>
          <button
            type="button"
            onClick={openTraceExplain}
            className="inline-flex h-7 items-center gap-1 rounded-[7px] bg-[var(--color-brand)] px-2 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
          >
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            解释当前 tick
          </button>
        </div>
      ) : null}
      <MiniExplainPopover
        open={Boolean(explainAnchor)}
        anchor={explainAnchor}
        onClose={() => setExplainAnchor(null)}
        target={{
          title: 'AI Trace 解释',
          subject: runId ? `Run ${runId} · tick ${selectedTick}` : `tick ${selectedTick}`,
          ...(runId ? { runId } : {}),
          tick: selectedTick,
          ...(selectedMetrics ? { metricsHint: selectedMetrics.metrics } : {}),
        }}
      />
    </div>
  )
}

function nearestMetrics(points: Array<{ tick: number; metrics: Record<string, number> }>, tick: number) {
  return [...points].sort((a, b) => Math.abs(a.tick - tick) - Math.abs(b.tick - tick))[0]
}

function formatMetricLine(tick: number, metrics: Record<string, number>): string {
  const values = Object.entries(metrics)
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
    .slice(0, 6)
    .map(([key, value]) => `${key}=${formatNumber(value)}`)
  return values.length ? `tick ${tick}: ${values.join('，')}` : `tick ${tick}: 暂无指标`
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString()
  if (Math.abs(value) >= 100) return value.toFixed(1)
  if (Math.abs(value) >= 1) return value.toFixed(2)
  return value.toFixed(3)
}
