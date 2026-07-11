import * as os from 'node:os'
import * as path from 'node:path'
import { appStateDir, getAppConfigHomeDir } from '../../constants/appPaths.js'

/**
 * ABM persistence layout — docs/ai/impl/architecture.md §5.
 *
 * Root uses AUTOABM_CONFIG_DIR || CLAUDE_CONFIG_DIR || ~/.autoabm.
 * ABM data lives under autoabm/abm/ so it never collides with unrelated state.
 */

function configDir(): string {
  return getAppConfigHomeDir()
}

export function abmRoot(): string {
  return path.join(appStateDir(configDir()), 'abm')
}

export function projectsIndexFile(): string {
  return path.join(abmRoot(), 'projects.json')
}

export function runsIndexFile(): string {
  return path.join(abmRoot(), 'runs-index.json')
}

export function experimentsIndexFile(): string {
  return path.join(abmRoot(), 'experiments-index.json')
}

export function simsIndexFile(): string {
  return path.join(abmRoot(), 'sims-index.json')
}

export function projectDir(projectId: string): string {
  return path.join(abmRoot(), 'projects', projectId)
}

export function projectFile(projectId: string): string {
  return path.join(projectDir(projectId), 'project.json')
}

export function simulationsDir(projectId: string): string {
  return path.join(projectDir(projectId), 'simulations')
}

export function simulationDir(projectId: string, simId: string): string {
  return path.join(simulationsDir(projectId), simId)
}

export function simulationFile(projectId: string, simId: string): string {
  return path.join(simulationDir(projectId, simId), 'simulation.json')
}

/** Per-simulation ODD protocol (oddService output + user edits). */
export function oddFile(projectId: string, simId: string): string {
  return path.join(simulationDir(projectId, simId), 'odd.json')
}

export function runFile(projectId: string, simId: string, runId: string): string {
  return path.join(simulationDir(projectId, simId), 'runs', `${runId}.json`)
}

/** Per-experiment record (ExperimentConfig + run bookkeeping). */
export function experimentFile(projectId: string, simId: string, experimentId: string): string {
  return path.join(simulationDir(projectId, simId), 'experiments', `${experimentId}.json`)
}

/**
 * Directory passed to the kernel as `output_dir`. The kernel lays out
 * `trace/<rid>.jsonl` + `results/raw/<rid>.csv` under it (runner.simulate),
 * so we reuse the kernel's artifacts directly instead of copying.
 */
export function kernelOutputDir(projectId: string, simId: string): string {
  return simulationDir(projectId, simId)
}

/** Root for exported reproduction packages (P3 Task 6). */
export function exportsDir(): string {
  return path.join(abmRoot(), 'exports')
}

/** One self-contained reproduction package directory per export. */
export function exportPackageDir(simId: string, exportId: string): string {
  return path.join(exportsDir(), simId, exportId)
}

/** Line-delimited JSON trace the kernel TraceWriter writes for a run. */
export function traceFile(projectId: string, simId: string, runId: string): string {
  return path.join(simulationDir(projectId, simId), 'trace', `${runId}.jsonl`)
}
