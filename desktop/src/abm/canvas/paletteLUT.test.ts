import { describe, expect, it } from 'vitest'
import { EMPTY_STATE } from './frameFormat'
import { buildPaletteLUT, colorHexForIndex, colorHexForPaletteValue, hexToRgb, packRGBA } from './paletteLUT'

describe('colorHexForIndex', () => {
  it('is stable and cycles past the ramp length', () => {
    const first = colorHexForIndex(0)
    expect(first).toBe(colorHexForIndex(0))
    // index 10 wraps back to index 0 (ramp has 10 entries)
    expect(colorHexForIndex(10)).toBe(first)
  })
})

describe('colorHexForPaletteValue', () => {
  it('uses semantic colours for well-known ABM states', () => {
    expect(colorHexForPaletteValue('burning', 0)).toBe('#ef4444')
    expect(colorHexForPaletteValue('fuel', 1)).toBe('#65a30d')
    expect(colorHexForPaletteValue('unknown-state', 2)).toBe(colorHexForIndex(2))
  })
})

describe('hexToRgb', () => {
  it('parses #rrggbb', () => {
    expect(hexToRgb('#60a5fa')).toEqual([0x60, 0xa5, 0xfa])
  })

  it('parses #rgb shorthand', () => {
    expect(hexToRgb('#fff')).toEqual([255, 255, 255])
  })
})

describe('buildPaletteLUT', () => {
  it('packs palette colours opaque and leaves empty/unused transparent', () => {
    const lut = buildPaletteLUT(3)
    expect(lut.length).toBe(256)

    const [r, g, b] = hexToRgb(colorHexForIndex(0))
    expect(lut[0]).toBe(packRGBA(r, g, b, 255))

    // Indices beyond the palette and the reserved empty index are transparent.
    expect(lut[3]).toBe(0)
    expect(lut[EMPTY_STATE]).toBe(0)
  })

  it('packs semantic palette colours when labels are provided', () => {
    const lut = buildPaletteLUT(['burning'])
    const [r, g, b] = hexToRgb('#ef4444')
    expect(lut[0]).toBe(packRGBA(r, g, b, 255))
  })

  it('packs alpha into the high byte (little-endian RGBA view)', () => {
    const packed = packRGBA(0x11, 0x22, 0x33, 0xff)
    expect(packed >>> 24).toBe(0xff) // alpha
    expect(packed & 0xff).toBe(0x11) // red in low byte
  })
})
