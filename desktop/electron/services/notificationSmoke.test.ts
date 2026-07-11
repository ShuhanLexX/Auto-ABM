import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  appendNotificationSmokeLog,
  logNotificationSmokeRendererAck,
  parseNotificationSmokeDelay,
  scheduleNotificationSmoke,
} from './notificationSmoke'
import type { ElectronNotificationConstructor } from './notifications'

function fakeNotificationClass() {
  const handlers: Record<string, () => void> = {}
  const show = vi.fn()
  const NotificationClass = vi.fn(function (_options: unknown) {
    return {
      show,
      on(event: 'click' | 'close' | 'failed', handler: () => void) {
        handlers[event] = handler
        return this
      },
    }
  }) as unknown as ElectronNotificationConstructor & ReturnType<typeof vi.fn>
  NotificationClass.isSupported = () => true
  return { NotificationClass, handlers, show }
}

describe('Electron notification smoke hook', () => {
  it('does not schedule a smoke notification without an explicit target session', () => {
    const timer = vi.fn()
    const { NotificationClass } = fakeNotificationClass()

    expect(scheduleNotificationSmoke({
      env: {},
      NotificationClass,
      onAction: vi.fn(),
      setTimer: timer,
    })).toBe(false)

    expect(timer).not.toHaveBeenCalled()
    expect(NotificationClass).not.toHaveBeenCalled()
  })

  it('schedules a targeted notification for Computer Use smoke validation', () => {
    const timer = vi.fn((handler: () => void) => handler())
    const { NotificationClass, handlers, show } = fakeNotificationClass()
    const onAction = vi.fn()
    const writeLog = vi.fn()

    expect(scheduleNotificationSmoke({
      env: {
        CC_HAHA_ELECTRON_NOTIFICATION_SMOKE_SESSION_ID: 'session-smoke',
        CC_HAHA_ELECTRON_NOTIFICATION_SMOKE_TITLE: 'Target smoke',
        CC_HAHA_ELECTRON_NOTIFICATION_SMOKE_BODY: 'Click target smoke',
        CC_HAHA_ELECTRON_NOTIFICATION_SMOKE_DELAY_MS: '10',
      },
      NotificationClass,
      onAction,
      setTimer: timer,
      writeLog,
    })).toBe(true)

    expect(timer).toHaveBeenCalledWith(expect.any(Function), 10)
    expect(NotificationClass).toHaveBeenCalledWith({
      title: 'Target smoke',
      body: 'Click target smoke',
      icon: undefined,
    })
    expect(show).toHaveBeenCalledTimes(1)

    handlers.click?.()
    expect(onAction).toHaveBeenCalledWith({
      id: undefined,
      extra: undefined,
      action: 'click',
      target: {
        type: 'session',
        sessionId: 'session-smoke',
        title: 'Target smoke',
      },
    })
    expect(writeLog).toHaveBeenCalledWith(expect.objectContaining({
      event: 'scheduled',
      sessionId: 'session-smoke',
      title: 'Target smoke',
      delayMs: 10,
    }))
    expect(writeLog).toHaveBeenCalledWith(expect.objectContaining({
      event: 'sent',
      sessionId: 'session-smoke',
      sent: true,
    }))
    expect(writeLog).toHaveBeenCalledWith(expect.objectContaining({
      event: 'action',
      sessionId: 'session-smoke',
    }))

    handlers.close?.()
    expect(writeLog).toHaveBeenCalledWith(expect.objectContaining({
      event: 'lifecycle',
      sessionId: 'session-smoke',
      lifecycle: 'close',
    }))
  })

  it('can trigger an explicit synthetic action for packaged renderer ack smoke', () => {
    const timer = vi.fn((handler: () => void) => handler())
    const { NotificationClass } = fakeNotificationClass()
    const onAction = vi.fn()
    const writeLog = vi.fn()

    expect(scheduleNotificationSmoke({
      env: {
        CC_HAHA_ELECTRON_NOTIFICATION_SMOKE_SESSION_ID: 'session-smoke',
        CC_HAHA_ELECTRON_NOTIFICATION_SMOKE_TITLE: 'Target smoke',
        CC_HAHA_ELECTRON_NOTIFICATION_SMOKE_TRIGGER_ACTION: '1',
      },
      NotificationClass,
      onAction,
      setTimer: timer,
      writeLog,
    })).toBe(true)

    expect(writeLog).toHaveBeenCalledWith(expect.objectContaining({
      event: 'synthetic_action',
      sessionId: 'session-smoke',
      payload: {
        action: 'synthetic-click',
        target: {
          type: 'session',
          sessionId: 'session-smoke',
          title: 'Target smoke',
        },
      },
    }))
    expect(onAction).toHaveBeenCalledWith({
      action: 'synthetic-click',
      target: {
        type: 'session',
        sessionId: 'session-smoke',
        title: 'Target smoke',
      },
    })
  })

  it('clamps invalid or excessive notification smoke delays', () => {
    expect(parseNotificationSmokeDelay(undefined)).toBe(2500)
    expect(parseNotificationSmokeDelay('wat')).toBe(2500)
    expect(parseNotificationSmokeDelay('-10')).toBe(0)
    expect(parseNotificationSmokeDelay('999999')).toBe(60000)
  })

  it('writes JSONL smoke events when a log path is configured', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'autoabm-notification-smoke-'))
    const logPath = path.join(tmp, 'nested', 'notification.jsonl')

    appendNotificationSmokeLog(logPath, {
      event: 'sent',
      timestamp: '2026-06-01T00:00:00.000Z',
      sessionId: 'session-smoke',
      sent: true,
    })

    expect(readFileSync(logPath, 'utf-8')).toBe(
      '{"event":"sent","timestamp":"2026-06-01T00:00:00.000Z","sessionId":"session-smoke","sent":true}\n',
    )
  })

  it('writes renderer acknowledgements to the notification smoke log only when configured', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'autoabm-notification-smoke-'))
    const logPath = path.join(tmp, 'nested', 'notification.jsonl')

    expect(logNotificationSmokeRendererAck({}, { target: { type: 'session', sessionId: 'session-smoke' } })).toBe(false)
    expect(logNotificationSmokeRendererAck({
      CC_HAHA_ELECTRON_NOTIFICATION_SMOKE_LOG: logPath,
    } as NodeJS.ProcessEnv, { target: { type: 'session', sessionId: 'session-smoke' } })).toBe(true)

    const [entry] = readFileSync(logPath, 'utf-8').trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    expect(entry).toMatchObject({
      event: 'renderer_ack',
      payload: {
        target: { type: 'session', sessionId: 'session-smoke' },
      },
    })
  })
})
