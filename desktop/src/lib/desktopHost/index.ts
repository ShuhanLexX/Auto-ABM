import { browserHost } from './browserHost'
import type { DesktopHost } from './types'

export type DesktopHostEnvironment = {
  electronHost: DesktopHost | null
}

export function detectDesktopHostEnvironment(): DesktopHostEnvironment {
  if (typeof window === 'undefined') {
    return { electronHost: null }
  }

  return {
    electronHost: window.desktopHost ?? null,
  }
}

export function createDesktopHost(
  environment: DesktopHostEnvironment = detectDesktopHostEnvironment(),
): DesktopHost {
  if (environment.electronHost) return environment.electronHost
  return browserHost
}

export function getDesktopHost(): DesktopHost {
  return createDesktopHost(detectDesktopHostEnvironment())
}

export const desktopHost = getDesktopHost()

export type * from './types'
