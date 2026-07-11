import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ExplainInspector } from './ExplainInspector'
import { useAbmStore } from '../stores/abmStore'
import { useSettingsStore } from '../../stores/settingsStore'

const getAttribution = vi.fn()
const getChangepoints = vi.fn()

vi.mock('../api/abmClient', () => ({
  abmClient: {
    getAttribution: (...args: unknown[]) => getAttribution(...args),
    getChangepoints: (...args: unknown[]) => getChangepoints(...args),
  },
}))

describe('ExplainInspector', () => {
  beforeEach(() => {
    cleanup()
    getAttribution.mockReset()
    getChangepoints.mockReset()
    useSettingsStore.setState({ locale: 'en' })
    useAbmStore.setState({
      explainFocus: null,
      runs: {},
      viewRequest: null,
    })
  })

  it('prompts the user to brush an interval when no focus is set', () => {
    useAbmStore.setState({
      runs: { 'run-1': { state: 'completed', ticks: [{ tick: 10, metrics: { infected: 5 } }] } },
    })
    render(<ExplainInspector runId="run-1" />)
    expect(screen.getByText(/brush a tick interval/i)).toBeInTheDocument()
  })

  it('fetches and renders trace-grounded attribution for the focused interval', async () => {
    useAbmStore.setState({
      explainFocus: { runId: 'run-1', metric: 'infected', from: 5, to: 20 },
      runs: { 'run-1': { state: 'completed', ticks: [{ tick: 20, metrics: { infected: 12 } }] } },
    })
    getAttribution.mockResolvedValue({
      runId: 'run-1',
      metric: 'infected',
      from: 5,
      to: 20,
      supported: true,
      actualDelta: 7,
      attributedNet: 6,
      residual: 1,
      coverage: 0.86,
      contributions: [{ mechanism_id: 'spread', gains: 8, losses: 2, net: 6, agents: 4 }],
    })
    getChangepoints.mockResolvedValue({ runId: 'run-1', changepoints: [] })

    render(<ExplainInspector runId="run-1" />)
    await waitFor(() => expect(screen.getByTestId('explain-contribution-row')).toBeInTheDocument())
    expect(getAttribution).toHaveBeenCalledWith('run-1', 'infected', { from: 5, to: 20 })
    expect(screen.getByText(/86%/)).toBeInTheDocument()
    expect(screen.getByText('spread')).toBeInTheDocument()
  })

  it('opens the mechanism graph view from the inspector', async () => {
    useAbmStore.setState({
      explainFocus: { runId: 'run-1', metric: 'infected', from: 0, to: 10 },
      runs: { 'run-1': { state: 'completed', ticks: [] } },
    })
    getAttribution.mockResolvedValue({
      runId: 'run-1',
      metric: 'infected',
      from: 0,
      to: 10,
      supported: true,
      actualDelta: 1,
      attributedNet: 1,
      residual: 0,
      coverage: 1,
      contributions: [],
    })
    getChangepoints.mockResolvedValue({ runId: 'run-1', changepoints: [] })

    render(<ExplainInspector runId="run-1" />)
    await waitFor(() => expect(screen.getByTestId('explain-open-graph')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('explain-open-graph'))
    expect(useAbmStore.getState().viewRequest?.view).toBe('model')
  })

  it('lets users close the attribution panel after brushing an interval', async () => {
    useAbmStore.setState({
      explainFocus: { runId: 'run-1', metric: 'infected', from: 0, to: 10 },
      runs: { 'run-1': { state: 'completed', ticks: [] } },
    })
    getAttribution.mockResolvedValue({
      runId: 'run-1',
      metric: 'infected',
      from: 0,
      to: 10,
      supported: true,
      actualDelta: 1,
      attributedNet: 1,
      residual: 0,
      coverage: 1,
      contributions: [],
    })
    getChangepoints.mockResolvedValue({ runId: 'run-1', changepoints: [] })

    render(<ExplainInspector runId="run-1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Close attribution' }))
    expect(useAbmStore.getState().explainFocus).toBeNull()
  })
})
