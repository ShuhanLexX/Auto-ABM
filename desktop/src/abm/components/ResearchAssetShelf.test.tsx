import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { ResearchAssetShelf } from './ResearchAssetShelf'
import { useAbmStore } from '../stores/abmStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useSessionStore } from '../../stores/sessionStore'

const mocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  listSimulations: vi.fn(),
  deleteAllProjects: vi.fn(),
}))

vi.mock('../api/abmClient', () => ({
  abmClient: {
    listProjects: mocks.listProjects,
    listSimulations: mocks.listSimulations,
    deleteAllProjects: mocks.deleteAllProjects,
  },
}))

describe('ResearchAssetShelf', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState({ locale: 'en' })
    useSessionStore.setState({
      sessions: [{
        id: 'session-1',
        title: 'Session',
        createdAt: '2026-01-01T00:00:00.000Z',
        modifiedAt: '2026-01-01T00:00:00.000Z',
        messageCount: 1,
        projectPath: '/workspace/project',
        projectRoot: '/workspace/project',
        workDir: '/workspace/project',
        workDirExists: true,
      }],
      isLoading: false,
    })
    useAbmStore.setState({
      activeProjectId: 'project-1',
      activeSimId: null,
      panelOpen: false,
      viewRequest: null,
    })
    mocks.listProjects.mockResolvedValue({
      projects: [{
        id: 'project-1',
        name: '研究问题',
        researchQuestion: '舆情扩散',
        createdAt: '2026-01-01T00:00:00.000Z',
        schemaVersion: 1,
      }],
    })
    mocks.listSimulations.mockResolvedValue({
      simulations: [{
        id: 'sim-1',
        projectId: 'project-1',
        name: '平台谣言与辟谣干预',
        modelVersion: '1',
        config: {},
        interface: { seed: 42, steps: 120, params: {} },
        createdAt: '2026-01-02T00:00:00.000Z',
        schemaVersion: 1,
      }],
    })
    mocks.deleteAllProjects.mockResolvedValue({ ok: true, deleted: [] })
  })

  afterEach(() => {
    cleanup()
    useSessionStore.setState({ sessions: [], isLoading: false })
  })

  it('opens recent simulations and exposes case-library cards', async () => {
    const openCaseLibrary = vi.fn()
    render(<ResearchAssetShelf onOpenCaseLibrary={openCaseLibrary} />)

    const recent = await screen.findByTestId('recent-simulation-card')
    fireEvent.click(recent)

    expect(useAbmStore.getState().activeSimId).toBe('sim-1')
    expect(useAbmStore.getState().panelOpen).toBe(true)
    expect(useAbmStore.getState().viewRequest?.view).toBe('run')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Schelling Urban Segregation/ })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Schelling Urban Segregation/ }))
    expect(openCaseLibrary).toHaveBeenCalledWith('schelling-urban-segregation')
  })

  it('keeps the home shelf compact with one recent row and one featured row', async () => {
    mocks.listSimulations.mockResolvedValue({
      simulations: Array.from({ length: 6 }, (_, index) => ({
        id: `sim-${index}`,
        projectId: 'project-1',
        name: `Simulation ${index}`,
        modelVersion: '1',
        config: {},
        interface: { seed: 42, steps: 120, params: {} },
        createdAt: `2026-01-0${index + 1}T00:00:00.000Z`,
        schemaVersion: 1,
      })),
    })

    render(<ResearchAssetShelf onOpenCaseLibrary={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getAllByTestId('recent-simulation-card')).toHaveLength(3)
    })
    expect(screen.getByRole('button', { name: /Schelling Urban Segregation/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Wildfire Fuel-Front Spread/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Public-Goods Cooperation/ })).not.toBeInTheDocument()
  })

  it('clears ABM assets and hides recent simulations when no sessions remain', async () => {
    useSessionStore.setState({ sessions: [], isLoading: false })

    render(<ResearchAssetShelf onOpenCaseLibrary={vi.fn()} />)

    await waitFor(() => {
      expect(mocks.deleteAllProjects).toHaveBeenCalledOnce()
    })
    expect(screen.queryByTestId('recent-simulation-card')).not.toBeInTheDocument()
    expect(mocks.listProjects).not.toHaveBeenCalled()
  })
})
