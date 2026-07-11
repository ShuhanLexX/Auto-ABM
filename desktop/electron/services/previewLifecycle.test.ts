import { describe, expect, it, vi } from 'vitest'
import {
  installPreviewCleanupOnRendererNavigation,
  type PreviewCleanupWebContents,
} from './previewLifecycle'

type DidStartNavigationHandler = Parameters<PreviewCleanupWebContents['on']>[1]

class FakeMainWebContents {
  didStartNavigationHandler: DidStartNavigationHandler | null = null

  on(event: 'did-start-navigation', handler: DidStartNavigationHandler) {
    if (event === 'did-start-navigation') {
      this.didStartNavigationHandler = handler
    }
  }

  emitDidStartNavigation(input: { isSameDocument?: boolean, isMainFrame?: boolean } = {}) {
    this.didStartNavigationHandler?.(
      {
        isSameDocument: input.isSameDocument ?? false,
        isMainFrame: input.isMainFrame ?? true,
      },
    )
  }

  emitDeprecatedDidStartNavigation(input: { url?: string, isInPlace?: boolean, isMainFrame?: boolean } = {}) {
    this.didStartNavigationHandler?.(
      {},
      input.url ?? 'app://renderer',
      input.isInPlace,
      input.isMainFrame ?? true,
    )
  }
}

describe('preview lifecycle cleanup', () => {
  it('closes the native preview view before the renderer performs a top-level reload', () => {
    const webContents = new FakeMainWebContents()
    const closePreview = vi.fn()

    installPreviewCleanupOnRendererNavigation(webContents, closePreview)
    webContents.emitDidStartNavigation({ isMainFrame: true, isSameDocument: false })

    expect(closePreview).toHaveBeenCalledTimes(1)
  })

  it('keeps the native preview view for same-document or subframe navigation', () => {
    const webContents = new FakeMainWebContents()
    const closePreview = vi.fn()

    installPreviewCleanupOnRendererNavigation(webContents, closePreview)
    webContents.emitDidStartNavigation({ isMainFrame: true, isSameDocument: true })
    webContents.emitDidStartNavigation({ isMainFrame: false, isSameDocument: false })

    expect(closePreview).not.toHaveBeenCalled()
  })

  it('falls back to deprecated navigation booleans when Electron details are absent', () => {
    const webContents = new FakeMainWebContents()
    const closePreview = vi.fn()

    installPreviewCleanupOnRendererNavigation(webContents, closePreview)
    webContents.emitDeprecatedDidStartNavigation({ isMainFrame: true, isInPlace: false })

    expect(closePreview).toHaveBeenCalledTimes(1)
  })
})
