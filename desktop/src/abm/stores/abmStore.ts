import { create } from 'zustand'
import { abmClient, type StartExperimentBody, type StartRunBody } from '../api/abmClient'
import { abmSocket } from '../api/abmSocket'
import type { AbmExperimentViewSpec, AbmWorkbenchView } from '../chat/abmCard'
import type { AbmMeta, AbmServerMessage, RunRecord } from '../types'

export interface TickPoint {
  tick: number
  metrics: Record<string, number>
}

export interface ExperimentProgressItem {
  index: number
  runId: string
  state: 'completed' | 'failed'
}

export interface ExperimentState {
  status: 'running' | 'completed' | 'failed' | 'stopped'
  total: number
  progress: ExperimentProgressItem[]
  error?: string
}

export interface RunState {
  state: 'running' | 'completed' | 'failed'
  totalSteps?: number
  ticks: TickPoint[]
  // Canvas metadata (palette + geometry) from the first abm_meta frame. The
  // binary snapshot frames themselves bypass the store and go straight to the
  // canvas worker (high frequency).
  meta?: AbmMeta
  record?: RunRecord
  error?: string
}

export interface AgentSnapshotRow {
  id: number
  type: string
  stateIndex: number
  stateLabel: string
}

export interface AgentSnapshot {
  runId: string
  tick: number
  total: number
  palette: string[]
  rows: AgentSnapshotRow[]
  counts: Record<string, number>
}

export interface ResultChartRequest {
  metrics: string[]
  action: 'show' | 'replace'
  nonce: number
}

/** Shared explain window: metric interval selected on the results chart. */
export interface ExplainFocus {
  runId: string
  metric: string
  from: number
  to: number
}

/** ABM product interaction mode (conversation-ux.md §3). */
export type AbmMode = 'research' | 'dialogue' | 'autonomous'

/**
 * A paired base vs intervention comparison (intervention experiment). The two
 * runs share seed/steps/base-params; the treated run applies a scheduled
 * parameter change at `atTick`, so its metric curve visibly diverges there.
 */
export interface InterventionRunState {
  status: 'running' | 'completed' | 'failed'
  baseRunId: string | null
  treatedRunId: string | null
  parameter: string
  atTick: number
  value: unknown
  note?: string
  error?: string
}

export interface RunInterventionOptions {
  parameter: string
  atTick: number
  value: unknown
  seed: number
  steps: number
  params?: Record<string, unknown>
  spaceSampleRate?: number
  spaceAgentCap?: number
  note?: string
}

