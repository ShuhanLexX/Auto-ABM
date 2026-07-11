import { useEffect, useMemo, useRef } from 'react'
import { BookOpen, FileText, MessageSquareText, TriangleAlert } from 'lucide-react'
import {
  ODD_SECTION_KEYS,
  type Odd,
  type OddSectionKey,
} from '../types'
import { MarkdownRenderer } from '../../components/markdown/MarkdownRenderer'
import { useSelectionStore, type EvidenceFocus } from '../stores/selectionStore'
import { useAbmText, type AbmTextKey } from '../i18n'
import { useSettingsStore } from '../../stores/settingsStore'

type Props = {
  odd: Odd | null
  /** When set, a per-section "Explain with this run" entry is shown. */
  runId?: string | null
  onExplainSection?: (section: OddSectionKey) => void
}

const ODD_SECTION_TITLE_KEYS: Record<OddSectionKey, AbmTextKey> = {
  purpose: 'odd.section.purpose',
  entities: 'odd.section.entities',
  process: 'odd.section.process',
  designConcepts: 'odd.section.designConcepts',
  initialization: 'odd.section.initialization',
  input: 'odd.section.input',
  submodels: 'odd.section.submodels',
}

/**
 * Map an explanation evidence chip to the ODD section it most relates to, so a
 * chip click scrolls the panel to the right place (conversation-ux.md §4):
 * a fired mechanism → Submodels; a metric/event → Process overview.
 */
export function sectionForEvidence(focus: EvidenceFocus | null): OddSectionKey | null {
  if (!focus) return null
  if (focus.mechanism_id) return 'submodels'
  if (focus.metric) return 'process'
  return 'process'
}

