import { readModelConfig } from './modelConfigShape.js'
import type { ModelConfig } from './types.js'

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function parameterDefaults(config: ModelConfig): Record<string, unknown> {
  return Object.fromEntries(
    readModelConfig(config).parameters
      .filter((parameter) => parameter.id)
      .map((parameter) => [parameter.id, parameter.default]),
  )
}

/**
 * Keep the run-interface defaults aligned with edited model parameter defaults.
 * A stale interface value has higher runtime priority than config.parameters,
 * so leaving e.g. ignition_count=1 there would silently undo a model edit that
 * changed the default to 10.
 */
export function reconcileInterfaceParamsWithParameterDefaults(
  beforeConfig: ModelConfig,
  afterConfig: ModelConfig,
  currentParams: Record<string, unknown>,
): Record<string, unknown> {
  const before = parameterDefaults(beforeConfig)
  const after = parameterDefaults(afterConfig)
  const next = { ...currentParams }

  for (const [id, afterDefault] of Object.entries(after)) {
    if (!(id in before)) continue
    const beforeDefault = before[id]
    if (sameValue(beforeDefault, afterDefault)) continue
    if (!(id in next) || sameValue(next[id], beforeDefault)) {
      next[id] = afterDefault
    }
  }

  return next
}
