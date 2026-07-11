/**
 * Evidence-grounded explanation context — P2 Task 2
 * (docs/ai/impl/plans/P2-conversation-explain.md, conversation-ux.md §4).
 *
 * Truthfulness is a product red line: an explanation may ONLY cite trace facts
 * that actually exist in the run. This module:
 *   1. buildExplainContext: reads the real trace slice [from,to] for a run plus
 *      the model's ODD references, and hands that to the agent-loop as the ONLY
 *      grounding the LLM is allowed to use.
 *   2. validateEvidence: after the LLM returns citations, every citation is
 *      checked against the context; out-of-range ticks, unknown metrics/events/
 *      mechanisms, or fabricated values are rejected (caller downgrades them to
 *      "speculative" or drops them).
 */

import { resolveRunLocation, getSimulationById } from './abmStore.fs.js'
import { deriveOdd, oddSectionTitle, type OddSectionKey } from './oddService.js'
import { readTraceRecords, type TraceRecord } from './traceRead.js'
import { traceFile } from './storagePaths.js'
import { sideQuery } from '../../utils/sideQuery.js'
import { getMainLoopModel } from '../../utils/model/model.js'

export interface Evidence {
  tick: number
  metric?: string
  value?: number
  event?: string
  mechanism_id?: string
}

export interface MetricsPoint {
  tick: number
  metrics: Record<string, number>
}

export interface EventPoint {
  tick: number
  name: string
}

export interface MechanismPoint {
  tick: number
  mechanism_id: string
  agent_ids?: number[]
}

export interface OddRef {
  section: string
  text: string
}

export interface ExplainContext {
  runId: string
  from: number
  to: number
  metrics: MetricsPoint[]
  events: EventPoint[]
  mechanisms: MechanismPoint[]
  oddRefs: OddRef[]
}

export interface MiniExplainRequest {
  runId?: string
  from?: number
  to?: number
  tick?: number
  locale?: string
  target?: Record<string, unknown>
  question?: string
  localSummary?: string
}

export interface MiniExplainResponse {
  text: string
  source: 'model' | 'fallback'
  runId?: string
  from?: number
  to?: number
  error?: string
}

/** Trace kinds the explanation grounding needs (keeps the read lean). */
export const EXPLAIN_TRACE_KINDS = new Set(['tick_metrics', 'event', 'mechanism_fired'])

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asNumberMap(value: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) {
      const n = asNumber(v)
      if (n !== undefined) out[k] = n
    }
  }
  return out
}

/**
 * Pure assembler: turn already-read trace records + ODD refs into an
 * ExplainContext. Split out so it can be unit-tested without disk IO.
 */
export function assembleExplainContext(params: {
  runId: string
  from: number
  to: number
  records: TraceRecord[]
  oddRefs: OddRef[]
}): ExplainContext {
  const metrics: MetricsPoint[] = []
  const events: EventPoint[] = []
  const mechanisms: MechanismPoint[] = []

  for (const record of params.records) {
    const tick = asNumber(record.tick)
    if (tick === undefined) continue
    switch (record.kind) {
      case 'tick_metrics':
        metrics.push({ tick, metrics: asNumberMap(record.metrics) })
        break
      case 'event':
        if (typeof record.name === 'string') events.push({ tick, name: record.name })
        break
      case 'mechanism_fired':
        if (typeof record.mechanism_id === 'string') {
          const agentIds = Array.isArray(record.agent_ids)
            ? (record.agent_ids.filter((v) => typeof v === 'number') as number[])
            : undefined
          mechanisms.push({
            tick,
            mechanism_id: record.mechanism_id,
            ...(agentIds && agentIds.length ? { agent_ids: agentIds } : {}),
          })
        }
        break
    }
  }

  return {
    runId: params.runId,
    from: params.from,
    to: params.to,
    metrics,
    events,
    mechanisms,
    oddRefs: params.oddRefs,
  }
}

/**
 * Read the real trace slice for a run plus its model's ODD references, and
 * assemble the grounding context. Returns null when the run is unknown.
 */
export async function buildExplainContext(
  runId: string,
  from: number,
  to: number,
  locale?: string,
): Promise<ExplainContext | null> {
  const location = await resolveRunLocation(runId)
  if (!location) return null

  const { records } = await readTraceRecords(traceFile(location.projectId, location.simId, runId), {
    from,
    to,
    kinds: EXPLAIN_TRACE_KINDS,
  })

  const oddRefs = await buildOddRefs(location.simId, locale)

  return assembleExplainContext({ runId, from, to, records, oddRefs })
}

