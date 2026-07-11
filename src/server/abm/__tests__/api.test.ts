import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { handleAbmApi } from '../api.js'
import { createProject, createSimulation, getOdd, getSimulationById, listProjects, putRunRecord } from '../abmStore.fs.js'
import { clearMechanismGraphCache } from '../mechanismGraphService.js'
import { traceFile } from '../storagePaths.js'
import type { ModelConfig } from '../types.js'

const STUB_PATH = path.join(import.meta.dir, 'stubWorker.ts')

let tempDir: string

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'abm-api-'))
  process.env.CLAUDE_CONFIG_DIR = tempDir
  clearMechanismGraphCache()
})

afterEach(async () => {
  delete process.env.CLAUDE_CONFIG_DIR
  delete process.env.ABM_KERNEL_CMD
  delete process.env.ABM_KERNEL_ARGS
  await fs.rm(tempDir, { recursive: true, force: true })
})

function config(): ModelConfig {
  return {
    schema_version: '1',
    id: 'opinion',
    name: 'Opinion Dynamics',
    description: 'A bounded-confidence opinion model',
    version: '1.0.0',
    agents: [
      {
        id: 'person',
        name: 'Person',
        state_variables: [{ name: 'opinion', dtype: 'float', default: 0 }],
        behavior_refs: ['interact'],
      },
    ],
    environment: { type: 'network', config: { kind: 'small_world' } },
    mechanisms: [
      {
        id: 'interact',
        name: 'Bounded confidence interaction',
        trigger: 'neighbor opinion is close enough',
        effect: 'opinions move closer',
        code_ref: 'mechanisms.interact',
      },
    ],
    parameters: [
      { id: 'confidence', name: 'Confidence threshold', dtype: 'float', default: 0.3, min: 0, max: 1 },
    ],
    observers: [{ id: 'opinion_mean', name: 'Opinion mean', level: 'macro', dtype: 'float' }],
    initialization: { agent_counts: { person: 120 } },
  }
}

