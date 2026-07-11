import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { abmRunService } from '../abmRunService.js'
import { buildPackage } from '../exportService.js'
import { createProject, createSimulation, getRunRecordById } from '../abmStore.fs.js'
import { runKernel } from '../kernelProcess.js'
import type { ModelConfig, RunRecord } from '../types.js'

const STUB_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'stubReproWorker.ts')

let tempDir: string

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 8000): Promise<void> {
  const start = Date.now()
  for (;;) {
    if (await predicate()) return
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

/** Re-run one packaged run through the kernel from manifest inputs; return its metrics. */
async function rerun(
  config: ModelConfig,
  entry: { id: string; seed: number; steps: number; params: Record<string, unknown> },
): Promise<RunRecord['metrics_summary']> {
  let record: RunRecord | null = null
  await runKernel(
    {
      cmd: 'run',
      run_id: `${entry.id}-rerun`,
      config,
      seed: entry.seed,
      steps: entry.steps,
      params: entry.params,
      output_dir: tempDir,
    },
    (frame) => {
      if (frame.frame === 'run_done') record = frame.record
    },
  )
  if (!record) throw new Error(`re-run produced no record for ${entry.id}`)
  return (record as RunRecord).metrics_summary
}

describe('reproduction package re-run consistency', () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'abm-repro-'))
    process.env.CLAUDE_CONFIG_DIR = tempDir
    process.env.ABM_KERNEL_CMD = 'bun'
    process.env.ABM_KERNEL_ARGS = JSON.stringify([STUB_PATH])
  })

  afterEach(async () => {
    delete process.env.CLAUDE_CONFIG_DIR
    delete process.env.ABM_KERNEL_CMD
    delete process.env.ABM_KERNEL_ARGS
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  test('re-running from the manifest reproduces identical metrics_summary', async () => {
    const project = await createProject({ name: 'Repro project' })
    const config: ModelConfig = { id: 'stub', version: '1', observers: [{ id: 'infected', level: 'macro' }] }
    const sim = await createSimulation(project.id, {
      name: 'Repro sim',
      modelVersion: '1',
      config,
      interface: { seed: 1, steps: 5, params: {} },
    })

    // Two original runs through the (deterministic) kernel — different inputs.
    const originals = [
      { runId: 'orig-a', seed: 11, steps: 5, params: { beta: 0.1 } },
      { runId: 'orig-b', seed: 22, steps: 5, params: { beta: 0.3 } },
    ]
    for (const o of originals) {
      await abmRunService.startRun({
        projectId: project.id,
        simId: sim.id,
        runId: o.runId,
        config,
        seed: o.seed,
        steps: o.steps,
        params: o.params,
      })
    }
    await waitFor(async () => {
      const a = await getRunRecordById('orig-a')
      const b = await getRunRecordById('orig-b')
      return a?.status === 'completed' && b?.status === 'completed'
    })

    // Export, then read the manifest + packaged runs back from disk.
    const { packageDir, manifest } = await buildPackage(sim.id)
    expect(manifest.runs).toHaveLength(2)

    const packagedConfig = JSON.parse(
      await fs.readFile(path.join(packageDir, 'model/config.json'), 'utf-8'),
    ) as ModelConfig

    for (const entry of manifest.runs) {
      const packagedRun = JSON.parse(
        await fs.readFile(path.join(packageDir, `runs/${entry.id}.json`), 'utf-8'),
      ) as RunRecord
      const reproduced = await rerun(packagedConfig, entry)
      expect(reproduced).toEqual(packagedRun.metrics_summary)
    }

    // Sanity: the two runs differ (metrics genuinely depend on seed/params, so
    // the equality above is meaningful, not a constant-output artifact).
    const [a, b] = manifest.runs
    const runA = JSON.parse(await fs.readFile(path.join(packageDir, `runs/${a.id}.json`), 'utf-8')) as RunRecord
    const runB = JSON.parse(await fs.readFile(path.join(packageDir, `runs/${b.id}.json`), 'utf-8')) as RunRecord
    expect(runA.metrics_summary).not.toEqual(runB.metrics_summary)
  })
})
