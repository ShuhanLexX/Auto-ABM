/**
 * Quantitative result explainability (EMNLP demo highlight) — three deterministic,
 * trace-grounded analyses. No LLM is involved anywhere in this module; the numbers
 * are computed from the real trace so explanations can cite them (constitution P2).
 *
 *   1. Mechanism activity: per-mechanism firing counts over time (heat overlay for
 *      the live mechanism graph).
 *   2. Mechanism attribution: decompose a macro metric's change over [from,to]
 *      into signed per-mechanism state-transition flows, with explicit coverage
 *      and residual (changes not caused by any mechanism, e.g. initialization).
 *   3. Changepoint detection: robust slope-change scan over tick metrics that
 *      surfaces the ticks most worth explaining.
 *
 * Pure assemblers are exported separately from the disk-reading wrappers so they
 * can be unit-tested without IO.
 */

import { resolveRunLocation, getSimulationById, getRunRecordById } from './abmStore.fs.js'
import { readModelConfig } from './modelConfigShape.js'
import { iterateTraceRecords, type TraceRecord } from './traceRead.js'
import { traceFile } from './storagePaths.js'
import type { ModelConfig } from './types.js'

// ---------------------------------------------------------------------------
// 1. Mechanism activity
// ---------------------------------------------------------------------------

export interface MechanismActivitySeriesPoint {
  /** Bucket start tick. */
  tick: number
  count: number
}

export interface MechanismActivity {
  mechanism_id: string
  /** Total state changes attributed to this mechanism in the window. */
  total: number
  /** Distinct agents this mechanism touched in the window. */
  agents: number
  firstTick: number | null
  lastTick: number | null
  series: MechanismActivitySeriesPoint[]
}

export interface MechanismActivityResult {
  runId: string
  from: number
  to: number
  bucketSize: number
  mechanisms: MechanismActivity[]
}

const MAX_ACTIVITY_BUCKETS = 120

interface ActivityAccumulator {
  total: number
  agents: Set<number>
  firstTick: number | null
  lastTick: number | null
  buckets: Map<number, number>
}

export function assembleMechanismActivity(params: {
  runId: string
  from: number
  to: number
  records: Iterable<TraceRecord>
}): MechanismActivityResult {
  const { runId, from } = params
  let maxTick = params.from
  const accs = new Map<string, ActivityAccumulator>()
  const pending: Array<{ tick: number; mechanismId: string; agentIds: number[] }> = []

  for (const record of params.records) {
    if (record.kind !== 'mechanism_fired') continue
    const tick = typeof record.tick === 'number' ? record.tick : undefined
    const mechanismId = typeof record.mechanism_id === 'string' ? record.mechanism_id : undefined
    if (tick === undefined || mechanismId === undefined) continue
    const agentIds = Array.isArray(record.agent_ids)
      ? record.agent_ids.filter((v): v is number => typeof v === 'number')
      : []
    if (tick > maxTick) maxTick = tick
    pending.push({ tick, mechanismId, agentIds })
  }

  const to = Number.isFinite(params.to) ? params.to : maxTick
  const span = Math.max(1, to - from + 1)
  const bucketSize = Math.max(1, Math.ceil(span / MAX_ACTIVITY_BUCKETS))

  for (const item of pending) {
    let acc = accs.get(item.mechanismId)
    if (!acc) {
      acc = { total: 0, agents: new Set(), firstTick: null, lastTick: null, buckets: new Map() }
      accs.set(item.mechanismId, acc)
    }
    acc.total += 1
    for (const id of item.agentIds) acc.agents.add(id)
    if (acc.firstTick === null || item.tick < acc.firstTick) acc.firstTick = item.tick
    if (acc.lastTick === null || item.tick > acc.lastTick) acc.lastTick = item.tick
    const bucket = from + Math.floor((item.tick - from) / bucketSize) * bucketSize
    acc.buckets.set(bucket, (acc.buckets.get(bucket) ?? 0) + 1)
  }

  const mechanisms = [...accs.entries()]
    .map(([mechanism_id, acc]) => ({
      mechanism_id,
      total: acc.total,
      agents: acc.agents.size,
      firstTick: acc.firstTick,
      lastTick: acc.lastTick,
      series: [...acc.buckets.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([tick, count]) => ({ tick, count })),
    }))
    .sort((a, b) => b.total - a.total)

  return { runId, from, to, bucketSize, mechanisms }
}

