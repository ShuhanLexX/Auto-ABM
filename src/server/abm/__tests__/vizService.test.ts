import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import {
  experimentTable,
  missingFields,
  resolveViz,
  runMetricsTable,
  traceMetricsTable,
  VizValidationError,
  VizNotFoundError,
} from '../vizService.js'
import { createProject, createSimulation, putExperiment, putRunRecord } from '../abmStore.fs.js'
import type { AbmExperiment, RunRecord, VizSpec } from '../types.js'
import type { TraceRecord } from '../traceRead.js'

function run(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: 'r1',
    experiment_id: 'e1',
    model_id: 'm',
    model_version: '1',
    kernel_version: 'k',
    seed: 1,
    parameters: {},
    steps: 5,
    status: 'completed',
    metrics_summary: {},
    ...overrides,
  }
}

describe('missingFields', () => {
  test('flags encoding fields not present in the resolved columns', () => {
    const spec: VizSpec = {
      chart: 'bar',
      data_ref: { source: 'experiment', id: 'e1' },
      encodings: [
        { field: 'beta', role: 'x' },
        { field: 'infected.final', role: 'y' },
        { field: 'ghost', role: 'color' },
      ],
    }
    expect(missingFields(spec, ['beta', 'infected.final', 'seed'])).toEqual(['ghost'])
    expect(missingFields(spec, ['beta', 'infected.final'])).toEqual(['ghost'])
  })
})

describe('runMetricsTable', () => {
  test('one row per metric with stat columns', () => {
    const table = runMetricsTable(
      run({ metrics_summary: { infected: { final: 0.6, max: 0.8, min: 0, mean: 0.4 } } }),
    )
    expect(table.columns).toEqual(['metric', 'final', 'max', 'min', 'mean'])
    expect(table.rows).toEqual([{ metric: 'infected', final: 0.6, max: 0.8, min: 0, mean: 0.4 }])
  })
})

describe('experimentTable', () => {
  const experiment: AbmExperiment = {
    id: 'e1',
    projectId: 'p1',
    simId: 's1',
    name: 'sweep',
    config: {
      id: 'e1',
      name: 'sweep',
      model_id: 'm',
      model_version: '1',
      design: { type: 'single_sweep', sweep: [{ parameter_id: 'beta', values: [0.1, 0.2] }] },
      replications: 1,
      base_seed: 1,
      steps: 5,
      collect_metrics: ['infected'],
    },
    status: 'completed',
    total: 2,
    runIds: ['r1', 'r2'],
    createdAt: 'now',
    schemaVersion: 1,
  }

  test('one row per completed run with sweep param + metric.stat columns', () => {
    const runs = [
      run({ id: 'r1', parameters: { beta: 0.1 }, metrics_summary: { infected: { final: 0.3 } } }),
      run({ id: 'r2', parameters: { beta: 0.2 }, metrics_summary: { infected: { final: 0.7 } } }),
    ]
    const table = experimentTable(experiment, runs)
    expect(table.columns).toContain('beta')
    expect(table.columns).toContain('infected.final')
    expect(table.rows).toHaveLength(2)
    expect(table.rows[0]).toMatchObject({ beta: 0.1, 'infected.final': 0.3, seed: 1 })
  })

  test('omits failed runs (no fabricated points)', () => {
    const runs = [
      run({ id: 'r1', parameters: { beta: 0.1 }, metrics_summary: { infected: { final: 0.3 } } }),
      run({ id: 'r2', status: 'failed', parameters: { beta: 0.2 }, metrics_summary: {} }),
    ]
    const table = experimentTable(experiment, runs)
    expect(table.rows).toHaveLength(1)
  })
})

describe('traceMetricsTable', () => {
  test('one row per tick_metrics record with metric columns', () => {
    const records: TraceRecord[] = [
      { kind: 'tick_metrics', tick: 0, metrics: { infected: 0.1 } },
      { kind: 'event', tick: 1, name: 'x' },
      { kind: 'tick_metrics', tick: 1, metrics: { infected: 0.3, recovered: 0.1 } },
    ]
    const table = traceMetricsTable(records)
    expect(table.columns).toEqual(['tick', 'infected', 'recovered'])
    expect(table.rows).toEqual([
      { tick: 0, infected: 0.1 },
      { tick: 1, infected: 0.3, recovered: 0.1 },
    ])
  })
})

describe('resolveViz (integration)', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'abm-viz-'))
    process.env.CLAUDE_CONFIG_DIR = tempDir
  })

  afterEach(async () => {
    delete process.env.CLAUDE_CONFIG_DIR
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  async function seedExperiment() {
    const project = await createProject({ name: 'viz' })
    const sim = await createSimulation(project.id, {
      name: 'sim',
      modelVersion: '1',
      config: { id: 'm', version: '1' },
      interface: { seed: 1, steps: 5, params: {} },
    })
    const runs: RunRecord[] = [
      run({ id: 'vr1', experiment_id: 've1', parameters: { beta: 0.1 }, metrics_summary: { infected: { final: 0.3 } } }),
      run({ id: 'vr2', experiment_id: 've1', parameters: { beta: 0.2 }, metrics_summary: { infected: { final: 0.7 } } }),
    ]
    for (const r of runs) await putRunRecord(project.id, sim.id, r)
    await putExperiment({
      id: 've1',
      projectId: project.id,
      simId: sim.id,
      name: 'sweep',
      config: {
        id: 've1',
        name: 'sweep',
        model_id: 'm',
        model_version: '1',
        design: { type: 'single_sweep', sweep: [{ parameter_id: 'beta', values: [0.1, 0.2] }] },
        replications: 1,
        base_seed: 1,
        steps: 5,
        collect_metrics: ['infected'],
      },
      status: 'completed',
      total: 2,
      runIds: ['vr1', 'vr2'],
      createdAt: 'now',
      schemaVersion: 1,
    })
  }

  test('resolves an experiment sweep to real rows', async () => {
    await seedExperiment()
    const { data } = await resolveViz({
      chart: 'bar',
      data_ref: { source: 'experiment', id: 've1' },
      encodings: [
        { field: 'beta', role: 'x' },
        { field: 'infected.final', role: 'y' },
      ],
    })
    expect(data.rows).toHaveLength(2)
    expect(data.rows.map((r) => r['infected.final'])).toEqual([0.3, 0.7])
  })

  test('rejects a spec binding to a non-existent column', async () => {
    await seedExperiment()
    await expect(
      resolveViz({
        chart: 'bar',
        data_ref: { source: 'experiment', id: 've1' },
        encodings: [
          { field: 'beta', role: 'x' },
          { field: 'made_up_metric', role: 'y' },
        ],
      }),
    ).rejects.toBeInstanceOf(VizValidationError)
  })

  test('throws for an unknown data_ref id', async () => {
    await expect(
      resolveViz({
        chart: 'bar',
        data_ref: { source: 'experiment', id: 'nope' },
        encodings: [{ field: 'beta', role: 'x' }],
      }),
    ).rejects.toBeInstanceOf(VizNotFoundError)
  })
})
