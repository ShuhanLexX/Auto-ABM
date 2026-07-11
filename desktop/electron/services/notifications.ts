import type { DesktopNotificationOptions, NotificationPermissionState } from '../../src/lib/desktopHost/types'

export type ElectronNotificationInstance = {
  show(): void
  on(event: 'click' | 'close' | 'failed', handler: () => void): ElectronNotificationInstance
}

export type ElectronNotificationConstructor = {
  new(options: { title: string, body?: string, icon?: string }): ElectronNotificationInstance
  isSupported(): boolean
}

const activeNotifications = new Set<ElectronNotificationInstance>()

export function validateNotificationOptions(value: unknown): value is DesktopNotificationOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.title === 'string'
    && record.title.trim().length > 0
    && (record.body === undefined || typeof record.body === 'string')
    && (record.icon === undefined || typeof record.icon === 'string')
    && (record.id === undefined || typeof record.id === 'number')
    && (record.extra === undefined || (typeof record.extra === 'object' && record.extra !== null && !Array.isArray(record.extra)))
}

export function notificationPermissionState(
  NotificationClass: ElectronNotificationConstructor,
): NotificationPermissionState {
  return NotificationClass.isSupported() ? 'granted' : 'denied'
}

export function requestNotificationPermission(
  NotificationClass: ElectronNotificationConstructor,
): NotificationPermissionState {
  return notificationPermissionState(NotificationClass)
}

export function sendDesktopNotification({
  NotificationClass,
  options,
  onAction,
  onLifecycle,
}: {
  NotificationClass: ElectronNotificationConstructor
  options: unknown
  onAction: (payload: unknown) => void
  onLifecycle?: (event: 'close' | 'failed') => void
}): boolean {
  if (!validateNotificationOptions(options)) {
    throw new Error('Invalid Electron notification payload')
  }
  if (!NotificationClass.isSupported()) return false

  const notification = new NotificationClass({
    title: options.title,
    body: options.body,
    icon: options.icon,
  })

  activeNotifications.add(notification)
  const cleanup = () => {
    activeNotifications.delete(notification)
  }
  notification.on('click', () => {
    onAction({
      id: options.id,
      extra: options.extra,
      target: options.target,
      action: 'click',
    })
    cleanup()
  })
  notification.on('close', () => {
    onLifecycle?.('close')
    cleanup()
  })
  notification.on('failed', () => {
    onLifecycle?.('failed')
    cleanup()
  })
  notification.show()
  return true
}
