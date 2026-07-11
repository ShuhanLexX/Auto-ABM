import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ProposeSimulationsTool } from '../proposeSimulationsTool.js'
import { AdoptSimulationTool } from '../adoptSimulationTool.js'
import { ExplainIntervalTool } from '../explainIntervalTool.js'
import { EditModelTool } from '../editModelTool.js'
import { UpdateOddTool } from '../updateOddTool.js'
import { RunTool } from '../runTool.js'
import { computeModelDiff, type ModelDiff } from '../modelDiff.js'
import { inferTemplateFromProposal } from '../proposalTemplate.js'
import { getAbmTools, isAbmToolsEnabled } from '../index.js'
import { bumpIfStructural } from '../../../server/abm/modelVersioning.js'
import type { AbmCardEnvelope } from '../abmCardEnvelope.js'

function makeConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'rumor',
    name: 'Rumor',
    description: 'spreads',
    version: '1',
    agents: [{ id: 'person', name: 'Person', state_variables: [], behavior_refs: [] }],
    environment: { type: 'network', config: {} },
    mechanisms: [{ id: 'spread', name: 'Spread', trigger: 'contact', effect: 'aware' }],
    parameters: [{ id: 'p', name: 'p', dtype: 'float', default: 0.3, scope: 'model' }],
    observers: [],
    initialization: { agent_counts: { person: 10 } },
    ...overrides,
  }
}

function permissionContext(mode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'auto') {
  return {
    getAppState: () => ({
      toolPermissionContext: { mode },
    }),
  } as never
}

// Decode the JSON envelope a tool writes into its tool_result content.
function decodeEnvelope(tool: {
  mapToolResultToToolResultBlockParam: (content: unknown, id: string) => { content: unknown }
}, output: unknown): AbmCardEnvelope {
  const block = tool.mapToolResultToToolResultBlockParam(output, 'toolu_1')
  return JSON.parse(block.content as string) as AbmCardEnvelope
}

describe('getAbmTools registry', () => {
  test('exposes the ABM tools with stable names', () => {
    const names = getAbmTools().map((t) => t.name)
    expect(names).toEqual([
      'abm_propose_simulations',
      'abm_adopt_simulation',
      'abm_explain_interval',
      'abm_edit_model',
      'abm_run',
      'abm_stop_run',
      'abm_update_odd',
      'abm_configure_results',
      'abm_control_workbench',
      'abm_inspect_simulation',
      'abm_validate_simulation',
      'abm_configure_experiment_view',
      'abm_attribute_interval',
      'abm_counterfactual_run',
    ])
  })

  test('isAbmToolsEnabled is on by default and opts out on 0/false', () => {
    const prev = process.env.ENABLE_ABM_TOOLS
    process.env.ENABLE_ABM_TOOLS = '1'
    expect(isAbmToolsEnabled()).toBe(true)
    process.env.ENABLE_ABM_TOOLS = 'false'
    expect(isAbmToolsEnabled()).toBe(false)
    process.env.ENABLE_ABM_TOOLS = '0'
    expect(isAbmToolsEnabled()).toBe(false)
    delete process.env.ENABLE_ABM_TOOLS
    expect(isAbmToolsEnabled()).toBe(true)
    if (prev !== undefined) process.env.ENABLE_ABM_TOOLS = prev
  })
})

describe('abm_propose_simulations', () => {
  test('prompt requires clarification before underspecified model proposals', async () => {
    const prompt = await ProposeSimulationsTool.prompt()
    expect(prompt).toContain('ask focused clarification questions')
    expect(prompt).toContain('Do not rush into model generation')
    expect(prompt).toContain('For a rough topic')
    expect(prompt).toContain('environment/space representation')
    expect(prompt).toContain('mechanism-diverse')
    expect(prompt).toContain('Do not default')
    expect(prompt).toContain('abm_validate_simulation')
    expect(prompt).toContain('single ignition point')
    expect(prompt).toContain('spot_fire_probability = 0')
    expect(prompt).toContain('Multi-point ignition means')
  })

  test('keeps a proposal with a real trial and drops a fabricated one', async () => {
    const { data } = await ProposeSimulationsTool.call({
      proposals: [
        {
          id: 'a',
          mechanismSummary: 'm',
          expectedMacro: 'x',
          trial: { runId: 'r1', sparkline: [0.1, 0.2] },
        },
        // Bogus trial (no runId / empty sparkline) must be stripped.
        { id: 'b', mechanismSummary: 'm', expectedMacro: 'x', trial: { runId: '', sparkline: [] } },
      ],
    })
    expect(data.count).toBe(2)
    expect(data.proposals[0]!.trial).toEqual({ runId: 'r1', sparkline: [0.1, 0.2] })
    expect(data.proposals[1]!.trial).toBeUndefined()
  })

  test('accepts null for optional fields (models often send "trial": null)', () => {
    const parsed = ProposeSimulationsTool.inputSchema.safeParse({
      proposals: [
        {
          id: 'a',
          mechanismSummary: 'm',
          expectedMacro: 'x',
          keyParams: null,
          oddExcerpt: null,
          trial: null,
        },
      ],
    })
    expect(parsed.success).toBe(true)
  })

  test('serializes a proposal_batch envelope', async () => {
    const { data } = await ProposeSimulationsTool.call({
      proposals: [{ id: 'a', mechanismSummary: 'm', expectedMacro: 'x' }],
    })
    const env = decodeEnvelope(ProposeSimulationsTool, data)
    expect(env.abmCard).toBe('proposal_batch')
    if (env.abmCard !== 'proposal_batch') throw new Error('unexpected')
    expect(env.proposals).toHaveLength(1)
    expect(env.proposals[0]!.id).toBe('a')
  })
})

