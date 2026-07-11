import { describe, expect, test } from 'bun:test'
import {
  bumpIfStructural,
  incrementVersion,
  isStructuralChange,
  nextCreatedSimulationVersion,
} from '../modelVersioning.js'
import type { ModelConfig } from '../types.js'

function baseConfig(): ModelConfig {
  return {
    schema_version: '1',
    id: 'rumor',
    name: 'Rumor',
    description: 'A rumor spreading model',
    version: '1',
    agents: [
      {
        id: 'person',
        name: 'Person',
        state_variables: [{ name: 'aware', dtype: 'bool', default: false }],
        behavior_refs: ['spread'],
      },
    ],
    environment: { type: 'network', config: { kind: 'erdos_renyi', params: { n: 100, p: 0.1 } } },
    mechanisms: [
      { id: 'spread', name: 'Spread', trigger: 'neighbor aware', effect: 'become aware' },
    ],
    parameters: [
      { id: 'spread_prob', name: 'Spread probability', dtype: 'float', default: 0.3, min: 0, max: 1 },
    ],
    observers: [{ id: 'awareness', name: 'Awareness', level: 'macro', dtype: 'float' }],
    initialization: { agent_counts: { person: 100 }, notes: 'one seed aware' },
  }
}

describe('incrementVersion', () => {
  test('increments a plain integer', () => {
    expect(incrementVersion('1')).toBe('2')
    expect(incrementVersion('9')).toBe('10')
  })

  test('increments the trailing numeric component of a dotted version', () => {
    expect(incrementVersion('0.3.1')).toBe('0.3.2')
    expect(incrementVersion('v2')).toBe('v3')
  })

  test('appends when there is no numeric component', () => {
    expect(incrementVersion('alpha')).toBe('alpha.1')
    expect(incrementVersion('')).toBe('1')
  })
})

describe('nextCreatedSimulationVersion', () => {
  test('keeps the requested version for the first simulation in a model line', () => {
    expect(nextCreatedSimulationVersion([], '1.0.0')).toBe('1.0.0')
  })

  test('increments when adopting the same model again in one research question', () => {
    expect(nextCreatedSimulationVersion(['1.0.0'], '1.0.0')).toBe('1.0.1')
    expect(nextCreatedSimulationVersion(['1.0.0', '1.0.1'], '1.0.0')).toBe('1.0.2')
  })

  test('does not downgrade an explicitly newer requested version', () => {
    expect(nextCreatedSimulationVersion(['1', '2'], '4')).toBe('4')
  })
})

describe('isStructuralChange', () => {
  test('parameter default-only change is NOT structural', () => {
    const prev = baseConfig()
    const next = baseConfig()
    ;(next.parameters as Array<{ default: number }>)[0].default = 0.8
    expect(isStructuralChange(prev, next)).toBe(false)
  })

  test('adding a mechanism IS structural', () => {
    const prev = baseConfig()
    const next = baseConfig()
    ;(next.mechanisms as unknown[]).push({
      id: 'forget',
      name: 'Forget',
      trigger: 'random',
      effect: 'become unaware',
    })
    expect(isStructuralChange(prev, next)).toBe(true)
  })

  test('changing the environment topology IS structural', () => {
    const prev = baseConfig()
    const next = baseConfig()
    ;(next.environment as { type: string }).type = 'grid'
    expect(isStructuralChange(prev, next)).toBe(true)
  })

  test('changing the initialized agent count IS structural', () => {
    const prev = baseConfig()
    const next = baseConfig()
    ;(next.initialization as { agent_counts: Record<string, number> }).agent_counts.person = 2000
    expect(isStructuralChange(prev, next)).toBe(true)
  })

  test('adding a state variable IS structural', () => {
    const prev = baseConfig()
    const next = baseConfig()
    ;(next.agents as Array<{ state_variables: unknown[] }>)[0].state_variables.push({
      name: 'fatigue',
      dtype: 'float',
      default: 0,
    })
    expect(isStructuralChange(prev, next)).toBe(true)
  })

  test('field order does not affect the signature', () => {
    const prev = baseConfig()
    const next = baseConfig()
    ;(next.mechanisms as unknown[]).unshift({ id: 'noop', name: 'Noop' })
    ;(prev.mechanisms as unknown[]).push({ id: 'noop', name: 'Noop' })
    expect(isStructuralChange(prev, next)).toBe(false)
  })
})

describe('bumpIfStructural', () => {
  test('bumps version on a structural change', () => {
    const prev = baseConfig()
    const next = baseConfig()
    ;(next.observers as unknown[]).push({ id: 'extra', name: 'Extra', level: 'micro', dtype: 'int' })
    const decision = bumpIfStructural(prev, next)
    expect(decision.structural).toBe(true)
    expect(decision.version).toBe('2')
  })

  test('keeps version when only a parameter default changes', () => {
    const prev = baseConfig()
    const next = baseConfig()
    ;(next.parameters as Array<{ default: number }>)[0].default = 0.5
    const decision = bumpIfStructural(prev, next)
    expect(decision.structural).toBe(false)
    expect(decision.version).toBe('1')
  })
})
