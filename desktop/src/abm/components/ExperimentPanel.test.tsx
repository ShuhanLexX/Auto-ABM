import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('../api/abmClient', () => ({
  abmClient: {
    startExperiment: vi.fn(),
    getExperiment: vi.fn(),
    resolveViz: vi.fn(),
  },
}))

vi.mock('../api/abmSocket', () => ({
  abmSocket: { connect: vi.fn(() => () => {}) },
}))

import { abmClient } from '../api/abmClient'
import { useAbmStore } from '../stores/abmStore'
import { ExperimentPanel } from './ExperimentPanel'
import type { ExperimentSummary, VizResolution } from '../types'

function summary(): ExperimentSummary {
  return {
    experiment: {
      id: 'e1',
      projectId: 'p1',
      simId: 's1',
      name: 'beta sweep',
      config: {
        id: 'e1',
        name: 'beta sweep',
        model_id: 'm',
        model_version: '1',
        design: { type: 'single_sweep', sweep: [{ parameter_id: 'beta', values: [0.1, 0.2] }] },
        replications: 1,
        base_seed: 1,
        steps: 5,
        collect_metrics: ['infected', 'recovered'],
      },
      status: 'completed',
      total: 2,
      runIds: ['r1', 'r2'],
      createdAt: 'now',
      schemaVersion: 1,
    },
    runs: [],
  }
}

function resolution(): VizResolution {
  return {
    spec: {
      chart: 'bar',
      data_ref: { source: 'experiment', id: 'e1' },
      encodings: [
        { field: 'beta', role: 'x' },
        { field: 'infected.final', role: 'y' },
      ],
    },
    data: {
      columns: ['beta', 'infected.final'],
      rows: [
        { beta: 0.1, 'infected.final': 0.3 },
        { beta: 0.2, 'infected.final': 0.6 },
      ],
    },
  }
}

describe('ExperimentPanel', () => {
  beforeEach(() => {
    useAbmStore.setState({ experiments: {}, activeExperimentId: null, mode: 'research' })
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
    useAbmStore.getState().reset()
  })

  it('starts a sweep with parsed numeric values', async () => {
    vi.mocked(abmClient.startExperiment).mockResolvedValue({ experimentId: 'e1' })
    render(<ExperimentPanel simId="s1" />)

    fireEvent.change(screen.getByPlaceholderText('e.g. beta'), { target: { value: 'beta' } })
    fireEvent.change(screen.getByPlaceholderText('0.05, 0.1, 0.2'), { target: { value: '0.1, 0.2' } })
    fireEvent.click(screen.getByText('Run Sweep'))

    await waitFor(() =>
      expect(abmClient.startExperiment).toHaveBeenCalledWith('s1', expect.objectContaining({
        parameter: 'beta',
        values: [0.1, 0.2],
      })),
    )
  })

  it('blocks running in dialogue (read-only) mode', () => {
    useAbmStore.setState({ mode: 'dialogue' })
    render(<ExperimentPanel simId="s1" />)
    fireEvent.change(screen.getByPlaceholderText('e.g. beta'), { target: { value: 'beta' } })
    fireEvent.change(screen.getByPlaceholderText('0.05, 0.1, 0.2'), { target: { value: '0.1' } })
    // Button is disabled in dialogue mode; clicking does nothing.
    fireEvent.click(screen.getByText('Run Sweep'))
    expect(abmClient.startExperiment).not.toHaveBeenCalled()
  })

  it('accumulates progress and flags failed runs', () => {
    useAbmStore.setState({ activeExperimentId: 'e1' })
    render(<ExperimentPanel simId="s1" />)

    act(() => {
      const ingest = useAbmStore.getState().ingest
      ingest({ type: 'abm_experiment_status', experimentId: 'e1', status: 'running', total: 4 })
      ingest({ type: 'abm_experiment_progress', experimentId: 'e1', index: 0, total: 4, runId: 'r0', state: 'completed' })
      ingest({ type: 'abm_experiment_progress', experimentId: 'e1', index: 1, total: 4, runId: 'r1', state: 'failed' })
    })

    expect(screen.getByTestId('experiment-progress').textContent).toContain('2 / 4')
    expect(screen.getByTestId('experiment-failed')).toBeTruthy()
  })

  it('renders a results chart from real resolved run data on completion', async () => {
    vi.mocked(abmClient.getExperiment).mockResolvedValue(summary())
    vi.mocked(abmClient.resolveViz).mockResolvedValue(resolution())

    // Pretend this panel started experiment e1 sweeping beta.
    useAbmStore.setState({ activeExperimentId: 'e1' })
    render(<ExperimentPanel simId="s1" />)
    fireEvent.change(screen.getByPlaceholderText('e.g. beta'), { target: { value: 'beta' } })

    act(() => {
      useAbmStore.getState().ingest({
        type: 'abm_experiment_status',
        experimentId: 'e1',
        status: 'completed',
        total: 2,
      })
    })

    await waitFor(() => expect(screen.getByTestId('results-chart')).toBeTruthy())
    expect(abmClient.resolveViz).toHaveBeenCalled()
    expect(screen.getAllByTestId('results-bar')).toHaveLength(2)
  })
})
