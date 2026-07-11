import type { ModelConfig } from './types.js'

export interface NormalizedModelConfig {
  config: ModelConfig
  interfacePatch: {
    seed?: number
    steps?: number
    params?: Record<string, unknown>
  }
}

const TOP_LEVEL_KEYS = new Set([
  'schema_version',
  'id',
  'name',
  'description',
  'version',
  'agents',
  'environment',
  'mechanisms',
  'parameters',
  'observers',
  'initialization',
  'kernel_version',
  'created_at',
])

const STATE_VARIABLE_KEYS = new Set([
  'name',
  'dtype',
  'default',
  'choices',
  'value_range',
  'description',
])

const STATE_DTYPES = new Set(['bool', 'int', 'float', 'str', 'categorical'])

const AGENT_KEYS = new Set(['id', 'name', 'description', 'state_variables', 'behavior_refs'])
const ENVIRONMENT_TYPES = new Set(['none', 'grid', 'network', 'continuous'])
const MECHANISM_KEYS = new Set(['id', 'name', 'description', 'trigger', 'effect', 'code_ref'])
const PARAMETER_KEYS = new Set(['id', 'name', 'dtype', 'default', 'min', 'max', 'step', 'choices', 'scope', 'description'])
const OBSERVER_KEYS = new Set(['id', 'name', 'level', 'dtype', 'description'])
const INITIALIZATION_KEYS = new Set(['agent_counts', 'agent_overrides', 'notes'])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SNAKE_CASE_RE = /^[a-z][a-z0-9_]*$/

/** Kernel template defaults for common agent state when edits wipe variables. */
const TEMPLATE_STATE_BY_MODEL_AND_AGENT: Record<string, Record<string, Record<string, unknown>[]>> = {
  template_wildfire_grid: {
    patch: [{
      name: 'state',
      dtype: 'categorical',
      default: 'tree',
      choices: ['empty', 'tree', 'rock', 'burning', 'burned'],
      description: '空地 / 树木 / 岩石 / 燃烧中 / 已燃尽',
    }],
  },
}

const TEMPLATE_MECHANISM_CODE_REFS: Record<string, Record<string, string>> = {
  template_wildfire_grid: {
    seed_fuel_and_ignition: '_seed_fuel_and_ignition',
    advance_fire_front: '_advance_fire',
    fuel_regrowth: '_regrow_fuel',
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function copyKnown(record: Record<string, unknown>, keys: Set<string>): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  for (const key of keys) {
    if (key in record) next[key] = record[key]
  }
  return next
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isUuidLike(value: string): boolean {
  return UUID_RE.test(value)
}

function isValidSnakeModelId(value: string): boolean {
  return SNAKE_CASE_RE.test(value) && !isUuidLike(value)
}

export function isValidStateVariableShape(raw: unknown): raw is Record<string, unknown> {
  if (!isRecord(raw)) return false
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const dtype = typeof raw.dtype === 'string'
    ? raw.dtype
    : typeof raw.type === 'string'
      ? raw.type
      : ''
  return name.length > 0 && STATE_DTYPES.has(dtype) && 'default' in raw
}

function mechanismIdSet(config: Record<string, unknown>): Set<string> {
  const mechanisms = Array.isArray(config.mechanisms) ? config.mechanisms : []
  return new Set(
    mechanisms
      .filter(isRecord)
      .map((mechanism) => mechanism.id)
      .filter((id): id is string => typeof id === 'string'),
  )
}

function inferTemplateModelId(config: Record<string, unknown>): string | undefined {
  const ids = mechanismIdSet(config)
  if (['seed_fuel_and_ignition', 'advance_fire_front', 'fuel_regrowth'].every((id) => ids.has(id))) {
    return 'template_wildfire_grid'
  }
  return undefined
}

function readAgentStateVariables(agent: Record<string, unknown> | undefined): unknown[] {
  if (!agent) return []
  if (Array.isArray(agent.state_variables)) return agent.state_variables
  if (Array.isArray(agent.stateVariables)) return agent.stateVariables
  return []
}

function findFallbackAgent(fallback: ModelConfig | undefined, agentId: string): Record<string, unknown> | undefined {
  if (!fallback || !agentId) return undefined
  const agents = Array.isArray(fallback.agents) ? fallback.agents : []
  return agents.find((agent) => isRecord(agent) && agent.id === agentId)
}

function normalizeStateVariable(raw: unknown, fallback?: Record<string, unknown>): Record<string, unknown> {
  const record = isRecord(raw) ? raw : {}
  const dtype = typeof record.dtype === 'string'
    ? record.dtype
    : typeof record.type === 'string'
      ? record.type
      : typeof fallback?.dtype === 'string'
        ? fallback.dtype
        : typeof fallback?.type === 'string'
          ? fallback.type
          : undefined
  const withAliases: Record<string, unknown> = {
    ...record,
    ...(dtype ? { dtype } : {}),
    ...('valueRange' in record && !('value_range' in record) ? { value_range: record.valueRange } : {}),
  }
  if ((!withAliases.name || withAliases.name === '') && typeof fallback?.name === 'string') {
    withAliases.name = fallback.name
  }
  if (!('default' in withAliases) && 'default' in (fallback ?? {})) {
    withAliases.default = fallback!.default
  }
  if (!Array.isArray(withAliases.choices) && Array.isArray(fallback?.choices)) {
    withAliases.choices = fallback.choices
  }
  return copyKnown(withAliases, STATE_VARIABLE_KEYS)
}

function repairStateVariableList(
  variables: unknown[],
  fallbackVariables: unknown[],
  templateModelId: string,
  agentId: string,
): Record<string, unknown>[] {
  const normalized = variables.map((raw, index) => {
    const fallbackEntry = isRecord(fallbackVariables[index])
      ? fallbackVariables[index]
      : isRecord(fallbackVariables[0])
        ? fallbackVariables[0]
        : undefined
    return normalizeStateVariable(raw, fallbackEntry)
  })

  const valid = normalized.filter(isValidStateVariableShape)
  if (valid.length > 0) return valid

  const fromFallback = fallbackVariables
    .map((raw) => normalizeStateVariable(raw))
    .filter(isValidStateVariableShape)
  if (fromFallback.length > 0) return fromFallback

  const fromTemplate = TEMPLATE_STATE_BY_MODEL_AND_AGENT[templateModelId]?.[agentId]
  if (fromTemplate) {
    return fromTemplate.map((raw) => normalizeStateVariable(raw)).filter(isValidStateVariableShape)
  }

  return valid
}

// Coerce a human/proposal id (kebab-case, spaces, mixed case) into the
// snake_case the kernel requires: lowercase, digits, underscores, leading letter.
function slugifyModelId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^([0-9])/, 'm_$1')
    .slice(0, 80)
}

