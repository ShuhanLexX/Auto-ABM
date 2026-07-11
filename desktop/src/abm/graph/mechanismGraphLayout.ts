/**
 * Deterministic layered layout for the kernel-derived MechanismGraph.
 *
 * Layers follow the causal reading direction of the model
 * (data-contracts §16): parameters → agent types → mechanisms → state
 * variables → observers. Every edge in the kernel graph flows top-to-bottom
 * in this ordering, so a layered layout renders the graph as a clean DAG
 * without generic force-directed wobble — the same model always produces the
 * same picture, which matters for reproducible figures.
 */

import type {
  GraphNodeKind,
  MechanismGraph,
  MechanismGraphEdge,
  MechanismGraphNode,
} from '../types'

export const NODE_WIDTH = 172
export const NODE_HEIGHT = 54
const LAYER_GAP = 72
const NODE_GAP = 22
const MARGIN_X = 24
const MARGIN_Y = 28

/** Canonical causal column order; absent kinds collapse. */
export const KIND_ORDER: readonly GraphNodeKind[] = [
  'parameter',
  'agent_type',
  'mechanism',
  'state_variable',
  'observer',
]

export const KIND_LABELS: Record<GraphNodeKind, string> = {
  parameter: '参数',
  agent_type: '智能体',
  mechanism: '机制',
  state_variable: '状态变量',
  observer: '观测指标',
}

export interface PositionedNode {
  node: MechanismGraphNode
  x: number
  y: number
  column: number
}

export interface PositionedEdge {
  edge: MechanismGraphEdge
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface ColumnHeader {
  kind: GraphNodeKind
  label: string
  x: number
  y: number
  count: number
}

export interface GraphLayout {
  width: number
  height: number
  nodes: PositionedNode[]
  edges: PositionedEdge[]
  columns: ColumnHeader[]
}

/**
 * One barycenter pass, left to right: order each column by the mean row of
 * its already-placed neighbours so related nodes line up (e.g. a state
 * variable sits near the mechanisms writing it). Stable sort keeps the
 * result deterministic for equal barycenters.
 */
function orderColumn(
  nodes: MechanismGraphNode[],
  placedRow: Map<string, number>,
  neighbours: Map<string, string[]>,
): MechanismGraphNode[] {
  const scored = nodes.map((node, index) => {
    const rows = (neighbours.get(node.id) ?? [])
      .map((id) => placedRow.get(id))
      .filter((row): row is number => row !== undefined)
    const bary = rows.length > 0 ? rows.reduce((s, r) => s + r, 0) / rows.length : index
    return { node, bary, index }
  })
  scored.sort((a, b) => a.bary - b.bary || a.index - b.index)
  return scored.map((s) => s.node)
}

export function layoutMechanismGraph(graph: MechanismGraph): GraphLayout {
  const byKind = new Map<GraphNodeKind, MechanismGraphNode[]>()
  for (const node of graph.nodes) {
    const list = byKind.get(node.kind) ?? []
    list.push(node)
    byKind.set(node.kind, list)
  }
  const presentKinds = KIND_ORDER.filter((kind) => (byKind.get(kind)?.length ?? 0) > 0)

  // Undirected adjacency for the barycenter ordering.
  const neighbours = new Map<string, string[]>()
  for (const edge of graph.edges) {
    neighbours.set(edge.source, [...(neighbours.get(edge.source) ?? []), edge.target])
    neighbours.set(edge.target, [...(neighbours.get(edge.target) ?? []), edge.source])
  }

  const widest = Math.max(1, ...presentKinds.map((kind) => byKind.get(kind)!.length))
  const width = MARGIN_X * 2 + widest * NODE_WIDTH + (widest - 1) * NODE_GAP
  const height = MARGIN_Y * 2 + 24 + presentKinds.length * NODE_HEIGHT + (presentKinds.length - 1) * LAYER_GAP

  const positioned = new Map<string, PositionedNode>()
  const placedRow = new Map<string, number>()
  const columns: ColumnHeader[] = []

  presentKinds.forEach((kind, columnIndex) => {
    const ordered = orderColumn(byKind.get(kind)!, placedRow, neighbours)
    const y = MARGIN_Y + 24 + columnIndex * (NODE_HEIGHT + LAYER_GAP)
    const layerWidth = ordered.length * NODE_WIDTH + (ordered.length - 1) * NODE_GAP
    const xStart = MARGIN_X + Math.max(0, (width - MARGIN_X * 2 - layerWidth) / 2)
    ordered.forEach((node, row) => {
      placedRow.set(node.id, row)
      positioned.set(node.id, {
        node,
        x: xStart + row * (NODE_WIDTH + NODE_GAP),
        y,
        column: columnIndex,
      })
    })
    columns.push({ kind, label: KIND_LABELS[kind], x: width / 2, y: y - 10, count: ordered.length })
  })

  const edges: PositionedEdge[] = []
  for (const edge of graph.edges) {
    const source = positioned.get(edge.source)
    const target = positioned.get(edge.target)
    if (!source || !target) continue
    edges.push({
      edge,
      x1: source.x + NODE_WIDTH / 2,
      y1: source.y + NODE_HEIGHT,
      x2: target.x + NODE_WIDTH / 2,
      y2: target.y,
    })
  }

  return {
    width,
    height,
    nodes: [...positioned.values()],
    edges,
    columns,
  }
}

/** Cubic bezier path for a top-to-bottom layered edge. */
export function edgePath(edge: PositionedEdge): string {
  const dy = Math.max(32, (edge.y2 - edge.y1) / 2)
  return `M ${edge.x1} ${edge.y1} C ${edge.x1} ${edge.y1 + dy}, ${edge.x2} ${edge.y2 - dy}, ${edge.x2} ${edge.y2}`
}

export type CausalDirection = 'upstream' | 'downstream' | 'both'

/**
 * Collect node ids on causal paths through the kernel DAG. Upstream walks
 * against edge direction (sources of incoming edges); downstream follows
 * outgoing edges. Used to highlight the full parameter→mechanism→metric chain
 * when the user selects an observer or mechanism on the graph.
 */
export function collectCausalNeighborhood(
  graph: MechanismGraph,
  rootId: string,
  direction: CausalDirection = 'both',
): Set<string> {
  const upstream = new Map<string, string[]>()
  const downstream = new Map<string, string[]>()
  for (const edge of graph.edges) {
    upstream.set(edge.target, [...(upstream.get(edge.target) ?? []), edge.source])
    downstream.set(edge.source, [...(downstream.get(edge.source) ?? []), edge.target])
  }

  const visit = (start: string, adjacency: Map<string, string[]>): Set<string> => {
    const seen = new Set<string>([start])
    const queue = [start]
    while (queue.length > 0) {
      const id = queue.shift()!
      for (const next of adjacency.get(id) ?? []) {
        if (seen.has(next)) continue
        seen.add(next)
        queue.push(next)
      }
    }
    return seen
  }

  const result = new Set<string>([rootId])
  if (direction === 'upstream' || direction === 'both') {
    for (const id of visit(rootId, upstream)) result.add(id)
  }
  if (direction === 'downstream' || direction === 'both') {
    for (const id of visit(rootId, downstream)) result.add(id)
  }
  return result
}
