import path from 'node:path'

export type RendererEntryOptions = {
  isPackaged: boolean
  appRoot: string
  env?: NodeJS.ProcessEnv
}

export function isAllowedDevRendererUrl(input: string): boolean {
  try {
    const parsed = new URL(input)
    if (parsed.protocol !== 'http:') return false
    return parsed.hostname === '127.0.0.1' ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === '::1' ||
      parsed.hostname === '[::1]'
  } catch {
    return false
  }
}

export function resolveRendererEntry(options: RendererEntryOptions): string {
  const devUrl = options.env?.ELECTRON_RENDERER_URL?.trim()
  if (!options.isPackaged && devUrl) {
    if (!isAllowedDevRendererUrl(devUrl)) {
      throw new Error(`Refusing non-local Electron renderer URL: ${devUrl}`)
    }
    return devUrl
  }
  return path.join(options.appRoot, 'dist', 'index.html')
}
