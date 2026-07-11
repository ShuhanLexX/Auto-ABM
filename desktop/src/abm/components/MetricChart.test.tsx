import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { useAbmStore } from '../stores/abmStore'
import { MetricChart } from './MetricChart'
import { useSettingsStore } from '../../stores/settingsStore'

vi.mock('./MiniExplainPopover', () => ({
  MiniExplainPopover: ({ open, target }: { open: boolean; target: { subject?: string } | null }) =>
    open ? <div data-testid="metric-mini-explain">{target?.subject}</div> : null,
}))

const getChangepoints = vi.fn()

vi.mock('../api/abmClient', () => ({
  abmClient: {
    getChangepoints: (...args: unknown[]) => getChangepoints(...args),
  },
}))

afterEach(cleanup)

describe('MetricChart', () => {
  beforeEach(() => {
    useSettingsStore.setState({ locale: 'en' })
    getChangepoints.mockReset()
    // Never-resolving default keeps unrelated tests free of act() noise;
    // the changepoint test overrides this with a resolved value.
    getChangepoints.mockReturnValue(new Promise(() => {}))
    useAbmStore.setState({
      runs: {
        'run-1': {
          state: 'completed',
          ticks: [
            { tick: 0, metrics: { susceptible: 10, infected: 1, recovered: 0, aware: 0 } },
            { tick: 1, metrics: { susceptible: 8, infected: 3, recovered: 1, aware: 2 } },
            { tick: 2, metrics: { susceptible: 5, infected: 5, recovered: 3, aware: 5 } },
            { tick: 3, metrics: { susceptible: 3, infected: 4, recovered: 5, aware: 7 } },
          ],
        },
      },
      activeRunId: 'run-1',
      experiments: {},
      activeExperimentId: null,
      resultCharts: {},
      playbackTicks: {},
      activeProjectId: null,
      activeSimId: null,
      mode: 'research',
      panelOpen: true,
    })
  })

  it('opens a local explanation from the chart context menu', () => {
    render(<MetricChart runId="run-1" />)

    expect(screen.getByTestId('metric-chart-module')).toHaveTextContent('Core Charts')
    expect(screen.getByTestId('metric-chart-module')).toHaveTextContent('tick 3')
    const plot = screen.getByRole('img', { name: /infected result curve/ })
    vi.spyOn(plot, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 760,
      bottom: 260,
      width: 760,
      height: 260,
      toJSON: () => ({}),
    } as DOMRect)

    fireEvent.contextMenu(plot, { clientX: 520, clientY: 120 })
    fireEvent.click(screen.getByRole('menuitem', { name: /Discuss this interval/ }))

    expect(screen.getByTestId('metric-mini-explain')).toHaveTextContent('tick 0-3')
  })

  it('selects an interval with two clicks and exposes an explain button', () => {
    render(<MetricChart runId="run-1" />)

    const plot = screen.getByRole('img', { name: /infected result curve/ })
    vi.spyOn(plot, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 760,
      bottom: 260,
      width: 760,
      height: 260,
      toJSON: () => ({}),
    } as DOMRect)

    fireEvent.pointerDown(plot, { button: 0, clientX: 300, clientY: 120 })
    fireEvent.pointerDown(plot, { button: 0, clientX: 610, clientY: 120 })
    fireEvent.click(screen.getByRole('button', { name: /Explain selected interval for infected/ }))

    expect(screen.getByTestId('metric-mini-explain')).toHaveTextContent('infected · tick')
    expect(useAbmStore.getState().explainFocus).toBeNull()
  })

  it('opens mechanism attribution only from the interval context menu', () => {
    render(<MetricChart runId="run-1" />)

    const plot = screen.getByRole('img', { name: /infected result curve/ })
    vi.spyOn(plot, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 760,
      bottom: 260,
      width: 760,
      height: 260,
      toJSON: () => ({}),
    } as DOMRect)

    fireEvent.pointerDown(plot, { button: 0, clientX: 300, clientY: 120 })
    fireEvent.pointerDown(plot, { button: 0, clientX: 610, clientY: 120 })
    expect(useAbmStore.getState().explainFocus).toBeNull()

    fireEvent.contextMenu(plot, { clientX: 520, clientY: 120 })
    fireEvent.click(screen.getByRole('menuitem', { name: /Open mechanism attribution/ }))

    expect(useAbmStore.getState().explainFocus).toMatchObject({
      runId: 'run-1',
      metric: 'infected',
    })
  })

  it('adds and removes metric cards from the result canvas', () => {
    render(<MetricChart runId="run-1" />)

    expect(screen.getByRole('img', { name: /infected result curve/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /susceptible result curve/ })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Choose a result variable to add'), { target: { value: 'aware' } })
    fireEvent.click(screen.getByRole('button', { name: /New Chart/ }))
    expect(screen.getByRole('img', { name: /aware result curve/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete chart' })
    fireEvent.click(deleteButtons[deleteButtons.length - 1]!)
    expect(screen.queryByRole('img', { name: /aware result curve/ })).not.toBeInTheDocument()
  })

  it('only shows ticks up to the canvas playback tick while the canvas is replaying', () => {
    useAbmStore.setState({ playbackTicks: { 'run-1': 1 } })

    render(<MetricChart runId="run-1" />)

    expect(screen.getByTestId('metric-chart-module')).toHaveTextContent('tick 1')
    expect(screen.getByTestId('metric-chart-module')).not.toHaveTextContent('tick 3')
  })

  it('shows metrics requested by the chat result-canvas tool', async () => {
    render(<MetricChart runId="run-1" />)

    expect(screen.queryByRole('img', { name: /aware result curve/ })).not.toBeInTheDocument()
    act(() => {
      useAbmStore.getState().configureResultCharts({
        runId: 'run-1',
        metrics: ['aware'],
        action: 'show',
      })
    })

    await waitFor(() => {
      expect(screen.getByRole('img', { name: /aware result curve/ })).toBeInTheDocument()
    })
  })

  it('marks detected changepoints and selects a window around one on click', async () => {
    getChangepoints.mockResolvedValue({
      runId: 'run-1',
      changepoints: [
        { metric: 'infected', tick: 2, score: 5.2, beforeSlope: 0.1, afterSlope: 2.4, direction: 'accelerate' },
      ],
    })

    render(<MetricChart runId="run-1" />)

    const marker = await screen.findByTestId('changepoint-marker')
    expect(getChangepoints).toHaveBeenCalledWith('run-1')
    expect(marker.querySelector('title')?.textContent).toContain('Changepoint t2')
    expect(marker.querySelector('title')?.textContent).toContain('accelerate')

    fireEvent.pointerDown(marker, { button: 0 })
    // The interval around the changepoint becomes the active chart range only.
    expect(screen.getByRole('button', { name: /Explain selected interval for infected/ })).toBeInTheDocument()
    expect(screen.getByTestId('metric-chart-module')).toHaveTextContent('interval tick 0-3')
    expect(useAbmStore.getState().explainFocus).toBeNull()
  })

  it('prioritizes opinion variance over the near-conserved opinion mean', () => {
    useAbmStore.setState({
      runs: {
        'run-opinion': {
          state: 'completed',
          ticks: [
            { tick: 0, metrics: { opinion_mean: 0.5, opinion_variance: 0.12, clusters: 4 } },
            { tick: 1, metrics: { opinion_mean: 0.5, opinion_variance: 0.08, clusters: 3 } },
          ],
        },
      },
      activeRunId: 'run-opinion',
      resultCharts: {},
    })

    render(<MetricChart runId="run-opinion" />)

    const plots = screen.getAllByRole('img')
    expect(plots[0]).toHaveAttribute('aria-label', 'opinion_variance result curve')
    expect(plots[1]).toHaveAttribute('aria-label', 'clusters result curve')
  })
})