function repairModelId(config: Record<string, unknown>, fallback?: ModelConfig): void {
  const currentId = typeof config.id === 'string' ? config.id : ''
  if (currentId && isValidSnakeModelId(currentId)) return

  // A real but wrongly-shaped id (e.g. "rumor-content-takedown-smallworld") is a
  // meaningful name; convert it to snake_case instead of discarding it. UUID-like
  // ids carry no identity, so those fall through to the fallback/template below.
  if (currentId && !isUuidLike(currentId)) {
    const slug = slugifyModelId(currentId)
    if (isValidSnakeModelId(slug)) {
      config.id = slug
      return
    }
  }

  const fallbackId = fallback && typeof fallback.id === 'string' ? fallback.id : ''
  if (fallbackId && isValidSnakeModelId(fallbackId)) {
    config.id = fallbackId
    return
  }

  const inferred = inferTemplateModelId(config)
  if (inferred) config.id = inferred
}

function repairMechanisms(config: Record<string, unknown>, templateModelId: string, fallback?: ModelConfig): void {
  if (!Array.isArray(config.mechanisms)) return
  const fallbackMechanisms = Array.isArray(fallback?.mechanisms) ? fallback.mechanisms : []
  const fallbackById = new Map(
    fallbackMechanisms
      .filter(isRecord)
      .filter((mechanism) => typeof mechanism.id === 'string')
      .map((mechanism) => [mechanism.id as string, mechanism]),
  )
  const templateCodeRefs = TEMPLATE_MECHANISM_CODE_REFS[templateModelId] ?? {}

  config.mechanisms = config.mechanisms.map((raw) => {
    const mechanism = normalizeMechanism(raw)
    const mechanismId = typeof mechanism.id === 'string' ? mechanism.id : ''
    if (!mechanism.code_ref && mechanismId) {
      const fallbackMechanism = fallbackById.get(mechanismId)
      if (fallbackMechanism && typeof fallbackMechanism.code_ref === 'string') {
        mechanism.code_ref = fallbackMechanism.code_ref
      } else if (templateCodeRefs[mechanismId]) {
        mechanism.code_ref = templateCodeRefs[mechanismId]
      }
    }
    return mechanism
  })
}

