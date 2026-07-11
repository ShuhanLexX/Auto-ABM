import type { ModelConfig } from './types.js'

export interface ProposalIdentityInput {
  id: string
  mechanismSummary?: string
  expectedMacro?: string
  oddExcerpt?: string | null
  keyParams?: Record<string, unknown> | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

// ModelConfig.id must be snake_case (see abm_kernel schemas): lowercase letters,
// digits, and underscores only, starting with a letter. Adopted proposal slugs
// are frequently kebab-case (e.g. "rumor-content-takedown-smallworld"), so we
// normalize to underscores here to avoid a kernel validation failure on adopt.
function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
}

function readParamId(raw: unknown): string {
  if (!isRecord(raw)) return ''
  return cleanText(raw.id) || cleanText(raw.name)
}

function applyParameterDefaults(
  config: ModelConfig,
  keyParams: Record<string, unknown> | null | undefined,
): ModelConfig {
  if (!keyParams || !Array.isArray(config.parameters)) return config
  const paramKeys = new Set(Object.keys(keyParams))
  if (paramKeys.size === 0) return config

  const parameters = config.parameters.map((raw) => {
    if (!isRecord(raw)) return raw
    const id = readParamId(raw)
    if (!id || !paramKeys.has(id)) return raw
    return { ...raw, default: keyParams[id] }
  })

  return { ...config, parameters }
}

function readPositiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function firstAgentId(config: ModelConfig): string | null {
  const first = Array.isArray(config.agents) ? config.agents.find(isRecord) : null
  return first && typeof first.id === 'string' && first.id.trim() ? first.id : null
}

function readPopulation(keyParams: Record<string, unknown> | null | undefined): number | null {
  if (!keyParams) return null
  for (const key of [
    'population',
    'count',
    'node_count',
    'num_nodes',
    'nodes',
    'network_size',
    'network_nodes',
    'meta_network_size',
    'agent_count',
    'num_agents',
    'agents',
    'users',
    'num_users',
    'n',
  ]) {
    const count = readPositiveNumber(keyParams[key])
    if (count !== null) return Math.round(count)
  }
  return null
}

function inferNetworkKind(
  proposal: ProposalIdentityInput,
  keyParams: Record<string, unknown> | null | undefined,
): 'erdos_renyi' | 'barabasi_albert' | 'watts_strogatz' | 'complete' | null {
  const explicit = typeof keyParams?.network_kind === 'string'
    ? keyParams.network_kind
    : typeof keyParams?.network_type === 'string'
      ? keyParams.network_type
      : typeof keyParams?.topology === 'string'
        ? keyParams.topology
        : typeof keyParams?.graph_model === 'string'
          ? keyParams.graph_model
          : null
  const rawHaystack = `${proposal.id} ${proposal.mechanismSummary ?? ''} ${explicit ?? ''}`.toLowerCase()
  const haystack = rawHaystack.replace(/[^a-z0-9]+/g, '_')
  const tokens = new Set(haystack.split('_').filter(Boolean))
  if (haystack.includes('barabasi') || haystack.includes('scale_free') || haystack.includes('scale-free')) {
    return 'barabasi_albert'
  }
  if (haystack.includes('watts') || haystack.includes('smallworld') || haystack.includes('small-world')) {
    return 'watts_strogatz'
  }
  if (
    tokens.has('er') ||
    haystack.includes('erdos') ||
    haystack.includes('random_graph') ||
    haystack.includes('random_network') ||
    rawHaystack.includes('随机网络') ||
    rawHaystack.includes('随机图')
  ) {
    return 'erdos_renyi'
  }
  if (haystack.includes('complete graph') || haystack.endsWith(' complete') || haystack.includes(' fully connected')) {
    return 'complete'
  }
  return null
}

function ensureNetworkParamsForKind(
  kind: 'erdos_renyi' | 'barabasi_albert' | 'watts_strogatz' | 'complete',
  params: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...params }
  if (kind === 'barabasi_albert') {
    if (readPositiveNumber(next.m) === null) next.m = 3
    return next
  }
  if (kind === 'watts_strogatz') {
    if (readPositiveNumber(next.k) === null) next.k = 4
    if (readPositiveNumber(next.p) === null) next.p = 0.1
    return next
  }
  if (kind === 'erdos_renyi') {
    if (readPositiveNumber(next.p) === null) next.p = 0.05
    return next
  }
  return next
}

