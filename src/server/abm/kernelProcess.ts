/**
 * Single kernel subprocess wrapper (docs/ai/impl/kernel-bridge.md).
 *
 * Spawns the Python stdio worker (`abm_kernel.worker`), writes one NDJSON
 * command, parses the stdout NDJSON frame stream line-by-line, and pushes each
 * frame to `onFrame`. The line-buffered reader mirrors conversationService's
 * stream parsing.
 *
 * Runtime resolution order:
 *   1. ABM_KERNEL_CMD (+ ABM_KERNEL_ARGS JSON array) — test/stub override.
 *   2. The kernel's uv-managed .venv Python (has Mesa/pydantic installed).
 *   3. detectPythonRuntime() system Python — best-effort fallback.
 * PYTHONPATH always points at the kernel `src/` so the worker module resolves
 * even when the installed wheel predates it.
 */

import * as path from 'node:path'
import { existsSync, readdirSync, type Dirent } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { detectPythonRuntime, type CommandResult } from '../api/computer-use-python.js'
import type { ModelConfig, RunRecord } from './types.js'

// Canvas metadata + binary snapshot framing (P1) — see space_binary.py and
// docs/ai/impl/simulation-canvas.md §4. Layout/edges are base64 typed-array
// buffers shipped once; per-frame `snapshot` carries only state bytes (b64).
export interface KernelGridMeta {
  width: number
  height: number
}

export interface KernelNetworkMeta {
  count: number
  edge_count: number
  layout_b64: string
  edges_b64: string
}

export type KernelFrame =
  | { frame: 'run_meta'; run_id: string; seed: number; steps: number }
  | { frame: 'tick'; run_id: string; tick: number; metrics: Record<string, number> }
  | {
      frame: 'meta'
      run_id: string
      space: 'grid' | 'network'
      palette: string[]
      grid?: KernelGridMeta
      network?: KernelNetworkMeta
    }
  | {
      frame: 'snapshot'
      run_id: string
      tick: number
      space?: string
      encoding: string
      payload?: unknown
      b64?: string
    }
  | { frame: 'run_done'; run_id: string; record: RunRecord }
  | { frame: 'error'; run_id: string | null; type: string; message: string }

// Batch experiment frames (P3). A separate union from KernelFrame so the
// single-run path (abmRunService/wsAbmHandler) is unaffected; consumed only by
// experimentService over its own kernel invocation.
//   experiment_meta -> run_done* -> experiment_done | error
export type KernelExperimentFrame =
  | { frame: 'experiment_meta'; experiment_id: string; total: number }
  | {
      frame: 'run_done'
      experiment_id: string
      index: number
      total: number
      record: RunRecord
    }
  | { frame: 'experiment_done'; experiment_id: string }
  | {
      frame: 'error'
      experiment_id?: string | null
      run_id?: string | null
      type: string
      message: string
    }

export class KernelUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KernelUnavailableError'
  }
}

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(MODULE_DIR, '../../..')
const DEFAULT_KERNEL_DIR = path.join(REPO_ROOT, 'packages', 'abm-kernel')
const ABM_KERNEL_ROOT_ENV = 'ABM_KERNEL_ROOT'

export interface ResolvedKernelCommand {
  command: string
  args: string[]
  cwd: string
  env: Record<string, string>
}

export function resolveKernelDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env[ABM_KERNEL_ROOT_ENV]?.trim()
  return override ? path.resolve(override) : DEFAULT_KERNEL_DIR
}

function kernelSourceDir(kernelDir: string): string {
  return path.join(kernelDir, 'src')
}

function workerEntryPath(kernelDir: string): string {
  return path.join(kernelSourceDir(kernelDir), 'abm_kernel', 'worker.py')
}

function assertKernelFiles(kernelDir: string): void {
  if (existsSync(workerEntryPath(kernelDir))) return
  throw new KernelUnavailableError(
    `ABM kernel files were not found at ${kernelDir}. Rebuild the desktop sidecar so ` +
      'src-tauri/resources/abm-kernel is packaged, or set ABM_KERNEL_ROOT to the kernel directory.',
  )
}

function kernelEnv(kernelDir: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value
  }
  const sourceDir = kernelSourceDir(kernelDir)
  const pythonPathEntries = [sourceDir, ...venvSitePackagesDirs(kernelDir)]
  // Prepend kernel src so `abm_kernel.worker` resolves from source (the
  // editable/installed wheel may predate worker.py). Existing PYTHONPATH is
  // preserved so site-packages (Mesa/pydantic) stay importable.
  env.PYTHONPATH = env.PYTHONPATH
    ? [...pythonPathEntries, env.PYTHONPATH].join(path.delimiter)
    : pythonPathEntries.join(path.delimiter)
  env.PYTHONUNBUFFERED = '1'
  env.PYTHONUTF8 = '1'
  return env
}

