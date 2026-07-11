/**
 * ABM tool-result envelope (P2 Task 3 + Task 4/6).
 *
 * ABM agent tools return a JSON envelope as their tool_result `content`. The
 * desktop chatStore (`desktop/src/abm/chat/abmCard.ts::parseAbmCard`) detects
 * the `abmCard` discriminator and renders a rich card (proposal batch /
 * explanation) instead of a generic tool result. Keep this in sync with the
 * desktop parser — it is the contract between the two surfaces.
 */

export interface AbmProposalEnvelope {
  id: string
  mechanismSummary: string
  keyParams?: Record<string, unknown>
  expectedMacro: string
  oddExcerpt?: string
  /** Only present when a *real* trial run was executed (no fabrication). */
  trial?: { runId: string; sparkline: number[] }
}

export interface AbmEvidenceEnvelope {
  tick: number
  metric?: string
  value?: number
  event?: string
  mechanism_id?: string
}

export type AbmWorkbenchView = 'run' | 'results' | 'agents' | 'model' | 'odd' | 'simulations'

export interface AbmExperimentChartSpec {
  id: string
  title: string
  type: 'line' | 'multi_line' | 'bar' | 'scatter'
  metrics: string[]
  xAxis?: 'tick' | 'parameter'
  note?: string
}

export interface AbmExperimentControlSpec {
  id: string
  label: string
  kind: 'slider' | 'input' | 'select'
  min?: number
  max?: number
  step?: number
  options?: Array<string | number>
  value?: unknown
  role?: 'sweep' | 'fixed'
  values?: number[]
  description?: string
}

export interface AbmExperimentViewSpec {
  title: string
  intent?: string
  description?: string
  charts: AbmExperimentChartSpec[]
  controls: AbmExperimentControlSpec[]
  experiment?: {
    parameter?: string
    values?: number[]
    replications?: number
    steps?: number
  }
}

export interface AbmAttributionContributionEnvelope {
  mechanism_id: string
  gains: number
  losses: number
  net: number
  agents: number
}

export interface AbmComparisonMetricEnvelope {
  metric: string
  baseFinal: number | null
  otherFinal: number | null
  finalDelta: number | null
  maxAbsDelta: number
  maxAbsDeltaTick: number | null
}

export type AbmCardEnvelope =
  | { abmCard: 'proposal_batch'; proposals: AbmProposalEnvelope[] }
  | {
      abmCard: 'explanation'
      text: string
      evidence: AbmEvidenceEnvelope[]
      speculative: boolean
      runId?: string
      from?: number
      to?: number
    }
  | {
      abmCard: 'result_canvas'
      metrics: string[]
      action: 'show' | 'replace'
      runId?: string
      note?: string
    }
  | {
      abmCard: 'workbench'
      action: 'open' | 'close'
      view?: AbmWorkbenchView
      simId?: string
      runId?: string
      note?: string
    }
  | {
      abmCard: 'experiment_view'
      simId?: string
      view: AbmExperimentViewSpec
      note?: string
    }
  | {
      abmCard: 'attribution'
      runId: string
      metric: string
      from: number
      to: number
      supported: boolean
      reason?: string
      actualDelta: number | null
      attributedNet: number
      residual: number | null
      coverage: number | null
      contributions: AbmAttributionContributionEnvelope[]
      note?: string
    }
  | {
      abmCard: 'counterfactual'
      baseRunId: string
      runId: string
      changed: Record<string, unknown>
      seed: number
      steps: number
      status: 'completed' | 'failed' | 'timeout'
      divergenceTick?: number | null
      metrics?: AbmComparisonMetricEnvelope[]
      note?: string
    }

export function proposalBatchEnvelope(proposals: AbmProposalEnvelope[]): AbmCardEnvelope {
  return { abmCard: 'proposal_batch', proposals }
}

export function explanationEnvelope(params: {
  text: string
  evidence: AbmEvidenceEnvelope[]
  speculative: boolean
  runId?: string
  from?: number
  to?: number
}): AbmCardEnvelope {
  return {
    abmCard: 'explanation',
    text: params.text,
    evidence: params.evidence,
    speculative: params.speculative,
    ...(params.runId !== undefined ? { runId: params.runId } : {}),
    ...(params.from !== undefined ? { from: params.from } : {}),
    ...(params.to !== undefined ? { to: params.to } : {}),
  }
}

export function resultCanvasEnvelope(params: {
  metrics: string[]
  action: 'show' | 'replace'
  runId?: string
  note?: string
}): AbmCardEnvelope {
  return {
    abmCard: 'result_canvas',
    metrics: params.metrics,
    action: params.action,
    ...(params.runId !== undefined ? { runId: params.runId } : {}),
    ...(params.note !== undefined ? { note: params.note } : {}),
  }
}

export function workbenchEnvelope(params: {
  action: 'open' | 'close'
  view?: AbmWorkbenchView
  simId?: string
  runId?: string
  note?: string
}): AbmCardEnvelope {
  return {
    abmCard: 'workbench',
    action: params.action,
    ...(params.view !== undefined ? { view: params.view } : {}),
    ...(params.simId !== undefined ? { simId: params.simId } : {}),
    ...(params.runId !== undefined ? { runId: params.runId } : {}),
    ...(params.note !== undefined ? { note: params.note } : {}),
  }
}

export function experimentViewEnvelope(params: {
  simId?: string
  view: AbmExperimentViewSpec
  note?: string
}): AbmCardEnvelope {
  return {
    abmCard: 'experiment_view',
    view: params.view,
    ...(params.simId !== undefined ? { simId: params.simId } : {}),
    ...(params.note !== undefined ? { note: params.note } : {}),
  }
}

export function attributionEnvelope(params: {
  runId: string
  metric: string
  from: number
  to: number
  supported: boolean
  reason?: string
  actualDelta: number | null
  attributedNet: number
  residual: number | null
  coverage: number | null
  contributions: AbmAttributionContributionEnvelope[]
  note?: string
}): AbmCardEnvelope {
  return {
    abmCard: 'attribution',
    runId: params.runId,
    metric: params.metric,
    from: params.from,
    to: params.to,
    supported: params.supported,
    ...(params.reason !== undefined ? { reason: params.reason } : {}),
    actualDelta: params.actualDelta,
    attributedNet: params.attributedNet,
    residual: params.residual,
    coverage: params.coverage,
    contributions: params.contributions,
    ...(params.note !== undefined ? { note: params.note } : {}),
  }
}

export function counterfactualEnvelope(params: {
  baseRunId: string
  runId: string
  changed: Record<string, unknown>
  seed: number
  steps: number
  status: 'completed' | 'failed' | 'timeout'
  divergenceTick?: number | null
  metrics?: AbmComparisonMetricEnvelope[]
  note?: string
}): AbmCardEnvelope {
  return {
    abmCard: 'counterfactual',
    baseRunId: params.baseRunId,
    runId: params.runId,
    changed: params.changed,
    seed: params.seed,
    steps: params.steps,
    status: params.status,
    ...(params.divergenceTick !== undefined ? { divergenceTick: params.divergenceTick } : {}),
    ...(params.metrics !== undefined ? { metrics: params.metrics } : {}),
    ...(params.note !== undefined ? { note: params.note } : {}),
  }
}

/** Serialize an envelope for a tool_result `content` field. */
export function serializeEnvelope(envelope: AbmCardEnvelope): string {
  return JSON.stringify(envelope)
}
