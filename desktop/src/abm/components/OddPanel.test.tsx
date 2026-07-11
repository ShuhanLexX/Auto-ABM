import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Odd, OddSectionKey } from '../types'
import { ODD_SECTION_KEYS } from '../types'
import { useSelectionStore } from '../stores/selectionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { OddPanel, sectionForEvidence } from './OddPanel'

function makeOdd(overrides: Partial<Record<OddSectionKey, { text: string; derived: boolean; needsReview?: boolean }>> = {}): Odd {
  const sections = {} as Odd['sections']
  for (const key of ODD_SECTION_KEYS) {
    sections[key] = overrides[key] ?? { text: `${key} text`, derived: true }
  }
  return { schemaVersion: 1, modelId: 'rumor', modelVersion: '2', generatedAt: 'now', sections }
}

beforeEach(() => {
  // jsdom has no scrollIntoView
  Element.prototype.scrollIntoView = vi.fn()
  useSelectionStore.getState().clear()
  useSettingsStore.setState({ locale: 'en' })
})

afterEach(() => {
  cleanup()
  useSelectionStore.getState().clear()
})

describe('sectionForEvidence', () => {
  it('maps a fired mechanism to Submodels and a metric to Process', () => {
    expect(sectionForEvidence({ runId: 'r', tick: 1, mechanism_id: 'm' })).toBe('submodels')
    expect(sectionForEvidence({ runId: 'r', tick: 1, metric: 'infected' })).toBe('process')
    expect(sectionForEvidence(null)).toBeNull()
  })
})

describe('OddPanel', () => {
  it('renders all seven ODD sections', () => {
    render(<OddPanel odd={makeOdd()} />)
    for (const key of ODD_SECTION_KEYS) {
      expect(screen.getByTestId(`odd-section-${key}`)).toBeTruthy()
    }
  })

  it('localizes the ODD section directory from the system language', () => {
    const { rerender } = render(<OddPanel odd={makeOdd()} />)
    expect(screen.getAllByText('Purpose').length).toBeGreaterThan(0)
    expect(screen.queryByText('目的')).toBeNull()

    act(() => {
      useSettingsStore.setState({ locale: 'zh' })
    })
    rerender(<OddPanel odd={makeOdd()} />)
    expect(screen.getAllByText('目的').length).toBeGreaterThan(0)
  })

  it('shows an empty state when there is no ODD', () => {
    render(<OddPanel odd={null} />)
    expect(screen.getByTestId('odd-panel-empty')).toBeTruthy()
  })

  it('flags a hand-written section that needs review', () => {
    render(<OddPanel odd={makeOdd({ purpose: { text: 'mine', derived: false, needsReview: true } })} />)
    expect(screen.getByTestId('odd-needs-review-purpose')).toBeTruthy()
  })

  it('highlights the Submodels section when a mechanism evidence focus arrives for the run', () => {
    render(<OddPanel odd={makeOdd()} runId="run-1" />)
    act(() => {
      useSelectionStore.getState().setEvidenceFocus({ runId: 'run-1', tick: 4, mechanism_id: 'spread' })
    })
    expect(screen.getByTestId('odd-section-submodels').getAttribute('data-focused')).toBe('true')
  })

  it('ignores an evidence focus for a different run', () => {
    render(<OddPanel odd={makeOdd()} runId="run-1" />)
    act(() => {
      useSelectionStore.getState().setEvidenceFocus({ runId: 'other', tick: 4, mechanism_id: 'spread' })
    })
    expect(screen.getByTestId('odd-section-submodels').getAttribute('data-focused')).toBeNull()
  })

  it('fires onExplainSection from a section explain entry when a run is present', () => {
    const onExplain = vi.fn()
    render(<OddPanel odd={makeOdd()} runId="run-1" onExplainSection={onExplain} />)
    fireEvent.click(screen.getByTestId('odd-explain-process'))
    expect(onExplain).toHaveBeenCalledWith('process')
  })

  it('hides explain entries when no run is available', () => {
    render(<OddPanel odd={makeOdd()} onExplainSection={vi.fn()} />)
    expect(screen.queryByTestId('odd-explain-process')).toBeNull()
  })
})
