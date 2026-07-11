import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CONFIG = {
  id: 'rumor',
  name: 'Rumor',
  version: '2',
  agents: [{ id: 'person', name: 'Person', state_variables: [], behavior_refs: [] }],
  environment: { type: 'network', config: {} },
  mechanisms: [{ id: 'spread', name: 'Spread' }],
  parameters: [{ id: 'beta', name: 'beta', dtype: 'float', default: 0.3 }],
  observers: [{ id: 'infected', name: 'infected', level: 'macro', dtype: 'int' }],
  initialization: { agent_counts: { person: 10 } },
}

describe('counterfactualService', () => {
  let dir: string
  let projectId: string
  let simId: string

  async function writeTrace(runId: string, series: Array<Record<string, number>>): Promise<void> {
    const { traceFile } = await import('../storagePaths.js')
    const path = traceFile(projectId, simId, runId)
    await mkdir(join(path, '..'), { recursive: true })
    const lines = [
      { kind: 'run_meta', run_id: runId },
      ...series.map((metrics, tick) => ({ kind: 'tick_metrics', tick, metrics })),
      { kind: 'run_end', tick: series.length - 1, status: 'completed' },
    ]
    await writeFile(path, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf-8')
  }

  async function putRun(
    runId: string,
    overrides: Partial<{ status: string; model_version: string; seed: number }> = {},
  ): Promise<void> {
    const { putRunRecord } = await import('../abmStore.fs.js')
    await putRunRecord(projectId, simId, {
      id: runId,
      model_id: 'rumor',
      model_version: overrides.model_version ?? '2',
      kernel_version: '0',
      seed: overrides.seed ?? 42,
      parameters: { beta: 0.3 },
      steps: 4,
      status: (overrides.status ?? 'completed') as 'completed',
      metrics_summary: {},
    })
  }

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'abm-cf-'))
    process.env.CLAUDE_CONFIG_DIR = dir
    const { createProject, createSimulation } = await import('../abmStore.fs.js')
    const project = await createProject({ name: 'p' })
    projectId = project.id
    const sim = await createSimulation(projectId, {
      name: 'sim',
      modelVersion: '2',
      config: CONFIG,
      interface: { seed: 42, steps: 4, params: {} },
    })
    simId = sim.id

    await putRun('base-run')
    await writeTrace('base-run', [
      { infected: 3 },
      { infected: 5 },
      { infected: 8 },
      { infected: 9 },
    ])
    await putRun('cf-run')
    await writeTrace('cf-run', [
      { infected: 3 },
      { infected: 5 },
      { infected: 6 },
      { infected: 6 },
    ])
  })

  afterAll(async () => {
    delete process.env.CLAUDE_CONFIG_DIR
    await rm(dir, { recursive: true, force: true })
  })

  test('compareRuns reports the first divergence tick and per-metric deltas', async () => {
    const { compareRuns } = await import('../counterfactualService.js')
    const comparison = await compareRuns('base-run', 'cf-run')
    expect(comparison).not.toBeNull()
    expect(comparison!.divergenceTick).toBe(2)
    expect(comparison!.ticksCompared).toBe(4)
    expect(comparison!.metrics).toEqual([
      {
        metric: 'infected',
        baseFinal: 9,
        otherFinal: 6,
        finalDelta: -3,
        maxAbsDelta: 3,
        maxAbsDeltaTick: 3,
      },
    ])
  })

  test('compareRuns reports null divergence for identical trajectories', async () => {
    const { compareRuns } = await import('../counterfactualService.js')
    const comparison = await compareRuns('base-run', 'base-run')
    expect(comparison!.divergenceTick).toBeNull()
  })

  test('compareRuns returns null when a run has no trace', async () => {
    const { compareRuns } = await import('../counterfactualService.js')
    expect(await compareRuns('base-run', 'missing-run')).toBeNull()
  })

  test('startCounterfactualRun rejects an empty parameter patch', async () => {
    const { startCounterfactualRun, CounterfactualError } = await import(
      '../counterfactualService.js'
    )
    await expect(startCounterfactualRun({ baseRunId: 'base-run', params: {} })).rejects.toThrow(
      CounterfactualError,
    )
  })

  test('startCounterfactualRun rejects an unknown base run', async () => {
    const { startCounterfactualRun } = await import('../counterfactualService.js')
    await expect(
      startCounterfactualRun({ baseRunId: 'missing-run', params: { beta: 0.5 } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  test('startCounterfactualRun rejects an incomplete base run', async () => {
    await putRun('pending-run', { status: 'running' })
    const { startCounterfactualRun } = await import('../counterfactualService.js')
    await expect(
      startCounterfactualRun({ baseRunId: 'pending-run', params: { beta: 0.5 } }),
    ).rejects.toMatchObject({ code: 'NOT_COMPLETED' })
  })

  test('startCounterfactualRun rejects a model-version mismatch', async () => {
    await putRun('old-version-run', { model_version: '1' })
    await writeTrace('old-version-run', [{ infected: 1 }])
    const { startCounterfactualRun } = await import('../counterfactualService.js')
    await expect(
      startCounterfactualRun({ baseRunId: 'old-version-run', params: { beta: 0.5 } }),
    ).rejects.toMatchObject({ code: 'VERSION_MISMATCH' })
  })
})
