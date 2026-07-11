import { api } from '../../api/client'

export interface TraceRecord {
  kind: string
  tick?: number
  [key: string]: unknown
}

export interface TraceResponse {
  runId: string
  records: TraceRecord[]
  truncated: boolean
}

export interface TraceRangeOptions {
  from?: number
  to?: number
  kinds?: string[]
}

export interface ExplainMetricPoint {
  tick: number
  metrics: Record<string, number>
}

export interface ExplainEventPoint {
  tick: number
  name: string
}

export interface ExplainMechanismPoint {
  tick: number
  mechanism_id: string
  agent_ids?: number[]
}

export interface ExplainOddRef {
  section: string
  text: string
}

export interface ExplainContext {
  runId: string
  from: number
  to: number
  metrics: ExplainMetricPoint[]
  events: ExplainEventPoint[]
  mechanisms: ExplainMechanismPoint[]
  oddRefs: ExplainOddRef[]
}

export interface MiniExplainRequest {
  runId?: string | null
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

function tracePath(runId: string, params: URLSearchParams): string {
  return `/api/abm/runs/${encodeURIComponent(runId)}/trace?${params.toString()}`
}

function explainPath(runId: string, params: URLSearchParams): string {
  return `/api/abm/runs/${encodeURIComponent(runId)}/explain?${params.toString()}`
}

export const traceClient = {
  /** Lightweight records (metrics/events/mechanisms) for timeline markers. */
  fetchRange: (runId: string, options: TraceRangeOptions = {}): Promise<TraceResponse> => {
    const params = new URLSearchParams()
    if (options.from !== undefined) params.set('from', String(options.from))
    if (options.to !== undefined) params.set('to', String(options.to))
    if (options.kinds?.length) params.set('kinds', options.kinds.join(','))
    return api.get<TraceResponse>(tracePath(runId, params))
  },

  /** The single nearest space_snapshot with tick <= the seek tick (replay). */
  fetchNearestSnapshot: (runId: string, tick: number): Promise<TraceResponse> => {
    const params = new URLSearchParams({ at: String(tick), kinds: 'space_snapshot' })
    return api.get<TraceResponse>(tracePath(runId, params))
  },

  fetchExplainContext: (runId: string, from: number, to: number, locale?: string): Promise<ExplainContext> => {
    const params = new URLSearchParams({ from: String(Math.max(0, from)), to: String(Math.max(from, to)) })
    if (locale) params.set('locale', locale)
    return api.get<ExplainContext>(explainPath(runId, params))
  },

  askMiniExplain: (body: MiniExplainRequest): Promise<MiniExplainResponse> =>
    api.post<MiniExplainResponse>('/api/abm/explain/mini', body),
}
