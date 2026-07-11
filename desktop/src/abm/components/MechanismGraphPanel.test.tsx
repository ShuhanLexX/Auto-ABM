import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MechanismGraphPanel } from './MechanismGraphPanel'
import { useAbmStore } from '../stores/abmStore'
import { useSelectionStore } from '../stores/selectionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { AbmSimulation, MechanismGraph } from '../types'

const getMechanismGraph = vi.fn()
const getMechanismActivity = vi.fn()
const getAttribution = vi.fn()

vi.mock('../api/abmClient', () => ({
  abmClient: {
    getMechanismGraph: (...args: unknown[]) => getMechanismGraph(...args),
    getMechanismActivity: (...args: unknown[]) => getMechanismActivity(...args),
    getAttribution: (...args: unknown[]) => getAttribution(...args),
  },
}))

vi.mock('./MiniExplainPopover', () => ({
  MiniExplainPopover: ({ open, target }: { open: boolean; target: { subject?: string } | null }) =>
    open ? <div data-testid="graph-mini-explain">{target?.subject}</div> : null,
}))

function makeSimulation(): AbmSimulation {
  return {
    id: 'sim-1',
    projectId: 'project-1',
    name: 'Rumor',
    modelVersion: '1',
    config: {
      id: 'rumor',
      version: '1',
      agents: [{
        id: 'person',
        name: '个体',
        state_variables: [{ name: 'state', dtype: 'categorical', default: 'susceptible', choices: ['susceptible', 'infected'] }],
        behavior_refs: ['spread'],
      }],
      mechanisms: [{ id: 'spread', name: '传播', trigger: '接触且 beta 命中', effect: '变为 infected' }],
      parameters: [{ id: 'beta', name: 'beta', dtype: 'float', default: 0.3 }],
      observers: [{ id: 'infected', name: '感染人数', level: 'macro', dtype: 'int' }],
    },
    interface: { seed: 1, steps: 50, params: { beta: 0.3 } },
    createdAt: '2026-01-01',
    schemaVersion: 1,
  }
}

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

