import { describe, expect, test } from 'bun:test'
import { ensureSnakeModelId, normalizeModelConfigForKernel } from '../modelConfigNormalize.js'
import type { ModelConfig } from '../types.js'

const WILDFIRE_FALLBACK: ModelConfig = {
  schema_version: '1',
  id: 'template_wildfire_grid',
  name: '山火蔓延 (forest fire grid)',
  description: 'wildfire',
  version: '1.0.0',
  agents: [{
    id: 'patch',
    name: '地块',
    state_variables: [{
      name: 'state',
      dtype: 'categorical',
      default: 'tree',
      choices: ['empty', 'tree', 'rock', 'burning', 'burned'],
    }],
    behavior_refs: [],
  }],
  environment: { type: 'grid', config: { width: 80, height: 80, torus: false, moore: true } },
  mechanisms: [
    { id: 'seed_fuel_and_ignition', name: '燃料分布与初始火点', code_ref: '_seed_fuel_and_ignition' },
    { id: 'advance_fire_front', name: '火线推进', code_ref: '_advance_fire' },
    { id: 'fuel_regrowth', name: '燃料再生', code_ref: '_regrow_fuel' },
  ],
  parameters: [],
  observers: [],
  initialization: { agent_counts: { patch: 6400 } },
}

describe('normalizeModelConfigForKernel', () => {
  test('repairs empty state_variables and uuid model id for wildfire edits', () => {
    const broken: ModelConfig = {
      id: '70209ed4-0ddc-4a6d-bdc3-53a55a212719',
      name: '山火蔓延：风从左向右驱动',
      version: '1.0.2',
      agents: [{
        id: 'patch',
        name: '地块',
        state_variables: [{}],
        behavior_refs: [],
      }],
      environment: { type: 'grid', config: { width: 80, height: 80, torus: false, moore: true } },
      mechanisms: [
        { id: 'seed_fuel_and_ignition', name: '燃料分布与初始火点' },
        { id: 'advance_fire_front', name: '火线推进' },
        { id: 'fuel_regrowth', name: '燃料再生' },
      ],
      parameters: [],
      observers: [],
      initialization: { agent_counts: { patch: 6400 } },
    }

    const repaired = normalizeModelConfigForKernel(broken, WILDFIRE_FALLBACK)
    expect(repaired.id).toBe('template_wildfire_grid')
    const patchAgent = (repaired.agents as Array<Record<string, unknown>>)[0]!
    const stateVariables = patchAgent.state_variables as Array<Record<string, unknown>>
    expect(stateVariables[0]).toMatchObject({
      name: 'state',
      dtype: 'categorical',
      default: 'tree',
    })
    const mechanisms = repaired.mechanisms as Array<Record<string, unknown>>
    expect(mechanisms.find((mechanism) => mechanism.id === 'seed_fuel_and_ignition')?.code_ref).toBe('_seed_fuel_and_ignition')
    expect(mechanisms.find((mechanism) => mechanism.id === 'advance_fire_front')?.code_ref).toBe('_advance_fire')
    expect(mechanisms.find((mechanism) => mechanism.id === 'fuel_regrowth')?.code_ref).toBe('_regrow_fuel')
  })

  test('coerces a kebab-case proposal id to snake_case (no valid fallback)', () => {
    // Adopted-proposal configs often arrive kebab-case; the kernel only accepts
    // snake_case, so normalization must repair it in place rather than pass it on.
    const config: ModelConfig = {
      id: 'rumor-content-takedown-smallworld',
      name: 'Rumor takedown',
      version: '1',
      agents: [{
        id: 'person',
        name: 'Person',
        state_variables: [{ name: 'aware', dtype: 'bool', default: false }],
        behavior_refs: [],
      }],
      environment: { type: 'network', config: {} },
      mechanisms: [],
      parameters: [],
      observers: [],
      initialization: { agent_counts: { person: 10 } },
    }

    // Mirrors the run path: raw and fallback are the same stored config.
    const normalized = normalizeModelConfigForKernel(config, config)
    expect(normalized.id).toBe('rumor_content_takedown_smallworld')
    expect(normalized.id).toMatch(/^[a-z][a-z0-9_]*$/)
  })

  test('maps state variable type alias to dtype', () => {
    const config: ModelConfig = {
      id: 'rumor',
      name: 'Rumor',
      version: '1',
      agents: [{
        id: 'person',
        name: 'Person',
        state_variables: [{ name: 'aware', type: 'bool', default: false }],
        behavior_refs: [],
      }],
      environment: { type: 'network', config: {} },
      mechanisms: [],
      parameters: [],
      observers: [],
      initialization: { agent_counts: { person: 10 } },
    }

    const normalized = normalizeModelConfigForKernel(config)
    const stateVariables = ((normalized.agents as Array<Record<string, unknown>>)[0]!.state_variables) as Array<Record<string, unknown>>
    expect(stateVariables[0]?.dtype).toBe('bool')
  })

  test('fills missing barabasi_albert params.m before kernel run', () => {
    const config: ModelConfig = {
      id: 'rumor_scalefree',
      name: 'Rumor scale-free',
      version: '1',
      agents: [{
        id: 'person',
        name: 'Person',
        state_variables: [{ name: 'state', dtype: 'categorical', default: 'susceptible', choices: ['susceptible', 'infected', 'recovered'] }],
        behavior_refs: ['spread'],
      }],
      environment: { type: 'network', config: { kind: 'barabasi_albert', params: { p: 0.05 } } },
      mechanisms: [],
      parameters: [],
      observers: [],
      initialization: { agent_counts: { person: 150 } },
    }

    const normalized = normalizeModelConfigForKernel(config, config)
    expect(normalized.environment).toMatchObject({
      type: 'network',
      config: { kind: 'barabasi_albert', params: { p: 0.05, m: 3 } },
    })
  })
})

describe('ensureSnakeModelId (storage boundary guard)', () => {
  test('coerces a kebab-case id to snake_case while preserving other fields', () => {
    const config = {
      id: 'rumor-content-takedown-smallworld',
      name: 'Rumor takedown',
      version: '1',
      metadata: { source: 'proposal', proposalId: 'rumor-content-takedown-smallworld' },
      mechanisms: [{ id: 'spread' }],
    }
    const guarded = ensureSnakeModelId(config)
    expect(guarded.id).toBe('rumor_content_takedown_smallworld')
    // Unlike the kernel normalizer, non-kernel fields (metadata) survive.
    expect(guarded.metadata).toEqual({ source: 'proposal', proposalId: 'rumor-content-takedown-smallworld' })
    expect(guarded.name).toBe('Rumor takedown')
  })

  test('returns a valid snake_case config unchanged (cheap read-time no-op)', () => {
    const config = { id: 'rumor_network', name: 'Rumor' }
    expect(ensureSnakeModelId(config)).toBe(config)
  })

  test('does not slugify a UUID-like id when no template can be inferred', () => {
    const config = { id: '70209ed4-0ddc-4a6d-bdc3-53a55a212719', name: 'x', mechanisms: [] }
    // UUIDs carry no identity; leave them for the fallback/template path instead
    // of minting "m_70209ed4..." from a meaningless string.
    expect(ensureSnakeModelId(config).id).toBe('70209ed4-0ddc-4a6d-bdc3-53a55a212719')
  })
})
