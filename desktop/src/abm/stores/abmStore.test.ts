import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAbmStore } from './abmStore'

vi.mock('../api/abmClient', () => ({
  abmClient: {
    startRun: vi.fn(),
  },
}))

vi.mock('../api/abmSocket', () => ({
  abmSocket: {
    connect: vi.fn(() => () => {}),
  },
}))

import { abmClient } from '../api/abmClient'
import { abmSocket } from '../api/abmSocket'

describe('abmStore', () => {
  beforeEach(() => {
    useAbmStore.getState().reset()
    vi.clearAllMocks()
  })

  afterEach(() => {
    useAbmStore.getState().reset()
  })

  it('ingests tick frames into a series', () => {
    const store = useAbmStore.getState()
    store.ingest({ type: 'abm_tick', runId: 'r1', tick: 1, metrics: { infected: 0.1 } })
    store.ingest({ type: 'abm_tick', runId: 'r1', tick: 2, metrics: { infected: 0.2 } })

    const run = useAbmStore.getState().runs['r1']!
    expect(run.ticks).toHaveLength(2)
    expect(run.ticks[1]).toEqual({ tick: 2, metrics: { infected: 0.2 } })
  })

  it('tracks run status and total steps', () => {
    useAbmStore
      .getState()
      .ingest({ type: 'abm_run_status', runId: 'r1', state: 'running', totalSteps: 50 })
    expect(useAbmStore.getState().runs['r1']!.state).toBe('running')
    expect(useAbmStore.getState().runs['r1']!.totalSteps).toBe(50)
  })

  it('tracks the tick rendered by the visual playback clock', () => {
    useAbmStore.getState().setPlaybackTick('r1', 12)
    expect(useAbmStore.getState().playbackTicks['r1']).toBe(12)

    useAbmStore.getState().reset('r1')
    expect(useAbmStore.getState().playbackTicks['r1']).toBeUndefined()
  })

  it('stores the RunRecord on run_done and marks completed', () => {
    const record = {
      id: 'r1',
      model_id: 'rumor',
      model_version: '1',
      kernel_version: 'k',
      seed: 7,
      parameters: {},
      steps: 5,
      status: 'completed' as const,
      metrics_summary: { infected: { final: 0.3 } },
    }
    useAbmStore.getState().ingest({ type: 'abm_run_done', runId: 'r1', record })
    const run = useAbmStore.getState().runs['r1']!
    expect(run.state).toBe('completed')
    expect(run.record).toEqual(record)
  })

  it('stores canvas meta from an abm_meta frame', () => {
    useAbmStore.getState().ingest({
      type: 'abm_meta',
      runId: 'r1',
      space: 'grid',
      palette: ['infected', 'recovered', 'susceptible'],
      grid: { width: 25, height: 25 },
    })
    const run = useAbmStore.getState().runs['r1']!
    expect(run.meta?.space).toBe('grid')
    expect(run.meta?.grid).toEqual({ width: 25, height: 25 })
    expect(run.meta?.palette).toHaveLength(3)
  })

  it('marks failed and keeps the error message on abm_error', () => {
    useAbmStore.getState().ingest({ type: 'abm_error', runId: 'r1', message: 'kernel exploded' })
    const run = useAbmStore.getState().runs['r1']!
    expect(run.state).toBe('failed')
    expect(run.error).toBe('kernel exploded')
  })

  it('startRun posts, seeds an active run, and subscribes the socket', async () => {
    vi.mocked(abmClient.startRun).mockResolvedValue({ runId: 'run-xyz' })

    const runId = await useAbmStore.getState().startRun('sim-1', { seed: 7, steps: 5 })

    expect(runId).toBe('run-xyz')
    expect(abmClient.startRun).toHaveBeenCalledWith('sim-1', { seed: 7, steps: 5 })
    expect(abmSocket.connect).toHaveBeenCalledWith(
      'run-xyz',
      expect.objectContaining({ onMessage: expect.any(Function) }),
    )
    expect(useAbmStore.getState().activeRunId).toBe('run-xyz')
    expect(useAbmStore.getState().runs['run-xyz']).toEqual({ state: 'running', ticks: [] })
  })

  it('opens the conversation workbench panel when a simulation becomes active', () => {
    useAbmStore.setState({ activeSimId: null, panelOpen: false })

    useAbmStore.getState().setActiveSim('sim-1')

    expect(useAbmStore.getState().activeSimId).toBe('sim-1')
    expect(useAbmStore.getState().panelOpen).toBe(true)

    useAbmStore.getState().closePanel()
    expect(useAbmStore.getState().panelOpen).toBe(false)
  })

  it('clears run-bound state when switching to another simulation', () => {
    useAbmStore.setState({
      activeSimId: 'sim-1',
      activeRunId: 'run-1',
      runs: { 'run-1': { state: 'completed', ticks: [{ tick: 1, metrics: { infected: 1 } }] } },
      activeExperimentId: 'exp-1',
      experiments: { 'exp-1': { status: 'completed', total: 1, progress: [] } },
      resultCharts: { 'run-1': { metrics: ['infected'], action: 'show', nonce: 1 } },
      explainFocus: { runId: 'run-1', metric: 'infected', from: 0, to: 1 },
      agentSnapshots: {
        'run-1': { runId: 'run-1', tick: 1, total: 0, palette: [], rows: [], counts: {} },
      },
      playbackTicks: { 'run-1': 1 },
    })

    useAbmStore.getState().setActiveSim('sim-2')

    expect(useAbmStore.getState().activeSimId).toBe('sim-2')
    expect(useAbmStore.getState().activeRunId).toBeNull()
    expect(useAbmStore.getState().runs).toEqual({})
    expect(useAbmStore.getState().experiments).toEqual({})
    expect(useAbmStore.getState().resultCharts).toEqual({})
    expect(useAbmStore.getState().explainFocus).toBeNull()
    expect(useAbmStore.getState().agentSnapshots).toEqual({})
    expect(useAbmStore.getState().playbackTicks).toEqual({})
  })
})
