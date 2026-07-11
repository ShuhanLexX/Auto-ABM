/**
 * Minimal /api/abm/* REST surface (P0) — docs/ai/impl/architecture.md §3.
 *
 *   GET  /api/abm/projects                        list projects
 *   POST /api/abm/projects                        create project
 *   GET  /api/abm/templates                       list built-in ModelConfig names
 *   GET  /api/abm/projects/:pid/simulations       list project simulations
 *   POST /api/abm/projects/:pid/simulations       create simulation (fixed config)
 *   GET  /api/abm/simulations/:sid                get simulation (interface defaults)
 *   POST /api/abm/simulations/:sid/runs           start a run -> { runId }
 *   GET  /api/abm/runs/:rid                        get RunRecord
 *   POST /api/abm/runs/:rid/stop                   stop a running kernel process
 *
 * Dispatch + error conventions mirror src/server/api/sessions.ts.
 */

import { randomUUID } from 'node:crypto'
import { ApiError, errorResponse } from '../middleware/errorHandler.js'
import {
  createProject,
  createSimulation,
  deleteAllProjectsCascade,
  deleteSimulation,
  getExperimentById,
  getOdd,
  getRunRecord,
  getRunRecordById,
  getSimulationById,
  listSimulationsForProject,
  listProjects,
  putOdd,
  resolveRunLocation,
  updateSimulation,
} from './abmStore.fs.js'
import { abmRunService } from './abmRunService.js'
import { abmExperimentService } from './experimentService.js'
import { dumpBuiltinConfig, KernelUnavailableError } from './kernelProcess.js'
import { parseKinds, readTraceRecords } from './traceRead.js'
import { askMiniExplain, buildExplainContext } from './explainService.js'
import {
  buildAttribution,
  buildChangepoints,
  buildMechanismActivity,
} from './attributionService.js'
import {
  compareRuns,
  CounterfactualError,
  startCounterfactualRun,
} from './counterfactualService.js'
import { getMechanismGraphForSimulation } from './mechanismGraphService.js'
import { resolveViz, VizNotFoundError, VizValidationError } from './vizService.js'
import { buildPackage, ExportNotFoundError } from './exportService.js'
import { readModelConfig } from './modelConfigShape.js'
import { normalizeConfigAndInterface, normalizeModelConfigForKernel } from './modelConfigNormalize.js'
import { reconcileInterfaceParamsWithParameterDefaults } from './modelParameterDefaults.js'
import { deriveOdd, mergeOdd } from './oddService.js'
import { applyProposalIdentity, type ProposalIdentityInput } from './proposalIdentity.js'
import { traceFile } from './storagePaths.js'
import type { ExperimentConfig, Intervention, ModelConfig, VizSpec } from './types.js'

const BUILTIN_TEMPLATES = [
  'rumor',
  'sir',
  'schelling',
  'diffusion',
  'opinion',
  'public_goods',
  'social_influence',
  'wildfire',
] as const

const DEFAULT_TEMPLATE = 'rumor'
const DEFAULT_SEED = 42
const DEFAULT_STEPS = 50

function methodNotAllowed(method: string): Response {
  return Response.json(
    { error: 'METHOD_NOT_ALLOWED', message: `Method ${method} not allowed` },
    { status: 405 },
  )
}

async function readJsonBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    throw ApiError.badRequest('Invalid JSON body')
  }
}

function asKernelError(error: unknown): never {
  if (error instanceof KernelUnavailableError) {
    throw new ApiError(503, error.message, 'KERNEL_UNAVAILABLE')
  }
  throw error
}