export async function buildMechanismActivity(
  runId: string,
  from = 0,
  to = Number.POSITIVE_INFINITY,
): Promise<MechanismActivityResult | null> {
  const location = await resolveRunLocation(runId)
  if (!location) return null
  const records = collect(
    iterateTraceRecords(traceFile(location.projectId, location.simId, runId), {
      from,
      to,
      kinds: new Set(['mechanism_fired']),
    }),
  )
  return assembleMechanismActivity({ runId, from, to, records: await records })
}

// ---------------------------------------------------------------------------
// 2. Mechanism attribution
// ---------------------------------------------------------------------------

export interface MetricMapping {
  stateKey: string
  mode: 'categorical' | 'numeric'
  /** The categorical choice the observer counts (mode=categorical). */
  value?: string
}

export interface MechanismContribution {
  mechanism_id: string
  /** Transitions into the observed value / positive numeric flow. */
  gains: number
  /** Transitions out of the observed value / negative flow magnitude. */
  losses: number
  net: number
  /** Distinct agents involved in the attributed transitions. */
  agents: number
}

export interface AttributionResult {
  runId: string
  metric: string
  from: number
  to: number
  supported: boolean
  reason?: string
  mapping?: MetricMapping
  metricStart: number | null
  metricEnd: number | null
  actualDelta: number | null
  attributedNet: number
  /** actualDelta - attributedNet: changes not caused by any mechanism. */
  residual: number | null
  /** Fraction of |actualDelta| explained by mechanisms (null when delta = 0). */
  coverage: number | null
  contributions: MechanismContribution[]
}

/**
 * Map an observer id to the state variable + value it observes, using the same
 * literal-match rule as the kernel's mechanism graph (`observed` edges): the
 * observer id/name equals a categorical choice, or equals a numeric state name.
 */
export function mapObserverToState(config: ModelConfig, metric: string): MetricMapping | null {
  const shape = readModelConfig(config)
  const observer = shape.observers.find((o) => o.id === metric || o.name === metric)
  const tokens = observer ? [observer.id, observer.name].filter(Boolean) : [metric]

  for (const agent of shape.agents) {
    for (const sv of agent.stateVariables) {
      for (const token of tokens) {
        if (sv.choices && sv.choices.includes(token)) {
          return { stateKey: sv.name, mode: 'categorical', value: token }
        }
      }
    }
  }
  for (const agent of shape.agents) {
    for (const sv of agent.stateVariables) {
      for (const token of tokens) {
        if (sv.name === token && (sv.dtype === 'int' || sv.dtype === 'float' || sv.dtype === 'bool')) {
          return { stateKey: sv.name, mode: 'numeric' }
        }
      }
    }
  }
  return null
}

interface ContributionAccumulator {
  gains: number
  losses: number
  agents: Set<number>
}

