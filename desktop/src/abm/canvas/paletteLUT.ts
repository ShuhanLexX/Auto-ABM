/**
 * State index -> colour, for the simulation canvas. The kernel ships only state
 * bytes (palette indices); the desktop owns the actual colours so it never has
 * to transmit them per frame (simulation-canvas.md §4).
 *
 * `buildPaletteLUT` packs a 256-entry index -> RGBA lookup as Uint32 in the byte
 * order a little-endian Uint32 view of ImageData.data expects (R,G,B,A bytes =
 * 0xAABBGGRR), so GridRasterRenderer can blit with `px[i] = lut[state[i]]`.
 */

import { EMPTY_STATE } from './frameFormat'

// A categorical ramp aligned with the metric chart colours; cycles past its end.
const RAMP = [
  '#60a5fa',
  '#f87171',
  '#34d399',
  '#fbbf24',
  '#a78bfa',
  '#f472b6',
  '#22d3ee',
  '#fb923c',
  '#4ade80',
  '#e879f9',
] as const

const STATE_COLORS: Record<string, string> = {
  burning: '#ef4444',
  burned: '#3f3f46',
  fuel: '#65a30d',
  tree: '#65a30d',
  rock: '#6b7280',
  empty: '#111827',
  susceptible: '#34d399',
  infected: '#f87171',
  recovered: '#60a5fa',
  exposed: '#fbbf24',
  sick: '#ef4444',
  healthy: '#4ade80',
  immune: '#9ca3af',
}

export function colorHexForIndex(index: number): string {
  return RAMP[index % RAMP.length]!
}

export function colorHexForPaletteValue(value: string | undefined, index: number): string {
  const normalized = value?.trim().toLowerCase()
  return normalized && STATE_COLORS[normalized] ? STATE_COLORS[normalized] : colorHexForIndex(index)
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const value = parseInt(clean, 16)
  if (clean.length === 6) {
    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
  }
  // #rgb shorthand
  const r = (value >> 8) & 0xf
  const g = (value >> 4) & 0xf
  const b = value & 0xf
  return [r * 17, g * 17, b * 17]
}

/** Pack r,g,b,a (0-255) into the Uint32 a little-endian RGBA byte view reads back. */
export function packRGBA(r: number, g: number, b: number, a: number): number {
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0
}

/**
 * Build a 256-entry LUT: palette indices -> opaque colour, every other index
 * (including EMPTY_STATE) -> fully transparent so empty cells render as holes.
 */
export function buildPaletteLUT(palette: number | readonly string[]): Uint32Array {
  const lut = new Uint32Array(256) // zero-filled => transparent
  const labels = typeof palette === 'number' ? null : palette
  const paletteSize = typeof palette === 'number' ? palette : palette.length
  const size = Math.min(paletteSize, 255)
  for (let i = 0; i < size; i++) {
    if (i === EMPTY_STATE) continue
    const [r, g, b] = hexToRgb(colorHexForPaletteValue(labels?.[i], i))
    lut[i] = packRGBA(r, g, b, 255)
  }
  return lut
}
