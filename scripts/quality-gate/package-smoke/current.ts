#!/usr/bin/env bun

import { spawnSync } from 'node:child_process'

export function currentPackageSmokePlatform(platform: NodeJS.Platform = process.platform) {
  if (platform === 'darwin') return 'macos'
  if (platform === 'win32') return 'windows'
  if (platform === 'linux') return 'linux'
  return null
}

if (import.meta.main) {
  const platform = currentPackageSmokePlatform()
  if (!platform) {
    console.log(`[package-smoke] skipping unsupported host platform: ${process.platform}`)
    process.exit(0)
  }

  const result = spawnSync('bun', [
    'run',
    'test:package-smoke',
    '--platform',
    platform,
    '--package-kind',
    'dir',
    '--artifacts-dir',
    'desktop/build-artifacts/electron',
  ], {
    stdio: 'inherit',
  })
  process.exit(result.status ?? 1)
}
