import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import {
  getSimulationById,
  listProjects,
  listRunRecordsForSim,
  listSimulationsForProject,
} from '../../server/abm/abmStore.fs.js'
import { readModelConfig } from '../../server/abm/modelConfigShape.js'
import { ABM_INSPECT_TOOL_NAME } from './constants.js'

const DESCRIPTION =
  'Inspect ABM state: read a simulation model config (agents, environment, parameters, observers) or list simulations and their runs.'

const PROMPT = `Read-only inspection of the ABM workbench state. Use it BEFORE editing a
model or configuring results, so you patch real parameter ids and metric ids
instead of guessing.

- With \`simId\`: returns the full model summary — environment ({type, config}),
  agent types with initialization counts, parameters (id, name, dtype, default,
  min/max/step, scope), observers (valid metric ids for result charts),
  mechanisms, the run interface (seed/steps/param overrides), and recent runs
  with their runIds and status.
- Without \`simId\`: lists projects and the simulations inside them (id, name,
  model version) so you can find the right simId.`

const inputSchema = lazySchema(() =>
  z.strictObject({
    simId: z.string().nullish().describe('Simulation to inspect; omit to list simulations'),
    projectId: z.string().nullish().describe('Restrict the listing to one project'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    found: z.boolean(),
    summary: z.string(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

async function summarizeSimulation(simId: string): Promise<Output> {
  const simulation = await getSimulationById(simId)
  if (!simulation) {
    return { found: false, summary: `Simulation not found: ${simId}` }
  }
  const shape = readModelConfig(simulation.config)
  const runs = await listRunRecordsForSim(simId).catch(() => [])
  const recentRuns = runs.slice(-5).map((run) => ({
    runId: run.id,
    status: run.status,
    seed: run.seed,
    steps: run.steps,
    parameters: run.parameters,
  }))

  const summary = {
    simId: simulation.id,
    projectId: simulation.projectId,
    name: simulation.name,
    modelId: shape.id,
    modelVersion: simulation.modelVersion || shape.version,
    description: shape.description,
    environment: shape.environment,
    agents: shape.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      count: shape.initialization.agentCounts[agent.id] ?? null,
      stateVariables: agent.stateVariables.map((v) => v.name),
    })),
    parameters: shape.parameters,
    observers: shape.observers.map((observer) => ({
      id: observer.id,
      name: observer.name,
      dtype: observer.dtype,
    })),
    mechanisms: shape.mechanisms.map((mechanism) => ({
      id: mechanism.id,
      name: mechanism.name,
      trigger: mechanism.trigger,
      effect: mechanism.effect,
    })),
    interface: simulation.interface,
    recentRuns,
  }
  return { found: true, summary: JSON.stringify(summary, null, 2) }
}

async function summarizeListing(projectId?: string | null): Promise<Output> {
  const projects = await listProjects()
  const scoped = projectId ? projects.filter((project) => project.id === projectId) : projects
  const listing = await Promise.all(
    scoped.map(async (project) => ({
      projectId: project.id,
      name: project.name,
      simulations: (await listSimulationsForProject(project.id)).map((simulation) => ({
        simId: simulation.id,
        name: simulation.name,
        modelId: readModelConfig(simulation.config).id,
        modelVersion: simulation.modelVersion,
      })),
    })),
  )
  return { found: listing.length > 0, summary: JSON.stringify({ projects: listing }, null, 2) }
}

export const InspectSimulationTool = buildTool({
  name: ABM_INSPECT_TOOL_NAME,
  searchHint: 'inspect read ABM simulation model config parameters observers runs',
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
    return 'Inspect Simulation'
  },
  isReadOnly() {
    return true
  },
  isConcurrencySafe() {
    return true
  },
  toAutoClassifierInput(input) {
    return input.simId ?? 'list simulations'
  },
  renderToolUseMessage() {
    return null
  },
  async call({ simId, projectId }) {
    try {
      const data = simId ? await summarizeSimulation(simId) : await summarizeListing(projectId)
      return { data }
    } catch (error) {
      return {
        data: {
          found: false,
          summary: `Inspect failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      }
    }
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const out = content as Output
    return { tool_use_id: toolUseID, type: 'tool_result', content: out.summary }
  },
} satisfies ToolDef<InputSchema, OutputSchema>)
