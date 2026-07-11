import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

vi.mock('./traceClient', () => ({
  traceClient: {
    fetchRange: vi.fn(() => Promise.resolve({ runId: 'r', records: [], truncated: false })),
    fetchNearestSnapshot: vi.fn(),
    fetchExplainContext: vi.fn(),
    askMiniExplain: vi.fn(() => Promise.resolve({ text: '模型解释' })),
  },
}))

vi.mock('./snapshotState', () => ({
  snapshotToState: vi.fn(() => new Uint8Array([1, 2, 3])),
}))

import { traceClient } from './traceClient'
import { useAbmStore } from '../stores/abmStore'
import { useSelectionStore } from '../stores/selectionStore'
import { TraceTimeline } from './TraceTimeline'

describe('TraceTimeline evidence linkage', () => {
  beforeEach(() => {
    useSelectionStore.getState().clear()
    useAbmStore.setState({
      runs: {
        'run-1': {
          state: 'completed',
          ticks: [
            { tick: 0, metrics: { segregation: 0.25, unhappy: 0.75 } },
            { tick: 10, metrics: { segregation: 0.82, unhappy: 0.08 } },
          ],
          totalSteps: 10,
          meta: { space: 'grid', palette: ['a'], grid: { width: 2, height: 2 } },
        },
      },
    })
    vi.clearAllMocks()
    vi.mocked(traceClient.fetchNearestSnapshot).mockResolvedValue({
      runId: 'run-1',
      records: [{ kind: 'space_snapshot', tick: 5, snapshot: { cells: [] } }],
      truncated: false,
    })
    vi.mocked(traceClient.fetchExplainContext).mockResolvedValue({
      runId: 'run-1',
      from: 7,
      to: 13,
      metrics: [{ tick: 10, metrics: { segregation: 0.82, unhappy: 0.08 } }],
      events: [],
      mechanisms: [{ tick: 10, mechanism_id: 'move_decision', agent_ids: [1, 2] }],
      oddRefs: [{ section: '过程概览与调度', text: 'Agents update their satisfaction and move when unhappy.' }],
    })
  })

  afterEach(() => {
    cleanup()
    useSelectionStore.getState().clear()
    useAbmStore.setState({ runs: {} })
  })

  it('seeks the timeline when an evidence focus for the run arrives', async () => {
    render(<TraceTimeline runId="run-1" />)

    act(() => {
      useSelectionStore.getState().setEvidenceFocus({ runId: 'run-1', tick: 5, metric: 'infected' })
    })

    await waitFor(() => expect(traceClient.fetchNearestSnapshot).toHaveBeenCalledWith('run-1', 5))
    await waitFor(() => expect(useSelectionStore.getState().replay?.tick).toBe(5))
  })

  it('ignores an evidence focus that targets a different run', async () => {
    render(<TraceTimeline runId="run-1" />)

    await act(async () => {
      useSelectionStore.getState().setEvidenceFocus({ runId: 'other-run', tick: 7 })
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    expect(traceClient.fetchNearestSnapshot).not.toHaveBeenCalled()
  })

  it('opens a local trace explanation with concrete metric values', async () => {
    render(<TraceTimeline runId="run-1" />)

    fireEvent.click(screen.getByRole('button', { name: '解释当前 tick' }))

    await waitFor(() => {
      expect(traceClient.fetchExplainContext).toHaveBeenCalledWith('run-1', 7, 13, expect.any(String))
    })
    const popover = await screen.findByTestId('abm-mini-explain-popover')
    expect(popover).toHaveTextContent('segregation=0.820')
    expect(popover).toHaveTextContent('unhappy=0.080')
    expect(popover).toHaveTextContent('move_decision')
  })
})
