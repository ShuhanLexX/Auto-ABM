/**
 * Binary snapshot frame decoding — byte-for-byte mirror of the kernel encoder
 * (packages/abm-kernel/src/abm_kernel/space_binary.py). See
 * docs/ai/impl/simulation-canvas.md §4.
 *
 * Wire format (little-endian):
 *   header        kind:u8, tick:u32, count:u32          (9 bytes)
 *   grid full     header + Uint8 state[width*height]    (kind=1)
 *   points full   header + Uint8 state[N]               (kind=2)
 *   delta         header + (index:u32, state:u8)*count  (kind=3)
 *
 * Pure functions only — these run hot inside the frame worker and are unit
 * tested directly.
 */

export const KIND_GRID_FULL = 1
export const KIND_POINTS_FULL = 2
export const KIND_DELTA = 3

/** Reserved palette index for unoccupied grid cells / unknown states. */
export const EMPTY_STATE = 255

const HEADER_BYTES = 9 // u8 + u32 + u32
const DELTA_ITEM_BYTES = 5 // u32 + u8

export interface FullFrame {
  kind: typeof KIND_GRID_FULL | typeof KIND_POINTS_FULL
  tick: number
  // Owns a fresh ArrayBuffer (copied out of the frame) so the worker can keep it
  // as the resident state buffer and transfer copies back to the main thread.
  state: Uint8Array<ArrayBuffer>
}

export interface DeltaFrame {
  kind: typeof KIND_DELTA
  tick: number
  indices: Uint32Array
  states: Uint8Array
}

export type DecodedFrame = FullFrame | DeltaFrame

export function decodeFrame(buffer: ArrayBuffer): DecodedFrame {
  const view = new DataView(buffer)
  const kind = view.getUint8(0)
  const tick = view.getUint32(1, true)
  const count = view.getUint32(5, true)

  if (kind === KIND_DELTA) {
    const indices = new Uint32Array(count)
    const states = new Uint8Array(count)
    let offset = HEADER_BYTES
    for (let i = 0; i < count; i++) {
      indices[i] = view.getUint32(offset, true)
      states[i] = view.getUint8(offset + 4)
      offset += DELTA_ITEM_BYTES
    }
    return { kind: KIND_DELTA, tick, indices, states }
  }

  // Full grid/points: copy the state bytes out so the frame owns its buffer.
  const state = new Uint8Array(buffer.slice(HEADER_BYTES, HEADER_BYTES + count))
  return { kind: kind === KIND_GRID_FULL ? KIND_GRID_FULL : KIND_POINTS_FULL, tick, state }
}

/** Apply a decoded delta frame onto a resident state buffer (mutates in place). */
export function applyDelta(state: Uint8Array, frame: DeltaFrame): Uint8Array {
  const { indices, states } = frame
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i]!
    if (idx < state.length) state[idx] = states[i]!
  }
  return state
}

/** Decode a base64 little-endian Float32 buffer (network layout x,y interleaved). */
export function decodeFloat32Base64(b64: string): Float32Array {
  return new Float32Array(base64ToBytes(b64).buffer)
}

/** Decode a base64 little-endian Uint32 buffer (network edge index pairs a,b). */
export function decodeUint32Base64(b64: string): Uint32Array {
  return new Uint32Array(base64ToBytes(b64).buffer)
}

function base64ToBytes(b64: string): Uint8Array {
  if (b64.length === 0) return new Uint8Array(0)
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
