import { describe, expect, it, vi } from 'vitest'
import { FrameClock, type FramePayload } from './frameClock'

describe('FrameClock', () => {
  it('renders only the latest state when pushed faster than it flushes', () => {
    let scheduled: (() => void) | null = null
    const rendered: FramePayload[] = []

    const clock = new FrameClock({
      onRender: (payload) => rendered.push(payload),
      requestFrame: (cb) => {
        scheduled = cb
        return 1
      },
      cancelFrame: () => {},
    })

    for (let i = 0; i < 10; i++) clock.push(new Uint8Array([i]), i)

    // One animation frame fires: only the most recent push is rendered.
    expect(scheduled).not.toBeNull()
    scheduled!()

    expect(rendered).toHaveLength(1)
    expect(rendered[0]!.tick).toBe(9)
    expect(Array.from(rendered[0]!.state)).toEqual([9])
    expect(clock.renderedTick).toBe(9)
  })

  it('schedules a new frame after the previous one flushed', () => {
    const callbacks: Array<() => void> = []
    const onRender = vi.fn()
    const clock = new FrameClock({
      onRender,
      requestFrame: (cb) => {
        callbacks.push(cb)
        return callbacks.length
      },
      cancelFrame: () => {},
    })

    clock.push(new Uint8Array([1]), 1)
    callbacks[0]!() // flush first
    clock.push(new Uint8Array([2]), 2)
    expect(callbacks).toHaveLength(2) // a second frame was scheduled
    callbacks[1]!()

    expect(onRender).toHaveBeenCalledTimes(2)
  })

  it('cancels a pending frame on dispose', () => {
    const cancelFrame = vi.fn()
    const clock = new FrameClock({
      onRender: () => {},
      requestFrame: () => 42,
      cancelFrame,
    })
    clock.push(new Uint8Array([1]), 1)
    clock.dispose()
    expect(cancelFrame).toHaveBeenCalledWith(42)
  })

  it('can replay buffered frames at a controlled interval', () => {
    vi.useFakeTimers()
    const rendered: FramePayload[] = []
    const clock = new FrameClock({
      onRender: (payload) => rendered.push(payload),
      bufferFrames: true,
      frameIntervalMs: 80,
    })

    clock.push(new Uint8Array([1]), 1)
    clock.push(new Uint8Array([2]), 2)
    clock.push(new Uint8Array([3]), 3)

    vi.advanceTimersByTime(79)
    expect(rendered).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(rendered.map((payload) => payload.tick)).toEqual([1])
    vi.advanceTimersByTime(80)
    expect(rendered.map((payload) => payload.tick)).toEqual([1, 2])
    vi.advanceTimersByTime(80)
    expect(rendered.map((payload) => payload.tick)).toEqual([1, 2, 3])

    clock.dispose()
    vi.useRealTimers()
  })

  it('pauses buffered playback without consuming queued frames and resumes from the pause point', () => {
    vi.useFakeTimers()
    const rendered: FramePayload[] = []
    const clock = new FrameClock({
      onRender: (payload) => rendered.push(payload),
      bufferFrames: true,
      frameIntervalMs: 80,
    })

    clock.push(new Uint8Array([1]), 1)
    clock.push(new Uint8Array([2]), 2)
    clock.pause()

    vi.advanceTimersByTime(240)
    expect(rendered).toHaveLength(0)

    clock.resume()
    vi.advanceTimersByTime(80)
    expect(rendered.map((payload) => payload.tick)).toEqual([1])
    vi.advanceTimersByTime(80)
    expect(rendered.map((payload) => payload.tick)).toEqual([1, 2])

    clock.dispose()
    vi.useRealTimers()
  })
})
