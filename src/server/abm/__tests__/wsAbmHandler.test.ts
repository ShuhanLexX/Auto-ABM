import { describe, expect, test } from 'bun:test'
import { frameToOutgoing } from '../wsAbmHandler.js'
import type { KernelFrame } from '../kernelProcess.js'

describe('frameToOutgoing', () => {
  test('maps run_meta to an abm_run_status json message', () => {
    const out = frameToOutgoing({ frame: 'run_meta', run_id: 'r1', seed: 7, steps: 50 })
    expect(out).toEqual([
      { kind: 'json', message: { type: 'abm_run_status', runId: 'r1', state: 'running', tick: 0, totalSteps: 50 } },
    ])
  })

  test('maps tick to abm_tick json', () => {
    const out = frameToOutgoing({ frame: 'tick', run_id: 'r1', tick: 3, metrics: { infected: 0.2 } })
    expect(out).toEqual([
      { kind: 'json', message: { type: 'abm_tick', runId: 'r1', tick: 3, metrics: { infected: 0.2 } } },
    ])
  })

  test('maps a network meta frame to abm_meta with camelCased fields', () => {
    const frame: KernelFrame = {
      frame: 'meta',
      run_id: 'r1',
      space: 'network',
      palette: ['S', 'I'],
      network: { count: 4, edge_count: 3, layout_b64: 'AAA=', edges_b64: 'BBB=' },
    }
    const out = frameToOutgoing(frame)
    expect(out).toEqual([
      {
        kind: 'json',
        message: {
          type: 'abm_meta',
          runId: 'r1',
          space: 'network',
          palette: ['S', 'I'],
          network: { count: 4, edgeCount: 3, layoutB64: 'AAA=', edgesB64: 'BBB=' },
        },
      },
    ])
  })

  test('decodes a b64 snapshot frame into a single binary message', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5])
    const b64 = Buffer.from(bytes).toString('base64')
    const out = frameToOutgoing({ frame: 'snapshot', run_id: 'r1', tick: 1, encoding: 'b64', b64 })

    expect(out).toHaveLength(1)
    expect(out[0]!.kind).toBe('binary')
    if (out[0]!.kind === 'binary') {
      expect(Array.from(out[0]!.bytes)).toEqual([1, 2, 3, 4, 5])
    }
  })

  test('run_done emits both the record and a completed status', () => {
    const record = {
      id: 'r1',
      model_id: 'm',
      model_version: '1',
      kernel_version: 'k',
      seed: 7,
      parameters: {},
      steps: 5,
      status: 'completed' as const,
      metrics_summary: {},
    }
    const out = frameToOutgoing({ frame: 'run_done', run_id: 'r1', record })
    expect(out.map((o) => o.kind)).toEqual(['json', 'json'])
    expect(out[1]).toEqual({
      kind: 'json',
      message: { type: 'abm_run_status', runId: 'r1', state: 'completed' },
    })
  })

  test('error emits abm_error and a failed status', () => {
    const out = frameToOutgoing({ frame: 'error', run_id: 'r1', type: 'X', message: 'boom' })
    expect(out).toEqual([
      { kind: 'json', message: { type: 'abm_error', runId: 'r1', message: 'boom' } },
      { kind: 'json', message: { type: 'abm_run_status', runId: 'r1', state: 'failed' } },
    ])
  })
})
