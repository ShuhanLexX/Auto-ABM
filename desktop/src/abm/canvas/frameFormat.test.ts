import { describe, expect, it } from 'vitest'
import {
  applyDelta,
  decodeFloat32Base64,
  decodeFrame,
  decodeUint32Base64,
  EMPTY_STATE,
  KIND_DELTA,
  KIND_GRID_FULL,
  KIND_POINTS_FULL,
} from './frameFormat'

// Test-side encoders mirroring the kernel wire format (space_binary.py), so the
// decode round-trips are self-contained.
function makeFull(kind: number, tick: number, state: number[]): ArrayBuffer {
  const buf = new ArrayBuffer(9 + state.length)
  const view = new DataView(buf)
  view.setUint8(0, kind)
  view.setUint32(1, tick, true)
  view.setUint32(5, state.length, true)
  new Uint8Array(buf, 9).set(state)
  return buf
}

function makeDelta(tick: number, changes: Array<[number, number]>): ArrayBuffer {
  const buf = new ArrayBuffer(9 + changes.length * 5)
  const view = new DataView(buf)
  view.setUint8(0, KIND_DELTA)
  view.setUint32(1, tick, true)
  view.setUint32(5, changes.length, true)
  let offset = 9
  for (const [idx, st] of changes) {
    view.setUint32(offset, idx, true)
    view.setUint8(offset + 4, st)
    offset += 5
  }
  return buf
}

describe('decodeFrame', () => {
  it('decodes a points-full frame', () => {
    const frame = decodeFrame(makeFull(KIND_POINTS_FULL, 5, [0, 1, 2, 1]))
    expect(frame.kind).toBe(KIND_POINTS_FULL)
    expect(frame.tick).toBe(5)
    if (frame.kind === KIND_POINTS_FULL) {
      expect(Array.from(frame.state)).toEqual([0, 1, 2, 1])
    }
  })

  it('decodes a grid-full frame with empty cells', () => {
    const frame = decodeFrame(makeFull(KIND_GRID_FULL, 2, [0, EMPTY_STATE, 1, EMPTY_STATE]))
    expect(frame.kind).toBe(KIND_GRID_FULL)
    if (frame.kind === KIND_GRID_FULL) {
      expect(Array.from(frame.state)).toEqual([0, EMPTY_STATE, 1, EMPTY_STATE])
    }
  })

  it('decodes a delta frame into index/state arrays', () => {
    const frame = decodeFrame(makeDelta(9, [[1, 3], [3, 2]]))
    expect(frame.kind).toBe(KIND_DELTA)
    if (frame.kind === KIND_DELTA) {
      expect(frame.tick).toBe(9)
      expect(Array.from(frame.indices)).toEqual([1, 3])
      expect(Array.from(frame.states)).toEqual([3, 2])
    }
  })
})

describe('applyDelta', () => {
  it('applies a decoded delta onto the state buffer', () => {
    const state = new Uint8Array([0, 0, 0, 0])
    const frame = decodeFrame(makeDelta(1, [[1, 3], [3, 2]]))
    if (frame.kind === KIND_DELTA) applyDelta(state, frame)
    expect(Array.from(state)).toEqual([0, 3, 0, 2])
  })

  it('ignores out-of-range indices defensively', () => {
    const state = new Uint8Array([0, 0])
    const frame = decodeFrame(makeDelta(1, [[5, 9], [0, 1]]))
    if (frame.kind === KIND_DELTA) applyDelta(state, frame)
    expect(Array.from(state)).toEqual([1, 0])
  })
})

describe('typed-array base64 decoders', () => {
  it('round-trips a Float32 layout buffer', () => {
    const floats = new Float32Array([0, 0.5, 1, 0.25])
    const b64 = bytesToBase64(new Uint8Array(floats.buffer))
    expect(Array.from(decodeFloat32Base64(b64))).toEqual([0, 0.5, 1, 0.25])
  })

  it('round-trips a Uint32 edge buffer', () => {
    const ints = new Uint32Array([0, 1, 1, 2])
    const b64 = bytesToBase64(new Uint8Array(ints.buffer))
    expect(Array.from(decodeUint32Base64(b64))).toEqual([0, 1, 1, 2])
  })

  it('returns an empty array for empty base64', () => {
    expect(decodeFloat32Base64('').length).toBe(0)
  })
})

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
