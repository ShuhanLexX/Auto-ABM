/**
 * ABM filesystem persistence — projects, simulations, run records.
 *
 * Reuses base-platform persistence primitives per architecture.md §5:
 *   - writes: atomic temp+rename (same pattern as persistentStorageMigrations.ts::writeJsonFile)
 *   - reads:  recoverableJsonFile.readRecoverableJsonFile (quarantine + default)
 * Every persisted object carries `schemaVersion: ABM_STORAGE_VERSION` so the
 * persistence-upgrade gate can recognise and migrate the cc-haha/abm subtree.
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { readRecoverableJsonFile } from '../services/recoverableJsonFile.js'
import {
  ABM_STORAGE_VERSION,
  type AbmExperiment,
  type AbmProject,
  type AbmSimulation,
  type RunRecord,
} from './types.js'
import type { Odd } from './oddService.js'
import { ensureSnakeModelId } from './modelConfigNormalize.js'
import {
  experimentFile,
  experimentsIndexFile,
  oddFile,
  projectFile,
  projectDir,
  projectsIndexFile,
  runFile,
  runsIndexFile,
  simsIndexFile,
  simulationFile,
} from './storagePaths.js'

interface ProjectsIndex {
  schemaVersion: number
  projects: AbmProject[]
}

interface RunLocation {
  projectId: string
  simId: string
}

interface RunsIndex {
  schemaVersion: number
  runs: Record<string, RunLocation>
}

interface SimsIndex {
  schemaVersion: number
  sims: Record<string, { projectId: string }>
}

interface ExperimentLocation {
  projectId: string
  simId: string
}

interface ExperimentsIndex {
  schemaVersion: number
  experiments: Record<string, ExperimentLocation>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Serialize read-modify-write sequences that target a shared JSON file (the
 * index files). Without this, two concurrent callers — e.g. a React StrictMode
 * double-mount firing two createProject requests — both read the index, both
 * append, and both atomic-rename onto the same path. That loses one update on
 * every OS and, on Windows, fails the second rename with EPERM. The lock is
 * keyed by absolute file path; each critical section runs to completion before
 * the next begins. Per-object files (project.json, <rid>.json) use unique paths
 * and never collide, so only the index mutations need it.
 */
const fileLocks = new Map<string, Promise<unknown>>()

async function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const prev = fileLocks.get(filePath) ?? Promise.resolve()
  const result = prev.then(fn, fn)
  const tail = result.then(
    () => undefined,
    () => undefined,
  )
  fileLocks.set(filePath, tail)
  try {
    return await result
  } finally {
    if (fileLocks.get(filePath) === tail) fileLocks.delete(filePath)
  }
}

/**
 * Rename with a short retry on transient Windows failures. Even with index
 * locking, the atomic rename can briefly fail with EPERM/EACCES/EBUSY when an
 * external process (antivirus, search indexer) holds the freshly written temp
 * file or the destination. A few backed-off retries clear these without masking
 * a genuine, persistent error.
 */
