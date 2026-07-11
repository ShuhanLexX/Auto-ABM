import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const STATE_FILE = join(dirname(fileURLToPath(import.meta.url)), '.abm-e2e-state.json')

export interface AbmE2eState {
  projectId: string
  simId: string
  serverUrl: string
}

export function stateFilePath() {
  return STATE_FILE
}

export function writeAbmE2eState(state: AbmE2eState) {
  mkdirSync(dirname(STATE_FILE), { recursive: true })
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf-8')
}

export function readAbmE2eState(): AbmE2eState {
  return JSON.parse(readFileSync(STATE_FILE, 'utf-8')) as AbmE2eState
}
