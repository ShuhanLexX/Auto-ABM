import { describe, expect, test } from 'bun:test'

import {
  assembleAttribution,
  assembleMechanismActivity,
  detectChangepoints,
  mapObserverToState,
} from '../attributionService.js'
import type { TraceRecord } from '../traceRead.js'
import type { ModelConfig } from '../types.js'

const RUMOR_LIKE_CONFIG: ModelConfig = {
  id: 'rumor',
  version: '1.0.0',
  agents: [
    {
      id: 'person',
      name: '个体',
      state_variables: [
        {
          name: 'state',
          dtype: 'categorical',
          default: 'susceptible',
          choices: ['susceptible', 'infected', 'recovered'],
        },
        { name: 'energy', dtype: 'float', default: 1 },
      ],
      behavior_refs: ['spread', 'recover'],
    },
  ],
  observers: [
    { id: 'infected', name: '感染人数', level: 'macro', dtype: 'int' },
    { id: 'energy', name: '总能量', level: 'macro', dtype: 'float' },
    { id: 'gini', name: '基尼系数', level: 'macro', dtype: 'float' },
  ],
  mechanisms: [],
  parameters: [],
}

function fired(
  tick: number,
  mechanismId: string,
  agentId: number,
  key: string,
  old: unknown,
  next: unknown,
): TraceRecord {
  return {
    kind: 'mechanism_fired',
    tick,
    mechanism_id: mechanismId,
    agent_ids: [agentId],
    key,
    old,
    new: next,
  }
}

function metrics(tick: number, values: Record<string, number>): TraceRecord {
  return { kind: 'tick_metrics', tick, metrics: values }
}

describe('mapObserverToState', () => {
  test('maps a categorical-choice observer to its state variable and value', () => {
    expect(mapObserverToState(RUMOR_LIKE_CONFIG, 'infected')).toEqual({
      stateKey: 'state',
      mode: 'categorical',
      value: 'infected',
    })
  })

  test('maps a numeric observer by state-variable name', () => {
    expect(mapObserverToState(RUMOR_LIKE_CONFIG, 'energy')).toEqual({
      stateKey: 'energy',
      mode: 'numeric',
    })
  })

  test('returns null for an unmappable derived metric', () => {
    expect(mapObserverToState(RUMOR_LIKE_CONFIG, 'gini')).toBeNull()
  })
})

describe('assembleAttribution', () => {
  test('decomposes a categorical metric delta into signed per-mechanism flows', () => {
    const records: TraceRecord[] = [
      metrics(0, { infected: 3 }),
      fired(1, 'spread', 1, 'state', 'susceptible', 'infected'),
      fired(1, 'spread', 2, 'state', 'susceptible', 'infected'),
      fired(2, 'spread', 3, 'state', 'susceptible', 'infected'),
      fired(2, 'recover', 1, 'state', 'infected', 'recovered'),
      metrics(2, { infected: 5 }),
    ]
    const result = assembleAttribution({
      runId: 'r1',
      metric: 'infected',
      from: 0,
      to: 2,
      mapping: { stateKey: 'state', mode: 'categorical', value: 'infected' },
      records,
    })
    expect(result.supported).toBe(true)
    expect(result.actualDelta).toBe(2)
    expect(result.attributedNet).toBe(2)
    expect(result.residual).toBe(0)
    expect(result.coverage).toBe(1)
    expect(result.contributions).toEqual([
      { mechanism_id: 'spread', gains: 3, losses: 0, net: 3, agents: 3 },
      { mechanism_id: 'recover', gains: 0, losses: 1, net: -1, agents: 1 },
    ])
  })

  test('counts transitions in (start, end] only', () => {
    const records: TraceRecord[] = [
      fired(1, 'spread', 1, 'state', 'susceptible', 'infected'),
      metrics(1, { infected: 4 }),
      fired(2, 'spread', 2, 'state', 'susceptible', 'infected'),
      metrics(3, { infected: 5 }),
      fired(4, 'spread', 3, 'state', 'susceptible', 'infected'),
    ]
    const result = assembleAttribution({
      runId: 'r1',
      metric: 'infected',
      from: 1,
      to: 3,
      mapping: { stateKey: 'state', mode: 'categorical', value: 'infected' },
      records,
    })
    // Tick-1 firing precedes the first metric anchor; tick-4 is out of window.
    expect(result.attributedNet).toBe(1)
    expect(result.actualDelta).toBe(1)
  })

  test('accumulates numeric flows for numeric-state metrics', () => {
    const records: TraceRecord[] = [
      metrics(0, { energy: 10 }),
      fired(1, 'work', 1, 'energy', 5, 3),
      fired(2, 'eat', 1, 'energy', 3, 6),
      metrics(2, { energy: 11 }),
    ]
    const result = assembleAttribution({
      runId: 'r1',
      metric: 'energy',
      from: 0,
      to: 2,
      mapping: { stateKey: 'energy', mode: 'numeric' },
      records,
    })
    expect(result.contributions).toEqual([
      { mechanism_id: 'eat', gains: 3, losses: 0, net: 3, agents: 1 },
      { mechanism_id: 'work', gains: 0, losses: 2, net: -2, agents: 1 },
    ])
    expect(result.attributedNet).toBe(1)
    expect(result.residual).toBe(0)
  })

  test('flags legacy traces without transition fields as unsupported', () => {
    const records: TraceRecord[] = [
      metrics(0, { infected: 1 }),
      { kind: 'mechanism_fired', tick: 1, mechanism_id: 'spread', agent_ids: [1] },
      metrics(1, { infected: 2 }),
    ]
    const result = assembleAttribution({
      runId: 'r1',
      metric: 'infected',
      from: 0,
      to: 1,
      mapping: { stateKey: 'state', mode: 'categorical', value: 'infected' },
      records,
    })
    expect(result.supported).toBe(false)
    expect(result.reason).toContain('旧版内核')
  })

  test('flags unmappable metrics as unsupported without fabricating flows', () => {
    const result = assembleAttribution({
      runId: 'r1',
      metric: 'gini',
      from: 0,
      to: 5,
      mapping: null,
      records: [metrics(0, { gini: 0.2 }), metrics(5, { gini: 0.4 })],
    })
    expect(result.supported).toBe(false)
    expect(result.contributions).toEqual([])
    expect(result.actualDelta).toBeCloseTo(0.2)
  })

  test('reports residual for metric changes no mechanism caused', () => {
    const records: TraceRecord[] = [
      metrics(0, { infected: 0 }),
      fired(1, 'spread', 1, 'state', 'susceptible', 'infected'),
      metrics(2, { infected: 3 }),
    ]
    const result = assembleAttribution({
      runId: 'r1',
      metric: 'infected',
      from: 0,
      to: 2,
      mapping: { stateKey: 'state', mode: 'categorical', value: 'infected' },
      records,
    })
    expect(result.attributedNet).toBe(1)
    expect(result.residual).toBe(2)
    expect(result.coverage).toBeCloseTo(1 / 3)
  })
})