async function renameWithRetry(from: string, to: string, attempts = 5): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(from, to)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      const transient = code === 'EPERM' || code === 'EACCES' || code === 'EBUSY'
      if (!transient || attempt >= attempts - 1) throw error
      await new Promise((resolve) => setTimeout(resolve, 15 * (attempt + 1)))
    }
  }
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.tmp.${Date.now()}-${randomBytes(3).toString('hex')}`
  try {
    await fs.writeFile(tmpPath, JSON.stringify(value, null, 2) + '\n', 'utf-8')
    await renameWithRetry(tmpPath, filePath)
  } catch (error) {
    await fs.unlink(tmpPath).catch(() => {})
    throw error
  }
}

// ---- projects -------------------------------------------------------------

async function readProjectsIndex(): Promise<ProjectsIndex> {
  return readRecoverableJsonFile<ProjectsIndex>({
    filePath: projectsIndexFile(),
    label: 'ABM projects index',
    defaultValue: { schemaVersion: ABM_STORAGE_VERSION, projects: [] },
    normalize: (value) =>
      isRecord(value) && Array.isArray(value.projects)
        ? { schemaVersion: ABM_STORAGE_VERSION, projects: value.projects as AbmProject[] }
        : null,
  })
}

export async function listProjects(): Promise<AbmProject[]> {
  return (await readProjectsIndex()).projects
}

export async function getProject(projectId: string): Promise<AbmProject | null> {
  return readRecoverableJsonFile<AbmProject | null>({
    filePath: projectFile(projectId),
    label: 'ABM project',
    defaultValue: null,
    normalize: (value) => (isRecord(value) && typeof value.id === 'string' ? (value as AbmProject) : null),
  })
}

export async function createProject(input: {
  name: string
  researchQuestion?: string
  sourceSessionId?: string
  sourceWorkDir?: string
}): Promise<AbmProject> {
  const project: AbmProject = {
    id: randomUUID(),
    name: input.name,
    ...(input.researchQuestion ? { researchQuestion: input.researchQuestion } : {}),
    ...(input.sourceSessionId ? { sourceSessionId: input.sourceSessionId } : {}),
    ...(input.sourceWorkDir ? { sourceWorkDir: input.sourceWorkDir } : {}),
    createdAt: new Date().toISOString(),
    schemaVersion: ABM_STORAGE_VERSION,
  }
  await writeJsonAtomic(projectFile(project.id), project)
  await withFileLock(projectsIndexFile(), async () => {
    const index = await readProjectsIndex()
    index.projects.push(project)
    await writeJsonAtomic(projectsIndexFile(), index)
  })
  return project
}

export async function deleteProjectCascade(projectId: string): Promise<boolean> {
  const project = await getProject(projectId)
  if (!project) return false

  await fs.rm(projectDir(projectId), { recursive: true, force: true })
  await withFileLock(projectsIndexFile(), async () => {
    const index = await readProjectsIndex()
    index.projects = index.projects.filter((item) => item.id !== projectId)
    await writeJsonAtomic(projectsIndexFile(), index)
  })
  await withFileLock(simsIndexFile(), async () => {
    const index = await readSimsIndex()
    for (const [simId, location] of Object.entries(index.sims)) {
      if (location.projectId === projectId) delete index.sims[simId]
    }
    await writeJsonAtomic(simsIndexFile(), index)
  })
  await withFileLock(runsIndexFile(), async () => {
    const index = await readRunsIndex()
    for (const [runId, location] of Object.entries(index.runs)) {
      if (location.projectId === projectId) delete index.runs[runId]
    }
    await writeJsonAtomic(runsIndexFile(), index)
  })
  await withFileLock(experimentsIndexFile(), async () => {
    const index = await readExperimentsIndex()
    for (const [experimentId, location] of Object.entries(index.experiments)) {
      if (location.projectId === projectId) delete index.experiments[experimentId]
    }
    await writeJsonAtomic(experimentsIndexFile(), index)
  })
  return true
}

export async function deleteProjectsForSession(params: {
  sessionId: string
  workDir?: string | null
  deleteUnownedWorkDirProjects?: boolean
}): Promise<string[]> {
  const normalizedWorkDir = normalizeWorkDir(params.workDir)
  const projects = await listProjects()
  const matches = projects.filter((project) => {
    if (project.sourceSessionId === params.sessionId) return true
    if (!params.deleteUnownedWorkDirProjects || project.sourceSessionId) return false
    if (!normalizedWorkDir) return false
    return normalizeWorkDir(project.sourceWorkDir) === normalizedWorkDir ||
      normalizeWorkDir(project.researchQuestion?.replace(/^研究问题：/, '').replace(/^Research question:\s*/i, '')) ===
        normalizeWorkDir(path.basename(normalizedWorkDir)) ||
      normalizeWorkDir(project.name) === normalizeWorkDir(path.basename(normalizedWorkDir))
  })

  const removed: string[] = []
  for (const project of matches) {
    if (await deleteProjectCascade(project.id)) removed.push(project.id)
  }
  return removed
}

export async function deleteAllProjectsCascade(): Promise<string[]> {
  const projects = await listProjects()
  const removed: string[] = []
  for (const project of projects) {
    if (await deleteProjectCascade(project.id)) removed.push(project.id)
  }
  return removed
}

function normalizeWorkDir(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/[\\/]+$/, '').toLowerCase()
}

// ---- simulations ----------------------------------------------------------

export async function getSimulation(projectId: string, simId: string): Promise<AbmSimulation | null> {
  return readRecoverableJsonFile<AbmSimulation | null>({
    filePath: simulationFile(projectId, simId),
    label: 'ABM simulation',
    defaultValue: null,
    // Self-heal simulations persisted before the snake_case id guard so every
    // consumer (run, experiment, ODD, viz) sees a kernel-valid model id.
    normalize: (value) => {
      if (!isRecord(value) || typeof value.id !== 'string') return null
      const simulation = value as AbmSimulation
      if (isRecord(simulation.config)) {
        simulation.config = ensureSnakeModelId(simulation.config as Record<string, unknown>) as typeof simulation.config
      }
      return simulation
    },
  })
}

async function readSimsIndex(): Promise<SimsIndex> {
  return readRecoverableJsonFile<SimsIndex>({
    filePath: simsIndexFile(),
    label: 'ABM simulations index',
    defaultValue: { schemaVersion: ABM_STORAGE_VERSION, sims: {} },
    normalize: (value) =>
      isRecord(value) && isRecord(value.sims)
        ? { schemaVersion: ABM_STORAGE_VERSION, sims: value.sims as Record<string, { projectId: string }> }
        : null,
  })
}

export async function createSimulation(
  projectId: string,
  input: {
    name: string
    modelVersion: string
    lineageId?: string
    parentSimId?: string | null
    createdFrom?: AbmSimulation['createdFrom']
    config: Record<string, unknown>
    interface: { seed: number; steps: number; params: Record<string, unknown> }
  },
): Promise<AbmSimulation> {
  const id = randomUUID()
  const simulation: AbmSimulation = {
    id,
    projectId,
    name: input.name,
    modelVersion: input.modelVersion,
    lineageId: input.lineageId ?? id,
    parentSimId: input.parentSimId ?? null,
    createdFrom: input.createdFrom ?? 'manual',
    // Storage boundary: never persist a kernel-invalid (e.g. kebab-case) model
    // id — the adopt tool writes here directly, bypassing the API normalizer.
    config: ensureSnakeModelId(input.config),
    interface: input.interface,
    createdAt: new Date().toISOString(),
    schemaVersion: ABM_STORAGE_VERSION,
  }
  await writeJsonAtomic(simulationFile(projectId, simulation.id), simulation)
  await withFileLock(simsIndexFile(), async () => {
    const index = await readSimsIndex()
    index.sims[simulation.id] = { projectId }
    await writeJsonAtomic(simsIndexFile(), index)
  })
  return simulation
}

/** Resolve a simulation by simId alone (REST routes that only carry :sid). */
export async function getSimulationById(simId: string): Promise<AbmSimulation | null> {
  const index = await readSimsIndex()
  const location = index.sims[simId]
  if (!location) return null
  return getSimulation(location.projectId, simId)
}

/** Every Simulation that belongs to a Project, ordered by creation time. */
export async function listSimulationsForProject(projectId: string): Promise<AbmSimulation[]> {
  const index = await readSimsIndex()
  const loaded = await Promise.all(
    Object.entries(index.sims)
      .filter(([, location]) => location.projectId === projectId)
      .map(([simId]) => getSimulation(projectId, simId)),
  )
  return loaded
    .filter((simulation): simulation is AbmSimulation => simulation !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/**
 * Persist an updated simulation (model edit). Overwrites the simulation.json in
 * place; the id/projectId/createdAt are preserved. This is a content update, not
 * a schema change — schemaVersion stays at ABM_STORAGE_VERSION.
 */
export async function updateSimulation(
  projectId: string,
  simId: string,
  patch: Partial<Pick<AbmSimulation, 'name' | 'modelVersion' | 'config' | 'interface'>>,
): Promise<AbmSimulation | null> {
  const current = await getSimulation(projectId, simId)
  if (!current) return null
  const next: AbmSimulation = {
    ...current,
    ...patch,
    ...(patch.config
      ? { config: ensureSnakeModelId(patch.config as Record<string, unknown>) as AbmSimulation['config'] }
      : {}),
    id: current.id,
    projectId: current.projectId,
    createdAt: current.createdAt,
    schemaVersion: ABM_STORAGE_VERSION,
  }
  await writeJsonAtomic(simulationFile(projectId, simId), next)
  return next
}

export async function deleteSimulation(projectId: string, simId: string): Promise<boolean> {
  const current = await getSimulation(projectId, simId)
  if (!current) return false

  await fs.unlink(simulationFile(projectId, simId)).catch((error) => {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') throw error
  })
  await withFileLock(simsIndexFile(), async () => {
    const index = await readSimsIndex()
    delete index.sims[simId]
    await writeJsonAtomic(simsIndexFile(), index)
  })
  return true
}

// ---- ODD protocol ---------------------------------------------------------

export async function getOdd(projectId: string, simId: string): Promise<Odd | null> {
  return readRecoverableJsonFile<Odd | null>({
    filePath: oddFile(projectId, simId),
    label: 'ABM ODD',
    defaultValue: null,
    normalize: (value) =>
      isRecord(value) && isRecord(value.sections) ? (value as unknown as Odd) : null,
  })
}

export async function putOdd(projectId: string, simId: string, odd: Odd): Promise<void> {
  await writeJsonAtomic(oddFile(projectId, simId), odd)
}

// ---- run records ----------------------------------------------------------

async function readRunsIndex(): Promise<RunsIndex> {
  return readRecoverableJsonFile<RunsIndex>({
    filePath: runsIndexFile(),
    label: 'ABM runs index',
    defaultValue: { schemaVersion: ABM_STORAGE_VERSION, runs: {} },
    normalize: (value) =>
      isRecord(value) && isRecord(value.runs)
        ? { schemaVersion: ABM_STORAGE_VERSION, runs: value.runs as Record<string, RunLocation> }
        : null,
  })
}

export async function putRunRecord(
  projectId: string,
  simId: string,
  record: RunRecord,
): Promise<void> {
  await writeJsonAtomic(runFile(projectId, simId, record.id), {
    ...record,
    schemaVersion: ABM_STORAGE_VERSION,
  })
  await withFileLock(runsIndexFile(), async () => {
    const index = await readRunsIndex()
    index.runs[record.id] = { projectId, simId }
    await writeJsonAtomic(runsIndexFile(), index)
  })
}

export async function getRunRecord(
  projectId: string,
  simId: string,
  runId: string,
): Promise<RunRecord | null> {
  return readRecoverableJsonFile<RunRecord | null>({
    filePath: runFile(projectId, simId, runId),
    label: 'ABM run record',
    defaultValue: null,
    normalize: (value) => (isRecord(value) && typeof value.id === 'string' ? (value as RunRecord) : null),
  })
}

/** Resolve a RunRecord by runId alone (REST GET /api/abm/runs/:rid). */
export async function getRunRecordById(runId: string): Promise<RunRecord | null> {
  const index = await readRunsIndex()
  const location = index.runs[runId]
  if (!location) return null
  return getRunRecord(location.projectId, location.simId, runId)
}

export function resolveRunLocation(runId: string): Promise<RunLocation | null> {
  return readRunsIndex().then((index) => index.runs[runId] ?? null)
}

/** Every RunRecord that belongs to a simulation (export, P3 Task 6). */
export async function listRunRecordsForSim(simId: string): Promise<RunRecord[]> {
  const index = await readRunsIndex()
  const loaded = await Promise.all(
    Object.entries(index.runs)
      .filter(([, location]) => location.simId === simId)
      .map(([runId, location]) => getRunRecord(location.projectId, location.simId, runId)),
  )
  return loaded.filter((record): record is RunRecord => record !== null)
}

// ---- experiments ----------------------------------------------------------

async function readExperimentsIndex(): Promise<ExperimentsIndex> {
  return readRecoverableJsonFile<ExperimentsIndex>({
    filePath: experimentsIndexFile(),
    label: 'ABM experiments index',
    defaultValue: { schemaVersion: ABM_STORAGE_VERSION, experiments: {} },
    normalize: (value) =>
      isRecord(value) && isRecord(value.experiments)
        ? {
            schemaVersion: ABM_STORAGE_VERSION,
            experiments: value.experiments as Record<string, ExperimentLocation>,
          }
        : null,
  })
}

export async function putExperiment(experiment: AbmExperiment): Promise<void> {
  await writeJsonAtomic(experimentFile(experiment.projectId, experiment.simId, experiment.id), {
    ...experiment,
    schemaVersion: ABM_STORAGE_VERSION,
  })
  await withFileLock(experimentsIndexFile(), async () => {
    const index = await readExperimentsIndex()
    index.experiments[experiment.id] = {
      projectId: experiment.projectId,
      simId: experiment.simId,
    }
    await writeJsonAtomic(experimentsIndexFile(), index)
  })
}

export async function getExperiment(
  projectId: string,
  simId: string,
  experimentId: string,
): Promise<AbmExperiment | null> {
  return readRecoverableJsonFile<AbmExperiment | null>({
    filePath: experimentFile(projectId, simId, experimentId),
    label: 'ABM experiment',
    defaultValue: null,
    normalize: (value) =>
      isRecord(value) && typeof value.id === 'string' ? (value as AbmExperiment) : null,
  })
}

export async function getExperimentById(experimentId: string): Promise<AbmExperiment | null> {
  const index = await readExperimentsIndex()
  const location = index.experiments[experimentId]
  if (!location) return null
  return getExperiment(location.projectId, location.simId, experimentId)
}

/** Every experiment record that belongs to a simulation (export, P3 Task 6). */
export async function listExperimentsForSim(simId: string): Promise<AbmExperiment[]> {
  const index = await readExperimentsIndex()
  const loaded = await Promise.all(
    Object.entries(index.experiments)
      .filter(([, location]) => location.simId === simId)
      .map(([experimentId, location]) =>
        getExperiment(location.projectId, location.simId, experimentId),
      ),
  )
  return loaded.filter((record): record is AbmExperiment => record !== null)
}