function venvSitePackagesDirs(kernelDir: string): string[] {
  const venvDir = path.join(kernelDir, '.venv')
  const candidates = [path.join(venvDir, 'Lib', 'site-packages')]
  const unixLibDir = path.join(venvDir, 'lib')
  try {
    for (const entry of readdirSync(unixLibDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith('python')) {
        candidates.push(path.join(unixLibDir, entry.name, 'site-packages'))
      }
    }
  } catch {
    // Windows venvs do not have .venv/lib.
  }
  return candidates.filter((candidate, index) => existsSync(candidate) && candidates.indexOf(candidate) === index)
}

function venvPython(kernelDir: string): string | null {
  const candidates =
    process.platform === 'win32'
      ? [path.join(kernelDir, '.venv', 'Scripts', 'python.exe')]
      : [path.join(kernelDir, '.venv', 'bin', 'python3'), path.join(kernelDir, '.venv', 'bin', 'python')]
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

function bundledPython(kernelDir: string): string | null {
  const pythonRoot = path.join(kernelDir, '.python')
  if (!existsSync(pythonRoot)) return null

  const matches = walkFiles(pythonRoot, (candidate) => {
    const base = path.basename(candidate)
    if (process.platform === 'win32') return base.toLowerCase() === 'python.exe'
    return base === 'python3' || base === 'python'
  })

  return matches.sort((left, right) => pythonExecutableScore(left) - pythonExecutableScore(right))[0] ?? null
}

function pythonExecutableScore(candidate: string): number {
  const normalized = candidate.replaceAll('\\', '/')
  if (process.platform === 'win32' && normalized.endsWith('/python.exe')) return 0
  if (normalized.endsWith('/bin/python3')) return 0
  if (normalized.endsWith('/bin/python')) return 1
  return 2
}

function walkFiles(rootDir: string, predicate: (candidate: string) => boolean): string[] {
  const matches: string[] = []
  const stack = [rootDir]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue

    let entries: Dirent[]
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
      } else if (predicate(fullPath)) {
        matches.push(fullPath)
      }
    }
  }
  return matches
}

async function bunRunCommand(cmd: string, args: string[]): Promise<CommandResult> {
  try {
    const proc = Bun.spawn([cmd, ...args], { stdout: 'pipe', stderr: 'pipe' })
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    const code = await proc.exited
    return { ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim(), code }
  } catch {
    return { ok: false, stdout: '', stderr: `Failed to run ${cmd}`, code: -1 }
  }
}

export async function resolveKernelCommand(): Promise<ResolvedKernelCommand> {
  const kernelDir = resolveKernelDir()
  const env = kernelEnv(kernelDir)

  const override = process.env.ABM_KERNEL_CMD?.trim()
  if (override) {
    let args: string[] = []
    const rawArgs = process.env.ABM_KERNEL_ARGS
    if (rawArgs) {
      try {
        const parsed = JSON.parse(rawArgs)
        if (Array.isArray(parsed)) args = parsed.map(String)
      } catch {
        throw new KernelUnavailableError('ABM_KERNEL_ARGS must be a JSON array of strings')
      }
    }
    return { command: override, args, cwd: existsSync(kernelDir) ? kernelDir : process.cwd(), env }
  }

  assertKernelFiles(kernelDir)

  const bundled = bundledPython(kernelDir)
  if (bundled) {
    return { command: bundled, args: ['-m', 'abm_kernel.worker'], cwd: kernelDir, env }
  }

  const venv = venvPython(kernelDir)
  if (venv) {
    return { command: venv, args: ['-m', 'abm_kernel.worker'], cwd: kernelDir, env }
  }

  const runtime = await detectPythonRuntime(process.platform, bunRunCommand)
  if (!runtime.installed || !runtime.command) {
    throw new KernelUnavailableError(
      'No usable Python runtime found for the ABM kernel. Install Python 3.11+ and run ' +
        '`cd packages/abm-kernel && uv sync --all-extras`, or set ABM_KERNEL_CMD.',
    )
  }
  return {
    command: runtime.command,
    args: [...runtime.prefixArgs, '-m', 'abm_kernel.worker'],
    cwd: kernelDir,
    env,
  }
}

