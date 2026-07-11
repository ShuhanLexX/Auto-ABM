import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import {
  createProject,
  createSimulation,
  deleteAllProjectsCascade,
  deleteProjectsForSession,
  deleteSimulation,
  listProjects,
  listSimulationsForProject,
  getSimulationById,
  putRunRecord,
  getRunRecordById,
  updateSimulation,
} from '../abmStore.fs.js'
import type { RunRecord } from '../types.js'

let tempDir: string

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'abm-store-'))
  process.env.CLAUDE_CONFIG_DIR = tempDir
})

afterEach(async () => {
  delete process.env.CLAUDE_CONFIG_DIR
  await fs.rm(tempDir, { recursive: true, force: true })
})

function simInput(name: string) {
  return {
    name,
    modelVersion: '1',
    config: { id: 'stub' },
    interface: { seed: 1, steps: 1, params: {} },
  }
}

describe('abmStore.fs concurrent index writes', () => {
  test('concurrent createProject keeps every project in the index', async () => {
    const created = await Promise.all(
      Array.from({ length: 8 }, (_, i) => createProject({ name: `p${i}` })),
    )
    const ids = new Set(created.map((p) => p.id))
    expect(ids.size).toBe(8)

    const indexed = await listProjects()
    expect(indexed.length).toBe(8)
    expect(new Set(indexed.map((p) => p.id))).toEqual(ids)
  })

  test('concurrent createSimulation keeps every sim resolvable via the index', async () => {
    const project = await createProject({ name: 'host' })
    const sims = await Promise.all(
      Array.from({ length: 8 }, (_, i) => createSimulation(project.id, simInput(`s${i}`))),
    )
    const resolved = await Promise.all(sims.map((s) => getSimulationById(s.id)))
    expect(resolved.every((s) => s !== null)).toBe(true)
    expect(new Set(resolved.map((s) => s!.id))).toEqual(new Set(sims.map((s) => s.id)))
  })

  test('listSimulationsForProject isolates simulations by research question', async () => {
    const first = await createProject({ name: 'question-a' })
    const second = await createProject({ name: 'question-b' })
    const simA1 = await createSimulation(first.id, simInput('a1'))
    const simB = await createSimulation(second.id, simInput('b'))
    const simA2 = await createSimulation(first.id, simInput('a2'))

    const firstSims = await listSimulationsForProject(first.id)
    const secondSims = await listSimulationsForProject(second.id)

    expect(firstSims.map((sim) => sim.id)).toEqual([simA1.id, simA2.id])
    expect(secondSims.map((sim) => sim.id)).toEqual([simB.id])
  })

  test('updateSimulation patches metadata and runtime interface fields', async () => {
    const project = await createProject({ name: 'host' })
    const sim = await createSimulation(project.id, simInput('before'))

    const updated = await updateSimulation(project.id, sim.id, {
      name: 'after',
      modelVersion: '2',
      interface: { seed: 7, steps: 12, params: { beta: 0.4 } },
    })

    expect(updated?.name).toBe('after')
    expect(updated?.modelVersion).toBe('2')
    expect(updated?.interface).toEqual({ seed: 7, steps: 12, params: { beta: 0.4 } })
    expect((await getSimulationById(sim.id))?.name).toBe('after')
  })

  test('never persists a kernel-invalid (kebab-case) model id', async () => {
    // The adopt tool writes here directly; a kebab-case id would fail the kernel
    // ModelConfig.id validator at run time, so the store must repair it on write.
    const project = await createProject({ name: 'host' })
    const sim = await createSimulation(project.id, {
      name: 'adopted',
      modelVersion: '1',
      config: { id: 'rumor-content-takedown-smallworld', name: 'Rumor' },
      interface: { seed: 1, steps: 1, params: {} },
    })
    expect((sim.config as { id: string }).id).toBe('rumor_content_takedown_smallworld')
    const roundTrip = await getSimulationById(sim.id)
    expect((roundTrip?.config as { id: string }).id).toBe('rumor_content_takedown_smallworld')
  })

  test('deleteSimulation removes a simulation from the project index', async () => {
    const project = await createProject({ name: 'host' })
    const sim = await createSimulation(project.id, simInput('delete-me'))

    await expect(deleteSimulation(project.id, sim.id)).resolves.toBe(true)

    expect(await getSimulationById(sim.id)).toBeNull()
    expect((await listSimulationsForProject(project.id)).map((item) => item.id)).not.toContain(sim.id)
    await expect(deleteSimulation(project.id, sim.id)).resolves.toBe(false)
  })

  test('concurrent putRunRecord keeps every run resolvable via the index', async () => {
    const project = await createProject({ name: 'host' })
    const sim = await createSimulation(project.id, simInput('s'))
    const records: RunRecord[] = Array.from({ length: 8 }, (_, i) => ({
      id: `run-${i}`,
      model_id: 'stub',
      model_version: '1',
      kernel_version: 'stub-0',
      seed: i,
      parameters: {},
      steps: 1,
      status: 'completed',
      metrics_summary: {},
      trace_path: '/tmp/t.jsonl',
      result_path: '/tmp/r.csv',
    }))
    await Promise.all(records.map((r) => putRunRecord(project.id, sim.id, r)))
    const resolved = await Promise.all(records.map((r) => getRunRecordById(r.id)))
    expect(resolved.every((r) => r !== null)).toBe(true)
  })

  test('deleteProjectsForSession removes session-owned projects and derived records', async () => {
    const owned = await createProject({
      name: 'owned',
      sourceSessionId: 'session-owned',
      sourceWorkDir: 'E:\\Projects\\AutoABM',
    })
    const unrelated = await createProject({
      name: 'unrelated',
      sourceSessionId: 'session-other',
      sourceWorkDir: 'E:\\Projects\\AutoABM',
    })
    const sim = await createSimulation(owned.id, simInput('owned-sim'))
    const run: RunRecord = {
      id: 'owned-run',
      model_id: 'stub',
      model_version: '1',
      kernel_version: 'stub-0',
      seed: 1,
      parameters: {},
      steps: 1,
      status: 'completed',
      metrics_summary: {},
      trace_path: '/tmp/t.jsonl',
      result_path: '/tmp/r.csv',
    }
    await putRunRecord(owned.id, sim.id, run)

    const deleted = await deleteProjectsForSession({
      sessionId: 'session-owned',
      workDir: 'E:\\Projects\\AutoABM',
    })

    expect(deleted).toEqual([owned.id])
    expect(await getSimulationById(sim.id)).toBeNull()
    expect(await getRunRecordById(run.id)).toBeNull()
    expect((await listProjects()).map((project) => project.id)).toEqual([unrelated.id])
  })

  test('deleteAllProjectsCascade removes every project and derived record', async () => {
    const project = await createProject({ name: 'orphaned' })
    const sim = await createSimulation(project.id, simInput('orphaned-sim'))
    const run: RunRecord = {
      id: 'orphaned-run',
      model_id: 'stub',
      model_version: '1',
      kernel_version: 'stub-0',
      seed: 1,
      parameters: {},
      steps: 1,
      status: 'completed',
      metrics_summary: {},
      trace_path: '/tmp/t.jsonl',
      result_path: '/tmp/r.csv',
    }
    await putRunRecord(project.id, sim.id, run)

    expect(await deleteAllProjectsCascade()).toEqual([project.id])
    expect(await listProjects()).toEqual([])
    expect(await getSimulationById(sim.id)).toBeNull()
    expect(await getRunRecordById(run.id)).toBeNull()
  })
})
