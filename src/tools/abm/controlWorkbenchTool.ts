import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { ABM_CONTROL_WORKBENCH_TOOL_NAME } from './constants.js'
import {
  workbenchEnvelope,
  serializeEnvelope,
  type AbmWorkbenchView,
} from './abmCardEnvelope.js'

const DESCRIPTION =
  'Open, close, or focus the desktop simulation workbench (run canvas / deep experiments / agents / model / ODD / simulation manager).'

const PROMPT = `Use this tool whenever the user asks to open the simulation workbench,
show the canvas, view results/experiments, inspect the mechanism graph, read the
ODD protocol, or manage simulations — or whenever you started a run and want the
user to watch it live.

Views:
- "run": simulation canvas with run controls (watch agents live)
- "results": deep experiment view with generated charts and experiment controls
- "agents": live agent table plus per-agent initialization edits
- "model": mechanism graph and parameters
- "odd": the ODD protocol document
- "simulations": simulation manager (model versions under the research question)

You may also bind the workbench to a specific simulation (simId, the server UUID)
and/or focus a specific run (runId) so its frames/results are shown. This tool
only changes what the desktop displays; it never edits models or starts runs.`

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum(['open', 'close']).describe('open shows the workbench panel; close hides it'),
    view: z
      .enum(['run', 'results', 'agents', 'model', 'odd', 'simulations'])
      .nullish()
      .describe('Which workbench view to focus'),
    simId: z.string().nullish().describe('Bind the workbench to this simulation (server UUID)'),
    runId: z.string().nullish().describe('Focus this run on the canvas/results'),
    note: z.string().nullish().describe('Short user-facing reason for the change'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    action: z.enum(['open', 'close']),
    view: z.string().optional(),
    simId: z.string().optional(),
    runId: z.string().optional(),
    note: z.string().optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const ControlWorkbenchTool = buildTool({
  name: ABM_CONTROL_WORKBENCH_TOOL_NAME,
  searchHint: 'open close focus the ABM simulation workbench panel view',
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
    return 'Control Workbench'
  },
  isReadOnly() {
    return true
  },
  isConcurrencySafe() {
    return true
  },
  toAutoClassifierInput(input) {
    return `${input.action}${input.view ? ` ${input.view}` : ''}`
  },
  renderToolUseMessage() {
    return null
  },
  async call({ action, view, simId, runId, note }) {
    return {
      data: {
        action,
        ...(view ? { view } : {}),
        ...(simId ? { simId } : {}),
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
        workbenchEnvelope({
          action: out.action,
          ...(out.view ? { view: out.view as AbmWorkbenchView } : {}),
          ...(out.simId ? { simId: out.simId } : {}),
          ...(out.runId ? { runId: out.runId } : {}),
          ...(out.note ? { note: out.note } : {}),
        }),
      ),
    }
  },
} satisfies ToolDef<InputSchema, OutputSchema>)
