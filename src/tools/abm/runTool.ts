import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { ABM_RUN_TOOL_NAME } from './constants.js'

const DESCRIPTION = 'Start a deterministic run of a Simulation and return its runId.'

const PROMPT = `Start a run for the Simulation \`simId\`.

simId must be the server UUID returned by abm_adopt_simulation (or shown in the
workbench Run panel). **Never** use a proposal draft slug such as
sir-spatial-grid — that is not a simulation id.

If the user just chose a proposal, call abm_adopt_simulation first, then abm_run
with the returned simId.

The run is deterministic given seed + parameters + model version. It executes on
the server (the desktop subscribes to /ws/abm/:runId for live frames), so this
tool returns the runId immediately; it does not wait for completion. Use
abm_explain_interval afterward to explain intervals of the produced trace.`

const inputSchema = lazySchema(() =>
  z.strictObject({
    simId: z.string().describe('The simulation to run'),
    seed: z.number().optional().describe('Override the simulation seed'),
    steps: z.number().optional().describe('Override the step count'),
    params: z.record(z.string(), z.unknown()).optional().describe('Override parameters'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({ runId: z.string().optional(), started: z.boolean(), error: z.string().optional() }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

function serverBaseUrl(): string | null {
  const url = process.env.CC_HAHA_DESKTOP_SERVER_URL
  return url && url.trim() ? url.replace(/\/$/, '') : null
}

export const RunTool = buildTool({
  name: ABM_RUN_TOOL_NAME,
  searchHint: 'start an ABM simulation run',
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
    return 'Run Simulation'
  },
  isReadOnly() {
    return false
  },
  isConcurrencySafe() {
    return false
  },
  toAutoClassifierInput(input) {
    return input.simId
  },
  renderToolUseMessage() {
    return null
  },
  async call({ simId, seed, steps, params }) {
    const base = serverBaseUrl()
    if (!base) {
      return {
        data: {
          started: false,
          error: 'Local ABM server URL unavailable (CC_HAHA_DESKTOP_SERVER_URL not set).',
        },
      }
    }
    const body: Record<string, unknown> = {}
    if (seed !== undefined) body.seed = seed
    if (steps !== undefined) body.steps = steps
    if (params !== undefined) body.params = params
    try {
      const response = await fetch(
        `${base}/api/abm/simulations/${encodeURIComponent(simId)}/runs`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      if (!response.ok) {
        return { data: { started: false, error: `Server returned ${response.status}` } }
      }
      const json = (await response.json()) as { runId?: string }
      if (!json.runId) {
        return { data: { started: false, error: 'Server did not return a runId' } }
      }
      return { data: { runId: json.runId, started: true } }
    } catch (error) {
      return {
        data: { started: false, error: error instanceof Error ? error.message : String(error) },
      }
    }
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const out = content as Output
    const text = out.started
      ? `Run started: ${out.runId}`
      : `Run not started: ${out.error ?? 'unknown error'}`
    return { tool_use_id: toolUseID, type: 'tool_result', content: text }
  },
} satisfies ToolDef<InputSchema, Output>)
