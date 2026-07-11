import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  APP_CONFIG_HOME_DIR_NAME,
  APP_STATE_DIR_NAME,
  getAppConfigHomeDir,
  LEGACY_CONFIG_DIR_ENV,
  LEGACY_PORTABLE_DATA_DIR_NAME,
  PORTABLE_DATA_DIR_NAME,
  resolveAppStateDir,
} from './appPaths.js'

describe('appPaths', () => {
  it('defaults config home to ~/.autoabm', () => {
    expect(getAppConfigHomeDir({})).toMatch(new RegExp(`[\\\\/]${APP_CONFIG_HOME_DIR_NAME}$`))
  })

  it('prefers AUTOABM_CONFIG_DIR over legacy CLAUDE_CONFIG_DIR', () => {
    expect(getAppConfigHomeDir({
      AUTOABM_CONFIG_DIR: '/preferred',
      CLAUDE_CONFIG_DIR: '/legacy',
    })).toBe('/preferred')
  })

  it('resolves app state dir under autoabm namespace', () => {
    const configDir = '/tmp/autoabm-config'
    expect(resolveAppStateDir(configDir)).toBe(join(configDir, APP_STATE_DIR_NAME))
    if (!existsSync(join(configDir, APP_STATE_DIR_NAME))) {
      expect(resolveAppStateDir(configDir)).toBe(join(configDir, APP_STATE_DIR_NAME))
    }
  })

  it('documents portable directory names', () => {
    expect(PORTABLE_DATA_DIR_NAME).toBe('AUTOABM_DATA')
    expect(LEGACY_PORTABLE_DATA_DIR_NAME).toBe('CLAUDE_CONFIG_DIR')
    expect(LEGACY_CONFIG_DIR_ENV).toBe('CLAUDE_CONFIG_DIR')
  })
})
