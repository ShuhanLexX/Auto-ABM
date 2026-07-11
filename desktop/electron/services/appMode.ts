import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  getAppConfigHomeDir,
  LEGACY_CONFIG_DIR_ENV,
  LEGACY_PORTABLE_DATA_DIR_NAME,
  PORTABLE_DATA_DIR_NAME,
  resolveConfigDirFromEnv,
  syncConfigDirEnv,
} from '../../../src/constants/appPaths.js'
import type { AppModeConfig, AppModeSetInput } from '../../src/lib/desktopHost/types'

const APP_MODE_FILE = 'app-mode.json'

export type AppModeAppLike = {
  getPath(name: 'exe' | 'userData'): string
}

type PersistedAppModeConfig = {
  mode?: string
  portable_dir?: string | null
}

export type PortableDetection = {
  defaultPortableDir: string | null
  hasData: boolean
}

export function portableDirCandidates(app: AppModeAppLike): string[] {
  const exeDir = path.dirname(app.getPath('exe'))
  return [
    path.join(exeDir, PORTABLE_DATA_DIR_NAME),
    path.join(exeDir, LEGACY_PORTABLE_DATA_DIR_NAME),
  ]
}

export function defaultPortableDir(app: AppModeAppLike): string {
  return portableDirCandidates(app)[0]!
}

export function resolvePortableDataDir(app: AppModeAppLike): string | null {
  for (const candidate of portableDirCandidates(app)) {
    if (dirHasPortableData(candidate)) return candidate
  }
  return null
}

export function dirHasPortableData(dir: string): boolean {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return false
  return [
    'settings.json',
    '.claude.json',
    '.mcp.json',
    'window-state.json',
    'terminal-config.json',
    'app-mode.json',
  ].some(file => fs.existsSync(path.join(dir, file)) && fs.statSync(path.join(dir, file)).isFile())
    || [
      'Cache',
      'EBWebView',
      'projects',
      'skills',
      'plugins',
      'cowork_plugins',
      'autoabm',
      'cc-haha',
    ].some(file => fs.existsSync(path.join(dir, file)) && fs.statSync(path.join(dir, file)).isDirectory())
}

export function readAppModeConfig(configDir: string): PersistedAppModeConfig | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(configDir, APP_MODE_FILE), 'utf8')) as PersistedAppModeConfig
    return {
      mode: typeof parsed.mode === 'string' ? parsed.mode.toLowerCase() : 'default',
      portable_dir: typeof parsed.portable_dir === 'string' ? parsed.portable_dir : null,
    }
  } catch {
    return null
  }
}

export function writeAppModeConfig(configDir: string, config: PersistedAppModeConfig): void {
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(path.join(configDir, APP_MODE_FILE), JSON.stringify(config, null, 2))
}

export function determineStartupPortableDir(
  app: AppModeAppLike,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (resolveConfigDirFromEnv(env)) return null

  for (const candidate of portableDirCandidates(app)) {
    const configuredMode = readAppModeConfig(candidate)
    if (configuredMode?.mode === 'portable') {
      return configuredMode.portable_dir ?? candidate
    }
    if (configuredMode?.mode === 'default') {
      continue
    }
    if (dirHasPortableData(candidate)) return candidate
  }

  const systemMode = readAppModeConfig(app.getPath('userData'))
  if (systemMode?.mode === 'portable') {
    return systemMode.portable_dir ?? defaultPortableDir(app)
  }

  return null
}

export function applyStartupPortableMode(
  app: AppModeAppLike,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const portableDir = determineStartupPortableDir(app, env)
  if (!portableDir) return null
  syncConfigDirEnv(env, portableDir)
  env.CC_HAHA_APP_PORTABLE_DIR = '1'
  env.WEBVIEW2_USER_DATA_FOLDER = path.join(portableDir, 'EBWebView')
  fs.mkdirSync(env.WEBVIEW2_USER_DATA_FOLDER, { recursive: true })
  return portableDir
}

export function applyAppConfigEnvironment(
  app: AppModeAppLike,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const existing = resolveConfigDirFromEnv(env)
  if (existing) {
    syncConfigDirEnv(env, existing)
    return existing
  }

  const portableDir = applyStartupPortableMode(app, env)
  if (portableDir) return portableDir

  const defaultDir = getAppConfigHomeDir(env)
  syncConfigDirEnv(env, defaultDir)
  fs.mkdirSync(defaultDir, { recursive: true })
  return defaultDir
}

export function getAppMode(
  app: AppModeAppLike,
  env: NodeJS.ProcessEnv = process.env,
): AppModeConfig {
  const envConfigDir = resolveConfigDirFromEnv(env)
  const isPortable = env.CC_HAHA_APP_PORTABLE_DIR === '1'
  const activeConfigDir = envConfigDir || app.getPath('userData')
  const portableDir = isPortable
    ? (envConfigDir ?? defaultPortableDir(app))
    : defaultPortableDir(app)
  return {
    mode: isPortable ? 'portable' : 'default',
    portableDir,
    defaultPortableDir: defaultPortableDir(app),
    activeConfigDir,
    configDirSource: !envConfigDir
      ? 'system'
      : isPortable
        ? 'portable'
        : 'environment',
  }
}

export function setAppMode(
  app: AppModeAppLike,
  input: AppModeSetInput,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const activeConfigDir = resolveConfigDirFromEnv(env) || app.getPath('userData')
  let config: PersistedAppModeConfig = { mode: 'default', portable_dir: null }
  let targetPortableDir: string | null = null

  if (input.mode === 'portable') {
    const selectedDir = input.portableDir?.trim() || defaultPortableDir(app)
    if (fs.existsSync(selectedDir) && !fs.statSync(selectedDir).isDirectory()) {
      throw new Error(`portable config path is not a directory: ${selectedDir}`)
    }
    fs.mkdirSync(selectedDir, { recursive: true })
    targetPortableDir = selectedDir
    config = {
      mode: 'portable',
      portable_dir: selectedDir === defaultPortableDir(app) ? null : selectedDir,
    }
  }

  writeAppModeConfig(activeConfigDir, config)
  if (targetPortableDir && targetPortableDir !== activeConfigDir) {
    writeAppModeConfig(targetPortableDir, config)
  }

  const systemConfigDir = app.getPath('userData')
  if (systemConfigDir !== activeConfigDir) {
    writeAppModeConfig(systemConfigDir, config)
  }
}

export function detectPortableDir(app: AppModeAppLike): PortableDetection {
  const portableDir = defaultPortableDir(app)
  return {
    defaultPortableDir: portableDir,
    hasData: dirHasPortableData(portableDir) || portableDirCandidates(app).some(dirHasPortableData),
  }
}
