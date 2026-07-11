import { describe, expect, it } from 'vitest'
import { normalizeZoomFactor } from './zoom'

describe('Electron zoom service', () => {
  it('clamps native zoom to the same range as the renderer setting', () => {
    expect(normalizeZoomFactor(0.1)).toBe(0.5)
    expect(normalizeZoomFactor(1.25)).toBe(1.25)
    expect(normalizeZoomFactor(4)).toBe(2)
    expect(normalizeZoomFactor(Number.NaN)).toBe(1)
  })
})
