import { describe, expect, test } from 'bun:test'
import {
  isPowerShellExecutablePath,
  resolvePowerShellPathOverride,
} from './powershellDetection.js'

describe('PowerShell detection override', () => {
  test('accepts pwsh and powershell executable paths', () => {
    expect(
      isPowerShellExecutablePath('C:\\Program Files\\PowerShell\\7\\pwsh.exe'),
    ).toBe(true)
    expect(
      isPowerShellExecutablePath(
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      ),
    ).toBe(true)
  })

  test('rejects custom shells that are not PowerShell executables', () => {
    expect(
      isPowerShellExecutablePath('C:\\Program Files\\Git\\bin\\bash.exe'),
    ).toBe(false)
    expect(isPowerShellExecutablePath('cmd.exe')).toBe(false)
  })

  test('resolves configured command names through PATH lookup', async () => {
    const resolved = await resolvePowerShellPathOverride('pwsh.exe', {
      getPlatform: () => 'macos',
      probePath: async () => null,
      which: async command =>
        command === 'pwsh.exe'
          ? 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'
          : null,
    })

    expect(resolved).toBe('C:\\Program Files\\PowerShell\\7\\pwsh.exe')
  })

  test('resolves Windows pwsh through PSHOME before PATH lookup', async () => {
    const resolved = await resolvePowerShellPathOverride('pwsh.exe', {
      getPlatform: () => 'windows',
      probePath: async path =>
        path === 'C:\\Program Files\\PowerShell\\7\\pwsh.exe' ? path : null,
      readWindowsPwshHome: async () => 'C:\\Program Files\\PowerShell\\7',
      which: async () => null,
    })

    expect(resolved).toBe('C:\\Program Files\\PowerShell\\7\\pwsh.exe')
  })

  test('falls back to known Windows PowerShell install paths', async () => {
    const resolved = await resolvePowerShellPathOverride('powershell.exe', {
      getPlatform: () => 'windows',
      probePath: async path =>
        path ===
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
          ? path
          : null,
      which: async () => null,
    })

    expect(resolved).toBe(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    )
  })

  test('ignores missing or non-PowerShell overrides', async () => {
    await expect(
      resolvePowerShellPathOverride('C:\\Tools\\bash.exe', {
        probePath: async () => 'C:\\Tools\\bash.exe',
        which: async () => null,
      }),
    ).resolves.toBeNull()

    await expect(
      resolvePowerShellPathOverride('C:\\Missing\\pwsh.exe', {
        getPlatform: () => 'macos',
        probePath: async () => null,
        which: async () => null,
      }),
    ).resolves.toBeNull()
  })
})