function repairAgents(config: Record<string, unknown>, fallback?: ModelConfig): void {
  if (!Array.isArray(config.agents)) return
  const templateModelId = typeof config.id === 'string' ? config.id : ''
  config.agents = config.agents.map((raw) => {
    const agent = isRecord(raw) ? { ...raw } : {}
    const agentId = typeof agent.id === 'string' ? agent.id : ''
    const fallbackAgent = findFallbackAgent(fallback, agentId)
    const stateVariables = readAgentStateVariables(agent)
    const fallbackVariables = readAgentStateVariables(fallbackAgent)
    const behaviorRefs = Array.isArray(agent.behavior_refs)
      ? agent.behavior_refs
      : Array.isArray(agent.behaviorRefs)
        ? agent.behaviorRefs
        : Array.isArray(fallbackAgent?.behavior_refs)
          ? fallbackAgent.behavior_refs
          : Array.isArray(fallbackAgent?.behaviorRefs)
            ? fallbackAgent.behaviorRefs
            : []
    return copyKnown({
      ...agent,
      state_variables: repairStateVariableList(stateVariables, fallbackVariables, templateModelId, agentId),
      behavior_refs: behaviorRefs.map(String),
    }, AGENT_KEYS)
  })
}

function normalizeAgent(
  raw: unknown,
  fallbackAgent?: Record<string, unknown>,
  templateModelId = '',
): { agent: Record<string, unknown>; count?: number } {
  const record = isRecord(raw) ? raw : {}
  const stateVariables = Array.isArray(record.state_variables)
    ? record.state_variables
    : Array.isArray(record.stateVariables)
      ? record.stateVariables
      : []
  const behaviorRefs = Array.isArray(record.behavior_refs)
    ? record.behavior_refs
    : Array.isArray(record.behaviorRefs)
      ? record.behaviorRefs
      : []
  const agentId = typeof record.id === 'string' ? record.id : ''
  const fallbackVariables = readAgentStateVariables(fallbackAgent)
  const withAliases = {
    ...record,
    state_variables: repairStateVariableList(stateVariables, fallbackVariables, templateModelId, agentId),
    behavior_refs: behaviorRefs.map(String),
  }
  return {
    agent: copyKnown(withAliases, AGENT_KEYS),
    count: numberValue(record.count),
  }
}

function readPositiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function ensureNetworkParams(kind: string, params: Record<string, unknown>): Record<string, unknown> {
  const next = { ...params }
  if (kind === 'barabasi_albert') {
    if (readPositiveNumber(next.m) === null) next.m = 3
  } else if (kind === 'watts_strogatz') {
    if (readPositiveNumber(next.k) === null) next.k = 4
    if (readPositiveNumber(next.p) === null) next.p = 0.1
  } else if (kind === 'erdos_renyi') {
    if (readPositiveNumber(next.p) === null) next.p = 0.05
  }
  return next
}

function normalizeEnvironment(raw: unknown): Record<string, unknown> {
  const record = isRecord(raw) ? raw : {}
  const { type, config, ...loose } = record
  const looseConfig = {
    ...(isRecord(config) ? config : {}),
    ...loose,
  }
  const inferredType =
    typeof type === 'string' && ENVIRONMENT_TYPES.has(type)
      ? type
      : 'kind' in looseConfig
        ? 'network'
        : ('width' in looseConfig || 'height' in looseConfig)
          ? 'grid'
          : 'none'
  if (inferredType === 'network') {
    const kind = typeof looseConfig.kind === 'string' ? looseConfig.kind : 'erdos_renyi'
    const params = isRecord(looseConfig.params) ? looseConfig.params : {}
    looseConfig.kind = kind
    looseConfig.params = ensureNetworkParams(kind, params)
  }
  return { type: inferredType, config: looseConfig }
}

function normalizeMechanism(raw: unknown): Record<string, unknown> {
  const record = isRecord(raw) ? raw : {}
  const withAliases = {
    ...record,
    ...('codeRef' in record && !('code_ref' in record) ? { code_ref: record.codeRef } : {}),
  }
  return copyKnown(withAliases, MECHANISM_KEYS)
}

function normalizeParameter(raw: unknown): Record<string, unknown> {
  const record = isRecord(raw) ? raw : {}
  return copyKnown(record, PARAMETER_KEYS)
}

function normalizeObserver(raw: unknown): Record<string, unknown> {
  const record = isRecord(raw) ? raw : {}
  const withDefaults = {
    level: 'macro',
    dtype: 'float',
    description: '',
    ...record,
  }
  return copyKnown(withDefaults, OBSERVER_KEYS)
}

function normalizeInitialization(
  raw: unknown,
  countsFromAgents: Record<string, number>,
): Record<string, unknown> {
  const record = isRecord(raw) ? raw : {}
  const rawCounts = isRecord(record.agent_counts)
    ? record.agent_counts
    : isRecord(record.agentCounts)
      ? record.agentCounts
      : {}
  const agentCounts: Record<string, number> = {}
  for (const [key, value] of Object.entries(rawCounts)) {
    const count = numberValue(value)
    if (count !== undefined) agentCounts[key] = Math.max(0, Math.round(count))
  }
  Object.assign(agentCounts, countsFromAgents)
  return copyKnown({
    ...record,
    agent_counts: agentCounts,
    agent_overrides: normalizeAgentOverrides(record.agent_overrides ?? record.agentOverrides),
  }, INITIALIZATION_KEYS)
}