export async function handleAbmApi(
  req: Request,
  url: URL,
  segments: string[],
): Promise<Response> {
  try {
    // segments: ['api', 'abm', sub, ...]
    const sub = segments[2]

    switch (sub) {
      case 'projects':
        return await handleProjects(req, segments)
      case 'templates':
        return req.method === 'GET'
          ? Response.json({ templates: BUILTIN_TEMPLATES })
          : methodNotAllowed(req.method)
      case 'simulations':
        return await handleSimulations(req, segments)
      case 'runs':
        return await handleRuns(req, url, segments)
      case 'explain':
        return await handleExplainApi(req, segments)
      case 'experiments':
        return await handleExperiments(req, segments)
      case 'viz':
        return await handleViz(req, segments)
      default:
        return Response.json(
          { error: 'NOT_FOUND', message: `Unknown ABM resource: ${sub ?? '(none)'}` },
          { status: 404 },
        )
    }
  } catch (error) {
    return errorResponse(error)
  }
}

async function handleExplainApi(req: Request, segments: string[]): Promise<Response> {
  if (segments[3] !== 'mini') {
    return Response.json(
      { error: 'NOT_FOUND', message: `Unknown explain route: ${segments[3] ?? '(none)'}` },
      { status: 404 },
    )
  }
  if (req.method !== 'POST') return methodNotAllowed(req.method)
  const body = await readJsonBody<{
    runId?: unknown
    from?: unknown
    to?: unknown
    tick?: unknown
    target?: unknown
    question?: unknown
    localSummary?: unknown
    locale?: unknown
  }>(req)
  const response = await askMiniExplain({
    ...(typeof body.runId === 'string' ? { runId: body.runId } : {}),
    ...(typeof body.from === 'number' ? { from: body.from } : {}),
    ...(typeof body.to === 'number' ? { to: body.to } : {}),
    ...(typeof body.tick === 'number' ? { tick: body.tick } : {}),
    ...(isObject(body.target) ? { target: body.target } : {}),
    ...(typeof body.question === 'string' ? { question: body.question } : {}),
    ...(typeof body.localSummary === 'string' ? { localSummary: body.localSummary } : {}),
    ...(typeof body.locale === 'string' ? { locale: body.locale } : { locale: localeFromRequest(req) }),
  })
  return Response.json(response)
}

async function handleProjects(req: Request, segments: string[]): Promise<Response> {
  const projectId = segments[3]
  const subResource = segments[4]

  // /api/abm/projects/:pid/simulations
  if (projectId && subResource === 'simulations') {
    if (req.method === 'GET') {
      return Response.json({ simulations: await listSimulationsForProject(projectId) })
    }
    if (req.method === 'POST') return await createSimulationRoute(req, projectId)
    return methodNotAllowed(req.method)
  }

  if (projectId) {
    return Response.json(
      { error: 'NOT_FOUND', message: `Unknown project route: ${subResource ?? '(item)'}` },
      { status: 404 },
    )
  }

  switch (req.method) {
    case 'GET':
      return Response.json({ projects: await listProjects() })
    case 'DELETE': {
      const deleted = await deleteAllProjectsCascade()
      return Response.json({ ok: true, deleted })
    }
    case 'POST': {
      const body = await readJsonBody<{
        name?: unknown
        researchQuestion?: unknown
        sourceSessionId?: unknown
        sourceWorkDir?: unknown
      }>(req)
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        throw ApiError.badRequest('name (string) is required')
      }
      if (body.researchQuestion !== undefined && typeof body.researchQuestion !== 'string') {
        throw ApiError.badRequest('researchQuestion must be a string')
      }
      if (body.sourceSessionId !== undefined && typeof body.sourceSessionId !== 'string') {
        throw ApiError.badRequest('sourceSessionId must be a string')
      }
      if (body.sourceWorkDir !== undefined && typeof body.sourceWorkDir !== 'string') {
        throw ApiError.badRequest('sourceWorkDir must be a string')
      }
      const project = await createProject({
        name: body.name.trim(),
        researchQuestion: body.researchQuestion,
        sourceSessionId: typeof body.sourceSessionId === 'string' ? body.sourceSessionId : undefined,
        sourceWorkDir: typeof body.sourceWorkDir === 'string' ? body.sourceWorkDir : undefined,
      })
      return Response.json(project, { status: 201 })
    }
    default:
      return methodNotAllowed(req.method)
  }
}

