import { describe, expect, it, vi, beforeEach } from 'vitest'

const html2canvasMock = vi.fn()
vi.mock('html2canvas', () => ({ default: (...args: unknown[]) => html2canvasMock(...args) }))
vi.mock('../lib/imageCompress', () => ({ compressDataUrl: vi.fn(async (d: string) => `c:${d}`) }))

import { captureToDataUrl, captureAnnotatedRegion } from './screenshot'
import { compressDataUrl } from '../lib/imageCompress'

function makeMockCtx() {
  return {
    lineWidth: 0,
    strokeStyle: '',
    fillStyle: '',
    font: '',
    textAlign: '' as CanvasRenderingContext2D['textAlign'],
    textBaseline: '' as CanvasRenderingContext2D['textBaseline'],
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    arcTo: vi.fn(),
    arc: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
  }
}

beforeEach(() => {
  html2canvasMock.mockReset()
  html2canvasMock.mockResolvedValue({ toDataURL: () => 'data:image/png;base64,RAW' })
  vi.mocked(compressDataUrl).mockClear()
})

describe('captureToDataUrl', () => {
  it('captures document.body for full and compresses the result', async () => {
    const out = await captureToDataUrl('full')
    expect(html2canvasMock).toHaveBeenCalledWith(document.body, expect.any(Object))
    expect(compressDataUrl).toHaveBeenCalledWith('data:image/png;base64,RAW')
    expect(out).toBe('c:data:image/png;base64,RAW')
  })
  it('captures the given element for element kind', async () => {
    const el = document.createElement('div')
    await captureToDataUrl('element', el)
    expect(html2canvasMock).toHaveBeenCalledWith(el, expect.any(Object))
  })
  it('falls back to document.body for element kind without element', async () => {
    await captureToDataUrl('element')
    expect(html2canvasMock).toHaveBeenCalledWith(document.body, expect.any(Object))
  })
  it('passes viewport height option for viewport kind', async () => {
    await captureToDataUrl('viewport')
    const opts = html2canvasMock.mock.calls[0]![1] as Record<string, unknown>
    expect(opts.height).toBe(window.innerHeight)
    expect(opts.windowWidth).toBe(window.innerWidth)
  })
})

