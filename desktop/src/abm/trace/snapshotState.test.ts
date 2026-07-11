import { describe, expect, it } from 'vitest'
import { snapshotToState } from './snapshotState'
import { EMPTY_STATE } from '../canvas/frameFormat'
import type { AbmMeta } from '../types'

const GRID_META: AbmMeta = {
  space: 'grid',
  palette: ['I', 'R', 'S'],
  grid: { width: 3, height: 2 },
}

const NETWORK_META: AbmMeta = {
  space: 'network',
  palette: ['I', 'S'],
  network: { count: 3, edgeCount: 0, layoutB64: '', edgesB64: '' },
}

describe('snapshotToState (grid)', () => {
  it('maps cells to palette indices row-major and leaves gaps empty', () => {
    const state = snapshotToState(
      {
        space: 'grid',
        payload: {
          cells: [
            { x: 0, y: 0, state: 'S' },
            { x: 2, y: 1, state: 'I' },
          ],
        },
      },
      GRID_META,
    )
    // width*height = 6; (0,0)->S=2, (2,1)->index 5 ->I=0, rest empty
    expect(state.length).toBe(6)
    expect(state[0]).toBe(2)
    expect(state[5]).toBe(0)
    expect(state[1]).toBe(EMPTY_STATE)
  })

  it('uses EMPTY_STATE for unknown state labels', () => {
    const state = snapshotToState(
      { space: 'grid', payload: { cells: [{ x: 1, y: 0, state: 'ZZZ' }] } },
      GRID_META,
    )
    expect(state[1]).toBe(EMPTY_STATE)
  })
})

describe('snapshotToState (network)', () => {
  it('maps node states in array order', () => {
    const state = snapshotToState(
      {
        space: 'network',
        payload: { nodes: [{ state: 'S' }, { state: 'I' }, { state: null }] },
      },
      NETWORK_META,
    )
    expect(Array.from(state)).toEqual([1, 0, EMPTY_STATE])
  })
})
