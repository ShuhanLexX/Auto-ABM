import { describe, expect, test } from 'bun:test'
import {
  deriveOdd,
  mergeOdd,
  ODD_SECTION_KEYS,
  type Odd,
} from '../oddService.js'
import type { ModelConfig } from '../types.js'

function baseConfig(): ModelConfig {
  return {
    schema_version: '1',
    id: 'rumor',
    name: 'Rumor',
    description: 'A rumor spreading model on a network',
    version: '1',
    agents: [
      {
        id: 'person',
        name: 'Person',
        description: 'A network participant',
        state_variables: [{ name: 'aware', dtype: 'bool', default: false }],
        behavior_refs: ['spread'],
      },
    ],
    environment: { type: 'network', config: { kind: 'erdos_renyi' } },
    mechanisms: [
      {
        id: 'spread',
        name: 'Spread',
        description: 'Aware neighbours convince unaware ones',
        trigger: 'a neighbour is aware',
        effect: 'agent becomes aware',
        code_ref: 'mechanisms.spread',
      },
    ],
    parameters: [
      { id: 'spread_prob', name: 'Spread probability', dtype: 'float', default: 0.3, min: 0, max: 1 },
    ],
    observers: [{ id: 'awareness', name: 'Awareness', level: 'macro', dtype: 'float' }],
    initialization: { agent_counts: { person: 100 }, notes: 'one randomly-seeded aware agent' },
  }
}

describe('deriveOdd', () => {
  test('produces all seven sections, marked derived', () => {
    const odd = deriveOdd(baseConfig())
    for (const key of ODD_SECTION_KEYS) {
      expect(odd.sections[key]).toBeDefined()
      expect(odd.sections[key].derived).toBe(true)
      expect(odd.sections[key].text.length).toBeGreaterThan(0)
    }
    expect(odd.modelId).toBe('rumor')
    expect(odd.modelVersion).toBe('1')
  })

  test('every section traces to real config fields (no invention)', () => {
    const odd = deriveOdd(baseConfig())
    expect(odd.sections.purpose.text).toContain('rumor spreading model')
    expect(odd.sections.entities.text).toContain('person')
    expect(odd.sections.entities.text).toContain('network')
    expect(odd.sections.process.text).toContain('Spread')
    expect(odd.sections.initialization.text).toContain('100')
    expect(odd.sections.input.text).toContain('Spread probability')
    expect(odd.sections.submodels.text).toContain('mechanisms.spread')
  })
})

describe('mergeOdd', () => {
  test('with no previous ODD, returns the derived ODD unchanged', () => {
    const derived = deriveOdd(baseConfig())
    const { odd, conflicts } = mergeOdd(null, derived)
    expect(odd).toBe(derived)
    expect(conflicts).toEqual([])
  })

  test('refreshes auto-derived sections from the new model', () => {
    const prev = deriveOdd(baseConfig())
    const next = baseConfig()
    ;(next as { description: string }).description = 'A completely rewritten model purpose'
    const derived = deriveOdd(next)
    const { odd, conflicts } = mergeOdd(prev, derived)
    expect(odd.sections.purpose.text).toContain('completely rewritten')
    expect(conflicts).toEqual([])
  })

  test('preserves a hand-written section and flags it for review on model drift', () => {
    const prev = deriveOdd(baseConfig())
    // Simulate the user hand-editing the purpose section.
    const handEdited: Odd = {
      ...prev,
      sections: {
        ...prev.sections,
        purpose: { text: 'My carefully written research purpose.', derived: false },
      },
    }

    // Model purpose drifts.
    const next = baseConfig()
    ;(next as { description: string }).description = 'Drifted purpose'
    const derived = deriveOdd(next)

    const { odd, conflicts } = mergeOdd(handEdited, derived)
    // Hand-written text is kept verbatim, never overwritten.
    expect(odd.sections.purpose.text).toBe('My carefully written research purpose.')
    expect(odd.sections.purpose.derived).toBe(false)
    expect(odd.sections.purpose.needsReview).toBe(true)
    expect(conflicts).toContain('purpose')
  })

  test('does not flag a hand-written section when the derivation is unchanged', () => {
    const prev = deriveOdd(baseConfig())
    const handEdited: Odd = {
      ...prev,
      sections: {
        ...prev.sections,
        // Hand-written but identical to what would be derived.
        purpose: { ...prev.sections.purpose, derived: false },
      },
    }
    const derived = deriveOdd(baseConfig())
    const { odd, conflicts } = mergeOdd(handEdited, derived)
    expect(odd.sections.purpose.needsReview).toBeUndefined()
    expect(conflicts).not.toContain('purpose')
  })
})
