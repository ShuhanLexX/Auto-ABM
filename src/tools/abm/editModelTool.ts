import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { createSimulation, getSimulationById, updateSimulation, getOdd, putOdd } from '../../server/abm/abmStore.fs.js'
import { normalizeModelConfigForKernel } from '../../server/abm/modelConfigNormalize.js'
import { bumpIfStructural } from '../../server/abm/modelVersioning.js'
import { deriveOdd, mergeOdd } from '../../server/abm/oddService.js'
import type { ModelConfig } from '../../server/abm/types.js'
import { reconcileInterfaceParamsWithParameterDefaults } from '../../server/abm/modelParameterDefaults.js'
import { ABM_EDIT_MODEL_TOOL_NAME } from './constants.js'
import { computeModelDiff } from './modelDiff.js'

const DESCRIPTION = 'Edit a Simulation model. Autonomous/accept-edits sessions can apply structural changes without an extra approval prompt.'

const PROMPT = `Apply an edit to a Simulation's model config.

simId must be the server UUID from abm_adopt_simulation — never a proposal slug.
Call abm_adopt_simulation first if the user picked a draft but no simulation exists yet.

Prefer the full updated \`config\` for the simulation \`simId\`. For small edits
you may pass a focused patch, for example:
- \`{"agents":[{"id":"person","count":2000}]}\` to change the initialized agent count.
- \`{"parameters":[{"id":"beta","default":0.35}]}\` to change a parameter default.
- \`{"environment":{"config":{"width":200,"height":200}}}\` to resize a grid.

Environment shape is strict: \`{"type":"none"|"grid"|"network"|"continuous","config":{...}}\`.
Grid dimensions (width/height/torus/moore) and network settings (kind/params)
live inside \`environment.config\`, never directly on \`environment\`.

Never replace a model config with a partial object. The server merges focused
patches into the existing config and then detects whether the change is
*structural* (agents / mechanisms / environment / observers / parameter set /
initialization) versus a parameter-default tweak:
- structural change -> a new Simulation version record is created in the same
  lineage and the user must approve a diff before it is applied, unless the current session is already in
  autonomous/accept-edits/bypass permission mode.
- parameter-default-only change -> version is preserved, no approval needed.
When changing a parameter default (for example ignition_count from 1 to 10), the
server also updates the Simulation's run-interface default if that interface
value was still equal to the old default; otherwise the old interface value would
silently override the edited model during the next run.
After applying, the ODD protocol is re-derived and merged into the returned simId
(hand-written sections are preserved; drifted ones are flagged for review).

After an edit is applied, call abm_validate_simulation on the returned simId before
claiming the model is ready. Use the validation report as the model validation
agent's feedback loop: fix blocking issues, explain warnings, and only then run
larger experiments.`

