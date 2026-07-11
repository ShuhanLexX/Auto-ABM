/**
 * AbmRunService — run lifecycle + frame fan-out (docs/ai/impl/architecture.md §6).
 *
 * Owns the bridge between an HTTP "start run" request and the kernel
 * subprocess: it spawns the kernel, fans every NDJSON frame out to subscribed
 * sinks (the WS handler), and persists the authoritative RunRecord on
 * `run_done`/`error`. The kernel writes trace.jsonl + results CSV itself under
 * the output dir, so the server never re-serialises simulation data.
 *
 * Singleton, matching base-platform service conventions (e.g. conversationService).
 */

import {
  KernelUnavailableError,
  resolveKernelCommand,
  runKernel,
  type KernelFrame,
  type ResolvedKernelCommand,
} from './kernelProcess.js'
import { getRunRecord, putRunRecord } from './abmStore.fs.js'
import { kernelOutputDir } from './storagePaths.js'
import type { Intervention, ModelConfig, RunRecord } from './types.js'

export interface StartRunParams {
  projectId: string
  simId: string
  runId: string
  config: ModelConfig
  seed: number
  steps: number
  params?: Record<string, unknown>
  spaceSampleRate?: number
  spaceAgentCap?: number
  /** Scheduled deterministic parameter changes at fixed ticks (intervention experiment). */
  interventions?: Intervention[]
}

type FrameSink = (frame: KernelFrame) => void

function stringField(config: ModelConfig, key: string): string {
  const value = config[key]
  return typeof value === 'string' ? value : ''
}

/**
 * Drop malformed intervention entries before they reach the kernel. Keeps only
 * ticks >= 1 with a non-empty param patch (the kernel applies the same rule, so
 * this just avoids sending noise and lets us omit the field entirely when empty).
 */
function normalizeInterventions(
  interventions: Intervention[] | undefined,
): Intervention[] | undefined {
  if (!interventions || interventions.length === 0) return undefined
  const cleaned = interventions
    .filter(
      (item) =>
        item &&
        Number.isFinite(item.at_tick) &&
        Math.trunc(item.at_tick) >= 1 &&
        item.params &&
        typeof item.params === 'object' &&
        Object.keys(item.params).length > 0,
    )
    .map((item) => ({
      at_tick: Math.trunc(item.at_tick),
      params: item.params,
      ...(item.note ? { note: item.note } : {}),
    }))
  return cleaned.length > 0 ? cleaned : undefined
}

// How long a finished run's frame buffer is retained for late subscribers.
const BUFFER_RETENTION_MS = 60_000

class AbmRunService {
  private listeners = new Map<string, Set<FrameSink>>()
  private active = new Map<string, Bun.Subprocess>()
  private stopped = new Set<string>()
  // Per-run frame history so a socket connecting just after POST /runs still
  // replays early ticks and the terminal frame. Dropped shortly after the run
  // ends to bound memory.
  private buffers = new Map<string, KernelFrame[]>()
  private cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>()

  /**
   * Subscribe to a run's frame stream. Buffered frames are replayed
   * synchronously before live frames start, so no frame is missed. Returns an
   * unsubscribe function.
   */
  onFrame(runId: string, cb: FrameSink): () => void {
    const buffered = this.buffers.get(runId)
    if (buffered) {
      for (const frame of buffered) {
        try {
          cb(frame)
        } catch (error) {
          console.error('[abm] frame sink threw during replay:', error)
        }
      }
    }

    let sinks = this.listeners.get(runId)
    if (!sinks) {
      sinks = new Set()
      this.listeners.set(runId, sinks)
    }
    sinks.add(cb)
    return () => {
      const current = this.listeners.get(runId)
      if (!current) return
      current.delete(cb)
      if (current.size === 0) this.listeners.delete(runId)
    }
  }

  private dispatch(runId: string, frame: KernelFrame): void {
    let buffer = this.buffers.get(runId)
    if (!buffer) {
      buffer = []
      this.buffers.set(runId, buffer)
    }
    buffer.push(frame)

    const sinks = this.listeners.get(runId)
    if (sinks) {
      for (const sink of [...sinks]) {
        try {
          sink(frame)
        } catch (error) {
          console.error('[abm] frame sink threw:', error)
        }
      }
    }

    if (frame.frame === 'run_done' || frame.frame === 'error') {
      this.scheduleBufferCleanup(runId)
    }
  }

