import type { ReactNode, Ref } from 'react'
import { motion } from 'framer-motion'

export function AppAmbientBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute left-[12%] top-[-8%] h-[420px] w-[420px] rounded-full bg-[var(--color-primary)]/12 blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[8%] h-[380px] w-[380px] rounded-full bg-[var(--color-secondary)]/10 blur-[110px]" />
      <div className="absolute right-[35%] top-[28%] h-[260px] w-[260px] rounded-full bg-[var(--color-tertiary)]/8 blur-[90px]" />
    </div>
  )
}

export function HeroAmbientBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute left-1/4 top-0 h-96 w-96 animate-pulse rounded-full bg-[var(--color-primary)]/10 mix-blend-normal blur-[128px] filter" />
      <div className="absolute bottom-0 right-1/4 h-96 w-96 animate-pulse rounded-full bg-[var(--color-secondary)]/10 mix-blend-normal blur-[128px] filter [animation-delay:700ms]" />
      <div className="absolute right-1/3 top-1/4 h-64 w-64 animate-pulse rounded-full bg-[var(--color-tertiary)]/8 mix-blend-normal blur-[96px] filter [animation-delay:1000ms]" />
    </div>
  )
}

type GlassComposerShellProps = {
  children: ReactNode
  className?: string
  testId?: string
  panelRef?: Ref<HTMLDivElement>
  dragHandlers?: Record<string, unknown>
  isDragActive?: boolean
}

export function GlassComposerShell({
  children,
  className,
  testId,
  panelRef,
  dragHandlers,
  isDragActive,
}: GlassComposerShellProps) {
  return (
    <motion.div
      ref={panelRef}
      data-testid={testId}
      className={`glass-composer relative flex flex-col overflow-visible rounded-2xl ${isDragActive ? 'composer-drop-target-active' : ''} ${className ?? ''}`}
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      {...dragHandlers}
    >
      {children}
    </motion.div>
  )
}
