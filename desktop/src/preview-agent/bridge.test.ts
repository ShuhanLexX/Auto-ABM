import { describe, expect, it, vi } from 'vitest'
import { createBridge } from './bridge'

describe('createBridge', () => {
  it('reports ready and navigated via postToHost', () => {
    const postToHost = vi.fn()
    const bridge = createBridge({ postToHost, location: { href: 'http://x/a' } as Location, title: 'T' })
    bridge.reportReady()
    bridge.reportNavigated()
    expect(JSON.parse(postToHost.mock.calls[0]![0]!)).toMatchObject({ type: 'ready' })
    expect(JSON.parse(postToHost.mock.calls[1]![0]!)).toMatchObject({ type: 'navigated', url: 'http://x/a', title: 'T' })
  })

  it('dispatches host messages to registered handlers', () => {
    const postToHost = vi.fn(); const onEnter = vi.fn()
    const bridge = createBridge({ postToHost, location: {} as Location, title: '' })
    bridge.on('enter-picker', onEnter)
    bridge.handleHostRaw('{"v":1,"type":"enter-picker"}')
    expect(onEnter).toHaveBeenCalled()
  })
})