async function createSimulationRoute(req: Request, projectId: string): Promise<Response> {
  const body = await readJsonBody<{
    name?: unknown
    template?: unknown
    config?: unknown
    seed?: unknown
    steps?: unknown
    params?: unknown
    proposal?: unknown
  }>(req)

  if (body.name !== undefined && typeof body.name !== 'string') {
    throw ApiError.badRequest('name must be a string')
  }

  let config: ModelConfig
  let configInterfacePatch: { seed?: number; steps?: number; params?: Record<string, unknown> } = {}
  if (body.config !== undefined) {
    if (typeof body.config !== 'object' || body.config === null || Array.isArray(body.config)) {
      throw ApiError.badRequest('config must be an object')
    }
    const normalized = normalizeConfigAndInterface(body.config as ModelConfig)
    config = normalized.config
    configInterfacePatch = normalized.interfacePatch
  } else {
    const template = typeof body.template === 'string' ? body.template : DEFAULT_TEMPLATE
    if (!BUILTIN_TEMPLATES.includes(template as (typeof BUILTIN_TEMPLATES)[number])) {
      throw ApiError.badRequest(`Unknown template: ${template}`)
    }
    try {
      config = await dumpBuiltinConfig(template)
      const proposal = readProposalIdentity(body.proposal)
      if (proposal) config = applyProposalIdentity(config, proposal, template)
    } catch (error) {
      asKernelError(error)
    }
  }
  const configShape = readModelConfig(config)
  const modelVersion = normalizeVersion(configShape.version)
  config = { ...config, version: modelVersion }

  const seed = numberOr(body.seed, numberOr(configInterfacePatch.seed, DEFAULT_SEED))
  const steps = numberOr(body.steps, numberOr(configInterfacePatch.steps, DEFAULT_STEPS))
  const params = isObject(body.params)
    ? (body.params as Record<string, unknown>)
    : configInterfacePatch.params ?? {}
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Simulation'

  const simulation = await createSimulation(projectId, {
    name,
    modelVersion,
    createdFrom: isObject(body.proposal) ? 'proposal' : 'manual',
    config,
    interface: { seed, steps, params },
  })
  await putOdd(projectId, simulation.id, deriveOdd(config, localeFromRequest(req)))
  return Response.json(simulation, { status: 201 })
}

function normalizeVersion(version: unknown): string {
  return typeof version === 'string' && version.trim() ? version.trim() : '1'
}

function readProposalIdentity(value: unknown): ProposalIdentityInput | null {
  if (!isObject(value) || typeof value.id !== 'string' || !value.id.trim()) return null
  return {
    id: value.id.trim(),
    ...(typeof value.mechanismSummary === 'string' ? { mechanismSummary: value.mechanismSummary } : {}),
    ...(typeof value.expectedMacro === 'string' ? { expectedMacro: value.expectedMacro } : {}),
    ...(typeof value.oddExcerpt === 'string' || value.oddExcerpt === null ? { oddExcerpt: value.oddExcerpt } : {}),
    ...(isObject(value.keyParams) ? { keyParams: value.keyParams } : {}),
  }
}

