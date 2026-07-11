import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { UIMessage } from '../../types/chat'
import { useAbmStore } from '../stores/abmStore'
import { useSelectionStore } from '../stores/selectionStore'
import { ExplanationCard } from './ExplanationCard'

type ExplanationMessage = Extract<UIMessage, { type: 'abm_explanation' }>

function message(overrides: Partial<ExplanationMessage> = {}): ExplanationMessage {
  return {
    id: 'm1',
    type: 'abm_explanation',
    text: 'Infections rose sharply around tick 5.',
    evidence: [
      { tick: 5, metric: 'infected', value: 0.6 },
      { tick: 5, mechanism_id: 'infect' },
    ],
    speculative: false,
    runId: 'run-1',
    timestamp: Date.now(),
    ...overrides,
  }
}

describe('ExplanationCard', () => {
  beforeEach(() => {
    useSelectionStore.getState().clear()
    useAbmStore.setState({ activeRunId: null })
  })

  afterEach(() => {
    cleanup()
    useSelectionStore.getState().clear()
  })

  it('renders the narrative and one chip per evidence item', () => {
    render(<ExplanationCard message={message()} />)
    expect(screen.getByText(/Infections rose sharply/)).toBeTruthy()
    expect(screen.getAllByTestId('evidence-chip')).toHaveLength(2)
  })

  it('clicking an evidence chip sets the selection-store evidence focus', () => {
    render(<ExplanationCard message={message()} />)
    fireEvent.click(screen.getAllByTestId('evidence-chip')[0]!)
    const focus = useSelectionStore.getState().evidenceFocus
    expect(focus).toEqual({ runId: 'run-1', tick: 5, metric: 'infected' })
  })

  it('falls back to the active run id when the message has none', () => {
    useAbmStore.setState({ activeRunId: 'active-run' })
    render(<ExplanationCard message={message({ runId: undefined })} />)
    fireEvent.click(screen.getAllByTestId('evidence-chip')[1]!)
    expect(useSelectionStore.getState().evidenceFocus).toEqual({
      runId: 'active-run',
      tick: 5,
      mechanism_id: 'infect',
    })
  })

  it('shows a speculative badge when flagged', () => {
    render(<ExplanationCard message={message({ speculative: true })} />)
    expect(screen.getByTestId('explanation-speculative-badge')).toBeTruthy()
  })

  it('does not show a speculative badge for grounded explanations', () => {
    render(<ExplanationCard message={message({ speculative: false })} />)
    expect(screen.queryByTestId('explanation-speculative-badge')).toBeNull()
  })
})