describe('abm_control_workbench', () => {
  test('serializes a workbench envelope', async () => {
    const { ControlWorkbenchTool } = await import('../controlWorkbenchTool.js')
    const { data } = await ControlWorkbenchTool.call({
      action: 'open',
      view: 'results',
      simId: 'sim-1',
      runId: 'run-1',
    })
    const env = decodeEnvelope(ControlWorkbenchTool, data)
    expect(env.abmCard).toBe('workbench')
    if (env.abmCard !== 'workbench') throw new Error('unexpected')
    expect(env.action).toBe('open')
    expect(env.view).toBe('results')
    expect(env.simId).toBe('sim-1')
    expect(env.runId).toBe('run-1')
  })

  test('accepts null optionals from the model', async () => {
    const { ControlWorkbenchTool } = await import('../controlWorkbenchTool.js')
    const parsed = ControlWorkbenchTool.inputSchema.safeParse({
      action: 'open',
      view: null,
      simId: null,
      runId: null,
      note: null,
    })
    expect(parsed.success).toBe(true)
  })
})

describe('abm_configure_experiment_view', () => {
  test('serializes an experiment_view envelope with charts and controls', async () => {
    const { ConfigureExperimentViewTool } = await import('../configureExperimentViewTool.js')
    const { data } = await ConfigureExperimentViewTool.call({
      simId: 'sim-1',
      title: '燃料密度敏感性',
      intent: 'sensitivity',
      charts: [
        { id: 'c1', title: '燃尽比例 vs 燃料密度', type: 'bar', metrics: ['burned_rate'], xAxis: 'parameter' },
      ],
      controls: [
        { id: 'fuel_density', label: '燃料密度', kind: 'slider', min: 0.1, max: 1, step: 0.05, role: 'sweep', values: [0.4, 0.6, 0.8] },
      ],
      experiment: { parameter: 'fuel_density', values: [0.4, 0.6, 0.8], replications: 3, steps: 80 },
    })
    expect(data.configured).toBe(true)
    const env = decodeEnvelope(ConfigureExperimentViewTool, data)
    expect(env.abmCard).toBe('experiment_view')
    if (env.abmCard !== 'experiment_view') throw new Error('unexpected')
    expect(env.simId).toBe('sim-1')
    expect(env.view.charts[0]!.metrics).toEqual(['burned_rate'])
    expect(env.view.controls[0]!.values).toEqual([0.4, 0.6, 0.8])
    expect(env.view.experiment?.replications).toBe(3)
  })

  test('accepts experiment as a JSON string from model tool calls', async () => {
    const { ConfigureExperimentViewTool } = await import('../configureExperimentViewTool.js')
    const parsed = ConfigureExperimentViewTool.inputSchema.safeParse({
      simId: 'sim-1',
      title: '信任阈值扫描',
      intent: 'sensitivity',
      charts: [{ id: 'c1', title: '方差', type: 'line', metrics: ['opinion_variance'], xAxis: 'tick' }],
      controls: [],
      experiment: '{"parameter":"confidence","values":[0.2,0.4],"replications":2,"steps":80}',
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) throw new Error('expected schema parse to succeed')
    expect(parsed.data.experiment).toEqual({
      parameter: 'confidence',
      values: [0.2, 0.4],
      replications: 2,
      steps: 80,
    })
  })

  test('ignores non-JSON experiment strings instead of failing validation', async () => {
    const { ConfigureExperimentViewTool } = await import('../configureExperimentViewTool.js')
    const parsed = ConfigureExperimentViewTool.inputSchema.safeParse({
      simId: 'sim-1',
      title: 'Fuel sweep',
      intent: 'sensitivity',
      charts: [{ id: 'c1', title: 'Burned rate', type: 'line', metrics: ['burned_rate'], xAxis: 'tick' }],
      controls: [],
      experiment: 'sweep fuel density across low, medium, and high values',
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) throw new Error('expected schema parse to succeed')
    expect(parsed.data.experiment).toBeUndefined()
  })
})

describe('inferTemplateFromProposal', () => {
  test('keeps relation-network proposals off the grid default', () => {
    expect(
      inferTemplateFromProposal({
        id: 'rumor-contact-graph',
        mechanismSummary: '好友连边上的谣言传播与辟谣干预',
      }),
    ).toBe('rumor')
    expect(
      inferTemplateFromProposal({
        id: 'sir-er-network-basic',
        mechanismSummary: 'ER随机网络上固定概率传播(S→I)和固定概率恢复(I→R)',
      }),
    ).toBe('rumor')
    expect(
      inferTemplateFromProposal({
        id: 'sir-er-basic',
        mechanismSummary: 'SIR on ER contact structure',
      }),
    ).toBe('rumor')
    expect(
      inferTemplateFromProposal({
        id: 'sir-spatial-grid',
        mechanismSummary: '空间网格中的疫情感染扩散',
      }),
    ).toBe('sir')
  })

  test('routes wildfire and generic spatial topics away from epidemic defaults', () => {
    expect(
      inferTemplateFromProposal({
        id: 'wildfire-rothermel-grid',
        mechanismSummary: '山火沿风向和燃料斑块扩散，形成火线与燃尽区',
      }),
    ).toBe('wildfire')
    expect(
      inferTemplateFromProposal({
        id: 'urban-spatial-grid',
        mechanismSummary: '空间网格中的居住选择和邻域互动',
      }),
    ).toBe('schelling')
  })
})

describe('computeModelDiff', () => {
  test('reports changed sections and the ODD impact', () => {
    const prev = makeConfig()
    const next = makeConfig({
      mechanisms: [
        { id: 'spread', name: 'Spread', trigger: 'contact', effect: 'aware' },
        { id: 'forget', name: 'Forget', trigger: 'time', effect: 'unaware' },
      ],
    })
    const decision = bumpIfStructural(prev, next)
    const diff: ModelDiff = computeModelDiff(prev, next, decision)
    expect(diff.structural).toBe(true)
    expect(diff.fromVersion).toBe('1')
    expect(diff.toVersion).toBe('2')
    expect(diff.changes.map((c) => c.path)).toContain('mechanisms')
    expect(diff.oddImpact).toContain('Process')
    expect(diff.oddImpact).toContain('Submodels')
  })

  test('parameter-default-only change is not structural', () => {
    const prev = makeConfig()
    const next = makeConfig({
      parameters: [{ id: 'p', name: 'p', dtype: 'float', default: 0.9, scope: 'model' }],
    })
    const decision = bumpIfStructural(prev, next)
    expect(decision.structural).toBe(false)
    expect(computeModelDiff(prev, next, decision).changes).toHaveLength(0)
  })
})

describe('abm_run', () => {
  const ORIG_FETCH = globalThis.fetch
  const ORIG_URL = process.env.CC_HAHA_DESKTOP_SERVER_URL

  afterEach(() => {
    globalThis.fetch = ORIG_FETCH
    if (ORIG_URL === undefined) delete process.env.CC_HAHA_DESKTOP_SERVER_URL
    else process.env.CC_HAHA_DESKTOP_SERVER_URL = ORIG_URL
  })

  test('errors when the server URL is not configured', async () => {
    delete process.env.CC_HAHA_DESKTOP_SERVER_URL
    const { data } = await RunTool.call({ simId: 's1' })
    expect(data.started).toBe(false)
    expect(data.error).toContain('CC_HAHA_DESKTOP_SERVER_URL')
  })

  test('posts to the server and returns the runId', async () => {
    process.env.CC_HAHA_DESKTOP_SERVER_URL = 'http://localhost:9999/'
    let captured: { url: string; body: unknown } | null = null
    globalThis.fetch = (async (url: string, init?: { body?: string }) => {
      captured = { url, body: init?.body ? JSON.parse(init.body) : null }
      return { ok: true, status: 200, json: async () => ({ runId: 'run-xyz' }) }
    }) as unknown as typeof fetch

    const { data } = await RunTool.call({ simId: 's1', seed: 7, steps: 5 })
    expect(data.started).toBe(true)
    expect(data.runId).toBe('run-xyz')
    expect(captured!.url).toBe('http://localhost:9999/api/abm/simulations/s1/runs')
    expect(captured!.body).toEqual({ seed: 7, steps: 5 })
  })

  test('reports a non-ok server response', async () => {
    process.env.CC_HAHA_DESKTOP_SERVER_URL = 'http://localhost:9999'
    globalThis.fetch = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch
    const { data } = await RunTool.call({ simId: 's1' })
    expect(data.started).toBe(false)
    expect(data.error).toContain('500')
  })
})

describe('ABM tools against the filesystem store', () => {
  let dir: string
  let projectId: string
  let store: typeof import('../../../server/abm/abmStore.fs.js')

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'abm-tools-'))
    process.env.CLAUDE_CONFIG_DIR = dir
    store = await import('../../../server/abm/abmStore.fs.js')
    const project = await store.createProject({ name: 'p' })
    projectId = project.id
  })

  afterAll(async () => {
    delete process.env.CLAUDE_CONFIG_DIR
    await rm(dir, { recursive: true, force: true })
  })

  async function makeSim(): Promise<string> {
    const sim = await store.createSimulation(projectId, {
      name: 'sim',
      modelVersion: '1',
      config: makeConfig(),
      interface: { seed: 1, steps: 10, params: {} },
    })
    return sim.id
  }

  describe('abm_adopt_simulation', () => {
    test('accepts common model tool-call shapes without input validation errors', () => {
      expect(AdoptSimulationTool.inputSchema.safeParse({ id: 'wildfire-single-ignition-grid' }).success).toBe(true)
      const parsed = AdoptSimulationTool.inputSchema.safeParse({
        proposal: JSON.stringify({
          id: 'wildfire-single-ignition-grid',
          mechanismSummary: 'Single ignition wildfire on a grid',
          keyParams: { ignition_probability: 0.35 },
        }),
      })
      expect(parsed.success).toBe(true)
      if (!parsed.success) throw new Error('expected schema parse to succeed')
      expect(parsed.data.proposal?.keyParams).toEqual({ ignition_probability: 0.35 })
    })

    test('creates a simulation from a proposal slug (not usable as simId)', async () => {
      const { data } = await AdoptSimulationTool.call({
        proposal: {
          id: 'sir-spatial-grid',
          mechanismSummary: 'SIR on a spatial grid',
          keyParams: { steps: 100, beta: 0.3, population: 1000 },
        },
      })
      if (!data.adopted) {
        // Kernel may be unavailable in some CI lanes — still assert a clear error.
        expect(data.error).toBeTruthy()
        return
      }
      expect(data.template).toBe('sir')
      expect(data.simId).toBeTruthy()
      expect(data.simId).not.toBe('sir-spatial-grid')

      const sim = await store.getSimulationById(data.simId!)
      expect(sim).not.toBeNull()
      expect(sim!.interface.steps).toBe(100)
    })

    test('persists adopted network population and topology constraints into the model config', async () => {
      const { data } = await AdoptSimulationTool.call({
        proposal: {
          id: 'rumor-scalefree-network',
          mechanismSummary: 'Classic SI rumor spread on a Barabasi-Albert scale-free network',
          keyParams: {
            steps: 90,
            beta: 0.22,
            population: 240,
            m: 3,
          },
        },
      })
      if (!data.adopted) {
        expect(data.error).toBeTruthy()
        return
      }

      const sim = await store.getSimulationById(data.simId!)
      expect(sim).not.toBeNull()
      expect(sim!.interface.steps).toBe(90)
      expect((sim!.config.initialization as { agent_counts?: Record<string, number> }).agent_counts?.person).toBe(240)
      expect(sim!.config.environment).toMatchObject({
        type: 'network',
        config: {
          kind: 'barabasi_albert',
          params: { m: 3 },
        },
      })
    })

    test('defaults barabasi_albert m when scale-free is inferred without structure params', async () => {
      const { data } = await AdoptSimulationTool.call({
        proposal: {
          id: 'rumor-scalefree-network',
          mechanismSummary: 'Rumor spread on a Barabasi-Albert scale-free network',
          keyParams: {
            steps: 90,
            beta: 0.22,
            population: 240,
          },
        },
      })
      if (!data.adopted) {
        expect(data.error).toBeTruthy()
        return
      }

      const sim = await store.getSimulationById(data.simId!)
      expect(sim).not.toBeNull()
      expect(sim!.config.environment).toMatchObject({
        type: 'network',
        config: {
          kind: 'barabasi_albert',
          params: { m: 3 },
        },
      })
    })

    test('accepts common proposal aliases for network size and small-world structure', async () => {
      const { data } = await AdoptSimulationTool.call({
        proposal: {
          id: 'rumor-smallworld-network',
          mechanismSummary: 'Rumor cascade on a small-world social graph with local clustering',
          keyParams: {
            steps: 80,
            beta: 0.18,
            meta_network_size: 2400,
            mean_degree: 8,
            rewire_prob: 0.15,
          },
        },
      })
      if (!data.adopted) {
        expect(data.error).toBeTruthy()
        return
      }

      const sim = await store.getSimulationById(data.simId!)
      expect(sim).not.toBeNull()
      expect((sim!.config.initialization as { agent_counts?: Record<string, number> }).agent_counts?.person).toBe(2400)
      expect(sim!.config.environment).toMatchObject({
        type: 'network',
        config: {
          kind: 'watts_strogatz',
          params: { k: 8, p: 0.15 },
        },
      })
    })

    test('adopts wildfire proposals as a wildfire model', async () => {
      const { data } = await AdoptSimulationTool.call({
        proposal: {
          id: 'wildfire-rothermel-grid',
          mechanismSummary: '山火沿风向和燃料斑块扩散，形成火线与燃尽区',
          keyParams: { steps: 120, fuel_density: 0.8 },
        },
      })
      if (!data.adopted) {
        expect(data.error).toBeTruthy()
        return
      }
      expect(data.template).toBe('wildfire')

      const sim = await store.getSimulationById(data.simId!)
      expect(sim).not.toBeNull()
      expect(sim!.config.id).toBe('wildfire_rothermel_grid')
      expect(sim!.config.name).toBe('山火沿风向和燃料斑块扩散，形成火线与燃尽区')
      expect(sim!.config.parameters.map((param: { id: string }) => param.id)).toContain('fuel_density')
      expect(sim!.config.parameters.find((param: { id: string }) => param.id === 'fuel_density')?.default).toBe(0.8)
      expect(sim!.interface.params).toEqual({ fuel_density: 0.8 })
    })

    test('normalizes proposal parameter aliases before saving', async () => {
      const { data } = await AdoptSimulationTool.call({
        proposal: {
          id: 'wildfire-single-ignition-grid',
          mechanismSummary: 'Single ignition wildfire grid',
          keyParams: {
            ignition_probability: 0.35,
            wind_strength: 0.2,
            rock_ratio: 0.12,
            ignition_count: 1,
            spot_fire_probability: 0,
            steps: 80,
          },
        },
      })
      if (!data.adopted) {
        expect(data.error).toBeTruthy()
        return
      }
      const sim = await store.getSimulationById(data.simId!)
      expect(sim).not.toBeNull()
      expect(sim!.interface.steps).toBe(80)
      expect(sim!.interface.params).toEqual({
        spread_probability: 0.35,
        wind_bias: 0.2,
        rock_density: 0.12,
        ignition_count: 1,
        spot_fire_probability: 0,
      })
      expect(sim!.config.parameters.find((param: { id: string }) => param.id === 'spread_probability')?.default).toBe(0.35)
      expect(sim!.config.parameters.find((param: { id: string }) => param.id === 'rock_density')?.default).toBe(0.12)
    })
  })

  describe('abm_edit_model', () => {
    test('prompt routes applied edits through the validation agent', async () => {
      const prompt = await EditModelTool.prompt()
      expect(prompt).toContain('abm_validate_simulation')
      expect(prompt).toContain('model validation')
    })

    test('auto-allows a parameter-only edit', async () => {
      const simId = await makeSim()
      const perm = await EditModelTool.checkPermissions({
        simId,
        config: makeConfig({
          parameters: [{ id: 'p', name: 'p', dtype: 'float', default: 0.9, scope: 'model' }],
        }),
      })
      expect(perm.behavior).toBe('allow')
    })

    test('keeps run defaults aligned when a parameter default changes', async () => {
      const simId = await makeSim()
      await store.updateSimulation(projectId, simId, {
        interface: { seed: 42, steps: 50, params: { p: 0.3 } },
      })

      const { data } = await EditModelTool.call({
        simId,
        config: { parameters: [{ id: 'p', default: 0.9 }] },
      })

      expect(data.applied).toBe(true)
      const sim = await store.getSimulationById(simId)
      expect(sim!.config.parameters.find((param: { id: string }) => param.id === 'p')?.default).toBe(0.9)
      expect(sim!.interface.params.p).toBe(0.9)
    })

    test('returns a tool error instead of input validation failure when required ids are missing', async () => {
      expect(() => EditModelTool.inputSchema.parse({})).not.toThrow()
      const { data } = await EditModelTool.call({} as never)
      expect(data.applied).toBe(false)
      expect(data.error).toContain('simulation id')
    })

    test('asks for approval and attaches a diff on a structural edit', async () => {
      const simId = await makeSim()
      const perm = await EditModelTool.checkPermissions({
        simId,
        config: makeConfig({
          mechanisms: [
            { id: 'spread', name: 'Spread', trigger: 'contact', effect: 'aware' },
            { id: 'forget', name: 'Forget', trigger: 'time', effect: 'unaware' },
          ],
        }),
      })
      expect(perm.behavior).toBe('ask')
      if (perm.behavior !== 'ask') throw new Error('expected ask')
      const updated = perm.updatedInput as { diff?: ModelDiff }
      expect(updated.diff?.structural).toBe(true)
      expect(updated.diff?.changes.map((c) => c.path)).toContain('mechanisms')
    })

    test('auto-allows structural edits when the session accepts edits', async () => {
      const simId = await makeSim()
      const perm = await EditModelTool.checkPermissions({
        simId,
        config: makeConfig({
          mechanisms: [
            { id: 'spread', name: 'Spread', trigger: 'contact', effect: 'aware' },
            { id: 'forget', name: 'Forget', trigger: 'time', effect: 'unaware' },
          ],
        }),
      }, permissionContext('acceptEdits'))
      expect(perm.behavior).toBe('allow')
      const updated = perm.updatedInput as { diff?: ModelDiff }
      expect(updated.diff?.structural).toBe(true)
    })

    test('normalizes a focused agent-count patch before approval', async () => {
      const simId = await makeSim()
      const perm = await EditModelTool.checkPermissions({
        simId,
        config: { agents: [{ type: 'person', count: 2000 }] },
      })
      expect(perm.behavior).toBe('ask')
      if (perm.behavior !== 'ask') throw new Error('expected ask')
      const updated = perm.updatedInput as { config?: Record<string, unknown>; diff?: ModelDiff }
      expect(updated.diff?.changes.map((c) => c.path)).toContain('initialization')
      expect(updated.config?.id).toBe('rumor')
      expect(updated.config?.environment).toEqual({ type: 'network', config: {} })
      expect((updated.config?.initialization as { agent_counts?: Record<string, number> }).agent_counts?.person).toBe(2000)
    })

    test('applies a structural edit: bumps version, persists config + ODD', async () => {
      const simId = await makeSim()
      const nextConfig = makeConfig({
        mechanisms: [
          { id: 'spread', name: 'Spread', trigger: 'contact', effect: 'aware' },
          { id: 'forget', name: 'Forget', trigger: 'time', effect: 'unaware' },
        ],
      })
      const { data } = await EditModelTool.call({ simId, config: nextConfig })
      expect(data.applied).toBe(true)
      expect(data.structural).toBe(true)
      expect(data.fromVersion).toBe('1')
      expect(data.toVersion).toBe('2')
      expect(data.previousSimId).toBe(simId)
      expect(data.simId).not.toBe(simId)

      const original = await store.getSimulationById(simId)
      expect(original!.modelVersion).toBe('1')
      expect((original!.config as { version?: string }).version).toBe('1')

      const sim = await store.getSimulationById(data.simId)
      expect(sim!.modelVersion).toBe('2')
      expect(sim!.lineageId).toBe(original!.lineageId)
      expect(sim!.parentSimId).toBe(simId)
      expect((sim!.config as { version?: string }).version).toBe('2')

      const odd = await store.getOdd(projectId, data.simId)
      expect(odd).not.toBeNull()
      expect(odd!.sections.submodels.text).toContain('Forget')
    })

    test('applies a focused agent-count patch without corrupting the full config', async () => {
      const simId = await makeSim()
      const { data } = await EditModelTool.call({
        simId,
        config: { agents: [{ type: 'person', count: 2000 }] },
      })
      expect(data.applied).toBe(true)
      expect(data.structural).toBe(true)
      expect(data.toVersion).toBe('2')

      const sim = await store.getSimulationById(data.simId)
      expect(sim!.config.id).toBe('rumor')
      expect(sim!.config.environment).toEqual({ type: 'network', config: {} })
      expect((sim!.config.agents as Array<{ id?: string }>)[0]!.id).toBe('person')
      expect((sim!.config.initialization as { agent_counts?: Record<string, number> }).agent_counts?.person).toBe(2000)
    })

    test('returns an error for an unknown simulation', async () => {
      const { data } = await EditModelTool.call({ simId: 'nope', config: makeConfig() })
      expect(data.applied).toBe(false)
      expect(data.error).toContain('nope')
    })

    test('merges a loose environment patch into the kernel {type, config} shape', async () => {
      const simId = await makeSim()
      const { data } = await EditModelTool.call({
        simId,
        config: { environment: { width: 200, height: 200 } },
      })
      expect(data.applied).toBe(true)

      const sim = await store.getSimulationById(data.simId)
      expect(sim!.config.environment).toEqual({
        type: 'network',
        config: { width: 200, height: 200 },
      })
    })

    test('normalizes a full-config edit whose environment lost its type/config nesting', async () => {
      const simId = await makeSim()
      const { data } = await EditModelTool.call({
        simId,
        config: makeConfig({ environment: { width: 120, height: 120 } }),
      })
      expect(data.applied).toBe(true)

      const sim = await store.getSimulationById(data.simId)
      expect(sim!.config.environment).toEqual({
        type: 'network',
        config: { width: 120, height: 120 },
      })
    })

    test('strips UI aliases from full configs before saving', async () => {
      const simId = await makeSim()
      const { data } = await EditModelTool.call({
        simId,
        config: makeConfig({
          agents: [{
            id: 'person',
            name: 'Person',
            stateVariables: [{ name: 'state', dtype: 'categorical', default: 'aware', choices: ['aware', 'unaware'] }],
            behaviorRefs: ['spread'],
            count: 77,
          }],
          interface: { seed: 42, steps: 80, params: { p: 0.4 } },
        }),
      })
      expect(data.applied).toBe(true)

      const sim = await store.getSimulationById(data.simId)
      expect(sim!.config.interface).toBeUndefined()
      expect((sim!.config.agents as Array<Record<string, unknown>>)[0]!.stateVariables).toBeUndefined()
      expect((sim!.config.agents as Array<Record<string, unknown>>)[0]!.behaviorRefs).toBeUndefined()
      expect((sim!.config.agents as Array<Record<string, unknown>>)[0]!.state_variables).toEqual([{
        name: 'state',
        dtype: 'categorical',
        default: 'aware',
        choices: ['aware', 'unaware'],
      }])
      expect((sim!.config.initialization as { agent_counts?: Record<string, number> }).agent_counts?.person).toBe(77)
    })

    test('preserves agent state_variables when a structural edit sends empty placeholders', async () => {
      const sim = await store.createSimulation(projectId, {
        name: 'sim',
        modelVersion: '1',
        config: makeConfig({
          agents: [{
            id: 'person',
            name: 'Person',
            state_variables: [{ name: 'state', dtype: 'categorical', default: 'aware', choices: ['aware', 'unaware'] }],
            behavior_refs: ['spread'],
          }],
        }),
        interface: { seed: 1, steps: 10, params: {} },
      })
      const simId = sim.id
      const { data } = await EditModelTool.call({
        simId,
        config: makeConfig({
          agents: [{
            id: 'person',
            name: 'Person',
            state_variables: [{}],
            behavior_refs: [],
          }],
          mechanisms: [
            { id: 'spread', name: 'Spread', trigger: 'contact', effect: 'aware' },
            { id: 'forget', name: 'Forget', trigger: 'time', effect: 'unaware' },
          ],
        }),
      })
      expect(data.applied).toBe(true)

      const updatedSim = await store.getSimulationById(data.simId)
      expect((updatedSim!.config.agents as Array<Record<string, unknown>>)[0]!.state_variables).toEqual([{
        name: 'state',
        dtype: 'categorical',
        default: 'aware',
        choices: ['aware', 'unaware'],
      }])
    })

    test('keeps a well-formed environment patch and allows changing type', async () => {
      const simId = await makeSim()
      const { data } = await EditModelTool.call({
        simId,
        config: { environment: { type: 'grid', config: { width: 60, height: 60, torus: true } } },
      })
      expect(data.applied).toBe(true)

      const sim = await store.getSimulationById(data.simId)
      expect(sim!.config.environment).toEqual({
        type: 'grid',
        config: { width: 60, height: 60, torus: true },
      })
    })
  })

  describe('abm_validate_simulation', () => {
    test('reports blocking issues for a model without observers', async () => {
      const simId = await makeSim()
      const { ValidateSimulationTool } = await import('../validateSimulationTool.js')
      const { data } = await ValidateSimulationTool.call({ simId, includeOdd: false })
      expect(data.valid).toBe(false)
      expect(data.issues.some((issue) => issue.area === 'observers' && issue.level === 'blocking')).toBe(true)
    })

    test('passes a structurally complete model while preserving warnings as feedback', async () => {
      const sim = await store.createSimulation(projectId, {
        name: 'valid sim',
        modelVersion: '1',
        config: makeConfig({
          environment: { type: 'network', config: { kind: 'erdos_renyi' } },
          agents: [{
            id: 'person',
            name: 'Person',
            state_variables: [{ name: 'state', dtype: 'str', default: 'susceptible' }],
            behavior_refs: [],
          }],
          observers: [{ id: 'aware', name: 'Aware', level: 'macro', dtype: 'float', description: 'aware share' }],
        }),
        interface: { seed: 1, steps: 10, params: {} },
      })
      const { ValidateSimulationTool } = await import('../validateSimulationTool.js')
      const { data } = await ValidateSimulationTool.call({ simId: sim.id, includeOdd: false })
      expect(data.valid).toBe(true)
      expect(data.summary).toContain('模型验证通过')
    })
  })

  describe('abm_update_odd', () => {
    test('persists a hand-written section and flags drift for review', async () => {
      const simId = await makeSim()
      const { data } = await UpdateOddTool.call({
        simId,
        section: 'purpose',
        text: 'Hand-written purpose that differs from the derived text.',
      })
      expect(data.applied).toBe(true)
      expect(data.conflicts).toContain('purpose')

      const odd = await store.getOdd(projectId, simId)
      expect(odd!.sections.purpose.derived).toBe(false)
      expect(odd!.sections.purpose.text).toContain('Hand-written purpose')
      expect(odd!.sections.purpose.needsReview).toBe(true)
    })

    test('returns an error for an unknown simulation', async () => {
      const { data } = await UpdateOddTool.call({ simId: 'nope', section: 'purpose', text: 'x' })
      expect(data.applied).toBe(false)
      expect(data.error).toContain('nope')
    })
  })

  describe('abm_explain_interval', () => {
    let runId: string
    let simId: string

    beforeAll(async () => {
      simId = await makeSim()
      runId = 'run-explain-tool'
      await store.putRunRecord(projectId, simId, {
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
      const { traceFile } = await import('../../../server/abm/storagePaths.js')
      const tracePath = traceFile(projectId, simId, runId)
      await mkdir(join(tracePath, '..'), { recursive: true })
      const lines = [
        { kind: 'tick_metrics', tick: 2, metrics: { aware: 0.2 } },
        { kind: 'tick_metrics', tick: 4, metrics: { aware: 0.5 } },
        { kind: 'mechanism_fired', tick: 4, mechanism_id: 'spread', agent_ids: [3] },
      ]
      await writeFile(tracePath, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf-8')
    })

    test('keeps grounded evidence and rejects fabricated evidence', async () => {
      const { data } = await ExplainIntervalTool.call({
        runId,
        from: 2,
        to: 5,
        narrative: 'Awareness rose as the spread mechanism fired.',
        evidence: [
          { tick: 4, metric: 'aware', value: 0.5 },
          { tick: 4, mechanism_id: 'spread' },
          { tick: 4, metric: 'aware', value: 0.99 },
          { tick: 99, metric: 'aware' },
        ],
      })
      expect(data.speculative).toBe(false)
      expect(data.evidence).toHaveLength(2)
      expect(data.rejected).toHaveLength(2)

      const env = decodeEnvelope(ExplainIntervalTool, data)
      expect(env.abmCard).toBe('explanation')
      if (env.abmCard !== 'explanation') throw new Error('unexpected')
      expect(env.speculative).toBe(false)
      expect(env.runId).toBe(runId)
      expect(env.evidence).toHaveLength(2)
    })

    test('marks an explanation speculative when no evidence survives', async () => {
      const { data } = await ExplainIntervalTool.call({
        runId,
        from: 2,
        to: 5,
        narrative: 'Unsupported claim.',
        evidence: [{ tick: 3, metric: 'aware' }],
      })
      expect(data.speculative).toBe(true)
      expect(data.evidence).toHaveLength(0)
    })

    test('flags an unknown run as speculative with an error', async () => {
      const { data } = await ExplainIntervalTool.call({
        runId: 'missing',
        from: 0,
        to: 10,
        narrative: 'n',
        evidence: [{ tick: 1 }],
      })
      expect(data.speculative).toBe(true)
      expect(data.error).toContain('missing')
    })
  })

  describe('abm_attribute_interval', () => {
    let runId: string

    beforeAll(async () => {
      const sim = await store.createSimulation(projectId, {
        name: 'attr sim',
        modelVersion: '1',
        config: makeConfig({
          agents: [{
            id: 'person',
            name: 'Person',
            state_variables: [{
              name: 'state',
              dtype: 'categorical',
              default: 'susceptible',
              choices: ['susceptible', 'infected', 'recovered'],
            }],
            behavior_refs: ['spread'],
          }],
          observers: [{ id: 'infected', name: '感染人数', level: 'macro', dtype: 'int' }],
        }),
        interface: { seed: 1, steps: 10, params: {} },
      })
      runId = 'run-attr-tool'
      await store.putRunRecord(projectId, sim.id, {
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
      const { traceFile } = await import('../../../server/abm/storagePaths.js')
      const tracePath = traceFile(projectId, sim.id, runId)
      await mkdir(join(tracePath, '..'), { recursive: true })
      const lines = [
        { kind: 'tick_metrics', tick: 0, metrics: { infected: 1 } },
        { kind: 'mechanism_fired', tick: 1, mechanism_id: 'spread', agent_ids: [2], key: 'state', old: 'susceptible', new: 'infected' },
        { kind: 'mechanism_fired', tick: 2, mechanism_id: 'spread', agent_ids: [3], key: 'state', old: 'susceptible', new: 'infected' },
        { kind: 'tick_metrics', tick: 2, metrics: { infected: 3 } },
      ]
      await writeFile(tracePath, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf-8')
    })

    test('decomposes the metric delta and serializes an attribution envelope', async () => {
      const { AttributeIntervalTool } = await import('../attributeIntervalTool.js')
      const { data } = await AttributeIntervalTool.call({ runId, metric: 'infected' })
      expect(data.supported).toBe(true)
      expect(data.actualDelta).toBe(2)
      expect(data.attributedNet).toBe(2)
      expect(data.coverage).toBe(1)
      expect(data.contributions).toEqual([
        { mechanism_id: 'spread', gains: 2, losses: 0, net: 2, agents: 2 },
      ])
      // Effective window comes from the real metric anchors, not MAX int.
      expect(data.from).toBe(0)
      expect(data.to).toBe(2)

      const env = decodeEnvelope(AttributeIntervalTool, data)
      expect(env.abmCard).toBe('attribution')
      if (env.abmCard !== 'attribution') throw new Error('unexpected')
      expect(env.supported).toBe(true)
      expect(env.contributions[0]!.mechanism_id).toBe('spread')
    })

    test('reports an unmappable metric as unsupported without fabricating', async () => {
      const { AttributeIntervalTool } = await import('../attributeIntervalTool.js')
      const { data } = await AttributeIntervalTool.call({ runId, metric: 'gini' })
      expect(data.supported).toBe(false)
      expect(data.contributions).toEqual([])
      expect(data.reason).toBeTruthy()
    })

    test('errors cleanly for an unknown run', async () => {
      const { AttributeIntervalTool } = await import('../attributeIntervalTool.js')
      const { data } = await AttributeIntervalTool.call({ runId: 'missing', metric: 'infected' })
      expect(data.supported).toBe(false)
      expect(data.error).toContain('missing')
    })
  })

  describe('abm_counterfactual_run', () => {
    test('is registered as a mutating (research-mode-only) tool', async () => {
      const { ABM_MUTATING_TOOL_NAMES, ABM_COUNTERFACTUAL_TOOL_NAME } = await import('../constants.js')
      expect(ABM_MUTATING_TOOL_NAMES).toContain(ABM_COUNTERFACTUAL_TOOL_NAME)
    })

    test('surfaces contract violations as a failed result, not a crash', async () => {
      const { CounterfactualRunTool } = await import('../counterfactualRunTool.js')
      const { data } = await CounterfactualRunTool.call({
        baseRunId: 'no-such-run',
        params: { beta: 0.5 },
      })
      expect(data.status).toBe('failed')
      expect(data.error).toContain('no-such-run')

      const env = decodeEnvelope(CounterfactualRunTool, data)
      expect(env.abmCard).toBe('counterfactual')
      if (env.abmCard !== 'counterfactual') throw new Error('unexpected')
      expect(env.status).toBe('failed')
      expect(env.changed).toEqual({ beta: 0.5 })
    })

    test('rejects an empty parameter patch', async () => {
      const { CounterfactualRunTool } = await import('../counterfactualRunTool.js')
      const { data } = await CounterfactualRunTool.call({ baseRunId: 'run-attr-tool', params: {} })
      expect(data.status).toBe('failed')
      expect(data.error).toContain('至少改变一个参数')
    })
  })
})
