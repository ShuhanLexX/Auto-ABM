import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ExperimentCanvas } from './ExperimentCanvas'
import { useAbmStore } from '../stores/abmStore'

vi.mock('../api/abmClient', () => ({
  abmClient: {
    resolveViz: vi.fn(),
    startExperiment: vi.fn(async () => ({ experimentId: 'exp-1' })),
    stopExperiment: vi.fn(async () => ({ ok: true })),
    exportSimulation: vi.fn(),
  },
}))

vi.mock('../api/abmSocket', () => ({
  abmSocket: { connect: vi.fn(() => () => {}) },
}))

describe('ExperimentCanvas', () => {
  beforeEach(() => {
    useAbmStore.setState({
      runs: {},
      activeRunId: null,
      experiments: {},
      activeExperimentId: null,
      mode: 'research',
      experimentViews: {},
      activeSimId: 'sim-1',
      simulationRefresh: null,
    })
  })

  it('renders the default view with a sweep design and AI hint', () => {
    render(
      <ExperimentCanvas
        simId="sim-1"
        parameters={[
          { id: 'fuel_density', label: '燃料密度', value: 0.72, min: 0.1, max: 1, step: 0.01, declared: true },
        ]}
      />,
    )
    expect(screen.getByText('Deep Experiment')).toBeInTheDocument()
    expect(screen.getByText('Batch Design')).toBeInTheDocument()
    expect(screen.getByTestId('experiment-canvas-run')).toBeInTheDocument()
    // Default (no AI spec yet) shows the generative-UI hint.
    expect(screen.getByText(/Default experiment view/)).toBeInTheDocument()
  })

  it('renders an AI-generated experiment view spec (generative UI)', () => {
    useAbmStore.getState().setExperimentView('sim-1', {
      title: '燃料密度敏感性',
      intent: 'sensitivity',
      charts: [
        { id: 'c1', title: '燃尽比例 vs 燃料密度', type: 'bar', metrics: ['burned_rate'], xAxis: 'parameter' },
      ],
      controls: [
        { id: 'fuel_density', label: '燃料密度', kind: 'slider', min: 0.1, max: 1, step: 0.05, role: 'sweep', values: [0.4, 0.6, 0.8] },
      ],
      experiment: { parameter: 'fuel_density', values: [0.4, 0.6, 0.8], replications: 3, steps: 80 },
    })

    render(<ExperimentCanvas simId="sim-1" parameters={[]} />)

    expect(screen.getByText('燃料密度敏感性')).toBeInTheDocument()
    expect(screen.getByText('燃尽比例 vs 燃料密度')).toBeInTheDocument()
    // Sweep values from the AI design are pre-filled (both in the sweep
    // control chip and the batch design field).
    expect(screen.getAllByDisplayValue('0.4, 0.6, 0.8').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Default experiment view/)).not.toBeInTheDocument()
  })

  it('blocks running an experiment in read-only dialogue mode', async () => {
    useAbmStore.setState({ mode: 'dialogue' })
    render(<ExperimentCanvas simId="sim-1" parameters={[]} />)

    const button = screen.getByTestId('experiment-canvas-run')
    expect(button).toBeDisabled()
    fireEvent.click(button)
    const { abmClient } = await import('../api/abmClient')
    expect(abmClient.startExperiment).not.toHaveBeenCalled()
  })

  it('can stop a running deep experiment', async () => {
    useAbmStore.setState({
      activeExperimentId: 'exp-1',
      experiments: {
        'exp-1': { status: 'running', total: 10, progress: [] },
      },
    })
    render(<ExperimentCanvas simId="sim-1" parameters={[]} />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('experiment-canvas-stop'))
    })

    const { abmClient } = await import('../api/abmClient')
    await waitFor(() => expect(abmClient.stopExperiment).toHaveBeenCalledWith('exp-1'))
  })

  it('runs an intervention as a baseline run plus a scheduled-change run', async () => {
    // Stub startRun so the paired runInterventionExperiment resolves without a
    // real kernel: each call registers a completed run so waitForRun returns.
    const startRun = vi.fn(async (_simId: string, _body?: unknown) => {
      const id = `run-${startRun.mock.calls.length}`
      useAbmStore.setState((s) => ({
        runs: {
          ...s.runs,
          [id]: { state: 'completed', ticks: [{ tick: 0, metrics: { infected: 1 } }] },
        },
      }))
      return id
    })
    useAbmStore.setState({ startRun })

    render(
      <ExperimentCanvas
        simId="sim-1"
        parameters={[
          { id: 'beta', label: 'Transmission', value: 0.3, min: 0, max: 1, step: 0.01, declared: true },
        ]}
      />,
    )

    // Metric select needs at least one metric; seed one via the active run.
    act(() => {
      useAbmStore.setState({
        activeRunId: 'seed',
        runs: { seed: { state: 'completed', ticks: [{ tick: 0, metrics: { infected: 0.1 } }] } },
      })
    })

    const runButton = await screen.findByTestId('experiment-intervention-run')
    await act(async () => {
      fireEvent.click(runButton)
    })

    await waitFor(() => expect(startRun).toHaveBeenCalledTimes(2))
    const baseBody = startRun.mock.calls[0]![1] as Record<string, unknown>
    const treatedBody = startRun.mock.calls[1]![1] as Record<string, unknown>
    expect(baseBody.interventions).toBeUndefined()
    expect(Array.isArray(treatedBody.interventions)).toBe(true)
    const interventions = treatedBody.interventions as Array<Record<string, unknown>>
    expect(interventions[0]!.at_tick).toBeGreaterThanOrEqual(1)
    expect(interventions[0]!.params).toHaveProperty('beta')
    await waitFor(() => expect(useAbmStore.getState().interventionRun?.status).toBe('completed'))
  })
})
