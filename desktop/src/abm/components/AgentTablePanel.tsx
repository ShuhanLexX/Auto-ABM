import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Search, Table2 } from 'lucide-react'
import { abmClient } from '../api/abmClient'
import { colorHexForPaletteValue } from '../canvas/paletteLUT'
import { readAgentCounts, readRecords, readString } from '../modelIntrospection'
import { useAbmStore } from '../stores/abmStore'
import type { AbmSimulation, ModelConfig } from '../types'
import { useAbmText } from '../i18n'

interface AgentTablePanelProps {
  simulation: AbmSimulation | null
  onSimulationUpdated?: (simulation: AbmSimulation) => void
}

interface AgentTypeDraft {
  id: string
  name: string
  count: string
  variables: AgentVariableDraft[]
  behaviorRefs: string[]
}

interface AgentVariableDraft {
  name: string
  dtype: string
  value: string
  choices: string[]
}

interface AgentRowDraft {
  id: number
  type: string
  stateIndex: number
  stateLabel: string
}

interface TypeRange {
  id: string
  start: number
  end: number
}

const AGENT_PAGE_SIZE = 50
const MAX_EDITABLE_AGENT_ROWS = 10_000

export function AgentTablePanel({ simulation, onSimulationUpdated }: AgentTablePanelProps) {
  const t = useAbmText()
  const activeRunId = useAbmStore((store) => store.activeRunId)
  const snapshot = useAbmStore((store) => (activeRunId ? store.agentSnapshots[activeRunId] : undefined))
  const [drafts, setDrafts] = useState<AgentTypeDraft[]>([])
  const [query, setQuery] = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const [page, setPage] = useState(0)
  const [agentOverrides, setAgentOverrides] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDrafts(buildAgentDrafts(simulation))
    setAgentOverrides(readAgentOverrideDrafts(simulation))
    setError(null)
  }, [simulation])

  useEffect(() => {
    setPage(0)
  }, [activeRunId, query, simulation?.id, stateFilter])

  const typeRanges = useMemo(() => buildTypeRanges(drafts), [drafts])
  const primaryByType = useMemo(() => buildPrimaryVariableByType(drafts), [drafts])
  const generatedRows = useMemo(() => buildInitialRows(drafts, primaryByType, agentOverrides), [agentOverrides, drafts, primaryByType])
  const filteredRows = useMemo(() => {
    const sourceRows = snapshot
      ? snapshot.rows
      .map((row) => ({ ...row, type: typeForIndex(row.id, typeRanges, row.type) }))
      .map((row) => ({
        ...row,
        stateLabel: agentOverrides[row.id] ?? row.stateLabel,
      }))
      : generatedRows
    const normalized = query.trim().toLowerCase()
    return sourceRows
      .filter((row) => {
        if (stateFilter && row.stateLabel !== stateFilter) return false
        if (!normalized) return true
        return `${row.id} ${row.type} ${row.stateLabel}`.toLowerCase().includes(normalized)
      })
  }, [agentOverrides, generatedRows, query, snapshot, stateFilter, typeRanges])
  const totalRows = filteredRows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / AGENT_PAGE_SIZE))
  const boundedPage = Math.min(page, totalPages - 1)
  const rows = useMemo(
    () => filteredRows.slice(boundedPage * AGENT_PAGE_SIZE, (boundedPage + 1) * AGENT_PAGE_SIZE),
    [boundedPage, filteredRows],
  )
  const pageStart = totalRows === 0 ? 0 : boundedPage * AGENT_PAGE_SIZE + 1
  const pageEnd = Math.min(totalRows, (boundedPage + 1) * AGENT_PAGE_SIZE)
  const stateOptions = useMemo(() => {
    const values = new Set<string>()
    for (const label of snapshot?.palette ?? []) values.add(label)
    for (const draft of drafts) {
      const primary = primaryByType.get(draft.id)
      if (!primary) continue
      for (const choice of primary.choices) values.add(choice)
      if (primary.value) values.add(primary.value)
    }
    for (const value of Object.values(agentOverrides)) {
      if (value) values.add(value)
    }
    return [...values]
  }, [agentOverrides, drafts, primaryByType, snapshot])

  const saveDrafts = async () => {
    if (!simulation) return
    setSaving(true)
    setError(null)
    try {
      const updated = await abmClient.updateSimulation(simulation.id, {
        config: applyAgentDrafts(simulation.config, drafts, agentOverrides),
      })
      onSimulationUpdated?.(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  if (!simulation) {
    return (
      <div className="grid h-full place-items-center bg-[var(--color-surface-container-lowest)] p-6 text-sm text-[var(--color-text-tertiary)]">
        {t('agents.noSimulation')}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-surface-container-lowest)]">
      <div className="shrink-0 border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
              <Table2 className="h-4 w-4 text-[var(--color-brand)]" strokeWidth={2} aria-hidden="true" />
              {t('agents.title')}
            </h2>
            <div className="mt-1 text-xs text-[var(--color-text-tertiary)]">
              {snapshot
                ? t('agents.liveSummary', { tick: snapshot.tick, total: snapshot.total.toLocaleString() })
                : t('agents.initialSummary', { total: filteredRows.length.toLocaleString() })}
            </div>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveDrafts()}
            className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-[var(--color-brand)] px-3 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            {saving ? t('agents.saving') : t('agents.save')}
          </button>
        </div>
        {error ? (
          <div className="mt-2 rounded-[8px] border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-3 py-2 text-xs text-[var(--color-error)]">
            {error}
          </div>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_220px] gap-3 p-4">
          <div className="flex min-h-0 flex-col overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--color-border)] p-3">
              <label className="flex h-8 min-w-[220px] flex-1 items-center gap-2 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-2">
                <Search className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" strokeWidth={2} aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('agents.searchPlaceholder')}
                  className="min-w-0 flex-1 bg-transparent text-xs text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)]"
                />
              </label>
              <select
                value={stateFilter}
                onChange={(event) => setStateFilter(event.target.value)}
                className="h-8 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-2 text-xs text-[var(--color-text-primary)] outline-none"
              >
                <option value="">{t('agents.allStates')}</option>
                {stateOptions.map((label) => <option key={label} value={label}>{label}</option>)}
              </select>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full border-separate border-spacing-0 text-left text-xs">
                <thead className="sticky top-0 z-10 bg-[var(--color-surface-container-low)] text-[var(--color-text-tertiary)]">
                  <tr>
                    <th className="px-3 py-2 font-semibold">ID</th>
                    <th className="px-3 py-2 font-semibold">{t('agents.type')}</th>
                    <th className="px-3 py-2 font-semibold">{t('agents.initialValue')}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t('agents.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="odd:bg-[var(--color-surface-container-lowest)] even:bg-[var(--color-surface)]">
                      <td className="px-3 py-2 font-mono text-[var(--color-text-primary)]">#{row.id}</td>
                      <td className="px-3 py-2 text-[var(--color-text-secondary)]">{row.type}</td>
                      <td className="px-3 py-2">
                        <AgentStateEditor
                          row={row}
                          variable={primaryByType.get(row.type)}
                          overridden={agentOverrides[row.id] !== undefined}
                          onChange={(value) => setAgentOverrides((current) => patchAgentOverride(current, row, value, primaryByType.get(row.type)))}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          disabled={agentOverrides[row.id] === undefined}
                          onClick={() => setAgentOverrides((current) => removeAgentOverride(current, row.id))}
                          className="rounded-[7px] border border-[var(--color-border)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
                        >
                          {t('agents.reset')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 ? (
                <div className="grid h-48 place-items-center text-sm text-[var(--color-text-tertiary)]">
                  {snapshot ? t('agents.emptyFiltered') : t('agents.emptyEditable')}
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
              <span className="font-mono tabular-nums">
                {pageStart.toLocaleString()}-{pageEnd.toLocaleString()} / {totalRows.toLocaleString()}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label={t('agents.previousPage')}
                  disabled={boundedPage === 0}
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  className="grid h-7 w-7 place-items-center rounded-[7px] border border-[var(--color-border)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:cursor-default disabled:opacity-45"
                >
                  <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                </button>
                <span className="min-w-[58px] text-center font-mono tabular-nums">
                  {boundedPage + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  aria-label={t('agents.nextPage')}
                  disabled={boundedPage >= totalPages - 1}
                  onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                  className="grid h-7 w-7 place-items-center rounded-[7px] border border-[var(--color-border)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:cursor-default disabled:opacity-45"
                >
                  <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          <div className="min-h-0 overflow-auto rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm">
            <div className="mb-2 text-xs font-semibold text-[var(--color-text-primary)]">{t('agents.stateDistribution')}</div>
            <div className="space-y-2">
              {Object.entries(snapshot?.counts ?? {}).map(([label, count], index) => (
                <div key={label}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-[var(--color-text-secondary)]">
                    <span className="truncate">{label}</span>
                    <span className="font-mono">{count.toLocaleString()}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-container-low)]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(3, (count / Math.max(1, snapshot?.total ?? count)) * 100)}%`,
                        backgroundColor: colorHexForPaletteValue(label, index),
                      }}
                    />
                  </div>
                </div>
              ))}
              {!snapshot ? <div className="text-xs text-[var(--color-text-tertiary)]">{t('agents.waitingRunData')}</div> : null}
            </div>
          </div>
      </div>
    </div>
  )
}

function buildAgentDrafts(simulation: AbmSimulation | null): AgentTypeDraft[] {
  if (!simulation) return []
  const counts = readAgentCounts(simulation.config)
  return readRecords(simulation.config.agents).map((agent, index) => {
    const id = readString(agent, 'id') ?? `agent-${index + 1}`
    const variables = readRecords(agent.state_variables ?? agent.stateVariables)
    return {
      id,
      name: readString(agent, 'name') ?? id,
      count: String(counts[id] ?? 0),
      variables: variables.map((variable, variableIndex) => {
        const choices = Array.isArray(variable.choices) ? variable.choices.map(String) : []
        return {
          name: readString(variable, 'name') ?? `state_${variableIndex + 1}`,
          dtype: readString(variable, 'dtype') ?? 'str',
          value: variable.default !== undefined ? String(variable.default) : choices[0] ?? '',
          choices,
        }
      }),
      behaviorRefs: readBehaviorRefs(agent),
    }
  })
}

function readAgentOverrideDrafts(simulation: AbmSimulation | null): Record<number, string> {
  const initialization = simulation?.config.initialization
  if (!isConfigRecord(initialization)) return {}
  const raw = isConfigRecord(initialization.agent_overrides)
    ? initialization.agent_overrides
    : isConfigRecord(initialization.agentOverrides)
      ? initialization.agentOverrides
      : null
  if (!raw) return {}

  const drafts: Record<number, string> = {}
  for (const [key, patch] of Object.entries(raw)) {
    const agentId = Number(key)
    if (!Number.isInteger(agentId) || agentId < 0 || !isConfigRecord(patch)) continue
    const value = Object.values(patch).find((candidate) => candidate !== undefined && candidate !== null)
    if (value !== undefined) drafts[agentId] = String(value)
  }
  return drafts
}

function buildPrimaryVariableByType(drafts: AgentTypeDraft[]): Map<string, AgentVariableDraft> {
  const byType = new Map<string, AgentVariableDraft>()
  for (const draft of drafts) {
    const primary = draft.variables[0]
    if (primary) byType.set(draft.id, primary)
  }
  return byType
}

function buildInitialRows(
  drafts: AgentTypeDraft[],
  primaryByType: Map<string, AgentVariableDraft>,
  agentOverrides: Record<number, string>,
): AgentRowDraft[] {
  const rows: AgentRowDraft[] = []
  let nextId = 0
  for (const draft of drafts) {
    const count = Math.max(0, Math.round(Number(draft.count) || 0))
    const primary = primaryByType.get(draft.id)
    for (let offset = 0; offset < count && rows.length < MAX_EDITABLE_AGENT_ROWS; offset += 1) {
      const id = nextId + offset
      const stateLabel = agentOverrides[id] ?? primary?.value ?? ''
      rows.push({
        id,
        type: draft.id,
        stateIndex: primary?.choices.indexOf(stateLabel) ?? -1,
        stateLabel,
      })
    }
    nextId += count
    if (rows.length >= MAX_EDITABLE_AGENT_ROWS) break
  }
  return rows
}

function AgentStateEditor({
  row,
  variable,
  overridden,
  onChange,
}: {
  row: AgentRowDraft
  variable: AgentVariableDraft | undefined
  overridden: boolean
  onChange: (value: string) => void
}) {
  const t = useAbmText()
  if (!variable) {
    return <span className="text-[11px] text-[var(--color-text-tertiary)]">{t('agents.noEditableField')}</span>
  }

  const choiceIndex = variable.choices.indexOf(row.stateLabel)
  const color = colorHexForPaletteValue(row.stateLabel, choiceIndex >= 0 ? choiceIndex : row.stateIndex >= 0 ? row.stateIndex : 0)
  return (
    <div className="flex min-w-[170px] items-center gap-2">
      <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: color }} />
      {variable.choices.length > 0 ? (
        <select
          aria-label={t('agents.editAria', { id: row.id, name: variable.name })}
          value={row.stateLabel}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 min-w-0 flex-1 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-text-primary)] outline-none focus-visible:border-[var(--color-border-focus)]"
        >
          {!variable.choices.includes(row.stateLabel) ? <option value={row.stateLabel}>{row.stateLabel || t('agents.emptyValue')}</option> : null}
          {variable.choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
        </select>
      ) : (
        <input
          aria-label={t('agents.editAria', { id: row.id, name: variable.name })}
          value={row.stateLabel}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 min-w-0 flex-1 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-text-primary)] outline-none focus-visible:border-[var(--color-border-focus)]"
        />
      )}
      {overridden ? (
        <span className="shrink-0 rounded-full bg-[var(--color-brand)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-brand)]">
          {t('agents.individual')}
        </span>
      ) : null}
    </div>
  )
}

function patchAgentOverride(
  current: Record<number, string>,
  row: AgentRowDraft,
  value: string,
  variable: AgentVariableDraft | undefined,
): Record<number, string> {
  if (!variable) return current
  const next = { ...current }
  if (value === variable.value) {
    delete next[row.id]
  } else {
    next[row.id] = value
  }
  return next
}

function removeAgentOverride(current: Record<number, string>, agentId: number): Record<number, string> {
  const next = { ...current }
  delete next[agentId]
  return next
}

function applyAgentDrafts(config: ModelConfig, drafts: AgentTypeDraft[], agentOverrides: Record<number, string>): ModelConfig {
  const primaryByType = buildPrimaryVariableByType(drafts)
  const typeRanges = buildTypeRanges(drafts)
  const agents = readRecords(config.agents).map((agent) => {
    const cleanAgent = cleanAgentRecord(agent)
    const variables = readRecords(agent.state_variables ?? agent.stateVariables).map(cleanStateVariable)
    return {
      ...cleanAgent,
      state_variables: variables,
      behavior_refs: readBehaviorRefs(agent),
    }
  })
  const initialization = isConfigRecord(config.initialization) ? { ...config.initialization } : {}
  const overrides: Record<string, Record<string, unknown>> = {}
  for (const [key, value] of Object.entries(agentOverrides)) {
    const index = Number(key)
    if (!Number.isInteger(index) || index < 0) continue
    const type = typeForIndex(index, typeRanges)
    const variable = primaryByType.get(type)
    if (!variable || value === variable.value) continue
    overrides[String(index)] = { [variable.name]: parseDraftValue(value, variable.dtype) }
  }
  if (Object.keys(overrides).length > 0) {
    initialization.agent_overrides = overrides
  } else {
    delete initialization.agent_overrides
  }
  delete initialization.agentCounts
  delete initialization.agentOverrides
  return { ...config, agents, initialization }
}

function parseDraftValue(value: string, dtype = ''): string | number | boolean {
  const normalized = dtype.toLowerCase()
  if (normalized === 'bool' || normalized === 'boolean') {
    if (value === 'true' || value === 'True') return true
    if (value === 'false' || value === 'False') return false
    return Boolean(value)
  }
  if (normalized === 'int' || normalized === 'integer') {
    const parsed = Number(value)
    return Number.isInteger(parsed) ? parsed : value
  }
  if (normalized === 'float' || normalized === 'number' || normalized === 'double') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : value
  }
  if (normalized === 'str' || normalized === 'string' || normalized === 'categorical') return value
  if (value === 'true' || value === 'True') return true
  if (value === 'false' || value === 'False') return false
  const numeric = Number(value)
  return Number.isFinite(numeric) && /^-?\d+(?:\.\d+)?$/.test(value.trim()) ? numeric : value
}

function isConfigRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function buildTypeRanges(drafts: AgentTypeDraft[]): TypeRange[] {
  let start = 0
  return drafts.map((draft) => {
    const count = Math.max(0, Math.round(Number(draft.count) || 0))
    const range = { id: draft.id, start, end: start + count }
    start += count
    return range
  })
}

function typeForIndex(index: number, ranges: Array<{ id: string; start: number; end: number }>, fallback = 'agent'): string {
  return ranges.find((range) => index >= range.start && index < range.end)?.id ?? fallback
}

function readBehaviorRefs(agent: Record<string, unknown>): string[] {
  if (Array.isArray(agent.behavior_refs)) return agent.behavior_refs.map(String)
  if (Array.isArray(agent.behaviorRefs)) return agent.behaviorRefs.map(String)
  return []
}

function cleanAgentRecord(agent: Record<string, unknown>): Record<string, unknown> {
  const { stateVariables, behaviorRefs, count, type, ...rest } = agent
  void stateVariables
  void behaviorRefs
  void count
  void type
  return rest
}

function cleanStateVariable(variable: Record<string, unknown>): Record<string, unknown> {
  const { valueRange, ...rest } = variable
  void valueRange
  if (Array.isArray(variable.valueRange) && !('value_range' in rest)) {
    return { ...rest, value_range: variable.valueRange }
  }
  return rest
}
