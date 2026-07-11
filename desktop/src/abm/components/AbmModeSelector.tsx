import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, MessageCircle, Microscope, Radar } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useTabStore } from '../../stores/tabStore'
import { useAbmStore, type AbmMode } from '../stores/abmStore'

type AbmModeOption = {
  mode: AbmMode
  label: string
  shortLabel: string
  description: string
  icon: typeof Microscope
}

const OPTIONS_ZH: AbmModeOption[] = [
  {
    mode: 'research',
    label: '研究模式',
    shortLabel: '研究',
    description: '采纳方案、运行仿真与实验；关键变更需确认。',
    icon: Microscope,
  },
  {
    mode: 'dialogue',
    label: '对话模式',
    shortLabel: '对话',
    description: '只读讨论与证据整理，不写入模型。',
    icon: MessageCircle,
  },
  {
    mode: 'autonomous',
    label: '自主探索模式',
    shortLabel: '自主',
    description: '澄清任务后，自主完成建模、验证与解释。',
    icon: Radar,
  },
]

const OPTIONS_EN: AbmModeOption[] = [
  {
    mode: 'research',
    label: 'Research mode',
    shortLabel: 'Research',
    description: 'Adopt proposals, run simulations, and experiments. Critical changes need confirmation.',
    icon: Microscope,
  },
  {
    mode: 'dialogue',
    label: 'Dialogue mode',
    shortLabel: 'Dialogue',
    description: 'Read-only discussion and evidence review. No model writes.',
    icon: MessageCircle,
  },
  {
    mode: 'autonomous',
    label: 'Autonomous exploration',
    shortLabel: 'Auto',
    description: 'Clarifies the task, then runs modeling, validation, and explanations.',
    icon: Radar,
  },
]

type Props = {
  compact?: boolean
}

export function AbmModeSelector({ compact = false }: Props) {
  const locale = useSettingsStore((state) => state.locale)
  const options = locale === 'zh' || locale === 'zh-TW' ? OPTIONS_ZH : OPTIONS_EN
  const defaultOption = options[0] as AbmModeOption
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const mode = useAbmStore((store) => store.mode)
  const setMode = useAbmStore((store) => store.setMode)
  const activeTabId = useTabStore((store) => store.activeTabId)
  const hasChatSession = useChatStore((store) => (activeTabId ? Boolean(store.sessions[activeTabId]) : false))
  const setSessionPermissionMode = useChatStore((store) => store.setSessionPermissionMode)

  const current = options.find((option) => option.mode === mode) ?? defaultOption
  const CurrentIcon = current.icon

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const selectMode = (nextMode: AbmMode) => {
    setMode(nextMode)
    if (activeTabId && hasChatSession) {
      setSessionPermissionMode(
        activeTabId,
        nextMode === 'dialogue'
          ? 'plan'
          : nextMode === 'autonomous'
            ? 'acceptEdits'
            : 'default',
      )
    }
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        data-testid="abm-mode-selector"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] ${
          compact ? 'h-9 w-9 px-0' : 'h-9 px-2.5'
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={compact ? current.label : undefined}
      >
        <CurrentIcon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        {!compact ? <span>{current.shortLabel}</span> : null}
        {!compact ? <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" /> : null}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-50 mb-2 w-[240px] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] py-1 shadow-[var(--shadow-dropdown)]"
        >
          {options.map((option) => {
            const Icon = option.icon
            const selected = option.mode === mode
            return (
              <button
                key={option.mode}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => selectMode(option.mode)}
                className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--color-surface-hover)]"
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--color-surface-container)] text-[var(--color-text-secondary)]">
                  <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-[var(--color-text-primary)]">
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-[var(--color-text-tertiary)]">
                    {option.description}
                  </span>
                </span>
                {selected ? (
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-brand)]" strokeWidth={2.3} aria-hidden="true" />
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
