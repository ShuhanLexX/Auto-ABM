/**
 * AbmExperimentService — batch experiment lifecycle + progress fan-out (P3).
 *
 * Mirrors AbmRunService for batch experiments: spawns the kernel `experiment`
 * command, persists every RunRecord the kernel produces, keeps an AbmExperiment
 * bookkeeping record up to date, and fans `abm_experiment_*` control messages
 * out to subscribed sockets. Per-run failures are recorded, not fatal (the
 * kernel batch keeps going), matching the determinism + robustness contract.
 *
 * Subscribers connect on /ws/abm/:experimentId — the run-id slot doubles as the
 * experiment id. The dedicated AbmRunService stream and this one never collide:
 * a given id is either a run or an experiment.
 */

import {
  KernelUnavailableError,
  resolveKernelCommand,
  runKernelExperiment,
  type KernelExperimentFrame,
  type ResolvedKernelCommand,
} from './kernelProcess.js'
import { putExperiment, putRunRecord } from './abmStore.fs.js'
import { kernelOutputDir } from './storagePaths.js'
import type { AbmExperiment, ExperimentConfig, ModelConfig } from './types.js'
import type { AbmServerMessage } from './wsEvents.js'

export interface StartExperimentParams {
  projectId: string
  simId: string
  experimentId: string
  name: string
  config: ModelConfig
  experiment: ExperimentConfig
}

type MessageSink = (message: AbmServerMessage) => void

// How long a finished experiment's message buffer is retained for late subscribers.
const BUFFER_RETENTION_MS = 60_000

/**
 * Snapshot the mutable experiment record so a queued (async) write captures the
 * state at enqueue time, not the fully-mutated shared object. Without this an
 * early progress write would persist the final `completed` status before the
 * later run records actually land on disk.
 */
function snapshotExperiment(record: AbmExperiment): AbmExperiment {
  return { ...record, runIds: [...record.runIds] }
}

class AbmExperimentService {
  private listeners = new Map<string, Set<MessageSink>>()
  private active = new Map<string, Bun.Subprocess>()
  private activeRecords = new Map<string, AbmExperiment>()
  private stopped = new Set<string>()
  private buffers = new Map<string, AbmServerMessage[]>()
  private cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>()

  /**
   * Subscribe to an experiment's progress stream. Buffered messages replay
   * synchronously before live ones, so a socket connecting just after the POST
   * still sees the meta + every completed run. Returns an unsubscribe function.
   */
  onProgress(experimentId: string, cb: MessageSink): () => void {
    const buffered = this.buffers.get(experimentId)
    if (buffered) {
      for (const message of buffered) {
        try {
          cb(message)
        } catch (error) {
          console.error('[abm] experiment sink threw during replay:', error)
        }
      }
    }

    let sinks = this.listeners.get(experimentId)
    if (!sinks) {
      sinks = new Set()
      this.listeners.set(experimentId, sinks)
    }
    sinks.add(cb)
    return () => {
      const current = this.listeners.get(experimentId)
      if (!current) return
      current.delete(cb)
      if (current.size === 0) this.listeners.delete(experimentId)
    }
  }

  private dispatch(experimentId: string, message: AbmServerMessage): void {
    let buffer = this.buffers.get(experimentId)
    if (!buffer) {
      buffer = []
      this.buffers.set(experimentId, buffer)
    }
    buffer.push(message)

    const sinks = this.listeners.get(experimentId)
    if (sinks) {
      for (const sink of [...sinks]) {
        try {
          sink(message)
        } catch (error) {
          console.error('[abm] experiment sink threw:', error)
        }
      }
    }

    if (message.type === 'abm_experiment_status' && message.status !== 'running') {
      this.scheduleBufferCleanup(experimentId)
    }
  }