async function handleSimulations(req: Request, segments: string[]): Promise<Response> {
  const simId = segments[3]
  const subResource = segments[4]
  if (!simId) {
    return Response.json({ error: 'NOT_FOUND', message: 'Missing simulation id' }, { status: 404 })
  }

  // /api/abm/simulations/:sid/runs
  if (subResource === 'runs') {
    if (req.method !== 'POST') return methodNotAllowed(req.method)
    return await startRunRoute(req, simId)
  }

  // /api/abm/simulations/:sid/experiments
  if (subResource === 'experiments') {
    if (req.method !== 'POST') return methodNotAllowed(req.method)
    return await startExperimentRoute(req, simId)
  }

  // /api/abm/simulations/:sid/export
  if (subResource === 'export') {
    if (req.method !== 'POST') return methodNotAllowed(req.method)
    return await exportSimulationRoute(req, simId)
  }

  // /api/abm/simulations/:sid/mechanism-graph — kernel-derived deterministic DAG
  if (subResource === 'mechanism-graph') {
    if (req.method !== 'GET') return methodNotAllowed(req.method)
    try {
      const graph = await getMechanismGraphForSimulation(simId)
      if (!graph) throw ApiError.notFound(`Simulation not found: ${simId}`)
      return Response.json({ graph })
    } catch (error) {
      if (error instanceof ApiError) throw error
      asKernelError(error)
    }
  }

  // /api/abm/simulations/:sid/odd — the ODD protocol document for the workbench panel
  if (subResource === 'odd') {
    if (req.method !== 'GET') return methodNotAllowed(req.method)
    const simulation = await getSimulationById(simId)
    if (!simulation) throw ApiError.notFound(`Simulation not found: ${simId}`)
    const derived = deriveOdd(simulation.config as ModelConfig, localeFromRequest(req))
    const prevOdd = await getOdd(simulation.projectId, simId)
    const { odd } = mergeOdd(prevOdd, derived)
    await putOdd(simulation.projectId, simId, odd)
    return Response.json({ odd })
  }

  // /api/abm/simulations/:sid
  switch (req.method) {
    case 'GET': {
      const simulation = await getSimulationById(simId)
      if (!simulation) throw ApiError.notFound(`Simulation not found: ${simId}`)
      return Response.json(simulation)
    }
    case 'PATCH':
      return await updateSimulationRoute(req, simId)
    case 'DELETE':
      return await deleteSimulationRoute(simId)
    default:
      return methodNotAllowed(req.method)
  }
}

async function updateSimulationRoute(req: Request, simId: string): Promise<Response> {
  const current = await getSimulationById(simId)
  if (!current) throw ApiError.notFound(`Simulation not found: ${simId}`)

  const body = await readJsonBody<{
    name?: unknown
    modelVersion?: unknown
    config?: unknown
    seed?: unknown
    steps?: unknown
    params?: unknown
  }>(req)
  if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim())) {
    throw ApiError.badRequest('name must be a non-empty string')
  }
  if (body.modelVersion !== undefined && typeof body.modelVersion !== 'string') {
    throw ApiError.badRequest('modelVersion must be a string')
  }
  if (body.config !== undefined && !isObject(body.config)) {
    throw ApiError.badRequest('config must be an object')
  }
  if (body.params !== undefined && !isObject(body.params)) {
    throw ApiError.badRequest('params must be an object')
  }

  const normalizedConfig = isObject(body.config)
    ? normalizeConfigAndInterface(body.config as ModelConfig, current.config)
    : null
  const configInterfacePatch = normalizedConfig?.interfacePatch ?? {}
  const reconciledParams = normalizedConfig
    ? reconcileInterfaceParamsWithParameterDefaults(
        current.config,
        normalizedConfig.config,
        current.interface.params,
      )
    : current.interface.params
  const interfacePatch =
    body.seed !== undefined ||
    body.steps !== undefined ||
    body.params !== undefined ||
    normalizedConfig?.interfacePatch.seed !== undefined ||
    normalizedConfig?.interfacePatch.steps !== undefined ||
    normalizedConfig?.interfacePatch.params !== undefined ||
    normalizedConfig !== null
      ? {
          interface: {
            seed: numberOr(body.seed, numberOr(configInterfacePatch.seed, current.interface.seed)),
            steps: positiveIntOr(body.steps, positiveIntOr(configInterfacePatch.steps, current.interface.steps)),
            params: isObject(body.params)
              ? body.params
              : configInterfacePatch.params ?? reconciledParams,
          },
        }
      : {}

  const updated = await updateSimulation(current.projectId, simId, {
    ...(typeof body.name === 'string' ? { name: body.name.trim() } : {}),
    ...(typeof body.modelVersion === 'string' ? { modelVersion: body.modelVersion.trim() } : {}),
    ...(normalizedConfig ? { config: normalizedConfig.config } : {}),
    ...interfacePatch,
  })
  if (!updated) throw ApiError.notFound(`Simulation not found: ${simId}`)
  const prevOdd = await getOdd(current.projectId, simId)
  const { odd } = mergeOdd(prevOdd, deriveOdd(updated.config as ModelConfig, localeFromRequest(req)))
  await putOdd(current.projectId, simId, odd)
  return Response.json(updated)
}