export function assembleAttribution(params: {
  runId: string
  metric: string
  from: number
  to: number
  mapping: MetricMapping | null
  records: Iterable<TraceRecord>
}): AttributionResult {
  const { runId, metric, from, to, mapping } = params

  // Metric anchor points from tick_metrics: effective window is
  // [first point >= from, last point <= to]; transitions count in (start, end].
  let metricStart: { tick: number; value: number } | null = null
  let metricEnd: { tick: number; value: number } | null = null
  const transitions: Array<{
    tick: number
    mechanismId: string
    old: unknown
    next: unknown
    agentIds: number[]
  }> = []
  let firedCount = 0

  for (const record of params.records) {
    const tick = typeof record.tick === 'number' ? record.tick : undefined
    if (tick === undefined) continue
    if (record.kind === 'tick_metrics') {
      const metrics = record.metrics
      const value =
        metrics && typeof metrics === 'object' && !Array.isArray(metrics)
          ? (metrics as Record<string, unknown>)[metric]
          : undefined
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      if (!metricStart || tick < metricStart.tick) {
        if (!metricStart) metricStart = { tick, value }
        else if (tick < metricStart.tick) metricStart = { tick, value }
      }
      if (!metricEnd || tick > metricEnd.tick) metricEnd = { tick, value }
      continue
    }
    if (record.kind !== 'mechanism_fired') continue
    const mechanismId = typeof record.mechanism_id === 'string' ? record.mechanism_id : undefined
    if (mechanismId === undefined) continue
    firedCount += 1
    if (typeof record.key !== 'string') continue
    if (!mapping || record.key !== mapping.stateKey) continue
    transitions.push({
      tick,
      mechanismId,
      old: record.old,
      next: record.new,
      agentIds: Array.isArray(record.agent_ids)
        ? record.agent_ids.filter((v): v is number => typeof v === 'number')
        : [],
    })
  }

  const base: Omit<
    AttributionResult,
    'supported' | 'reason' | 'attributedNet' | 'residual' | 'coverage' | 'contributions'
  > = {
    runId,
    metric,
    // Echo the *effective* window (real metric anchor ticks) so unbounded
    // requests still report a finite, truthful interval.
    from: metricStart?.tick ?? from,
    to: metricEnd?.tick ?? (Number.isFinite(to) ? to : from),
    ...(mapping ? { mapping } : {}),
    metricStart: metricStart?.value ?? null,
    metricEnd: metricEnd?.value ?? null,
    actualDelta:
      metricStart && metricEnd && metricEnd.tick > metricStart.tick
        ? metricEnd.value - metricStart.value
        : null,
  }

  if (!mapping) {
    return {
      ...base,
      supported: false,
      reason: `观测指标 ${metric} 无法映射到任何智能体状态变量，无法做机制归因`,
      attributedNet: 0,
      residual: null,
      coverage: null,
      contributions: [],
    }
  }
  if (firedCount > 0 && transitions.length === 0) {
    return {
      ...base,
      supported: false,
      reason: '该 Run 的 Trace 缺少状态转移字段（由旧版内核生成），请重新运行后再归因',
      attributedNet: 0,
      residual: null,
      coverage: null,
      contributions: [],
    }
  }

  const startTick = metricStart?.tick ?? from
  const endTick = metricEnd?.tick ?? to
  const accs = new Map<string, ContributionAccumulator>()
  for (const t of transitions) {
    if (t.tick <= startTick || t.tick > endTick) continue
    let acc = accs.get(t.mechanismId)
    if (!acc) {
      acc = { gains: 0, losses: 0, agents: new Set() }
      accs.set(t.mechanismId, acc)
    }
    if (mapping.mode === 'categorical') {
      if (t.next === mapping.value && t.old !== mapping.value) acc.gains += 1
      else if (t.old === mapping.value && t.next !== mapping.value) acc.losses += 1
      else continue
    } else {
      const oldNum = typeof t.old === 'number' ? t.old : Number(t.old)
      const newNum = typeof t.next === 'number' ? t.next : Number(t.next)
      if (!Number.isFinite(oldNum) || !Number.isFinite(newNum) || newNum === oldNum) continue
      const delta = newNum - oldNum
      if (delta > 0) acc.gains += delta
      else acc.losses += -delta
    }
    for (const id of t.agentIds) acc.agents.add(id)
  }

  const contributions = [...accs.entries()]
    .map(([mechanism_id, acc]) => ({
      mechanism_id,
      gains: acc.gains,
      losses: acc.losses,
      net: acc.gains - acc.losses,
      agents: acc.agents.size,
    }))
    .filter((c) => c.gains !== 0 || c.losses !== 0)
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || b.gains - a.gains)

  const attributedNet = contributions.reduce((sum, c) => sum + c.net, 0)
  const actualDelta = base.actualDelta
  const residual = actualDelta !== null ? actualDelta - attributedNet : null
  const coverage =
    actualDelta !== null && actualDelta !== 0
      ? Math.min(1, Math.abs(attributedNet) / Math.abs(actualDelta))
      : null

  return {
    ...base,
    supported: true,
    attributedNet,
    residual,
    coverage,
    contributions,
  }
}

export async function buildAttribution(
  runId: string,
  metric: string,
  from = 0,
  to = Number.POSITIVE_INFINITY,
): Promise<AttributionResult | null> {
  const location = await resolveRunLocation(runId)
  if (!location) return null
  const simulation = await getSimulationById(location.simId)
  const mapping = simulation ? mapObserverToState(simulation.config as ModelConfig, metric) : null
  const records = await collect(
    iterateTraceRecords(traceFile(location.projectId, location.simId, runId), {
      from,
      to,
      kinds: new Set(['tick_metrics', 'mechanism_fired']),
    }),
  )
  return assembleAttribution({ runId, metric, from, to, mapping, records })
}

// ---------------------------------------------------------------------------
// 3. Changepoint detection
// ---------------------------------------------------------------------------

export interface Changepoint {
  metric: string
  tick: number
  /** Robust z-score of the slope change (larger = more salient). */
  score: number
  beforeSlope: number
  afterSlope: number
  direction: 'accelerate' | 'decelerate' | 'reversal'
}

