import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { abmRunService } from '../abmRunService.js'
import { createProject, createSimulation, getRunRecordById } from '../abmStore.fs.js'
import { resolveKernelCommand, type KernelFrame } from '../kernelProcess.js'

const STUB_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'stubWorker.ts')

let tempDir: string
let runCounter = 0

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 8000): Promise<void> {
  const start = Date.now()
  for (;;) {
    if (await predicate()) return
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

async function makeSimulation() {
  const project = await createProject({ name: 'Test project' })
  const sim = await createSimulation(project.id, {
    name: 'Test sim',
    modelVersion: '1',
    config: { id: 'stub', version: '1' },
    interface: { seed: 7, steps: 3, params: {} },
  })
  return { project, sim }
}

describe('AbmRunService (stub worker)', () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'abm-run-'))
    process.env.CLAUDE_CONFIG_DIR = tempDir
    process.env.ABM_KERNEL_CMD = 'bun'
    process.env.ABM_KERNEL_ARGS = JSON.stringify([STUB_PATH])
  })

  afterEach(async () => {
    delete process.env.CLAUDE_CONFIG_DIR
    delete process.env.ABM_KERNEL_CMD
    delete process.env.ABM_KERNEL_ARGS
    delete process.env.ABM_KERNEL_ROOT
    delete process.env.ABM_STUB_DELAY_MS
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  test('uses a bundled kernel root from ABM_KERNEL_ROOT', async () => {
    const bundledKernel = path.join(tempDir, 'resources', 'abm-kernel')
    await fs.mkdir(path.join(bundledKernel, 'src', 'abm_kernel'), { recursive: true })
    await fs.writeFile(path.join(bundledKernel, 'src', 'abm_kernel', 'worker.py'), '# stub\n')
    process.env.ABM_KERNEL_ROOT = bundledKernel

    const resolved = await resolveKernelCommand()

    expect(resolved.cwd).toBe(bundledKernel)
    expect(resolved.env.PYTHONPATH.split(path.delimiter)[0]).toBe(path.join(bundledKernel, 'src'))
  })

  test('uses packaged Python and venv dependencies when bundled', async () => {
    delete process.env.ABM_KERNEL_CMD
    delete process.env.ABM_KERNEL_ARGS

    const bundledKernel = path.join(tempDir, 'resources', 'abm-kernel')
    const sourceDir = path.join(bundledKernel, 'src')
    const windowsPython = path.join(bundledKernel, '.python', 'cpython-test', 'python.exe')
    const unixPython = path.join(bundledKernel, '.python', 'cpython-test', 'bin', 'python3')
    const windowsSitePackages = path.join(bundledKernel, '.venv', 'Lib', 'site-packages')
    const unixSitePackages = path.join(bundledKernel, '.venv', 'lib', 'python3.13', 'site-packages')

    await fs.mkdir(path.join(sourceDir, 'abm_kernel'), { recursive: true })
    await fs.mkdir(path.dirname(windowsPython), { recursive: true })
    await fs.mkdir(path.dirname(unixPython), { recursive: true })
    await fs.mkdir(windowsSitePackages, { recursive: true })
    await fs.mkdir(unixSitePackages, { recursive: true })
    await fs.writeFile(path.join(sourceDir, 'abm_kernel', 'worker.py'), '# stub\n')
    await fs.writeFile(windowsPython, '')
    await fs.writeFile(unixPython, '')
    process.env.ABM_KERNEL_ROOT = bundledKernel

    const resolved = await resolveKernelCommand()

    expect(resolved.command).toBe(process.platform === 'win32' ? windowsPython : unixPython)
    expect(resolved.args).toEqual(['-m', 'abm_kernel.worker'])
    const pythonPath = resolved.env.PYTHONPATH.split(path.delimiter)
    expect(pythonPath[0]).toBe(sourceDir)
    expect(pythonPath).toContain(windowsSitePackages)
    expect(pythonPath).toContain(unixSitePackages)
  })

  test('streams tick + run_done frames and persists a completed RunRecord', async () => {
    const { project, sim } = await makeSimulation()
    const runId = `run-${++runCounter}`

    const frames: KernelFrame[] = []
    const unsubscribe = abmRunService.onFrame(runId, (frame) => frames.push(frame))

    const result = await abmRunService.startRun({
      projectId: project.id,
      simId: sim.id,
      runId,
      config: sim.config,
      seed: 7,
      steps: 3,
    })
    expect(result.runId).toBe(runId)

    await waitFor(() => frames.some((f) => f.frame === 'run_done'))
    unsubscribe()

    const kinds = frames.map((f) => f.frame)
    expect(kinds[0]).toBe('run_meta')
    expect(kinds).toContain('tick')
    expect(kinds.filter((k) => k === 'tick')).toHaveLength(3)
    expect(kinds[kinds.length - 1]).toBe('run_done')

    await waitFor(async () => (await getRunRecordById(runId))?.status === 'completed')
    const record = await getRunRecordById(runId)
    expect(record?.seed).toBe(7)
    expect(record?.metrics_summary).toEqual({ infected: { final: 0.3 } })
  })

  test('forwards scheduled interventions to the kernel and records them', async () => {
    const { project, sim } = await makeSimulation()
    const runId = `run-${++runCounter}`

    await abmRunService.startRun({
      projectId: project.id,
      simId: sim.id,
      runId,
      config: sim.config,
      seed: 7,
      steps: 3,
      interventions: [
        { at_tick: 2, params: { p: 0.9 }, note: 'shock' },
        // Dropped by normalization: tick < 1 and empty patch.
        { at_tick: 0, params: { p: 0.1 } },
        { at_tick: 3, params: {} },
      ],
    })

    await waitFor(async () => (await getRunRecordById(runId))?.status === 'completed')
    const record = await getRunRecordById(runId)
    expect(record?.interventions).toEqual([{ at_tick: 2, params: { p: 0.9 }, note: 'shock' }])
  })

  test('late subscriber still replays the full frame stream', async () => {
    const { project, sim } = await makeSimulation()
    const runId = `run-${++runCounter}`

    await abmRunService.startRun({
      projectId: project.id,
      simId: sim.id,
      runId,
      config: sim.config,
      seed: 7,
      steps: 3,
    })

    // Subscribe only after the run was kicked off; buffered frames must replay.
    await waitFor(async () => (await getRunRecordById(runId))?.status === 'completed')
    const frames: KernelFrame[] = []
    abmRunService.onFrame(runId, (frame) => frames.push(frame))

    expect(frames.some((f) => f.frame === 'run_meta')).toBe(true)
    expect(frames.some((f) => f.frame === 'run_done')).toBe(true)
  })

  test('a kernel that fails to spawn yields an error frame and failed RunRecord', async () => {
    process.env.ABM_KERNEL_CMD = 'abm-kernel-binary-that-does-not-exist'
    delete process.env.ABM_KERNEL_ARGS

    const { project, sim } = await makeSimulation()
    const runId = `run-${++runCounter}`

    const frames: KernelFrame[] = []
    abmRunService.onFrame(runId, (frame) => frames.push(frame))

    await abmRunService.startRun({
      projectId: project.id,
      simId: sim.id,
      runId,
      config: sim.config,
      seed: 1,
      steps: 3,
    })

    await waitFor(() => frames.some((f) => f.frame === 'error'))
    await waitFor(async () => (await getRunRecordById(runId))?.status === 'failed')

    const record = await getRunRecordById(runId)
    expect(record?.status).toBe('failed')
    expect(record?.error?.message).toBeTruthy()
  })

  test('stops an active kernel run and persists a stopped record', async () => {
    process.env.ABM_STUB_DELAY_MS = '100'
    const { project, sim } = await makeSimulation()
    const runId = `run-${++runCounter}`

    const frames: KernelFrame[] = []
    abmRunService.onFrame(runId, (frame) => frames.push(frame))

    await abmRunService.startRun({
      projectId: project.id,
      simId: sim.id,
      runId,
      config: sim.config,
      seed: 7,
      steps: 3,
    })

    await waitFor(() => frames.some((frame) => frame.frame === 'run_meta'))
    const stopped = await abmRunService.stopRun(project.id, sim.id, runId)
    expect(stopped).toBe(true)

    await waitFor(() => frames.some((frame) => frame.frame === 'error' && frame.type === 'RunStopped'))
    await waitFor(async () => (await getRunRecordById(runId))?.error?.type === 'RunStopped')
    const record = await getRunRecordById(runId)
    expect(record?.status).toBe('failed')
    expect(record?.error?.message).toBe('运行已停止')
  })
})
