import { describe, expect, it, vi } from 'vitest'
import {
  notificationPermissionState,
  requestNotificationPermission,
  sendDesktopNotification,
  validateNotificationOptions,
  type ElectronNotificationConstructor,
} from './notifications'

function fakeNotificationClass(supported = true) {
  const handlers = new Map<string, () => void>()
  const show = vi.fn()
  const NotificationClass = vi.fn(function (_options: unknown) {
    return {
      show,
      on(event: 'click' | 'close' | 'failed', handler: () => void) {
        handlers.set(event, handler)
        return this
      },
    }
  }) as unknown as ElectronNotificationConstructor & ReturnType<typeof vi.fn>
  NotificationClass.isSupported = () => supported
  return { NotificationClass, handlers, show }
}

describe('Electron notification service', () => {
  it('reports Electron notification support as host permission state', () => {
    expect(notificationPermissionState(fakeNotificationClass(true).NotificationClass)).toBe('granted')
    expect(requestNotificationPermission(fakeNotificationClass(false).NotificationClass)).toBe('denied')
  })

  it('validates notification payloads before constructing OS notifications', () => {
    expect(validateNotificationOptions({ title: 'Done', body: 'Task complete' })).toBe(true)
    expect(validateNotificationOptions({ title: '' })).toBe(false)
    expect(validateNotificationOptions({ title: 'Done', extra: [] })).toBe(false)
  })

  it('shows a notification and forwards click targets through the host action channel', () => {
    const { NotificationClass, handlers, show } = fakeNotificationClass(true)
    const onAction = vi.fn()
    const onLifecycle = vi.fn()
    const target = { type: 'session', sessionId: 'session-1' }

    expect(sendDesktopNotification({
      NotificationClass,
      options: {
        id: 1,
        title: 'Done',
        body: 'Task complete',
        extra: { ccHahaTarget: JSON.stringify(target) },
        target,
      },
      onAction,
      onLifecycle,
    })).toBe(true)

    expect(NotificationClass).toHaveBeenCalledWith({
      title: 'Done',
      body: 'Task complete',
      icon: undefined,
    })
    expect(show).toHaveBeenCalledTimes(1)
    expect(handlers.has('close')).toBe(true)
    expect(handlers.has('failed')).toBe(true)

    handlers.get('click')?.()
    expect(onAction).toHaveBeenCalledWith({
      id: 1,
      extra: { ccHahaTarget: JSON.stringify(target) },
      target,
      action: 'click',
    })
    expect(onLifecycle).not.toHaveBeenCalled()
  })

  it('reports close and failed lifecycle events for smoke diagnostics', () => {
    const { NotificationClass, handlers } = fakeNotificationClass(true)
    const onLifecycle = vi.fn()

    expect(sendDesktopNotification({
      NotificationClass,
      options: { title: 'Done' },
      onAction: vi.fn(),
      onLifecycle,
    })).toBe(true)

    handlers.get('close')?.()
    expect(onLifecycle).toHaveBeenCalledWith('close')

    expect(sendDesktopNotification({
      NotificationClass,
      options: { title: 'Done again' },
      onAction: vi.fn(),
      onLifecycle,
    })).toBe(true)

    handlers.get('failed')?.()
    expect(onLifecycle).toHaveBeenCalledWith('failed')
  })

  it('does not construct notifications when the platform does not support them', () => {
    const { NotificationClass } = fakeNotificationClass(false)

    expect(sendDesktopNotification({
      NotificationClass,
      options: { title: 'Done' },
      onAction: vi.fn(),
    })).toBe(false)
    expect(NotificationClass).not.toHaveBeenCalled()
  })

  it('rejects malformed notification payloads before constructing Electron notifications', () => {
    const { NotificationClass } = fakeNotificationClass(true)

    expect(() => sendDesktopNotification({
      NotificationClass,
      options: { body: 'Missing title' },
      onAction: vi.fn(),
    })).toThrow('Invalid Electron notification payload')
    expect(NotificationClass).not.toHaveBeenCalled()
  })
})