describe('MechanismGraphPanel', () => {
  beforeEach(() => {
    cleanup()
    getMechanismGraph.mockReset()
    getMechanismActivity.mockReset()
    getAttribution.mockReset()
    useSettingsStore.setState({ locale: 'en' })
    useSelectionStore.setState({ selection: null, replay: null, evidenceFocus: null })
    useAbmStore.setState({
      runs: {},
      activeRunId: null,
      explainFocus: null,
      viewRequest: null,
      panelOpen: true,
    })
  })

  it('renders the kernel-derived DAG with typed nodes and edges', async () => {
    getMechanismGraph.mockResolvedValue(makeGraph())
    render(<MechanismGraphPanel simulation={makeSimulation()} />)

    await waitFor(() => expect(screen.getByTestId('mechanism-graph')).toBeInTheDocument())
    expect(getMechanismGraph).toHaveBeenCalledWith('sim-1')
    expect(screen.getAllByTestId('graph-node')).toHaveLength(5)
    expect(screen.getAllByTestId('graph-edge')).toHaveLength(5)
    const relations = screen.getAllByTestId('graph-edge').map((el) => el.getAttribute('data-relation'))
    expect(relations).toContain('controls')
    expect(relations).toContain('observed')
  })

  it('accepts the wrapped server graph response shape', async () => {
    getMechanismGraph.mockResolvedValue({ graph: makeGraph() })
    render(<MechanismGraphPanel simulation={makeSimulation()} />)

    await waitFor(() => expect(screen.getByTestId('mechanism-graph')).toBeInTheDocument())
    expect(screen.getAllByTestId('graph-node')).toHaveLength(5)
  })

  it('shows node details and mechanism trigger/effect from the config', async () => {
    getMechanismGraph.mockResolvedValue(makeGraph())
    render(<MechanismGraphPanel simulation={makeSimulation()} />)
    await waitFor(() => expect(screen.getByTestId('mechanism-graph')).toBeInTheDocument())

    expect(screen.queryByTestId('graph-node-detail')).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByTestId('graph-node').find((el) => el.getAttribute('data-kind') === 'mechanism')!)
    expect(screen.getByTestId('graph-node-detail')).toHaveTextContent('Trigger')
    expect(screen.getByTestId('graph-node-detail')).toHaveTextContent('Each tick through network contacts')

    // Selecting the state variable node swaps the sidebar to state details.
    fireEvent.click(screen.getAllByTestId('graph-node').find((el) => el.getAttribute('data-kind') === 'state_variable')!)
    expect(screen.getByTestId('graph-node-detail')).toHaveTextContent('Choices')
    expect(screen.getByTestId('graph-node-detail')).toHaveTextContent('susceptible / infected')
  })

  it('overlays firing heat from the completed run trace', async () => {
    getMechanismGraph.mockResolvedValue(makeGraph())
    getMechanismActivity.mockResolvedValue({
      runId: 'run-1',
      from: 0,
      to: 50,
      bucketSize: 1,
      mechanisms: [
        { mechanism_id: 'spread', total: 42, agents: 17, firstTick: 1, lastTick: 40, series: [{ tick: 1, count: 5 }, { tick: 2, count: 8 }] },
      ],
    })
    useAbmStore.setState({
      activeRunId: 'run-1',
      runs: { 'run-1': { state: 'completed', ticks: [{ tick: 50, metrics: { infected: 30 } }] } },
    })

    render(<MechanismGraphPanel simulation={makeSimulation()} />)
    await waitFor(() => expect(screen.getByTestId('graph-node-heat')).toBeInTheDocument())
    expect(getMechanismActivity).toHaveBeenCalledWith('run-1', undefined)
    expect(screen.getByTestId('graph-node-heat')).toHaveTextContent('42')
    fireEvent.click(screen.getAllByTestId('graph-node').find((el) => el.getAttribute('data-kind') === 'mechanism')!)
    expect(screen.getByTestId('mechanism-activity-stats')).toHaveTextContent('42')
    expect(screen.getByTestId('mechanism-activity-stats')).toHaveTextContent('t1-40')
  })

  it('jumps to ODD with a mechanism evidence focus', async () => {
    getMechanismGraph.mockResolvedValue(makeGraph())
    useAbmStore.setState({
      activeRunId: 'run-1',
      runs: { 'run-1': { state: 'completed', ticks: [{ tick: 50, metrics: {} }] } },
    })
    getMechanismActivity.mockResolvedValue({ runId: 'run-1', from: 0, to: 50, bucketSize: 1, mechanisms: [] })

    render(<MechanismGraphPanel simulation={makeSimulation()} />)
    await waitFor(() => expect(screen.getByTestId('mechanism-graph')).toBeInTheDocument())

    fireEvent.click(screen.getAllByTestId('graph-node').find((el) => el.getAttribute('data-kind') === 'mechanism')!)
    fireEvent.click(screen.getByTestId('graph-jump-odd'))
    expect(useAbmStore.getState().viewRequest?.view).toBe('odd')
    expect(useSelectionStore.getState().evidenceFocus).toMatchObject({
      runId: 'run-1',
      mechanism_id: 'spread',
    })
  })

  it('falls back to the simple mechanism chain when the kernel is unavailable', async () => {
    getMechanismGraph.mockRejectedValue(new Error('kernel down'))
    render(<MechanismGraphPanel simulation={makeSimulation()} />)

    await waitFor(() => expect(screen.getByText(/simplified mechanism chain/)).toBeInTheDocument())
    expect(screen.getByTestId('mechanism-node')).toHaveTextContent('Rumor Spread')

    // Retry refetches the kernel graph.
    getMechanismGraph.mockResolvedValue(makeGraph())
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }))
    await waitFor(() => expect(screen.getByTestId('mechanism-graph')).toBeInTheDocument())
  })

  it('renders an adoption hint without a simulation', () => {
    render(<MechanismGraphPanel simulation={null} />)
    expect(screen.getByText(/Adopt a simulation proposal/)).toBeInTheDocument()
  })

  it('falls back to the config mechanism chain when the graph response is empty', async () => {
    getMechanismGraph.mockResolvedValue(null)
    render(<MechanismGraphPanel simulation={makeSimulation()} />)

    await waitFor(() => expect(screen.getByText(/no derivable structure/i)).toBeInTheDocument())
    expect(screen.getAllByTestId('mechanism-node')[0]).toHaveTextContent('Rumor Spread')
  })

  it('overlays mechanism attribution when an explain focus is active', async () => {
    getMechanismGraph.mockResolvedValue(makeGraph())
    getMechanismActivity.mockResolvedValue({ runId: 'run-1', from: 5, to: 20, bucketSize: 1, mechanisms: [] })
    getAttribution.mockResolvedValue({
      runId: 'run-1',
      metric: 'infected',
      from: 5,
      to: 20,
      supported: true,
      actualDelta: 6,
      attributedNet: 6,
      residual: 0,
      coverage: 1,
      contributions: [{ mechanism_id: 'spread', gains: 6, losses: 0, net: 6, agents: 3 }],
    })
    useAbmStore.setState({
      activeRunId: 'run-1',
      explainFocus: { runId: 'run-1', metric: 'infected', from: 5, to: 20 },
      runs: { 'run-1': { state: 'completed', ticks: [{ tick: 20, metrics: { infected: 10 } }] } },
    })

    render(<MechanismGraphPanel simulation={makeSimulation()} />)
    await waitFor(() => expect(screen.getByTestId('graph-node-attribution')).toBeInTheDocument())
    expect(getAttribution).toHaveBeenCalledWith('run-1', 'infected', { from: 5, to: 20 })
    expect(screen.getByTestId('graph-node-attribution')).toHaveTextContent('+6')
  })

  it('highlights the causal upstream path when an observer is selected', async () => {
    getMechanismGraph.mockResolvedValue(makeGraph())
    render(<MechanismGraphPanel simulation={makeSimulation()} />)
    await waitFor(() => expect(screen.getByTestId('mechanism-graph')).toBeInTheDocument())

    fireEvent.click(screen.getAllByTestId('graph-node').find((el) => el.getAttribute('data-kind') === 'observer')!)
    const onPath = screen.getAllByTestId('graph-node').filter((el) => el.getAttribute('data-causal-path') === 'true')
    expect(onPath.length).toBeGreaterThan(2)
  })
})
