import type { ReactNode, Ref } from 'react'
import { motion } from 'framer-motion'
import { ArrowUp, Paperclip, Square } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from './button'

type MoonComposerShellProps = {
  children: ReactNode
  className?: string
  testId?: string
  panelRef?: Ref<HTMLDivElement>
  dragHandlers?: Record<string, unknown>
  isDragActive?: boolean
  animate?: boolean
}

export function MoonComposerShell({
  children,
  className,
  testId,
  panelRef,
  dragHandlers,
  isDragActive,
  animate = true,
}: MoonComposerShellProps) {
  const shellClassName = cn(
    'moon-composer relative flex flex-col overflow-visible',
    isDragActive && 'composer-drop-target-active',
    className,
  )

  if (!animate) {
    return (
      <div ref={panelRef} data-testid={testId} className={shellClassName} {...dragHandlers}>
        {children}
      </div>
    )
  }

  return (
    <motion.div
      ref={panelRef}
      data-testid={testId}
      className={shellClassName}
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.42, ease: 'easeOut' }}
      {...dragHandlers}
    >
      {children}
    </motion.div>
  )
}

type MoonSendButtonProps = {
  disabled?: boolean
  active?: boolean
  onClick: () => void
  ariaLabel: string
  title?: string
  compact?: boolean
}

export function MoonSendButton({
  disabled,
  active,
  onClick,
  ariaLabel,
  title,
  compact,
}: MoonSendButtonProps) {
  return (
    <Button
      type="button"
      size={compact ? 'iconSm' : 'icon'}
      variant={disabled ? 'moonSendDisabled' : 'moonSend'}
      disabled={disabled && !active}
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      className={cn('shrink-0', active && 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]')}
    >
      {active ? <Square className="h-4 w-4" aria-hidden /> : <ArrowUp className="h-4 w-4" aria-hidden />}
    </Button>
  )
}

type MoonAttachButtonProps = {
  onClick: () => void
  ariaLabel: string
  compact?: boolean
}

export function MoonAttachButton({ onClick, ariaLabel, compact }: MoonAttachButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size={compact ? 'iconSm' : 'icon'}
      onClick={onClick}
      aria-label={ariaLabel}
      className="shrink-0 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
    >
      <Paperclip className="h-4 w-4" aria-hidden />
    </Button>
  )
}

export type ComposerQuickActionItem = {
  id: string
  icon: ReactNode
  label: string
}

type ComposerQuickActionsProps = {
  actions: ComposerQuickActionItem[]
  onSelect: (id: string) => void
  className?: string
}

export function ComposerQuickActions({ actions, onSelect, className }: ComposerQuickActionsProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-2.5', className)}>
      {actions.map((action) => (
        <Button
          key={action.id}
          type="button"
          variant="moon"
          size="sm"
          onClick={() => onSelect(action.id)}
          className="gap-2 rounded-full px-3.5 py-2"
        >
          {action.icon}
          <span className="text-xs">{action.label}</span>
        </Button>
      ))}
    </div>
  )
}
