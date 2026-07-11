import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { ABM_CONFIGURE_RESULTS_TOOL_NAME } from './constants.js'
import { resultCanvasEnvelope, serializeEnvelope } from './abmCardEnvelope.js'

const DESCRIPTION = 'Configure which metrics are shown on the ABM core curves.'

const PROMPT = `Use this tool when the user asks to show, draw, add, replace, or create core result charts.

It only changes the visible core-curve charts in the desktop workbench; it does not
edit the model or rerun the simulation. Prefer metric ids that exist in the
current run or model observers, such as burning, burned, burned_rate, fuel,
infected, susceptible, recovered, cooperation_rate, or mean_payoff. If the user
asks for a display that needs data not currently observed, explain that the
model observers should be edited first instead of inventing a chart.`

const inputSchema = lazySchema(() =>
  z.strictObject({
    metrics: z.array(z.string().min(1)).min(1).describe('Metric ids to show on the core curves'),
    action: z.enum(['show', 'replace']).default('show').describe('show adds charts; replace resets the core curves to these charts'),
    runId: z.string().optional().describe('Optional run id; omitted means the active run in the workbench'),
    note: z.string().optional().describe('Short user-facing explanation of the display change'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    configured: z.boolean(),
    metrics: z.array(z.string()),
    action: z.enum(['show', 'replace']),
    runId: z.string().optional(),
    note: z.string().optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const ConfigureResultsTool = buildTool({
  name: ABM_CONFIGURE_RESULTS_TOOL_NAME,
  searchHint: 'show add replace ABM result charts metrics canvas observers',
  maxResultSizeChars: 10_000,
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
    return 'Configure Results'
  },
  isReadOnly() {
    return true
  },
  isConcurrencySafe() {
    return true
  },
  toAutoClassifierInput(input) {
    return input.metrics.join(', ')
  },
  renderToolUseMessage() {
    return null
  },
  async call({ metrics, action = 'show', runId, note }) {
    return {
      data: {
        configured: true,
        metrics: [...new Set(metrics.map((metric) => metric.trim()).filter(Boolean))],
        action,
        ...(runId ? { runId } : {}),
        ...(note ? { note } : {}),
      },
    }
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const out = content as Output
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: serializeEnvelope(
        resultCanvasEnvelope({
          metrics: out.metrics,
          action: out.action,
          ...(out.runId ? { runId: out.runId } : {}),
          ...(out.note ? { note: out.note } : {}),
        }),
      ),
    }
  },
} satisfies ToolDef<InputSchema, OutputSchema>)
