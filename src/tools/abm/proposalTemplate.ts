/** Server mirror of desktop/src/abm/proposalTemplate.ts — keep mapping in sync. */

export function inferTemplateFromProposal(proposal: {
  id: string
  mechanismSummary?: string
}): string {
  const haystack = `${proposal.id} ${proposal.mechanismSummary ?? ''}`.toLowerCase()
  const tokenHaystack = ` ${haystack.replace(/[^a-z0-9]+/g, ' ')} `
  const spatialGrid = containsAny(haystack, ['spatial', 'grid', '空间', '网格', '栅格', '地理', '小区'])
  const networkLike = tokenHaystack.includes(' er ') ||
    containsAny(haystack, [
      'network',
      'graph',
      'smallworld',
      'small-world',
      'scale_free',
      'scale-free',
      'barabasi',
      'erdos',
      'er-network',
      'er network',
      '随机网络',
      '随机图',
      '网络',
      '关系',
      '社交',
      '接触',
      '好友',
      '连边',
      '节点',
      '互动',
    ])
  const epidemic = containsAny(haystack, ['sir', 'epidem', 'infect', 'seir', '疫情', '感染', '传染病', '流行病'])
  if (containsAny(haystack, ['wildfire', 'forest fire', 'fire spread', 'firebreak', 'fuel', 'rothermel', '山火', '野火', '林火', '森林火灾', '火灾', '火势', '燃烧', '火线', '飞火', '防火带', '燃料'])) {
    return 'wildfire'
  }
  if ((epidemic || containsAny(haystack, ['vaccination', 'vaccine', 'hesitancy', '免疫', '疫苗'])) && networkLike && !spatialGrid) {
    return 'rumor'
  }
  if (epidemic || containsAny(haystack, ['vaccination', 'vaccine', 'hesitancy', '免疫', '疫苗'])) return 'sir'
  if (containsAny(haystack, ['traffic', 'route', 'commuter', 'congestion', 'fishery', 'commons', 'resource', 'climate treaty', 'sanction', 'punishment', '交通', '路线', '拥堵', '渔场', '资源治理', '气候', '惩罚'])) {
    return 'public_goods'
  }
  if (containsAny(haystack, ['evacuation', 'mobilization', 'protest', 'riot', 'bank run', 'panic', 'threshold cascade', '疏散', '动员', '抗议', '骚乱', '挤兑', '恐慌', '阈值级联'])) {
    return 'social_influence'
  }
  if (containsAny(haystack, ['herding', 'market sentiment', 'echo chamber', 'polarization', '羊群', '市场情绪', '回音室', '极化'])) {
    return 'opinion'
  }
  if (containsAny(haystack, ['schelling', 'segregat', '隔离', '聚居', '邻域偏好'])) return 'schelling'
  if (containsAny(haystack, ['diffusion', 'innovation', 'adoption', '扩散', '采纳', '创新'])) return 'diffusion'
  if (containsAny(haystack, ['opinion', 'consensus', '观点', '意见', '舆论', '态度', '共识'])) return 'opinion'
  if ((haystack.includes('public') && haystack.includes('good')) || containsAny(haystack, ['公共品', '合作', '搭便车'])) {
    return 'public_goods'
  }
  if ((haystack.includes('social') && haystack.includes('influence')) || containsAny(haystack, ['社会影响', '同伴影响', '从众', '影响力'])) {
    return 'social_influence'
  }
  if (containsAny(haystack, ['rumor', 'aware', '谣言', '辟谣', '舆情'])) return 'rumor'
  if (spatialGrid) return 'schelling'
  if (networkLike) {
    return 'rumor'
  }
  return 'diffusion'
}

function containsAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle))
}

const PARAMETER_ALIASES: Record<string, Record<string, string>> = {
  wildfire: {
    ignition_probability: 'spread_probability',
    spread_prob: 'spread_probability',
    spread_probability: 'spread_probability',
    spotting_probability: 'spot_fire_probability',
    spot_fire_probability: 'spot_fire_probability',
    spot_fire_prob: 'spot_fire_probability',
    wind_strength: 'wind_bias',
    wind_bias: 'wind_bias',
    tree_density: 'fuel_density',
    fuel_density: 'fuel_density',
    rock_density: 'rock_density',
    rock_ratio: 'rock_density',
    stone_density: 'rock_density',
    regrowth_rate: 'regrowth_rate_per_tick',
    regrowth_rate_per_tick: 'regrowth_rate_per_tick',
    initial_ignitions: 'ignition_count',
    ignition_points: 'ignition_count',
    ignition_count: 'ignition_count',
  },
  diffusion: {
    external_influence: 'innovation_p',
    innovation_probability: 'innovation_p',
    innovation_p: 'innovation_p',
    imitation_rate: 'imitation_q',
    imitation_q: 'imitation_q',
    initial_adopters: 'initial_adopters',
  },
  opinion: {
    confidence: 'confidence_threshold',
    confidence_threshold: 'confidence_threshold',
    mu: 'convergence_rate',
    convergence_rate: 'convergence_rate',
  },
  public_goods: {
    multiplier: 'multiplication_factor',
    multiplication_factor: 'multiplication_factor',
    contribution_cost: 'cost',
    cost: 'cost',
    cooperation_initial: 'initial_coop_rate',
    initial_coop_rate: 'initial_coop_rate',
    selection_strength: 'selection_strength',
  },
  social_influence: {
    threshold_mean: 'mean_threshold',
    mean_threshold: 'mean_threshold',
    initial_seed: 'initial_active',
    initial_active: 'initial_active',
  },
}

export function extractRunInterface(keyParams: Record<string, unknown> | undefined, template?: string): {
  seed?: number
  steps?: number
  params: Record<string, unknown>
} {
  const raw = { ...(keyParams ?? {}) }
  let seed: number | undefined
  let steps: number | undefined
  if (typeof raw.seed === 'number') {
    seed = raw.seed
    delete raw.seed
  }
  if (typeof raw.steps === 'number') {
    steps = raw.steps
    delete raw.steps
  }
  return { seed, steps, params: normalizeParameterAliases(raw, template) }
}

function normalizeParameterAliases(params: Record<string, unknown>, template?: string): Record<string, unknown> {
  const aliases = template ? PARAMETER_ALIASES[template] : undefined
  if (!aliases) return params
  const normalized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(params)) {
    normalized[aliases[key] ?? key] = value
  }
  return normalized
}
