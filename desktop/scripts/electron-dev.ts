export const DEFAULT_RENDERER_URL = 'http://localhost:1420'
export const LOCAL_NO_PROXY_ENTRIES = ['localhost', '127.0.0.1', '::1']

export function mergeNoProxy(existing: string | undefined, required = LOCAL_NO_PROXY_ENTRIES) {
  const entries = new Set(
    (existing ?? '')
      .split(',')
      .map(entry => entry.trim())
      .filter(Boolean),
  )
  for (const entry of required) entries.add(entry)
  return Array.from(entries).join(',')
}

export function createElectronDevEnv(env: NodeJS.ProcessEnv = process.env) {
  const rendererUrl = env.ELECTRON_RENDERER_URL ?? DEFAULT_RENDERER_URL
  const noProxy = mergeNoProxy(env.NO_PROXY ?? env.no_proxy)
  return {
    ...env,
    ELECTRON_RENDERER_URL: rendererUrl,
    NO_PROXY: noProxy,
    no_proxy: noProxy,
  }
}

async function waitForRenderer(rendererUrl: string) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(rendererUrl)
      if (response.ok) return
    } catch {
      await Bun.sleep(250)
    }
  }
  throw new Error(`Timed out waiting for Vite renderer at ${rendererUrl}`)
}

async function main() {
  const desktopRoot = new URL('..', import.meta.url).pathname
  const childEnv = createElectronDevEnv()
  const rendererUrl = childEnv.ELECTRON_RENDERER_URL
  process.env.NO_PROXY = childEnv.NO_PROXY
  process.env.no_proxy = childEnv.no_proxy

  const vite = Bun.spawn(['bun', 'run', 'dev'], {
    cwd: desktopRoot,
    env: childEnv,
    stdout: 'inherit',
    stderr: 'inherit',
  })

  function stopVite() {
    vite.kill()
  }

  process.on('SIGINT', () => {
    stopVite()
    process.exit(130)
  })
  process.on('SIGTERM', () => {
    stopVite()
    process.exit(143)
  })

  await waitForRenderer(rendererUrl)

  const electron = Bun.spawn(['bunx', 'electron', './electron-dist/main.cjs'], {
    cwd: desktopRoot,
    env: childEnv,
    stdout: 'inherit',
    stderr: 'inherit',
  })

  const exitCode = await electron.exited
  stopVite()
  process.exit(exitCode)
}

if (import.meta.main) {
  await main()
}
