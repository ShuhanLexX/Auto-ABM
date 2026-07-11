import { useEffect, useMemo, useState } from 'react'
import { FlaskConical, GitCompareArrows } from 'lucide-react'
import type { UIMessage } from '../../types/chat'
import { traceClient } from '../trace/traceClient'
import { useSelectionStore } from '../stores/selectionStore'
import { useAbmText } from '../i18n'

type CounterfactualMessage = Extract<UIMessage, { type: 'abm_counterfactual' }>

type Props = {
  message: CounterfactualMessage
}

interface SeriesPoint {
  tick: number
  value: number
}

const CHART_W = 320
const CHART_H = 96
const PAD = { left: 6, right: 6, top: 8, bottom: 8 }

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return Math.abs(value) >= 1 ? value.toFixed(2) : value.toFixed(3)
}

function formatSigned(value: number): string {
  const text = formatNumber(Math.abs(value))
  return value > 0 ? `+${text}` : value < 0 ? `-${text}` : text
}

async function fetchMetricSeries(runId: string, metric: string): Promise<SeriesPoint[]> {
  const { records } = await traceClient.fetchRange(runId, { kinds: ['tick_metrics'] })
  const points: SeriesPoint[] = []
  for (const record of records) {
    if (typeof record.tick !== 'number') continue
    const metrics = record.metrics
    if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) continue
    const value = (metrics as Record<string, unknown>)[metric]
    if (typeof value === 'number' && Number.isFinite(value)) points.push({ tick: record.tick, value })
  }
  return points.sort((a, b) => a.tick - b.tick)
}