function localeFromRequest(req: Request): string | undefined {
  const explicit = new URL(req.url).searchParams.get('locale')
  return explicit || req.headers.get('accept-language') || undefined
}

async function deleteSimulationRoute(simId: string): Promise<Response> {
  const current = await getSimulationById(simId)
  if (!current) throw ApiError.notFound(`Simulation not found: ${simId}`)
  await deleteSimulation(current.projectId, simId)
  return Response.json({ ok: true })
}

interface StartExperimentRequest {
  name?: unknown
  parameter?: unknown
  values?: unknown
  replications?: unknown
  steps?: unknown
  baseSeed?: unknown
  collectMetrics?: unknown
  fixedParameters?: unknown
  traceLevel?: unknown
}

const DEFAULT_REPLICATIONS = 1

/**
 * Build a single-sweep ExperimentConfig from a friendly request body. The
 * heavy validation (parameter exists, axis count) is the kernel's job via
 * Pydantic; here we just shape a well-formed config or a `fixed` design when no
 * sweep parameter is given.
 */
function buildExperimentConfig(
  body: StartExperimentRequest,
  experimentId: string,
  simulation: { config: ModelConfig; modelVersion: string; interface: { seed: number; steps: number } },
): ExperimentConfig {
  const shape = readModelConfig(simulation.config)
  const collectMetrics =
    Array.isArray(body.collectMetrics) && body.collectMetrics.every((m) => typeof m === 'string')
      ? (body.collectMetrics as string[])
      : shape.observers.map((o) => o.id)
  if (collectMetrics.length === 0) {
    throw ApiError.badRequest('collectMetrics is empty and the model has no observers to default to')
  }

  const hasSweep = typeof body.parameter === 'string' && body.parameter.trim().length > 0
  if (hasSweep && (!Array.isArray(body.values) || body.values.length === 0)) {
    throw ApiError.badRequest('values must be a non-empty array when a sweep parameter is given')
  }

  const fixedParameters =
    isObject(body.fixedParameters) ? (body.fixedParameters as Record<string, unknown>) : {}
  const traceLevel =
    body.traceLevel === 'off' || body.traceLevel === 'key' || body.traceLevel === 'full'
      ? body.traceLevel
      : 'key'

  return {
    id: experimentId,
    name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Experiment',
    model_id: shape.id,
    model_version: simulation.modelVersion || shape.version || '1',
    design: hasSweep
      ? {
          type: 'single_sweep',
          sweep: [{ parameter_id: (body.parameter as string).trim(), values: body.values as unknown[] }],
          fixed_parameters: fixedParameters,
        }
      : { type: 'fixed', sweep: [], fixed_parameters: fixedParameters },
    replications: positiveIntOr(body.replications, DEFAULT_REPLICATIONS),
    base_seed: numberOr(body.baseSeed, simulation.interface.seed),
    steps: positiveIntOr(body.steps, simulation.interface.steps),
    collect_metrics: collectMetrics,
    trace_level: traceLevel,
  }
}

async function startExperimentRoute(req: Request, simId: string): Promise<Response> {
  const body = await readJsonBody<StartExperimentRequest>(req).catch(
    () => ({}) as StartExperimentRequest,
  )

  const simulation = await getSimulationById(simId)
  if (!simulation) throw ApiError.notFound(`Simulation not found: ${simId}`)

  const experimentId = randomUUID()
  const experiment = buildExperimentConfig(body, experimentId, simulation)
  const config = normalizeModelConfigForKernel(simulation.config, simulation.config)

  try {
    const result = await abmExperimentService.startExperiment({
      projectId: simulation.projectId,
      simId,
      experimentId,
      name: experiment.name,
      config,
      experiment,
    })
    return Response.json(result, { status: 202 })
  } catch (error) {
    asKernelError(error)
  }
}

