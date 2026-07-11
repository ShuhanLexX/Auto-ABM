import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { createProject, createSimulation, listProjects } from '../../server/abm/abmStore.fs.js'
import { dumpBuiltinConfig } from '../../server/abm/kernelProcess.js'
import { applyProposalIdentity } from '../../server/abm/proposalIdentity.js'
import { ABM_ADOPT_TOOL_NAME } from './constants.js'
import { extractRunInterface, inferTemplateFromProposal } from './proposalTemplate.js'

const DESCRIPTION = 'Adopt a Simulation draft proposal as a runnable Simulation on the server.'

const PROMPT = `Create a real Simulation from a proposal draft returned by abm_propose_simulations.

**Always call this before abm_run or abm_edit_model** when the user picks a proposal.
The proposal \`id\` (e.g. sir-spatial-grid) is **not** a simId — this tool returns the
server UUID simId you must use for subsequent tools.

If projectId is omitted, the default (first) project is used or created.

After this tool succeeds, call abm_validate_simulation on the returned simId.
If validation reports blocking issues, fix them before running a full experiment;
if it reports warnings, summarize them and ask whether the user wants to refine
the model now.`

const proposalInputSchema = () =>
  z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value
      const trimmed = value.trim()
      if (!trimmed) return value
      try {
        return JSON.parse(trimmed)
      } catch {
        return { id: trimmed }
      }
    },
    z.object({
      id: z.string(),
      mechanismSummary: z.string().optional(),
      keyParams: z.record(z.string(), z.unknown()).nullish(),
      expectedMacro: z.string().optional(),
      oddExcerpt: z.string().nullish(),
    }),
  )

const inputSchema = lazySchema(() =>
  z.object({
    projectId: z.string().optional().describe('Project to host the simulation; default project if omitted'),
    proposal: proposalInputSchema().optional().describe('The proposal draft to adopt'),
    id: z.string().optional().describe('Fallback proposal id when the model emits proposal fields at top level'),
    mechanismSummary: z.string().optional(),
    keyParams: z.record(z.string(), z.unknown()).nullish(),
    expectedMacro: z.string().optional(),
    oddExcerpt: z.string().nullish(),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
type AdoptInput = z.infer<InputSchema>
type ProposalInput = z.infer<ReturnType<typeof proposalInputSchema>>

const outputSchema = lazySchema(() =>
  z.object({
    simId: z.string().optional(),
    projectId: z.string().optional(),
    template: z.string().optional(),
    adopted: z.boolean(),
    error: z.string().optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

async function resolveProjectId(projectId?: string): Promise<string> {
  if (projectId?.trim()) return projectId.trim()
  const projects = await listProjects()
  if (projects.length > 0) return projects[0]!.id
  const created = await createProject({ name: '默认研究课题' })
  return created.id
}

export const AdoptSimulationTool = buildTool({
  name: ABM_ADOPT_TOOL_NAME,
  searchHint: 'adopt an ABM simulation proposal as a runnable simulation',
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
    return 'Adopt Simulation'
  },
  isReadOnly() {
    return false
  },
  isConcurrencySafe() {
    return false
  },
  toAutoClassifierInput(input) {
    return resolveProposal(input)?.id ?? ''
  },
  renderToolUseMessage() {
    return null
  },
  async call(input) {
    try {
      const { projectId } = input
      const proposal = resolveProposal(input)
      if (!proposal?.id?.trim()) {
        return {
          data: {
            adopted: false,
            error: 'proposal id is required; pass the selected proposal object or its top-level id.',
          },
        }
      }
      const pid = await resolveProjectId(projectId)
      const template = inferTemplateFromProposal(proposal)
      const { seed, steps, params } = extractRunInterface(proposal.keyParams ?? undefined, template)
      const normalizedProposal = { ...proposal, keyParams: params }
      const config = applyProposalIdentity(await dumpBuiltinConfig(template), normalizedProposal, template)
      const modelVersion = typeof config.version === 'string' ? config.version : '1'
      const name =
        typeof proposal.mechanismSummary === 'string' && proposal.mechanismSummary.trim()
          ? proposal.mechanismSummary.trim().slice(0, 60)
          : proposal.id

      const simulation = await createSimulation(pid, {
        name,
        modelVersion,
        createdFrom: 'proposal',
        config,
        interface: {
          seed: seed ?? 42,
          steps: steps ?? 50,
          params,
        },
      })

      return {
        data: {
          adopted: true,
          simId: simulation.id,
          projectId: pid,
          template,
        },
      }
    } catch (error) {
      return {
        data: {
          adopted: false,
          error: error instanceof Error ? error.message : String(error),
        },
      }
    }
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const out = content as Output
    const text = out.adopted
      ? `Adopted simulation ${out.simId} (modelFamily=${out.template}, project=${out.projectId}). Use this simId for abm_run / abm_edit_model — never the proposal slug.`
      : `Adopt failed: ${out.error ?? 'unknown error'}`
    return { tool_use_id: toolUseID, type: 'tool_result', content: text }
  },
} satisfies ToolDef<InputSchema, OutputSchema>)

function resolveProposal(input: AdoptInput): ProposalInput | null {
  if (input.proposal) return input.proposal
  if (typeof input.id !== 'string' || !input.id.trim()) return null
  return {
    id: input.id.trim(),
    ...(typeof input.mechanismSummary === 'string' ? { mechanismSummary: input.mechanismSummary } : {}),
    ...(input.keyParams && typeof input.keyParams === 'object' ? { keyParams: input.keyParams } : {}),
    ...(typeof input.expectedMacro === 'string' ? { expectedMacro: input.expectedMacro } : {}),
    ...(typeof input.oddExcerpt === 'string' || input.oddExcerpt === null ? { oddExcerpt: input.oddExcerpt } : {}),
  }
}
