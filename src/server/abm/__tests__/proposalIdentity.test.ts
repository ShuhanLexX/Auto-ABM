import { describe, expect, test } from 'bun:test'
import { applyProposalIdentity } from '../proposalIdentity.js'

describe('applyProposalIdentity', () => {
  test('gives an adopted proposal a distinct model id and readable name', () => {
    const config = applyProposalIdentity(
      {
        id: 'wildfire',
        name: 'Wildfire',
        version: '1',
        parameters: [{ id: 'fuel_density', name: 'fuel density', default: 0.5 }],
      },
      {
        id: 'fuel-break-grid',
        mechanismSummary: 'Fuel breaks slow the fire front',
        expectedMacro: 'Burned area drops when the break is wide enough',
        keyParams: { fuel_density: 0.72 },
      },
      'wildfire',
    )

    expect(config.id).toBe('wildfire_fuel_break_grid')
    expect(config.name).toBe('Fuel breaks slow the fire front')
    expect(config.description).toContain('Burned area drops')
    expect(config.metadata).toMatchObject({
      source: 'proposal',
      sourceTemplate: 'wildfire',
      proposalId: 'fuel-break-grid',
    })
    expect(config.parameters).toEqual([
      { id: 'fuel_density', name: 'fuel density', default: 0.72 },
    ])
  })

  // Regression: the run panel reported "非法 ModelConfig ... 必须为小写蛇形" for the
  // adopted id 'sir-rumor-baseline-sir-smallworld'. That kebab-case shape must never
  // survive adoption — the kernel rejects any id that is not snake_case.
  test('coerces a kebab-case rumor proposal id to a snake_case model id', () => {
    const config = applyProposalIdentity(
      { id: 'rumor_smallworld', name: 'SIR rumor', version: '1', parameters: [] },
      {
        id: 'rumor-baseline-sir-smallworld',
        mechanismSummary: 'Classic SIR rumor transmission on a small-world network',
      },
      'sir',
    )

    expect(config.id).toBe('sir_rumor_baseline_sir_smallworld')
    expect(config.id).toMatch(/^[a-z][a-z0-9_]*$/)
    expect(config.id).not.toContain('-')
  })

  test('applies ER network proposal structure to network templates', () => {
    const config = applyProposalIdentity(
      {
        id: 'reference_rumor',
        name: 'Network SIR',
        version: '1',
        agents: [{ id: 'person', name: 'Person' }],
        environment: { type: 'network', config: { kind: 'erdos_renyi', params: { p: 0.06 } } },
        parameters: [
          { id: 'beta', name: 'beta', default: 0.08 },
          { id: 'gamma', name: 'gamma', default: 0.02 },
          { id: 'initial_infected', name: 'initial infected', default: 3 },
        ],
        initialization: { agent_counts: { person: 100 } },
      },
      {
        id: 'sir-er-network-basic',
        mechanismSummary: 'ER随机网络上固定概率传播(S→I)和固定概率恢复(I→R)',
        keyParams: {
          node_count: 100,
          edge_probability: 0.08,
          beta: 0.3,
          gamma: 0.1,
          initial_infected: 3,
        },
      },
      'rumor',
    )

    expect(config.environment).toEqual({
      type: 'network',
      config: { kind: 'erdos_renyi', params: { p: 0.08 } },
    })
    expect(config.initialization).toEqual({ agent_counts: { person: 100 } })
    expect(config.parameters).toEqual([
      { id: 'beta', name: 'beta', default: 0.3 },
      { id: 'gamma', name: 'gamma', default: 0.1 },
      { id: 'initial_infected', name: 'initial infected', default: 3 },
    ])
  })
})