interface AbmStore {
  runs: Record<string, RunState>
  activeRunId: string | null
  /** Batch experiments keyed by experimentId (P3 single-param sweep). */
  experiments: Record<string, ExperimentState>
  activeExperimentId: string | null
  /** Requested result charts keyed by runId; driven by chat tools and panel controls. */
  resultCharts: Record<string, ResultChartRequest>
  /** Project/simulation the conversation is bound to by default (P2 @-refs). */
  activeProjectId: string | null
  activeSimId: string | null
  /** Bumped when an external tool edits the active Simulation in storage. */
  simulationRefresh: { simId: string | null; nonce: number } | null
  /** research/autonomous = can mutate (with approval); dialogue = read-only Q&A. */
  mode: AbmMode
  /** Shared visual playback speed for the live simulation canvas. */
  playbackSpeed: number
  /** Latest tick actually rendered by the visual playback clock, keyed by run id. */
  playbackTicks: Record<string, number>
  /** The simulation workbench is shown as a companion panel beside chat. */
  panelOpen: boolean
  /** View the workbench should focus, requested by chat tools; nonce marks new requests. */
  viewRequest: { view: AbmWorkbenchView; nonce: number } | null
  /** AI-generated deep experiment specs keyed by simId ('' = unbound/active sim). */
  experimentViews: Record<string, { view: AbmExperimentViewSpec; nonce: number }>
  /** Metric interval the user is explaining; links chart ↔ mechanism graph ↔ inspector. */
  explainFocus: ExplainFocus | null
  /** Low-frequency live agent table snapshots keyed by run id. */
  agentSnapshots: Record<string, AgentSnapshot>
  /** Fold an incoming WS control message into the run/experiment state. */
  ingest: (msg: AbmServerMessage) => void
  /** POST a run, then subscribe its WS channel and stream frames into the store. */
  startRun: (simId: string, body?: StartRunBody) => Promise<string>
  /** Stop the active kernel run if it is still running. */
  stopRun: (runId: string) => Promise<void>
  /** POST a sweep experiment, then subscribe its WS channel for progress. */
  startExperiment: (simId: string, body?: StartExperimentBody) => Promise<string>
  /** Stop a running sweep experiment. */
  stopExperiment: (experimentId: string) => Promise<void>
  /** Latest base-vs-intervention comparison (intervention experiment). */
  interventionRun: InterventionRunState | null
  /** Run a base run then an intervention run (same seed/steps) for comparison. */
  runInterventionExperiment: (simId: string, options: RunInterventionOptions) => Promise<void>
  /** Clear the current intervention comparison. */
  clearInterventionRun: () => void
  /** Drop one run (or all) from the store. */
  reset: (runId?: string) => void
  configureResultCharts: (request: {
    runId?: string | null
    metrics: string[]
    action?: 'show' | 'replace'
  }) => void
  setActiveProject: (projectId: string | null) => void
  setActiveSim: (simId: string | null) => void
  markSimulationChanged: (simId?: string | null) => void
  setActiveRun: (runId: string | null) => void
  setMode: (mode: AbmMode) => void
  setPlaybackSpeed: (speed: number) => void
  setPlaybackTick: (runId: string, tick: number) => void
  openPanel: () => void
  closePanel: () => void
  togglePanel: () => void
  /** Ask the workbench to focus a view (from chat tools). */
  requestView: (view: AbmWorkbenchView) => void
  /** Install an AI-generated deep experiment spec. */
  setExperimentView: (simId: string | null | undefined, view: AbmExperimentViewSpec) => void
  setExplainFocus: (focus: ExplainFocus | null) => void
  setAgentSnapshot: (snapshot: AgentSnapshot) => void
}

const EMPTY_RUN: RunState = { state: 'running', ticks: [] }
const EMPTY_EXPERIMENT: ExperimentState = { status: 'running', total: 0, progress: [] }

