import { useState, type MouseEvent, type ReactNode } from 'react'
import { MousePointerClick, Plus, Radio, Sparkles } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { useTabStore } from '../../stores/tabStore'
import { useUIStore } from '../../stores/uiStore'
import { useAbmStore } from '../stores/abmStore'
import { useSelectionStore } from '../stores/selectionStore'
import { colorHexForPaletteValue } from '../canvas/paletteLUT'
import { EMPTY_STATE } from '../canvas/frameFormat'
import { MiniExplainPopover, type MiniExplainAnchor } from './MiniExplainPopover'
import { useAbmText } from '../i18n'

interface SelectionInspectorProps {
  runId: string | null
}

export function SelectionInspector({ runId }: SelectionInspectorProps) {
  const t = useAbmText()
  const run = useAbmStore((store) => (runId ? store.runs[runId] : undefined))
  const meta = run?.meta
  const selection = useSelectionStore((store) => store.selection)
  const setEvidenceFocus = useSelectionStore((store) => store.setEvidenceFocus)
  const activeTabId = useTabStore((store) => store.activeTabId)
  const queueComposerPrefill = useChatStore((store) => store.queueComposerPrefill)
  const addToast = useUIStore((store) => store.addToast)
  const [explainAnchor, setExplainAnchor] = useState<MiniExplainAnchor | null>(null)

  const stateIndex = Number.isInteger(selection?.state) ? selection?.state : undefined
  const label =
    stateIndex !== undefined &&
    stateIndex !== EMPTY_STATE &&
    stateIndex >= 0 &&
    stateIndex < (meta?.palette.length ?? 0)
      ? meta?.palette[stateIndex]
      : undefined
  const targetLabel = selection?.kind === 'cell' ? t('selection.targetCell') : t('selection.targetAgent')
  const tickLabel = selection?.tick !== undefined ? `tick ${selection.tick}` : t('selection.currentFrame')
  const location = selection?.x !== undefined && selection.y !== undefined
    ? `(${selection.x}, ${selection.y})`
    : undefined
  const prompt = selection
    ? t('selection.prompt', {
        tickLabel,
        targetLabel,
        index: selection.index,
        location: location ? t('selection.promptLocation', { location }) : '',
        state: label ? t('selection.promptState', { state: label }) : '',
      })
    : ''
  const metricsHint = selection?.tick !== undefined ? nearestMetrics(run?.ticks ?? [], selection.tick) : undefined

  if (!selection) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-xs text-[var(--color-text-tertiary)]">
        <MousePointerClick className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        {t('selection.emptyHint')}
      </div>
    )
  }

  const insertPrompt = (text: string) => {
    if (!activeTabId) return
    queueComposerPrefill(activeTabId, { text, mode: 'append' })
    addToast({ type: 'success', message: t('selection.addedToast') })
  }

  const openExplain = (event: MouseEvent<HTMLButtonElement>) => {
    setExplainAnchor(selection.anchor ?? { x: event.clientX, y: event.clientY })
  }

  return (
    <>
      <div className="flex flex-col gap-2 px-4 py-3 text-xs">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{targetLabel}</h3>
          <span className="rounded-full bg-[var(--color-surface-container)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-text-tertiary)]">
            {tickLabel}
          </span>
        </div>
        <InspectorRow label={t('selection.index')} value={`#${selection.index}`} />
        {location && <InspectorRow label={t('selection.location')} value={location} />}
        <div className="flex items-center justify-between">
          <span className="text-[var(--color-text-tertiary)]">{t('selection.state')}</span>
          <span className="flex items-center gap-1.5 font-medium text-[var(--color-text-primary)]">
            {label && stateIndex !== undefined ? (
              <>
                <span
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{ backgroundColor: colorHexForPaletteValue(label, stateIndex) }}
                />
                {label}
              </>
            ) : (
              <span className="text-[var(--color-text-tertiary)]">{t('selection.emptyState')}</span>
            )}
          </span>
        </div>

        <div className="mt-1 grid grid-cols-3 gap-1.5">
          <ActionButton label={t('selection.addToChat')} onClick={() => insertPrompt(prompt)}>
            <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          </ActionButton>
          <ActionButton label={t('selection.explain')} onClick={openExplain}>
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          </ActionButton>
          <ActionButton
            label={t('selection.evidenceFocus')}
            onClick={() => {
              if (!runId || selection.tick === undefined) return
              setEvidenceFocus({
                runId,
                tick: selection.tick,
                ...(selection.kind === 'node' ? { agentIds: [selection.index] } : {}),
              })
            }}
            disabled={!runId || selection.tick === undefined}
          >
            <Radio className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          </ActionButton>
        </div>
      </div>
      <MiniExplainPopover
        open={Boolean(explainAnchor)}
        anchor={explainAnchor}
        onClose={() => setExplainAnchor(null)}
        target={{
          title: t('selection.localExplainTitle'),
          subject: `${tickLabel} · ${targetLabel} #${selection.index}`,
          ...(runId ? { runId } : {}),
          ...(selection.tick !== undefined ? { tick: selection.tick } : {}),
          ...(metricsHint ? { metricsHint } : {}),
          selection: {
            label: targetLabel,
            index: selection.index,
            ...(location ? { location } : {}),
            ...(label ? { stateLabel: label } : {}),
          },
        }}
      />
    </>
  )
}

function ActionButton({
  children,
  label,
  onClick,
  disabled = false,
}: {
  children: ReactNode
  label: string
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 items-center justify-center gap-1 rounded-[8px] border border-[var(--color-border)] px-1.5 text-[11px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-default disabled:opacity-45"
      title={label}
    >
      {children}
      <span className="truncate">{label}</span>
    </button>
  )
}

function nearestMetrics(points: Array<{ tick: number; metrics: Record<string, number> }>, tick: number): Record<string, number> | undefined {
  return [...points].sort((a, b) => Math.abs(a.tick - tick) - Math.abs(b.tick - tick))[0]?.metrics
}

function InspectorRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-text-tertiary)]">{label}</span>
      <span className="font-mono text-[11px] text-[var(--color-text-secondary)]">{value}</span>
    </div>
  )
}
