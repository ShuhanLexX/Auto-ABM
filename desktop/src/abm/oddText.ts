import type { Locale } from '../i18n'
import { isRecord, readAgentCounts, readNumber, readRecords, readString } from './modelIntrospection'
import {
  isChineseAbmLocale,
  localizeAgentTypeText,
  localizeInitializationNotes,
  localizeMechanismDetail,
  localizeMechanismText,
  localizeModelText,
  localizeObserverText,
  localizeParameterText,
} from './modelDisplayText'
import { ODD_SECTION_KEYS, type ModelConfig, type Odd, type OddSectionKey } from './types'

/**
 * Client-side, locale-aware ODD derivation.
 *
 * The server (`src/server/abm/oddService.ts`) can derive ODD text for a requested
 * locale, but older stored ODD sections may still carry the language they were
 * first generated in. Re-render auto-derived sections here with the same
 * display-text tables the parameter/mechanism panels already use, so the ODD
 * reads consistently with the system language and reacts instantly to a language
 * switch. Hand-written sections remain untouched.
 */

function joinLines(lines: string[]): string {
  return lines.filter((line) => line.trim().length > 0).join('\n')
}

function modelIdOf(config: ModelConfig): string {
  return (
    readString(config, 'id') ??
    readString(config, 'model_id') ??
    readString(config, 'modelId') ??
    readString(config, 'name') ??
    '(missing)'
  )
}

function readEnvironment(config: ModelConfig): { type: string; config: Record<string, unknown> } {
  const env = isRecord(config.environment) ? config.environment : {}
  return {
    type: readString(env, 'type') ?? 'none',
    config: isRecord(env.config) ? env.config : {},
  }
}

function readBehaviorRefs(agent: Record<string, unknown>): string[] {
  const refs = Array.isArray(agent.behavior_refs)
    ? agent.behavior_refs
    : Array.isArray(agent.behaviorRefs)
      ? agent.behaviorRefs
      : []
  return refs.map(String)
}

function derivePurpose(config: ModelConfig, locale: Locale): string {
  const id = modelIdOf(config)
  const version = readString(config, 'version') ?? '(missing)'
  const model = localizeModelText(id, readString(config, 'name') ?? id, readString(config, 'description') ?? undefined, locale)
  const lines = [
    `- Model: ${model.label || id || '(unnamed)'}`,
    `- Model ID: ${id}`,
    `- Version: v${version}`,
  ]
  if (model.description) lines.push(`- Research purpose / phenomenon: ${model.description}`)
  else lines.push('- Research purpose / phenomenon: the config has no description yet; add the research question, theoretical assumptions, and scope after adopting a design.')
  lines.push('- Usage: this ODD is auto-derived from the current ModelConfig to record how the model initializes, how its mechanisms are scheduled, and which metrics are observed.')
  return joinLines(lines)
}

function deriveEntities(config: ModelConfig, locale: Locale): string {
  const lines: string[] = ['### Agents and state variables']
  const agents = readRecords(config.agents)
  if (agents.length === 0) {
    lines.push('- No agent types defined.')
  } else {
    for (const agent of agents) {
      const id = readString(agent, 'id') ?? 'agent'
      const display = localizeAgentTypeText(id, readString(agent, 'name') ?? id, readString(agent, 'description') ?? undefined, locale)
      const vars = readRecords(agent.state_variables ?? agent.stateVariables)
        .map((v) => {
          const name = readString(v, 'name') ?? '?'
          const dtype = readString(v, 'dtype') ?? readString(v, 'type') ?? ''
          const def = v.default !== undefined ? `=${JSON.stringify(v.default)}` : ''
          return `${name}:${dtype}${def}`
        })
        .join(', ')
      const behaviorRefs = readBehaviorRefs(agent)
      lines.push(`- ${display.label} (${id})`)
      lines.push(`  - State variables: ${vars || 'none'}`)
      if (behaviorRefs.length > 0) lines.push(`  - Related behaviors/mechanisms: ${behaviorRefs.join(', ')}`)
      if (display.description) lines.push(`  - Notes: ${display.description}`)
    }
  }
  const env = readEnvironment(config)
  const envConfig = Object.keys(env.config).length ? ` ${JSON.stringify(env.config)}` : ''
  lines.push('### Environment and scale')
  lines.push(`- Environment type: ${env.type}${envConfig}`)
  lines.push('- Scale: determined jointly by the environment config and initialization size; each run binds seed, parameters, and model version.')
  return joinLines(lines)
}