export const useAbmStore = create<AbmStore>((set, get) => ({
  runs: {},
  activeRunId: null,
  experiments: {},
  activeExperimentId: null,
  resultCharts: {},
  activeProjectId: null,
  activeSimId: null,
  simulationRefresh: null,
  mode: 'research',
  playbackSpeed: 1,
  playbackTicks: {},
  interventionRun: null,
  panelOpen: false,
  viewRequest: null,
  experimentViews: {},
  explainFocus: null,
  agentSnapshots: {},

  ingest: (msg) => {
    if (msg.type === 'abm_experiment_status' || msg.type === 'abm_experiment_progress') {
      set((store) => {
        const prev = store.experiments[msg.experimentId] ?? EMPTY_EXPERIMENT
        const next: ExperimentState = { ...prev, progress: prev.progress }
        if (msg.type === 'abm_experiment_status') {
          next.status = msg.status
          next.total = msg.total
        } else {
          next.total = msg.total
          next.progress = [
            ...prev.progress.filter((p) => p.index !== msg.index),
            { index: msg.index, runId: msg.runId, state: msg.state },
          ]
        }
        return { experiments: { ...store.experiments, [msg.experimentId]: next } }
      })
      return
    }

    set((store) => {
      const prev = store.runs[msg.runId] ?? EMPTY_RUN
      const next: RunState = { ...prev, ticks: prev.ticks }

      switch (msg.type) {
        case 'abm_run_status':
          next.state = msg.state
          if (msg.totalSteps !== undefined) next.totalSteps = msg.totalSteps
          break
        case 'abm_tick':
          next.ticks = [...prev.ticks, { tick: msg.tick, metrics: msg.metrics }]
          break
        case 'abm_meta':
          next.meta = {
            space: msg.space,
            palette: msg.palette,
            ...(msg.grid ? { grid: msg.grid } : {}),
            ...(msg.network ? { network: msg.network } : {}),
          }
          break
        case 'abm_run_done':
          next.state = 'completed'
          next.record = msg.record
          break
        case 'abm_error':
          next.state = 'failed'
          next.error = msg.message
          break
      }

      return {
        runs: { ...store.runs, [msg.runId]: next },
        activeRunId: store.activeRunId ?? msg.runId,
      }
    })
  },

  startRun: async (simId, body) => {
    const { runId } = await abmClient.startRun(simId, body ?? {})
    set((store) => ({
      activeRunId: runId,
      runs: { ...store.runs, [runId]: { state: 'running', ticks: [] } },
      playbackTicks: { ...store.playbackTicks, [runId]: 0 },
    }))
    abmSocket.connect(runId, { onMessage: (msg) => get().ingest(msg) })
    return runId
  },

  stopRun: async (runId) => {
    await abmClient.stopRun(runId)
    set((store) => {
      const prev = store.runs[runId]
      if (!prev) return {}
      return {
        runs: {
          ...store.runs,
          [runId]: {
            ...prev,
            state: 'failed',
            error: prev.error ?? 'Run stopped',
          },
        },
      }
    })
  },

  startExperiment: async (simId, body) => {
    const { experimentId } = await abmClient.startExperiment(simId, body ?? {})
    set((store) => ({
      activeExperimentId: experimentId,
      experiments: { ...store.experiments, [experimentId]: { status: 'running', total: 0, progress: [] } },
    }))
    abmSocket.connect(experimentId, { onMessage: (msg) => get().ingest(msg) })
    return experimentId
  },

  runInterventionExperiment: async (simId, options) => {
    const shared: StartRunBody = {
      seed: options.seed,
      steps: options.steps,
      ...(options.params ? { params: options.params } : {}),
      ...(options.spaceSampleRate !== undefined ? { spaceSampleRate: options.spaceSampleRate } : {}),
      ...(options.spaceAgentCap !== undefined ? { spaceAgentCap: options.spaceAgentCap } : {}),
    }
    set({
      interventionRun: {
        status: 'running',
        baseRunId: null,
        treatedRunId: null,
        parameter: options.parameter,
        atTick: options.atTick,
        value: options.value,
        ...(options.note ? { note: options.note } : {}),
      },
    })

    const waitForRun = async (runId: string): Promise<'completed' | 'failed'> => {
      for (;;) {
        const run = get().runs[runId]
        if (run && run.state !== 'running') return run.state
        await new Promise((resolve) => setTimeout(resolve, 120))
      }
    }

    try {
      const baseRunId = await get().startRun(simId, shared)
      set((store) =>
        store.interventionRun ? { interventionRun: { ...store.interventionRun, baseRunId } } : {},
      )
      if ((await waitForRun(baseRunId)) === 'failed') {
        throw new Error(get().runs[baseRunId]?.error ?? 'Base run failed')
      }

      const treatedRunId = await get().startRun(simId, {
        ...shared,
        interventions: [
          {
            at_tick: options.atTick,
            params: { [options.parameter]: options.value },
            ...(options.note ? { note: options.note } : {}),
          },
        ],
      })
      set((store) =>
        store.interventionRun ? { interventionRun: { ...store.interventionRun, treatedRunId } } : {},
      )
      if ((await waitForRun(treatedRunId)) === 'failed') {
        throw new Error(get().runs[treatedRunId]?.error ?? 'Intervention run failed')
      }

      set((store) =>
        store.interventionRun ? { interventionRun: { ...store.interventionRun, status: 'completed' } } : {},
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      set((store) =>
        store.interventionRun
          ? { interventionRun: { ...store.interventionRun, status: 'failed', error: message } }
          : {},
      )
      throw error
    }
  },

  clearInterventionRun: () => set({ interventionRun: null }),

  stopExperiment: async (experimentId) => {
    const result = await abmClient.stopExperiment(experimentId)
    if (!result.ok) throw new Error('Experiment is not running')
    set((store) => {
      const prev = store.experiments[experimentId]
      if (!prev) return {}
      return {
        experiments: {
          ...store.experiments,
          [experimentId]: {
            ...prev,
            status: 'stopped',
            error: prev.error ?? 'Experiment stopped',
          },
        },
      }
    })
  },

  reset: (runId) => {
    if (!runId) {
      set({ runs: {}, activeRunId: null, experiments: {}, activeExperimentId: null, resultCharts: {}, explainFocus: null, agentSnapshots: {}, playbackTicks: {} })
      return
    }
    set((store) => {
      const { [runId]: _removed, ...rest } = store.runs
      const { [runId]: _removedCharts, ...chartRest } = store.resultCharts
      const { [runId]: _removedSnapshot, ...snapshotRest } = store.agentSnapshots
      const { [runId]: _removedPlaybackTick, ...playbackRest } = store.playbackTicks
      return {
        runs: rest,
        resultCharts: chartRest,
        agentSnapshots: snapshotRest,
        playbackTicks: playbackRest,
        activeRunId: store.activeRunId === runId ? null : store.activeRunId,
      }
    })
  },

  configureResultCharts: ({ runId, metrics, action = 'show' }) => {
    set((store) => {
      const targetRunId = runId || store.activeRunId
      if (!targetRunId) return {}
      const clean = [...new Set(metrics.map((metric) => metric.trim()).filter(Boolean))]
      if (clean.length === 0) return {}
      const current = store.resultCharts[targetRunId]?.metrics ?? []
      const next = action === 'replace' ? clean : [...new Set([...current, ...clean])]
      return {
        resultCharts: {
          ...store.resultCharts,
          [targetRunId]: { metrics: next, action, nonce: Date.now() },
        },
      }
    })
  },

  setActiveProject: (projectId) => set((store) => {
    if (store.activeProjectId === projectId) return { activeProjectId: projectId }
    return {
      activeProjectId: projectId,
      activeSimId: null,
      activeRunId: null,
      runs: {},
      agentSnapshots: {},
      activeExperimentId: null,
      experiments: {},
      resultCharts: {},
      explainFocus: null,
      playbackTicks: {},
      interventionRun: null,
    }
  }),
  setActiveSim: (simId) => set((store) => {
    if (store.activeSimId === simId) return { activeSimId: simId, panelOpen: simId ? true : store.panelOpen }
    return {
      activeSimId: simId,
      panelOpen: simId ? true : store.panelOpen,
      activeRunId: null,
      activeExperimentId: null,
      runs: {},
      experiments: {},
      resultCharts: {},
      explainFocus: null,
      agentSnapshots: {},
      playbackTicks: {},
      interventionRun: null,
    }
  }),
  markSimulationChanged: (simId) => set({ simulationRefresh: { simId: simId ?? null, nonce: Date.now() } }),
  setActiveRun: (runId) => set((store) => {
    if (!runId) return { activeRunId: null }
    // Subscribe the run's WS channel too, so a tool-focused run streams frames.
    if (!store.runs[runId]) {
      abmSocket.connect(runId, { onMessage: (msg) => get().ingest(msg) })
      return {
        activeRunId: runId,
        runs: { ...store.runs, [runId]: { state: 'running', ticks: [] } },
        playbackTicks: { ...store.playbackTicks, [runId]: 0 },
      }
    }
    return { activeRunId: runId }
  }),
  setMode: (mode) => set({ mode }),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: Math.max(0.1, Math.min(4, speed)) }),
  setPlaybackTick: (runId, tick) => set((store) => {
    if (store.playbackTicks[runId] === tick) return {}
    return { playbackTicks: { ...store.playbackTicks, [runId]: tick } }
  }),
  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
  togglePanel: () => set((store) => ({ panelOpen: !store.panelOpen })),
  requestView: (view) => set({ viewRequest: { view, nonce: Date.now() }, panelOpen: true }),
  setExperimentView: (simId, view) => set((store) => ({
    experimentViews: {
      ...store.experimentViews,
      [simId ?? store.activeSimId ?? '']: { view, nonce: Date.now() },
    },
  })),
  setExplainFocus: (explainFocus) => set({ explainFocus }),
  setAgentSnapshot: (snapshot) => set((store) => ({
    agentSnapshots: {
      ...store.agentSnapshots,
      [snapshot.runId]: snapshot,
    },
  })),
}))
