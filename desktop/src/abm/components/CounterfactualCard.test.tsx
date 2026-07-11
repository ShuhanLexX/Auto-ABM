import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { CounterfactualCard } from './CounterfactualCard'
import { useSelectionStore } from '../stores/selectionStore'
import type { UIMessage } from '../../types/chat'

type CounterfactualMessage = Extract<UIMessage, { type: 'abm_counterfactual' }>

const fetchRange = vi.fn()

vi.mock('../trace/traceClient', () => ({
  traceClient: {
    fetchRange: (...args: unknown[]) => fetchRange(...args),
  },
}))

function message(overrides: Partial<CounterfactualMessage> = {}): CounterfactualMessage {
  return {
    id: 'm1',
    type: 'abm_counterfactual',
    baseRunId: 'run-base',
    runId: 'run-cf',
    changed: { beta: 0.6 },
    seed: 42,
    steps: 50,
    status: 'completed',
    divergenceTick: 7,
    metrics: [
      { metric: 'infected', baseFinal: 30, otherFinal: 48, finalDelta: 18, maxAbsDelta: 21, maxAbsDeltaTick: 33 },
      { metric: 'recovered', baseFinal: 10, otherFinal: 12, finalDelta: 2, maxAbsDelta: 3, maxAbsDeltaTick: 40 },
    ],
    timestamp: Date.now(),
    ...overrides,
  }
}

function traceOf(values: number[]) {
  return {
    runId: 'x',
    truncated: false,
    records: values.map((value, tick) => ({ kind: 'tick_metrics', tick, metrics: { infected: value } })),
  }
}

describe('CounterfactualCard', () => {
  beforeEach(() => {
    cleanup()
    fetchRange.mockReset()
    fetchRange.mockResolvedValue({ runId: 'x', truncated: false, records: [] })
    useSelectionStore.setState({ selection: null, replay: null, evidenceFocus: null })
  })

  it('renders the changed params, seed pinning and metric deltas', () => {
    render(<CounterfactualCard message={message()} />)
    const card = screen.getByTestId('counterfactual-card')
    expect(card).toHaveTextContent('Counterfactual Comparison')
    expect(screen.getByTestId('counterfactual-status')).toHaveTextContent('Completed')
    expect(screen.getByTestId('counterfactual-change-chip')).toHaveTextContent('beta → 0.6')
    expect(card).toHaveTextContent('seed=42')

    const table = screen.getByTestId('counterfactual-metric-table')
    expect(table).toHaveTextContent('infected')
    expect(table).toHaveTextContent('+18')
    expect(table).toHaveTextContent('@t33')
  })

  it('clicking the divergence chip focuses the base run at that tick', () => {
    render(<CounterfactualCard message={message()} />)
    fireEvent.click(screen.getByTestId('divergence-chip'))
    expect(useSelectionStore.getState().evidenceFocus).toEqual({ runId: 'run-base', tick: 7 })
  })

  it('overlays both real trajectories for the most divergent metric', async () => {
    fetchRange
      .mockResolvedValueOnce(traceOf([1, 2, 3, 4, 5]))
      .mockResolvedValueOnce(traceOf([1, 2, 5, 9, 14]))

    render(<CounterfactualCard message={message()} />)

    await waitFor(() => expect(screen.getByTestId('counterfactual-overlay')).toBeInTheDocument())
    expect(fetchRange).toHaveBeenCalledWith('run-base', { kinds: ['tick_metrics'] })
    expect(fetchRange).toHaveBeenCalledWith('run-cf', { kinds: ['tick_metrics'] })
    expect(screen.getByTestId('counterfactual-overlay')).toHaveTextContent('infected')
  })

  it('reports identical trajectories honestly', () => {
    render(<CounterfactualCard message={message({ divergenceTick: null })} />)
    expect(screen.getByTestId('counterfactual-card')).toHaveTextContent('The two trajectories are identical')
  })

  it('shows a failure state without a comparison', () => {
    render(
      <CounterfactualCard
        message={message({ status: 'failed', metrics: [], divergenceTick: null, note: '反事实运行失败' })}
      />,
    )
    expect(screen.getByTestId('counterfactual-status')).toHaveTextContent('Failed')
    expect(screen.queryByTestId('counterfactual-metric-table')).not.toBeInTheDocument()
  })
})