/**
 * Spawn the kernel, write one command (+ shutdown), and stream its NDJSON frames
 * line-by-line to `onFrame`. Generic over the frame union so the single-run and
 * batch-experiment paths share the spawn/stream/terminal-guard logic. If the
 * process dies without a terminal frame — e.g. missing kernel deps — a synthetic
 * error frame is emitted so callers always observe closure.
 */
async function streamKernel<F>(
  cmd: Record<string, unknown>,
  onFrame: (frame: F) => void,
  isTerminal: (frame: F) => boolean,
  makeProcessError: (message: string) => F,
  resolved?: ResolvedKernelCommand,
  onProcess?: (proc: Bun.Subprocess) => void,
): Promise<void> {
  const target = resolved ?? (await resolveKernelCommand())

  const proc = Bun.spawn([target.command, ...target.args], {
    cwd: target.cwd,
    env: target.env,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  onProcess?.(proc)

  let sawTerminal = false
  const emit = (frame: F) => {
    if (isTerminal(frame)) sawTerminal = true
    onFrame(frame)
  }

  try {
    proc.stdin.write(JSON.stringify(cmd) + '\n')
    proc.stdin.write(JSON.stringify({ cmd: 'shutdown' }) + '\n')
    proc.stdin.flush()
    proc.stdin.end()
  } catch (error) {
    proc.kill()
    throw new KernelUnavailableError(
      `Failed to send command to kernel process: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const stderrPromise = new Response(proc.stderr).text()

  const reader = proc.stdout.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let newlineIndex: number
    while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)
      if (line) emit(JSON.parse(line) as F)
    }
  }
  const tail = buffer.trim()
  if (tail) emit(JSON.parse(tail) as F)

  const code = await proc.exited
  if (!sawTerminal) {
    const stderr = (await stderrPromise).trim()
    emit(makeProcessError(stderr || `Kernel process exited with code ${code} before completing`))
  }
}

/**
 * Run a single kernel command and stream its frames. Resolves when the worker
 * process exits.
 */
export async function runKernel(
  cmd: Record<string, unknown>,
  onFrame: (frame: KernelFrame) => void,
  resolved?: ResolvedKernelCommand,
  onProcess?: (proc: Bun.Subprocess) => void,
): Promise<void> {
  const runId = typeof cmd.run_id === 'string' ? cmd.run_id : null
  await streamKernel<KernelFrame>(
    cmd,
    onFrame,
    (frame) => frame.frame === 'run_done' || frame.frame === 'error',
    (message) => ({ frame: 'error', run_id: runId, type: 'KernelProcessError', message }),
    resolved,
    onProcess,
  )
}

/**
 * Run a batch experiment command and stream its frames (experiment_meta ->
 * run_done* -> experiment_done | error). The terminal frame is `experiment_done`
 * or `error`; per-run `run_done` frames are progress, not terminal.
 */
export async function runKernelExperiment(
  cmd: Record<string, unknown>,
  onFrame: (frame: KernelExperimentFrame) => void,
  resolved?: ResolvedKernelCommand,
  onProcess?: (proc: Bun.Subprocess) => void,
): Promise<void> {
  const experimentId = typeof cmd.experiment_id === 'string' ? cmd.experiment_id : null
  await streamKernel<KernelExperimentFrame>(
    cmd,
    onFrame,
    (frame) => frame.frame === 'experiment_done' || frame.frame === 'error',
    (message) => ({
      frame: 'error',
      experiment_id: experimentId,
      run_id: null,
      type: 'KernelProcessError',
      message,
    }),
    resolved,
    onProcess,
  )
}

/**
 * Materialize a built-in fixed ModelConfig from the kernel by name (P0 fixed
 * configs). Python stays authoritative — the server never hand-writes configs.
 */
export async function dumpBuiltinConfig(name: string): Promise<ModelConfig> {
  const target = await resolveKernelCommand()
  const proc = Bun.spawn([target.command, ...target.args], {
    cwd: target.cwd,
    env: target.env,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  proc.stdin.write(JSON.stringify({ cmd: 'dump_config', name }) + '\n')
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
      | { frame: 'config'; name: string; config: ModelConfig }
      | { frame: 'error'; type: string; message: string }
    if (frame.frame === 'config') return frame.config
    if (frame.frame === 'error') {
      throw new KernelUnavailableError(`Kernel rejected template '${name}': ${frame.message}`)
    }
  }
  const stderr = (await stderrPromise).trim()
  throw new KernelUnavailableError(
    stderr || `Kernel produced no config for template '${name}'`,
  )
}
