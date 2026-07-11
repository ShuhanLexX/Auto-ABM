import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const respondToPermission = vi.hoisted(() => vi.fn())

const chatState = vi.hoisted(() => ({
  respondToPermission,
  sessions: { 's1': { pendingPermission: { requestId: 'req-1' } } },
}))

vi.mock('../../stores/chatStore', () => ({
  useChatStore: Object.assign(
    (selector?: (s: typeof chatState) => unknown) => (selector ? selector(chatState) : chatState),
    { getState: () => chatState },
  ),
}))

vi.mock('../../stores/tabStore', () => ({
  useTabStore: (selector?: (s: { activeTabId: string }) => unknown) =>
    selector ? selector({ activeTabId: 's1' }) : { activeTabId: 's1' },
}))

vi.mock('../../i18n', () => ({
  useTranslation: () => (k: string, v?: Record<string, string | number>) =>
    v ? `${k}:${Object.values(v).join(',')}` : k,
}))

import { PermissionDialog } from './PermissionDialog'

const editModelInput = {
  modelId: 'rumor',
  fromVersion: '1',
  toVersion: '2',
  structural: true,
  changes: [{ path: 'mechanisms.spread', op: 'modified', before: 'linear', after: 'threshold' }],
  oddImpact: ['Process'],
}

describe('PermissionDialog · abm_edit_model', () => {
  afterEach(() => {
    cleanup()
    respondToPermission.mockClear()
  })

  it('renders a ModelDiffPreview for a structural model change request', () => {
    render(<PermissionDialog sessionId="s1" requestId="req-1" toolName="abm_edit_model" input={editModelInput} />)
    expect(screen.getByTestId('model-diff-preview')).toBeTruthy()
    expect(screen.getByTestId('model-diff-version').textContent).toContain('v2')
  })

  it('approving forwards the original request id through the existing permission channel', () => {
    render(<PermissionDialog sessionId="s1" requestId="req-1" toolName="abm_edit_model" input={editModelInput} />)
    fireEvent.click(screen.getByText('permission.allow'))
    expect(respondToPermission).toHaveBeenCalledWith('s1', 'req-1', true)
  })

  it('falls back to the generic preview when the diff is unparseable', () => {
    render(<PermissionDialog sessionId="s1" requestId="req-1" toolName="abm_edit_model" input={{ changes: [] }} />)
    expect(screen.queryByTestId('model-diff-preview')).toBeNull()
  })
})
