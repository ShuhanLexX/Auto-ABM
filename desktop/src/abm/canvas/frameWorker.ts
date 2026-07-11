/**
 * Frame decode worker — keeps the resident state buffer off the main thread and
 * applies binary snapshot frames (full replace / delta patch), then posts the
 * latest state back for rendering (simulation-canvas.md §3-4).
 *
 * Protocol:
 *   main -> worker  { type: 'reset', size }      (re)allocate state buffer
 *   main -> worker  ArrayBuffer                  a binary snapshot frame
 *   worker -> main  { type: 'state', tick, state }  latest state (buffer transferred)
 *
 * The decode logic lives in frameFormat.ts (pure, unit tested); this file is the
 * thin worker shell.
 */

import { applyDelta, decodeFrame, EMPTY_STATE, KIND_DELTA } from './frameFormat'

interface ResetMessage {
  type: 'reset'
  size: number
}

interface StateMessage {
  type: 'state'
  tick: number
  state: Uint8Array
}

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null
  postMessage: (message: StateMessage, transfer?: Transferable[]) => void
}

let state = new Uint8Array(0)

ctx.onmessage = (event: MessageEvent) => {
  const data = event.data

  if (data instanceof ArrayBuffer) {
    handleFrame(data)
    return
  }

  if (isReset(data)) {
    state = new Uint8Array(data.size).fill(EMPTY_STATE)
  }
}

function handleFrame(buffer: ArrayBuffer): void {
  const frame = decodeFrame(buffer)
  if (frame.kind === KIND_DELTA) {
    if (state.length === 0) return // no base frame yet; ignore stray delta
    applyDelta(state, frame)
  } else {
    state = frame.state
  }

  // Transfer a copy so the worker keeps its resident buffer for the next delta.
  const copy = state.slice()
  ctx.postMessage({ type: 'state', tick: frame.tick, state: copy }, [copy.buffer])
}

function isReset(value: unknown): value is ResetMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'reset' &&
    typeof (value as { size?: unknown }).size === 'number'
  )
}
