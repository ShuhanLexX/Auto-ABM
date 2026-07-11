import { useEffect, useMemo, useState } from 'react'
import { GitBranch, Network, Scale, Sparkles, TrendingUp, X } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { useTabStore } from '../../stores/tabStore'
import { abmClient } from '../api/abmClient'
import { useAbmStore } from '../stores/abmStore'
import { useSelectionStore } from '../stores/selectionStore'
import type { AttributionResult, Changepoint } from '../types'
import { useAbmText, type AbmTextKey } from '../i18n'

interface Props {
  runId: string | null
}

const DIRECTION_KEYS: Record<Changepoint['direction'], AbmTextKey> = {
  accelerate: 'explain.direction.accelerate',
  decelerate: 'explain.direction.decelerate',
  reversal: 'explain.direction.reversal',
}

function formatSigned(value: number): string {
  const text = formatNumber(Math.abs(value))
  return value > 0 ? `+${text}` : value < 0 ? `-${text}` : text
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return Math.abs(value) >= 1 ? value.toFixed(2) : value.toFixed(3)
}

/**
 * Trace-grounded explain workbench (EMNLP demo highlight). Sits beside the
 * metric chart and turns a brushed tick interval into a quantitative story:
 * actual delta, per-mechanism decomposition, coverage/residual, and salient
 * changepoints — all fetched from the real trace, never from model memory.
 * Links outward to the mechanism graph (attribution overlay) and chat.
 */
