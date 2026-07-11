import { afterEach, describe, expect, test } from 'bun:test'
import { killDetachedProcessGroup } from './ShellCommand.js'

describe('killDetachedProcessGroup', () => {
  const originalKill = process.kill

  afterEach(() => {
    process.kill = originalKill
  })

  test('targets the process group for POSIX detached shell commands', () => {
    if (process.platform === 'win32') {
      expect(killDetachedProcessGroup(1234)).toBe(false)
      return
    }

    const calls: Array<{ pid: number, signal: NodeJS.Signals | number | undefined }> = []
    process.kill = ((pid: number, signal?: NodeJS.Signals | number) => {
      calls.push({ pid, signal })
      return true
    }) as typeof process.kill

    expect(killDetachedProcessGroup(1234)).toBe(true)
    expect(calls).toEqual([{ pid: -1234, signal: 'SIGKILL' }])
  })

  test('treats a missing process group as an already-clean fallback case', () => {
    if (process.platform === 'win32') {
      expect(killDetachedProcessGroup(1234)).toBe(false)
      return
    }

    process.kill = (() => {
      throw Object.assign(new Error('missing'), { code: 'ESRCH' })
    }) as typeof process.kill

    expect(killDetachedProcessGroup(1234)).toBe(false)
  })
})