function localizeMechanismLabel(mechanism: Record<string, unknown>, locale: Locale): { id: string; label: string; trigger?: string; effect?: string } {
  const id = readString(mechanism, 'id') ?? 'mechanism'
  return {
    id,
    label: localizeMechanismText(id, readString(mechanism, 'name') ?? id, locale),
    trigger: localizeMechanismDetail(id, 'trigger', readString(mechanism, 'trigger') ?? undefined, locale),
    effect: localizeMechanismDetail(id, 'effect', readString(mechanism, 'effect') ?? undefined, locale),
  }
}

function deriveProcess(config: ModelConfig, locale: Locale): string {
  const lines: string[] = ['### Scheduling and process overview']
  const mechanisms = readRecords(config.mechanisms)
  if (mechanisms.length === 0) {
    lines.push('- No mechanisms defined.')
  } else {
    lines.push('- Each tick triggers the following mechanisms per the model schedule; the exact execution order follows the kernel template.')
    for (const mechanism of mechanisms) {
      const { label, trigger, effect } = localizeMechanismLabel(mechanism, locale)
      const triggerText = trigger ? `when ${trigger}` : 'each step'
      const effectText = effect ? ` → ${effect}` : ''
      lines.push(`- ${label} (${triggerText})${effectText}`)
    }
  }
  const observers = readRecords(config.observers)
  if (observers.length > 0) {
    lines.push('### Observed metrics')
    for (const observer of observers) {
      const id = readString(observer, 'id') ?? 'observer'
      const label = localizeObserverText(id, readString(observer, 'name') ?? id, locale)
      const level = readString(observer, 'level') ?? 'macro'
      const dtype = readString(observer, 'dtype') ?? 'float'
      lines.push(`- ${label} (${id}, ${level}, ${dtype})`)
    }
  }
  return joinLines(lines)
}

function deriveDesignConcepts(config: ModelConfig, locale: Locale): string {
  const lines: string[] = []
  const observers = readRecords(config.observers)
  const observerLabel = (observer: Record<string, unknown>) =>
    localizeObserverText(readString(observer, 'id') ?? '', readString(observer, 'name') ?? readString(observer, 'id') ?? '', locale)
  const macro = observers.filter((o) => (readString(o, 'level') ?? 'macro') === 'macro').map(observerLabel)
  if (macro.length) lines.push(`- Emergence: macro observers [${macro.join(', ')}] track the aggregate patterns produced by individual interactions.`)
  const env = readEnvironment(config)
  if (env.type !== 'none') lines.push(`- Interaction: agents make contact, influence neighbors, or compete for resources through the ${env.type} topology/space.`)
  lines.push('- Stochasticity: each run binds a random seed; results are reproducible given the seed, parameters, and model version.')
  if (observers.some((o) => (readString(o, 'level') ?? 'macro') === 'micro')) {
    lines.push('- Observation: micro observers expose agent state for Trace evidence and local explanation.')
  }
  const mechanisms = readRecords(config.mechanisms)
  if (mechanisms.length > 0) {
    lines.push(`- Adaptation / Decision: the core decision process comes from ${mechanisms.map((m) => localizeMechanismLabel(m, locale).label).join(', ')}.`)
  }
  return joinLines(lines)
}

