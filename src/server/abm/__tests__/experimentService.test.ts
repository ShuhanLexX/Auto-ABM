import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { abmExperimentService } from '../experimentService.js'
import { createProject, createSimulation, getExperimentById, getRunRecordById } from '../abmStore.fs.js'
import type { AbmServerMessage } from '../wsEvents.js'
import type { ExperimentConfig } from '../types.js'

const STUB_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'stubExperimentWorker.ts')

let tempDir: string
let counter = 0

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 8000): Promise<void> {
  const start = Date.now()
  for (;;) {
    if (await predicate()) return
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

async function makeSimulation() {
  const project = await createProject({ name: 'Exp project' })
  const sim = await createSimulation(project.id, {
    name: 'Exp sim',
    modelVersion: '1',
    config: { id: 'stub', version: '1', observers: [{ id: 'infected', level: 'macro' }] },
    interface: { seed: 7, steps: 5, params: {} },
  })
  return { project, sim }
}

function experimentConfig(values: unknown[], experimentId: string): ExperimentConfig {
  return {
    id: experimentId,
    name: 'beta sweep',
    model_id: 'stub',
    model_version: '1',
    design: { type: 'single_sweep', sweep: [{ parameter_id: 'beta', values }] },
    replications: 2,
    base_seed: 100,
    steps: 5,
    collect_metrics: ['infected'],
    trace_level: 'off',
  }
}

describe('AbmExperimentService (stub worker)', () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'abm-exp-'))
    process.env.CLAUDE_CONFIG_DIR = tempDir
    process.env.ABM_KERNEL_CMD = 'bun'
    process.env.ABM_KERNEL_ARGS = JSON.stringify([STUB_PATH])
  })

  afterEach(async () => {
    delete process.env.CLAUDE_CONFIG_DIR
    delete process.env.ABM_KERNEL_CMD
    delete process.env.ABM_KERNEL_ARGS
    delete process.env.ABM_STUB_EXPERIMENT_DELAY_MS
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  test('aggregates 4 RunRecords and completes the experiment', async () => {
    const { project, sim } = await makeSimulation()
    const experimentId = `exp-${++counter}`

    const messages: AbmServerMessage[] = []
    const off = abmExperimentService.onProgress(experimentId, (m) => messages.push(m))

    const result = await abmExperimentService.startExperiment({
      projectId: project.id,
      simId: sim.id,
      experimentId,
      name: 'beta sweep',
      config: sim.config,
      experiment: experimentConfig([0.1, 0.2], experimentId),
    })
    expect(result.experimentId).toBe(experimentId)

    await waitFor(async () => (await getExperimentById(experimentId))?.status === 'completed')
    off()

    const experiment = await getExperimentById(experimentId)
    expect(experiment?.total).toBe(4) // 2 values × 2 replications
    expect(experiment?.runIds).toHaveLength(4)

    // Every emitted run was persisted as a real RunRecord.
    for (const runId of experiment!.runIds) {
      const run = await getRunRecordById(runId)
      expect(run?.experiment_id).toBe(experimentId)
    }

    // Progress messages: one meta status, four per-run progress, a completed status.
    const progress = messages.filter((m) => m.type === 'abm_experiment_progress')
    expect(progress).toHaveLength(4)
    expect(messages.some((m) => m.type === 'abm_experiment_status' && m.status === 'completed')).toBe(
      true,
    )
  })

  test('a failed run is recorded without aborting the batch', async () => {
    const { project, sim } = await makeSimulation()
    const experimentId = `exp-${++counter}`

    const messages: AbmServerMessage[] = []
    abmExperimentService.onProgress(experimentId, (m) => messages.push(m))

    await abmExperimentService.startExperiment({
      projectId: project.id,
      simId: sim.id,
      experimentId,
      name: 'bad sweep',
      config: sim.config,
      experiment: experimentConfig(['BAD', 0.2], experimentId),
    })

    await waitFor(async () => (await getExperimentById(experimentId))?.status === 'completed')

    const experiment = await getExperimentById(experimentId)
    expect(experiment?.runIds).toHaveLength(4)
    const progress = messages.filter((m) => m.type === 'abm_experiment_progress')
    expect(progress.some((m) => m.type === 'abm_experiment_progress' && m.state === 'failed')).toBe(
      true,
    )
  })

  test('stops a running experiment and persists stopped status', async () => {
    process.env.ABM_STUB_EXPERIMENT_DELAY_MS = '40'

    const { project, sim } = await makeSimulation()
    const experimentId = `exp-${++counter}`

    const messages: AbmServerMessage[] = []
    abmExperimentService.onProgress(experimentId, (m) => messages.push(m))

    await abmExperimentService.startExperiment({
      projectId: project.id,
      simId: sim.id,
      experimentId,
      name: 'stoppable sweep',
      config: sim.config,
      experiment: experimentConfig([0.1, 0.2, 0.3], experimentId),
    })

    await waitFor(() =>
      messages.some((m) => m.type === 'abm_experiment_status' && m.status === 'running'),
    )

    expect(await abmExperimentService.stopExperiment(experimentId)).toBe(true)
    await waitFor(async () => (await getExperimentById(experimentId))?.status === 'stopped')

    const experiment = await getExperimentById(experimentId)
    expect(experiment?.status).toBe('stopped')
    expect(experiment?.error?.type).toBe('ExperimentStopped')
    expect(
      messages.some((m) => m.type === 'abm_experiment_status' && m.status === 'stopped'),
    ).toBe(true)
    expect(experiment?.runIds.length).toBeLessThan(experiment?.total ?? Number.POSITIVE_INFINITY)
  })

  test('late subscriber replays buffered progress', async () => {
    const { project, sim } = await makeSimulation()
    const experimentId = `exp-${++counter}`

    await abmExperimentService.startExperiment({
      projectId: project.id,
      simId: sim.id,
      experimentId,
      name: 'beta sweep',
      config: sim.config,
      experiment: experimentConfig([0.1, 0.2], experimentId),
    })

    await waitFor(async () => (await getExperimentById(experimentId))?.status === 'completed')

    const messages: AbmServerMessage[] = []
    abmExperimentService.onProgress(experimentId, (m) => messages.push(m))
    expect(messages.some((m) => m.type === 'abm_experiment_status' && m.status === 'completed')).toBe(
      true,
    )
    expect(messages.filter((m) => m.type === 'abm_experiment_progress')).toHaveLength(4)
  })
})
