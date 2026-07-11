import * as electron from 'electron'
import { ELECTRON_INTERNAL_CHANNELS } from './ipc/channels'
import { shouldForwardPreviewMessage } from './ipc/previewMessage'

const { contextBridge, ipcRenderer } = electron

function isTopFrame(): boolean {
  try {
    return window.top === window
  } catch {
    return false
  }
}

export function installPreviewPostBridge(): void {
  if (!contextBridge?.exposeInMainWorld || !ipcRenderer?.send) return
  contextBridge.exposeInMainWorld('__DESKTOP_PREVIEW_POST__', (raw: unknown) => {
    if (!shouldForwardPreviewMessage({
      raw,
      href: window.location.href,
      isTopFrame: isTopFrame(),
    })) {
      return
    }
    ipcRenderer.send(ELECTRON_INTERNAL_CHANNELS.previewMessageFromView, raw)
  })
}

installPreviewPostBridge()
