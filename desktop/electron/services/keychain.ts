type ElectronAppWithCommandLine = {
  commandLine: {
    appendSwitch(name: string, value?: string): void
  }
}

/**
 * Chromium creates a per-app "Safe Storage" key in macOS Keychain for browser
 * profile encryption. AutoABM does not rely on Chromium cookies or
 * password storage for auth secrets; OAuth tokens live in the desktop sidecar
 * files instead. Using Chromium's mock keychain avoids repeated macOS password
 * prompts when dev/unsigned Electron builds cannot reuse the old Keychain ACL.
 */
export function installMacOsChromiumKeychainPromptGuard(
  app: ElectronAppWithCommandLine,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (platform !== 'darwin') return false
  app.commandLine.appendSwitch('use-mock-keychain')
  return true
}
