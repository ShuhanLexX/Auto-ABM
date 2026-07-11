import { describe, expect, it } from 'vitest'
import { PointsGLRenderer } from './PointsGLRenderer'

// jsdom has no WebGL2, so getContext returns null: the renderer degrades to
// ok=false but still builds its adjacency + highlight bookkeeping on the CPU,
// which is what these tests exercise (no GPU needed).
function makeRenderer(edges: number[], nodeCount: number): PointsGLRenderer {
  const canvas = document.createElement('canvas')
  canvas.getContext = (() => null) as unknown as HTMLCanvasElement['getContext']
  const layout = new Float32Array(nodeCount * 2).fill(0.5)
  return new PointsGLRenderer(canvas, layout, new Uint32Array(edges), 4)
}

describe('PointsGLRenderer selection highlight', () => {
  it('reports undirected neighbors of a node', () => {
    // edges: 0-1, 1-2, 0-3
    const renderer = makeRenderer([0, 1, 1, 2, 0, 3], 4)
    expect([...renderer.neighborsOf(0)].sort()).toEqual([1, 3])
    expect([...renderer.neighborsOf(1)].sort()).toEqual([0, 2])
    expect(renderer.neighborsOf(2)).toEqual([1])
    expect(renderer.neighborsOf(3)).toEqual([0])
  })

  it('dedupes repeated edges and ignores self-loops / out-of-range endpoints', () => {
    const renderer = makeRenderer([0, 1, 0, 1, 2, 2, 0, 9], 3)
    expect(renderer.neighborsOf(0)).toEqual([1])
    expect(renderer.neighborsOf(2)).toEqual([])
  })

  it('setHighlight is safe without a GL context (selected/cleared/out-of-range)', () => {
    const renderer = makeRenderer([0, 1], 2)
    expect(renderer.ok).toBe(false)
    expect(() => renderer.setHighlight(0)).not.toThrow()
    expect(() => renderer.setHighlight(null)).not.toThrow()
    expect(() => renderer.setHighlight(999)).not.toThrow()
  })
})
