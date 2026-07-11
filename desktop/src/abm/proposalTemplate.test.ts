import { describe, expect, it } from 'vitest'
import { extractRunInterface, inferTemplateFromProposal } from './proposalTemplate'

describe('inferTemplateFromProposal', () => {
  it('routes social and relation-heavy Chinese topics to a network simulation', () => {
    expect(
      inferTemplateFromProposal({
        id: 'public-opinion-network',
        mechanismSummary: '社交关系网络中的舆情传播与接触影响',
      }),
    ).toBe('opinion')
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
  })

  it('keeps explicitly spatial grid topics on the grid template', () => {
    expect(
      inferTemplateFromProposal({
        id: 'sir-spatial-grid',
        mechanismSummary: '空间网格中的疫情感染扩散',
      }),
    ).toBe('sir')
  })

  it('routes wildfire and generic spatial topics away from epidemic defaults', () => {
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

describe('extractRunInterface', () => {
  it('normalizes common proposal parameter aliases to runnable model parameters', () => {
    expect(
      extractRunInterface(
        { ignition_probability: 0.35, wind_strength: 0.2, rock_ratio: 0.12, steps: 80 },
        'wildfire',
      ),
    ).toEqual({
      seed: undefined,
      steps: 80,
      params: { spread_probability: 0.35, wind_bias: 0.2, rock_density: 0.12 },
    })
  })
})
