import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { ABM_CONFIGURE_EXPERIMENT_TOOL_NAME } from './constants.js'
import {
  experimentViewEnvelope,
  serializeEnvelope,
  type AbmExperimentViewSpec,
} from './abmCardEnvelope.js'

const DESCRIPTION =
  'Generate the deep experiment UI: declare which result charts and which parameter controls the workbench should show for the experiment the user wants to run.'

const PROMPT = `Use this tool when the user asks for an extended ABM research experiment
— e.g. single-factor local sensitivity, global sensitivity, random-seed ensemble /
mechanism decomposition, parameter-interval uncertainty propagation, timed or
tiered interventions, counterfactual comparison, theory exploration, or
robustness checks. You design the experiment UI; the workbench renders it.

Declare a view spec:
- \`title\` / \`intent\` / \`description\`: what the experiment studies (in the
  user's language).
- \`charts\`: the visualizations that make the experiment readable. Use metric
  ids that really exist as model observers (check with abm_inspect_simulation).
  \`type\`: "line" (metric over ticks for the active run), "multi_line" (one line
  per sweep value / seed), "bar" or "scatter" (final metric vs the swept
  parameter, xAxis: "parameter").
- \`controls\`: the parameter UI the researcher needs. Use real parameter ids.
  \`role\`: "sweep" for the swept axis (give \`values\`), "fixed" for parameters
  pinned during the experiment (give \`value\`). Use "slider" only for bounded
  numeric parameters (give min/max/step); use "input" for open-ended numbers and
  "select" with \`options\` for discrete choices.
- \`experiment\`: the batch design — the swept \`parameter\`, its \`values\`,
  \`replications\` (use >1 with different seeds for ensemble/robustness), and
  \`steps\`.

The desktop renders this spec in the deep experiment workspace (深度实验) with a run
button; running still happens through the normal experiment pipeline, so all
displayed numbers come from real runs. Never invent metric or parameter ids.`

const chartSchema = () =>
  z.object({
    id: z.string(),
    title: z.string(),
    type: z.enum(['line', 'multi_line', 'bar', 'scatter']),
    metrics: z.array(z.string()).min(1).describe('Observer metric ids to plot'),
    xAxis: z.enum(['tick', 'parameter']).nullish(),
    note: z.string().nullish(),
  })

const controlSchema = () =>
  z.object({
    id: z.string().describe('Real model parameter id'),
    label: z.string().describe("Human label in the user's language"),
    kind: z.enum(['slider', 'input', 'select']),
    min: z.number().nullish(),
    max: z.number().nullish(),
    step: z.number().nullish(),
    options: z.array(z.union([z.string(), z.number()])).nullish(),
    value: z.unknown().nullish().describe('Fixed/default value'),
    role: z.enum(['sweep', 'fixed']).nullish(),
    values: z.array(z.number()).nullish().describe('Sweep values when role=sweep'),
    description: z.string().nullish(),
  })

const experimentSchema = () =>
  z.preprocess((value) => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    if (!trimmed) return undefined
    try {
      return JSON.parse(trimmed)
    } catch {
      return undefined
    }
  }, z.object({
    parameter: z.string().nullish(),
    values: z.array(z.number()).nullish(),
    replications: z.number().nullish(),
    steps: z.number().nullish(),
  }).nullish())

const inputSchema = lazySchema(() =>
  z.strictObject({
    simId: z.string().nullish().describe('Simulation this experiment belongs to'),
    title: z.string().describe('Experiment title'),
    intent: z.string().nullish().describe('Experiment family, e.g. sensitivity / intervention / robustness'),
    description: z.string().nullish().describe('1-2 sentence study description'),
    charts: z.array(chartSchema()).min(1).describe('Visualizations to render'),
    controls: z.array(controlSchema()).describe('Parameter controls to render'),
    experiment: experimentSchema()
      .describe('Batch design prefill for the run button'),
    note: z.string().nullish().describe('Short user-facing note about the generated view'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    configured: z.boolean(),
    simId: z.string().optional(),
    view: z.custom<AbmExperimentViewSpec>(),
    note: z.string().optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const ConfigureExperimentViewTool = buildTool({
  name: ABM_CONFIGURE_EXPERIMENT_TOOL_NAME,
  searchHint: 'generate deep experiment UI charts parameter controls sensitivity robustness intervention',
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
    return 'Configure Deep Experiment View'
  },
  isReadOnly() {
    return true
  },
  isConcurrencySafe() {
    return true
  },
  toAutoClassifierInput(input) {
    return input.title
  },
  renderToolUseMessage() {
    return null
  },
  async call({ simId, title, intent, description, charts, controls, experiment, note }) {
    const view: AbmExperimentViewSpec = {
      title,
      ...(intent ? { intent } : {}),
      ...(description ? { description } : {}),
      charts: charts.map((chart) => ({
        id: chart.id,
        title: chart.title,
        type: chart.type,
        metrics: chart.metrics,
        ...(chart.xAxis ? { xAxis: chart.xAxis } : {}),
        ...(chart.note ? { note: chart.note } : {}),
      })),
      controls: controls.map((control) => ({
        id: control.id,
        label: control.label,
        kind: control.kind,
        ...(control.min !== null && control.min !== undefined ? { min: control.min } : {}),
        ...(control.max !== null && control.max !== undefined ? { max: control.max } : {}),
        ...(control.step !== null && control.step !== undefined ? { step: control.step } : {}),
        ...(control.options ? { options: control.options } : {}),
        ...(control.value !== null && control.value !== undefined ? { value: control.value } : {}),
        ...(control.role ? { role: control.role } : {}),
        ...(control.values ? { values: control.values } : {}),
        ...(control.description ? { description: control.description } : {}),
      })),
      ...(experiment
        ? {
            experiment: {
              ...(experiment.parameter ? { parameter: experiment.parameter } : {}),
              ...(experiment.values ? { values: experiment.values } : {}),
              ...(experiment.replications !== null && experiment.replications !== undefined
                ? { replications: experiment.replications }
                : {}),
              ...(experiment.steps !== null && experiment.steps !== undefined
                ? { steps: experiment.steps }
                : {}),
            },
          }
        : {}),
    }
    return {
      data: {
        configured: true,
        ...(simId ? { simId } : {}),
        view,
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
        experimentViewEnvelope({
          view: out.view,
          ...(out.simId ? { simId: out.simId } : {}),
          ...(out.note ? { note: out.note } : {}),
        }),
      ),
    }
  },
} satisfies ToolDef<InputSchema, OutputSchema>)
