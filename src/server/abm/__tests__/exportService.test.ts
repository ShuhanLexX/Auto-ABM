import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { buildPackage, ExportNotFoundError } from '../exportService.js'
import {
  createProject,
  createSimulation,
  putExperiment,
  putOdd,
  putRunRecord,
} from '../abmStore.fs.js'
import { traceFile } from '../storagePaths.js'
import { deriveOdd } from '../oddService.js'
import type { AbmExperiment, RunRecord } from '../types.js'

let tempDir: string

const CONFIG = {
  id: 'rumor',
  version: '1',
  name: 'Rumor',
  observers: [{ id: 'infected', level: 'macro' }],
}

async function makeSimulation() {
  const project = await createProject({ name: 'Export project' })
  const sim = await createSimulation(project.id, {
    name: 'Export sim',
    modelVersion: '1',
    config: CONFIG,
    interface: { seed: 7, steps: 5, params: {} },
  })
  return { project, sim }
}

function runRecord(id: string, seed: number, simParams: Record<string, unknown>): RunRecord {
  return {
    id,
    model_id: 'rumor',
    model_version: '1',
    kernel_version: '0.1.0',
    seed,
    parameters: simParams,
    steps: 5,
    status: 'completed',
    metrics_summary: { infected: { final: 0.42, max: 0.6 } },
    trace_path: null,
    result_path: null,
  }
}

describe('exportService.buildPackage', () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'abm-export-'))
    process.env.CLAUDE_CONFIG_DIR = tempDir
  })

  afterEach(async () => {
    delete process.env.CLAUDE_CONFIG_DIR
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  test('throws ExportNotFoundError for an unknown simulation', async () => {
    await expect(buildPackage('nope')).rejects.toBeInstanceOf(ExportNotFoundError)
  })

  test('assembles a self-contained package with a complete manifest', async () => {
    const { project, sim } = await makeSimulation()
    await putRunRecord(project.id, sim.id, runRecord('run-a', 11, { beta: 0.1 }))
    await putRunRecord(project.id, sim.id, runRecord('run-b', 12, { beta: 0.2 }))

    const experiment: AbmExperiment = {
      id: 'exp-1',
      projectId: project.id,
      simId: sim.id,
      name: 'beta sweep',
      config: {
        id: 'exp-1',
        name: 'beta sweep',
        model_id: 'rumor',
        model_version: '1',
        design: { type: 'single_sweep', sweep: [{ parameter_id: 'beta', values: [0.1, 0.2] }] },
        replications: 1,
        base_seed: 11,
        steps: 5,
        collect_metrics: ['infected'],
      },
      status: 'completed',
      total: 2,
      runIds: ['run-a', 'run-b'],
      createdAt: new Date().toISOString(),
      schemaVersion: 1,
    }
    await putExperiment(experiment)

    const { packageDir, manifest } = await buildPackage(sim.id)

    // Necessary files present.
    const config = JSON.parse(await fs.readFile(path.join(packageDir, 'model/config.json'), 'utf-8'))
    expect(config.id).toBe('rumor')
    const oddMd = await fs.readFile(path.join(packageDir, 'odd.md'), 'utf-8')
    expect(oddMd).toContain('# ODD Protocol')
    await fs.access(path.join(packageDir, 'runs/run-a.json'))
    await fs.access(path.join(packageDir, 'runs/run-b.json'))
    await fs.access(path.join(packageDir, 'experiments/exp-1.json'))

    // Manifest fields complete.
    expect(manifest.schema_version).toBe('1')
    expect(manifest.project_id).toBe(project.id)
    expect(manifest.sim_id).toBe(sim.id)
    expect(manifest.kernel_version).toBe('0.1.0')
    expect(manifest.auto_abm_version).toBeTruthy()
    expect(manifest.includes).toContain('model/config.json')
    expect(manifest.includes).toContain('runs/run-a.json')
    expect(Object.keys(manifest.checksums).length).toBe(manifest.includes.length)

    // Per-run repro entries carry seed + params + steps for re-running.
    expect(manifest.runs).toHaveLength(2)
    const repro = manifest.runs.find((r) => r.id === 'run-a')
    expect(repro?.seed).toBe(11)
    expect(repro?.params).toEqual({ beta: 0.1 })
    expect(repro?.steps).toBe(5)

    // The written manifest.json matches the returned manifest.
    const onDisk = JSON.parse(await fs.readFile(path.join(packageDir, 'manifest.json'), 'utf-8'))
    expect(onDisk.checksums['model/config.json']).toBe(manifest.checksums['model/config.json'])
  })

  test('prefers a persisted ODD and can bundle traces', async () => {
    const { project, sim } = await makeSimulation()
    await putRunRecord(project.id, sim.id, runRecord('run-a', 11, {}))

    const odd = deriveOdd(CONFIG)
    odd.sections.purpose = { text: 'Hand-written purpose', derived: false }
    await putOdd(project.id, sim.id, odd)

    // Seed a trace so includeTraces has something to copy.
    const tracePath = traceFile(project.id, sim.id, 'run-a')
    await fs.mkdir(path.dirname(tracePath), { recursive: true })
    await fs.writeFile(tracePath, '{"kind":"tick_metrics","tick":0,"metrics":{"infected":0.1}}\n')

    const { packageDir, manifest } = await buildPackage(sim.id, { includeTraces: true })

    const oddMd = await fs.readFile(path.join(packageDir, 'odd.md'), 'utf-8')
    expect(oddMd).toContain('Hand-written purpose')
    expect(manifest.includes).toContain('traces/run-a.jsonl')
    const trace = await fs.readFile(path.join(packageDir, 'traces/run-a.jsonl'), 'utf-8')
    expect(trace).toContain('tick_metrics')
  })
})
