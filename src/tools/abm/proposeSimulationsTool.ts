import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { ABM_PROPOSE_TOOL_NAME } from './constants.js'
import {
  proposalBatchEnvelope,
  serializeEnvelope,
  type AbmProposalEnvelope,
} from './abmCardEnvelope.js'

const DESCRIPTION =
  'Present a clarified batch of candidate Simulation drafts to the user as adoptable cards; ask clarification questions first when the research need is still rough.'

const PROMPT = `Use this tool only after the user's modeling need is clear enough to build candidate ABM simulations.

Hard gating rule: if the user's message is still a broad topic, slogan, domain,
or one-sentence idea, do not call this tool and do not produce a proposal list
in plain text or markdown. Ask focused clarification questions only. Prefer 4-7 concise
questions, covering the target phenomenon, agent types, environment/space
representation (grid, network, geography, institution, or hybrid), decision
mechanisms or hypotheses, available data or empirical pattern, key metrics,
time/scale, and intended experiments. In other words, ask focused clarification questions first.
The clarification must explicitly cover environment/space representation.
Do not rush into model generation when
those pieces are unknown; keep asking until the core research demand is usable.

For a rough topic such as "研究校园谣言", "做一个交通 ABM", or "帮我研究平台舆情", do not call this tool yet. First ask the user to clarify the research question, expected agents, interaction structure, data/evidence, outcome metrics, and experiment plan. Only after the user answers should you generate proposals.

After the requirement is clear, propose 5-10 candidate Simulation designs for the user's research question.
Treat this as the output of an ABM research workflow: requirement elicitation,
model-family scouting, mechanism design, validation-agent review, baseline run
design, experiment UI/chart planning, and evidence-backed synthesis. In
autonomous exploration mode, label intermediate notes as stage progress rather
than final answers, then continue through adoption/edit, validation, baseline
run, generated deep experiment view, and final synthesis. Call the validation tool
after adoption/edit before claiming the model is ready.
The set must be mechanism-diverse, not cosmetic variants of the same model.
Case-library examples are display-only examples for users. Do not inspect, cite,
import, or reuse a case as the starting point for a new model unless the user
explicitly selected that case or asked to modify the active simulation. Do not
call internal model families "templates" in user-facing prose; say model family,
baseline model, or runnable simulation instead.
Draw from classic ABM model families when relevant: Schelling-style
segregation, threshold/opinion dynamics, commons/cooperation, spatial fire or
diffusion fronts, traffic/flow, market/coordination, network contagion, resource
competition, institution/rule change, or geography-aware mobility. Do not default
to SIR/infectious-disease variables unless the user explicitly asks for epidemic,
rumor, contagion, or diffusion mechanisms. For every proposal, state the intended
visual representation (patch/grid, moving agents, network graph, geography, or
hybrid) so the adopted simulation can look and run like a vivid model rather than
a static chart.

Every proposal id must be unique and specific to that design, not a generic
"p1" or reused template slug. Include the model family and representation in the
id, for example wildfire-fuel-break-grid, opinion-echo-network, or
commons-sanction-network. Different adopted proposals become different
Simulations; only later edits to the same Simulation are versions.

Use native parameter ids for the selected model family whenever possible; do not
invent generic keys that the runnable model will ignore. Useful built-in ids:
- wildfire: fuel_density, rock_density, spread_probability, wind_bias, spot_fire_probability, regrowth_rate_per_tick, ignition_count
- sir / rumor: beta, gamma, initial_infected, debunk_rate, intervention_start
- schelling: tolerance
- diffusion: innovation_p, imitation_q, initial_adopters
- opinion: confidence_threshold, convergence_rate
- public_goods: multiplication_factor, cost, selection_strength, initial_coop_rate
- social_influence: mean_threshold, initial_active

Each proposal must include:
- mechanismSummary: one-line description of the core mechanism
- keyParams: the parameters that matter (object of name -> value)
- expectedMacro: the macro-level behavior you expect to emerge
- oddExcerpt: a short ODD-style note (Process/Submodels)
- a representation choice in the id or mechanismSummary when relevant, e.g. network/social graph vs grid/spatial cells, so the adopted Simulation uses the right canvas style.

For wildfire proposals, preserve the user's ignition semantics. If the user asks
for a single ignition point, set keyParams.ignition_count = 1 and
keyParams.spot_fire_probability = 0; only use spot_fire_probability > 0 when the
user explicitly asks for spotting/embers. Use rock_density when the user asks for
rock or barrier terrain.
If the user asks for multi-point, multiple ignition, or burst ignition, set
keyParams.ignition_count > 1 and keep keyParams.spot_fire_probability = 0 unless
the user explicitly asks for random spotting/embers. Multi-point ignition means
several initial fronts at tick 0, not a single-point model plus remote spotting.

Only attach a "trial" (runId + sparkline) if you actually ran a real low-step
trial via abm_run — never fabricate a run id or metric series.

When the user picks a proposal, call abm_adopt_simulation first to obtain the
real server simId (UUID). Never pass the proposal slug (e.g. sir-spatial-grid)
to abm_run or abm_edit_model. After adoption, call abm_validate_simulation as
the validation agent; only run larger experiments after blocking issues are
resolved.`

// Optional fields accept null too: models often emit `"trial": null` instead of
// omitting the key, which must not fail input validation.
const proposalSchema = () =>
  z.object({
    id: z.string().describe('Stable id for this proposal'),
    mechanismSummary: z.string().describe('One-line core mechanism'),
    keyParams: z.record(z.string(), z.unknown()).nullish().describe('Key parameters'),
    expectedMacro: z.string().describe('Expected macro-level behavior'),
    oddExcerpt: z.string().nullish().describe('Short ODD-style note'),
    trial: z
      .object({ runId: z.string(), sparkline: z.array(z.number()) })
      .nullish()
      .describe('Only for a real executed trial run'),
  })

const inputSchema = lazySchema(() =>
  z.strictObject({
    proposals: z.array(proposalSchema()).min(1).describe('Candidate Simulation drafts'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({ count: z.number(), proposals: z.array(proposalSchema()) }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

/** Drop a trial unless it carries both a runId and a non-empty sparkline. */
function sanitizeProposals(proposals: AbmProposalEnvelope[]): AbmProposalEnvelope[] {
  return proposals.map((proposal) => {
    const trial =
      proposal.trial && proposal.trial.runId && proposal.trial.sparkline?.length
        ? proposal.trial
        : undefined
    return { ...proposal, ...(trial ? { trial } : { trial: undefined }) }
  })
}

export const ProposeSimulationsTool = buildTool({
  name: ABM_PROPOSE_TOOL_NAME,
  searchHint: 'propose candidate ABM simulations',
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
    return 'Propose Simulations'
  },
  isReadOnly() {
    return false
  },
  isConcurrencySafe() {
    return true
  },
  toAutoClassifierInput(input) {
    return `${input.proposals.length} proposals`
  },
  renderToolUseMessage() {
    return null
  },
  async call({ proposals }) {
    const sanitized = sanitizeProposals(proposals as AbmProposalEnvelope[])
    return { data: { count: sanitized.length, proposals: sanitized } }
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const { proposals } = content as Output
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: serializeEnvelope(proposalBatchEnvelope(proposals as AbmProposalEnvelope[])),
    }
  },
} satisfies ToolDef<InputSchema, Output>)
