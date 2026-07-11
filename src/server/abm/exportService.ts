/**
 * Reproduction package export — P3 Task 6 (docs/ai/impl/plans/P3-experiment-repro.md).
 *
 * Assembles a self-contained package directory for a simulation so it can be
 * re-run in a clean environment and yield identical metrics (determinism, P1):
 *
 *   <package>/
 *     model/config.json        the fixed ModelConfig (+ version)
 *     odd.md                   the ODD protocol rendered to Markdown
 *     experiments/<eid>.json   every AbmExperiment of this simulation
 *     runs/<rid>.json          every RunRecord (carries the original metrics)
 *     traces/<rid>.jsonl       optional kernel trace (size-gated, off by default)
 *     manifest.json            ReproManifest: kernel_version + per-run seed/params
 *                              + checksums of every included file
 *
 * The manifest mirrors the kernel's ReproManifest concept (abm_kernel/schemas/
 * artifact.py) and adds a `runs` repro list so the package can be re-run from the
 * manifest alone (Task 7 consistency check). We emit a directory, not a zip, to
 * stay dependency-free; the checksums make the package independently verifiable.
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  getOdd,
  getSimulationById,
  listExperimentsForSim,
  listRunRecordsForSim,
} from './abmStore.fs.js'
import { deriveOdd, mergeOdd, renderOddMarkdown } from './oddService.js'
import { exportPackageDir, traceFile } from './storagePaths.js'

const EXPORT_SCHEMA_VERSION = '1'
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(MODULE_DIR, '../../..')

export class ExportNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExportNotFoundError'
  }
}

/** Enough to re-run one packaged run from the manifest alone (Task 7). */
export interface ReproRunEntry {
  id: string
  seed: number
  steps: number
  params: Record<string, unknown>
  model_id: string
  model_version: string
}

/** Server-side reproduction manifest (concept-aligned with abm_kernel ReproManifest). */
export interface ReproManifest {
  schema_version: string
  project_id: string
  sim_id: string
  auto_abm_version: string
  kernel_version: string
  created_at: string
  includes: string[]
  checksums: Record<string, string>
  runs: ReproRunEntry[]
}

export interface ExportOptions {
  /** Bundle key-level trace.jsonl per run. Off by default to bound package size. */
  includeTraces?: boolean
}

export interface ExportResult {
  exportId: string
  packageDir: string
  manifest: ReproManifest
}

async function readAutoAbmVersion(): Promise<string> {
  try {
    const raw = await fs.readFile(path.join(REPO_ROOT, 'package.json'), 'utf-8')
    const parsed = JSON.parse(raw) as { version?: unknown }
    return typeof parsed.version === 'string' ? parsed.version : 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Write one package file, recording its relative path in `includes` and its
 * sha256 in `checksums` so the manifest can attest to the whole package.
 */
async function writeTracked(
  packageDir: string,
  rel: string,
  contents: string,
  includes: string[],
  checksums: Record<string, string>,
): Promise<void> {
  const abs = path.join(packageDir, rel)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, contents, 'utf-8')
  includes.push(rel)
  checksums[rel] = createHash('sha256').update(contents).digest('hex')
}

/**
 * Build a self-contained reproduction package for a simulation. Throws
 * ExportNotFoundError when the simulation does not exist.
 */
export async function buildPackage(
  simId: string,
  opts: ExportOptions = {},
): Promise<ExportResult> {
  const sim = await getSimulationById(simId)
  if (!sim) throw new ExportNotFoundError(`Simulation not found: ${simId}`)

  const exportId = randomUUID()
  const packageDir = exportPackageDir(simId, exportId)
  await fs.mkdir(packageDir, { recursive: true })

  const includes: string[] = []
  const checksums: Record<string, string> = {}

  await writeTracked(
    packageDir,
    'model/config.json',
    JSON.stringify(sim.config, null, 2) + '\n',
    includes,
    checksums,
  )

  // Use the persisted ODD if the user has one; otherwise derive a fresh one so
  // every package documents the model (never invents — derive maps real config).
  const existingOdd = await getOdd(sim.projectId, simId)
  const odd = existingOdd ?? mergeOdd(null, deriveOdd(sim.config)).odd
  await writeTracked(packageDir, 'odd.md', renderOddMarkdown(odd), includes, checksums)

  const experiments = await listExperimentsForSim(simId)
  for (const experiment of experiments) {
    await writeTracked(
      packageDir,
      `experiments/${experiment.id}.json`,
      JSON.stringify(experiment, null, 2) + '\n',
      includes,
      checksums,
    )
  }

  const runs = await listRunRecordsForSim(simId)
  const reproRuns: ReproRunEntry[] = []
  for (const run of runs) {
    await writeTracked(
      packageDir,
      `runs/${run.id}.json`,
      JSON.stringify(run, null, 2) + '\n',
      includes,
      checksums,
    )
    reproRuns.push({
      id: run.id,
      seed: run.seed,
      steps: run.steps,
      params: run.parameters,
      model_id: run.model_id,
      model_version: run.model_version,
    })
    if (opts.includeTraces) {
      const trace = await fs
        .readFile(traceFile(sim.projectId, simId, run.id), 'utf-8')
        .catch(() => null)
      if (trace !== null) {
        await writeTracked(packageDir, `traces/${run.id}.jsonl`, trace, includes, checksums)
      }
    }
  }

  // kernel_version is authoritative on the RunRecords (it is what produced them).
  const kernelVersion = runs.find((run) => run.kernel_version)?.kernel_version ?? 'unknown'

  const manifest: ReproManifest = {
    schema_version: EXPORT_SCHEMA_VERSION,
    project_id: sim.projectId,
    sim_id: simId,
    auto_abm_version: await readAutoAbmVersion(),
    kernel_version: kernelVersion,
    created_at: new Date().toISOString(),
    includes,
    checksums,
    runs: reproRuns,
  }

  // manifest.json is written last and is not self-referencing in its own checksums.
  await fs.writeFile(
    path.join(packageDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf-8',
  )

  return { exportId, packageDir, manifest }
}
