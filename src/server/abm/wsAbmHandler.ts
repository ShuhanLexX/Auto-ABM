/**
 * /ws/abm/:runId handler — subscribes a socket to one run's frame stream and
 * forwards each KernelFrame as an AbmServerMessage (docs/ai/impl/architecture.md §4).
 *
 * Late subscribers still see the whole run: AbmRunService replays its buffered
 * frames on subscribe, so a desktop client that connects just after POST /runs
 * does not miss early ticks or the terminal run_done.
 */

import type { ServerWebSocket } from 'bun'
import type { WebSocketData } from '../ws/handler.js'
import { abmRunService } from './abmRunService.js'
import { abmExperimentService } from './experimentService.js'
import type { KernelFrame } from './kernelProcess.js'
import type { AbmServerMessage } from './wsEvents.js'

const subscriptions = new Map<ServerWebSocket<WebSocketData>, () => void>()

function toServerMessage(frame: KernelFrame): AbmServerMessage | null {
  switch (frame.frame) {
    case 'run_meta':
      return { type: 'abm_run_status', runId: frame.run_id, state: 'running', tick: 0, totalSteps: frame.steps }
    case 'tick':
      return { type: 'abm_tick', runId: frame.run_id, tick: frame.tick, metrics: frame.metrics }
    case 'meta':
      return {
        type: 'abm_meta',
        runId: frame.run_id,
        space: frame.space,
        palette: frame.palette,
        ...(frame.grid ? { grid: frame.grid } : {}),
        ...(frame.network
          ? {
              network: {
                count: frame.network.count,
                edgeCount: frame.network.edge_count,
                layoutB64: frame.network.layout_b64,
                edgesB64: frame.network.edges_b64,
              },
            }
          : {}),
      }
    case 'run_done':
      return { type: 'abm_run_done', runId: frame.run_id, record: frame.record }
    case 'error':
      return { type: 'abm_error', runId: frame.run_id ?? '', message: frame.message }
    case 'snapshot':
      // Snapshot bytes are sent as a binary WS frame, not JSON (see handleFrame).
      return null
  }
}

/** A single outgoing WS message: JSON control, or a raw binary snapshot frame. */
export type AbmOutgoing =
  | { kind: 'json'; message: AbmServerMessage }
  | { kind: 'binary'; bytes: Uint8Array }

/**
 * Map one KernelFrame to the WS messages it produces. Pure (no socket) so the
 * JSON-vs-binary demultiplexing is unit-testable. Snapshot frames decode their
 * base64 payload to raw bytes; control frames stay JSON; terminal frames also
 * emit a status message (architecture §4).
 */
export function frameToOutgoing(frame: KernelFrame): AbmOutgoing[] {
  if (frame.frame === 'snapshot') {
    if (frame.encoding === 'b64' && typeof frame.b64 === 'string') {
      return [{ kind: 'binary', bytes: new Uint8Array(Buffer.from(frame.b64, 'base64')) }]
    }
    return []
  }

  const out: AbmOutgoing[] = []
  const mapped = toServerMessage(frame)
  if (mapped) out.push({ kind: 'json', message: mapped })
  if (frame.frame === 'run_done') {
    out.push({ kind: 'json', message: { type: 'abm_run_status', runId: frame.run_id, state: 'completed' } })
  } else if (frame.frame === 'error') {
    out.push({
      kind: 'json',
      message: { type: 'abm_run_status', runId: frame.run_id ?? '', state: 'failed' },
    })
  }
  return out
}

function dispatchOutgoing(ws: ServerWebSocket<WebSocketData>, frame: KernelFrame): void {
  for (const outgoing of frameToOutgoing(frame)) {
    try {
      if (outgoing.kind === 'binary') ws.send(outgoing.bytes)
      else ws.send(JSON.stringify(outgoing.message))
    } catch (error) {
      console.error('[abm/ws] failed to send:', error)
    }
  }
}

function sendJson(ws: ServerWebSocket<WebSocketData>, message: AbmServerMessage): void {
  try {
    ws.send(JSON.stringify(message))
  } catch (error) {
    console.error('[abm/ws] failed to send experiment message:', error)
  }
}

export const wsAbmHandler = {
  open(ws: ServerWebSocket<WebSocketData>): void {
    const id = ws.data.runId
    if (!id) {
      ws.close(1008, 'Missing runId')
      return
    }
    // The id is either a run id or an experiment id; subscribe to both streams
    // (the other is simply silent). Run frames demultiplex to JSON/binary;
    // experiment messages are already AbmServerMessage control JSON.
    const offRun = abmRunService.onFrame(id, (frame) => dispatchOutgoing(ws, frame))
    const offExperiment = abmExperimentService.onProgress(id, (message) => sendJson(ws, message))
    subscriptions.set(ws, () => {
      offRun()
      offExperiment()
    })
  },

  message(): void {
    // P0: the desktop never sends on the ABM channel (control is via REST).
  },

  close(ws: ServerWebSocket<WebSocketData>): void {
    const unsubscribe = subscriptions.get(ws)
    if (unsubscribe) unsubscribe()
    subscriptions.delete(ws)
  },
}
