import { api } from '../../api/client'
import type { AbmProposal } from '../../types/chat'
import { extractRunInterface, inferTemplateFromProposal } from '../proposalTemplate'
import type {
  AbmProject,
  AbmSimulation,
  AttributionResult,
  ChangepointResult,
  ExperimentSummary,
  ExportResult,
  MechanismActivityResult,
  MechanismGraph,
  Intervention,
  Odd,
  RunComparison,
  RunRecord,
  VizResolution,
  VizSpec,
} from '../types'

export interface CreateSimulationBody {
  name?: string
  template?: string
  config?: Record<string, unknown>
  seed?: number
  steps?: number
  params?: Record<string, unknown>
  proposal?: Pick<AbmProposal, 'id' | 'mechanismSummary' | 'keyParams' | 'expectedMacro' | 'oddExcerpt'>
}

export interface UpdateSimulationBody {
  name?: string
  modelVersion?: string
  config?: Record<string, unknown>
  seed?: number
  steps?: number
  params?: Record<string, unknown>
}

export interface StartRunBody {
  seed?: number
  steps?: number
  params?: Record<string, unknown>
  spaceSampleRate?: number
  spaceAgentCap?: number
  /** Scheduled deterministic parameter changes at fixed ticks (intervention experiment). */
  interventions?: Intervention[]
}

export interface StartExperimentBody {
  name?: string
  parameter?: string
  values?: unknown[]
  replications?: number
  steps?: number
  baseSeed?: number
  collectMetrics?: string[]
  fixedParameters?: Record<string, unknown>
  traceLevel?: 'off' | 'key' | 'full'
}

