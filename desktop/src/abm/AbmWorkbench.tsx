import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { abmClient } from './api/abmClient'
import { ensureAbmProject } from './bootstrap/ensureAbmProject'
import { ABM_DEFAULT_SIM_KEY } from './constants'
import { useAbmStore } from './stores/abmStore'
import { RunPanel } from './components/RunPanel'
import { ExperimentCanvas } from './components/ExperimentCanvas'
import { MetricChart } from './components/MetricChart'
import { ExplainInspector } from './components/ExplainInspector'
import { MechanismGraphPanel } from './components/MechanismGraphPanel'
import { OddPanel } from './components/OddPanel'
import { SimulationCanvas } from './components/SimulationCanvas'
import { SimulationManagerPanel } from './components/SimulationManagerPanel'
import { AgentTablePanel } from './components/AgentTablePanel'
import { readAgentCounts, readParameterSpecs } from './modelIntrospection'
import { localizeOdd } from './oddText'
import type { AbmSimulation, Odd } from './types'
import { useAbmText, type AbmTextKey } from './i18n'
import { useSettingsStore } from '../stores/settingsStore'

interface AbmWorkbenchProps {
  embedded?: boolean
  onClose?: () => void
  workDir?: string | null
  sessionId?: string | null
}

const WORKBENCH_VIEWS = [
  { id: 'run', labelKey: 'workbench.view.run', hintKey: 'workbench.view.runHint' },
  { id: 'results', labelKey: 'workbench.view.results', hintKey: 'workbench.view.resultsHint' },
  { id: 'agents', labelKey: 'workbench.view.agents', hintKey: 'workbench.view.agentsHint' },
  { id: 'model', labelKey: 'workbench.view.model', hintKey: 'workbench.view.modelHint' },
  { id: 'odd', labelKey: 'workbench.view.odd', hintKey: 'workbench.view.oddHint' },
  { id: 'simulations', labelKey: 'workbench.view.simulations', hintKey: 'workbench.view.simulationsHint' },
] as const

type WorkbenchView = typeof WORKBENCH_VIEWS[number]['id']

function defaultSimulationStorageKey(projectId: string): string {
  return `${ABM_DEFAULT_SIM_KEY}:${projectId}`
}

