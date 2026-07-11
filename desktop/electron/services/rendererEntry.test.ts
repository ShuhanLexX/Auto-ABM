import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { isAllowedDevRendererUrl, resolveRendererEntry } from './rendererEntry'

describe('Electron renderer entry resolution', () => {
  it('allows only local http renderer URLs in development', () => {
    expect(isAllowedDevRendererUrl('http://127.0.0.1:1420')).toBe(true)
    expect(isAllowedDevRendererUrl('http://localhost:1420')).toBe(true)
    expect(isAllowedDevRendererUrl('http://[::1]:1420')).toBe(true)
    expect(isAllowedDevRendererUrl('https://127.0.0.1:1420')).toBe(false)
    expect(isAllowedDevRendererUrl('http://example.com')).toBe(false)
    expect(isAllowedDevRendererUrl('file:///tmp/index.html')).toBe(false)
  })

  it('ignores ELECTRON_RENDERER_URL once the app is packaged', () => {
    expect(resolveRendererEntry({
      isPackaged: true,
      appRoot: '/Applications/Test.app/Contents/Resources/app.asar',
      env: { ELECTRON_RENDERER_URL: 'http://127.0.0.1:1420' },
    })).toBe(path.join('/Applications/Test.app/Contents/Resources/app.asar', 'dist', 'index.html'))
  })

  it('rejects non-local development renderer URLs', () => {
    expect(() => resolveRendererEntry({
      isPackaged: false,
      appRoot: '/repo/desktop',
      env: { ELECTRON_RENDERER_URL: 'http://example.com' },
    })).toThrow('Refusing non-local Electron renderer URL')
  })
})
