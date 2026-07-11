import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { getSimulationById, getOdd, putOdd } from '../../server/abm/abmStore.fs.js'
import {
  deriveOdd,
  mergeOdd,
  ODD_SECTION_KEYS,
  type Odd,
  type OddSectionKey,
} from '../../server/abm/oddService.js'
import type { ModelConfig } from '../../server/abm/types.js'
import { ABM_UPDATE_ODD_TOOL_NAME } from './constants.js'

const DESCRIPTION = 'Edit one ODD section as hand-written text (preserved across re-derivation).'

const PROMPT = `Set the text of one ODD section for a Simulation.

The section becomes hand-written: future model edits re-derive the auto sections
but never overwrite yours; if the model drifts from your text, the section is
flagged for review rather than silently changed. Sections:
purpose, entities, process, designConcepts, initialization, input, submodels.`

const inputSchema = lazySchema(() =>
  z.strictObject({
    simId: z.string().describe('The simulation whose ODD to edit'),
    section: z.enum([...ODD_SECTION_KEYS] as [OddSectionKey, ...OddSectionKey[]]),
    text: z.string().describe('The hand-written section text'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    simId: z.string(),
    section: z.string(),
    applied: z.boolean(),
    conflicts: z.array(z.string()),
    error: z.string().optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const UpdateOddTool = buildTool({
  name: ABM_UPDATE_ODD_TOOL_NAME,
  searchHint: 'edit an ODD section',
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
    return 'Update ODD'
  },
  isReadOnly() {
    return false
  },
  isConcurrencySafe() {
    return false
  },
  toAutoClassifierInput(input) {
    return `${input.simId}:${input.section}`
  },
  renderToolUseMessage() {
    return null
  },
  async call({ simId, section, text }) {
    const simulation = await getSimulationById(simId)
    if (!simulation) {
      return {
        data: { simId, section, applied: false, conflicts: [], error: `Simulation not found: ${simId}` },
      }
    }

    // Start from the persisted ODD (or a fresh derivation) and overlay the
    // hand-written section, then merge so drift flags stay consistent.
    const base: Odd = (await getOdd(simulation.projectId, simId)) ?? deriveOdd(simulation.config)
    const handEdited: Odd = {
      ...base,
      sections: {
        ...base.sections,
        [section]: { text, derived: false },
      },
    }
    const derived = deriveOdd(simulation.config as ModelConfig)
    const { odd, conflicts } = mergeOdd(handEdited, derived)
    await putOdd(simulation.projectId, simId, odd)

    return { data: { simId, section, applied: true, conflicts } }
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const out = content as Output
    const text = out.error
      ? out.error
      : `ODD section "${out.section}" updated for ${out.simId}` +
        (out.conflicts.length ? ` (review: ${out.conflicts.join(', ')})` : '')
    return { tool_use_id: toolUseID, type: 'tool_result', content: text }
  },
} satisfies ToolDef<InputSchema, Output>)
