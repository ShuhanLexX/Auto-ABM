/**
 * MechanismGraph bridge — asks the kernel to derive the deterministic graph
 * for a simulation's ModelConfig (worker `mechanism_graph` command).
 *
 * The graph topology is a kernel contract (abm_kernel/schemas/mechanism_graph.py,
 * data-contracts §16): every edge corresponds to a real reference in the config,
 * never an invented causal link. The server only mirrors the shape and caches
 * per (simId, modelVersion) so repeated panel opens don't respawn Python.
 */

import { getSimulationById } from './abmStore.fs.js'
import { KernelUnavailableError, resolveKernelCommand } from './kernelProcess.js'
import { normalizeModelConfigForKernel } from './modelConfigNormalize.js'
import type { ModelConfig } from './types.js'

// Mirror of abm_kernel/schemas/mechanism_graph.py — do not fork.
export type GraphNodeKind =
  | 'agent_type'
  | 'state_variable'
  | 'mechanism'
  | 'parameter'
  | 'observer'
export type GraphEdgeKind = 'structural' | 'reference'
export type GraphEdgeRelation = 'has_state' | 'runs' | 'controls' | 'writes' | 'observed'

export interface MechanismGraphNode {
  id: string
  kind: GraphNodeKind
  label: string
  ref_id: string
  description: string
}

export interface MechanismGraphEdge {
  source: string
  target: string
  kind: GraphEdgeKind
  relation: GraphEdgeRelation
}

export interface MechanismGraph {
  schema_version: string
  model_id: string
  model_version: string
  nodes: MechanismGraphNode[]
  edges: MechanismGraphEdge[]
  generated_at: string
}

const cache = new Map<string, MechanismGraph>()
const MAX_CACHE_ENTRIES = 32

function cacheKey(simId: string, modelVersion: string): string {
  return `${simId}@${modelVersion}`
}

/** Test hook — the cache would otherwise leak state between test cases. */
export function clearMechanismGraphCache(): void {
  cache.clear()
}

/**
 * Ask the kernel worker to derive the MechanismGraph for a raw config.
 * Follows the dumpBuiltinConfig one-shot spawn pattern (kernelProcess.ts).
 */
export async function deriveMechanismGraph(config: ModelConfig): Promise<MechanismGraph> {
  const target = await resolveKernelCommand()
  const proc = Bun.spawn([target.command, ...target.args], {
    cwd: target.cwd,
    env: target.env,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  proc.stdin.write(JSON.stringify({ cmd: 'mechanism_graph', config }) + '\n')
  proc.stdin.write(JSON.stringify({ cmd: 'shutdown' }) + '\n')
  proc.stdin.flush()
  proc.stdin.end()

  const stderrPromise = new Response(proc.stderr).text()
  const stdout = await new Response(proc.stdout).text()
  await proc.exited

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const frame = JSON.parse(trimmed) as
      | { frame: 'mechanism_graph'; graph: MechanismGraph }
      | { frame: 'error'; type: string; message: string }
    if (frame.frame === 'mechanism_graph') return frame.graph
    if (frame.frame === 'error') {
      throw new KernelUnavailableError(`Kernel rejected mechanism_graph: ${frame.message}`)
    }
  }
  const stderr = (await stderrPromise).trim()
  throw new KernelUnavailableError(stderr || 'Kernel produced no mechanism graph')
}

/**
 * Resolve the mechanism graph for a simulation, cached per model version.
 * Returns null when the simulation is unknown.
 */
export async function getMechanismGraphForSimulation(
  simId: string,
): Promise<MechanismGraph | null> {
  const simulation = await getSimulationById(simId)
  if (!simulation) return null

  const key = cacheKey(simId, simulation.modelVersion)
  const cached = cache.get(key)
  if (cached) return cached

  const graph = await deriveMechanismGraph(
    normalizeModelConfigForKernel(simulation.config as ModelConfig),
  )
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, graph)
  return graph
}