export function ExplainInspector({ runId }: Props) {
  const t = useAbmText()
  const explainFocus = useAbmStore((s) => s.explainFocus)
  const setExplainFocus = useAbmStore((s) => s.setExplainFocus)
  const runState = useAbmStore((s) => (runId ? s.runs[runId]?.state : undefined))
  const requestView = useAbmStore((s) => s.requestView)
  const setEvidenceFocus = useSelectionStore((s) => s.setEvidenceFocus)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const queueComposerPrefill = useChatStore((s) => s.queueComposerPrefill)

  const focus = explainFocus && runId && explainFocus.runId === runId ? explainFocus : null
  const [attribution, setAttribution] = useState<AttributionResult | null>(null)
  const [changepoints, setChangepoints] = useState<Changepoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!focus || runState !== 'completed') {
      setAttribution(null)
      setChangepoints([])
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      abmClient.getAttribution(focus.runId, focus.metric, { from: focus.from, to: focus.to }),
      abmClient.getChangepoints(focus.runId, focus.metric),
    ])
      .then(([attr, cp]) => {
        if (cancelled) return
        setAttribution(attr)
        setChangepoints(cp.changepoints.filter((c) => c.tick >= focus.from && c.tick <= focus.to))
      })
      .catch((err) => {
        if (!cancelled) {
          setAttribution(null)
          setChangepoints([])
          setError(err instanceof Error ? err.message : String(err))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [focus, runState])

  const maxFlow = useMemo(
    () => Math.max(1e-9, ...(attribution?.contributions ?? []).map((c) => Math.max(c.gains, c.losses))),
    [attribution],
  )

  const insertExplainPrompt = () => {
    if (!focus || !activeTabId) return
    const lines = [
      t('explain.prefillLine1', {
        runId: focus.runId,
        from: focus.from,
        to: focus.to,
        metric: focus.metric,
      }),
      t('explain.prefillLine2'),
    ]
    if (attribution?.supported) {
      lines.push(
        t('explain.prefillKnown', {
          actual: formatSigned(attribution.actualDelta ?? 0),
          net: formatSigned(attribution.attributedNet),
          coverage: attribution.coverage !== null ? `${Math.round(attribution.coverage * 100)}%` : '-',
        }),
        attribution.contributions.length > 0
          ? t('explain.prefillTopMechanisms', {
            mechanisms: attribution.contributions.slice(0, 3).map((c) => `${c.mechanism_id}(${formatSigned(c.net)})`).join(', '),
          })
          : t('explain.prefillNoMechanisms'),
      )
    }
    queueComposerPrefill(activeTabId, { text: lines.join('\n'), mode: 'append' })
  }

  if (!runId) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-[var(--color-text-tertiary)]">
        {t('explain.emptyNoRun')}
      </div>
    )
  }

  if (runState !== 'completed') {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-[var(--color-text-tertiary)]">
        {t('explain.emptyRunning')}
      </div>
    )
  }

  if (!focus) {
    return (
      <div className="flex h-full flex-col justify-center gap-2 px-4 text-center">
        <Scale className="mx-auto h-5 w-5 text-[var(--color-text-tertiary)]" strokeWidth={2} aria-hidden="true" />
        <p className="text-xs text-[var(--color-text-tertiary)]">
          {t('explain.brushHint')}
        </p>
      </div>
    )
  }

  return (
    <div data-testid="explain-inspector" className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex-none border-b border-[var(--color-border)] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 shrink-0 text-[var(--color-brand)]" strokeWidth={2} aria-hidden="true" />
          <div className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--color-text-primary)]">
            {t('explain.title')} · {focus.metric}
          </div>
          <button
            type="button"
            aria-label={t('explain.close')}
            onClick={() => setExplainFocus(null)}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-0.5 font-mono text-[10px] text-[var(--color-text-tertiary)]">
          tick {focus.from}–{focus.to}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-2.5">
        {loading ? (
          <p className="text-xs text-[var(--color-text-tertiary)]">{t('explain.calculating')}</p>
        ) : error ? (
          <p className="text-xs text-[var(--color-error)]">{error}</p>
        ) : attribution && !attribution.supported ? (
          <p className="rounded-[8px] bg-[var(--color-warning-container)]/30 px-2.5 py-2 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
            {attribution.reason ?? t('explain.unsupported')}
          </p>
        ) : attribution ? (
          <>
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <MiniStat label={t('explain.actualDelta')} value={attribution.actualDelta !== null ? formatSigned(attribution.actualDelta) : '—'} />
              <MiniStat label={t('explain.netContribution')} value={formatSigned(attribution.attributedNet)} />
              <MiniStat label={t('explain.residual')} value={attribution.residual !== null ? formatSigned(attribution.residual) : '—'} />
            </div>
            {attribution.coverage !== null ? (
              <div className="mt-2">
                <div className="flex justify-between text-[10px] text-[var(--color-text-tertiary)]">
                  <span>{t('explain.coverage')}</span>
                  <span className="font-mono font-semibold text-[var(--color-text-secondary)]">
                    {Math.round(attribution.coverage * 100)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-container-low)]">
                  <div
                    className="h-full rounded-full bg-[var(--color-brand)]"
                    style={{ width: `${Math.round(attribution.coverage * 100)}%` }}
                  />
                </div>
              </div>
            ) : null}

            {attribution.contributions.length > 0 ? (
              <div className="mt-2.5 space-y-1">
                {attribution.contributions.map((c) => (
                  <button
                    key={c.mechanism_id}
                    type="button"
                    data-testid="explain-contribution-row"
                    onClick={() => setEvidenceFocus({ runId: focus.runId, tick: focus.to, mechanism_id: c.mechanism_id })}
                    className="block w-full rounded-[8px] border border-transparent px-1.5 py-1 text-left transition-colors hover:border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-[10px] text-[var(--color-text-primary)]">{c.mechanism_id}</span>
                      <span className={`shrink-0 font-mono text-[10px] font-semibold ${c.net >= 0 ? 'text-[#34d399]' : 'text-[#f87171]'}`}>
                        {formatSigned(c.net)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex h-1.5 items-stretch" aria-hidden="true">
                      <div className="flex flex-1 justify-end overflow-hidden rounded-l-full bg-[var(--color-surface-container-low)]">
                        <div className="h-full rounded-l-full bg-[#f87171]/75" style={{ width: `${Math.min(100, (c.losses / maxFlow) * 100)}%` }} />
                      </div>
                      <div className="w-px bg-[var(--color-border)]" />
                      <div className="flex flex-1 overflow-hidden rounded-r-full bg-[var(--color-surface-container-low)]">
                        <div className="h-full rounded-r-full bg-[#34d399]/80" style={{ width: `${Math.min(100, (c.gains / maxFlow) * 100)}%` }} />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[10px] text-[var(--color-text-tertiary)]">{t('explain.noTransitions')}</p>
            )}
          </>
        ) : null}

        {changepoints.length > 0 ? (
          <div className="mt-3 border-t border-[var(--color-border)]/60 pt-2.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold text-[var(--color-text-secondary)]">
              <TrendingUp className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              {t('explain.changepoints')}
            </div>
            <div className="space-y-1">
              {changepoints.map((cp) => (
                <button
                  key={`${cp.metric}-${cp.tick}`}
                  type="button"
                  data-testid="explain-changepoint-row"
                  onClick={() => setEvidenceFocus({ runId: focus.runId, tick: cp.tick, metric: cp.metric })}
                  className="flex w-full items-center justify-between rounded-[7px] px-1.5 py-1 text-left text-[10px] transition-colors hover:bg-[var(--color-surface-hover)]"
                >
                  <span className="font-mono text-[var(--color-text-primary)]">t{cp.tick}</span>
                  <span className="text-[var(--color-text-tertiary)]">{t(DIRECTION_KEYS[cp.direction])}</span>
                  <span className="font-mono text-[var(--color-text-tertiary)]">z={cp.score.toFixed(1)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex-none border-t border-[var(--color-border)] p-2.5">
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            data-testid="explain-open-graph"
            onClick={() => requestView('model')}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] border border-[var(--color-border)] px-2 text-[11px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
          >
            <Network className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            {t('explain.toGraph')}
          </button>
          <button
            type="button"
            data-testid="explain-to-chat"
            onClick={insertExplainPrompt}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] bg-[var(--color-brand)] px-2 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            {t('explain.askAi')}
          </button>
        </div>
        <p className="mt-2 flex items-start gap-1 text-[9px] leading-relaxed text-[var(--color-text-tertiary)]">
          <GitBranch className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} aria-hidden="true" />
          {t('explain.traceFootnote')}
        </p>
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[7px] bg-[var(--color-surface-container-low)] px-1.5 py-1">
      <div className="font-mono text-[11px] font-semibold text-[var(--color-text-primary)]">{value}</div>
      <div className="mt-0.5 text-[9px] text-[var(--color-text-tertiary)]">{label}</div>
    </div>
  )
}
