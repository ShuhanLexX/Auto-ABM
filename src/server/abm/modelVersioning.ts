/**
 * Model versioning — P2 Task 1 (docs/ai/impl/plans/P2-conversation-explain.md).
 *
 * Reproducibility rule (architecture.md §7): a Run is reproducible from
 * seed + parameters + model_version + kernel_version. Therefore the model
 * `version` MUST change whenever the *structure* changes (agents, mechanisms,
 * environment, observers, initialization, parameter set), but MUST NOT change
 * when only a parameter's default value is tweaked (that is captured by the
 * Run's `parameters` snapshot, not the model identity).
 */

import { readModelConfig, type ModelConfigShape } from './modelConfigShape.js'
import type { ModelConfig } from './types.js'

/**
 * Stable, order-independent structural signature. Excludes parameter *default
 * values* (and other purely-cosmetic fields) on purpose: those are runtime
 * inputs, not model structure.
 */
function structuralSignature(c: ModelConfigShape): string {
  const agents = c.agents
    .map((a) => ({
      id: a.id,
      vars: a.stateVariables.map((v) => `${v.name}:${v.dtype}`).sort(),
      refs: [...a.behaviorRefs].sort(),
    }))
    .sort((x, y) => x.id.localeCompare(y.id))

  const mechanisms = c.mechanisms
    .map((m) => ({ id: m.id, trigger: m.trigger, effect: m.effect, codeRef: m.codeRef }))
    .sort((x, y) => x.id.localeCompare(y.id))

  const observers = c.observers
    .map((o) => ({ id: o.id, level: o.level, dtype: o.dtype }))
    .sort((x, y) => x.id.localeCompare(y.id))

  // Parameter identity (id, dtype, scope) is structural; default value is not.
  const parameters = c.parameters
    .map((p) => ({ id: p.id, dtype: p.dtype, scope: p.scope }))
    .sort((x, y) => x.id.localeCompare(y.id))

  const initialization = Object.entries(c.initialization.agentCounts)
    .map(([id, count]) => [id, count] as const)
    .sort(([a], [b]) => a.localeCompare(b))
  const agentOverrides = Object.entries(c.initialization.agentOverrides)
    .map(([id, patch]) => [id, patch] as const)
    .sort(([a], [b]) => a.localeCompare(b))

  return JSON.stringify({
    agents,
    mechanisms,
    observers,
    parameters,
    environment: { type: c.environment.type, config: c.environment.config },
    initialization,
    agentOverrides,
  })
}

/** True when `next` differs structurally from `prev` (ignoring param defaults). */
export function isStructuralChange(prev: ModelConfig, next: ModelConfig): boolean {
  return structuralSignature(readModelConfig(prev)) !== structuralSignature(readModelConfig(next))
}

/**
 * Increment the trailing numeric component of a version string.
 *   "1" → "2", "0.3.1" → "0.3.2", "v2" → "v3", "alpha" → "alpha.1"
 */
export function incrementVersion(version: string): string {
  const match = version.match(/^(.*?)(\d+)(\D*)$/)
  if (match) {
    const [, prefix, digits, suffix] = match
    const next = String(Number(digits) + 1)
    return `${prefix}${next}${suffix}`
  }
  return version.length ? `${version}.1` : '1'
}

/**
 * Pick the authoritative version for a newly-created Simulation in one
 * research question. Re-adopting the same template/config should become a
 * distinct version instead of repeatedly showing the template's original
 * version.
 */
export function nextCreatedSimulationVersion(
  existingVersions: string[],
  requestedVersion: string,
): string {
  const base = requestedVersion.trim() || '1'
  if (existingVersions.length === 0) return base

  const highestExisting = [...existingVersions]
    .map((version) => version.trim())
    .filter(Boolean)
    .sort(compareVersionStrings)
    .at(-1)

  if (!highestExisting) return base
  if (compareVersionStrings(base, highestExisting) > 0 && !existingVersions.includes(base)) {
    return base
  }
  return incrementVersion(highestExisting)
}

function compareVersionStrings(a: string, b: string): number {
  const aParts = versionNumberParts(a)
  const bParts = versionNumberParts(b)
  const length = Math.max(aParts.length, bParts.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (aParts[index] ?? 0) - (bParts[index] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

function versionNumberParts(version: string): number[] {
  return (version.match(/\d+/g) ?? []).map((part) => Number(part))
}

export interface VersionDecision {
  version: string
  structural: boolean
}

/**
 * Decide the authoritative version for `next` relative to the committed `prev`:
 *   - structural change → increment `prev.version`.
 *   - parameter-default / cosmetic change only → keep `prev.version`.
 *
 * The caller is responsible for writing the returned version back onto the
 * config before persisting it.
 */
export function bumpIfStructural(prev: ModelConfig, next: ModelConfig): VersionDecision {
  const prevVersion = readModelConfig(prev).version || '1'
  if (isStructuralChange(prev, next)) {
    return { version: incrementVersion(prevVersion), structural: true }
  }
  return { version: prevVersion, structural: false }
}
