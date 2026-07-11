import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useAbmStore } from '../stores/abmStore'
import { useChatStore } from '../../stores/chatStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useTabStore } from '../../stores/tabStore'
import { AbmModeSelector } from './AbmModeSelector'

describe('AbmModeSelector', () => {
  afterEach(() => {
    cleanup()
    useAbmStore.setState(useAbmStore.getInitialState(), true)
    useChatStore.setState(useChatStore.getInitialState(), true)
    useSettingsStore.setState({ locale: 'en' })
    useTabStore.setState(useTabStore.getInitialState(), true)
  })

  it('switches the product interaction mode from the chat composer', () => {
    useAbmStore.setState({ mode: 'research' })

    render(<AbmModeSelector />)

    fireEvent.click(screen.getByTestId('abm-mode-selector'))
    fireEvent.click(screen.getByText('Dialogue mode'))

    expect(useAbmStore.getState().mode).toBe('dialogue')
  })

  it('enables autonomous exploration mode', () => {
    useAbmStore.setState({ mode: 'research' })

    render(<AbmModeSelector />)

    fireEvent.click(screen.getByTestId('abm-mode-selector'))
    fireEvent.click(screen.getByText('Autonomous exploration'))

    expect(useAbmStore.getState().mode).toBe('autonomous')
  })

  it('uses accept-edits permissions for autonomous exploration sessions', () => {
    const setSessionPermissionMode = vi.fn()
    useAbmStore.setState({ mode: 'research' })
    useTabStore.setState({ activeTabId: 'session-1' })
    useChatStore.setState({
      sessions: { 'session-1': {} } as never,
      setSessionPermissionMode,
    })

    render(<AbmModeSelector />)

    fireEvent.click(screen.getByTestId('abm-mode-selector'))
    fireEvent.click(screen.getByText('Autonomous exploration'))

    expect(setSessionPermissionMode).toHaveBeenCalledWith('session-1', 'acceptEdits')
  })
})
