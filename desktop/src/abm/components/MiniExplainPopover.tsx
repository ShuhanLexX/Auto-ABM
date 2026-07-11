import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Activity, Code2, LoaderCircle, MessageSquarePlus, Send, Sparkles, X } from 'lucide-react'
import { MarkdownRenderer } from '../../components/markdown/MarkdownRenderer'
import { useChatStore } from '../../stores/chatStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useTabStore } from '../../stores/tabStore'
import { useUIStore } from '../../stores/uiStore'
import { traceClient, type ExplainContext, type ExplainMetricPoint } from '../trace/traceClient'
import { useAbmText, type AbmTextKey } from '../i18n'

export interface MiniExplainAnchor {
  x: number
  y: number
}

export interface MiniExplainTarget {
  title: string
  subject: string
  runId?: string | null
  tick?: number
  range?: { from: number; to: number }
  metricsHint?: Record<string, number>
  selection?: {
    label: string
    index: number
    location?: string
    stateLabel?: string
  }
  mechanism?: {
    id: string
    label: string
    trigger?: string
    effect?: string
    phase?: string
    code?: string
  }
}

interface Props {
  open: boolean
  anchor: MiniExplainAnchor | null
  target: MiniExplainTarget | null
  onClose: () => void
}

interface MiniMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  source?: 'model' | 'fallback'
  error?: string
}

type AbmT = (key: AbmTextKey, params?: Record<string, string | number>) => string

