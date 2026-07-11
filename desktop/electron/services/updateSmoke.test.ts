import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createUpdateSmokeUpdaterFromEnv, parseUpdateSmokeEnv } from './updateSmoke'
import { ElectronUpdaterService } from './updater'

describe('Electron update smoke updater', () => {
  it('stays disabled unless a smoke version is configured', () => {
    expect(parseUpdateSmokeEnv({})).toBeNull()
    expect(parseUpdateSmokeEnv({ CC_HAHA_ELECTRON_UPDATE_SMOKE_VERSION: '  ' })).toBeNull()
  })

  it('drives the real Electron updater service contract and logs the install signal', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'autoabm-update-smoke-'))
    const logPath = join(tempDir, 'update-smoke.jsonl')
    try {
      const updater = createUpdateSmokeUpdaterFromEnv({
        CC_HAHA_ELECTRON_UPDATE_SMOKE_VERSION: '9.9.9-smoke',
        CC_HAHA_ELECTRON_UPDATE_SMOKE_BODY: 'Smoke notes',
        CC_HAHA_ELECTRON_UPDATE_SMOKE_TOTAL_BYTES: '200',
        CC_HAHA_ELECTRON_UPDATE_SMOKE_LOG: logPath,
      })
      expect(updater).not.toBeNull()
      const service = new ElectronUpdaterService(updater!)
      const events: unknown[] = []

      await expect(service.checkForUpdates()).resolves.toEqual({
        version: '9.9.9-smoke',
        body: 'Smoke notes',
      })
      await service.downloadUpdate(event => events.push(event))
      service.stageDownloadedUpdate()
      service.quitAndInstallDownloadedUpdate()

      expect(events).toEqual([
        { event: 'Started', data: { contentLength: 200 } },
        { event: 'Progress', data: { chunkLength: 100 } },
        { event: 'Progress', data: { chunkLength: 100 } },
        { event: 'Finished' },
      ])
      const logEvents = readFileSync(logPath, 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line).event)
      expect(logEvents).toEqual(['check', 'download-start', 'download-finish', 'quit-and-install'])
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