function request(method: string, pathName: string, body?: unknown): Request {
  return new Request(`http://127.0.0.1${pathName}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
  })
}

describe('ABM API ODD behavior', () => {
  test('DELETE /api/abm/projects removes orphaned projects and simulations', async () => {
    const project = await createProject({ name: 'orphaned' })
    const simulation = await createSimulation(project.id, {
      name: 'Orphaned simulation',
      modelVersion: '1',
      config: config(),
      interface: { seed: 1, steps: 10, params: {} },
    })

    const response = await handleAbmApi(
      request('DELETE', '/api/abm/projects'),
      new URL('http://127.0.0.1/api/abm/projects'),
      ['api', 'abm', 'projects'],
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, deleted: [project.id] })
    expect(await listProjects()).toEqual([])
    expect(await getSimulationById(simulation.id)).toBeNull()
  })

  test('normalizes model config aliases and extracts runtime interface fields', async () => {
    const project = await createProject({ name: 'question' })
    const looseConfig: ModelConfig = {
      ...config(),
      agents: [{
        id: 'person',
        name: 'Person',
        stateVariables: [{ name: 'opinion', dtype: 'float', default: 0, valueRange: [0, 1] }],
        behaviorRefs: ['interact'],
        count: 300,
      }],
      interface: { seed: 7, steps: 80, params: { confidence: 0.44 } },
    }

    const response = await handleAbmApi(
      request('POST', `/api/abm/projects/${project.id}/simulations`, {
        name: 'Loose opinion model',
        config: looseConfig,
      }),
      new URL(`http://127.0.0.1/api/abm/projects/${project.id}/simulations`),
      ['api', 'abm', 'projects', project.id, 'simulations'],
    )

    expect(response.status).toBe(201)
    const simulation = await response.json() as {
      id: string
      config: {
        interface?: unknown
        agents: Array<{ state_variables?: unknown[]; stateVariables?: unknown; behavior_refs?: string[]; behaviorRefs?: unknown }>
        initialization: { agent_counts?: Record<string, number>; agentCounts?: unknown }
      }
      interface: { seed: number; steps: number; params: Record<string, unknown> }
    }
    expect(simulation.interface).toEqual({ seed: 7, steps: 80, params: { confidence: 0.44 } })
    expect(simulation.config.interface).toBeUndefined()
    expect(simulation.config.agents[0]?.stateVariables).toBeUndefined()
    expect(simulation.config.agents[0]?.behaviorRefs).toBeUndefined()
    expect(simulation.config.agents[0]?.state_variables).toEqual([
      { name: 'opinion', dtype: 'float', default: 0, value_range: [0, 1] },
    ])
    expect(simulation.config.agents[0]?.behavior_refs).toEqual(['interact'])
    expect(simulation.config.initialization.agent_counts?.person).toBe(300)
    expect(simulation.config.initialization.agentCounts).toBeUndefined()
  })

  test('normalizes updated configs before persistence', async () => {
    const project = await createProject({ name: 'question' })
    const simulation = await createSimulation(project.id, {
      name: 'Opinion model',
      modelVersion: '1.0.0',
      config: config(),
      interface: { seed: 42, steps: 100, params: {} },
    })

    const response = await handleAbmApi(
      request('PATCH', `/api/abm/simulations/${simulation.id}`, {
        config: {
          ...config(),
          agents: [{
            id: 'person',
            name: 'Person',
            stateVariables: [{ name: 'opinion', dtype: 'float', default: 0.2 }],
            behaviorRefs: ['interact'],
          }],
          interface: { seed: 9, steps: 90, params: { confidence: 0.5 } },
        },
      }),
      new URL(`http://127.0.0.1/api/abm/simulations/${simulation.id}`),
      ['api', 'abm', 'simulations', simulation.id],
    )

    expect(response.status).toBe(200)
    const body = await response.json() as {
      config: { interface?: unknown; agents: Array<{ state_variables?: unknown[]; stateVariables?: unknown }> }
      interface: { seed: number; steps: number; params: Record<string, unknown> }
    }
    expect(body.interface).toEqual({ seed: 9, steps: 90, params: { confidence: 0.5 } })
    expect(body.config.interface).toBeUndefined()
    expect(body.config.agents[0]?.stateVariables).toBeUndefined()
    expect(body.config.agents[0]?.state_variables).toEqual([
      { name: 'opinion', dtype: 'float', default: 0.2 },
    ])
  })

  test('creates an ODD document when a simulation is created through the API', async () => {
    const project = await createProject({ name: 'question' })
    const response = await handleAbmApi(
      request('POST', `/api/abm/projects/${project.id}/simulations`, {
        name: 'Opinion model',
        config: config(),
      }),
      new URL(`http://127.0.0.1/api/abm/projects/${project.id}/simulations`),
      ['api', 'abm', 'projects', project.id, 'simulations'],
    )

    expect(response.status).toBe(201)
    const simulation = await response.json() as { id: string }
    const odd = await getOdd(project.id, simulation.id)
    expect(odd?.modelId).toBe('opinion')
    expect(odd?.sections.submodels.text).toContain('Bounded confidence interaction')
  })

  test('creates independent simulations instead of auto-versioning same model ids', async () => {
    const project = await createProject({ name: 'question' })

    const firstResponse = await handleAbmApi(
      request('POST', `/api/abm/projects/${project.id}/simulations`, {
        name: 'First opinion model',
        config: config(),
      }),
      new URL(`http://127.0.0.1/api/abm/projects/${project.id}/simulations`),
      ['api', 'abm', 'projects', project.id, 'simulations'],
    )
    const secondResponse = await handleAbmApi(
      request('POST', `/api/abm/projects/${project.id}/simulations`, {
        name: 'Second opinion model',
        config: config(),
      }),
      new URL(`http://127.0.0.1/api/abm/projects/${project.id}/simulations`),
      ['api', 'abm', 'projects', project.id, 'simulations'],
    )

    expect(firstResponse.status).toBe(201)
    expect(secondResponse.status).toBe(201)
    const first = await firstResponse.json() as { id: string; lineageId: string; modelVersion: string; config: { version: string } }
    const second = await secondResponse.json() as { id: string; lineageId: string; modelVersion: string; config: { version: string } }
    expect(first.id).not.toBe(second.id)
    expect(first.lineageId).toBe(first.id)
    expect(second.lineageId).toBe(second.id)
    expect(first.modelVersion).toBe('1.0.0')
    expect(second.modelVersion).toBe('1.0.0')
    expect(second.config.version).toBe('1.0.0')
  })

  test('serves the kernel-derived mechanism graph per simulation', async () => {
    process.env.ABM_KERNEL_CMD = 'bun'
    process.env.ABM_KERNEL_ARGS = JSON.stringify([STUB_PATH])
    const project = await createProject({ name: 'question' })
    const simulation = await createSimulation(project.id, {
      name: 'Opinion model',
      modelVersion: '1.0.0',
      config: config(),
      interface: { seed: 42, steps: 100, params: {} },
    })

    const response = await handleAbmApi(
      request('GET', `/api/abm/simulations/${simulation.id}/mechanism-graph`),
      new URL(`http://127.0.0.1/api/abm/simulations/${simulation.id}/mechanism-graph`),
      ['api', 'abm', 'simulations', simulation.id, 'mechanism-graph'],
    )

    expect(response.status).toBe(200)
    const body = await response.json() as {
      graph: { nodes: Array<{ id: string }>; edges: Array<{ relation: string }> }
    }
    expect(body.graph.nodes.some((n) => n.id === 'mechanism:spread')).toBe(true)
    expect(body.graph.edges.some((e) => e.relation === 'runs')).toBe(true)
  })

  test('backfills ODD for older simulations when the ODD route is opened', async () => {
    const project = await createProject({ name: 'question' })
    const simulation = await createSimulation(project.id, {
      name: 'Legacy opinion model',
      modelVersion: '1.0.0',
      config: config(),
      interface: { seed: 42, steps: 100, params: {} },
    })
    expect(await getOdd(project.id, simulation.id)).toBeNull()

    const response = await handleAbmApi(
      request('GET', `/api/abm/simulations/${simulation.id}/odd`),
      new URL(`http://127.0.0.1/api/abm/simulations/${simulation.id}/odd`),
      ['api', 'abm', 'simulations', simulation.id, 'odd'],
    )

    expect(response.status).toBe(200)
    const body = await response.json() as { odd: { modelId: string; sections: { purpose: { text: string } } } }
    expect(body.odd.modelId).toBe('opinion')
    expect(body.odd.sections.purpose.text).toContain('bounded-confidence')
    expect((await getOdd(project.id, simulation.id))?.modelId).toBe('opinion')
  })
})

