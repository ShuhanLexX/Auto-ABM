import type { App, BrowserWindow } from 'electron'
import { showMainWindow } from './windows'

export function acquireSingleInstanceLock(
  app: App,
  getMainWindow: () => BrowserWindow | null,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.CC_HAHA_ELECTRON_DISABLE_SINGLE_INSTANCE_LOCK === '1') {
    return true
  }

  const hasLock = app.requestSingleInstanceLock()
  if (!hasLock) {
    app.quit()
    return false
  }

  app.on('second-instance', () => {
    showMainWindow(getMainWindow(), app)
  })

  return true
}
