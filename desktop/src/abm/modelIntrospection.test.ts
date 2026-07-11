import { describe, expect, it } from 'vitest'
import { readMechanismNodes, readParameterSpecs } from './modelIntrospection'
import type { AbmSimulation } from './types'

const baseSimulation: AbmSimulation = {
  id: 'sim-1',
  projectId: 'project-1',
  name: 'Wildfire',
  modelVersion: '1.0.0',
  createdAt: '2026-01-01T00:00:00.000Z',
  schemaVersion: 1,
  interface: {
    seed: 42,
    steps: 50,
    params: { fuel_density: 0.72 },
  },
  config: {
    parameters: [
      {
        id: 'fuel_density',
        name: '燃料密度',
        description: '初始有燃料的地块比例，决定火线是否能连通。',
        default: 0.6,
      },
    ],
    mechanisms: [
      {
        id: 'advance_fire_front',
        name: '火线推进',
        trigger: '每个 tick 执行',
        effect: '燃烧地块转为 burned',
      },
    ],
  },
}

describe('modelIntrospection localized display text', () => {
  it('localizes built-in parameter and mechanism labels in English', () => {
    const [parameter] = readParameterSpecs(baseSimulation, 'en')
    const [mechanism] = readMechanismNodes(baseSimulation.config, 'en')

    expect(parameter).toMatchObject({
      id: 'fuel_density',
      label: 'Tree Density',
      description: 'Share of patches initialized with burnable trees; controls whether the fire front connects.',
      value: 0.72,
    })
    expect(mechanism).toMatchObject({
      id: 'advance_fire_front',
      label: 'Fire Front Advance',
      trigger: 'Each tick while fire can spread',
    })
  })

  it('preserves kernel Chinese labels in Chinese locale', () => {
    const [parameter] = readParameterSpecs(baseSimulation, 'zh')
    const [mechanism] = readMechanismNodes(baseSimulation.config, 'zh')

    expect(parameter?.label).toBe('燃料密度')
    expect(mechanism?.label).toBe('火线推进')
  })
})
