import { describe, expect, it } from 'vitest'
import { parseHostMessage, serializeAgentMessage } from './protocol'

describe('preview-agent protocol', () => {
  it('serializes agent→host messages to a stable envelope', () => {
    expect(JSON.parse(serializeAgentMessage({ type: 'ready' }))).toEqual({ v: 1, type: 'ready' })
    expect(JSON.parse(serializeAgentMessage({ type: 'navigated', url: 'http://x/', title: 'T' })))
      .toEqual({ v: 1, type: 'navigated', url: 'http://x/', title: 'T' })
  })
  it('parses host→agent messages and rejects unknown/garbage', () => {
    expect(parseHostMessage('{"v":1,"type":"enter-picker"}')).toEqual({ type: 'enter-picker' })
    expect(parseHostMessage('not json')).toBeNull()
    expect(parseHostMessage('{"v":1,"type":"nope"}')).toBeNull()
  })
})