export const abmClient = {
  listProjects: () => api.get<{ projects: AbmProject[] }>('/api/abm/projects'),

  deleteAllProjects: () => api.delete<{ ok: true; deleted: string[] }>('/api/abm/projects'),

  createProject: (
    name: string,
    researchQuestion?: string,
    source?: { sessionId?: string | null; workDir?: string | null },
  ) =>
    api.post<AbmProject>('/api/abm/projects', {
      name,
      researchQuestion,
      ...(source?.sessionId ? { sourceSessionId: source.sessionId } : {}),
      ...(source?.workDir ? { sourceWorkDir: source.workDir } : {}),
    }),

  listTemplates: () => api.get<{ templates: string[] }>('/api/abm/templates'),

  createSimulation: (projectId: string, body: CreateSimulationBody) =>
    api.post<AbmSimulation>(`/api/abm/projects/${encodeURIComponent(projectId)}/simulations`, body),

  listSimulations: (projectId: string) =>
    api.get<{ simulations: AbmSimulation[] }>(`/api/abm/projects/${encodeURIComponent(projectId)}/simulations`),

  // Adopt a draft proposal as a real Simulation with the correct built-in template.
  createSimulationFromProposal: (projectId: string, proposal: AbmProposal) => {
    const template = inferTemplateFromProposal(proposal)
    const { seed, steps, params } = extractRunInterface(proposal.keyParams, template)
    return api.post<AbmSimulation>(`/api/abm/projects/${encodeURIComponent(projectId)}/simulations`, {
      name: proposal.mechanismSummary?.slice(0, 60) || proposal.id,
      template,
      proposal: {
        id: proposal.id,
        mechanismSummary: proposal.mechanismSummary,
        keyParams: params,
        expectedMacro: proposal.expectedMacro,
        oddExcerpt: proposal.oddExcerpt,
      },
      ...(seed !== undefined ? { seed } : {}),
      ...(steps !== undefined ? { steps } : {}),
      params,
    })
  },

  getSimulation: (simId: string) =>
    api.get<AbmSimulation>(`/api/abm/simulations/${encodeURIComponent(simId)}`),

  updateSimulation: (simId: string, body: UpdateSimulationBody) =>
    api.patch<AbmSimulation>(`/api/abm/simulations/${encodeURIComponent(simId)}`, body),

  deleteSimulation: (simId: string) =>
    api.delete<{ ok: true }>(`/api/abm/simulations/${encodeURIComponent(simId)}`),

  getOdd: (simId: string, locale?: string) => {
    const query = locale ? `?locale=${encodeURIComponent(locale)}` : ''
    return api.get<{ odd: Odd | null }>(`/api/abm/simulations/${encodeURIComponent(simId)}/odd${query}`)
  },

  startRun: (simId: string, body: StartRunBody = {}) =>
    api.post<{ runId: string }>(`/api/abm/simulations/${encodeURIComponent(simId)}/runs`, body),

  getRun: (runId: string) => api.get<RunRecord>(`/api/abm/runs/${encodeURIComponent(runId)}`),

  stopRun: (runId: string) =>
    api.post<{ ok: boolean }>(`/api/abm/runs/${encodeURIComponent(runId)}/stop`, {}),

  // Start a single-param sweep (P3). Returns the experimentId; progress streams
  // over /ws/abm/:experimentId (the run-id slot doubles as the experiment id).
  startExperiment: (simId: string, body: StartExperimentBody = {}) =>
    api.post<{ experimentId: string }>(
      `/api/abm/simulations/${encodeURIComponent(simId)}/experiments`,
      body,
    ),

  getExperiment: (experimentId: string) =>
    api.get<ExperimentSummary>(`/api/abm/experiments/${encodeURIComponent(experimentId)}`),

  stopExperiment: (experimentId: string) =>
    api.post<{ ok: boolean }>(`/api/abm/experiments/${encodeURIComponent(experimentId)}/stop`, {}),

  // Resolve a declarative VizSpec to its real data (server rejects fabricated
  // column bindings); the AI emits only the spec, never the data.
  resolveViz: (spec: VizSpec) => api.post<VizResolution>('/api/abm/viz/resolve', spec),

  // Build a self-contained reproduction package (model + ODD + experiments +
  // runs + manifest). Gated behind a research-mode confirmation in the UI.
  exportSimulation: (simId: string, body: { includeTraces?: boolean } = {}) =>
    api.post<ExportResult>(`/api/abm/simulations/${encodeURIComponent(simId)}/export`, body),

  // Kernel-derived causal-path graph for the model (cached per model version).
  getMechanismGraph: async (simId: string) => {
    const response = await api.get<{ graph: MechanismGraph }>(`/api/abm/simulations/${encodeURIComponent(simId)}/mechanism-graph`)
    return response.graph
  },

  // Per-mechanism firing activity from the real trace (graph heat overlay).
  getMechanismActivity: (runId: string, range?: { from?: number; to?: number }) => {
    const params = new URLSearchParams()
    if (range?.from !== undefined) params.set('from', String(range.from))
    if (range?.to !== undefined) params.set('to', String(range.to))
    const query = params.toString()
    return api.get<MechanismActivityResult>(
      `/api/abm/runs/${encodeURIComponent(runId)}/mechanism-activity${query ? `?${query}` : ''}`,
    )
  },

  // Decompose a metric's change over [from,to] into per-mechanism flows.
  getAttribution: (runId: string, metric: string, range?: { from?: number; to?: number }) => {
    const params = new URLSearchParams({ metric })
    if (range?.from !== undefined) params.set('from', String(range.from))
    if (range?.to !== undefined) params.set('to', String(range.to))
    return api.get<AttributionResult>(`/api/abm/runs/${encodeURIComponent(runId)}/attribution?${params.toString()}`)
  },

  // Salient slope changes (ticks most worth explaining) per metric.
  getChangepoints: (runId: string, metric?: string) => {
    const params = new URLSearchParams()
    if (metric) params.set('metric', metric)
    const query = params.toString()
    return api.get<ChangepointResult>(
      `/api/abm/runs/${encodeURIComponent(runId)}/changepoints${query ? `?${query}` : ''}`,
    )
  },

  // Deterministic "what if": same seed/model, changed params only.
  startCounterfactual: (baseRunId: string, params: Record<string, unknown>) =>
    api.post<{ runId: string }>(`/api/abm/runs/${encodeURIComponent(baseRunId)}/counterfactual`, { params }),

  // Tick-by-tick divergence report between two completed runs.
  compareRuns: (baseRunId: string, otherRunId: string) =>
    api.get<RunComparison>(
      `/api/abm/runs/${encodeURIComponent(baseRunId)}/compare/${encodeURIComponent(otherRunId)}`,
    ),
}