  private scheduleBufferCleanup(runId: string): void {
    const existing = this.cleanupTimers.get(runId)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      this.buffers.delete(runId)
      this.cleanupTimers.delete(runId)
    }, BUFFER_RETENTION_MS)
    // Don't keep the process alive solely for buffer cleanup.
    if (typeof timer === 'object' && 'unref' in timer) timer.unref()
    this.cleanupTimers.set(runId, timer)
  }

  /**
   * Validate kernel availability (throws KernelUnavailableError synchronously),
   * persist a pending RunRecord, then run the kernel in the background.
   */
  async startRun(params: StartRunParams): Promise<{ runId: string }> {
    const resolved = await resolveKernelCommand()

    const interventions = normalizeInterventions(params.interventions)
    const pending: RunRecord = {
      id: params.runId,
      model_id: stringField(params.config, 'id'),
      model_version: stringField(params.config, 'version'),
      kernel_version: '',
      seed: params.seed,
      parameters: params.params ?? {},
      steps: params.steps,
      ...(interventions ? { interventions } : {}),
      status: 'running',
      started_at: new Date().toISOString(),
      metrics_summary: {},
    }
    await putRunRecord(params.projectId, params.simId, pending)

    void this.execute(params, resolved, pending)
    return { runId: params.runId }
  }

  private async execute(
    params: StartRunParams,
    resolved: ResolvedKernelCommand,
    pending: RunRecord,
  ): Promise<void> {
    const interventions = normalizeInterventions(params.interventions)
    const command = {
      cmd: 'run',
      run_id: params.runId,
      config: params.config,
      seed: params.seed,
      steps: params.steps,
      params: params.params,
      output_dir: kernelOutputDir(params.projectId, params.simId),
      space_sample_rate: params.spaceSampleRate ?? 0,
      // P1: emit compact binary snapshot frames (meta + b64) for the canvas.
      // No-op unless space_sample_rate > 0 (kernel only snapshots then).
      snapshot_encoding: 'binary',
      ...(params.spaceAgentCap !== undefined ? { space_agent_cap: params.spaceAgentCap } : {}),
      ...(interventions ? { interventions } : {}),
    }

    try {
      await runKernel(
        command,
        (frame) => {
          if (this.stopped.has(params.runId)) return
          this.dispatch(params.runId, frame)
          if (frame.frame === 'run_done') {
            void putRunRecord(params.projectId, params.simId, frame.record)
          } else if (frame.frame === 'error') {
            void putRunRecord(params.projectId, params.simId, {
              ...pending,
              status: 'failed',
              finished_at: new Date().toISOString(),
              error: { type: frame.type, message: frame.message },
            })
          }
        },
        resolved,
        (proc) => this.active.set(params.runId, proc),
      )
    } catch (error) {
      if (this.stopped.has(params.runId)) return
      const message = error instanceof Error ? error.message : String(error)
      this.dispatch(params.runId, {
        frame: 'error',
        run_id: params.runId,
        type: error instanceof KernelUnavailableError ? 'KernelUnavailableError' : 'KernelError',
        message,
      })
      await putRunRecord(params.projectId, params.simId, {
        ...pending,
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: { type: 'KernelError', message },
      }).catch((persistError) => {
        console.error('[abm] failed to persist failed RunRecord:', persistError)
      })
    } finally {
      this.active.delete(params.runId)
      this.stopped.delete(params.runId)
    }
  }

  async stopRun(projectId: string, simId: string, runId: string): Promise<boolean> {
    const proc = this.active.get(runId)
    if (!proc) return false
    this.stopped.add(runId)
    this.active.delete(runId)
    const message = '运行已停止'
    this.dispatch(runId, {
      frame: 'error',
      run_id: runId,
      type: 'RunStopped',
      message,
    })
    try {
      proc.kill()
    } catch {
      /* already exited */
    }

    const previous = await getRunRecord(projectId, simId, runId)
    if (previous) {
      await putRunRecord(projectId, simId, {
        ...previous,
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: { type: 'RunStopped', message },
      })
    }
    return true
  }

  /** Kill every active kernel process — called from server shutdown. */
  async stopAll(): Promise<void> {
    const procs = [...this.active.values()]
    this.active.clear()
    for (const proc of procs) {
      try {
        proc.kill()
      } catch {
        /* already exited */
      }
    }
    await Promise.allSettled(procs.map((proc) => proc.exited))
  }
}

export const abmRunService = new AbmRunService()
