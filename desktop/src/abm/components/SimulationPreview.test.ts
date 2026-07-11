import { describe, expect, it } from 'vitest'
import { gridStateForIndex, networkNodePosition, type PreviewSpec } from './SimulationPreview'

const SCHELLING_SPEC: PreviewSpec = {
  kind: 'grid',
  modelId: 'schelling_segregation',
  palette: [
    { label: 'a', color: '#f00' },
    { label: 'b', color: '#00f' },
    { label: 'empty', color: '#000' },
  ],
  paletteLabels: ['a', 'b', 'empty'],
  visualCount: 3600,
  countLabel: '80 × 80',
  width: 80,
  height: 80,
  params: {},
}

const FIRE_SPEC: PreviewSpec = {
  kind: 'grid',
  modelId: 'wildfire',
  palette: [
    { label: 'fuel', color: '#0a0' },
    { label: 'burning', color: '#f30' },
    { label: 'burned', color: '#555' },
    { label: 'empty', color: '#000' },
  ],
  paletteLabels: ['fuel', 'burning', 'burned', 'empty'],
  visualCount: 40000,
  countLabel: '200 × 200',
  width: 200,
  height: 200,
  params: { fuel_density: 0.8 },
}

const COLS = 72
const ROWS = 42

function gridSignature(spec: PreviewSpec, seed: number, motif: number): string {
  const cells: string[] = []
  for (let index = 0; index < COLS * ROWS; index += 1) {
    cells.push(gridStateForIndex(spec, seed, index, COLS, ROWS, motif) ?? '.')
  }
  return cells.join('')
}

describe('SimulationPreview motif diversity', () => {
  it('produces a different grid arrangement for each of the four motifs', () => {
    const signatures = new Set([0, 1, 2, 3].map((motif) => gridSignature(FIRE_SPEC, 42, motif)))
    // All four motifs should reshape where fire concentrates -> four distinct snapshots.
    expect(signatures.size).toBe(4)
  })

  it('varies Schelling group geometry across motifs', () => {
    const signatures = new Set([0, 1, 2, 3].map((motif) => gridSignature(SCHELLING_SPEC, 7, motif)))
    expect(signatures.size).toBeGreaterThan(1)
  })

  it('is deterministic for a given seed + motif', () => {
    expect(gridSignature(FIRE_SPEC, 99, 2)).toBe(gridSignature(FIRE_SPEC, 99, 2))
  })

  it('places network nodes differently per motif', () => {
    const width = 360
    const height = 126
    const count = 80
    const layoutSignature = (motif: number) =>
      Array.from({ length: count }, (_, index) => {
        const { x, y } = networkNodePosition(motif, index, count, 42, width, height)
        return `${Math.round(x)},${Math.round(y)}`
      }).join('|')
    const signatures = new Set([0, 1, 2, 3].map(layoutSignature))
    expect(signatures.size).toBe(4)
    // Nodes must stay inside the canvas bounds.
    for (let motif = 0; motif < 4; motif += 1) {
      for (let index = 0; index < count; index += 1) {
        const { x, y } = networkNodePosition(motif, index, count, 42, width, height)
        expect(x).toBeGreaterThanOrEqual(-width * 0.2)
        expect(x).toBeLessThanOrEqual(width * 1.2)
        expect(y).toBeGreaterThanOrEqual(-height * 0.2)
        expect(y).toBeLessThanOrEqual(height * 1.2)
      }
    }
  })
})
