import { describe, expect, test } from 'bun:test'
import { cliExitSeverity } from '../services/conversationService.js'

describe('cliExitSeverity', () => {
  test.each([
    [0, 'info'],
    [null, 'info'],
    [143, 'info'], // SIGTERM — shutdown / user stop
    [137, 'info'], // SIGKILL — OS reclaim
  ] as const)('benign exit code %p → %s', (code, expected) => {
    expect(cliExitSeverity(code)).toBe(expected)
  })

  test.each([
    [1, 'error'],
    [2, 'error'],
    [127, 'error'],
  ] as const)('abnormal exit code %p → error (real crash, must be perceivable)', (code, expected) => {
    expect(cliExitSeverity(code)).toBe(expected)
  })
})
