import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import {
  buildExplainContext,
  validateEvidence,
  type Evidence,
} from '../../server/abm/explainService.js'
import { ABM_EXPLAIN_TOOL_NAME } from './constants.js'
import { explanationEnvelope, serializeEnvelope } from './abmCardEnvelope.js'

const DESCRIPTION =
  'Explain a Trace interval with evidence that is validated against the real run.'

const PROMPT = `Explain what happened in a run over the tick interval [from, to].

You author the narrative and the supporting evidence citations, but EVERY
citation is validated against the real Trace on the server. A citation is a
{ tick, metric?, value?, event?, mechanism_id? } that must actually exist in the
interval. Out-of-range ticks, unknown metrics/events/mechanisms, and fabricated
values are rejected and dropped. If no citation survives validation, the
explanation is flagged "speculative". Never invent evidence — ground every claim
in the trace, and if you have no grounding, say so and let it be marked
speculative.`

const evidenceSchema = () =>
  z.object({
    tick: z.number(),
    metric: z.string().optional(),
    value: z.number().optional(),
    event: z.string().optional(),
    mechanism_id: z.string().optional(),
  })

const inputSchema = lazySchema(() =>
  z.strictObject({
    runId: z.string().describe('The run to explain'),
    from: z.number().describe('Interval start tick (inclusive)'),
    to: z.number().describe('Interval end tick (inclusive)'),
    narrative: z.string().describe('Your evidence-grounded explanation text'),
    evidence: z.array(evidenceSchema()).describe('Citations to validate against the trace'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    runId: z.string(),
    from: z.number(),
    to: z.number(),
    text: z.string(),
    evidence: z.array(evidenceSchema()),
    rejected: z.array(evidenceSchema()),
    speculative: z.boolean(),
    error: z.string().optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const ExplainIntervalTool = buildTool({
  name: ABM_EXPLAIN_TOOL_NAME,
  searchHint: 'explain a trace interval with evidence',
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
    return 'Explain Interval'
  },
  isReadOnly() {
    return true
  },
  isConcurrencySafe() {
    return true
  },
  toAutoClassifierInput(input) {
    return `${input.runId} [${input.from},${input.to}]`
  },
  renderToolUseMessage() {
    return null
  },
  async call({ runId, from, to, narrative, evidence }) {
    const context = await buildExplainContext(runId, from, to)
    if (!context) {
      return {
        data: {
          runId,
          from,
          to,
          text: narrative,
          evidence: [],
          rejected: evidence as Evidence[],
          speculative: true,
          error: `Run not found or has no trace: ${runId}`,
        },
      }
    }
    const { ok, rejected } = validateEvidence(context, evidence as Evidence[])
    return {
      data: {
        runId,
        from,
        to,
        text: narrative,
        evidence: ok,
        rejected,
        // No grounded citation survived → the claim is unsupported by the trace.
        speculative: ok.length === 0,
      },
    }
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const out = content as Output
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: serializeEnvelope(
        explanationEnvelope({
          text: out.text,
          evidence: out.evidence,
          speculative: out.speculative,
          runId: out.runId,
          from: out.from,
          to: out.to,
        }),
      ),
    }
  },
} satisfies ToolDef<InputSchema, Output>)
