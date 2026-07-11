import { getAuthToken, getBaseUrl } from '../../api/client'
import type { AbmServerMessage } from '../types'

export interface AbmSocketHandlers {
  /** JSON control messages: status / tick / meta / run_done / error. */
  onMessage?: (msg: AbmServerMessage) => void
  /** Binary snapshot frames (decoded off the main thread by the canvas). */
  onBinary?: (frame: ArrayBuffer) => void
}

type AbmConnection = {
  ws: WebSocket
  handlers: Set<AbmSocketHandlers>
}

/**
 * Dedicated /ws/abm/:runId client (docs/ai/impl/architecture.md §4). Separate
 * from the chat socket so simulation frames never contend with chat streaming.
 * binaryType is arraybuffer; messages are demultiplexed by `typeof data`:
 * strings are JSON control, ArrayBuffers are binary snapshot frames (P1).
 */
class AbmSocketManager {
  private connections = new Map<string, AbmConnection>()

  connect(runId: string, handlers: AbmSocketHandlers): () => void {
    const existing = this.connections.get(runId)
    if (existing) {
      existing.handlers.add(handlers)
      return () => this.off(runId, handlers)
    }

    const ws = new WebSocket(buildAbmWebSocketUrl(runId))
    ws.binaryType = 'arraybuffer'
    const conn: AbmConnection = { ws, handlers: new Set([handlers]) }
    this.connections.set(runId, conn)

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        let msg: AbmServerMessage
        try {
          msg = JSON.parse(event.data) as AbmServerMessage
        } catch {
          return
        }
        for (const handler of [...conn.handlers]) handler.onMessage?.(msg)
        return
      }
      if (event.data instanceof ArrayBuffer) {
        for (const handler of [...conn.handlers]) handler.onBinary?.(event.data)
      }
    }

    ws.onclose = () => {
      if (this.connections.get(runId) === conn) {
        this.connections.delete(runId)
      }
    }

    return () => this.off(runId, handlers)
  }

  private off(runId: string, handlers: AbmSocketHandlers): void {
    const conn = this.connections.get(runId)
    if (!conn) return
    conn.handlers.delete(handlers)
    if (conn.handlers.size === 0) this.disconnect(runId)
  }

  disconnect(runId: string): void {
    const conn = this.connections.get(runId)
    if (!conn) return
    this.connections.delete(runId)
    try {
      conn.ws.close()
    } catch {
      /* already closed */
    }
  }
}

export function buildAbmWebSocketUrl(runId: string): string {
  const url = new URL(getBaseUrl())
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  const basePath = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '')
  url.pathname = `${basePath}/ws/abm/${encodeURIComponent(runId)}`

  const token = getAuthToken()
  if (token) {
    url.searchParams.set('token', token)
  } else {
    url.searchParams.delete('token')
  }

  return url.toString()
}

export const abmSocket = new AbmSocketManager()
