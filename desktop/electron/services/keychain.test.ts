import { describe, expect, it, vi } from 'vitest'
import { installMacOsChromiumKeychainPromptGuard } from './keychain'

describe('Electron Chromium keychain guard', () => {
  it('uses Chromium mock keychain on macOS to avoid Safe Storage prompts', () => {
    const appendSwitch = vi.fn()

    const installed = installMacOsChromiumKeychainPromptGuard(
      { commandLine: { appendSwitch } },
      'darwin',
    )

    expect(installed).toBe(true)
    expect(appendSwitch).toHaveBeenCalledWith('use-mock-keychain')
  })

  it('leaves non-macOS platforms on their default credential backend', () => {
    const appendSwitch = vi.fn()

    const installed = installMacOsChromiumKeychainPromptGuard(
      { commandLine: { appendSwitch } },
      'linux',
    )

    expect(installed).toBe(false)
    expect(appendSwitch).not.toHaveBeenCalled()
  })
})
