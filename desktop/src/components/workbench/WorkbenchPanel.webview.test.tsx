// Integration test: proves the native child webview is torn down when
// the unified workbench switches from browser mode to file mode. Uses the REAL
// BrowserSurface so the unmount-cleanup path that closes the webview is exercised.
import '@testing-library/jest-dom'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

const { bridge } = vi.hoisted(() => ({
  bridge: {
    open: vi.fn(),
    navigate: vi.fn(),
    setBounds: vi.fn(),
    setVisible: vi.fn(),
    close: vi.fn(),
    eval: vi.fn(),
  },
}))
vi.mock('../../lib/previewBridge', () => ({ previewBridge: bridge }))
vi.mock('@tauri-apps/api/event', () => ({ listen: () => Promise.resolve(() => {}) }))

// Keep the file workspace a lightweight stub — this test is about the webview.
vi.mock('../workspace/WorkspacePanel', () => ({
  WorkspacePanel: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="workspace-panel">workspace:{sessionId}</div>
  ),
}))

import { WorkbenchPanel } from './WorkbenchPanel'
import { useWorkspacePanelStore } from '../../stores/workspacePanelStore'
import { useBrowserPanelStore } from '../../stores/browserPanelStore'
import { useSettingsStore } from '../../stores/settingsStore'

const SESSION_ID = 'webview-session'

beforeEach(() => {
  useWorkspacePanelStore.setState(useWorkspacePanelStore.getInitialState(), true)
  useBrowserPanelStore.setState(useBrowserPanelStore.getInitialState(), true)
  useSettingsStore.setState({ locale: 'en' })
  // open() opens the workbench in browser mode (and records the url for BrowserSurface).
  useBrowserPanelStore.getState().open(SESSION_ID, 'http://localhost:5173/')
})

afterEach(() => {
  cleanup()
  Object.values(bridge).forEach((f) => f.mockReset())
  useWorkspacePanelStore.setState(useWorkspacePanelStore.getInitialState(), true)
  useBrowserPanelStore.setState(useBrowserPanelStore.getInitialState(), true)
})

describe('WorkbenchPanel native webview lifecycle', () => {
  it('shows the webview in browser mode and hides it when switching to file mode', () => {
    render(<WorkbenchPanel sessionId={SESSION_ID} />)

    // Browser mode mounts BrowserSurface, which opens + shows the native webview.
    expect(screen.getByTestId('preview-host')).toBeInTheDocument()
    expect(bridge.open).toHaveBeenCalledWith(
      'http://localhost:5173/',
      expect.objectContaining({ width: expect.any(Number) }),
    )
    expect(bridge.setVisible).toHaveBeenCalledWith(true)

    bridge.close.mockClear()

    // Switch to the file tab: BrowserSurface unmounts, closing the webview overlay.
    act(() => {
      fireEvent.click(screen.getByRole('tab', { name: 'Files' }))
    })

    expect(screen.queryByTestId('preview-host')).not.toBeInTheDocument()
    expect(screen.getByTestId('workspace-panel')).toBeInTheDocument()
    expect(bridge.close).toHaveBeenCalled()
  })
})
