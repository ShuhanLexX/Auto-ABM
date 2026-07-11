import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { browserHost } from '../../lib/desktopHost/browserHost'

vi.mock('../api/abmClient', () => ({
  abmClient: { exportSimulation: vi.fn() },
}))

const hostOpenPath = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

import { abmClient } from '../api/abmClient'
import { useAbmStore } from '../stores/abmStore'
import { ExportDialog } from './ExportDialog'
import type { ExportResult } from '../types'

function result(): ExportResult {
  return {
    exportId: 'x1',
    packageDir: '/tmp/abm/exports/s1/x1',
    manifest: {
      schema_version: '1',
      project_id: 'p1',
      sim_id: 's1',
      auto_abm_version: '999.0.0-local',
      kernel_version: '0.1.0',
      created_at: 'now',
      includes: ['model/config.json', 'odd.md', 'runs/r1.json'],
      checksums: {},
      runs: [{ id: 'r1', seed: 1, steps: 5, params: {}, model_id: 'm', model_version: '1' }],
    },
  }
}

describe('ExportDialog', () => {
  beforeEach(() => {
    useAbmStore.setState({ mode: 'research' })
    vi.clearAllMocks()
    window.desktopHost = {
      ...browserHost,
      kind: 'electron',
      isDesktop: true,
      capabilities: {
        ...browserHost.capabilities,
        shell: true,
      },
      shell: {
        ...browserHost.shell,
        openPath: hostOpenPath,
      },
    }
  })

  afterEach(() => {
    cleanup()
    useAbmStore.setState({ mode: 'research' })
    window.desktopHost = undefined
  })

  it('confirms then exports and shows a package summary', async () => {
    vi.mocked(abmClient.exportSimulation).mockResolvedValue(result())
    render(<ExportDialog simId="s1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Export Reproducible Package' }))
    // Confirmation dialog opened; confirm it.
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))

    await waitFor(() => expect(abmClient.exportSimulation).toHaveBeenCalledWith('s1', { includeTraces: false }))
    await waitFor(() => expect(screen.getByTestId('export-result')).toBeTruthy())
    expect(screen.getByTestId('export-result').textContent).toContain('3 file')
    expect(screen.getByTestId('export-result').textContent).toContain('1 run')
    expect(screen.getByTestId('export-result').textContent).not.toContain('/tmp/abm/exports/s1/x1')

    fireEvent.click(screen.getByRole('button', { name: 'View folder' }))
    await waitFor(() => expect(hostOpenPath).toHaveBeenCalledWith('/tmp/abm/exports/s1/x1'))
  })

  it('passes includeTraces when the box is checked', async () => {
    vi.mocked(abmClient.exportSimulation).mockResolvedValue(result())
    render(<ExportDialog simId="s1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Export Reproducible Package' }))
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))

    await waitFor(() =>
      expect(abmClient.exportSimulation).toHaveBeenCalledWith('s1', { includeTraces: true }),
    )
  })

  it('is disabled in dialogue (read-only) mode', () => {
    useAbmStore.setState({ mode: 'dialogue' })
    render(<ExportDialog simId="s1" />)
    const trigger = screen.getByRole('button', { name: 'Export Reproducible Package' })
    expect((trigger as HTMLButtonElement).disabled).toBe(true)
  })
})
