/**
 * Frame decode pipe used by SimulationCanvas. Prefers an off-main-thread worker
 * (simulation-canvas.md §3); if Workers are unavailable (e.g. some test/embed
 * environments) it falls back to decoding on the main thread with the same pure
 * frameFormat functions, so the canvas still works, just without the offload.
 */

import { applyDelta, decodeFrame, KIND_DELTA } from './frameFormat'

export interface FrameDecoder {
  push: (buffer: ArrayBuffer) => void
  dispose: () => void
}

export type OnState = (state: Uint8Array, tick: number) => void

export function createFrameDecoder(onState: OnState): FrameDecoder {
  if (typeof Worker !== 'undefined') {
    try {
      return createWorkerDecoder(onState)
    } catch {
      // fall through to main-thread decoding
    }
  }
  return createInlineDecoder(onState)
}

function createWorkerDecoder(onState: OnState): FrameDecoder {
  const worker = new Worker(new URL('./frameWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent) => {
    const data = event.data
    if (data && data.type === 'state') onState(data.state as Uint8Array, data.tick as number)
  }
  return {
    push: (buffer) => worker.postMessage(buffer, [buffer]),
    dispose: () => worker.terminate(),
  }
}

function createInlineDecoder(onState: OnState): FrameDecoder {
  let state = new Uint8Array(0)
  return {
    push: (buffer) => {
      const frame = decodeFrame(buffer)
      if (frame.kind === KIND_DELTA) {
        if (state.length === 0) return
        applyDelta(state, frame)
      } else {
        state = frame.state
      }
      onState(state, frame.tick)
    },
    dispose: () => {},
  }
}
