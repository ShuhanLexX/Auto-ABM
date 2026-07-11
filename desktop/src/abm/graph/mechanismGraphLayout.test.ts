import { describe, expect, it } from 'vitest'
import type { MechanismGraph } from '../types'
import { collectCausalNeighborhood, edgePath, layoutMechanismGraph, NODE_WIDTH } from './mechanismGraphLayout'

function makeGraph(): MechanismGraph {
  return {
    schema_version: '1',
    model_id: 'rumor',
    model_version: '1',
    generated_at: '2026-01-01T00:00:00Z',
    nodes: [
      { id: 'agent:person', kind: 'agent_type', label: '个体', ref_id: 'person', description: '' },
      { id: 'state:person.state', kind: 'state_variable', label: 'state', ref_id: 'person.state', description: '' },
      { id: 'mechanism:spread', kind: 'mechanism', label: '传播', ref_id: 'spread', description: '' },
      { id: 'mechanism:recover', kind: 'mechanism', label: '恢复', ref_id: 'recover', description: '' },
      { id: 'param:beta', kind: 'parameter', label: 'beta', ref_id: 'beta', description: '' },
      { id: 'observer:infected', kind: 'observer', label: '感染人数', ref_id: 'infected', description: '' },
    ],
    edges: [
      { source: 'agent:person', target: 'state:person.state', kind: 'structural', relation: 'has_state' },
      { source: 'agent:person', target: 'mechanism:spread', kind: 'structural', relation: 'runs' },
      { source: 'param:beta', target: 'mechanism:spread', kind: 'reference', relation: 'controls' },
      { source: 'mechanism:spread', target: 'state:person.state', kind: 'reference', relation: 'writes' },
      { source: 'state:person.state', target: 'observer:infected', kind: 'reference', relation: 'observed' },
    ],
  }
}

describe('layoutMechanismGraph', () => {
  it('places every node and orders layers in the causal reading direction', () => {
    const layout = layoutMechanismGraph(makeGraph())
    expect(layout.nodes).toHaveLength(6)
    expect(layout.columns.map((c) => c.kind)).toEqual([
      'parameter',
      'agent_type',
      'mechanism',
      'state_variable',
      'observer',
    ])
    const ys = layout.columns.map((c) => c.y)
    expect([...ys].sort((a, b) => a - b)).toEqual(ys)
  })

  it('routes every kernel edge top-to-bottom (a DAG in reading order)', () => {
    const layout = layoutMechanismGraph(makeGraph())
    expect(layout.edges).toHaveLength(5)
    for (const edge of layout.edges) {
      expect(edge.y2).toBeGreaterThan(edge.y1)
    }
  })

  it('does not overlap nodes within a layer', () => {
    const layout = layoutMechanismGraph(makeGraph())
    const mechanisms = layout.nodes.filter((n) => n.node.kind === 'mechanism')
    expect(mechanisms).toHaveLength(2)
    const [a, b] = mechanisms
    expect(Math.abs(a!.x - b!.x)).toBeGreaterThan(0)
  })

  it('collapses absent kinds so the graph stays compact', () => {
    const graph = makeGraph()
    const withoutParams: MechanismGraph = {
      ...graph,
      nodes: graph.nodes.filter((n) => n.kind !== 'parameter'),
      edges: graph.edges.filter((e) => !e.source.startsWith('param:')),
    }
    const full = layoutMechanismGraph(graph)
    const compact = layoutMechanismGraph(withoutParams)
    expect(compact.columns).toHaveLength(4)
    expect(compact.height).toBeLessThan(full.height)
  })

  it('is deterministic for the same graph', () => {
    expect(layoutMechanismGraph(makeGraph())).toEqual(layoutMechanismGraph(makeGraph()))
  })

  it('drops edges whose endpoints are missing instead of crashing', () => {
    const graph = makeGraph()
    graph.edges.push({ source: 'mechanism:ghost', target: 'observer:infected', kind: 'reference', relation: 'observed' })
    const layout = layoutMechanismGraph(graph)
    expect(layout.edges).toHaveLength(5)
  })

  it('produces a bezier path spanning the edge endpoints', () => {
    const layout = layoutMechanismGraph(makeGraph())
    const path = edgePath(layout.edges[0]!)
    expect(path.startsWith(`M ${layout.edges[0]!.x1}`)).toBe(true)
    expect(path).toContain('C ')
  })

  it('keeps node width in sync with the renderer contract', () => {
    expect(NODE_WIDTH).toBeGreaterThan(100)
  })

  it('collectCausalNeighborhood traces upstream from an observer', () => {
    const graph = makeGraph()
    const path = collectCausalNeighborhood(graph, 'observer:infected', 'upstream')
    expect(path.has('observer:infected')).toBe(true)
    expect(path.has('mechanism:spread')).toBe(true)
    expect(path.has('param:beta')).toBe(true)
    expect(path.has('state:person.state')).toBe(true)
  })

  it('collectCausalNeighborhood traces downstream from a parameter', () => {
    const graph = makeGraph()
    const path = collectCausalNeighborhood(graph, 'param:beta', 'downstream')
    expect(path.has('param:beta')).toBe(true)
    expect(path.has('mechanism:spread')).toBe(true)
    expect(path.has('observer:infected')).toBe(true)
    expect(path.has('agent:person')).toBe(false)
  })
})
