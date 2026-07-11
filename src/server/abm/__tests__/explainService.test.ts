import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  askMiniExplain,
  assembleExplainContext,
  validateEvidence,
  type ExplainContext,
} from '../explainService.js'
import type { TraceRecord } from '../traceRead.js'

function ctx(overrides: Partial<ExplainContext> = {}): ExplainContext {
  return {
    runId: 'r1',
    from: 0,
    to: 10,
    metrics: [
      { tick: 2, metrics: { infected: 0.25 } },
      { tick: 5, metrics: { infected: 0.6 } },
    ],
    events: [{ tick: 5, name: 'peak' }],
    mechanisms: [{ tick: 5, mechanism_id: 'infect', agent_ids: [1, 2] }],
    oddRefs: [{ section: 'Purpose', text: 'demo' }],
    ...overrides,
  }
}

describe('assembleExplainContext', () => {
  test('maps trace records by kind and drops untracked kinds', () => {
    const records: TraceRecord[] = [
      { kind: 'run_meta', run_id: 'r1' },
      { kind: 'tick_metrics', tick: 1, metrics: { infected: 0.1, dead: 0 } },
      { kind: 'event', tick: 3, name: 'outbreak', detail: 'x' },
      { kind: 'mechanism_fired', tick: 3, mechanism_id: 'infect', agent_ids: [7] },
      { kind: 'space_snapshot', tick: 3, snapshot: {} },
    ]
    const context = assembleExplainContext({
      runId: 'r1',
      from: 0,
      to: 5,
      records,
      oddRefs: [],
    })
    expect(context.metrics).toEqual([{ tick: 1, metrics: { infected: 0.1, dead: 0 } }])
    expect(context.events).toEqual([{ tick: 3, name: 'outbreak' }])
    expect(context.mechanisms).toEqual([{ tick: 3, mechanism_id: 'infect', agent_ids: [7] }])
  })
})

describe('validateEvidence', () => {
  test('accepts a metric citation matching a real tick/value', () => {
    const { ok, rejected } = validateEvidence(ctx(), [{ tick: 5, metric: 'infected', value: 0.6 }])
    expect(ok).toHaveLength(1)
    expect(rejected).toHaveLength(0)
  })

  test('rejects an out-of-range tick', () => {
    const { ok, rejected } = validateEvidence(ctx(), [{ tick: 99, metric: 'infected' }])
    expect(ok).toHaveLength(0)
    expect(rejected).toHaveLength(1)
  })

  test('rejects an unknown metric at a real tick', () => {
    const { rejected } = validateEvidence(ctx(), [{ tick: 5, metric: 'unknown_metric' }])
    expect(rejected).toHaveLength(1)
  })

  test('rejects a fabricated metric value', () => {
    const { rejected } = validateEvidence(ctx(), [{ tick: 5, metric: 'infected', value: 0.99 }])
    expect(rejected).toHaveLength(1)
  })

  test('rejects an unknown mechanism_id', () => {
    const { rejected } = validateEvidence(ctx(), [{ tick: 5, mechanism_id: 'teleport' }])
    expect(rejected).toHaveLength(1)
  })

  test('accepts a real mechanism citation', () => {
    const { ok } = validateEvidence(ctx(), [{ tick: 5, mechanism_id: 'infect' }])
    expect(ok).toHaveLength(1)
  })

  test('rejects an event that did not fire at that tick', () => {
    const { rejected } = validateEvidence(ctx(), [{ tick: 2, event: 'peak' }])
    expect(rejected).toHaveLength(1)
  })

  test('rejects a bare tick with no record in the window', () => {
    const { rejected } = validateEvidence(ctx(), [{ tick: 7 }])
    expect(rejected).toHaveLength(1)
  })

  test('partitions a mixed batch into ok and rejected', () => {
    const { ok, rejected } = validateEvidence(ctx(), [
      { tick: 5, metric: 'infected' },
      { tick: 200, metric: 'infected' },
      { tick: 5, mechanism_id: 'infect' },
      { tick: 5, mechanism_id: 'nope' },
    ])
    expect(ok).toHaveLength(2)
    expect(rejected).toHaveLength(2)
  })
})

