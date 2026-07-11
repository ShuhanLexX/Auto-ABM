/**
 * Render clock — decouples the simulation/decode rate from the display rate
 * (simulation-canvas.md §3). Incoming states are pushed into a single "latest"
 * slot; the next animation frame renders only the most recent one, so when the
 * worker pushes faster than the display refreshes, intermediate frames are
 * dropped. Dropping display frames never touches the Run (display is a sample).
 *
 * `requestFrame`/`cancelFrame` are injectable so the drop behaviour is unit
 * testable without a real rAF.
 */

export interface FramePayload {
  state: Uint8Array
  tick: number
}

export interface FrameClockOptions {
  onRender: (payload: FramePayload) => void
  requestFrame?: (cb: () => void) => number
  cancelFrame?: (handle: number) => void
  /** When enabled, render buffered frames one by one instead of coalescing. */
  bufferFrames?: boolean
  /** Minimum display interval for buffered playback. */
  frameIntervalMs?: number
  maxBufferedFrames?: number
}

export class FrameClock {
  private latest: FramePayload | null = null
  private queue: FramePayload[] = []
  private handle: number | null = null
  private handleKind: 'frame' | 'timeout' | null = null
  private lastTick: number | null = null
  private readonly onRender: (payload: FramePayload) => void
  private readonly requestFrame: (cb: () => void) => number
  private readonly cancelFrame: (handle: number) => void
  private readonly bufferFrames: boolean
  private readonly frameIntervalMs: number
  private readonly maxBufferedFrames: number
  private paused = false

  constructor(options: FrameClockOptions) {
    this.onRender = options.onRender
    this.requestFrame = options.requestFrame ?? defaultRequestFrame
    this.cancelFrame = options.cancelFrame ?? defaultCancelFrame
    this.bufferFrames = options.bufferFrames ?? false
    this.frameIntervalMs = Math.max(0, options.frameIntervalMs ?? 0)
    this.maxBufferedFrames = Math.max(1, options.maxBufferedFrames ?? 360)
  }

  /** Queue the newest state; coalesces with any not-yet-rendered state. */
  push(state: Uint8Array, tick: number): void {
    if (this.bufferFrames) {
      this.queue.push({ state, tick })
      if (this.queue.length > this.maxBufferedFrames) {
        this.queue.splice(0, this.queue.length - this.maxBufferedFrames)
      }
      if (!this.paused) this.schedule()
      return
    }
    this.latest = { state, tick }
    if (!this.paused) this.schedule()
  }

  private schedule(): void {
    if (this.paused) return
    if (this.handle !== null) return
    if (this.bufferFrames && this.frameIntervalMs > 16) {
      this.handle = setTimeout(this.flush, this.frameIntervalMs) as unknown as number
      this.handleKind = 'timeout'
      return
    }
    this.handle = this.requestFrame(this.flush)
    this.handleKind = 'frame'
  }

  pause(): void {
    this.paused = true
    this.cancelPendingHandle()
  }

  resume(): void {
    if (!this.paused) return
    this.paused = false
    if (this.queue.length > 0 || this.latest) this.schedule()
  }

  private flush = (): void => {
    this.handle = null
    this.handleKind = null
    const payload = this.bufferFrames ? this.queue.shift() ?? null : this.latest
    if (!this.bufferFrames) this.latest = null
    if (payload) {
      this.lastTick = payload.tick
      this.onRender(payload)
    }
    if (this.bufferFrames && this.queue.length > 0) this.schedule()
  }

  /** The tick of the most recently rendered frame (for the HUD / status). */
  get renderedTick(): number | null {
    return this.lastTick
  }

  dispose(): void {
    this.paused = false
    this.cancelPendingHandle()
    this.latest = null
    this.queue = []
  }

  private cancelPendingHandle(): void {
    if (this.handle === null) return
    const handle = this.handle
    const kind = this.handleKind
    this.handle = null
    this.handleKind = null
    if (kind === 'timeout') {
      clearTimeout(handle)
      return
    }
    this.cancelFrame(handle)
  }
}

function defaultRequestFrame(cb: () => void): number {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(() => cb())
  return setTimeout(cb, 16) as unknown as number
}

function defaultCancelFrame(handle: number): void {
  if (typeof requestAnimationFrame === 'function' && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(handle)
    return
  }
  clearTimeout(handle)
}