/** GET /api/abm/experiments/:eid — the experiment record plus its run records. */
async function handleExperiments(req: Request, segments: string[]): Promise<Response> {
  const experimentId = segments[3]
  if (!experimentId) {
    return Response.json(
      { error: 'NOT_FOUND', message: 'Missing experiment id' },
      { status: 404 },
    )
  }
  if (segments[4] === 'stop') {
    if (req.method !== 'POST') return methodNotAllowed(req.method)
    const experiment = await getExperimentById(experimentId)
    if (!experiment) throw ApiError.notFound(`Experiment not found: ${experimentId}`)
    const stopped = await abmExperimentService.stopExperiment(experimentId)
    return Response.json({ ok: stopped })
  }
  if (req.method !== 'GET') return methodNotAllowed(req.method)

  const experiment = await getExperimentById(experimentId)
  if (!experiment) throw ApiError.notFound(`Experiment not found: ${experimentId}`)

  const runs = await Promise.all(
    experiment.runIds.map((runId) =>
      getRunRecord(experiment.projectId, experiment.simId, runId),
    ),
  )
  return Response.json({ experiment, runs: runs.filter((r) => r !== null) })
}

/**
 * POST /api/abm/simulations/:sid/export — assemble a self-contained reproduction
 * package (model + ODD + experiments + runs + manifest). The desktop gates this
 * behind a research-mode confirmation (conversation-ux.md §3 approval boundary).
 */
async function exportSimulationRoute(req: Request, simId: string): Promise<Response> {
  const body = await readJsonBody<{ includeTraces?: unknown }>(req).catch(
    () => ({}) as { includeTraces?: unknown },
  )
  try {
    const result = await buildPackage(simId, {
      includeTraces: body.includeTraces === true,
    })
    return Response.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof ExportNotFoundError) throw ApiError.notFound(error.message)
    asKernelError(error)
  }
}

/**
 * POST /api/abm/viz/resolve — resolve a VizSpec to its real data. The AI emits
 * only the spec; the server resolves the data and rejects specs that bind to
 * non-existent columns (truthfulness, P2).
 */
async function handleViz(req: Request, segments: string[]): Promise<Response> {
  if (segments[3] !== 'resolve') {
    return Response.json(
      { error: 'NOT_FOUND', message: `Unknown viz route: ${segments[3] ?? '(none)'}` },
      { status: 404 },
    )
  }
  if (req.method !== 'POST') return methodNotAllowed(req.method)

  const spec = await readJsonBody<VizSpec>(req)
  if (!spec || typeof spec !== 'object' || !spec.chart || !spec.data_ref) {
    throw ApiError.badRequest('VizSpec must include a chart and a data_ref')
  }
  if (!Array.isArray(spec.encodings) || spec.encodings.length === 0) {
    throw ApiError.badRequest('VizSpec.encodings must be a non-empty array')
  }

  try {
    const resolution = await resolveViz(spec)
    return Response.json(resolution)
  } catch (error) {
    if (error instanceof VizValidationError) {
      throw new ApiError(422, error.message, 'VIZ_FIELDS_MISSING')
    }
    if (error instanceof VizNotFoundError) {
      throw ApiError.notFound(error.message)
    }
    throw error
  }
}

interface StartRunRequest {
  seed?: unknown
  steps?: unknown
  params?: unknown
  spaceSampleRate?: unknown
  spaceAgentCap?: unknown
  interventions?: unknown
}

/** Parse client-supplied interventions defensively (kernel re-validates too). */
function parseInterventions(raw: unknown): Intervention[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const parsed: Intervention[] = []
  for (const item of raw) {
    if (!isObject(item)) continue
    const atTick = (item as Record<string, unknown>).at_tick
    const params = (item as Record<string, unknown>).params
    if (typeof atTick !== 'number' || !Number.isFinite(atTick)) continue
    if (!isObject(params) || Object.keys(params as object).length === 0) continue
    const note = (item as Record<string, unknown>).note
    parsed.push({
      at_tick: Math.trunc(atTick),
      params: params as Record<string, unknown>,
      ...(typeof note === 'string' && note ? { note } : {}),
    })
  }
  return parsed.length > 0 ? parsed : undefined
}

