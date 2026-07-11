import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { useSettingsStore } from '../../stores/settingsStore'
import { useAbmStore } from '../stores/abmStore'
import { RunPanel } from './RunPanel'

vi.mock('../api/abmClient', () => ({
  abmClient: {
    startRun: vi.fn(),
    stopRun: vi.fn(),
  },
}))

describe('RunPanel visual playback controls', () => {
  const noParameters: [] = []
  const noAgentCounts = {}

  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState({ locale: 'en' })
    useAbmStore.setState({
      runs: {
        'run-1': {
          state: 'completed',
          totalSteps: 50,
          ticks: [
            { tick: 0, metrics: { burning: 1 } },
            { tick: 50, metrics: { burning: 0 } },
          ],
        },
      },
      activeRunId: 'run-1',
      playbackTicks: { 'run-1': 10 },
      mode: 'research',
      playbackSpeed: 0.25,
    })
  })

  afterEach(() => {
    cleanup()
    useAbmStore.getState().reset()
  })

  it('keeps a completed raw run visually running while buffered playback catches up', () => {
    render(
      <RunPanel
        simId="sim-1"
        defaults={{ seed: 42, steps: 50, params: {} }}
        parameters={noParameters}
        agentCounts={noAgentCounts}
      />,
    )

    expect(screen.getByText('Running · tick 10 / 50')).toBeInTheDocument()
    expect(screen.getByTestId('abm-run-button')).toBeDisabled()
    expect(screen.getByTestId('abm-stop-button')).toBeEnabled()
    expect(screen.getByTestId('abm-run-progress')).toHaveStyle({ width: '20%' })

    fireEvent.click(screen.getByTestId('abm-stop-button'))

    expect(useAbmStore.getState().playbackTicks['run-1']).toBe(50)
  })
})
