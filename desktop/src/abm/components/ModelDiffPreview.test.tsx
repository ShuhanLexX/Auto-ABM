import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ModelDiffPreview, parseModelDiff, type ModelDiff } from './ModelDiffPreview'

afterEach(cleanup)

const sampleDiff: ModelDiff = {
  modelId: 'rumor',
  fromVersion: '1',
  toVersion: '2',
  structural: true,
  changes: [
    { path: 'mechanisms.spread', op: 'modified', before: 'linear', after: 'threshold' },
    { path: 'agents.count', op: 'added', after: 100 },
    { path: 'environment.decay', op: 'removed', before: 0.1 },
  ],
  oddImpact: ['Process', 'Submodels'],
}

describe('parseModelDiff', () => {
  it('parses a top-level diff and normalizes ops', () => {
    const diff = parseModelDiff({
      modelId: 'rumor',
      fromVersion: '1',
      toVersion: '2',
      structural: true,
      changes: [
        { path: 'a', op: 'add', after: 1 },
        { field: 'b', kind: 'deleted', before: 2 },
        { path: 'c', op: 'modified', before: 1, after: 2 },
      ],
    })
    expect(diff?.changes.map((c) => c.op)).toEqual(['added', 'removed', 'modified'])
    expect(diff?.changes[1]?.path).toBe('b')
  })

  it('parses a diff nested under `diff`', () => {
    const diff = parseModelDiff({ diff: { changes: [{ path: 'x', op: 'added', after: 1 }] } })
    expect(diff?.changes).toHaveLength(1)
  })

  it('returns null when there are no usable changes', () => {
    expect(parseModelDiff({ changes: [] })).toBeNull()
    expect(parseModelDiff({ changes: [{ noPath: true }] })).toBeNull()
    expect(parseModelDiff('nope')).toBeNull()
    expect(parseModelDiff(null)).toBeNull()
  })
})

describe('ModelDiffPreview', () => {
  it('renders the version bump and one row per change', () => {
    render(<ModelDiffPreview diff={sampleDiff} />)
    expect(screen.getByTestId('model-diff-version').textContent).toContain('v1')
    expect(screen.getByTestId('model-diff-version').textContent).toContain('v2')
    expect(screen.getAllByTestId('model-diff-change')).toHaveLength(3)
  })

  it('shows the before -> after for a modified field', () => {
    render(<ModelDiffPreview diff={sampleDiff} />)
    expect(screen.getByText('linear')).toBeTruthy()
    expect(screen.getByText('threshold')).toBeTruthy()
  })

  it('lists affected ODD sections', () => {
    render(<ModelDiffPreview diff={sampleDiff} />)
    expect(screen.getByText('Process')).toBeTruthy()
    expect(screen.getByText('Submodels')).toBeTruthy()
  })
})
