import { describe, expect, it } from 'vitest'
import { clampScale, IDENTITY_CAMERA, zoomAt } from './camera'

describe('clampScale', () => {
  it('clamps to the supported zoom range', () => {
    expect(clampScale(0.001)).toBeCloseTo(0.02)
    expect(clampScale(10_000)).toBeCloseTo(400)
    expect(clampScale(2)).toBe(2)
  })
})

describe('zoomAt', () => {
  it('keeps the world point under the anchor fixed while zooming', () => {
    // With identity camera, a point at the anchor maps to itself; after zooming
    // about that anchor, the anchor's screen position must be unchanged.
    const anchor = 100
    const next = zoomAt(IDENTITY_CAMERA, 2, anchor, anchor)
    expect(next.scale).toBe(2)
    // screen = origin*... simplified: anchor maps via x' = anchor - (anchor - x)*applied
    const worldScreenBefore = anchor // (anchor - cam.x)/cam.scale at identity
    const worldScreenAfter = next.x + ((worldScreenBefore - IDENTITY_CAMERA.x) / IDENTITY_CAMERA.scale) * next.scale
    expect(worldScreenAfter).toBeCloseTo(anchor)
  })

  it('respects the scale clamp when zooming far out', () => {
    const next = zoomAt({ scale: 0.03, x: 0, y: 0 }, 0.1, 0, 0)
    expect(next.scale).toBeCloseTo(0.02)
  })
})
