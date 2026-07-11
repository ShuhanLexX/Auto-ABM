import { useCallback } from 'react'
import { AlertTriangle, Lightbulb } from 'lucide-react'
import type { AbmEvidence, UIMessage } from '../../types/chat'
import { useAbmStore } from '../stores/abmStore'
import { useSelectionStore } from '../stores/selectionStore'

type ExplanationMessage = Extract<UIMessage, { type: 'abm_explanation' }>

type Props = {
  message: ExplanationMessage
  sessionId?: string | null
}

function evidenceLabel(ev: AbmEvidence): string {
  if (ev.metric) {
    const value = ev.value !== undefined ? `=${ev.value}` : ''
    return `t${ev.tick} · ${ev.metric}${value}`
  }
  if (ev.event) return `t${ev.tick} · ${ev.event}`
  if (ev.mechanism_id) return `t${ev.tick} · ${ev.mechanism_id}`
  return `t${ev.tick}`
}

/**
 * Evidence-grounded explanation (conversation-ux.md §4). Renders the narrative
 * plus clickable evidence chips; a chip click sets the selection-store evidence
 * focus, driving the three-way linkage (Trace seek + canvas highlight + ODD
 * scroll). When the server downgraded the explanation (no/insufficient grounded
 * evidence) it is flagged "speculative".
 */
export function ExplanationCard({ message }: Props) {
  const setEvidenceFocus = useSelectionStore((s) => s.setEvidenceFocus)
  const activeRunId = useAbmStore((s) => s.activeRunId)
  const runId = message.runId ?? activeRunId ?? undefined

  const focusEvidence = useCallback(
    (ev: AbmEvidence) => {
      if (!runId) return
      setEvidenceFocus({
        runId,
        tick: ev.tick,
        ...(ev.metric ? { metric: ev.metric } : {}),
        ...(ev.mechanism_id ? { mechanism_id: ev.mechanism_id } : {}),
      })
    },
    [runId, setEvidenceFocus],
  )

  return (
    <div
      data-testid="explanation-card"
      className="mb-3 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
    >
      <div className="flex items-center gap-2 border-b border-[var(--color-border)]/65 bg-[var(--color-surface-container-low)] px-3 py-2.5">
        <Lightbulb size={15} strokeWidth={2.1} className="shrink-0 text-[var(--color-brand)]" aria-hidden="true" />
        <div className="text-[12px] font-semibold text-[var(--color-text-primary)]">Explanation</div>
        {message.speculative ? (
          <span
            data-testid="explanation-speculative-badge"
            className="ml-auto flex items-center gap-1 rounded-full bg-[var(--color-warning-container)]/40 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-warning)]"
          >
            <AlertTriangle size={11} strokeWidth={2.3} aria-hidden="true" />
            Speculative
          </span>
        ) : null}
      </div>

      <div className="px-3 py-3">
        <div className="whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
          {message.text}
        </div>

        {message.evidence.length > 0 ? (
          <div className="mt-2.5">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-outline)]">
              Evidence
            </div>
            <div className="flex flex-wrap gap-1.5">
              {message.evidence.map((ev, index) => (
                <button
                  key={`${ev.tick}-${ev.metric ?? ev.event ?? ev.mechanism_id ?? index}`}
                  type="button"
                  data-testid="evidence-chip"
                  onClick={() => focusEvidence(ev)}
                  disabled={!runId}
                  className="rounded-full border border-[var(--color-border)]/70 bg-[var(--color-surface-container-low)] px-2 py-0.5 font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-brand)]/40 hover:text-[var(--color-text-primary)] disabled:opacity-50"
                >
                  {evidenceLabel(ev)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