export function AbmWorkbench({ embedded = false, onClose, workDir, sessionId }: AbmWorkbenchProps) {
  const t = useAbmText()
  const locale = useSettingsStore((state) => state.locale)
  const [sim, setSim] = useState<AbmSimulation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<WorkbenchView>(() => useAbmStore.getState().viewRequest?.view ?? 'run')
  const viewRef = useRef(view)
  const activeRunId = useAbmStore((store) => store.activeRunId)
  const activeProjectId = useAbmStore((store) => store.activeProjectId)
  const activeSimId = useAbmStore((store) => store.activeSimId)
  const simulationRefresh = useAbmStore((store) => store.simulationRefresh)
  const explainFocus = useAbmStore((store) => store.explainFocus)
  const mode = useAbmStore((store) => store.mode)
  const viewRequest = useAbmStore((store) => store.viewRequest)
  const setActiveProject = useAbmStore((store) => store.setActiveProject)
  const setActiveSim = useAbmStore((store) => store.setActiveSim)
  const closePanel = useAbmStore((store) => store.closePanel)
  const [odd, setOdd] = useState<Odd | null>(null)

  // Chat tools (abm_control_workbench) ask for a view via the store.
  useEffect(() => {
    if (viewRequest) setView(viewRequest.view)
  }, [viewRequest])

  useEffect(() => {
    viewRef.current = view
  }, [view])

  // Load the ODD document lazily when its tab is opened (and after model edits).
  useEffect(() => {
    if (view !== 'odd' || !sim?.id) return
    let cancelled = false
    abmClient
      .getOdd(sim.id, locale)
      .then((res) => {
        if (!cancelled) setOdd(res.odd)
      })
      .catch(() => {
        if (!cancelled) setOdd(null)
      })
    return () => {
      cancelled = true
    }
  }, [locale, view, sim?.id, sim?.modelVersion])
  const parameterSpecs = useMemo(() => readParameterSpecs(sim, locale), [locale, sim])
  // Render the ODD in the system language: the server derives it once in Chinese,
  // so re-localize the auto-derived sections for non-Chinese locales.
  const localizedOdd = useMemo(() => localizeOdd(odd, sim?.config, locale), [odd, sim?.config, locale])
  const agentCounts = useMemo(() => (sim ? readAgentCounts(sim.config) : {}), [sim])
  const runDefaults = useMemo(
    () => ({
      seed: sim?.interface.seed ?? 42,
      steps: sim?.interface.steps ?? 50,
      params: sim?.interface.params ?? {},
    }),
    [sim?.interface.params, sim?.interface.seed, sim?.interface.steps],
  )

  useEffect(() => {
    let cancelled = false

    function bind(simulation: AbmSimulation) {
      localStorage.setItem(defaultSimulationStorageKey(simulation.projectId), simulation.id)
      setActiveProject(simulation.projectId)
      setActiveSim(simulation.id)
    }

    async function ensureSimulation() {
      setLoading(true)
      setError(null)
      try {
        const projectId = await ensureAbmProject({ workDir, sessionId })
        if (cancelled) return

        const storedId = localStorage.getItem(defaultSimulationStorageKey(projectId))
        const preferredIds = [activeSimId, storedId].filter((id): id is string => !!id)
        for (const preferredId of preferredIds) {
          try {
            const existing = await abmClient.getSimulation(preferredId)
            if (existing.projectId !== projectId) {
              if (preferredId === activeSimId) setActiveSim(null)
              continue
            }
            if (!cancelled) {
              bind(existing)
              setSim(existing)
            }
            return
          } catch {
            if (preferredId === activeSimId) setActiveSim(null)
            if (preferredId === storedId) localStorage.removeItem(defaultSimulationStorageKey(projectId))
          }
        }

        const { simulations } = await abmClient.listSimulations(projectId)
        const existing = simulations[0] ?? null
        if (existing) {
          if (!cancelled) {
            bind(existing)
            setSim(existing)
          }
          return
        }

        if (!existing) {
          localStorage.removeItem(defaultSimulationStorageKey(projectId))
          if (!cancelled) {
            setActiveProject(projectId)
            setActiveSim(null)
            setSim(null)
            if (viewRef.current !== 'simulations') {
              setView('simulations')
            }
          }
          return
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void ensureSimulation()
    return () => {
      cancelled = true
    }
  }, [activeSimId, embedded, sessionId, setActiveProject, setActiveSim, workDir])

  useEffect(() => {
    if (!sim?.id || !simulationRefresh) return
    if (simulationRefresh.simId && simulationRefresh.simId !== sim.id) return
    let cancelled = false
    abmClient
      .getSimulation(sim.id)
      .then((updated) => {
        if (!cancelled) setSim(updated)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [sim?.id, simulationRefresh])

  const modeLabel = mode === 'research' ? t('workbench.mode.research') : mode === 'dialogue' ? t('workbench.mode.dialogue') : t('workbench.mode.autonomous')
  const modeHint = mode === 'research'
    ? t('workbench.modeHint.research')
    : mode === 'dialogue'
      ? t('workbench.modeHint.dialogue')
      : t('workbench.modeHint.autonomous')
  const close = onClose ?? closePanel
  const commitAgentCounts = async (counts: Record<string, number>) => {
    if (!sim) return
    const initialization = { ...(sim.config.initialization as Record<string, unknown> ?? {}) }
    delete initialization.agentCounts
    initialization.agent_counts = counts
    const updated = await abmClient.updateSimulation(sim.id, {
      config: { ...sim.config, initialization },
    })
    setSim(updated)
  }

  const runPanel = (
    <RunPanel
      simId={sim?.id ?? null}
      defaults={runDefaults}
      parameters={parameterSpecs}
      agentCounts={agentCounts}
      onCommitAgentCounts={commitAgentCounts}
    />
  )
  const showExplainInspector = Boolean(activeRunId && explainFocus?.runId === activeRunId)

  const renderBody = () => {
    if (view === 'model') {
      return <MechanismGraphPanel simulation={sim} />
    }

    if (view === 'agents') {
      return <AgentTablePanel simulation={sim} onSimulationUpdated={setSim} />
    }

    if (view === 'odd') {
      return (
        <div className="h-full min-h-0 overflow-auto bg-[var(--color-surface-container-lowest)]">
          <OddPanel odd={localizedOdd} runId={activeRunId} />
        </div>
      )
    }

    if (view === 'simulations') {
      return (
        <SimulationManagerPanel
          activeProjectId={activeProjectId}
          activeSimId={activeSimId}
          onSelectSimulation={setSim}
        />
      )
    }

    if (view === 'results') {
      return <ExperimentCanvas simId={sim?.id ?? null} parameters={parameterSpecs} />
    }

    return (
      <div
        className={`grid h-full min-h-0 gap-0 ${
          embedded ? 'grid-cols-[280px_minmax(420px,1fr)]' : 'grid-cols-[300px_minmax(560px,1fr)]'
        }`}
      >
        <aside className="min-h-0 overflow-y-auto border-r border-[var(--color-border)]">
          {runPanel}
        </aside>

        <main className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_8px_minmax(0,1fr)]">
          <div className="min-h-0 p-3">
            <SimulationCanvas runId={activeRunId} />
          </div>
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label={t('workbench.separatorLabel')}
            className="group flex h-2 items-center justify-center border-y border-[var(--color-border)] bg-[var(--color-surface-container-low)]"
          >
            <span className="h-0.5 w-10 rounded-full bg-[var(--color-border)]" />
          </div>
          <div className="min-h-0 overflow-hidden p-3">
            <div
              className={`h-full min-h-0 ${
                showExplainInspector ? 'grid grid-cols-[minmax(0,1fr)_300px] gap-2' : ''
              }`}
            >
              <MetricChart runId={activeRunId} />
              {showExplainInspector ? (
                <div className="min-h-0 overflow-hidden rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)]">
                  <ExplainInspector runId={activeRunId} />
                </div>
              ) : null}
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-surface)]">
      <header className={`flex-none border-b border-[var(--color-border)] ${embedded ? 'px-3 py-2.5' : 'px-5 py-3'}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{t('workbench.title')}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              data-testid="abm-mode-badge"
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-secondary)]"
              title={modeHint}
            >
              {modeLabel}
            </span>
            {embedded ? (
              <button
                type="button"
                aria-label={t('workbench.close')}
                onClick={close}
                className="grid h-8 w-8 place-items-center rounded-lg text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
              >
                <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
        <nav className="mt-3 flex min-w-0 gap-1 overflow-x-auto" aria-label={t('workbench.navLabel')}>
          {WORKBENCH_VIEWS.map((item) => {
            const active = view === item.id
            const label = t(item.labelKey)
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                title={t(item.hintKey)}
                data-testid={`abm-workbench-view-${item.id}`}
                data-active={active ? 'true' : undefined}
                className={`h-8 shrink-0 rounded-[8px] px-3 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-[var(--color-brand)] text-white'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {label}
              </button>
            )
          })}
        </nav>
      </header>

      {error && (
        <div className="mx-5 mt-4 rounded-[10px] border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-3 py-2 text-xs text-[var(--color-error)]">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1">
        {loading ? (
          <div className="p-4 text-sm text-[var(--color-text-tertiary)]">{t('workbench.loading')}</div>
        ) : (
          <ErrorBoundary resetKey={`${view}:${sim?.id ?? 'none'}:${sim?.modelVersion ?? ''}`} fallback={<WorkbenchPanelError view={view} />}>
            {renderBody()}
          </ErrorBoundary>
        )}
      </div>
    </div>
  )
}

function WorkbenchPanelError({ view }: { view: WorkbenchView }) {
  const t = useAbmText()
  const labelKey = WORKBENCH_VIEWS.find((item) => item.id === view)?.labelKey as AbmTextKey | undefined
  const label = labelKey ? t(labelKey) : t('workbench.panelFallback')
  return (
    <div className="grid h-full min-h-0 place-items-center p-6 text-center">
      <div className="max-w-sm">
        <div className="text-sm font-semibold text-[var(--color-text-primary)]">{t('workbench.panelErrorTitle', { label })}</div>
        <div className="mt-2 text-xs leading-5 text-[var(--color-text-tertiary)]">
          {t('workbench.panelErrorBody')}
        </div>
      </div>
    </div>
  )
}