  private scheduleBufferCleanup(experimentId: string): void {
    const existing = this.cleanupTimers.get(experimentId)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      this.buffers.delete(experimentId)
      this.cleanupTimers.delete(experimentId)
    }, BUFFER_RETENTION_MS)
    if (typeof timer === 'object' && 'unref' in timer) timer.unref()
    this.cleanupTimers.set(experimentId, timer)
  }

  /**
   * Validate kernel availability (throws KernelUnavailableError synchronously),
   * persist a running AbmExperiment, then run the batch in the background.
   */
  async startExperiment(params: StartExperimentParams): Promise<{ experimentId: string }> {
    const resolved = await resolveKernelCommand()

    const record: AbmExperiment = {
      id: params.experimentId,
      projectId: params.projectId,
      simId: params.simId,
      name: params.name,
      config: params.experiment,
      status: 'running',
      total: 0,
      runIds: [],
      createdAt: new Date().toISOString(),
      schemaVersion: 0, // overwritten by putExperiment
    }
    await putExperiment(record)
    this.activeRecords.set(params.experimentId, record)

    void this.execute(params, resolved, record)
    return { experimentId: params.experimentId }
  }

  async stopExperiment(experimentId: string): Promise<boolean> {
    const proc = this.active.get(experimentId)
    const record = this.activeRecords.get(experimentId)
    if (!proc || !record) return false
    this.stopped.add(experimentId)
    this.active.delete(experimentId)
    const message = 'Experiment stopped'
    record.status = 'stopped'
    record.error = { type: 'ExperimentStopped', message }
    record.finishedAt = new Date().toISOString()
    this.dispatch(experimentId, {
      type: 'abm_experiment_status',
      experimentId,
      status: 'stopped',
      total: record.total,
    })
    try {
      proc.kill()
    } catch {
      /* already exited */
    }
    await putExperiment(snapshotExperiment(record))
    return true
  }

  private async execute(
    params: StartExperimentParams,
    resolved: ResolvedKernelCommand,
    record: AbmExperiment,
  ): Promise<void> {
    const command = {
      cmd: 'experiment',
      experiment_id: params.experimentId,
      experiment: params.experiment,
      config: params.config,
      output_dir: kernelOutputDir(params.projectId, params.simId),
    }

    // Serialize persistence writes so concurrent run_done frames don't race the
    // shared runs-index / experiment file. WS dispatch stays immediate (sync).
    let chain: Promise<void> = Promise.resolve()
    const enqueue = (fn: () => Promise<void>) => {
      chain = chain.then(fn).catch((error) => {
        console.error('[abm] experiment persistence failed:', error)
      })
    }

    try {
      await runKernelExperiment(
        command,
        (frame) => {
          if (this.stopped.has(params.experimentId)) return
          this.handleFrame(params, record, frame, enqueue)
        },
        resolved,
        (proc) => this.active.set(params.experimentId, proc),
      )
    } catch (error) {
      if (!this.stopped.has(params.experimentId)) {
        const message = error instanceof Error ? error.message : String(error)
        record.status = 'failed'
        record.error = {
          type: error instanceof KernelUnavailableError ? 'KernelUnavailableError' : 'KernelError',
          message,
        }
        this.dispatch(params.experimentId, {
          type: 'abm_experiment_status',
          experimentId: params.experimentId,
          status: 'failed',
          total: record.total,
        })
      }
    }

    await chain
    record.finishedAt = record.finishedAt ?? new Date().toISOString()
    await putExperiment(record).catch((error) => {
      console.error('[abm] failed to persist final experiment record:', error)
    })
    this.active.delete(params.experimentId)
    this.activeRecords.delete(params.experimentId)
    this.stopped.delete(params.experimentId)
  }

  private handleFrame(
    params: StartExperimentParams,
    record: AbmExperiment,
    frame: KernelExperimentFrame,
    enqueue: (fn: () => Promise<void>) => void,
  ): void {
    switch (frame.frame) {
      case 'experiment_meta':
        record.total = frame.total
        this.dispatch(params.experimentId, {
          type: 'abm_experiment_status',
          experimentId: params.experimentId,
          status: 'running',
          total: frame.total,
        })
        enqueue(() => putExperiment(snapshotExperiment(record)))
        break

      case 'run_done': {
        const runRecord = frame.record
        record.runIds.push(runRecord.id)
        this.dispatch(params.experimentId, {
          type: 'abm_experiment_progress',
          experimentId: params.experimentId,
          index: frame.index,
          total: frame.total,
          runId: runRecord.id,
          state: runRecord.status === 'failed' ? 'failed' : 'completed',
        })
        const snapshot = snapshotExperiment(record)
        enqueue(async () => {
          await putRunRecord(params.projectId, params.simId, runRecord)
          await putExperiment(snapshot)
        })
        break
      }

      case 'experiment_done':
        record.status = 'completed'
        record.finishedAt = new Date().toISOString()
        this.dispatch(params.experimentId, {
          type: 'abm_experiment_status',
          experimentId: params.experimentId,
          status: 'completed',
          total: record.total,
        })
        break

      case 'error':
        record.status = 'failed'
        record.error = { type: frame.type, message: frame.message }
        record.finishedAt = new Date().toISOString()
        this.dispatch(params.experimentId, {
          type: 'abm_experiment_status',
          experimentId: params.experimentId,
          status: 'failed',
          total: record.total,
        })
        break
    }
  }
}

export const abmExperimentService = new AbmExperimentService()
