import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import {
  compareRuns,
  CounterfactualError,
  startCounterfactualRun,
  waitForRunTerminal,
} from '../../server/abm/counterfactualService.js'
import { ABM_COUNTERFACTUAL_TOOL_NAME } from './constants.js'
import { counterfactualEnvelope, serializeEnvelope } from './abmCardEnvelope.js'

const DESCRIPTION =
  'Run a deterministic counterfactual: replay a completed run with the same seed and model, changing only the given parameters, then compare both trajectories.'

const PROMPT = `Answer "what if" questions with a real replay, never speculation.

Given a completed base run, this starts a new run with the SAME seed, steps,
and model version, changing only the parameters you pass, waits for it to
finish, and compares both real trajectories. Because the kernel is
deterministic, every difference is caused by the parameter change alone. The
result includes the first divergence tick and per-metric final/max deltas —
cite those computed numbers when explaining the difference.

Constraints enforced by the server: the base run must be completed, the model
version must not have changed since the base run, and at least one parameter
must change. Use abm_inspect_simulation first if you need valid parameter ids.
This tool runs a simulation, so it is unavailable in dialogue (read-only) mode.`

const comparisonMetricSchema = () =>
  z.object({
    metric: z.string(),
    baseFinal: z.number().nullable(),
    otherFinal: z.number().nullable(),
    finalDelta: z.number().nullable(),
    maxAbsDelta: z.number(),
    maxAbsDeltaTick: z.number().nullable(),
  })

const inputSchema = lazySchema(() =>
  z.strictObject({
    baseRunId: z.string().describe('The completed run to replay against'),
    params: z
      .record(z.string(), z.union([z.number(), z.string(), z.boolean()]))
      .describe('Parameter overrides for the counterfactual (at least one)'),
    note: z.string().optional().describe('Short user-facing note shown on the card'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    baseRunId: z.string(),
    runId: z.string(),
    changed: z.record(z.string(), z.unknown()),
    seed: z.number(),
    steps: z.number(),
    status: z.enum(['completed', 'failed', 'timeout']),
    divergenceTick: z.number().nullable(),
    metrics: z.array(comparisonMetricSchema()),
    note: z.string().optional(),
    error: z.string().optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const CounterfactualRunTool = buildTool({
  name: ABM_COUNTERFACTUAL_TOOL_NAME,
  searchHint: 'counterfactual what-if replay same seed compare divergence',
  maxResultSizeChars: 60_000,
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
    return 'Counterfactual Run'
  },
  isReadOnly() {
    return false
  },
  isConcurrencySafe() {
    return false
  },
  toAutoClassifierInput(input) {
    return `${input.baseRunId} ${JSON.stringify(input.params)}`
  },
  renderToolUseMessage() {
    return null
  },
  async call({ baseRunId, params, note }) {
    const failure = (message: string): { data: Output } => ({
      data: {
        baseRunId,
        runId: '',
        changed: params,
        seed: 0,
        steps: 0,
        status: 'failed',
        divergenceTick: null,
        metrics: [],
        ...(note ? { note } : {}),
        error: message,
      },
    })

    let started
    try {
      started = await startCounterfactualRun({ baseRunId, params })
    } catch (error) {
      if (error instanceof CounterfactualError) return failure(error.message)
      throw error
    }

    const status = await waitForRunTerminal(started.runId)
    const comparison =
      status === 'completed' ? await compareRuns(baseRunId, started.runId) : null

    return {
      data: {
        baseRunId,
        runId: started.runId,
        changed: started.changed,
        seed: started.seed,
        steps: started.steps,
        status,
        divergenceTick: comparison?.divergenceTick ?? null,
        metrics: comparison?.metrics ?? [],
        ...(note ? { note } : {}),
        ...(status !== 'completed'
          ? { error: status === 'timeout' ? '反事实运行超时，请稍后在工作台查看结果' : '反事实运行失败' }
          : {}),
      },
    }
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const out = content as Output
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: serializeEnvelope(
        counterfactualEnvelope({
          baseRunId: out.baseRunId,
          runId: out.runId,
          changed: out.changed,
          seed: out.seed,
          steps: out.steps,
          status: out.status,
          divergenceTick: out.divergenceTick,
          metrics: out.metrics,
          ...(out.note !== undefined ? { note: out.note } : {}),
        }),
      ),
    }
  },
} satisfies ToolDef<InputSchema, OutputSchema>)
