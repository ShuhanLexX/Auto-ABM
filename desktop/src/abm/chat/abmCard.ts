/**
 * Parse the ABM card envelope emitted by the agent-loop ABM tools
 * (src/tools/abm/*). Those tools return their tool_result content as a JSON
 * string envelope; the desktop turns recognised envelopes into rich ABM
 * UIMessages (proposal batch / explanation) instead of a raw tool_result block.
 *
 * Contract (must match src/tools/abm/*):
 *   { "abmCard": "proposal_batch", "proposals": AbmProposal[] }
 *   { "abmCard": "explanation", "text": string, "evidence": AbmEvidence[], "speculative": boolean }
 */

import type {
  AbmAttributionContribution,
  AbmComparisonMetric,
  AbmEvidence,
  AbmProposal,
} from '../../types/chat'

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

export type AbmCard =
  | { kind: 'proposal_batch'; proposals: AbmProposal[] }
  | {
      kind: 'explanation'
      text: string
      evidence: AbmEvidence[]
      speculative: boolean
      runId?: string
      from?: number
      to?: number
    }
  | {
      kind: 'result_canvas'
      metrics: string[]
      action: 'show' | 'replace'
      runId?: string
      note?: string
    }
  | {
      kind: 'workbench'
      action: 'open' | 'close'
      view?: AbmWorkbenchView
      simId?: string
      runId?: string
      note?: string
    }
  | {
      kind: 'experiment_view'
      simId?: string
      view: AbmExperimentViewSpec
      note?: string
    }
  | {
      kind: 'attribution'
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
      contributions: AbmAttributionContribution[]
      note?: string
    }
  | {
      kind: 'counterfactual'
      baseRunId: string
      runId: string
      changed: Record<string, unknown>
      seed: number
      steps: number
      status: 'completed' | 'failed' | 'timeout'
      divergenceTick: number | null
      metrics: AbmComparisonMetric[]
      note?: string
    }

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Tool result content can arrive as a JSON string, an already-parsed object,
 * or an array of Anthropic content blocks ({ type:'text', text }). Reduce all
 * of those to a candidate record.
 */
function toCandidate(content: unknown): Record<string, unknown> | null {
  if (typeof content === 'string') {
    return safeParse(content)
  }
  if (Array.isArray(content)) {
    for (const block of content) {
      if (typeof block === 'string') {
        const parsed = safeParse(block)
        if (parsed) return parsed
      } else if (isRecord(block) && typeof block.text === 'string') {
        const parsed = safeParse(block.text)
        if (parsed) return parsed
      }
    }
    return null
  }
  if (isRecord(content)) return content
  return null
}

function safeParse(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{')) return null
  try {
    const parsed = JSON.parse(trimmed)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function readProposal(raw: unknown): AbmProposal | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null
  const proposal: AbmProposal = {
    id: raw.id,
    mechanismSummary: typeof raw.mechanismSummary === 'string' ? raw.mechanismSummary : '',
    keyParams: isRecord(raw.keyParams) ? raw.keyParams : {},
    expectedMacro: typeof raw.expectedMacro === 'string' ? raw.expectedMacro : '',
    oddExcerpt: typeof raw.oddExcerpt === 'string' ? raw.oddExcerpt : '',
  }
  if (
    isRecord(raw.trial) &&
    typeof raw.trial.runId === 'string' &&
    Array.isArray(raw.trial.sparkline)
  ) {
    proposal.trial = {
      runId: raw.trial.runId,
      sparkline: raw.trial.sparkline.filter((n): n is number => typeof n === 'number'),
    }
  }
  return proposal
}

function readEvidence(raw: unknown): AbmEvidence | null {
  if (!isRecord(raw) || typeof raw.tick !== 'number') return null
  const ev: AbmEvidence = { tick: raw.tick }
  if (typeof raw.metric === 'string') ev.metric = raw.metric
  if (typeof raw.value === 'number') ev.value = raw.value
  if (typeof raw.event === 'string') ev.event = raw.event
  if (typeof raw.mechanism_id === 'string') ev.mechanism_id = raw.mechanism_id
  return ev
}

const WORKBENCH_VIEWS = new Set<AbmWorkbenchView>(['run', 'results', 'agents', 'model', 'odd', 'simulations'])

function readWorkbenchView(raw: unknown): AbmWorkbenchView | undefined {
  return typeof raw === 'string' && WORKBENCH_VIEWS.has(raw as AbmWorkbenchView)
    ? (raw as AbmWorkbenchView)
    : undefined
}

function readExperimentChart(raw: unknown): AbmExperimentChartSpec | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.title !== 'string') return null
  const type = raw.type
  if (type !== 'line' && type !== 'multi_line' && type !== 'bar' && type !== 'scatter') return null
  const metrics = Array.isArray(raw.metrics)
    ? raw.metrics.filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
    : []
  if (metrics.length === 0) return null
  return {
    id: raw.id,
    title: raw.title,
    type,
    metrics,
    ...(raw.xAxis === 'tick' || raw.xAxis === 'parameter' ? { xAxis: raw.xAxis } : {}),
    ...(typeof raw.note === 'string' ? { note: raw.note } : {}),
  }
}

