import { beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AttributionCard } from './AttributionCard'
import { useSelectionStore } from '../stores/selectionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { UIMessage } from '../../types/chat'

type AttributionMessage = Extract<UIMessage, { type: 'abm_attribution' }>

function message(overrides: Partial<AttributionMessage> = {}): AttributionMessage {
  return {
    id: 'm1',
    type: 'abm_attribution',
    runId: 'run-1',
    metric: 'infected',
    from: 0,
    to: 40,
    supported: true,
    actualDelta: 24,
    attributedNet: 22,
    residual: 2,
    coverage: 0.92,
    contributions: [
      { mechanism_id: 'spread', gains: 30, losses: 0, net: 30, agents: 28 },
      { mechanism_id: 'recover', gains: 0, losses: 8, net: -8, agents: 8 },
    ],
    timestamp: Date.now(),
    ...overrides,
  }
}

describe('AttributionCard', () => {
  beforeEach(() => {
    cleanup()
    useSettingsStore.setState({ locale: 'en' })
    useSelectionStore.setState({ selection: null, replay: null, evidenceFocus: null })
  })

  it('renders the decomposition summary, coverage and signed rows', () => {
    render(<AttributionCard message={message()} />)
    const card = screen.getByTestId('attribution-card')
    expect(card).toHaveTextContent('Mechanism Attribution · infected')
    expect(card).toHaveTextContent('tick 0–40')
    expect(card).toHaveTextContent('+24')
    expect(card).toHaveTextContent('92%')

    const rows = screen.getAllByTestId('attribution-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('spread')
    expect(rows[0]).toHaveTextContent('+30')
    expect(rows[1]).toHaveTextContent('recover')
    expect(rows[1]).toHaveTextContent('-8')
  })

  it('clicking a mechanism row focuses it as trace evidence', () => {
    render(<AttributionCard message={message()} />)
    fireEvent.click(screen.getAllByTestId('attribution-row')[0]!)
    expect(useSelectionStore.getState().evidenceFocus).toEqual({
      runId: 'run-1',
      tick: 40,
      mechanism_id: 'spread',
    })
  })

  it('shows the honest unsupported state instead of fabricating flows', () => {
    render(
      <AttributionCard
        message={message({
          supported: false,
          reason: '观测指标 gini 无法映射到任何智能体状态变量',
          contributions: [],
          coverage: null,
          residual: null,
        })}
      />,
    )
    expect(screen.getByTestId('attribution-unsupported')).toHaveTextContent('gini')
    expect(screen.queryAllByTestId('attribution-row')).toHaveLength(0)
  })
})
