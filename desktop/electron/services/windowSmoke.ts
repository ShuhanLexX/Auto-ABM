import { appendFileSync } from 'node:fs'
import type { BrowserWindow } from 'electron'

export type WindowSmokeEnv = {
  CC_HAHA_ELECTRON_WINDOW_SMOKE_LOG?: string
}

type WindowSmokeWindow = Pick<
  BrowserWindow,
  'getBounds' | 'getTitle' | 'isDestroyed' | 'isFocused' | 'isFullScreen' | 'isMaximized' | 'isMinimized' | 'isVisible'
> & {
  webContents?: Pick<BrowserWindow['webContents'], 'getURL' | 'isLoading'>
}

export function writeWindowSmokeSnapshot(
  window: WindowSmokeWindow | null,
  reason: string,
  env: WindowSmokeEnv = process.env,
) {
  const logPath = env.CC_HAHA_ELECTRON_WINDOW_SMOKE_LOG
  if (!logPath) return

  const payload = window
    ? {
        reason,
        destroyed: window.isDestroyed(),
        title: window.getTitle(),
        visible: window.isVisible(),
        focused: window.isFocused(),
        minimized: window.isMinimized(),
        maximized: window.isMaximized(),
        fullScreen: window.isFullScreen(),
        bounds: window.getBounds(),
        url: window.webContents?.getURL() ?? null,
        loading: window.webContents?.isLoading() ?? null,
      }
    : {
        reason,
        missingWindow: true,
      }

  appendFileSync(logPath, `${JSON.stringify({
    ts: new Date().toISOString(),
    ...payload,
  })}\n`)
}
