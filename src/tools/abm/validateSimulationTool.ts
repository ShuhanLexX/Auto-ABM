import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { getOdd, getSimulationById } from '../../server/abm/abmStore.fs.js'
import { readModelConfig } from '../../server/abm/modelConfigShape.js'
import { ABM_VALIDATE_TOOL_NAME } from './constants.js'

const DESCRIPTION =
  'Validate a Simulation after adoption or model edits: checks structure, initialization, parameters, observers, and ODD/version alignment.'

const PROMPT = `Use this read-only validation tool after abm_adopt_simulation and after
any abm_edit_model call, before telling the user the model is ready. Treat it as
the model validation agent in the ABM workflow.

If the report contains blocking issues, explain them briefly and fix the model
with abm_edit_model before running large experiments. If it contains warnings,
either ask the user whether to accept them or propose a focused correction.`

const inputSchema = lazySchema(() =>
  z.strictObject({
    simId: z.string().describe('Simulation UUID to validate'),
    includeOdd: z.boolean().optional().describe('Also check ODD version/review status; default true'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const issueSchema = z.object({
  level: z.enum(['blocking', 'warning', 'suggestion']),
  area: z.string(),
  message: z.string(),
})

const outputSchema = lazySchema(() =>
  z.object({
    simId: z.string(),
    valid: z.boolean(),
    issueCount: z.number(),
    warningCount: z.number(),
    summary: z.string(),
    issues: z.array(issueSchema),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type ValidationIssue = z.infer<typeof issueSchema>
export type Output = z.infer<OutputSchema>

function pushIssue(issues: ValidationIssue[], level: ValidationIssue['level'], area: string, message: string) {
  issues.push({ level, area, message })
}

export const ValidateSimulationTool = buildTool({
  name: ABM_VALIDATE_TOOL_NAME,
  searchHint: 'validate check ABM simulation model structure ODD parameters observers',
  maxResultSizeChars: 40_000,
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
    return 'Validate Simulation'
  },
  isReadOnly() {
    return true
  },
  isConcurrencySafe() {
    return true
  },
  toAutoClassifierInput(input) {
    return input.simId
  },
  renderToolUseMessage() {
    return null
  },
  async call({ simId, includeOdd = true }) {
    const simulation = await getSimulationById(simId)
    if (!simulation) {
      const issues: ValidationIssue[] = [{
        level: 'blocking',
        area: 'simulation',
        message: `Simulation not found: ${simId}`,
      }]
      return {
        data: {
          simId,
          valid: false,
          issueCount: 1,
          warningCount: 0,
          summary: `仿真不存在：${simId}`,
          issues,
        },
      }
    }

    const shape = readModelConfig(simulation.config)
    const issues: ValidationIssue[] = []

    if (!shape.id) pushIssue(issues, 'blocking', 'model', '模型缺少稳定 id，后续版本和 ODD 无法可靠绑定。')
    if (!shape.name) pushIssue(issues, 'warning', 'model', '模型缺少可读名称，建议补充以便研究记录引用。')
    if (shape.agents.length === 0) {
      pushIssue(issues, 'blocking', 'agents', '模型没有声明任何智能体类型。')
    }
    for (const agent of shape.agents) {
      if (!agent.id) pushIssue(issues, 'blocking', 'agents', '存在缺少 id 的智能体类型。')
      if (!agent.name) pushIssue(issues, 'warning', 'agents', `智能体 ${agent.id || '(unknown)'} 缺少名称。`)
      if (agent.stateVariables.length === 0) {
        pushIssue(issues, 'suggestion', 'agents', `智能体 ${agent.id || agent.name || '(unknown)'} 没有状态变量，解释性会偏弱。`)
      }
      for (const stateVariable of agent.stateVariables) {
        if (!stateVariable.name) {
          pushIssue(issues, 'blocking', 'agents', `智能体 ${agent.id || agent.name || '(unknown)'} 存在缺少 name 的状态变量。`)
        }
        if (!stateVariable.dtype) {
          pushIssue(issues, 'blocking', 'agents', `智能体 ${agent.id || agent.name || '(unknown)'} 的状态变量 ${stateVariable.name || '(unknown)'} 缺少 dtype。`)
        }
        if (!('default' in stateVariable) || stateVariable.default === undefined) {
          pushIssue(issues, 'blocking', 'agents', `智能体 ${agent.id || agent.name || '(unknown)'} 的状态变量 ${stateVariable.name || '(unknown)'} 缺少 default。`)
        }
      }
    }

    const modelId = shape.id
    if (modelId && !/^[a-z][a-z0-9_]*$/.test(modelId)) {
      pushIssue(issues, 'blocking', 'model', `模型 id "${modelId}" 必须为 snake_case（例如 template_wildfire_grid），不能使用 UUID 或其它格式。`)
    }

    if (!shape.environment.type || shape.environment.type === 'none') {
      pushIssue(issues, 'warning', 'environment', '模型没有明确空间/网络环境，画布表现可能不够直观。')
    }
    if (shape.environment.type === 'grid') {
      const width = shape.environment.config.width
      const height = shape.environment.config.height
      if (typeof width !== 'number' || typeof height !== 'number') {
        pushIssue(issues, 'blocking', 'environment', '网格环境缺少 width/height。')
      }
    }
    if (shape.environment.type === 'network') {
      const kind = shape.environment.config.kind
      if (typeof kind !== 'string' || !kind.trim()) {
        pushIssue(issues, 'suggestion', 'environment', '网络环境未声明 kind，建议说明 ER、小世界、无标度或经验网络来源。')
      }
    }

    if (shape.mechanisms.length === 0) {
      pushIssue(issues, 'blocking', 'mechanisms', '模型没有机制节点，无法解释微观规则如何生成宏观结果。')
    }
    for (const mechanism of shape.mechanisms) {
      if (!mechanism.id || !mechanism.name) pushIssue(issues, 'warning', 'mechanisms', '存在缺少 id/name 的机制节点。')
      if (!mechanism.trigger || !mechanism.effect) {
        pushIssue(issues, 'suggestion', 'mechanisms', `机制 ${mechanism.id || mechanism.name || '(unknown)'} 缺少触发条件或影响描述。`)
      }
    }

    if (shape.parameters.length === 0) {
      pushIssue(issues, 'warning', 'parameters', '模型没有显式参数，后续敏感性分析和实验 UI 会受限。')
    }
    const parameterIds = new Set<string>()
    for (const parameter of shape.parameters) {
      if (!parameter.id) pushIssue(issues, 'blocking', 'parameters', '存在缺少 id 的参数。')
      if (parameter.id && parameterIds.has(parameter.id)) {
        pushIssue(issues, 'blocking', 'parameters', `参数 id 重复：${parameter.id}`)
      }
      if (parameter.id) parameterIds.add(parameter.id)
      if (parameter.min !== null && parameter.max !== null && parameter.min >= parameter.max) {
        pushIssue(issues, 'blocking', 'parameters', `参数 ${parameter.id} 的 min 必须小于 max。`)
      }
    }

    if (shape.observers.length === 0) {
      pushIssue(issues, 'blocking', 'observers', '模型没有观测指标，核心曲线和深度实验无法展示真实数据。')
    }
    for (const observer of shape.observers) {
      if (!observer.id) pushIssue(issues, 'blocking', 'observers', '存在缺少 id 的观测指标。')
      if (!observer.name) pushIssue(issues, 'suggestion', 'observers', `观测指标 ${observer.id || '(unknown)'} 缺少可读名称。`)
    }

    const declaredAgentIds = new Set(shape.agents.map((agent) => agent.id).filter(Boolean))
    const countEntries = Object.entries(shape.initialization.agentCounts)
    if (countEntries.length === 0) {
      pushIssue(issues, 'blocking', 'initialization', '初始化没有声明 agent_counts，无法确定智能体规模。')
    }
    for (const [agentId, count] of countEntries) {
      if (!declaredAgentIds.has(agentId)) {
        pushIssue(issues, 'warning', 'initialization', `初始化规模引用了未声明智能体：${agentId}`)
      }
      if (!Number.isFinite(count) || count <= 0) {
        pushIssue(issues, 'blocking', 'initialization', `智能体 ${agentId} 的初始化数量必须大于 0。`)
      }
      if (count < 20) {
        pushIssue(issues, 'suggestion', 'initialization', `智能体 ${agentId} 规模较小（${count}），展示涌现模式可能不明显。`)
      }
    }

    if (includeOdd) {
      const odd = await getOdd(simulation.projectId, simulation.id).catch(() => null)
      if (!odd) {
        pushIssue(issues, 'warning', 'odd', '当前仿真还没有 ODD 协议文档。')
      } else {
        if (odd.modelVersion !== simulation.modelVersion) {
          pushIssue(issues, 'warning', 'odd', `ODD 版本 v${odd.modelVersion} 与模型版本 v${simulation.modelVersion} 不一致。`)
        }
        const reviewSections = Object.entries(odd.sections)
          .filter(([, section]) => section.needsReview)
          .map(([key]) => key)
        if (reviewSections.length > 0) {
          pushIssue(issues, 'suggestion', 'odd', `ODD 有待复核章节：${reviewSections.join(', ')}`)
        }
      }
    }

    const blocking = issues.filter((issue) => issue.level === 'blocking').length
    const warnings = issues.filter((issue) => issue.level === 'warning').length
    const suggestions = issues.filter((issue) => issue.level === 'suggestion').length
    const summary = blocking > 0
      ? `模型验证未通过：${blocking} 个阻塞问题，${warnings} 个警告，${suggestions} 个建议。`
      : `模型验证通过：${warnings} 个警告，${suggestions} 个建议。`

    return {
      data: {
        simId: simulation.id,
        valid: blocking === 0,
        issueCount: blocking,
        warningCount: warnings,
        summary,
        issues,
      },
    }
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const out = content as Output
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: JSON.stringify(out, null, 2),
    }
  },
} satisfies ToolDef<InputSchema, OutputSchema>)
