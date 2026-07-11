import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const AUTOABM_CONFIG_DIR_ENV = 'AUTOABM_CONFIG_DIR'
export const LEGACY_CONFIG_DIR_ENV = 'CLAUDE_CONFIG_DIR'

export const APP_CONFIG_HOME_DIR_NAME = '.autoabm'
export const LEGACY_CONFIG_HOME_DIR_NAME = '.claude'

export const APP_STATE_DIR_NAME = 'autoabm'
export const LEGACY_STATE_DIR_NAME = 'cc-haha'

export const PORTABLE_DATA_DIR_NAME = 'AUTOABM_DATA'
export const LEGACY_PORTABLE_DATA_DIR_NAME = 'CLAUDE_CONFIG_DIR'

export function resolveConfigDirFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const autoabmDir = env[AUTOABM_CONFIG_DIR_ENV]?.trim()
  if (autoabmDir) return autoabmDir

  const legacyDir = env[LEGACY_CONFIG_DIR_ENV]?.trim()
  if (legacyDir) return legacyDir

  return undefined
}

export function getAppConfigHomeDir(env: NodeJS.ProcessEnv = process.env): string {
  return (
    resolveConfigDirFromEnv(env) ?? join(homedir(), APP_CONFIG_HOME_DIR_NAME)
  ).normalize('NFC')
}

export function appStateDir(configDir = getAppConfigHomeDir()): string {
  return join(configDir, APP_STATE_DIR_NAME)
}

export function legacyStateDir(configDir = getAppConfigHomeDir()): string {
  return join(configDir, LEGACY_STATE_DIR_NAME)
}

/** Prefer autoabm/; fall back to legacy cc-haha/ when present. */
export function resolveAppStateDir(configDir = getAppConfigHomeDir()): string {
  const nextDir = appStateDir(configDir)
  if (existsSync(nextDir)) return nextDir

  const legacyDir = legacyStateDir(configDir)
  if (existsSync(legacyDir)) return legacyDir

  return nextDir
}

export function syncConfigDirEnv(env: NodeJS.ProcessEnv, configDir: string): void {
  env[AUTOABM_CONFIG_DIR_ENV] = configDir
  env[LEGACY_CONFIG_DIR_ENV] = configDir
}
