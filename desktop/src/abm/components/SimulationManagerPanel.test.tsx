import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { abmClient } from '../api/abmClient'
import { useAbmStore } from '../stores/abmStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { AbmProject, AbmSimulation } from '../types'
import { SimulationManagerPanel } from './SimulationManagerPanel'

vi.mock('../api/abmClient', () => ({
  abmClient: {
    createSimulation: vi.fn(),
    deleteSimulation: vi.fn(),
    listProjects: vi.fn(),
    listSimulations: vi.fn(),
    updateSimulation: vi.fn(),
  },
}))

const project: AbmProject = {
  id: 'project-1',
  name: '研究问题',
  researchQuestion: '解释谣言传播阈值',
  createdAt: '2026-01-01T00:00:00.000Z',
  schemaVersion: 1,
}

function simulation(overrides: Partial<AbmSimulation> = {}): AbmSimulation {
  return {
    id: 'sim-1',
    projectId: project.id,
    name: '谣言传播模型',
    modelVersion: '1',
    lineageId: 'lineage-rumor',
    parentSimId: null,
    config: {
      id: 'rumor',
      version: '1',
      mechanisms: [{ id: 'spread', name: '传播', trigger: '接触', effect: '知晓' }],
      parameters: [{ id: 'p', name: '传播概率', default: 0.2 }],
      initialization: { agent_counts: { person: 100 } },
    },
    interface: { seed: 42, steps: 50, params: { p: 0.2 } },
    createdAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: 1,
    ...overrides,
  }
}

afterEach(cleanup)

describe('SimulationManagerPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState({ locale: 'en' })
    useAbmStore.setState({
      runs: {},
      activeRunId: null,
      experiments: {},
      activeExperimentId: null,
      activeProjectId: project.id,
      activeSimId: 'sim-2',
      mode: 'research',
      panelOpen: true,
    })
    vi.mocked(abmClient.listProjects).mockResolvedValue({ projects: [project] })
    vi.mocked(abmClient.createSimulation).mockResolvedValue(simulation({ id: 'sim-new', name: '新的仿真' }))
    vi.mocked(abmClient.updateSimulation).mockResolvedValue(simulation({ id: 'sim-2', name: '更新后的仿真' }))
    vi.mocked(abmClient.deleteSimulation).mockResolvedValue({ ok: true })
    vi.mocked(abmClient.listSimulations).mockResolvedValue({
      simulations: [
        simulation(),
        simulation({
          id: 'sim-2',
          modelVersion: '2',
          config: {
            id: 'rumor',
            version: '2',
            mechanisms: [
              { id: 'spread', name: '传播', trigger: '接触', effect: '知晓' },
              { id: 'forget', name: '遗忘', trigger: '时间', effect: '遗忘' },
            ],
            parameters: [{ id: 'p', name: '传播概率', default: 0.35 }],
            initialization: { agent_counts: { person: 100 } },
          },
          interface: { seed: 43, steps: 80, params: { p: 0.35 } },
          createdAt: '2026-01-02T00:00:00.000Z',
          parentSimId: 'sim-1',
        }),
      ],
    })
  })

  it('shows version details and core changes for a simulation card', async () => {
    render(<SimulationManagerPanel activeProjectId={project.id} activeSimId="sim-2" />)

    await waitFor(() => {
      expect(screen.getByText('谣言传播模型')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Details/ }))

    expect(screen.getByText('Core Details')).toBeInTheDocument()
    expect(screen.getByText(/Added mechanisms: forget/)).toBeInTheDocument()
    expect(screen.getByText(/Parameter defaults changed: p/)).toBeInTheDocument()
    expect(screen.getByText(/Default run steps: 50 -> 80/)).toBeInTheDocument()
  })

  it('disambiguates older duplicate stored version labels in one model line', async () => {
    vi.mocked(abmClient.listSimulations).mockResolvedValueOnce({
      simulations: [
        simulation({ id: 'sim-a', modelVersion: '1.0.0', createdAt: '2026-01-01T00:00:00.000Z' }),
        simulation({ id: 'sim-b', modelVersion: '1.0.0', createdAt: '2026-01-02T00:00:00.000Z' }),
        simulation({ id: 'sim-c', modelVersion: '1.0.0', createdAt: '2026-01-03T00:00:00.000Z' }),
      ],
    })

    render(<SimulationManagerPanel activeProjectId={project.id} activeSimId="sim-c" />)

    await waitFor(() => {
      expect(screen.getAllByText('v1.0.2').length).toBeGreaterThan(0)
    })
    const select = screen.getByRole('combobox')
    expect(select).toHaveTextContent('v1.0.1')
    expect(select).toHaveTextContent('v1.0.0')
  })

  it('keeps separately adopted simulations independent even when they share a model id', async () => {
    vi.mocked(abmClient.listSimulations).mockResolvedValueOnce({
      simulations: [
        simulation({ id: 'sim-a', lineageId: 'sim-a', name: 'Wildfire single point' }),
        simulation({ id: 'sim-b', lineageId: 'sim-b', name: 'Wildfire multi point' }),
      ],
    })

    render(<SimulationManagerPanel activeProjectId={project.id} activeSimId="sim-b" />)

    await waitFor(() => {
      expect(screen.getAllByTestId('simulation-manager-item')).toHaveLength(2)
    })
    expect(screen.getAllByText('1 version(s)')).toHaveLength(2)
  })

  it('keeps version dropdown changes local until the user opens the workbench', async () => {
    render(<SimulationManagerPanel activeProjectId={project.id} activeSimId="sim-2" />)

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sim-1' } })
    expect(useAbmStore.getState().activeSimId).toBe('sim-2')

    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(useAbmStore.getState().activeSimId).toBe('sim-1')
  })

  it('renames, duplicates, and deletes a managed simulation card', async () => {
    render(<SimulationManagerPanel activeProjectId={project.id} activeSimId="sim-2" />)

    await waitFor(() => {
      expect(screen.getByText('谣言传播模型')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Rename simulation' }))
    fireEvent.change(screen.getByPlaceholderText('Enter simulation name'), { target: { value: '改名后的模型' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(abmClient.updateSimulation).toHaveBeenCalledWith('sim-2', { name: '改名后的模型' })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate simulation' }))
    await waitFor(() => {
      expect(abmClient.createSimulation).toHaveBeenCalledWith(
        project.id,
        expect.objectContaining({ name: '谣言传播模型 copy', seed: 43, steps: 80 }),
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete simulation' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(abmClient.deleteSimulation).toHaveBeenCalledWith('sim-2')
      expect(abmClient.deleteSimulation).toHaveBeenCalledWith('sim-1')
    })
    expect(abmClient.deleteSimulation).toHaveBeenCalledTimes(2)
    expect(useAbmStore.getState().activeSimId).toBeNull()
  })
})