describe('askMiniExplain', () => {
  test('returns an explicit fallback when no run is bound', async () => {
    const response = await askMiniExplain({
      tick: 5,
      target: { subject: '网格单元 #7' },
    })
    expect(response.source).toBe('fallback')
    expect(response.text).toContain('not bound to a run')
  })

  test('localizes fallback text for Chinese mini explanations', async () => {
    const response = await askMiniExplain({
      tick: 5,
      locale: 'zh',
    })
    expect(response.source).toBe('fallback')
    expect(response.text).toContain('没有绑定运行结果')
  })
})

describe('buildExplainContext (integration)', () => {
  let dir: string
  let runId: string

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'abm-explain-'))
    process.env.CLAUDE_CONFIG_DIR = dir

    // Import after CLAUDE_CONFIG_DIR is set so storagePaths resolve into the temp dir.
    const { createProject, createSimulation, putRunRecord } = await import('../abmStore.fs.js')
    const { traceFile } = await import('../storagePaths.js')

    const project = await createProject({ name: 'p' })
    const sim = await createSimulation(project.id, {
      name: 'sim',
      modelVersion: '1',
      config: {
        id: 'rumor',
        name: 'Rumor',
        description: 'spreads',
        version: '1',
        agents: [{ id: 'person', name: 'Person', state_variables: [], behavior_refs: [] }],
        environment: { type: 'network', config: {} },
        mechanisms: [{ id: 'spread', name: 'Spread' }],
        parameters: [],
        observers: [],
        initialization: { agent_counts: { person: 10 } },
      },
      interface: { seed: 1, steps: 10, params: {} },
    })

    runId = 'run-explain-1'
    await putRunRecord(project.id, sim.id, {
      id: runId,
      model_id: 'rumor',
      model_version: '1',
      kernel_version: '0',
      seed: 1,
      parameters: {},
      steps: 10,
      status: 'completed',
      metrics_summary: {},
    })

    const tracePath = traceFile(project.id, sim.id, runId)
    await mkdir(join(tracePath, '..'), { recursive: true })
    const lines = [
      { kind: 'run_meta', run_id: runId },
      { kind: 'tick_metrics', tick: 1, metrics: { aware: 0.1 } },
      { kind: 'tick_metrics', tick: 4, metrics: { aware: 0.5 } },
      { kind: 'mechanism_fired', tick: 4, mechanism_id: 'spread', agent_ids: [3] },
      { kind: 'tick_metrics', tick: 8, metrics: { aware: 0.9 } },
    ]
    await writeFile(tracePath, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf-8')
  })

  afterAll(async () => {
    delete process.env.CLAUDE_CONFIG_DIR
    await rm(dir, { recursive: true, force: true })
  })

  test('reads only the requested interval and derives ODD refs', async () => {
    const { buildExplainContext } = await import('../explainService.js')
    const context = await buildExplainContext(runId, 2, 5)
    expect(context).not.toBeNull()
    expect(context!.metrics.map((m) => m.tick)).toEqual([4])
    expect(context!.mechanisms).toEqual([{ tick: 4, mechanism_id: 'spread', agent_ids: [3] }])
    expect(context!.oddRefs.some((r) => r.section === 'Purpose')).toBe(true)
  })

  test('localizes ODD ref titles for Chinese explain context', async () => {
    const { buildExplainContext } = await import('../explainService.js')
    const context = await buildExplainContext(runId, 2, 5, 'zh')
    expect(context).not.toBeNull()
    expect(context!.oddRefs.some((r) => r.section === '目的')).toBe(true)
  })

  test('returns null for an unknown run', async () => {
    const { buildExplainContext } = await import('../explainService.js')
    expect(await buildExplainContext('does-not-exist', 0, 10)).toBeNull()
  })
})
