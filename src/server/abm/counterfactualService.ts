/**
 * Counterfactual replay (core-requirements §5.3 反事实追问) — deterministic
 * "what if" runs and trajectory comparison.
 *
 * A counterfactual run re-executes the *same* model version with the *same*
 * seed and steps as a completed base run, changing only the requested
 * parameters. Because the kernel is deterministic, any trajectory divergence
 * is caused by the parameter change alone — the comparison below finds the
 * first divergence tick and per-metric deltas from the two real traces, so
 * explanations cite computed facts instead of narrating from memory.
 */

import { randomUUID } from 'node:crypto'
import { getRunRecordById, getSimulationById, resolveRunLocation } from './abmStore.fs.js'
import { abmRunService } from './abmRunService.js'
import { normalizeModelConfigForKernel } from './modelConfigNormalize.js'
import { iterateTraceRecords } from './traceRead.js'
import { traceFile } from './storagePaths.js'
import type { ModelConfig } from './types.js'

export class CounterfactualError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'NOT_COMPLETED' | 'VERSION_MISMATCH' | 'NO_CHANGE',
  ) {
    super(message)
    this.name = 'CounterfactualError'
  }
}

export interface CounterfactualStart {
  runId: string
  baseRunId: string
  simId: string
  seed: number
  steps: number
  parameters: Record<string, unknown>
  changed: Record<string, unknown>
}

/**
 * Start a counterfactual run for a completed base run. Only `params` may vary;
 * seed/steps/model version are pinned to the base run so the comparison is a
 * true ceteris-paribus replay. Throws CounterfactualError on contract violations.
 */
export async function startCounterfactualRun(options: {
  baseRunId: string
  params: Record<string, unknown>
  seed?: number
  steps?: number
}): Promise<CounterfactualStart> {
  const { baseRunId, params } = options
  if (!params || Object.keys(params).length === 0) {
    throw new CounterfactualError('反事实运行需要至少改变一个参数', 'NO_CHANGE')
  }

  const location = await resolveRunLocation(baseRunId)
  const base = await getRunRecordById(baseRunId)
  if (!location || !base) {
    throw new CounterfactualError(`Run not found: ${baseRunId}`, 'NOT_FOUND')
  }
  if (base.status !== 'completed') {
    throw new CounterfactualError('基准 Run 尚未完成，无法做反事实对照', 'NOT_COMPLETED')
  }
  const simulation = await getSimulationById(location.simId)
  if (!simulation) {
    throw new CounterfactualError(`Simulation not found: ${location.simId}`, 'NOT_FOUND')
  }
  if (simulation.modelVersion && base.model_version && simulation.modelVersion !== base.model_version) {
    throw new CounterfactualError(
      `模型已从 v${base.model_version} 演进到 v${simulation.modelVersion}，严格反事实需要相同模型版本；请先重跑基准 Run`,
      'VERSION_MISMATCH',
    )
  }

  const merged = { ...base.parameters, ...params }
  const seed = options.seed ?? base.seed
  const steps = options.steps ?? base.steps
  const runId = randomUUID()

  await abmRunService.startRun({
    projectId: location.projectId,
    simId: location.simId,
    runId,
    config: normalizeModelConfigForKernel(simulation.config as ModelConfig),
    seed,
    steps,
    params: merged,
    spaceSampleRate: 1,
  })

  return {
    runId,
    baseRunId,
    simId: location.simId,
    seed,
    steps,
    parameters: merged,
    changed: params,
  }
}

export interface MetricComparison {
  metric: string
  baseFinal: number | null
  otherFinal: number | null
  finalDelta: number | null
  maxAbsDelta: number
  maxAbsDeltaTick: number | null
}

export interface RunComparison {
  baseRunId: string
  otherRunId: string
  /** First tick where any shared metric differs (null = trajectories identical). */
  divergenceTick: number | null
  ticksCompared: number
  metrics: MetricComparison[]
}

const DIVERGENCE_EPSILON = 1e-9

async function readMetricSeries(
  runId: string,
): Promise<Map<number, Record<string, number>> | null> {
  const location = await resolveRunLocation(runId)
  if (!location) return null
  const byTick = new Map<number, Record<string, number>>()
  for await (const record of iterateTraceRecords(
    traceFile(location.projectId, location.simId, runId),
    { kinds: new Set(['tick_metrics']) },
  )) {
    const tick = typeof record.tick === 'number' ? record.tick : undefined
    const metrics = record.metrics
    if (tick === undefined || !metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
      continue
    }
    const clean: Record<string, number> = {}
    for (const [key, value] of Object.entries(metrics as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) clean[key] = value
    }
    byTick.set(tick, clean)
  }
  return byTick.size > 0 ? byTick : null
}

/** Compare two runs' real metric trajectories tick by tick. */
export async function compareRuns(
  baseRunId: string,
  otherRunId: string,
): Promise<RunComparison | null> {
  const [base, other] = await Promise.all([
    readMetricSeries(baseRunId),
    readMetricSeries(otherRunId),
  ])
  if (!base || !other) return null

  const sharedTicks = [...base.keys()].filter((tick) => other.has(tick)).sort((a, b) => a - b)
  const sharedMetrics = new Set<string>()
  const firstBase = base.get(sharedTicks[0] ?? 0)
  if (firstBase) {
    for (const key of Object.keys(firstBase)) {
      if (other.get(sharedTicks[0] ?? 0)?.[key] !== undefined) sharedMetrics.add(key)
    }
  }

  let divergenceTick: number | null = null
  const stats = new Map<string, { maxAbs: number; maxTick: number | null }>()
  for (const metric of sharedMetrics) stats.set(metric, { maxAbs: 0, maxTick: null })

  for (const tick of sharedTicks) {
    const b = base.get(tick)!
    const o = other.get(tick)!
    for (const metric of sharedMetrics) {
      const bv = b[metric]
      const ov = o[metric]
      if (bv === undefined || ov === undefined) continue
      const diff = Math.abs(ov - bv)
      if (diff > DIVERGENCE_EPSILON && divergenceTick === null) divergenceTick = tick
      const s = stats.get(metric)!
      if (diff > s.maxAbs) {
        s.maxAbs = diff
        s.maxTick = tick
      }
    }
  }

  const lastTick = sharedTicks.at(-1)
  const metrics: MetricComparison[] = [...sharedMetrics].sort().map((metric) => {
    const baseFinal = lastTick !== undefined ? (base.get(lastTick)?.[metric] ?? null) : null
    const otherFinal = lastTick !== undefined ? (other.get(lastTick)?.[metric] ?? null) : null
    const s = stats.get(metric)!
    return {
      metric,
      baseFinal,
      otherFinal,
      finalDelta: baseFinal !== null && otherFinal !== null ? otherFinal - baseFinal : null,
      maxAbsDelta: s.maxAbs,
      maxAbsDeltaTick: s.maxTick,
    }
  })

  return {
    baseRunId,
    otherRunId,
    divergenceTick,
    ticksCompared: sharedTicks.length,
    metrics,
  }
}

/**
 * Poll until a run reaches a terminal state (used by the agent tool so the
 * model can report real comparison numbers in one tool call).
 */
export async function waitForRunTerminal(
  runId: string,
  timeoutMs = 120_000,
  pollMs = 400,
): Promise<'completed' | 'failed' | 'timeout'> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const record = await getRunRecordById(runId)
    if (record?.status === 'completed') return 'completed'
    if (record?.status === 'failed') return 'failed'
    if (Date.now() > deadline) return 'timeout'
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
}