describe('captureAnnotatedRegion', () => {
  it('captures the visible viewport with scale:1', async () => {
    const ctx = makeMockCtx()
    html2canvasMock.mockResolvedValue({
      getContext: () => ctx as unknown as CanvasRenderingContext2D,
      toDataURL: () => 'data:image/png;base64,RAW',
      width: 1000,
      height: 2000,
    })
    const el = document.createElement('div')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 50, width: 80, height: 40,
      right: 180, bottom: 90, x: 100, y: 50,
      toJSON: () => ({}),
    } as DOMRect)

    await captureAnnotatedRegion(el, 1)

    expect(html2canvasMock).toHaveBeenCalledWith(document.documentElement, expect.objectContaining({
      width: window.innerWidth,
      height: window.innerHeight,
      scale: 1,
    }))
  })

  it('keeps the annotation inside the DOM capture instead of post-processing canvas pixels', async () => {
    const ctx = makeMockCtx()
    html2canvasMock.mockResolvedValue({
      getContext: () => ctx as unknown as CanvasRenderingContext2D,
      toDataURL: () => 'data:image/png;base64,RAW',
      width: 1000,
      height: 2000,
    })
    const el = document.createElement('div')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 50, width: 80, height: 40,
      right: 180, bottom: 90, x: 100, y: 50,
      toJSON: () => ({}),
    } as DOMRect)

    await captureAnnotatedRegion(el, 1)

    expect(ctx.stroke).not.toHaveBeenCalled()
    expect(ctx.fillText).not.toHaveBeenCalled()
  })

  it('places the selected element overlay at viewport coordinates in the captured viewport', async () => {
    const ctx = makeMockCtx()
    html2canvasMock.mockImplementation(async () => {
      const overlay = document.querySelector('[data-preview-selection-annotation="true"]') as HTMLElement | null
      expect(overlay?.style.left).toBe('100px')
      expect(overlay?.style.top).toBe('50px')
      expect(overlay?.style.width).toBe('80px')
      expect(overlay?.style.height).toBe('40px')
      return {
        getContext: () => ctx as unknown as CanvasRenderingContext2D,
        toDataURL: () => 'data:image/png;base64,RAW',
        width: window.innerWidth,
        height: window.innerHeight,
      }
    })
    const el = document.createElement('input')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 50, width: 80, height: 40,
      right: 180, bottom: 90, x: 100, y: 50,
      toJSON: () => ({}),
    } as DOMRect)
    vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: -200, width: 1000, height: 2000,
      right: 1000, bottom: 1800, x: 0, y: -200,
      toJSON: () => ({}),
    } as DOMRect)

    await captureAnnotatedRegion(el, 1)

    const options = html2canvasMock.mock.calls[0]?.[1] as Record<string, unknown>
    expect(html2canvasMock.mock.calls[0]?.[0]).toBe(document.documentElement)
    expect(options).toMatchObject({
      x: window.scrollX,
      y: window.scrollY,
      width: window.innerWidth,
      height: window.innerHeight,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      scale: 1,
    })
    expect(ctx.arc).not.toHaveBeenCalled()
  })

  it('captures the annotation as a viewport DOM overlay so output canvas scaling cannot drift', async () => {
    const ctx = makeMockCtx()
    html2canvasMock.mockImplementation(async () => {
      const overlay = document.querySelector('[data-preview-selection-annotation="true"]') as HTMLElement | null
      const badge = document.querySelector('[data-preview-selection-badge="true"]') as HTMLElement | null
      expect(overlay).not.toBeNull()
      expect(badge).not.toBeNull()
      expect(overlay?.style.position).toBe('fixed')
      expect(overlay?.style.left).toBe('900px')
      expect(overlay?.style.top).toBe('320px')
      expect(overlay?.style.width).toBe('86px')
      expect(overlay?.style.height).toBe('48px')
      expect(badge?.textContent).toContain('1')
      return {
        getContext: () => ctx as unknown as CanvasRenderingContext2D,
        toDataURL: () => 'data:image/png;base64,RAW',
        width: 480,
        height: 320,
      }
    })
    const el = document.createElement('button')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 900, top: 320, width: 86, height: 48,
      right: 986, bottom: 368, x: 900, y: 320,
      toJSON: () => ({}),
    } as DOMRect)

    await captureAnnotatedRegion(el, 1)

    expect(ctx.arc).not.toHaveBeenCalled()
    expect(document.querySelector('[data-preview-selection-annotation-root="true"]')).toBeNull()
  })

  it('places the numbered badge outside the selected element so small buttons stay readable', async () => {
    html2canvasMock.mockImplementation(async () => {
      const overlay = document.querySelector('[data-preview-selection-annotation="true"]') as HTMLElement | null
      const badge = document.querySelector('[data-preview-selection-badge="true"]') as HTMLElement | null
      expect(overlay).not.toBeNull()
      expect(badge).not.toBeNull()
      expect(badge?.style.position).toBe('fixed')
      expect(Number.parseFloat(badge?.style.top ?? '0') + 26).toBeLessThanOrEqual(320)
      expect(badge?.style.color).toBe('white')
      expect(badge?.style.background).toBe('rgb(47, 123, 255)')
      expect(overlay?.textContent).not.toContain('1')
      return {
        getContext: () => makeMockCtx() as unknown as CanvasRenderingContext2D,
        toDataURL: () => 'data:image/png;base64,RAW',
      }
    })
    const el = document.createElement('button')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 900, top: 320, width: 86, height: 48,
      right: 986, bottom: 368, x: 900, y: 320,
      toJSON: () => ({}),
    } as DOMRect)

    await captureAnnotatedRegion(el, 1)

    expect(document.querySelector('[data-preview-selection-badge="true"]')).toBeNull()
  })

  it('returns the compressed wrapper of the canvas dataURL', async () => {
    const ctx = makeMockCtx()
    html2canvasMock.mockResolvedValue({
      getContext: () => ctx as unknown as CanvasRenderingContext2D,
      toDataURL: () => 'data:image/png;base64,RAW',
      width: 1000,
      height: 2000,
    })
    const el = document.createElement('div')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 50, height: 50,
      right: 50, bottom: 50, x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect)

    const result = await captureAnnotatedRegion(el, 1)

    expect(compressDataUrl).toHaveBeenCalledWith('data:image/png;base64,RAW')
    expect(result).toBe('c:data:image/png;base64,RAW')
  })
})