async function startRunRoute(req: Request, simId: string): Promise<Response> {
  const body = await readJsonBody<StartRunRequest>(req).catch(() => ({}) as StartRunRequest)

  const simulation = await getSimulationById(simId)
  if (!simulation) throw ApiError.notFound(`Simulation not found: ${simId}`)

  const runId = randomUUID()
  const seed = numberOr(body.seed, simulation.interface.seed)
  const steps = numberOr(body.steps, simulation.interface.steps)
  const params = isObject(body.params)
    ? (body.params as Record<string, unknown>)
    : simulation.interface.params
  // Default to one snapshot per tick (P1) so the canvas streams out of the box;
  // the Interface can raise the sample rate / set an agent cap for big models.
  const spaceSampleRate = numberOr(body.spaceSampleRate, 1)
  const spaceAgentCap =
    typeof body.spaceAgentCap === 'number' && Number.isFinite(body.spaceAgentCap)
      ? body.spaceAgentCap
      : undefined
  const interventions = parseInterventions(body.interventions)

  try {
    const result = await abmRunService.startRun({
      projectId: simulation.projectId,
      simId,
      runId,
      config: normalizeModelConfigForKernel(simulation.config, simulation.config),
      seed,
      steps,
      params,
      spaceSampleRate,
      ...(spaceAgentCap !== undefined ? { spaceAgentCap } : {}),
      ...(interventions ? { interventions } : {}),
    })
    return Response.json(result, { status: 202 })
  } catch (error) {
    asKernelError(error)
  }
}

