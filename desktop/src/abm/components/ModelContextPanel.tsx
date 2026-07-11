import { Activity, GitBranch, Network, SlidersHorizontal, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import type { AbmSimulation } from '../types'
import { useAbmText, type AbmTextKey } from '../i18n'

type RecordLike = Record<string, unknown>

interface Props {
  simulation: AbmSimulation | null
}

export function ModelContextPanel({ simulation }: Props) {
  const t = useAbmText()
  const config = simulation?.config ?? {}
  const modelId = readString(config, 'id') ?? simulation?.name ?? t('modelContext.noModel')
  const modelVersion = simulation?.modelVersion ?? readString(config, 'version') ?? t('modelContext.unbound')
  const agents = readRecords(config.agents)
  const mechanisms = readRecords(config.mechanisms)
  const parameters = readRecords(config.parameters)
  const observers = readRecords(config.observers)
  const initialization = isRecord(config.initialization) ? config.initialization : {}
  const agentCounts = readCounts(initialization)

  if (!simulation) {
    return (
      <section className="flex flex-col gap-3 p-4 text-xs text-[var(--color-text-tertiary)]">
        <SectionTitle icon={<Network className="h-4 w-4" strokeWidth={2} aria-hidden="true" />} title={t('modelContext.title')} />
        <p>{t('modelContext.emptyBody')}</p>
      </section>
    )
  }

  return (
    <section data-testid="model-context-panel" className="flex flex-col gap-4 p-4">
      <div>
        <SectionTitle icon={<Network className="h-4 w-4" strokeWidth={2} aria-hidden="true" />} title={t('modelContext.mechanisms')} />
        <div className="mt-2 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-sm font-semibold text-[var(--color-text-primary)]" title={simulation.name}>
              {simulation.name}
            </span>
            <span className="shrink-0 rounded-full bg-[var(--color-surface-container)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-tertiary)]">
              v{modelVersion}
            </span>
          </div>
          <div className="mt-1 truncate font-mono text-[11px] text-[var(--color-text-tertiary)]" title={modelId}>
            {modelId}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SectionTitle icon={<Activity className="h-4 w-4" strokeWidth={2} aria-hidden="true" />} title={t('modelContext.graph')} />
        {mechanisms.length > 0 ? (
          <div className="flex flex-col gap-2">
            {mechanisms.slice(0, 4).map((mechanism) => (
              <div
                key={readString(mechanism, 'id') ?? readString(mechanism, 'name') ?? JSON.stringify(mechanism)}
                className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-3 py-2"
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-primary)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand)]" aria-hidden="true" />
                  {readString(mechanism, 'name') ?? readString(mechanism, 'id') ?? t('modelContext.unnamedMechanism')}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-[var(--color-text-tertiary)]">
                  <MechanismChip label={t('modelContext.trigger')} value={readString(mechanism, 'trigger')} />
                  <MechanismChip label={t('modelContext.effect')} value={readString(mechanism, 'effect')} />
                  <MechanismChip label={t('modelContext.phase')} value={readString(mechanism, 'phase')} />
                </div>
              </div>
            ))}
            {mechanisms.length > 4 ? (
              <div className="text-[11px] text-[var(--color-text-tertiary)]">
                {t('modelContext.moreMechanisms', { count: mechanisms.length - 4 })}
              </div>
            ) : null}
          </div>
        ) : (
          <EmptyLine>{t('modelContext.noMechanisms')}</EmptyLine>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <InfoBlock
          icon={<Users className="h-4 w-4" strokeWidth={2} aria-hidden="true" />}
          title={t('modelContext.agents')}
          value={t('modelContext.classes', { count: agents.length || Object.keys(agentCounts).length })}
          detail={formatAgentCounts(agentCounts, t)}
        />
        <InfoBlock
          icon={<SlidersHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden="true" />}
          title={t('modelContext.parameters')}
          value={t('modelContext.parameterCount', { count: parameters.length })}
          detail={parameters.slice(0, 2).map((parameter) => formatParameter(parameter, t)).join(' · ') || t('modelContext.waitingParameters')}
        />
      </div>

      <div className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-3 py-2">
        <SectionTitle icon={<GitBranch className="h-4 w-4" strokeWidth={2} aria-hidden="true" />} title={t('modelContext.versionManagement')} />
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-text-tertiary)]">
          {t('modelContext.versionBody')}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-[var(--color-surface-container)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-secondary)]">
            {t('modelContext.observers', { count: observers.length })}
          </span>
          <span className="rounded-full bg-[var(--color-surface-container)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-secondary)]">
            {t('modelContext.modelVersion', { version: modelVersion })}
          </span>
        </div>
      </div>
    </section>
  )
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text-primary)]">
      {icon}
      {title}
    </h2>
  )
}

function MechanismChip({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <span className="rounded-full bg-[var(--color-surface-container)] px-2 py-0.5">
      {label}: {value}
    </span>
  )
}

function InfoBlock({
  icon,
  title,
  value,
  detail,
}: {
  icon: ReactNode
  title: string
  value: string
  detail: string
}) {
  return (
    <div className="min-w-0 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-secondary)]">
        {icon}
        {title}
      </div>
      <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{value}</div>
      <div className="mt-0.5 truncate text-[10px] text-[var(--color-text-tertiary)]" title={detail}>
        {detail}
      </div>
    </div>
  )
}

function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-tertiary)]">
      {children}
    </div>
  )
}

function isRecord(value: unknown): value is RecordLike {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readRecords(value: unknown): RecordLike[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function readString(record: RecordLike, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function readCounts(initialization: RecordLike): Record<string, number> {
  const raw = initialization.agentCounts ?? initialization.agent_counts
  if (!isRecord(raw)) return {}
  const counts: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'number' && Number.isFinite(value)) counts[key] = value
  }
  return counts
}

function formatAgentCounts(counts: Record<string, number>, t: (key: AbmTextKey, params?: Record<string, string | number>) => string): string {
  const entries = Object.entries(counts)
  if (entries.length === 0) return t('modelContext.waitingScale')
  return entries.map(([key, value]) => `${key} ${value.toLocaleString()}`).join(' · ')
}

function formatParameter(parameter: RecordLike, t: (key: AbmTextKey, params?: Record<string, string | number>) => string): string {
  const id = readString(parameter, 'name') ?? readString(parameter, 'id') ?? t('modelContext.parameterFallback')
  const value = parameter.default
  return value === undefined ? id : `${id}=${String(value)}`
}
