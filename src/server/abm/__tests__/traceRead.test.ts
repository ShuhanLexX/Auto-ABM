import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseKinds, readTraceRecords } from '../traceRead.js'

let dir: string
let tracePath: string

const LINES = [
  { kind: 'run_meta', schema_version: '1' },
  { kind: 'tick_metrics', tick: 0, metrics: { infected: 0.1 } },
  { kind: 'space_snapshot', tick: 0, snapshot: { space: 'grid', payload: { cells: [] } } },
  { kind: 'tick_metrics', tick: 1, metrics: { infected: 0.2 } },
  { kind: 'event', tick: 1, name: 'peak' },
  { kind: 'space_snapshot', tick: 1, snapshot: { space: 'grid', payload: { cells: [{ x: 0, y: 0, state: 'I' }] } } },
  { kind: 'tick_metrics', tick: 2, metrics: { infected: 0.15 } },
  { kind: 'space_snapshot', tick: 2, snapshot: { space: 'grid', payload: { cells: [] } } },
  { kind: 'run_end', tick: 2, status: 'completed' },
]

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'abm-trace-'))
  tracePath = join(dir, 'run.jsonl')
  await writeFile(tracePath, LINES.map((line) => JSON.stringify(line)).join('\n') + '\n', 'utf-8')
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('parseKinds', () => {
  test('splits a comma list and ignores blanks', () => {
    expect(parseKinds('event, mechanism_fired ,')).toEqual(new Set(['event', 'mechanism_fired']))
  })

  test('returns undefined for empty/missing input', () => {
    expect(parseKinds(null)).toBeUndefined()
    expect(parseKinds('')).toBeUndefined()
  })
})

describe('readTraceRecords', () => {
  test('returns [] for a missing file', async () => {
    const result = await readTraceRecords(join(dir, 'nope.jsonl'), {})
    expect(result.records).toEqual([])
  })

  test('filters lightweight kinds across a tick range', async () => {
    const result = await readTraceRecords(tracePath, {
      from: 0,
      to: 1,
      kinds: new Set(['tick_metrics', 'event']),
    })
    expect(result.records.map((r) => `${r.kind}@${r.tick}`)).toEqual([
      'tick_metrics@0',
      'tick_metrics@1',
      'event@1',
    ])
    expect(result.truncated).toBe(false)
  })

  test('at-mode returns the nearest snapshot with tick <= at', async () => {
    const result = await readTraceRecords(tracePath, {
      at: 1,
      kinds: new Set(['space_snapshot']),
    })
    expect(result.records).toHaveLength(1)
    expect(result.records[0]!.tick).toBe(1)
    const snapshot = result.records[0]!.snapshot as { payload: { cells: unknown[] } }
    expect(snapshot.payload.cells).toHaveLength(1)
  })

  test('at-mode returns nothing when no record is at or before the tick', async () => {
    const result = await readTraceRecords(tracePath, {
      at: -1,
      kinds: new Set(['space_snapshot']),
    })
    expect(result.records).toEqual([])
  })

  test('includes records with no tick (run_meta) in range mode', async () => {
    const result = await readTraceRecords(tracePath, { kinds: new Set(['run_meta']) })
    expect(result.records).toHaveLength(1)
    expect(result.records[0]!.kind).toBe('run_meta')
  })
})
