import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CalendarDays, CheckCircle2, Code2, Copy, Eye, History, Layers, Pencil, RefreshCw, Search, Trash2, Workflow, X } from 'lucide-react'
import { abmClient } from '../api/abmClient'
import { useAbmStore } from '../stores/abmStore'
import type { AbmProject, AbmSimulation } from '../types'
import { readAgentCounts, readMechanismNodes, readModelId, readModelVersion, readParameterSpecs } from '../modelIntrospection'
import { SimulationPreview } from './SimulationPreview'
import { useAbmText, type AbmTextKey } from '../i18n'

interface Props {
  activeProjectId: string | null
  activeSimId: string | null
  onSelectSimulation?: (simulation: AbmSimulation) => void
}

export function SimulationManagerPanel({ activeProjectId, activeSimId, onSelectSimulation }: Props) {
  const t = useAbmText()
  const setActiveProject = useAbmStore((store) => store.setActiveProject)
  const setActiveSim = useAbmStore((store) => store.setActiveSim)
  const openPanel = useAbmStore((store) => store.openPanel)
  const [projects, setProjects] = useState<AbmProject[]>([])
  const [simulations, setSimulations] = useState<AbmSimulation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [selectedLineageId, setSelectedLineageId] = useState<string | null>(null)
  const [selectedVersionByLineage, setSelectedVersionByLineage] = useState<Record<string, string>>({})
  const [detailState, setDetailState] = useState<{
    simulation: AbmSimulation
    previous?: AbmSimulation
    displayVersion: string
  } | null>(null)
  const [editingName, setEditingName] = useState<{ simulation: AbmSimulation; name: string } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ simulation: AbmSimulation; versions: AbmSimulation[] } | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const projectResult = await abmClient.listProjects()
      setProjects(projectResult.projects)
      const projectId = activeProjectId ?? projectResult.projects[0]?.id ?? null
      if (!projectId) {
        setSimulations([])
        return
      }
      if (!activeProjectId) setActiveProject(projectId)
      const result = await abmClient.listSimulations(projectId)
      setSimulations(result.simulations)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId])

  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0] ?? null
  const versionsByLineage = useMemo(() => {
    const map = new Map<string, AbmSimulation[]>()
    for (const simulation of simulations) {
      const key = simulationLineageKey(simulation)
      const next = map.get(key) ?? []
      next.push(simulation)
      map.set(key, next)
    }
    for (const versions of map.values()) {
      versions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }
    return map
  }, [simulations])
  const displayVersionsBySim = useMemo(() => {
    const map = new Map<string, string>()
    for (const versions of versionsByLineage.values()) {
      const assigned: string[] = []
      for (const simulation of [...versions].reverse()) {
        const displayVersion = nextDisplayVersion(assigned, readModelVersion(simulation))
        assigned.push(displayVersion)
        map.set(simulation.id, displayVersion)
      }
    }
    return map
  }, [versionsByLineage])
  const simulationGroups = useMemo(() => {
    const query = filter.trim().toLowerCase()
    return [...versionsByLineage.entries()]
      .map(([lineageId, versions]) => {
        const selectedId = selectedVersionByLineage[lineageId]
        const selected = versions.find((simulation) => simulation.id === selectedId) ?? versions[0]!
        const modelId = readModelId(selected.config, selected.name)
        return { lineageId, modelId, versions, selected }
      })
      .filter((group) => {
        if (!query) return true
        return group.versions.some((simulation) => {
          const text = `${simulation.name} ${simulation.id} ${group.modelId} ${group.lineageId}`.toLowerCase()
          return text.includes(query)
        })
      })
  }, [filter, selectedVersionByLineage, versionsByLineage])

  const selectSimulation = (simulation: AbmSimulation) => {
    setActiveProject(simulation.projectId)
    setActiveSim(simulation.id)
    openPanel()
    onSelectSimulation?.(simulation)
  }

  const renameSimulation = async () => {
    if (!editingName) return
    const name = editingName.name.trim()
    if (!name) return
    setBusyAction(`rename:${editingName.simulation.id}`)
    setError(null)
    try {
      await abmClient.updateSimulation(editingName.simulation.id, { name })
      setEditingName(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyAction(null)
    }
  }

  const duplicateSimulation = async (simulation: AbmSimulation) => {
    setBusyAction(`duplicate:${simulation.id}`)
    setError(null)
    try {
      const created = await abmClient.createSimulation(simulation.projectId, {
        name: `${simulation.name} ${t('sim.copySuffix')}`,
        config: simulation.config,
        seed: simulation.interface.seed,
        steps: simulation.interface.steps,
        params: simulation.interface.params,
      })
      setSelectedLineageId(simulationLineageKey(created))
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyAction(null)
    }
  }

  const deleteSelectedSimulation = async () => {
    if (!pendingDelete) return
    const deletingIds = pendingDelete.versions.map((version) => version.id)
    setBusyAction(`delete:${pendingDelete.simulation.id}`)
    setError(null)
    try {
      await Promise.all(deletingIds.map((id) => abmClient.deleteSimulation(id)))
      if (activeSimId && deletingIds.includes(activeSimId)) setActiveSim(null)
      setSimulations((current) => current.filter((simulation) => !deletingIds.includes(simulation.id)))
      setSelectedVersionByLineage((current) => {
        const next = { ...current }
        delete next[simulationLineageKey(pendingDelete.simulation)]
        return next
      })
      setPendingDelete(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyAction(null)
    }
  }

  const previousVersionFor = (versions: AbmSimulation[], simulation: AbmSimulation): AbmSimulation | undefined => {
    const index = versions.findIndex((version) => version.id === simulation.id)
    return index >= 0 ? versions[index + 1] : undefined
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
            <Layers className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            {t('sim.title')}
          </h2>
          <p className="mt-1 truncate text-xs text-[var(--color-text-tertiary)]">
            {t('sim.researchQuestion')} {activeProject?.researchQuestion || activeProject?.name || t('sim.noProject')} · {activeProject?.id ?? t('sim.noId')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[var(--color-border)] px-2.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} aria-hidden="true" />
            {t('sim.refresh')}
          </button>
        </div>
      </div>

      <div className="shrink-0 px-4 py-3">
        <label className="flex h-9 items-center gap-2 rounded-[9px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-3">
          <Search className="h-4 w-4 shrink-0 text-[var(--color-text-tertiary)]" strokeWidth={2} aria-hidden="true" />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={t('sim.searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)]"
          />
        </label>
      </div>

      {error ? (
        <div className="mx-4 rounded-[9px] border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-3 py-2 text-xs text-[var(--color-error)]">
          {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
        {simulationGroups.length === 0 ? (
          <div className="grid min-h-[220px] place-items-center rounded-[10px] border border-dashed border-[var(--color-border)] px-6 text-center text-sm text-[var(--color-text-tertiary)]">
            {t('sim.empty')}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
            {simulationGroups.map(({ lineageId, modelId, versions, selected }) => {
              const active = selected.id === activeSimId
              const cardSelected = selectedLineageId === lineageId || (!selectedLineageId && active)
              const parameters = readParameterSpecs(selected)
              const displayVersion = displayVersionsBySim.get(selected.id) ?? readModelVersion(selected)
              const previousVersion = previousVersionFor(versions, selected)
              return (
                <article
                  key={lineageId}
                  data-testid="simulation-manager-item"
                  data-active={active ? 'true' : undefined}
                  data-selected={cardSelected ? 'true' : undefined}
                  onClick={() => setSelectedLineageId(lineageId)}
                  className={`rounded-[12px] border bg-[var(--color-surface)] p-3 text-left transition-colors ${
                    cardSelected
                      ? 'border-[var(--color-brand)] bg-[var(--color-brand)]/6'
                      : 'border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{selected.name}</span>
                        {active ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--color-brand)]" strokeWidth={2.2} aria-hidden="true" /> : null}
                      </div>
                      <div className="mt-1 truncate font-mono text-[11px] text-[var(--color-text-tertiary)]">
                        {selected.id}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-[var(--color-surface-container)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-secondary)]">
                      v{displayVersion}
                    </span>
                  </div>
                  <div className="mt-3">
                    <SimulationPreview simulation={selected} compact />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-[var(--color-text-secondary)]">
                    <Chip icon={<Workflow className="h-3 w-3" strokeWidth={2} aria-hidden="true" />} label={modelId} />
                    <Chip label={`seed ${selected.interface.seed}`} />
                    <Chip label={t('sim.steps', { count: selected.interface.steps })} />
                    <Chip label={t('sim.params', { count: parameters.length })} />
                    <Chip icon={<CalendarDays className="h-3 w-3" strokeWidth={2} aria-hidden="true" />} label={formatDate(selected.createdAt, t)} />
                  </div>

                  <div className="mt-3 rounded-[9px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-2">
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-semibold text-[var(--color-text-primary)]">
                      <span className="flex items-center gap-1.5">
                        <History className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                        {t('sim.versionManagement')}
                      </span>
                      <span className="font-normal text-[var(--color-text-tertiary)]">{t('sim.versionCount', { count: versions.length })}</span>
                    </div>
                    <select
                      value={selected.id}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        setSelectedLineageId(lineageId)
                        setSelectedVersionByLineage((current) => ({ ...current, [lineageId]: event.target.value }))
                      }}
                      className="h-8 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[11px] text-[var(--color-text-primary)] outline-none focus-visible:border-[var(--color-border-focus)]"
                    >
                      {versions.map((version) => (
                        <option key={version.id} value={version.id}>
                          v{displayVersionsBySim.get(version.id) ?? readModelVersion(version)} · {version.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mt-3 flex min-w-0 items-center justify-end gap-1.5">
                    <button
                      type="button"
                      aria-label={t('sim.renameAria')}
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelectedLineageId(lineageId)
                        setEditingName({ simulation: selected, name: selected.name })
                      }}
                      className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--color-border)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)]"
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('sim.duplicateAria')}
                      disabled={busyAction === `duplicate:${selected.id}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        void duplicateSimulation(selected)
                      }}
                      className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--color-border)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:cursor-wait disabled:opacity-60"
                    >
                      <Copy className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('sim.deleteAria')}
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelectedLineageId(lineageId)
                        setPendingDelete({ simulation: selected, versions })
                      }}
                      className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--color-border)] text-[var(--color-error)] transition-colors hover:bg-[var(--color-error)]/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelectedLineageId(lineageId)
                        setDetailState({
                          simulation: selected,
                          displayVersion,
                          ...(previousVersion ? { previous: previousVersion } : {}),
                        })
                      }}
                      className="inline-flex h-8 min-w-[64px] items-center justify-center whitespace-nowrap rounded-[8px] border border-[var(--color-border)] px-2 text-[11px] font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)]"
                    >
                      <Eye className="mr-1.5 h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                      Details
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        selectSimulation(selected)
                      }}
                      className="inline-flex h-8 min-w-[64px] items-center justify-center whitespace-nowrap rounded-[8px] bg-[var(--color-brand)] px-2.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
                    >
                      Select
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      {detailState ? (
        <SimulationVersionDetailsModal
          simulation={detailState.simulation}
          previous={detailState.previous}
          displayVersion={detailState.displayVersion}
          t={t}
          onClose={() => setDetailState(null)}
        />
      ) : null}
      {editingName ? (
        <SimulationNameDialog
          title={t('sim.renameTitle')}
          value={editingName.name}
          busy={busyAction === `rename:${editingName.simulation.id}`}
          confirmLabel={t('sim.save')}
          onChange={(name) => setEditingName((current) => current ? { ...current, name } : current)}
          onClose={() => setEditingName(null)}
          onConfirm={() => void renameSimulation()}
        />
      ) : null}
      {pendingDelete ? (
        <SimulationDeleteDialog
          simulation={pendingDelete.simulation}
          versionCount={pendingDelete.versions.length}
          busy={busyAction === `delete:${pendingDelete.simulation.id}`}
          onClose={() => setPendingDelete(null)}
          onConfirm={() => void deleteSelectedSimulation()}
        />
      ) : null}
    </div>
  )
}

function SimulationNameDialog({
  title,
  value,
  busy,
  confirmLabel,
  onChange,
  onClose,
  onConfirm,
}: {
  title: string
  value: string
  busy: boolean
  confirmLabel: string
  onChange: (value: string) => void
  onClose: () => void
  onConfirm: () => void
}) {
  const t = useAbmText()
  return (
    <div className="fixed inset-0 z-[85] grid place-items-center bg-black/20 p-6" role="dialog" aria-modal="true">
      <div className="w-[min(420px,calc(100vw-48px))] rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-4 shadow-[var(--shadow-dropdown)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
          <button type="button" aria-label={t('sim.close')} onClick={onClose} className="grid h-8 w-8 place-items-center rounded-[8px] text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-hover)]">
            <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <label className="block text-xs font-medium text-[var(--color-text-secondary)]">
          {t('sim.name')}
          <input
            autoFocus
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && value.trim()) onConfirm()
              if (event.key === 'Escape') onClose()
            }}
            placeholder={t('sim.namePlaceholder')}
            className="mt-1 h-9 w-full rounded-[9px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)] outline-none focus-visible:border-[var(--color-border-focus)]"
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-[9px] border border-[var(--color-border)] px-3 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]">
            {t('sim.cancel')}
          </button>
          <button
            type="button"
            disabled={!value.trim() || busy}
            onClick={onConfirm}
            className="h-9 rounded-[9px] bg-[var(--color-brand)] px-3 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-default disabled:opacity-50"
          >
            {busy ? t('sim.busy') : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function SimulationDeleteDialog({
  simulation,
  versionCount,
  busy,
  onClose,
  onConfirm,
}: {
  simulation: AbmSimulation
  versionCount: number
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const t = useAbmText()
  return (
    <div className="fixed inset-0 z-[85] grid place-items-center bg-black/20 p-6" role="dialog" aria-modal="true">
      <div className="w-[min(440px,calc(100vw-48px))] rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-4 shadow-[var(--shadow-dropdown)]">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{t('sim.deleteTitle')}</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
          {t('sim.deleteBody', { name: simulation.name, count: versionCount })}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-[9px] border border-[var(--color-border)] px-3 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]">
            {t('sim.cancel')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="h-9 rounded-[9px] bg-[var(--color-error)] px-3 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? t('sim.deleting') : t('sim.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}

function SimulationVersionDetailsModal({
  simulation,
  previous,
  displayVersion,
  t,
  onClose,
}: {
  simulation: AbmSimulation
  previous?: AbmSimulation
  displayVersion: string
  t: (key: AbmTextKey, params?: Record<string, string | number>) => string
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/20 p-6" role="dialog" aria-modal="true">
      <div className="flex max-h-[min(720px,calc(100vh-48px))] w-[min(720px,calc(100vw-48px))] flex-col overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] shadow-[var(--shadow-dropdown)]">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
              {t('sim.versionTitle', { version: displayVersion })}
            </h3>
            <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--color-text-tertiary)]">{simulation.id}</p>
          </div>
          <button
            type="button"
            aria-label={t('sim.closeVersionDetails')}
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 overflow-auto p-4">
          <SimulationVersionDetails
            simulation={simulation}
            previous={previous}
            displayVersion={displayVersion}
            t={t}
          />
        </div>
      </div>
    </div>
  )
}

function SimulationVersionDetails({
  simulation,
  previous,
  displayVersion,
  t,
}: {
  simulation: AbmSimulation
  previous?: AbmSimulation
  displayVersion: string
  t: (key: AbmTextKey, params?: Record<string, string | number>) => string
}) {
  const parameters = readParameterSpecs(simulation)
  const mechanisms = readMechanismNodes(simulation.config)
  const agentCounts = readAgentCounts(simulation.config)
  const changes = describeVersionChanges(simulation, previous, t)
  const agentCountText = Object.entries(agentCounts)
    .map(([key, value]) => `${key} ${value.toLocaleString()}`)
    .join(' · ')

  return (
    <div className="mt-3 rounded-[9px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-2.5 text-xs">
      <div className="mb-2 flex items-center gap-1.5 font-semibold text-[var(--color-text-primary)]">
        <Code2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        {t('sim.coreDetails')}
      </div>
      <div className="grid gap-1.5">
        <DetailRow label={t('sim.modelId')} value={readModelId(simulation.config, simulation.name)} />
        <DetailRow label={t('sim.version')} value={`v${displayVersion}`} />
        <DetailRow label={t('sim.scale')} value={agentCountText || t('sim.unsetScale')} />
        <DetailRow label={t('sim.run')} value={`seed ${simulation.interface.seed} · ${t('sim.stepsUnit', { count: simulation.interface.steps })}`} />
      </div>

      <div className="mt-2">
        <div className="mb-1 text-[11px] font-semibold text-[var(--color-text-primary)]">{t('sim.coreChanges')}</div>
        <ul className="space-y-1 leading-5 text-[var(--color-text-secondary)]">
          {changes.map((change) => (
            <li key={change}>{change}</li>
          ))}
        </ul>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {parameters.slice(0, 8).map((parameter) => (
          <Chip key={parameter.id} label={`${parameter.label}=${formatValue(parameter.value, t)}`} />
        ))}
        {parameters.length > 8 ? <Chip label={t('sim.moreParams', { count: parameters.length - 8 })} /> : null}
      </div>

      {mechanisms.length > 0 ? (
        <div className="mt-2 grid gap-1">
          {mechanisms.slice(0, 3).map((mechanism) => (
            <div key={mechanism.id} className="rounded-[8px] bg-[var(--color-surface-container-low)] px-2 py-1.5">
              <div className="truncate font-medium text-[var(--color-text-primary)]">{mechanism.label}</div>
              <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-[var(--color-text-tertiary)]">
                {mechanism.trigger || t('sim.unsetTrigger')} → {mechanism.effect || t('sim.unsetEffect')}
              </div>
            </div>
          ))}
          {mechanisms.length > 3 ? (
            <div className="text-[11px] text-[var(--color-text-tertiary)]">
              {t('sim.moreMechanisms', { count: mechanisms.length - 3 })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
      <span className="text-[var(--color-text-tertiary)]">{label}</span>
      <span className="truncate text-[var(--color-text-secondary)]">{value}</span>
    </div>
  )
}

function simulationLineageKey(simulation: AbmSimulation): string {
  return simulation.lineageId || simulation.id
}

function describeVersionChanges(
  current: AbmSimulation,
  previous: AbmSimulation | undefined,
  t: (key: AbmTextKey, params?: Record<string, string | number>) => string,
): string[] {
  if (!previous) {
    return [t('sim.initialVersionChange', { modelId: readModelId(current.config, current.name) })]
  }

  const changes: string[] = []
  const currentMechanisms = new Set(readMechanismNodes(current.config).map((mechanism) => mechanism.id))
  const previousMechanisms = new Set(readMechanismNodes(previous.config).map((mechanism) => mechanism.id))
  const addedMechanisms = [...currentMechanisms].filter((id) => !previousMechanisms.has(id))
  const removedMechanisms = [...previousMechanisms].filter((id) => !currentMechanisms.has(id))
  if (addedMechanisms.length > 0) changes.push(t('sim.addedMechanisms', { items: addedMechanisms.join(', ') }))
  if (removedMechanisms.length > 0) changes.push(t('sim.removedMechanisms', { items: removedMechanisms.join(', ') }))

  const currentParams = new Map(readParameterSpecs(current).map((parameter) => [parameter.id, parameter.value]))
  const previousParams = new Map(readParameterSpecs(previous).map((parameter) => [parameter.id, parameter.value]))
  const changedParams = [...currentParams.entries()]
    .filter(([id, value]) => previousParams.has(id) && JSON.stringify(previousParams.get(id)) !== JSON.stringify(value))
    .map(([id, value]) => `${id}: ${formatValue(previousParams.get(id), t)} → ${formatValue(value, t)}`)
  const addedParams = [...currentParams.keys()].filter((id) => !previousParams.has(id))
  if (changedParams.length > 0) changes.push(t('sim.paramDefaultsChanged', { items: changedParams.slice(0, 4).join('; ') }))
  if (addedParams.length > 0) changes.push(t('sim.addedParams', { items: addedParams.slice(0, 6).join(', ') }))

  if (current.interface.steps !== previous.interface.steps) {
    changes.push(t('sim.defaultStepsChanged', { before: previous.interface.steps, after: current.interface.steps }))
  }
  if (current.interface.seed !== previous.interface.seed) {
    changes.push(t('sim.defaultSeedChanged', { before: previous.interface.seed, after: current.interface.seed }))
  }

  return changes.length > 0
    ? changes
    : [t('sim.noCoreChanges')]
}

function nextDisplayVersion(existingVersions: string[], requestedVersion: string): string {
  const base = requestedVersion.trim() || '1'
  if (existingVersions.length === 0) return base
  const highestExisting = [...existingVersions].sort(compareVersionLabels).at(-1)
  if (!highestExisting) return base
  if (compareVersionLabels(base, highestExisting) > 0 && !existingVersions.includes(base)) {
    return base
  }
  return incrementVersionLabel(highestExisting)
}

function incrementVersionLabel(version: string): string {
  const match = version.match(/^(.*?)(\d+)(\D*)$/)
  if (!match) return version.length ? `${version}.1` : '1'
  const [, prefix, digits, suffix] = match
  return `${prefix}${Number(digits) + 1}${suffix}`
}

function compareVersionLabels(a: string, b: string): number {
  const aParts = versionNumberParts(a)
  const bParts = versionNumberParts(b)
  const length = Math.max(aParts.length, bParts.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (aParts[index] ?? 0) - (bParts[index] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

function versionNumberParts(version: string): number[] {
  return (version.match(/\d+/g) ?? []).map((part) => Number(part))
}

function formatValue(value: unknown, t?: (key: AbmTextKey, params?: Record<string, string | number>) => string): string {
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(3)
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value === null || value === undefined) return t ? t('sim.emptyValue') : 'Empty'
  return JSON.stringify(value) ?? String(value)
}

function formatDate(value: string, t: (key: AbmTextKey, params?: Record<string, string | number>) => string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return t('sim.unknownTime')
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function Chip({ label, icon }: { label: string; icon?: ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-[var(--color-surface-container-low)] px-2 py-0.5">
      {icon}
      <span className="truncate">{label}</span>
    </span>
  )
}
