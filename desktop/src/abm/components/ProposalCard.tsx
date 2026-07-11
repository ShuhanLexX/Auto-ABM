import { Check, FlaskConical, GitCompare, Play, Trash2 } from 'lucide-react'
import type { AbmProposal } from '../../types/chat'
import { useAbmText } from '../i18n'

type Props = {
  proposal: AbmProposal
  adopted?: boolean
  comparing?: boolean
  busy?: boolean
  /** Dialogue mode: hide mutating actions (read-only conversation). */
  readOnly?: boolean
  onAdopt: () => void
  onAdoptAndRun: () => void
  onCompare: () => void
  onDiscard: () => void
}

/** Tiny inline sparkline for a real trial run's metric series. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100
      const y = 24 - ((v - min) / span) * 22 - 1
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg
      data-testid="proposal-trial-sparkline"
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      className="h-6 w-full"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export function ProposalCard({
  proposal,
  adopted = false,
  comparing = false,
  busy = false,
  readOnly = false,
  onAdopt,
  onAdoptAndRun,
  onCompare,
  onDiscard,
}: Props) {
  const t = useAbmText()
  const paramEntries = Object.entries(proposal.keyParams ?? {})

  return (
    <div
      data-testid="proposal-card"
      className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
    >
      <div className="flex items-start gap-2 border-b border-[var(--color-border)]/65 bg-[var(--color-surface-container-low)] px-3 py-2.5">
        <FlaskConical size={15} strokeWidth={2.1} className="mt-0.5 shrink-0 text-[var(--color-brand)]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-[var(--color-text-primary)]">
            {proposal.mechanismSummary || proposal.id}
          </div>
          <div className="mt-0.5 font-[var(--font-mono)] text-[10px] text-[var(--color-text-tertiary)]">
            {proposal.id}
          </div>
        </div>
        {adopted ? (
          <span className="shrink-0 rounded-full bg-[var(--color-brand)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-brand)]">
            {t('proposal.adopted')}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 px-3 py-3">
        {proposal.expectedMacro ? (
          <div className="text-[11px] text-[var(--color-text-secondary)]">
            <span className="font-semibold text-[var(--color-text-primary)]">{t('proposal.expectedMacro')}</span>
            {proposal.expectedMacro}
          </div>
        ) : null}

        {paramEntries.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {paramEntries.map(([key, value]) => (
              <span
                key={key}
                className="rounded border border-[var(--color-border)]/70 bg-[var(--color-surface-container-low)] px-1.5 py-0.5 font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)]"
              >
                {key}={String(value)}
              </span>
            ))}
          </div>
        ) : null}

        {proposal.oddExcerpt ? (
          <div className="text-[11px] italic text-[var(--color-text-tertiary)]">{proposal.oddExcerpt}</div>
        ) : null}

        {proposal.trial ? (
          <div className="mt-auto">
            <div className="mb-0.5 text-[10px] text-[var(--color-text-tertiary)]">
              {t('proposal.trial')} {proposal.trial.runId.slice(0, 8)}
            </div>
            <Sparkline values={proposal.trial.sparkline} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--color-border)]/65 bg-[var(--color-surface-container-low)] px-3 py-2">
        {readOnly ? null : (
          <>
            <button
              type="button"
              data-testid="proposal-adopt-and-run"
              onClick={onAdoptAndRun}
              disabled={busy}
              className="flex items-center gap-1 rounded-md bg-[var(--color-brand)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-on-brand)] disabled:opacity-50"
            >
              <Play size={12} strokeWidth={2.4} aria-hidden="true" />
              {t('proposal.adoptAndRun')}
            </button>
            <button
              type="button"
              onClick={onAdopt}
              disabled={busy || adopted}
              className="flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-text-secondary)] disabled:opacity-50"
            >
              <Check size={12} strokeWidth={2.4} aria-hidden="true" />
              {t('proposal.adopt')}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onCompare}
          className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] ${
            comparing
              ? 'border-[var(--color-brand)] text-[var(--color-brand)]'
              : 'border-[var(--color-border)] text-[var(--color-text-secondary)]'
          }`}
        >
          <GitCompare size={12} strokeWidth={2.1} aria-hidden="true" />
          {t('proposal.compare')}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-error)]"
          aria-label={t('proposal.discardAria')}
        >
          <Trash2 size={12} strokeWidth={2.1} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
