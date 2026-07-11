import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { AbmWorkbench } from './AbmWorkbench'
import { abmClient } from './api/abmClient'
import { useAbmStore } from './stores/abmStore'
import type { AbmSimulation } from './types'

vi.mock('./api/abmClient', () => ({
  abmClient: {
    getSimulation: vi.fn(),
    listProjects: vi.fn(),
    listSimulations: vi.fn(),
    createProject: vi.fn(),
    createSimulation: vi.fn(),
    getOdd: vi.fn(async () => ({ odd: null })),
  },
}))

vi.mock('./components/RunPanel', () => ({
  RunPanel: ({ simId }: { simId: string | null }) => <div data-testid="run-panel">{simId ?? 'no-sim'}</div>,
}))

vi.mock('./components/ExperimentCanvas', () => ({
  ExperimentCanvas: ({ simId }: { simId: string | null }) => (
    <div data-testid="experiment-canvas">{simId ?? 'no-sim'}</div>
  ),
}))

vi.mock('./components/ExportDialog', () => ({
  ExportDialog: () => <div data-testid="export-dialog">导出</div>,
}))

vi.mock('./components/MetricChart', () => ({
  MetricChart: () => <div data-testid="metric-chart">曲线</div>,
}))

vi.mock('./components/ExplainInspector', () => ({
  ExplainInspector: () => <div data-testid="explain-inspector">explain</div>,
}))

vi.mock('./components/ModelContextPanel', () => ({
  ModelContextPanel: () => <div data-testid="model-context">模型上下文</div>,
}))

vi.mock('./components/SimulationCanvas', () => ({
  SimulationCanvas: () => <div data-testid="simulation-canvas">画布</div>,
}))

vi.mock('./components/SelectionInspector', () => ({
  SelectionInspector: () => <div data-testid="selection-inspector">选择</div>,
}))

vi.mock('./components/MechanismGraphPanel', () => ({
  MechanismGraphPanel: ({ simulation }: { simulation: AbmSimulation | null }) => (
    <div data-testid="mechanism-graph-panel">{simulation?.id ?? 'no-sim'}</div>
  ),
}))

vi.mock('./components/OddPanel', () => ({
  OddPanel: () => <div data-testid="odd-panel">ODD</div>,
}))

vi.mock('./components/SimulationManagerPanel', () => ({
  SimulationManagerPanel: ({ activeProjectId, activeSimId }: { activeProjectId: string | null; activeSimId: string | null }) => (
    <div data-testid="simulation-manager-panel">{activeProjectId}:{activeSimId}</div>
  ),
}))

vi.mock('./components/AgentTablePanel', () => ({
  AgentTablePanel: ({ simulation }: { simulation: AbmSimulation | null }) => (
    <div data-testid="agent-table-panel">{simulation?.id ?? 'no-sim'}</div>
  ),
}))

const simulation: AbmSimulation = {
  id: 'sim-1',
  projectId: 'project-1',
  name: '谢林隔离模型',
  modelVersion: '1',
  config: { id: 'schelling' },
  interface: { seed: 42, steps: 50, params: {} },
  createdAt: '2026-01-01T00:00:00.000Z',
  schemaVersion: 1,
}

const otherSimulation: AbmSimulation = {
  ...simulation,
  id: 'sim-2',
  projectId: 'project-2',
  name: '目录二的仿真',
}