function deriveInitialization(config: ModelConfig, locale: Locale): string {
  const lines: string[] = ['### Initial state']
  const counts = Object.entries(readAgentCounts(config))
  if (counts.length === 0) {
    lines.push('- No initial agent counts declared.')
  } else {
    for (const [typeId, count] of counts) lines.push(`- ${typeId}: ${count}`)
  }
  const init = isRecord(config.initialization) ? config.initialization : {}
  const notes = localizeInitializationNotes(modelIdOf(config), readString(init, 'notes') ?? undefined, locale)
  if (notes) lines.push(`- Initialization notes: ${notes}`)
  lines.push('- Reproducibility: initialization must be recorded together with the seed, parameter defaults, and model version.')
  return joinLines(lines)
}

function deriveInput(config: ModelConfig, locale: Locale): string {
  const params = readRecords(config.parameters)
  if (params.length === 0) return 'No external input parameters declared; the model is driven mainly by initialization and internal mechanisms.'
  const lines: string[] = ['### Parameter inputs']
  for (const parameter of params) {
    const id = readString(parameter, 'id') ?? readString(parameter, 'name') ?? 'parameter'
    const display = localizeParameterText(id, readString(parameter, 'label') ?? readString(parameter, 'name') ?? id, readString(parameter, 'description') ?? undefined, locale)
    const dtype = readString(parameter, 'dtype') ?? 'unknown'
    const scope = readString(parameter, 'scope') ?? 'global'
    const min = readNumber(parameter, 'min')
    const max = readNumber(parameter, 'max')
    const step = readNumber(parameter, 'step')
    const range = min !== undefined || max !== undefined ? ` [${min ?? '-∞'}, ${max ?? '∞'}]` : ''
    const def = parameter.default !== undefined ? `; default=${JSON.stringify(parameter.default)}` : ''
    const stepText = step !== undefined ? `; step=${step}` : ''
    lines.push(`- ${display.label} (${id}): type=${dtype}; scope=${scope}${def}${range}${stepText}`)
  }
  lines.push('- Parameter experiments: bounded parameters suit sensitivity/uncertainty analysis; unbounded parameters are recorded as exact inputs.')
  return joinLines(lines)
}

function deriveSubmodels(config: ModelConfig, locale: Locale): string {
  const mechanisms = readRecords(config.mechanisms)
  if (mechanisms.length === 0) return 'No submodels declared.'
  const lines: string[] = []
  for (const mechanism of mechanisms) {
    const { id, label, trigger, effect } = localizeMechanismLabel(mechanism, locale)
    const codeRef = readString(mechanism, 'code_ref') ?? readString(mechanism, 'codeRef') ?? undefined
    lines.push(`### ${label} (${id})`)
    if (trigger) lines.push(`- Trigger: ${trigger}`)
    if (effect) lines.push(`- State/environment effect: ${effect}`)
    if (codeRef) lines.push(`- Decision code reference: ${codeRef}`)
    lines.push('- Explanation entry: click this node in the mechanism graph to explain its contribution with Trace and parameters.')
  }
  return joinLines(lines)
}

const SECTION_DERIVERS: Record<OddSectionKey, (config: ModelConfig, locale: Locale) => string> = {
  purpose: derivePurpose,
  entities: deriveEntities,
  process: deriveProcess,
  designConcepts: deriveDesignConcepts,
  initialization: deriveInitialization,
  input: deriveInput,
  submodels: deriveSubmodels,
}

/**
 * Re-render the auto-derived ODD sections in `locale`, preserving hand-written
 * sections verbatim. For Chinese locales (or when the config is unavailable) the
 * stored server-derived ODD is returned unchanged.
 */
export function localizeOdd(odd: Odd | null, config: ModelConfig | null | undefined, locale: Locale): Odd | null {
  if (!odd) return odd
  if (isChineseAbmLocale(locale) || !config) return odd
  const sections = {} as Odd['sections']
  for (const key of ODD_SECTION_KEYS) {
    const section = odd.sections[key]
    // Never overwrite a user's hand-written section; only refresh derived ones.
    if (section && section.derived === false) {
      sections[key] = section
    } else {
      sections[key] = { text: SECTION_DERIVERS[key](config, locale), derived: true }
    }
  }
  return { ...odd, sections }
}
