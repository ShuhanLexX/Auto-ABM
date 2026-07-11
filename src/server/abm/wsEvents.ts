/**
 * ABM WebSocket control messages — docs/ai/impl/architecture.md §4.
 *
 * P0 is all-JSON over the dedicated /ws/abm/:runId channel; high-frequency
 * binary snapshot frames are deferred to P1. Kept separate from the base
 * ws/events.ts so the ABM protocol never bleeds into the chat socket.
 * The desktop mirrors these types in desktop/src/abm/types.ts.
 */

import type { RunRecord } from './types.js'

/**
 * First-frame canvas metadata (P1). Sent as JSON on the same /ws/abm socket
 * right before the binary snapshot frames begin. `layoutB64`/`edgesB64` are
 * base64 little-endian typed-array buffers (Float32 x,y / Uint32 a,b) the
 * desktop decodes once; per-frame snapshots carry only state bytes (binary).
 */
export interface AbmGridMeta {
  width: number
  height: number
}

export interface AbmNetworkMeta {
  count: number
  edgeCount: number
  layoutB64: string
  edgesB64: string
}

export type AbmServerMessage =
  | {
      type: 'abm_run_status'
      runId: string
      state: 'running' | 'completed' | 'failed'
      tick?: number
      totalSteps?: number
    }
  | { type: 'abm_tick'; runId: string; tick: number; metrics: Record<string, number> }
  | {
      type: 'abm_meta'
      runId: string
      space: 'grid' | 'network'
      palette: string[]
      grid?: AbmGridMeta
      network?: AbmNetworkMeta
    }
  | { type: 'abm_run_done'; runId: string; record: RunRecord }
  | { type: 'abm_error'; runId: string; message: string }
  // Batch experiment progress (P3). Carried on /ws/abm/:experimentId (the run-id
  // slot doubles as the experiment id when subscribing to an experiment).
  | {
      type: 'abm_experiment_status'
      experimentId: string
      status: 'running' | 'completed' | 'failed' | 'stopped'
      total: number
    }
  | {
      type: 'abm_experiment_progress'
      experimentId: string
      index: number
      total: number
      runId: string
      state: 'completed' | 'failed'
    }
