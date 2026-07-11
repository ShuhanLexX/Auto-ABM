import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyAppConfigEnvironment,
  applyStartupPortableMode,
  defaultPortableDir,
  detectPortableDir,
  determineStartupPortableDir,
  dirHasPortableData,
  getAppMode,
  setAppMode,
  type AppModeAppLike,
} from './appMode'

const tempDirs: string[] = []

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autoabm-app-mode-'))
  tempDirs.push(dir)
  return dir
}

function app(root = tempDir()): AppModeAppLike & { root: string } {
  const exe = path.join(root, 'AutoABM.app', 'Contents', 'MacOS', 'AutoABM')
  const userData = path.join(root, 'user-data')
  fs.mkdirSync(path.dirname(exe), { recursive: true })
  fs.writeFileSync(exe, '')
  return {
    root,
    getPath(name) {
      return name === 'exe' ? exe : userData
    },
  }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('Electron app mode service', () => {
  it('detects portable data using the same sentinel files and directories as Tauri', () => {
    const root = tempDir()
    expect(dirHasPortableData(root)).toBe(false)
    fs.writeFileSync(path.join(root, 'settings.json'), '{}')
    expect(dirHasPortableData(root)).toBe(true)
    fs.rmSync(path.join(root, 'settings.json'))
    fs.mkdirSync(path.join(root, 'projects'))
    expect(dirHasPortableData(root)).toBe(true)
  })

  it('resolves startup portable mode from default portable data or app-mode config', () => {
    const fakeApp = app()
    const defaultDir = defaultPortableDir(fakeApp)
    fs.mkdirSync(defaultDir, { recursive: true })
    fs.writeFileSync(path.join(defaultDir, 'settings.json'), '{}')

    expect(determineStartupPortableDir(fakeApp, {})).toBe(defaultDir)
    expect(determineStartupPortableDir(fakeApp, { CLAUDE_CONFIG_DIR: '/external' })).toBeNull()

    fs.writeFileSync(path.join(defaultDir, 'app-mode.json'), JSON.stringify({ mode: 'default' }))
    expect(determineStartupPortableDir(fakeApp, {})).toBeNull()
  })

  it('sets portable environment variables before sidecars start', () => {
    const fakeApp = app()
    const env: NodeJS.ProcessEnv = {}
    const defaultDir = defaultPortableDir(fakeApp)
    fs.mkdirSync(defaultDir, { recursive: true })
    fs.writeFileSync(path.join(defaultDir, 'settings.json'), '{}')

    expect(applyStartupPortableMode(fakeApp, env)).toBe(defaultDir)
    expect(env.AUTOABM_CONFIG_DIR).toBe(defaultDir)
    expect(env.CLAUDE_CONFIG_DIR).toBe(defaultDir)
    expect(env.CC_HAHA_APP_PORTABLE_DIR).toBe('1')
    expect(env.WEBVIEW2_USER_DATA_FOLDER).toBe(path.join(defaultDir, 'EBWebView'))
  })

  it('applies ~/.autoabm as the default config dir when not portable', () => {
    const fakeApp = app()
    const env: NodeJS.ProcessEnv = {}
    const configDir = applyAppConfigEnvironment(fakeApp, env)
    expect(configDir).toMatch(/[\\/]\.autoabm$/)
    expect(env.AUTOABM_CONFIG_DIR).toBe(configDir)
    expect(env.CLAUDE_CONFIG_DIR).toBe(configDir)
    expect(env.CC_HAHA_APP_PORTABLE_DIR).toBeUndefined()
  })

  it('returns the active app mode shape expected by settingsStore', () => {
    const fakeApp = app()
    const env: NodeJS.ProcessEnv = {}
    const configDir = applyAppConfigEnvironment(fakeApp, env)

    expect(getAppMode(fakeApp, env)).toMatchObject({
      mode: 'default',
      portableDir: defaultPortableDir(fakeApp),
      activeConfigDir: configDir,
      configDirSource: 'environment',
    })
    expect(getAppMode(fakeApp, { CLAUDE_CONFIG_DIR: '/portable', CC_HAHA_APP_PORTABLE_DIR: '1' })).toMatchObject({
      mode: 'portable',
      portableDir: '/portable',
      activeConfigDir: '/portable',
      configDirSource: 'portable',
    })
    expect(getAppMode(fakeApp, { CLAUDE_CONFIG_DIR: '/external' })).toMatchObject({
      configDirSource: 'environment',
    })
  })

  it('writes app-mode.json to active, target portable, and system config dirs', () => {
    const fakeApp = app()
    const active = tempDir()
    const selected = path.join(tempDir(), 'portable')

    setAppMode(fakeApp, { mode: 'portable', portableDir: selected }, { CLAUDE_CONFIG_DIR: active })

    const expected = { mode: 'portable', portable_dir: selected }
    expect(JSON.parse(fs.readFileSync(path.join(active, 'app-mode.json'), 'utf8'))).toEqual(expected)
    expect(JSON.parse(fs.readFileSync(path.join(selected, 'app-mode.json'), 'utf8'))).toEqual(expected)
    expect(JSON.parse(fs.readFileSync(path.join(fakeApp.getPath('userData'), 'app-mode.json'), 'utf8'))).toEqual(expected)

    setAppMode(fakeApp, { mode: 'default', portableDir: null }, { CLAUDE_CONFIG_DIR: active })
    expect(JSON.parse(fs.readFileSync(path.join(active, 'app-mode.json'), 'utf8'))).toEqual({
      mode: 'default',
      portable_dir: null,
    })
  })

  it('reports whether the default portable dir already has data', () => {
    const fakeApp = app()
    expect(detectPortableDir(fakeApp)).toEqual({
      defaultPortableDir: defaultPortableDir(fakeApp),
      hasData: false,
    })
    fs.mkdirSync(defaultPortableDir(fakeApp), { recursive: true })
    fs.writeFileSync(path.join(defaultPortableDir(fakeApp), '.mcp.json'), '{}')
    expect(detectPortableDir(fakeApp).hasData).toBe(true)
  })
})
