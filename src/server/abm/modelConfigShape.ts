/**
 * Tolerant structural reader over the loose `ModelConfig` (Record<string, unknown>).
 *
 * The server keeps ModelConfig untyped (types.ts) and lets the kernel validate it
 * deeply via Pydantic. ODD derivation and version bumping only need to *read* a few
 * well-known fields, so we coerce defensively here instead of trusting the shape —
 * mirror of packages/abm-kernel/src/abm_kernel/schemas/model_config.py.
 */

import type { ModelConfig } from './types.js'

export interface StateVariableShape {
  name: string
  dtype: string
  default: unknown
  choices: string[] | null
}

export interface AgentTypeShape {
  id: string
  name: string
  description: string
  stateVariables: StateVariableShape[]
  behaviorRefs: string[]
}

export interface EnvironmentShape {
  type: string
  config: Record<string, unknown>
}

export interface MechanismShape {
  id: string
  name: string
  description: string
  trigger: string
  effect: string
  codeRef: string | null
}

export interface ParameterShape {
  id: string
  name: string
  dtype: string
  default: unknown
  min: number | null
  max: number | null
  step: number | null
  scope: string
}

export interface ObserverShape {
  id: string
  name: string
  level: string
  dtype: string
  description: string
}

export interface InitializationShape {
  agentCounts: Record<string, number>
  agentOverrides: Record<string, Record<string, unknown>>
  notes: string
}

export interface ModelConfigShape {
  id: string
  name: string
  description: string
  version: string
  agents: AgentTypeShape[]
  environment: EnvironmentShape
  mechanisms: MechanismShape[]
  parameters: ParameterShape[]
  observers: ObserverShape[]
  initialization: InitializationShape
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readStateVariable(raw: unknown): StateVariableShape {
  const r = isRecord(raw) ? raw : {}
  const choices = Array.isArray(r.choices)
    ? r.choices.filter((c): c is string => typeof c === 'string')
    : null
  return { name: str(r.name), dtype: str(r.dtype), default: r.default, choices }
}

function readAgent(raw: unknown): AgentTypeShape {
  const r = isRecord(raw) ? raw : {}
  return {
    id: str(r.id),
    name: str(r.name),
    description: str(r.description),
    stateVariables: arr(r.state_variables).map(readStateVariable),
    behaviorRefs: arr(r.behavior_refs).map((v) => str(v)),
  }
}

function readEnvironment(raw: unknown): EnvironmentShape {
  const r = isRecord(raw) ? raw : {}
  return { type: str(r.type, 'none'), config: isRecord(r.config) ? r.config : {} }
}

function readMechanism(raw: unknown): MechanismShape {
  const r = isRecord(raw) ? raw : {}
  return {
    id: str(r.id),
    name: str(r.name),
    description: str(r.description),
    trigger: str(r.trigger),
    effect: str(r.effect),
    codeRef: typeof r.code_ref === 'string' ? r.code_ref : null,
  }
}

function readParameter(raw: unknown): ParameterShape {
  const r = isRecord(raw) ? raw : {}
  return {
    id: str(r.id),
    name: str(r.name),
    dtype: str(r.dtype),
    default: r.default,
    min: num(r.min),
    max: num(r.max),
    step: num(r.step),
    scope: str(r.scope, 'model'),
  }
}

function readObserver(raw: unknown): ObserverShape {
  const r = isRecord(raw) ? raw : {}
  return {
    id: str(r.id),
    name: str(r.name),
    level: str(r.level, 'macro'),
    dtype: str(r.dtype, 'float'),
    description: str(r.description),
  }
}

function readInitialization(raw: unknown): InitializationShape {
  const r = isRecord(raw) ? raw : {}
  const counts: Record<string, number> = {}
  if (isRecord(r.agent_counts)) {
    for (const [key, value] of Object.entries(r.agent_counts)) {
      const n = num(value)
      if (n !== null) counts[key] = n
    }
  }
  const overrides: Record<string, Record<string, unknown>> = {}
  if (isRecord(r.agent_overrides)) {
    for (const [key, value] of Object.entries(r.agent_overrides)) {
      if (isRecord(value)) overrides[key] = value
    }
  }
  return { agentCounts: counts, agentOverrides: overrides, notes: str(r.notes) }
}

/** Coerce a loose ModelConfig into a defensively-typed structural view. */
export function readModelConfig(config: ModelConfig): ModelConfigShape {
  const c = isRecord(config) ? config : {}
  return {
    id: str(c.id),
    name: str(c.name),
    description: str(c.description),
    version: str(c.version),
    agents: arr(c.agents).map(readAgent),
    environment: readEnvironment(c.environment),
    mechanisms: arr(c.mechanisms).map(readMechanism),
    parameters: arr(c.parameters).map(readParameter),
    observers: arr(c.observers).map(readObserver),
    initialization: readInitialization(c.initialization),
  }
}
