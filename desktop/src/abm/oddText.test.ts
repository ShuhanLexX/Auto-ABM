import { describe, expect, it } from 'vitest'
import { localizeOdd } from './oddText'
import { ODD_SECTION_KEYS, type ModelConfig, type Odd } from './types'

const RUMOR_CONFIG: ModelConfig = {
  id: 'reference_rumor',
  name: '谣言传播 + 辟谣干预 (SIR on network)',
  version: '1.0.0',
  description: '社交网络上的谣言传播与辟谣干预参考模型，作为内核/契约自洽基线。',
  agents: [
    {
      id: 'person',
      name: '个体',
      description: '社交网络中的个体，持 S/I/R 三态之一。',
      state_variables: [{ name: 'state', dtype: 'categorical', default: 'susceptible' }],
      behavior_refs: ['spread', 'recover'],
    },
  ],
  environment: { type: 'network', config: { kind: 'watts_strogatz' } },
  mechanisms: [
    { id: 'spread', name: '谣言传播', trigger: '每步：infected 个体', effect: '以 beta 概率感染 susceptible 邻居' },
    { id: 'recover', name: '自然消退', trigger: '每步：infected 个体', effect: '以 gamma 概率转为 recovered' },
  ],
  parameters: [
    { id: 'beta', name: '传播概率', dtype: 'float', default: 0.08, min: 0, max: 1, step: 0.01 },
  ],
  observers: [
    { id: 'infected', name: '感染数', dtype: 'int' },
  ],
  initialization: { agent_counts: { person: 500 }, notes: '全员初始 susceptible，随机播种 initial_infected 个 infected。' },
}

function makeStoredOdd(): Odd {
  const sections = {} as Odd['sections']
  for (const key of ODD_SECTION_KEYS) {
    sections[key] = { text: `中文占位 ${key}`, derived: true }
  }
  return { schemaVersion: 1, modelId: 'reference_rumor', modelVersion: '1.0.0', generatedAt: 'now', sections }
}

const CJK = /[\u4e00-\u9fff]/

describe('localizeOdd', () => {
  it('re-renders derived sections in English for a non-Chinese locale', () => {
    const localized = localizeOdd(makeStoredOdd(), RUMOR_CONFIG, 'en')!
    for (const key of ODD_SECTION_KEYS) {
      expect(localized.sections[key]!.text).not.toMatch(CJK)
    }
    // Built-in model + mechanism + parameter names come from the display tables.
    expect(localized.sections.purpose!.text).toContain('Rumor Spread')
    expect(localized.sections.process!.text).toContain('Rumor Spread')
    expect(localized.sections.input!.text).toContain('Transmission Probability')
    expect(localized.sections.initialization!.text).toContain('susceptible')
  })

  it('returns the stored (Chinese) ODD unchanged for a Chinese locale', () => {
    const stored = makeStoredOdd()
    expect(localizeOdd(stored, RUMOR_CONFIG, 'zh')).toBe(stored)
    expect(localizeOdd(stored, RUMOR_CONFIG, 'zh-TW')).toBe(stored)
  })

  it('preserves hand-written sections verbatim while localizing derived ones', () => {
    const stored = makeStoredOdd()
    stored.sections.purpose = { text: 'My own purpose notes', derived: false }
    const localized = localizeOdd(stored, RUMOR_CONFIG, 'en')!
    expect(localized.sections.purpose!.text).toBe('My own purpose notes')
    expect(localized.sections.purpose!.derived).toBe(false)
    expect(localized.sections.entities!.text).not.toMatch(CJK)
  })

  it('returns the ODD untouched when no config is available', () => {
    const stored = makeStoredOdd()
    expect(localizeOdd(stored, null, 'en')).toBe(stored)
  })
})
