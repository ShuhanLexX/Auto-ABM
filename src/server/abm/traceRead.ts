/**
 * Interval reader over a kernel trace file (trace.py: line-delimited JSON).
 *
 * Backs `GET /api/abm/runs/:rid/trace` (P1 Task 7): the desktop Trace timeline
 * fetches lightweight records (tick_metrics / event / mechanism_fired) to mark
 * the axis, and seeks one nearest `space_snapshot` (`at` mode) to replay the
 * canvas at a tick. Reads the file line by line so a large trace is never fully
 * buffered (architecture/data-contracts: traces can be big).
 */

export interface TraceRecord {
  kind: string
  tick?: number
  [key: string]: unknown
}

export interface TraceQuery {
  /** Inclusive lower tick bound (range mode). */
  from?: number
  /** Inclusive upper tick bound (range mode). */
  to?: number
  /** Restrict to these record kinds; undefined = all kinds. */
  kinds?: Set<string>
  /** Nearest mode: return the single matching record with the greatest tick <= at. */
  at?: number
}

export interface TraceReadResult {
  records: TraceRecord[]
  truncated: boolean
}

// Cap range responses so a pathological request can't return an unbounded body.
const MAX_RANGE_RECORDS = 20_000

/**
 * Parse a `kinds=a,b,c` query param into a Set, or undefined when absent/empty.
 */
export function parseKinds(value: string | null): Set<string> | undefined {
  if (!value) return undefined
  const kinds = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  return kinds.length > 0 ? new Set(kinds) : undefined
}

async function* readLines(path: string): AsyncGenerator<string> {
  const file = Bun.file(path)
  const stream = file.stream()
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true })
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      yield buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
    }
  }
  buffer += decoder.decode()
  if (buffer.length > 0) yield buffer
}

function matchesKind(record: TraceRecord, kinds: Set<string> | undefined): boolean {
  return !kinds || kinds.has(record.kind)
}

/**
 * Stream every trace record matching `kinds` within [from,to] without
 * buffering the file or capping the count. Aggregating consumers (mechanism
 * activity, attribution) use this instead of readTraceRecords so long runs
 * are never truncated.
 */
export async function* iterateTraceRecords(
  path: string,
  query: { from?: number; to?: number; kinds?: Set<string> } = {},
): AsyncGenerator<TraceRecord> {
  if (!(await Bun.file(path).exists())) return
  const { from = 0, to = Number.POSITIVE_INFINITY, kinds } = query
  for await (const line of readLines(path)) {
    if (line.trim().length === 0) continue
    let record: TraceRecord
    try {
      record = JSON.parse(line) as TraceRecord
    } catch {
      continue
    }
    if (!matchesKind(record, kinds)) continue
    const tick = typeof record.tick === 'number' ? record.tick : undefined
    if (tick !== undefined && (tick < from || tick > to)) continue
    yield record
  }
}

/**
 * Read trace records matching `query`. In `at` mode returns at most one record
 * (the latest with `tick <= at`); otherwise returns every record in [from,to].
 */
export async function readTraceRecords(path: string, query: TraceQuery): Promise<TraceReadResult> {
  if (!(await Bun.file(path).exists())) {
    return { records: [], truncated: false }
  }

  const { from = 0, to = Number.POSITIVE_INFINITY, kinds, at } = query
  const records: TraceRecord[] = []
  let nearest: TraceRecord | null = null
  let truncated = false

  for await (const line of readLines(path)) {
    if (line.trim().length === 0) continue
    let record: TraceRecord
    try {
      record = JSON.parse(line) as TraceRecord
    } catch {
      continue // skip a partial/corrupt line rather than failing the read
    }
    if (!matchesKind(record, kinds)) continue

    const tick = typeof record.tick === 'number' ? record.tick : undefined

    if (at !== undefined) {
      if (tick === undefined || tick > at) continue
      if (!nearest || (nearest.tick ?? -1) <= tick) nearest = record
      continue
    }

    if (tick !== undefined && (tick < from || tick > to)) continue
    if (records.length >= MAX_RANGE_RECORDS) {
      truncated = true
      break
    }
    records.push(record)
  }

  if (at !== undefined) return { records: nearest ? [nearest] : [], truncated: false }
  return { records, truncated }
}
