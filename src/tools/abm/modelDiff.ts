/**
 * Coarse structural diff between two ModelConfigs, shaped for the desktop
 * ModelDiffPreview (desktop/src/abm/components/ModelDiffPreview.tsx). Used by
 * abm_edit_model to populate the approval prompt for a structural change.
 */

import { readModelConfig, type ModelConfigShape } from '../../server/abm/modelConfigShape.js'
import type { ModelConfig } from '../../server/abm/types.js'

export interface ModelDiffChange {
  path: string
  op: 'added' | 'removed' | 'modified'
  before?: unknown
  after?: unknown
}

export interface ModelDiff {
  modelId?: string
  fromVersion?: string
  toVersion?: string
  structural: boolean
  changes: ModelDiffChange[]
  oddImpact: string[]
}

/** ODD sections affected when a given model section changes. */
const ODD_IMPACT: Record<string, string[]> = {
  agents: ['Entities'],
  mechanisms: ['Process', 'Submodels'],
  environment: ['Entities', 'Design concepts'],
  observers: ['Process', 'Design concepts'],
  parameters: ['Input'],
  initialization: ['Initialization'],
}

function sectionSummary(c: ModelConfigShape, section: string): { sig: string; label: string } {
  switch (section) {
    case 'agents':
      return { sig: JSON.stringify(c.agents), label: `${c.agents.length} agent type(s)` }
    case 'mechanisms':
      return {
        sig: JSON.stringify(c.mechanisms.map((m) => [m.id, m.trigger, m.effect, m.codeRef])),
        label: `${c.mechanisms.length} mechanism(s)`,
      }
    case 'environment':
      return { sig: JSON.stringify(c.environment), label: c.environment.type }
    case 'observers':
      return { sig: JSON.stringify(c.observers), label: `${c.observers.length} observer(s)` }
    case 'parameters':
      return {
        sig: JSON.stringify(c.parameters.map((p) => [p.id, p.dtype, p.scope])),
        label: `${c.parameters.length} parameter(s)`,
      }
    case 'initialization':
      return {
        sig: JSON.stringify(c.initialization.agentCounts),
        label: `${Object.keys(c.initialization.agentCounts).length} population entr(ies)`,
      }
    default:
      return { sig: '', label: '' }
  }
}

const SECTIONS = ['agents', 'mechanisms', 'environment', 'observers', 'parameters', 'initialization']

export function computeModelDiff(
  prev: ModelConfig,
  next: ModelConfig,
  decision: { version: string; structural: boolean },
): ModelDiff {
  const prevShape = readModelConfig(prev)
  const nextShape = readModelConfig(next)
  const changes: ModelDiffChange[] = []
  const oddImpact = new Set<string>()

  for (const section of SECTIONS) {
    const before = sectionSummary(prevShape, section)
    const after = sectionSummary(nextShape, section)
    if (before.sig === after.sig) continue
    changes.push({ path: section, op: 'modified', before: before.label, after: after.label })
    for (const impacted of ODD_IMPACT[section] ?? []) oddImpact.add(impacted)
  }

  return {
    modelId: nextShape.id || prevShape.id,
    fromVersion: prevShape.version || '1',
    toVersion: decision.version,
    structural: decision.structural,
    changes,
    oddImpact: [...oddImpact],
  }
}