describe('AbmWorkbench', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    useAbmStore.setState({
      runs: {},
      activeRunId: null,
      experiments: {},
      activeExperimentId: null,
      activeProjectId: 'project-1',
      activeSimId: 'sim-1',
      mode: 'research',
      panelOpen: true,
      viewRequest: null,
      experimentViews: {},
      explainFocus: null,
    })
    vi.mocked(abmClient.getSimulation).mockImplementation(async (simId) =>
      simId === 'sim-2' ? otherSimulation : simulation,
    )
    vi.mocked(abmClient.listProjects).mockResolvedValue({
      projects: [{
        id: 'project-1',
        name: '研究问题',
        researchQuestion: '谣言传播',
        createdAt: '2026-01-01T00:00:00.000Z',
        schemaVersion: 1,
      }],
    })
    vi.mocked(abmClient.listSimulations).mockResolvedValue({ simulations: [simulation] })
    vi.mocked(abmClient.createSimulation).mockResolvedValue(simulation)
    vi.mocked(abmClient.createProject).mockResolvedValue({
      id: 'project-2',
      name: 'research-two',
      researchQuestion: '研究问题：research-two',
      createdAt: '2026-01-01T00:00:00.000Z',
      schemaVersion: 1,
    })
  })

  it('splits the simulation workbench into research-oriented top views', async () => {
    render(<AbmWorkbench embedded />)

    expect(await screen.findByTestId('abm-workbench-view-run')).toHaveTextContent('Run Canvas')
    expect(screen.getByTestId('abm-workbench-view-results')).toHaveTextContent('Deep Experiment')
    expect(screen.getByTestId('abm-workbench-view-model')).toHaveTextContent('Mechanism Graph')
    expect(screen.getByTestId('abm-workbench-view-agents')).toHaveTextContent('Agents')
    expect(screen.getByTestId('abm-workbench-view-odd')).toHaveTextContent('ODD Protocol')
    expect(screen.getByTestId('abm-workbench-view-simulations')).toHaveTextContent('Simulation Management')

    await waitFor(() => {
      expect(screen.getByTestId('simulation-canvas')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('model-context')).not.toBeInTheDocument()
    expect(screen.queryByTestId('selection-inspector')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('abm-workbench-view-model'))
    expect(await screen.findByTestId('mechanism-graph-panel')).toHaveTextContent('sim-1')

    fireEvent.click(screen.getByTestId('abm-workbench-view-simulations'))
    expect(await screen.findByTestId('simulation-manager-panel')).toHaveTextContent('project-1:sim-1')

    fireEvent.click(screen.getByTestId('abm-workbench-view-results'))
    expect(await screen.findByTestId('experiment-canvas')).toHaveTextContent('sim-1')

    fireEvent.click(screen.getByTestId('abm-workbench-view-agents'))
    expect(await screen.findByTestId('agent-table-panel')).toHaveTextContent('sim-1')
  })

  it('focuses the view requested by chat tools (abm_control_workbench)', async () => {
    render(<AbmWorkbench embedded />)
    await screen.findByTestId('abm-workbench-view-run')

    act(() => {
      useAbmStore.getState().requestView('results')
    })
    expect(await screen.findByTestId('experiment-canvas')).toBeInTheDocument()
  })

  it('keeps the run result canvas full-width until mechanism attribution is explicitly opened', async () => {
    render(<AbmWorkbench embedded />)

    expect(await screen.findByTestId('metric-chart')).toBeInTheDocument()
    expect(screen.queryByTestId('explain-inspector')).toBeNull()

    act(() => {
      useAbmStore.setState({
        activeRunId: 'run-1',
        explainFocus: { runId: 'run-1', metric: 'infected', from: 0, to: 10 },
      })
    })

    expect(await screen.findByTestId('explain-inspector')).toBeInTheDocument()
  })

  it('opens an existing simulation when no active simulation is bound', async () => {
    useAbmStore.setState({
      activeProjectId: 'project-1',
      activeSimId: null,
      panelOpen: true,
    })

    render(<AbmWorkbench embedded />)

    await waitFor(() => {
      expect(abmClient.listSimulations).toHaveBeenCalledWith('project-1')
    })
    expect(await screen.findByTestId('run-panel')).toHaveTextContent('sim-1')
    expect(useAbmStore.getState().activeSimId).toBe('sim-1')
  })

  it('opens simulation management when the embedded workbench has no simulation yet', async () => {
    useAbmStore.setState({
      activeProjectId: 'project-1',
      activeSimId: null,
      panelOpen: true,
    })
    vi.mocked(abmClient.listSimulations).mockResolvedValue({ simulations: [] })

    render(<AbmWorkbench embedded />)

    await waitFor(() => {
      expect(abmClient.listSimulations).toHaveBeenCalledWith('project-1')
    })
    expect(abmClient.createSimulation).not.toHaveBeenCalled()
    expect(await screen.findByTestId('simulation-manager-panel')).toBeInTheDocument()
    expect(useAbmStore.getState().activeSimId).toBeNull()
  })

  it('does not create a default simulation when opening the simulation manager for an empty project', async () => {
    useAbmStore.setState({
      activeProjectId: 'project-1',
      activeSimId: null,
      panelOpen: true,
      viewRequest: { view: 'simulations', nonce: 1 },
    })
    vi.mocked(abmClient.listSimulations).mockResolvedValue({ simulations: [] })

    render(<AbmWorkbench embedded />)

    expect(await screen.findByTestId('simulation-manager-panel')).toHaveTextContent('project-1:')
    await waitFor(() => {
      expect(abmClient.listSimulations).toHaveBeenCalledWith('project-1')
    })
    expect(abmClient.createSimulation).not.toHaveBeenCalled()
  })

  it('binds the workbench simulations to the current working directory project', async () => {
    useAbmStore.setState({
      activeProjectId: 'project-1',
      activeSimId: 'sim-1',
      panelOpen: true,
    })
    vi.mocked(abmClient.getSimulation).mockImplementation(async (simId) =>
      simId === 'sim-2' ? otherSimulation : simulation,
    )
    vi.mocked(abmClient.listProjects).mockResolvedValue({ projects: [] })
    vi.mocked(abmClient.listSimulations).mockResolvedValue({ simulations: [otherSimulation] })

    render(<AbmWorkbench embedded workDir="C:\\Research\\research-two" />)

    await waitFor(() => {
      expect(abmClient.createProject).toHaveBeenCalledWith('research-two', '研究问题：research-two')
    })
    expect(abmClient.listSimulations).toHaveBeenCalledWith('project-2')
    expect(await screen.findByTestId('run-panel')).toHaveTextContent('sim-2')
    expect(useAbmStore.getState().activeProjectId).toBe('project-2')
    expect(useAbmStore.getState().activeSimId).toBe('sim-2')
  })
})