describe('assembleMechanismActivity', () => {
  test('aggregates firing counts, agent reach, and bucketed series', () => {
    const records: TraceRecord[] = [
      fired(0, 'seed', 1, 'state', 'susceptible', 'infected'),
      fired(1, 'spread', 2, 'state', 'susceptible', 'infected'),
      fired(1, 'spread', 3, 'state', 'susceptible', 'infected'),
      fired(2, 'spread', 2, 'state', 'susceptible', 'infected'),
    ]
    const result = assembleMechanismActivity({ runId: 'r1', from: 0, to: 2, records })
    expect(result.bucketSize).toBe(1)
    const spread = result.mechanisms.find((m) => m.mechanism_id === 'spread')
    expect(spread).toEqual({
      mechanism_id: 'spread',
      total: 3,
      agents: 2,
      firstTick: 1,
      lastTick: 2,
      series: [
        { tick: 1, count: 2 },
        { tick: 2, count: 1 },
      ],
    })
    // sorted by total desc → spread first
    expect(result.mechanisms[0]!.mechanism_id).toBe('spread')
  })

  test('derives the window end from data when to is unbounded', () => {
    const records: TraceRecord[] = [fired(7, 'spread', 1, 'state', 'a', 'b')]
    const result = assembleMechanismActivity({
      runId: 'r1',
      from: 0,
      to: Number.POSITIVE_INFINITY,
      records,
    })
    expect(result.to).toBe(7)
  })
})

describe('detectChangepoints', () => {
  test('finds the takeoff tick of a logistic-like curve', () => {
    // flat → sharp rise at tick 30 → plateau
    const series = Array.from({ length: 60 }, (_, tick) => ({
      tick,
      value: tick < 30 ? 2 : tick < 40 ? 2 + (tick - 30) * 12 : 122,
    }))
    const found = detectChangepoints('infected', series)
    expect(found.length).toBeGreaterThan(0)
    const ticks = found.map((c) => c.tick)
    expect(ticks.some((t) => Math.abs(t - 30) <= 4)).toBe(true)
    for (const cp of found) {
      expect(cp.metric).toBe('infected')
      expect(cp.score).toBeGreaterThanOrEqual(3)
    }
  })

  test('returns nothing for a flat series', () => {
    const series = Array.from({ length: 50 }, (_, tick) => ({ tick, value: 5 }))
    expect(detectChangepoints('flat', series)).toEqual([])
  })

  test('returns nothing for a uniform linear trend', () => {
    const series = Array.from({ length: 50 }, (_, tick) => ({ tick, value: tick * 2 }))
    expect(detectChangepoints('linear', series)).toEqual([])
  })

  test('labels a peak-then-decline as a reversal', () => {
    const series = Array.from({ length: 61 }, (_, tick) => ({
      tick,
      value: tick <= 30 ? tick * 4 : 120 - (tick - 30) * 4,
    }))
    const found = detectChangepoints('infected', series)
    expect(found.some((c) => c.direction === 'reversal' && Math.abs(c.tick - 30) <= 4)).toBe(true)
  })

  test('is deterministic', () => {
    const series = Array.from({ length: 80 }, (_, tick) => ({
      tick,
      value: Math.sin(tick / 6) * 10 + (tick > 40 ? tick : 0),
    }))
    expect(detectChangepoints('m', series)).toEqual(detectChangepoints('m', series))
  })
})