describe('ABM API run insight routes', () => {
  async function seedRunWithTrace(): Promise<{ runId: string }> {
    const project = await createProject({ name: 'question' })
    const rumorConfig: ModelConfig = {
      ...config(),
      id: 'rumor',
      agents: [
        {
          id: 'person',
          name: 'Person',
          state_variables: [
            {
              name: 'state',
              dtype: 'categorical',
              default: 'susceptible',
              choices: ['susceptible', 'infected'],
            },
          ],
          behavior_refs: ['interact'],
        },
      ],
      observers: [{ id: 'infected', name: 'infected', level: 'macro', dtype: 'int' }],
    }
    const simulation = await createSimulation(project.id, {
      name: 'Rumor',
      modelVersion: '1.0.0',
      config: rumorConfig,
      interface: { seed: 42, steps: 3, params: {} },
    })
    const runId = 'run-insights'
    await putRunRecord(project.id, simulation.id, {
      id: runId,
      model_id: 'rumor',
      model_version: '1.0.0',
      kernel_version: '0',
      seed: 42,
      parameters: {},
      steps: 3,
      status: 'completed',
      metrics_summary: {},
    })
    const tracePath = traceFile(project.id, simulation.id, runId)
    await fs.mkdir(path.join(tracePath, '..'), { recursive: true })
    const lines = [
      { kind: 'run_meta', run_id: runId },
      { kind: 'tick_metrics', tick: 0, metrics: { infected: 1 } },
      {
        kind: 'mechanism_fired',
        tick: 1,
        mechanism_id: 'interact',
        agent_ids: [2],
        key: 'state',
        old: 'susceptible',
        new: 'infected',
      },
      { kind: 'tick_metrics', tick: 1, metrics: { infected: 2 } },
      {
        kind: 'mechanism_fired',
        tick: 2,
        mechanism_id: 'interact',
        agent_ids: [3],
        key: 'state',
        old: 'susceptible',
        new: 'infected',
      },
      { kind: 'tick_metrics', tick: 2, metrics: { infected: 3 } },
    ]
    await fs.writeFile(tracePath, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf-8')
    return { runId }
  }

  test('mechanism-activity aggregates firings for a run', async () => {
    const { runId } = await seedRunWithTrace()
    const response = await handleAbmApi(
      request('GET', `/api/abm/runs/${runId}/mechanism-activity`),
      new URL(`http://127.0.0.1/api/abm/runs/${runId}/mechanism-activity`),
      ['api', 'abm', 'runs', runId, 'mechanism-activity'],
    )
    expect(response.status).toBe(200)
    const body = await response.json() as { mechanisms: Array<{ mechanism_id: string; total: number }> }
    expect(body.mechanisms).toEqual([
      expect.objectContaining({ mechanism_id: 'interact', total: 2 }),
    ])
  })

  test('attribution decomposes a metric delta and requires the metric param', async () => {
    const { runId } = await seedRunWithTrace()
    const missing = await handleAbmApi(
      request('GET', `/api/abm/runs/${runId}/attribution`),
      new URL(`http://127.0.0.1/api/abm/runs/${runId}/attribution`),
      ['api', 'abm', 'runs', runId, 'attribution'],
    )
    expect(missing.status).toBe(400)

    const response = await handleAbmApi(
      request('GET', `/api/abm/runs/${runId}/attribution?metric=infected`),
      new URL(`http://127.0.0.1/api/abm/runs/${runId}/attribution?metric=infected`),
      ['api', 'abm', 'runs', runId, 'attribution'],
    )
    expect(response.status).toBe(200)
    const body = await response.json() as {
      supported: boolean
      actualDelta: number
      contributions: Array<{ mechanism_id: string; net: number }>
    }
    expect(body.supported).toBe(true)
    expect(body.actualDelta).toBe(2)
    expect(body.contributions).toEqual([
      expect.objectContaining({ mechanism_id: 'interact', net: 2 }),
    ])
  })

  test('explain route returns trace context without an unexpected server error', async () => {
    const { runId } = await seedRunWithTrace()
    const response = await handleAbmApi(
      request('GET', `/api/abm/runs/${runId}/explain?from=0&to=2&locale=en`),
      new URL(`http://127.0.0.1/api/abm/runs/${runId}/explain?from=0&to=2&locale=en`),
      ['api', 'abm', 'runs', runId, 'explain'],
    )
    expect(response.status).toBe(200)
    const body = await response.json() as {
      runId: string
      metrics: Array<{ tick: number }>
      mechanisms: Array<{ mechanism_id: string }>
      oddRefs: Array<{ section: string }>
    }
    expect(body.runId).toBe(runId)
    expect(body.metrics.map((point) => point.tick)).toEqual([0, 1, 2])
    expect(body.mechanisms).toEqual([
      expect.objectContaining({ mechanism_id: 'interact' }),
      expect.objectContaining({ mechanism_id: 'interact' }),
    ])
    expect(body.oddRefs.some((ref) => ref.section === 'Purpose')).toBe(true)
  })

  test('changepoints route returns a deterministic (possibly empty) list', async () => {
    const { runId } = await seedRunWithTrace()
    const response = await handleAbmApi(
      request('GET', `/api/abm/runs/${runId}/changepoints`),
      new URL(`http://127.0.0.1/api/abm/runs/${runId}/changepoints`),
      ['api', 'abm', 'runs', runId, 'changepoints'],
    )
    expect(response.status).toBe(200)
    const body = await response.json() as { runId: string; changepoints: unknown[] }
    expect(body.runId).toBe(runId)
    expect(Array.isArray(body.changepoints)).toBe(true)
  })

  test('compare route reports divergence between two runs', async () => {
    const { runId } = await seedRunWithTrace()
    const response = await handleAbmApi(
      request('GET', `/api/abm/runs/${runId}/compare/${runId}`),
      new URL(`http://127.0.0.1/api/abm/runs/${runId}/compare/${runId}`),
      ['api', 'abm', 'runs', runId, 'compare', runId],
    )
    expect(response.status).toBe(200)
    const body = await response.json() as { divergenceTick: number | null; ticksCompared: number }
    expect(body.divergenceTick).toBeNull()
    expect(body.ticksCompared).toBe(3)
  })

  test('counterfactual route validates the parameter patch', async () => {
    const { runId } = await seedRunWithTrace()
    const empty = await handleAbmApi(
      request('POST', `/api/abm/runs/${runId}/counterfactual`, { params: {} }),
      new URL(`http://127.0.0.1/api/abm/runs/${runId}/counterfactual`),
      ['api', 'abm', 'runs', runId, 'counterfactual'],
    )
    expect(empty.status).toBe(400)

    const missingRun = await handleAbmApi(
      request('POST', '/api/abm/runs/nope/counterfactual', { params: { confidence: 0.5 } }),
      new URL('http://127.0.0.1/api/abm/runs/nope/counterfactual'),
      ['api', 'abm', 'runs', 'nope', 'counterfactual'],
    )
    expect(missingRun.status).toBe(404)
  })
})