export interface ChangepointResult {
  runId: string
  changepoints: Changepoint[]
}

const CHANGEPOINT_Z_THRESHOLD = 3
const MAX_CHANGEPOINTS_PER_METRIC = 3

/**
 * Deterministic slope-change scan: windowed slopes before/after each tick,
 * scored by a MAD-normalized second difference, greedy non-maximum suppression.
 */
export function detectChangepoints(
  metric: string,
  series: Array<{ tick: number; value: number }>,
): Changepoint[] {
  const points = [...series].sort((a, b) => a.tick - b.tick)
  const n = points.length
  if (n < 7) return []
  const w = Math.max(2, Math.min(8, Math.floor(n / 12)))

  const candidates: Array<Omit<Changepoint, 'direction'> & { index: number }> = []
  const diffs: number[] = []
  for (let i = w; i < n - w; i++) {
    const before = (points[i]!.value - points[i - w]!.value) / w
    const after = (points[i + w]!.value - points[i]!.value) / w
    diffs.push(Math.abs(after - before))
    candidates.push({
      metric,
      index: i,
      tick: points[i]!.tick,
      score: 0,
      beforeSlope: before,
      afterSlope: after,
    })
  }
  if (candidates.length === 0) return []

  const sortedAbs = [...diffs].sort((a, b) => a - b)
  const median = sortedAbs[Math.floor(sortedAbs.length / 2)]!
  const deviations = diffs.map((d) => Math.abs(d - median)).sort((a, b) => a - b)
  const mad = deviations[Math.floor(deviations.length / 2)]!
  const meanAbs = diffs.reduce((s, d) => s + d, 0) / diffs.length
  const scale = Math.max(mad * 1.4826, meanAbs * 0.25, 1e-9)

  for (const c of candidates) {
    c.score = Math.abs(c.afterSlope - c.beforeSlope) / scale
  }

  const picked: typeof candidates = []
  for (const c of [...candidates].sort((a, b) => b.score - a.score)) {
    if (c.score < CHANGEPOINT_Z_THRESHOLD) break
    if (picked.some((p) => Math.abs(p.index - c.index) < w * 2)) continue
    picked.push(c)
    if (picked.length >= MAX_CHANGEPOINTS_PER_METRIC) break
  }

  return picked
    .sort((a, b) => a.tick - b.tick)
    .map(({ index: _index, ...c }) => ({
      ...c,
      direction:
        Math.sign(c.beforeSlope) !== 0 &&
        Math.sign(c.afterSlope) !== 0 &&
        Math.sign(c.beforeSlope) !== Math.sign(c.afterSlope)
          ? 'reversal'
          : Math.abs(c.afterSlope) > Math.abs(c.beforeSlope)
            ? 'accelerate'
            : 'decelerate',
    }))
}

export async function buildChangepoints(
  runId: string,
  metric?: string,
): Promise<ChangepointResult | null> {
  const location = await resolveRunLocation(runId)
  if (!location) return null

  const series = new Map<string, Array<{ tick: number; value: number }>>()
  for await (const record of iterateTraceRecords(
    traceFile(location.projectId, location.simId, runId),
    { kinds: new Set(['tick_metrics']) },
  )) {
    const tick = typeof record.tick === 'number' ? record.tick : undefined
    if (tick === undefined) continue
    const metrics = record.metrics
    if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) continue
    for (const [key, value] of Object.entries(metrics as Record<string, unknown>)) {
      if (metric && key !== metric) continue
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      let list = series.get(key)
      if (!list) {
        list = []
        series.set(key, list)
      }
      list.push({ tick, value })
    }
  }

  const changepoints: Changepoint[] = []
  for (const [key, list] of series) {
    changepoints.push(...detectChangepoints(key, list))
  }
  changepoints.sort((a, b) => a.tick - b.tick || a.metric.localeCompare(b.metric))
  return { runId, changepoints }
}

// ---------------------------------------------------------------------------

/** Small helper: run status lookup used by the counterfactual tool as well. */
export async function isRunCompleted(runId: string): Promise<boolean> {
  const record = await getRunRecordById(runId)
  return record?.status === 'completed'
}

async function collect(gen: AsyncGenerator<TraceRecord>): Promise<TraceRecord[]> {
  const out: TraceRecord[] = []
  for await (const record of gen) out.push(record)
  return out
}
