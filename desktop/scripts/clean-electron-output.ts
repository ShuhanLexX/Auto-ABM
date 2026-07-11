#!/usr/bin/env bun

import { rm } from 'node:fs/promises'
import path from 'node:path'

const desktopRoot = path.resolve(import.meta.dir, '..')
const electronOutputDir = path.join(desktopRoot, 'build-artifacts', 'electron')

await rm(electronOutputDir, { recursive: true, force: true })
console.log(`[clean-electron-output] removed ${electronOutputDir}`)
