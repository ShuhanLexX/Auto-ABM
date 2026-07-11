import type { WebviewBounds } from '../components/browser/computeWebviewBounds'
import { getDesktopHost } from './desktopHost'
import type { PreviewHostMessage } from './desktopHost'

function getPreviewHost() {
  const host = getDesktopHost()
  return host.capabilities.previewWebview ? host.preview : null
}

export const previewBridge = {
  open: (url: string, bounds: WebviewBounds) => getPreviewHost()?.open(url, bounds) ?? Promise.resolve(),
  navigate: (url: string) => getPreviewHost()?.navigate(url) ?? Promise.resolve(),
  setBounds: (bounds: WebviewBounds) => getPreviewHost()?.setBounds(bounds) ?? Promise.resolve(),
  setVisible: (visible: boolean) => getPreviewHost()?.setVisible(visible) ?? Promise.resolve(),
  close: () => getPreviewHost()?.close() ?? Promise.resolve(),
  message: (payload: PreviewHostMessage) => getPreviewHost()?.message(payload) ?? Promise.resolve(),
}