function networkParamsForKind(
  kind: 'erdos_renyi' | 'barabasi_albert' | 'watts_strogatz' | 'complete',
  keyParams: Record<string, unknown> | null | undefined,
  current: Record<string, unknown>,
): Record<string, unknown> {
  const next = isRecord(current.params) ? { ...current.params } : {}
  if (kind === 'barabasi_albert') {
    const m = readPositiveNumber(
      keyParams?.m
      ?? keyParams?.attachment_degree
      ?? keyParams?.new_edges_per_node
      ?? keyParams?.mean_degree,
    )
    if (m !== null) next.m = Math.max(1, Math.round(m))
    return ensureNetworkParamsForKind(kind, next)
  }
  if (kind === 'watts_strogatz') {
    const k = readPositiveNumber(
      keyParams?.k
      ?? keyParams?.mean_degree
      ?? keyParams?.degree
      ?? keyParams?.avg_degree,
    )
    const p = readPositiveNumber(
      keyParams?.p
      ?? keyParams?.rewire_prob
      ?? keyParams?.rewiring_probability
      ?? keyParams?.rewire_probability,
    )
    if (k !== null) next.k = Math.max(2, Math.round(k))
    if (p !== null) next.p = p
    return ensureNetworkParamsForKind(kind, next)
  }
  if (kind === 'erdos_renyi') {
    const p = readPositiveNumber(
      keyParams?.p
      ?? keyParams?.edge_probability
      ?? keyParams?.link_probability,
    )
    if (p !== null) next.p = p
    return ensureNetworkParamsForKind(kind, next)
  }
  return next
}

function applyStructuralDefaults(
  config: ModelConfig,
  proposal: ProposalIdentityInput,
): ModelConfig {
  const keyParams = proposal.keyParams
  let next = config

  const agentId = firstAgentId(next)
  const population = readPopulation(keyParams)
  if (agentId && population !== null) {
    const initialization = isRecord(next.initialization) ? { ...next.initialization } : {}
    const currentCounts = isRecord(initialization.agent_counts) ? initialization.agent_counts : {}
    next = {
      ...next,
      initialization: {
        ...initialization,
        agent_counts: {
          ...currentCounts,
          [agentId]: population,
        },
      },
    }
  }

  if (isRecord(next.environment) && next.environment.type === 'network') {
    const kind = inferNetworkKind(proposal, keyParams)
    if (kind) {
      const environmentConfig = isRecord(next.environment.config) ? next.environment.config : {}
      next = {
        ...next,
        environment: {
          ...next.environment,
          config: {
            ...environmentConfig,
            kind,
            params: networkParamsForKind(kind, keyParams, environmentConfig),
          },
        },
      }
    }
  }

  return next
}

/** Give an adopted proposal its own model identity so it is not treated as a version of the base template. */
export function applyProposalIdentity(
  config: ModelConfig,
  proposal: ProposalIdentityInput,
  sourceTemplate: string,
): ModelConfig {
  const templateSlug = slugify(sourceTemplate) || 'model'
  const proposalId = slugify(proposal.id) || slugify(cleanText(proposal.mechanismSummary)) || `${templateSlug}_proposal`
  const modelId = proposalId.startsWith(`${templateSlug}_`)
    ? proposalId
    : `${templateSlug}_${proposalId}`
  const name = cleanText(proposal.mechanismSummary) || cleanText(config.name) || modelId
  const expected = cleanText(proposal.expectedMacro)
  const odd = cleanText(proposal.oddExcerpt)
  const description = [expected, odd].filter(Boolean).join('\n\n') || cleanText(config.description)
  const metadata = isRecord(config.metadata) ? config.metadata : {}
  const withStructure = applyStructuralDefaults(config, proposal)

  return applyParameterDefaults(
    {
      ...withStructure,
      id: modelId,
      name,
      ...(description ? { description } : {}),
      metadata: {
        ...metadata,
        source: 'proposal',
        sourceTemplate,
        proposalId: proposal.id,
      },
    },
    proposal.keyParams,
  )
}
