import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { ABM_STOP_RUN_TOOL_NAME } from './constants.js'

const DESCRIPTION = 'Stop a running ABM simulation run.'

const PROMPT = `Stop the kernel run identified by \`runId\` (as returned by abm_run).
Use when the user asks to stop/cancel/interrupt a running simulation, or when a
long run should be aborted before changing parameters. Already-finished runs are
reported as not running.`

const inputSchema = lazySchema(() =>
  z.strictObject({
    runId: z.string().describe('The run to stop'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({ stopped: z.boolean(), error: z.string().optional() }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

function serverBaseUrl(): string | null {
  const url = process.env.CC_HAHA_DESKTOP_SERVER_URL
  return url && url.trim() ? url.replace(/\/$/, '') : null
}

export const StopRunTool = buildTool({
  name: ABM_STOP_RUN_TOOL_NAME,
  searchHint: 'stop cancel a running ABM simulation run',
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
    return 'Stop Run'
  },
  isReadOnly() {
    return false
  },
  isConcurrencySafe() {
    return false
  },
  toAutoClassifierInput(input) {
    return input.runId
  },
  renderToolUseMessage() {
    return null
  },
  async call({ runId }) {
    const base = serverBaseUrl()
    if (!base) {
      return {
        data: {
          stopped: false,
          error: 'Local ABM server URL unavailable (CC_HAHA_DESKTOP_SERVER_URL not set).',
        },
      }
    }
    try {
      const response = await fetch(`${base}/api/abm/runs/${encodeURIComponent(runId)}/stop`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      if (!response.ok) {
        return { data: { stopped: false, error: `Server returned ${response.status}` } }
      }
      return { data: { stopped: true } }
    } catch (error) {
      return {
        data: { stopped: false, error: error instanceof Error ? error.message : String(error) },
      }
    }
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const out = content as Output
    const text = out.stopped ? 'Run stopped.' : `Stop failed: ${out.error ?? 'unknown error'}`
    return { tool_use_id: toolUseID, type: 'tool_result', content: text }
  },
} satisfies ToolDef<InputSchema, OutputSchema>)
