#!/usr/bin/env bun
/**
 * ABM Playwright E2E runner.
 *
 * Starts an isolated local server (stub kernel) + Vite desktop dev server, then
 * runs scripts/e2e/*.spec.ts. Artifacts land under output/playwright/.
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '../..')
const E2E_DIR = join(ROOT, 'scripts', 'e2e')
const ARTIFACT_DIR = join(ROOT, 'output', 'playwright')
const STUB_WORKER = join(ROOT, 'src', 'server', 'abm', '__tests__', 'stubWorker.ts')

async function getPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate a local port')))
        return
      }
      const port = address.port
      server.close(() => resolve(port))
    })
  })
}

async function waitForHttp(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  let lastError = ''
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await Bun.sleep(400)
  }
  throw new Error(`Timed out waiting for ${url}${lastError ? ` (${lastError})` : ''}`)
}

async function pipeToFile(stream: ReadableStream<Uint8Array> | null, path: string) {
  if (!stream) return
  const reader = stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    appendFileSync(path, Buffer.from(value))
  }
}

async function ensurePlaywrightInstalled() {
  const proc = Bun.spawn(['npm', 'ci', '--loglevel=error'], {
    cwd: E2E_DIR,
    stdout: 'inherit',
    stderr: 'inherit',
    shell: true,
  })
  const code = await proc.exited
  if (code !== 0) throw new Error('npm ci failed in scripts/e2e')

  const playwrightBin = join(
    E2E_DIR,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'playwright.cmd' : 'playwright',
  )
  const browsers = Bun.spawn([playwrightBin, 'install', 'chromium'], {
    cwd: E2E_DIR,
    stdout: 'inherit',
    stderr: 'inherit',
    shell: process.platform === 'win32',
  })
  const browserCode = await browsers.exited
  if (browserCode !== 0) throw new Error('playwright install chromium failed')
}

const headed = process.argv.includes('--headed')
const skipInstall = process.argv.includes('--skip-install')
const passthrough = process.argv.slice(2).filter((arg) => !['--headed', '--skip-install'].includes(arg))

mkdirSync(ARTIFACT_DIR, { recursive: true })
if (!skipInstall) {
  await ensurePlaywrightInstalled()
}

const configDir = await mkdtemp(join(tmpdir(), 'autoabm-abm-e2e-'))
const serverPort = await getPort()
const vitePort = await getPort()
const baseUrl = `http://127.0.0.1:${serverPort}`
const appUrl = `http://127.0.0.1:${vitePort}`
const serverLogPath = join(ARTIFACT_DIR, 'server.log')
const viteLogPath = join(ARTIFACT_DIR, 'vite.log')

const server = Bun.spawn(
  ['bun', 'run', 'src/server/index.ts', '--host', '127.0.0.1', '--port', String(serverPort)],
  {
    cwd: ROOT,
    env: {
      ...process.env,
      CLAUDE_CONFIG_DIR: configDir,
      ABM_KERNEL_CMD: 'bun',
      ABM_KERNEL_ARGS: JSON.stringify([STUB_WORKER]),
      CC_HAHA_DISABLE_TERMINAL_SHELL_ENV: '1',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  },
)
void pipeToFile(server.stdout, serverLogPath)
void pipeToFile(server.stderr, serverLogPath)

const viteExecutable = join(
  ROOT,
  'desktop',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vite.cmd' : 'vite',
)
const vite = Bun.spawn(
  [viteExecutable, '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'],
  {
    cwd: join(ROOT, 'desktop'),
    env: {
      ...process.env,
      VITE_DESKTOP_SERVER_URL: baseUrl,
      VITE_ABM_E2E: 'true',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  },
)
void pipeToFile(vite.stdout, viteLogPath)
void pipeToFile(vite.stderr, viteLogPath)

let exitCode = 1
try {
  await waitForHttp(`${baseUrl}/health`, 30_000)
  await waitForHttp(appUrl, 45_000)

  const playwrightBin = join(
    E2E_DIR,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'playwright.cmd' : 'playwright',
  )
  const testArgs = [playwrightBin, 'test', ...passthrough]
  if (headed) testArgs.push('--headed')

  const tests = Bun.spawn(testArgs, {
    cwd: E2E_DIR,
    env: {
      ...process.env,
      ABM_E2E_APP_URL: appUrl,
      ABM_E2E_SERVER_URL: baseUrl,
    },
    stdout: 'inherit',
    stderr: 'inherit',
    shell: process.platform === 'win32',
  })
  exitCode = await tests.exited
} finally {
  server.kill()
  vite.kill()
  try {
    await rm(configDir, { recursive: true, force: true })
  } catch {
    // Windows may keep temp handles briefly after child processes exit.
  }
}

if (exitCode !== 0) {
  console.error(`\nABM E2E failed. Logs: ${serverLogPath}, ${viteLogPath}`)
  process.exit(exitCode)
}

console.log(`\nABM E2E passed. Report: ${join(ARTIFACT_DIR, 'report', 'index.html')}`)
process.exit(0)