export function OddPanel({ odd, runId, onExplainSection }: Props) {
  const t = useAbmText()
  const locale = useSettingsStore((state) => state.locale)
  const evidenceFocus = useSelectionStore((s) => s.evidenceFocus)
  const focusedSection = useMemo(
    () => (evidenceFocus && evidenceFocus.runId === runId ? sectionForEvidence(evidenceFocus) : null),
    [evidenceFocus, runId],
  )
  const sectionRefs = useRef<Partial<Record<OddSectionKey, HTMLElement | null>>>({})

  useEffect(() => {
    if (!focusedSection) return
    sectionRefs.current[focusedSection]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [focusedSection, evidenceFocus])

  if (!odd) {
    return (
      <div data-testid="odd-panel-empty" className="grid h-full place-items-center px-4 py-6 text-center">
        <div className="max-w-[420px] rounded-[16px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-8">
          <FileText className="mx-auto h-8 w-8 text-[var(--color-brand)]" strokeWidth={1.8} aria-hidden="true" />
          <div className="mt-3 text-sm font-semibold text-[var(--color-text-primary)]">{t('odd.emptyTitle')}</div>
          <p className="mt-2 text-xs leading-6 text-[var(--color-text-tertiary)]">
            {t('odd.emptyBody')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div data-testid="odd-panel" className="grid h-full min-h-0 grid-cols-[220px_minmax(0,1fr)] bg-[var(--color-surface-container-lowest)]">
      <aside className="min-h-0 overflow-auto border-r border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <div className="rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-primary)]">
            <BookOpen className="h-4 w-4 text-[var(--color-brand)]" strokeWidth={2} aria-hidden="true" />
            {t('odd.currentModel')}
          </div>
          <div className="mt-2 truncate font-mono text-[11px] text-[var(--color-text-secondary)]">{odd.modelId}</div>
          <div className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
            v{odd.modelVersion} · {formatGeneratedAt(odd.generatedAt, locale)}
          </div>
          {runId ? (
            <div className="mt-2 rounded-[8px] bg-[var(--color-brand)]/8 px-2 py-1.5 text-[10px] font-medium text-[var(--color-brand)]">
              {t('odd.boundRun', { id: runId.slice(0, 8) })}
            </div>
          ) : null}
        </div>

        <nav className="mt-3 grid gap-1" aria-label={t('odd.navLabel')}>
          {ODD_SECTION_KEYS.map((key, index) => {
            const section = odd.sections[key]
            const isFocused = focusedSection === key
            const title = t(ODD_SECTION_TITLE_KEYS[key])
            return (
              <button
                key={key}
                type="button"
                onClick={() => sectionRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className={`flex items-center gap-2 rounded-[9px] px-2.5 py-2 text-left text-xs transition-colors ${
                  isFocused
                    ? 'bg-[var(--color-brand)] text-white'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] ${
                  isFocused ? 'bg-white/20 text-white' : 'bg-[var(--color-surface-container-low)] text-[var(--color-text-tertiary)]'
                }`}>
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{title}</span>
                {section?.needsReview ? (
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-[var(--color-warning)]" strokeWidth={2.3} aria-hidden="true" />
                ) : null}
              </button>
            )
          })}
        </nav>
      </aside>

      <div className="min-h-0 overflow-auto px-6 py-5">
        <article className="mx-auto max-w-4xl rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
          <header className="border-b border-[var(--color-border)] px-6 py-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-brand)]">
              ODD Protocol
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-normal text-[var(--color-text-primary)]">
              {t('odd.modelDocTitle', { modelId: odd.modelId })}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
              {t('odd.modelDocBody')}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
              <MetaChip label={t('odd.modelVersion')} value={`v${odd.modelVersion}`} />
              <MetaChip label={t('odd.generatedAt')} value={formatGeneratedAt(odd.generatedAt, locale)} />
              <MetaChip label={t('odd.sectionCount')} value={`${ODD_SECTION_KEYS.length}`} />
            </div>
          </header>

          <div className="px-6 py-5">
            {ODD_SECTION_KEYS.map((key, index) => {
              const section = odd.sections[key]
              const isFocused = focusedSection === key
              const title = t(ODD_SECTION_TITLE_KEYS[key])
              return (
                <section
                  key={key}
                  data-testid={`odd-section-${key}`}
                  data-focused={isFocused ? 'true' : undefined}
                  ref={(el) => {
                    sectionRefs.current[key] = el
                  }}
                  className={`scroll-mt-5 border-b border-[var(--color-border)] py-5 last:border-b-0 ${
                    isFocused ? 'rounded-[12px] bg-[var(--color-brand)]/5 px-3' : ''
                  }`}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-[var(--color-text-tertiary)]">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                          {title}
                        </h3>
                        {section?.needsReview ? (
                          <span
                            data-testid={`odd-needs-review-${key}`}
                            title={t('odd.needsReviewTitle')}
                            className="inline-flex items-center gap-1 rounded-full bg-[var(--color-warning-container)]/40 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-warning)]"
                          >
                            <TriangleAlert size={11} strokeWidth={2.4} aria-hidden="true" />
                            {t('odd.needsReview')}
                          </span>
                        ) : null}
                        {!section?.derived ? (
                          <span className="rounded-full bg-[var(--color-surface-container-high)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-tertiary)]">
                            {t('odd.manual')}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {runId && onExplainSection ? (
                      <button
                        type="button"
                        data-testid={`odd-explain-${key}`}
                        onClick={() => onExplainSection(key)}
                        title={t('odd.explainTitle')}
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] border border-[var(--color-border)]/70 px-2.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-brand)]/40 hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
                      >
                        <MessageSquareText size={13} strokeWidth={2.2} aria-hidden="true" />
                        {t('odd.explain')}
                      </button>
                    ) : null}
                  </div>
                  {section?.text ? (
                    <div className="prose-autoabm max-w-none text-sm leading-7 text-[var(--color-text-secondary)]">
                      <MarkdownRenderer content={section.text} variant="compact" />
                    </div>
                  ) : (
                    <div className="rounded-[10px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-3 py-2 text-xs text-[var(--color-text-tertiary)]">
                      {t('odd.emptySection')}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </article>
      </div>
    </div>
  )
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-2.5 py-1">
      <span className="text-[var(--color-text-tertiary)]">{label}</span>
      <span className="font-medium text-[var(--color-text-secondary)]">{value}</span>
    </span>
  )
}

function formatGeneratedAt(value: string, locale: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value || (locale === 'zh' || locale === 'zh-TW' ? '未记录' : 'Unrecorded')
  return date.toLocaleString(locale === 'zh' || locale === 'zh-TW' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
