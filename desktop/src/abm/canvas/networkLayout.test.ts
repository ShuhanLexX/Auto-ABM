import { describe, expect, it } from 'vitest'
import {
  computeNetworkLayout,
  defaultLayoutMode,
  NETWORK_LAYOUT_MODES,
} from './networkLayout'

function withinUnitSquare(positions: Float32Array): boolean {
  for (const value of positions) {
    if (!Number.isFinite(value) || value < 0 || value > 1) return false
  }
  return true
}

describe('networkLayout', () => {
  it('recommends the kernel layout for small graphs and a force layout for mid-size', () => {
    expect(defaultLayoutMode(50)).toBe('default')
    expect(defaultLayoutMode(400)).toBe('default')
    expect(defaultLayoutMode(500)).toBe('force')
    // Above the client force ceiling it stays on the kernel layout.
    expect(defaultLayoutMode(5000)).toBe('default')
  })

  it("returns the kernel base untouched for the 'default' mode", () => {
    const base = new Float32Array([0.1, 0.2, 0.3, 0.4])
    const edges = new Uint32Array([0, 1])
    expect(computeNetworkLayout('default', base, edges, 2)).toBe(base)
  })

  it('produces the right coordinate count inside the unit square for every mode', () => {
    const count = 24
    const base = new Float32Array(count * 2).fill(0.5)
    const edges = new Uint32Array([0, 1, 1, 2, 2, 3, 3, 0, 4, 5])
    for (const mode of NETWORK_LAYOUT_MODES) {
      const positions = computeNetworkLayout(mode, base, edges, count)
      expect(positions.length).toBe(count * 2)
      expect(withinUnitSquare(positions)).toBe(true)
    }
  })

  it('spreads circle-layout nodes to distinct positions instead of a single point', () => {
    const count = 12
    const base = new Float32Array(count * 2).fill(0.5)
    const positions = computeNetworkLayout('circle', base, new Uint32Array(), count)
    const unique = new Set<string>()
    for (let i = 0; i < count; i += 1) unique.add(`${positions[i * 2]},${positions[i * 2 + 1]}`)
    expect(unique.size).toBe(count)
  })

  it('is deterministic: the same inputs yield identical force layouts', () => {
    const count = 40
    const base = new Float32Array(count * 2)
    for (let i = 0; i < count; i += 1) {
      base[i * 2] = ((i * 37) % 100) / 100
      base[i * 2 + 1] = ((i * 53) % 100) / 100
    }
    const edges = new Uint32Array([0, 1, 1, 2, 2, 3, 5, 6, 7, 8, 10, 20, 15, 30])
    const first = computeNetworkLayout('force', base, edges, count)
    const second = computeNetworkLayout('force', base, edges, count)
    expect(Array.from(first)).toEqual(Array.from(second))
  })
})
