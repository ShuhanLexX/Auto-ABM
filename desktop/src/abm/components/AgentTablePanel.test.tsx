import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { AgentTablePanel } from './AgentTablePanel'
import { useAbmStore } from '../stores/abmStore'
import type { AbmSimulation } from '../types'

const mocks = vi.hoisted(() => ({
  updateSimulation: vi.fn(),
}))

vi.mock('../api/abmClient', () => ({
  abmClient: {
    updateSimulation: mocks.updateSimulation,
  },
}))

const simulation: AbmSimulation = {
  id: 'sim-1',
  projectId: 'project-1',
  name: '意见传播模型',
  modelVersion: '1',
  config: {
    id: 'opinion',
    agents: [{
      id: 'person',
      name: '居民',
      stateVariables: [{
        name: 'legacy_state',
        dtype: 'categorical',
        choices: ['legacy'],
        default: 'legacy',
      }],
      state_variables: [{
        name: 'stance',
        dtype: 'categorical',
        choices: ['low', 'middle', 'high'],
        default: 'middle',
      }],
      behaviorRefs: ['legacy_behavior'],
      behavior_refs: ['bounded_confidence'],
    }],
    initialization: { agent_counts: { person: 120 } },
  },
  interface: { seed: 42, steps: 50, params: {} },
  createdAt: '2026-01-01T00:00:00.000Z',
  schemaVersion: 1,
}

describe('AgentTablePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAbmStore.setState({
      activeRunId: 'run-1',
      agentSnapshots: {
        'run-1': {
          runId: 'run-1',
          tick: 7,
          total: 3,
          palette: ['low', 'middle', 'high'],
          counts: { low: 1, middle: 1, high: 1 },
          rows: [
            { id: 0, type: 'agent', stateIndex: 0, stateLabel: 'low' },
            { id: 1, type: 'agent', stateIndex: 1, stateLabel: 'middle' },
            { id: 2, type: 'agent', stateIndex: 2, stateLabel: 'high' },
          ],
        },
      },
    })
    mocks.updateSimulation.mockResolvedValue(simulation)
  })

  afterEach(cleanup)

  it('shows live agent rows and saves per-agent overrides without changing macro parameters', async () => {
    const onSimulationUpdated = vi.fn()
    render(<AgentTablePanel simulation={simulation} onSimulationUpdated={onSimulationUpdated} />)

    expect(screen.getByText(/Current tick 7/)).toBeInTheDocument()
    expect(screen.queryByLabelText('数量')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('初始 stance')).not.toBeInTheDocument()
    expect(screen.getByText('#0')).toBeInTheDocument()
    expect(screen.getByText('State distribution')).toBeInTheDocument()

    const row0 = screen.getByText('#0').closest('tr')
    expect(row0).not.toBeNull()
    fireEvent.change(within(row0!).getByRole('combobox'), { target: { value: 'high' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Agents' }))

    await waitFor(() => {
      expect(mocks.updateSimulation).toHaveBeenCalledWith('sim-1', expect.objectContaining({
        config: expect.objectContaining({
          initialization: expect.objectContaining({
            agent_counts: { person: 120 },
            agent_overrides: { 0: { stance: 'high' } },
          }),
        }),
      }))
    })
    const payload = mocks.updateSimulation.mock.calls[0]?.[1] as { config: { agents: Array<Record<string, unknown>> } }
    expect(payload.config.agents[0]?.stateVariables).toBeUndefined()
    expect(payload.config.agents[0]?.behaviorRefs).toBeUndefined()
    expect(payload.config.agents[0]?.state_variables).toEqual([expect.objectContaining({
      name: 'stance',
      default: 'middle',
    })])
    expect(onSimulationUpdated).toHaveBeenCalled()
  })

  it('paginates initialized agents when there is no live snapshot', () => {
    useAbmStore.setState({
      activeRunId: null,
      agentSnapshots: {},
    })

    render(<AgentTablePanel simulation={simulation} />)

    expect(screen.getByText('#0')).toBeInTheDocument()
    expect(screen.queryByText('#50')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))

    expect(screen.queryByText('#0')).not.toBeInTheDocument()
    expect(screen.getByText('#50')).toBeInTheDocument()
  })
})
