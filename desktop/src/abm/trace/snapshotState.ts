/**
 * Convert a JSON `space_snapshot` (from the trace file) into the same palette-
 * index Uint8Array the live binary frames carry, so trace replay reuses the
 * exact renderers. Mirrors the kernel's grid_states/points_states ordering
 * (packages/abm-kernel/src/abm_kernel/space_binary.py).
 */

import { EMPTY_STATE } from '../canvas/frameFormat'
import type { AbmMeta } from '../types'

interface GridCellRecord {
  x: number
  y: number
  state?: string | null
}

interface NodeRecord {
  id?: unknown
  state?: string | null
}

export interface SpaceSnapshot {
  space: 'grid' | 'network'
  payload: {
    width?: number
    height?: number
    cells?: GridCellRecord[]
    nodes?: NodeRecord[]
  }
}

export function snapshotToState(snapshot: SpaceSnapshot, meta: AbmMeta): Uint8Array {
  const index = new Map<string, number>()
  meta.palette.forEach((state, i) => index.set(state, i))
  const toIndex = (state: string | null | undefined): number =>
    state == null ? EMPTY_STATE : index.get(String(state)) ?? EMPTY_STATE

  if (snapshot.space === 'grid' && meta.grid) {
    const { width, height } = meta.grid
    const out = new Uint8Array(width * height).fill(EMPTY_STATE)
    for (const cell of snapshot.payload.cells ?? []) {
      const x = Math.trunc(cell.x)
      const y = Math.trunc(cell.y)
      if (x >= 0 && x < width && y >= 0 && y < height) out[y * width + x] = toIndex(cell.state)
    }
    return out
  }

  const nodes = snapshot.payload.nodes ?? []
  const out = new Uint8Array(nodes.length)
  for (let i = 0; i < nodes.length; i++) out[i] = toIndex(nodes[i]!.state)
  return out
}