async function handleRuns(req: Request, url: URL, segments: string[]): Promise<Response> {
  const runId = segments[3]
  if (!runId) {
    return Response.json({ error: 'NOT_FOUND', message: 'Missing run id' }, { status: 404 })
  }

  // /api/abm/runs/:rid/trace
  if (segments[4] === 'trace') {
    if (req.method !== 'GET') return methodNotAllowed(req.method)
    return await getTraceRoute(url, runId)
  }

  // /api/abm/runs/:rid/explain — grounding context for evidence-based explanation
  if (segments[4] === 'explain') {
    if (req.method !== 'GET') return methodNotAllowed(req.method)
    return await getExplainRoute(req, url, runId)
  }

  // /api/abm/runs/:rid/mechanism-activity — per-mechanism firing aggregation
  if (segments[4] === 'mechanism-activity') {
    if (req.method !== 'GET') return methodNotAllowed(req.method)
    const params = url.searchParams
    const from = params.has('from') ? numberOr(Number(params.get('from')), 0) : 0
    const to = params.has('to')
      ? numberOr(Number(params.get('to')), 0)
      : Number.POSITIVE_INFINITY
    const activity = await buildMechanismActivity(runId, from, to)
    if (!activity) throw ApiError.notFound(`Run not found: ${runId}`)
    return Response.json(activity)
  }

  // /api/abm/runs/:rid/attribution — decompose a metric's change per mechanism
  if (segments[4] === 'attribution') {
    if (req.method !== 'GET') return methodNotAllowed(req.method)
    const params = url.searchParams
    const metric = params.get('metric')
    if (!metric) throw ApiError.badRequest('metric query param is required')
    const from = params.has('from') ? numberOr(Number(params.get('from')), 0) : 0
    const to = params.has('to')
      ? numberOr(Number(params.get('to')), 0)
      : Number.POSITIVE_INFINITY
    if (to < from) throw ApiError.badRequest('to must be >= from')
    const attribution = await buildAttribution(runId, metric, from, to)
    if (!attribution) throw ApiError.notFound(`Run not found: ${runId}`)
    return Response.json(attribution)
  }

  // /api/abm/runs/:rid/changepoints — salient slope changes worth explaining
  if (segments[4] === 'changepoints') {
    if (req.method !== 'GET') return methodNotAllowed(req.method)
    const metric = url.searchParams.get('metric') ?? undefined
    const result = await buildChangepoints(runId, metric)
    if (!result) throw ApiError.notFound(`Run not found: ${runId}`)
    return Response.json(result)
  }

  // /api/abm/runs/:rid/counterfactual — same seed/model, changed params
  if (segments[4] === 'counterfactual') {
    if (req.method !== 'POST') return methodNotAllowed(req.method)
    const body = await readJsonBody<{ params?: unknown; seed?: unknown; steps?: unknown }>(req)
    if (!isObject(body.params)) throw ApiError.badRequest('params (object) is required')
    try {
      const started = await startCounterfactualRun({
        baseRunId: runId,
        params: body.params,
        ...(typeof body.seed === 'number' ? { seed: body.seed } : {}),
        ...(typeof body.steps === 'number' ? { steps: body.steps } : {}),
      })
      return Response.json(started, { status: 202 })
    } catch (error) {
      if (error instanceof CounterfactualError) {
        if (error.code === 'NOT_FOUND') throw ApiError.notFound(error.message)
        if (error.code === 'VERSION_MISMATCH') throw new ApiError(409, error.message, 'VERSION_MISMATCH')
        throw ApiError.badRequest(error.message)
      }
      asKernelError(error)
    }
  }

  // /api/abm/runs/:rid/compare/:otherRunId — dual-trajectory divergence report
  if (segments[4] === 'compare') {
    if (req.method !== 'GET') return methodNotAllowed(req.method)
    const otherRunId = segments[5]
    if (!otherRunId) throw ApiError.badRequest('Missing comparison run id')
    const comparison = await compareRuns(runId, otherRunId)
    if (!comparison) throw ApiError.notFound('One of the runs was not found or has no trace')
    return Response.json(comparison)
  }

  // /api/abm/runs/:rid/stop
  if (segments[4] === 'stop') {
    if (req.method !== 'POST') return methodNotAllowed(req.method)
    const location = await resolveRunLocation(runId)
    if (!location) throw ApiError.notFound(`Run not found: ${runId}`)
    const stopped = await abmRunService.stopRun(location.projectId, location.simId, runId)
    return Response.json({ ok: stopped })
  }

  if (req.method !== 'GET') return methodNotAllowed(req.method)

  const record = await getRunRecordById(runId)
  if (!record) throw ApiError.notFound(`Run not found: ${runId}`)
  return Response.json(record)
}

async function getExplainRoute(req: Request, url: URL, runId: string): Promise<Response> {
  const params = url.searchParams
  const from = params.has('from') ? numberOr(Number(params.get('from')), 0) : 0
  const to = params.has('to') ? numberOr(Number(params.get('to')), 0) : Number.MAX_SAFE_INTEGER
  if (to < from) throw ApiError.badRequest('to must be >= from')

  const context = await buildExplainContext(runId, from, to, localeFromRequest(req))
  if (!context) throw ApiError.notFound(`Run not found: ${runId}`)
  return Response.json(context)
}

async function getTraceRoute(url: URL, runId: string): Promise<Response> {
  const location = await resolveRunLocation(runId)
  if (!location) throw ApiError.notFound(`Run not found: ${runId}`)

  const params = url.searchParams
  const at = params.has('at') ? numberOr(Number(params.get('at')), 0) : undefined
  const from = params.has('from') ? numberOr(Number(params.get('from')), 0) : undefined
  const to = params.has('to') ? numberOr(Number(params.get('to')), 0) : undefined
  const kinds = parseKinds(params.get('kinds'))

  const result = await readTraceRecords(traceFile(location.projectId, location.simId, runId), {
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
    ...(at !== undefined ? { at } : {}),
    ...(kinds ? { kinds } : {}),
  })

  return Response.json({ runId, records: result.records, truncated: result.truncated })
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function positiveIntOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