export function MiniExplainPopover({ open, anchor, target, onClose }: Props) {
  const t = useAbmText()
  const [context, setContext] = useState<ExplainContext | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<MiniMessage[]>([])
  const [draft, setDraft] = useState('')
  const [answering, setAnswering] = useState(false)
  const activeTabId = useTabStore((store) => store.activeTabId)
  const locale = useSettingsStore((store) => store.locale)
  const queueComposerPrefill = useChatStore((store) => store.queueComposerPrefill)
  const addToast = useUIStore((store) => store.addToast)

  useEffect(() => {
    if (!open || !target?.runId || (target.tick === undefined && !target.range)) {
      setContext(null)
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    const from = Math.max(0, target.range?.from ?? (target.tick ?? 0) - 3)
    const to = target.range?.to ?? (target.tick ?? from) + 3
    setLoading(true)
    setError(null)
    void traceClient
      .fetchExplainContext(target.runId, from, to, locale)
      .then((response) => {
        if (!cancelled) setContext(response)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [locale, open, target?.runId, target?.tick, target?.range?.from, target?.range?.to])

  const position = useMemo(() => clampPopover(anchor), [anchor])
  const explanation = useMemo(() => buildExplanation(target, context, t), [target, context, t])
  const targetKey = `${target?.title ?? ''}|${target?.subject ?? ''}|${target?.runId ?? ''}|${target?.tick ?? ''}|${target?.range?.from ?? ''}-${target?.range?.to ?? ''}`

  useEffect(() => {
    if (!open || !target) {
      setMessages([])
      setDraft('')
      setAnswering(false)
      return
    }
    setMessages([])
    setDraft('')
    setAnswering(true)
  }, [open, targetKey])

  useEffect(() => {
    if (!open || !target || loading) return
    const needsTrace = Boolean(target.runId && (target.tick !== undefined || target.range))
    if (needsTrace && !context && !error) return
    let cancelled = false
    setAnswering(true)
    void traceClient
      .askMiniExplain(buildMiniExplainRequest(target, explanation, locale))
      .then((response) => {
        if (cancelled) return
        setMessages([{
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: response.text || explanation.summary,
          source: response.source,
          error: response.error,
        }])
      })
      .catch((err) => {
        if (cancelled) return
        setMessages([{
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: explanation.summary || t('mini.modelCallFailed', { error: err instanceof Error ? err.message : String(err) }),
        }])
      })
      .finally(() => {
        if (!cancelled) setAnswering(false)
      })
    return () => {
      cancelled = true
    }
  }, [context, error, explanation.summary, loading, locale, open, targetKey, target?.range?.from, target?.range?.to, target?.runId, target?.tick])

  if (!open || !target) return null

  const sendQuestion = () => {
    const question = draft.trim()
    if (!question) return
    setDraft('')
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: 'user', text: question },
    ])
    setAnswering(true)
    void traceClient
      .askMiniExplain(buildMiniExplainRequest(target, explanation, locale, question))
      .then((response) => {
        setMessages((current) => [
          ...current,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            text: response.text || buildFollowupAnswer(question, explanation, t),
            source: response.source,
            error: response.error,
          },
        ])
      })
      .catch(() => {
        setMessages((current) => [
          ...current,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            text: buildFollowupAnswer(question, explanation, t),
            source: 'fallback',
          },
        ])
      })
      .finally(() => setAnswering(false))
  }

  const addToMainChat = () => {
    if (!activeTabId) {
      addToast({ type: 'info', message: t('mini.noMainChat') })
      return
    }
    const lastUserQuestion = [...messages].reverse().find((message) => message.role === 'user')?.text
    const lastAssistantAnswer = [...messages].reverse().find((message) => message.role === 'assistant')?.text
    const text = lastUserQuestion
      ? t('mini.continueExplain', { subject: target.subject, question: lastUserQuestion })
      : t('mini.explainWithContext', { subject: target.subject, answer: lastAssistantAnswer ?? explanation.summary })
    queueComposerPrefill(activeTabId, { text, mode: 'append' })
    addToast({ type: 'success', message: t('mini.added') })
  }

  return createPortal(
    <div
      data-testid="abm-mini-explain-popover"
      className="fixed z-[70] flex max-h-[min(520px,calc(100vh-24px))] flex-col overflow-hidden rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] shadow-[var(--shadow-dropdown)]"
      style={position}
    >
      <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-primary)]">
            <Sparkles className="h-3.5 w-3.5 text-[var(--color-brand)]" strokeWidth={2} aria-hidden="true" />
            <span className="truncate">{target.title}</span>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-[var(--color-text-tertiary)]">{target.subject}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('mini.close')}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-3 text-xs">
        {loading || answering ? (
          <div className="mb-2 flex items-center gap-2 rounded-[9px] bg-[var(--color-surface-container-low)] px-2.5 py-2 text-[var(--color-text-secondary)]">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={2} aria-hidden="true" />
            {loading ? t('mini.loadingTrace') : t('mini.loadingModel')}
          </div>
        ) : null}
        {error ? (
          <div className="mb-2 rounded-[9px] border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-2.5 py-2 text-[var(--color-error)]">
            {t('mini.traceFailed', { error })}
          </div>
        ) : null}

        <div className="grid gap-2">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`rounded-[10px] px-2.5 py-2 leading-5 ${
                message.role === 'user'
                  ? 'ml-8 bg-[var(--color-brand)] text-white'
                  : 'mr-6 bg-[var(--color-surface-container-low)] text-[var(--color-text-secondary)]'
              }`}
            >
              {message.role === 'assistant' ? (
                <>
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      message.source === 'fallback'
                        ? 'bg-[var(--color-warning-container)]/55 text-[var(--color-warning)]'
                        : 'bg-[var(--color-brand)]/10 text-[var(--color-brand)]'
                    }`}>
                      {message.source === 'fallback' ? t('mini.sourceFallback') : t('mini.sourceModel')}
                    </span>
                  </div>
                  {message.source === 'fallback' ? (
                    <div className="mb-1.5 text-[11px] leading-4 text-[var(--color-text-tertiary)]">
                      {message.error ? t('mini.modelCallFailed', { error: message.error }) : t('mini.fallbackNotice')}
                    </div>
                  ) : null}
                  <MarkdownRenderer content={message.text} variant="compact" />
                </>
              ) : (
                message.text
              )}
            </div>
          ))}
        </div>

        {messages.length > 0 ? (
          <>
            {explanation.metricLines.length > 0 ? (
              <EvidenceBlock title={t('mini.metricEvidence')} icon={<Activity className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />}>
                {explanation.metricLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </EvidenceBlock>
            ) : null}

            {explanation.eventLines.length > 0 ? (
              <EvidenceBlock title={t('mini.traceEvents')}>
                {explanation.eventLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </EvidenceBlock>
            ) : null}
          </>
        ) : null}

        {target.mechanism ? (
          <div className="mt-3 rounded-[9px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-2.5">
            <div className="mb-1.5 font-semibold text-[var(--color-text-primary)]">{t('mini.mechanismDetails')}</div>
            <Detail label={t('modelContext.trigger')} value={target.mechanism.trigger ?? t('mini.undeclared')} />
            <Detail label={t('modelContext.effect')} value={target.mechanism.effect ?? t('mini.undeclared')} />
            <Detail label={t('modelContext.phase')} value={target.mechanism.phase ?? t('mini.undeclared')} />
            {target.mechanism.code ? (
              <div className="mt-2">
                <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-[var(--color-text-secondary)]">
                  <Code2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  {t('mini.decisionCode')}
                </div>
                <pre className="max-h-[150px] overflow-auto rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 font-mono text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                  {target.mechanism.code}
                </pre>
              </div>
            ) : null}
          </div>
        ) : null}

        {messages.length > 0 && explanation.oddLines.length > 0 ? (
          <EvidenceBlock title={t('mini.oddEvidence')}>
            {explanation.oddLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </EvidenceBlock>
        ) : null}
      </div>
      <div className="border-t border-[var(--color-border)] p-2">
        <div className="flex items-center gap-1.5">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                sendQuestion()
              }
            }}
            placeholder={t('mini.followupPlaceholder')}
            className="min-w-0 flex-1 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-xs text-[var(--color-text-primary)] outline-none focus-visible:border-[var(--color-border-focus)]"
          />
          <button
            type="button"
            aria-label={t('mini.sendFollowup')}
            onClick={sendQuestion}
            disabled={!draft.trim() || answering}
            className="grid h-8 w-8 place-items-center rounded-[8px] bg-[var(--color-brand)] text-white transition-opacity disabled:cursor-default disabled:opacity-45"
          >
            <Send className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={t('mini.addToMainChat')}
            onClick={addToMainChat}
            className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--color-border)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function EvidenceBlock({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-3 rounded-[9px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-[var(--color-text-primary)]">
        {icon}
        {title}
      </div>
      <ul className="space-y-1 leading-5 text-[var(--color-text-secondary)]">{children}</ul>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-1 grid grid-cols-[44px_minmax(0,1fr)] gap-2 text-[11px] leading-5">
      <span className="text-[var(--color-text-tertiary)]">{label}</span>
      <span className="break-words text-[var(--color-text-secondary)]">{value}</span>
    </div>
  )
}

function buildMiniExplainRequest(
  target: MiniExplainTarget,
  explanation: ReturnType<typeof buildExplanation>,
  locale: string,
  question?: string,
) {
  return {
    locale,
    ...(target.runId ? { runId: target.runId } : {}),
    ...(target.range ? { from: target.range.from, to: target.range.to } : {}),
    ...(target.tick !== undefined ? { tick: target.tick } : {}),
    target: {
      title: target.title,
      subject: target.subject,
      ...(target.selection ? { selection: target.selection } : {}),
      ...(target.mechanism ? { mechanism: target.mechanism } : {}),
      ...(target.metricsHint ? { metricsHint: target.metricsHint } : {}),
    },
    ...(question ? { question } : {}),
    localSummary: explanation.summary,
  }
}

function clampPopover(anchor: MiniExplainAnchor | null): CSSProperties {
  const width = 400
  if (typeof window === 'undefined') return { left: 12, top: 12, width }
  const baseX = anchor?.x ?? window.innerWidth / 2
  const baseY = anchor?.y ?? window.innerHeight / 2
  const left = Math.max(12, Math.min(baseX + 12, window.innerWidth - width - 12))
  const top = Math.max(12, Math.min(baseY + 12, window.innerHeight - 520 - 12))
  return { left, top, width }
}

function buildExplanation(target: MiniExplainTarget | null, context: ExplainContext | null, t: AbmT) {
  if (!target) {
    return { summary: '', metricLines: [], eventLines: [], oddLines: [] }
  }

  const range = target.range
    ? { from: Math.min(target.range.from, target.range.to), to: Math.max(target.range.from, target.range.to) }
    : null
  const nearest = target.tick !== undefined ? nearestMetric(context?.metrics ?? [], target.tick) : null
  const previous = nearest ? previousMetric(context?.metrics ?? [], nearest.tick) : null
  const metricSource = nearest?.metrics ?? target.metricsHint ?? {}
  const metricLines = range
    ? formatRangeMetrics(context?.metrics ?? [], range, target.metricsHint, t)
    : formatMetrics(metricSource, nearest?.tick ?? target.tick)
  const deltas = nearest && previous ? formatDeltas(previous, nearest) : []
  if (deltas.length) metricLines.push(t('mini.relativeTick', { tick: previous!.tick, deltas: deltas.join(', ') }))

  const eventLines = [
    ...(context?.events ?? []).slice(0, 4).map((event) => `tick ${event.tick}: ${event.name}`),
    ...(context?.mechanisms ?? []).slice(0, 4).map((mechanism) => {
      const agents = mechanism.agent_ids?.length ? t('mini.involvedAgents', { agents: mechanism.agent_ids.slice(0, 5).join(', ') }) : ''
      return t('mini.mechanismEvent', { tick: mechanism.tick, id: mechanism.mechanism_id, agents })
    }),
  ]

  const oddLines = (context?.oddRefs ?? [])
    .slice(0, 2)
    .map((ref) => `${ref.section}: ${truncate(ref.text, 96)}`)

  const selectionText = target.selection
    ? t('mini.selectionSummary', {
        label: target.selection.label,
        index: target.selection.index,
        location: target.selection.location ? t('mini.selectionLocation', { location: target.selection.location }) : '',
        state: target.selection.stateLabel ? t('mini.selectionState', { state: target.selection.stateLabel }) : '',
      })
    : ''
  const mechanismText = target.mechanism
    ? t('mini.mechanismSummary', {
        label: target.mechanism.label,
        trigger: target.mechanism.trigger ?? t('mini.undeclared'),
        effect: target.mechanism.effect ?? t('mini.undeclared'),
      })
    : ''
  const rangeText = range ? t('mini.rangeSummary', { from: range.from, to: range.to }) : ''
  const metricText = metricLines.length
    ? t('mini.metricSummary', { line: metricLines[0] ?? '' })
    : t('mini.noMetricSummary')
  const eventText = eventLines.length
    ? t('mini.eventSummary', { count: eventLines.length })
    : t('mini.noEventSummary')

  return {
    summary: `${selectionText}${mechanismText}${rangeText}${metricText}${eventText}`,
    metricLines,
    eventLines,
    oddLines,
  }
}

function buildFollowupAnswer(
  question: string,
  explanation: ReturnType<typeof buildExplanation>,
  t: AbmT,
): string {
  const evidence = [
    explanation.metricLines[0] ? t('mini.metricEvidenceLine', { line: explanation.metricLines[0] }) : null,
    explanation.eventLines[0] ? t('mini.traceEvidenceLine', { line: explanation.eventLines[0] }) : null,
  ].filter(Boolean).join('; ')
  if (!evidence) {
    return t('mini.noEvidenceFollowup', { question })
  }
  return t('mini.evidenceFollowup', { question, evidence })
}

function nearestMetric(points: ExplainMetricPoint[], tick: number): ExplainMetricPoint | null {
  if (points.length === 0) return null
  return [...points].sort((a, b) => Math.abs(a.tick - tick) - Math.abs(b.tick - tick))[0] ?? null
}

function previousMetric(points: ExplainMetricPoint[], tick: number): ExplainMetricPoint | null {
  return [...points].filter((point) => point.tick < tick).sort((a, b) => b.tick - a.tick)[0] ?? null
}

function formatMetrics(metrics: Record<string, number>, tick?: number): string[] {
  const entries = Object.entries(metrics)
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
    .slice(0, 6)
  if (entries.length === 0) return []
  const prefix = tick !== undefined ? `tick ${tick}: ` : ''
  return [`${prefix}${entries.map(([key, value]) => `${key}=${formatNumber(value)}`).join(', ')}`]
}

function formatRangeMetrics(
  points: ExplainMetricPoint[],
  range: { from: number; to: number },
  fallback?: Record<string, number>,
  t?: AbmT,
): string[] {
  const ordered = [...points]
    .filter((point) => point.tick >= range.from && point.tick <= range.to)
    .sort((a, b) => a.tick - b.tick)
  if (ordered.length === 0) {
    return fallback ? formatMetrics(fallback, range.to) : []
  }
  const first = ordered[0]!
  const last = ordered.at(-1)!
  const entries = Object.entries(last.metrics)
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
    .slice(0, 6)
    .map(([key, value]) => {
      const before = first.metrics[key]
      const delta = typeof before === 'number' && Number.isFinite(before) ? value - before : null
      const deltaText = delta !== null && Math.abs(delta) > 1e-9
        ? (t ? t('mini.change', { delta: `${delta > 0 ? '+' : ''}${formatNumber(delta)}` }) : `, change ${delta > 0 ? '+' : ''}${formatNumber(delta)}`)
        : ''
      return `${key} ${formatNumber(typeof before === 'number' ? before : value)}→${formatNumber(value)}${deltaText}`
    })
  return entries.length ? [`tick ${first.tick}-${last.tick}: ${entries.join('; ')}`] : []
}

function formatDeltas(previous: ExplainMetricPoint, current: ExplainMetricPoint): string[] {
  return Object.entries(current.metrics)
    .flatMap(([key, value]) => {
      const before = previous.metrics[key]
      if (typeof before !== 'number' || !Number.isFinite(value)) return []
      const delta = value - before
      if (Math.abs(delta) < 1e-9) return []
      return `${key}${delta > 0 ? '+' : ''}${formatNumber(delta)}`
    })
    .slice(0, 5)
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString()
  if (Math.abs(value) >= 100) return value.toFixed(1)
  if (Math.abs(value) >= 1) return value.toFixed(2)
  return value.toFixed(3)
}

function truncate(value: string, max: number): string {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max)}...` : text
}
