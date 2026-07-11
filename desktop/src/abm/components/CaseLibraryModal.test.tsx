import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { ABM_CASE_LIBRARY } from '../researchAssets'
import { CaseLibraryModal } from './CaseLibraryModal'
import { useAbmStore } from '../stores/abmStore'
import { useSettingsStore } from '../../stores/settingsStore'

const mocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  createSimulation: vi.fn(),
  addToast: vi.fn(),
}))

vi.mock('../api/abmClient', () => ({
  abmClient: {
    listProjects: mocks.listProjects,
    createProject: mocks.createProject,
    createSimulation: mocks.createSimulation,
  },
}))

vi.mock('../../stores/uiStore', () => ({
  useUIStore: Object.assign(
    (selector: (state: { addToast: typeof mocks.addToast; theme: 'light' }) => unknown) =>
      selector({ addToast: mocks.addToast, theme: 'light' }),
    { getState: () => ({ addToast: mocks.addToast, theme: 'light' }) },
  ),
}))

describe('CaseLibraryModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState({ locale: 'en' })
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
        researchQuestion: '城市隔离',
        createdAt: '2026-01-01T00:00:00.000Z',
        schemaVersion: 1,
      }],
    })
    mocks.createSimulation.mockResolvedValue({
      id: 'sim-case',
      projectId: 'project-1',
      name: 'Schelling Urban Segregation',
      modelVersion: '1',
      config: {},
      interface: { seed: 42, steps: 120, params: {} },
      createdAt: '2026-01-01T00:00:00.000Z',
      schemaVersion: 1,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('shows a rich case library and imports the selected case into the active project', async () => {
    const onClose = vi.fn()
    render(<CaseLibraryModal open onClose={onClose} initialCaseId="schelling-urban-segregation" />)

    await waitFor(() => {
      expect(screen.getAllByTestId('case-library-card')).toHaveLength(ABM_CASE_LIBRARY.length)
    })
    expect(screen.getAllByText('Schelling Urban Segregation').length).toBeGreaterThan(0)
    expect(screen.getByText(`${ABM_CASE_LIBRARY.length} cases`)).toBeInTheDocument()
    expect(screen.getAllByTestId('simulation-preview').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: /Add to Project/ }))

    await waitFor(() => {
      expect(mocks.createSimulation).toHaveBeenCalledWith('project-1', expect.objectContaining({
        name: 'Schelling Urban Segregation',
        template: 'schelling',
      }))
    })
    expect(useAbmStore.getState().activeSimId).toBe('sim-case')
    expect(useAbmStore.getState().panelOpen).toBe(true)
    expect(useAbmStore.getState().viewRequest?.view).toBe('simulations')
    expect(onClose).toHaveBeenCalled()
  })
})