function readExperimentControl(raw: unknown): AbmExperimentControlSpec | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null
  const kind = raw.kind === 'slider' || raw.kind === 'input' || raw.kind === 'select' ? raw.kind : 'input'
  return {
    id: raw.id,
    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label : raw.id,
    kind,
    ...(typeof raw.min === 'number' ? { min: raw.min } : {}),
    ...(typeof raw.max === 'number' ? { max: raw.max } : {}),
    ...(typeof raw.step === 'number' ? { step: raw.step } : {}),
    ...(Array.isArray(raw.options)
      ? { options: raw.options.filter((o): o is string | number => typeof o === 'string' || typeof o === 'number') }
      : {}),
    ...(raw.value !== undefined && raw.value !== null ? { value: raw.value } : {}),
    ...(raw.role === 'sweep' || raw.role === 'fixed' ? { role: raw.role } : {}),
    ...(Array.isArray(raw.values)
      ? { values: raw.values.filter((v): v is number => typeof v === 'number') }
      : {}),
    ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readContribution(raw: unknown): AbmAttributionContribution | null {
  if (!isRecord(raw) || typeof raw.mechanism_id !== 'string') return null
  return {
    mechanism_id: raw.mechanism_id,
    gains: typeof raw.gains === 'number' ? raw.gains : 0,
    losses: typeof raw.losses === 'number' ? raw.losses : 0,
    net: typeof raw.net === 'number' ? raw.net : 0,
    agents: typeof raw.agents === 'number' ? raw.agents : 0,
  }
}

function readComparisonMetric(raw: unknown): AbmComparisonMetric | null {
  if (!isRecord(raw) || typeof raw.metric !== 'string') return null
  return {
    metric: raw.metric,
    baseFinal: numberOrNull(raw.baseFinal),
    otherFinal: numberOrNull(raw.otherFinal),
    finalDelta: numberOrNull(raw.finalDelta),
    maxAbsDelta: typeof raw.maxAbsDelta === 'number' ? raw.maxAbsDelta : 0,
    maxAbsDeltaTick: numberOrNull(raw.maxAbsDeltaTick),
  }
}

function readExperimentView(raw: unknown): AbmExperimentViewSpec | null {
  if (!isRecord(raw) || typeof raw.title !== 'string') return null
  const charts = Array.isArray(raw.charts)
    ? raw.charts.map(readExperimentChart).filter((c): c is AbmExperimentChartSpec => c !== null)
    : []
  const controls = Array.isArray(raw.controls)
    ? raw.controls.map(readExperimentControl).filter((c): c is AbmExperimentControlSpec => c !== null)
    : []
  if (charts.length === 0) return null
  const experiment = isRecord(raw.experiment)
    ? {
        ...(typeof raw.experiment.parameter === 'string' ? { parameter: raw.experiment.parameter } : {}),
        ...(Array.isArray(raw.experiment.values)
          ? { values: raw.experiment.values.filter((v): v is number => typeof v === 'number') }
          : {}),
        ...(typeof raw.experiment.replications === 'number' ? { replications: raw.experiment.replications } : {}),
        ...(typeof raw.experiment.steps === 'number' ? { steps: raw.experiment.steps } : {}),
      }
    : undefined
  return {
    title: raw.title,
    ...(typeof raw.intent === 'string' ? { intent: raw.intent } : {}),
    ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
    charts,
    controls,
    ...(experiment && Object.keys(experiment).length > 0 ? { experiment } : {}),
  }
}

export function parseAbmCard(content: unknown): AbmCard | null {
  const candidate = toCandidate(content)
  if (!candidate) return null

  switch (candidate.abmCard) {
    case 'proposal_batch': {
      if (!Array.isArray(candidate.proposals)) return null
      const proposals = candidate.proposals
        .map(readProposal)
        .filter((p): p is AbmProposal => p !== null)
      if (proposals.length === 0) return null
      return { kind: 'proposal_batch', proposals }
    }
    case 'explanation': {
      if (typeof candidate.text !== 'string') return null
      const evidence = Array.isArray(candidate.evidence)
        ? candidate.evidence.map(readEvidence).filter((e): e is AbmEvidence => e !== null)
        : []
      return {
        kind: 'explanation',
        text: candidate.text,
        evidence,
        speculative: candidate.speculative === true,
        ...(typeof candidate.runId === 'string' ? { runId: candidate.runId } : {}),
        ...(typeof candidate.from === 'number' ? { from: candidate.from } : {}),
        ...(typeof candidate.to === 'number' ? { to: candidate.to } : {}),
      }
    }
    case 'result_canvas': {
      if (!Array.isArray(candidate.metrics)) return null
      const metrics = candidate.metrics.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      if (metrics.length === 0) return null
      const action = candidate.action === 'replace' ? 'replace' : 'show'
      return {
        kind: 'result_canvas',
        metrics,
        action,
        ...(typeof candidate.runId === 'string' ? { runId: candidate.runId } : {}),
        ...(typeof candidate.note === 'string' ? { note: candidate.note } : {}),
      }
    }
    case 'workbench': {
      const action = candidate.action === 'close' ? 'close' : candidate.action === 'open' ? 'open' : null
      if (!action) return null
      return {
        kind: 'workbench',
        action,
        ...(readWorkbenchView(candidate.view) ? { view: readWorkbenchView(candidate.view)! } : {}),
        ...(typeof candidate.simId === 'string' ? { simId: candidate.simId } : {}),
        ...(typeof candidate.runId === 'string' ? { runId: candidate.runId } : {}),
        ...(typeof candidate.note === 'string' ? { note: candidate.note } : {}),
      }
    }
    case 'experiment_view': {
      const view = readExperimentView(candidate.view)
      if (!view) return null
      return {
        kind: 'experiment_view',
        view,
        ...(typeof candidate.simId === 'string' ? { simId: candidate.simId } : {}),
        ...(typeof candidate.note === 'string' ? { note: candidate.note } : {}),
      }
    }
    case 'attribution': {
      if (typeof candidate.runId !== 'string' || typeof candidate.metric !== 'string') return null
      const contributions = Array.isArray(candidate.contributions)
        ? candidate.contributions.map(readContribution).filter((c): c is AbmAttributionContribution => c !== null)
        : []
      return {
        kind: 'attribution',
        runId: candidate.runId,
        metric: candidate.metric,
        from: typeof candidate.from === 'number' ? candidate.from : 0,
        to: typeof candidate.to === 'number' ? candidate.to : 0,
        supported: candidate.supported === true,
        ...(typeof candidate.reason === 'string' ? { reason: candidate.reason } : {}),
        actualDelta: numberOrNull(candidate.actualDelta),
        attributedNet: typeof candidate.attributedNet === 'number' ? candidate.attributedNet : 0,
        residual: numberOrNull(candidate.residual),
        coverage: numberOrNull(candidate.coverage),
        contributions,
        ...(typeof candidate.note === 'string' ? { note: candidate.note } : {}),
      }
    }
    case 'counterfactual': {
      if (typeof candidate.baseRunId !== 'string' || typeof candidate.runId !== 'string') return null
      const status =
        candidate.status === 'completed' || candidate.status === 'failed' || candidate.status === 'timeout'
          ? candidate.status
          : 'failed'
      const metrics = Array.isArray(candidate.metrics)
        ? candidate.metrics.map(readComparisonMetric).filter((m): m is AbmComparisonMetric => m !== null)
        : []
      return {
        kind: 'counterfactual',
        baseRunId: candidate.baseRunId,
        runId: candidate.runId,
        changed: isRecord(candidate.changed) ? candidate.changed : {},
        seed: typeof candidate.seed === 'number' ? candidate.seed : 0,
        steps: typeof candidate.steps === 'number' ? candidate.steps : 0,
        status,
        divergenceTick: numberOrNull(candidate.divergenceTick),
        metrics,
        ...(typeof candidate.note === 'string' ? { note: candidate.note } : {}),
      }
    }
    default:
      return null
  }
}