export async function askMiniExplain(request: MiniExplainRequest): Promise<MiniExplainResponse> {
  const range = normalizeMiniRange(request)
  const context = request.runId
    ? await buildExplainContext(request.runId, range.from, range.to, request.locale)
    : null
  const locale = request.locale
  const fallbackText = buildFallbackMiniText(request, context, range, locale)
  if (!context && !request.target && !request.localSummary && !request.question) {
    return {
      text: fallbackText,
      source: 'fallback',
      ...(request.runId ? { runId: request.runId } : {}),
      from: range.from,
      to: range.to,
    }
  }

  try {
    const hasTraceContext = Boolean(context)
    const response = await sideQuery({
      model: getMainLoopModel(),
      querySource: 'abm_mini_explain' as never,
      max_tokens: 900,
      temperature: 0.2,
      skipSystemPromptPrefix: true,
      system: [
        'You are AutoABM local explanation assistant for ABM social-science research.',
        `Reply language: ${isChineseMiniLocale(locale) ? 'Chinese' : 'English'}. Use this language for all prose unless the user question is clearly in another language.`,
        'Answer only from the supplied selected object, local UI summary, Trace metrics, mechanism firings, and ODD references.',
        'Do not invent unseen values, mechanisms, runs, or causal effects.',
        hasTraceContext
          ? 'Keep the answer short for a floating popover and cite concrete ticks, metric changes, or mechanism ids when available.'
          : 'No Trace context is available. Explain only the selected object/model structure and explicitly state that run-level evidence is not available.',
      ].join('\n'),
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            question: request.question || 'Explain what this object or interval means and how it may connect to macro outcomes.',
            target: request.target ?? {},
            localSummary: request.localSummary ?? '',
            context,
          }),
        },
      ],
    })
    const text = extractSideQueryText(response).trim()
    return {
      text: text || fallbackText,
      source: text ? 'model' : 'fallback',
      ...(request.runId ? { runId: request.runId } : {}),
      from: range.from,
      to: range.to,
    }
  } catch (error) {
    return {
      text: fallbackText,
      source: 'fallback',
      ...(request.runId ? { runId: request.runId } : {}),
      from: range.from,
      to: range.to,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function normalizeMiniRange(request: MiniExplainRequest): { from: number; to: number } {
  const explicitFrom = typeof request.from === 'number' && Number.isFinite(request.from) ? request.from : undefined
  const explicitTo = typeof request.to === 'number' && Number.isFinite(request.to) ? request.to : undefined
  if (explicitFrom !== undefined || explicitTo !== undefined) {
    const from = Math.max(0, explicitFrom ?? explicitTo ?? 0)
    const to = Math.max(from, explicitTo ?? explicitFrom ?? from)
    return { from, to }
  }
  const tick = typeof request.tick === 'number' && Number.isFinite(request.tick) ? request.tick : 0
  return { from: Math.max(0, tick - 3), to: Math.max(0, tick + 3) }
}

function isChineseMiniLocale(locale: string | undefined): boolean {
  return /^zh(?:-|$)/i.test(locale ?? '')
}

function buildFallbackMiniText(
  request: MiniExplainRequest,
  context: ExplainContext | null,
  range: { from: number; to: number },
  locale?: string,
): string {
  const chinese = isChineseMiniLocale(locale)
  if (!context) {
    if (request.runId) {
      return chinese
        ? `没有找到 run ${request.runId} 的 Trace 证据，无法做模型解释。`
        : `No Trace evidence was found for run ${request.runId}, so this window cannot provide a model-grounded explanation.`
    }
    return chinese
      ? '当前对象没有绑定运行结果；请先运行仿真，再用小窗查看证据解释。'
      : 'This object is not bound to a run yet. Run the simulation first, then use this window for evidence-grounded explanation.'
  }
  const metrics = summarizeMiniMetrics(context)
  const mechanisms = context.mechanisms
    .slice(0, 4)
    .map((item) => chinese ? `tick ${item.tick} 触发 ${item.mechanism_id}` : `tick ${item.tick}: ${item.mechanism_id} fired`)
  const target = request.target ? (chinese ? `对象：${safeJson(request.target)}。` : `Object: ${safeJson(request.target)}. `) : ''
  const evidence = [
    metrics ? (chinese ? `指标：${metrics}` : `Metrics: ${metrics}`) : null,
    mechanisms.length ? (chinese ? `机制：${mechanisms.join('；')}` : `Mechanisms: ${mechanisms.join('; ')}`) : null,
  ].filter(Boolean).join(chinese ? ' ' : '. ')
  const noEvidence = chinese
    ? '该区间没有读取到可用指标或机制证据。'
    : 'No usable metric or mechanism evidence was read in this interval.'
  return chinese
    ? `${target}区间 tick ${range.from}-${range.to}。${evidence || noEvidence}`
    : `${target}Interval tick ${range.from}-${range.to}. ${evidence || noEvidence}`
}

function summarizeMiniMetrics(context: ExplainContext): string {
  const ordered = [...context.metrics].sort((a, b) => a.tick - b.tick)
  if (ordered.length === 0) return ''
  const first = ordered[0]!
  const last = ordered.at(-1)!
  return Object.entries(last.metrics)
    .filter(([, value]) => Number.isFinite(value))
    .slice(0, 5)
    .map(([key, value]) => {
      const before = first.metrics[key]
      const delta = typeof before === 'number' ? value - before : 0
      return `${key} ${formatMiniNumber(before ?? value)}→${formatMiniNumber(value)}${Math.abs(delta) > 1e-9 ? ` (${delta > 0 ? '+' : ''}${formatMiniNumber(delta)})` : ''}`
    })
    .join('；')
}

function extractSideQueryText(response: { content?: Array<{ type?: string; text?: string }> }): string {
  return (response.content ?? [])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function formatMiniNumber(value: number): string {
  if (Number.isInteger(value)) return String(value)
  if (Math.abs(value) >= 100) return value.toFixed(1)
  if (Math.abs(value) >= 1) return value.toFixed(2)
  return value.toFixed(3)
}

async function buildOddRefs(simId: string, locale?: string): Promise<OddRef[]> {
  const simulation = await getSimulationById(simId)
  if (!simulation) return []
  const odd = deriveOdd(simulation.config, locale)
  return (Object.keys(odd.sections) as OddSectionKey[]).map((key) => ({
    section: oddSectionTitle(key, locale),
    text: odd.sections[key].text,
  }))
}

const VALUE_TOLERANCE = 1e-6

export interface EvidenceValidation {
  ok: Evidence[]
  rejected: Evidence[]
}

/**
 * Reject any citation not backed by the context:
 *   - tick outside [from,to]
 *   - metric not present at that tick (or a fabricated value)
 *   - event name not fired at that tick
 *   - mechanism_id not fired at that tick
 *   - bare tick with no record at all in the window
 */
export function validateEvidence(ctx: ExplainContext, evidence: Evidence[]): EvidenceValidation {
  const ok: Evidence[] = []
  const rejected: Evidence[] = []

  const metricsByTick = new Map<number, Record<string, number>>()
  for (const m of ctx.metrics) metricsByTick.set(m.tick, m.metrics)
  const eventsByTick = new Map<number, Set<string>>()
  for (const e of ctx.events) {
    if (!eventsByTick.has(e.tick)) eventsByTick.set(e.tick, new Set())
    eventsByTick.get(e.tick)!.add(e.name)
  }
  const mechByTick = new Map<number, Set<string>>()
  for (const m of ctx.mechanisms) {
    if (!mechByTick.has(m.tick)) mechByTick.set(m.tick, new Set())
    mechByTick.get(m.tick)!.add(m.mechanism_id)
  }

  for (const ev of evidence) {
    if (!isGrounded(ev, ctx, metricsByTick, eventsByTick, mechByTick)) {
      rejected.push(ev)
    } else {
      ok.push(ev)
    }
  }

  return { ok, rejected }
}

function isGrounded(
  ev: Evidence,
  ctx: ExplainContext,
  metricsByTick: Map<number, Record<string, number>>,
  eventsByTick: Map<number, Set<string>>,
  mechByTick: Map<number, Set<string>>,
): boolean {
  if (typeof ev.tick !== 'number' || ev.tick < ctx.from || ev.tick > ctx.to) return false

  if (ev.metric !== undefined) {
    const point = metricsByTick.get(ev.tick)
    if (!point || !(ev.metric in point)) return false
    if (ev.value !== undefined && Math.abs(point[ev.metric] - ev.value) > VALUE_TOLERANCE) return false
    return true
  }

  if (ev.event !== undefined) {
    return eventsByTick.get(ev.tick)?.has(ev.event) ?? false
  }

  if (ev.mechanism_id !== undefined) {
    return mechByTick.get(ev.tick)?.has(ev.mechanism_id) ?? false
  }

  // Bare tick reference: require some record to exist at that tick.
  return metricsByTick.has(ev.tick) || eventsByTick.has(ev.tick) || mechByTick.has(ev.tick)
}
