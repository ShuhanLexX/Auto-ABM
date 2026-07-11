import { describe, expect, it } from 'vitest'
import { parseAbmCard } from './abmCard'

describe('parseAbmCard', () => {
  it('parses a proposal_batch envelope from a JSON string', () => {
    const content = JSON.stringify({
      abmCard: 'proposal_batch',
      proposals: [
        { id: 'p1', mechanismSummary: 'spread', keyParams: { rate: 0.3 }, expectedMacro: 'S-curve', oddExcerpt: 'odd' },
        { id: 'p2', mechanismSummary: 'decay', keyParams: {}, expectedMacro: 'decline', oddExcerpt: '' },
      ],
    })
    const card = parseAbmCard(content)
    expect(card?.kind).toBe('proposal_batch')
    if (card?.kind === 'proposal_batch') {
      expect(card.proposals).toHaveLength(2)
      expect(card.proposals[0]?.keyParams).toEqual({ rate: 0.3 })
    }
  })

  it('keeps a trial only when it has runId + sparkline', () => {
    const content = JSON.stringify({
      abmCard: 'proposal_batch',
      proposals: [
        { id: 'p1', mechanismSummary: 'x', expectedMacro: 'y', trial: { runId: 'r1', sparkline: [0, 1, 2] } },
        { id: 'p2', mechanismSummary: 'x', expectedMacro: 'y', trial: { runId: 'r2' } },
      ],
    })
    const card = parseAbmCard(content)
    if (card?.kind === 'proposal_batch') {
      expect(card.proposals[0]?.trial).toEqual({ runId: 'r1', sparkline: [0, 1, 2] })
      expect(card.proposals[1]?.trial).toBeUndefined()
    }
  })

  it('parses an explanation envelope with runId and evidence', () => {
    const content = JSON.stringify({
      abmCard: 'explanation',
      text: 'Infections peaked at tick 5.',
      evidence: [{ tick: 5, metric: 'infected', value: 0.6 }],
      speculative: false,
      runId: 'run-1',
      from: 0,
      to: 10,
    })
    const card = parseAbmCard(content)
    expect(card?.kind).toBe('explanation')
    if (card?.kind === 'explanation') {
      expect(card.text).toContain('peaked')
      expect(card.evidence).toHaveLength(1)
      expect(card.runId).toBe('run-1')
      expect(card.speculative).toBe(false)
    }
  })

  it('parses an envelope nested in content blocks', () => {
    const content = [{ type: 'text', text: JSON.stringify({ abmCard: 'explanation', text: 'hi', evidence: [], speculative: true }) }]
    const card = parseAbmCard(content)
    expect(card?.kind).toBe('explanation')
    if (card?.kind === 'explanation') expect(card.speculative).toBe(true)
  })

  it('parses an attribution envelope with contributions and coverage', () => {
    const content = JSON.stringify({
      abmCard: 'attribution',
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
        { mechanism_id: 'bogus-without-id' },
        { gains: 1 },
      ],
    })
    const card = parseAbmCard(content)
    expect(card?.kind).toBe('attribution')
    if (card?.kind === 'attribution') {
      expect(card.supported).toBe(true)
      expect(card.coverage).toBeCloseTo(0.92)
      // The malformed row without mechanism_id string is dropped; partial rows default to 0.
      expect(card.contributions).toHaveLength(2)
      expect(card.contributions[0]).toEqual({ mechanism_id: 'spread', gains: 30, losses: 0, net: 30, agents: 28 })
    }
  })

  it('parses an unsupported attribution without fabricating numbers', () => {
    const card = parseAbmCard(JSON.stringify({
      abmCard: 'attribution',
      runId: 'run-1',
      metric: 'gini',
      from: 0,
      to: 10,
      supported: false,
      reason: '无法映射',
      actualDelta: null,
      attributedNet: 0,
      residual: null,
      coverage: null,
      contributions: [],
    }))
    expect(card?.kind).toBe('attribution')
    if (card?.kind === 'attribution') {
      expect(card.supported).toBe(false)
      expect(card.reason).toBe('无法映射')
      expect(card.actualDelta).toBeNull()
    }
  })

  it('parses a counterfactual envelope with the comparison table', () => {
    const content = JSON.stringify({
      abmCard: 'counterfactual',
      baseRunId: 'run-base',
      runId: 'run-cf',
      changed: { beta: 0.6 },
      seed: 42,
      steps: 50,
      status: 'completed',
      divergenceTick: 7,
      metrics: [
        { metric: 'infected', baseFinal: 30, otherFinal: 48, finalDelta: 18, maxAbsDelta: 21, maxAbsDeltaTick: 33 },
        { notAMetric: true },
      ],
    })
    const card = parseAbmCard(content)
    expect(card?.kind).toBe('counterfactual')
    if (card?.kind === 'counterfactual') {
      expect(card.changed).toEqual({ beta: 0.6 })
      expect(card.divergenceTick).toBe(7)
      expect(card.metrics).toHaveLength(1)
      expect(card.metrics[0]?.finalDelta).toBe(18)
    }
  })

  it('defaults an unknown counterfactual status to failed', () => {
    const card = parseAbmCard(JSON.stringify({
      abmCard: 'counterfactual',
      baseRunId: 'a',
      runId: 'b',
      changed: {},
      seed: 1,
      steps: 10,
      status: 'weird',
      metrics: [],
    }))
    expect(card?.kind).toBe('counterfactual')
    if (card?.kind === 'counterfactual') expect(card.status).toBe('failed')
  })

  it('returns null for non-ABM content', () => {
    expect(parseAbmCard('plain tool output')).toBeNull()
    expect(parseAbmCard(JSON.stringify({ foo: 'bar' }))).toBeNull()
    expect(parseAbmCard(JSON.stringify({ abmCard: 'proposal_batch', proposals: [] }))).toBeNull()
    expect(parseAbmCard(undefined)).toBeNull()
  })
})
