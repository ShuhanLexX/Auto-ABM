import { beforeEach, describe, expect, test } from 'vitest'
import {
  CURRENT_DESKTOP_PERSISTENCE_SCHEMA_VERSION,
  DESKTOP_PERSISTENCE_VERSION_KEY,
  runDesktopPersistenceMigrations,
} from './persistenceMigrations'

describe('desktop persistence migrations', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  test('migrates legacy open-tab arrays into the current tab persistence shape', () => {
    window.localStorage.setItem('autoabm-open-tabs', JSON.stringify([
      { sessionId: 'session-1', title: 'Old tab' },
      { sessionId: '__terminal__legacy', title: 'Terminal 1', type: 'terminal' },
      { sessionId: 123, title: 'bad' },
    ]))

    const report = runDesktopPersistenceMigrations()

    expect(report.migratedKeys).toContain('autoabm-open-tabs')
    expect(JSON.parse(window.localStorage.getItem('autoabm-open-tabs') || '{}')).toEqual({
      openTabs: [{ sessionId: 'session-1', title: 'Old tab', type: 'session' }],
      activeTabId: 'session-1',
    })
    expect(window.localStorage.getItem(DESKTOP_PERSISTENCE_VERSION_KEY)).toBe(String(CURRENT_DESKTOP_PERSISTENCE_SCHEMA_VERSION))
  })

  test('filters stale session runtime selections without clearing unrelated keys', () => {
    window.localStorage.setItem('unrelated-user-key', 'keep')
    window.localStorage.setItem('autoabm-session-runtime', JSON.stringify({
      good: { providerId: null, modelId: 'claude-sonnet' },
      alsoGood: { providerId: 'provider-1', modelId: 'gpt-5.4' },
      bad: { providerId: 'provider-2' },
    }))

    runDesktopPersistenceMigrations()

    expect(JSON.parse(window.localStorage.getItem('autoabm-session-runtime') || '{}')).toEqual({
      alsoGood: { providerId: 'provider-1', modelId: 'gpt-5.4' },
      good: { providerId: null, modelId: 'claude-sonnet' },
    })
    expect(window.localStorage.getItem('unrelated-user-key')).toBe('keep')
  })

  test('removes malformed known keys without throwing during startup', () => {
    window.localStorage.setItem('autoabm.rebrand.ui-v2-dark', '1')
    window.localStorage.setItem('autoabm-open-tabs', '{"openTabs":')
    window.localStorage.setItem('autoabm-theme', 'sepia')

    const report = runDesktopPersistenceMigrations()

    expect(report.migratedKeys).toContain('autoabm-open-tabs')
    expect(report.migratedKeys).toContain('autoabm-theme')
    expect(window.localStorage.getItem('autoabm-open-tabs')).toBeNull()
    expect(window.localStorage.getItem('autoabm-theme')).toBeNull()
  })

  test('migrates legacy theme key and applies dark rebrand once', () => {
    window.localStorage.setItem('cc-haha-theme', 'white')

    const report = runDesktopPersistenceMigrations()

    expect(report.migratedKeys).toContain('cc-haha-theme')
    expect(window.localStorage.getItem('cc-haha-theme')).toBeNull()
    expect(window.localStorage.getItem('autoabm-theme')).toBe('dark')
    expect(window.localStorage.getItem('autoabm.rebrand.ui-v2-dark')).toBe('1')
  })

  test('preserves the pure white theme as a valid persisted theme', () => {
    window.localStorage.setItem('autoabm.rebrand.ui-v2-dark', '1')
    window.localStorage.setItem('autoabm-theme', 'white')

    const report = runDesktopPersistenceMigrations()

    expect(report.migratedKeys).not.toContain('autoabm-theme')
    expect(window.localStorage.getItem('autoabm-theme')).toBe('white')
  })

  test('preserves valid app zoom and removes invalid app zoom values', () => {
    window.localStorage.setItem('autoabm-app-zoom', '1.2')

    const validReport = runDesktopPersistenceMigrations()

    expect(validReport.migratedKeys).not.toContain('autoabm-app-zoom')
    expect(window.localStorage.getItem('autoabm-app-zoom')).toBe('1.2')

    window.localStorage.setItem('autoabm-app-zoom', '4')

    const invalidReport = runDesktopPersistenceMigrations()

    expect(invalidReport.migratedKeys).toContain('autoabm-app-zoom')
    expect(window.localStorage.getItem('autoabm-app-zoom')).toBeNull()
  })

  test('migrates the legacy UI zoom key into app zoom storage', () => {
    window.localStorage.setItem('autoabm-ui-zoom', '1.25')

    const report = runDesktopPersistenceMigrations()

    expect(report.migratedKeys).toEqual(expect.arrayContaining([
      'autoabm-app-zoom',
      'autoabm-ui-zoom',
    ]))
    expect(window.localStorage.getItem('autoabm-app-zoom')).toBe('1.25')
    expect(window.localStorage.getItem('autoabm-ui-zoom')).toBeNull()
  })

  test('does not throw if schema version persistence is blocked', () => {
    const storage = {
      getItem: window.localStorage.getItem.bind(window.localStorage),
      removeItem: window.localStorage.removeItem.bind(window.localStorage),
      setItem: (key: string, value: string) => {
        if (key === DESKTOP_PERSISTENCE_VERSION_KEY) {
          throw new Error('storage blocked')
        }
        window.localStorage.setItem(key, value)
      },
    }

    expect(() => runDesktopPersistenceMigrations(storage)).not.toThrow()
    expect(runDesktopPersistenceMigrations(storage).migratedKeys).toContain(DESKTOP_PERSISTENCE_VERSION_KEY)
  })

  test('does not throw if storage reads and writes are blocked', () => {
    const storage = {
      getItem: () => {
        throw new Error('storage unavailable')
      },
      removeItem: () => {
        throw new Error('storage unavailable')
      },
      setItem: () => {
        throw new Error('storage unavailable')
      },
    }

    const report = runDesktopPersistenceMigrations(storage)

    expect(report.migratedKeys).toEqual(expect.arrayContaining([
      'autoabm-open-tabs',
      'autoabm-session-runtime',
      'autoabm-theme',
      'autoabm-locale',
      'autoabm-app-zoom',
      DESKTOP_PERSISTENCE_VERSION_KEY,
    ]))
  })
})
