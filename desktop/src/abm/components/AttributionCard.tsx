import { AlertTriangle, Scale } from 'lucide-react'
import type { AbmAttributionContribution, UIMessage } from '../../types/chat'
import { useSelectionStore } from '../stores/selectionStore'
import { useAbmText } from '../i18n'

type AttributionMessage = Extract<UIMessage, { type: 'abm_attribution' }>

type Props = {
  message: AttributionMessage
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
 * Quantitative mechanism attribution (EMNLP demo highlight). Every number is
 * computed server-side from the real trace — the card renders the decomposition
 * of the metric's change into signed per-mechanism flows, plus coverage and the
 * residual no mechanism caused. Clicking a mechanism row focuses it as evidence
 * (Trace seek + ODD scroll), the same linkage as explanation evidence chips.
 */
export function AttributionCard({ message }: Props) {
  const t = useAbmText()
  const setEvidenceFocus = useSelectionStore((s) => s.setEvidenceFocus)
  const maxFlow = Math.max(
    1e-9,
    ...message.contributions.map((c) => Math.max(c.gains, c.losses)),
  )

  const focusMechanism = (contribution: AbmAttributionContribution) => {
    setEvidenceFocus({
      runId: message.runId,
      tick: message.to,
      mechanism_id: contribution.mechanism_id,
    })
  }

  return (
    <div
      data-testid="attribution-card"
      className="mb-3 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
    >
      <div className="flex items-center gap-2 border-b border-[var(--color-border)]/65 bg-[var(--color-surface-container-low)] px-3 py-2.5">
        <Scale size={15} strokeWidth={2.1} className="shrink-0 text-[var(--color-brand)]" aria-hidden="true" />
        <div className="min-w-0 truncate text-[12px] font-semibold text-[var(--color-text-primary)]">
          {t('explain.title')} · {message.metric}
        </div>
        <div className="ml-auto shrink-0 font-[var(--font-mono)] text-[10px] text-[var(--color-text-tertiary)]">
          tick {message.from}–{message.to}
        </div>
      </div>

      <div className="px-3 py-3">
        {!message.supported ? (
          <div
            data-testid="attribution-unsupported"
            className="flex items-start gap-2 rounded-[8px] bg-[var(--color-warning-container)]/30 px-2.5 py-2 text-[11px] leading-relaxed text-[var(--color-text-secondary)]"
          >
            <AlertTriangle size={13} strokeWidth={2.2} className="mt-0.5 shrink-0 text-[var(--color-warning)]" aria-hidden="true" />
            <span>{message.reason ?? t('explain.unsupported')}</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <SummaryStat label={t('explain.actualDelta')} value={message.actualDelta !== null ? formatSigned(message.actualDelta) : '—'} />
              <SummaryStat label={t('explain.netContribution')} value={formatSigned(message.attributedNet)} />
              <SummaryStat label={t('explain.residual')} value={message.residual !== null ? formatSigned(message.residual) : '—'} />
            </div>

            {message.coverage !== null ? (
              <div className="mt-2.5">
                <div className="flex items-center justify-between text-[10px] text-[var(--color-text-tertiary)]">
                  <span>{t('explain.coverage')}</span>
                  <span className="font-[var(--font-mono)] font-semibold text-[var(--color-text-secondary)]">
                    {Math.round(message.coverage * 100)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-container-low)]">
                  <div
                    className="h-full rounded-full bg-[var(--color-brand)]"
                    style={{ width: `${Math.round(message.coverage * 100)}%` }}
                  />
                </div>
              </div>
            ) : null}

            {message.contributions.length > 0 ? (
              <div className="mt-3 space-y-1.5">
                {message.contributions.map((contribution) => (
                  <button
                    key={contribution.mechanism_id}
                    type="button"
                    data-testid="attribution-row"
                    onClick={() => focusMechanism(contribution)}
                    title={t('explain.locateEvidenceTitle', { agents: contribution.agents })}
                    className="block w-full rounded-[8px] border border-transparent px-2 py-1.5 text-left transition-colors hover:border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-[var(--font-mono)] text-[11px] text-[var(--color-text-primary)]">
                        {contribution.mechanism_id}
                      </span>
                      <span
                        className={`shrink-0 font-[var(--font-mono)] text-[11px] font-semibold ${
                          contribution.net >= 0 ? 'text-[#34d399]' : 'text-[#f87171]'
                        }`}
                      >
                        {formatSigned(contribution.net)}
                      </span>
                    </div>
                    {/* Signed flow bar: losses grow left from the center, gains grow right. */}
                    <div className="mt-1 flex h-2 items-stretch" aria-hidden="true">
                      <div className="flex flex-1 justify-end overflow-hidden rounded-l-full bg-[var(--color-surface-container-low)]">
                        <div
                          className="h-full rounded-l-full bg-[#f87171]/75"
                          style={{ width: `${Math.min(100, (contribution.losses / maxFlow) * 100)}%` }}
                        />
                      </div>
                      <div className="w-px bg-[var(--color-border)]" />
                      <div className="flex flex-1 overflow-hidden rounded-r-full bg-[var(--color-surface-container-low)]">
                        <div
                          className="h-full rounded-r-full bg-[#34d399]/80"
                          style={{ width: `${Math.min(100, (contribution.gains / maxFlow) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="mt-0.5 flex justify-between font-[var(--font-mono)] text-[9px] text-[var(--color-text-tertiary)]">
                      <span>{t('explain.outflow')} {formatNumber(contribution.losses)}</span>
                      <span>{t('explain.agentCount', { count: contribution.agents })}</span>
                      <span>{t('explain.inflow')} {formatNumber(contribution.gains)}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[11px] text-[var(--color-text-tertiary)]">
                {t('explain.noTransitions')}
              </p>
            )}
          </>
        )}

        {message.note ? (
          <p className="mt-2.5 border-t border-[var(--color-border)]/50 pt-2 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
            {message.note}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] bg-[var(--color-surface-container-low)] px-2 py-1.5">
      <div className="font-[var(--font-mono)] text-[12px] font-semibold text-[var(--color-text-primary)]">{value}</div>
      <div className="mt-0.5 text-[9px] text-[var(--color-text-tertiary)]">{label}</div>
    </div>
  )
}