const inputSchema = lazySchema(() =>
  z.strictObject({
    simId: z.string().optional().describe('The simulation to edit'),
    config: z.record(z.string(), z.unknown()).optional().describe('The full updated model config'),
    summary: z.string().optional().describe('Short human summary of the edit'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    simId: z.string(),
    previousSimId: z.string().optional(),
    applied: z.boolean(),
    structural: z.boolean(),
    fromVersion: z.string(),
    toVersion: z.string(),
    oddConflicts: z.array(z.string()),
    error: z.string().optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function cloneModelConfig(config: ModelConfig): ModelConfig {
  return JSON.parse(JSON.stringify(config)) as ModelConfig
}

function looksLikeFullModelConfig(config: Record<string, unknown>): boolean {
  return (
    typeof config.id === 'string' &&
    typeof config.name === 'string' &&
    Array.isArray(config.agents) &&
    isRecord(config.environment) &&
    Array.isArray(config.mechanisms) &&
    Array.isArray(config.parameters)
  )
}

const ENVIRONMENT_TYPES = new Set(['none', 'grid', 'network', 'continuous'])

function ensureModelConfigUsable(config: ModelConfig): void {
  const missing: string[] = []
  if (typeof config.id !== 'string' || !config.id.trim()) missing.push('id')
  if (typeof config.name !== 'string' || !config.name.trim()) missing.push('name')
  if (!Array.isArray(config.agents) || config.agents.length === 0) missing.push('agents')
  if (!isRecord(config.environment)) missing.push('environment')
  else if (typeof config.environment.type !== 'string' || !ENVIRONMENT_TYPES.has(config.environment.type))
    missing.push('environment.type (none|grid|network|continuous)')
  if (!Array.isArray(config.mechanisms)) missing.push('mechanisms')
  if (!Array.isArray(config.parameters)) missing.push('parameters')

  const agents = Array.isArray(config.agents) ? config.agents : []
  agents.forEach((agent, index) => {
    if (!isRecord(agent)) {
      missing.push(`agents.${index}`)
      return
    }
    if (typeof agent.id !== 'string' || !agent.id.trim()) missing.push(`agents.${index}.id`)
    if (typeof agent.name !== 'string' || !agent.name.trim()) missing.push(`agents.${index}.name`)
    const stateVariables = Array.isArray(agent.state_variables) ? agent.state_variables : []
    stateVariables.forEach((stateVariable, stateIndex) => {
      if (!isRecord(stateVariable)) {
        missing.push(`agents.${index}.state_variables.${stateIndex}`)
        return
      }
      if (typeof stateVariable.name !== 'string' || !stateVariable.name.trim()) {
        missing.push(`agents.${index}.state_variables.${stateIndex}.name`)
      }
      const dtype = typeof stateVariable.dtype === 'string' ? stateVariable.dtype : ''
      if (!dtype) missing.push(`agents.${index}.state_variables.${stateIndex}.dtype`)
      if (!('default' in stateVariable)) missing.push(`agents.${index}.state_variables.${stateIndex}.default`)
    })
  })

  if (missing.length > 0) {
    throw new Error(`模型配置不完整，缺少：${missing.join(', ')}`)
  }
}

function setAgentCount(config: ModelConfig, agentId: string, count: unknown): boolean {
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return false
  const initialization = isRecord(config.initialization) ? config.initialization : {}
  const agentCounts = isRecord(initialization.agent_counts)
    ? { ...initialization.agent_counts }
    : {}
  agentCounts[agentId] = Math.round(count)
  config.initialization = { ...initialization, agent_counts: agentCounts }
  return true
}

function mergeInitializationPatch(config: ModelConfig, value: unknown): void {
  if (!isRecord(value)) return
  const current = isRecord(config.initialization) ? config.initialization : {}
  const next = { ...current, ...value }
  if (isRecord(current.agent_counts) || isRecord(value.agent_counts)) {
    next.agent_counts = {
      ...(isRecord(current.agent_counts) ? current.agent_counts : {}),
      ...(isRecord(value.agent_counts) ? value.agent_counts : {}),
    }
  }
  config.initialization = next
}

/**
 * Merge an environment patch into the kernel shape `{type, config}`.
 * Models often send loose patches like `{"width": 200, "height": 200}` or
 * `{"type": "grid", "width": 200}` — width/height/torus/kind/... belong inside
 * `environment.config`, and the existing `type` must be preserved.
 */
function mergeEnvironmentPatch(config: ModelConfig, value: unknown): void {
  if (!isRecord(value)) return
  const current = isRecord(config.environment) ? config.environment : {}
  const currentConfig = isRecord(current.config) ? current.config : {}

  const { type, config: patchConfig, ...loose } = value
  const nextConfig: Record<string, unknown> = {
    ...currentConfig,
    ...(isRecord(patchConfig) ? patchConfig : {}),
    ...loose,
  }
  config.environment = {
    type: typeof type === 'string' ? type : current.type,
    config: nextConfig,
  }
}

function mergeParameterPatch(config: ModelConfig, value: unknown): void {
  if (!Array.isArray(value)) return
  const current = Array.isArray(config.parameters) ? config.parameters : []
  const next = current.map((parameter) => (isRecord(parameter) ? { ...parameter } : parameter))
  for (const patch of value) {
    if (!isRecord(patch) || typeof patch.id !== 'string') continue
    const index = next.findIndex((parameter) => isRecord(parameter) && parameter.id === patch.id)
    if (index >= 0 && isRecord(next[index])) {
      next[index] = { ...next[index], ...patch }
    } else {
      next.push({ ...patch })
    }
  }
  config.parameters = next
}

function mergeStateVariables(current: unknown[], patch: unknown[]): unknown[] {
  if (patch.length === 0) return current
  const patchLooksEmpty = patch.every((entry) => !isRecord(entry) || Object.keys(entry).length === 0)
  if (patchLooksEmpty) return current

  const next = current.map((entry) => (isRecord(entry) ? { ...entry } : entry))
  for (let index = 0; index < patch.length; index += 1) {
    const patchEntry = patch[index]
    if (!isRecord(patchEntry)) continue
    if (Object.keys(patchEntry).length === 0) continue
    if (index < next.length && isRecord(next[index])) {
      next[index] = { ...next[index], ...patchEntry }
    } else {
      next.push({ ...patchEntry })
    }
  }
  return next
}

function mergeAgentRecord(current: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const {
    count,
    type,
    state_variables: patchStateVariables,
    stateVariables: patchStateVariablesAlias,
    behavior_refs: patchBehaviorRefs,
    behaviorRefs: patchBehaviorRefsAlias,
    ...rest
  } = patch
  void count
  void type
  const merged: Record<string, unknown> = { ...current, ...rest }
  const currentStateVariables = Array.isArray(current.state_variables)
    ? current.state_variables
    : Array.isArray(current.stateVariables)
      ? current.stateVariables
      : []
  const incomingStateVariables = Array.isArray(patchStateVariables)
    ? patchStateVariables
    : Array.isArray(patchStateVariablesAlias)
      ? patchStateVariablesAlias
      : null
  if (incomingStateVariables) {
    merged.state_variables = mergeStateVariables(currentStateVariables, incomingStateVariables)
  }
  if (Array.isArray(patchBehaviorRefs) || Array.isArray(patchBehaviorRefsAlias)) {
    merged.behavior_refs = patchBehaviorRefs ?? patchBehaviorRefsAlias
  }
  delete merged.stateVariables
  delete merged.behaviorRefs
  delete merged.count
  return merged
}

function isCountOnlyAgentPatch(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).every((key) => ['id', 'type', 'name', 'count'].includes(key))
}

function resolveAgentId(patch: Record<string, unknown>): string {
  if (typeof patch.id === 'string') return patch.id
  if (typeof patch.type === 'string') return patch.type
  if (typeof patch.name === 'string') return patch.name
  return ''
}

function mergeAgentPatch(config: ModelConfig, value: unknown): void {
  if (!Array.isArray(value)) return
  const current = Array.isArray(config.agents) ? config.agents : []
  const countOnly = value.length > 0 && value.every((agent) => isRecord(agent) && isCountOnlyAgentPatch(agent))

  const nextAgents = current.map((agent) => (isRecord(agent) ? { ...agent } : agent))
  for (const patch of value) {
    if (!isRecord(patch)) continue
    const agentId = resolveAgentId(patch)
    if (!agentId) continue
    if ('count' in patch) setAgentCount(config, agentId, patch.count)
    const index = nextAgents.findIndex((agent) => isRecord(agent) && agent.id === agentId)
    if (index >= 0 && isRecord(nextAgents[index])) {
      nextAgents[index] = mergeAgentRecord(nextAgents[index], patch)
    } else if (!countOnly) {
      nextAgents.push({ ...patch })
      if ('count' in patch) setAgentCount(config, agentId, patch.count)
    }
  }
  config.agents = nextAgents
}

/**
 * Coerce a loose environment record into the kernel `{type, config}` shape so a
 * full-config edit like `environment: {width: 200, height: 200}` (missing `type`,
 * loose keys at top level) doesn't get persisted and later rejected by Pydantic.
 */
function normalizeEnvironmentShape(config: ModelConfig, fallback: ModelConfig): void {
  const env = config.environment
  if (!isRecord(env)) return
  const { type, config: envConfig, ...loose } = env
  const fallbackEnv = isRecord(fallback.environment) ? fallback.environment : {}
  const looseKeys = Object.keys(loose)
  if (typeof type === 'string' && isRecord(envConfig) && looseKeys.length === 0) return
  config.environment = {
    type: typeof type === 'string' ? type : fallbackEnv.type,
    config: {
      ...(isRecord(fallbackEnv.config) && typeof type !== 'string' ? fallbackEnv.config : {}),
      ...(isRecord(envConfig) ? envConfig : {}),
      ...loose,
    },
  }
}

function normalizeModelEdit(current: ModelConfig, raw: Record<string, unknown>): ModelConfig {
  const next = looksLikeFullModelConfig(raw) ? cloneModelConfig(raw) : cloneModelConfig(current)

  if (!looksLikeFullModelConfig(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      if (key === 'agents') {
        mergeAgentPatch(next, value)
      } else if (key === 'initialization') {
        mergeInitializationPatch(next, value)
      } else if (key === 'agent_counts' && isRecord(value)) {
        mergeInitializationPatch(next, { agent_counts: value })
      } else if (key === 'parameters') {
        mergeParameterPatch(next, value)
      } else if (key === 'environment') {
        mergeEnvironmentPatch(next, value)
      } else if (key === 'count' || key === 'population') {
        const firstAgent = Array.isArray(next.agents) ? next.agents.find(isRecord) : null
        if (firstAgent && typeof firstAgent.id === 'string') setAgentCount(next, firstAgent.id, value)
      } else {
        next[key] = value
      }
    }
  } else {
    normalizeEnvironmentShape(next, current)
  }

  const normalized = normalizeModelConfigForKernel(next, current)
  ensureModelConfigUsable(normalized)
  return normalized
}

export const EditModelTool = buildTool({
  name: ABM_EDIT_MODEL_TOOL_NAME,
  searchHint: 'edit an ABM model config',
  maxResultSizeChars: 100_000,
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  userFacingName() {
    return 'Edit Model'
  },
  isReadOnly() {
    return false
  },
  isConcurrencySafe() {
    return false
  },
  toAutoClassifierInput(input) {
    return input.simId ?? ''
  },
  renderToolUseMessage() {
    return null
  },
  // Structural edits carry a model diff for the permission UI, but autonomous
  // accept-edits sessions can apply them without another prompt.
  async checkPermissions(input, context) {
    if (!input.simId || !input.config) {
      return { behavior: 'allow', updatedInput: input }
    }
    const simulation = await getSimulationById(input.simId)
    if (!simulation) {
      return { behavior: 'allow', updatedInput: input }
    }
    let nextConfig: ModelConfig
    try {
      nextConfig = normalizeModelEdit(simulation.config, input.config)
    } catch {
      return { behavior: 'allow', updatedInput: input }
    }
    const decision = bumpIfStructural(simulation.config, nextConfig)
    if (!decision.structural) {
      return { behavior: 'allow', updatedInput: { ...input, config: nextConfig } }
    }
    const diff = computeModelDiff(simulation.config, nextConfig, decision)
    const permissionMode = context?.getAppState?.().toolPermissionContext.mode
    if (permissionMode === 'acceptEdits' || permissionMode === 'bypassPermissions' || permissionMode === 'auto') {
      return { behavior: 'allow', updatedInput: { ...input, config: nextConfig, diff } }
    }
    return {
      behavior: 'ask',
      message: `Structural change to model "${diff.modelId}" (v${diff.fromVersion} → v${diff.toVersion})`,
      updatedInput: { ...input, config: nextConfig, diff },
    }
  },
  async call({ simId, config }) {
    if (!simId) {
      return {
        data: {
          simId: '',
          applied: false,
          structural: false,
          fromVersion: '',
          toVersion: '',
          oddConflicts: [],
          error: '缺少 simulation id，无法编辑模型。请先采纳或选择一个仿真。',
        },
      }
    }
    if (!config) {
      return {
        data: {
          simId,
          applied: false,
          structural: false,
          fromVersion: '',
          toVersion: '',
          oddConflicts: [],
          error: '缺少模型配置 config，无法应用修改。',
        },
      }
    }
    const simulation = await getSimulationById(simId)
    if (!simulation) {
      return {
        data: {
          simId,
          applied: false,
          structural: false,
          fromVersion: '',
          toVersion: '',
          oddConflicts: [],
          error: `Simulation not found: ${simId}`,
        },
      }
    }

    let nextConfig: ModelConfig
    try {
      nextConfig = normalizeModelEdit(simulation.config, config)
    } catch (error) {
      return {
        data: {
          simId,
          applied: false,
          structural: false,
          fromVersion: simulation.modelVersion || '1',
          toVersion: simulation.modelVersion || '1',
          oddConflicts: [],
          error: error instanceof Error ? error.message : '模型配置不完整，无法应用修改',
        },
      }
    }
    const decision = bumpIfStructural(simulation.config, nextConfig)
    nextConfig.version = decision.version

    const params = reconcileInterfaceParamsWithParameterDefaults(
      simulation.config,
      nextConfig,
      simulation.interface.params,
    )

    const nextInterface = {
      ...simulation.interface,
      params,
    }

    const derived = deriveOdd(nextConfig)
    const prevOdd = await getOdd(simulation.projectId, simId)
    const { odd, conflicts } = mergeOdd(prevOdd, derived)

    const targetSimulation = decision.structural
      ? await createSimulation(simulation.projectId, {
          name: simulation.name,
          modelVersion: decision.version,
          lineageId: simulation.lineageId ?? simulation.id,
          parentSimId: simId,
          createdFrom: 'model_edit',
          config: nextConfig,
          interface: nextInterface,
        })
      : await updateSimulation(simulation.projectId, simId, {
          config: nextConfig,
          modelVersion: decision.version,
          interface: nextInterface,
        })

    if (!targetSimulation) {
      return {
        data: {
          simId,
          applied: false,
          structural: decision.structural,
          fromVersion: simulation.modelVersion || '1',
          toVersion: decision.version,
          oddConflicts: [],
          error: `Simulation not found: ${simId}`,
        },
      }
    }

    await putOdd(simulation.projectId, targetSimulation.id, odd)

    return {
      data: {
        simId: targetSimulation.id,
        ...(decision.structural ? { previousSimId: simId } : {}),
        applied: true,
        structural: decision.structural,
        fromVersion: simulation.modelVersion || '1',
        toVersion: decision.version,
        oddConflicts: conflicts,
      },
    }
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const out = content as Output
    const lines = out.error
      ? [out.error]
      : [
          `Model ${out.simId} ${out.applied ? 'updated' : 'unchanged'}`,
          `simId: ${out.simId}`,
          out.previousSimId ? `Previous simId: ${out.previousSimId}` : '',
          `Version: v${out.fromVersion} → v${out.toVersion} (${out.structural ? 'structural' : 'parameter-only'})`,
          out.oddConflicts.length
            ? `ODD sections needing review: ${out.oddConflicts.join(', ')}`
            : 'ODD synced (no conflicts)',
        ].filter(Boolean)
    return { tool_use_id: toolUseID, type: 'tool_result', content: lines.join('\n') }
  },
} satisfies ToolDef<InputSchema, Output>)
