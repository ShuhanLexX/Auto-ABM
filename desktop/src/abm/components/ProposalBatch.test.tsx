import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AbmProposal } from '../../types/chat'

vi.mock('../api/abmClient', () => ({
  abmClient: {
    createSimulationFromProposal: vi.fn(),
    listProjects: vi.fn(async () => ({ projects: [] })),
    createProject: vi.fn(async () => ({ id: 'proj-auto', name: '默认研究课题', createdAt: '' })),
  },
}))

vi.mock('../bootstrap/ensureAbmProject', () => ({
  ensureAbmProject: vi.fn(async () => 'proj-auto'),
}))

import { abmClient } from '../api/abmClient'
import { useAbmStore } from '../stores/abmStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { ProposalBatch } from './ProposalBatch'

function proposals(): AbmProposal[] {
  return [
    {
      id: 'p1',
      mechanismSummary: 'Neighbours spread awareness',
      keyParams: { spread_prob: 0.3 },
      expectedMacro: 'S-shaped adoption',
      oddExcerpt: 'agents on a network',
      trial: { runId: 'run-abc12345', sparkline: [0, 0.2, 0.6, 0.9] },
    },
    {
      id: 'p2',
      mechanismSummary: 'Awareness decays',
      keyParams: {},
      expectedMacro: 'Plateau then decline',
      oddExcerpt: '',
    },
  ]
}

describe('ProposalBatch', () => {
  beforeEach(() => {
    useSettingsStore.setState({ locale: 'en' })
    useAbmStore.setState({
      activeProjectId: null,
      activeSimId: null,
      panelOpen: false,
      mode: 'research',
      startRun: vi.fn(async () => 'run-mock'),
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
    useAbmStore.setState({ activeProjectId: null, activeSimId: null, panelOpen: false, mode: 'research' })
  })

  it('renders one card per proposal', () => {
    render(<ProposalBatch proposals={proposals()} />)
    expect(screen.getAllByTestId('proposal-card')).toHaveLength(2)
  })

  it('renders a trial sparkline only when a real trial run exists', () => {
    render(<ProposalBatch proposals={proposals()} />)
    expect(screen.getAllByTestId('proposal-trial-sparkline')).toHaveLength(1)
  })

  it('adopting creates a simulation and opens the conversation workbench panel', async () => {
    vi.mocked(abmClient.createSimulationFromProposal).mockResolvedValue({
      id: 'sim-new',
      projectId: 'proj-auto',
      name: 'Neighbours spread awareness',
      modelVersion: '1',
      config: {},
      interface: { seed: 42, steps: 50, params: {} },
      createdAt: new Date().toISOString(),
      schemaVersion: 1,
    })

    render(<ProposalBatch proposals={proposals()} />)
    fireEvent.click(screen.getAllByText('Adopt')[0]!)

    await waitFor(() => {
      expect(abmClient.createSimulationFromProposal).toHaveBeenCalledWith(
        'proj-auto',
        expect.objectContaining({ id: 'p1' }),
      )
    })
    await waitFor(() => expect(useAbmStore.getState().activeSimId).toBe('sim-new'))
    expect(useAbmStore.getState().activeProjectId).toBe('proj-auto')
    expect(useAbmStore.getState().panelOpen).toBe(true)
  })

  it('adopt and run starts a run and keeps the workbench panel open', async () => {
    vi.mocked(abmClient.createSimulationFromProposal).mockResolvedValue({
      id: 'sim-run',
      projectId: 'proj-auto',
      name: 'Neighbours spread awareness',
      modelVersion: '1',
      config: {},
      interface: { seed: 7, steps: 80, params: { spread_prob: 0.3 } },
      createdAt: new Date().toISOString(),
      schemaVersion: 1,
    })
    const startRun = vi.fn(async () => 'run-mock')
    useAbmStore.setState({ startRun })

    render(<ProposalBatch proposals={proposals()} />)
    fireEvent.click(screen.getAllByTestId('proposal-adopt-and-run')[0]!)

    await waitFor(() => expect(startRun).toHaveBeenCalledWith('sim-run', expect.objectContaining({ seed: 7, steps: 80 })))
    expect(useAbmStore.getState().panelOpen).toBe(true)
  })

  it('discarding a proposal removes its card', () => {
    render(<ProposalBatch proposals={proposals()} />)
    const discardButtons = screen.getAllByLabelText('Discard proposal')
    fireEvent.click(discardButtons[0]!)
    expect(screen.getAllByTestId('proposal-card')).toHaveLength(1)
  })

  it('hides mutating actions in dialogue (read-only) mode', () => {
    useAbmStore.setState({ mode: 'dialogue' })
    render(<ProposalBatch proposals={proposals()} />)
    expect(screen.queryByText('Adopt')).toBeNull()
    expect(screen.queryByTestId('proposal-adopt-and-run')).toBeNull()
    expect(screen.getAllByLabelText('Discard proposal').length).toBeGreaterThan(0)
  })
})