function normalizeAgentOverrides(raw: unknown): Record<string, Record<string, unknown>> {
  if (!isRecord(raw)) return {}
  const out: Record<string, Record<string, unknown>> = {}
  for (const [index, patch] of Object.entries(raw)) {
    if (!/^\d+$/.test(index) || !isRecord(patch)) continue
    out[index] = { ...patch }
  }
  return out
}

function extractInterface(raw: unknown): NormalizedModelConfig['interfacePatch'] {
  if (!isRecord(raw)) return {}
  const runtime = isRecord(raw.interface) ? raw.interface : {}
  const seed = numberValue(runtime.seed)
  const steps = numberValue(runtime.steps)
  return {
    ...(seed !== undefined ? { seed } : {}),
    ...(steps !== undefined ? { steps } : {}),
    ...(isRecord(runtime.params) ? { params: runtime.params } : {}),
  }
}

function repairConfigShape(config: Record<string, unknown>, fallback?: ModelConfig): void {
  repairModelId(config, fallback)
  repairAgents(config, fallback)
  repairMechanisms(config, typeof config.id === 'string' ? config.id : '', fallback)
  if (!config.schema_version) config.schema_version = '1'
}

export function normalizeConfigAndInterface(raw: ModelConfig, fallback?: ModelConfig): NormalizedModelConfig {
  const record = isRecord(raw) ? raw : {}
  const provisionalId = typeof record.id === 'string' && isValidSnakeModelId(record.id)
    ? record.id
    : (fallback && typeof fallback.id === 'string' && isValidSnakeModelId(fallback.id)
      ? fallback.id
      : inferTemplateModelId(record) ?? '')
  const agentCounts: Record<string, number> = {}
  const agents = Array.isArray(record.agents)
    ? record.agents.map((agentRaw) => {
        const agentId = isRecord(agentRaw) && typeof agentRaw.id === 'string' ? agentRaw.id : ''
        const { agent, count } = normalizeAgent(agentRaw, findFallbackAgent(fallback, agentId), provisionalId)
        if (typeof agent.id === 'string' && count !== undefined) {
          agentCounts[agent.id] = Math.max(0, Math.round(count))
        }
        return agent
      })
    : []

  const withAliases: Record<string, unknown> = {
    ...record,
    ...('schemaVersion' in record && !('schema_version' in record) ? { schema_version: String(record.schemaVersion) } : {}),
    agents,
    environment: normalizeEnvironment(record.environment),
    mechanisms: Array.isArray(record.mechanisms) ? record.mechanisms.map(normalizeMechanism) : [],
    parameters: Array.isArray(record.parameters) ? record.parameters.map(normalizeParameter) : [],
    observers: Array.isArray(record.observers) ? record.observers.map(normalizeObserver) : [],
    initialization: normalizeInitialization(record.initialization, agentCounts),
  }

  repairConfigShape(withAliases, fallback)

  return {
    config: copyKnown(withAliases, TOP_LEVEL_KEYS),
    interfacePatch: extractInterface(record),
  }
}

export function normalizeModelConfigForKernel(raw: ModelConfig, fallback?: ModelConfig): ModelConfig {
  return normalizeConfigAndInterface(raw, fallback).config
}

/**
 * Guarantee a config's top-level `id` is snake_case (the kernel contract) while
 * preserving every other field — unlike normalizeModelConfigForKernel, which
 * projects the config onto the kernel shape and drops extras like `metadata`.
 *
 * This is the storage/adopt boundary guard: an adopted or edited config must
 * never be persisted with a kernel-invalid id (e.g. the kebab-case
 * "rumor-content-takedown-smallworld"), which would otherwise fail at run time
 * with a ModelConfig.id validation error. Returns the input unchanged when the
 * id is already valid so callers can use it as a cheap read-time self-heal.
 */
export function ensureSnakeModelId<T extends Record<string, unknown>>(config: T): T {
  if (!isRecord(config)) return config
  const currentId = typeof config.id === 'string' ? config.id : ''
  if (currentId && isValidSnakeModelId(currentId)) return config
  if (currentId && !isUuidLike(currentId)) {
    const slug = slugifyModelId(currentId)
    if (isValidSnakeModelId(slug)) return { ...config, id: slug }
  }
  const inferred = inferTemplateModelId(config)
  if (inferred) return { ...config, id: inferred }
  return config
}