function toPolyline(
  points: SeriesPoint[],
  domain: { minTick: number; maxTick: number; minV: number; maxV: number },
): string {
  const spanT = Math.max(1, domain.maxTick - domain.minTick)
  const spanV = Math.max(1e-9, domain.maxV - domain.minV)
  return points
    .map((p) => {
      const x = PAD.left + ((p.tick - domain.minTick) / spanT) * (CHART_W - PAD.left - PAD.right)
      const y = CHART_H - PAD.bottom - ((p.value - domain.minV) / spanV) * (CHART_H - PAD.top - PAD.bottom)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

/**
 * Deterministic counterfactual comparison (EMNLP demo highlight). Same seed,
 * same model version, only the listed parameters changed — every divergence in
 * the overlay is caused by the change alone. The two trajectories are fetched
 * from the real traces of both runs; nothing is drawn from model memory.
 */
export function CounterfactualCard({ message }: Props) {
  const t = useAbmText()
  const setEvidenceFocus = useSelectionStore((s) => s.setEvidenceFocus)
  const completed = message.status === 'completed'

  // The most divergent metric gets the trajectory overlay.
  const focusMetric = useMemo(() => {
    const ranked = [...message.metrics].sort(
      (a, b) => Math.abs(b.finalDelta ?? 0) - Math.abs(a.finalDelta ?? 0) || b.maxAbsDelta - a.maxAbsDelta,
    )
    return ranked[0]?.metric ?? null
  }, [message.metrics])

  const [overlay, setOverlay] = useState<{ base: SeriesPoint[]; other: SeriesPoint[] } | null>(null)

  useEffect(() => {
    if (!completed || !focusMetric) return
    let cancelled = false
    Promise.all([
      fetchMetricSeries(message.baseRunId, focusMetric),
      fetchMetricSeries(message.runId, focusMetric),
    ])
      .then(([base, other]) => {
        if (!cancelled && base.length > 1 && other.length > 1) setOverlay({ base, other })
      })
      .catch(() => {
        /* overlay is progressive enhancement; the delta table is already grounded */
      })
    return () => {
      cancelled = true
    }
  }, [completed, focusMetric, message.baseRunId, message.runId])

  const domain = useMemo(() => {
    if (!overlay) return null
    const all = [...overlay.base, ...overlay.other]
    return {
      minTick: Math.min(...all.map((p) => p.tick)),
      maxTick: Math.max(...all.map((p) => p.tick)),
      minV: Math.min(...all.map((p) => p.value)),
      maxV: Math.max(...all.map((p) => p.value)),
    }
  }, [overlay])

  const statusBadge =
    message.status === 'completed'
      ? { label: t('counterfactual.status.completed'), className: 'bg-[#34d399]/15 text-[#0f9d6c]' }
      : message.status === 'timeout'
        ? { label: t('counterfactual.status.timeout'), className: 'bg-[var(--color-warning-container)]/40 text-[var(--color-warning)]' }
        : { label: t('counterfactual.status.failed'), className: 'bg-[#f87171]/15 text-[#dc2626]' }

  return (
    <div
      data-testid="counterfactual-card"
      className="mb-3 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
    >
      <div className="flex items-center gap-2 border-b border-[var(--color-border)]/65 bg-[var(--color-surface-container-low)] px-3 py-2.5">
        <FlaskConical size={15} strokeWidth={2.1} className="shrink-0 text-[var(--color-brand)]" aria-hidden="true" />
        <div className="text-[12px] font-semibold text-[var(--color-text-primary)]">{t('counterfactual.title')}</div>
        <span
          data-testid="counterfactual-status"
          className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge.className}`}
        >
          {statusBadge.label}
        </span>
      </div>

      <div className="px-3 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {Object.entries(message.changed).map(([key, value]) => (
            <span
              key={key}
              data-testid="counterfactual-change-chip"
              className="rounded-full border border-[var(--color-brand)]/35 bg-[var(--color-brand)]/8 px-2 py-0.5 font-[var(--font-mono)] text-[10px] text-[var(--color-text-primary)]"
            >
              {key} → {String(value)}
            </span>
          ))}
          <span className="font-[var(--font-mono)] text-[10px] text-[var(--color-text-tertiary)]">
            {t('counterfactual.sameSeed', { seed: message.seed, steps: message.steps })}
          </span>
        </div>

        {completed ? (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--color-text-secondary)]">
            <GitCompareArrows size={13} strokeWidth={2.1} className="shrink-0 text-[var(--color-text-tertiary)]" aria-hidden="true" />
            {message.divergenceTick !== null && message.divergenceTick !== undefined ? (
              <button
                type="button"
                data-testid="divergence-chip"
                onClick={() => setEvidenceFocus({ runId: message.baseRunId, tick: message.divergenceTick! })}
                className="rounded-full border border-[var(--color-border)]/70 bg-[var(--color-surface-container-low)] px-2 py-0.5 font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-brand)]/40 hover:text-[var(--color-text-primary)]"
              >
                {t('counterfactual.firstDivergence', { tick: message.divergenceTick })}
              </button>
            ) : (
              <span>{t('counterfactual.identical')}</span>
            )}
          </div>
        ) : null}

        {overlay && domain && focusMetric ? (
          <div className="mt-2.5" data-testid="counterfactual-overlay">
            <div className="mb-1 flex items-center justify-between text-[10px] text-[var(--color-text-tertiary)]">
              <span className="font-[var(--font-mono)]">{focusMetric}</span>
              <span className="flex items-center gap-2">
                <span className="flex items-center gap-1">
                  <svg width="14" height="4" aria-hidden="true"><line x1="0" y1="2" x2="14" y2="2" stroke="#60a5fa" strokeWidth="2" /></svg>
                  {t('counterfactual.baseline')}
                </span>
                <span className="flex items-center gap-1">
                  <svg width="14" height="4" aria-hidden="true"><line x1="0" y1="2" x2="14" y2="2" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 3" /></svg>
                  {t('counterfactual.counterfactual')}
                </span>
              </span>
            </div>
            <svg
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              className="w-full rounded-[8px] border border-[var(--color-border)]/60 bg-[var(--color-surface-container-lowest)]"
              role="img"
              aria-label={t('counterfactual.compareAria', { metric: focusMetric })}
            >
              {message.divergenceTick !== null && message.divergenceTick !== undefined ? (
                <line
                  x1={PAD.left + ((message.divergenceTick - domain.minTick) / Math.max(1, domain.maxTick - domain.minTick)) * (CHART_W - PAD.left - PAD.right)}
                  y1={PAD.top}
                  x2={PAD.left + ((message.divergenceTick - domain.minTick) / Math.max(1, domain.maxTick - domain.minTick)) * (CHART_W - PAD.left - PAD.right)}
                  y2={CHART_H - PAD.bottom}
                  stroke="var(--color-warning)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
              ) : null}
              <polyline fill="none" stroke="#60a5fa" strokeWidth="1.8" strokeLinejoin="round" points={toPolyline(overlay.base, domain)} />
              <polyline fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeDasharray="5 3" strokeLinejoin="round" points={toPolyline(overlay.other, domain)} />
            </svg>
          </div>
        ) : null}

        {message.metrics.length > 0 ? (
          <table className="mt-2.5 w-full border-collapse text-[10px]" data-testid="counterfactual-metric-table">
            <thead>
              <tr className="text-left text-[var(--color-text-tertiary)]">
                <th className="pb-1 font-medium">{t('counterfactual.metric')}</th>
                <th className="pb-1 text-right font-medium">{t('counterfactual.baselineFinal')}</th>
                <th className="pb-1 text-right font-medium">{t('counterfactual.counterfactualFinal')}</th>
                <th className="pb-1 text-right font-medium">{t('counterfactual.finalDelta')}</th>
                <th className="pb-1 text-right font-medium">{t('counterfactual.maxDelta')}</th>
              </tr>
            </thead>
            <tbody className="font-[var(--font-mono)] text-[var(--color-text-secondary)]">
              {message.metrics.map((m) => (
                <tr key={m.metric} className="border-t border-[var(--color-border)]/45">
                  <td className="py-1 pr-2">{m.metric}</td>
                  <td className="py-1 text-right">{m.baseFinal !== null ? formatNumber(m.baseFinal) : '—'}</td>
                  <td className="py-1 text-right">{m.otherFinal !== null ? formatNumber(m.otherFinal) : '—'}</td>
                  <td
                    className={`py-1 text-right font-semibold ${
                      (m.finalDelta ?? 0) > 0 ? 'text-[#0f9d6c]' : (m.finalDelta ?? 0) < 0 ? 'text-[#dc2626]' : ''
                    }`}
                  >
                    {m.finalDelta !== null ? formatSigned(m.finalDelta) : '—'}
                  </td>
                  <td className="py-1 text-right">
                    {formatNumber(m.maxAbsDelta)}
                    {m.maxAbsDeltaTick !== null ? <span className="text-[var(--color-text-tertiary)]"> @t{m.maxAbsDeltaTick}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {message.note ? (
          <p className="mt-2.5 border-t border-[var(--color-border)]/50 pt-2 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
            {message.note}
          </p>
        ) : null}
      </div>
    </div>
  )
}
